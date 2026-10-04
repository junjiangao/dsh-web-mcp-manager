/** Host settings schema and defaults for the MCP manager namespace. */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ResolvedReconnectPolicy } from '@deepseek-ai/dsh-mcp-client'
import type { SettingsNamespace as DshSettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {
  ReconnectPolicy, ServerTransport, SettingsDocument, StoredReconnectPolicy, StoredServer,
} from './types.ts'
import { MCP_MANAGER_NAMESPACE } from './types.ts'
import { validateMcpConfig } from './host/mcp-config.ts'

export const MANAGER_NAMESPACE = MCP_MANAGER_NAMESPACE as DshSettingsNamespace

/**
 * Largest delay Node schedules without clamping it to one millisecond.
 *
 * Same value as `@deepseek-ai/dsh-timeout`'s `MAX_TIMER_DELAY_MS`, inlined so
 * the plugin does not carry a peer dependency for one constant (`dsh-timeout`'s
 * primitives only notify through AbortSignals and are not otherwise usable
 * here). `tests/config-validation.spec.ts` checks the bounded fields against
 * this number.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647

// 数值与 @deepseek-ai/dsh-mcp-client 的 RECONNECT_DEFAULTS 一致,由 tests/config-validation.spec.ts 奇偶校验守护。
export const DEFAULT_RECONNECT: StoredReconnectPolicy = Object.freeze({
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 10,
})
const _reconnectDefaultsCheck: ResolvedReconnectPolicy = DEFAULT_RECONNECT

export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

const ReconnectSchema = z.object({
  enabled: z.boolean().default(DEFAULT_RECONNECT.enabled),
  initialDelayMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RECONNECT.initialDelayMs),
  maxDelayMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RECONNECT.maxDelayMs),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_RECONNECT.maxAttempts),
})

/**
 * Secret values sit below a dictionary node rather than inside a union. This
 * lets the Host settings redactor enumerate every env/header key while the
 * browser receives only `SecretState` records assembled by the manager.
 */
const ServerSchema = z.object({
  id: z.string().required(),
  label: z.string().default(''),
  enabled: z.boolean().default(true),
  transport: z.union(['stdio', 'streamable-http'] as const).default('stdio'),
  command: z.string().default(''),
  args: z.array(z.string()).default([]),
  cwd: z.string().default(''),
  url: z.string().default(''),
  env: z.dict(z.string().role('secret')).default({}),
  headers: z.dict(z.string().role('secret')).default({}),
  envSensitive: z.array(z.string()).default([]),
  headerSensitive: z.array(z.string()).default([]),
  toolCallTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
  reconnect: ReconnectSchema,
})

/**
 * The Loader entry's schema, which is also the form the settings page renders.
 *
 * dsh 0.2.0-rc.1 owns plugin configuration through the entry itself: there is no
 * `settings.register()` any more, so the two top-level fields are declared
 * `volatile()` — the whole subtree of each becomes live, which is what lets a
 * committed edit reach the running controller without re-registering it.
 */
export const Config = z.object({
  servers: z.dict(ServerSchema).default({}).volatile(),
  disabledTools: z.dict(z.array(z.string())).default({}).volatile(),
}) as z<ManagerSettingsInput, ManagerSettings>

/** The schema under its historical name; both refer to the same entry config. */
export const ManagerSettingsSchema = Config

/** The shape a composition file writes: plain values, every field optional. */
export interface ManagerSettingsInput {
  /** Configured MCP servers keyed by id. */
  servers?: Record<string, StoredServer>
  /** Per-server disabled tool names. */
  disabledTools?: Record<string, string[]>
}

/**
 * Resolved manager config as the Host hands it to `apply`: each field is a
 * live ref, read per operation rather than captured once at load.
 */
export interface ManagerSettings {
  /** Configured MCP servers keyed by id. */
  servers: Volatile<Record<string, StoredServer>>
  /** Per-server disabled tool names. */
  disabledTools: Volatile<Record<string, string[]>>
}

export function defaultServer(id: string): StoredServer {
  return {
    id,
    label: '',
    enabled: true,
    transport: 'stdio',
    command: '',
    args: [],
    cwd: '',
    url: '',
    env: {},
    headers: {},
    envSensitive: [],
    headerSensitive: [],
    toolCallTimeoutMs: DEFAULT_TOOL_CALL_TIMEOUT_MS,
    reconnect: { ...DEFAULT_RECONNECT },
  }
}

export function defaultDocument(): SettingsDocument {
  return { servers: {}, disabledTools: {} }
}

export function validateStoredDocument(value: SettingsDocument): void {
  for (const [key, server] of Object.entries(value.servers)) {
    validateServerId(key)
    if (server.id !== key) throw new Error(`MCP server id ${JSON.stringify(server.id)} does not match its settings key ${JSON.stringify(key)}`)
    validateServerConfig(server)
  }
  for (const [id, tools] of Object.entries(value.disabledTools)) {
    validateServerId(id)
    if (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string' || tool.length === 0)) {
      throw new Error(`disabledTools[${JSON.stringify(id)}] must be a list of tool names`)
    }
  }
}

export function validateServerId(id: string): void {
  // The dash is escaped/leading so the character class never forms a
  // descending range: browsers compile `pattern` attributes with the
  // UnicodeSets (v) flag, where `[A-Za-z0-9_-]` is a SyntaxError.
  if (!/^[-A-Za-z0-9_]{1,32}$/.test(id)) {
    throw new TypeError('server id must match [-A-Za-z0-9_]{1,32}')
  }
}

export function validateServerConfig(server: StoredServer): void {
  validateServerId(server.id)
  if (server.label.length > 120) throw new Error('server label must be at most 120 characters')
  if (server.transport === 'stdio') {
    if (server.command.trim() === '') throw new Error(`stdio server ${JSON.stringify(server.id)} needs a command`)
  } else {
    if (server.url.trim() === '') throw new Error(`streamable-http server ${JSON.stringify(server.id)} needs a URL`)
    // A `${…}` template is resolved by the Host just before mounting, so a URL
    // that is still a template cannot be parsed here; the expanded value is
    // validated by the manager's own projection instead.
    if (!isTemplatedValue(server.url)) {
      let url: URL
      try { url = new URL(server.url) } catch { throw new Error(`streamable-http server ${JSON.stringify(server.id)} has an invalid URL`) }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`streamable-http server ${JSON.stringify(server.id)} URL must use http or https`)
      }
    }
  }
  if (!Number.isSafeInteger(server.toolCallTimeoutMs) || server.toolCallTimeoutMs < 1 || server.toolCallTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`server ${JSON.stringify(server.id)} toolCallTimeoutMs must be an integer from 1 to ${String(MAX_TIMER_DELAY_MS)}`)
  }
  validateReconnect(server.reconnect)
  for (const [key, value] of Object.entries(server.env)) {
    if (key.trim() === '') throw new Error(`server ${JSON.stringify(server.id)} contains an empty environment key`)
    if (typeof value !== 'string') throw new Error(`server ${JSON.stringify(server.id)} environment values must be strings`)
  }
  for (const [key, value] of Object.entries(server.headers)) {
    if (key.trim() === '') throw new Error(`server ${JSON.stringify(server.id)} contains an empty header key`)
    if (typeof value !== 'string') throw new Error(`server ${JSON.stringify(server.id)} header values must be strings`)
  }
  validateSensitiveKeys(server.id, 'envSensitive', server.envSensitive)
  validateSensitiveKeys(server.id, 'headerSensitive', server.headerSensitive)
  // 委托给 mcp-client 的 Config schema 校验 args/env/headers 形状与重连边界。
  validateMcpConfig(server)
}

/** `${env:NAME}` / `${NAME}` / `${NAME:-fallback}`, matching `./host/interpolate.ts`. */
const TEMPLATE_PATTERN = /\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}/u

/**
 * Whether a stored value is still an unresolved environment template.
 *
 * A template is legal in `mcp.json` and resolved by the Host immediately before
 * it mounts the server, so shape checks that need the final text (URL parsing)
 * are deferred until then.
 * @param value - the stored value.
 * @returns true when the value carries at least one reference.
 */
export function isTemplatedValue(value: string): boolean {
  return TEMPLATE_PATTERN.test(value)
}

/** 校验敏感键列表:格式、去重;不要求键必须存在于 env/headers(容忍手工编辑的孤儿标记)。 */
function validateSensitiveKeys(serverId: string, field: 'envSensitive' | 'headerSensitive', keys: readonly string[]): void {
  const seen = new Set<string>()
  for (const key of keys) {
    if (key.trim() === '' || key.length > 256) {
      throw new Error(`server ${JSON.stringify(serverId)} contains an invalid ${field} key`)
    }
    if (seen.has(key)) throw new Error(`server ${JSON.stringify(serverId)} ${field} contains duplicate key ${JSON.stringify(key)}`)
    seen.add(key)
  }
}

export function validateReconnect(value: ReconnectPolicy): void {
  if (!Number.isSafeInteger(value.initialDelayMs) || value.initialDelayMs < 1 || value.initialDelayMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`reconnect.initialDelayMs must be an integer from 1 to ${String(MAX_TIMER_DELAY_MS)}`)
  }
  if (!Number.isSafeInteger(value.maxDelayMs) || value.maxDelayMs < value.initialDelayMs || value.maxDelayMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`reconnect.maxDelayMs must be >= initialDelayMs and at most ${String(MAX_TIMER_DELAY_MS)}`)
  }
  if (!Number.isSafeInteger(value.maxAttempts) || value.maxAttempts < 1) throw new Error('reconnect.maxAttempts must be a positive integer')
}

export function transportOf(value: string): ServerTransport {
  if (value === 'stdio' || value === 'streamable-http') return value
  throw new Error(`unsupported MCP transport ${JSON.stringify(value)}`)
}
