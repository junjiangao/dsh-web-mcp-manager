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
import { type McpJsonDocument } from './mcp-json.ts';
import type { McpScope } from '../types.ts';
/** File name every scope uses. */
export declare const MCP_FILE_NAME: "mcp.json";
/** Project-local directory that owns the project scope. */
export declare const MCP_PROJECT_DIR: ".dsh";
/** Claude Code's project file name; read-only compatibility input. */
export declare const MCP_COMPAT_FILE_NAME: ".mcp.json";
/** One writable scope file, plus the read-only compatibility file a scope reads. */
export interface ScopeFile {
    readonly scope: McpScope;
    readonly path: string;
    /** Additional read-only input merged below this scope (project `.mcp.json`). */
    readonly compatPath?: string;
}
/** Inputs the caller resolves from its own services. */
export interface ScopeRoots {
    /** Harness home; defaults to the official resolver. */
    readonly home?: string;
    /** Active profile directory, when the Host can resolve it. */
    readonly profileDir?: string;
    /** Selected project root, already validated against the workspace registry. */
    readonly projectDir?: string;
}
/**
 * Resolve the scope files for this Host instance.
 *
 * Scope order is precedence order, highest first: project, profile, user. A
 * scope whose root cannot be resolved is omitted rather than guessed.
 * @param roots - resolved roots from the Host.
 * @returns the scope files in precedence order.
 */
export declare function resolveScopeFiles(roots: ScopeRoots): ScopeFile[];
/** One scope's read outcome. */
export interface ReadResult {
    readonly scope: McpScope;
    readonly path: string;
    readonly writable: boolean;
    /** Whether this row is another client's file, merged below the scope's own. */
    readonly compat: boolean;
    readonly exists: boolean;
    readonly document?: McpJsonDocument;
    /** Parse or read failure, reported on the source row and never fatal. */
    readonly error?: string;
}
/**
 * Read one file without creating or locking it.
 * @param scope - the scope the file belongs to.
 * @param path - absolute file path.
 * @param writable - whether the panel may write this file.
 * @param compat - whether this is the read-only compatibility input of `scope`.
 * @returns the read outcome; a missing file is an empty, successful read.
 */
export declare function readScopePath(scope: McpScope, path: string, writable: boolean, compat?: boolean): Promise<ReadResult>;
/**
 * Read every scope file plus each project's compatibility file.
 *
 * Every entry resolves independently, so one unreadable or malformed file
 * leaves the others usable — a broken `mcp.json` must never take the panel down.
 * @param files - scope files in precedence order.
 * @returns each row's read outcome; a project's `.mcp.json` follows its own file.
 */
export declare function readScopeFiles(files: readonly ScopeFile[]): Promise<ReadResult[]>;
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
export declare function mutateScopeFile(path: string, mutate: (document: McpJsonDocument) => McpJsonDocument | undefined): Promise<string | undefined>;
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
export declare function watchScopeFiles(files: readonly ScopeFile[], onChange: () => void): Promise<() => void>;
//# sourceMappingURL=mcp-file.d.ts.map