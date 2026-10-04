/**
 * Pure draft/patch projection helpers for the MCP settings form.
 *
 * These functions own no component state and are exported so the form
 * behaviour (secret clear/rename, lossless args) can be tested without a
 * browser. They carry no revision: an entry-scope write is fenced by the
 * official shared settings form, and an `mcp.json` write is fenced by the
 * cross-process file lock `mutateScopeFile` takes around its read-modify-write.
 */
/**
 * HTML `pattern` for a server id. Browsers compile `pattern` attributes with
 * the UnicodeSets (`v`) flag, where a leading/literal `-` inside a character
 * class is a SyntaxError — the dash must be escaped. This string is verified
 * to compile under `new RegExp(pattern, 'v')` in tests and must stay in sync
 * with `validateServerId` in `src/settings.ts`.
 */
export const SERVER_ID_PATTERN = '[\\-A-Za-z0-9_]{1,32}';
let nextUid = 1;
function allocateUid() {
    const uid = nextUid;
    nextUid += 1;
    return uid;
}
export function draftFromServer(server, defaultScope = 'profile') {
    const env = secretDrafts(server?.env, server?.templates.env);
    const headers = secretDrafts(server?.headers, server?.templates.headers);
    return {
        id: server?.id ?? '',
        scope: server?.scope ?? defaultScope,
        label: server?.label ?? '',
        transport: server?.transport ?? 'stdio',
        command: server?.command ?? '',
        args: server === undefined ? [] : [...server.args],
        cwd: server?.cwd ?? '',
        url: server?.url ?? '',
        timeout: String(server?.toolCallTimeoutMs ?? 60_000),
        env,
        headers,
        envOriginalKeys: env.map(entry => entry.key),
        headersOriginalKeys: headers.map(entry => entry.key),
        envProtectedKeys: env.filter(entry => entry.templated).map(entry => entry.key),
        headersProtectedKeys: headers.filter(entry => entry.templated).map(entry => entry.key),
        reconnectEnabled: server?.reconnect.enabled ?? true,
        initialDelayMs: String(server?.reconnect.initialDelayMs ?? 500),
        maxDelayMs: String(server?.reconnect.maxDelayMs ?? 30_000),
        maxAttempts: String(server?.reconnect.maxAttempts ?? 10),
    };
}
export function newSecretDraft() {
    return { uid: allocateUid(), key: '', value: '', clear: false, sensitive: false, templated: false };
}
export function secretDrafts(value, templated = []) {
    const templates = new Set(templated);
    return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b))
        .map(key => ({
        uid: allocateUid(), key, originalKey: key, value: '', clear: false,
        sensitive: value?.[key]?.sensitive ?? false,
        templated: templates.has(key),
    }));
}
export function draftPatch(draft) {
    const timeout = Number(draft.timeout);
    const initialDelayMs = positiveIntegerOr(draft.initialDelayMs, 500);
    const maxDelayMs = Math.max(initialDelayMs, positiveIntegerOr(draft.maxDelayMs, 30_000));
    const maxAttempts = positiveIntegerOr(draft.maxAttempts, 10);
    return {
        id: draft.id.trim(),
        scope: draft.scope,
        label: draft.label,
        transport: draft.transport,
        command: draft.command,
        args: [...draft.args],
        cwd: draft.cwd,
        url: draft.url,
        env: secretPatch(draft.env, draft.envOriginalKeys, draft.envProtectedKeys),
        headers: secretPatch(draft.headers, draft.headersOriginalKeys, draft.headersProtectedKeys),
        envSensitive: sensitiveKeys(draft.env),
        headerSensitive: sensitiveKeys(draft.headers),
        toolCallTimeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 60_000,
        reconnect: { enabled: draft.reconnectEnabled, initialDelayMs, maxDelayMs, maxAttempts },
    };
}
/**
 * Project draft rows into a secret patch.
 *
 * Keys that existed when the draft was opened (`originalKeys`) but are no
 * longer present — removed rows — are emitted as `{ clear: true }` so the
 * Host merge actually deletes them. Renamed rows clear the original key and
 * set the new one.
 */
export function secretPatch(entries, originalKeys, protectedKeys = []) {
    const result = {};
    const protectedSet = new Set(protectedKeys);
    const removed = new Set(originalKeys);
    for (const entry of entries) {
        const key = entry.key.trim();
        if (key.length === 0)
            continue;
        // A templated row is present but not ours to write: mark the key as still
        // accounted for so it is never emitted as a clear.
        removed.delete(key);
        if (entry.templated)
            continue;
        if (entry.originalKey !== undefined && entry.originalKey !== key) {
            setOwn(result, entry.originalKey, { clear: true });
        }
        if (entry.clear) {
            setOwn(result, key, { clear: true });
        }
        else if (entry.value.length > 0) {
            setOwn(result, key, entry.value);
        }
    }
    // A protected key is never cleared: the file owns that template, not the panel.
    for (const key of removed)
        if (!protectedSet.has(key))
            setOwn(result, key, { clear: true });
    return result;
}
export function sensitiveKeys(entries) {
    const keys = entries
        .filter(entry => entry.sensitive && !entry.templated)
        .map(entry => entry.key.trim())
        .filter(Boolean);
    return [...new Set(keys)];
}
/** Trimmed keys that appear more than once; the caller decides how to surface them. */
export function duplicateDraftKeys(entries) {
    const seen = new Set();
    const duplicates = new Set();
    for (const entry of entries) {
        const key = entry.key.trim();
        if (key.length === 0)
            continue;
        if (seen.has(key))
            duplicates.add(key);
        seen.add(key);
    }
    return [...duplicates];
}
function positiveIntegerOr(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function setOwn(record, key, value) {
    Object.defineProperty(record, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
}
//# sourceMappingURL=draft.js.map