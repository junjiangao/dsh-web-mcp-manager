import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Settings → MCP page. It intentionally owns no durable state. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLUGIN_IDENTITY } from "../types.js";
import { McpManagerRpcError } from "./api.js";
import { SERVER_ID_PATTERN, draftFromServer, draftPatch, duplicateDraftKeys, newSecretDraft } from "./draft.js";
const STATUS_KEYS = {
    disabled: 'disabled',
    waiting: 'waiting',
    loading: 'loading',
    loaded: 'loaded',
    failed: 'failed',
};
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
const RADIUS_CARD = '8px';
const RADIUS_CTRL = '6px';
const MONO_FONT = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)';
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
    textInverted: 'var(--dsw-alias-label-primary-inverted, #ffffff)',
    border: 'var(--dsw-alias-border-l2, #e1e5ee)',
    borderSubtle: 'var(--dsw-alias-border-l1, #ebeef2)',
    borderStrong: 'var(--dsw-alias-border-l3, #dcdcdc)',
    surface: 'var(--dsw-alias-bg-layer-2, #ffffff)',
    surfaceSubtle: 'var(--dsw-alias-bg-layer-1, #fafafa)',
    surfaceRaised: 'var(--dsw-alias-bg-layer-3, #f5f5f5)',
    business: 'var(--dsw-alias-state-business-primary, #2f6fed)',
    success: 'var(--dsw-alias-state-success-primary, #22c55e)',
    warn: 'var(--dsw-alias-state-warn-primary, #f59e0b)',
    danger: 'var(--dsw-alias-state-error-primary, #ec1313)',
    idle: 'var(--dsw-alias-state-idle-primary, #d4d4d4)',
};
const ELEVATION_SOFT = 'var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))';
/**
 * Scoped stylesheet for everything inline styles cannot express: hover /
 * active feedback, disabled affordances, the focus ring and the disclosure
 * chevron. `!important` is deliberate — the base look is inline, and inline
 * declarations otherwise win over stylesheet rules.
 */
const PANEL_CSS = [
    '[data-mcp-manager="panel"] :focus-visible { outline: 2px solid ' + COLORS.business + '; outline-offset: 1px; }',
    '[data-mcp-manager="panel"] button { transition: background-color .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease; }',
    '[data-mcp-manager="panel"] button:disabled { opacity: .45; cursor: not-allowed !important; }',
    '[data-mcp-manager="panel"] button[data-variant="primary"]:not(:disabled):hover { background: var(--dsw-alias-button-primary-hover, #43454a) !important; }',
    '[data-mcp-manager="panel"] button[data-variant="ghost"]:not(:disabled):hover { background: var(--dsw-alias-button-ghost-active-hover, #e9ecf2) !important; border-color: var(--dsw-alias-button-ghost-active-border, #979da6) !important; }',
    '[data-mcp-manager="panel"] button[data-variant="danger"]:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06)) !important; }',
    '[data-mcp-manager="panel"] [data-mcp-server] { transition: border-color .15s ease, box-shadow .15s ease; }',
    '[data-mcp-manager="panel"] [data-mcp-server]:hover { border-color: ' + COLORS.borderStrong + ' !important; box-shadow: var(--dsw-elevation-panel, ' + ELEVATION_SOFT + ') !important; }',
    '[data-mcp-manager="panel"] input, [data-mcp-manager="panel"] select, [data-mcp-manager="panel"] textarea { transition: border-color .15s ease, background-color .15s ease; }',
    '[data-mcp-manager="panel"] input:not(:disabled):hover, [data-mcp-manager="panel"] select:not(:disabled):hover, [data-mcp-manager="panel"] textarea:not(:disabled):hover { border-color: ' + COLORS.borderStrong + ' !important; }',
    '[data-mcp-manager="panel"] input:focus-visible, [data-mcp-manager="panel"] select:focus-visible, [data-mcp-manager="panel"] textarea:focus-visible { border-color: ' + COLORS.business + ' !important; }',
    '[data-mcp-manager="panel"] summary { display: flex; align-items: center; gap: 6px; list-style: none; cursor: pointer; }',
    '[data-mcp-manager="panel"] summary::-webkit-details-marker { display: none; }',
    '[data-mcp-manager="panel"] summary::before { content: ""; flex: 0 0 auto; width: 0; height: 0; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; opacity: .55; transition: transform .15s ease; }',
    '[data-mcp-manager="panel"] details[open] > summary::before { transform: rotate(90deg); }',
    '[data-mcp-manager="panel"] summary:hover { color: ' + COLORS.text + ' !important; }',
].join('\n');
const PANEL_STYLE_ID = 'mcp-manager-panel-style';
/** Status colours are used for the dot only; the label stays a readable neutral. */
const STATUS_TONES = {
    loaded: { dot: COLORS.success, surface: 'var(--dsw-alias-state-success-tertiary, #e6faed)' },
    waiting: { dot: COLORS.warn, surface: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)' },
    loading: { dot: COLORS.business, surface: 'var(--dsw-alias-state-business-tertiary, #eaf3ff)' },
    failed: { dot: COLORS.danger, surface: 'var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06))' },
    disabled: { dot: COLORS.idle, surface: COLORS.surfaceRaised },
};
const badgeBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    borderRadius: 999,
};
const dotStyle = {
    flex: '0 0 auto',
    width: 6,
    height: 6,
    borderRadius: '50%',
};
const chipBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    border: '1px solid',
    borderRadius: RADIUS_CTRL,
};
function sourceChip(source) {
    return source === 'loader'
        ? { ...chipBase, color: COLORS.textTertiary, background: COLORS.surfaceSubtle, borderColor: COLORS.borderSubtle }
        : { ...chipBase, color: COLORS.business, background: 'var(--dsw-alias-state-business-tertiary, #eaf3ff)', borderColor: 'transparent' };
}
const panelStyle = {
    maxWidth: 860,
    padding: 16,
    color: COLORS.text,
    fontFamily: 'var(--dsw-font-family, system-ui, -apple-system, "Segoe UI", sans-serif)',
};
const headerStyle = { marginBlock: '4px 0' };
const headerRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const titleStyle = {
    margin: 0,
    marginInlineEnd: 'auto',
    fontSize: 'var(--dsw-font-base-16-font-size, 16px)',
    lineHeight: 'var(--dsw-font-base-16-line-height, 24px)',
    fontWeight: 600,
    color: COLORS.text,
};
const subtitleRowStyle = { marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 };
const metaLabelStyle = { fontSize: 12, lineHeight: '18px', color: COLORS.textTertiary };
const identityChipStyle = {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: '18px',
    color: COLORS.textTertiary,
    background: 'transparent',
    border: '1px solid ' + COLORS.borderSubtle,
    borderRadius: RADIUS_CTRL,
    padding: '1px 6px',
    whiteSpace: 'nowrap',
};
const baseButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '6px 12px',
    border: '1px solid transparent',
    borderRadius: RADIUS_CTRL,
    fontSize: 13,
    lineHeight: '18px',
    fontWeight: 500,
    cursor: 'pointer',
};
const buttonPrimaryStyle = {
    ...baseButtonStyle,
    background: 'var(--dsw-alias-button-primary-fill, #0f1115)',
    color: COLORS.textInverted,
};
const buttonGhostStyle = {
    ...baseButtonStyle,
    background: 'var(--dsw-alias-button-ghost-active-fill, #f1f3f5)',
    borderColor: COLORS.border,
    color: COLORS.text,
};
const buttonDangerStyle = {
    ...baseButtonStyle,
    background: 'transparent',
    borderColor: COLORS.danger,
    color: COLORS.danger,
};
const fieldLabelStyle = {
    display: 'block',
    fontSize: 12,
    lineHeight: '18px',
    color: COLORS.textTertiary,
    marginBottom: 4,
};
const fieldInputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 10px',
    fontSize: 13,
    lineHeight: '18px',
    color: COLORS.text,
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    border: '1px solid ' + COLORS.border,
    borderRadius: RADIUS_CTRL,
};
const textareaStyle = { ...fieldInputStyle, resize: 'vertical' };
const checkStyle = {
    accentColor: COLORS.business,
    cursor: 'pointer',
};
const searchLabelStyle = { display: 'block', width: '100%', marginBlock: '14px 16px' };
const searchInputStyle = { ...fieldInputStyle, width: '100%', maxWidth: '100%' };
const cardStyle = {
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: RADIUS_CARD,
    padding: 16,
    marginBlock: 10,
    boxShadow: ELEVATION_SOFT,
};
const cardHeaderRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const cardTitleStyle = { fontWeight: 600, fontSize: 15, lineHeight: '22px', color: COLORS.text };
const codeStyle = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textSecondary };
const codeCaptionStyle = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textTertiary };
const toolCountChipStyle = {
    ...chipBase,
    marginInlineStart: 'auto',
    color: COLORS.textTertiary,
    background: COLORS.surfaceSubtle,
    borderColor: COLORS.borderSubtle,
};
const metaLineStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    color: COLORS.textTertiary,
    fontSize: 12,
    lineHeight: '18px',
    marginBlock: '8px 0',
};
const metaTagStyle = {
    flex: '0 0 auto',
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: '16px',
    color: COLORS.textTertiary,
    background: COLORS.surfaceRaised,
    borderRadius: 4,
    padding: '0 6px',
};
const metaCodeStyle = {
    ...codeCaptionStyle,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
};
const errorBoxStyle = {
    background: 'var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06))',
    borderInlineStart: '3px solid ' + COLORS.danger,
    color: COLORS.text,
    padding: '8px 12px',
    borderRadius: RADIUS_CTRL,
    marginBlock: 8,
    fontSize: 13,
    lineHeight: '20px',
};
const noticeBoxStyle = {
    background: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)',
    borderInlineStart: '3px solid ' + COLORS.warn,
    color: COLORS.text,
    padding: '8px 12px',
    borderRadius: RADIUS_CTRL,
    marginBlock: 8,
    fontSize: 13,
    lineHeight: '20px',
};
const statusTextStyle = { color: COLORS.textSecondary, marginBlock: 8, fontSize: 13 };
const emptyStateStyle = {
    color: COLORS.textTertiary,
    border: '1px dashed ' + COLORS.border,
    borderRadius: RADIUS_CARD,
    padding: '20px 16px',
    marginBlock: 10,
    fontSize: 13,
    textAlign: 'center',
};
const hintStyle = { color: COLORS.textTertiary, fontSize: 12, lineHeight: '18px', marginBlock: 4 };
const actionsRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBlock: '12px 0',
    paddingBlockStart: 12,
    borderTop: '1px solid ' + COLORS.borderSubtle,
    flexWrap: 'wrap',
};
const collapseStyle = { marginBlock: 12 };
const summaryStyle = {
    cursor: 'pointer',
    color: COLORS.textSecondary,
    fontWeight: 500,
    fontSize: 13,
    lineHeight: '20px',
    paddingBlock: 2,
};
const listStyle = { listStyle: 'none', margin: 0, padding: 0 };
const toolItemStyle = {
    paddingBlock: 10,
    borderBottom: '1px solid ' + COLORS.borderSubtle,
};
const toolRowStyle = { display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', fontSize: 13, lineHeight: '18px' };
const toolDescriptionStyle = { color: COLORS.textTertiary, fontSize: 12, lineHeight: '18px' };
const paramDetailsStyle = { marginBlock: '8px 0' };
const preStyle = {
    overflow: 'auto',
    fontSize: 12,
    lineHeight: '18px',
    padding: 8,
    margin: 0,
    background: 'var(--dsw-alias-markdown-code-block, #f9fafb)',
    border: '1px solid ' + COLORS.borderSubtle,
    borderRadius: RADIUS_CTRL,
};
const formTitleStyle = { margin: '0 0 12px', fontSize: 15, lineHeight: '22px', fontWeight: 600, color: COLORS.text };
const fieldsetStyle = {
    border: '1px solid ' + COLORS.borderSubtle,
    borderRadius: RADIUS_CTRL,
    padding: '12px 12px 4px',
    margin: '0 0 12px',
};
const legendStyle = { padding: '0 6px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary };
const groupFieldsetStyle = { border: 0, padding: 0, margin: '0 0 12px' };
const formGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '8px 16px',
    marginBlock: 8,
};
const gridFieldStyle = { marginBlock: 0 };
const checkRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBlock: 8,
    fontSize: 13,
    color: COLORS.text,
    cursor: 'pointer',
};
const formActionsStyle = { display: 'flex', gap: 8, marginBlock: '12px 4px', flexWrap: 'wrap' };
const secretRowStyle = { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px 12px', marginBlock: 6 };
const secretFieldStyle = { flex: '1 1 200px', marginBlock: 0 };
const secretActionsStyle = { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', paddingBlock: 2 };
const secretClearLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: COLORS.text,
    cursor: 'pointer',
};
const readonlyDetailsStyle = { ...collapseStyle, marginBlock: 20 };
const readonlyItemStyle = {
    paddingBlock: 10,
    borderBottom: '1px solid ' + COLORS.borderSubtle,
};
const readonlyHeaderRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const readonlyStatusStyle = { color: COLORS.textTertiary, fontSize: 12, lineHeight: '18px', marginBlock: '6px 0' };
/* ------------------------------------------------------------------------------------------- */
/**
 * Poll the snapshot while the page is visible.
 *
 * Guarantees: at most one request in flight per tick (slow responses are not
 * overlapped), and every response is tagged with the caller's monotonic `seq`
 * so a late poll response can never overwrite a newer snapshot produced by a
 * user operation or a newer poll.
 */
function useVisiblePolling(api, onSnapshot, onError, nextSeq) {
    useEffect(() => {
        const controller = new AbortController();
        let timer;
        let inFlight = false;
        const load = () => {
            if (document.visibilityState !== 'visible' || inFlight)
                return;
            inFlight = true;
            const seq = nextSeq();
            void api.snapshot({}, controller.signal).then(snapshot => onSnapshot(snapshot, seq), error => onError(error, seq)).finally(() => { inFlight = false; });
        };
        const start = () => {
            if (document.visibilityState !== 'visible' || timer !== undefined)
                return;
            timer = setInterval(() => { load(); }, 2_000);
        };
        const stop = () => {
            if (timer === undefined)
                return;
            clearInterval(timer);
            timer = undefined;
        };
        const visibility = () => {
            stop();
            if (document.visibilityState === 'visible') {
                load();
                start();
            }
        };
        load();
        start();
        document.addEventListener('visibilitychange', visibility);
        return () => {
            controller.abort();
            stop();
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [api, onError, onSnapshot, nextSeq]);
}
export function McpSection({ api, t }) {
    const [state, setState] = useState({ status: 'loading' });
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState();
    const [pollFailed, setPollFailed] = useState(false);
    // Scoped stylesheet for states inline styles cannot express; injected once per document.
    useEffect(() => {
        if (document.getElementById(PANEL_STYLE_ID) !== null)
            return;
        const style = document.createElement('style');
        style.id = PANEL_STYLE_ID;
        style.textContent = PANEL_CSS;
        document.head.append(style);
    }, []);
    // Monotonic response sequence shared by polling, manual refresh, and user
    // operations. A response whose seq is no longer current is discarded.
    const seqRef = useRef(0);
    const nextSeq = useCallback(() => {
        seqRef.current += 1;
        return seqRef.current;
    }, []);
    const accept = useCallback((snapshot, seq) => {
        if (seq !== seqRef.current)
            return;
        setState({ status: 'ready', snapshot });
        setPollFailed(false);
    }, []);
    /** Polling failures never touch the user-operation message. */
    const rejectPoll = useCallback((error, seq) => {
        if (seq !== seqRef.current)
            return;
        setPollFailed(true);
        setState(previous => previous.status === 'ready' ? previous : {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
        });
    }, []);
    /** User-operation failures set the action message; kept until the next operation. */
    const rejectAction = useCallback((error) => {
        const message = error instanceof McpManagerRpcError && error.code === 'conflict'
            ? t('conflict')
            : error instanceof Error ? error.message : String(error);
        setMessage(message);
    }, [t]);
    useVisiblePolling(api, accept, rejectPoll, nextSeq);
    const snapshot = state.status === 'ready' ? state.snapshot : undefined;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const servers = useMemo(() => snapshot?.servers.filter(server => {
        if (normalizedQuery.length === 0)
            return true;
        return [server.id, server.label, server.command, server.url].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
            || snapshot.tools.some(tool => tool.serverId === server.id && tool.name.toLocaleLowerCase().includes(normalizedQuery));
    }) ?? [], [normalizedQuery, snapshot]);
    const tools = useMemo(() => snapshot?.tools.filter(tool => {
        if (normalizedQuery.length === 0)
            return true;
        return `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(normalizedQuery);
    }) ?? [], [normalizedQuery, snapshot]);
    const run = async (operation) => {
        setBusy(true);
        setMessage(undefined);
        try {
            const seq = nextSeq();
            const next = await operation();
            accept(next, seq);
            return next;
        }
        catch (error) {
            rejectAction(error);
            return undefined;
        }
        finally {
            setBusy(false);
        }
    };
    const save = async (event) => {
        event.preventDefault();
        if (snapshot === undefined || draft === undefined)
            return;
        const duplicates = [...duplicateDraftKeys(draft.env), ...duplicateDraftKeys(draft.headers)];
        if (duplicates.length > 0) {
            setMessage(`${t('duplicateKey')}: ${[...new Set(duplicates)].join(', ')}`);
            return;
        }
        const patch = draftPatch(draft);
        const next = await run(() => api.upsertServer({ server: patch, expectedRevision: draft.baseRevision }));
        if (next !== undefined)
            setDraft(undefined);
    };
    /** Re-open the editor from the latest server view after a conflict (drops draft edits). */
    const rebase = () => {
        if (snapshot === undefined || draft === undefined)
            return;
        const current = snapshot.servers.find(server => server.id === draft.id);
        setDraft(current === undefined ? undefined : draftFromServer(current, snapshot.revision));
        setMessage(undefined);
    };
    const toggleServer = (server) => {
        if (snapshot === undefined)
            return;
        void run(() => api.setServerEnabled({ id: server.id, enabled: !server.enabled, expectedRevision: snapshot.revision }));
    };
    const remove = (server) => {
        if (snapshot === undefined || !window.confirm(t('confirmRemove')))
            return;
        void run(() => api.removeServer({ id: server.id, expectedRevision: snapshot.revision }));
    };
    const reload = (server) => { void run(() => api.reloadServer({ id: server.id })); };
    const isConflictMessage = message === t('conflict');
    return (_jsxs("section", { "data-mcp-manager": "panel", "aria-busy": busy, style: panelStyle, children: [_jsxs("header", { style: headerStyle, children: [_jsxs("div", { style: headerRowStyle, children: [_jsx("h2", { style: titleStyle, children: t('title') }), _jsx("button", { type: "button", "data-variant": "primary", style: buttonPrimaryStyle, onClick: () => setDraft(draftFromServer(undefined, snapshot?.revision ?? 0)), disabled: busy || snapshot?.writable === false, children: t('add') }), _jsx("button", { type: "button", "data-variant": "ghost", style: buttonGhostStyle, onClick: () => { if (snapshot !== undefined)
                                    void run(() => api.snapshot({})); }, disabled: busy, children: t('refresh') })] }), _jsxs("div", { style: subtitleRowStyle, children: [_jsx("span", { style: metaLabelStyle, children: t('pluginId') }), _jsx("span", { style: identityChipStyle, children: PLUGIN_IDENTITY })] })] }), _jsxs("label", { style: searchLabelStyle, children: [_jsx("span", { style: fieldLabelStyle, children: t('search') }), _jsx("input", { type: "search", style: searchInputStyle, value: query, onChange: event => setQuery(event.currentTarget.value), placeholder: t('searchHint') })] }), message !== undefined ? _jsxs("p", { role: isConflictMessage ? 'status' : 'alert', style: isConflictMessage ? noticeBoxStyle : errorBoxStyle, children: [message, isConflictMessage && draft !== undefined
                        ? _jsx("button", { type: "button", "data-variant": "ghost", style: { ...buttonGhostStyle, marginInlineStart: 8 }, onClick: rebase, children: t('rebase') })
                        : null, !isConflictMessage ? _jsx("button", { type: "button", "data-variant": "ghost", style: { ...buttonGhostStyle, marginInlineStart: 8, padding: '2px 8px' }, onClick: () => setMessage(undefined), "aria-label": t('dismiss'), children: "\u2715" }) : null] }) : null, pollFailed && state.status === 'ready' ? _jsx("p", { role: "status", style: noticeBoxStyle, children: t('pollFailed') }) : null, state.status === 'loading' ? _jsx("p", { role: "status", style: statusTextStyle, children: t('loading') }) : null, state.status === 'error' ? _jsx("p", { role: "alert", style: errorBoxStyle, children: state.message }) : null, snapshot !== undefined && servers.length === 0 ? _jsx("p", { style: emptyStateStyle, children: snapshot.servers.length === 0 ? t('noServers') : t('empty') }) : null, servers.map(server => (_jsx(ServerCard, { server: server, tools: tools.filter(tool => tool.serverId === server.id), t: t, busy: busy, writable: snapshot?.writable ?? false, onEdit: () => setDraft(draftFromServer(server, snapshot?.revision ?? 0)), onToggle: () => { toggleServer(server); }, onReload: () => { reload(server); }, onRemove: () => { remove(server); }, onToolToggle: (tool, enabled) => {
                    if (snapshot === undefined)
                        return;
                    void run(() => api.setToolEnabled({ serverId: server.id, name: tool.name, enabled, expectedRevision: snapshot.revision }));
                } }, server.id))), draft !== undefined ? (_jsxs("form", { onSubmit: event => { void save(event); }, style: cardStyle, children: [_jsx("h3", { style: formTitleStyle, children: draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add') }), _jsxs("fieldset", { style: fieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('basic') }), _jsx(Field, { label: t('id'), children: _jsx("input", { style: fieldInputStyle, required: true, pattern: SERVER_ID_PATTERN, value: draft.id, disabled: snapshot?.servers.some(server => server.id === draft.id), onChange: event => setDraft({ ...draft, id: event.currentTarget.value }) }) }), _jsx(Field, { label: t('label'), children: _jsx("input", { style: fieldInputStyle, value: draft.label, onChange: event => setDraft({ ...draft, label: event.currentTarget.value }) }) }), _jsx(Field, { label: t('transport'), children: _jsxs("select", { style: fieldInputStyle, value: draft.transport, onChange: event => setDraft({ ...draft, transport: event.currentTarget.value }), children: [_jsx("option", { value: "stdio", children: t('stdio') }), _jsx("option", { value: "streamable-http", children: t('http') })] }) }), draft.transport === 'stdio' ? _jsxs(_Fragment, { children: [_jsx(Field, { label: t('command'), children: _jsx("textarea", { style: textareaStyle, rows: 2, required: true, value: draft.command, onChange: event => setDraft({ ...draft, command: event.currentTarget.value }) }) }), _jsx(ArgsFields, { entries: draft.args, t: t, onChange: args => setDraft({ ...draft, args }) }), _jsx(Field, { label: t('cwd'), children: _jsx("input", { style: fieldInputStyle, value: draft.cwd, onChange: event => setDraft({ ...draft, cwd: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('environment'), entries: draft.env, t: t, onChange: env => setDraft({ ...draft, env }) })] }) : _jsxs(_Fragment, { children: [_jsx(Field, { label: t('url'), children: _jsx("input", { style: fieldInputStyle, type: "url", required: true, value: draft.url, onChange: event => setDraft({ ...draft, url: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('headers'), entries: draft.headers, t: t, onChange: headers => setDraft({ ...draft, headers }) })] })] }), _jsxs("fieldset", { style: fieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('advanced') }), _jsx("div", { style: formGridStyle, children: _jsx(Field, { label: t('timeout'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.timeout, onChange: event => setDraft({ ...draft, timeout: event.currentTarget.value }) }) }) }), _jsxs("details", { style: collapseStyle, children: [_jsx("summary", { style: summaryStyle, children: t('reconnect') }), _jsxs("label", { style: checkRowStyle, children: [_jsx("input", { style: checkStyle, type: "checkbox", checked: draft.reconnectEnabled, onChange: event => setDraft({ ...draft, reconnectEnabled: event.currentTarget.checked }) }), " ", t('reconnectEnabled')] }), _jsxs("div", { style: formGridStyle, children: [_jsx(Field, { label: t('initialDelay'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.initialDelayMs, onChange: event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxDelay'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.maxDelayMs, onChange: event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxAttempts'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.maxAttempts, onChange: event => setDraft({ ...draft, maxAttempts: event.currentTarget.value }) }) })] })] })] }), _jsxs("div", { style: formActionsStyle, children: [_jsx("button", { type: "submit", "data-variant": "primary", style: buttonPrimaryStyle, disabled: busy || snapshot?.writable === false, children: t('save') }), _jsx("button", { type: "button", "data-variant": "ghost", style: buttonGhostStyle, onClick: () => setDraft(undefined), disabled: busy, children: t('cancel') })] })] })) : null, snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (_jsxs("details", { style: readonlyDetailsStyle, children: [_jsx("summary", { style: summaryStyle, children: t('readonly') }), _jsx("p", { style: hintStyle, children: t('readOnlyHint') }), _jsx("ul", { style: listStyle, children: snapshot.readonlyEntries.map(entry => _jsxs("li", { style: readonlyItemStyle, children: [_jsxs("div", { style: readonlyHeaderRowStyle, children: [_jsx("span", { style: sourceChip(entry.source), children: entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}` }), _jsx("code", { style: codeStyle, children: entry.entryId }), _jsx("code", { style: codeCaptionStyle, children: entry.moduleName })] }), _jsxs("p", { style: readonlyStatusStyle, children: [t('status'), ": ", entry.enabled === 'conditional' ? t('conditional') : entry.enabled ? t('enabled') : t('disabled'), " (", entry.fiberPhase ?? '—', ")"] })] }, entry.entryId)) })] })) : null] }));
}
function Field({ label, children, style }) {
    return _jsxs("label", { style: { display: 'block', marginBlock: 8, ...style }, children: [_jsx("span", { style: fieldLabelStyle, children: label }), children] });
}
function SecretFields({ label, entries, t, onChange }) {
    return _jsxs("fieldset", { style: groupFieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: label }), _jsx("p", { style: hintStyle, children: t('secretHint') }), entries.map((entry, index) => _jsxs("div", { style: secretRowStyle, children: [_jsx(Field, { label: t('secretKey'), style: secretFieldStyle, children: _jsx("input", { style: fieldInputStyle, value: entry.key, onChange: event => {
                                const next = [...entries];
                                next[index] = { ...entry, key: event.currentTarget.value };
                                onChange(next);
                            } }) }), _jsx(Field, { label: t('secretValue'), style: secretFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: entry.sensitive ? 'password' : 'text', value: entry.value, disabled: entry.clear, placeholder: entry.clear ? t('secretUnset') : undefined, onChange: event => {
                                const next = [...entries];
                                next[index] = { ...entry, value: event.currentTarget.value };
                                onChange(next);
                            } }) }), _jsxs("div", { style: secretActionsStyle, children: [_jsxs("label", { style: secretClearLabelStyle, children: [_jsx("input", { style: checkStyle, type: "checkbox", checked: entry.sensitive, onChange: event => {
                                            const next = [...entries];
                                            next[index] = { ...entry, sensitive: event.currentTarget.checked };
                                            onChange(next);
                                        } }), " ", t('sensitive')] }), _jsxs("label", { style: secretClearLabelStyle, children: [_jsx("input", { style: checkStyle, type: "checkbox", checked: entry.clear, onChange: event => {
                                            const next = [...entries];
                                            next[index] = { ...entry, clear: event.currentTarget.checked };
                                            onChange(next);
                                        } }), " ", t('secretUnset')] }), _jsx("button", { type: "button", "data-variant": "danger", style: buttonDangerStyle, onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)), children: t('remove') })] })] }, entry.uid)), _jsx("button", { type: "button", "data-variant": "ghost", style: buttonGhostStyle, onClick: () => onChange([...entries, newSecretDraft()]), children: t('addEntry') })] });
}
/** Lossless per-row argument editor: values are saved verbatim (no trim/filter). */
function ArgsFields({ entries, t, onChange }) {
    return _jsxs("fieldset", { style: groupFieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('args') }), _jsx("p", { style: hintStyle, children: t('argsHint') }), entries.map((value, index) => _jsxs("div", { style: secretRowStyle, children: [_jsx(Field, { label: `${t('argument')} ${index + 1}`, style: secretFieldStyle, children: _jsx("input", { style: fieldInputStyle, value: value, onChange: event => {
                                const next = [...entries];
                                next[index] = event.currentTarget.value;
                                onChange(next);
                            } }) }), _jsx("div", { style: secretActionsStyle, children: _jsx("button", { type: "button", "data-variant": "danger", style: buttonDangerStyle, onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)), children: t('remove') }) })] }, index)), _jsx("button", { type: "button", "data-variant": "ghost", style: buttonGhostStyle, onClick: () => onChange([...entries, '']), children: t('addEntry') })] });
}
function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onToolToggle }) {
    const tone = STATUS_TONES[server.status];
    const target = server.transport === 'stdio' ? server.command : server.url;
    return _jsxs("article", { "data-mcp-server": server.id, style: cardStyle, children: [_jsxs("div", { style: cardHeaderRowStyle, children: [_jsxs("span", { "data-mcp-status": server.status, style: { ...badgeBase, background: tone.surface }, children: [_jsx("span", { "aria-hidden": "true", style: { ...dotStyle, background: tone.dot } }), t(STATUS_KEYS[server.status])] }), _jsx("strong", { style: cardTitleStyle, children: server.label }), _jsx("code", { style: codeCaptionStyle, children: server.id }), _jsxs("span", { style: toolCountChipStyle, children: [server.toolCount, " ", t('toolCount')] })] }), _jsxs("div", { style: metaLineStyle, children: [_jsx("span", { style: metaTagStyle, children: server.transport === 'stdio' ? t('stdio') : t('http') }), _jsx("code", { style: metaCodeStyle, title: target, children: target })] }), server.error !== undefined ? _jsx("p", { role: "alert", style: errorBoxStyle, children: server.error }) : null, _jsxs("div", { style: actionsRowStyle, children: [_jsx("button", { type: "button", "data-variant": "primary", style: buttonPrimaryStyle, onClick: onEdit, disabled: busy || !writable, children: t('edit') }), _jsx("button", { type: "button", "data-variant": "ghost", style: buttonGhostStyle, onClick: onToggle, disabled: busy || !writable, children: server.enabled ? t('disable') : t('enable') }), _jsx("button", { type: "button", "data-variant": "ghost", style: buttonGhostStyle, onClick: onReload, disabled: busy, children: t('reload') }), _jsx("button", { type: "button", "data-variant": "danger", style: { ...buttonDangerStyle, marginInlineStart: 'auto' }, onClick: onRemove, disabled: busy || !writable, children: t('remove') })] }), _jsxs("details", { style: collapseStyle, children: [_jsxs("summary", { style: summaryStyle, children: [t('tools'), " (", tools.length, ")"] }), tools.length === 0 ? _jsx("p", { style: statusTextStyle, children: t('noTools') }) : _jsx("ul", { style: listStyle, children: tools.map(tool => _jsxs("li", { style: toolItemStyle, children: [_jsxs("label", { style: toolRowStyle, children: [_jsx("input", { style: checkStyle, type: "checkbox", checked: tool.enabled, onChange: event => onToolToggle(tool, event.currentTarget.checked), disabled: busy || !writable }), " ", _jsx("code", { style: codeStyle, children: tool.name }), " ", _jsx("span", { style: toolDescriptionStyle, children: tool.description })] }), _jsxs("details", { style: paramDetailsStyle, children: [_jsxs("summary", { style: summaryStyle, children: ["JSON ", t('params')] }), _jsx("pre", { style: preStyle, children: JSON.stringify(tool.parameters, null, 2) })] })] }, tool.name)) }), Object.entries(server.env).map(([key, value]) => _jsx("span", { "data-mcp-secret": key, hidden: true, children: value.set ? t('secretSet') : t('secretUnset') }, key))] })] });
}
//# sourceMappingURL=McpSection.js.map