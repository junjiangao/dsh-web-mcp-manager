/**
 * Pure draft/patch projection helpers for the MCP settings form.
 *
 * These functions own no component state and are exported so the form
 * behaviour (secret clear/rename, lossless args) can be tested without a
 * browser. They carry no revision: an entry-scope write is fenced by the
 * official shared settings form, and an `mcp.json` write is fenced by the
 * cross-process file lock `mutateScopeFile` takes around its read-modify-write.
 */
import type { ManagedServerView, McpScope, SecretInput, SecretState, ServerPatch } from '../types.ts';
/**
 * HTML `pattern` for a server id. Browsers compile `pattern` attributes with
 * the UnicodeSets (`v`) flag, where a leading/literal `-` inside a character
 * class is a SyntaxError — the dash must be escaped. This string is verified
 * to compile under `new RegExp(pattern, 'v')` in tests and must stay in sync
 * with `validateServerId` in `src/settings.ts`.
 */
export declare const SERVER_ID_PATTERN = "[\\-A-Za-z0-9_]{1,32}";
export interface ServerDraft {
    id: string;
    /** Scope this write targets; `entry` means the legacy Loader-entry store. */
    scope: McpScope;
    label: string;
    transport: 'stdio' | 'streamable-http';
    command: string;
    args: string[];
    cwd: string;
    url: string;
    timeout: string;
    env: SecretDraft[];
    headers: SecretDraft[];
    /** Keys present when the draft was opened; used to emit `{ clear: true }` for removed/renamed entries. */
    envOriginalKeys: readonly string[];
    headersOriginalKeys: readonly string[];
    /** Keys whose stored value is a `${…}` template and must never be rewritten. */
    envProtectedKeys: readonly string[];
    headersProtectedKeys: readonly string[];
    reconnectEnabled: boolean;
    initialDelayMs: string;
    maxDelayMs: string;
    maxAttempts: string;
}
export interface SecretDraft {
    /** Stable per-draft row identity; never derived from the editable key. */
    uid: number;
    key: string;
    /** Key this row had when the draft was opened; `undefined` for rows added in the editor. */
    originalKey?: string;
    value: string;
    clear: boolean;
    /** Mask the value as a password field (e.g. API keys); plain values stay visible. */
    sensitive: boolean;
    /**
     * The stored value is a `${…}` template the Host resolves at mount time.
     * Such a row is read-only here: the panel never received the value, and
     * clearing or rewriting it would replace the template with a literal.
     */
    templated: boolean;
}
export declare function draftFromServer(server?: ManagedServerView, defaultScope?: McpScope): ServerDraft;
export declare function newSecretDraft(): SecretDraft;
export declare function secretDrafts(value?: Readonly<Record<string, SecretState>>, templated?: readonly string[]): SecretDraft[];
export declare function draftPatch(draft: ServerDraft): ServerPatch;
/**
 * Project draft rows into a secret patch.
 *
 * Keys that existed when the draft was opened (`originalKeys`) but are no
 * longer present — removed rows — are emitted as `{ clear: true }` so the
 * Host merge actually deletes them. Renamed rows clear the original key and
 * set the new one.
 */
export declare function secretPatch(entries: readonly SecretDraft[], originalKeys: readonly string[], protectedKeys?: readonly string[]): Record<string, SecretInput>;
export declare function sensitiveKeys(entries: readonly SecretDraft[]): string[];
/** Trimmed keys that appear more than once; the caller decides how to surface them. */
export declare function duplicateDraftKeys(entries: readonly SecretDraft[]): string[];
//# sourceMappingURL=draft.d.ts.map