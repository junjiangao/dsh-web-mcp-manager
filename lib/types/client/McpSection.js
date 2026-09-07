import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Settings → MCP page. It intentionally owns no durable state. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { McpManagerRpcError } from "./api.js";
const STATUS_KEYS = {
    disabled: 'disabled',
    waiting: 'waiting',
    loading: 'loading',
    loaded: 'loaded',
    failed: 'failed',
};
const cardStyle = {
    border: '1px solid var(--dsh-color-border, #d8d8d8)',
    borderRadius: 8,
    padding: 12,
    marginBlock: 8,
};
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
        toolCallTimeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 60_000,
        reconnect: { enabled: draft.reconnectEnabled, initialDelayMs, maxDelayMs, maxAttempts },
    };
}
function secretDrafts(value) {
    return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b)).map(key => ({ key, value: '', clear: false }));
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
    return (_jsxs("section", { "data-mcp-manager": "panel", "aria-busy": busy, style: { maxWidth: 860, padding: 16 }, children: [_jsxs("header", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, children: [_jsx("h2", { style: { marginInlineEnd: 'auto' }, children: t('title') }), _jsx("button", { type: "button", onClick: () => setDraft(draftFromServer()), disabled: busy || snapshot?.writable === false, children: t('add') }), _jsx("button", { type: "button", onClick: () => { if (snapshot !== undefined)
                            void run(() => api.snapshot({})); }, disabled: busy, children: t('refresh') })] }), _jsxs("label", { style: { display: 'block', marginBlock: '10px' }, children: [_jsx("span", { style: { display: 'block', fontSize: 12 }, children: t('search') }), _jsx("input", { type: "search", value: query, onChange: event => setQuery(event.currentTarget.value), placeholder: t('search') })] }), message !== undefined ? _jsx("p", { role: "alert", style: { color: 'var(--dsh-color-danger, #b42318)' }, children: message }) : null, state.status === 'loading' ? _jsx("p", { children: t('loading') }) : null, state.status === 'error' ? _jsx("p", { role: "alert", children: state.message }) : null, snapshot !== undefined && servers.length === 0 ? _jsx("p", { children: snapshot.servers.length === 0 ? t('noServers') : t('empty') }) : null, servers.map(server => (_jsx(ServerCard, { server: server, tools: tools.filter(tool => tool.serverId === server.id), t: t, busy: busy, writable: snapshot?.writable ?? false, onEdit: () => setDraft(draftFromServer(server)), onToggle: () => { toggleServer(server); }, onReload: () => { reload(server); }, onRemove: () => { remove(server); }, onToolToggle: (tool, enabled) => {
                    if (snapshot === undefined)
                        return;
                    void run(() => api.setToolEnabled({ serverId: server.id, name: tool.name, enabled, expectedRevision: snapshot.revision }));
                } }, server.id))), draft !== undefined ? (_jsxs("form", { onSubmit: event => { void save(event); }, style: { ...cardStyle, background: 'var(--dsh-color-surface-secondary, #fafafa)' }, children: [_jsx("h3", { children: draft.id.length > 0 && snapshot?.servers.some(server => server.id === draft.id) ? t('edit') : t('add') }), _jsx(Field, { label: t('id'), children: _jsx("input", { required: true, pattern: "[A-Za-z0-9_-]{1,32}", value: draft.id, disabled: snapshot?.servers.some(server => server.id === draft.id), onChange: event => setDraft({ ...draft, id: event.currentTarget.value }) }) }), _jsx(Field, { label: t('label'), children: _jsx("input", { value: draft.label, onChange: event => setDraft({ ...draft, label: event.currentTarget.value }) }) }), _jsx(Field, { label: t('transport'), children: _jsxs("select", { value: draft.transport, onChange: event => setDraft({ ...draft, transport: event.currentTarget.value }), children: [_jsx("option", { value: "stdio", children: t('stdio') }), _jsx("option", { value: "streamable-http", children: t('http') })] }) }), draft.transport === 'stdio' ? _jsxs(_Fragment, { children: [_jsx(Field, { label: t('command'), children: _jsx("input", { required: true, value: draft.command, onChange: event => setDraft({ ...draft, command: event.currentTarget.value }) }) }), _jsx(Field, { label: t('args'), children: _jsx("textarea", { value: draft.args, onChange: event => setDraft({ ...draft, args: event.currentTarget.value }) }) }), _jsx(Field, { label: t('cwd'), children: _jsx("input", { value: draft.cwd, onChange: event => setDraft({ ...draft, cwd: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('environment'), entries: draft.env, t: t, onChange: env => setDraft({ ...draft, env }) })] }) : _jsxs(_Fragment, { children: [_jsx(Field, { label: t('url'), children: _jsx("input", { required: true, type: "url", value: draft.url, onChange: event => setDraft({ ...draft, url: event.currentTarget.value }) }) }), _jsx(SecretFields, { label: t('headers'), entries: draft.headers, t: t, onChange: headers => setDraft({ ...draft, headers }) })] }), _jsx(Field, { label: t('timeout'), children: _jsx("input", { type: "number", min: 1, step: 1, value: draft.timeout, onChange: event => setDraft({ ...draft, timeout: event.currentTarget.value }) }) }), _jsxs("fieldset", { style: { border: 0, padding: 0, marginBlock: 12 }, children: [_jsx("legend", { children: t('reconnect') }), _jsxs("label", { style: { display: 'block', marginBlock: 8 }, children: [_jsx("input", { type: "checkbox", checked: draft.reconnectEnabled, onChange: event => setDraft({ ...draft, reconnectEnabled: event.currentTarget.checked }) }), " ", t('reconnectEnabled')] }), _jsx(Field, { label: t('initialDelay'), children: _jsx("input", { type: "number", min: 1, step: 1, value: draft.initialDelayMs, onChange: event => setDraft({ ...draft, initialDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxDelay'), children: _jsx("input", { type: "number", min: 1, step: 1, value: draft.maxDelayMs, onChange: event => setDraft({ ...draft, maxDelayMs: event.currentTarget.value }) }) }), _jsx(Field, { label: t('maxAttempts'), children: _jsx("input", { type: "number", min: 1, step: 1, value: draft.maxAttempts, onChange: event => setDraft({ ...draft, maxAttempts: event.currentTarget.value }) }) })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { type: "submit", disabled: busy || snapshot?.writable === false, children: t('save') }), _jsx("button", { type: "button", onClick: () => setDraft(undefined), disabled: busy, children: t('cancel') })] })] })) : null, snapshot !== undefined && snapshot.readonlyEntries.length > 0 ? (_jsxs("details", { style: { marginBlock: 16 }, children: [_jsx("summary", { children: t('readonly') }), _jsx("p", { children: t('readOnlyHint') }), _jsx("ul", { children: snapshot.readonlyEntries.map(entry => _jsxs("li", { children: [_jsx("code", { children: entry.entryId }), " \u2014 ", entry.moduleName, " \u2014 ", entry.source === 'loader' ? t('sourceLoader') : `${t('sourcePreset')}: ${entry.sourceName ?? entry.sourceId ?? '—'}`, " \u2014 ", entry.enabled === 'conditional' ? t('conditional') : entry.enabled ? t('enabled') : t('disabled'), " (", entry.fiberPhase ?? '—', ")"] }, entry.entryId)) })] })) : null] }));
}
function Field({ label, children }) {
    return _jsxs("label", { style: { display: 'block', marginBlock: 8 }, children: [_jsx("span", { style: { display: 'block', fontSize: 12 }, children: label }), children] });
}
function SecretFields({ label, entries, t, onChange }) {
    return _jsxs("fieldset", { style: { border: 0, padding: 0, marginBlock: 12 }, children: [_jsx("legend", { children: label }), entries.map((entry, index) => _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'end', flexWrap: 'wrap', marginBlock: 6 }, children: [_jsx(Field, { label: t('secretKey'), children: _jsx("input", { value: entry.key, onChange: event => {
                                const next = [...entries];
                                next[index] = { ...entry, key: event.currentTarget.value };
                                onChange(next);
                            } }) }), _jsx(Field, { label: t('secretValue'), children: _jsx("input", { type: "password", value: entry.value, disabled: entry.clear, placeholder: entry.clear ? t('secretUnset') : undefined, onChange: event => {
                                const next = [...entries];
                                next[index] = { ...entry, value: event.currentTarget.value };
                                onChange(next);
                            } }) }), _jsxs("label", { style: { marginBlock: 8 }, children: [_jsx("input", { type: "checkbox", checked: entry.clear, onChange: event => {
                                    const next = [...entries];
                                    next[index] = { ...entry, clear: event.currentTarget.checked };
                                    onChange(next);
                                } }), " ", t('secretUnset')] }), _jsx("button", { type: "button", onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)), children: t('remove') })] }, `${entry.key}-${String(index)}`)), _jsx("button", { type: "button", onClick: () => onChange([...entries, { key: '', value: '', clear: false }]), children: t('addEntry') })] });
}
function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onToolToggle }) {
    return _jsxs("article", { "data-mcp-server": server.id, style: cardStyle, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, children: [_jsx("strong", { children: server.label }), _jsx("code", { children: server.id }), _jsx("span", { "data-mcp-status": server.status, children: t(STATUS_KEYS[server.status]) }), _jsxs("span", { style: { marginInlineStart: 'auto' }, children: [server.toolCount, " ", t('toolCount')] })] }), _jsx("small", { children: server.transport === 'stdio' ? server.command : server.url }), server.error !== undefined ? _jsx("p", { role: "alert", style: { color: 'var(--dsh-color-danger, #b42318)' }, children: server.error }) : null, _jsxs("div", { style: { display: 'flex', gap: 8, marginBlock: 8, flexWrap: 'wrap' }, children: [_jsx("button", { type: "button", onClick: onToggle, disabled: busy || !writable, children: server.enabled ? t('disabled') : t('enabled') }), _jsx("button", { type: "button", onClick: onEdit, disabled: busy || !writable, children: t('edit') }), _jsx("button", { type: "button", onClick: onReload, disabled: busy, children: t('reload') }), _jsx("button", { type: "button", onClick: onRemove, disabled: busy || !writable, children: t('remove') })] }), _jsxs("details", { children: [_jsxs("summary", { children: [t('tools'), " (", tools.length, ")"] }), tools.length === 0 ? _jsx("p", { children: t('noTools') }) : _jsx("ul", { children: tools.map(tool => _jsxs("li", { children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: tool.enabled, onChange: event => onToolToggle(tool, event.currentTarget.checked), disabled: busy || !writable }), " ", _jsx("code", { children: tool.name }), " \u2014 ", tool.description] }), _jsx("pre", { style: { overflow: 'auto', fontSize: 12 }, children: JSON.stringify(tool.parameters, null, 2) })] }, tool.name)) }), Object.entries(server.env).map(([key, value]) => _jsx("span", { "data-mcp-secret": key, hidden: true, children: value.set ? t('secretSet') : t('secretUnset') }, key))] })] });
}
//# sourceMappingURL=McpSection.js.map