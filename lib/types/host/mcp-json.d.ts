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
import type { StoredServer } from '../types.ts';
/** Primary top-level key holding the server map. */
export declare const MCP_SERVERS_KEY: "mcpServers";
/** VS Code's alias for the same map; read-only. */
export declare const MCP_SERVERS_ALIAS_KEY: "servers";
/** One parsed document plus the identity of the key the server map came from. */
export interface McpJsonDocument {
    /** Every root field, so unknown tool-specific fields survive a write. */
    readonly root: Record<string, unknown>;
    /** The server map, keyed by server name. */
    readonly servers: Record<string, unknown>;
    /** Which top-level key the servers came from. */
    readonly serversKey: typeof MCP_SERVERS_KEY | typeof MCP_SERVERS_ALIAS_KEY;
}
export type ParseResult = {
    readonly ok: true;
    readonly document: McpJsonDocument;
    readonly warnings: readonly string[];
} | {
    readonly ok: false;
    readonly error: string;
};
/**
 * Parse one `mcp.json` text.
 * @param text - file content.
 * @returns the document, or a human-readable failure for the panel.
 */
export declare function parseMcpJson(text: string): ParseResult;
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
export declare function serializeMcpJson(document: McpJsonDocument): string;
/**
 * Replace, add, or remove one server in a document.
 * @param document - the parsed document.
 * @param id - server name.
 * @param server - the stored server to write, or `null` to remove it.
 * @returns a new document; the input is not mutated.
 */
export declare function withServer(document: McpJsonDocument, id: string, server: StoredServer | null): McpJsonDocument;
/** An empty document, for creating a file that does not exist yet. */
export declare function emptyDocument(): McpJsonDocument;
/** Whether an unknown value is a plain JSON object. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export type NormalizeResult = {
    readonly ok: true;
    readonly server: StoredServer;
} | {
    readonly ok: false;
    readonly error: string;
};
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
export declare function normalizeServer(id: string, raw: unknown): NormalizeResult;
/**
 * Map an `mcp.json` `type` onto a supported transport.
 *
 * `undefined` infers from the presence of `url`, which is how several clients
 * omit `type` for stdio entries.
 * @param type - the declared type, when present.
 * @param hasUrl - whether the entry carries a `url`.
 * @returns the transport, or `undefined` for an unsupported one (`sse`).
 */
export declare function transportOfJson(type: string | undefined, hasUrl: boolean): StoredServer['transport'] | undefined;
/**
 * Project one stored server back into its raw `mcp.json` entry.
 *
 * Defaults are omitted so a file stays readable and diff-friendly: only
 * `type`/`command`/`url` and the fields that differ from the defaults appear.
 * @param server - the stored server.
 * @returns the raw entry to persist.
 */
export declare function serverToRaw(server: StoredServer): Record<string, unknown>;
/**
 * Merge a new stored server into an existing raw entry, preserving foreign keys.
 * @param existing - the raw entry currently on disk, when present.
 * @param id - server name.
 * @param next - the stored server to write.
 * @returns the raw entry to persist.
 */
export declare function applyServerToRaw(existing: unknown, id: string, next: StoredServer): Record<string, unknown>;
//# sourceMappingURL=mcp-json.d.ts.map