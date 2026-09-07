/** Typed browser wrapper over the authenticated Host Connection RPC channel. */
import { isRpcResult } from "../types.js";
import { MCP_MANAGER_CHANNEL } from "../types.js";
export class McpManagerRpcError extends Error {
    code;
    constructor(error) {
        super(error.message);
        this.name = 'McpManagerRpcError';
        this.code = error.code;
    }
}
export function createManagerApi(ctx) {
    const rpc = ctx.get('connection').rpc;
    const call = async (endpoint, payload, signal) => {
        const result = await rpc.call(MCP_MANAGER_CHANNEL, endpoint, payload, signal);
        if (!isRpcResult(result))
            throw new Error('MCP manager returned an invalid RPC response');
        if (!result.ok)
            throw new McpManagerRpcError(result.error);
        return result.value;
    };
    return {
        snapshot: (request = {}, signal) => call('snapshot', request, signal),
        upsertServer: (request, signal) => call('upsertServer', request, signal),
        removeServer: (request, signal) => call('removeServer', request, signal),
        setServerEnabled: (request, signal) => call('setServerEnabled', request, signal),
        reloadServer: (request, signal) => call('reloadServer', request, signal),
        setToolEnabled: (request, signal) => call('setToolEnabled', request, signal),
    };
}
//# sourceMappingURL=api.js.map