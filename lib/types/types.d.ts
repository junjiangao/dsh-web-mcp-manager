/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
/**
 * Shared channel carrying the manager's authenticated RPC.
 *
 * The manager rides the Connection service's own `/api` channel instead of
 * claiming a private prefix route:
 *
 * - The physical `/api` route is mounted by `@deepseek-ai/dsh-client-connection`
 *   itself and applies the Host/Origin fence plus browser authentication before
 *   anything reaches a handler, so this plugin never repeats that logic.
 * - `connection.rpc.handle(channel, …)` cannot be used: its `register()` mounts
 *   the physical route through `owner.webServer` where `owner` is the Connection
 *   service's own Context, which fails with `cannot get property "webServer"
 *   without inject`.
 * - `connection.rpc.intercept('/api', …)` cannot be used either: the shared
 *   channel accepts exactly one interceptor and `@deepseek-ai/dsh-api-gateway`
 *   already owns it.
 * - `connection.fetch.register()` is therefore the supported path: one exact
 *   Fetch route per endpoint, taking precedence over the interceptor.
 */
export declare const MCP_MANAGER_API_CHANNEL: "/api";
/** Endpoint prefix this plugin owns inside the shared channel. */
export declare const MCP_MANAGER_ENDPOINT_PREFIX: "mcp-manager";
/** Every manager endpoint, in registration order. */
export declare const MCP_MANAGER_ENDPOINTS: readonly ["snapshot", "upsertServer", "removeServer", "setServerEnabled", "reloadServer", "setToolEnabled"];
export type ManagerRpcEndpoint = typeof MCP_MANAGER_ENDPOINTS[number];
/**
 * Absolute exact Fetch-route path for one endpoint.
 *
 * The browser client posts to `<channel>/<endpoint>`, its channel grammar
 * (`/^\/[A-Za-z0-9._~-]+$/`) admits a single segment only, so the channel is
 * `/api` and the endpoint string carries the `mcp-manager/` prefix.
 * @param endpoint - one manager endpoint name.
 * @returns the path registered through `connection.fetch.register()`.
 */
export declare function mcpManagerRoutePath(endpoint: ManagerRpcEndpoint): string;
export type ServerTransport = 'stdio' | 'streamable-http';
export type ServerStatus = 'disabled' | 'waiting' | 'loading' | 'loaded' | 'failed';
/**
 * Every place a server definition can come from, in precedence order: a later
 * entry never overrides an earlier one. `entry` is the legacy Loader-entry
 * store the plugin used before `mcp.json` support.
 */
export declare const MCP_SCOPES: readonly ["project", "profile", "user", "entry"];
export type McpScope = typeof MCP_SCOPES[number];
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
/** One `mcp.json` source row as the panel renders it. */
export interface McpSourceView {
    readonly scope: McpScope;
    readonly path: string;
    readonly writable: boolean;
    /** Another client's file merged below this scope's own file. */
    readonly compat: boolean;
    readonly exists: boolean;
    readonly serverCount: number;
    readonly error?: string;
    /** Per-entry failures inside an otherwise readable file. */
    readonly problems?: readonly {
        readonly id: string;
        readonly error: string;
    }[];
}
/** One workspace the project scope may be rooted at. */
export interface WorkspaceView {
    readonly id: string;
    readonly path: string;
    readonly title: string;
}
/** Environment variables one stored server keeps as `${…}` templates. */
export interface ServerTemplates {
    readonly env: readonly string[];
    readonly headers: readonly string[];
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
    /** The scope whose definition won. */
    readonly scope: McpScope;
    /** Lower-precedence definitions of the same name that lost. */
    readonly shadowed: readonly McpScope[];
    /** Values this server keeps as environment templates rather than literals. */
    readonly templates: ServerTemplates;
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
    /** Every `mcp.json` source row plus the legacy entry row. */
    readonly sources: readonly McpSourceView[];
    /** Registered workspaces the project scope may be rooted at. */
    readonly workspaces: readonly WorkspaceView[];
    /** The project root this snapshot was resolved against, when one was selected. */
    readonly projectPath?: string;
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
    /** Target scope for this write; the panel defaults to the winning scope. */
    readonly scope?: McpScope;
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
/**
 * Where a write lands.
 *
 * A `project` scope is only accepted when `projectPath` names a registered
 * workspace root; the Host never writes outside a root it can prove.
 */
export interface ScopeTarget {
    readonly scope?: McpScope;
    readonly projectPath?: string;
}
export interface SnapshotRequest extends ScopeTarget {
    readonly expectedRevision?: number;
}
export interface UpsertServerRequest extends ScopeTarget {
    readonly server: ServerPatch;
    readonly expectedRevision: number;
}
export interface RemoveServerRequest extends ScopeTarget {
    readonly id: string;
    readonly expectedRevision: number;
}
export interface SetServerEnabledRequest extends ScopeTarget {
    readonly id: string;
    readonly enabled: boolean;
    readonly expectedRevision: number;
}
export interface ReloadServerRequest {
    readonly id: string;
}
export interface SetToolEnabledRequest extends ScopeTarget {
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