/**
 * Pure draft/patch projection helpers for the MCP settings form.
 *
 * These functions own no component state and are exported so the form
 * behaviour (conflict-safe revisions, secret clear/rename, lossless args)
 * can be tested without a browser.
 */
import type { ManagedServerView, SecretInput, SecretState, ServerPatch } from '../types.ts';
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
    /** Snapshot revision captured when the editor was opened; never re-read from polling. */
    baseRevision: number;
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
}
export declare function draftFromServer(server?: ManagedServerView, baseRevision?: number): ServerDraft;
export declare function newSecretDraft(): SecretDraft;
export declare function secretDrafts(value?: Readonly<Record<string, SecretState>>): SecretDraft[];
export declare function draftPatch(draft: ServerDraft): ServerPatch;
/**
 * Project draft rows into a secret patch.
 *
 * Keys that existed when the draft was opened (`originalKeys`) but are no
 * longer present — removed rows — are emitted as `{ clear: true }` so the
 * Host merge actually deletes them. Renamed rows clear the original key and
 * set the new one.
 */
export declare function secretPatch(entries: readonly SecretDraft[], originalKeys: readonly string[]): Record<string, SecretInput>;
export declare function sensitiveKeys(entries: readonly SecretDraft[]): string[];
/** Trimmed keys that appear more than once; the caller decides how to surface them. */
export declare function duplicateDraftKeys(entries: readonly SecretDraft[]): string[];
//# sourceMappingURL=draft.d.ts.map