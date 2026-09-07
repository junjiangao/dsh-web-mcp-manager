import z from "@deepseek-ai/schemastery";
import { Config, apply as apply$1 } from "@deepseek-ai/dsh-mcp-client";
//#region lib/types/types.js
/** Shared JSON-safe contracts for the Host RPC and the browser panel. */
const MCP_MANAGER_CHANNEL = "/mcp-manager";
const MCP_MANAGER_SETTINGS_NAMESPACE = "web-mcp-manager";
function isRpcResult(value) {
	if (typeof value !== "object" || value === null) return false;
	const record = value;
	if (record.ok === true) return "value" in record;
	if (record.ok !== false || typeof record.error !== "object" || record.error === null) return false;
	const error = record.error;
	return typeof error.code === "string" && typeof error.message === "string";
}
//#endregion
//#region lib/types/settings.js
/** Host settings schema and defaults for the MCP manager namespace. */
const MANAGER_NAMESPACE = "web-mcp-manager";
const DEFAULT_RECONNECT = Object.freeze({
	enabled: true,
	initialDelayMs: 500,
	maxDelayMs: 3e4,
	maxAttempts: 10
});
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 6e4;
const MAX_TIMER_DELAY_MS = 2147483647;
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
	toolCallTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
	reconnect: ReconnectSchema
});
const ManagerSettingsSchema = z.object({
	servers: z.dict(ServerSchema).default({}),
	disabledTools: z.dict(z.array(z.string())).default({})
});
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
	if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new TypeError("server id must match [A-Za-z0-9_-]{1,32}");
}
function validateServerConfig(server) {
	validateServerId(server.id);
	if (server.label.length > 120) throw new Error("server label must be at most 120 characters");
	if (server.transport === "stdio") {
		if (server.command.trim() === "") throw new Error(`stdio server ${JSON.stringify(server.id)} needs a command`);
	} else {
		if (server.url.trim() === "") throw new Error(`streamable-http server ${JSON.stringify(server.id)} needs a URL`);
		let url;
		try {
			url = new URL(server.url);
		} catch {
			throw new Error(`streamable-http server ${JSON.stringify(server.id)} has an invalid URL`);
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`streamable-http server ${JSON.stringify(server.id)} URL must use http or https`);
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
function asRevision(value, field = "expectedRevision") {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
	return value;
}
function parseSnapshotRequest(value) {
	const record = asRecord(value ?? {}, "snapshot payload must be an object");
	if (record.expectedRevision === void 0) return {};
	return { expectedRevision: asRevision(record.expectedRevision) };
}
function parseIdRequest(value) {
	const record = asRecord(value, "request payload must be an object");
	const id = asString(record.id, "id");
	validateServerId(id);
	return {
		id,
		...record.expectedRevision === void 0 ? {} : { expectedRevision: asRevision(record.expectedRevision) }
	};
}
function parseSetEnabledRequest(value) {
	const record = asRecord(value, "setServerEnabled payload must be an object");
	const base = parseIdRequest(record);
	if (base.expectedRevision === void 0) throw new TypeError("expectedRevision is required");
	return {
		id: base.id,
		enabled: asBoolean(record.enabled, "enabled"),
		expectedRevision: base.expectedRevision
	};
}
function parseReloadRequest(value) {
	const id = asString(asRecord(value, "reloadServer payload must be an object").id, "id");
	validateServerId(id);
	return { id };
}
function parseUpsertRequest(value) {
	const record = asRecord(value, "upsertServer payload must be an object");
	const expectedRevision = asRevision(record.expectedRevision);
	return {
		server: parseServerPatch(record.server),
		expectedRevision
	};
}
function parseToolRequest(value) {
	const record = asRecord(value, "setToolEnabled payload must be an object");
	const serverId = asString(record.serverId, "serverId");
	validateServerId(serverId);
	const name = asString(record.name, "name");
	if (name.length === 0 || name.length > 128) throw new TypeError("name must be 1 to 128 characters");
	return {
		serverId,
		name,
		enabled: asBoolean(record.enabled, "enabled"),
		expectedRevision: asRevision(record.expectedRevision)
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
		...record.label === void 0 ? {} : { label: asString(record.label, "server.label") },
		...record.enabled === void 0 ? {} : { enabled: asBoolean(record.enabled, "server.enabled") },
		...record.transport === void 0 ? {} : { transport: transportOf(asString(record.transport, "server.transport")) },
		...record.command === void 0 ? {} : { command: asString(record.command, "server.command") },
		...record.args === void 0 ? {} : { args: parseStringArray(record.args, "server.args") },
		...record.cwd === void 0 ? {} : { cwd: asString(record.cwd, "server.cwd") },
		...record.url === void 0 ? {} : { url: asString(record.url, "server.url") },
		...record.env === void 0 ? {} : { env: parseSecretMap(record.env, "server.env") },
		...record.headers === void 0 ? {} : { headers: parseSecretMap(record.headers, "server.headers") },
		...record.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: asPositiveInteger(record.toolCallTimeoutMs, "server.toolCallTimeoutMs") },
		...record.reconnect === void 0 ? {} : { reconnect: parseReconnect(record.reconnect) }
	};
	if (result.label !== void 0 && result.label.length > MAX_LABEL_LENGTH) throw new TypeError(`server.label must be at most ${MAX_LABEL_LENGTH} characters`);
	return result;
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
function mergeServerPatch(current, patch) {
	const base = current === void 0 ? defaultServer(patch.id) : cloneServer(current);
	const next = {
		...base,
		...patch.label === void 0 ? {} : { label: patch.label },
		...patch.enabled === void 0 ? {} : { enabled: patch.enabled },
		...patch.transport === void 0 ? {} : { transport: patch.transport },
		...patch.command === void 0 ? {} : { command: patch.command },
		...patch.args === void 0 ? {} : { args: [...patch.args] },
		...patch.cwd === void 0 ? {} : { cwd: patch.cwd },
		...patch.url === void 0 ? {} : { url: patch.url },
		...patch.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: patch.toolCallTimeoutMs },
		env: mergeSecretMap(base.env, patch.env),
		headers: mergeSecretMap(base.headers, patch.headers),
		reconnect: {
			...base.reconnect,
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
		reconnect: { ...server.reconnect }
	};
}
function redactServer(server, status, toolCount, error) {
	return {
		id: server.id,
		label: server.label || server.id,
		enabled: server.enabled,
		transport: server.transport,
		command: server.command,
		args: [...server.args],
		cwd: server.cwd,
		url: server.url,
		env: Object.fromEntries(Object.keys(server.env).sort().map((key) => [key, { set: true }])),
		headers: Object.fromEntries(Object.keys(server.headers).sort().map((key) => [key, { set: true }])),
		toolCallTimeoutMs: server.toolCallTimeoutMs || 6e4,
		reconnect: { ...server.reconnect },
		status,
		...error === void 0 ? {} : { error },
		toolCount
	};
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
/** Host-side settings, RPC, MCP lifecycle, and tool policy controller. */
const MCP_PLUGIN = {
	name: "mcp-client",
	inject: ["tools"],
	Config,
	apply: apply$1
};
/**
* The controller deliberately owns no browser state. The settings provider is
* the source of truth; every operation re-reads its revision before writing,
* then reconciles only the affected server's Cordis child Fiber.
*/
var McpManagerController = class {
	ctx;
	runtimes = /* @__PURE__ */ new Map();
	restrictions = [];
	scope;
	settingsWatchDispose;
	rpcDispose;
	guardDispose;
	mutationTail = Promise.resolve();
	lifecycleTail = Promise.resolve();
	suppressRestrictionEvents = false;
	disposed = false;
	constructor(ctx) {
		this.ctx = ctx;
	}
	/** Register the settings namespace, RPC channel, guard, and initial servers. */
	async start() {
		this.scope = this.ctx.settings.register(MANAGER_NAMESPACE, ManagerSettingsSchema, {
			base: defaultDocument(),
			validate: validateStoredDocument
		});
		this.settingsWatchDispose = this.scope.watch(() => {
			if (this.disposed) return;
			return this.reconcileAll().catch((error) => {
				this.ctx.logger.warn(`web-mcp-manager: settings change reconciliation failed: ${String(error)}`);
			});
		});
		this.guardDispose = this.ctx.tools.guard((execution) => {
			const serverId = serverIdFromToolName(execution.name, Object.keys(this.document().servers));
			if (serverId === void 0) return void 0;
			return new Set(this.document().disabledTools[serverId] ?? []).has(execution.name) ? "MCP tool is disabled in the Web MCP panel" : void 0;
		});
		this.rpcDispose = this.ctx.connection.rpc.handle(MCP_MANAGER_CHANNEL, async (endpoint, payload, signal) => {
			const result = await this.handle(endpoint, payload, signal);
			return result.ok ? result : {
				ok: false,
				error: {
					...result.error,
					details: result.error.details ?? {}
				}
			};
		});
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
	/** Dispose RPC, tool policy, and all child MCP clients after operations drain. */
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.settingsWatchDispose?.();
		this.settingsWatchDispose = void 0;
		await this.lifecycleTail.catch(() => {});
		await this.mutationTail.catch(() => {});
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
				case "setToolEnabled": return success(await this.setTool(parseToolRequest(payload)));
				default: return failure("bad-request", `unknown MCP manager endpoint ${JSON.stringify(endpoint)}`);
			}
		} catch (error) {
			return failure(classifyError(error), error instanceof Error ? error.message : String(error));
		}
	}
	document() {
		const scope = this.scope;
		if (scope === void 0) return defaultDocument();
		return scope.get();
	}
	revision() {
		return this.ctx.settings.describe({ redactSecrets: false }).find((entry) => String(entry.ns) === String("web-mcp-manager"))?.revision ?? 0;
	}
	enqueueMutation(operation) {
		const task = this.mutationTail.then(operation);
		this.mutationTail = task.then(() => void 0, () => void 0);
		return task;
	}
	async upsert(request) {
		return this.enqueueMutation(async () => {
			this.assertRevision(request.expectedRevision);
			const current = this.document();
			const nextServer = mergeServerPatch(current.servers[request.server.id], request.server);
			this.assertToolNamespaceAvailable(nextServer.id, current.servers[nextServer.id] !== void 0);
			const next = {
				servers: {
					...current.servers,
					[nextServer.id]: nextServer
				},
				disabledTools: { ...current.disabledTools }
			};
			await this.write(next, request.expectedRevision);
			await this.reconcileServer(nextServer.id);
			return this.snapshot({});
		});
	}
	async remove(request) {
		if (request.expectedRevision === void 0) throw new TypeError("expectedRevision is required");
		return this.enqueueMutation(async () => {
			this.assertRevision(request.expectedRevision);
			const current = this.document();
			if (current.servers[request.id] === void 0) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
			const servers = { ...current.servers };
			Reflect.deleteProperty(servers, request.id);
			const disabledTools = { ...current.disabledTools };
			Reflect.deleteProperty(disabledTools, request.id);
			await this.write({
				servers,
				disabledTools
			}, request.expectedRevision);
			await this.reconcileServer(request.id);
			return this.snapshot({});
		});
	}
	async setEnabled(request) {
		return this.enqueueMutation(async () => {
			this.assertRevision(request.expectedRevision);
			const current = this.document();
			const server = current.servers[request.id];
			if (server === void 0) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
			const nextServer = {
				...server,
				enabled: request.enabled
			};
			await this.write({
				servers: {
					...current.servers,
					[request.id]: nextServer
				},
				disabledTools: { ...current.disabledTools }
			}, request.expectedRevision);
			await this.reconcileServer(request.id);
			return this.snapshot({});
		});
	}
	async reload(request) {
		if (this.document().servers[request.id] === void 0) throw new Error(`MCP server ${JSON.stringify(request.id)} was not found`);
		await this.reconcileServer(request.id, true);
		return this.snapshot({});
	}
	async setTool(request) {
		return this.enqueueMutation(async () => {
			this.assertRevision(request.expectedRevision);
			const current = this.document();
			if (current.servers[request.serverId] === void 0) throw new Error(`tool ${JSON.stringify(request.name)} is not registered by server ${JSON.stringify(request.serverId)}`);
			const tool = (await this.snapshot({})).tools.find((candidate) => candidate.name === request.name);
			if (tool === void 0 || tool.serverId !== request.serverId) throw new Error(`tool ${JSON.stringify(request.name)} is not registered by server ${JSON.stringify(request.serverId)}`);
			const disabled = new Set(current.disabledTools[request.serverId] ?? []);
			if (request.enabled) disabled.delete(request.name);
			else disabled.add(request.name);
			const disabledTools = { ...current.disabledTools };
			if (disabled.size === 0) Reflect.deleteProperty(disabledTools, request.serverId);
			else disabledTools[request.serverId] = [...disabled].sort();
			await this.write({
				servers: { ...current.servers },
				disabledTools
			}, request.expectedRevision);
			this.refreshRestrictions();
			return this.snapshot({});
		});
	}
	async write(next, expectedRevision) {
		if (!this.ctx.settings.writable) throw new Error("settings provider is read-only");
		validateStoredDocument(next);
		await this.ctx.settings.replace(MANAGER_NAMESPACE, next, expectedRevision);
	}
	assertRevision(expected) {
		const actual = this.revision();
		if (actual !== expected) {
			const error = /* @__PURE__ */ new Error(`MCP settings changed since this page was read (expected revision ${String(expected)}, now ${String(actual)})`);
			Object.assign(error, { code: "SETTINGS_CONFLICT" });
			throw error;
		}
	}
	async reconcileAll() {
		const ids = new Set(Object.keys(this.document().servers));
		await Promise.all([...ids].map((id) => this.reconcileServer(id)));
		for (const id of this.runtimes.keys()) if (!ids.has(id)) await this.reconcileServer(id);
		this.refreshRestrictions();
	}
	/** Serialize one server's lifecycle operations, including reload/dispose. */
	reconcileServer(id, force = false) {
		const task = this.lifecycleTail.then(async () => {
			if (this.disposed) return;
			const config = this.document().servers[id];
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
			try {
				const fiber = this.ctx.plugin(MCP_PLUGIN, toMcpConfig(config));
				runtime.fiber = fiber;
				await fiber.await();
				runtime.status = "loaded";
			} catch (error) {
				runtime.status = "failed";
				runtime.error = error instanceof Error ? error.message : String(error);
				runtime.fiber = void 0;
			}
			this.refreshRestrictions();
		});
		this.lifecycleTail = task.catch(() => {});
		return task;
	}
	async disposeRuntime(runtime) {
		const fiber = runtime.fiber;
		runtime.fiber = void 0;
		if (fiber === void 0) return;
		try {
			await fiber.dispose();
		} catch (error) {
			this.ctx.logger.warn(`web-mcp-manager: failed to dispose server ${runtime.id}: ${String(error)}`);
		}
	}
	async snapshot(_request) {
		const document = this.document();
		const schemas = this.readToolSchemas();
		const tools = this.projectTools(schemas, document);
		const byServer = /* @__PURE__ */ new Map();
		for (const tool of tools) byServer.set(tool.serverId, (byServer.get(tool.serverId) ?? 0) + 1);
		const servers = Object.values(document.servers).sort((a, b) => a.id.localeCompare(b.id)).map((server) => {
			const runtime = this.runtimes.get(server.id);
			const error = runtime?.error === void 0 ? void 0 : redactRuntimeError(runtime.error, server);
			return redactServer(server, server.enabled ? runtime?.status ?? "waiting" : "disabled", byServer.get(server.id) ?? 0, error);
		});
		return {
			revision: this.revision(),
			writable: this.ctx.settings.writable,
			servers,
			tools,
			readonlyEntries: await this.readonlyEntries()
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
	projectTools(schemas, document) {
		const disabled = new Set(Object.values(document.disabledTools).flat());
		const serverIds = Object.keys(document.servers);
		return schemas.map((schema) => projectTool(schema, disabled, serverIds)).filter((tool) => tool !== void 0 && document.servers[tool.serverId] !== void 0).sort((a, b) => a.name.localeCompare(b.name));
	}
	async readonlyEntries() {
		const inventory = this.ctx.get("pluginInventory");
		if (inventory?.list === void 0) return [];
		try {
			const value = await inventory.list();
			const loaderEntries = value.entries.filter((entry) => entry.moduleName !== "dsh-web-mcp-manager" && entry.moduleName.toLocaleLowerCase().includes("mcp")).map((entry) => ({
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
	if (error?.code === "SETTINGS_CONFLICT") return "conflict";
	if (error instanceof TypeError) return "bad-request";
	if (typeof error === "object" && error !== null && "message" in error && String(error.message).includes("read-only")) return "not-writable";
	if (typeof error === "object" && error !== null && "message" in error && /not found|not registered/u.test(String(error.message))) return "not-found";
	if (error instanceof Error && /needs a command|invalid URL|must be|unsupported MCP transport|contains an empty|already used by/u.test(error.message)) return "validation";
	return "internal";
}
//#endregion
//#region lib/types/host/index.js
/** Host entry for the Web MCP manager plugin. */
const name = "web-mcp-manager";
const inject = [
	"settings",
	"connection",
	"tools"
];
/** Start the controller on the Host Cordis fiber. */
async function apply(ctx) {
	const controller = new McpManagerController(ctx);
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
export { DEFAULT_RECONNECT, DEFAULT_TOOL_CALL_TIMEOUT_MS, MANAGER_NAMESPACE, MCP_MANAGER_CHANNEL, MCP_MANAGER_SETTINGS_NAMESPACE, ManagerSettingsSchema, McpManagerController, apply, defaultDocument, defaultServer, inject, isRpcResult, name, transportOf, validateReconnect, validateServerConfig, validateServerId, validateStoredDocument };

//# sourceMappingURL=index.js.map