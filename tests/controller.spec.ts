import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsDocument } from '../src/types.ts'
import { defaultDocument, defaultServer } from '../src/settings.ts'
import { McpManagerController } from '../src/host/controller.ts'

let document: SettingsDocument = defaultDocument()
let revision = 0

const ctx = {
  settings: {
    register: vi.fn(() => ({ watch: vi.fn(() => () => {}), get: vi.fn(() => document) })),
    describe: vi.fn(() => [{ ns: 'web-mcp-manager', revision }]),
    replace: vi.fn(async (_ns: string, next: SettingsDocument) => { document = next; revision += 1 }),
    writable: true,
  },
  connection: { rpc: { handle: vi.fn(async () => async () => {}) } },
  tools: {
    guard: vi.fn(() => () => {}),
    schemas: vi.fn(() => []),
    restrict: vi.fn(() => () => {}),
    get: vi.fn(() => undefined),
  },
  plugin: vi.fn(() => ({ await: Promise.resolve(), dispose: vi.fn(async () => {}) })),
  logger: { warn: vi.fn() },
  on: vi.fn(),
  get: vi.fn(() => undefined),
} as never

const signal = () => new AbortController().signal

beforeEach(() => {
  document = defaultDocument()
  revision = 0
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('McpManagerController', () => {
  it('rejects writes with a stale revision as conflict', async () => {
    const controller = new McpManagerController(ctx as never)
    await controller.start()
    revision = 2
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' }, expectedRevision: 1 }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
  })

  it('does not block the write on lifecycle startup', async () => {
    let resolveAwait!: () => void
    ;(ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin.mockReturnValue({
      await: vi.fn(() => new Promise<void>(resolve => { resolveAwait = resolve })),
      dispose: vi.fn(async () => {}),
    })
    const controller = new McpManagerController(ctx as never)
    await controller.start()
    revision = 0
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' }, expectedRevision: 0 }, signal())
    expect(result.ok).toBe(true)
    // reconcile 已入队(后台挂起),但写操作已返回
    await vi.waitFor(() => expect((ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin).toHaveBeenCalled())
    resolveAwait()
    await Promise.resolve()
  })

  it('does not let a slow server block writes to another server', async () => {
    let resolveA!: () => void
    const hang = new Promise<void>(resolve => { resolveA = resolve })
    ;(ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin.mockReturnValue({
      await: vi.fn(() => hang),
      dispose: vi.fn(async () => {}),
    })
    const controller = new McpManagerController(ctx as never)
    await controller.start()
    revision = 0
    const first = await controller.handle('upsertServer', { server: { id: 'a', command: 'node' }, expectedRevision: 0 }, signal())
    expect(first.ok).toBe(true)
    const second = await controller.handle('upsertServer', { server: { id: 'b', command: 'node' }, expectedRevision: 1 }, signal())
    expect(second.ok).toBe(true)
    resolveA()
    await Promise.resolve()
  })

  it('marks startup as failed when it times out', async () => {
    vi.useFakeTimers()
    ;(ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin.mockReturnValue({
      await: vi.fn(() => new Promise<void>(() => {})),
      dispose: vi.fn(async () => {}),
    })
    const controller = new McpManagerController(ctx as never)
    await controller.start()
    revision = 0
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' }, expectedRevision: 0 }, signal())
    expect(result.ok).toBe(true)
    await vi.advanceTimersByTimeAsync(30_000)
    const snap = await controller.handle('snapshot', {}, signal())
    expect(snap.ok).toBe(true)
    if (snap.ok) {
      expect(snap.value.servers[0]?.status).toBe('failed')
      expect(snap.value.servers[0]?.error).toContain('timed out')
    }
    vi.useRealTimers()
  })
})
