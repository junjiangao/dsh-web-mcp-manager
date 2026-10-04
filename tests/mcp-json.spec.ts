/**
 * Pure `mcp.json` behaviour: the shared file format, template expansion, and
 * the precedence merge over multiple scopes.
 */

import { describe, expect, it } from 'vitest'
import { expandMap, expandTemplate, isTemplate, templateEnvNames, templateEnvNamesOf } from '../src/host/interpolate.ts'
import {
  MCP_SERVERS_ALIAS_KEY, MCP_SERVERS_KEY, emptyDocument, normalizeServer, parseMcpJson, serializeMcpJson, transportOfJson, withServer,
} from '../src/host/mcp-json.ts'
import { expandServer, mergeSources, serverTemplates } from '../src/host/mcp-sources.ts'
import type { ReadResult } from '../src/host/mcp-file.ts'
import { defaultServer } from '../src/settings.ts'
import type { McpScope, StoredServer } from '../src/types.ts'

/** One readable scope row holding the given raw server entries. */
function scopeRow(scope: McpScope, path: string, servers: Record<string, unknown>, extra: Partial<ReadResult> = {}): ReadResult {
  return {
    scope, path, writable: !path.endsWith('.mcp.json'), compat: path.endsWith('.mcp.json'), exists: true,
    document: { root: {}, servers, serversKey: MCP_SERVERS_KEY },
    ...extra,
  }
}

describe('template expansion', () => {
  it('expands every accepted spelling and keeps escapes literal', () => {
    const env = { TOKEN: 'secret', EMPTY: '' }
    expect(expandTemplate('${env:TOKEN}', env)).toEqual({ value: 'secret', missing: [] })
    expect(expandTemplate('${TOKEN}', env)).toEqual({ value: 'secret', missing: [] })
    expect(expandTemplate('Bearer ${env:TOKEN}', env)).toEqual({ value: 'Bearer secret', missing: [] })
    expect(expandTemplate('${MISSING:-fallback}', env)).toEqual({ value: 'fallback', missing: [] })
    // An empty value counts as unset, so the fallback applies.
    expect(expandTemplate('${EMPTY:-fallback}', env)).toEqual({ value: 'fallback', missing: [] })
    expect(expandTemplate('$${TOKEN}', env)).toEqual({ value: '${TOKEN}', missing: [] })
  })

  it('reports unresolved names instead of substituting them', () => {
    const result = expandTemplate('${A}/x/${B}', { B: 'b' })
    expect(result.value).toBe('${A}/x/b')
    expect(result.missing).toEqual(['A'])
    expect(templateEnvNames('${A}-${A}-${B}')).toEqual(['A', 'B'])
    expect(isTemplate('plain')).toBe(false)
    expect(templateEnvNamesOf({ A: '${X}', B: 'plain', C: '${Y}' })).toEqual(['X', 'Y'])
    expect(expandMap({ A: '${X}' }, {})).toEqual({ values: { A: '${X}' }, missing: ['X'] })
  })
})

describe('mcp.json documents', () => {
  it('reads the ecosystem format and the VS Code alias', () => {
    const primary = parseMcpJson(JSON.stringify({ mcpServers: { a: { command: 'node' } } }))
    expect(primary.ok).toBe(true)
    if (primary.ok) {
      expect(primary.document.serversKey).toBe(MCP_SERVERS_KEY)
      expect(Object.keys(primary.document.servers)).toEqual(['a'])
    }
    const alias = parseMcpJson(JSON.stringify({ servers: { a: { command: 'node' } }, inputs: [] }))
    expect(alias.ok).toBe(true)
    if (alias.ok) {
      expect(alias.document.serversKey).toBe(MCP_SERVERS_ALIAS_KEY)
      // The key it was read from survives a write, and foreign root fields stay.
      expect(serializeMcpJson(alias.document)).toBe(JSON.stringify({
        inputs: [], servers: { a: { command: 'node' } },
      }, null, 2) + '\n')
    }
  })

  it('reports malformed JSON and a non-object root as errors, not throws', () => {
    expect(parseMcpJson('{not json').ok).toBe(false)
    expect(parseMcpJson('[]')).toEqual({ ok: false, error: 'the document root must be a JSON object' })
  })

  it('maps transport spellings and refuses SSE', () => {
    expect(transportOfJson(undefined, true)).toBe('streamable-http')
    expect(transportOfJson(undefined, false)).toBe('stdio')
    expect(transportOfJson('streamableHttp', true)).toBe('streamable-http')
    expect(transportOfJson('streamable_http', true)).toBe('streamable-http')
    expect(transportOfJson('sse', true)).toBeUndefined()
    const sse = normalizeServer('x', { type: 'sse', url: 'https://example.com/sse' })
    expect(sse.ok).toBe(false)
    if (!sse.ok) expect(sse.error).toContain('dsh-mcp-client supports')
  })

  it('normalizes a stdio entry and one that omits its type', () => {
    const result = normalizeServer('github', {
      command: 'npx', args: ['-y', 'server'], env: { TOKEN: 'x' }, cwd: '/tmp',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.server).toMatchObject({
      id: 'github', label: 'github', enabled: true, transport: 'stdio',
      command: 'npx', args: ['-y', 'server'], cwd: '/tmp', env: { TOKEN: 'x' },
    })
    const disabled = normalizeServer('a', { command: 'node', disabled: true })
    expect(disabled.ok && disabled.server.enabled).toBe(false)
  })

  it('rejects a shape it cannot honour, naming the field', () => {
    const cases: [unknown, string][] = [
      [{ type: 'stdio' }, 'command'],
      [{ type: 'stdio', command: 'node', args: 'x' }, 'args'],
      [{ type: 'stdio', command: 'node', env: { A: 1 } }, 'env.A'],
      [{ type: 'http' }, 'url'],
      [{ type: 'stdio', command: 'node', toolCallTimeoutMs: 0 }, 'toolCallTimeoutMs'],
      [{ type: 'stdio', command: 'node', reconnect: { maxAttempts: 0 } }, 'reconnect.maxAttempts'],
      [{ type: 'stdio', command: 'node', sensitive: { env: [1] } }, 'sensitive.env'],
      ['not-an-object', 'object'],
    ]
    for (const [raw, hint] of cases) {
      const result = normalizeServer('x', raw)
      expect(result.ok, JSON.stringify(raw)).toBe(false)
      if (!result.ok) expect(result.error).toContain(hint)
    }
  })

  it('round-trips a server while preserving foreign fields', () => {
    const parsed = parseMcpJson(JSON.stringify({
      mcpServers: { a: { command: 'node', unknownTool: { keep: true }, args: [] } },
    }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const normalized = normalizeServer('a', parsed.document.servers.a)
    expect(normalized.ok).toBe(true)
    if (!normalized.ok) return
    const next = withServer(parsed.document, 'a', { ...normalized.server, command: 'deno' })
    expect(next.servers.a).toMatchObject({ command: 'deno', unknownTool: { keep: true } })
    // Defaults stay out of the file.
    expect(next.servers.a).not.toHaveProperty('toolCallTimeoutMs')
    expect(next.servers.a).not.toHaveProperty('reconnect')
    expect(withServer(next, 'a', null).servers).toEqual({})
  })

  it('writes only the fields that differ from the defaults', () => {
    const server: StoredServer = { ...defaultServer('a'), command: 'node', env: { T: '1' }, envSensitive: ['T'] }
    const document = withServer(emptyDocument(), 'a', server)
    expect(document.servers.a).toEqual({
      type: 'stdio', command: 'node', args: [], env: { T: '1' }, sensitive: { env: ['T'] },
    })
  })
})

describe('scope precedence', () => {
  const entry: Record<string, StoredServer> = { legacy: { ...defaultServer('legacy'), command: 'node' } }

  it('keeps the highest-precedence definition and reports the shadowed ones', () => {
    const merged = mergeSources({
      scopes: [
        scopeRow('project', '/p/.dsh/mcp.json', { shared: { command: 'project' } }),
        scopeRow('project', '/p/.mcp.json', { shared: { command: 'compat' }, onlyCompat: { command: 'node' } }),
        scopeRow('profile', '/home/profiles/x/mcp.json', { shared: { command: 'profile' } }),
        scopeRow('user', '/home/mcp.json', { shared: { command: 'user' } }),
      ],
      entryServers: entry,
      entryPath: 'cordis.patch.yml',
    })
    const byId = new Map(merged.servers.map(server => [server.id, server]))
    expect(byId.get('shared')?.scope).toBe('project')
    expect(byId.get('shared')?.server.command).toBe('project')
    expect(byId.get('shared')?.shadowed.map(shadow => shadow.scope)).toEqual(['project', 'profile', 'user'])
    // The project compatibility file ranks above the profile scope.
    expect(byId.get('onlyCompat')?.scope).toBe('project')
    expect(byId.get('legacy')?.scope).toBe('entry')
    expect(merged.sources.at(-1)).toMatchObject({ scope: 'entry', serverCount: 1 })
  })

  it('reports per-entry problems without dropping the readable ones', () => {
    const merged = mergeSources({
      scopes: [scopeRow('user', '/home/mcp.json', { good: { command: 'node' }, bad: { command: '' } })],
      entryServers: {},
      entryPath: 'cordis.patch.yml',
    })
    expect(merged.servers.map(server => server.id)).toEqual(['good'])
    expect(merged.sources[0]?.problems).toEqual([{ id: 'bad', error: 'a stdio server needs a non-empty "command"' }])
  })

  it('expands only on the way into the MCP client and names what is missing', () => {
    const server: StoredServer = {
      ...defaultServer('s'), command: '${env:DSH_TEST_CMD:-node}', args: ['${DSH_TEST_ARG}'],
      env: { TOKEN: '${env:DSH_TEST_TOKEN}' }, envSensitive: ['TOKEN'],
    }
    const expanded = expandServer(server, { DSH_TEST_TOKEN: 'value' })
    expect(expanded.server.command).toBe('node')
    expect(expanded.server.env).toEqual({ TOKEN: 'value' })
    expect(expanded.missing).toEqual(['DSH_TEST_ARG'])
    // The stored server keeps its templates untouched.
    expect(server.command).toBe('${env:DSH_TEST_CMD:-node}')
    expect(serverTemplates(server)).toEqual({ env: ['TOKEN'], headers: [] })
  })
})
