/** Host-side dsh 0.2 configuration, RPC, MCP lifecycle, and tool policy controller. */
import { dirname, join } from 'node:path';
import { apply as mcpApply, Config as McpConfig } from '@deepseek-ai/dsh-mcp-client';
import { LEGACY_PLUGIN_MODULE_NAME, PLUGIN_MODULE_NAME, } from "../types.js";
import { validateStoredDocument } from "../settings.js";
import { toMcpConfig } from "./mcp-config.js";
import { PerKeyQueue } from "./keyed-queue.js";
import { registerManagerRpcRoute } from "./rpc-channel.js";
import { mutateScopeFile, readScopeFiles, resolveScopeFiles, watchScopeFiles, } from "./mcp-file.js";
import { withServer } from "./mcp-json.js";
import { expandServer, mergeSources, serverTemplates } from "./mcp-sources.js";
import { isRecord, mergeServerPatch, parseIdRequest, parseReloadRequest, parseSetEnabledRequest, parseSnapshotRequest, parseUpsertRequest, projectTool, redactServer, serverIdFromToolName, } from "../protocol.js";
/**
 * One message for every attempt to write the legacy entry scope through this
 * RPC. The entry is a Loader entry's own configuration, so the browser writes
 * it through the shared settings form, which fences the change with the
 * official revision and never restates a secret it did not receive.
 */
const ENTRY_SCOPE_REFUSED = 'the entry scope is written through the settings form, not the manager RPC';
const MCP_PLUGIN = {
    name: 'mcp-client',
    inject: ['tools'],
    Config: McpConfig,
    apply: mcpApply,
};
/**
 * The controller deliberately owns no browser state. Server definitions live in
 * the `mcp.json` scope files; a legacy Loader-entry definition is read from the
 * entry's volatile refs and written by the browser through the official shared
 * settings form; the settings document is the source of truth for the per-tool
 * policy. Every operation re-resolves the sources, then reconciles only the
 * affected server's Cordis child Fiber.
 */
export class McpManagerController {
    ctx;
    config;
    runtimes = new Map();
    restrictions = [];
    configWatchDispose;
    configPresentationDispose;
    fileWatchDispose;
    rpcDispose;
    guardDispose;
    lifecycleQueues = new PerKeyQueue();
    suppressRestrictionEvents = false;
    disposed = false;
    /** Last resolved source set, invalidated by every write and file change. */
    sourceCache;
    /** Effective server ids from the last resolution, for the synchronous tool guard. */
    effectiveIds = [];
    /** The project root every subsequent resolution and watch uses. */
    selectedProjectPath;
    /** The project root the installed file watch was resolved against. */
    watchedProjectPath;
    /**
     * @param ctx - the Host plugin context.
     * @param config - the entry's resolved volatile refs; every read goes through
     * them, so a committed entry edit is visible to the next operation.
     */
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
    }
    /** Register the RPC channel, tool guard, configuration watch, and servers. */
    async start() {
        validateStoredDocument(this.document());
        // dsh 0.2 owns the entry document through the Loader entry. Volatile fields
        // are committed into the running Config refs and announce their changed
        // paths on the owning plugin fiber; another entry's update is not ours.
        this.configWatchDispose = this.ctx.on('loader/volatile-update', (paths) => {
            if (this.disposed || !paths.some(path => path[0] === 'servers' || path[0] === 'disabledTools'))
                return;
            void this.reloadSources().catch(error => {
                this.ctx.logger.warn(`web-mcp-manager: configuration change reconciliation failed: ${String(error)}`);
            });
        });
        // The MCP panel is the purpose-built editor for this entry. Keep dsh's
        // generic generated form off to avoid exposing a second server editor.
        // The optional guard keeps lightweight controller test doubles compatible.
        if (typeof this.ctx.settings.configure === 'function') {
            this.configPresentationDispose = this.ctx.settings.configure({ auto: false });
        }
        this.guardDispose = this.ctx.tools.guard((execution) => {
            const serverId = serverIdFromToolName(execution.name, this.effectiveIds);
            if (serverId === undefined)
                return undefined;
            const disabled = new Set(this.document().disabledTools[serverId] ?? []);
            return disabled.has(execution.name)
                ? 'MCP tool is disabled in the Web MCP panel'
                : undefined;
        });
        this.rpcDispose = registerManagerRpcRoute(this.ctx, (endpoint, payload, signal) => this.handle(endpoint, payload, signal));
        this.ctx.on('tools/change', () => {
            if (this.disposed || this.suppressRestrictionEvents)
                return;
            this.refreshRestrictions();
        });
        // Keep the agent lifecycle hook's absent waterfall value explicit.
        this.ctx.on('agent/created', ({ agent }) => {
            this.installRestriction(agent);
            return undefined;
        });
        this.ctx.on('agent/disposed', ({ agent }) => {
            this.removeRestriction(agent);
        });
        for (const agent of this.ctx.get('agents')?.list?.() ?? [])
            this.installRestriction(agent);
        await this.reconcileAll();
    }
    /** Dispose RPC, tool policy, file watch, and all child MCP clients after operations drain. */
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.configWatchDispose?.();
        this.configWatchDispose = undefined;
        this.configPresentationDispose?.();
        this.configPresentationDispose = undefined;
        this.fileWatchDispose?.();
        this.fileWatchDispose = undefined;
        await this.lifecycleQueues.drain();
        for (const runtime of this.runtimes.values())
            await this.disposeRuntime(runtime);
        this.runtimes.clear();
        for (const restriction of this.restrictions.splice(0))
            restriction.dispose();
        this.guardDispose?.();
        this.guardDispose = undefined;
        if (this.rpcDispose !== undefined)
            await this.rpcDispose();
        this.rpcDispose = undefined;
    }
    /** Dispatch one authenticated Connection RPC endpoint. */
    async handle(endpoint, payload, signal) {
        if (this.disposed)
            return failure('aborted', 'MCP manager is disposed');
        if (signal.aborted)
            return failure('aborted', 'operation was cancelled');
        try {
            switch (endpoint) {
                case 'snapshot':
                    return success(await this.snapshot(parseSnapshotRequest(payload)));
                case 'upsertServer':
                    return success(await this.upsert(parseUpsertRequest(payload)));
                case 'removeServer':
                    return success(await this.remove(parseIdRequest(payload)));
                case 'setServerEnabled':
                    return success(await this.setEnabled(parseSetEnabledRequest(payload)));
                case 'reloadServer':
                    return success(await this.reload(parseReloadRequest(payload)));
                default:
                    return failure('bad-request', `unknown MCP manager endpoint ${JSON.stringify(endpoint)}`);
            }
        }
        catch (error) {
            return failure(classifyError(error), error instanceof Error ? error.message : String(error));
        }
    }
    /** The live entry document, read through the volatile refs on every call. */
    document() {
        // Detached from the refs: schemastery projects a deeply-readonly value,
        // while the document this controller reads is mutable.
        return structuredClone({
            servers: this.config.servers.get() ?? {},
            disabledTools: this.config.disabledTools.get() ?? {},
        });
    }
    // ---------------------------------------------------------------- sources
    /** The active profile directory, as the settings provider reports it. */
    profileDir() {
        const path = this.ctx.settings.documentPath;
        return typeof path === 'string' && path !== '' ? dirname(path) : undefined;
    }
    /** Registered workspaces the panel may root the project scope at. */
    workspaces() {
        const registry = this.ctx.get('workspaceRegistry');
        try {
            return (registry?.list?.() ?? []).map(workspace => ({
                id: String(workspace.id), path: workspace.path, title: workspace.title,
            }));
        }
        catch {
            return [];
        }
    }
    /**
     * Validate the project root the caller selected.
     *
     * The project scope writes a file, so an unvalidated path would turn the RPC
     * into arbitrary file creation. Only a canonical path the workspace registry
     * already owns is accepted.
     */
    projectDir(target) {
        if (target.projectPath === undefined)
            return this.selectedProjectPath;
        const match = this.workspaces().find(workspace => workspace.path === target.projectPath);
        if (match === undefined) {
            throw new Error(`project path ${JSON.stringify(target.projectPath)} is not a registered workspace`);
        }
        return match.path;
    }
    scopeFiles(projectDir) {
        return resolveScopeFiles({ profileDir: this.profileDir(), projectDir });
    }
    /** Resolve (and memoize) the merged source view for one scope selection. */
    async sourcesFor(target) {
        const projectDir = this.projectDir(target);
        this.selectedProjectPath = projectDir;
        await this.ensureWatch(projectDir);
        const key = projectDir ?? '';
        if (this.sourceCache?.key === key)
            return this.sourceCache.value;
        const scopes = await readScopeFiles(this.scopeFiles(projectDir));
        const value = mergeSources({
            scopes,
            entryServers: this.document().servers,
            entryPath: `${this.profileDir() === undefined ? 'cordis.yml' : join(this.profileDir(), 'cordis.patch.yml')} · web-mcp-manager`,
        });
        this.sourceCache = { key, value };
        this.effectiveIds = value.servers.map(server => server.id);
        return value;
    }
    /** Drop the memoized sources and reconcile everything against the new state. */
    async reloadSources() {
        this.sourceCache = undefined;
        await this.reconcileAll();
        this.refreshRestrictions();
    }
    /** Install the scope-file watch for the selected project root, once per root. */
    async ensureWatch(projectDir) {
        if (this.disposed)
            return;
        if (this.fileWatchDispose !== undefined && this.watchedProjectPath === projectDir)
            return;
        this.fileWatchDispose?.();
        this.fileWatchDispose = undefined;
        this.watchedProjectPath = projectDir;
        try {
            this.fileWatchDispose = await watchScopeFiles(this.scopeFiles(projectDir), () => {
                void this.reloadSources().catch((error) => {
                    this.ctx.logger.warn(`web-mcp-manager: mcp.json refresh failed: ${String(error)}`);
                });
            });
        }
        catch (error) {
            this.ctx.logger.warn(`web-mcp-manager: could not watch mcp.json sources: ${String(error)}`);
        }
    }
    /** The scope file a write targets, or `undefined` for the legacy entry scope. */
    scopeFile(scope, projectDir) {
        return this.scopeFiles(projectDir).find(file => file.scope === scope);
    }
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
    writeScope(target, existing, requested) {
        const projectDir = this.projectDir(target);
        const available = (scope) => scope !== 'entry' && this.scopeFile(scope, projectDir) !== undefined;
        const explicit = requested ?? target.scope;
        if (explicit === 'entry')
            throw new TypeError(ENTRY_SCOPE_REFUSED);
        if (explicit === undefined && existing?.scope === 'entry')
            throw new TypeError(ENTRY_SCOPE_REFUSED);
        const preferred = explicit ?? existing?.scope ?? 'profile';
        if (available(preferred))
            return preferred;
        if (explicit !== undefined)
            throw new Error(`the ${JSON.stringify(explicit)} scope is not available in this profile`);
        for (const fallback of ['profile', 'user'])
            if (available(fallback))
                return fallback;
        throw new Error('no writable MCP scope is available in this profile');
    }
    /** Write one server definition into a non-entry scope file. */
    async writeScopedServer(scope, projectDir, id, server) {
        const file = this.scopeFile(scope, projectDir);
        if (file === undefined)
            throw new Error(`the ${JSON.stringify(scope)} scope is not available in this profile`);
        await mutateScopeFile(file.path, document => withServer(document, id, server));
        this.sourceCache = undefined;
    }
    // ------------------------------------------------------------- mutations
    async upsert(request) {
        const merged = await this.sourcesFor(request);
        const existing = merged.servers.find(server => server.id === request.server.id);
        const scope = this.writeScope(request, existing, request.server.scope);
        // Editing a definition keeps its own scope as the base; a cross-scope
        // write starts from the winning definition so nothing is silently lost.
        const nextServer = mergeServerPatch(existing?.server, request.server);
        this.assertToolNamespaceAvailable(nextServer.id, existing !== undefined);
        await this.writeScopedServer(scope, this.projectDir(request), nextServer.id, nextServer);
        // 不等待生命周期,状态由轮询呈现
        void this.reconcileServer(nextServer.id);
        return this.snapshot({ projectPath: request.projectPath });
    }
    async remove(request) {
        const merged = await this.sourcesFor(request);
        const existing = merged.servers.find(server => server.id === request.id);
        if (existing === undefined)
            throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
        const scope = this.writeScope(request, existing);
        // The definition is what the user asked to delete. The per-tool policy is
        // the entry document's own bookkeeping, which this RPC no longer writes;
        // the panel clears it through the settings form.
        await this.writeScopedServer(scope, this.projectDir(request), request.id, null);
        // 不等待生命周期,状态由轮询呈现
        void this.reconcileServer(request.id);
        return this.snapshot({ projectPath: request.projectPath });
    }
    async setEnabled(request) {
        const merged = await this.sourcesFor(request);
        const existing = merged.servers.find(server => server.id === request.id);
        if (existing === undefined)
            throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
        const scope = this.writeScope(request, existing);
        const nextServer = { ...existing.server, enabled: request.enabled };
        await this.writeScopedServer(scope, this.projectDir(request), request.id, nextServer);
        // 不等待生命周期,状态由轮询呈现
        void this.reconcileServer(request.id);
        return this.snapshot({ projectPath: request.projectPath });
    }
    async reload(request) {
        const merged = await this.sourcesFor({});
        if (!merged.servers.some(server => server.id === request.id)) {
            throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
        }
        await this.reconcileServer(request.id, true);
        return this.snapshot({});
    }
    // ------------------------------------------------------------- lifecycle
    async reconcileAll() {
        const merged = await this.sourcesFor({});
        const ids = new Set(merged.servers.map(server => server.id));
        await Promise.all([...ids].map(id => this.reconcileServer(id)));
        for (const id of this.runtimes.keys()) {
            if (!ids.has(id))
                await this.reconcileServer(id);
        }
        this.refreshRestrictions();
    }
    /** Serialize one server's lifecycle operations, including reload/dispose, per server id. */
    reconcileServer(id, force = false) {
        return this.lifecycleQueues.enqueue(id, async () => {
            if (this.disposed)
                return;
            const source = (await this.sourcesFor({})).servers.find(candidate => candidate.id === id);
            const config = source?.server;
            let runtime = this.runtimes.get(id);
            if (runtime === undefined) {
                runtime = { id, fingerprint: '', status: 'waiting' };
                this.runtimes.set(id, runtime);
            }
            const fingerprint = config === undefined ? '' : stableFingerprint(config);
            if (config === undefined || !config.enabled) {
                await this.disposeRuntime(runtime);
                runtime.status = config === undefined ? 'waiting' : 'disabled';
                runtime.error = undefined;
                runtime.fingerprint = fingerprint;
                if (config === undefined)
                    this.runtimes.delete(id);
                return;
            }
            if (!force && runtime.fiber !== undefined && runtime.fingerprint === fingerprint)
                return;
            await this.disposeRuntime(runtime);
            runtime.status = 'loading';
            runtime.error = undefined;
            runtime.fingerprint = fingerprint;
            let fiber;
            try {
                // `${…}` templates resolve here and nowhere else: the panel and the
                // `mcp.json` file keep the template, the MCP client gets the value.
                const expanded = expandServer(config, process.env);
                if (expanded.missing.length > 0) {
                    throw new Error(`missing environment ${expanded.missing.length === 1 ? 'variable' : 'variables'}: ${expanded.missing.join(', ')}`);
                }
                fiber = this.ctx.plugin(MCP_PLUGIN, toMcpConfig(expanded.server));
                runtime.fiber = fiber;
                await withTimeout(fiber.await(), START_TIMEOUT_MS, `MCP server ${id} startup timed out after ${START_TIMEOUT_MS}ms`);
                if (runtime.fiber === fiber)
                    runtime.status = 'loaded';
            }
            catch (error) {
                if (runtime.fiber !== fiber)
                    return;
                const message = error instanceof Error ? error.message : String(error);
                runtime.status = 'failed';
                runtime.error = message;
                // 超时后 fiber 可能仍在启动:保留引用供后续 dispose 清理;真正的启动失败则放弃引用。
                if (!message.includes('timed out'))
                    runtime.fiber = undefined;
            }
            this.refreshRestrictions();
        });
    }
    async disposeRuntime(runtime) {
        const fiber = runtime.fiber;
        runtime.fiber = undefined;
        if (fiber === undefined)
            return;
        try {
            await withTimeout(fiber.dispose(), DISPOSE_TIMEOUT_MS, `failed to dispose server ${runtime.id} within ${DISPOSE_TIMEOUT_MS}ms`);
        }
        catch (error) {
            this.ctx.logger.warn(`web-mcp-manager: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // -------------------------------------------------------------- snapshot
    async snapshot(request) {
        const merged = await this.sourcesFor(request);
        const schemas = this.readToolSchemas();
        const tools = this.projectTools(schemas, merged);
        const byServer = new Map();
        for (const tool of tools)
            byServer.set(tool.serverId, (byServer.get(tool.serverId) ?? 0) + 1);
        const servers = [...merged.servers].sort((a, b) => a.id.localeCompare(b.id)).map((source) => {
            const runtime = this.runtimes.get(source.id);
            const error = runtime?.error === undefined ? undefined : redactRuntimeError(runtime.error, source.server);
            return redactServer(source.server, source.server.enabled ? runtime?.status ?? 'waiting' : 'disabled', byServer.get(source.id) ?? 0, error, source.scope, source.shadowed.map(entry => entry.scope), serverTemplates(source.server));
        });
        const projectPath = this.selectedProjectPath;
        return {
            writable: this.ctx.settings.writable,
            servers,
            tools,
            readonlyEntries: await this.readonlyEntries(),
            sources: merged.sources,
            workspaces: this.workspaces(),
            ...projectPath === undefined ? {} : { projectPath },
        };
    }
    readToolSchemas() {
        try {
            return this.ctx.tools.schemas();
        }
        catch (error) {
            this.ctx.logger.warn(`web-mcp-manager: failed to read tool schemas: ${String(error)}`);
            return [];
        }
    }
    projectTools(schemas, merged) {
        const disabled = new Set(Object.values(this.document().disabledTools).flat());
        const serverIds = merged.servers.map(server => server.id);
        return schemas
            .map(schema => projectTool(schema, disabled, serverIds))
            .filter((tool) => tool !== undefined && serverIds.includes(tool.serverId))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    async readonlyEntries() {
        const inventory = this.ctx.get('pluginInventory');
        if (inventory?.list === undefined)
            return [];
        try {
            const value = await inventory.list();
            const loaderEntries = value.entries
                .filter(entry => entry.moduleName !== PLUGIN_MODULE_NAME && entry.moduleName !== LEGACY_PLUGIN_MODULE_NAME && entry.moduleName.toLocaleLowerCase().includes('mcp'))
                .map(entry => ({ ...entry, source: 'loader' }));
            const presetEntries = [];
            for (const preset of value.agentPresets ?? []) {
                for (const [index, entry] of preset.rows.entries()) {
                    if (!entry.moduleName.toLocaleLowerCase().includes('mcp'))
                        continue;
                    presetEntries.push({
                        entryId: `preset:${preset.id}:${entry.entryId ?? String(index)}`,
                        moduleName: entry.moduleName,
                        source: 'preset',
                        sourceId: preset.id,
                        ...preset.name === undefined ? {} : { sourceName: preset.name },
                        enabled: entry.enabled,
                        ...entry.condition === undefined ? {} : { condition: entry.condition },
                        fiberPhase: entry.fiberPhase,
                    });
                }
            }
            return [...loaderEntries, ...presetEntries];
        }
        catch {
            return [];
        }
    }
    assertToolNamespaceAvailable(serverId, editingExisting) {
        if (editingExisting)
            return;
        const conflict = this.readToolSchemas().some(schema => serverIdFromToolName(schema.name, [serverId]) === serverId);
        if (conflict)
            throw new Error(`MCP server id ${JSON.stringify(serverId)} is already used by a loaded MCP tool`);
    }
    // ------------------------------------------------------------ tool policy
    installRestriction(agent) {
        if (this.restrictions.some(entry => entry.agent === agent))
            return;
        const tools = agent.ctx.tools;
        if (tools === undefined)
            return;
        const names = this.disabledToolNames().filter(name => this.ctx.tools.get(name, agent) !== undefined);
        if (names.length === 0)
            return;
        const previousSuppression = this.suppressRestrictionEvents;
        this.suppressRestrictionEvents = true;
        try {
            const dispose = tools.restrict({ deny: names });
            this.restrictions.push({ agent, dispose });
        }
        catch (error) {
            this.ctx.logger.warn(`web-mcp-manager: could not install restrictions for agent ${String(agent.id)}: ${String(error)}`);
        }
        finally {
            this.suppressRestrictionEvents = previousSuppression;
        }
    }
    removeRestriction(agent) {
        for (let index = this.restrictions.length - 1; index >= 0; index--) {
            const entry = this.restrictions[index];
            if (entry?.agent !== agent)
                continue;
            const previousSuppression = this.suppressRestrictionEvents;
            this.suppressRestrictionEvents = true;
            try {
                entry.dispose();
            }
            finally {
                this.suppressRestrictionEvents = previousSuppression;
            }
            this.restrictions.splice(index, 1);
        }
    }
    refreshRestrictions() {
        if (this.disposed || this.suppressRestrictionEvents)
            return;
        const previousSuppression = this.suppressRestrictionEvents;
        this.suppressRestrictionEvents = true;
        try {
            const agents = this.ctx.get('agents')?.list?.() ?? [];
            for (const restriction of this.restrictions.splice(0))
                restriction.dispose();
            for (const agent of agents)
                this.installRestriction(agent);
        }
        finally {
            this.suppressRestrictionEvents = previousSuppression;
        }
    }
    disabledToolNames() {
        return [...new Set(Object.values(this.document().disabledTools).flat())];
    }
}
/** 启动等待上限,防止挂起的连接永久拖住该服务的后续生命周期操作。 */
const START_TIMEOUT_MS = 30_000;
/** 卸载上限,防止子进程清理异常阻塞插件卸载。 */
const DISPOSE_TIMEOUT_MS = 15_000;
/**
 * Bound one Cordis fiber promise.
 *
 * `@deepseek-ai/dsh-timeout` owns timeout arithmetic in the shipped Host, but its
 * primitives (`deadline`, `idleWatchdog`, `timeoutOf`) only NOTIFY through an
 * AbortSignal and require the awaited work to observe that signal.
 * `fiber.await()` and `fiber.dispose()` accept no signal, so the manager needs
 * the promise-shaped bound below and turns its own message into the server's
 * failure state.
 */
function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
}
function stableFingerprint(value) {
    return JSON.stringify(sortValue(value));
}
function redactRuntimeError(error, server) {
    let result = error;
    for (const secret of [...Object.values(server.env), ...Object.values(server.headers)]) {
        if (secret.length > 0)
            result = result.split(secret).join('[redacted]');
    }
    return result;
}
function sortValue(value) {
    if (Array.isArray(value))
        return value.map(sortValue);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
}
function success(value) {
    return { ok: true, value };
}
function failure(code, message) {
    return { ok: false, error: { code, message } };
}
function classifyError(error) {
    const code = error?.code;
    if (code === 'MCP_CONFIG_VALIDATION')
        return 'validation';
    if (error instanceof TypeError)
        return 'bad-request';
    if (typeof error === 'object' && error !== null && 'message' in error && String(error.message).includes('read-only'))
        return 'not-writable';
    if (typeof error === 'object' && error !== null && 'message' in error && /not found|not registered/u.test(String(error.message)))
        return 'not-found';
    if (error instanceof Error && /needs a command|invalid URL|must be|unsupported MCP transport|contains an empty|already used by|invalid JSON|is not a registered workspace|missing environment/u.test(error.message))
        return 'validation';
    return 'internal';
}
//# sourceMappingURL=controller.js.map