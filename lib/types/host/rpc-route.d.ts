/**
 * Host HTTP transport for the manager RPC channel.
 *
 * The manager deliberately does NOT call `connection.rpc.handle()`.  That API
 * mounts its physical route with `owner.effect(() => owner.webServer.register(route))`,
 * where `owner` is `this.ctx` read inside the Connection service getter.  The
 * Cordis traceable proxy rebinds `this.ctx` to an extension of the caller, but
 * the resulting shadow's origin is the *service* Context, so `owner.webServer`
 * walks the fiber tree from the Connection fiber — not from the caller fiber.
 * In the shipped Web profile `webServer` is provided by a sibling loader entry,
 * that walk reaches the root, and the whole profile dies at load time with
 * `cannot get property "webServer" without inject`.
 *
 * Registering directly on the injected `webServer` is what the shipped Web
 * plugins do (frontend-static, open-in-app, the Gateway upgrade route).  It keeps
 * the browser-side `connection.rpc.call()` envelope untouched and applies
 * Connection's own Host/Origin + browser-auth fence through
 * `connection.requestRejection()`.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionTrustRequest } from '@deepseek-ai/dsh-client-connection';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { RpcResult } from '../types.ts';
/** Body cap for one manager RPC request; payloads are settings-sized, never media. */
export declare const MAX_REQUEST_BODY_BYTES: number;
/** Host services the transport reads; both are declared in the plugin inject set. */
export interface ManagerRpcHost {
    readonly connection: {
        requestRejection(request: ConnectionTrustRequest): 401 | 403 | undefined;
    };
    readonly webServer: {
        register(route: WebRoute): () => void;
    };
}
/** Decoded-endpoint handler invoked after the fence accepted the request. */
export type ManagerRpcDispatch = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>;
/**
 * Register the manager channel as an authenticated prefix route.
 * @param ctx - Host plugin Context carrying `webServer` and `connection`.
 * @param channel - absolute channel prefix, e.g. `/mcp-manager`.
 * @param dispatch - decoded-endpoint handler.
 * @returns disposer removing the route.
 */
export declare function registerManagerRpcRoute(ctx: Context & ManagerRpcHost, channel: string, dispatch: ManagerRpcDispatch): () => Promise<void>;
//# sourceMappingURL=rpc-route.d.ts.map