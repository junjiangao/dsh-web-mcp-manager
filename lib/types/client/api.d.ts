/** Typed browser wrapper over the authenticated Host Connection RPC channel. */
import type { Context } from '@deepseek-ai/cordis';
import type { RemoveServerRequest, ReloadServerRequest, RpcError, SetServerEnabledRequest, SetToolEnabledRequest, Snapshot, SnapshotRequest, UpsertServerRequest } from '../types.ts';
export declare class McpManagerRpcError extends Error {
    readonly code: RpcError['code'];
    constructor(error: RpcError);
}
export interface ManagerClientApi {
    snapshot(request?: SnapshotRequest, signal?: AbortSignal): Promise<Snapshot>;
    upsertServer(request: UpsertServerRequest, signal?: AbortSignal): Promise<Snapshot>;
    removeServer(request: RemoveServerRequest, signal?: AbortSignal): Promise<Snapshot>;
    setServerEnabled(request: SetServerEnabledRequest, signal?: AbortSignal): Promise<Snapshot>;
    reloadServer(request: ReloadServerRequest, signal?: AbortSignal): Promise<Snapshot>;
    setToolEnabled(request: SetToolEnabledRequest, signal?: AbortSignal): Promise<Snapshot>;
}
export declare function createManagerApi(ctx: Context): ManagerClientApi;
//# sourceMappingURL=api.d.ts.map