/** Host-side settings, RPC, MCP lifecycle, and tool policy controller. */
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { SettingsProvider } from '@deepseek-ai/dsh-settings';
import type { ToolRuntime } from '@deepseek-ai/dsh-tools';
import type { RpcResult } from '../types.ts';
interface HostContext extends Context {
    settings: SettingsProvider;
    connection: HostConnectionHandle;
    tools: ToolRuntime;
}
/**
 * The controller deliberately owns no browser state. The settings provider is
 * the source of truth; every operation re-reads its revision before writing,
 * then reconciles only the affected server's Cordis child Fiber.
 */
export declare class McpManagerController {
    private readonly ctx;
    private readonly runtimes;
    private readonly restrictions;
    private scope;
    private settingsWatchDispose;
    private rpcDispose;
    private guardDispose;
    private mutationTail;
    private lifecycleTail;
    private suppressRestrictionEvents;
    private disposed;
    constructor(ctx: HostContext);
    /** Register the settings namespace, RPC channel, guard, and initial servers. */
    start(): Promise<void>;
    /** Dispose RPC, tool policy, and all child MCP clients after operations drain. */
    dispose(): Promise<void>;
    /** Dispatch one authenticated Connection RPC endpoint. */
    handle(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
    private document;
    private revision;
    private enqueueMutation;
    private upsert;
    private remove;
    private setEnabled;
    private reload;
    private setTool;
    private write;
    private assertRevision;
    private reconcileAll;
    /** Serialize one server's lifecycle operations, including reload/dispose. */
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