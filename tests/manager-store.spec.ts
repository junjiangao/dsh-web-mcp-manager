// @vitest-environment jsdom

/**
 * The panel's load rule, tested directly.
 *
 * These are the semantics the page used to hold in component effects, where the
 * only way to observe them was a jsdom test that waited out a real poll
 * interval. Driving the store over a fake transport proves the same rules —
 * newest request wins, a failed background read never discards a standing
 * snapshot, an action message is not a poll's to clear — without any clock.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../src/types.ts'
import type { ManagerClientApi } from '../src/client/api.ts'
import { createManagerStore } from '../src/client/manager-store.ts'

/** A snapshot whose only distinguishing content is a marker tool name. */
function marked(marker: string): Snapshot {
  return {
    writable: true,
    servers: [],
    tools: [{ name: marker, serverId: 'demo', description: '', parameters: {}, enabled: true }],
    readonlyEntries: [],
    sources: [],
    workspaces: [],
  }
}

function markerOf(snapshot: Snapshot | undefined): string | undefined {
  return snapshot?.tools[0]?.name
}

function apiWith(snapshot: ManagerClientApi['snapshot']): ManagerClientApi {
  return {
    snapshot,
    upsertServer: vi.fn(),
    removeServer: vi.fn(),
    setServerEnabled: vi.fn(),
    reloadServer: vi.fn(),
  } as unknown as ManagerClientApi
}

/** A read the test settles by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createManagerStore', () => {
  it('publishes the first answer and stops reporting loading', async () => {
    const api = apiWith(vi.fn(async () => marked('first')))
    const store = createManagerStore(api)
    expect(store.state.getSnapshot().status).toBe('loading')
    await store.refresh()
    const view = store.state.getSnapshot()
    expect(view.status).toBe('ready')
    expect(markerOf(view.snapshot)).toBe('first')
    expect(view.busy).toBe(false)
  })

  it('drops an answer a newer request already superseded', async () => {
    const slow = deferred<Snapshot>()
    const api = apiWith(vi.fn()
      .mockResolvedValueOnce(marked('initial'))
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(marked('newer')) as unknown as ManagerClientApi['snapshot'])
    const store = createManagerStore(api)
    await store.refresh()
    expect(markerOf(store.state.getSnapshot().snapshot)).toBe('initial')

    // Two overlapping operations: the second settles first, then the first.
    const stale = store.refresh()
    await store.refresh()
    expect(markerOf(store.state.getSnapshot().snapshot)).toBe('newer')
    slow.resolve(marked('stale'))
    await stale
    expect(markerOf(store.state.getSnapshot().snapshot)).toBe('newer')
  })

  it('says a background read failed without discarding a standing snapshot', async () => {
    vi.useFakeTimers()
    const api = apiWith(vi.fn()
      .mockResolvedValueOnce(marked('standing'))
      .mockRejectedValue(new Error('host is away')) as unknown as ManagerClientApi['snapshot'])
    const store = createManagerStore(api)
    const stop = store.startPolling(1_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(markerOf(store.state.getSnapshot().snapshot)).toBe('standing')

    // The action message belongs to the user's last operation, not to a poll.
    store.notify('the deployment did not accept this')
    await vi.advanceTimersByTimeAsync(1_000)
    const view = store.state.getSnapshot()
    expect(view.pollFailed).toBe(true)
    expect(view.status).toBe('ready')
    expect(markerOf(view.snapshot)).toBe('standing')
    expect(view.message).toBe('the deployment did not accept this')
    stop()
  })

  it('reports the first read\'s failure as the view error', async () => {
    vi.useFakeTimers()
    const api = apiWith(vi.fn(async () => { throw new Error('cannot reach the Host') }))
    const store = createManagerStore(api)
    const stop = store.startPolling(1_000)
    await vi.advanceTimersByTimeAsync(0)
    const view = store.state.getSnapshot()
    expect(view.status).toBe('error')
    expect(view.error).toBe('cannot reach the Host')
    stop()
  })

  it('stops reading once its stopper runs, and never overlaps reads', async () => {
    vi.useFakeTimers()
    const pending = deferred<Snapshot>()
    const snapshot = vi.fn()
      .mockResolvedValueOnce(marked('first'))
      .mockImplementation(() => pending.promise)
    const store = createManagerStore(apiWith(snapshot as unknown as ManagerClientApi['snapshot']))
    const stop = store.startPolling(1_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshot).toHaveBeenCalledTimes(1)

    // A slow read is not overlapped: three intervals produce one more call.
    await vi.advanceTimersByTimeAsync(3_000)
    expect(snapshot).toHaveBeenCalledTimes(2)

    stop()
    const after = snapshot.mock.calls.length
    await vi.advanceTimersByTimeAsync(5_000)
    expect(snapshot.mock.calls.length).toBe(after)
    pending.resolve(marked('late'))
  })

  it('reports a refused form write and re-reads an accepted one', async () => {
    const api = apiWith(vi.fn(async () => marked('after the write')))
    const store = createManagerStore(api)

    await expect(store.runForm(async () => false, 'conflict')).resolves.toBe(false)
    expect(store.state.getSnapshot().message).toBe('conflict')
    expect(api.snapshot).not.toHaveBeenCalled()
    expect(store.state.getSnapshot().busy).toBe(false)

    await expect(store.runForm(async () => true, 'conflict')).resolves.toBe(true)
    expect(api.snapshot).toHaveBeenCalledTimes(1)
    expect(markerOf(store.state.getSnapshot().snapshot)).toBe('after the write')
    // The next operation clears the previous message.
    expect(store.state.getSnapshot().message).toBeUndefined()
  })

  it('re-reads against the selected workspace root', async () => {
    const api = apiWith(vi.fn(async () => marked('rooted')))
    const store = createManagerStore(api)
    store.selectProject('/repo/one')
    await vi.waitFor(() => expect(store.state.getSnapshot().status).toBe('ready'))
    expect(store.state.getSnapshot().projectPath).toBe('/repo/one')
    expect((api.snapshot as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual({ projectPath: '/repo/one' })
  })

  it('surfaces a failed operation as the action message and releases busy', async () => {
    const api = apiWith(vi.fn(async () => marked('fine')))
    const store = createManagerStore(api)
    await expect(store.run(async () => { throw new Error('the Host refused the write') })).resolves.toBeUndefined()
    expect(store.state.getSnapshot().message).toBe('the Host refused the write')
    expect(store.state.getSnapshot().busy).toBe(false)
  })
})
