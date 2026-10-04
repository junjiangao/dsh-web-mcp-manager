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
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { Snapshot } from '../types.ts';
import type { ManagerClientApi } from './api.ts';
/**
 * Everything the page renders, plus the state its operations own.
 *
 * The fields are mutable because `SnapshotStore.update` hands the mutator this
 * exact type; the store freezes every published snapshot, so nothing outside a
 * mutator can actually write one.
 */
export interface ManagerView {
    /** `loading` until the first answer, `error` when none ever arrived. */
    status: 'loading' | 'ready' | 'error';
    /** The last accepted snapshot; undefined until the first one. */
    snapshot: Snapshot | undefined;
    /** The first read's failure, while no snapshot stands. */
    error: string | undefined;
    /** A background read failed; a standing snapshot keeps serving. */
    pollFailed: boolean;
    /** A user operation is crossing the wire. */
    busy: boolean;
    /** The last operation's refusal or failure, until the next operation. */
    message: string | undefined;
    /** Registered workspace root the project scope is read and written against. */
    projectPath: string | undefined;
}
export interface ManagerStore {
    /** The official snapshot store the component subscribes to. */
    readonly state: SnapshotStore<ManagerView>;
    /** Root the project scope at another workspace and re-read. */
    selectProject: (projectPath: string | undefined) => void;
    /** Show one message the store did not derive from a request. */
    notify: (message: string) => void;
    /** Dismiss the current action message. */
    clearMessage: () => void;
    /** Run one RPC operation whose answer IS the next snapshot. */
    run: (operation: () => Promise<Snapshot>) => Promise<Snapshot | undefined>;
    /** Re-read the Host as a user action (the refresh control). */
    refresh: () => Promise<void>;
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
    runForm: (operation: () => Promise<boolean>, refusedMessage: string) => Promise<boolean>;
    /**
     * Read once and keep reading while the document is visible.
     * @param intervalMs - poll period; the default is production's.
     * @returns the stopper.
     */
    startPolling: (intervalMs?: number) => () => void;
}
export declare function createManagerStore(api: ManagerClientApi): ManagerStore;
//# sourceMappingURL=manager-store.d.ts.map