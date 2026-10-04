/** Host-side dsh 0.2 configuration, RPC, MCP lifecycle, and tool policy controller. */

import { dirname, join } from 'node:path'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory'
import { apply as mcpApply, Config as McpConfig } from '@deepseek-ai/dsh-mcp-client'
import { SettingsConflictError, type SettingsForms } from '@deepseek-ai/dsh-settings'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type {
  ManagedServerView, ManagedToolView, McpScope, McpSourceView, ReadonlyMcpEntry, RpcError, RpcResult,
  ScopeTarget, SettingsDocument, Snapshot, SnapshotRequest, StoredServer, UpsertServerRequest, WorkspaceView,
} from '../types.ts'
import {
  LEGACY_PLUGIN_MODULE_NAME,
  PLUGIN_MODULE_NAME,
  type ManagerRpcEndpoint,
  type ReloadServerRequest,
  type SetServerEnabledRequest,
  type SetToolEnabledRequest,
} from '../types.ts'
import { MANAGER_NAMESPACE, validateStoredDocument, type ManagerSettings } from '../settings.ts'
import { toMcpConfig } from './mcp-config.ts'
import { PerKeyQueue } from './keyed-queue.ts'
import { registerManagerRpcRoute } from './rpc-channel.ts'
import {
  mutateScopeFile, readScopeFiles, resolveScopeFiles, watchScopeFiles, type ScopeFile,
} from './mcp-file.ts'
import { withServer } from './mcp-json.ts'
import { expandServer, mergeSources, serverTemplates, type MergedSources, type SourcedServer } from './mcp-sources.ts'
import {
  isRecord,
  mergeServerPatch,
  parseIdRequest,
  parseReloadRequest,
  parseSetEnabledRequest,
  parseSnapshotRequest,
  parseToolRequest,
  parseUpsertRequest,
  projectTool,
  redactServer,
  serverIdFromToolName,
} from '../protocol.ts'

const MCP_PLUGIN = {
  name: 'mcp-client',
  inject: ['tools'],
  Config: McpConfig,
  apply: mcpApply,
}

type ManagedFiber = Pick<Fiber, 'await' | 'dispose'>

interface RuntimeState {
  readonly id: string
  fingerprint: string
  status: ManagedServerView['status']
  error?: string
  fiber?: ManagedFiber
}

interface AgentRestriction {
  readonly agent: Agent
  readonly dispose: () => void
}

/** The workspace registry surface the project scope reads, when composed. */
interface WorkspaceRegistryLike {
  list?: () => readonly { readonly id: string; readonly path: string; readonly title: string }[]
}

interface HostContext extends Context {
  settings: SettingsForms
  connection: HostConnectionHandle
  tools: ToolRuntime
}

interface ToolSchemaView {
  readonly name: string
  readonly description?: string
  readonly parameters: Record<string, unknown>
}

/**
 * The controller deliberately owns no browser state. Server definitions live in
 * the `mcp.json` scope files (or, for legacy installs, the Loader entry's
 * `Config`); the settings provider is the source of truth for the per-tool
 * policy. Every operation re-resolves the sources, then reconciles only the
 * affected server's Cordis child Fiber.
 */
export class McpManagerController {
  private readonly runtimes = new Map<string, RuntimeState>()
  private readonly restrictions: AgentRestriction[] = []
  private configWatchDispose: (() => void) | undefined
  private configPresentationDispose: (() => void) | undefined
  private fileWatchDispose: (() => void) | undefined
  private rpcDispose: (() => Promise<void>) | undefined
  private guardDispose: (() => void) | undefined
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly lifecycleQueues = new PerKeyQueue()
  private suppressRestrictionEvents = false
  private disposed = false
  /** Last resolved source set, invalidated by every write and file change. */
  private sourceCache: { readonly key: string; readonly value: MergedSources } | undefined
  /** Effective server ids from the last resolution, for the synchronous tool guard. */
  private effectiveIds: readonly string[] = []
  /** The project root every subsequent resolution and watch uses. */
  private selectedProjectPath: string | undefined
  /** The project root the installed file watch was resolved against. */
  private watchedProjectPath: string | undefined

  /**
   * @param ctx - the Host plugin context.
   * @param config - the entry's resolved volatile refs; every read goes through
   * them, so a committed entry edit is visible to the next operation.
   */
  constructor(private readonly ctx: HostContext, private readonly config: ManagerSettings) {}

  /** Register the RPC channel, tool guard, configuration watch, and servers. */
  async start(): Promise<void> {
    validateStoredDocument(this.document())
    // dsh 0.2 owns the entry document through the Loader entry. Volatile fields
    // are committed into the running Config refs and announce their changed
    // paths on the owning plugin fiber; another entry's update is not ours.
    this.configWatchDispose = this.ctx.on('loader/volatile-update', (paths) => {
      if (this.disposed || !paths.some(path => path[0] === 'servers' || path[0] === 'disabledTools')) return
      void this.reloadSources().catch(error => {
        this.ctx.logger.warn(`web-mcp-manager: configuration change reconciliation failed: ${String(error)}`)
      })
    })
    // The MCP panel is the purpose-built editor for this entry. Keep dsh's
    // generic generated form off to avoid exposing a second server editor.
    // The optional guard keeps lightweight controller test doubles compatible.
    if (typeof this.ctx.settings.configure === 'function') {
      this.configPresentationDispose = this.ctx.settings.configure({ auto: false })
    }
    this.guardDispose = this.ctx.tools.guard((execution) => {
      const serverId = serverIdFromToolName(execution.name, this.effectiveIds)
      if (serverId === undefined) return undefined
      const disabled = new Set(this.document().disabledTools[serverId] ?? [])
      return disabled.has(execution.name)
        ? 'MCP tool is disabled in the Web MCP panel'
        : undefined
    })
    this.rpcDispose = registerManagerRpcRoute(
      this.ctx,
      (endpoint, payload, signal) => this.handle(endpoint, payload, signal),
    )
    this.ctx.on('tools/change', () => {
      if (this.disposed || this.suppressRestrictionEvents) return
      this.refreshRestrictions()
    })
    // Keep the agent lifecycle hook's absent waterfall value explicit.
    this.ctx.on('agent/created', ({ agent }) => {
      this.installRestriction(agent)
      return undefined
    })
    this.ctx.on('agent/disposed', ({ agent }) => {
      this.removeRestriction(agent)
    })
    for (const agent of this.ctx.get('agents')?.list?.() ?? []) this.installRestriction(agent)
    await this.reconcileAll()
  }

  /** Dispose RPC, tool policy, file watch, and all child MCP clients after operations drain. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.configWatchDispose?.()
    this.configWatchDispose = undefined
    this.configPresentationDispose?.()
    this.configPresentationDispose = undefined
    this.fileWatchDispose?.()
    this.fileWatchDispose = undefined
    await this.lifecycleQueues.drain()
    await this.mutationTail.catch(() => {})
    for (const runtime of this.runtimes.values()) await this.disposeRuntime(runtime)
    this.runtimes.clear()
    for (const restriction of this.restrictions.splice(0)) restriction.dispose()
    this.guardDispose?.()
    this.guardDispose = undefined
    if (this.rpcDispose !== undefined) await this.rpcDispose()
    this.rpcDispose = undefined
  }

  /** Dispatch one authenticated Connection RPC endpoint. */
  async handle(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>> {
    if (this.disposed) return failure('aborted', 'MCP manager is disposed')
    if (signal.aborted) return failure('aborted', 'operation was cancelled')
    try {
      switch (endpoint as ManagerRpcEndpoint) {
        case 'snapshot':
          return success(await this.snapshot(parseSnapshotRequest(payload)))
        case 'upsertServer':
          return success(await this.upsert(parseUpsertRequest(payload)))
        case 'removeServer':
          return success(await this.remove(parseIdRequest(payload)))
        case 'setServerEnabled':
          return success(await this.setEnabled(parseSetEnabledRequest(payload)))
        case 'reloadServer':
          return success(await this.reload(parseReloadRequest(payload)))
        case 'setToolEnabled':
          return success(await this.setTool(parseToolRequest(payload)))
        default:
          return failure('bad-request', `unknown MCP manager endpoint ${JSON.stringify(endpoint)}`)
      }
    } catch (error) {
      return failure(classifyError(error), error instanceof Error ? error.message : String(error))
    }
  }

  /** The live entry document, read through the volatile refs on every call. */
  private document(): SettingsDocument {
    // Detached from the refs: schemastery projects a deeply-readonly value,
    // while the document this controller builds and writes back is mutable.
    return structuredClone({
      servers: this.config.servers.get() ?? {},
      disabledTools: this.config.disabledTools.get() ?? {},
    }) as SettingsDocument
  }

  private revision(): number {
    const descriptor = this.ctx.settings.describe({ redactSecrets: false })
      .find(entry => String(entry.ns) === String(MANAGER_NAMESPACE))
    return descriptor?.revision ?? 0
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.mutationTail.then(operation)
    this.mutationTail = task.then(() => undefined, () => undefined)
    return task
  }

  // ---------------------------------------------------------------- sources

  /** The active profile directory, as the settings provider reports it. */
  private profileDir(): string | undefined {
    const path = (this.ctx.settings as { documentPath?: unknown }).documentPath
    return typeof path === 'string' && path !== '' ? dirname(path) : undefined
  }

  /** Registered workspaces the panel may root the project scope at. */
  private workspaces(): WorkspaceView[] {
    const registry = this.ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
    try {
      return (registry?.list?.() ?? []).map(workspace => ({
        id: String(workspace.id), path: workspace.path, title: workspace.title,
      }))
    } catch {
      return []
    }
  }

  /**
   * Validate the project root the caller selected.
   *
   * The project scope writes a file, so an unvalidated path would turn the RPC
   * into arbitrary file creation. Only a canonical path the workspace registry
   * already owns is accepted.
   */
  private projectDir(target: ScopeTarget): string | undefined {
    if (target.projectPath === undefined) return this.selectedProjectPath
    const match = this.workspaces().find(workspace => workspace.path === target.projectPath)
    if (match === undefined) {
      throw new Error(`project path ${JSON.stringify(target.projectPath)} is not a registered workspace`)
    }
    return match.path
  }

  private scopeFiles(projectDir: string | undefined): ScopeFile[] {
    return resolveScopeFiles({ profileDir: this.profileDir(), projectDir })
  }

  /** Resolve (and memoize) the merged source view for one scope selection. */
  private async sourcesFor(target: ScopeTarget): Promise<MergedSources> {
    const projectDir = this.projectDir(target)
    this.selectedProjectPath = projectDir
    await this.ensureWatch(projectDir)
    const key = projectDir ?? ''
    if (this.sourceCache?.key === key) return this.sourceCache.value
    const scopes = await readScopeFiles(this.scopeFiles(projectDir))
    const value = mergeSources({
      scopes,
      entryServers: this.document().servers,
      entryPath: `${this.profileDir() === undefined ? 'cordis.yml' : join(this.profileDir() as string, 'cordis.patch.yml')} · web-mcp-manager`,
    })
    this.sourceCache = { key, value }
    this.effectiveIds = value.servers.map(server => server.id)
    return value
  }

  /** Drop the memoized sources and reconcile everything against the new state. */
  private async reloadSources(): Promise<void> {
    this.sourceCache = undefined
    await this.reconcileAll()
    this.refreshRestrictions()
  }

  /** Install the scope-file watch for the selected project root, once per root. */
  private async ensureWatch(projectDir: string | undefined): Promise<void> {
    if (this.disposed) return
    if (this.fileWatchDispose !== undefined && this.watchedProjectPath === projectDir) return
    this.fileWatchDispose?.()
    this.fileWatchDispose = undefined
    this.watchedProjectPath = projectDir
    try {
      this.fileWatchDispose = await watchScopeFiles(this.scopeFiles(projectDir), () => {
        void this.reloadSources().catch((error) => {
          this.ctx.logger.warn(`web-mcp-manager: mcp.json refresh failed: ${String(error)}`)
        })
      })
    } catch (error) {
      this.ctx.logger.warn(`web-mcp-manager: could not watch mcp.json sources: ${String(error)}`)
    }
  }

  /** The scope file a write targets, or `undefined` for the legacy entry scope. */
  private scopeFile(scope: McpScope, projectDir: string | undefined): ScopeFile | undefined {
    return this.scopeFiles(projectDir).find(file => file.scope === scope)
  }

  /**
   * Decide where one write lands.
   *
   * An explicit selection wins and must exist; otherwise a defined server keeps
   * its winning scope and a new server goes to the profile scope, which is
   * private to this profile and always writable. A deployment without a profile
   * directory (or without that scope) degrades to the user scope rather than
   * failing the write.
   */
  private writeScope(target: ScopeTarget, existing: SourcedServer | undefined, requested?: McpScope): McpScope {
    const projectDir = this.projectDir(target)
    const available = (scope: McpScope): boolean => scope === 'entry' || this.scopeFile(scope, projectDir) !== undefined
    const explicit = requested ?? target.scope
    const preferred = explicit ?? existing?.scope ?? 'profile'
    if (available(preferred)) return preferred
    if (explicit !== undefined) throw new Error(`the ${JSON.stringify(explicit)} scope is not available in this profile`)
    for (const fallback of ['profile', 'user', 'entry'] as const) if (available(fallback)) return fallback
    throw new Error('no writable MCP scope is available in this profile')
  }

  /** Write one server definition into a non-entry scope file. */
  private async writeScopedServer(
    scope: McpScope,
    projectDir: string | undefined,
    id: string,
    server: StoredServer | null,
  ): Promise<void> {
    const file = this.scopeFile(scope, projectDir)
    if (file === undefined) throw new Error(`the ${JSON.stringify(scope)} scope is not available in this profile`)
    await mutateScopeFile(file.path, document => withServer(document, id, server))
    this.sourceCache = undefined
  }

  // ------------------------------------------------------------- mutations

  private async upsert(request: UpsertServerRequest): Promise<Snapshot> {
    return this.enqueueMutation(async () => {
      const merged = await this.sourcesFor(request)
      const existing = merged.servers.find(server => server.id === request.server.id)
      const scope = this.writeScope(request, existing, request.server.scope)
      // Editing a definition keeps its own scope as the base; a cross-scope
      // write starts from the winning definition so nothing is silently lost.
      const base = existing?.server
      const nextServer = mergeServerPatch(base, request.server)
      this.assertToolNamespaceAvailable(nextServer.id, existing !== undefined)

      if (scope === 'entry') {
        const current = this.document()
        this.assertRevision(request.expectedRevision)
        await this.write({
          servers: { ...current.servers, [nextServer.id]: nextServer },
          disabledTools: { ...current.disabledTools },
        }, request.expectedRevision)
      } else {
        await this.writeScopedServer(scope, this.projectDir(request), nextServer.id, nextServer)
      }
      // 不等待生命周期,状态由轮询呈现
      void this.reconcileServer(nextServer.id)
      return this.snapshot({ projectPath: request.projectPath })
    })
  }

  private async remove(request: { id: string; expectedRevision?: number } & ScopeTarget): Promise<Snapshot> {
    if (request.expectedRevision === undefined) throw new TypeError('expectedRevision is required')
    const expectedRevision = request.expectedRevision
    return this.enqueueMutation(async () => {
      const merged = await this.sourcesFor(request)
      const existing = merged.servers.find(server => server.id === request.id)
      if (existing === undefined) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`)
      const scope = this.writeScope(request, existing)
      const projectDir = this.projectDir(request)

      if (scope === 'entry') {
        this.assertRevision(expectedRevision)
        const current = this.document()
        const servers = { ...current.servers }
        Reflect.deleteProperty(servers, request.id)
        const disabledTools = { ...current.disabledTools }
        Reflect.deleteProperty(disabledTools, request.id)
        await this.write({ servers, disabledTools }, expectedRevision)
      } else {
        // The definition is what the user asked to delete; the per-tool policy
        // is this profile's own bookkeeping and is cleaned up afterwards.
        await this.writeScopedServer(scope, projectDir, request.id, null)
        const current = this.document()
        if (current.disabledTools[request.id] !== undefined) {
          this.assertRevision(expectedRevision)
          const disabledTools = { ...current.disabledTools }
          Reflect.deleteProperty(disabledTools, request.id)
          await this.write({ servers: { ...current.servers }, disabledTools }, expectedRevision)
        }
      }
      // 不等待生命周期,状态由轮询呈现
      void this.reconcileServer(request.id)
      return this.snapshot({ projectPath: request.projectPath })
    })
  }

  private async setEnabled(request: SetServerEnabledRequest): Promise<Snapshot> {
    return this.enqueueMutation(async () => {
      const merged = await this.sourcesFor(request)
      const existing = merged.servers.find(server => server.id === request.id)
      if (existing === undefined) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`)
      const scope = this.writeScope(request, existing)
      const nextServer: StoredServer = { ...existing.server, enabled: request.enabled }
      if (scope === 'entry') {
        this.assertRevision(request.expectedRevision)
        const current = this.document()
        await this.write({
          servers: { ...current.servers, [request.id]: nextServer },
          disabledTools: { ...current.disabledTools },
        }, request.expectedRevision)
      } else {
        await this.writeScopedServer(scope, this.projectDir(request), request.id, nextServer)
      }
      // 不等待生命周期,状态由轮询呈现
      void this.reconcileServer(request.id)
      return this.snapshot({ projectPath: request.projectPath })
    })
  }

  private async reload(request: ReloadServerRequest): Promise<Snapshot> {
    const merged = await this.sourcesFor({})
    if (!merged.servers.some(server => server.id === request.id)) {
      throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`)
    }
    await this.reconcileServer(request.id, true)
    return this.snapshot({})
  }

  private async setTool(request: SetToolEnabledRequest): Promise<Snapshot> {
    return this.enqueueMutation(async () => {
      const current = this.document()
      // Only this controller's settings namespace is mutable.  A tool with an
      // `mcp__...` name may have been registered by another Loader entry; it
      // is shown, if at all, as read-only and must never create a policy row.
      if (!this.effectiveIds.includes(request.serverId)) {
        throw new Error(`tool ${JSON.stringify(request.name)} is not registered by server ${JSON.stringify(request.serverId)}`)
      }
      const tool = (await this.snapshot({ projectPath: request.projectPath })).tools
        .find(candidate => candidate.name === request.name)
      if (tool === undefined || tool.serverId !== request.serverId) {
        throw new Error(`tool ${JSON.stringify(request.name)} is not registered by server ${JSON.stringify(request.serverId)}`)
      }
      this.assertRevision(request.expectedRevision)
      const disabled = new Set(current.disabledTools[request.serverId] ?? [])
      if (request.enabled) disabled.delete(request.name)
      else disabled.add(request.name)
      const disabledTools = { ...current.disabledTools }
      if (disabled.size === 0) Reflect.deleteProperty(disabledTools, request.serverId)
      else disabledTools[request.serverId] = [...disabled].sort()
      await this.write({ servers: { ...current.servers }, disabledTools }, request.expectedRevision)
      this.refreshRestrictions()
      return this.snapshot({ projectPath: request.projectPath })
    })
  }

  /**
   * Commit one whole entry document through `settings.replace()`.
   *
   * `replace()` — not the path-addressed `settings.mutate()` — is the right
   * member here. `mutate()` exists for a caller holding an INCOMPLETE view of a
   * namespace (the redacted wire view), which must name only the fields it means
   * so the write cannot silently drop the `role('secret')` values it never
   * received. This controller reads the entry's volatile refs, i.e. the resolved
   * config with secrets included, so it restates every server anyway; `replace()`
   * then makes the write one all-or-nothing commit guarded by `expectedRevision`.
   *
   * `mcp.json` writes carry no revision: the file has no revision, and
   * `mutateScopeFile` re-reads it inside the cross-process lock instead.
   */
  private async write(next: SettingsDocument, expectedRevision: number): Promise<void> {
    if (!this.ctx.settings.writable) throw new Error('settings provider is read-only')
    validateStoredDocument(next)
    await this.ctx.settings.replace(MANAGER_NAMESPACE, next, expectedRevision)
  }

  /**
   * Fail fast before the next document is rebuilt. `settings.replace()` runs the
   * same revision check at write time; raising the settings service's own error
   * class here keeps one conflict identity across the whole path, so
   * {@link classifyError} matches it structurally instead of by message text.
   */
  private assertRevision(expected: number): void {
    const actual = this.revision()
    if (actual !== expected) throw new SettingsConflictError(MANAGER_NAMESPACE, expected, actual)
  }

  // ------------------------------------------------------------- lifecycle

  private async reconcileAll(): Promise<void> {
    const merged = await this.sourcesFor({})
    const ids = new Set(merged.servers.map(server => server.id))
    await Promise.all([...ids].map(id => this.reconcileServer(id)))
    for (const id of this.runtimes.keys()) {
      if (!ids.has(id)) await this.reconcileServer(id)
    }
    this.refreshRestrictions()
  }

  /** Serialize one server's lifecycle operations, including reload/dispose, per server id. */
  private reconcileServer(id: string, force = false): Promise<void> {
    return this.lifecycleQueues.enqueue(id, async () => {
      if (this.disposed) return
      const source = (await this.sourcesFor({})).servers.find(candidate => candidate.id === id)
      const config = source?.server
      let runtime = this.runtimes.get(id)
      if (runtime === undefined) {
        runtime = { id, fingerprint: '', status: 'waiting' }
        this.runtimes.set(id, runtime)
      }
      const fingerprint = config === undefined ? '' : stableFingerprint(config)
      if (config === undefined || !config.enabled) {
        await this.disposeRuntime(runtime)
        runtime.status = config === undefined ? 'waiting' : 'disabled'
        runtime.error = undefined
        runtime.fingerprint = fingerprint
        if (config === undefined) this.runtimes.delete(id)
        return
      }
      if (!force && runtime.fiber !== undefined && runtime.fingerprint === fingerprint) return
      await this.disposeRuntime(runtime)
      runtime.status = 'loading'
      runtime.error = undefined
      runtime.fingerprint = fingerprint
      let fiber: ManagedFiber | undefined
      try {
        // `${…}` templates resolve here and nowhere else: the panel and the
        // `mcp.json` file keep the template, the MCP client gets the value.
        const expanded = expandServer(config, process.env)
        if (expanded.missing.length > 0) {
          throw new Error(`missing environment ${expanded.missing.length === 1 ? 'variable' : 'variables'}: ${expanded.missing.join(', ')}`)
        }
        fiber = this.ctx.plugin(MCP_PLUGIN, toMcpConfig(expanded.server))
        runtime.fiber = fiber
        await withTimeout(fiber.await(), START_TIMEOUT_MS, `MCP server ${id} startup timed out after ${START_TIMEOUT_MS}ms`)
        if (runtime.fiber === fiber) runtime.status = 'loaded'
      } catch (error) {
        if (runtime.fiber !== fiber) return
        const message = error instanceof Error ? error.message : String(error)
        runtime.status = 'failed'
        runtime.error = message
        // 超时后 fiber 可能仍在启动:保留引用供后续 dispose 清理;真正的启动失败则放弃引用。
        if (!message.includes('timed out')) runtime.fiber = undefined
      }
      this.refreshRestrictions()
    })
  }

  private async disposeRuntime(runtime: RuntimeState): Promise<void> {
    const fiber = runtime.fiber
    runtime.fiber = undefined
    if (fiber === undefined) return
    try {
      await withTimeout(fiber.dispose(), DISPOSE_TIMEOUT_MS, `failed to dispose server ${runtime.id} within ${DISPOSE_TIMEOUT_MS}ms`)
    } catch (error) {
      this.ctx.logger.warn(`web-mcp-manager: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // -------------------------------------------------------------- snapshot

  private async snapshot(request: SnapshotRequest): Promise<Snapshot> {
    const merged = await this.sourcesFor(request)
    const schemas = this.readToolSchemas()
    const tools = this.projectTools(schemas, merged)
    const byServer = new Map<string, number>()
    for (const tool of tools) byServer.set(tool.serverId, (byServer.get(tool.serverId) ?? 0) + 1)
    const servers = [...merged.servers].sort((a, b) => a.id.localeCompare(b.id)).map((source) => {
      const runtime = this.runtimes.get(source.id)
      const error = runtime?.error === undefined ? undefined : redactRuntimeError(runtime.error, source.server)
      return redactServer(
        source.server,
        source.server.enabled ? runtime?.status ?? 'waiting' : 'disabled',
        byServer.get(source.id) ?? 0,
        error,
        source.scope,
        source.shadowed.map(entry => entry.scope),
        serverTemplates(source.server),
      )
    })
    const projectPath = this.selectedProjectPath
    return {
      revision: this.revision(),
      writable: this.ctx.settings.writable,
      servers,
      tools,
      readonlyEntries: await this.readonlyEntries(),
      sources: merged.sources as McpSourceView[],
      workspaces: this.workspaces(),
      ...projectPath === undefined ? {} : { projectPath },
    }
  }

  private readToolSchemas(): ToolSchemaView[] {
    try { return this.ctx.tools.schemas() }
    catch (error) {
      this.ctx.logger.warn(`web-mcp-manager: failed to read tool schemas: ${String(error)}`)
      return []
    }
  }

  private projectTools(schemas: ToolSchemaView[], merged: MergedSources): ManagedToolView[] {
    const disabled = new Set(Object.values(this.document().disabledTools).flat())
    const serverIds = merged.servers.map(server => server.id)
    return schemas
      .map(schema => projectTool(schema, disabled, serverIds))
      .filter((tool): tool is ManagedToolView => tool !== undefined && serverIds.includes(tool.serverId))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private async readonlyEntries(): Promise<ReadonlyMcpEntry[]> {
    const inventory = this.ctx.get('pluginInventory') as { list?: () => PluginInventorySnapshot | Promise<PluginInventorySnapshot> } | undefined
    if (inventory?.list === undefined) return []
    try {
      const value = await inventory.list()
      const loaderEntries: ReadonlyMcpEntry[] = value.entries
        .filter(entry => entry.moduleName !== PLUGIN_MODULE_NAME && entry.moduleName !== LEGACY_PLUGIN_MODULE_NAME && entry.moduleName.toLocaleLowerCase().includes('mcp'))
        .map(entry => ({ ...entry, source: 'loader' as const }))
      const presetEntries: ReadonlyMcpEntry[] = []
      for (const preset of value.agentPresets ?? []) {
        for (const [index, entry] of preset.rows.entries()) {
          if (!entry.moduleName.toLocaleLowerCase().includes('mcp')) continue
          presetEntries.push({
            entryId: `preset:${preset.id}:${entry.entryId ?? String(index)}`,
            moduleName: entry.moduleName,
            source: 'preset',
            sourceId: preset.id,
            ...preset.name === undefined ? {} : { sourceName: preset.name },
            enabled: entry.enabled,
            ...entry.condition === undefined ? {} : { condition: entry.condition },
            fiberPhase: entry.fiberPhase,
          })
        }
      }
      return [...loaderEntries, ...presetEntries]
    } catch { return [] }
  }

  private assertToolNamespaceAvailable(serverId: string, editingExisting: boolean): void {
    if (editingExisting) return
    const conflict = this.readToolSchemas().some(schema => serverIdFromToolName(schema.name, [serverId]) === serverId)
    if (conflict) throw new Error(`MCP server id ${JSON.stringify(serverId)} is already used by a loaded MCP tool`)
  }

  // ------------------------------------------------------------ tool policy

  private installRestriction(agent: Agent): void {
    if (this.restrictions.some(entry => entry.agent === agent)) return
    const tools = (agent.ctx as unknown as { tools?: ToolRuntime }).tools
    if (tools === undefined) return
    const names = this.disabledToolNames().filter(name => this.ctx.tools.get(name, agent) !== undefined)
    if (names.length === 0) return
    const previousSuppression = this.suppressRestrictionEvents
    this.suppressRestrictionEvents = true
    try {
      const dispose = tools.restrict({ deny: names })
      this.restrictions.push({ agent, dispose })
    } catch (error) {
      this.ctx.logger.warn(`web-mcp-manager: could not install restrictions for agent ${String(agent.id)}: ${String(error)}`)
    } finally {
      this.suppressRestrictionEvents = previousSuppression
    }
  }

  private removeRestriction(agent: Agent): void {
    for (let index = this.restrictions.length - 1; index >= 0; index--) {
      const entry = this.restrictions[index]
      if (entry?.agent !== agent) continue
      const previousSuppression = this.suppressRestrictionEvents
      this.suppressRestrictionEvents = true
      try { entry.dispose() } finally { this.suppressRestrictionEvents = previousSuppression }
      this.restrictions.splice(index, 1)
    }
  }

  private refreshRestrictions(): void {
    if (this.disposed || this.suppressRestrictionEvents) return
    const previousSuppression = this.suppressRestrictionEvents
    this.suppressRestrictionEvents = true
    try {
      const agents = this.ctx.get('agents')?.list?.() ?? []
      for (const restriction of this.restrictions.splice(0)) restriction.dispose()
      for (const agent of agents) this.installRestriction(agent)
    } finally {
      this.suppressRestrictionEvents = previousSuppression
    }
  }

  private disabledToolNames(): string[] {
    return [...new Set(Object.values(this.document().disabledTools).flat())]
  }
}

/** 启动等待上限,防止挂起的连接永久拖住该服务的后续生命周期操作。 */
const START_TIMEOUT_MS = 30_000
/** 卸载上限,防止子进程清理异常阻塞插件卸载。 */
const DISPOSE_TIMEOUT_MS = 15_000

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
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

function stableFingerprint(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function redactRuntimeError(error: string, server: StoredServer): string {
  let result = error
  for (const secret of [...Object.values(server.env), ...Object.values(server.headers)]) {
    if (secret.length > 0) result = result.split(secret).join('[redacted]')
  }
  return result
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]))
}

function success<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

function failure(code: RpcError['code'], message: string): RpcResult<never> {
  return { ok: false, error: { code, message } }
}

function classifyError(error: unknown): RpcError['code'] {
  // Structural first: the settings service raises SettingsConflictError from both
  // this controller's fail-fast check and its own write-time check, so one class
  // test covers the whole conflict path.
  if (error instanceof SettingsConflictError) return 'conflict'
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'MCP_CONFIG_VALIDATION') return 'validation'
  // Cross-instance fallback: a duplicated settings module would defeat the
  // `instanceof` above while still carrying the service's stable machine code.
  if (code === 'SETTINGS_CONFLICT') return 'conflict'
  if (error instanceof TypeError) return 'bad-request'
  if (typeof error === 'object' && error !== null && 'message' in error && String((error as { message: unknown }).message).includes('read-only')) return 'not-writable'
  if (typeof error === 'object' && error !== null && 'message' in error && /not found|not registered/u.test(String((error as { message: unknown }).message))) return 'not-found'
  if (error instanceof Error && /needs a command|invalid URL|must be|unsupported MCP transport|contains an empty|already used by|invalid JSON|is not a registered workspace|missing environment/u.test(error.message)) return 'validation'
  return 'internal'
}
