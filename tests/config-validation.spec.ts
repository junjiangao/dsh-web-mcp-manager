import { describe, expect, it } from 'vitest'
import { Config } from '@deepseek-ai/dsh-mcp-client'
import { DEFAULT_RECONNECT, defaultServer, validateServerConfig } from '../src/settings.ts'
import { validateMcpConfig } from '../src/host/mcp-config.ts'

function expectMcpConfigValidation(fn: () => unknown): void {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(Error)
  expect((caught as { code?: string }).code).toBe('MCP_CONFIG_VALIDATION')
}

describe('MCP config validation delegated to dsh-mcp-client', () => {
  it('fills the same reconnect defaults as DEFAULT_RECONNECT', () => {
    const resolved = Config({ transport: 'stdio', serverName: 'probe', command: 'sh' })
    expect(resolved.reconnect).toEqual(DEFAULT_RECONNECT)
  })

  it('rejects invalid args types via the Config schema', () => {
    expectMcpConfigValidation(() => validateMcpConfig({
      ...defaultServer('x'), command: 'sh', args: [42] as unknown as string[],
    }))
  })

  it('rejects invalid reconnect bounds via the Config schema', () => {
    for (const reconnect of [
      { ...DEFAULT_RECONNECT, initialDelayMs: 0 },
      { ...DEFAULT_RECONNECT, maxAttempts: 0 },
    ]) {
      expectMcpConfigValidation(() => validateMcpConfig({
        ...defaultServer('x'), command: 'sh', reconnect,
      }))
    }
  })

  it('keeps manager validation for the stdio command', () => {
    expect(() => validateServerConfig(defaultServer('x'))).toThrow(/needs a command/u)
  })

  it('keeps manager validation for HTTP-only URLs', () => {
    const server = { ...defaultServer('x'), transport: 'streamable-http' as const, url: 'ftp://example.com/mcp' }
    expect(() => validateServerConfig(server)).toThrow(/must use http or https/u)
  })

  it('keeps manager validation for toolCallTimeoutMs bounds', () => {
    for (const toolCallTimeoutMs of [0, 2_147_483_648]) {
      expect(() => validateServerConfig({
        ...defaultServer('x'), command: 'sh', toolCallTimeoutMs,
      })).toThrow(/toolCallTimeoutMs/u)
    }
  })
})
