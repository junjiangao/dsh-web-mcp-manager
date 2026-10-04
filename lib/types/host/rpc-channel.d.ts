/**
 * Host transport for the manager RPC channel, built on the official
 * Connection Fetch-route registry.
 *
 * The manager registers one exact Fetch route per endpoint on the shared
 * `/api` channel. The physical `/api` prefix route is mounted by
 * `@deepseek-ai/dsh-client-connection` itself, so every request has already
 * passed the Host/Origin fence and browser authentication by the time a route
 * handler runs; this module owns only body limits, envelope validation, and
 * the response shape the browser's Connection RPC caller expects:
 * `{ type: 'client-request', rpcId, method, payload }` in,
 * `{ type: 'server-response', rpcId, result }` out.
 *
 * `connection.rpc.handle()` stays unusable (its physical route resolves
 * `owner.webServer` from the Connection service's Context, not the caller's),
 * and `connection.rpc.intercept('/api', …)` is taken by
 * `@deepseek-ai/dsh-api-gateway`; see `MCP_MANAGER_API_CHANNEL` in `../types.ts`.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';
import { type RpcResult } from '../types.ts';
/** Body cap for one manager RPC request; payloads are settings-sized, never media. */
export declare const MAX_REQUEST_BODY_BYTES: number;
/**
 * Host services the transport reads. `connection.fetch.register` never touches
 * `webServer`, so the plugin does not need that service injected at all.
 */
export interface ManagerRpcHost {
    readonly connection: {
        readonly fetch: {
            register(route: ConnectionFetchRoute): () => Promise<void>;
        };
    };
}
/** Decoded-endpoint handler invoked after the shared carrier accepted the request. */
export type ManagerRpcDispatch = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>;
/**
 * Register every manager endpoint as an exact Fetch route.
 * @param ctx - Host plugin Context carrying `connection`.
 * @param dispatch - decoded-endpoint handler.
 * @returns disposer removing all routes.
 */
export declare function registerManagerRpcRoute(ctx: Context & ManagerRpcHost, dispatch: ManagerRpcDispatch): () => Promise<void>;
//# sourceMappingURL=rpc-channel.d.ts.map