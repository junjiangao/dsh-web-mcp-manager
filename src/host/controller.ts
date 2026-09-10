/** Host-side settings, RPC, MCP lifecycle, and tool policy controller. */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import { apply as mcpApply, Config as McpConfig } from '@deepseek-ai/dsh-mcp-client'
import type { SettingsScope, SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { SettingsDocument, StoredServer, ManagedServerView, ManagedToolView, ReadonlyMcpEntry, RpcError, RpcResult } from '../types.ts'
import {
  LEGACY_PLUGIN_MODULE_NAME,
  MCP_MANAGER_CHANNEL,
  PLUGIN_MODULE_NAME,
  type ManagerRpcEndpoint,
  type ReloadServerRequest,
  type SetServerEnabledRequest,
  type SetToolEnabledRequest,
  type SnapshotRequest,
  type Snapshot,
  type UpsertServerRequest,
} from '../types.ts'
import { MANAGER_NAMESPACE, ManagerSettingsSchema, defaultDocument, validateStoredDocument } from '../settings.ts'
import { toMcpConfig } from './mcp-config.ts'
import { PerKeyQueue } from './keyed-queue.ts'
import { registerManagerRpcRoute } from './rpc-route.ts'
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

interface HostContext extends Context {
  settings: SettingsProvider
  connection: HostConnectionHandle
  tools: ToolRuntime
  webServer: WebServer
}

interface ToolSchemaView {
  readonly name: string
  readonly description?: string
  readonly parameters: Record<string, unknown>
}

/**
 * The controller deliberately owns no browser state. The settings provider is
 * the source of truth; every operation re-reads its revision before writing,
 * then reconciles only the affected server's Cordis child Fiber.
 */
export class McpManagerController {
  private readonly runtimes = new Map<string, RuntimeState>()
  private readonly restrictions: AgentRestriction[] = []
  private scope: SettingsScope<SettingsDocument> | undefined
  private settingsWatchDispose: (() => void) | undefined
  private rpcDispose: (() => Promise<void>) | undefined
  private guardDispose: (() => void) | undefined
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly lifecycleQueues = new PerKeyQueue()
  private suppressRestrictionEvents = false
  private disposed = false

  constructor(private readonly ctx: HostContext) {}

  /** Register the settings namespace, RPC channel, guard, and initial servers. */
  async start(): Promise<void> {
    this.scope = this.ctx.settings.register(MANAGER_NAMESPACE, ManagerSettingsSchema, {
      base: defaultDocument(),
      validate: validateStoredDocument,
    })
    this.settingsWatchDispose = this.scope.watch(() => {
      if (this.disposed) return
      return this.reconcileAll().catch(error => {
        this.ctx.logger.warn(`web-mcp-manager: settings change reconciliation failed: ${String(error)}`)
      })
    })
    this.guardDispose = this.ctx.tools.guard((execution) => {
      const serverId = serverIdFromToolName(execution.name, Object.keys(this.document().servers))
      if (serverId === undefined) return undefined
      const disabled = new Set(this.document().disabledTools[serverId] ?? [])
      return disabled.has(execution.name)
        ? 'MCP tool is disabled in the Web MCP panel'
        : undefined
    })
    this.rpcDispose = registerManagerRpcRoute(
      this.ctx,
      MCP_MANAGER_CHANNEL,
      (endpoint, payload, signal) => this.handle(endpoint, payload, signal),
    )
    this.ctx.on('tools/change', () => {
      if (this.disposed || this.suppressRestrictionEvents) return
      this.refreshRestrictions()
    })
    this.ctx.on('agent/created', ({ agent }) => {
      this.installRestriction(agent)
    })
    this.ctx.on('agent/disposed', ({ agent }) => {
      this.removeRestriction(agent)
    })
    for (const agent of this.ctx.get('agents')?.list?.() ?? []) this.installRestriction(agent)
    await this.reconcileAll()
  }

  /** Dispose RPC, tool policy, and all child MCP clients after operations drain. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.settingsWatchDispose?.()
    this.settingsWatchDispose = undefined
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

  private document(): SettingsDocument {
    const scope = this.scope
    if (scope === undefined) return defaultDocument()
    return scope.get()
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

  private async upsert(request: UpsertServerRequest): Promise<Snapshot> {
    return this.enqueueMutation(async () => {
      this.assertRevision(request.expectedRevision)
      const current = this.document()
      const nextServer = mergeServerPatch(current.servers[request.server.id], request.server)
      this.assertToolNamespaceAvailable(nextServer.id, current.servers[nextServer.id] !== undefined)
      const next: SettingsDocument = {
        servers: { ...current.servers, [nextServer.id]: nextServer },
        disabledTools: { ...current.disabledTools },
      }
      await this.write(next, request.expectedRevision)
      // 不等待生命周期,状态由轮询呈现
      void this.reconcileServer(nextServer.id)
      return this.snapshot({})
    })
  }

  private async remove(request: { id: string; expectedRevision?: number }): Promise<Snapshot> {
    if (request.expectedRevision === undefined) throw new TypeError('expectedRevision is required')
    return this.enqueueMutation(async () => {
      this.assertRevision(request.expectedRevision as number)
      const current = this.document()
      if (current.servers[request.id] === undefined) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`)
      const servers = { ...current.servers }
      Reflect.deleteProperty(servers, request.id)
      const disabledTools = { ...current.disabledTools }
      Reflect.deleteProperty(disabledTools, request.id)
      await this.write({ servers, disabledTools }, request.expectedRevision as number)
      // 不等待生命周期,状态由轮询呈现
      void this.reconcileServer(request.id)
      return this.snapshot({})
    })
  }

  private async setEnabled(request: SetServerEnabledRequest): Promise<Snapshot> {
    return this.enqueueMutation(async () => {
      this.assertRevision(request.expectedRevision)
      const current = this.document()
      const server = current.servers[request.id]
      if (server === undefined) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`)
      const nextServer = { ...server, enabled: request.enabled }
      await this.write({
        servers: { ...current.servers, [request.id]: nextServer },
        disabledTools: { ...current.disabledTools },
      }, request.expectedRevision)
      // 不等待生命周期,状态由轮询呈现
      void this.reconcileServer(request.id)
      return this.snapshot({})
    })
  }

  private async reload(request: ReloadServerRequest): Promise<Snapshot> {
    const current = this.document().servers[request.id]
    if (current === undefined) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`)
    await this.reconcileServer(request.id, true)
    return this.snapshot({})
  }

  private async setTool(request: SetToolEnabledRequest): Promise<Snapshot> {
    return this.enqueueMutation(async () => {
      this.assertRevision(request.expectedRevision)
      const current = this.document()
      // Only this controller's settings namespace is mutable.  A tool with an
      // `mcp__...` name may have been registered by another Loader entry; it
      // is shown, if at all, as read-only and must never create a policy row.
      if (current.servers[request.serverId] === undefined) {
        throw new Error(`tool ${JSON.stringify(request.name)} is not registered by server ${JSON.stringify(request.serverId)}`)
      }
      const tool = (await this.snapshot({})).tools.find(candidate => candidate.name === request.name)
      if (tool === undefined || tool.serverId !== request.serverId) {
        throw new Error(`tool ${JSON.stringify(request.name)} is not registered by server ${JSON.stringify(request.serverId)}`)
      }
      const disabled = new Set(current.disabledTools[request.serverId] ?? [])
      if (request.enabled) disabled.delete(request.name)
      else disabled.add(request.name)
      const disabledTools = { ...current.disabledTools }
      if (disabled.size === 0) Reflect.deleteProperty(disabledTools, request.serverId)
      else disabledTools[request.serverId] = [...disabled].sort()
      await this.write({ servers: { ...current.servers }, disabledTools }, request.expectedRevision)
      this.refreshRestrictions()
      return this.snapshot({})
    })
  }

  private async write(next: SettingsDocument, expectedRevision: number): Promise<void> {
    if (!this.ctx.settings.writable) throw new Error('settings provider is read-only')
    validateStoredDocument(next)
    await this.ctx.settings.replace(MANAGER_NAMESPACE, next, expectedRevision)
  }

  private assertRevision(expected: number): void {
    const actual = this.revision()
    if (actual !== expected) {
      const error = new Error(`MCP settings changed since this page was read (expected revision ${String(expected)}, now ${String(actual)})`)
      Object.assign(error, { code: 'SETTINGS_CONFLICT' })
      throw error
    }
  }

  private async reconcileAll(): Promise<void> {
    const ids = new Set(Object.keys(this.document().servers))
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
      const config = this.document().servers[id]
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
        fiber = this.ctx.plugin(MCP_PLUGIN, toMcpConfig(config))
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

  private async snapshot(_request: SnapshotRequest): Promise<Snapshot> {
    const document = this.document()
    const schemas = this.readToolSchemas()
    const tools = this.projectTools(schemas, document)
    const byServer = new Map<string, number>()
    for (const tool of tools) byServer.set(tool.serverId, (byServer.get(tool.serverId) ?? 0) + 1)
    const servers = Object.values(document.servers).sort((a, b) => a.id.localeCompare(b.id)).map((server) => {
      const runtime = this.runtimes.get(server.id)
      const error = runtime?.error === undefined ? undefined : redactRuntimeError(runtime.error, server)
      return redactServer(server, server.enabled ? runtime?.status ?? 'waiting' : 'disabled', byServer.get(server.id) ?? 0, error)
    })
    return {
      revision: this.revision(),
      writable: this.ctx.settings.writable,
      servers,
      tools,
      readonlyEntries: await this.readonlyEntries(),
    }
  }

  private readToolSchemas(): ToolSchemaView[] {
    try { return this.ctx.tools.schemas() }
    catch (error) {
      this.ctx.logger.warn(`web-mcp-manager: failed to read tool schemas: ${String(error)}`)
      return []
    }
  }

  private projectTools(schemas: ToolSchemaView[], document: SettingsDocument): ManagedToolView[] {
    const disabled = new Set(Object.values(document.disabledTools).flat())
    const serverIds = Object.keys(document.servers)
    return schemas
      .map(schema => projectTool(schema, disabled, serverIds))
      .filter((tool): tool is ManagedToolView => tool !== undefined && document.servers[tool.serverId] !== undefined)
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
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'MCP_CONFIG_VALIDATION') return 'validation'
  if (code === 'SETTINGS_CONFLICT') return 'conflict'
  if (error instanceof TypeError) return 'bad-request'
  if (typeof error === 'object' && error !== null && 'message' in error && String((error as { message: unknown }).message).includes('read-only')) return 'not-writable'
  if (typeof error === 'object' && error !== null && 'message' in error && /not found|not registered/u.test(String((error as { message: unknown }).message))) return 'not-found'
  if (error instanceof Error && /needs a command|invalid URL|must be|unsupported MCP transport|contains an empty|already used by/u.test(error.message)) return 'validation'
  return 'internal'
}
