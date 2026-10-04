/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
/**
 * Shared channel carrying the manager's authenticated RPC.
 *
 * The manager rides the Connection service's own `/api` channel instead of
 * claiming a private prefix route:
 *
 * - The physical `/api` route is mounted by `@deepseek-ai/dsh-client-connection`
 *   itself and applies the Host/Origin fence plus browser authentication before
 *   anything reaches a handler, so this plugin never repeats that logic.
 * - `connection.rpc.handle(channel, …)` cannot be used: its `register()` mounts
 *   the physical route through `owner.webServer` where `owner` is the Connection
 *   service's own Context, which fails with `cannot get property "webServer"
 *   without inject`.
 * - `connection.rpc.intercept('/api', …)` cannot be used either: the shared
 *   channel accepts exactly one interceptor and `@deepseek-ai/dsh-api-gateway`
 *   already owns it.
 * - `connection.fetch.register()` is therefore the supported path: one exact
 *   Fetch route per endpoint, taking precedence over the interceptor.
 */
export const MCP_MANAGER_API_CHANNEL = '/api';
/** Endpoint prefix this plugin owns inside the shared channel. */
export const MCP_MANAGER_ENDPOINT_PREFIX = 'mcp-manager';
/**
 * Every manager endpoint, in registration order.
 *
 * These cover the `mcp.json` scopes and runtime status only. The legacy
 * Loader-entry scope is absent on purpose: it is a plugin's own configuration,
 * so the browser edits it through the official shared settings form
 * (`ctx.configForms`) rather than through a private protocol.
 */
export const MCP_MANAGER_ENDPOINTS = [
    'snapshot',
    'upsertServer',
    'removeServer',
    'setServerEnabled',
    'reloadServer',
];
/**
 * The Loader entry id this plugin's Host half is mounted under, which is also
 * its settings namespace. It is the key `ctx.configForms.get()` takes.
 */
export const MCP_MANAGER_NAMESPACE = 'web-mcp-manager';
/**
 * Absolute exact Fetch-route path for one endpoint.
 *
 * The browser client posts to `<channel>/<endpoint>`, its channel grammar
 * (`/^\/[A-Za-z0-9._~-]+$/`) admits a single segment only, so the channel is
 * `/api` and the endpoint string carries the `mcp-manager/` prefix.
 * @param endpoint - one manager endpoint name.
 * @returns the path registered through `connection.fetch.register()`.
 */
export function mcpManagerRoutePath(endpoint) {
    return `${MCP_MANAGER_API_CHANNEL}/${MCP_MANAGER_ENDPOINT_PREFIX}/${endpoint}`;
}
/**
 * Every place a server definition can come from, in precedence order: a later
 * entry never overrides an earlier one. `entry` is the legacy Loader-entry
 * store the plugin used before `mcp.json` support.
 */
export const MCP_SCOPES = ['project', 'profile', 'user', 'entry'];
export function isRpcResult(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const record = value;
    if (record.ok === true)
        return 'value' in record;
    if (record.ok !== false || typeof record.error !== 'object' || record.error === null)
        return false;
    const error = record.error;
    return typeof error.code === 'string' && typeof error.message === 'string';
}
/** 插件的社区注册身份(GitHub owner/repo)。 */
export const PLUGIN_IDENTITY = 'junjiangao/dsh-web-mcp-manager';
/** 插件安装后的 npm 包名 / loader 模块名(bundle 层与 patch 条目 name)。 */
export const PLUGIN_MODULE_NAME = '@junjiangao/dsh-web-mcp-manager';
/** 旧包名,仅用于已安装 profile 的过渡期识别(只读条目过滤),勿在生产路径使用。 */
export const LEGACY_PLUGIN_MODULE_NAME = 'dsh-web-mcp-manager';
//# sourceMappingURL=types.js.map