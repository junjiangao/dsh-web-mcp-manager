import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Settings → MCP page. It intentionally owns no durable state. */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Input, RiskConfirmation, SegmentedControl, StateDot, Switch, Tag, } from '@deepseek-ai/dsh-client-ui-primitives';
import { PLUGIN_IDENTITY } from "../types.js";
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
 * Makes an official `Input` fill its grid cell.
 *
 * `Input` puts `className` on its own inline-flex wrapper and renders the
 * native input inside it, so a width on the input alone would not stretch the
 * control.
 */
const FILL = 'mcp-fill';
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
};
const ELEVATION_SOFT = 'var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))';
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
].join('\n');
const PANEL_STYLE_ID = 'mcp-manager-panel-style';
/**
 * Status → official `Tag` tone and `StateDot` state.
 *
 * The panel no longer owns a status palette: `Tag` supplies the surface and
 * `StateDot` the glyph, both from the theme tokens the rest of the product
 * uses, so a status reads the same here as anywhere else.
 */
const TAG_TONES = {
    loaded: 'success',
    waiting: 'warning',
    loading: 'info',
    failed: 'danger',
    disabled: 'neutral',
};
const DOT_STATES = {
    loaded: 'done',
    waiting: 'warning',
    loading: 'ongoing',
    failed: 'error',
    disabled: 'idle',
};
/** Localized label per source scope. */
const SCOPE_KEYS = {
    project: 'scopeProject',
    profile: 'scopeProfile',
    user: 'scopeUser',
    entry: 'scopeEntry',
};
/** Every scope, in the order the editor's segmented control shows them. */
const SCOPE_OPTIONS = ['project', 'profile', 'user', 'entry'];
const TRANSPORT_OPTIONS = [
    { value: 'stdio', label: 'stdio' },
    { value: 'streamable-http', label: 'http' },
];
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
const fieldLabelStyle = {
    display: 'block',
    fontSize: 12,
    lineHeight: '18px',
    color: COLORS.textTertiary,
    marginBottom: 4,
};
/**
 * The one native control the primitives do not cover: a multi-line command.
 * It keeps the panel's field metrics so it sits level with the official
 * `Input` beside it.
 */
const textareaStyle = {
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
};
const searchLabelStyle = { display: 'block', width: '100%', marginBlock: '14px 16px' };
/**
 * Metrics for the two native controls the primitives do not cover.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` renders text inputs, checkboxes,
 * switches, segmented controls, tags, and dots, but no `select` and no
 * `textarea`. The workspace picker needs an open-ended option list and the
 * command is multi-line, so both stay native and borrow the panel's field
 * metrics to sit level with the official `Input` beside them.
 */
const selectStyle = {
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
};
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
/** Let an inline `Tag` sit at the end of a flex row without stretching. */
const tagRailStyle = { marginInlineStart: 'auto' };
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
/** Positioning only: `Tag` owns the palette, so a render site may space it. */
const metaTagStyle = { flex: '0 0 auto' };
/** Keeps the status dot and its label on one optical line inside a `Tag`. */
const statusBadgeStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 };
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
export function McpSection({ api, entry, store, t }) {
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState();
    /** The server whose removal is awaiting confirmation. */
    const [pendingRemove, setPendingRemove] = useState();
    const [acknowledged, setAcknowledged] = useState(false);
    /** Availability and writability of the official form that owns the entry scope. */
    const entryView = useSyncExternalStore(entry.subscribe, entry.snapshot);
    /** The Host view and its read loop, owned by the official client store. */
    const view = useSyncExternalStore(store.state.subscribe, store.state.getSnapshot);
    // Scoped stylesheet for states inline styles cannot express; injected once per document.
    useEffect(() => {
        if (document.getElementById(PANEL_STYLE_ID) !== null)
            return;
        const style = document.createElement('style');
        style.id = PANEL_STYLE_ID;
        style.textContent = PANEL_CSS;
        document.head.append(style);
    }, []);
    // The store owns the visible-page read loop, so unmounting the page stops it.
    useEffect(() => store.startPolling(), [store]);
    const { busy, message, pollFailed, projectPath } = view;
    const snapshot = view.status === 'ready' ? view.snapshot : undefined;
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
    /**
     * Scope a new server is written to: the project scope once the user selected
     * a workspace, otherwise the profile's own file.
     */
    const defaultScope = projectPath === undefined ? 'profile' : 'project';
    /**
     * Whether a write to one scope would be accepted right now.
     *
     * The two layers have different writers, so they have different gates: the
     * entry scope follows the official form's own availability and writability,
     * and an `mcp.json` scope follows the Host document's.
     */
    const canWrite = (scope) => {
        if (snapshot?.writable === false)
            return false;
        return scope === 'entry' ? entryView.writable : true;
    };
    /** Copy a legacy entry-scope server into the writable scope for this session. */
    const migrate = (server) => {
        if (snapshot === undefined)
            return;
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
        }));
    };
    /** One RPC operation, through the store's sequence and message discipline. */
    const run = store.run;
    /** One official-form write; a refusal is reported as the panel's conflict copy. */
    const runEntry = (operation) => store.runForm(operation, t('conflict'));
    const save = async (event) => {
        event.preventDefault();
        if (snapshot === undefined || draft === undefined)
            return;
        const duplicates = [...duplicateDraftKeys(draft.env), ...duplicateDraftKeys(draft.headers)];
        if (duplicates.length > 0) {
            store.notify(`${t('duplicateKey')}: ${[...new Set(duplicates)].join(', ')}`);
            return;
        }
        const patch = draftPatch(draft);
        // An entry-scope definition is a plugin's own configuration, so it is
        // written through the official shared form; an `mcp.json` scope has no
        // official surface and stays on the manager's own RPC.
        const saved = draft.scope === 'entry'
            ? await runEntry(() => entry.upsert(patch))
            : await run(() => api.upsertServer({ server: patch, projectPath })) !== undefined;
        if (saved)
            setDraft(undefined);
    };
    /** Re-open the editor from the latest server view after a refusal (drops draft edits). */
    const rebase = () => {
        if (snapshot === undefined || draft === undefined)
            return;
        const current = snapshot.servers.find(server => server.id === draft.id);
        setDraft(current === undefined ? undefined : draftFromServer(current, defaultScope));
        store.clearMessage();
    };
    const toggleServer = (server) => {
        if (snapshot === undefined)
            return;
        const enabled = !server.enabled;
        if (server.scope === 'entry') {
            void runEntry(() => entry.setEnabled(server.id, enabled));
            return;
        }
        void run(() => api.setServerEnabled({ id: server.id, enabled, projectPath }));
    };
    /**
     * Ask before deleting a definition.
     *
     * Removal drops the server and its per-tool policy with no undo, so it goes
     * through the official acknowledgement dialog rather than a blocking
     * `window.confirm`.
     */
    const askRemove = (server) => {
        setAcknowledged(false);
        setPendingRemove(server);
    };
    const remove = (server) => {
        if (snapshot === undefined)
            return;
        if (server.scope === 'entry') {
            void runEntry(() => entry.remove(server.id));
            return;
        }
        void run(async () => {
            const next = await api.removeServer({ id: server.id, projectPath });
            // The per-tool policy is the entry document's own bookkeeping. Deleting
            // the definition here leaves that row behind, so the panel clears it
            // through the official form, the only writer of the entry now.
            await entry.setDisabledTools(server.id, undefined);
            return next;
        });
    };
    const reload = (server) => { void run(() => api.reloadServer({ id: server.id })); };
    /** The policy row the official form should hold after one tool checkbox flips. */
    const toggleTool = (server, tool, enabled) => {
        const disabled = (snapshot?.tools ?? [])
            .filter(candidate => candidate.serverId === server.id)
            .filter(candidate => candidate.name === tool.name ? !enabled : !candidate.enabled)
            .map(candidate => candidate.name)
            .sort();
        void runEntry(() => entry.setDisabledTools(server.id, disabled));
    };
    const isConflictMessage = message === t('conflict');
    return (_jsxs("section", { "data-mcp-manager": "panel", "aria-busy": busy, style: panelStyle, children: [_jsxs("header", { style: headerStyle, children: [_jsxs("div", { style: headerRowStyle, children: [_jsx("h2", { style: titleStyle, children: t('title') }), _jsx(Button, { variant: "primary", onClick: () => setDraft(draftFromServer(undefined, defaultScope)), disabled: busy || !canWrite(defaultScope), children: t('add') }), _jsx(Button, { variant: "outline", onClick: () => { void store.refresh(); }, disabled: busy, children: t('refresh') })] }), _jsxs("div", { style: subtitleRowStyle, children: [_jsx("span", { style: metaLabelStyle, children: t('pluginId') }), _jsx("span", { style: identityChipStyle, children: PLUGIN_IDENTITY })] })] }), _jsxs("label", { style: searchLabelStyle, children: [_jsx("span", { style: fieldLabelStyle, children: t('search') }), _jsx(Input, { className: FILL, type: "search", value: query, onChange: event => setQuery(event.currentTarget.value), placeholder: t('searchHint') })] }), snapshot !== undefined && (snapshot.workspaces ?? []).length > 0 ? _jsxs("label", { style: searchLabelStyle, children: [_jsx("span", { style: fieldLabelStyle, children: t('project') }), _jsxs("select", { "data-mcp-project": "", style: selectStyle, value: projectPath ?? '', onChange: event => store.selectProject(event.currentTarget.value === '' ? undefined : event.currentTarget.value), children: [_jsx("option", { value: "", children: t('projectNone') }), (snapshot.workspaces ?? []).map(workspace => _jsxs("option", { value: workspace.path, children: [workspace.title, " \u2014 ", workspace.path] }, workspace.id))] }), projectPath !== undefined ? _jsx("p", { style: hintStyle, children: t('projectHint') }) : null] }) : null, snapshot !== undefined ? _jsxs("details", { style: readonlyDetailsStyle, "data-mcp-sources": "", children: [_jsxs("summary", { style: summaryStyle, children: [t('sources'), " (", (snapshot.sources ?? []).length, ")"] }), (snapshot.sources ?? []).map(source => _jsxs("div", { style: readonlyItemStyle, "data-mcp-source": source.scope, children: [_jsxs("div", { style: readonlyHeaderRowStyle, children: [_jsxs(Tag, { tone: "outline", children: [t(SCOPE_KEYS[source.scope]), source.compat ? ` · ${t('sourceCompat')}` : ''] }), _jsx("code", { style: codeCaptionStyle, children: source.path }), _jsx("span", { style: tagRailStyle, children: _jsxs(Tag, { tone: "neutral", children: [source.serverCount, " ", t('serverCount')] }) }), _jsx("span", { style: readonlyStatusStyle, children: source.exists ? (source.writable ? t('sourceWritable') : t('sourceReadonly')) : t('sourceMissing') })] }), source.error !== undefined ? _jsx("p", { role: "alert", style: errorBoxStyle, children: source.error }) : null, source.problems !== undefined ? source.problems.map(problem => _jsxs("p", { role: "alert", style: errorBoxStyle, children: [problem.id, ": ", problem.error] }, problem.id)) : null] }, `${source.scope}:${source.path}`))] }) : null, message !== undefined ? _jsxs("p", { role: isConflictMessage ? 'status' : 'alert', style: isConflictMessage ? noticeBoxStyle : errorBoxStyle, children: [message, isConflictMessage ? _jsx(Button, { variant: "outline", style: { marginInlineStart: 8 }, onClick: rebase, children: t('rebase') }) : null, !isConflictMessage ? _jsx(Button, { variant: "ghost", style: { marginInlineStart: 8 }, onClick: () => store.clearMessage(), "aria-label": t('dismiss'), children: "\u2715" }) : null] }) : null, pollFailed && view.status === 'ready' ? _jsx("p", { role: "status", style: noticeBoxStyle, children: t('pollFailed') }) : null, view.status === 'loading' ? _jsx("p", { role: "status", style: statusTextStyle, children: t('loading') }) : null, view.status === 'error' ? _jsx("p", { role: "alert", style: errorBoxStyle, children: view.error }) : null, snapshot !== undefined && servers.length === 0 ? _jsx("p", { style: emptyStateStyle, children: snapshot.servers.length === 0 ? t('noServers') : t('empty') }) : null, servers.map(server => (_jsx(ServerCard, { server: server, tools: tools.filter(tool => tool.serverId === server.id), t: t, busy: busy, writable: canWrite(server.scope), onEdit: () => setDraft(draftFromServer(server, defaultScope)), onToggle: () => { toggleServer(server); }, onReload: () => { reload(server); }, onRemove: () => { askRemove(server); }, onMigrate: () => { migrate(server); }, onToolToggle: (tool, enabled) => { toggleTool(server, tool, enabled); } }, server.id))), draft !== undefined ? (_jsxs("form", { onSubmit: event => { void save(event); }, style: cardStyle, children: [_jsx("h3", { style: formTitleStyle, children: draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add') }), _jsxs("fieldset", { style: fieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('basic') }), _jsx(Field, { label: t('id'), children: _jsx(Input, { className: FILL, required: true, pattern: SERVER_ID_PATTERN, value: draft.id, disabled: snapshot?.servers.some(server => server.id === draft.id), onChange: event => setDraft({ ...draft, id: event.currentTarget.value }) }) }), _jsx(Field, { label: t('label'), children: _jsx(Input, { className: FILL, value: draft.label, onChange: event => setDraft({ ...draft, label: event.currentTarget.value }) }) }), _jsx(FieldGroup, { label: t('scope'), children: _jsx("span", { "data-mcp-scope-select": draft.scope, children: _jsx(SegmentedControl, { id: "mcp-scope", label: t('scope'), value: draft.scope, options: SCOPE_OPTIONS.map(scope => ({
                                            value: scope,
                                            label: t(SCOPE_KEYS[scope]),
                                            disabled: (scope === 'project' && projectPath === undefined) || (scope === 'entry' && !entryView.available),
                                            title: scope === 'project' && projectPath === undefined ? t('projectHint') : undefined,
                                        })), onChange: scope => setDraft({ ...draft, scope }) }) }) }), _jsx(FieldGroup, { label: t('transport'), children: _jsx(SegmentedControl, { id: "mcp-transport", label: t('transport'), value: draft.transport, options: TRANSPORT_OPTIONS.map(option => ({ ...option, label: t(option.label) })), onChange: transport => setDraft({ ...draft, transport }) }) }), draft.transport === 'stdio' ? _jsxs(_Fragment, { children: [_jsx(Field, { label: t('command'), children: _jsx("textarea", { style: textareaStyle, rows: 2, required: true, value: draft.command, onChange: event => setDraft({ ...draft, command: event.currentTarget.value }) }) }), _jsx(ArgsFields, { entries: draft.args, t: t, onChange: args => setDraft({ ...draft, args }) }), _jsx(Field, { label: t('cwd'), children: _jsx(Input, { className: FILL, value: draft.cwd, onChange: event => setDraft({ ...draft, cwd: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('environment'), entries: draft.env, t: t, onChange: env => setDraft({ ...draft, env }) })] }) : _jsxs(_Fragment, { children: [_jsx(Field, { label: t('url'), children: _jsx(Input, { className: FILL, type: "url", required: true, value: draft.url, onChange: event => setDraft({ ...draft, url: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('headers'), entries: draft.headers, t: t, onChange: headers => setDraft({ ...draft, headers }) })] })] }), _jsxs("fieldset", { style: fieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('advanced') }), _jsx("div", { style: formGridStyle, children: _jsx(Field, { label: t('timeout'), style: gridFieldStyle, children: _jsx(Input, { className: FILL, type: "number", min: 1, step: 1, value: draft.timeout, onChange: event => setDraft({ ...draft, timeout: event.currentTarget.value }) }) }) }), _jsxs("details", { style: collapseStyle, children: [_jsx("summary", { style: summaryStyle, children: t('reconnect') }), _jsxs("div", { style: checkRowStyle, children: [_jsx(Switch, { checked: draft.reconnectEnabled, label: t('reconnectEnabled'), onChange: next => setDraft({ ...draft, reconnectEnabled: next }) }), _jsx("span", { children: t('reconnectEnabled') })] }), _jsxs("div", { style: formGridStyle, children: [_jsx(Field, { label: t('initialDelay'), style: gridFieldStyle, children: _jsx(Input, { className: FILL, type: "number", min: 1, step: 1, value: draft.initialDelayMs, onChange: event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxDelay'), style: gridFieldStyle, children: _jsx(Input, { className: FILL, type: "number", min: 1, step: 1, value: draft.maxDelayMs, onChange: event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxAttempts'), style: gridFieldStyle, children: _jsx(Input, { className: FILL, type: "number", min: 1, step: 1, value: draft.maxAttempts, onChange: event => setDraft({ ...draft, maxAttempts: event.currentTarget.value }) }) })] })] })] }), _jsxs("div", { style: formActionsStyle, children: [_jsx(Button, { type: "submit", variant: "primary", disabled: busy || !canWrite(draft.scope), children: t('save') }), _jsx(Button, { variant: "outline", onClick: () => setDraft(undefined), disabled: busy, children: t('cancel') })] })] })) : null, snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (_jsxs("details", { style: readonlyDetailsStyle, children: [_jsx("summary", { style: summaryStyle, children: t('readonly') }), _jsx("p", { style: hintStyle, children: t('readOnlyHint') }), _jsx("ul", { style: listStyle, children: snapshot.readonlyEntries.map(entry => _jsxs("li", { style: readonlyItemStyle, children: [_jsxs("div", { style: readonlyHeaderRowStyle, children: [_jsx(Tag, { tone: entry.source === 'loader' ? 'neutral' : 'info', children: entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}` }), _jsx("code", { style: codeStyle, children: entry.entryId }), _jsx("code", { style: codeCaptionStyle, children: entry.moduleName })] }), _jsxs("p", { style: readonlyStatusStyle, children: [t('status'), ": ", entry.enabled === 'conditional' ? t('conditional') : entry.enabled ? t('enabled') : t('disabled'), " (", entry.fiberPhase ?? '—', ")"] })] }, entry.entryId)) })] })) : null, pendingRemove !== undefined ? _jsx(RiskConfirmation, { open: true, title: t('removeTitle'), description: `${t('removeDescription')} ${pendingRemove.label} (${pendingRemove.id})`, acknowledgeLabel: t('removeAcknowledge'), cancelLabel: t('cancel'), closeLabel: t('dismiss'), confirmLabel: t('confirm'), acknowledged: acknowledged, disabled: busy, onAcknowledgedChange: setAcknowledged, onCancel: () => setPendingRemove(undefined), onConfirm: () => {
                    const target = pendingRemove;
                    setPendingRemove(undefined);
                    remove(target);
                } }) : null] }));
}
function Field({ label, children, style }) {
    return _jsxs("label", { style: { display: 'block', marginBlock: 8, ...style }, children: [_jsx("span", { style: fieldLabelStyle, children: label }), children] });
}
/**
 * One labelled row for a control that is not a single labelable element.
 *
 * `<label>` associates with exactly one form control, so wrapping a segmented
 * control in one both mis-states the markup and strips the accessible name
 * from each of its segments. A grouped control gets this `<div>` row instead.
 */
function FieldGroup({ label, children, style }) {
    return _jsxs("div", { style: { display: 'block', marginBlock: 8, ...style }, children: [_jsx("span", { style: fieldLabelStyle, children: label }), children] });
}
function SecretFields({ label, entries, t, onChange }) {
    return _jsxs("fieldset", { style: groupFieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: label }), _jsx("p", { style: hintStyle, children: t('secretHint') }), entries.map((entry, index) => entry.templated
                // A `${...}` template lives in the file and is resolved by the Host at
                // mount time; the panel never received its value and must not rewrite it.
                ? _jsxs("div", { style: secretRowStyle, "data-mcp-template": entry.key, children: [_jsx(Field, { label: t('secretKey'), style: secretFieldStyle, children: _jsx(Input, { className: FILL, value: entry.key, readOnly: true }) }), _jsx("p", { style: hintStyle, "data-mcp-template-hint": "", children: t('secretTemplate') })] }, entry.uid)
                : _jsxs("div", { style: secretRowStyle, children: [_jsx(Field, { label: t('secretKey'), style: secretFieldStyle, children: _jsx(Input, { className: FILL, value: entry.key, onChange: event => {
                                    const next = [...entries];
                                    next[index] = { ...entry, key: event.currentTarget.value };
                                    onChange(next);
                                } }) }), _jsx(Field, { label: t('secretValue'), style: secretFieldStyle, children: _jsx(Input, { className: FILL, type: entry.sensitive ? 'password' : 'text', value: entry.value, disabled: entry.clear, placeholder: entry.clear ? t('secretUnset') : undefined, onChange: event => {
                                    const next = [...entries];
                                    next[index] = { ...entry, value: event.currentTarget.value };
                                    onChange(next);
                                } }) }), _jsxs("div", { style: secretActionsStyle, children: [_jsx(Checkbox, { label: t('sensitive'), checked: entry.sensitive, onChange: next => {
                                        const updated = [...entries];
                                        updated[index] = { ...entry, sensitive: next };
                                        onChange(updated);
                                    } }), _jsx(Checkbox, { label: t('secretUnset'), checked: entry.clear, onChange: next => {
                                        const updated = [...entries];
                                        updated[index] = { ...entry, clear: next };
                                        onChange(updated);
                                    } }), _jsx(Button, { variant: "outline", "data-mcp-danger": "", onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)), children: t('remove') })] })] }, entry.uid)), _jsx(Button, { variant: "outline", onClick: () => onChange([...entries, newSecretDraft()]), children: t('addEntry') })] });
}
/** Lossless per-row argument editor: values are saved verbatim (no trim/filter). */
function ArgsFields({ entries, t, onChange }) {
    return _jsxs("fieldset", { style: groupFieldsetStyle, children: [_jsx("legend", { style: legendStyle, children: t('args') }), _jsx("p", { style: hintStyle, children: t('argsHint') }), entries.map((value, index) => _jsxs("div", { style: secretRowStyle, children: [_jsx(Field, { label: `${t('argument')} ${index + 1}`, style: secretFieldStyle, children: _jsx(Input, { className: FILL, value: value, onChange: event => {
                                const next = [...entries];
                                next[index] = event.currentTarget.value;
                                onChange(next);
                            } }) }), _jsx("div", { style: secretActionsStyle, children: _jsx(Button, { variant: "outline", "data-mcp-danger": "", onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)), children: t('remove') }) })] }, index)), _jsx(Button, { variant: "outline", onClick: () => onChange([...entries, '']), children: t('addEntry') })] });
}
function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onMigrate, onToolToggle }) {
    const target = server.transport === 'stdio' ? server.command : server.url;
    return _jsxs("article", { "data-mcp-server": server.id, style: cardStyle, children: [_jsxs("div", { style: cardHeaderRowStyle, children: [_jsx(Tag, { tone: TAG_TONES[server.status], children: _jsxs("span", { "data-mcp-status": server.status, style: statusBadgeStyle, children: [_jsx(StateDot, { state: DOT_STATES[server.status], size: 6 }), t(STATUS_KEYS[server.status])] }) }), _jsx("strong", { style: cardTitleStyle, children: server.label }), _jsx("code", { style: codeCaptionStyle, children: server.id }), _jsx("span", { "data-mcp-scope": server.scope, style: metaTagStyle, children: _jsx(Tag, { tone: "neutral", children: t(SCOPE_KEYS[server.scope]) }) }), server.shadowed.length > 0
                        ? _jsx("span", { "data-mcp-shadowed": server.shadowed.join(','), style: metaTagStyle, title: server.shadowed.map(scope => t(SCOPE_KEYS[scope])).join(', '), children: _jsx(Tag, { tone: "warning", children: t('shadowed') }) })
                        : null, _jsx("span", { style: tagRailStyle, children: _jsxs(Tag, { tone: "outline", children: [server.toolCount, " ", t('toolCount')] }) })] }), _jsxs("div", { style: metaLineStyle, children: [_jsx(Tag, { tone: "quiet", children: server.transport === 'stdio' ? t('stdio') : t('http') }), _jsx("code", { style: metaCodeStyle, title: target, children: target })] }), server.error !== undefined ? _jsx("p", { role: "alert", style: errorBoxStyle, children: server.error }) : null, _jsxs("div", { style: actionsRowStyle, children: [_jsx(Button, { variant: "primary", onClick: onEdit, disabled: busy || !writable, children: t('edit') }), _jsx(Button, { variant: "outline", onClick: onToggle, disabled: busy || !writable, children: server.enabled ? t('disable') : t('enable') }), _jsx(Button, { variant: "outline", onClick: onReload, disabled: busy, children: t('reload') }), server.scope === 'entry'
                        ? _jsx(Button, { variant: "outline", onClick: onMigrate, disabled: busy || !writable, children: t('migrate') })
                        : null, _jsx(Button, { variant: "outline", "data-mcp-danger": "", style: tagRailStyle, onClick: onRemove, disabled: busy || !writable, children: t('remove') })] }), _jsxs("details", { style: collapseStyle, children: [_jsxs("summary", { style: summaryStyle, children: [t('tools'), " (", tools.length, ")"] }), tools.length === 0 ? _jsx("p", { style: statusTextStyle, children: t('noTools') }) : _jsx("ul", { style: listStyle, children: tools.map(tool => _jsxs("li", { style: toolItemStyle, children: [_jsxs("div", { style: toolRowStyle, children: [_jsx(Checkbox, { label: tool.name, checked: tool.enabled, onChange: next => onToolToggle(tool, next), disabled: busy || !writable }), _jsx("code", { style: codeStyle, children: tool.name }), _jsx("span", { style: toolDescriptionStyle, children: tool.description })] }), _jsxs("details", { style: paramDetailsStyle, children: [_jsxs("summary", { style: summaryStyle, children: ["JSON ", t('params')] }), _jsx("pre", { style: preStyle, children: JSON.stringify(tool.parameters, null, 2) })] })] }, tool.name)) }), Object.entries(server.env).map(([key, value]) => _jsx("span", { "data-mcp-secret": key, hidden: true, children: value.set ? t('secretSet') : t('secretUnset') }, key))] })] });
}
//# sourceMappingURL=McpSection.js.map