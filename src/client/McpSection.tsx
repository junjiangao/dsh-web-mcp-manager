/** Settings → MCP page. It intentionally owns no durable state. */

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ManagedServerView, ManagedToolView, SecretInput, ServerPatch, Snapshot } from '../types.ts'
import { McpManagerRpcError, type ManagerClientApi } from './api.ts'
import type { McpLocaleKey } from './locales.ts'

export interface McpSectionInjected {
  readonly api: ManagerClientApi
}

export type McpSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.mcpManager'>
  & InjectFace<McpSectionInjected>

interface ServerDraft {
  id: string
  label: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  cwd: string
  url: string
  timeout: string
  env: SecretDraft[]
  headers: SecretDraft[]
  reconnectEnabled: boolean
  initialDelayMs: string
  maxDelayMs: string
  maxAttempts: string
}

interface SecretDraft {
  key: string
  value: string
  clear: boolean
}

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: Snapshot }

const STATUS_KEYS: Record<ManagedServerView['status'], McpLocaleKey> = {
  disabled: 'disabled',
  waiting: 'waiting',
  loading: 'loading',
  loaded: 'loaded',
  failed: 'failed',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--dsh-color-border, #d8d8d8)',
  borderRadius: 8,
  padding: 12,
  marginBlock: 8,
}

function draftFromServer(server?: ManagedServerView): ServerDraft {
  return {
    id: server?.id ?? '',
    label: server?.label ?? '',
    transport: server?.transport ?? 'stdio',
    command: server?.command ?? '',
    args: server?.args.join('\n') ?? '',
    cwd: server?.cwd ?? '',
    url: server?.url ?? '',
    timeout: String(server?.toolCallTimeoutMs ?? 60_000),
    env: secretDrafts(server?.env),
    headers: secretDrafts(server?.headers),
    reconnectEnabled: server?.reconnect.enabled ?? true,
    initialDelayMs: String(server?.reconnect.initialDelayMs ?? 500),
    maxDelayMs: String(server?.reconnect.maxDelayMs ?? 30_000),
    maxAttempts: String(server?.reconnect.maxAttempts ?? 10),
  }
}

function draftPatch(draft: ServerDraft): ServerPatch {
  const timeout = Number(draft.timeout)
  const initialDelayMs = positiveIntegerOr(draft.initialDelayMs, 500)
  const maxDelayMs = Math.max(initialDelayMs, positiveIntegerOr(draft.maxDelayMs, 30_000))
  const maxAttempts = positiveIntegerOr(draft.maxAttempts, 10)
  return {
    id: draft.id.trim(),
    label: draft.label,
    transport: draft.transport,
    command: draft.command,
    args: draft.args.split(/\r?\n/u).map(value => value.trim()).filter(Boolean),
    cwd: draft.cwd,
    url: draft.url,
    env: secretPatch(draft.env),
    headers: secretPatch(draft.headers),
    toolCallTimeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 60_000,
    reconnect: { enabled: draft.reconnectEnabled, initialDelayMs, maxDelayMs, maxAttempts },
  }
}

function secretDrafts(value?: Readonly<Record<string, { readonly set: boolean }>>): SecretDraft[] {
  return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b)).map(key => ({ key, value: '', clear: false }))
}

function secretPatch(entries: readonly SecretDraft[]): Record<string, SecretInput> {
  const result: Record<string, SecretInput> = {}
  for (const entry of entries) {
    const key = entry.key.trim()
    if (key.length === 0) continue
    if (entry.clear) {
      result[key] = { clear: true }
    } else if (entry.value.length > 0) {
      result[key] = entry.value
    }
  }
  return result
}

function positiveIntegerOr(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function useVisiblePolling(api: ManagerClientApi, onSnapshot: (snapshot: Snapshot) => void, onError: (error: unknown) => void): void {
  const load = useCallback((signal?: AbortSignal) => {
    void api.snapshot({}, signal).then(onSnapshot, onError)
  }, [api, onError, onSnapshot])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setInterval> | undefined
    const start = (): void => {
      if (document.visibilityState !== 'visible' || timer !== undefined) return
      timer = setInterval(() => { load(controller.signal) }, 2_000)
    }
    const stop = (): void => {
      if (timer === undefined) return
      clearInterval(timer)
      timer = undefined
    }
    const visibility = (): void => {
      stop()
      if (document.visibilityState === 'visible') {
        load(controller.signal)
        start()
      }
    }
    load(controller.signal)
    start()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      controller.abort()
      stop()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [load])
}

export function McpSection({ api, t }: McpSectionProps): ReactNode {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<ServerDraft | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  const accept = useCallback((snapshot: Snapshot) => { setState({ status: 'ready', snapshot }); setMessage(undefined) }, [])
  const reject = useCallback((error: unknown) => {
    const message = error instanceof McpManagerRpcError && error.code === 'conflict'
      ? t('conflict')
      : error instanceof Error ? error.message : String(error)
    setState(previous => previous.status === 'ready' ? previous : { status: 'error', message })
    setMessage(message)
  }, [t])
  useVisiblePolling(api, accept, reject)

  const snapshot = state.status === 'ready' ? state.snapshot : undefined
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const servers = useMemo(() => snapshot?.servers.filter(server => {
    if (normalizedQuery.length === 0) return true
    return [server.id, server.label, server.command, server.url].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
      || snapshot.tools.some(tool => tool.serverId === server.id && tool.name.toLocaleLowerCase().includes(normalizedQuery))
  }) ?? [], [normalizedQuery, snapshot])
  const tools = useMemo(() => snapshot?.tools.filter(tool => {
    if (normalizedQuery.length === 0) return true
    return `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(normalizedQuery)
  }) ?? [], [normalizedQuery, snapshot])

  const run = async (operation: () => Promise<Snapshot>): Promise<Snapshot | undefined> => {
    setBusy(true)
    try {
      const next = await operation()
      accept(next)
      return next
    } catch (error) {
      reject(error)
      return undefined
    }
    finally { setBusy(false) }
  }

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (snapshot === undefined || draft === undefined) return
    const patch = draftPatch(draft)
    const next = await run(() => api.upsertServer({ server: patch, expectedRevision: snapshot.revision }))
    if (next !== undefined) setDraft(undefined)
  }

  const toggleServer = (server: ManagedServerView): void => {
    if (snapshot === undefined) return
    void run(() => api.setServerEnabled({ id: server.id, enabled: !server.enabled, expectedRevision: snapshot.revision }))
  }

  const remove = (server: ManagedServerView): void => {
    if (snapshot === undefined || !window.confirm(t('confirmRemove'))) return
    void run(() => api.removeServer({ id: server.id, expectedRevision: snapshot.revision }))
  }

  const reload = (server: ManagedServerView): void => { void run(() => api.reloadServer({ id: server.id })) }

  return (
    <section data-mcp-manager="panel" aria-busy={busy} style={{ maxWidth: 860, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ marginInlineEnd: 'auto' }}>{t('title')}</h2>
        <button type="button" onClick={() => setDraft(draftFromServer())} disabled={busy || snapshot?.writable === false}>{t('add')}</button>
        <button type="button" onClick={() => { if (snapshot !== undefined) void run(() => api.snapshot({})) }} disabled={busy}>{t('refresh')}</button>
      </header>
      <label style={{ display: 'block', marginBlock: '10px' }}>
        <span style={{ display: 'block', fontSize: 12 }}>{t('search')}</span>
        <input type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder={t('search')} />
      </label>
      {message !== undefined ? <p role="alert" style={{ color: 'var(--dsh-color-danger, #b42318)' }}>{message}</p> : null}
      {state.status === 'loading' ? <p>{t('loading')}</p> : null}
      {state.status === 'error' ? <p role="alert">{state.message}</p> : null}
      {snapshot !== undefined && servers.length === 0 ? <p>{snapshot.servers.length === 0 ? t('noServers') : t('empty')}</p> : null}
      {servers.map(server => (
        <ServerCard
          key={server.id}
          server={server}
          tools={tools.filter(tool => tool.serverId === server.id)}
          t={t}
          busy={busy}
          writable={snapshot?.writable ?? false}
          onEdit={() => setDraft(draftFromServer(server))}
          onToggle={() => { toggleServer(server) }}
          onReload={() => { reload(server) }}
          onRemove={() => { remove(server) }}
          onToolToggle={(tool, enabled) => {
            if (snapshot === undefined) return
            void run(() => api.setToolEnabled({ serverId: server.id, name: tool.name, enabled, expectedRevision: snapshot.revision }))
          }}
        />
      ))}
      {draft !== undefined ? (
        <form onSubmit={event => { void save(event) }} style={{ ...cardStyle, background: 'var(--dsh-color-surface-secondary, #fafafa)' }}>
          <h3>{draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add')}</h3>
          <Field label={t('id')}><input required pattern="[A-Za-z0-9_-]{1,32}" value={draft.id} disabled={snapshot?.servers.some(server => server.id === draft.id)} onChange={event => setDraft({ ...draft, id: event.currentTarget.value })} /></Field>
          <Field label={t('label')}><input value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} /></Field>
          <Field label={t('transport')}>
            <select value={draft.transport} onChange={event => setDraft({ ...draft, transport: event.currentTarget.value as ServerDraft['transport'] })}>
              <option value="stdio">{t('stdio')}</option>
              <option value="streamable-http">{t('http')}</option>
            </select>
          </Field>
          {draft.transport === 'stdio' ? <>
            <Field label={t('command')}><input required value={draft.command} onChange={event => setDraft({ ...draft, command: event.currentTarget.value })} /></Field>
            <Field label={t('args')}><textarea value={draft.args} onChange={event => setDraft({ ...draft, args: event.currentTarget.value })} /></Field>
            <Field label={t('cwd')}><input value={draft.cwd} onChange={event => setDraft({ ...draft, cwd: event.currentTarget.value })} /></Field>
            <SecretFields label={t('environment')} entries={draft.env} t={t} onChange={env => setDraft({ ...draft, env })} />
          </> : <>
            <Field label={t('url')}><input required type="url" value={draft.url} onChange={event => setDraft({ ...draft, url: event.currentTarget.value })} /></Field>
            <SecretFields label={t('headers')} entries={draft.headers} t={t} onChange={headers => setDraft({ ...draft, headers })} />
          </>}
          <Field label={t('timeout')}><input type="number" min={1} step={1} value={draft.timeout} onChange={event => setDraft({ ...draft, timeout: event.currentTarget.value })} /></Field>
          <fieldset style={{ border: 0, padding: 0, marginBlock: 12 }}>
            <legend>{t('reconnect')}</legend>
            <label style={{ display: 'block', marginBlock: 8 }}><input type="checkbox" checked={draft.reconnectEnabled} onChange={event => setDraft({ ...draft, reconnectEnabled: event.currentTarget.checked })} /> {t('reconnectEnabled')}</label>
            <Field label={t('initialDelay')}><input type="number" min={1} step={1} value={draft.initialDelayMs} onChange={event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value })} /></Field>
            <Field label={t('maxDelay')}><input type="number" min={1} step={1} value={draft.maxDelayMs} onChange={event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value })} /></Field>
            <Field label={t('maxAttempts')}><input type="number" min={1} step={1} value={draft.maxAttempts} onChange={event => setDraft({ ...draft, maxAttempts: event.currentTarget.value })} /></Field>
          </fieldset>
          <div style={{ display: 'flex', gap: 8 }}><button type="submit" disabled={busy || snapshot?.writable === false}>{t('save')}</button><button type="button" onClick={() => setDraft(undefined)} disabled={busy}>{t('cancel')}</button></div>
        </form>
      ) : null}
      {snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (
        <details style={{ marginBlock: 16 }}>
          <summary>{t('readonly')}</summary>
          <p>{t('readOnlyHint')}</p>
          <ul>{snapshot.readonlyEntries.map(entry => <li key={entry.entryId}>
            <code>{entry.entryId}</code> — {entry.moduleName} — {entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}`} — {entry.enabled === 'conditional' ? t('conditional') : entry.enabled ? t('enabled') : t('disabled')} ({entry.fiberPhase ?? '—'})
          </li>)}</ul>
        </details>
      ) : null}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return <label style={{ display: 'block', marginBlock: 8 }}><span style={{ display: 'block', fontSize: 12 }}>{label}</span>{children}</label>
}

interface SecretFieldsProps {
  label: string
  entries: readonly SecretDraft[]
  t: McpSectionProps['t']
  onChange: (entries: SecretDraft[]) => void
}

function SecretFields({ label, entries, t, onChange }: SecretFieldsProps): ReactNode {
  return <fieldset style={{ border: 0, padding: 0, marginBlock: 12 }}>
    <legend>{label}</legend>
    {entries.map((entry, index) => <div key={`${entry.key}-${String(index)}`} style={{ display: 'flex', gap: 6, alignItems: 'end', flexWrap: 'wrap', marginBlock: 6 }}>
      <Field label={t('secretKey')}><input value={entry.key} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, key: event.currentTarget.value }
        onChange(next)
      }} /></Field>
      <Field label={t('secretValue')}><input type="password" value={entry.value} disabled={entry.clear} placeholder={entry.clear ? t('secretUnset') : undefined} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, value: event.currentTarget.value }
        onChange(next)
      }} /></Field>
      <label style={{ marginBlock: 8 }}><input type="checkbox" checked={entry.clear} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, clear: event.currentTarget.checked }
        onChange(next)
      }} /> {t('secretUnset')}</label>
      <button type="button" onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}>{t('remove')}</button>
    </div>)}
    <button type="button" onClick={() => onChange([...entries, { key: '', value: '', clear: false }])}>{t('addEntry')}</button>
  </fieldset>
}

interface ServerCardProps {
  server: ManagedServerView
  tools: readonly ManagedToolView[]
  t: McpSectionProps['t']
  busy: boolean
  writable: boolean
  onEdit: () => void
  onToggle: () => void
  onReload: () => void
  onRemove: () => void
  onToolToggle: (tool: ManagedToolView, enabled: boolean) => void
}

function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onToolToggle }: ServerCardProps): ReactNode {
  return <article data-mcp-server={server.id} style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <strong>{server.label}</strong>
      <code>{server.id}</code>
      <span data-mcp-status={server.status}>{t(STATUS_KEYS[server.status])}</span>
      <span style={{ marginInlineStart: 'auto' }}>{server.toolCount} {t('toolCount')}</span>
    </div>
    <small>{server.transport === 'stdio' ? server.command : server.url}</small>
    {server.error !== undefined ? <p role="alert" style={{ color: 'var(--dsh-color-danger, #b42318)' }}>{server.error}</p> : null}
    <div style={{ display: 'flex', gap: 8, marginBlock: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={onToggle} disabled={busy || !writable}>{server.enabled ? t('disabled') : t('enabled')}</button>
      <button type="button" onClick={onEdit} disabled={busy || !writable}>{t('edit')}</button>
      <button type="button" onClick={onReload} disabled={busy}>{t('reload')}</button>
      <button type="button" onClick={onRemove} disabled={busy || !writable}>{t('remove')}</button>
    </div>
    <details>
      <summary>{t('tools')} ({tools.length})</summary>
      {tools.length === 0 ? <p>{t('noTools')}</p> : <ul>{tools.map(tool => <li key={tool.name}>
        <label><input type="checkbox" checked={tool.enabled} onChange={event => onToolToggle(tool, event.currentTarget.checked)} disabled={busy || !writable} /> <code>{tool.name}</code> — {tool.description}</label>
        <pre style={{ overflow: 'auto', fontSize: 12 }}>{JSON.stringify(tool.parameters, null, 2)}</pre>
      </li>)}</ul>}
      {Object.entries(server.env).map(([key, value]) => <span key={key} data-mcp-secret={key} hidden>{value.set ? t('secretSet') : t('secretUnset')}</span>)}
    </details>
  </article>
}

export type { SecretInput }
