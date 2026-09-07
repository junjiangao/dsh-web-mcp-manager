/** Runtime validation and redacted projections for the manager RPC. */
import { defaultServer, DEFAULT_RECONNECT, DEFAULT_TOOL_CALL_TIMEOUT_MS, transportOf, validateReconnect, validateServerConfig, validateServerId } from "./settings.js";
const MAX_LABEL_LENGTH = 120;
const MAX_ARGUMENTS = 128;
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function asRecord(value, message) {
    if (!isRecord(value))
        throw new TypeError(message);
    return value;
}
export function asString(value, field) {
    if (typeof value !== 'string')
        throw new TypeError(`${field} must be a string`);
    return value;
}
export function asBoolean(value, field) {
    if (typeof value !== 'boolean')
        throw new TypeError(`${field} must be a boolean`);
    return value;
}
export function asRevision(value, field = 'expectedRevision') {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new TypeError(`${field} must be a non-negative integer`);
    return value;
}
export function asOptionalRevision(value) {
    return value === undefined ? undefined : asRevision(value);
}
export function parseSnapshotRequest(value) {
    const record = asRecord(value ?? {}, 'snapshot payload must be an object');
    if (record.expectedRevision === undefined)
        return {};
    return { expectedRevision: asRevision(record.expectedRevision) };
}
export function parseIdRequest(value) {
    const record = asRecord(value, 'request payload must be an object');
    const id = asString(record.id, 'id');
    validateServerId(id);
    return {
        id,
        ...record.expectedRevision === undefined ? {} : { expectedRevision: asRevision(record.expectedRevision) },
    };
}
export function parseSetEnabledRequest(value) {
    const record = asRecord(value, 'setServerEnabled payload must be an object');
    const base = parseIdRequest(record);
    if (base.expectedRevision === undefined)
        throw new TypeError('expectedRevision is required');
    return { id: base.id, enabled: asBoolean(record.enabled, 'enabled'), expectedRevision: base.expectedRevision };
}
export function parseReloadRequest(value) {
    const record = asRecord(value, 'reloadServer payload must be an object');
    const id = asString(record.id, 'id');
    validateServerId(id);
    return { id };
}
export function parseUpsertRequest(value) {
    const record = asRecord(value, 'upsertServer payload must be an object');
    const expectedRevision = asRevision(record.expectedRevision);
    const server = parseServerPatch(record.server);
    return { server, expectedRevision };
}
export function parseToolRequest(value) {
    const record = asRecord(value, 'setToolEnabled payload must be an object');
    const serverId = asString(record.serverId, 'serverId');
    validateServerId(serverId);
    const name = asString(record.name, 'name');
    if (name.length === 0 || name.length > 128)
        throw new TypeError('name must be 1 to 128 characters');
    return {
        serverId,
        name,
        enabled: asBoolean(record.enabled, 'enabled'),
        expectedRevision: asRevision(record.expectedRevision),
    };
}
function parseStringArray(value, field) {
    if (!Array.isArray(value) || value.length > MAX_ARGUMENTS || value.some(entry => typeof entry !== 'string')) {
        throw new TypeError(`${field} must be an array of at most ${MAX_ARGUMENTS} strings`);
    }
    return [...value];
}
function parseSecretMap(value, field) {
    const record = asRecord(value, `${field} must be an object`);
    const result = {};
    for (const [key, entry] of Object.entries(record)) {
        if (key.trim() === '' || key.length > 256)
            throw new TypeError(`${field} contains an invalid key`);
        if (typeof entry === 'string') {
            setOwn(result, key, entry);
            continue;
        }
        const patch = asRecord(entry, `${field}.${key} must be a string or secret patch`);
        if (patch.clear !== undefined && typeof patch.clear !== 'boolean')
            throw new TypeError(`${field}.${key}.clear must be a boolean`);
        if (patch.value !== undefined && typeof patch.value !== 'string')
            throw new TypeError(`${field}.${key}.value must be a string`);
        if (patch.clear !== true && patch.value === undefined)
            throw new TypeError(`${field}.${key} must set value or clear it`);
        setOwn(result, key, {
            ...patch.value === undefined ? {} : { value: patch.value },
            ...patch.clear === undefined ? {} : { clear: patch.clear },
        });
    }
    return result;
}
function parseReconnect(value) {
    const record = asRecord(value, 'reconnect must be an object');
    const result = {};
    if (record.enabled !== undefined)
        result.enabled = asBoolean(record.enabled, 'reconnect.enabled');
    for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
        if (record[key] !== undefined) {
            if (!Number.isSafeInteger(record[key]) || record[key] < 1)
                throw new TypeError(`reconnect.${key} must be a positive integer`);
            result[key] = record[key];
        }
    }
    if (result.initialDelayMs !== undefined && result.maxDelayMs !== undefined)
        validateReconnect({ ...DEFAULT_RECONNECT, ...result });
    return result;
}
function parseServerPatch(value) {
    const record = asRecord(value, 'server must be an object');
    const id = asString(record.id, 'server.id');
    validateServerId(id);
    const result = {
        id,
        ...record.label === undefined ? {} : { label: asString(record.label, 'server.label') },
        ...record.enabled === undefined ? {} : { enabled: asBoolean(record.enabled, 'server.enabled') },
        ...record.transport === undefined ? {} : { transport: transportOf(asString(record.transport, 'server.transport')) },
        ...record.command === undefined ? {} : { command: asString(record.command, 'server.command') },
        ...record.args === undefined ? {} : { args: parseStringArray(record.args, 'server.args') },
        ...record.cwd === undefined ? {} : { cwd: asString(record.cwd, 'server.cwd') },
        ...record.url === undefined ? {} : { url: asString(record.url, 'server.url') },
        ...record.env === undefined ? {} : { env: parseSecretMap(record.env, 'server.env') },
        ...record.headers === undefined ? {} : { headers: parseSecretMap(record.headers, 'server.headers') },
        ...record.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: asPositiveInteger(record.toolCallTimeoutMs, 'server.toolCallTimeoutMs') },
        ...record.reconnect === undefined ? {} : { reconnect: parseReconnect(record.reconnect) },
    };
    if (result.label !== undefined && result.label.length > MAX_LABEL_LENGTH)
        throw new TypeError(`server.label must be at most ${MAX_LABEL_LENGTH} characters`);
    return result;
}
function asPositiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value < 1)
        throw new TypeError(`${field} must be a positive integer`);
    return value;
}
export function mergeSecretMap(current, patch) {
    const result = {};
    for (const [key, value] of Object.entries(current))
        setOwn(result, key, value);
    if (patch === undefined)
        return result;
    for (const [key, input] of Object.entries(patch)) {
        if (typeof input === 'string') {
            setOwn(result, key, input);
            continue;
        }
        if (input.clear === true) {
            Reflect.deleteProperty(result, key);
            continue;
        }
        if (input.value !== undefined)
            setOwn(result, key, input.value);
    }
    return result;
}
function setOwn(record, key, value) {
    Object.defineProperty(record, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
}
export function mergeServerPatch(current, patch) {
    const base = current === undefined ? defaultServer(patch.id) : cloneServer(current);
    const next = {
        ...base,
        ...patch.label === undefined ? {} : { label: patch.label },
        ...patch.enabled === undefined ? {} : { enabled: patch.enabled },
        ...patch.transport === undefined ? {} : { transport: patch.transport },
        ...patch.command === undefined ? {} : { command: patch.command },
        ...patch.args === undefined ? {} : { args: [...patch.args] },
        ...patch.cwd === undefined ? {} : { cwd: patch.cwd },
        ...patch.url === undefined ? {} : { url: patch.url },
        ...patch.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: patch.toolCallTimeoutMs },
        env: mergeSecretMap(base.env, patch.env),
        headers: mergeSecretMap(base.headers, patch.headers),
        reconnect: { ...base.reconnect, ...patch.reconnect },
    };
    validateServerConfig(next);
    return next;
}
export function cloneServer(server) {
    return {
        ...server,
        args: [...server.args],
        env: { ...server.env },
        headers: { ...server.headers },
        reconnect: { ...server.reconnect },
    };
}
export function redactServer(server, status, toolCount, error) {
    return {
        id: server.id,
        label: server.label || server.id,
        enabled: server.enabled,
        transport: server.transport,
        command: server.command,
        args: [...server.args],
        cwd: server.cwd,
        url: server.url,
        env: Object.fromEntries(Object.keys(server.env).sort().map(key => [key, { set: true }])),
        headers: Object.fromEntries(Object.keys(server.headers).sort().map(key => [key, { set: true }])),
        toolCallTimeoutMs: server.toolCallTimeoutMs || DEFAULT_TOOL_CALL_TIMEOUT_MS,
        reconnect: { ...server.reconnect },
        status,
        ...error === undefined ? {} : { error },
        toolCount,
    };
}
export function serverIdFromToolName(name, serverIds) {
    if (serverIds !== undefined) {
        // The public MCP name contains the server id verbatim.  Matching against
        // the managed ids avoids treating an id containing `__` as a shorter id
        // and also keeps ids beginning with `_` or `-` valid.
        const matches = [...serverIds]
            .filter(id => id.length > 0 && name.startsWith(`mcp__${id}__`))
            .sort((left, right) => right.length - left.length);
        return matches[0];
    }
    const match = /^mcp__(.+?)__(.+)$/.exec(name);
    return match?.[1];
}
export function projectTool(schema, disabled, serverIds) {
    const serverId = serverIdFromToolName(schema.name, serverIds);
    if (serverId === undefined)
        return undefined;
    return {
        name: schema.name,
        serverId,
        description: schema.description ?? '',
        parameters: structuredClone(schema.parameters),
        enabled: !disabled.has(schema.name),
    };
}
//# sourceMappingURL=protocol.js.map