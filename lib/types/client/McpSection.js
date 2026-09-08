import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Settings → MCP page. It intentionally owns no durable state. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PLUGIN_IDENTITY } from "../types.js";
import { McpManagerRpcError } from "./api.js";
const STATUS_KEYS = {
    disabled: 'disabled',
    waiting: 'waiting',
    loading: 'loading',
    loaded: 'loaded',
    failed: 'failed',
};
/* ---------- Presentation constants (host `--dsw-*` design tokens + safe fallbacks) ---------- */
const RADIUS = 'var(--dsw-corner-shape, 6px)';
const MONO_FONT = 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)';
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
};
/** Focus ring lives in a scoped injected stylesheet (`:focus-visible` cannot be expressed inline). */
const FOCUS_RING_CSS = '[data-mcp-manager="panel"] :focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed); outline-offset: 1px; }';
const FOCUS_STYLE_ID = 'mcp-manager-focus-style';
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
    borderRadius: RADIUS,
};
function statusChip(status) {
    switch (status) {
        case 'waiting':
            return { ...chipBase, color: COLORS.warn, background: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)', borderColor: 'var(--dsw-alias-state-warn-secondary, #f7ad31)' };
        case 'loading':
            return { ...chipBase, color: COLORS.business, background: 'var(--dsw-alias-state-business-tertiary, #eaf3ff)', borderColor: COLORS.business };
        case 'loaded':
            return { ...chipBase, color: COLORS.success, background: 'var(--dsw-alias-state-success-tertiary, #e6faed)', borderColor: 'var(--dsw-alias-state-success-secondary, #4ed17e)' };
        case 'failed':
            return { ...chipBase, color: COLORS.danger, background: 'var(--dsw-alias-interactive-bg-hover-danger, #fef2f2)', borderColor: COLORS.danger };
        case 'disabled':
            return { ...chipBase, color: COLORS.textDimmed, background: 'var(--dsw-alias-bg-layer-3, #f5f5f5)', borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)' };
    }
}
function sourceChip(source) {
    return source === 'loader'
        ? { ...chipBase, color: COLORS.textTertiary, background: 'var(--dsw-alias-bg-layer-1, #fafafa)', borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)' }
        : { ...chipBase, color: COLORS.business, background: 'var(--dsw-alias-state-business-tertiary, #eaf3ff)', borderColor: COLORS.business };
}
const panelStyle = {
    maxWidth: 860,
    padding: 16,
    color: COLORS.text,
    fontFamily: 'var(--dsw-font-family, system-ui, -apple-system, "Segoe UI", sans-serif)',
};
const headerStyle = { marginBlock: 8 };
const headerRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const titleStyle = {
    margin: 0,
    marginInlineEnd: 'auto',
    fontSize: 'var(--dsw-font-base-16-font-size, 16px)',
    lineHeight: 'var(--dsw-font-base-16-line-height, 24px)',
    fontWeight: 600,
    color: COLORS.text,
};
const subtitleRowStyle = { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 };
const identityChipStyle = {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: '18px',
    color: COLORS.textCaption,
    background: 'var(--dsw-alias-bg-layer-1, #fafafa)',
    border: '1px solid var(--dsw-alias-border-l2, #e1e5ee)',
    borderRadius: RADIUS,
    padding: '2px 8px',
    whiteSpace: 'nowrap',
};
const baseButtonStyle = {
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
};
const buttonPrimaryStyle = {
    ...baseButtonStyle,
    background: 'var(--dsw-alias-button-primary-fill, #0f1115)',
    color: COLORS.textInverted,
};
const buttonSecondaryStyle = {
    ...baseButtonStyle,
    background: 'var(--dsw-alias-button-ghost-active-fill, #f1f3f5)',
    borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)',
    color: COLORS.text,
};
const buttonInfoStyle = {
    ...baseButtonStyle,
    background: 'var(--dsw-alias-button-info-fill, #3b82f6)',
    color: COLORS.textInverted,
};
const buttonToolBarStyle = {
    ...baseButtonStyle,
    background: 'var(--dsw-alias-button-tool-bar-fill, rgba(84, 85, 87, 0.5))',
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
    color: COLORS.textCaption,
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
    border: '1px solid var(--dsw-alias-border-l2, #e1e5ee)',
    borderRadius: RADIUS,
};
const textareaStyle = { ...fieldInputStyle, resize: 'vertical' };
const checkStyle = {
    accentColor: COLORS.business,
    cursor: 'pointer',
};
const searchLabelStyle = { display: 'block', width: '100%', marginBlock: '12px 16px' };
const searchInputStyle = { ...fieldInputStyle, width: '100%', maxWidth: '100%' };
const cardStyle = {
    background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
    border: '1px solid var(--dsw-alias-border-l2, #e1e5ee)',
    borderRadius: RADIUS,
    padding: 16,
    marginBlock: 8,
    boxShadow: 'var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))',
};
const cardHeaderRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const cardTitleStyle = { fontWeight: 600, fontSize: 14, color: COLORS.text };
const codeStyle = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textSecondary };
const codeCaptionStyle = { fontFamily: MONO_FONT, fontSize: 12, color: COLORS.textCaption };
const toolCountChipStyle = {
    ...chipBase,
    marginInlineStart: 'auto',
    color: COLORS.textCaption,
    background: 'var(--dsw-alias-bg-layer-1, #fafafa)',
    borderColor: 'var(--dsw-alias-border-l2, #e1e5ee)',
};
const metaLineStyle = {
    display: 'block',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: COLORS.textCaption,
    fontSize: 12,
    marginBlock: '6px 0',
};
const errorBoxStyle = {
    background: 'var(--dsw-alias-state-error-secondary, #fee2e2)',
    color: COLORS.textError,
    padding: '8px 12px',
    borderRadius: RADIUS,
    marginBlock: 8,
    fontSize: 13,
};
const noticeBoxStyle = {
    background: 'var(--dsw-alias-state-warn-tertiary, #fef5e7)',
    color: 'var(--dsw-alias-state-warn-label, #dd8629)',
    border: '1px solid var(--dsw-alias-state-warn-secondary, #f7ad31)',
    padding: '8px 12px',
    borderRadius: RADIUS,
    marginBlock: 8,
    fontSize: 13,
};
const statusTextStyle = { color: COLORS.textSecondary, marginBlock: 8 };
const hintStyle = { color: COLORS.textCaption, fontSize: 12, marginBlock: 4 };
const actionsRowStyle = { display: 'flex', gap: 8, marginBlock: 8, flexWrap: 'wrap' };
const collapseStyle = { marginBlock: 12 };
const summaryStyle = {
    cursor: 'pointer',
    color: COLORS.textSecondary,
    fontWeight: 500,
    fontSize: 13,
    paddingBlock: 2,
};
const listStyle = { listStyle: 'none', margin: 0, padding: 0 };
const toolItemStyle = {
    paddingBlock: 10,
    borderBottom: '1px solid var(--dsw-alias-separator-primary, #e1e5ee)',
};
const toolRowStyle = { display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' };
const toolDescriptionStyle = { color: COLORS.textCaption, fontSize: 12 };
const paramDetailsStyle = { marginBlock: 8 };
const preStyle = {
    overflow: 'auto',
    fontSize: 12,
    padding: 8,
    margin: 0,
    background: 'var(--dsw-alias-markdown-code-block, #f9fafb)',
    borderRadius: RADIUS,
};
const formTitleStyle = { margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: COLORS.text };
const fieldsetStyle = {
    border: '1px solid var(--dsw-alias-border-l1, #ebeef2)',
    borderRadius: RADIUS,
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
const readonlyDetailsStyle = { ...collapseStyle, marginBlock: 16 };
const readonlyItemStyle = {
    paddingBlock: 8,
    borderBottom: '1px solid var(--dsw-alias-separator-primary, #e1e5ee)',
};
const readonlyHeaderRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const readonlyStatusStyle = { color: COLORS.textCaption, fontSize: 12, marginBlock: 4 };
/* ------------------------------------------------------------------------------------------- */
function draftFromServer(server) {
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
    };
}
function draftPatch(draft) {
    const timeout = Number(draft.timeout);
    const initialDelayMs = positiveIntegerOr(draft.initialDelayMs, 500);
    const maxDelayMs = Math.max(initialDelayMs, positiveIntegerOr(draft.maxDelayMs, 30_000));
    const maxAttempts = positiveIntegerOr(draft.maxAttempts, 10);
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
        envSensitive: sensitiveKeys(draft.env),
        headerSensitive: sensitiveKeys(draft.headers),
        toolCallTimeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 60_000,
        reconnect: { enabled: draft.reconnectEnabled, initialDelayMs, maxDelayMs, maxAttempts },
    };
}
function secretDrafts(value) {
    return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b))
        .map(key => ({ key, value: '', clear: false, sensitive: value?.[key]?.sensitive ?? false }));
}
function secretPatch(entries) {
    const result = {};
    for (const entry of entries) {
        const key = entry.key.trim();
        if (key.length === 0)
            continue;
        if (entry.clear) {
            result[key] = { clear: true };
        }
        else if (entry.value.length > 0) {
            result[key] = entry.value;
        }
    }
    return result;
}
function sensitiveKeys(entries) {
    const keys = entries.filter(entry => entry.sensitive).map(entry => entry.key.trim()).filter(Boolean);
    return [...new Set(keys)];
}
function positiveIntegerOr(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function useVisiblePolling(api, onSnapshot, onError) {
    const load = useCallback((signal) => {
        void api.snapshot({}, signal).then(onSnapshot, onError);
    }, [api, onError, onSnapshot]);
    useEffect(() => {
        const controller = new AbortController();
        let timer;
        const start = () => {
            if (document.visibilityState !== 'visible' || timer !== undefined)
                return;
            timer = setInterval(() => { load(controller.signal); }, 2_000);
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
                load(controller.signal);
                start();
            }
        };
        load(controller.signal);
        start();
        document.addEventListener('visibilitychange', visibility);
        return () => {
            controller.abort();
            stop();
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [load]);
}
export function McpSection({ api, t }) {
    const [state, setState] = useState({ status: 'loading' });
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState();
    // Scoped focus ring for keyboard navigation; injected once per document.
    useEffect(() => {
        if (document.getElementById(FOCUS_STYLE_ID) !== null)
            return;
        const style = document.createElement('style');
        style.id = FOCUS_STYLE_ID;
        style.textContent = FOCUS_RING_CSS;
        document.head.append(style);
    }, []);
    const accept = useCallback((snapshot) => { setState({ status: 'ready', snapshot }); setMessage(undefined); }, []);
    const reject = useCallback((error) => {
        const message = error instanceof McpManagerRpcError && error.code === 'conflict'
            ? t('conflict')
            : error instanceof Error ? error.message : String(error);
        setState(previous => previous.status === 'ready' ? previous : { status: 'error', message });
        setMessage(message);
    }, [t]);
    useVisiblePolling(api, accept, reject);
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
        try {
            const next = await operation();
            accept(next);
            return next;
        }
        catch (error) {
            reject(error);
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
        const patch = draftPatch(draft);
        const next = await run(() => api.upsertServer({ server: patch, expectedRevision: snapshot.revision }));
        if (next !== undefined)
            setDraft(undefined);
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
    return (_jsxs("section", { "data-mcp-manager": "panel", "aria-busy": busy, style: panelStyle, children: [_jsxs("header", { style: headerStyle, children: [_jsxs("div", { style: headerRowStyle, children: [_jsx("h2", { style: titleStyle, children: t('title') }), _jsx("button", { type: "button", style: buttonPrimaryStyle, onClick: () => setDraft(draftFromServer()), disabled: busy || snapshot?.writable === false, children: t('add') }), _jsx("button", { type: "button", style: buttonSecondaryStyle, onClick: () => { if (snapshot !== undefined)
                                    void run(() => api.snapshot({})); }, disabled: busy, children: t('refresh') })] }), _jsx("div", { style: subtitleRowStyle, children: _jsx("span", { style: identityChipStyle, children: PLUGIN_IDENTITY }) })] }), _jsxs("label", { style: searchLabelStyle, children: [_jsx("span", { style: fieldLabelStyle, children: t('search') }), _jsx("input", { type: "search", style: searchInputStyle, value: query, onChange: event => setQuery(event.currentTarget.value), placeholder: t('search') })] }), message !== undefined ? _jsx("p", { role: isConflictMessage ? 'status' : 'alert', style: isConflictMessage ? noticeBoxStyle : errorBoxStyle, children: message }) : null, state.status === 'loading' ? _jsx("p", { role: "status", style: statusTextStyle, children: t('loading') }) : null, state.status === 'error' ? _jsx("p", { role: "alert", style: errorBoxStyle, children: state.message }) : null, snapshot !== undefined && servers.length === 0 ? _jsx("p", { style: statusTextStyle, children: snapshot.servers.length === 0 ? t('noServers') : t('empty') }) : null, servers.map(server => (_jsx(ServerCard, { server: server, tools: tools.filter(tool => tool.serverId === server.id), t: t, busy: busy, writable: snapshot?.writable ?? false, onEdit: () => setDraft(draftFromServer(server)), onToggle: () => { toggleServer(server); }, onReload: () => { reload(server); }, onRemove: () => { remove(server); }, onToolToggle: (tool, enabled) => {
                    if (snapshot === undefined)
                        return;
                    void run(() => api.setToolEnabled({ serverId: server.id, name: tool.name, enabled, expectedRevision: snapshot.revision }));
                } }, server.id))), draft !== undefined ? (_jsxs("form", { onSubmit: event => { void save(event); }, style: cardStyle, children: [_jsx("h3", { style: formTitleStyle, children: draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add') }), _jsxs("fieldset", { style: fieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('basic') }), _jsx(Field, { label: t('id'), children: _jsx("input", { style: fieldInputStyle, required: true, pattern: "[-A-Za-z0-9_]{1,32}", value: draft.id, disabled: snapshot?.servers.some(server => server.id === draft.id), onChange: event => setDraft({ ...draft, id: event.currentTarget.value }) }) }), _jsx(Field, { label: t('label'), children: _jsx("input", { style: fieldInputStyle, value: draft.label, onChange: event => setDraft({ ...draft, label: event.currentTarget.value }) }) }), _jsx(Field, { label: t('transport'), children: _jsxs("select", { style: fieldInputStyle, value: draft.transport, onChange: event => setDraft({ ...draft, transport: event.currentTarget.value }), children: [_jsx("option", { value: "stdio", children: t('stdio') }), _jsx("option", { value: "streamable-http", children: t('http') })] }) }), draft.transport === 'stdio' ? _jsxs(_Fragment, { children: [_jsx(Field, { label: t('command'), children: _jsx("textarea", { style: textareaStyle, rows: 2, required: true, value: draft.command, onChange: event => setDraft({ ...draft, command: event.currentTarget.value }) }) }), _jsx(Field, { label: t('args'), children: _jsx("textarea", { style: textareaStyle, rows: 3, value: draft.args, onChange: event => setDraft({ ...draft, args: event.currentTarget.value }) }) }), _jsx(Field, { label: t('cwd'), children: _jsx("input", { style: fieldInputStyle, value: draft.cwd, onChange: event => setDraft({ ...draft, cwd: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('environment'), entries: draft.env, t: t, onChange: env => setDraft({ ...draft, env }) })] }) : _jsxs(_Fragment, { children: [_jsx(Field, { label: t('url'), children: _jsx("input", { style: fieldInputStyle, type: "url", required: true, value: draft.url, onChange: event => setDraft({ ...draft, url: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('headers'), entries: draft.headers, t: t, onChange: headers => setDraft({ ...draft, headers }) })] })] }), _jsxs("fieldset", { style: fieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('advanced') }), _jsx("div", { style: formGridStyle, children: _jsx(Field, { label: t('timeout'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.timeout, onChange: event => setDraft({ ...draft, timeout: event.currentTarget.value }) }) }) }), _jsxs("details", { style: collapseStyle, children: [_jsx("summary", { style: summaryStyle, children: t('reconnect') }), _jsxs("label", { style: checkRowStyle, children: [_jsx("input", { style: checkStyle, type: "checkbox", checked: draft.reconnectEnabled, onChange: event => setDraft({ ...draft, reconnectEnabled: event.currentTarget.checked }) }), " ", t('reconnectEnabled')] }), _jsxs("div", { style: formGridStyle, children: [_jsx(Field, { label: t('initialDelay'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.initialDelayMs, onChange: event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxDelay'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.maxDelayMs, onChange: event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxAttempts'), style: gridFieldStyle, children: _jsx("input", { style: fieldInputStyle, type: "number", min: 1, step: 1, value: draft.maxAttempts, onChange: event => setDraft({ ...draft, maxAttempts: event.currentTarget.value }) }) })] })] })] }), _jsxs("div", { style: formActionsStyle, children: [_jsx("button", { type: "submit", style: buttonPrimaryStyle, disabled: busy || snapshot?.writable === false, children: t('save') }), _jsx("button", { type: "button", style: buttonSecondaryStyle, onClick: () => setDraft(undefined), disabled: busy, children: t('cancel') })] })] })) : null, snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (_jsxs("details", { style: readonlyDetailsStyle, children: [_jsx("summary", { style: summaryStyle, children: t('readonly') }), _jsx("p", { style: hintStyle, children: t('readOnlyHint') }), _jsx("ul", { style: listStyle, children: snapshot.readonlyEntries.map(entry => _jsxs("li", { style: readonlyItemStyle, children: [_jsxs("div", { style: readonlyHeaderRowStyle, children: [_jsx("span", { style: sourceChip(entry.source), children: entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}` }), _jsx("code", { style: codeStyle, children: entry.entryId }), _jsx("code", { style: codeCaptionStyle, children: entry.moduleName })] }), _jsxs("p", { style: readonlyStatusStyle, children: [t('status'), ": ", entry.enabled === 'conditional' ? t('conditional') : entry.enabled ? t('enabled') : t('disabled'), " (", entry.fiberPhase ?? '—', ")"] })] }, entry.entryId)) })] })) : null] }));
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
                                        } }), " ", t('secretUnset')] }), _jsx("button", { type: "button", style: buttonDangerStyle, onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)), children: t('remove') })] })] }, `${entry.key}-${String(index)}`)), _jsx("button", { type: "button", style: buttonSecondaryStyle, onClick: () => onChange([...entries, { key: '', value: '', clear: false, sensitive: false }]), children: t('addEntry') })] });
}
function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onToolToggle }) {
    return _jsxs("article", { "data-mcp-server": server.id, style: cardStyle, children: [_jsxs("div", { style: cardHeaderRowStyle, children: [_jsx("span", { "data-mcp-status": server.status, style: statusChip(server.status), children: t(STATUS_KEYS[server.status]) }), _jsx("strong", { style: cardTitleStyle, children: server.label }), _jsx("code", { style: codeCaptionStyle, children: server.id }), _jsxs("span", { style: toolCountChipStyle, children: [server.toolCount, " ", t('toolCount')] })] }), _jsxs("div", { style: metaLineStyle, children: [server.transport === 'stdio' ? t('stdio') : t('http'), " \u2192 ", server.transport === 'stdio' ? server.command : server.url] }), server.error !== undefined ? _jsx("p", { role: "alert", style: errorBoxStyle, children: server.error }) : null, _jsxs("div", { style: actionsRowStyle, children: [_jsx("button", { type: "button", style: buttonPrimaryStyle, onClick: onToggle, disabled: busy || !writable, children: server.enabled ? t('disabled') : t('enabled') }), _jsx("button", { type: "button", style: buttonInfoStyle, onClick: onEdit, disabled: busy || !writable, children: t('edit') }), _jsx("button", { type: "button", style: buttonToolBarStyle, onClick: onReload, disabled: busy, children: t('reload') }), _jsx("button", { type: "button", style: buttonDangerStyle, onClick: onRemove, disabled: busy || !writable, children: t('remove') })] }), _jsxs("details", { style: collapseStyle, children: [_jsxs("summary", { style: summaryStyle, children: [t('tools'), " (", tools.length, ")"] }), tools.length === 0 ? _jsx("p", { style: statusTextStyle, children: t('noTools') }) : _jsx("ul", { style: listStyle, children: tools.map(tool => _jsxs("li", { style: toolItemStyle, children: [_jsxs("label", { style: toolRowStyle, children: [_jsx("input", { style: checkStyle, type: "checkbox", checked: tool.enabled, onChange: event => onToolToggle(tool, event.currentTarget.checked), disabled: busy || !writable }), " ", _jsx("code", { style: codeStyle, children: tool.name }), " ", _jsx("span", { style: toolDescriptionStyle, children: tool.description })] }), _jsxs("details", { style: paramDetailsStyle, children: [_jsxs("summary", { style: summaryStyle, children: ["JSON ", t('params')] }), _jsx("pre", { style: preStyle, children: JSON.stringify(tool.parameters, null, 2) })] })] }, tool.name)) }), Object.entries(server.env).map(([key, value]) => _jsx("span", { "data-mcp-secret": key, hidden: true, children: value.set ? t('secretSet') : t('secretUnset') }, key))] })] });
}
//# sourceMappingURL=McpSection.js.map