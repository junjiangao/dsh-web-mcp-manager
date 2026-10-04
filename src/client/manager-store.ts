/**
 * The panel's view of the Host, held in the official client store.
 *
 * `@deepseek-ai/dsh-client-store` is the snapshot store the Web shell seeds for
 * every plugin, so the page keeps its data where the rest of the product keeps
 * its own: one reference-stable snapshot, one subscription, and a single write
 * face. The component therefore reads with `useSyncExternalStore` and never
 * owns the request bookkeeping.
 *
 * What the store buys beyond tidiness is testability. The panel's load rule —
 * a monotonic sequence, where only the newest request may publish and a failed
 * poll never discards a standing snapshot — used to live inside the component's
 * effects, where the only way to observe it was a jsdom test that waited out a
 * real poll interval. It is now plain code over a fake transport.
 *
 * `mcp.json` reads, `mcp.json` writes, and runtime status all come from the
 * manager's own RPC; the legacy entry scope is not here, because the browser
 * edits it through the official shared settings form (`./entry-form.ts`).
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Snapshot } from '../types.ts'
import type { ManagerClientApi } from './api.ts'

/** How often a visible page re-reads the Host. */
const POLL_INTERVAL_MS = 2_000

/**
 * Everything the page renders, plus the state its operations own.
 *
 * The fields are mutable because `SnapshotStore.update` hands the mutator this
 * exact type; the store freezes every published snapshot, so nothing outside a
 * mutator can actually write one.
 */
export interface ManagerView {
  /** `loading` until the first answer, `error` when none ever arrived. */
  status: 'loading' | 'ready' | 'error'
  /** The last accepted snapshot; undefined until the first one. */
  snapshot: Snapshot | undefined
  /** The first read's failure, while no snapshot stands. */
  error: string | undefined
  /** A background read failed; a standing snapshot keeps serving. */
  pollFailed: boolean
  /** A user operation is crossing the wire. */
  busy: boolean
  /** The last operation's refusal or failure, until the next operation. */
  message: string | undefined
  /** Registered workspace root the project scope is read and written against. */
  projectPath: string | undefined
}

export interface ManagerStore {
  /** The official snapshot store the component subscribes to. */
  readonly state: SnapshotStore<ManagerView>
  /** Root the project scope at another workspace and re-read. */
  selectProject: (projectPath: string | undefined) => void
  /** Show one message the store did not derive from a request. */
  notify: (message: string) => void
  /** Dismiss the current action message. */
  clearMessage: () => void
  /** Run one RPC operation whose answer IS the next snapshot. */
  run: (operation: () => Promise<Snapshot>) => Promise<Snapshot | undefined>
  /** Re-read the Host as a user action (the refresh control). */
  refresh: () => Promise<void>
  /**
   * Run one official-form write.
   *
   * The form answers with acceptance rather than a snapshot — it owns revision
   * fencing and has already reloaded its own state on a refusal — so the page
   * reports a refusal and re-reads through its own RPC, which stays the single
   * place the merged `project → profile → user → entry` view is computed.
   * @param operation - the write, answering whether the Host accepted it.
   * @param refusedMessage - the copy to show when it did not.
   * @returns whether the write was accepted.
   */
  runForm: (operation: () => Promise<boolean>, refusedMessage: string) => Promise<boolean>
  /**
   * Read once and keep reading while the document is visible.
   * @param intervalMs - poll period; the default is production's.
   * @returns the stopper.
   */
  startPolling: (intervalMs?: number) => () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createManagerStore(api: ManagerClientApi): ManagerStore {
  const state = createSnapshotStore<ManagerView>({
    status: 'loading',
    snapshot: undefined,
    error: undefined,
    pollFailed: false,
    busy: false,
    message: undefined,
    projectPath: undefined,
  })

  /**
   * Monotonic request sequence.
   *
   * Every read — poll, refresh, or the re-read after a write — reserves the
   * next number before it starts, and only the newest reservation may publish.
   * A slow answer therefore cannot overwrite a newer one, whichever order they
   * settle in.
   */
  let sequence = 0
  /** At most one background read in flight, so a slow Host is not overlapped. */
  let pollInFlight = false

  const nextSequence = (): number => {
    sequence += 1
    return sequence
  }

  const accept = (responseSequence: number, snapshot: Snapshot): boolean => {
    if (responseSequence !== sequence) return false
    state.update((draft) => {
      draft.status = 'ready'
      draft.snapshot = snapshot
      draft.error = undefined
      draft.pollFailed = false
    })
    return true
  }

  const fail = (error: unknown): void => {
    state.update((draft) => { draft.message = messageOf(error) })
  }

  const run = async (operation: () => Promise<Snapshot>): Promise<Snapshot | undefined> => {
    state.update((draft) => { draft.busy = true; draft.message = undefined })
    try {
      const responseSequence = nextSequence()
      const next = await operation()
      accept(responseSequence, next)
      return next
    } catch (error) {
      fail(error)
      return undefined
    } finally {
      state.update((draft) => { draft.busy = false })
    }
  }

  const read = async (signal?: AbortSignal): Promise<void> => {
    if (pollInFlight) return
    pollInFlight = true
    const responseSequence = nextSequence()
    try {
      accept(responseSequence, await api.snapshot({ projectPath: state.getSnapshot().projectPath }, signal))
    } catch (error) {
      // A deliberate teardown is not a failure, and a background failure says
      // so in place: the standing snapshot keeps serving and the action message
      // belongs to the user's last operation.
      if (signal?.aborted === true || responseSequence !== sequence) return
      state.update((draft) => {
        draft.pollFailed = true
        if (draft.status !== 'ready') {
          draft.status = 'error'
          draft.error = messageOf(error)
        }
      })
    } finally {
      pollInFlight = false
    }
  }

  return {
    state,
    selectProject: (projectPath) => {
      state.update((draft) => { draft.projectPath = projectPath })
      void run(() => api.snapshot({ projectPath }))
    },
    notify: (message) => { state.update((draft) => { draft.message = message }) },
    clearMessage: () => { state.update((draft) => { draft.message = undefined }) },
    run: operation => run(operation),
    refresh: async () => {
      await run(() => api.snapshot({ projectPath: state.getSnapshot().projectPath }))
    },
    runForm: async (operation, refusedMessage) => {
      state.update((draft) => { draft.busy = true; draft.message = undefined })
      try {
        if (!await operation()) {
          state.update((draft) => { draft.message = refusedMessage })
          return false
        }
        const responseSequence = nextSequence()
        accept(responseSequence, await api.snapshot({ projectPath: state.getSnapshot().projectPath }))
        return true
      } catch (error) {
        fail(error)
        return false
      } finally {
        state.update((draft) => { draft.busy = false })
      }
    },
    startPolling: (intervalMs = POLL_INTERVAL_MS) => {
      const controller = new AbortController()
      let timer: ReturnType<typeof setInterval> | undefined
      const visible = (): boolean => document.visibilityState === 'visible'
      const tick = (): void => { if (visible()) void read(controller.signal) }
      const start = (): void => {
        if (!visible() || timer !== undefined) return
        timer = setInterval(tick, intervalMs)
      }
      const stop = (): void => {
        if (timer === undefined) return
        clearInterval(timer)
        timer = undefined
      }
      const onVisibility = (): void => {
        stop()
        if (!visible()) return
        tick()
        start()
      }
      tick()
      start()
      document.addEventListener('visibilitychange', onVisibility)
      return () => {
        controller.abort()
        stop()
        document.removeEventListener('visibilitychange', onVisibility)
      }
    },
  }
}
