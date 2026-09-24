/** Host-side settings, RPC, MCP lifecycle, and tool policy controller. */
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { WebServer } from '@deepseek-ai/dsh-host-webserver';
import { type SettingsForms } from '@deepseek-ai/dsh-settings';
import type { ToolRuntime } from '@deepseek-ai/dsh-tools';
import type { RpcResult } from '../types.ts';
import { type ManagerSettings } from '../settings.ts';
interface HostContext extends Context {
    settings: SettingsForms;
    connection: HostConnectionHandle;
    tools: ToolRuntime;
    webServer: WebServer;
}
/**
 * The controller deliberately owns no browser state. The settings provider is
 * the source of truth; every operation re-reads its revision before writing,
 * then reconciles only the affected server's Cordis child Fiber.
 */
export declare class McpManagerController {
    private readonly ctx;
    private readonly config;
    private readonly runtimes;
    private readonly restrictions;
    private settingsWatchDispose;
    private rpcDispose;
    private guardDispose;
    private mutationTail;
    private readonly lifecycleQueues;
    private suppressRestrictionEvents;
    private disposed;
    /**
     * @param ctx - the Host plugin context.
     * @param config - the entry's resolved volatile refs; every read goes through
     * them, so a committed edit is visible to the next operation.
     */
    constructor(ctx: HostContext, config: ManagerSettings);
    /** Register the RPC channel, tool guard, settings watch, and initial servers. */
    start(): Promise<void>;
    /** Dispose RPC, tool policy, and all child MCP clients after operations drain. */
    dispose(): Promise<void>;
    /** Dispatch one authenticated Connection RPC endpoint. */
    handle(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
    /** The live document, read through the entry's volatile refs on every call. */
    private document;
    private revision;
    private enqueueMutation;
    private upsert;
    private remove;
    private setEnabled;
    private reload;
    private setTool;
    /**
     * Commit one whole document through `settings.replace()`.
     *
     * `replace()` — not the path-addressed `settings.mutate()` — is the right
     * member here. `mutate()` exists for a caller holding an INCOMPLETE view of a
     * namespace (the redacted wire view), which must name only the fields it means
     * so the write cannot silently drop the `role('secret')` values it never
     * received. This controller reads the entry's volatile refs, i.e. the resolved
     * config with secrets included, so it restates every server anyway; `replace()`
     * then makes the write one all-or-nothing commit guarded by `expectedRevision`.
     */
    private write;
    /**
     * Fail fast before the next document is rebuilt. `settings.replace()` runs the
     * same revision check at write time; raising the settings service's own error
     * class here keeps one conflict identity across the whole path, so
     * {@link classifyError} matches it structurally instead of by message text.
     */
    private assertRevision;
    private reconcileAll;
    /** Serialize one server's lifecycle operations, including reload/dispose, per server id. */
    private reconcileServer;
    private disposeRuntime;
    private snapshot;
    private readToolSchemas;
    private projectTools;
    private readonlyEntries;
    private assertToolNamespaceAvailable;
    private installRestriction;
    private removeRestriction;
    private refreshRestrictions;
    private disabledToolNames;
}
export {};
//# sourceMappingURL=controller.d.ts.map