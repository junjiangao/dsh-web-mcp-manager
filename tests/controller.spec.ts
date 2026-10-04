import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsDocument } from '../src/types.ts'
import { defaultDocument, defaultServer } from '../src/settings.ts'
import { McpManagerController } from '../src/host/controller.ts'

let document: SettingsDocument = defaultDocument()

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
    // The RPC no longer reads or writes the entry document at all: that layer
    // belongs to the official shared settings form. `replace` stays mocked so a
    // stray call would be visible rather than fatal.
    replace: vi.fn(async (_ns: string, next: SettingsDocument) => { document = next }),
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
  it('refuses to write the legacy entry scope through the RPC', async () => {
    const controller = await mount()
    const result = await controller.handle('upsertServer', { scope: 'entry', server: { id: 'x', command: 'node' } }, signal())
    expect(result.ok).toBe(false)
    // The entry document's only writer is the official shared settings form,
    // which fences the change with its own revision; this channel would be a
    // second, unfenced path to the same document.
    if (!result.ok) {
      expect(result.error.code).toBe('bad-request')
      expect(result.error.message).toContain('settings form')
    }
    expect((ctx as never as { settings: { replace: ReturnType<typeof vi.fn> } }).settings.replace).not.toHaveBeenCalled()
  })

  it('refuses to remove or disable a server whose definition lives at entry scope', async () => {
    document = { servers: { legacy: { ...defaultServer('legacy'), command: 'node' } }, disabledTools: {} }
    const controller = await mount()
    for (const request of [
      { endpoint: 'removeServer', payload: { id: 'legacy' } },
      { endpoint: 'setServerEnabled', payload: { id: 'legacy', enabled: false } },
    ]) {
      const result = await controller.handle(request.endpoint, request.payload, signal())
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('bad-request')
    }
    // The definition is untouched: the panel migrates or removes it through
    // the form, not here.
    expect(document.servers.legacy).toBeDefined()
  })

  it('has no endpoint for the per-tool policy: that document is the form\'s', async () => {
    const controller = await mount()
    const result = await controller.handle('setToolEnabled', { serverId: 'x', name: 'mcp__x__one', enabled: false }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('unknown MCP manager endpoint')
  })

  it('writes a new server into the profile mcp.json scope', async () => {
    const controller = await mount()
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' } }, signal())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.servers.map(server => [server.id, server.scope])).toEqual([['x', 'profile']])
    expect(result.value.sources.find(source => source.scope === 'profile')?.serverCount).toBe(1)
    // A file-scope write carries no revision fence: the file is re-read inside
    // the cross-process lock instead, and the entry document is never touched.
    expect((ctx as never as { settings: { replace: ReturnType<typeof vi.fn> } }).settings.replace).not.toHaveBeenCalled()
  })

  it('does not block the write on lifecycle startup', async () => {
    let resolveAwait!: () => void
    ;(ctx as never as { plugin: ReturnType<typeof vi.fn> }).plugin.mockReturnValue({
      await: vi.fn(() => new Promise<void>(resolve => { resolveAwait = resolve })),
      dispose: vi.fn(async () => {}),
    })
    const controller = await mount()
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' } }, signal())
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
    const first = await controller.handle('upsertServer', { server: { id: 'a', command: 'node' } }, signal())
    expect(first.ok).toBe(true)
    const second = await controller.handle('upsertServer', { server: { id: 'b', command: 'node' } }, signal())
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
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' } }, signal())
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
      server: { id: 'templated', command: 'node', env: { TOKEN: '${env:DSH_MCP_TEST_MISSING}' } }
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
      server: { id: 'legacy', command: 'node' }
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
    const result = await controller.handle('upsertServer', { server: { id: 'x', command: 'node' } }, signal())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.servers[0]?.scope).toBe('user')
  })
})
