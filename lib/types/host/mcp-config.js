/**
 * Adapter between the manager's `StoredServer` shape and the
 * `@deepseek-ai/dsh-mcp-client` plugin Config, plus schema-backed validation.
 */
import { Config as McpConfig } from '@deepseek-ai/dsh-mcp-client';
/** Project one stored server into the mcp-client plugin Config. */
export function toMcpConfig(server) {
    const reconnect = { ...server.reconnect };
    if (server.transport === 'stdio') {
        return {
            transport: 'stdio',
            serverName: server.id,
            command: server.command,
            args: [...server.args],
            cwd: server.cwd,
            env: { ...server.env },
            toolCallTimeoutMs: server.toolCallTimeoutMs,
            failOnStartupError: true,
            reconnect,
        };
    }
    return {
        transport: 'streamable-http',
        serverName: server.id,
        url: server.url,
        headers: { ...server.headers },
        toolCallTimeoutMs: server.toolCallTimeoutMs,
        failOnStartupError: true,
        reconnect,
    };
}
/** 用 mcp-client 的 Config schema 校验并归一化单服务配置;失败抛带 code 的 Error。 */
export function validateMcpConfig(server) {
    try {
        McpConfig(toMcpConfig(server));
    }
    catch (error) {
        const message = `MCP configuration is invalid: ${error instanceof Error ? error.message : String(error)}`;
        throw Object.assign(new Error(message), { code: 'MCP_CONFIG_VALIDATION' });
    }
    return server;
}
//# sourceMappingURL=mcp-config.js.map