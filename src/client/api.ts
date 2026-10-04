/** Typed browser wrapper over the authenticated Host Connection RPC channel. */

import type { Context } from '@deepseek-ai/cordis'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type {
  ManagerRpcEndpoint, RemoveServerRequest, ReloadServerRequest, RpcError, SetServerEnabledRequest,
  Snapshot, SnapshotRequest, UpsertServerRequest,
} from '../types.ts'
import { isRpcResult } from '../types.ts'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import { MCP_MANAGER_API_CHANNEL, MCP_MANAGER_ENDPOINT_PREFIX } from '../types.ts'

export class McpManagerRpcError extends Error {
  readonly code: RpcError['code']

  constructor(error: RpcError) {
    super(error.message)
    this.name = 'McpManagerRpcError'
    this.code = error.code
  }
}

/**
 * The manager's own RPC covers the `mcp.json` scopes and runtime status.
 *
 * The Loader-entry scope is absent here by design: it is a plugin's own
 * configuration, so the panel edits it through the official shared settings
 * form (see `./entry-form.ts`) rather than through this channel.
 */
export interface ManagerClientApi {
  snapshot(request?: SnapshotRequest, signal?: AbortSignal): Promise<Snapshot>
  upsertServer(request: UpsertServerRequest, signal?: AbortSignal): Promise<Snapshot>
  removeServer(request: RemoveServerRequest, signal?: AbortSignal): Promise<Snapshot>
  setServerEnabled(request: SetServerEnabledRequest, signal?: AbortSignal): Promise<Snapshot>
  reloadServer(request: ReloadServerRequest, signal?: AbortSignal): Promise<Snapshot>
}

export function createManagerApi(ctx: Context): ManagerClientApi {
  const rpc = ctx.get('connection').rpc as ClientConnectionRpc
  const call = async <T>(endpoint: ManagerRpcEndpoint, payload: unknown, signal?: AbortSignal): Promise<T> => {
    // The channel grammar admits a single path segment, so the manager prefix
    // rides inside the endpoint: `/api` + `mcp-manager/<endpoint>`.
    const result: unknown = await rpc.call(
      MCP_MANAGER_API_CHANNEL,
      `${MCP_MANAGER_ENDPOINT_PREFIX}/${endpoint}`,
      payload,
      signal,
    )
    if (!isRpcResult<T>(result)) throw new Error('MCP manager returned an invalid RPC response')
    if (!result.ok) throw new McpManagerRpcError(result.error)
    return result.value
  }
  return {
    snapshot: (request = {}, signal) => call<Snapshot>('snapshot', request, signal),
    upsertServer: (request, signal) => call<Snapshot>('upsertServer', request, signal),
    removeServer: (request, signal) => call<Snapshot>('removeServer', request, signal),
    setServerEnabled: (request, signal) => call<Snapshot>('setServerEnabled', request, signal),
    reloadServer: (request, signal) => call<Snapshot>('reloadServer', request, signal),
  }
}
