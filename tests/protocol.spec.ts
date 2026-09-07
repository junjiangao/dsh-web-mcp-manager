import { describe, expect, it } from 'vitest'
import { defaultServer, validateServerConfig } from '../src/settings.ts'
import { mergeServerPatch, projectTool, redactServer, serverIdFromToolName } from '../src/protocol.ts'

describe('MCP manager protocol projections', () => {
  it('preserves an existing secret when a redacted edit omits it', () => {
    const current = defaultServer('demo')
    current.command = 'node'
    current.env.TOKEN = 'old-value'

    const next = mergeServerPatch(current, {
      id: 'demo',
      command: 'node',
      env: { OTHER: 'new-value' },
    })

    expect(next.env).toEqual({ TOKEN: 'old-value', OTHER: 'new-value' })
  })

  it('supports explicit secret clearing and redacts values from the view', () => {
    const current = defaultServer('demo')
    current.command = 'node'
    current.env.TOKEN = 'old-value'
    const next = mergeServerPatch(current, { id: 'demo', env: { TOKEN: { clear: true } } })

    expect(next.env).toEqual({})
    expect(redactServer({ ...current, env: { TOKEN: 'old-value' } }, 'loaded', 0).env).toEqual({ TOKEN: { set: true } })
  })

  it('keeps secret keys as data even when they use object-prototype names', () => {
    const current = defaultServer('demo')
    current.command = 'node'
    const next = mergeServerPatch(current, { id: 'demo', env: { ['__proto__']: 'value' } })
    expect(Object.prototype.hasOwnProperty.call(next.env, '__proto__')).toBe(true)
    expect(next.env['__proto__']).toBe('value')
    expect(Object.getPrototypeOf(next.env)).toBe(Object.prototype)
  })

  it('keeps MCP tool ownership tied to the server namespace', () => {
    expect(serverIdFromToolName('mcp__demo__read_file')).toBe('demo')
    expect(serverIdFromToolName('mcp___demo__read_file')).toBe('_demo')
    expect(serverIdFromToolName('mcp__demo__with__underscores', ['demo__with'])).toBe('demo__with')
    expect(serverIdFromToolName('other_tool')).toBeUndefined()
    expect(projectTool({ name: 'mcp__demo__read_file', parameters: {} }, new Set())).toMatchObject({
      serverId: 'demo',
      enabled: true,
    })
    expect(projectTool({ name: 'mcp__foreign__read_file', parameters: {} }, new Set(), ['demo'])).toBeUndefined()
  })

  it('rejects an enabled stdio server without a command', () => {
    const server = defaultServer('demo')
    expect(() => validateServerConfig(server)).toThrow(/needs a command/u)
  })
})
