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
//# sourceMappingURL=types.js.map