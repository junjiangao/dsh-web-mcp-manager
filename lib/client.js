window.__ModuleLoader__.load({
	id: "dsh-web-mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/locales.js
		/** Bilingual copy owned by the MCP settings section. */
		const zh = {
			nav: "MCP",
			title: "MCP 服务",
			add: "新增服务",
			edit: "编辑",
			save: "保存",
			cancel: "取消",
			remove: "删除",
			confirmRemove: "确定删除这个 MCP 服务吗？",
			reload: "重新加载",
			enabled: "已启用",
			disabled: "已停用",
			waiting: "等待加载",
			loading: "加载中",
			loaded: "已加载",
			failed: "加载失败",
			stdio: "stdio",
			http: "streamable-http",
			id: "标识",
			label: "名称",
			transport: "传输方式",
			command: "命令",
			args: "参数（每行一个）",
			cwd: "工作目录",
			url: "URL",
			timeout: "调用超时（毫秒）",
			environment: "环境变量",
			headers: "请求头",
			secretKey: "键",
			secretValue: "值（留空表示保留原值）",
			addEntry: "添加一项",
			reconnect: "重连策略",
			reconnectEnabled: "启用自动重连",
			initialDelay: "首次重试延迟（毫秒）",
			maxDelay: "最大重试延迟（毫秒）",
			maxAttempts: "最大重试次数",
			search: "搜索服务或工具",
			tools: "工具",
			toolCount: "个工具",
			noServers: "还没有面板管理的 MCP 服务。",
			noTools: "当前没有已注册工具。",
			readonly: "已有配置（只读）",
			readOnlyHint: "这些条目来自现有 Loader 或 Agent 预设配置，面板不会修改它们。",
			secretSet: "已设置",
			secretUnset: "未设置",
			error: "操作失败",
			refresh: "刷新",
			conflict: "设置已被其他页面修改，请刷新后重试。",
			empty: "暂无匹配项",
			sourceLoader: "Loader",
			sourcePreset: "预设",
			conditional: "条件启用"
		};
		const en = {
			nav: "MCP",
			title: "MCP services",
			add: "Add service",
			edit: "Edit",
			save: "Save",
			cancel: "Cancel",
			remove: "Delete",
			confirmRemove: "Delete this MCP service?",
			reload: "Reload",
			enabled: "Enabled",
			disabled: "Disabled",
			waiting: "Waiting to load",
			loading: "Loading",
			loaded: "Loaded",
			failed: "Load failed",
			stdio: "stdio",
			http: "streamable-http",
			id: "Id",
			label: "Name",
			transport: "Transport",
			command: "Command",
			args: "Arguments (one per line)",
			cwd: "Working directory",
			url: "URL",
			timeout: "Call timeout (ms)",
			environment: "Environment variables",
			headers: "Request headers",
			secretKey: "Key",
			secretValue: "Value (blank keeps the current value)",
			addEntry: "Add entry",
			reconnect: "Reconnect policy",
			reconnectEnabled: "Enable automatic reconnect",
			initialDelay: "Initial retry delay (ms)",
			maxDelay: "Maximum retry delay (ms)",
			maxAttempts: "Maximum retry attempts",
			search: "Search services or tools",
			tools: "Tools",
			toolCount: "tools",
			noServers: "No panel-managed MCP services yet.",
			noTools: "No registered tools.",
			readonly: "Existing configuration (read-only)",
			readOnlyHint: "These entries come from the existing Loader or agent-preset configuration and are not modified here.",
			secretSet: "Set",
			secretUnset: "Not set",
			error: "Operation failed",
			refresh: "Refresh",
			conflict: "Settings changed in another page. Refresh and try again.",
			empty: "No matches",
			sourceLoader: "Loader",
			sourcePreset: "Preset",
			conditional: "Conditional"
		};
		//#endregion
		//#region lib/types/types.js
		/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
		const MCP_MANAGER_CHANNEL = "/mcp-manager";
		function isRpcResult(value) {
			if (typeof value !== "object" || value === null) return false;
			const record = value;
			if (record.ok === true) return "value" in record;
			if (record.ok !== false || typeof record.error !== "object" || record.error === null) return false;
			const error = record.error;
			return typeof error.code === "string" && typeof error.message === "string";
		}
		//#endregion
		//#region lib/types/client/api.js
		/** Typed browser wrapper over the authenticated Host Connection RPC channel. */
		var McpManagerRpcError = class extends Error {
			code;
			constructor(error) {
				super(error.message);
				this.name = "McpManagerRpcError";
				this.code = error.code;
			}
		};
		function createManagerApi(ctx) {
			const rpc = ctx.get("connection").rpc;
			const call = async (endpoint, payload, signal) => {
				const result = await rpc.call(MCP_MANAGER_CHANNEL, endpoint, payload, signal);
				if (!isRpcResult(result)) throw new Error("MCP manager returned an invalid RPC response");
				if (!result.ok) throw new McpManagerRpcError(result.error);
				return result.value;
			};
			return {
				snapshot: (request = {}, signal) => call("snapshot", request, signal),
				upsertServer: (request, signal) => call("upsertServer", request, signal),
				removeServer: (request, signal) => call("removeServer", request, signal),
				setServerEnabled: (request, signal) => call("setServerEnabled", request, signal),
				reloadServer: (request, signal) => call("reloadServer", request, signal),
				setToolEnabled: (request, signal) => call("setToolEnabled", request, signal)
			};
		}
		//#endregion
		//#region lib/types/client/McpSection.js
		/** Settings → MCP page. It intentionally owns no durable state. */
		const STATUS_KEYS = {
			disabled: "disabled",
			waiting: "waiting",
			loading: "loading",
			loaded: "loaded",
			failed: "failed"
		};
		const cardStyle = {
			border: "1px solid var(--dsh-color-border, #d8d8d8)",
			borderRadius: 8,
			padding: 12,
			marginBlock: 8
		};
		function draftFromServer(server) {
			return {
				id: server?.id ?? "",
				label: server?.label ?? "",
				transport: server?.transport ?? "stdio",
				command: server?.command ?? "",
				args: server?.args.join("\n") ?? "",
				cwd: server?.cwd ?? "",
				url: server?.url ?? "",
				timeout: String(server?.toolCallTimeoutMs ?? 6e4),
				env: secretDrafts(server?.env),
				headers: secretDrafts(server?.headers),
				reconnectEnabled: server?.reconnect.enabled ?? true,
				initialDelayMs: String(server?.reconnect.initialDelayMs ?? 500),
				maxDelayMs: String(server?.reconnect.maxDelayMs ?? 3e4),
				maxAttempts: String(server?.reconnect.maxAttempts ?? 10)
			};
		}
		function draftPatch(draft) {
			const timeout = Number(draft.timeout);
			const initialDelayMs = positiveIntegerOr(draft.initialDelayMs, 500);
			const maxDelayMs = Math.max(initialDelayMs, positiveIntegerOr(draft.maxDelayMs, 3e4));
			const maxAttempts = positiveIntegerOr(draft.maxAttempts, 10);
			return {
				id: draft.id.trim(),
				label: draft.label,
				transport: draft.transport,
				command: draft.command,
				args: draft.args.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean),
				cwd: draft.cwd,
				url: draft.url,
				env: secretPatch(draft.env),
				headers: secretPatch(draft.headers),
				toolCallTimeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 6e4,
				reconnect: {
					enabled: draft.reconnectEnabled,
					initialDelayMs,
					maxDelayMs,
					maxAttempts
				}
			};
		}
		function secretDrafts(value) {
			return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b)).map((key) => ({
				key,
				value: "",
				clear: false
			}));
		}
		function secretPatch(entries) {
			const result = {};
			for (const entry of entries) {
				const key = entry.key.trim();
				if (key.length === 0) continue;
				if (entry.clear) result[key] = { clear: true };
				else if (entry.value.length > 0) result[key] = entry.value;
			}
			return result;
		}
		function positiveIntegerOr(value, fallback) {
			const parsed = Number(value);
			return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
		}
		function useVisiblePolling(api, onSnapshot, onError) {
			const load = (0, react.useCallback)((signal) => {
				api.snapshot({}, signal).then(onSnapshot, onError);
			}, [
				api,
				onError,
				onSnapshot
			]);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let timer;
				const start = () => {
					if (document.visibilityState !== "visible" || timer !== void 0) return;
					timer = setInterval(() => {
						load(controller.signal);
					}, 2e3);
				};
				const stop = () => {
					if (timer === void 0) return;
					clearInterval(timer);
					timer = void 0;
				};
				const visibility = () => {
					stop();
					if (document.visibilityState === "visible") {
						load(controller.signal);
						start();
					}
				};
				load(controller.signal);
				start();
				document.addEventListener("visibilitychange", visibility);
				return () => {
					controller.abort();
					stop();
					document.removeEventListener("visibilitychange", visibility);
				};
			}, [load]);
		}
		function McpSection({ api, t }) {
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [query, setQuery] = (0, react.useState)("");
			const [draft, setDraft] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)();
			const accept = (0, react.useCallback)((snapshot) => {
				setState({
					status: "ready",
					snapshot
				});
				setMessage(void 0);
			}, []);
			const reject = (0, react.useCallback)((error) => {
				const message = error instanceof McpManagerRpcError && error.code === "conflict" ? t("conflict") : error instanceof Error ? error.message : String(error);
				setState((previous) => previous.status === "ready" ? previous : {
					status: "error",
					message
				});
				setMessage(message);
			}, [t]);
			useVisiblePolling(api, accept, reject);
			const snapshot = state.status === "ready" ? state.snapshot : void 0;
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const servers = (0, react.useMemo)(() => snapshot?.servers.filter((server) => {
				if (normalizedQuery.length === 0) return true;
				return [
					server.id,
					server.label,
					server.command,
					server.url
				].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)) || snapshot.tools.some((tool) => tool.serverId === server.id && tool.name.toLocaleLowerCase().includes(normalizedQuery));
			}) ?? [], [normalizedQuery, snapshot]);
			const tools = (0, react.useMemo)(() => snapshot?.tools.filter((tool) => {
				if (normalizedQuery.length === 0) return true;
				return `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(normalizedQuery);
			}) ?? [], [normalizedQuery, snapshot]);
			const run = async (operation) => {
				setBusy(true);
				try {
					const next = await operation();
					accept(next);
					return next;
				} catch (error) {
					reject(error);
					return;
				} finally {
					setBusy(false);
				}
			};
			const save = async (event) => {
				event.preventDefault();
				if (snapshot === void 0 || draft === void 0) return;
				const patch = draftPatch(draft);
				if (await run(() => api.upsertServer({
					server: patch,
					expectedRevision: snapshot.revision
				})) !== void 0) setDraft(void 0);
			};
			const toggleServer = (server) => {
				if (snapshot === void 0) return;
				run(() => api.setServerEnabled({
					id: server.id,
					enabled: !server.enabled,
					expectedRevision: snapshot.revision
				}));
			};
			const remove = (server) => {
				if (snapshot === void 0 || !window.confirm(t("confirmRemove"))) return;
				run(() => api.removeServer({
					id: server.id,
					expectedRevision: snapshot.revision
				}));
			};
			const reload = (server) => {
				run(() => api.reloadServer({ id: server.id }));
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-mcp-manager": "panel",
				"aria-busy": busy,
				style: {
					maxWidth: 860,
					padding: 16
				},
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexWrap: "wrap"
						},
						children: [
							(0, react_jsx_runtime.jsx)("h2", {
								style: { marginInlineEnd: "auto" },
								children: t("title")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setDraft(draftFromServer()),
								disabled: busy || snapshot?.writable === false,
								children: t("add")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									if (snapshot !== void 0) run(() => api.snapshot({}));
								},
								disabled: busy,
								children: t("refresh")
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "block",
							marginBlock: "10px"
						},
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: {
								display: "block",
								fontSize: 12
							},
							children: t("search")
						}), (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: query,
							onChange: (event) => setQuery(event.currentTarget.value),
							placeholder: t("search")
						})]
					}),
					message !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: { color: "var(--dsh-color-danger, #b42318)" },
						children: message
					}) : null,
					state.status === "loading" ? (0, react_jsx_runtime.jsx)("p", { children: t("loading") }) : null,
					state.status === "error" ? (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: state.message
					}) : null,
					snapshot !== void 0 && servers.length === 0 ? (0, react_jsx_runtime.jsx)("p", { children: snapshot.servers.length === 0 ? t("noServers") : t("empty") }) : null,
					servers.map((server) => (0, react_jsx_runtime.jsx)(ServerCard, {
						server,
						tools: tools.filter((tool) => tool.serverId === server.id),
						t,
						busy,
						writable: snapshot?.writable ?? false,
						onEdit: () => setDraft(draftFromServer(server)),
						onToggle: () => {
							toggleServer(server);
						},
						onReload: () => {
							reload(server);
						},
						onRemove: () => {
							remove(server);
						},
						onToolToggle: (tool, enabled) => {
							if (snapshot === void 0) return;
							run(() => api.setToolEnabled({
								serverId: server.id,
								name: tool.name,
								enabled,
								expectedRevision: snapshot.revision
							}));
						}
					}, server.id)),
					draft !== void 0 ? (0, react_jsx_runtime.jsxs)("form", {
						onSubmit: (event) => {
							save(event);
						},
						style: {
							...cardStyle,
							background: "var(--dsh-color-surface-secondary, #fafafa)"
						},
						children: [
							(0, react_jsx_runtime.jsx)("h3", { children: draft.id.length > 0 && snapshot?.servers.some((server) => server.id === draft.id) ? t("edit") : t("add") }),
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("id"),
								children: (0, react_jsx_runtime.jsx)("input", {
									required: true,
									pattern: "[A-Za-z0-9_-]{1,32}",
									value: draft.id,
									disabled: snapshot?.servers.some((server) => server.id === draft.id),
									onChange: (event) => setDraft({
										...draft,
										id: event.currentTarget.value
									})
								})
							}),
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("label"),
								children: (0, react_jsx_runtime.jsx)("input", {
									value: draft.label,
									onChange: (event) => setDraft({
										...draft,
										label: event.currentTarget.value
									})
								})
							}),
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("transport"),
								children: (0, react_jsx_runtime.jsxs)("select", {
									value: draft.transport,
									onChange: (event) => setDraft({
										...draft,
										transport: event.currentTarget.value
									}),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "stdio",
										children: t("stdio")
									}), (0, react_jsx_runtime.jsx)("option", {
										value: "streamable-http",
										children: t("http")
									})]
								})
							}),
							draft.transport === "stdio" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsx)(Field, {
									label: t("command"),
									children: (0, react_jsx_runtime.jsx)("input", {
										required: true,
										value: draft.command,
										onChange: (event) => setDraft({
											...draft,
											command: event.currentTarget.value
										})
									})
								}),
								(0, react_jsx_runtime.jsx)(Field, {
									label: t("args"),
									children: (0, react_jsx_runtime.jsx)("textarea", {
										value: draft.args,
										onChange: (event) => setDraft({
											...draft,
											args: event.currentTarget.value
										})
									})
								}),
								(0, react_jsx_runtime.jsx)(Field, {
									label: t("cwd"),
									children: (0, react_jsx_runtime.jsx)("input", {
										value: draft.cwd,
										onChange: (event) => setDraft({
											...draft,
											cwd: event.currentTarget.value
										})
									})
								}),
								(0, react_jsx_runtime.jsx)(SecretFields, {
									label: t("environment"),
									entries: draft.env,
									t,
									onChange: (env) => setDraft({
										...draft,
										env
									})
								})
							] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Field, {
								label: t("url"),
								children: (0, react_jsx_runtime.jsx)("input", {
									required: true,
									type: "url",
									value: draft.url,
									onChange: (event) => setDraft({
										...draft,
										url: event.currentTarget.value
									})
								})
							}), (0, react_jsx_runtime.jsx)(SecretFields, {
								label: t("headers"),
								entries: draft.headers,
								t,
								onChange: (headers) => setDraft({
									...draft,
									headers
								})
							})] }),
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("timeout"),
								children: (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1,
									step: 1,
									value: draft.timeout,
									onChange: (event) => setDraft({
										...draft,
										timeout: event.currentTarget.value
									})
								})
							}),
							(0, react_jsx_runtime.jsxs)("fieldset", {
								style: {
									border: 0,
									padding: 0,
									marginBlock: 12
								},
								children: [
									(0, react_jsx_runtime.jsx)("legend", { children: t("reconnect") }),
									(0, react_jsx_runtime.jsxs)("label", {
										style: {
											display: "block",
											marginBlock: 8
										},
										children: [
											(0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: draft.reconnectEnabled,
												onChange: (event) => setDraft({
													...draft,
													reconnectEnabled: event.currentTarget.checked
												})
											}),
											" ",
											t("reconnectEnabled")
										]
									}),
									(0, react_jsx_runtime.jsx)(Field, {
										label: t("initialDelay"),
										children: (0, react_jsx_runtime.jsx)("input", {
											type: "number",
											min: 1,
											step: 1,
											value: draft.initialDelayMs,
											onChange: (event) => setDraft({
												...draft,
												initialDelayMs: event.currentTarget.value
											})
										})
									}),
									(0, react_jsx_runtime.jsx)(Field, {
										label: t("maxDelay"),
										children: (0, react_jsx_runtime.jsx)("input", {
											type: "number",
											min: 1,
											step: 1,
											value: draft.maxDelayMs,
											onChange: (event) => setDraft({
												...draft,
												maxDelayMs: event.currentTarget.value
											})
										})
									}),
									(0, react_jsx_runtime.jsx)(Field, {
										label: t("maxAttempts"),
										children: (0, react_jsx_runtime.jsx)("input", {
											type: "number",
											min: 1,
											step: 1,
											value: draft.maxAttempts,
											onChange: (event) => setDraft({
												...draft,
												maxAttempts: event.currentTarget.value
											})
										})
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 8
								},
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									disabled: busy || snapshot?.writable === false,
									children: t("save")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setDraft(void 0),
									disabled: busy,
									children: t("cancel")
								})]
							})
						]
					}) : null,
					snapshot !== void 0 && snapshot.readonlyEntries.length > 0 ? (0, react_jsx_runtime.jsxs)("details", {
						style: { marginBlock: 16 },
						children: [
							(0, react_jsx_runtime.jsx)("summary", { children: t("readonly") }),
							(0, react_jsx_runtime.jsx)("p", { children: t("readOnlyHint") }),
							(0, react_jsx_runtime.jsx)("ul", { children: snapshot.readonlyEntries.map((entry) => (0, react_jsx_runtime.jsxs)("li", { children: [
								(0, react_jsx_runtime.jsx)("code", { children: entry.entryId }),
								" — ",
								entry.moduleName,
								" — ",
								entry.source === "loader" ? t("sourceLoader") : `${t("sourcePreset")}: ${entry.sourceName ?? entry.sourceId ?? "—"}`,
								" — ",
								entry.enabled === "conditional" ? t("conditional") : entry.enabled ? t("enabled") : t("disabled"),
								" (",
								entry.fiberPhase ?? "—",
								")"
							] }, entry.entryId)) })
						]
					}) : null
				]
			});
		}
		function Field({ label, children }) {
			return (0, react_jsx_runtime.jsxs)("label", {
				style: {
					display: "block",
					marginBlock: 8
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: {
						display: "block",
						fontSize: 12
					},
					children: label
				}), children]
			});
		}
		function SecretFields({ label, entries, t, onChange }) {
			return (0, react_jsx_runtime.jsxs)("fieldset", {
				style: {
					border: 0,
					padding: 0,
					marginBlock: 12
				},
				children: [
					(0, react_jsx_runtime.jsx)("legend", { children: label }),
					entries.map((entry, index) => (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							alignItems: "end",
							flexWrap: "wrap",
							marginBlock: 6
						},
						children: [
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("secretKey"),
								children: (0, react_jsx_runtime.jsx)("input", {
									value: entry.key,
									onChange: (event) => {
										const next = [...entries];
										next[index] = {
											...entry,
											key: event.currentTarget.value
										};
										onChange(next);
									}
								})
							}),
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("secretValue"),
								children: (0, react_jsx_runtime.jsx)("input", {
									type: "password",
									value: entry.value,
									disabled: entry.clear,
									placeholder: entry.clear ? t("secretUnset") : void 0,
									onChange: (event) => {
										const next = [...entries];
										next[index] = {
											...entry,
											value: event.currentTarget.value
										};
										onChange(next);
									}
								})
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								style: { marginBlock: 8 },
								children: [
									(0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: entry.clear,
										onChange: (event) => {
											const next = [...entries];
											next[index] = {
												...entry,
												clear: event.currentTarget.checked
											};
											onChange(next);
										}
									}),
									" ",
									t("secretUnset")
								]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)),
								children: t("remove")
							})
						]
					}, `${entry.key}-${String(index)}`)),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => onChange([...entries, {
							key: "",
							value: "",
							clear: false
						}]),
						children: t("addEntry")
					})
				]
			});
		}
		function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onToolToggle }) {
			return (0, react_jsx_runtime.jsxs)("article", {
				"data-mcp-server": server.id,
				style: cardStyle,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexWrap: "wrap"
						},
						children: [
							(0, react_jsx_runtime.jsx)("strong", { children: server.label }),
							(0, react_jsx_runtime.jsx)("code", { children: server.id }),
							(0, react_jsx_runtime.jsx)("span", {
								"data-mcp-status": server.status,
								children: t(STATUS_KEYS[server.status])
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								style: { marginInlineStart: "auto" },
								children: [
									server.toolCount,
									" ",
									t("toolCount")
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("small", { children: server.transport === "stdio" ? server.command : server.url }),
					server.error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: { color: "var(--dsh-color-danger, #b42318)" },
						children: server.error
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8,
							marginBlock: 8,
							flexWrap: "wrap"
						},
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: onToggle,
								disabled: busy || !writable,
								children: server.enabled ? t("disabled") : t("enabled")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: onEdit,
								disabled: busy || !writable,
								children: t("edit")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: onReload,
								disabled: busy,
								children: t("reload")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: onRemove,
								disabled: busy || !writable,
								children: t("remove")
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("details", { children: [
						(0, react_jsx_runtime.jsxs)("summary", { children: [
							t("tools"),
							" (",
							tools.length,
							")"
						] }),
						tools.length === 0 ? (0, react_jsx_runtime.jsx)("p", { children: t("noTools") }) : (0, react_jsx_runtime.jsx)("ul", { children: tools.map((tool) => (0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsxs)("label", { children: [
							(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: tool.enabled,
								onChange: (event) => onToolToggle(tool, event.currentTarget.checked),
								disabled: busy || !writable
							}),
							" ",
							(0, react_jsx_runtime.jsx)("code", { children: tool.name }),
							" — ",
							tool.description
						] }), (0, react_jsx_runtime.jsx)("pre", {
							style: {
								overflow: "auto",
								fontSize: 12
							},
							children: JSON.stringify(tool.parameters, null, 2)
						})] }, tool.name)) }),
						Object.entries(server.env).map(([key, value]) => (0, react_jsx_runtime.jsx)("span", {
							"data-mcp-secret": key,
							hidden: true,
							children: value.set ? t("secretSet") : t("secretUnset")
						}, key))
					] })
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Browser entry for Settings → MCP. */
		const NS = "settings.mcpManager";
		const inject = [
			"connection",
			"slots",
			"locale"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "web-mcp-manager: dictionaries");
			const t = ctx.locale.bind(NS);
			const api = createManagerApi(ctx);
			const injected = () => ({ api });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mcp",
				order: 20,
				label: () => t("nav"),
				locale: NS,
				inject: injected
			}, McpSection));
		}
		//#endregion
		exports.McpSection = McpSection;
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map