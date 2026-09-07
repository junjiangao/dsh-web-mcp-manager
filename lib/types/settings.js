/** Host settings schema and defaults for the MCP manager namespace. */
import z from '@deepseek-ai/schemastery';
export const MANAGER_NAMESPACE = 'web-mcp-manager';
export const DEFAULT_RECONNECT = Object.freeze({
    enabled: true,
    initialDelayMs: 500,
    maxDelayMs: 30_000,
    maxAttempts: 10,
});
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const ReconnectSchema = z.object({
    enabled: z.boolean().default(DEFAULT_RECONNECT.enabled),
    initialDelayMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RECONNECT.initialDelayMs),
    maxDelayMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RECONNECT.maxDelayMs),
    maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_RECONNECT.maxAttempts),
});
/**
 * Secret values sit below a dictionary node rather than inside a union. This
 * lets the Host settings redactor enumerate every env/header key while the
 * browser receives only `SecretState` records assembled by the manager.
 */
const ServerSchema = z.object({
    id: z.string().required(),
    label: z.string().default(''),
    enabled: z.boolean().default(true),
    transport: z.union(['stdio', 'streamable-http']).default('stdio'),
    command: z.string().default(''),
    args: z.array(z.string()).default([]),
    cwd: z.string().default(''),
    url: z.string().default(''),
    env: z.dict(z.string().role('secret')).default({}),
    headers: z.dict(z.string().role('secret')).default({}),
    toolCallTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    reconnect: ReconnectSchema,
});
export const ManagerSettingsSchema = z.object({
    servers: z.dict(ServerSchema).default({}),
    disabledTools: z.dict(z.array(z.string())).default({}),
});
export function defaultServer(id) {
    return {
        id,
        label: '',
        enabled: true,
        transport: 'stdio',
        command: '',
        args: [],
        cwd: '',
        url: '',
        env: {},
        headers: {},
        toolCallTimeoutMs: DEFAULT_TOOL_CALL_TIMEOUT_MS,
        reconnect: { ...DEFAULT_RECONNECT },
    };
}
export function defaultDocument() {
    return { servers: {}, disabledTools: {} };
}
export function validateStoredDocument(value) {
    for (const [key, server] of Object.entries(value.servers)) {
        validateServerId(key);
        if (server.id !== key)
            throw new Error(`MCP server id ${JSON.stringify(server.id)} does not match its settings key ${JSON.stringify(key)}`);
        validateServerConfig(server);
    }
    for (const [id, tools] of Object.entries(value.disabledTools)) {
        validateServerId(id);
        if (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string' || tool.length === 0)) {
            throw new Error(`disabledTools[${JSON.stringify(id)}] must be a list of tool names`);
        }
    }
}
export function validateServerId(id) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
        throw new TypeError('server id must match [A-Za-z0-9_-]{1,32}');
    }
}
export function validateServerConfig(server) {
    validateServerId(server.id);
    if (server.label.length > 120)
        throw new Error('server label must be at most 120 characters');
    if (server.transport === 'stdio') {
        if (server.command.trim() === '')
            throw new Error(`stdio server ${JSON.stringify(server.id)} needs a command`);
    }
    else {
        if (server.url.trim() === '')
            throw new Error(`streamable-http server ${JSON.stringify(server.id)} needs a URL`);
        let url;
        try {
            url = new URL(server.url);
        }
        catch {
            throw new Error(`streamable-http server ${JSON.stringify(server.id)} has an invalid URL`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error(`streamable-http server ${JSON.stringify(server.id)} URL must use http or https`);
        }
    }
    if (!Number.isSafeInteger(server.toolCallTimeoutMs) || server.toolCallTimeoutMs < 1 || server.toolCallTimeoutMs > MAX_TIMER_DELAY_MS) {
        throw new Error(`server ${JSON.stringify(server.id)} toolCallTimeoutMs must be an integer from 1 to ${String(MAX_TIMER_DELAY_MS)}`);
    }
    validateReconnect(server.reconnect);
    for (const [key, value] of Object.entries(server.env)) {
        if (key.trim() === '')
            throw new Error(`server ${JSON.stringify(server.id)} contains an empty environment key`);
        if (typeof value !== 'string')
            throw new Error(`server ${JSON.stringify(server.id)} environment values must be strings`);
    }
    for (const [key, value] of Object.entries(server.headers)) {
        if (key.trim() === '')
            throw new Error(`server ${JSON.stringify(server.id)} contains an empty header key`);
        if (typeof value !== 'string')
            throw new Error(`server ${JSON.stringify(server.id)} header values must be strings`);
    }
}
export function validateReconnect(value) {
    if (!Number.isSafeInteger(value.initialDelayMs) || value.initialDelayMs < 1 || value.initialDelayMs > MAX_TIMER_DELAY_MS) {
        throw new Error(`reconnect.initialDelayMs must be an integer from 1 to ${String(MAX_TIMER_DELAY_MS)}`);
    }
    if (!Number.isSafeInteger(value.maxDelayMs) || value.maxDelayMs < value.initialDelayMs || value.maxDelayMs > MAX_TIMER_DELAY_MS) {
        throw new Error(`reconnect.maxDelayMs must be >= initialDelayMs and at most ${String(MAX_TIMER_DELAY_MS)}`);
    }
    if (!Number.isSafeInteger(value.maxAttempts) || value.maxAttempts < 1)
        throw new Error('reconnect.maxAttempts must be a positive integer');
}
export function transportOf(value) {
    if (value === 'stdio' || value === 'streamable-http')
        return value;
    throw new Error(`unsupported MCP transport ${JSON.stringify(value)}`);
}
//# sourceMappingURL=settings.js.map