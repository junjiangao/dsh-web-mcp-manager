/**
 * Filesystem access for the `mcp.json` sources.
 *
 * Paths come from the official helpers (`dshHomePath` honours `$DSH_HOME`), and
 * every write goes through the official atomic-write primitives: a
 * `withFileLock` read-modify-write cycle committing through `writeFileAtomic`.
 * Readers stay lock-free because the rename is atomic, and two writers can never
 * resurrect a state the other just replaced. Files are created `0600` because a
 * `mcp.json` may legitimately hold a literal secret.
 */

import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { canonicalizeWatchPath, dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { emptyDocument, parseMcpJson, serializeMcpJson, type McpJsonDocument } from './mcp-json.ts'
import type { McpScope } from '../types.ts'

/** File name every scope uses. */
export const MCP_FILE_NAME = 'mcp.json' as const
/** Project-local directory that owns the project scope. */
export const MCP_PROJECT_DIR = '.dsh' as const
/** Claude Code's project file name; read-only compatibility input. */
export const MCP_COMPAT_FILE_NAME = '.mcp.json' as const

/** Owner-only permissions: a `mcp.json` may hold a literal secret. */
const FILE_MODE = 0o600
/** Owner-only directory mode for the `.dsh` folder this plugin creates. */
const DIR_MODE = 0o700
/** Coalescing window for filesystem events, in milliseconds. */
const WATCH_DEBOUNCE_MS = 250

/** One writable scope file, plus the read-only compatibility file a scope reads. */
export interface ScopeFile {
  readonly scope: McpScope
  readonly path: string
  /** Additional read-only input merged below this scope (project `.mcp.json`). */
  readonly compatPath?: string
}

/** Inputs the caller resolves from its own services. */
export interface ScopeRoots {
  /** Harness home; defaults to the official resolver. */
  readonly home?: string
  /** Active profile directory, when the Host can resolve it. */
  readonly profileDir?: string
  /** Selected project root, already validated against the workspace registry. */
  readonly projectDir?: string
}

/**
 * Resolve the scope files for this Host instance.
 *
 * Scope order is precedence order, highest first: project, profile, user. A
 * scope whose root cannot be resolved is omitted rather than guessed.
 * @param roots - resolved roots from the Host.
 * @returns the scope files in precedence order.
 */
export function resolveScopeFiles(roots: ScopeRoots): ScopeFile[] {
  const files: ScopeFile[] = []
  if (roots.projectDir !== undefined) {
    files.push({
      scope: 'project',
      path: join(roots.projectDir, MCP_PROJECT_DIR, MCP_FILE_NAME),
      compatPath: join(roots.projectDir, MCP_COMPAT_FILE_NAME),
    })
  }
  if (roots.profileDir !== undefined) {
    files.push({ scope: 'profile', path: join(roots.profileDir, MCP_FILE_NAME) })
  }
  files.push({
    scope: 'user',
    path: roots.home === undefined ? dshHomePath(MCP_FILE_NAME) : join(roots.home, MCP_FILE_NAME),
  })
  return files
}

/** One scope's read outcome. */
export interface ReadResult {
  readonly scope: McpScope
  readonly path: string
  readonly writable: boolean
  /** Whether this row is another client's file, merged below the scope's own. */
  readonly compat: boolean
  readonly exists: boolean
  readonly document?: McpJsonDocument
  /** Parse or read failure, reported on the source row and never fatal. */
  readonly error?: string
}

/**
 * Read one file without creating or locking it.
 * @param scope - the scope the file belongs to.
 * @param path - absolute file path.
 * @param writable - whether the panel may write this file.
 * @param compat - whether this is the read-only compatibility input of `scope`.
 * @returns the read outcome; a missing file is an empty, successful read.
 */
export async function readScopePath(
  scope: McpScope,
  path: string,
  writable: boolean,
  compat = false,
): Promise<ReadResult> {
  const outcome = await readDocument(path)
  return { scope, path, writable, compat, exists: outcome.exists, ...outcome.document === undefined ? {} : { document: outcome.document }, ...outcome.error === undefined ? {} : { error: outcome.error } }
}

/**
 * Read every scope file plus each project's compatibility file.
 *
 * Every entry resolves independently, so one unreadable or malformed file
 * leaves the others usable — a broken `mcp.json` must never take the panel down.
 * @param files - scope files in precedence order.
 * @returns each row's read outcome; a project's `.mcp.json` follows its own file.
 */
export async function readScopeFiles(files: readonly ScopeFile[]): Promise<ReadResult[]> {
  const results: ReadResult[] = []
  for (const file of files) {
    results.push(await readScopePath(file.scope, file.path, true))
    if (file.compatPath !== undefined) {
      const compat = await readScopePath(file.scope, file.compatPath, false, true)
      // A missing compatibility file contributes no row at all.
      if (compat.exists || compat.error !== undefined) results.push(compat)
    }
  }
  return results
}

/**
 * Apply one mutation to a scope file under the official cross-process lock.
 *
 * The current text is re-read inside the lock, so a concurrent editor's write is
 * never silently reverted. An unparsable file refuses the write instead of being
 * overwritten: the user must repair it.
 * @param path - absolute file path.
 * @param mutate - derives the next document from the current one; `undefined` cancels the write.
 * @returns the written text, or `undefined` when the mutation cancelled.
 * @throws when the existing file is unreadable as JSON, or the write fails.
 */
export async function mutateScopeFile(
  path: string,
  mutate: (document: McpJsonDocument) => McpJsonDocument | undefined,
): Promise<string | undefined> {
  // The lock is a `wx`-created sibling, so its directory must exist first.
  await mkdir(dirname(path), { recursive: true, mode: DIR_MODE })
  return withFileLock(path, async () => {
    const current = await readDocument(path)
    if (current.error !== undefined) throw new Error(current.error)
    const next = mutate(current.document ?? emptyDocument())
    if (next === undefined) return undefined
    const text = serializeMcpJson(next)
    await writeFileAtomic(path, text, { mode: FILE_MODE, dirMode: DIR_MODE })
    return text
  })
}

/**
 * Watch every scope file's directory and coalesce events into one callback.
 *
 * The directory — not the file — is watched, so create, replace, and delete all
 * arrive, and a file that does not exist yet is picked up when it appears.
 * `canonicalizeWatchPath` gives the native watcher one canonical spelling even
 * while the final components are still missing.
 * @param files - scope files to watch.
 * @param onChange - invoked after the debounce window when any watched name changes.
 * @returns a disposer closing every watcher.
 */
export async function watchScopeFiles(
  files: readonly ScopeFile[],
  onChange: () => void,
): Promise<() => void> {
  const watched = new Map<string, Set<string>>()
  for (const file of files) {
    const paths = [file.path, ...file.compatPath === undefined ? [] : [file.compatPath]]
    for (const path of paths) {
      const directory = await nearestExistingDirectory(dirname(path))
      if (directory === undefined) continue
      const directoryPath = await canonicalizeWatchPath(directory)
      const names = watched.get(directoryPath) ?? new Set<string>()
      names.add(basename(path))
      watched.set(directoryPath, names)
    }
  }

  const watchers: FSWatcher[] = []
  let timer: NodeJS.Timeout | undefined
  let disposed = false
  const fire = (): void => {
    if (disposed) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed) onChange()
    }, WATCH_DEBOUNCE_MS)
    timer.unref()
  }

  for (const [directory, names] of watched) {
    try {
      const watcher = watch(directory, { persistent: false }, (_event, filename) => {
        // A null filename means the platform could not name the entry: treat it
        // as a possible match rather than dropping a real change.
        if (filename === null || names.has(filename.toString())) fire()
      })
      watcher.on('error', () => {})
      watchers.push(watcher)
    } catch {
      // A directory we cannot watch only costs live refresh; reads still work.
    }
  }

  return () => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  }
}

/** Read and parse one file; absence is a successful empty result. */
async function readDocument(path: string): Promise<{ exists: boolean; document?: McpJsonDocument; error?: string }> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false }
    return { exists: false, error: error instanceof Error ? error.message : String(error) }
  }
  const parsed = parseMcpJson(text)
  if (!parsed.ok) return { exists: true, error: parsed.error }
  return { exists: true, document: parsed.document }
}

/** Walk up until an existing directory is found, without creating anything. */
async function nearestExistingDirectory(path: string): Promise<string | undefined> {
  let current = path
  for (;;) {
    try {
      if ((await stat(current)).isDirectory()) return current
    } catch {
      // Missing or unreadable: keep walking towards the root.
    }
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}
