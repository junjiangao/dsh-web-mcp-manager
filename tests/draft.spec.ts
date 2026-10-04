import { describe, expect, it } from 'vitest'
import type { ManagedServerView } from '../src/types.ts'
import { defaultServer, validateServerId } from '../src/settings.ts'
import { mergeServerPatch, redactServer } from '../src/protocol.ts'
import { SERVER_ID_PATTERN, draftFromServer, draftPatch, duplicateDraftKeys, newSecretDraft } from '../src/client/draft.ts'

function view(args: readonly string[] = [], env: Record<string, string> = {}): ManagedServerView {
  return redactServer({ ...defaultServer('demo'), command: 'node', args: [...args], env }, 'loaded', 0)
}

describe('MCP draft projection helpers', () => {
  it('keeps args verbatim (no trimming or filtering)', () => {
    const draft = draftFromServer(view([' padded ', '', 'ok']))
    expect(draftPatch(draft).args).toEqual([' padded ', '', 'ok'])
  })

  it('keeps args that contain newlines verbatim', () => {
    const draft = draftFromServer(view(['a\nb', 'ok']))
    expect(draftPatch(draft).args).toEqual(['a\nb', 'ok'])
  })

  it('emits { clear: true } for env rows removed from the draft', () => {
    const draft = draftFromServer(view([], { TOKEN: 'old-value' }))
    const env = draft.env.filter(entry => entry.key !== 'TOKEN')
    const patch = draftPatch({ ...draft, env })
    expect(patch.env.TOKEN).toEqual({ clear: true })
    const merged = mergeServerPatch(defaultServer('demo'), patch)
    expect(merged.env).toEqual({})
  })

  it('clears the original key and sets the new one when a row is renamed', () => {
    const draft = draftFromServer(view([], { TOKEN: 'old-value' }))
    const env = draft.env.map(entry => entry.key === 'TOKEN' ? { ...entry, key: 'KEY', value: 'new-value' } : entry)
    const patch = draftPatch({ ...draft, env })
    expect(patch.env.TOKEN).toEqual({ clear: true })
    expect(patch.env.KEY).toBe('new-value')
    const merged = mergeServerPatch(defaultServer('demo'), patch)
    expect(merged.env).toEqual({ KEY: 'new-value' })
  })

  it('reports duplicate keys and ignores empty ones', () => {
    const draft = draftFromServer(view([], { A: '1', B: '2' }))
    const entries = [...draft.env, { ...newSecretDraft(), key: 'A' }, { ...newSecretDraft(), key: '' }]
    expect(duplicateDraftKeys(entries)).toEqual(['A'])
    expect(duplicateDraftKeys(draft.env)).toEqual([])
  })

  it('round-trips an unmodified draft idempotently', () => {
    const server = { ...defaultServer('demo'), label: 'Demo', command: 'node', args: ['--flag'], env: { TOKEN: 'old-value' } }
    const draft = draftFromServer(redactServer(server, 'loaded', 0))
    const merged = mergeServerPatch(server, draftPatch(draft))
    expect(merged).toEqual(server)
  })

  it('compiles the server id pattern under the v flag like browsers do', () => {
    // HTML `pattern` attributes compile with the UnicodeSets (v) flag; the
    // escaped dash keeps the character class valid there.
    expect(() => new RegExp(SERVER_ID_PATTERN, 'v')).not.toThrow()
    const pattern = new RegExp(`^(?:${SERVER_ID_PATTERN})$`, 'v')
    for (const id of ['codebase-memory', '-leading', 'a_b-c', 'mcp_1', 'X'.repeat(32)]) {
      expect(pattern.test(id)).toBe(true)
      expect(() => validateServerId(id)).not.toThrow()
    }
    for (const id of ['', 'has space', '中文', 'X'.repeat(33)]) {
      expect(pattern.test(id)).toBe(false)
      expect(() => validateServerId(id)).toThrow()
    }
  })
})

describe('MCP draft scope and template rows', () => {
  it('carries the scope the editor targeted', () => {
    // A new server takes the panel default; an existing one keeps its own scope.
    expect(draftFromServer(undefined, 0, 'project').scope).toBe('project')
    expect(draftPatch(draftFromServer(undefined, 0, 'project')).scope).toBe('project')
    expect(draftFromServer(viewWithScope('user'), 0, 'project').scope).toBe('user')
  })

  it('never rewrites or clears a row whose value is an environment template', () => {
    const draft = draftFromServer(viewWithTemplates())
    const token = draft.env.find(entry => entry.key === 'TOKEN')
    expect(token?.templated).toBe(true)
    // Even after the row is deleted from the draft, the template survives.
    const patch = draftPatch({ ...draft, env: [] })
    expect(patch.env.TOKEN).toBeUndefined()
    // And it is not reported as a managed sensitive key.
    expect(patch.envSensitive).toEqual([])
  })
})

function viewWithScope(scope: ManagedServerView['scope']): ManagedServerView {
  return redactServer(
    { ...defaultServer('demo'), command: 'node' }, 'loaded', 0, undefined, scope,
  )
}

function viewWithTemplates(): ManagedServerView {
  return redactServer(
    { ...defaultServer('demo'), command: 'node', env: { TOKEN: '${env:TOKEN}' } },
    'loaded', 0, undefined, 'user', [], { env: ['TOKEN'], headers: [] },
  )
}
