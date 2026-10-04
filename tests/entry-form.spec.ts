/**
 * The entry layer's write projection.
 *
 * These tests pin the one property that makes editing a plugin's own
 * configuration through the shared settings form safe: the form carries a
 * REDACTED section, so a write must name only the fields it means and must
 * never restate a credential it never received.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ServerPatch } from '../src/types.ts'
import { createEntryForm, entryServerOps, type EntryPathOp } from '../src/client/entry-form.ts'

function patch(overrides: Partial<ServerPatch> = {}): ServerPatch {
  return { id: 'demo', ...overrides }
}

/** Every path an op writes or removes, as a `servers.demo.env.KEY` string. */
function paths(ops: readonly EntryPathOp[]): string[] {
  return ops.map(op => op.path.join('.'))
}

function valueAt(ops: readonly EntryPathOp[], path: string): unknown {
  const op = ops.find(candidate => candidate.path.join('.') === path)
  return op?.op === 'set' ? op.value : undefined
}

describe('entryServerOps', () => {
  it('restates every non-secret field the decoded section cannot supply', () => {
    const ops = entryServerOps(patch({
      label: 'Demo', transport: 'stdio', command: 'node', args: ['a', 'b'], cwd: '/tmp',
      url: '', envSensitive: ['TOKEN'], headerSensitive: [],
      toolCallTimeoutMs: 1_000,
      reconnect: { enabled: false, initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 3 },
    }))
    expect(paths(ops)).toEqual(expect.arrayContaining([
      'servers.demo.id', 'servers.demo.label', 'servers.demo.transport', 'servers.demo.command',
      'servers.demo.args', 'servers.demo.cwd', 'servers.demo.url',
      'servers.demo.envSensitive', 'servers.demo.headerSensitive',
      'servers.demo.toolCallTimeoutMs', 'servers.demo.reconnect',
    ]))
    expect(valueAt(ops, 'servers.demo.args')).toEqual(['a', 'b'])
    expect(valueAt(ops, 'servers.demo.reconnect')).toEqual({ enabled: false, initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 3 })
  })

  it('omits a field the patch does not name, so its stored value survives', () => {
    const ops = entryServerOps(patch({ label: 'Demo' }))
    // `enabled` is absent from a draft patch: a save must not flip it.
    expect(paths(ops)).not.toContain('servers.demo.enabled')
    expect(paths(ops)).not.toContain('servers.demo.toolCallTimeoutMs')
    expect(paths(ops)).not.toContain('servers.demo.reconnect')
  })

  it('sets a typed secret and unsets a removed one, and touches nothing else', () => {
    const ops = entryServerOps(patch({
      env: { TOKEN: 'new-secret', STALE: { clear: true } },
    }))
    expect(valueAt(ops, 'servers.demo.env.TOKEN')).toBe('new-secret')
    // A URL, a token, or a key the browser never received is never restated:
    // the only ops under `env` are the two the user actually acted on.
    expect(paths(ops).filter(path => path.startsWith('servers.demo.env.'))).toEqual([
      'servers.demo.env.TOKEN',
      'servers.demo.env.STALE',
    ])
    expect(ops.find(op => op.path.join('.') === 'servers.demo.env.STALE')?.op).toBe('unset')
  })

  it('clears a renamed key as well as setting the new one', () => {
    const ops = entryServerOps(patch({ headers: { 'X-Old': { clear: true }, 'X-New': 'v' } }))
    expect(ops.find(op => op.path.join('.') === 'servers.demo.headers.X-Old')?.op).toBe('unset')
    expect(valueAt(ops, 'servers.demo.headers.X-New')).toBe('v')
  })

  it('leaves a templated key alone: a protected row carries no patch entry at all', () => {
    // `secretPatch` omits protected keys entirely, which is what makes the
    // template in the file survive a save that restates the sensitive list.
    const ops = entryServerOps(patch({ env: {}, envSensitive: ['TOKEN'] }))
    expect(paths(ops).filter(path => path.startsWith('servers.demo.env.'))).toEqual([])
    expect(valueAt(ops, 'servers.demo.envSensitive')).toEqual(['TOKEN'])
  })
})

describe('createEntryForm', () => {
  function context(mutate: ReturnType<typeof vi.fn>, snapshot = { status: 'ready', writable: true }): Context {
    const form = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      mutate,
      set: vi.fn(),
      unset: vi.fn(),
    }
    return { configForms: { get: () => form } } as unknown as Context
  }

  it('derives availability and writability from the official form snapshot', () => {
    const ready = createEntryForm(context(vi.fn()))
    expect(ready.snapshot()).toEqual({ available: true, writable: true })
    // The snapshot object is stable until the form replaces it, which is what
    // `useSyncExternalStore` requires to avoid an infinite render loop.
    expect(ready.snapshot()).toBe(ready.snapshot())

    const loading = createEntryForm(context(vi.fn(), { status: 'loading', writable: false }))
    expect(loading.snapshot()).toEqual({ available: false, writable: false })
  })

  it('removes a server and its policy row in one fenced mutation', async () => {
    const mutate = vi.fn(async () => true)
    const form = createEntryForm(context(mutate))
    await expect(form.remove('demo')).resolves.toBe(true)
    expect(mutate).toHaveBeenCalledWith([
      { op: 'unset', path: ['servers', 'demo'] },
      { op: 'unset', path: ['disabledTools', 'demo'] },
    ])
  })

  it('clears a policy row instead of writing an empty list', async () => {
    const mutate = vi.fn(async () => true)
    const form = createEntryForm(context(mutate))
    await form.setDisabledTools('demo', [])
    expect(mutate).toHaveBeenLastCalledWith([{ op: 'unset', path: ['disabledTools', 'demo'] }])
    await form.setDisabledTools('demo', ['mcp__demo__one'])
    expect(mutate).toHaveBeenLastCalledWith([
      { op: 'set', path: ['disabledTools', 'demo'], value: ['mcp__demo__one'] },
    ])
  })

  it('reports a refusal rather than throwing, so the panel can keep the draft', async () => {
    const form = createEntryForm(context(vi.fn(async () => false)))
    await expect(form.setEnabled('demo', true)).resolves.toBe(false)
  })
})
