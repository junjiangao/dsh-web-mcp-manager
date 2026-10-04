/** Typed browser wrapper over the authenticated Host Connection RPC channel. */
import type { Context } from '@deepseek-ai/cordis';
import type { RemoveServerRequest, ReloadServerRequest, RpcError, SetServerEnabledRequest, Snapshot, SnapshotRequest, UpsertServerRequest } from '../types.ts';
export declare class McpManagerRpcError extends Error {
    readonly code: RpcError['code'];
    constructor(error: RpcError);
}
/**
 * The manager's own RPC covers the `mcp.json` scopes and runtime status.
 *
 * The Loader-entry scope is absent here by design: it is a plugin's own
 * configuration, so the panel edits it through the official shared settings
 * form (see `./entry-form.ts`) rather than through this channel.
 */
export interface ManagerClientApi {
    snapshot(request?: SnapshotRequest, signal?: AbortSignal): Promise<Snapshot>;
    upsertServer(request: UpsertServerRequest, signal?: AbortSignal): Promise<Snapshot>;
    removeServer(request: RemoveServerRequest, signal?: AbortSignal): Promise<Snapshot>;
    setServerEnabled(request: SetServerEnabledRequest, signal?: AbortSignal): Promise<Snapshot>;
    reloadServer(request: ReloadServerRequest, signal?: AbortSignal): Promise<Snapshot>;
}
export declare function createManagerApi(ctx: Context): ManagerClientApi;
//# sourceMappingURL=api.d.ts.map