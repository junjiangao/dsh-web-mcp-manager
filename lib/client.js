window.__ModuleLoader__.load({
	id: "@junjiangao/dsh-web-mcp-manager",
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
		const MCP_MANAGER_CHANNEL = "/mcp-manager";
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
		//#region lib/types/client/draft.js
		/**
		* Pure draft/patch projection helpers for the MCP settings form.
		*
		* These functions own no component state and are exported so the form
		* behaviour (conflict-safe revisions, secret clear/rename, lossless args)
		* can be tested without a browser.
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
		function draftFromServer(server, baseRevision = 0) {
			const env = secretDrafts(server?.env);
			const headers = secretDrafts(server?.headers);
			return {
				id: server?.id ?? "",
				baseRevision,
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
				sensitive: false
			};
		}
		function secretDrafts(value) {
			return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b)).map((key) => ({
				uid: allocateUid(),
				key,
				originalKey: key,
				value: "",
				clear: false,
				sensitive: value?.[key]?.sensitive ?? false
			}));
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
				args: [...draft.args],
				cwd: draft.cwd,
				url: draft.url,
				env: secretPatch(draft.env, draft.envOriginalKeys),
				headers: secretPatch(draft.headers, draft.headersOriginalKeys),
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
		function secretPatch(entries, originalKeys) {
			const result = {};
			const removed = new Set(originalKeys);
			for (const entry of entries) {
				const key = entry.key.trim();
				if (key.length === 0) continue;
				removed.delete(key);
				if (entry.originalKey !== void 0 && entry.originalKey !== key) setOwn(result, entry.originalKey, { clear: true });
				if (entry.clear) setOwn(result, key, { clear: true });
				else if (entry.value.length > 0) setOwn(result, key, entry.value);
			}
			for (const key of removed) setOwn(result, key, { clear: true });
			return result;
		}
		function sensitiveKeys(entries) {
			const keys = entries.filter((entry) => entry.sensitive).map((entry) => entry.key.trim()).filter(Boolean);
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
		const RADIUS = "var(--dsw-corner-shape, 6px)";
		const MONO_FONT = "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
		const COLORS = {
			text: "var(--dsw-alias-label-primary, #0f1115)",
			textSecondary: "var(--dsw-alias-label-secondary, #353638)",
			textTertiary: "var(--dsw-alias-label-tertiary, #61666b)",
			textDimmed: "var(--dsw-alias-label-dimmed, #979da6)",
			textCaption: "var(--dsw-alias-label-caption, #979da6)",
			textInverted: "var(--dsw-alias-label-primary-inverted, #ffffff)",
			textError: "var(--dsw-alias-label-error, #570c0c)",
			business: "var(--dsw-alias-state-business-primary, #2f6fed)",
			success: "var(--dsw-alias-state-success-primary, #22c55e)",
			warn: "var(--dsw-alias-state-warn-primary, #f59e0b)",
			danger: "var(--dsw-alias-state-error-primary, #ec1313)"
		};
		/** Focus ring lives in a scoped injected stylesheet (`:focus-visible` cannot be expressed inline). */
		const FOCUS_RING_CSS = "[data-mcp-manager=\"panel\"] :focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed); outline-offset: 1px; }";
		const FOCUS_STYLE_ID = "mcp-manager-focus-style";
		const chipBase = {
			display: "inline-flex",
			alignItems: "center",
			gap: 4,
			padding: "2px 8px",
			fontSize: 12,
			lineHeight: "18px",
			fontWeight: 500,
			whiteSpace: "nowrap",
			border: "1px solid",
			borderRadius: RADIUS
		};
		function statusChip(status) {
			switch (status) {
				case "waiting": return {
					...chipBase,
					color: COLORS.warn,
					background: "var(--dsw-alias-state-warn-tertiary, #fef5e7)",
					borderColor: "var(--dsw-alias-state-warn-secondary, #f7ad31)"
				};
				case "loading": return {
					...chipBase,
					color: COLORS.business,
					background: "var(--dsw-alias-state-business-tertiary, #eaf3ff)",
					borderColor: COLORS.business
				};
				case "loaded": return {
					...chipBase,
					color: COLORS.success,
					background: "var(--dsw-alias-state-success-tertiary, #e6faed)",
					borderColor: "var(--dsw-alias-state-success-secondary, #4ed17e)"
				};
				case "failed": return {
					...chipBase,
					color: COLORS.danger,
					background: "var(--dsw-alias-interactive-bg-hover-danger, #fef2f2)",
					borderColor: COLORS.danger
				};
				case "disabled": return {
					...chipBase,
					color: COLORS.textDimmed,
					background: "var(--dsw-alias-bg-layer-3, #f5f5f5)",
					borderColor: "var(--dsw-alias-border-l2, #e1e5ee)"
				};
			}
		}
		function sourceChip(source) {
			return source === "loader" ? {
				...chipBase,
				color: COLORS.textTertiary,
				background: "var(--dsw-alias-bg-layer-1, #fafafa)",
				borderColor: "var(--dsw-alias-border-l2, #e1e5ee)"
			} : {
				...chipBase,
				color: COLORS.business,
				background: "var(--dsw-alias-state-business-tertiary, #eaf3ff)",
				borderColor: COLORS.business
			};
		}
		const panelStyle = {
			maxWidth: 860,
			padding: 16,
			color: COLORS.text,
			fontFamily: "var(--dsw-font-family, system-ui, -apple-system, \"Segoe UI\", sans-serif)"
		};
		const headerStyle = { marginBlock: 8 };
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
			marginTop: 8,
			display: "flex",
			alignItems: "center",
			gap: 8
		};
		const identityChipStyle = {
			fontFamily: MONO_FONT,
			fontSize: 12,
			lineHeight: "18px",
			color: COLORS.textCaption,
			background: "var(--dsw-alias-bg-layer-1, #fafafa)",
			border: "1px solid var(--dsw-alias-border-l2, #e1e5ee)",
			borderRadius: RADIUS,
			padding: "2px 8px",
			whiteSpace: "nowrap"
		};
		const baseButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			gap: 6,
			padding: "6px 12px",
			border: "1px solid transparent",
			borderRadius: RADIUS,
			fontSize: 13,
			lineHeight: "18px",
			fontWeight: 500,
			cursor: "pointer"
		};
		const buttonPrimaryStyle = {
			...baseButtonStyle,
			background: "var(--dsw-alias-button-primary-fill, #0f1115)",
			color: COLORS.textInverted
		};
		const buttonSecondaryStyle = {
			...baseButtonStyle,
			background: "var(--dsw-alias-button-ghost-active-fill, #f1f3f5)",
			borderColor: "var(--dsw-alias-border-l2, #e1e5ee)",
			color: COLORS.text
		};
		const buttonInfoStyle = {
			...baseButtonStyle,
			background: "var(--dsw-alias-button-info-fill, #3b82f6)",
			color: COLORS.textInverted
		};
		const buttonToolBarStyle = {
			...baseButtonStyle,
			background: "var(--dsw-alias-button-tool-bar-fill, rgba(84, 85, 87, 0.5))",
			color: COLORS.text
		};
		const buttonDangerStyle = {
			...baseButtonStyle,
			background: "transparent",
			borderColor: COLORS.danger,
			color: COLORS.danger
		};
		const fieldLabelStyle = {
			display: "block",
			fontSize: 12,
			color: COLORS.textCaption,
			marginBottom: 4
		};
		const fieldInputStyle = {
			width: "100%",
			boxSizing: "border-box",
			padding: "6px 10px",
			fontSize: 13,
			lineHeight: "18px",
			color: COLORS.text,
			background: "var(--dsw-alias-bg-layer-1, #ffffff)",
			border: "1px solid var(--dsw-alias-border-l2, #e1e5ee)",
			borderRadius: RADIUS
		};
		const textareaStyle = {
			...fieldInputStyle,
			resize: "vertical"
		};
		const checkStyle = {
			accentColor: COLORS.business,
			cursor: "pointer"
		};
		const searchLabelStyle = {
			display: "block",
			width: "100%",
			marginBlock: "12px 16px"
		};
		const searchInputStyle = {
			...fieldInputStyle,
			width: "100%",
			maxWidth: "100%"
		};
		const cardStyle = {
			background: "var(--dsw-alias-bg-layer-2, #ffffff)",
			border: "1px solid var(--dsw-alias-border-l2, #e1e5ee)",
			borderRadius: RADIUS,
			padding: 16,
			marginBlock: 8,
			boxShadow: "var(--dsw-elevation-soft, 0 1px 2px rgba(16, 24, 40, 0.05))"
		};
		const cardHeaderRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const cardTitleStyle = {
			fontWeight: 600,
			fontSize: 14,
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
			color: COLORS.textCaption
		};
		const toolCountChipStyle = {
			...chipBase,
			marginInlineStart: "auto",
			color: COLORS.textCaption,
			background: "var(--dsw-alias-bg-layer-1, #fafafa)",
			borderColor: "var(--dsw-alias-border-l2, #e1e5ee)"
		};
		const metaLineStyle = {
			display: "block",
			overflow: "hidden",
			whiteSpace: "nowrap",
			textOverflow: "ellipsis",
			color: COLORS.textCaption,
			fontSize: 12,
			marginBlock: "6px 0"
		};
		const errorBoxStyle = {
			background: "var(--dsw-alias-state-error-secondary, #fee2e2)",
			color: COLORS.textError,
			padding: "8px 12px",
			borderRadius: RADIUS,
			marginBlock: 8,
			fontSize: 13
		};
		const noticeBoxStyle = {
			background: "var(--dsw-alias-state-warn-tertiary, #fef5e7)",
			color: "var(--dsw-alias-state-warn-label, #dd8629)",
			border: "1px solid var(--dsw-alias-state-warn-secondary, #f7ad31)",
			padding: "8px 12px",
			borderRadius: RADIUS,
			marginBlock: 8,
			fontSize: 13
		};
		const statusTextStyle = {
			color: COLORS.textSecondary,
			marginBlock: 8
		};
		const hintStyle = {
			color: COLORS.textCaption,
			fontSize: 12,
			marginBlock: 4
		};
		const actionsRowStyle = {
			display: "flex",
			gap: 8,
			marginBlock: 8,
			flexWrap: "wrap"
		};
		const collapseStyle = { marginBlock: 12 };
		const summaryStyle = {
			cursor: "pointer",
			color: COLORS.textSecondary,
			fontWeight: 500,
			fontSize: 13,
			paddingBlock: 2
		};
		const listStyle = {
			listStyle: "none",
			margin: 0,
			padding: 0
		};
		const toolItemStyle = {
			paddingBlock: 10,
			borderBottom: "1px solid var(--dsw-alias-separator-primary, #e1e5ee)"
		};
		const toolRowStyle = {
			display: "flex",
			alignItems: "flex-start",
			gap: 8,
			flexWrap: "wrap"
		};
		const toolDescriptionStyle = {
			color: COLORS.textCaption,
			fontSize: 12
		};
		const paramDetailsStyle = { marginBlock: 8 };
		const preStyle = {
			overflow: "auto",
			fontSize: 12,
			padding: 8,
			margin: 0,
			background: "var(--dsw-alias-markdown-code-block, #f9fafb)",
			borderRadius: RADIUS
		};
		const formTitleStyle = {
			margin: "0 0 12px",
			fontSize: 15,
			fontWeight: 600,
			color: COLORS.text
		};
		const fieldsetStyle = {
			border: "1px solid var(--dsw-alias-border-l1, #ebeef2)",
			borderRadius: RADIUS,
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
		const secretClearLabelStyle = {
			display: "flex",
			alignItems: "center",
			gap: 6,
			fontSize: 13,
			color: COLORS.text,
			cursor: "pointer"
		};
		const readonlyDetailsStyle = {
			...collapseStyle,
			marginBlock: 16
		};
		const readonlyItemStyle = {
			paddingBlock: 8,
			borderBottom: "1px solid var(--dsw-alias-separator-primary, #e1e5ee)"
		};
		const readonlyHeaderRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const readonlyStatusStyle = {
			color: COLORS.textCaption,
			fontSize: 12,
			marginBlock: 4
		};
		/**
		* Poll the snapshot while the page is visible.
		*
		* Guarantees: at most one request in flight per tick (slow responses are not
		* overlapped), and every response is tagged with the caller's monotonic `seq`
		* so a late poll response can never overwrite a newer snapshot produced by a
		* user operation or a newer poll.
		*/
		function useVisiblePolling(api, onSnapshot, onError, nextSeq) {
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let timer;
				let inFlight = false;
				const load = () => {
					if (document.visibilityState !== "visible" || inFlight) return;
					inFlight = true;
					const seq = nextSeq();
					api.snapshot({}, controller.signal).then((snapshot) => onSnapshot(snapshot, seq), (error) => onError(error, seq)).finally(() => {
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
				nextSeq
			]);
		}
		function McpSection({ api, t }) {
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [query, setQuery] = (0, react.useState)("");
			const [draft, setDraft] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)();
			const [pollFailed, setPollFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (document.getElementById(FOCUS_STYLE_ID) !== null) return;
				const style = document.createElement("style");
				style.id = FOCUS_STYLE_ID;
				style.textContent = FOCUS_RING_CSS;
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
				const message = error instanceof McpManagerRpcError && error.code === "conflict" ? t("conflict") : error instanceof Error ? error.message : String(error);
				setMessage(message);
			}, [t]);
			useVisiblePolling(api, accept, rejectPoll, nextSeq);
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
			const save = async (event) => {
				event.preventDefault();
				if (snapshot === void 0 || draft === void 0) return;
				const duplicates = [...duplicateDraftKeys(draft.env), ...duplicateDraftKeys(draft.headers)];
				if (duplicates.length > 0) {
					setMessage(`${t("duplicateKey")}: ${[...new Set(duplicates)].join(", ")}`);
					return;
				}
				const patch = draftPatch(draft);
				if (await run(() => api.upsertServer({
					server: patch,
					expectedRevision: draft.baseRevision
				})) !== void 0) setDraft(void 0);
			};
			/** Re-open the editor from the latest server view after a conflict (drops draft edits). */
			const rebase = () => {
				if (snapshot === void 0 || draft === void 0) return;
				const current = snapshot.servers.find((server) => server.id === draft.id);
				setDraft(current === void 0 ? void 0 : draftFromServer(current, snapshot.revision));
				setMessage(void 0);
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
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonPrimaryStyle,
									onClick: () => setDraft(draftFromServer(void 0, snapshot?.revision ?? 0)),
									disabled: busy || snapshot?.writable === false,
									children: t("add")
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonSecondaryStyle,
									onClick: () => {
										if (snapshot !== void 0) run(() => api.snapshot({}));
									},
									disabled: busy,
									children: t("refresh")
								})
							]
						}), (0, react_jsx_runtime.jsx)("div", {
							style: subtitleRowStyle,
							children: (0, react_jsx_runtime.jsx)("span", {
								style: identityChipStyle,
								children: PLUGIN_IDENTITY
							})
						})]
					}),
					(0, react_jsx_runtime.jsxs)("label", {
						style: searchLabelStyle,
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: fieldLabelStyle,
							children: t("search")
						}), (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							style: searchInputStyle,
							value: query,
							onChange: (event) => setQuery(event.currentTarget.value),
							placeholder: t("search")
						})]
					}),
					message !== void 0 ? (0, react_jsx_runtime.jsxs)("p", {
						role: isConflictMessage ? "status" : "alert",
						style: isConflictMessage ? noticeBoxStyle : errorBoxStyle,
						children: [
							message,
							isConflictMessage && draft !== void 0 ? (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...buttonSecondaryStyle,
									marginInlineStart: 8
								},
								onClick: rebase,
								children: t("rebase")
							}) : null,
							!isConflictMessage ? (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...buttonToolBarStyle,
									marginInlineStart: 8,
									padding: "2px 8px"
								},
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
						style: statusTextStyle,
						children: snapshot.servers.length === 0 ? t("noServers") : t("empty")
					}) : null,
					servers.map((server) => (0, react_jsx_runtime.jsx)(ServerCard, {
						server,
						tools: tools.filter((tool) => tool.serverId === server.id),
						t,
						busy,
						writable: snapshot?.writable ?? false,
						onEdit: () => setDraft(draftFromServer(server, snapshot?.revision ?? 0)),
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
										children: (0, react_jsx_runtime.jsx)("input", {
											style: fieldInputStyle,
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
										children: (0, react_jsx_runtime.jsx)("input", {
											style: fieldInputStyle,
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
											style: fieldInputStyle,
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
											children: (0, react_jsx_runtime.jsx)("input", {
												style: fieldInputStyle,
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
											style: fieldInputStyle,
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
											children: (0, react_jsx_runtime.jsx)("input", {
												style: fieldInputStyle,
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
											(0, react_jsx_runtime.jsxs)("label", {
												style: checkRowStyle,
												children: [
													(0, react_jsx_runtime.jsx)("input", {
														style: checkStyle,
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
											(0, react_jsx_runtime.jsxs)("div", {
												style: formGridStyle,
												children: [
													(0, react_jsx_runtime.jsx)(Field, {
														label: t("initialDelay"),
														style: gridFieldStyle,
														children: (0, react_jsx_runtime.jsx)("input", {
															style: fieldInputStyle,
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
														children: (0, react_jsx_runtime.jsx)("input", {
															style: fieldInputStyle,
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
														children: (0, react_jsx_runtime.jsx)("input", {
															style: fieldInputStyle,
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
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									style: buttonPrimaryStyle,
									disabled: busy || snapshot?.writable === false,
									children: t("save")
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonSecondaryStyle,
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
											(0, react_jsx_runtime.jsx)("span", {
												style: sourceChip(entry.source),
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
					entries.map((entry, index) => (0, react_jsx_runtime.jsxs)("div", {
						style: secretRowStyle,
						children: [
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("secretKey"),
								style: secretFieldStyle,
								children: (0, react_jsx_runtime.jsx)("input", {
									style: fieldInputStyle,
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
								children: (0, react_jsx_runtime.jsx)("input", {
									style: fieldInputStyle,
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
									(0, react_jsx_runtime.jsxs)("label", {
										style: secretClearLabelStyle,
										children: [
											(0, react_jsx_runtime.jsx)("input", {
												style: checkStyle,
												type: "checkbox",
												checked: entry.sensitive,
												onChange: (event) => {
													const next = [...entries];
													next[index] = {
														...entry,
														sensitive: event.currentTarget.checked
													};
													onChange(next);
												}
											}),
											" ",
											t("sensitive")
										]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										style: secretClearLabelStyle,
										children: [
											(0, react_jsx_runtime.jsx)("input", {
												style: checkStyle,
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
										style: buttonDangerStyle,
										onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)),
										children: t("remove")
									})
								]
							})
						]
					}, entry.uid)),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: buttonSecondaryStyle,
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
							children: (0, react_jsx_runtime.jsx)("input", {
								style: fieldInputStyle,
								value,
								onChange: (event) => {
									const next = [...entries];
									next[index] = event.currentTarget.value;
									onChange(next);
								}
							})
						}), (0, react_jsx_runtime.jsx)("div", {
							style: secretActionsStyle,
							children: (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonDangerStyle,
								onClick: () => onChange(entries.filter((_, itemIndex) => itemIndex !== index)),
								children: t("remove")
							})
						})]
					}, index)),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: buttonSecondaryStyle,
						onClick: () => onChange([...entries, ""]),
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
						style: cardHeaderRowStyle,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								"data-mcp-status": server.status,
								style: statusChip(server.status),
								children: t(STATUS_KEYS[server.status])
							}),
							(0, react_jsx_runtime.jsx)("strong", {
								style: cardTitleStyle,
								children: server.label
							}),
							(0, react_jsx_runtime.jsx)("code", {
								style: codeCaptionStyle,
								children: server.id
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								style: toolCountChipStyle,
								children: [
									server.toolCount,
									" ",
									t("toolCount")
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: metaLineStyle,
						children: [
							server.transport === "stdio" ? t("stdio") : t("http"),
							" → ",
							server.transport === "stdio" ? server.command : server.url
						]
					}),
					server.error !== void 0 ? (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: errorBoxStyle,
						children: server.error
					}) : null,
					(0, react_jsx_runtime.jsxs)("div", {
						style: actionsRowStyle,
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonPrimaryStyle,
								onClick: onToggle,
								disabled: busy || !writable,
								children: server.enabled ? t("disabled") : t("enabled")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonInfoStyle,
								onClick: onEdit,
								disabled: busy || !writable,
								children: t("edit")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonToolBarStyle,
								onClick: onReload,
								disabled: busy,
								children: t("reload")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonDangerStyle,
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
									children: [(0, react_jsx_runtime.jsxs)("label", {
										style: toolRowStyle,
										children: [
											(0, react_jsx_runtime.jsx)("input", {
												style: checkStyle,
												type: "checkbox",
												checked: tool.enabled,
												onChange: (event) => onToolToggle(tool, event.currentTarget.checked),
												disabled: busy || !writable
											}),
											" ",
											(0, react_jsx_runtime.jsx)("code", {
												style: codeStyle,
												children: tool.name
											}),
											" ",
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