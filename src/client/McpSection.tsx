/** Settings → MCP page. It intentionally owns no durable state. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, Checkbox, Input, SegmentedControl, StateDot, Switch, Tag,
  type StateDotState, type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ManagedServerView, ManagedToolView, McpScope, ReadonlyMcpEntry, SecretInput, Snapshot } from '../types.ts'
import { PLUGIN_IDENTITY } from '../types.ts'
import type { ManagerClientApi } from './api.ts'
import type { EntryFormFace } from './entry-form.ts'
import type { McpLocaleKey } from './locales.ts'
import { SERVER_ID_PATTERN, draftFromServer, draftPatch, duplicateDraftKeys, newSecretDraft, type SecretDraft, type ServerDraft } from './draft.ts'

export interface McpSectionInjected {
  /** The manager's own RPC: the `mcp.json` scopes and runtime status. */
  readonly api: ManagerClientApi
  /** The official shared settings form: the legacy Loader-entry scope. */
  readonly entry: EntryFormFace
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

/**
 * Corner radii are plain lengths on purpose.
 *
 * `--dsw-corner-shape` is NOT a radius: the host defines it as a
 * `corner-shape` function (`superellipse(1.5)`) and applies it to every
 * element from its own `@supports` block. Feeding it to `border-radius`
 * makes the declaration invalid, so on any browser that supports
 * `corner-shape` the whole panel would silently fall back to square corners.
 */
const RADIUS_CARD = '8px'
const RADIUS_CTRL = '6px'
const MONO_FONT = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)'

/**
 * Makes an official `Input` fill its grid cell.
 *
 * `Input` puts `className` on its own inline-flex wrapper and renders the
 * native input inside it, so a width on the input alone would not stretch the
 * control.
 */
const FILL = 'mcp-fill'

/**
 * Every token below is verified to exist in `@deepseek-ai/dsh-client-ui-theme`
 * (light under `body`, dark under `body[data-ds-dark-theme]`). Tokens that do
 * not exist keep the hardcoded fallback in both themes, so only well-known
 * names are used here.
 */
const COLORS = {
  text: 'var(--dsw-alias-label-primary, #0f1115)',
  textSecondary: 'var(--dsw-alias-label-secondary, #61666b)',
  textTertiary: 'var(--dsw-alias-label-tertiary, #81858c)',
  border: 'var(--dsw-alias-border-l2, #e1e5ee)',
  borderSubtle: 'var(--dsw-alias-border-l1, #ebeef2)',
  borderStrong: 'var(--dsw-alias-border-l3, #dcdcdc)',
  surface: 'var(--dsw-alias-bg-layer-2, #ffffff)',
  surfaceSubtle: 'var(--dsw-alias-bg-layer-1, #fafafa)',
  surfaceRaised: 'var(--dsw-alias-bg-layer-3, #f5f5f5)',
  business: 'var(--dsw-alias-state-business-primary, #2f6fed)',
  warn: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
  danger: 'var(--dsw-alias-state-error-primary, #ec1313)',
} as const

const ELEVATION_SOFT = 'var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))'

/**
 * Scoped stylesheet for the panel's own layout.
 *
 * Interactive chrome is no longer styled here: every control is an official
 * `@deepseek-ai/dsh-client-ui-primitives` component that brings its own
 * themed stylesheet, so this sheet is left with the card hover, the native
 * `select`/`textarea` metrics the primitives do not cover, the `<details>`
 * chevron, the disabled affordance, and the two deliberate departures
 * (`FILL` to stretch an `Input`, `data-mcp-danger` because the primitives
 * expose no destructive button variant). `!important` is deliberate: the
 * panel's base look is inline, and inline declarations otherwise win.
 */
const PANEL_CSS = [
  '[data-mcp-manager="panel"] :focus-visible { outline: 2px solid ' + COLORS.business + '; outline-offset: 1px; }',
  '[data-mcp-manager="panel"] button:disabled { opacity: .45; cursor: not-allowed !important; }',
  '[data-mcp-manager="panel"] button[data-mcp-danger]:not(:disabled) { color: ' + COLORS.danger + ' !important; border-color: ' + COLORS.danger + ' !important; }',
  '[data-mcp-manager="panel"] button[data-mcp-danger]:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06)) !important; }',
  '[data-mcp-manager="panel"] .' + FILL + ' { display: flex; width: 100%; max-width: 100%; }',
  '[data-mcp-manager="panel"] [data-mcp-server] { transition: border-color .15s ease, box-shadow .15s ease; }',
  '[data-mcp-manager="panel"] [data-mcp-server]:hover { border-color: ' + COLORS.borderStrong + ' !important; box-shadow: var(--dsw-elevation-panel, ' + ELEVATION_SOFT + ') !important; }',
  '[data-mcp-manager="panel"] input, [data-mcp-manager="panel"] select, [data-mcp-manager="panel"] textarea { transition: border-color .15s ease, background-color .15s ease; }',
  '[data-mcp-manager="panel"] select:not(:disabled):hover, [data-mcp-manager="panel"] textarea:not(:disabled):hover { border-color: ' + COLORS.borderStrong + ' !important; }',
  '[data-mcp-manager="panel"] select:focus-visible, [data-mcp-manager="panel"] textarea:focus-visible { border-color: ' + COLORS.business + ' !important; }',
  '[data-mcp-manager="panel"] summary { display: flex; align-items: center; gap: 6px; list-style: none; cursor: pointer; }',
  '[data-mcp-manager="panel"] summary::-webkit-details-marker { display: none; }',
  '[data-mcp-manager="panel"] summary::before { content: ""; flex: 0 0 auto; width: 0; height: 0; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; opacity: .55; transition: transform .15s ease; }',
  '[data-mcp-manager="panel"] details[open] > summary::before { transform: rotate(90deg); }',
  '[data-mcp-manager="panel"] summary:hover { color: ' + COLORS.text + ' !important; }',
].join('\n')
const PANEL_STYLE_ID = 'mcp-manager-panel-style'

/**
 * Status → official `Tag` tone and `StateDot` state.
 *
 * The panel no longer owns a status palette: `Tag` supplies the surface and
 * `StateDot` the glyph, both from the theme tokens the rest of the product
 * uses, so a status reads the same here as anywhere else.
 */
const TAG_TONES: Record<ManagedServerView['status'], TagTone> = {
  loaded: 'success',
  waiting: 'warning',
  loading: 'info',
  failed: 'danger',
  disabled: 'neutral',
}

const DOT_STATES: Record<ManagedServerView['status'], StateDotState> = {
  loaded: 'done',
  waiting: 'warning',
  loading: 'ongoing',
  failed: 'error',
  disabled: 'idle',
}

/** Localized label per source scope. */
const SCOPE_KEYS = {
  project: 'scopeProject',
  profile: 'scopeProfile',
  user: 'scopeUser',
  entry: 'scopeEntry',
} as const

/** Every scope, in the order the editor's segmented control shows them. */
const SCOPE_OPTIONS: readonly McpScope[] = ['project', 'profile', 'user', 'entry']

const TRANSPORT_OPTIONS: readonly { readonly value: ServerDraft['transport']; readonly label: McpLocaleKey }[] = [
  { value: 'stdio', label: 'stdio' },
  { value: 'streamable-http', label: 'http' },
]

const panelStyle: React.CSSProperties = {
  maxWidth: 860,
  padding: 16,
  color: COLORS.text,
  fontFamily: 'var(--dsw-font-family, system-ui, -apple-system, "Segoe UI", sans-serif)',
}

const headerStyle: React.CSSProperties = { marginBlock: '4px 0' }
const headerRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const titleStyle: React.CSSProperties = {
  margin: 0,
  marginInlineEnd: 'auto',
  fontSize: 'var(--dsw-font-base-16-font-size, 16px)',
  lineHeight: 'var(--dsw-font-base-16-line-height, 24px)',
  fontWeight: 600,
  color: COLORS.text,
}
const subtitleRowStyle: React.CSSProperties = { marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }
const metaLabelStyle: React.CSSProperties = { fontSize: 12, lineHeight: '18px', color: COLORS.textTertiary }
const identityChipStyle: React.CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: 12,
  lineHeight: '18px',
  color: COLORS.textTertiary,
  background: 'transparent',
  border: '1px solid ' + COLORS.borderSubtle,
  borderRadius: RADIUS_CTRL,
  padding: '1px 6px',
  whiteSpace: 'nowrap',
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  lineHeight: '18px',
  color: COLORS.textTertiary,
  marginBottom: 4,
}
/**
 * The one native control the primitives do not cover: a multi-line command.
 * It keeps the panel's field metrics so it sits level with the official
 * `Input` beside it.
 */
const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 10px',
  fontSize: 13,
  lineHeight: '18px',
  color: COLORS.text,
  background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  border: '1px solid ' + COLORS.border,
  borderRadius: RADIUS_CTRL,
  resize: 'vertical',
}

const searchLabelStyle: React.CSSProperties = { display: 'block', width: '100%', marginBlock: '14px 16px' }

/**
 * Metrics for the two native controls the primitives do not cover.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` renders text inputs, checkboxes,
 * switches, segmented controls, tags, and dots, but no `select` and no
 * `textarea`. The workspace picker needs an open-ended option list and the
 * command is multi-line, so both stay native and borrow the panel's field
 * metrics to sit level with the official `Input` beside them.
 */
const selectStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 32,
  padding: '0 8px',
  fontSize: 14,
  lineHeight: '22px',
  color: COLORS.text,
  background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  border: '0.5px solid var(--dsw-alias-border-l4, ' + COLORS.border + ')',
  borderRadius: 'var(--dsw-radius-md, ' + RADIUS_CTRL + ')',
}

const cardStyle: React.CSSProperties = {
  background: COLORS.surface,
  border: '1px solid ' + COLORS.border,
  borderRadius: RADIUS_CARD,
  padding: 16,
  marginBlock: 10,
  boxShadow: ELEVATION_SOFT,
}

const cardHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const cardTitleStyle: React.CSSProperties = { fontWeight: 600, fontSize: 15, lineHeight: '22px', color: COLORS.text }
const codeStyle: React.CSSProperties = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textSecondary }
const codeCaptionStyle: React.CSSProperties = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textTertiary }
/** Let an inline `Tag` sit at the end of a flex row without stretching. */
const tagRailStyle: React.CSSProperties = { marginInlineStart: 'auto' }
const metaLineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  color: COLORS.textTertiary,
  fontSize: 12,
  lineHeight: '18px',
  marginBlock: '8px 0',
}
/** Positioning only: `Tag` owns the palette, so a render site may space it. */
const metaTagStyle: React.CSSProperties = { flex: '0 0 auto' }
/** Keeps the status dot and its label on one optical line inside a `Tag`. */
const statusBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 }
const metaCodeStyle: React.CSSProperties = {
  ...codeCaptionStyle,
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
}

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06))',
  borderInlineStart: '3px solid ' + COLORS.danger,
  color: COLORS.text,
  padding: '8px 12px',
  borderRadius: RADIUS_CTRL,
  marginBlock: 8,
  fontSize: 13,
  lineHeight: '20px',
}
const noticeBoxStyle: React.CSSProperties = {
  background: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)',
  borderInlineStart: '3px solid ' + COLORS.warn,
  color: COLORS.text,
  padding: '8px 12px',
  borderRadius: RADIUS_CTRL,
  marginBlock: 8,
  fontSize: 13,
  lineHeight: '20px',
}
const statusTextStyle: React.CSSProperties = { color: COLORS.textSecondary, marginBlock: 8, fontSize: 13 }
const emptyStateStyle: React.CSSProperties = {
  color: COLORS.textTertiary,
  border: '1px dashed ' + COLORS.border,
  borderRadius: RADIUS_CARD,
  padding: '20px 16px',
  marginBlock: 10,
  fontSize: 13,
  textAlign: 'center',
}
const hintStyle: React.CSSProperties = { color: COLORS.textTertiary, fontSize: 12, lineHeight: '18px', marginBlock: 4 }

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBlock: '12px 0',
  paddingBlockStart: 12,
  borderTop: '1px solid ' + COLORS.borderSubtle,
  flexWrap: 'wrap',
}

const collapseStyle: React.CSSProperties = { marginBlock: 12 }
const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  color: COLORS.textSecondary,
  fontWeight: 500,
  fontSize: 13,
  lineHeight: '20px',
  paddingBlock: 2,
}
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }
const toolItemStyle: React.CSSProperties = {
  paddingBlock: 10,
  borderBottom: '1px solid ' + COLORS.borderSubtle,
}
const toolRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', fontSize: 13, lineHeight: '18px' }
const toolDescriptionStyle: React.CSSProperties = { color: COLORS.textTertiary, fontSize: 12, lineHeight: '18px' }
const paramDetailsStyle: React.CSSProperties = { marginBlock: '8px 0' }
const preStyle: React.CSSProperties = {
  overflow: 'auto',
  fontSize: 12,
  lineHeight: '18px',
  padding: 8,
  margin: 0,
  background: 'var(--dsw-alias-markdown-code-block, #f9fafb)',
  border: '1px solid ' + COLORS.borderSubtle,
  borderRadius: RADIUS_CTRL,
}

const formTitleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, lineHeight: '22px', fontWeight: 600, color: COLORS.text }
const fieldsetStyle: React.CSSProperties = {
  border: '1px solid ' + COLORS.borderSubtle,
  borderRadius: RADIUS_CTRL,
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

const readonlyDetailsStyle: React.CSSProperties = { ...collapseStyle, marginBlock: 20 }
const readonlyItemStyle: React.CSSProperties = {
  paddingBlock: 10,
  borderBottom: '1px solid ' + COLORS.borderSubtle,
}
const readonlyHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const readonlyStatusStyle: React.CSSProperties = { color: COLORS.textTertiary, fontSize: 12, lineHeight: '18px', marginBlock: '6px 0' }

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
  projectPath: string | undefined,
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
      void api.snapshot({ projectPath }, controller.signal).then(
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
  }, [api, onError, onSnapshot, nextSeq, projectPath])
}

export function McpSection({ api, entry, t }: McpSectionProps): ReactNode {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<ServerDraft | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [pollFailed, setPollFailed] = useState(false)
  /** Registered workspace the project scope is rooted at; `undefined` = none. */
  const [projectPath, setProjectPath] = useState<string | undefined>()
  /** Availability and writability of the official form that owns the entry scope. */
  const entryView = useSyncExternalStore(entry.subscribe, entry.snapshot)

  // Scoped stylesheet for states inline styles cannot express; injected once per document.
  useEffect(() => {
    if (document.getElementById(PANEL_STYLE_ID) !== null) return
    const style = document.createElement('style')
    style.id = PANEL_STYLE_ID
    style.textContent = PANEL_CSS
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
    setMessage(error instanceof Error ? error.message : String(error))
  }, [])

  useVisiblePolling(api, projectPath, accept, rejectPoll, nextSeq)

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

  /**
   * Scope a new server is written to: the project scope once the user selected
   * a workspace, otherwise the profile's own file.
   */
  const defaultScope: McpScope = projectPath === undefined ? 'profile' : 'project'

  /**
   * Whether a write to one scope would be accepted right now.
   *
   * The two layers have different writers, so they have different gates: the
   * entry scope follows the official form's own availability and writability,
   * and an `mcp.json` scope follows the Host document's.
   */
  const canWrite = (scope: McpScope): boolean => {
    if (snapshot?.writable === false) return false
    return scope === 'entry' ? entryView.writable : true
  }

  /** Copy a legacy entry-scope server into the writable scope for this session. */
  const migrate = (server: ManagedServerView): void => {
    if (snapshot === undefined) return
    void run(() => api.upsertServer({
      scope: defaultScope,
      projectPath,
      server: {
        id: server.id, label: server.label, enabled: server.enabled, transport: server.transport,
        command: server.command, args: [...server.args], cwd: server.cwd, url: server.url,
        env: Object.fromEntries(Object.keys(server.env).map(key => [key, { clear: true }])),
        headers: Object.fromEntries(Object.keys(server.headers).map(key => [key, { clear: true }])),
        envSensitive: [], headerSensitive: [],
        toolCallTimeoutMs: server.toolCallTimeoutMs, reconnect: { ...server.reconnect },
      },
    }))
  }

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

  /**
   * Apply one official-form write, then re-read the resolved view.
   *
   * The form answers with acceptance rather than a snapshot: it owns revision
   * fencing and recovery, so a refusal already reloaded the Host state. The
   * panel therefore reports the refusal and re-reads through its own RPC, which
   * stays the single place the merged `project → profile → user → entry` view
   * is computed.
   */
  const runEntry = async (operation: () => Promise<boolean>): Promise<boolean> => {
    setBusy(true)
    setMessage(undefined)
    try {
      if (!await operation()) {
        setMessage(t('conflict'))
        return false
      }
      const seq = nextSeq()
      accept(await api.snapshot({ projectPath }), seq)
      return true
    } catch (error) {
      rejectAction(error)
      return false
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
    // An entry-scope definition is a plugin's own configuration, so it is
    // written through the official shared form; an `mcp.json` scope has no
    // official surface and stays on the manager's own RPC.
    const saved = draft.scope === 'entry'
      ? await runEntry(() => entry.upsert(patch))
      : await run(() => api.upsertServer({ server: patch, projectPath })) !== undefined
    if (saved) setDraft(undefined)
  }

  /** Re-open the editor from the latest server view after a refusal (drops draft edits). */
  const rebase = (): void => {
    if (snapshot === undefined || draft === undefined) return
    const current = snapshot.servers.find(server => server.id === draft.id)
    setDraft(current === undefined ? undefined : draftFromServer(current, defaultScope))
    setMessage(undefined)
  }

  const toggleServer = (server: ManagedServerView): void => {
    if (snapshot === undefined) return
    const enabled = !server.enabled
    if (server.scope === 'entry') {
      void runEntry(() => entry.setEnabled(server.id, enabled))
      return
    }
    void run(() => api.setServerEnabled({ id: server.id, enabled, projectPath }))
  }

  const remove = (server: ManagedServerView): void => {
    if (snapshot === undefined || !window.confirm(t('confirmRemove'))) return
    if (server.scope === 'entry') {
      void runEntry(() => entry.remove(server.id))
      return
    }
    void run(async () => {
      const next = await api.removeServer({ id: server.id, projectPath })
      // The per-tool policy is the entry document's own bookkeeping. Deleting
      // the definition here leaves that row behind, so the panel clears it
      // through the official form, the only writer of the entry now.
      await entry.setDisabledTools(server.id, undefined)
      return next
    })
  }

  const reload = (server: ManagedServerView): void => { void run(() => api.reloadServer({ id: server.id })) }

  /** The policy row the official form should hold after one tool checkbox flips. */
  const toggleTool = (server: ManagedServerView, tool: ManagedToolView, enabled: boolean): void => {
    const disabled = (snapshot?.tools ?? [])
      .filter(candidate => candidate.serverId === server.id)
      .filter(candidate => candidate.name === tool.name ? !enabled : !candidate.enabled)
      .map(candidate => candidate.name)
      .sort()
    void runEntry(() => entry.setDisabledTools(server.id, disabled))
  }

  const isConflictMessage = message === t('conflict')

  return (
    <section data-mcp-manager="panel" aria-busy={busy} style={panelStyle}>
      <header style={headerStyle}>
        <div style={headerRowStyle}>
          <h2 style={titleStyle}>{t('title')}</h2>
          <Button variant="primary" onClick={() => setDraft(draftFromServer(undefined, defaultScope))} disabled={busy || !canWrite(defaultScope)}>{t('add')}</Button>
          <Button variant="outline" onClick={() => { if (snapshot !== undefined) void run(() => api.snapshot({ projectPath })) }} disabled={busy}>{t('refresh')}</Button>
        </div>
        <div style={subtitleRowStyle}>
          <span style={metaLabelStyle}>{t('pluginId')}</span>
          <span style={identityChipStyle}>{PLUGIN_IDENTITY}</span>
        </div>
      </header>
      <label style={searchLabelStyle}>
        <span style={fieldLabelStyle}>{t('search')}</span>
        <Input className={FILL} type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder={t('searchHint')} />
      </label>
      {snapshot !== undefined && (snapshot.workspaces ?? []).length > 0 ? <label style={searchLabelStyle}>
        <span style={fieldLabelStyle}>{t('project')}</span>
        {/* A native `select` on purpose: the workspace list is open-ended, and
            the primitives offer only a fixed-option `SegmentedControl`. */}
        <select
          data-mcp-project=""
          style={selectStyle}
          value={projectPath ?? ''}
          onChange={event => setProjectPath(event.currentTarget.value === '' ? undefined : event.currentTarget.value)}
        >
          <option value="">{t('projectNone')}</option>
          {(snapshot.workspaces ?? []).map(workspace => <option key={workspace.id} value={workspace.path}>{workspace.title} — {workspace.path}</option>)}
        </select>
        {projectPath !== undefined ? <p style={hintStyle}>{t('projectHint')}</p> : null}
      </label> : null}
      {snapshot !== undefined ? <details style={readonlyDetailsStyle} data-mcp-sources="">
        <summary style={summaryStyle}>{t('sources')} ({(snapshot.sources ?? []).length})</summary>
        {(snapshot.sources ?? []).map(source => <div key={`${source.scope}:${source.path}`} style={readonlyItemStyle} data-mcp-source={source.scope}>
          <div style={readonlyHeaderRowStyle}>
            <Tag tone="outline">{t(SCOPE_KEYS[source.scope])}{source.compat ? ` · ${t('sourceCompat')}` : ''}</Tag>
            <code style={codeCaptionStyle}>{source.path}</code>
            <span style={tagRailStyle}><Tag tone="neutral">{source.serverCount} {t('serverCount')}</Tag></span>
            <span style={readonlyStatusStyle}>{source.exists ? (source.writable ? t('sourceWritable') : t('sourceReadonly')) : t('sourceMissing')}</span>
          </div>
          {source.error !== undefined ? <p role="alert" style={errorBoxStyle}>{source.error}</p> : null}
          {source.problems !== undefined ? source.problems.map(problem =>
            <p key={problem.id} role="alert" style={errorBoxStyle}>{problem.id}: {problem.error}</p>) : null}
        </div>)}
      </details> : null}
      {message !== undefined ? <p role={isConflictMessage ? 'status' : 'alert'} style={isConflictMessage ? noticeBoxStyle : errorBoxStyle}>
        {message}
        {isConflictMessage ? <Button variant="outline" style={{ marginInlineStart: 8 }} onClick={rebase}>{t('rebase')}</Button> : null}
        {!isConflictMessage ? <Button variant="ghost" style={{ marginInlineStart: 8 }} onClick={() => setMessage(undefined)} aria-label={t('dismiss')}>✕</Button> : null}
      </p> : null}
      {pollFailed && state.status === 'ready' ? <p role="status" style={noticeBoxStyle}>{t('pollFailed')}</p> : null}
      {state.status === 'loading' ? <p role="status" style={statusTextStyle}>{t('loading')}</p> : null}
      {state.status === 'error' ? <p role="alert" style={errorBoxStyle}>{state.message}</p> : null}
      {snapshot !== undefined && servers.length === 0 ? <p style={emptyStateStyle}>{snapshot.servers.length === 0 ? t('noServers') : t('empty')}</p> : null}
      {servers.map(server => (
        <ServerCard
          key={server.id}
          server={server}
          tools={tools.filter(tool => tool.serverId === server.id)}
          t={t}
          busy={busy}
          writable={canWrite(server.scope)}
          onEdit={() => setDraft(draftFromServer(server, defaultScope))}
          onToggle={() => { toggleServer(server) }}
          onReload={() => { reload(server) }}
          onRemove={() => { remove(server) }}
          onMigrate={() => { migrate(server) }}
          onToolToggle={(tool, enabled) => { toggleTool(server, tool, enabled) }}
        />
      ))}
      {draft !== undefined ? (
         <form onSubmit={event => { void save(event) }} style={cardStyle}>
          <h3 style={formTitleStyle}>{draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add')}</h3>
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>{t('basic')}</legend>
            <Field label={t('id')}><Input className={FILL} required pattern={SERVER_ID_PATTERN} value={draft.id} disabled={snapshot?.servers.some(server => server.id === draft.id)} onChange={event => setDraft({ ...draft, id: event.currentTarget.value })} /></Field>
            <Field label={t('label')}><Input className={FILL} value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} /></Field>
            <FieldGroup label={t('scope')}>
              {/* A segmented control shows every scope at once, which is the
                  point of a multi-scope store: the ones that cannot take the
                  write are visible and disabled, with the reason on hover. */}
              <span data-mcp-scope-select={draft.scope}>
                <SegmentedControl
                  id="mcp-scope"
                  label={t('scope')}
                  value={draft.scope}
                  options={SCOPE_OPTIONS.map(scope => ({
                    value: scope,
                    label: t(SCOPE_KEYS[scope]),
                    disabled: (scope === 'project' && projectPath === undefined) || (scope === 'entry' && !entryView.available),
                    title: scope === 'project' && projectPath === undefined ? t('projectHint') : undefined,
                  }))}
                  onChange={scope => setDraft({ ...draft, scope })}
                />
              </span>
            </FieldGroup>
            <FieldGroup label={t('transport')}>
              <SegmentedControl
                id="mcp-transport"
                label={t('transport')}
                value={draft.transport}
                options={TRANSPORT_OPTIONS.map(option => ({ ...option, label: t(option.label) }))}
                onChange={transport => setDraft({ ...draft, transport })}
              />
            </FieldGroup>
            {draft.transport === 'stdio' ? <>
              <Field label={t('command')}><textarea style={textareaStyle} rows={2} required value={draft.command} onChange={event => setDraft({ ...draft, command: event.currentTarget.value })} /></Field>
              <ArgsFields entries={draft.args} t={t} onChange={args => setDraft({ ...draft, args })} />
              <Field label={t('cwd')}><Input className={FILL} value={draft.cwd} onChange={event => setDraft({ ...draft, cwd: event.currentTarget.value })} /></Field>
              <SecretFields label={t('environment')} entries={draft.env} t={t} onChange={env => setDraft({ ...draft, env })} />
            </> : <>
              <Field label={t('url')}><Input className={FILL} type="url" required value={draft.url} onChange={event => setDraft({ ...draft, url: event.currentTarget.value })} /></Field>
              <SecretFields label={t('headers')} entries={draft.headers} t={t} onChange={headers => setDraft({ ...draft, headers })} />
            </>}
          </fieldset>
          <fieldset style={fieldsetStyle}>
            <legend style={legendStyle}>{t('advanced')}</legend>
            <div style={formGridStyle}>
              <Field label={t('timeout')} style={gridFieldStyle}><Input className={FILL} type="number" min={1} step={1} value={draft.timeout} onChange={event => setDraft({ ...draft, timeout: event.currentTarget.value })} /></Field>
            </div>
            <details style={collapseStyle}>
              <summary style={summaryStyle}>{t('reconnect')}</summary>
              {/* `Switch` renders an accessible `role="switch"` button that
                  owns its own `aria-label`, so the row draws the visible copy
                  beside it rather than nesting a control in a label. */}
              <div style={checkRowStyle}>
                <Switch checked={draft.reconnectEnabled} label={t('reconnectEnabled')} onChange={next => setDraft({ ...draft, reconnectEnabled: next })} />
                <span>{t('reconnectEnabled')}</span>
              </div>
              <div style={formGridStyle}>
                <Field label={t('initialDelay')} style={gridFieldStyle}><Input className={FILL} type="number" min={1} step={1} value={draft.initialDelayMs} onChange={event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value })} /></Field>
                <Field label={t('maxDelay')} style={gridFieldStyle}><Input className={FILL} type="number" min={1} step={1} value={draft.maxDelayMs} onChange={event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value })} /></Field>
                <Field label={t('maxAttempts')} style={gridFieldStyle}><Input className={FILL} type="number" min={1} step={1} value={draft.maxAttempts} onChange={event => setDraft({ ...draft, maxAttempts: event.currentTarget.value })} /></Field>
              </div>
            </details>
          </fieldset>
          <div style={formActionsStyle}>
            <Button type="submit" variant="primary" disabled={busy || !canWrite(draft.scope)}>{t('save')}</Button>
            <Button variant="outline" onClick={() => setDraft(undefined)} disabled={busy}>{t('cancel')}</Button>
          </div>
        </form>
      ) : null}
      {snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (
        <details style={readonlyDetailsStyle}>
          <summary style={summaryStyle}>{t('readonly')}</summary>
          <p style={hintStyle}>{t('readOnlyHint')}</p>
          <ul style={listStyle}>{snapshot.readonlyEntries.map(entry => <li key={entry.entryId} style={readonlyItemStyle}>
            <div style={readonlyHeaderRowStyle}>
              <Tag tone={entry.source === 'loader' ? 'neutral' : 'info'}>{entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}`}</Tag>
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

/**
 * One labelled row for a control that is not a single labelable element.
 *
 * `<label>` associates with exactly one form control, so wrapping a segmented
 * control in one both mis-states the markup and strips the accessible name
 * from each of its segments. A grouped control gets this `<div>` row instead.
 */
function FieldGroup({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }): ReactNode {
  return <div style={{ display: 'block', marginBlock: 8, ...style }}>
    <span style={fieldLabelStyle}>{label}</span>
    {children}
  </div>
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
    {entries.map((entry, index) => entry.templated
      // A `${...}` template lives in the file and is resolved by the Host at
      // mount time; the panel never received its value and must not rewrite it.
      ? <div key={entry.uid} style={secretRowStyle} data-mcp-template={entry.key}>
        <Field label={t('secretKey')} style={secretFieldStyle}><Input className={FILL} value={entry.key} readOnly /></Field>
        <p style={hintStyle} data-mcp-template-hint="">{t('secretTemplate')}</p>
      </div>
      : <div key={entry.uid} style={secretRowStyle}>
      <Field label={t('secretKey')} style={secretFieldStyle}><Input className={FILL} value={entry.key} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, key: event.currentTarget.value }
        onChange(next)
      }} /></Field>
      <Field label={t('secretValue')} style={secretFieldStyle}><Input className={FILL} type={entry.sensitive ? 'password' : 'text'} value={entry.value} disabled={entry.clear} placeholder={entry.clear ? t('secretUnset') : undefined} onChange={event => {
        const next = [...entries]
        next[index] = { ...entry, value: event.currentTarget.value }
        onChange(next)
      }} /></Field>
      <div style={secretActionsStyle}>
        <Checkbox label={t('sensitive')} checked={entry.sensitive} onChange={next => {
          const updated = [...entries]
          updated[index] = { ...entry, sensitive: next }
          onChange(updated)
        }} />
        <Checkbox label={t('secretUnset')} checked={entry.clear} onChange={next => {
          const updated = [...entries]
          updated[index] = { ...entry, clear: next }
          onChange(updated)
        }} />
        <Button variant="outline" data-mcp-danger="" onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}>{t('remove')}</Button>
      </div>
    </div>)}
    <Button variant="outline" onClick={() => onChange([...entries, newSecretDraft()])}>{t('addEntry')}</Button>
  </fieldset>
}

/** Lossless per-row argument editor: values are saved verbatim (no trim/filter). */
function ArgsFields({ entries, t, onChange }: { entries: readonly string[]; t: McpSectionProps['t']; onChange: (entries: string[]) => void }): ReactNode {
  return <fieldset style={groupFieldsetStyle}>
    <legend style={legendStyle}>{t('args')}</legend>
    <p style={hintStyle}>{t('argsHint')}</p>
    {entries.map((value, index) => <div key={index} style={secretRowStyle}>
      <Field label={`${t('argument')} ${index + 1}`} style={secretFieldStyle}>
        <Input className={FILL} value={value} onChange={event => {
          const next = [...entries]
          next[index] = event.currentTarget.value
          onChange(next)
        }} />
      </Field>
      <div style={secretActionsStyle}>
        <Button variant="outline" data-mcp-danger="" onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}>{t('remove')}</Button>
      </div>
    </div>)}
    <Button variant="outline" onClick={() => onChange([...entries, ''])}>{t('addEntry')}</Button>
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
  onMigrate: () => void
  onToolToggle: (tool: ManagedToolView, enabled: boolean) => void
}

function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onMigrate, onToolToggle }: ServerCardProps): ReactNode {
  const target = server.transport === 'stdio' ? server.command : server.url
  return <article data-mcp-server={server.id} style={cardStyle}>
    <div style={cardHeaderRowStyle}>
      <Tag tone={TAG_TONES[server.status]}>
        <span data-mcp-status={server.status} style={statusBadgeStyle}>
          <StateDot state={DOT_STATES[server.status]} size={6} />
          {t(STATUS_KEYS[server.status])}
        </span>
      </Tag>
      <strong style={cardTitleStyle}>{server.label}</strong>
      <code style={codeCaptionStyle}>{server.id}</code>
      <span data-mcp-scope={server.scope} style={metaTagStyle}><Tag tone="neutral">{t(SCOPE_KEYS[server.scope])}</Tag></span>
      {server.shadowed.length > 0
        ? <span data-mcp-shadowed={server.shadowed.join(',')} style={metaTagStyle} title={server.shadowed.map(scope => t(SCOPE_KEYS[scope])).join(', ')}><Tag tone="warning">{t('shadowed')}</Tag></span>
        : null}
      <span style={tagRailStyle}><Tag tone="outline">{server.toolCount} {t('toolCount')}</Tag></span>
    </div>
    <div style={metaLineStyle}>
      <Tag tone="quiet">{server.transport === 'stdio' ? t('stdio') : t('http')}</Tag>
      <code style={metaCodeStyle} title={target}>{target}</code>
    </div>
    {server.error !== undefined ? <p role="alert" style={errorBoxStyle}>{server.error}</p> : null}
    <div style={actionsRowStyle}>
      <Button variant="primary" onClick={onEdit} disabled={busy || !writable}>{t('edit')}</Button>
      <Button variant="outline" onClick={onToggle} disabled={busy || !writable}>{server.enabled ? t('disable') : t('enable')}</Button>
      <Button variant="outline" onClick={onReload} disabled={busy}>{t('reload')}</Button>
      {server.scope === 'entry'
        ? <Button variant="outline" onClick={onMigrate} disabled={busy || !writable}>{t('migrate')}</Button>
        : null}
      <Button variant="outline" data-mcp-danger="" style={tagRailStyle} onClick={onRemove} disabled={busy || !writable}>{t('remove')}</Button>
    </div>
    <details style={collapseStyle}>
      <summary style={summaryStyle}>{t('tools')} ({tools.length})</summary>
      {tools.length === 0 ? <p style={statusTextStyle}>{t('noTools')}</p> : <ul style={listStyle}>{tools.map(tool => <li key={tool.name} style={toolItemStyle}>
        <div style={toolRowStyle}>
          <Checkbox label={tool.name} checked={tool.enabled} onChange={next => onToolToggle(tool, next)} disabled={busy || !writable} />
          <code style={codeStyle}>{tool.name}</code>
          <span style={toolDescriptionStyle}>{tool.description}</span>
        </div>
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
