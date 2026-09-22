/** Host settings schema and defaults for the MCP manager namespace. */
import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SettingsNamespace as DshSettingsNamespace } from '@deepseek-ai/dsh-settings';
import type { ReconnectPolicy, ServerTransport, SettingsDocument, StoredReconnectPolicy, StoredServer } from './types.ts';
export declare const MANAGER_NAMESPACE: DshSettingsNamespace;
export declare const DEFAULT_RECONNECT: StoredReconnectPolicy;
export declare const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;
/**
 * The Loader entry's schema, which is also the form the settings page renders.
 *
 * dsh 0.1.7 owns plugin configuration through the entry itself: there is no
 * `settings.register()` any more, so the two top-level fields are declared
 * `volatile()` — the whole subtree of each becomes live, which is what lets a
 * committed edit reach the running controller without re-registering it.
 */
export declare const Config: z<ManagerSettingsInput, ManagerSettings>;
/** The schema under its historical name; both refer to the same entry config. */
export declare const ManagerSettingsSchema: z<ManagerSettingsInput, ManagerSettings>;
/** The shape a composition file writes: plain values, every field optional. */
export interface ManagerSettingsInput {
    /** Configured MCP servers keyed by id. */
    servers?: Record<string, StoredServer>;
    /** Per-server disabled tool names. */
    disabledTools?: Record<string, string[]>;
}
/**
 * Resolved manager config as the Host hands it to `apply`: each field is a
 * live ref, read per operation rather than captured once at load.
 */
export interface ManagerSettings {
    /** Configured MCP servers keyed by id. */
    servers: Volatile<Record<string, StoredServer>>;
    /** Per-server disabled tool names. */
    disabledTools: Volatile<Record<string, string[]>>;
}
export declare function defaultServer(id: string): StoredServer;
export declare function defaultDocument(): SettingsDocument;
export declare function validateStoredDocument(value: SettingsDocument): void;
export declare function validateServerId(id: string): void;
export declare function validateServerConfig(server: StoredServer): void;
export declare function validateReconnect(value: ReconnectPolicy): void;
export declare function transportOf(value: string): ServerTransport;
//# sourceMappingURL=settings.d.ts.map