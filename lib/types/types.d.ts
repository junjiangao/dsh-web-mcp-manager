/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
export declare const MCP_MANAGER_CHANNEL: "/mcp-manager";
export declare const MCP_MANAGER_SETTINGS_NAMESPACE: "web-mcp-manager";
export type ServerTransport = 'stdio' | 'streamable-http';
export type ServerStatus = 'disabled' | 'waiting' | 'loading' | 'loaded' | 'failed';
export interface ReconnectPolicy {
    enabled: boolean;
    initialDelayMs: number;
    maxDelayMs: number;
    maxAttempts: number;
}
/** Secret values never cross the RPC boundary; only this state does. */
export interface SecretState {
    readonly set: boolean;
    /** Whether the stored value should be masked in the panel (sensitive key). */
    readonly sensitive: boolean;
}
export interface ManagedServerView {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly transport: ServerTransport;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly url: string;
    readonly env: Readonly<Record<string, SecretState>>;
    readonly headers: Readonly<Record<string, SecretState>>;
    readonly toolCallTimeoutMs: number;
    readonly reconnect: ReconnectPolicy;
    readonly status: ServerStatus;
    readonly error?: string;
    readonly toolCount: number;
}
export interface ManagedToolView {
    readonly name: string;
    readonly serverId: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    readonly enabled: boolean;
}
export interface ReadonlyMcpEntry {
    readonly entryId: string;
    readonly moduleName: string;
    readonly source: 'loader' | 'preset';
    readonly sourceId?: string;
    readonly sourceName?: string;
    readonly enabled: boolean | 'conditional';
    readonly condition?: string;
    readonly fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null;
}
export interface Snapshot {
    readonly revision: number;
    readonly writable: boolean;
    readonly servers: readonly ManagedServerView[];
    readonly tools: readonly ManagedToolView[];
    readonly readonlyEntries: readonly ReadonlyMcpEntry[];
}
export interface SecretPatch {
    /** Set a new value. Empty strings are valid values and are not a clear. */
    readonly value?: string;
    /** Explicitly remove the stored value. */
    readonly clear?: boolean;
}
export type SecretInput = string | SecretPatch;
export interface ServerPatch {
    readonly id: string;
    readonly label?: string;
    readonly enabled?: boolean;
    readonly transport?: ServerTransport;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly url?: string;
    readonly env?: Readonly<Record<string, SecretInput>>;
    readonly headers?: Readonly<Record<string, SecretInput>>;
    /** Keys of `env` whose values must be masked in the panel (full list semantics). */
    readonly envSensitive?: readonly string[];
    /** Keys of `headers` whose values must be masked in the panel (full list semantics). */
    readonly headerSensitive?: readonly string[];
    readonly toolCallTimeoutMs?: number;
    readonly reconnect?: Partial<ReconnectPolicy>;
}
export interface SnapshotRequest {
    readonly expectedRevision?: number;
}
export interface UpsertServerRequest {
    readonly server: ServerPatch;
    readonly expectedRevision: number;
}
export interface RemoveServerRequest {
    readonly id: string;
    readonly expectedRevision: number;
}
export interface SetServerEnabledRequest {
    readonly id: string;
    readonly enabled: boolean;
    readonly expectedRevision: number;
}
export interface ReloadServerRequest {
    readonly id: string;
}
export interface SetToolEnabledRequest {
    readonly serverId: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly expectedRevision: number;
}
export interface RpcError {
    readonly code: 'bad-request' | 'conflict' | 'not-found' | 'not-writable' | 'validation' | 'internal' | 'aborted';
    readonly message: string;
    readonly details?: Record<string, unknown>;
}
export type RpcResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: RpcError;
};
export type ManagerRpcEndpoint = 'snapshot' | 'upsertServer' | 'removeServer' | 'setServerEnabled' | 'reloadServer' | 'setToolEnabled';
export interface StoredReconnectPolicy {
    enabled: boolean;
    initialDelayMs: number;
    maxDelayMs: number;
    maxAttempts: number;
}
/** Actual Host-only stored shape. Secret values are kept here and nowhere in a view. */
export interface StoredServer {
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
    /** Keys of `env` whose values are masked in the panel (full list, persisted). */
    envSensitive: string[];
    /** Keys of `headers` whose values are masked in the panel (full list, persisted). */
    headerSensitive: string[];
    toolCallTimeoutMs: number;
    reconnect: StoredReconnectPolicy;
}
export interface SettingsDocument {
    servers: Record<string, StoredServer>;
    disabledTools: Record<string, string[]>;
}
export interface StoredServerPatch {
    readonly id: string;
    readonly label?: string;
    readonly enabled?: boolean;
    readonly transport?: ServerTransport;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly url?: string;
    readonly env?: Readonly<Record<string, SecretInput>>;
    readonly headers?: Readonly<Record<string, SecretInput>>;
    readonly envSensitive?: readonly string[];
    readonly headerSensitive?: readonly string[];
    readonly toolCallTimeoutMs?: number;
    readonly reconnect?: Partial<StoredReconnectPolicy>;
}
export declare function isRpcResult<T>(value: unknown): value is RpcResult<T>;
/** 插件的社区注册身份(GitHub owner/repo)。 */
export declare const PLUGIN_IDENTITY: "junjiangao/dsh-web-mcp-manager";
/** 插件安装后的 npm 包名 / loader 模块名(bundle 层与 patch 条目 name)。 */
export declare const PLUGIN_MODULE_NAME: "@junjiangao/dsh-web-mcp-manager";
/** 旧包名,仅用于已安装 profile 的过渡期识别(只读条目过滤),勿在生产路径使用。 */
export declare const LEGACY_PLUGIN_MODULE_NAME: "dsh-web-mcp-manager";
//# sourceMappingURL=types.d.ts.map