/** Settings → MCP page. It intentionally owns no durable state. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ManagedServerView, ManagedToolView, ReadonlyMcpEntry, SecretInput, Snapshot } from '../types.ts'
import { PLUGIN_IDENTITY } from '../types.ts'
import { McpManagerRpcError, type ManagerClientApi } from './api.ts'
import type { McpLocaleKey } from './locales.ts'
import { SERVER_ID_PATTERN, draftFromServer, draftPatch, duplicateDraftKeys, newSecretDraft, type SecretDraft, type ServerDraft } from './draft.ts'

export interface McpSectionInjected {
  readonly api: ManagerClientApi
}

export type McpSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.mcpManager'>
  & InjectFace<McpSectionInjected>

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

/* ---------- Presentation constants (host `--dsw-*` design tokens + safe fallbacks) ---------- */

const RADIUS = 'var(--dsw-corner-shape, 6px)'
const MONO_FONT = 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'

const COLORS = {
  text: 'var(--dsw-alias-label-primary, #0f1115)',
  textSecondary: 'var(--dsw-alias-label-secondary, #353638)',
  textTertiary: 'var(--dsw-alias-label-tertiary, #61666b)',
  textDimmed: 'var(--dsw-alias-label-dimmed, #979da6)',
  textCaption: 'var(--dsw-alias-label-caption, #979da6)',
  textInverted: 'var(--dsw-alias-label-primary-inverted, #ffffff)',
  textError: 'var(--dsw-alias-label-error, #570c0c)',
  business: 'var(--dsw-alias-state-business-primary, #2f6fed)',
  success: 'var(--dsw-alias-state-success-primary, #22c55e)',
  warn: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
  danger: 'var(--dsw-alias-state-error-primary, #ec1313)',
} as const

/** Focus ring lives in a scoped injected stylesheet (`:focus-visible` cannot be expressed inline). */
const FOCUS_RING_CSS = '[data-mcp-manager="panel"] :focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed); outline-offset: 1px; }'
const FOCUS_STYLE_ID = 'mcp-manager-focus-style'

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  fontSize: 12,
  lineHeight: '18px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  border: '1px solid',
  borderRadius: RADIUS,
}

function statusChip(status: ManagedServerView['status']): React.CSSProperties {
  switch (status) {
    case 'waiting':
      return { ...chipBase, color: COLORS.warn, background: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)', borderColor: 'var(--dsw-alias-state-warn-secondary, #f7ad31)' }
    case 'loading':
      return { ...chipBase, color: COLORS.business, background: 'var(--dsw-alias-state-business-tertiary, #eaf3ff)', borderColor: COLORS.business }
    case 'loaded':
      return { ...chipBase, color: COLORS.success, background: 'var(--dsw-alias-state-success-tertiary, #e6faed)', borderColor: 'var(--dsw-alias-state-success-secondary, #4ed17e)' }
    case 'failed':
      return { ...chipBase, color: COLORS.danger, background: 'var(--dsw-alias-interactive-bg-hover-danger, #fef2f2)', borderColor: COLORS.danger }
    case 'disabled':
      return { ...chipBase, color: COLORS.textDimmed, background: 'var(--dsw-alias-bg-layer-3, #f5f5f5)', borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)' }
  }
}

function sourceChip(source: ReadonlyMcpEntry['source']): React.CSSProperties {
  return source === 'loader'
    ? { ...chipBase, color: COLORS.textTertiary, background: 'var(--dsw-alias-bg-layer-1, #fafafa)', borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)' }
    : { ...chipBase, color: COLORS.business, background: 'var(--dsw-alias-state-business-tertiary, #eaf3ff)', borderColor: COLORS.business }
}

const panelStyle: React.CSSProperties = {
  maxWidth: 860,
  padding: 16,
  color: COLORS.text,
  fontFamily: 'var(--dsw-font-family, system-ui, -apple-system, "Segoe UI", sans-serif)',
}

const headerStyle: React.CSSProperties = { marginBlock: 8 }
const headerRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const titleStyle: React.CSSProperties = {
  margin: 0,
  marginInlineEnd: 'auto',
  fontSize: 'var(--dsw-font-base-16-font-size, 16px)',
  lineHeight: 'var(--dsw-font-base-16-line-height, 24px)',
  fontWeight: 600,
  color: COLORS.text,
}
const subtitleRowStyle: React.CSSProperties = { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }
const identityChipStyle: React.CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: 12,
  lineHeight: '18px',
  color: COLORS.textCaption,
  background: 'var(--dsw-alias-bg-layer-1, #fafafa)',
  border: '1px solid var(--dsw-alias-border-l2, #e1e5ee)',
  borderRadius: RADIUS,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
}

const baseButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '6px 12px',
  border: '1px solid transparent',
  borderRadius: RADIUS,
  fontSize: 13,
  lineHeight: '18px',
  fontWeight: 500,
  cursor: 'pointer',
}
const buttonPrimaryStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--dsw-alias-button-primary-fill, #0f1115)',
  color: COLORS.textInverted,
}
const buttonSecondaryStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--dsw-alias-button-ghost-active-fill, #f1f3f5)',
  borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)',
  color: COLORS.text,
}
const buttonInfoStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--dsw-alias-button-info-fill, #3b82f6)',
  color: COLORS.textInverted,
}
const buttonToolBarStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--dsw-alias-button-tool-bar-fill, rgba(84, 85, 87, 0.5))',
  color: COLORS.text,
}
const buttonDangerStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'transparent',
  borderColor: COLORS.danger,
  color: COLORS.danger,
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: COLORS.textCaption,
  marginBottom: 4,
}
const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 10px',
  fontSize: 13,
  lineHeight: '18px',
  color: COLORS.text,
  background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  border: '1px solid var(--dsw-alias-border-l2, #e1e5ee)',
  borderRadius: RADIUS,
}
const textareaStyle: React.CSSProperties = { ...fieldInputStyle, resize: 'vertical' }
const checkStyle: React.CSSProperties = {
  accentColor: COLORS.business,
  cursor: 'pointer',
}

const searchLabelStyle: React.CSSProperties = { display: 'block', width: '100%', marginBlock: '12px 16px' }
const searchInputStyle: React.CSSProperties = { ...fieldInputStyle, width: '100%', maxWidth: '100%' }

const cardStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
  border: '1px solid var(--dsw-alias-border-l2, #e1e5ee)',
  borderRadius: RADIUS,
  padding: 16,
  marginBlock: 8,
  boxShadow: 'var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))',
}

const cardHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const cardTitleStyle: React.CSSProperties = { fontWeight: 600, fontSize: 14, color: COLORS.text }
const codeStyle: React.CSSProperties = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textSecondary }
const codeCaptionStyle: React.CSSProperties = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textCaption }
const toolCountChipStyle: React.CSSProperties = {
  ...chipBase,
  marginInlineStart: 'auto',
  color: COLORS.textCaption,
  background: 'var(--dsw-alias-bg-layer-1, #fafafa)',
  borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)',
}
const metaLineStyle: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  color: COLORS.textCaption,
  fontSize: 12,
  marginBlock: '6px 0',
}

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-state-error-secondary, #fee2e2)',
  color: COLORS.textError,
  padding: '8px 12px',
  borderRadius: RADIUS,
  marginBlock: 8,
  fontSize: 13,
}
const noticeBoxStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)',
  color: 'var(--dsw-alias-state-warn-label, #dd8629)',
  border: '1px solid var(--dsw-alias-state-warn-secondary, #f7ad31)',
  padding: '8px 12px',
  borderRadius: RADIUS,
  marginBlock: 8,
  fontSize: 13,
}
const statusTextStyle: React.CSSProperties = { color: COLORS.textSecondary, marginBlock: 8 }
const hintStyle: React.CSSProperties = { color: COLORS.textCaption, fontSize: 12, marginBlock: 4 }

const actionsRowStyle: React.CSSProperties = { display: 'flex', gap: 8, marginBlock: 8, flexWrap: 'wrap' }

const collapseStyle: React.CSSProperties = { marginBlock: 12 }
const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  color: COLORS.textSecondary,
  fontWeight: 500,
  fontSize: 13,
  paddingBlock: 2,
}
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }
const toolItemStyle: React.CSSProperties = {
  paddingBlock: 10,
  borderBottom: '1px solid var(--dsw-alias-separator-primary, #e1e5ee)',
}
const toolRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }
const toolDescriptionStyle: React.CSSProperties = { color: COLORS.textCaption, fontSize: 12 }
const paramDetailsStyle: React.CSSProperties = { marginBlock: 8 }
const preStyle: React.CSSProperties = {
  overflow: 'auto',
  fontSize: 12,
  padding: 8,
  margin: 0,
  background: 'var(--dsw-alias-markdown-code-block, #f9fafb)',
  borderRadius: RADIUS,
}

const formTitleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: COLORS.text }
const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l1, #ebeef2)',
  borderRadius: RADIUS,
  padding: '12px 12px 4px',
  margin: '0 0 12px',
}
const legendStyle: React.CSSProperties = { padding: '0 6px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }
const groupFieldsetStyle: React.CSSProperties = { border: 0, padding: 0, margin: '0 0 12px' }
const formGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '8px 16px',
  marginBlock: 8,
}
const gridFieldStyle: React.CSSProperties = { marginBlock: 0 }
const checkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBlock: 8,
  fontSize: 13,
  color: COLORS.text,
  cursor: 'pointer',
}
const formActionsStyle: React.CSSProperties = { display: 'flex', gap: 8, marginBlock: '12px 4px', flexWrap: 'wrap' }

const secretRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px 12px', marginBlock: 6 }
const secretFieldStyle: React.CSSProperties = { flex: '1 1 200px', marginBlock: 0 }
const secretActionsStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', paddingBlock: 2 }
const secretClearLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  color: COLORS.text,
  cursor: 'pointer',
}

const readonlyDetailsStyle: React.CSSProperties = { ...collapseStyle, marginBlock: 16 }
const readonlyItemStyle: React.CSSProperties = {
  paddingBlock: 8,
  borderBottom: '1px solid var(--dsw-alias-separator-primary, #e1e5ee)',
}
const readonlyHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const readonlyStatusStyle: React.CSSProperties = { color: COLORS.textCaption, fontSize: 12, marginBlock: 4 }

/* ------------------------------------------------------------------------------------------- */

/**
 * Poll the snapshot while the page is visible.
 *
 * Guarantees: at most one request in flight per tick (slow responses are not
 * overlapped), and every response is tagged with the caller's monotonic `seq`
 * so a late poll response can never overwrite a newer snapshot produced by a
 * user operation or a newer poll.
 */
function useVisiblePolling(
  api: ManagerClientApi,
  onSnapshot: (snapshot: Snapshot, seq: number) => void,
  onError: (error: unknown, seq: number) => void,
  nextSeq: () => number,
): void {
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setInterval> | undefined
    let inFlight = false
    const load = (): void => {
      if (document.visibilityState !== 'visible' || inFlight) return
      inFlight = true
      const seq = nextSeq()
      void api.snapshot({}, controller.signal).then(
        snapshot => onSnapshot(snapshot, seq),
        error => onError(error, seq),
      ).finally(() => { inFlight = false })
    }
    const start = (): void => {
      if (document.visibilityState !== 'visible' || timer !== undefined) return
      timer = setInterval(() => { load() }, 2_000)
    }
    const stop = (): void => {
      if (timer === undefined) return
      clearInterval(timer)
      timer = undefined
    }
    const visibility = (): void => {
      stop()
      if (document.visibilityState === 'visible') {
        load()
        start()
      }
    }
    load()
    start()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      controller.abort()
      stop()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [api, onError, onSnapshot, nextSeq])
}

export function McpSection({ api, t }: McpSectionProps): ReactNode {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<ServerDraft | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [pollFailed, setPollFailed] = useState(false)

  // Scoped focus ring for keyboard navigation; injected once per document.
  useEffect(() => {
    if (document.getElementById(FOCUS_STYLE_ID) !== null) return
    const style = document.createElement('style')
    style.id = FOCUS_STYLE_ID
    style.textContent = FOCUS_RING_CSS
    document.head.append(style)
  }, [])

  // Monotonic response sequence shared by polling, manual refresh, and user
  // operations. A response whose seq is no longer current is discarded.
  const seqRef = useRef(0)
  const nextSeq = useCallback((): number => {
    seqRef.current += 1
    return seqRef.current
  }, [])

  const accept = useCallback((snapshot: Snapshot, seq: number): void => {
    if (seq !== seqRef.current) return
    setState({ status: 'ready', snapshot })
    setPollFailed(false)
  }, [])

  /** Polling failures never touch the user-operation message. */
  const rejectPoll = useCallback((error: unknown, seq: number): void => {
    if (seq !== seqRef.current) return
    setPollFailed(true)
    setState(previous => previous.status === 'ready' ? previous : {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }, [])

  /** User-operation failures set the action message; kept until the next operation. */
  const rejectAction = useCallback((error: unknown): void => {
    const message = error instanceof McpManagerRpcError && error.code === 'conflict'
      ? t('conflict')
      : error instanceof Error ? error.message : String(error)
    setMessage(message)
  }, [t])

  useVisiblePolling(api, accept, rejectPoll, nextSeq)

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
    setMessage(undefined)
    try {
      const seq = nextSeq()
      const next = await operation()
      accept(next, seq)
      return next
    } catch (error) {
      rejectAction(error)
      return undefined
    }
    finally { setBusy(false) }
  }

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (snapshot === undefined || draft === undefined) return
    const duplicates = [...duplicateDraftKeys(draft.env), ...duplicateDraftKeys(draft.headers)]
    if (duplicates.length > 0) {
      setMessage(`${t('duplicateKey')}: ${[...new Set(duplicates)].join(', ')}`)
      return
    }
    const patch = draftPatch(draft)
    const next = await run(() => api.upsertServer({ server: patch, expectedRevision: draft.baseRevision }))
    if (next !== undefined) setDraft(undefined)
  }

  /** Re-open the editor from the latest server view after a conflict (drops draft edits). */
  const rebase = (): void => {
    if (snapshot === undefined || draft === undefined) return
    const current = snapshot.servers.find(server => server.id === draft.id)
    setDraft(current === undefined ? undefined : draftFromServer(current, snapshot.revision))
    setMessage(undefined)
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

  const isConflictMessage = message === t('conflict')

  return (
    <section data-mcp-manager="panel" aria-busy={busy} style={panelStyle}>
      <header style={headerStyle}>
        <div style={headerRowStyle}>
          <h2 style={titleStyle}>{t('title')}</h2>
          <button type="button" style={buttonPrimaryStyle} onClick={() => setDraft(draftFromServer(undefined, snapshot?.revision ?? 0))} disabled={busy || snapshot?.writable === false}>{t('add')}</button>
          <button type="button" style={buttonSecondaryStyle} onClick={() => { if (snapshot !== undefined) void run(() => api.snapshot({})) }} disabled={busy}>{t('refresh')}</button>
        </div>
        <div style={subtitleRowStyle}><span style={identityChipStyle}>{PLUGIN_IDENTITY}</span></div>
      </header>
      <label style={searchLabelStyle}>
        <span style={fieldLabelStyle}>{t('search')}</span>
        <input type="search" style={searchInputStyle} value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder={t('search')} />
      </label>
      {message !== undefined ? <p role={isConflictMessage ? 'status' : 'alert'} style={isConflictMessage ? noticeBoxStyle : errorBoxStyle}>
        {message}
        {isConflictMessage && draft !== undefined
          ? <button type="button" style={{ ...buttonSecondaryStyle, marginInlineStart: 8 }} onClick={rebase}>{t('rebase')}</button>
          : null}
        {!isConflictMessage ? <button type="button" style={{ ...buttonToolBarStyle, marginInlineStart: 8, padding: '2px 8px' }} onClick={() => setMessage(undefined)} aria-label={t('dismiss')}>✕</button> : null}
      </p> : null}
      {pollFailed && state.status === 'ready' ? <p role="status" style={noticeBoxStyle}>{t('pollFailed')}</p> : null}
      {state.status === 'loading' ? <p role="status" style={statusTextStyle}>{t('loading')}</p> : null}
      {state.status === 'error' ? <p role="alert" style={errorBoxStyle}>{state.message}</p> : null}
      {snapshot !== undefined && servers.length === 0 ? <p style={statusTextStyle}>{snapshot.servers.length === 0 ? t('noServers') : t('empty')}</p> : null}
      {servers.map(server => (
        <ServerCard
          key={server.id}
          server={server}
          tools={tools.filter(tool => tool.serverId === server.id)}
          t={t}
          busy={busy}
          writable={snapshot?.writable ?? false}
          onEdit={() => setDraft(draftFromServer(server, snapshot?.revision ?? 0))}
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
        <form onSubmit={event => { void save(event) }} style={cardStyle}>
          <h3 style={formTitleStyle}>{draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add')}</h3>
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>{t('basic')}</legend>
            <Field label={t('id')}><input style={fieldInputStyle} required pattern={SERVER_ID_PATTERN} value={draft.id} disabled={snapshot?.servers.some(server => server.id === draft.id)} onChange={event => setDraft({ ...draft, id: event.currentTarget.value })} /></Field>
            <Field label={t('label')}><input style={fieldInputStyle} value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} /></Field>
            <Field label={t('transport')}>
              <select style={fieldInputStyle} value={draft.transport} onChange={event => setDraft({ ...draft, transport: event.currentTarget.value as ServerDraft['transport'] })}>
                <option value="stdio">{t('stdio')}</option>
                <option value="streamable-http">{t('http')}</option>
              </select>
            </Field>
            {draft.transport === 'stdio' ? <>
              <Field label={t('command')}><textarea style={textareaStyle} rows={2} required value={draft.command} onChange={event => setDraft({ ...draft, command: event.currentTarget.value })} /></Field>
              <ArgsFields entries={draft.args} t={t} onChange={args => setDraft({ ...draft, args })} />
              <Field label={t('cwd')}><input style={fieldInputStyle} value={draft.cwd} onChange={event => setDraft({ ...draft, cwd: event.currentTarget.value })} /></Field>
              <SecretFields label={t('environment')} entries={draft.env} t={t} onChange={env => setDraft({ ...draft, env })} />
            </> : <>
              <Field label={t('url')}><input style={fieldInputStyle} type="url" required value={draft.url} onChange={event => setDraft({ ...draft, url: event.currentTarget.value })} /></Field>
              <SecretFields label={t('headers')} entries={draft.headers} t={t} onChange={headers => setDraft({ ...draft, headers })} />
            </>}
          </fieldset>
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>{t('advanced')}</legend>
            <div style={formGridStyle}>
              <Field label={t('timeout')} style={gridFieldStyle}><input style={fieldInputStyle} type="number" min={1} step={1} value={draft.timeout} onChange={event => setDraft({ ...draft, timeout: event.currentTarget.value })} /></Field>
            </div>
            <details style={collapseStyle}>
              <summary style={summaryStyle}>{t('reconnect')}</summary>
              <label style={checkRowStyle}><input style={checkStyle} type="checkbox" checked={draft.reconnectEnabled} onChange={event => setDraft({ ...draft, reconnectEnabled: event.currentTarget.checked })} /> {t('reconnectEnabled')}</label>
              <div style={formGridStyle}>
                <Field label={t('initialDelay')} style={gridFieldStyle}><input style={fieldInputStyle} type="number" min={1} step={1} value={draft.initialDelayMs} onChange={event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value })} /></Field>
                <Field label={t('maxDelay')} style={gridFieldStyle}><input style={fieldInputStyle} type="number" min={1} step={1} value={draft.maxDelayMs} onChange={event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value })} /></Field>
                <Field label={t('maxAttempts')} style={gridFieldStyle}><input style={fieldInputStyle} type="number" min={1} step={1} value={draft.maxAttempts} onChange={event => setDraft({ ...draft, maxAttempts: event.currentTarget.value })} /></Field>
              </div>
            </details>
          </fieldset>
          <div style={formActionsStyle}>
            <button type="submit" style={buttonPrimaryStyle} disabled={busy || snapshot?.writable === false}>{t('save')}</button>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setDraft(undefined)} disabled={busy}>{t('cancel')}</button>
          </div>
        </form>
      ) : null}
      {snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (
        <details style={readonlyDetailsStyle}>
          <summary style={summaryStyle}>{t('readonly')}</summary>
          <p style={hintStyle}>{t('readOnlyHint')}</p>
          <ul style={listStyle}>{snapshot.readonlyEntries.map(entry => <li key={entry.entryId} style={readonlyItemStyle}>
            <div style={readonlyHeaderRowStyle}>
              <span style={sourceChip(entry.source)}>{entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}`}</span>
              <code style={codeStyle}>{entry.entryId}</code>
              <code style={codeCaptionStyle}>{entry.moduleName}</code>
            </div>
            <p style={readonlyStatusStyle}>{t('status')}: {entry.enabled === 'conditional' ? t('conditional') : entry.enabled ? t('enabled') : t('disabled')} ({entry.fiberPhase ?? '—'})</p>
          </li>)}</ul>
        </details>
      ) : null}
    </section>
  )
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }): ReactNode {
  return <label style={{ display: 'block', marginBlock: 8, ...style }}><span style={fieldLabelStyle}>{label}</span>{children}</label>
}

interface SecretFieldsProps {
  label: string
  entries: readonly SecretDraft[]
  t: McpSectionProps['t']
  onChange: (entries: SecretDraft[]) => void
}

function SecretFields({ label, entries, t, onChange }: SecretFieldsProps): ReactNode {
  return <fieldset style={groupFieldsetStyle}>
    <legend style={legendStyle}>{label}</legend>
    <p style={hintStyle}>{t('secretHint')}</p>
    {entries.map((entry, index) => <div key={entry.uid} style={secretRowStyle}>
      <Field label={t('secretKey')} style={secretFieldStyle}><input style={fieldInputStyle} value={entry.key} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, key: event.currentTarget.value }
        onChange(next)
      }} /></Field>
      <Field label={t('secretValue')} style={secretFieldStyle}><input style={fieldInputStyle} type={entry.sensitive ? 'password' : 'text'} value={entry.value} disabled={entry.clear} placeholder={entry.clear ? t('secretUnset') : undefined} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, value: event.currentTarget.value }
        onChange(next)
      }} /></Field>
      <div style={secretActionsStyle}>
        <label style={secretClearLabelStyle}><input style={checkStyle} type="checkbox" checked={entry.sensitive} onChange={event => {
          const next = [...entries]
          next[index] = { ...entry, sensitive: event.currentTarget.checked }
          onChange(next)
        }} /> {t('sensitive')}</label>
        <label style={secretClearLabelStyle}><input style={checkStyle} type="checkbox" checked={entry.clear} onChange={event => {
          const next = [...entries]
          next[index] = { ...entry, clear: event.currentTarget.checked }
          onChange(next)
        }} /> {t('secretUnset')}</label>
        <button type="button" style={buttonDangerStyle} onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}>{t('remove')}</button>
      </div>
    </div>)}
    <button type="button" style={buttonSecondaryStyle} onClick={() => onChange([...entries, newSecretDraft()])}>{t('addEntry')}</button>
  </fieldset>
}

/** Lossless per-row argument editor: values are saved verbatim (no trim/filter). */
function ArgsFields({ entries, t, onChange }: { entries: readonly string[]; t: McpSectionProps['t']; onChange: (entries: string[]) => void }): ReactNode {
  return <fieldset style={groupFieldsetStyle}>
    <legend style={legendStyle}>{t('args')}</legend>
    <p style={hintStyle}>{t('argsHint')}</p>
    {entries.map((value, index) => <div key={index} style={secretRowStyle}>
      <Field label={`${t('argument')} ${index + 1}`} style={secretFieldStyle}>
        <input style={fieldInputStyle} value={value} onChange={event => {
          const next = [...entries]
          next[index] = event.currentTarget.value
          onChange(next)
        }} />
      </Field>
      <div style={secretActionsStyle}>
        <button type="button" style={buttonDangerStyle} onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}>{t('remove')}</button>
      </div>
    </div>)}
    <button type="button" style={buttonSecondaryStyle} onClick={() => onChange([...entries, ''])}>{t('addEntry')}</button>
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
    <div style={cardHeaderRowStyle}>
      <span data-mcp-status={server.status} style={statusChip(server.status)}>{t(STATUS_KEYS[server.status])}</span>
      <strong style={cardTitleStyle}>{server.label}</strong>
      <code style={codeCaptionStyle}>{server.id}</code>
      <span style={toolCountChipStyle}>{server.toolCount} {t('toolCount')}</span>
    </div>
    <div style={metaLineStyle}>{server.transport === 'stdio' ? t('stdio') : t('http')} → {server.transport === 'stdio' ? server.command : server.url}</div>
    {server.error !== undefined ? <p role="alert" style={errorBoxStyle}>{server.error}</p> : null}
    <div style={actionsRowStyle}>
      <button type="button" style={buttonPrimaryStyle} onClick={onToggle} disabled={busy || !writable}>{server.enabled ? t('disabled') : t('enabled')}</button>
      <button type="button" style={buttonInfoStyle} onClick={onEdit} disabled={busy || !writable}>{t('edit')}</button>
      <button type="button" style={buttonToolBarStyle} onClick={onReload} disabled={busy}>{t('reload')}</button>
      <button type="button" style={buttonDangerStyle} onClick={onRemove} disabled={busy || !writable}>{t('remove')}</button>
    </div>
    <details style={collapseStyle}>
      <summary style={summaryStyle}>{t('tools')} ({tools.length})</summary>
      {tools.length === 0 ? <p style={statusTextStyle}>{t('noTools')}</p> : <ul style={listStyle}>{tools.map(tool => <li key={tool.name} style={toolItemStyle}>
        <label style={toolRowStyle}><input style={checkStyle} type="checkbox" checked={tool.enabled} onChange={event => onToolToggle(tool, event.currentTarget.checked)} disabled={busy || !writable} /> <code style={codeStyle}>{tool.name}</code> <span style={toolDescriptionStyle}>{tool.description}</span></label>
        <details style={paramDetailsStyle}>
          <summary style={summaryStyle}>JSON {t('params')}</summary>
          <pre style={preStyle}>{JSON.stringify(tool.parameters, null, 2)}</pre>
        </details>
      </li>)}</ul>}
      {Object.entries(server.env).map(([key, value]) => <span key={key} data-mcp-secret={key} hidden>{value.set ? t('secretSet') : t('secretUnset')}</span>)}
    </details>
  </article>
}

export type { SecretInput }
