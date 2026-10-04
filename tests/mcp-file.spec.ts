/**
 * `mcp.json` filesystem behaviour: scope resolution, the official
 * locked atomic write, and the refusal to overwrite a file the user must
 * repair by hand.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MCP_COMPAT_FILE_NAME, MCP_FILE_NAME, MCP_PROJECT_DIR, mutateScopeFile, readScopeFiles, readScopePath, resolveScopeFiles, watchScopeFiles,
} from '../src/host/mcp-file.ts'
import { withServer } from '../src/host/mcp-json.ts'
import { defaultServer } from '../src/settings.ts'

const roots: string[] = []

function tempRoot(): string {
  const path = mkdtempSync(join(tmpdir(), 'mcp-file-'))
  roots.push(path)
  return path
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('scope resolution', () => {
  it('resolves the documented paths in precedence order', () => {
    const home = tempRoot()
    const project = tempRoot()
    const profile = join(home, 'profiles', 'web')
    const files = resolveScopeFiles({ home, profileDir: profile, projectDir: project })
    expect(files.map(file => [file.scope, file.path])).toEqual([
      ['project', join(project, MCP_PROJECT_DIR, MCP_FILE_NAME)],
      ['profile', join(profile, MCP_FILE_NAME)],
      ['user', join(home, MCP_FILE_NAME)],
    ])
    expect(files[0]?.compatPath).toBe(join(project, MCP_COMPAT_FILE_NAME))
    // A scope whose root is unknown is omitted rather than guessed.
    expect(resolveScopeFiles({ home }).map(file => file.scope)).toEqual(['user'])
  })

  it('reads each scope independently so one broken file cannot hide the rest', async () => {
    const home = tempRoot()
    const profile = tempRoot()
    writeFileSync(join(home, MCP_FILE_NAME), '{not json')
    writeFileSync(join(profile, MCP_FILE_NAME), JSON.stringify({ mcpServers: { ok: { command: 'node' } } }))
    const results = await readScopeFiles(resolveScopeFiles({ home, profileDir: profile }))
    const byScope = new Map(results.map(result => [result.scope, result]))
    expect(byScope.get('profile')?.document?.servers).toHaveProperty('ok')
    expect(byScope.get('user')?.error).toContain('invalid JSON')
    expect(byScope.get('user')?.exists).toBe(true)
  })

  it('treats a missing file as an empty successful read', async () => {
    const home = tempRoot()
    const missing = await readScopePath('user', join(home, 'nope', MCP_FILE_NAME), true)
    expect(missing).toMatchObject({ exists: false, writable: true })
    expect(missing.error).toBeUndefined()
  })
})

describe('atomic writes', () => {
  it('creates the file owner-only and round-trips through the lock', async () => {
    const home = tempRoot()
    const path = join(home, 'nested', MCP_FILE_NAME)
    await mutateScopeFile(path, document => withServer(document, 'a', { ...defaultServer('a'), command: 'node' }))
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(statSync(join(home, 'nested')).mode & 0o777).toBe(0o700)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers: Record<string, unknown> }
    expect(parsed.mcpServers.a).toMatchObject({ command: 'node', type: 'stdio' })

    await mutateScopeFile(path, document => withServer(document, 'b', { ...defaultServer('b'), command: 'node' }))
    const second = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers: Record<string, unknown> }
    expect(Object.keys(second.mcpServers)).toEqual(['a', 'b'])
  })

  it('refuses to overwrite a file the user must repair', async () => {
    const home = tempRoot()
    const path = join(home, MCP_FILE_NAME)
    writeFileSync(path, '{oops')
    await expect(mutateScopeFile(path, document => withServer(document, 'a', defaultServer('a'))))
      .rejects.toThrow(/invalid JSON/u)
    expect(readFileSync(path, 'utf8')).toBe('{oops')
  })

  it('cancels the write when the mutation returns undefined', async () => {
    const home = tempRoot()
    const path = join(home, MCP_FILE_NAME)
    mkdirSync(home, { recursive: true })
    expect(await mutateScopeFile(path, () => undefined)).toBeUndefined()
    expect(() => statSync(path)).toThrow()
  })
})

describe('file watching', () => {
  it('reports a change to an existing scope file and stops on dispose', async () => {
    const home = tempRoot()
    const path = join(home, MCP_FILE_NAME)
    writeFileSync(path, JSON.stringify({ mcpServers: {} }))
    let changes = 0
    const dispose = await watchScopeFiles(resolveScopeFiles({ home }), () => { changes += 1 })
    writeFileSync(path, JSON.stringify({ mcpServers: { a: { command: 'node' } } }))
    await waitFor(() => changes > 0)
    expect(changes).toBeGreaterThan(0)
    dispose()
    const settled = changes
    writeFileSync(path, JSON.stringify({ mcpServers: { b: { command: 'node' } } }))
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(changes).toBe(settled)
  })
})

/** Poll a real-timer predicate; filesystem events are not synchronous. */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a filesystem event')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
