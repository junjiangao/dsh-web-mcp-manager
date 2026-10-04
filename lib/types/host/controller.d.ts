/** Host-side dsh 0.2 configuration, RPC, MCP lifecycle, and tool policy controller. */
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { SettingsForms } from '@deepseek-ai/dsh-settings';
import type { ToolRuntime } from '@deepseek-ai/dsh-tools';
import type { RpcResult } from '../types.ts';
import { type ManagerSettings } from '../settings.ts';
interface HostContext extends Context {
    settings: SettingsForms;
    connection: HostConnectionHandle;
    tools: ToolRuntime;
}
/**
 * The controller deliberately owns no browser state. Server definitions live in
 * the `mcp.json` scope files; a legacy Loader-entry definition is read from the
 * entry's volatile refs and written by the browser through the official shared
 * settings form; the settings document is the source of truth for the per-tool
 * policy. Every operation re-resolves the sources, then reconciles only the
 * affected server's Cordis child Fiber.
 */
export declare class McpManagerController {
    private readonly ctx;
    private readonly config;
    private readonly runtimes;
    private readonly restrictions;
    private configWatchDispose;
    private configPresentationDispose;
    private fileWatchDispose;
    private rpcDispose;
    private guardDispose;
    private readonly lifecycleQueues;
    private suppressRestrictionEvents;
    private disposed;
    /** Last resolved source set, invalidated by every write and file change. */
    private sourceCache;
    /** Effective server ids from the last resolution, for the synchronous tool guard. */
    private effectiveIds;
    /** The project root every subsequent resolution and watch uses. */
    private selectedProjectPath;
    /** The project root the installed file watch was resolved against. */
    private watchedProjectPath;
    /**
     * @param ctx - the Host plugin context.
     * @param config - the entry's resolved volatile refs; every read goes through
     * them, so a committed entry edit is visible to the next operation.
     */
    constructor(ctx: HostContext, config: ManagerSettings);
    /** Register the RPC channel, tool guard, configuration watch, and servers. */
    start(): Promise<void>;
    /** Dispose RPC, tool policy, file watch, and all child MCP clients after operations drain. */
    dispose(): Promise<void>;
    /** Dispatch one authenticated Connection RPC endpoint. */
    handle(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
    /** The live entry document, read through the volatile refs on every call. */
    private document;
    /** The active profile directory, as the settings provider reports it. */
    private profileDir;
    /** Registered workspaces the panel may root the project scope at. */
    private workspaces;
    /**
     * Validate the project root the caller selected.
     *
     * The project scope writes a file, so an unvalidated path would turn the RPC
     * into arbitrary file creation. Only a canonical path the workspace registry
     * already owns is accepted.
     */
    private projectDir;
    private scopeFiles;
    /** Resolve (and memoize) the merged source view for one scope selection. */
    private sourcesFor;
    /** Drop the memoized sources and reconcile everything against the new state. */
    private reloadSources;
    /** Install the scope-file watch for the selected project root, once per root. */
    private ensureWatch;
    /** The scope file a write targets, or `undefined` for the legacy entry scope. */
    private scopeFile;
    /**
     * Decide where one write lands.
     *
     * An explicit selection wins and must exist; otherwise a defined server keeps
     * its winning scope and a new server goes to the profile scope, which is
     * private to this profile and always writable. A deployment without a profile
     * directory (or without that scope) degrades to the user scope rather than
     * failing the write.
     *
     * The entry scope is never a destination here: it is not a file but the
     * Loader entry's own configuration, whose only writer is the official shared
     * settings form the browser drives. A request that names it — or that would
     * inherit it from a legacy definition — is refused rather than answered with
     * a second, unfenced write path.
     */
    private writeScope;
    /** Write one server definition into a non-entry scope file. */
    private writeScopedServer;
    private upsert;
    private remove;
    private setEnabled;
    private reload;
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