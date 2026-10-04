/**
 * The legacy Loader-entry layer, edited through the official shared settings form.
 *
 * `mcp.json` scope files have no configuration surface in dsh, so they stay on
 * this plugin's own RPC. A plugin's Loader-entry configuration does have one:
 * the same `ctx.configForms` form every official settings page writes through.
 * The panel therefore sends every entry-scope edit — a server definition, its
 * `enabled` flag, and the per-tool policy — as path operations on that form
 * instead of as a private whole-document protocol.
 *
 * That is not just a transport change. The form carries only the REDACTED
 * section: `env` and `headers` are declared `role('secret')`, so their values
 * are removed before the section crosses the wire and a write that restated a
 * server would silently drop every credential it never received. The official
 * `mutate` exists for exactly this case — a caller holding an incomplete view
 * names only the fields it means — so {@link entryServerOps} emits one path
 * operation per field and touches a secret only where the user typed a new
 * value or asked for the old one to be removed.
 *
 * Revision fencing, write ordering, refusal recovery, and read-only detection
 * all come from the official form, which is why this plugin no longer owns a
 * revision check, a conflict classifier, or a mutation queue on the Host.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ServerPatch, ServerTransport, StoredReconnectPolicy } from '../types.ts';
/**
 * The entry section as the official form decodes it.
 *
 * `env` and `headers` arrive with their `role('secret')` values already
 * removed, so the map is only ever read for key presence. Nothing in this
 * module reads a secret value from it.
 */
export interface EntryServerSection {
    id: string;
    label: string;
    enabled: boolean;
    transport: ServerTransport;
    command: string;
    args: string[];
    cwd: string;
    url: string;
    env: Record<string, string>;
    headers: Record<string, string>;
    envSensitive: string[];
    headerSensitive: string[];
    toolCallTimeoutMs: number;
    reconnect: StoredReconnectPolicy;
}
export interface EntryDocumentSection {
    servers: Record<string, EntryServerSection>;
    disabledTools: Record<string, string[]>;
}
/**
 * One path-addressed edit, taken from the official form's own `mutate`
 * signature so this module cannot drift from the wire contract.
 */
export type EntryPathOp = Parameters<ConfigForm<EntryDocumentSection>['mutate']>[0][number];
/** What the panel needs to enable or disable an entry-scope control. */
export interface EntryFormView {
    /** The Host serves the manager entry to this browser. */
    readonly available: boolean;
    /** An entry-scope write would be accepted right now. */
    readonly writable: boolean;
}
export interface EntryFormFace {
    /** Current availability, by stable reference until the form changes. */
    snapshot: () => EntryFormView;
    /** Observe availability changes. */
    subscribe: (listener: () => void) => () => void;
    /** Create or replace one entry-scope server. */
    upsert: (patch: ServerPatch) => Promise<boolean>;
    /** Remove one entry-scope server and its per-tool policy row. */
    remove: (id: string) => Promise<boolean>;
    /** Flip one entry-scope server's `enabled` flag. */
    setEnabled: (id: string, enabled: boolean) => Promise<boolean>;
    /** Replace (or clear) one server's disabled-tool list. */
    setDisabledTools: (id: string, names: readonly string[] | undefined) => Promise<boolean>;
}
/**
 * Project one server patch into entry-scope path operations.
 *
 * Every non-secret field is restated, because the form's decoded value is the
 * only source the panel has for them. Secrets are the exception: `env` and
 * `headers` entries appear only where the patch names a value to write or a
 * key to remove, so a credential the browser never received is left untouched.
 * @param patch - the draft's patch, as `draftPatch` produces it.
 * @returns the ordered operations for one `mutate` call.
 */
export declare function entryServerOps(patch: ServerPatch): EntryPathOp[];
export declare function createEntryForm(ctx: Context): EntryFormFace;
//# sourceMappingURL=entry-form.d.ts.map