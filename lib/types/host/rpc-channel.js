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
import { MCP_MANAGER_ENDPOINTS, mcpManagerRoutePath, } from "../types.js";
/** Body cap for one manager RPC request; payloads are settings-sized, never media. */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;
/**
 * Register every manager endpoint as an exact Fetch route.
 * @param ctx - Host plugin Context carrying `connection`.
 * @param dispatch - decoded-endpoint handler.
 * @returns disposer removing all routes.
 */
export function registerManagerRpcRoute(ctx, dispatch) {
    const disposers = MCP_MANAGER_ENDPOINTS.map(endpoint => ctx.effect(() => ctx.connection.fetch.register(managerRoute(endpoint, dispatch)), `web-mcp-manager: ${mcpManagerRoutePath(endpoint)} route`));
    // The official disposer mirrors the old route teardown: async, and safe to
    // call once after the plugin fiber is already unloading.
    return async () => { await Promise.all(disposers.map(dispose => Promise.resolve(dispose()))); };
}
function managerRoute(endpoint, dispatch) {
    return {
        path: mcpManagerRoutePath(endpoint),
        // Other methods fall through the shared channel and end as the Gateway's
        // 404 instead: an exact route only declares the methods it answers.
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: request => handleRequest(endpoint, dispatch, request),
    };
}
/**
 * Validate one browser envelope, dispatch it, and frame the answer.
 *
 * The Connection bridge caps a buffered body at the carrier's configured
 * `maxRequestBodyBytes` (300 MiB by default), far above any settings payload,
 * so the manager enforces its own 2 MiB ceiling here — declared length first,
 * then the decoded body.
 */
async function handleRequest(endpoint, dispatch, request) {
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        return plain(415);
    }
    const declaredLength = request.headers.get('content-length');
    if (declaredLength !== null && Number(declaredLength) > MAX_REQUEST_BODY_BYTES)
        return plain(413);
    let text;
    try {
        text = await request.text();
    }
    catch {
        return plain(400);
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BODY_BYTES)
        return plain(413);
    let envelope;
    try {
        envelope = JSON.parse(text);
    }
    catch {
        return plain(400);
    }
    const parsed = parseClientRequest(envelope);
    if (parsed === undefined)
        return plain(400);
    let result;
    try {
        result = await dispatch(endpoint, parsed.payload, request.signal);
    }
    catch (error) {
        result = {
            ok: false,
            error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} },
        };
    }
    const response = {
        type: 'server-response',
        rpcId: parsed.rpcId,
        result: result.ok ? result : { ok: false, error: { ...result.error, details: result.error.details ?? {} } },
    };
    return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}
/** Validate the browser envelope `{ type, rpcId, method, payload }` before dispatch. */
function parseClientRequest(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || record.rpcId.length === 0)
        return undefined;
    if (record.rpcId.length > 256)
        return undefined;
    return { rpcId: record.rpcId, payload: record.payload };
}
function plain(status) {
    return new Response(null, { status });
}
//# sourceMappingURL=rpc-channel.js.map