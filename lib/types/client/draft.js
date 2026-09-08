/**
 * Pure draft/patch projection helpers for the MCP settings form.
 *
 * These functions own no component state and are exported so the form
 * behaviour (conflict-safe revisions, secret clear/rename, lossless args)
 * can be tested without a browser.
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
export function draftFromServer(server, baseRevision = 0) {
    const env = secretDrafts(server?.env);
    const headers = secretDrafts(server?.headers);
    return {
        id: server?.id ?? '',
        baseRevision,
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
        reconnectEnabled: server?.reconnect.enabled ?? true,
        initialDelayMs: String(server?.reconnect.initialDelayMs ?? 500),
        maxDelayMs: String(server?.reconnect.maxDelayMs ?? 30_000),
        maxAttempts: String(server?.reconnect.maxAttempts ?? 10),
    };
}
export function newSecretDraft() {
    return { uid: allocateUid(), key: '', value: '', clear: false, sensitive: false };
}
export function secretDrafts(value) {
    return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b))
        .map(key => ({ uid: allocateUid(), key, originalKey: key, value: '', clear: false, sensitive: value?.[key]?.sensitive ?? false }));
}
export function draftPatch(draft) {
    const timeout = Number(draft.timeout);
    const initialDelayMs = positiveIntegerOr(draft.initialDelayMs, 500);
    const maxDelayMs = Math.max(initialDelayMs, positiveIntegerOr(draft.maxDelayMs, 30_000));
    const maxAttempts = positiveIntegerOr(draft.maxAttempts, 10);
    return {
        id: draft.id.trim(),
        label: draft.label,
        transport: draft.transport,
        command: draft.command,
        args: [...draft.args],
        cwd: draft.cwd,
        url: draft.url,
        env: secretPatch(draft.env, draft.envOriginalKeys),
        headers: secretPatch(draft.headers, draft.headersOriginalKeys),
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
export function secretPatch(entries, originalKeys) {
    const result = {};
    const removed = new Set(originalKeys);
    for (const entry of entries) {
        const key = entry.key.trim();
        if (key.length === 0)
            continue;
        removed.delete(key);
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
    for (const key of removed)
        setOwn(result, key, { clear: true });
    return result;
}
export function sensitiveKeys(entries) {
    const keys = entries.filter(entry => entry.sensitive).map(entry => entry.key.trim()).filter(Boolean);
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