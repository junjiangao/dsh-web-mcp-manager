import z from "@deepseek-ai/schemastery";
import { Config as Config$1, apply as apply$1 } from "@deepseek-ai/dsh-mcp-client";
import { basename, dirname, join } from "node:path";
import { watch } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { canonicalizeWatchPath, dshHomePath } from "@deepseek-ai/dsh-home-paths";
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
* Every manager endpoint, in registration order.
*
* These cover the `mcp.json` scopes and runtime status only. The legacy
* Loader-entry scope is absent on purpose: it is a plugin's own configuration,
* so the browser edits it through the official shared settings form
* (`ctx.configForms`) rather than through a private protocol.
*/
const MCP_MANAGER_ENDPOINTS = [
	"snapshot",
	"upsertServer",
	"removeServer",
	"setServerEnabled",
	"reloadServer"
];
/**
* The Loader entry id this plugin's Host half is mounted under, which is also
* its settings namespace. It is the key `ctx.configForms.get()` takes.
*/
const MCP_MANAGER_NAMESPACE = "web-mcp-manager";
/**
* Absolute exact Fetch-route path for one endpoint.
*
* The browser client posts to `<channel>/<endpoint>`, its channel grammar
* (`/^\/[A-Za-z0-9._~-]+$/`) admits a single segment only, so the channel is
* `/api` and the endpoint string carries the `mcp-manager/` prefix.
* @param endpoint - one manager endpoint name.
* @returns the path registered through `connection.fetch.register()`.
*/
function mcpManagerRoutePath(endpoint) {
	return `${MCP_MANAGER_API_CHANNEL}/${MCP_MANAGER_ENDPOINT_PREFIX}/${endpoint}`;
}
/**
* Every place a server definition can come from, in precedence order: a later
* entry never overrides an earlier one. `entry` is the legacy Loader-entry
* store the plugin used before `mcp.json` support.
*/
const MCP_SCOPES = [
	"project",
	"profile",
	"user",
	"entry"
];
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
/** 插件安装后的 npm 包名 / loader 模块名(bundle 层与 patch 条目 name)。 */
const PLUGIN_MODULE_NAME = "@junjiangao/dsh-web-mcp-manager";
/** 旧包名,仅用于已安装 profile 的过渡期识别(只读条目过滤),勿在生产路径使用。 */
const LEGACY_PLUGIN_MODULE_NAME = "dsh-web-mcp-manager";
//#endregion
//#region lib/types/host/mcp-config.js
/**
* Adapter between the manager's `StoredServer` shape and the
* `@deepseek-ai/dsh-mcp-client` plugin Config, plus schema-backed validation.
*/
/** Project one stored server into the mcp-client plugin Config. */
function toMcpConfig(server) {
	const reconnect = { ...server.reconnect };
	if (server.transport === "stdio") return {
		transport: "stdio",
		serverName: server.id,
		command: server.command,
		args: [...server.args],
		cwd: server.cwd,
		env: { ...server.env },
		toolCallTimeoutMs: server.toolCallTimeoutMs,
		failOnStartupError: true,
		reconnect
	};
	return {
		transport: "streamable-http",
		serverName: server.id,
		url: server.url,
		headers: { ...server.headers },
		toolCallTimeoutMs: server.toolCallTimeoutMs,
		failOnStartupError: true,
		reconnect
	};
}
/** 用 mcp-client 的 Config schema 校验并归一化单服务配置;失败抛带 code 的 Error。 */
function validateMcpConfig(server) {
	try {
		Config$1(toMcpConfig(server));
	} catch (error) {
		const message = `MCP configuration is invalid: ${error instanceof Error ? error.message : String(error)}`;
		throw Object.assign(new Error(message), { code: "MCP_CONFIG_VALIDATION" });
	}
	return server;
}
//#endregion
//#region lib/types/settings.js
/** Host settings schema and defaults for the MCP manager namespace. */
const MANAGER_NAMESPACE = MCP_MANAGER_NAMESPACE;
/**
* Largest delay Node schedules without clamping it to one millisecond.
*
* Same value as `@deepseek-ai/dsh-timeout`'s `MAX_TIMER_DELAY_MS`, inlined so
* the plugin does not carry a peer dependency for one constant (`dsh-timeout`'s
* primitives only notify through AbortSignals and are not otherwise usable
* here). `tests/config-validation.spec.ts` checks the bounded fields against
* this number.
*/
const MAX_TIMER_DELAY_MS = 2147483647;
const DEFAULT_RECONNECT = Object.freeze({
	enabled: true,
	initialDelayMs: 500,
	maxDelayMs: 3e4,
	maxAttempts: 10
});
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 6e4;
const ReconnectSchema = z.object({
	enabled: z.boolean().default(DEFAULT_RECONNECT.enabled),
	initialDelayMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RECONNECT.initialDelayMs),
	maxDelayMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RECONNECT.maxDelayMs),
	maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_RECONNECT.maxAttempts)
});
/**
* Secret values sit below a dictionary node rather than inside a union. This
* lets the Host settings redactor enumerate every env/header key while the
* browser receives only `SecretState` records assembled by the manager.
*/
const ServerSchema = z.object({
	id: z.string().required(),
	label: z.string().default(""),
	enabled: z.boolean().default(true),
	transport: z.union(["stdio", "streamable-http"]).default("stdio"),
	command: z.string().default(""),
	args: z.array(z.string()).default([]),
	cwd: z.string().default(""),
	url: z.string().default(""),
	env: z.dict(z.string().role("secret")).default({}),
	headers: z.dict(z.string().role("secret")).default({}),
	envSensitive: z.array(z.string()).default([]),
	headerSensitive: z.array(z.string()).default([]),
	toolCallTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
	reconnect: ReconnectSchema
});
/**
* The Loader entry's schema, which is also the form the settings page renders.
*
* dsh 0.2.0-rc.1 owns plugin configuration through the entry itself: there is no
* `settings.register()` any more, so the two top-level fields are declared
* `volatile()` — the whole subtree of each becomes live, which is what lets a
* committed edit reach the running controller without re-registering it.
*/
const Config = z.object({
	servers: z.dict(ServerSchema).default({}).volatile(),
	disabledTools: z.dict(z.array(z.string())).default({}).volatile()
});
/** The schema under its historical name; both refer to the same entry config. */
const ManagerSettingsSchema = Config;
function defaultServer(id) {
	return {
		id,
		label: "",
		enabled: true,
		transport: "stdio",
		command: "",
		args: [],
		cwd: "",
		url: "",
		env: {},
		headers: {},
		envSensitive: [],
		headerSensitive: [],
		toolCallTimeoutMs: DEFAULT_TOOL_CALL_TIMEOUT_MS,
		reconnect: { ...DEFAULT_RECONNECT }
	};
}
function defaultDocument() {
	return {
		servers: {},
		disabledTools: {}
	};
}
function validateStoredDocument(value) {
	for (const [key, server] of Object.entries(value.servers)) {
		validateServerId(key);
		if (server.id !== key) throw new Error(`MCP server id ${JSON.stringify(server.id)} does not match its settings key ${JSON.stringify(key)}`);
		validateServerConfig(server);
	}
	for (const [id, tools] of Object.entries(value.disabledTools)) {
		validateServerId(id);
		if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== "string" || tool.length === 0)) throw new Error(`disabledTools[${JSON.stringify(id)}] must be a list of tool names`);
	}
}
function validateServerId(id) {
	if (!/^[-A-Za-z0-9_]{1,32}$/.test(id)) throw new TypeError("server id must match [-A-Za-z0-9_]{1,32}");
}
function validateServerConfig(server) {
	validateServerId(server.id);
	if (server.label.length > 120) throw new Error("server label must be at most 120 characters");
	if (server.transport === "stdio") {
		if (server.command.trim() === "") throw new Error(`stdio server ${JSON.stringify(server.id)} needs a command`);
	} else {
		if (server.url.trim() === "") throw new Error(`streamable-http server ${JSON.stringify(server.id)} needs a URL`);
		if (!isTemplatedValue(server.url)) {
			let url;
			try {
				url = new URL(server.url);
			} catch {
				throw new Error(`streamable-http server ${JSON.stringify(server.id)} has an invalid URL`);
			}
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`streamable-http server ${JSON.stringify(server.id)} URL must use http or https`);
		}
	}
	if (!Number.isSafeInteger(server.toolCallTimeoutMs) || server.toolCallTimeoutMs < 1 || server.toolCallTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`server ${JSON.stringify(server.id)} toolCallTimeoutMs must be an integer from 1 to ${String(MAX_TIMER_DELAY_MS)}`);
	validateReconnect(server.reconnect);
	for (const [key, value] of Object.entries(server.env)) {
		if (key.trim() === "") throw new Error(`server ${JSON.stringify(server.id)} contains an empty environment key`);
		if (typeof value !== "string") throw new Error(`server ${JSON.stringify(server.id)} environment values must be strings`);
	}
	for (const [key, value] of Object.entries(server.headers)) {
		if (key.trim() === "") throw new Error(`server ${JSON.stringify(server.id)} contains an empty header key`);
		if (typeof value !== "string") throw new Error(`server ${JSON.stringify(server.id)} header values must be strings`);
	}
	validateSensitiveKeys(server.id, "envSensitive", server.envSensitive);
	validateSensitiveKeys(server.id, "headerSensitive", server.headerSensitive);
	validateMcpConfig(server);
}
/** `${env:NAME}` / `${NAME}` / `${NAME:-fallback}`, matching `./host/interpolate.ts`. */
const TEMPLATE_PATTERN = /\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}/u;
/**
* Whether a stored value is still an unresolved environment template.
*
* A template is legal in `mcp.json` and resolved by the Host immediately before
* it mounts the server, so shape checks that need the final text (URL parsing)
* are deferred until then.
* @param value - the stored value.
* @returns true when the value carries at least one reference.
*/
function isTemplatedValue(value) {
	return TEMPLATE_PATTERN.test(value);
}
/** 校验敏感键列表:格式、去重;不要求键必须存在于 env/headers(容忍手工编辑的孤儿标记)。 */
function validateSensitiveKeys(serverId, field, keys) {
	const seen = /* @__PURE__ */ new Set();
	for (const key of keys) {
		if (key.trim() === "" || key.length > 256) throw new Error(`server ${JSON.stringify(serverId)} contains an invalid ${field} key`);
		if (seen.has(key)) throw new Error(`server ${JSON.stringify(serverId)} ${field} contains duplicate key ${JSON.stringify(key)}`);
		seen.add(key);
	}
}
function validateReconnect(value) {
	if (!Number.isSafeInteger(value.initialDelayMs) || value.initialDelayMs < 1 || value.initialDelayMs > MAX_TIMER_DELAY_MS) throw new Error(`reconnect.initialDelayMs must be an integer from 1 to ${String(MAX_TIMER_DELAY_MS)}`);
	if (!Number.isSafeInteger(value.maxDelayMs) || value.maxDelayMs < value.initialDelayMs || value.maxDelayMs > MAX_TIMER_DELAY_MS) throw new Error(`reconnect.maxDelayMs must be >= initialDelayMs and at most ${String(MAX_TIMER_DELAY_MS)}`);
	if (!Number.isSafeInteger(value.maxAttempts) || value.maxAttempts < 1) throw new Error("reconnect.maxAttempts must be a positive integer");
}
function transportOf(value) {
	if (value === "stdio" || value === "streamable-http") return value;
	throw new Error(`unsupported MCP transport ${JSON.stringify(value)}`);
}
//#endregion
//#region lib/types/host/keyed-queue.js
/**
* Serialize async tasks per string key. Tasks with the same key run strictly
* one after another, tasks with different keys run concurrently, and each
* task's rejection is isolated: it never blocks later tasks with the same key.
*/
var PerKeyQueue = class {
	tails = /* @__PURE__ */ new Map();
	/** Run `task` after any previously queued task with the same key settles. */
	enqueue(key, task) {
		const run = (this.tails.get(key) ?? Promise.resolve()).then(task);
		this.tails.set(key, run.then(() => void 0, () => void 0));
		return run;
	}
	/** Wait for all queued tasks to settle; the queue remains usable afterwards. */
	async drain() {
		const tails = [...this.tails.values()];
		this.tails.clear();
		await Promise.allSettled(tails);
	}
};
/**
* Register every manager endpoint as an exact Fetch route.
* @param ctx - Host plugin Context carrying `connection`.
* @param dispatch - decoded-endpoint handler.
* @returns disposer removing all routes.
*/
function registerManagerRpcRoute(ctx, dispatch) {
	const disposers = MCP_MANAGER_ENDPOINTS.map((endpoint) => ctx.effect(() => ctx.connection.fetch.register(managerRoute(endpoint, dispatch)), `web-mcp-manager: ${mcpManagerRoutePath(endpoint)} route`));
	return async () => {
		await Promise.all(disposers.map((dispose) => Promise.resolve(dispose())));
	};
}
function managerRoute(endpoint, dispatch) {
	return {
		path: mcpManagerRoutePath(endpoint),
		methods: ["POST"],
		requestBody: "buffered",
		fetch: (request) => handleRequest(endpoint, dispatch, request)
	};
}
/**
* Validate one browser envelope, dispatch it, and frame the answer.
*
* The Connection bridge caps a buffered body at the carrier's configured
* `maxRequestBodyBytes` (300 MiB by default), far above any settings payload,
* so the manager enforces its own 2 MiB ceiling here — declared length first,
* then the decoded body.
*/
async function handleRequest(endpoint, dispatch, request) {
	if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return plain(415);
	const declaredLength = request.headers.get("content-length");
	if (declaredLength !== null && Number(declaredLength) > 2097152) return plain(413);
	let text;
	try {
		text = await request.text();
	} catch {
		return plain(400);
	}
	if (Buffer.byteLength(text, "utf8") > 2097152) return plain(413);
	let envelope;
	try {
		envelope = JSON.parse(text);
	} catch {
		return plain(400);
	}
	const parsed = parseClientRequest(envelope);
	if (parsed === void 0) return plain(400);
	let result;
	try {
		result = await dispatch(endpoint, parsed.payload, request.signal);
	} catch (error) {
		result = {
			ok: false,
			error: {
				code: "internal",
				message: error instanceof Error ? error.message : String(error),
				details: {}
			}
		};
	}
	const response = {
		type: "server-response",
		rpcId: parsed.rpcId,
		result: result.ok ? result : {
			ok: false,
			error: {
				...result.error,
				details: result.error.details ?? {}
			}
		}
	};
	return new Response(JSON.stringify(response), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
}
/** Validate the browser envelope `{ type, rpcId, method, payload }` before dispatch. */
function parseClientRequest(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	if (record.type !== "client-request" || typeof record.rpcId !== "string" || record.rpcId.length === 0) return void 0;
	if (record.rpcId.length > 256) return void 0;
	return {
		rpcId: record.rpcId,
		payload: record.payload
	};
}
function plain(status) {
	return new Response(null, { status });
}
//#endregion
//#region lib/types/host/mcp-json.js
/**
* `mcp.json` parsing, normalization, and round-trip-preserving writes.
*
* The on-disk shape follows the de-facto ecosystem format (Claude Code, Codex,
* pi, VS Code): a top-level `mcpServers` object keyed by server name. Reads are
* deliberately wider than writes — VS Code's `servers` alias and `http` /
* `streamableHttp` transport spellings are accepted — so a file another client
* wrote can be adopted without rewriting it. Writes are strict and preserve
* every field this plugin does not own, which is what makes sharing one file
* with other tools safe.
*
* This module is pure: no filesystem, no Cordis. `./mcp-file.ts` owns I/O.
*/
/** Primary top-level key holding the server map. */
const MCP_SERVERS_KEY = "mcpServers";
/** VS Code's alias for the same map; read-only. */
const MCP_SERVERS_ALIAS_KEY = "servers";
/** Keys this plugin owns inside one server entry; everything else round-trips. */
const OWNED_SERVER_KEYS = [
	"type",
	"command",
	"args",
	"env",
	"environment",
	"cwd",
	"url",
	"headers",
	"toolCallTimeoutMs",
	"reconnect",
	"enabled",
	"disabled",
	"sensitive",
	"envSensitive",
	"headerSensitive",
	"disabledTools"
];
/**
* Parse one `mcp.json` text.
* @param text - file content.
* @returns the document, or a human-readable failure for the panel.
*/
function parseMcpJson(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	if (!isRecord$1(value)) return {
		ok: false,
		error: "the document root must be a JSON object"
	};
	const warnings = [];
	const hasPrimary = isRecord$1(value[MCP_SERVERS_KEY]);
	const hasAlias = isRecord$1(value[MCP_SERVERS_ALIAS_KEY]);
	if (value["mcpServers"] !== void 0 && !hasPrimary) warnings.push(`"${MCP_SERVERS_KEY}" must be an object`);
	if (value["servers"] !== void 0 && !hasAlias) warnings.push(`"${MCP_SERVERS_ALIAS_KEY}" must be an object`);
	if (hasPrimary && hasAlias) warnings.push(`both "${MCP_SERVERS_KEY}" and "${MCP_SERVERS_ALIAS_KEY}" are present; "${MCP_SERVERS_KEY}" wins`);
	const serversKey = hasPrimary ? MCP_SERVERS_KEY : MCP_SERVERS_ALIAS_KEY;
	const servers = hasPrimary ? value[MCP_SERVERS_KEY] : hasAlias ? value[MCP_SERVERS_ALIAS_KEY] : {};
	return {
		ok: true,
		document: {
			root: value,
			servers,
			serversKey
		},
		warnings
	};
}
/**
* Render a document back to disk text.
*
* The server map is written under the key it was read from, so a file another
* client wrote with VS Code's `servers` alias is not silently restructured. The
* map is written last for a stable field order; two-space indentation and a
* trailing newline match what the other clients in the ecosystem produce.
* @param document - the document to render.
* @returns the exact file text.
*/
function serializeMcpJson(document) {
	const root = { ...document.root };
	Reflect.deleteProperty(root, MCP_SERVERS_KEY);
	Reflect.deleteProperty(root, MCP_SERVERS_ALIAS_KEY);
	return `${JSON.stringify({
		...root,
		[document.serversKey]: document.servers
	}, null, 2)}\n`;
}
/**
* Replace, add, or remove one server in a document.
* @param document - the parsed document.
* @param id - server name.
* @param server - the stored server to write, or `null` to remove it.
* @returns a new document; the input is not mutated.
*/
function withServer(document, id, server) {
	const servers = { ...document.servers };
	if (server === null) Reflect.deleteProperty(servers, id);
	else servers[id] = applyServerToRaw(servers[id], id, server);
	return {
		...document,
		servers
	};
}
/** An empty document, for creating a file that does not exist yet. */
function emptyDocument() {
	return {
		root: {},
		servers: {},
		serversKey: MCP_SERVERS_KEY
	};
}
/** Whether an unknown value is a plain JSON object. */
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Normalize one raw `mcp.json` entry into the manager's stored shape.
*
* Only the fields the panel edits are normalized; validation of the resulting
* server (transport requirements, timer bounds, the `dsh-mcp-client` schema) is
* the caller's, so this stays a pure shape mapping.
* @param id - the key the entry is stored under; it becomes the server id.
* @param raw - the raw entry value.
* @returns the stored server, or a failure naming the offending field.
*/
function normalizeServer(id, raw) {
	try {
		validateServerId(id);
	} catch {
		return {
			ok: false,
			error: "server name must match [-A-Za-z0-9_]{1,32}"
		};
	}
	if (!isRecord$1(raw)) return {
		ok: false,
		error: "the server entry must be an object"
	};
	const server = defaultServer(id);
	const label = raw.label;
	if (label !== void 0) {
		if (typeof label !== "string") return {
			ok: false,
			error: "\"label\" must be a string"
		};
		server.label = label;
	} else server.label = id;
	const disabled = raw.disabled;
	if (raw.enabled !== void 0 && typeof raw.enabled !== "boolean") return {
		ok: false,
		error: "\"enabled\" must be a boolean"
	};
	if (disabled !== void 0 && typeof disabled !== "boolean") return {
		ok: false,
		error: "\"disabled\" must be a boolean"
	};
	server.enabled = typeof raw.enabled === "boolean" ? raw.enabled : disabled === true ? false : true;
	const type = raw.type;
	if (type !== void 0 && typeof type !== "string") return {
		ok: false,
		error: "\"type\" must be a string"
	};
	const transport = transportOfJson(type, raw.url !== void 0);
	if (transport === void 0) return {
		ok: false,
		error: `unsupported transport ${JSON.stringify(type)}: dsh-mcp-client supports "stdio" and "streamable-http" only`
	};
	server.transport = transport;
	const env = readStringMap(raw.env ?? raw.environment, "env");
	if (!env.ok) return env;
	const headers = readStringMap(raw.headers, "headers");
	if (!headers.ok) return headers;
	server.env = env.values;
	server.headers = headers.values;
	if (server.transport === "stdio") {
		if (typeof raw.command !== "string" || raw.command.trim() === "") return {
			ok: false,
			error: "a stdio server needs a non-empty \"command\""
		};
		server.command = raw.command;
		const args = raw.args;
		if (args !== void 0 && (!Array.isArray(args) || args.some((entry) => typeof entry !== "string"))) return {
			ok: false,
			error: "\"args\" must be an array of strings"
		};
		server.args = args === void 0 ? [] : [...args];
		if (raw.cwd !== void 0 && typeof raw.cwd !== "string") return {
			ok: false,
			error: "\"cwd\" must be a string"
		};
		server.cwd = typeof raw.cwd === "string" ? raw.cwd : "";
	} else {
		if (typeof raw.url !== "string" || raw.url.trim() === "") return {
			ok: false,
			error: "an http server needs a non-empty \"url\""
		};
		server.url = raw.url;
	}
	if (raw.toolCallTimeoutMs !== void 0) {
		const timeout = raw.toolCallTimeoutMs;
		if (typeof timeout !== "number" || !Number.isSafeInteger(timeout) || timeout < 1) return {
			ok: false,
			error: "\"toolCallTimeoutMs\" must be a positive integer"
		};
		server.toolCallTimeoutMs = timeout;
	}
	if (raw.reconnect !== void 0) {
		if (!isRecord$1(raw.reconnect)) return {
			ok: false,
			error: "\"reconnect\" must be an object"
		};
		const reconnect = { ...DEFAULT_RECONNECT };
		for (const key of [
			"enabled",
			"initialDelayMs",
			"maxDelayMs",
			"maxAttempts"
		]) {
			const value = raw.reconnect[key];
			if (value === void 0) continue;
			if (key === "enabled") {
				if (typeof value !== "boolean") return {
					ok: false,
					error: "\"reconnect.enabled\" must be a boolean"
				};
				reconnect.enabled = value;
				continue;
			}
			if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return {
				ok: false,
				error: `"reconnect.${key}" must be a positive integer`
			};
			reconnect[key] = value;
		}
		server.reconnect = reconnect;
	}
	const sensitive = readSensitive(raw);
	if (!sensitive.ok) return sensitive;
	server.envSensitive = [...sensitive.env];
	server.headerSensitive = [...sensitive.headers];
	return {
		ok: true,
		server
	};
}
/**
* Map an `mcp.json` `type` onto a supported transport.
*
* `undefined` infers from the presence of `url`, which is how several clients
* omit `type` for stdio entries.
* @param type - the declared type, when present.
* @param hasUrl - whether the entry carries a `url`.
* @returns the transport, or `undefined` for an unsupported one (`sse`).
*/
function transportOfJson(type, hasUrl) {
	if (type === void 0) return hasUrl ? "streamable-http" : "stdio";
	const normalized = type.trim().toLowerCase().replace(/[_-]/gu, "");
	if (normalized === "stdio") return "stdio";
	if (normalized === "http" || normalized === "streamablehttp" || normalized === "streamable") return "streamable-http";
}
/**
* Project one stored server back into its raw `mcp.json` entry.
*
* Defaults are omitted so a file stays readable and diff-friendly: only
* `type`/`command`/`url` and the fields that differ from the defaults appear.
* @param server - the stored server.
* @returns the raw entry to persist.
*/
function serverToRaw(server) {
	const raw = { type: server.transport === "stdio" ? "stdio" : "http" };
	if (server.label !== "" && server.label !== server.id) raw.label = server.label;
	if (!server.enabled) raw.enabled = false;
	if (server.transport === "stdio") {
		raw.command = server.command;
		raw.args = [...server.args];
		if (server.cwd !== "") raw.cwd = server.cwd;
	} else raw.url = server.url;
	if (Object.keys(server.env).length > 0) raw.env = { ...server.env };
	if (Object.keys(server.headers).length > 0) raw.headers = { ...server.headers };
	if (server.toolCallTimeoutMs !== 6e4) raw.toolCallTimeoutMs = server.toolCallTimeoutMs;
	if (!sameReconnect(server.reconnect)) raw.reconnect = { ...server.reconnect };
	if (server.envSensitive.length > 0 || server.headerSensitive.length > 0) raw.sensitive = {
		...server.envSensitive.length > 0 ? { env: [...server.envSensitive] } : {},
		...server.headerSensitive.length > 0 ? { headers: [...server.headerSensitive] } : {}
	};
	return raw;
}
/**
* Merge a new stored server into an existing raw entry, preserving foreign keys.
* @param existing - the raw entry currently on disk, when present.
* @param id - server name.
* @param next - the stored server to write.
* @returns the raw entry to persist.
*/
function applyServerToRaw(existing, id, next) {
	const merged = isRecord$1(existing) ? { ...existing } : {};
	for (const key of OWNED_SERVER_KEYS) Reflect.deleteProperty(merged, key);
	return {
		...merged,
		...serverToRaw({
			...next,
			id
		})
	};
}
function sameReconnect(server) {
	return server.enabled === DEFAULT_RECONNECT.enabled && server.initialDelayMs === DEFAULT_RECONNECT.initialDelayMs && server.maxDelayMs === DEFAULT_RECONNECT.maxDelayMs && server.maxAttempts === DEFAULT_RECONNECT.maxAttempts;
}
function readStringMap(value, field) {
	if (value === void 0) return {
		ok: true,
		values: {}
	};
	if (!isRecord$1(value)) return {
		ok: false,
		error: `"${field}" must be an object of strings`
	};
	const values = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== "string") return {
			ok: false,
			error: `"${field}.${key}" must be a string`
		};
		values[key] = entry;
	}
	return {
		ok: true,
		values
	};
}
function readSensitive(raw) {
	const nested = isRecord$1(raw.sensitive) ? raw.sensitive : {};
	const env = raw.envSensitive ?? nested.env;
	const headers = raw.headerSensitive ?? nested.headers;
	const read = (value, field) => {
		if (value === void 0) return [];
		if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return `"${field}" must be an array of strings`;
		return [...value];
	};
	const envValue = read(env, "sensitive.env");
	if (typeof envValue === "string") return {
		ok: false,
		error: envValue
	};
	const headerValue = read(headers, "sensitive.headers");
	if (typeof headerValue === "string") return {
		ok: false,
		error: headerValue
	};
	return {
		ok: true,
		env: envValue,
		headers: headerValue
	};
}
//#endregion
//#region lib/types/host/mcp-file.js
/**
* Filesystem access for the `mcp.json` sources.
*
* Paths come from the official helpers (`dshHomePath` honours `$DSH_HOME`), and
* every write goes through the official atomic-write primitives: a
* `withFileLock` read-modify-write cycle committing through `writeFileAtomic`.
* Readers stay lock-free because the rename is atomic, and two writers can never
* resurrect a state the other just replaced. Files are created `0600` because a
* `mcp.json` may legitimately hold a literal secret.
*/
/** File name every scope uses. */
const MCP_FILE_NAME = "mcp.json";
/** Project-local directory that owns the project scope. */
const MCP_PROJECT_DIR = ".dsh";
/** Claude Code's project file name; read-only compatibility input. */
const MCP_COMPAT_FILE_NAME = ".mcp.json";
/** Owner-only permissions: a `mcp.json` may hold a literal secret. */
const FILE_MODE = 384;
/** Owner-only directory mode for the `.dsh` folder this plugin creates. */
const DIR_MODE = 448;
/** Coalescing window for filesystem events, in milliseconds. */
const WATCH_DEBOUNCE_MS = 250;
/**
* Resolve the scope files for this Host instance.
*
* Scope order is precedence order, highest first: project, profile, user. A
* scope whose root cannot be resolved is omitted rather than guessed.
* @param roots - resolved roots from the Host.
* @returns the scope files in precedence order.
*/
function resolveScopeFiles(roots) {
	const files = [];
	if (roots.projectDir !== void 0) files.push({
		scope: "project",
		path: join(roots.projectDir, MCP_PROJECT_DIR, MCP_FILE_NAME),
		compatPath: join(roots.projectDir, MCP_COMPAT_FILE_NAME)
	});
	if (roots.profileDir !== void 0) files.push({
		scope: "profile",
		path: join(roots.profileDir, MCP_FILE_NAME)
	});
	files.push({
		scope: "user",
		path: roots.home === void 0 ? dshHomePath(MCP_FILE_NAME) : join(roots.home, MCP_FILE_NAME)
	});
	return files;
}
/**
* Read one file without creating or locking it.
* @param scope - the scope the file belongs to.
* @param path - absolute file path.
* @param writable - whether the panel may write this file.
* @param compat - whether this is the read-only compatibility input of `scope`.
* @returns the read outcome; a missing file is an empty, successful read.
*/
async function readScopePath(scope, path, writable, compat = false) {
	const outcome = await readDocument(path);
	return {
		scope,
		path,
		writable,
		compat,
		exists: outcome.exists,
		...outcome.document === void 0 ? {} : { document: outcome.document },
		...outcome.error === void 0 ? {} : { error: outcome.error }
	};
}
/**
* Read every scope file plus each project's compatibility file.
*
* Every entry resolves independently, so one unreadable or malformed file
* leaves the others usable — a broken `mcp.json` must never take the panel down.
* @param files - scope files in precedence order.
* @returns each row's read outcome; a project's `.mcp.json` follows its own file.
*/
async function readScopeFiles(files) {
	const results = [];
	for (const file of files) {
		results.push(await readScopePath(file.scope, file.path, true));
		if (file.compatPath !== void 0) {
			const compat = await readScopePath(file.scope, file.compatPath, false, true);
			if (compat.exists || compat.error !== void 0) results.push(compat);
		}
	}
	return results;
}
/**
* Apply one mutation to a scope file under the official cross-process lock.
*
* The current text is re-read inside the lock, so a concurrent editor's write is
* never silently reverted. An unparsable file refuses the write instead of being
* overwritten: the user must repair it.
* @param path - absolute file path.
* @param mutate - derives the next document from the current one; `undefined` cancels the write.
* @returns the written text, or `undefined` when the mutation cancelled.
* @throws when the existing file is unreadable as JSON, or the write fails.
*/
async function mutateScopeFile(path, mutate) {
	await mkdir(dirname(path), {
		recursive: true,
		mode: DIR_MODE
	});
	return withFileLock(path, async () => {
		const current = await readDocument(path);
		if (current.error !== void 0) throw new Error(current.error);
		const next = mutate(current.document ?? emptyDocument());
		if (next === void 0) return void 0;
		const text = serializeMcpJson(next);
		await writeFileAtomic(path, text, {
			mode: FILE_MODE,
			dirMode: DIR_MODE
		});
		return text;
	});
}
/**
* Watch every scope file's directory and coalesce events into one callback.
*
* The directory — not the file — is watched, so create, replace, and delete all
* arrive, and a file that does not exist yet is picked up when it appears.
* `canonicalizeWatchPath` gives the native watcher one canonical spelling even
* while the final components are still missing.
* @param files - scope files to watch.
* @param onChange - invoked after the debounce window when any watched name changes.
* @returns a disposer closing every watcher.
*/
async function watchScopeFiles(files, onChange) {
	const watched = /* @__PURE__ */ new Map();
	for (const file of files) {
		const paths = [file.path, ...file.compatPath === void 0 ? [] : [file.compatPath]];
		for (const path of paths) {
			const directory = await nearestExistingDirectory(dirname(path));
			if (directory === void 0) continue;
			const directoryPath = await canonicalizeWatchPath(directory);
			const names = watched.get(directoryPath) ?? /* @__PURE__ */ new Set();
			names.add(basename(path));
			watched.set(directoryPath, names);
		}
	}
	const watchers = [];
	let timer;
	let disposed = false;
	const fire = () => {
		if (disposed) return;
		if (timer !== void 0) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = void 0;
			if (!disposed) onChange();
		}, WATCH_DEBOUNCE_MS);
		timer.unref();
	};
	for (const [directory, names] of watched) try {
		const watcher = watch(directory, { persistent: false }, (_event, filename) => {
			if (filename === null || names.has(filename.toString())) fire();
		});
		watcher.on("error", () => {});
		watchers.push(watcher);
	} catch {}
	return () => {
		disposed = true;
		if (timer !== void 0) clearTimeout(timer);
		for (const watcher of watchers) watcher.close();
	};
}
/** Read and parse one file; absence is a successful empty result. */
async function readDocument(path) {
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return { exists: false };
		return {
			exists: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
	const parsed = parseMcpJson(text);
	if (!parsed.ok) return {
		exists: true,
		error: parsed.error
	};
	return {
		exists: true,
		document: parsed.document
	};
}
/** Walk up until an existing directory is found, without creating anything. */
async function nearestExistingDirectory(path) {
	let current = path;
	for (;;) {
		try {
			if ((await stat(current)).isDirectory()) return current;
		} catch {}
		const parent = dirname(current);
		if (parent === current) return void 0;
		current = parent;
	}
}
//#endregion
//#region lib/types/host/interpolate.js
/**
* `${env:NAME}` template expansion for `mcp.json` values.
*
* `mcp.json` files are shared with other MCP clients (Claude Code, Codex, pi,
* VS Code), so a secret must be able to stay a template in the file and never
* reach the panel. Expansion happens exactly once, on the Host, at the moment
* a server is projected into `@deepseek-ai/dsh-mcp-client`'s Config.
*
* Accepted spellings, matching the surrounding ecosystem:
*
* | Form | Meaning |
* |---|---|
* | `${env:NAME}` | ambient environment |
* | `${NAME}` | ambient environment (shorthand) |
* | `${NAME:-fallback}` | fallback when unset or empty |
* | `$${NAME}` | a literal `${NAME}` |
*
* An unresolved reference without a fallback is reported, never silently
* substituted: the server is surfaced with a failure that names the variable.
*/
/** One `${…}` reference, with or without the `env:` prefix and a `:-` fallback. */
const REFERENCE = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/gu;
/** An escaped `$${…}`, kept literal and never reported as a reference. */
const ESCAPED = /\$\$\{/gu;
/** Sentinel standing in for an escaped `$${` while references are matched. */
const ESCAPE_SENTINEL = "\0";
/**
* Expand every environment reference in one value.
* @param text - the raw value as stored in `mcp.json`.
* @param env - environment mapping; `undefined` and `''` both count as unset.
* @returns the expanded text and the unresolved names.
*/
function expandTemplate(text, env) {
	const missing = [];
	return {
		value: text.replace(ESCAPED, ESCAPE_SENTINEL).replace(REFERENCE, (match, name, fallback) => {
			const resolved = env[name];
			if (resolved !== void 0 && resolved !== "") return resolved;
			if (fallback !== void 0) return fallback;
			if (!missing.includes(name)) missing.push(name);
			return match;
		}).split(ESCAPE_SENTINEL).join("${"),
		missing
	};
}
/**
* Names one value references, without resolving them.
*
* The panel uses this to mark a stored entry as "from environment" and to keep
* it out of the managed-secret flow: the file holds a template, not a value.
* @param text - the raw value as stored in `mcp.json`.
* @returns referenced names in first-seen order.
*/
function templateEnvNames(text) {
	const names = [];
	for (const match of text.replace(ESCAPED, ESCAPE_SENTINEL).matchAll(REFERENCE)) {
		const name = match[1];
		if (!names.includes(name)) names.push(name);
	}
	return names;
}
/** Whether one value carries at least one reference. */
function isTemplate(text) {
	return templateEnvNames(text).length > 0;
}
/**
* Expand every value of one map, collecting unresolved names across the map.
* @param values - raw key/value pairs.
* @param env - environment mapping.
* @returns expanded pairs (insertion order preserved) and the unresolved names.
*/
function expandMap(values, env) {
	const expanded = {};
	const missing = [];
	for (const [key, value] of Object.entries(values)) {
		const result = expandTemplate(value, env);
		expanded[key] = result.value;
		for (const name of result.missing) if (!missing.includes(name)) missing.push(name);
	}
	return {
		values: expanded,
		missing
	};
}
//#endregion
//#region lib/types/host/mcp-sources.js
/**
* Merge the `mcp.json` sources into one effective server set.
*
* Precedence, highest first:
*
* | Scope | Path | Notes |
* |---|---|---|
* | project | `<project>/.dsh/mcp.json` | selected in the panel, validated against the workspace registry |
* | project (compat) | `<project>/.mcp.json` | Claude Code's file, read-only |
* | profile | `~/.dsh/profiles/<profile>/mcp.json` | the default target for a new server |
* | user | `~/.dsh/mcp.json` | honours `$DSH_HOME` |
* | entry (legacy) | the `web-mcp-manager` Loader entry's `Config.servers` | read-only until migrated |
*
* A server name defined in more than one scope keeps the highest-precedence
* definition and reports the rest as shadowed, so the panel can show them
* instead of silently dropping user configuration.
*
* This module is pure: it takes filesystem read outcomes and the entry config,
* and returns the merged model.
*/
/**
* Merge every source into the effective server set.
* @param input - read outcomes and the legacy entry servers.
* @returns the effective servers and one row per source.
*/
function mergeSources(input) {
	const winners = /* @__PURE__ */ new Map();
	const order = [];
	const rows = [];
	for (const read of input.scopes) {
		const entries = read.document?.servers ?? {};
		const names = Object.keys(entries);
		const problems = [];
		let accepted = 0;
		for (const id of names) {
			const normalized = normalizeServer(id, entries[id]);
			if (!normalized.ok) {
				problems.push({
					id,
					error: normalized.error
				});
				continue;
			}
			accepted += 1;
			const existing = winners.get(id);
			if (existing === void 0) {
				order.push(id);
				winners.set(id, {
					id,
					scope: read.scope,
					path: read.path,
					server: normalized.server,
					shadowed: []
				});
			} else winners.set(id, {
				...existing,
				shadowed: [...existing.shadowed, {
					scope: read.scope,
					path: read.path
				}]
			});
		}
		rows.push({
			scope: read.scope,
			path: read.path,
			writable: read.writable,
			compat: read.compat,
			exists: read.exists,
			serverCount: accepted,
			...read.error === void 0 ? {} : { error: read.error },
			...problems.length === 0 ? {} : { problems }
		});
	}
	const entryNames = Object.keys(input.entryServers).sort((a, b) => a.localeCompare(b));
	for (const id of entryNames) {
		const server = input.entryServers[id];
		if (server === void 0) continue;
		const existing = winners.get(id);
		if (existing === void 0) {
			order.push(id);
			winners.set(id, {
				id,
				scope: "entry",
				path: input.entryPath,
				server,
				shadowed: []
			});
		} else winners.set(id, {
			...existing,
			shadowed: [...existing.shadowed, {
				scope: "entry",
				path: input.entryPath
			}]
		});
	}
	rows.push({
		scope: "entry",
		path: input.entryPath,
		writable: true,
		compat: false,
		exists: entryNames.length > 0,
		serverCount: entryNames.length
	});
	return {
		servers: order.map((id) => winners.get(id)),
		sources: rows
	};
}
/**
* Names the server still holds as `${…}` templates, for panel display.
* @param server - the stored server.
* @returns referenced names per map, in first-seen order.
*/
function serverTemplates(server) {
	const templated = (values) => Object.keys(values).filter((key) => isTemplate(values[key]));
	return {
		env: templated(server.env),
		headers: templated(server.headers)
	};
}
/**
* Resolve `${…}` templates in every text field a server carries.
*
* Expansion happens only here — on the way into `@deepseek-ai/dsh-mcp-client` —
* so a template never reaches the panel and is never written back expanded.
* @param server - the stored server, templates intact.
* @param env - ambient environment.
* @returns the expanded server and the unresolved variable names.
*/
function expandServer(server, env) {
	const missing = [];
	const record = (names) => {
		for (const name of names) if (!missing.includes(name)) missing.push(name);
	};
	const envMap = expandMap(server.env, env);
	record(envMap.missing);
	const headerMap = expandMap(server.headers, env);
	record(headerMap.missing);
	const command = expandTemplate(server.command, env);
	record(command.missing);
	const cwd = expandTemplate(server.cwd, env);
	record(cwd.missing);
	const url = expandTemplate(server.url, env);
	record(url.missing);
	const args = server.args.map((arg) => {
		const expanded = expandTemplate(arg, env);
		record(expanded.missing);
		return expanded.value;
	});
	return {
		server: {
			...server,
			command: command.value,
			cwd: cwd.value,
			url: url.value,
			args,
			env: envMap.values,
			headers: headerMap.values
		},
		missing
	};
}
//#endregion
//#region lib/types/protocol.js
/** Runtime validation and redacted projections for the manager RPC. */
const MAX_LABEL_LENGTH = 120;
const MAX_ARGUMENTS = 128;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asRecord(value, message) {
	if (!isRecord(value)) throw new TypeError(message);
	return value;
}
function asString(value, field) {
	if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
	return value;
}
function asBoolean(value, field) {
	if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
	return value;
}
function parseSnapshotRequest(value) {
	return parseScopeTarget(asRecord(value ?? {}, "snapshot payload must be an object"));
}
/** Read the optional scope/project selection every mutating endpoint accepts. */
function parseScopeTarget(record) {
	const scope = record.scope === void 0 ? void 0 : asScope(record.scope, "scope");
	const projectPath = record.projectPath === void 0 ? void 0 : asString(record.projectPath, "projectPath");
	if (projectPath !== void 0 && !isAbsolutePath(projectPath)) throw new TypeError("projectPath must be an absolute path");
	return {
		...scope === void 0 ? {} : { scope },
		...projectPath === void 0 ? {} : { projectPath }
	};
}
function asScope(value, field) {
	if (typeof value !== "string" || !MCP_SCOPES.includes(value)) throw new TypeError(`${field} must be one of ${MCP_SCOPES.map((scope) => JSON.stringify(scope)).join(", ")}`);
	return value;
}
/** POSIX absolute, Windows drive, or UNC — the spellings a Workspace root uses. */
function isAbsolutePath(path) {
	return path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path) || path.startsWith("\\\\");
}
function parseIdRequest(value) {
	const record = asRecord(value, "request payload must be an object");
	const id = asString(record.id, "id");
	validateServerId(id);
	return {
		id,
		...parseScopeTarget(record)
	};
}
function parseSetEnabledRequest(value) {
	const record = asRecord(value, "setServerEnabled payload must be an object");
	return {
		...parseIdRequest(record),
		enabled: asBoolean(record.enabled, "enabled")
	};
}
function parseReloadRequest(value) {
	const id = asString(asRecord(value, "reloadServer payload must be an object").id, "id");
	validateServerId(id);
	return { id };
}
function parseUpsertRequest(value) {
	const record = asRecord(value, "upsertServer payload must be an object");
	return {
		server: parseServerPatch(record.server),
		...parseScopeTarget(record)
	};
}
function parseStringArray(value, field) {
	if (!Array.isArray(value) || value.length > MAX_ARGUMENTS || value.some((entry) => typeof entry !== "string")) throw new TypeError(`${field} must be an array of at most ${MAX_ARGUMENTS} strings`);
	return [...value];
}
function parseSecretMap(value, field) {
	const record = asRecord(value, `${field} must be an object`);
	const result = {};
	for (const [key, entry] of Object.entries(record)) {
		if (key.trim() === "" || key.length > 256) throw new TypeError(`${field} contains an invalid key`);
		if (typeof entry === "string") {
			setOwn(result, key, entry);
			continue;
		}
		const patch = asRecord(entry, `${field}.${key} must be a string or secret patch`);
		if (patch.clear !== void 0 && typeof patch.clear !== "boolean") throw new TypeError(`${field}.${key}.clear must be a boolean`);
		if (patch.value !== void 0 && typeof patch.value !== "string") throw new TypeError(`${field}.${key}.value must be a string`);
		if (patch.clear !== true && patch.value === void 0) throw new TypeError(`${field}.${key} must set value or clear it`);
		setOwn(result, key, {
			...patch.value === void 0 ? {} : { value: patch.value },
			...patch.clear === void 0 ? {} : { clear: patch.clear }
		});
	}
	return result;
}
function parseReconnect(value) {
	const record = asRecord(value, "reconnect must be an object");
	const result = {};
	if (record.enabled !== void 0) result.enabled = asBoolean(record.enabled, "reconnect.enabled");
	for (const key of [
		"initialDelayMs",
		"maxDelayMs",
		"maxAttempts"
	]) if (record[key] !== void 0) {
		if (!Number.isSafeInteger(record[key]) || record[key] < 1) throw new TypeError(`reconnect.${key} must be a positive integer`);
		result[key] = record[key];
	}
	if (result.initialDelayMs !== void 0 && result.maxDelayMs !== void 0) validateReconnect({
		...DEFAULT_RECONNECT,
		...result
	});
	return result;
}
function parseServerPatch(value) {
	const record = asRecord(value, "server must be an object");
	const id = asString(record.id, "server.id");
	validateServerId(id);
	const result = {
		id,
		...record.scope === void 0 ? {} : { scope: asScope(record.scope, "server.scope") },
		...record.label === void 0 ? {} : { label: asString(record.label, "server.label") },
		...record.enabled === void 0 ? {} : { enabled: asBoolean(record.enabled, "server.enabled") },
		...record.transport === void 0 ? {} : { transport: transportOf(asString(record.transport, "server.transport")) },
		...record.command === void 0 ? {} : { command: asString(record.command, "server.command") },
		...record.args === void 0 ? {} : { args: parseStringArray(record.args, "server.args") },
		...record.cwd === void 0 ? {} : { cwd: asString(record.cwd, "server.cwd") },
		...record.url === void 0 ? {} : { url: asString(record.url, "server.url") },
		...record.env === void 0 ? {} : { env: parseSecretMap(record.env, "server.env") },
		...record.headers === void 0 ? {} : { headers: parseSecretMap(record.headers, "server.headers") },
		...record.envSensitive === void 0 ? {} : { envSensitive: parseSensitiveKeys(record.envSensitive, "server.envSensitive") },
		...record.headerSensitive === void 0 ? {} : { headerSensitive: parseSensitiveKeys(record.headerSensitive, "server.headerSensitive") },
		...record.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: asPositiveInteger(record.toolCallTimeoutMs, "server.toolCallTimeoutMs") },
		...record.reconnect === void 0 ? {} : { reconnect: parseReconnect(record.reconnect) }
	};
	if (result.label !== void 0 && result.label.length > MAX_LABEL_LENGTH) throw new TypeError(`server.label must be at most ${MAX_LABEL_LENGTH} characters`);
	return result;
}
function parseSensitiveKeys(value, field) {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new TypeError(`${field} must be an array of strings`);
	const seen = /* @__PURE__ */ new Set();
	for (const key of value) {
		if (key.trim() === "" || key.length > 256) throw new TypeError(`${field} contains an invalid key`);
		if (seen.has(key)) throw new TypeError(`${field} contains duplicate key ${JSON.stringify(key)}`);
		seen.add(key);
	}
	return [...value];
}
function asPositiveInteger(value, field) {
	if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
	return value;
}
function mergeSecretMap(current, patch) {
	const result = {};
	for (const [key, value] of Object.entries(current)) setOwn(result, key, value);
	if (patch === void 0) return result;
	for (const [key, input] of Object.entries(patch)) {
		if (typeof input === "string") {
			setOwn(result, key, input);
			continue;
		}
		if (input.clear === true) {
			Reflect.deleteProperty(result, key);
			continue;
		}
		if (input.value !== void 0) setOwn(result, key, input.value);
	}
	return result;
}
function setOwn(record, key, value) {
	Object.defineProperty(record, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true
	});
}
function mergeServerPatch(base, patch) {
	const current = base === void 0 ? defaultServer(patch.id) : cloneServer(base);
	const next = {
		...current,
		...patch.label === void 0 ? {} : { label: patch.label },
		...patch.enabled === void 0 ? {} : { enabled: patch.enabled },
		...patch.transport === void 0 ? {} : { transport: patch.transport },
		...patch.command === void 0 ? {} : { command: patch.command },
		...patch.args === void 0 ? {} : { args: [...patch.args] },
		...patch.cwd === void 0 ? {} : { cwd: patch.cwd },
		...patch.url === void 0 ? {} : { url: patch.url },
		...patch.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: patch.toolCallTimeoutMs },
		env: mergeSecretMap(current.env, patch.env),
		headers: mergeSecretMap(current.headers, patch.headers),
		envSensitive: mergeSensitiveKeys(current.envSensitive, patch.envSensitive),
		headerSensitive: mergeSensitiveKeys(current.headerSensitive, patch.headerSensitive),
		reconnect: {
			...current.reconnect,
			...patch.reconnect
		}
	};
	validateServerConfig(next);
	return next;
}
function cloneServer(server) {
	return {
		...server,
		args: [...server.args],
		env: { ...server.env },
		headers: { ...server.headers },
		envSensitive: [...server.envSensitive],
		headerSensitive: [...server.headerSensitive],
		reconnect: { ...server.reconnect }
	};
}
/** 敏感列表快照语义:patch 存在则整体替换,不存在则保持现状。 */
function mergeSensitiveKeys(current, patch) {
	return patch === void 0 ? [...current] : [...patch];
}
function redactServer(server, status, toolCount, error, scope = "entry", shadowed = [], templates = {
	env: [],
	headers: []
}) {
	return {
		id: server.id,
		label: server.label || server.id,
		enabled: server.enabled,
		transport: server.transport,
		command: server.command,
		args: [...server.args],
		cwd: server.cwd,
		url: server.url,
		env: redactSecrets(server.env, server.envSensitive),
		headers: redactSecrets(server.headers, server.headerSensitive),
		toolCallTimeoutMs: server.toolCallTimeoutMs || 6e4,
		reconnect: { ...server.reconnect },
		status,
		...error === void 0 ? {} : { error },
		toolCount,
		scope,
		shadowed: [...shadowed],
		templates: {
			env: [...templates.env],
			headers: [...templates.headers]
		}
	};
}
function redactSecrets(values, sensitiveKeys) {
	const sensitive = new Set(sensitiveKeys);
	return Object.fromEntries(Object.keys(values).sort().map((key) => [key, {
		set: true,
		sensitive: sensitive.has(key)
	}]));
}
function serverIdFromToolName(name, serverIds) {
	if (serverIds !== void 0) return [...serverIds].filter((id) => id.length > 0 && name.startsWith(`mcp__${id}__`)).sort((left, right) => right.length - left.length)[0];
	return /^mcp__(.+?)__(.+)$/.exec(name)?.[1];
}
function projectTool(schema, disabled, serverIds) {
	const serverId = serverIdFromToolName(schema.name, serverIds);
	if (serverId === void 0) return void 0;
	return {
		name: schema.name,
		serverId,
		description: schema.description ?? "",
		parameters: structuredClone(schema.parameters),
		enabled: !disabled.has(schema.name)
	};
}
//#endregion
//#region lib/types/host/controller.js
/** Host-side dsh 0.2 configuration, RPC, MCP lifecycle, and tool policy controller. */
/**
* One message for every attempt to write the legacy entry scope through this
* RPC. The entry is a Loader entry's own configuration, so the browser writes
* it through the shared settings form, which fences the change with the
* official revision and never restates a secret it did not receive.
*/
const ENTRY_SCOPE_REFUSED = "the entry scope is written through the settings form, not the manager RPC";
const MCP_PLUGIN = {
	name: "mcp-client",
	inject: ["tools"],
	Config: Config$1,
	apply: apply$1
};
/**
* The controller deliberately owns no browser state. Server definitions live in
* the `mcp.json` scope files; a legacy Loader-entry definition is read from the
* entry's volatile refs and written by the browser through the official shared
* settings form; the settings document is the source of truth for the per-tool
* policy. Every operation re-resolves the sources, then reconciles only the
* affected server's Cordis child Fiber.
*/
var McpManagerController = class {
	ctx;
	config;
	runtimes = /* @__PURE__ */ new Map();
	restrictions = [];
	configWatchDispose;
	configPresentationDispose;
	fileWatchDispose;
	rpcDispose;
	guardDispose;
	lifecycleQueues = new PerKeyQueue();
	suppressRestrictionEvents = false;
	disposed = false;
	/** Last resolved source set, invalidated by every write and file change. */
	sourceCache;
	/** Effective server ids from the last resolution, for the synchronous tool guard. */
	effectiveIds = [];
	/** The project root every subsequent resolution and watch uses. */
	selectedProjectPath;
	/** The project root the installed file watch was resolved against. */
	watchedProjectPath;
	/**
	* @param ctx - the Host plugin context.
	* @param config - the entry's resolved volatile refs; every read goes through
	* them, so a committed entry edit is visible to the next operation.
	*/
	constructor(ctx, config) {
		this.ctx = ctx;
		this.config = config;
	}
	/** Register the RPC channel, tool guard, configuration watch, and servers. */
	async start() {
		validateStoredDocument(this.document());
		this.configWatchDispose = this.ctx.on("loader/volatile-update", (paths) => {
			if (this.disposed || !paths.some((path) => path[0] === "servers" || path[0] === "disabledTools")) return;
			this.reloadSources().catch((error) => {
				this.ctx.logger.warn(`web-mcp-manager: configuration change reconciliation failed: ${String(error)}`);
			});
		});
		if (typeof this.ctx.settings.configure === "function") this.configPresentationDispose = this.ctx.settings.configure({ auto: false });
		this.guardDispose = this.ctx.tools.guard((execution) => {
			const serverId = serverIdFromToolName(execution.name, this.effectiveIds);
			if (serverId === void 0) return void 0;
			return new Set(this.document().disabledTools[serverId] ?? []).has(execution.name) ? "MCP tool is disabled in the Web MCP panel" : void 0;
		});
		this.rpcDispose = registerManagerRpcRoute(this.ctx, (endpoint, payload, signal) => this.handle(endpoint, payload, signal));
		this.ctx.on("tools/change", () => {
			if (this.disposed || this.suppressRestrictionEvents) return;
			this.refreshRestrictions();
		});
		this.ctx.on("agent/created", ({ agent }) => {
			this.installRestriction(agent);
		});
		this.ctx.on("agent/disposed", ({ agent }) => {
			this.removeRestriction(agent);
		});
		for (const agent of this.ctx.get("agents")?.list?.() ?? []) this.installRestriction(agent);
		await this.reconcileAll();
	}
	/** Dispose RPC, tool policy, file watch, and all child MCP clients after operations drain. */
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.configWatchDispose?.();
		this.configWatchDispose = void 0;
		this.configPresentationDispose?.();
		this.configPresentationDispose = void 0;
		this.fileWatchDispose?.();
		this.fileWatchDispose = void 0;
		await this.lifecycleQueues.drain();
		for (const runtime of this.runtimes.values()) await this.disposeRuntime(runtime);
		this.runtimes.clear();
		for (const restriction of this.restrictions.splice(0)) restriction.dispose();
		this.guardDispose?.();
		this.guardDispose = void 0;
		if (this.rpcDispose !== void 0) await this.rpcDispose();
		this.rpcDispose = void 0;
	}
	/** Dispatch one authenticated Connection RPC endpoint. */
	async handle(endpoint, payload, signal) {
		if (this.disposed) return failure("aborted", "MCP manager is disposed");
		if (signal.aborted) return failure("aborted", "operation was cancelled");
		try {
			switch (endpoint) {
				case "snapshot": return success(await this.snapshot(parseSnapshotRequest(payload)));
				case "upsertServer": return success(await this.upsert(parseUpsertRequest(payload)));
				case "removeServer": return success(await this.remove(parseIdRequest(payload)));
				case "setServerEnabled": return success(await this.setEnabled(parseSetEnabledRequest(payload)));
				case "reloadServer": return success(await this.reload(parseReloadRequest(payload)));
				default: return failure("bad-request", `unknown MCP manager endpoint ${JSON.stringify(endpoint)}`);
			}
		} catch (error) {
			return failure(classifyError(error), error instanceof Error ? error.message : String(error));
		}
	}
	/** The live entry document, read through the volatile refs on every call. */
	document() {
		return structuredClone({
			servers: this.config.servers.get() ?? {},
			disabledTools: this.config.disabledTools.get() ?? {}
		});
	}
	/** The active profile directory, as the settings provider reports it. */
	profileDir() {
		const path = this.ctx.settings.documentPath;
		return typeof path === "string" && path !== "" ? dirname(path) : void 0;
	}
	/** Registered workspaces the panel may root the project scope at. */
	workspaces() {
		const registry = this.ctx.get("workspaceRegistry");
		try {
			return (registry?.list?.() ?? []).map((workspace) => ({
				id: String(workspace.id),
				path: workspace.path,
				title: workspace.title
			}));
		} catch {
			return [];
		}
	}
	/**
	* Validate the project root the caller selected.
	*
	* The project scope writes a file, so an unvalidated path would turn the RPC
	* into arbitrary file creation. Only a canonical path the workspace registry
	* already owns is accepted.
	*/
	projectDir(target) {
		if (target.projectPath === void 0) return this.selectedProjectPath;
		const match = this.workspaces().find((workspace) => workspace.path === target.projectPath);
		if (match === void 0) throw new Error(`project path ${JSON.stringify(target.projectPath)} is not a registered workspace`);
		return match.path;
	}
	scopeFiles(projectDir) {
		return resolveScopeFiles({
			profileDir: this.profileDir(),
			projectDir
		});
	}
	/** Resolve (and memoize) the merged source view for one scope selection. */
	async sourcesFor(target) {
		const projectDir = this.projectDir(target);
		this.selectedProjectPath = projectDir;
		await this.ensureWatch(projectDir);
		const key = projectDir ?? "";
		if (this.sourceCache?.key === key) return this.sourceCache.value;
		const value = mergeSources({
			scopes: await readScopeFiles(this.scopeFiles(projectDir)),
			entryServers: this.document().servers,
			entryPath: `${this.profileDir() === void 0 ? "cordis.yml" : join(this.profileDir(), "cordis.patch.yml")} · web-mcp-manager`
		});
		this.sourceCache = {
			key,
			value
		};
		this.effectiveIds = value.servers.map((server) => server.id);
		return value;
	}
	/** Drop the memoized sources and reconcile everything against the new state. */
	async reloadSources() {
		this.sourceCache = void 0;
		await this.reconcileAll();
		this.refreshRestrictions();
	}
	/** Install the scope-file watch for the selected project root, once per root. */
	async ensureWatch(projectDir) {
		if (this.disposed) return;
		if (this.fileWatchDispose !== void 0 && this.watchedProjectPath === projectDir) return;
		this.fileWatchDispose?.();
		this.fileWatchDispose = void 0;
		this.watchedProjectPath = projectDir;
		try {
			this.fileWatchDispose = await watchScopeFiles(this.scopeFiles(projectDir), () => {
				this.reloadSources().catch((error) => {
					this.ctx.logger.warn(`web-mcp-manager: mcp.json refresh failed: ${String(error)}`);
				});
			});
		} catch (error) {
			this.ctx.logger.warn(`web-mcp-manager: could not watch mcp.json sources: ${String(error)}`);
		}
	}
	/** The scope file a write targets, or `undefined` for the legacy entry scope. */
	scopeFile(scope, projectDir) {
		return this.scopeFiles(projectDir).find((file) => file.scope === scope);
	}
	/**
	* Decide where one write lands.
	*
	* An explicit selection wins and must exist; otherwise a defined server keeps
	* its winning scope and a new server goes to the profile scope, which is
	* private to this profile and always writable. A deployment without a profile
	* directory (or without that scope) degrades to the user scope rather than
	* failing the write.
	*
	* The entry scope is never a destination here: it is not a file but the
	* Loader entry's own configuration, whose only writer is the official shared
	* settings form the browser drives. A request that names it — or that would
	* inherit it from a legacy definition — is refused rather than answered with
	* a second, unfenced write path.
	*/
	writeScope(target, existing, requested) {
		const projectDir = this.projectDir(target);
		const available = (scope) => scope !== "entry" && this.scopeFile(scope, projectDir) !== void 0;
		const explicit = requested ?? target.scope;
		if (explicit === "entry") throw new TypeError(ENTRY_SCOPE_REFUSED);
		if (explicit === void 0 && existing?.scope === "entry") throw new TypeError(ENTRY_SCOPE_REFUSED);
		const preferred = explicit ?? existing?.scope ?? "profile";
		if (available(preferred)) return preferred;
		if (explicit !== void 0) throw new Error(`the ${JSON.stringify(explicit)} scope is not available in this profile`);
		for (const fallback of ["profile", "user"]) if (available(fallback)) return fallback;
		throw new Error("no writable MCP scope is available in this profile");
	}
	/** Write one server definition into a non-entry scope file. */
	async writeScopedServer(scope, projectDir, id, server) {
		const file = this.scopeFile(scope, projectDir);
		if (file === void 0) throw new Error(`the ${JSON.stringify(scope)} scope is not available in this profile`);
		await mutateScopeFile(file.path, (document) => withServer(document, id, server));
		this.sourceCache = void 0;
	}
	async upsert(request) {
		const existing = (await this.sourcesFor(request)).servers.find((server) => server.id === request.server.id);
		const scope = this.writeScope(request, existing, request.server.scope);
		const nextServer = mergeServerPatch(existing?.server, request.server);
		this.assertToolNamespaceAvailable(nextServer.id, existing !== void 0);
		await this.writeScopedServer(scope, this.projectDir(request), nextServer.id, nextServer);
		this.reconcileServer(nextServer.id);
		return this.snapshot({ projectPath: request.projectPath });
	}
	async remove(request) {
		const existing = (await this.sourcesFor(request)).servers.find((server) => server.id === request.id);
		if (existing === void 0) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
		const scope = this.writeScope(request, existing);
		await this.writeScopedServer(scope, this.projectDir(request), request.id, null);
		this.reconcileServer(request.id);
		return this.snapshot({ projectPath: request.projectPath });
	}
	async setEnabled(request) {
		const existing = (await this.sourcesFor(request)).servers.find((server) => server.id === request.id);
		if (existing === void 0) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
		const scope = this.writeScope(request, existing);
		const nextServer = {
			...existing.server,
			enabled: request.enabled
		};
		await this.writeScopedServer(scope, this.projectDir(request), request.id, nextServer);
		this.reconcileServer(request.id);
		return this.snapshot({ projectPath: request.projectPath });
	}
	async reload(request) {
		if (!(await this.sourcesFor({})).servers.some((server) => server.id === request.id)) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
		await this.reconcileServer(request.id, true);
		return this.snapshot({});
	}
	async reconcileAll() {
		const merged = await this.sourcesFor({});
		const ids = new Set(merged.servers.map((server) => server.id));
		await Promise.all([...ids].map((id) => this.reconcileServer(id)));
		for (const id of this.runtimes.keys()) if (!ids.has(id)) await this.reconcileServer(id);
		this.refreshRestrictions();
	}
	/** Serialize one server's lifecycle operations, including reload/dispose, per server id. */
	reconcileServer(id, force = false) {
		return this.lifecycleQueues.enqueue(id, async () => {
			if (this.disposed) return;
			const config = (await this.sourcesFor({})).servers.find((candidate) => candidate.id === id)?.server;
			let runtime = this.runtimes.get(id);
			if (runtime === void 0) {
				runtime = {
					id,
					fingerprint: "",
					status: "waiting"
				};
				this.runtimes.set(id, runtime);
			}
			const fingerprint = config === void 0 ? "" : stableFingerprint(config);
			if (config === void 0 || !config.enabled) {
				await this.disposeRuntime(runtime);
				runtime.status = config === void 0 ? "waiting" : "disabled";
				runtime.error = void 0;
				runtime.fingerprint = fingerprint;
				if (config === void 0) this.runtimes.delete(id);
				return;
			}
			if (!force && runtime.fiber !== void 0 && runtime.fingerprint === fingerprint) return;
			await this.disposeRuntime(runtime);
			runtime.status = "loading";
			runtime.error = void 0;
			runtime.fingerprint = fingerprint;
			let fiber;
			try {
				const expanded = expandServer(config, process.env);
				if (expanded.missing.length > 0) throw new Error(`missing environment ${expanded.missing.length === 1 ? "variable" : "variables"}: ${expanded.missing.join(", ")}`);
				fiber = this.ctx.plugin(MCP_PLUGIN, toMcpConfig(expanded.server));
				runtime.fiber = fiber;
				await withTimeout(fiber.await(), START_TIMEOUT_MS, `MCP server ${id} startup timed out after ${START_TIMEOUT_MS}ms`);
				if (runtime.fiber === fiber) runtime.status = "loaded";
			} catch (error) {
				if (runtime.fiber !== fiber) return;
				const message = error instanceof Error ? error.message : String(error);
				runtime.status = "failed";
				runtime.error = message;
				if (!message.includes("timed out")) runtime.fiber = void 0;
			}
			this.refreshRestrictions();
		});
	}
	async disposeRuntime(runtime) {
		const fiber = runtime.fiber;
		runtime.fiber = void 0;
		if (fiber === void 0) return;
		try {
			await withTimeout(fiber.dispose(), DISPOSE_TIMEOUT_MS, `failed to dispose server ${runtime.id} within ${DISPOSE_TIMEOUT_MS}ms`);
		} catch (error) {
			this.ctx.logger.warn(`web-mcp-manager: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	async snapshot(request) {
		const merged = await this.sourcesFor(request);
		const schemas = this.readToolSchemas();
		const tools = this.projectTools(schemas, merged);
		const byServer = /* @__PURE__ */ new Map();
		for (const tool of tools) byServer.set(tool.serverId, (byServer.get(tool.serverId) ?? 0) + 1);
		const servers = [...merged.servers].sort((a, b) => a.id.localeCompare(b.id)).map((source) => {
			const runtime = this.runtimes.get(source.id);
			const error = runtime?.error === void 0 ? void 0 : redactRuntimeError(runtime.error, source.server);
			return redactServer(source.server, source.server.enabled ? runtime?.status ?? "waiting" : "disabled", byServer.get(source.id) ?? 0, error, source.scope, source.shadowed.map((entry) => entry.scope), serverTemplates(source.server));
		});
		const projectPath = this.selectedProjectPath;
		return {
			writable: this.ctx.settings.writable,
			servers,
			tools,
			readonlyEntries: await this.readonlyEntries(),
			sources: merged.sources,
			workspaces: this.workspaces(),
			...projectPath === void 0 ? {} : { projectPath }
		};
	}
	readToolSchemas() {
		try {
			return this.ctx.tools.schemas();
		} catch (error) {
			this.ctx.logger.warn(`web-mcp-manager: failed to read tool schemas: ${String(error)}`);
			return [];
		}
	}
	projectTools(schemas, merged) {
		const disabled = new Set(Object.values(this.document().disabledTools).flat());
		const serverIds = merged.servers.map((server) => server.id);
		return schemas.map((schema) => projectTool(schema, disabled, serverIds)).filter((tool) => tool !== void 0 && serverIds.includes(tool.serverId)).sort((a, b) => a.name.localeCompare(b.name));
	}
	async readonlyEntries() {
		const inventory = this.ctx.get("pluginInventory");
		if (inventory?.list === void 0) return [];
		try {
			const value = await inventory.list();
			const loaderEntries = value.entries.filter((entry) => entry.moduleName !== "@junjiangao/dsh-web-mcp-manager" && entry.moduleName !== "dsh-web-mcp-manager" && entry.moduleName.toLocaleLowerCase().includes("mcp")).map((entry) => ({
				...entry,
				source: "loader"
			}));
			const presetEntries = [];
			for (const preset of value.agentPresets ?? []) for (const [index, entry] of preset.rows.entries()) {
				if (!entry.moduleName.toLocaleLowerCase().includes("mcp")) continue;
				presetEntries.push({
					entryId: `preset:${preset.id}:${entry.entryId ?? String(index)}`,
					moduleName: entry.moduleName,
					source: "preset",
					sourceId: preset.id,
					...preset.name === void 0 ? {} : { sourceName: preset.name },
					enabled: entry.enabled,
					...entry.condition === void 0 ? {} : { condition: entry.condition },
					fiberPhase: entry.fiberPhase
				});
			}
			return [...loaderEntries, ...presetEntries];
		} catch {
			return [];
		}
	}
	assertToolNamespaceAvailable(serverId, editingExisting) {
		if (editingExisting) return;
		if (this.readToolSchemas().some((schema) => serverIdFromToolName(schema.name, [serverId]) === serverId)) throw new Error(`MCP server id ${JSON.stringify(serverId)} is already used by a loaded MCP tool`);
	}
	installRestriction(agent) {
		if (this.restrictions.some((entry) => entry.agent === agent)) return;
		const tools = agent.ctx.tools;
		if (tools === void 0) return;
		const names = this.disabledToolNames().filter((name) => this.ctx.tools.get(name, agent) !== void 0);
		if (names.length === 0) return;
		const previousSuppression = this.suppressRestrictionEvents;
		this.suppressRestrictionEvents = true;
		try {
			const dispose = tools.restrict({ deny: names });
			this.restrictions.push({
				agent,
				dispose
			});
		} catch (error) {
			this.ctx.logger.warn(`web-mcp-manager: could not install restrictions for agent ${String(agent.id)}: ${String(error)}`);
		} finally {
			this.suppressRestrictionEvents = previousSuppression;
		}
	}
	removeRestriction(agent) {
		for (let index = this.restrictions.length - 1; index >= 0; index--) {
			const entry = this.restrictions[index];
			if (entry?.agent !== agent) continue;
			const previousSuppression = this.suppressRestrictionEvents;
			this.suppressRestrictionEvents = true;
			try {
				entry.dispose();
			} finally {
				this.suppressRestrictionEvents = previousSuppression;
			}
			this.restrictions.splice(index, 1);
		}
	}
	refreshRestrictions() {
		if (this.disposed || this.suppressRestrictionEvents) return;
		const previousSuppression = this.suppressRestrictionEvents;
		this.suppressRestrictionEvents = true;
		try {
			const agents = this.ctx.get("agents")?.list?.() ?? [];
			for (const restriction of this.restrictions.splice(0)) restriction.dispose();
			for (const agent of agents) this.installRestriction(agent);
		} finally {
			this.suppressRestrictionEvents = previousSuppression;
		}
	}
	disabledToolNames() {
		return [...new Set(Object.values(this.document().disabledTools).flat())];
	}
};
/** 启动等待上限,防止挂起的连接永久拖住该服务的后续生命周期操作。 */
const START_TIMEOUT_MS = 3e4;
/** 卸载上限,防止子进程清理异常阻塞插件卸载。 */
const DISPOSE_TIMEOUT_MS = 15e3;
/**
* Bound one Cordis fiber promise.
*
* `@deepseek-ai/dsh-timeout` owns timeout arithmetic in the shipped Host, but its
* primitives (`deadline`, `idleWatchdog`, `timeoutOf`) only NOTIFY through an
* AbortSignal and require the awaited work to observe that signal.
* `fiber.await()` and `fiber.dispose()` accept no signal, so the manager needs
* the promise-shaped bound below and turns its own message into the server's
* failure state.
*/
function withTimeout(promise, ms, message) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		promise.then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
function stableFingerprint(value) {
	return JSON.stringify(sortValue(value));
}
function redactRuntimeError(error, server) {
	let result = error;
	for (const secret of [...Object.values(server.env), ...Object.values(server.headers)]) if (secret.length > 0) result = result.split(secret).join("[redacted]");
	return result;
}
function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function success(value) {
	return {
		ok: true,
		value
	};
}
function failure(code, message) {
	return {
		ok: false,
		error: {
			code,
			message
		}
	};
}
function classifyError(error) {
	if (error?.code === "MCP_CONFIG_VALIDATION") return "validation";
	if (error instanceof TypeError) return "bad-request";
	if (typeof error === "object" && error !== null && "message" in error && String(error.message).includes("read-only")) return "not-writable";
	if (typeof error === "object" && error !== null && "message" in error && /not found|not registered/u.test(String(error.message))) return "not-found";
	if (error instanceof Error && /needs a command|invalid URL|must be|unsupported MCP transport|contains an empty|already used by|invalid JSON|is not a registered workspace|missing environment/u.test(error.message)) return "validation";
	return "internal";
}
//#endregion
//#region lib/types/host/index.js
/** Host entry for the Web MCP manager plugin. */
const name = "@junjiangao/dsh-web-mcp-manager";
/**
* `connection` is a hard dependency: the manager registers one exact Fetch
* route per endpoint through `ctx.connection.fetch.register()`, which rides the
* Connection service's own authenticated `/api` route (see `./rpc-channel.ts`).
* The physical carrier applies the Host/Origin fence and browser
* authentication, so this plugin needs no `webServer` injection and owns no
* HTTP route — `connection.rpc.handle()` remains unusable because it resolves
* `owner.webServer` from the Connection service's fiber rather than the
* caller's, and `connection.rpc.intercept('/api', …)` is owned by
* `@deepseek-ai/dsh-api-gateway`.
*/
const inject = [
	"settings",
	"connection",
	"tools"
];
/**
* Start the controller on the Host Cordis fiber.
* @param ctx - the Host plugin context.
* @param config - the entry's resolved volatile refs.
*/
async function apply(ctx, config) {
	const controller = new McpManagerController(ctx, config);
	try {
		await controller.start();
	} catch (error) {
		await controller.dispose();
		throw error;
	}
	ctx.effect(() => async () => {
		await controller.dispose();
	}, "web-mcp-manager: dispose");
}
//#endregion
export { Config, DEFAULT_RECONNECT, DEFAULT_TOOL_CALL_TIMEOUT_MS, LEGACY_PLUGIN_MODULE_NAME, MANAGER_NAMESPACE, MCP_MANAGER_API_CHANNEL, MCP_MANAGER_ENDPOINTS, MCP_MANAGER_ENDPOINT_PREFIX, MCP_MANAGER_NAMESPACE, MCP_SCOPES, ManagerSettingsSchema, McpManagerController, PLUGIN_IDENTITY, PLUGIN_MODULE_NAME, apply, defaultDocument, defaultServer, inject, isRpcResult, isTemplatedValue, mcpManagerRoutePath, name, transportOf, validateReconnect, validateServerConfig, validateServerId, validateStoredDocument };

//# sourceMappingURL=index.js.map