/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
export const MCP_MANAGER_CHANNEL = '/mcp-manager';
export const MCP_MANAGER_SETTINGS_NAMESPACE = 'web-mcp-manager';
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