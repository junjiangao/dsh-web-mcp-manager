window.__ModuleLoader__.load({
	id: "@junjiangao/dsh-web-mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/locales.js
		/** Bilingual copy owned by the MCP settings section. */
		const zh = {
			nav: "MCP",
			title: "MCP 服务",
			pluginId: "插件",
			add: "新增服务",
			edit: "编辑",
			save: "保存",
			cancel: "取消",
			remove: "删除",
			confirmRemove: "确定删除这个 MCP 服务吗？",
			reload: "重新加载",
			enabled: "已启用",
			disabled: "已停用",
			enable: "启用",
			disable: "停用",
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
			args: "启动参数",
			argument: "参数",
			argsHint: "逐项编辑，原样保存（不做去空格或过滤）。",
			cwd: "工作目录",
			url: "URL",
			timeout: "调用超时（毫秒）",
			environment: "环境变量",
			headers: "请求头",
			secretKey: "键",
			secretValue: "值（留空表示保留原值）",
			sensitive: "敏感值",
			secretHint: "普通值（如数字、路径）直接可见；敏感值（如 API Key）勾选“敏感值”后以密码框输入，已保存的值不会回显。",
			secretTemplate: "来自环境变量模板（${…}），在此只读；由 dsh 在挂载时解析。",
			scope: "所属层级",
			scopeProject: "项目级",
			scopeProfile: "配置级",
			scopeUser: "用户级",
			scopeEntry: "配置条目（旧版）",
			shadowed: "被上层覆盖",
			migrate: "迁移到 mcp.json",
			project: "项目",
			projectNone: "不使用项目级配置",
			projectHint: "项目级写入 <项目>/.dsh/mcp.json；同名的 <项目>/.mcp.json 只读并排在项目级之下。",
			sources: "配置来源",
			sourceCompat: "兼容只读",
			sourceWritable: "可写",
			sourceReadonly: "只读",
			sourceMissing: "文件不存在",
			serverCount: "个服务",
			addEntry: "添加一项",
			reconnect: "重连策略",
			reconnectEnabled: "启用自动重连",
			initialDelay: "首次重试延迟（毫秒）",
			maxDelay: "最大重试延迟（毫秒）",
			maxAttempts: "最大重试次数",
			search: "搜索服务或工具",
			searchHint: "按名称、命令或工具名筛选",
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
			rebase: "重新加载最新配置（将丢弃草稿修改）",
			pollFailed: "状态刷新失败，正在自动重试。",
			duplicateKey: "存在重复的键名",
			dismiss: "关闭",
			empty: "暂无匹配项",
			sourceLoader: "Loader",
			sourcePreset: "预设",
			conditional: "条件启用",
			basic: "基本配置",
			advanced: "高级选项",
			status: "状态",
			params: "参数"
		};
		const en = {
			nav: "MCP",
			title: "MCP services",
			pluginId: "Plugin",
			add: "Add service",
			edit: "Edit",
			save: "Save",
			cancel: "Cancel",
			remove: "Delete",
			confirmRemove: "Delete this MCP service?",
			reload: "Reload",
			enabled: "Enabled",
			disabled: "Disabled",
			enable: "Enable",
			disable: "Disable",
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
			args: "Arguments",
			argument: "Argument",
			argsHint: "Edit one argument per row; values are saved verbatim (no trimming or filtering).",
			cwd: "Working directory",
			url: "URL",
			timeout: "Call timeout (ms)",
			environment: "Environment variables",
			headers: "Request headers",
			secretKey: "Key",
			secretValue: "Value (blank keeps the current value)",
			sensitive: "Sensitive",
			secretHint: "Plain values (numbers, paths) are shown as-is; mark sensitive values (e.g. API keys) to mask them. Stored values are never echoed back.",
			secretTemplate: "Comes from an environment template (${…}); read-only here, resolved by dsh at mount time.",
			scope: "Scope",
			scopeProject: "Project",
			scopeProfile: "Profile",
			scopeUser: "User",
			scopeEntry: "Loader entry (legacy)",
			shadowed: "Shadowed",
			migrate: "Migrate to mcp.json",
			project: "Project",
			projectNone: "No project scope",
			projectHint: "The project scope writes <project>/.dsh/mcp.json; a same-named <project>/.mcp.json is read-only and ranks below it.",
			sources: "Sources",
			sourceCompat: "compat, read-only",
			sourceWritable: "writable",
			sourceReadonly: "read-only",
			sourceMissing: "file missing",
			serverCount: "servers",
			addEntry: "Add entry",
			reconnect: "Reconnect policy",
			reconnectEnabled: "Enable automatic reconnect",
			initialDelay: "Initial retry delay (ms)",
			maxDelay: "Maximum retry delay (ms)",
			maxAttempts: "Maximum retry attempts",
			search: "Search services or tools",
			searchHint: "Filter by name, command, or tool",
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
			rebase: "Reload latest configuration (drops draft edits)",
			pollFailed: "Failed to refresh status; retrying automatically.",
			duplicateKey: "Duplicate key",
			dismiss: "Dismiss",
			empty: "No matches",
			sourceLoader: "Loader",
			sourcePreset: "Preset",
			conditional: "Conditional",
			basic: "Basic",
			advanced: "Advanced",
			status: "Status",
			params: "Parameters"
		};
		//#endregion
		//#region lib/types/types.js
		/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
		/**
		* Shared channel carrying the manager's authenticated RPC.
		*
		* The manager rides the Connection service's own `/api` channel instead of
		* claiming a private prefix route:
		*
		* - The physical `/api` route is mounted by `@deepseek-ai/dsh-client-connection`
		*   itself and applies the Host/Origin fence plus browser authentication before
		*   anything reaches a handler, so this plugin never repeats that logic.
		* - `connection.rpc.handle(channel, …)` cannot be used: its `register()` mounts
		*   the physical route through `owner.webServer` where `owner` is the Connection
		*   service's own Context, which fails with `cannot get property "webServer"
		*   without inject`.
		* - `connection.rpc.intercept('/api', …)` cannot be used either: the shared
		*   channel accepts exactly one interceptor and `@deepseek-ai/dsh-api-gateway`
		*   already owns it.
		* - `connection.fetch.register()` is therefore the supported path: one exact
		*   Fetch route per endpoint, taking precedence over the interceptor.
		*/
		const MCP_MANAGER_API_CHANNEL = "/api";
		/** Endpoint prefix this plugin owns inside the shared channel. */
		const MCP_MANAGER_ENDPOINT_PREFIX = "mcp-manager";
		/**
		* The Loader entry id this plugin's Host half is mounted under, which is also
		* its settings namespace. It is the key `ctx.configForms.get()` takes.
		*/
		const MCP_MANAGER_NAMESPACE = "web-mcp-manager";
		function isRpcResult(value) {
			if (typeof value !== "object" || value === null) return false;
			const record = value;
			if (record.ok === true) return "value" in record;
			if (record.ok !== false || typeof record.error !== "object" || record.error === null) return false;
			const error = record.error;
			return typeof error.code === "string" && typeof error.message === "string";
		}
		/** 插件的社区注册身份(GitHub owner/repo)。 */
		const PLUGIN_IDENTITY = "junjiangao/dsh-web-mcp-manager";
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
				const result = await rpc.call(MCP_MANAGER_API_CHANNEL, `${MCP_MANAGER_ENDPOINT_PREFIX}/${endpoint}`, payload, signal);
				if (!isRpcResult(result)) throw new Error("MCP manager returned an invalid RPC response");
				if (!result.ok) throw new McpManagerRpcError(result.error);
				return result.value;
			};
			return {
				snapshot: (request = {}, signal) => call("snapshot", request, signal),
				upsertServer: (request, signal) => call("upsertServer", request, signal),
				removeServer: (request, signal) => call("removeServer", request, signal),
				setServerEnabled: (request, signal) => call("setServerEnabled", request, signal),
				reloadServer: (request, signal) => call("reloadServer", request, signal)
			};
		}
		//#endregion
		//#region lib/types/client/entry-form.js
		/**
		* The legacy Loader-entry layer, edited through the official shared settings form.
		*
		* `mcp.json` scope files have no configuration surface in dsh, so they stay on
		* this plugin's own RPC. A plugin's Loader-entry configuration does have one:
		* the same `ctx.configForms` form every official settings page writes through.
		* The panel therefore sends every entry-scope edit — a server definition, its
		* `enabled` flag, and the per-tool policy — as path operations on that form
		* instead of as a private whole-document protocol.
		*
		* That is not just a transport change. The form carries only the REDACTED
		* section: `env` and `headers` are declared `role('secret')`, so their values
		* are removed before the section crosses the wire and a write that restated a
		* server would silently drop every credential it never received. The official
		* `mutate` exists for exactly this case — a caller holding an incomplete view
		* names only the fields it means — so {@link entryServerOps} emits one path
		* operation per field and touches a secret only where the user typed a new
		* value or asked for the old one to be removed.
		*
		* Revision fencing, write ordering, refusal recovery, and read-only detection
		* all come from the official form, which is why this plugin no longer owns a
		* revision check, a conflict classifier, or a mutation queue on the Host.
		*/
		/**
		* Project one server patch into entry-scope path operations.
		*
		* Every non-secret field is restated, because the form's decoded value is the
		* only source the panel has for them. Secrets are the exception: `env` and
		* `headers` entries appear only where the patch names a value to write or a
		* key to remove, so a credential the browser never received is left untouched.
		* @param patch - the draft's patch, as `draftPatch` produces it.
		* @returns the ordered operations for one `mutate` call.
		*/
		function entryServerOps(patch) {
			const id = patch.id;
			const at = (...rest) => [
				"servers",
				id,
				...rest
			];
			const ops = [
				{
					op: "set",
					path: at("id"),
					value: id
				},
				{
					op: "set",
					path: at("label"),
					value: patch.label ?? ""
				},
				{
					op: "set",
					path: at("transport"),
					value: patch.transport ?? "stdio"
				},
				{
					op: "set",
					path: at("command"),
					value: patch.command ?? ""
				},
				{
					op: "set",
					path: at("args"),
					value: [...patch.args ?? []]
				},
				{
					op: "set",
					path: at("cwd"),
					value: patch.cwd ?? ""
				},
				{
					op: "set",
					path: at("url"),
					value: patch.url ?? ""
				},
				{
					op: "set",
					path: at("envSensitive"),
					value: [...patch.envSensitive ?? []]
				},
				{
					op: "set",
					path: at("headerSensitive"),
					value: [...patch.headerSensitive ?? []]
				}
			];
			if (patch.enabled !== void 0) ops.push({
				op: "set",
				path: at("enabled"),
				value: patch.enabled
			});
			if (patch.toolCallTimeoutMs !== void 0) ops.push({
				op: "set",
				path: at("toolCallTimeoutMs"),
				value: patch.toolCallTimeoutMs
			});
			if (patch.reconnect !== void 0) ops.push({
				op: "set",
				path: at("reconnect"),
				value: { ...patch.reconnect }
			});
			pushSecretOps(ops, at, "env", patch.env);
			pushSecretOps(ops, at, "headers", patch.headers);
			return ops;
		}
		function pushSecretOps(ops, at, field, values) {
			for (const [key, input] of Object.entries(values ?? {})) {
				if (typeof input === "string") {
					ops.push({
						op: "set",
						path: at(field, key),
						value: input
					});
					continue;
				}
				if (input.clear === true) {
					ops.push({
						op: "unset",
						path: at(field, key)
					});
					continue;
				}
				if (input.value !== void 0) ops.push({
					op: "set",
					path: at(field, key),
					value: input.value
				});
			}
		}
		function createEntryForm(ctx) {
			const form = ctx.configForms.get(MCP_MANAGER_NAMESPACE);
			let lastSnapshot;
			let lastView = {
				available: false,
				writable: false
			};
			return {
				snapshot: () => {
					const current = form.getSnapshot();
					if (current !== lastSnapshot) {
						lastSnapshot = current;
						lastView = {
							available: current.status === "ready",
							writable: current.status === "ready" && current.writable
						};
					}
					return lastView;
				},
				subscribe: (listener) => form.subscribe(listener),
				upsert: (patch) => form.mutate(entryServerOps(patch)),
				remove: (id) => form.mutate([{
					op: "unset",
					path: ["servers", id]
				}, {
					op: "unset",
					path: ["disabledTools", id]
				}]),
				setEnabled: (id, enabled) => form.mutate([{
					op: "set",
					path: [
						"servers",
						id,
						"enabled"
					],
					value: enabled
				}]),
				setDisabledTools: (id, names) => form.mutate([names === void 0 || names.length === 0 ? {
					op: "unset",
					path: ["disabledTools", id]
				} : {
					op: "set",
					path: ["disabledTools", id],
					value: [...names]
				}])
			};
		}
		//#endregion
		//#region lib/types/client/draft.js
		/**
		* Pure draft/patch projection helpers for the MCP settings form.
		*
		* These functions own no component state and are exported so the form
		* behaviour (secret clear/rename, lossless args) can be tested without a
		* browser. They carry no revision: an entry-scope write is fenced by the
		* official shared settings form, and an `mcp.json` write is fenced by the
		* cross-process file lock `mutateScopeFile` takes around its read-modify-write.
		*/
		/**
		* HTML `pattern` for a server id. Browsers compile `pattern` attributes with
		* the UnicodeSets (`v`) flag, where a leading/literal `-` inside a character
		* class is a SyntaxError — the dash must be escaped. This string is verified
		* to compile under `new RegExp(pattern, 'v')` in tests and must stay in sync
		* with `validateServerId` in `src/settings.ts`.
		*/
		const SERVER_ID_PATTERN = "[\\-A-Za-z0-9_]{1,32}";
		let nextUid = 1;
		function allocateUid() {
			const uid = nextUid;
			nextUid += 1;
			return uid;
		}
		function draftFromServer(server, defaultScope = "profile") {
			const env = secretDrafts(server?.env, server?.templates.env);
			const headers = secretDrafts(server?.headers, server?.templates.headers);
			return {
				id: server?.id ?? "",
				scope: server?.scope ?? defaultScope,
				label: server?.label ?? "",
				transport: server?.transport ?? "stdio",
				command: server?.command ?? "",
				args: server === void 0 ? [] : [...server.args],
				cwd: server?.cwd ?? "",
				url: server?.url ?? "",
				timeout: String(server?.toolCallTimeoutMs ?? 6e4),
				env,
				headers,
				envOriginalKeys: env.map((entry) => entry.key),
				headersOriginalKeys: headers.map((entry) => entry.key),
				envProtectedKeys: env.filter((entry) => entry.templated).map((entry) => entry.key),
				headersProtectedKeys: headers.filter((entry) => entry.templated).map((entry) => entry.key),
				reconnectEnabled: server?.reconnect.enabled ?? true,
				initialDelayMs: String(server?.reconnect.initialDelayMs ?? 500),
				maxDelayMs: String(server?.reconnect.maxDelayMs ?? 3e4),
				maxAttempts: String(server?.reconnect.maxAttempts ?? 10)
			};
		}
		function newSecretDraft() {
			return {
				uid: allocateUid(),
				key: "",
				value: "",
				clear: false,
				sensitive: false,
				templated: false
			};
		}
		function secretDrafts(value, templated = []) {
			const templates = new Set(templated);
			return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b)).map((key) => ({
				uid: allocateUid(),
				key,
				originalKey: key,
				value: "",
				clear: false,
				sensitive: value?.[key]?.sensitive ?? false,
				templated: templates.has(key)
			}));
		}
		function draftPatch(draft) {
			const timeout = Number(draft.timeout);
			const initialDelayMs = positiveIntegerOr(draft.initialDelayMs, 500);
			const maxDelayMs = Math.max(initialDelayMs, positiveIntegerOr(draft.maxDelayMs, 3e4));
			const maxAttempts = positiveIntegerOr(draft.maxAttempts, 10);
			return {
				id: draft.id.trim(),
				scope: draft.scope,
				label: draft.label,
				transport: draft.transport,
				command: draft.command,
				args: [...draft.args],
				cwd: draft.cwd,
				url: draft.url,
				env: secretPatch(draft.env, draft.envOriginalKeys, draft.envProtectedKeys),
				headers: secretPatch(draft.headers, draft.headersOriginalKeys, draft.headersProtectedKeys),
				envSensitive: sensitiveKeys(draft.env),
				headerSensitive: sensitiveKeys(draft.headers),
				toolCallTimeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 6e4,
				reconnect: {
					enabled: draft.reconnectEnabled,
					initialDelayMs,
					maxDelayMs,
					maxAttempts
				}
			};
		}
		/**
		* Project draft rows into a secret patch.
		*
		* Keys that existed when the draft was opened (`originalKeys`) but are no
		* longer present — removed rows — are emitted as `{ clear: true }` so the
		* Host merge actually deletes them. Renamed rows clear the original key and
		* set the new one.
		*/
		function secretPatch(entries, originalKeys, protectedKeys = []) {
			const result = {};
			const protectedSet = new Set(protectedKeys);
			const removed = new Set(originalKeys);
			for (const entry of entries) {
				const key = entry.key.trim();
				if (key.length === 0) continue;
				removed.delete(key);
				if (entry.templated) continue;
				if (entry.originalKey !== void 0 && entry.originalKey !== key) setOwn(result, entry.originalKey, { clear: true });
				if (entry.clear) setOwn(result, key, { clear: true });
				else if (entry.value.length > 0) setOwn(result, key, entry.value);
			}
			for (const key of removed) if (!protectedSet.has(key)) setOwn(result, key, { clear: true });
			return result;
		}
		function sensitiveKeys(entries) {
			const keys = entries.filter((entry) => entry.sensitive && !entry.templated).map((entry) => entry.key.trim()).filter(Boolean);
			return [...new Set(keys)];
		}
		/** Trimmed keys that appear more than once; the caller decides how to surface them. */
		function duplicateDraftKeys(entries) {
			const seen = /* @__PURE__ */ new Set();
			const duplicates = /* @__PURE__ */ new Set();
			for (const entry of entries) {
				const key = entry.key.trim();
				if (key.length === 0) continue;
				if (seen.has(key)) duplicates.add(key);
				seen.add(key);
			}
			return [...duplicates];
		}
		function positiveIntegerOr(value, fallback) {
			const parsed = Number(value);
			return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
		}
		function setOwn(record, key, value) {
			Object.defineProperty(record, key, {
				configurable: true,
				enumerable: true,
				value,
				writable: true
			});
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
		/**
		* Corner radii are plain lengths on purpose.
		*
		* `--dsw-corner-shape` is NOT a radius: the host defines it as a
		* `corner-shape` function (`superellipse(1.5)`) and applies it to every
		* element from its own `@supports` block. Feeding it to `border-radius`
		* makes the declaration invalid, so on any browser that supports
		* `corner-shape` the whole panel would silently fall back to square corners.
		*/
		const RADIUS_CARD = "8px";
		const RADIUS_CTRL = "6px";
		const MONO_FONT = "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
		/**
		* Makes an official `Input` fill its grid cell.
		*
		* `Input` puts `className` on its own inline-flex wrapper and renders the
		* native input inside it, so a width on the input alone would not stretch the
		* control.
		*/
		const FILL = "mcp-fill";
		/**
		* Every token below is verified to exist in `@deepseek-ai/dsh-client-ui-theme`
		* (light under `body`, dark under `body[data-ds-dark-theme]`). Tokens that do
		* not exist keep the hardcoded fallback in both themes, so only well-known
		* names are used here.
		*/
		const COLORS = {
			text: "var(--dsw-alias-label-primary, #0f1115)",
			textSecondary: "var(--dsw-alias-label-secondary, #61666b)",
			textTertiary: "var(--dsw-alias-label-tertiary, #81858c)",
			border: "var(--dsw-alias-border-l2, #e1e5ee)",
			borderSubtle: "var(--dsw-alias-border-l1, #ebeef2)",
			borderStrong: "var(--dsw-alias-border-l3, #dcdcdc)",
			surface: "var(--dsw-alias-bg-layer-2, #ffffff)",
			surfaceSubtle: "var(--dsw-alias-bg-layer-1, #fafafa)",
			surfaceRaised: "var(--dsw-alias-bg-layer-3, #f5f5f5)",
			business: "var(--dsw-alias-state-business-primary, #2f6fed)",
			warn: "var(--dsw-alias-state-warn-primary, #f59e0b)",
			danger: "var(--dsw-alias-state-error-primary, #ec1313)"
		};
		const ELEVATION_SOFT = "var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))";
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
			"[data-mcp-manager=\"panel\"] :focus-visible { outline: 2px solid " + COLORS.business + "; outline-offset: 1px; }",
			"[data-mcp-manager=\"panel\"] button:disabled { opacity: .45; cursor: not-allowed !important; }",
			"[data-mcp-manager=\"panel\"] button[data-mcp-danger]:not(:disabled) { color: " + COLORS.danger + " !important; border-color: " + COLORS.danger + " !important; }",
			"[data-mcp-manager=\"panel\"] button[data-mcp-danger]:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06)) !important; }",
			"[data-mcp-manager=\"panel\"] .mcp-fill { display: flex; width: 100%; max-width: 100%; }",
			"[data-mcp-manager=\"panel\"] [data-mcp-server] { transition: border-color .15s ease, box-shadow .15s ease; }",
			"[data-mcp-manager=\"panel\"] [data-mcp-server]:hover { border-color: " + COLORS.borderStrong + " !important; box-shadow: var(--dsw-elevation-panel, var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))) !important; }",
			"[data-mcp-manager=\"panel\"] input, [data-mcp-manager=\"panel\"] select, [data-mcp-manager=\"panel\"] textarea { transition: border-color .15s ease, background-color .15s ease; }",
			"[data-mcp-manager=\"panel\"] select:not(:disabled):hover, [data-mcp-manager=\"panel\"] textarea:not(:disabled):hover { border-color: " + COLORS.borderStrong + " !important; }",
			"[data-mcp-manager=\"panel\"] select:focus-visible, [data-mcp-manager=\"panel\"] textarea:focus-visible { border-color: " + COLORS.business + " !important; }",
			"[data-mcp-manager=\"panel\"] summary { display: flex; align-items: center; gap: 6px; list-style: none; cursor: pointer; }",
			"[data-mcp-manager=\"panel\"] summary::-webkit-details-marker { display: none; }",
			"[data-mcp-manager=\"panel\"] summary::before { content: \"\"; flex: 0 0 auto; width: 0; height: 0; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; opacity: .55; transition: transform .15s ease; }",
			"[data-mcp-manager=\"panel\"] details[open] > summary::before { transform: rotate(90deg); }",
			"[data-mcp-manager=\"panel\"] summary:hover { color: " + COLORS.text + " !important; }"
		].join("\n");
		const PANEL_STYLE_ID = "mcp-manager-panel-style";
		/**
		* Status → official `Tag` tone and `StateDot` state.
		*
		* The panel no longer owns a status palette: `Tag` supplies the surface and
		* `StateDot` the glyph, both from the theme tokens the rest of the product
		* uses, so a status reads the same here as anywhere else.
		*/
		const TAG_TONES = {
			loaded: "success",
			waiting: "warning",
			loading: "info",
			failed: "danger",
			disabled: "neutral"
		};
		const DOT_STATES = {
			loaded: "done",
			waiting: "warning",
			loading: "ongoing",
			failed: "error",
			disabled: "idle"
		};
		/** Localized label per source scope. */
		const SCOPE_KEYS = {
			project: "scopeProject",
			profile: "scopeProfile",
			user: "scopeUser",
			entry: "scopeEntry"
		};
		/** Every scope, in the order the editor's segmented control shows them. */
		const SCOPE_OPTIONS = [
			"project",
			"profile",
			"user",
			"entry"
		];
		const TRANSPORT_OPTIONS = [{
			value: "stdio",
			label: "stdio"
		}, {
			value: "streamable-http",
			label: "http"
		}];
		const panelStyle = {
			maxWidth: 860,
			padding: 16,
			color: COLORS.text,
			fontFamily: "var(--dsw-font-family, system-ui, -apple-system, \"Segoe UI\", sans-serif)"
		};
		const headerStyle = { marginBlock: "4px 0" };
		const headerRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const titleStyle = {
			margin: 0,
			marginInlineEnd: "auto",
			fontSize: "var(--dsw-font-base-16-font-size, 16px)",
			lineHeight: "var(--dsw-font-base-16-line-height, 24px)",
			fontWeight: 600,
			color: COLORS.text
		};
		const subtitleRowStyle = {
			marginTop: 6,
			display: "flex",
			alignItems: "center",
			gap: 6
		};
		const metaLabelStyle = {
			fontSize: 12,
			lineHeight: "18px",
			color: COLORS.textTertiary
		};
		const identityChipStyle = {
			fontFamily: MONO_FONT,
			fontSize: 12,
			lineHeight: "18px",
			color: COLORS.textTertiary,
			background: "transparent",
			border: "1px solid " + COLORS.borderSubtle,
			borderRadius: RADIUS_CTRL,
			padding: "1px 6px",
			whiteSpace: "nowrap"
		};
		const fieldLabelStyle = {
			display: "block",
			fontSize: 12,
			lineHeight: "18px",
			color: COLORS.textTertiary,
			marginBottom: 4
		};
		/**
		* The one native control the primitives do not cover: a multi-line command.
		* It keeps the panel's field metrics so it sits level with the official
		* `Input` beside it.
		*/
		const textareaStyle = {
			width: "100%",
			boxSizing: "border-box",
			padding: "6px 10px",
			fontSize: 13,
			lineHeight: "18px",
			color: COLORS.text,
			background: "var(--dsw-alias-bg-layer-1, #ffffff)",
			border: "1px solid " + COLORS.border,
			borderRadius: RADIUS_CTRL,
			resize: "vertical"
		};
		const searchLabelStyle = {
			display: "block",
			width: "100%",
			marginBlock: "14px 16px"
		};
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
			width: "100%",
			boxSizing: "border-box",
			height: 32,
			padding: "0 8px",
			fontSize: 14,
			lineHeight: "22px",
			color: COLORS.text,
			background: "var(--dsw-alias-bg-layer-1, #ffffff)",
			border: "0.5px solid var(--dsw-alias-border-l4, " + COLORS.border + ")",
			borderRadius: "var(--dsw-radius-md, 6px)"
		};
		const cardStyle = {
			background: COLORS.surface,
			border: "1px solid " + COLORS.border,
			borderRadius: RADIUS_CARD,
			padding: 16,
			marginBlock: 10,
			boxShadow: ELEVATION_SOFT
		};
		const cardHeaderRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const cardTitleStyle = {
			fontWeight: 600,
			fontSize: 15,
			lineHeight: "22px",
			color: COLORS.text
		};
		const codeStyle = {
			fontFamily: MONO_FONT,
			fontSize: 12,
			color: COLORS.textSecondary
		};
		const codeCaptionStyle = {
			fontFamily: MONO_FONT,
			fontSize: 12,
			color: COLORS.textTertiary
		};
		/** Let an inline `Tag` sit at the end of a flex row without stretching. */
		const tagRailStyle = { marginInlineStart: "auto" };
		const metaLineStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			minWidth: 0,
			color: COLORS.textTertiary,
			fontSize: 12,
			lineHeight: "18px",
			marginBlock: "8px 0"
		};
		/** Positioning only: `Tag` owns the palette, so a render site may space it. */
		const metaTagStyle = { flex: "0 0 auto" };
		/** Keeps the status dot and its label on one optical line inside a `Tag`. */
		const statusBadgeStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6
		};
		const metaCodeStyle = {
			...codeCaptionStyle,
			minWidth: 0,
			overflow: "hidden",
			whiteSpace: "nowrap",
			textOverflow: "ellipsis"
		};
		const errorBoxStyle = {
			background: "var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.06))",
			borderInlineStart: "3px solid " + COLORS.danger,
			color: COLORS.text,
			padding: "8px 12px",
			borderRadius: RADIUS_CTRL,
			marginBlock: 8,
			fontSize: 13,
			lineHeight: "20px"
		};
		const noticeBoxStyle = {
			background: "var(--dsw-alias-state-warn-tertiary, #fef5e7)",
			borderInlineStart: "3px solid " + COLORS.warn,
			color: COLORS.text,
			padding: "8px 12px",
			borderRadius: RADIUS_CTRL,
			marginBlock: 8,
			fontSize: 13,
			lineHeight: "20px"
		};
		const statusTextStyle = {
			color: COLORS.textSecondary,
			marginBlock: 8,
			fontSize: 13
		};
		const emptyStateStyle = {
			color: COLORS.textTertiary,
			border: "1px dashed " + COLORS.border,
			borderRadius: RADIUS_CARD,
			padding: "20px 16px",
			marginBlock: 10,
			fontSize: 13,
			textAlign: "center"
		};
		const hintStyle = {
			color: COLORS.textTertiary,
			fontSize: 12,
			lineHeight: "18px",
			marginBlock: 4
		};
		const actionsRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			marginBlock: "12px 0",
			paddingBlockStart: 12,
			borderTop: "1px solid " + COLORS.borderSubtle,
			flexWrap: "wrap"
		};
		const collapseStyle = { marginBlock: 12 };
		const summaryStyle = {
			cursor: "pointer",
			color: COLORS.textSecondary,
			fontWeight: 500,
			fontSize: 13,
			lineHeight: "20px",
			paddingBlock: 2
		};
		const listStyle = {
			listStyle: "none",
			margin: 0,
			padding: 0
		};
		const toolItemStyle = {
			paddingBlock: 10,
			borderBottom: "1px solid " + COLORS.borderSubtle
		};
		const toolRowStyle = {
			display: "flex",
			alignItems: "flex-start",
			gap: 8,
			flexWrap: "wrap",
			fontSize: 13,
			lineHeight: "18px"
		};
		const toolDescriptionStyle = {
			color: COLORS.textTertiary,
			fontSize: 12,
			lineHeight: "18px"
		};
		const paramDetailsStyle = { marginBlock: "8px 0" };
		const preStyle = {
			overflow: "auto",
			fontSize: 12,
			lineHeight: "18px",
			padding: 8,
			margin: 0,
			background: "var(--dsw-alias-markdown-code-block, #f9fafb)",
			border: "1px solid " + COLORS.borderSubtle,
			borderRadius: RADIUS_CTRL
		};
		const formTitleStyle = {
			margin: "0 0 12px",
			fontSize: 15,
			lineHeight: "22px",
			fontWeight: 600,
			color: COLORS.text
		};
		const fieldsetStyle = {
			border: "1px solid " + COLORS.borderSubtle,
			borderRadius: RADIUS_CTRL,
			padding: "12px 12px 4px",
			margin: "0 0 12px"
		};
		const legendStyle = {
			padding: "0 6px",
			fontSize: 13,
			fontWeight: 600,
			color: COLORS.textSecondary
		};
		const groupFieldsetStyle = {
			border: 0,
			padding: 0,
			margin: "0 0 12px"
		};
		const formGridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
			gap: "8px 16px",
			marginBlock: 8
		};
		const gridFieldStyle = { marginBlock: 0 };
		const checkRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			marginBlock: 8,
			fontSize: 13,
			color: COLORS.text,
			cursor: "pointer"
		};
		const formActionsStyle = {
			display: "flex",
			gap: 8,
			marginBlock: "12px 4px",
			flexWrap: "wrap"
		};
		const secretRowStyle = {
			display: "flex",
			alignItems: "flex-end",
			flexWrap: "wrap",
			gap: "8px 12px",
			marginBlock: 6
		};
		const secretFieldStyle = {
			flex: "1 1 200px",
			marginBlock: 0
		};
		const secretActionsStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flex: "0 0 auto",
			paddingBlock: 2
		};
		COLORS.text;
		const readonlyDetailsStyle = {
			...collapseStyle,
			marginBlock: 20
		};
		const readonlyItemStyle = {
			paddingBlock: 10,
			borderBottom: "1px solid " + COLORS.borderSubtle
		};
		const readonlyHeaderRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const readonlyStatusStyle = {
			color: COLORS.textTertiary,
			fontSize: 12,
			lineHeight: "18px",
			marginBlock: "6px 0"
		};
		/**
		* Poll the snapshot while the page is visible.
		*
		* Guarantees: at most one request in flight per tick (slow responses are not
		* overlapped), and every response is tagged with the caller's monotonic `seq`
		* so a late poll response can never overwrite a newer snapshot produced by a
		* user operation or a newer poll.
		*/
		function useVisiblePolling(api, projectPath, onSnapshot, onError, nextSeq) {
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let timer;
				let inFlight = false;
				const load = () => {
					if (document.visibilityState !== "visible" || inFlight) return;
					inFlight = true;
					const seq = nextSeq();
					api.snapshot({ projectPath }, controller.signal).then((snapshot) => onSnapshot(snapshot, seq), (error) => onError(error, seq)).finally(() => {
						inFlight = false;
					});
				};
				const start = () => {
					if (document.visibilityState !== "visible" || timer !== void 0) return;
					timer = setInterval(() => {
						load();
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
						load();
						start();
					}
				};
				load();
				start();
				document.addEventListener("visibilitychange", visibility);
				return () => {
					controller.abort();
					stop();
					document.removeEventListener("visibilitychange", visibility);
				};
			}, [
				api,
				onError,
				onSnapshot,
				nextSeq,
				projectPath
			]);
		}
		function McpSection({ api, entry, t }) {
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [query, setQuery] = (0, react.useState)("");
			const [draft, setDraft] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)();
			const [pollFailed, setPollFailed] = (0, react.useState)(false);
			/** Registered workspace the project scope is rooted at; `undefined` = none. */
			const [projectPath, setProjectPath] = (0, react.useState)();
			/** Availability and writability of the official form that owns the entry scope. */
			const entryView = (0, react.useSyncExternalStore)(entry.subscribe, entry.snapshot);
			(0, react.useEffect)(() => {
				if (document.getElementById(PANEL_STYLE_ID) !== null) return;
				const style = document.createElement("style");
				style.id = PANEL_STYLE_ID;
				style.textContent = PANEL_CSS;
				document.head.append(style);
			}, []);
			const seqRef = (0, react.useRef)(0);
			const nextSeq = (0, react.useCallback)(() => {
				seqRef.current += 1;
				return seqRef.current;
			}, []);
			const accept = (0, react.useCallback)((snapshot, seq) => {
				if (seq !== seqRef.current) return;
				setState({
					status: "ready",
					snapshot
				});
				setPollFailed(false);
			}, []);
			/** Polling failures never touch the user-operation message. */
			const rejectPoll = (0, react.useCallback)((error, seq) => {
				if (seq !== seqRef.current) return;
				setPollFailed(true);
				setState((previous) => previous.status === "ready" ? previous : {
					status: "error",
					message: error instanceof Error ? error.message : String(error)
				});
			}, []);
			/** User-operation failures set the action message; kept until the next operation. */
			const rejectAction = (0, react.useCallback)((error) => {
				setMessage(error instanceof Error ? error.message : String(error));
			}, []);
			useVisiblePolling(api, projectPath, accept, rejectPoll, nextSeq);
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
			/**
			* Scope a new server is written to: the project scope once the user selected
			* a workspace, otherwise the profile's own file.
			*/
			const defaultScope = projectPath === void 0 ? "profile" : "project";
			/**
			* Whether a write to one scope would be accepted right now.
			*
			* The two layers have different writers, so they have different gates: the
			* entry scope follows the official form's own availability and writability,
			* and an `mcp.json` scope follows the Host document's.
			*/
			const canWrite = (scope) => {
				if (snapshot?.writable === false) return false;
				return scope === "entry" ? entryView.writable : true;
			};
			/** Copy a legacy entry-scope server into the writable scope for this session. */
			const migrate = (server) => {
				if (snapshot === void 0) return;
				run(() => api.upsertServer({
					scope: defaultScope,
					projectPath,
					server: {
						id: server.id,
						label: server.label,
						enabled: server.enabled,
						transport: server.transport,
						command: server.command,
						args: [...server.args],
						cwd: server.cwd,
						url: server.url,
						env: Object.fromEntries(Object.keys(server.env).map((key) => [key, { clear: true }])),
						headers: Object.fromEntries(Object.keys(server.headers).map((key) => [key, { clear: true }])),
						envSensitive: [],
						headerSensitive: [],
						toolCallTimeoutMs: server.toolCallTimeoutMs,
						reconnect: { ...server.reconnect }
					}
				}));
			};
			const run = async (operation) => {
				setBusy(true);
				setMessage(void 0);
				try {
					const seq = nextSeq();
					const next = await operation();
					accept(next, seq);
					return next;
				} catch (error) {
					rejectAction(error);
					return;
				} finally {
					setBusy(false);
				}
			};
			/**
			* Apply one official-form write, then re-read the resolved view.
			*
			* The form answers with acceptance rather than a snapshot: it owns revision
			* fencing and recovery, so a refusal already reloaded the Host state. The
			* panel therefore reports the refusal and re-reads through its own RPC, which
			* stays the single place the merged `project → profile → user → entry` view
			* is computed.
			*/
			const runEntry = async (operation) => {
				setBusy(true);
				setMessage(void 0);
				try {
					if (!await operation()) {
						setMessage(t("conflict"));
						return false;
					}
					const seq = nextSeq();
					accept(await api.snapshot({ projectPath }), seq);
					return true;
				} catch (error) {
					rejectAction(error);
					return false;
				} finally {
					setBusy(false);
				}
			};
			const save = async (event) => {
				event.preventDefault();
				if (snapshot === void 0 || draft === void 0) return;
				const duplicates = [...duplicateDraftKeys(draft.env), ...duplicateDraftKeys(draft.headers)];
				if (duplicates.length > 0) {
					setMessage(`${t("duplicateKey")}: ${[...new Set(duplicates)].join(", ")}`);
					return;
				}
				const patch = draftPatch(draft);
				if (draft.scope === "entry" ? await runEntry(() => entry.upsert(patch)) : await run(() => api.upsertServer({
					server: patch,
					projectPath
				})) !== void 0) setDraft(void 0);
			};
			/** Re-open the editor from the latest server view after a refusal (drops draft edits). */
			const rebase = () => {
				if (snapshot === void 0 || draft === void 0) return;
				const current = snapshot.servers.find((server) => server.id === draft.id);
				setDraft(current === void 0 ? void 0 : draftFromServer(current, defaultScope));
				setMessage(void 0);
			};
			const toggleServer = (server) => {
				if (snapshot === void 0) return;
				const enabled = !server.enabled;
				if (server.scope === "entry") {
					runEntry(() => entry.setEnabled(server.id, enabled));
					return;
				}
				run(() => api.setServerEnabled({
					id: server.id,
					enabled,
					projectPath
				}));
			};
			const remove = (server) => {
				if (snapshot === void 0 || !window.confirm(t("confirmRemove"))) return;
				if (server.scope === "entry") {
					runEntry(() => entry.remove(server.id));
					return;
				}
				run(async () => {
					const next = await api.removeServer({
						id: server.id,
						projectPath
					});
					await entry.setDisabledTools(server.id, void 0);
					return next;
				});
			};
			const reload = (server) => {
				run(() => api.reloadServer({ id: server.id }));
			};
			/** The policy row the official form should hold after one tool checkbox flips. */
			const toggleTool = (server, tool, enabled) => {
				const disabled = (snapshot?.tools ?? []).filter((candidate) => candidate.serverId === server.id).filter((candidate) => candidate.name === tool.name ? !enabled : !candidate.enabled).map((candidate) => candidate.name).sort();
				runEntry(() => entry.setDisabledTools(server.id, disabled));
			};
			const isConflictMessage = message === t("conflict");
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-mcp-manager": "panel",
				"aria-busy": busy,
				style: panelStyle,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						style: headerStyle,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							style: headerRowStyle,
							children: [
								(0, react_jsx_runtime.jsx)("h2", {
									style: titleStyle,
									children: t("title")
								}),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: () => setDraft(draftFromServer(void 0, defaultScope)),
									disabled: busy || !canWrite(defaultScope),
									children: t("add")
								}),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => {
										if (snapshot !== void 0) run(() => api.snapshot({ projectPath }));
									},
									disabled: busy,
									children: t("refresh")
								})
							]
						}), (0, react_jsx_runtime.jsxs)("div", {
							style: subtitleRowStyle,
							children: [(0, react_jsx_runtime.jsx)("span", {
								style: metaLabelStyle,
								children: t("pluginId")
							}), (0, react_jsx_runtime.jsx)("span", {
								style: identityChipStyle,
								children: PLUGIN_IDENTITY
							})]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						style: searchLabelStyle,
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: fieldLabelStyle,
							children: t("search")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							className: FILL,
							type: "search",
							value: query,
							onChange: (event) => setQuery(event.currentTarget.value),
							placeholder: t("searchHint")
						})]
					}),
					snapshot !== void 0 && (snapshot.workspaces ?? []).length > 0 ? (0, react_jsx_runtime.jsxs)("label", {
						style: searchLabelStyle,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								style: fieldLabelStyle,
								children: t("project")
							}),
							(0, react_jsx_runtime.jsxs)("select", {
								"data-mcp-project": "",
								style: selectStyle,
								value: projectPath ?? "",
								onChange: (event) => setProjectPath(event.currentTarget.value === "" ? void 0 : event.currentTarget.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("projectNone")
								}), (snapshot.workspaces ?? []).map((workspace) => (0, react_jsx_runtime.jsxs)("option", {
									value: workspace.path,
									children: [
										workspace.title,
										" — ",
										workspace.path
									]
								}, workspace.id))]
							}),
							projectPath !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
								style: hintStyle,
								children: t("projectHint")
							}) : null
						]
					}) : null,
					snapshot !== void 0 ? (0, react_jsx_runtime.jsxs)("details", {
						style: readonlyDetailsStyle,
						"data-mcp-sources": "",
						children: [(0, react_jsx_runtime.jsxs)("summary", {
							style: summaryStyle,
							children: [
								t("sources"),
								" (",
								(snapshot.sources ?? []).length,
								")"
							]
						}), (snapshot.sources ?? []).map((source) => (0, react_jsx_runtime.jsxs)("div", {
							style: readonlyItemStyle,
							"data-mcp-source": source.scope,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									style: readonlyHeaderRowStyle,
									children: [
										(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
											tone: "outline",
											children: [t(SCOPE_KEYS[source.scope]), source.compat ? ` · ${t("sourceCompat")}` : ""]
										}),
										(0, react_jsx_runtime.jsx)("code", {
											style: codeCaptionStyle,
											children: source.path
										}),
										(0, react_jsx_runtime.jsx)("span", {
											style: tagRailStyle,
											children: (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
												tone: "neutral",
												children: [
													source.serverCount,
													" ",
													t("serverCount")
												]
											})
										}),
										(0, react_jsx_runtime.jsx)("span", {
											style: readonlyStatusStyle,
											children: source.exists ? source.writable ? t("sourceWritable") : t("sourceReadonly") : t("sourceMissing")
										})
									]
								}),
								source.error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
									role: "alert",
									style: errorBoxStyle,
									children: source.error
								}) : null,
								source.problems !== void 0 ? source.problems.map((problem) => (0, react_jsx_runtime.jsxs)("p", {
									role: "alert",
									style: errorBoxStyle,
									children: [
										problem.id,
										": ",
										problem.error
									]
								}, problem.id)) : null
							]
						}, `${source.scope}:${source.path}`))]
					}) : null,
					message !== void 0 ? (0, react_jsx_runtime.jsxs)("p", {
						role: isConflictMessage ? "status" : "alert",
						style: isConflictMessage ? noticeBoxStyle : errorBoxStyle,
						children: [
							message,
							isConflictMessage ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								style: { marginInlineStart: 8 },
								onClick: rebase,
								children: t("rebase")
							}) : null,
							!isConflictMessage ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								style: { marginInlineStart: 8 },
								onClick: () => setMessage(void 0),
								"aria-label": t("dismiss"),
								children: "✕"
							}) : null
						]
					}) : null,
					pollFailed && state.status === "ready" ? (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						style: noticeBoxStyle,
						children: t("pollFailed")
					}) : null,
					state.status === "loading" ? (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						style: statusTextStyle,
						children: t("loading")
					}) : null,
					state.status === "error" ? (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: errorBoxStyle,
						children: state.message
					}) : null,
					snapshot !== void 0 && servers.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
						style: emptyStateStyle,
						children: snapshot.servers.length === 0 ? t("noServers") : t("empty")
					}) : null,
					servers.map((server) => (0, react_jsx_runtime.jsx)(ServerCard, {
						server,
						tools: tools.filter((tool) => tool.serverId === server.id),
						t,
						busy,
						writable: canWrite(server.scope),
						onEdit: () => setDraft(draftFromServer(server, defaultScope)),
						onToggle: () => {
							toggleServer(server);
						},
						onReload: () => {
							reload(server);
						},
						onRemove: () => {
							remove(server);
						},
						onMigrate: () => {
							migrate(server);
						},
						onToolToggle: (tool, enabled) => {
							toggleTool(server, tool, enabled);
						}
					}, server.id)),
					draft !== void 0 ? (0, react_jsx_runtime.jsxs)("form", {
						onSubmit: (event) => {
							save(event);
						},
						style: cardStyle,
						children: [
							(0, react_jsx_runtime.jsx)("h3", {
								style: formTitleStyle,
								children: draft.id.length > 0 && snapshot?.servers.some((server) => server.id === draft.id) ? t("edit") : t("add")
							}),
							(0, react_jsx_runtime.jsxs)("fieldset", {
								style: fieldsetStyle,
								children: [
									(0, react_jsx_runtime.jsx)("legend", {
										style: legendStyle,
										children: t("basic")
									}),
									(0, react_jsx_runtime.jsx)(Field, {
										label: t("id"),
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											className: FILL,
											required: true,
											pattern: SERVER_ID_PATTERN,
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
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											className: FILL,
											value: draft.label,
											onChange: (event) => setDraft({
												...draft,
												label: event.currentTarget.value
											})
										})
									}),
									(0, react_jsx_runtime.jsx)(FieldGroup, {
										label: t("scope"),
										children: (0, react_jsx_runtime.jsx)("span", {
											"data-mcp-scope-select": draft.scope,
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
												id: "mcp-scope",
												label: t("scope"),
												value: draft.scope,
												options: SCOPE_OPTIONS.map((scope) => ({
													value: scope,
													label: t(SCOPE_KEYS[scope]),
													disabled: scope === "project" && projectPath === void 0 || scope === "entry" && !entryView.available,
													title: scope === "project" && projectPath === void 0 ? t("projectHint") : void 0
												})),
												onChange: (scope) => setDraft({
													...draft,
													scope
												})
											})
										})
									}),
									(0, react_jsx_runtime.jsx)(FieldGroup, {
										label: t("transport"),
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
											id: "mcp-transport",
											label: t("transport"),
											value: draft.transport,
											options: TRANSPORT_OPTIONS.map((option) => ({
												...option,
												label: t(option.label)
											})),
											onChange: (transport) => setDraft({
												...draft,
												transport
											})
										})
									}),
									draft.transport === "stdio" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										(0, react_jsx_runtime.jsx)(Field, {
											label: t("command"),
											children: (0, react_jsx_runtime.jsx)("textarea", {
												style: textareaStyle,
												rows: 2,
												required: true,
												value: draft.command,
												onChange: (event) => setDraft({
													...draft,
													command: event.currentTarget.value
												})
											})
										}),
										(0, react_jsx_runtime.jsx)(ArgsFields, {
											entries: draft.args,
											t,
											onChange: (args) => setDraft({
												...draft,
												args
											})
										}),
										(0, react_jsx_runtime.jsx)(Field, {
											label: t("cwd"),
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: FILL,
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
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											className: FILL,
											type: "url",
											required: true,
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
									})] })
								]
							}),
							(0, react_jsx_runtime.jsxs)("fieldset", {
								style: fieldsetStyle,
								children: [
									(0, react_jsx_runtime.jsx)("legend", {
										style: legendStyle,
										children: t("advanced")
									}),
									(0, react_jsx_runtime.jsx)("div", {
										style: formGridStyle,
										children: (0, react_jsx_runtime.jsx)(Field, {
											label: t("timeout"),
											style: gridFieldStyle,
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: FILL,
												type: "number",
												min: 1,
												step: 1,
												value: draft.timeout,
												onChange: (event) => setDraft({
													...draft,
													timeout: event.currentTarget.value
												})
											})
										})
									}),
									(0, react_jsx_runtime.jsxs)("details", {
										style: collapseStyle,
										children: [
											(0, react_jsx_runtime.jsx)("summary", {
												style: summaryStyle,
												children: t("reconnect")
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												style: checkRowStyle,
												children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
													checked: draft.reconnectEnabled,
													label: t("reconnectEnabled"),
													onChange: (next) => setDraft({
														...draft,
														reconnectEnabled: next
													})
												}), (0, react_jsx_runtime.jsx)("span", { children: t("reconnectEnabled") })]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												style: formGridStyle,
												children: [
													(0, react_jsx_runtime.jsx)(Field, {
														label: t("initialDelay"),
														style: gridFieldStyle,
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
															className: FILL,
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
														style: gridFieldStyle,
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
															className: FILL,
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
														style: gridFieldStyle,
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
															className: FILL,
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
											})
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: formActionsStyle,
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "submit",
									variant: "primary",
									disabled: busy || !canWrite(draft.scope),
									children: t("save")
								}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => setDraft(void 0),
									disabled: busy,
									children: t("cancel")
								})]
							})
						]
					}) : null,
					snapshot !== void 0 && snapshot.readonlyEntries.length > 0 ? (0, react_jsx_runtime.jsxs)("details", {
						style: readonlyDetailsStyle,
						children: [
							(0, react_jsx_runtime.jsx)("summary", {
								style: summaryStyle,
								children: t("readonly")
							}),
							(0, react_jsx_runtime.jsx)("p", {
								style: hintStyle,
								children: t("readOnlyHint")
							}),
							(0, react_jsx_runtime.jsx)("ul", {
								style: listStyle,
								children: snapshot.readonlyEntries.map((entry) => (0, react_jsx_runtime.jsxs)("li", {
									style: readonlyItemStyle,
									children: [(0, react_jsx_runtime.jsxs)("div", {
										style: readonlyHeaderRowStyle,
										children: [
											(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
												tone: entry.source === "loader" ? "neutral" : "info",
												children: entry.source === "loader" ? t("sourceLoader") : `${t("sourcePreset")}: ${entry.sourceName ?? entry.sourceId ?? "—"}`
											}),
											(0, react_jsx_runtime.jsx)("code", {
												style: codeStyle,
												children: entry.entryId
											}),
											(0, react_jsx_runtime.jsx)("code", {
												style: codeCaptionStyle,
												children: entry.moduleName
											})
										]
									}), (0, react_jsx_runtime.jsxs)("p", {
										style: readonlyStatusStyle,
										children: [
											t("status"),
											": ",
											entry.enabled === "conditional" ? t("conditional") : entry.enabled ? t("enabled") : t("disabled"),
											" (",
											entry.fiberPhase ?? "—",
											")"
										]
									})]
								}, entry.entryId))
							})
						]
					}) : null
				]
			});
		}
		function Field({ label, children, style }) {
			return (0, react_jsx_runtime.jsxs)("label", {
				style: {
					display: "block",
					marginBlock: 8,
					...style
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: fieldLabelStyle,
					children: label
				}), children]
			});
		}
		/**
		* One labelled row for a control that is not a single labelable element.
		*
		* `<label>` associates with exactly one form control, so wrapping a segmented
		* control in one both mis-states the markup and strips the accessible name
		* from each of its segments. A grouped control gets this `<div>` row instead.
		*/
		function FieldGroup({ label, children, style }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "block",
					marginBlock: 8,
					...style
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: fieldLabelStyle,
					children: label
				}), children]
			});
		}
		function SecretFields({ label, entries, t, onChange }) {
			return (0, react_jsx_runtime.jsxs)("fieldset", {
				style: groupFieldsetStyle,
				children: [
					(0, react_jsx_runtime.jsx)("legend", {
						style: legendStyle,
						children: label
					}),
					(0, react_jsx_runtime.jsx)("p", {
						style: hintStyle,
						children: t("secretHint")
					}),
					entries.map((entry, index) => entry.templated ? (0, react_jsx_runtime.jsxs)("div", {
						style: secretRowStyle,
						"data-mcp-template": entry.key,
						children: [(0, react_jsx_runtime.jsx)(Field, {
							label: t("secretKey"),
							style: secretFieldStyle,
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: FILL,
								value: entry.key,
								readOnly: true
							})
						}), (0, react_jsx_runtime.jsx)("p", {
							style: hintStyle,
							"data-mcp-template-hint": "",
							children: t("secretTemplate")
						})]
					}, entry.uid) : (0, react_jsx_runtime.jsxs)("div", {
						style: secretRowStyle,
						children: [
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("secretKey"),
								style: secretFieldStyle,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									className: FILL,
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
								style: secretFieldStyle,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									className: FILL,
									type: entry.sensitive ? "password" : "text",
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
							(0, react_jsx_runtime.jsxs)("div", {
								style: secretActionsStyle,
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
										label: t("sensitive"),
										checked: entry.sensitive,
										onChange: (next) => {
											const updated = [...entries];
											updated[index] = {
												...entry,
												sensitive: next
											};
											onChange(updated);
										}
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
										label: t("secretUnset"),
										checked: entry.clear,
										onChange: (next) => {
											const updated = [...entries];
											updated[index] = {
												...entry,
												clear: next
											};
											onChange(updated);
										}
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										"data-mcp-danger": "",
										onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)),
										children: t("remove")
									})
								]
							})
						]
					}, entry.uid)),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						onClick: () => onChange([...entries, newSecretDraft()]),
						children: t("addEntry")
					})
				]
			});
		}
		/** Lossless per-row argument editor: values are saved verbatim (no trim/filter). */
		function ArgsFields({ entries, t, onChange }) {
			return (0, react_jsx_runtime.jsxs)("fieldset", {
				style: groupFieldsetStyle,
				children: [
					(0, react_jsx_runtime.jsx)("legend", {
						style: legendStyle,
						children: t("args")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						style: hintStyle,
						children: t("argsHint")
					}),
					entries.map((value, index) => (0, react_jsx_runtime.jsxs)("div", {
						style: secretRowStyle,
						children: [(0, react_jsx_runtime.jsx)(Field, {
							label: `${t("argument")} ${index + 1}`,
							style: secretFieldStyle,
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: FILL,
								value,
								onChange: (event) => {
									const next = [...entries];
									next[index] = event.currentTarget.value;
									onChange(next);
								}
							})
						}), (0, react_jsx_runtime.jsx)("div", {
							style: secretActionsStyle,
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								"data-mcp-danger": "",
								onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)),
								children: t("remove")
							})
						})]
					}, index)),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						onClick: () => onChange([...entries, ""]),
						children: t("addEntry")
					})
				]
			});
		}
		function ServerCard({ server, tools, t, busy, writable, onEdit, onToggle, onReload, onRemove, onMigrate, onToolToggle }) {
			const target = server.transport === "stdio" ? server.command : server.url;
			return (0, react_jsx_runtime.jsxs)("article", {
				"data-mcp-server": server.id,
				style: cardStyle,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: cardHeaderRowStyle,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: TAG_TONES[server.status],
								children: (0, react_jsx_runtime.jsxs)("span", {
									"data-mcp-status": server.status,
									style: statusBadgeStyle,
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
										state: DOT_STATES[server.status],
										size: 6
									}), t(STATUS_KEYS[server.status])]
								})
							}),
							(0, react_jsx_runtime.jsx)("strong", {
								style: cardTitleStyle,
								children: server.label
							}),
							(0, react_jsx_runtime.jsx)("code", {
								style: codeCaptionStyle,
								children: server.id
							}),
							(0, react_jsx_runtime.jsx)("span", {
								"data-mcp-scope": server.scope,
								style: metaTagStyle,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
									tone: "neutral",
									children: t(SCOPE_KEYS[server.scope])
								})
							}),
							server.shadowed.length > 0 ? (0, react_jsx_runtime.jsx)("span", {
								"data-mcp-shadowed": server.shadowed.join(","),
								style: metaTagStyle,
								title: server.shadowed.map((scope) => t(SCOPE_KEYS[scope])).join(", "),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
									tone: "warning",
									children: t("shadowed")
								})
							}) : null,
							(0, react_jsx_runtime.jsx)("span", {
								style: tagRailStyle,
								children: (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
									tone: "outline",
									children: [
										server.toolCount,
										" ",
										t("toolCount")
									]
								})
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: metaLineStyle,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "quiet",
							children: server.transport === "stdio" ? t("stdio") : t("http")
						}), (0, react_jsx_runtime.jsx)("code", {
							style: metaCodeStyle,
							title: target,
							children: target
						})]
					}),
					server.error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: errorBoxStyle,
						children: server.error
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						style: actionsRowStyle,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								onClick: onEdit,
								disabled: busy || !writable,
								children: t("edit")
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: onToggle,
								disabled: busy || !writable,
								children: server.enabled ? t("disable") : t("enable")
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: onReload,
								disabled: busy,
								children: t("reload")
							}),
							server.scope === "entry" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: onMigrate,
								disabled: busy || !writable,
								children: t("migrate")
							}) : null,
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								"data-mcp-danger": "",
								style: tagRailStyle,
								onClick: onRemove,
								disabled: busy || !writable,
								children: t("remove")
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("details", {
						style: collapseStyle,
						children: [
							(0, react_jsx_runtime.jsxs)("summary", {
								style: summaryStyle,
								children: [
									t("tools"),
									" (",
									tools.length,
									")"
								]
							}),
							tools.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								style: statusTextStyle,
								children: t("noTools")
							}) : (0, react_jsx_runtime.jsx)("ul", {
								style: listStyle,
								children: tools.map((tool) => (0, react_jsx_runtime.jsxs)("li", {
									style: toolItemStyle,
									children: [(0, react_jsx_runtime.jsxs)("div", {
										style: toolRowStyle,
										children: [
											(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
												label: tool.name,
												checked: tool.enabled,
												onChange: (next) => onToolToggle(tool, next),
												disabled: busy || !writable
											}),
											(0, react_jsx_runtime.jsx)("code", {
												style: codeStyle,
												children: tool.name
											}),
											(0, react_jsx_runtime.jsx)("span", {
												style: toolDescriptionStyle,
												children: tool.description
											})
										]
									}), (0, react_jsx_runtime.jsxs)("details", {
										style: paramDetailsStyle,
										children: [(0, react_jsx_runtime.jsxs)("summary", {
											style: summaryStyle,
											children: ["JSON ", t("params")]
										}), (0, react_jsx_runtime.jsx)("pre", {
											style: preStyle,
											children: JSON.stringify(tool.parameters, null, 2)
										})]
									})]
								}, tool.name))
							}),
							Object.entries(server.env).map(([key, value]) => (0, react_jsx_runtime.jsx)("span", {
								"data-mcp-secret": key,
								hidden: true,
								children: value.set ? t("secretSet") : t("secretUnset")
							}, key))
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Browser entry for Settings → MCP. */
		const NS = "settings.mcpManager";
		/**
		* `configForms` is the settings provider's shared form service. The panel
		* writes the Loader-entry scope through it, so the page only renders once that
		* service exists.
		*/
		const inject = [
			"connection",
			"slots",
			"locale",
			"configForms"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "web-mcp-manager: dictionaries");
			const t = ctx.locale.bind(NS);
			const api = createManagerApi(ctx);
			const entry = createEntryForm(ctx);
			const injected = () => ({
				api,
				entry
			});
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