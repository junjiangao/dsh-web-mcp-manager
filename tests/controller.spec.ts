import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import type { SettingsDocument } from '../src/types.ts'
import { defaultDocument, defaultServer } from '../src/settings.ts'
import { McpManagerController } from '../src/host/controller.ts'

let document: SettingsDocument = defaultDocument()
let revision = 0

/**
 * The harness home is redirected before any controller resolves a path, so the
 * manager's `mcp.json` scopes land in a throwaway tree and never touch the
 * developer's real `~/.dsh`.
 */
const home = mkdtempSync(join(tmpdir(), 'mcp-manager-home-'))
process.env.DSH_HOME = home
const profileDir = join(home, 'profiles', 'test')
const profileFile = join(profileDir, 'mcp.json')

/** The entry config as the Host resolves it: two volatile refs over the document. */
const config = {
  servers: { get: () => document.servers },
  disabledTools: { get: () => document.disabledTools },
}

const controllers: McpManagerController[] = []

const ctx = {
  settings: {
    describe: vi.fn(() => [{ ns: 'web-mcp-manager', revision }]),
    replace: vi.fn(async (_ns: string, next: SettingsDocument) => { document = next; revision += 1 }),
    writable: true,
    documentPath: join(profileDir, 'cordis.patch.yml'),
  },
  connection: { fetch: { register: vi.fn(() => () => {}) } },
  effect: vi.fn((execute: () => unknown) => {
    const disposer = execute()
    return async () => {
      if (typeof disposer === 'function') await (disposer as () => void | Promise<void>)()
    }
  }),
  tools: {
    guard: vi.fn(() => () => {}),
    schemas: vi.fn(() => []),
    restrict: vi.fn(() => () => {}),
    get: vi.fn(() => undefined),
  },
  plugin: vi.fn(() => ({ await: Promise.resolve(), dispose: vi.fn(async () => {}) })),
  logger: { warn: vi.fn() },
  on: vi.fn(() => () => {}),
  get: vi.fn(() => undefined),
} as never

const signal = () => new AbortController().signal

/** Start a controller and register it for disposal at the end of the test. */
async function mount(): Promise<McpManagerController> {
  const controller = new McpManagerController(ctx as never, config as never)
  controllers.push(controller)
  await controller.start()
  return controller
}

beforeEach(() => {
  document = defaultDocument()
  revision = 0
  rmSync(profileDir, { recursive: true, force: true })
  mkdirSync(profileDir, { recursive: true })
  rmSync(join(home, 'mcp.json'), { force: true })
  ;(ctx as never as { settings: { documentPath?: string } }).settings.documentPath = join(profileDir, 'cordis.patch.yml')
  // `clearAllMocks` clears calls but keeps implementations, so a test that left
  // a never-settling fiber behind would stall the next test's `start()`.
  ;(ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin
    .mockReturnValue({ await: Promise.resolve(), dispose: vi.fn(async () => {}) })
})

afterEach(async () => {
  // Restore real timers first: a failed fake-timer test must not make the
  // disposal below (or the next test's file locks) wait on a clock nobody advances.
  vi.useRealTimers()
  for (const controller of controllers.splice(0)) await controller.dispose()
  vi.clearAllMocks()
})

/** Poll the snapshot until one server satisfies the predicate, or give up. */
async function waitForServer(
  controller: McpManagerController,
  predicate: (server: import('../src/types.ts').ManagedServerView) => boolean,
): Promise<import('../src/types.ts').ManagedServerView | undefined> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snap = await controller.handle('snapshot', {}, signal())
    if (snap.ok) {
      const match = snap.value.servers.find(predicate)
      if (match !== undefined) return match
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  return undefined
}

describe('McpManagerController', () => {
  it('rejects writes with a stale revision as conflict', async () => {
    const controller = await mount()
    revision = 2
    const result = await controller.handle('upsertServer', { scope: 'entry', server: { id: 'x', command: 'node' }, expectedRevision: 1 }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
  })

  it('carries the settings service conflict identity on a stale revision', async () => {
    const controller = await mount()
    revision = 2
    const result = await controller.handle('upsertServer', { scope: 'entry', server: { id: 'x', command: 'node' }, expectedRevision: 1 }, signal())
    expect(result.ok).toBe(false)
    // The manager raises `SettingsConflictError` itself, so the wire message is
    // the service's own wording rather than a locally formatted string.
    if (!result.ok) expect(result.error.message).toContain('settings namespace')
  })

  it('classifies a write-time conflict raised by the settings service itself', async () => {
    const controller = await mount()
    // The manager's fail-fast check passes, so the only conflict identity that
    // can reach the classifier is the one `replace()` throws.
    ;(ctx as never as { settings: { replace: ReturnType<typeof vi.fn> } }).settings.replace
      .mockRejectedValueOnce(new SettingsConflictError('web-mcp-manager', 0, 1))
    const result = await controller.handle('upsertServer', { scope: 'entry', server: { id: 'x', command: 'node' }, expectedRevision: 0 }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
  })

  it('writes a new server into the profile mcp.json scope', async () => {
    const controller = await mount()
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' }, expectedRevision: 0 }, signal())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.servers.map(server => [server.id, server.scope])).toEqual([['x', 'profile']])
    expect(result.value.sources.find(source => source.scope === 'profile')?.serverCount).toBe(1)
    // A file-scope write carries no revision fence: the file is re-read inside
    // the cross-process lock instead.
    expect(revision).toBe(0)
  })

  it('does not block the write on lifecycle startup', async () => {
    let resolveAwait!: () => void
    ;(ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin.mockReturnValue({
      await: vi.fn(() => new Promise<void>(resolve => { resolveAwait = resolve })),
      dispose: vi.fn(async () => {}),
    })
    const controller = await mount()
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
    const controller = await mount()
    const first = await controller.handle('upsertServer', { server: { id: 'a', command: 'node' }, expectedRevision: 0 }, signal())
    expect(first.ok).toBe(true)
    const second = await controller.handle('upsertServer', { server: { id: 'b', command: 'node' }, expectedRevision: 0 }, signal())
    expect(second.ok).toBe(true)
    resolveA()
    await Promise.resolve()
  })

  it('marks startup as failed when it times out', async () => {
    // Capture a real yield before the clock is faked: the reconciler reads the
    // scope files through real I/O, so advancing a fake clock only helps once
    // that I/O has actually settled and the startup bound exists.
    const realSetImmediate = setImmediate
    vi.useFakeTimers()
    const plugin = (ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin
    plugin.mockReturnValue({
      await: vi.fn(() => new Promise<void>(() => {})),
      dispose: vi.fn(async () => {}),
    })
    const controller = await mount()
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' }, expectedRevision: 0 }, signal())
    expect(result.ok).toBe(true)
    for (let turn = 0; turn < 500 && plugin.mock.calls.length === 0; turn++) {
      await new Promise(resolve => realSetImmediate(resolve))
    }
    expect(plugin).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30_000)
    const snap = await controller.handle('snapshot', {}, signal())
    expect(snap.ok).toBe(true)
    if (snap.ok) {
      expect(snap.value.servers[0]?.status).toBe('failed')
      expect(snap.value.servers[0]?.error).toContain('timed out')
    }
  })

  it('surfaces a template that has no environment value as a named failure', async () => {
    const controller = await mount()
    await controller.handle('upsertServer', {
      server: { id: 'templated', command: 'node', env: { TOKEN: '${env:DSH_MCP_TEST_MISSING}' } },
      expectedRevision: 0,
    }, signal())
    const failed = await waitForServer(controller, server => server.error !== undefined)
    expect(failed?.error).toContain('DSH_MCP_TEST_MISSING')
    // The template never leaves the Host: the panel still sees the reference.
    expect(failed?.templates.env).toEqual(['TOKEN'])
    expect(failed?.env.TOKEN).toEqual({ set: true, sensitive: false })
  })

  it('keeps a legacy entry server readable and migratable into a file scope', async () => {
    document = { servers: { legacy: { ...defaultServer('legacy'), command: 'node' } }, disabledTools: {} }
    const controller = await mount()
    const before = await controller.handle('snapshot', {}, signal())
    expect(before.ok).toBe(true)
    if (before.ok) expect(before.value.servers[0]?.scope).toBe('entry')

    const migrated = await controller.handle('upsertServer', {
      scope: 'profile',
      server: { id: 'legacy', command: 'node' },
      expectedRevision: 0,
    }, signal())
    expect(migrated.ok).toBe(true)
    if (migrated.ok) {
      expect(migrated.value.servers[0]?.scope).toBe('profile')
      expect(migrated.value.servers[0]?.shadowed).toEqual(['entry'])
    }
  })

  it('degrades to the user scope when this deployment has no profile directory', async () => {
    ;(ctx as never as { settings: { documentPath?: string } }).settings.documentPath = undefined
    const controller = await mount()
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' }, expectedRevision: 0 }, signal())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.servers[0]?.scope).toBe('user')
  })
})
