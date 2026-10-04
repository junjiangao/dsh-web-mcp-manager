/**
 * `mcp.json` parsing, normalization, and round-trip-preserving writes.
 *
 * The on-disk shape follows the de-facto ecosystem format (Claude Code, Codex,
 * pi, VS Code): a top-level `mcpServers` object keyed by server name. Reads are
 * deliberately wider than writes — VS Code's `servers` alias and `http` /
 * `streamableHttp` transport spellings are accepted — so a file another client
 * wrote can be adopted without rewriting it. Writes are strict and preserve
 * every field this plugin does not own, which is what makes sharing one file
 * with other tools safe.
 *
 * This module is pure: no filesystem, no Cordis. `./mcp-file.ts` owns I/O.
 */
import { DEFAULT_RECONNECT, DEFAULT_TOOL_CALL_TIMEOUT_MS, defaultServer, validateServerId, } from "../settings.js";
/** Primary top-level key holding the server map. */
export const MCP_SERVERS_KEY = 'mcpServers';
/** VS Code's alias for the same map; read-only. */
export const MCP_SERVERS_ALIAS_KEY = 'servers';
/** Keys this plugin owns inside one server entry; everything else round-trips. */
const OWNED_SERVER_KEYS = [
    'type', 'command', 'args', 'env', 'environment', 'cwd', 'url', 'headers',
    'toolCallTimeoutMs', 'reconnect', 'enabled', 'disabled', 'sensitive',
    'envSensitive', 'headerSensitive', 'disabledTools',
];
/**
 * Parse one `mcp.json` text.
 * @param text - file content.
 * @returns the document, or a human-readable failure for the panel.
 */
export function parseMcpJson(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (error) {
        return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!isRecord(value))
        return { ok: false, error: 'the document root must be a JSON object' };
    const warnings = [];
    const hasPrimary = isRecord(value[MCP_SERVERS_KEY]);
    const hasAlias = isRecord(value[MCP_SERVERS_ALIAS_KEY]);
    if (value[MCP_SERVERS_KEY] !== undefined && !hasPrimary)
        warnings.push(`"${MCP_SERVERS_KEY}" must be an object`);
    if (value[MCP_SERVERS_ALIAS_KEY] !== undefined && !hasAlias)
        warnings.push(`"${MCP_SERVERS_ALIAS_KEY}" must be an object`);
    if (hasPrimary && hasAlias)
        warnings.push(`both "${MCP_SERVERS_KEY}" and "${MCP_SERVERS_ALIAS_KEY}" are present; "${MCP_SERVERS_KEY}" wins`);
    const serversKey = hasPrimary ? MCP_SERVERS_KEY : MCP_SERVERS_ALIAS_KEY;
    const servers = hasPrimary
        ? value[MCP_SERVERS_KEY]
        : hasAlias ? value[MCP_SERVERS_ALIAS_KEY] : {};
    return { ok: true, document: { root: value, servers, serversKey }, warnings };
}
/**
 * Render a document back to disk text.
 *
 * The server map is written under the key it was read from, so a file another
 * client wrote with VS Code's `servers` alias is not silently restructured. The
 * map is written last for a stable field order; two-space indentation and a
 * trailing newline match what the other clients in the ecosystem produce.
 * @param document - the document to render.
 * @returns the exact file text.
 */
export function serializeMcpJson(document) {
    const root = { ...document.root };
    Reflect.deleteProperty(root, MCP_SERVERS_KEY);
    Reflect.deleteProperty(root, MCP_SERVERS_ALIAS_KEY);
    return `${JSON.stringify({ ...root, [document.serversKey]: document.servers }, null, 2)}\n`;
}
/**
 * Replace, add, or remove one server in a document.
 * @param document - the parsed document.
 * @param id - server name.
 * @param server - the stored server to write, or `null` to remove it.
 * @returns a new document; the input is not mutated.
 */
export function withServer(document, id, server) {
    const servers = { ...document.servers };
    if (server === null)
        Reflect.deleteProperty(servers, id);
    else
        servers[id] = applyServerToRaw(servers[id], id, server);
    return { ...document, servers };
}
/** An empty document, for creating a file that does not exist yet. */
export function emptyDocument() {
    return { root: {}, servers: {}, serversKey: MCP_SERVERS_KEY };
}
/** Whether an unknown value is a plain JSON object. */
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Normalize one raw `mcp.json` entry into the manager's stored shape.
 *
 * Only the fields the panel edits are normalized; validation of the resulting
 * server (transport requirements, timer bounds, the `dsh-mcp-client` schema) is
 * the caller's, so this stays a pure shape mapping.
 * @param id - the key the entry is stored under; it becomes the server id.
 * @param raw - the raw entry value.
 * @returns the stored server, or a failure naming the offending field.
 */
export function normalizeServer(id, raw) {
    try {
        validateServerId(id);
    }
    catch {
        return { ok: false, error: 'server name must match [-A-Za-z0-9_]{1,32}' };
    }
    if (!isRecord(raw))
        return { ok: false, error: 'the server entry must be an object' };
    const server = defaultServer(id);
    const label = raw.label;
    if (label !== undefined) {
        if (typeof label !== 'string')
            return { ok: false, error: '"label" must be a string' };
        server.label = label;
    }
    else {
        server.label = id;
    }
    const disabled = raw.disabled;
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean')
        return { ok: false, error: '"enabled" must be a boolean' };
    if (disabled !== undefined && typeof disabled !== 'boolean')
        return { ok: false, error: '"disabled" must be a boolean' };
    server.enabled = typeof raw.enabled === 'boolean' ? raw.enabled : disabled === true ? false : true;
    const type = raw.type;
    if (type !== undefined && typeof type !== 'string')
        return { ok: false, error: '"type" must be a string' };
    const transport = transportOfJson(type, raw.url !== undefined);
    if (transport === undefined) {
        return { ok: false, error: `unsupported transport ${JSON.stringify(type)}: dsh-mcp-client supports "stdio" and "streamable-http" only` };
    }
    server.transport = transport;
    const env = readStringMap(raw.env ?? raw.environment, 'env');
    if (!env.ok)
        return env;
    const headers = readStringMap(raw.headers, 'headers');
    if (!headers.ok)
        return headers;
    server.env = env.values;
    server.headers = headers.values;
    if (server.transport === 'stdio') {
        if (typeof raw.command !== 'string' || raw.command.trim() === '') {
            return { ok: false, error: 'a stdio server needs a non-empty "command"' };
        }
        server.command = raw.command;
        const args = raw.args;
        if (args !== undefined && (!Array.isArray(args) || args.some(entry => typeof entry !== 'string'))) {
            return { ok: false, error: '"args" must be an array of strings' };
        }
        server.args = args === undefined ? [] : [...args];
        if (raw.cwd !== undefined && typeof raw.cwd !== 'string')
            return { ok: false, error: '"cwd" must be a string' };
        server.cwd = typeof raw.cwd === 'string' ? raw.cwd : '';
    }
    else {
        if (typeof raw.url !== 'string' || raw.url.trim() === '') {
            return { ok: false, error: 'an http server needs a non-empty "url"' };
        }
        server.url = raw.url;
    }
    if (raw.toolCallTimeoutMs !== undefined) {
        const timeout = raw.toolCallTimeoutMs;
        if (typeof timeout !== 'number' || !Number.isSafeInteger(timeout) || timeout < 1) {
            return { ok: false, error: '"toolCallTimeoutMs" must be a positive integer' };
        }
        server.toolCallTimeoutMs = timeout;
    }
    if (raw.reconnect !== undefined) {
        if (!isRecord(raw.reconnect))
            return { ok: false, error: '"reconnect" must be an object' };
        const reconnect = { ...DEFAULT_RECONNECT };
        for (const key of ['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
            const value = raw.reconnect[key];
            if (value === undefined)
                continue;
            if (key === 'enabled') {
                if (typeof value !== 'boolean')
                    return { ok: false, error: '"reconnect.enabled" must be a boolean' };
                reconnect.enabled = value;
                continue;
            }
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
                return { ok: false, error: `"reconnect.${key}" must be a positive integer` };
            }
            reconnect[key] = value;
        }
        server.reconnect = reconnect;
    }
    const sensitive = readSensitive(raw);
    if (!sensitive.ok)
        return sensitive;
    server.envSensitive = [...sensitive.env];
    server.headerSensitive = [...sensitive.headers];
    return { ok: true, server };
}
/**
 * Map an `mcp.json` `type` onto a supported transport.
 *
 * `undefined` infers from the presence of `url`, which is how several clients
 * omit `type` for stdio entries.
 * @param type - the declared type, when present.
 * @param hasUrl - whether the entry carries a `url`.
 * @returns the transport, or `undefined` for an unsupported one (`sse`).
 */
export function transportOfJson(type, hasUrl) {
    if (type === undefined)
        return hasUrl ? 'streamable-http' : 'stdio';
    const normalized = type.trim().toLowerCase().replace(/[_-]/gu, '');
    if (normalized === 'stdio')
        return 'stdio';
    if (normalized === 'http' || normalized === 'streamablehttp' || normalized === 'streamable')
        return 'streamable-http';
    return undefined;
}
/**
 * Project one stored server back into its raw `mcp.json` entry.
 *
 * Defaults are omitted so a file stays readable and diff-friendly: only
 * `type`/`command`/`url` and the fields that differ from the defaults appear.
 * @param server - the stored server.
 * @returns the raw entry to persist.
 */
export function serverToRaw(server) {
    const raw = { type: server.transport === 'stdio' ? 'stdio' : 'http' };
    if (server.label !== '' && server.label !== server.id)
        raw.label = server.label;
    if (!server.enabled)
        raw.enabled = false;
    if (server.transport === 'stdio') {
        raw.command = server.command;
        raw.args = [...server.args];
        if (server.cwd !== '')
            raw.cwd = server.cwd;
    }
    else {
        raw.url = server.url;
    }
    if (Object.keys(server.env).length > 0)
        raw.env = { ...server.env };
    if (Object.keys(server.headers).length > 0)
        raw.headers = { ...server.headers };
    if (server.toolCallTimeoutMs !== DEFAULT_TOOL_CALL_TIMEOUT_MS)
        raw.toolCallTimeoutMs = server.toolCallTimeoutMs;
    if (!sameReconnect(server.reconnect))
        raw.reconnect = { ...server.reconnect };
    if (server.envSensitive.length > 0 || server.headerSensitive.length > 0) {
        raw.sensitive = {
            ...server.envSensitive.length > 0 ? { env: [...server.envSensitive] } : {},
            ...server.headerSensitive.length > 0 ? { headers: [...server.headerSensitive] } : {},
        };
    }
    return raw;
}
/**
 * Merge a new stored server into an existing raw entry, preserving foreign keys.
 * @param existing - the raw entry currently on disk, when present.
 * @param id - server name.
 * @param next - the stored server to write.
 * @returns the raw entry to persist.
 */
export function applyServerToRaw(existing, id, next) {
    const merged = isRecord(existing) ? { ...existing } : {};
    for (const key of OWNED_SERVER_KEYS)
        Reflect.deleteProperty(merged, key);
    return { ...merged, ...serverToRaw({ ...next, id }) };
}
function sameReconnect(server) {
    return server.enabled === DEFAULT_RECONNECT.enabled
        && server.initialDelayMs === DEFAULT_RECONNECT.initialDelayMs
        && server.maxDelayMs === DEFAULT_RECONNECT.maxDelayMs
        && server.maxAttempts === DEFAULT_RECONNECT.maxAttempts;
}
function readStringMap(value, field) {
    if (value === undefined)
        return { ok: true, values: {} };
    if (!isRecord(value))
        return { ok: false, error: `"${field}" must be an object of strings` };
    const values = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string')
            return { ok: false, error: `"${field}.${key}" must be a string` };
        values[key] = entry;
    }
    return { ok: true, values };
}
function readSensitive(raw) {
    const nested = isRecord(raw.sensitive) ? raw.sensitive : {};
    const env = raw.envSensitive ?? nested.env;
    const headers = raw.headerSensitive ?? nested.headers;
    const read = (value, field) => {
        if (value === undefined)
            return [];
        if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string'))
            return `"${field}" must be an array of strings`;
        return [...value];
    };
    const envValue = read(env, 'sensitive.env');
    if (typeof envValue === 'string')
        return { ok: false, error: envValue };
    const headerValue = read(headers, 'sensitive.headers');
    if (typeof headerValue === 'string')
        return { ok: false, error: headerValue };
    return { ok: true, env: envValue, headers: headerValue };
}
//# sourceMappingURL=mcp-json.js.map