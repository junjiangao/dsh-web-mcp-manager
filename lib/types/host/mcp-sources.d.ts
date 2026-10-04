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
import type { ReadResult } from './mcp-file.ts';
import type { McpScope, StoredServer } from '../types.ts';
/** One scope row as the panel renders it. */
export interface SourceRow {
    readonly scope: McpScope;
    readonly path: string;
    readonly writable: boolean;
    readonly compat: boolean;
    readonly exists: boolean;
    readonly serverCount: number;
    readonly error?: string;
    /** Per-entry failures inside an otherwise readable file. */
    readonly problems?: readonly {
        readonly id: string;
        readonly error: string;
    }[];
}
/** One effective server plus the scopes that lost to it. */
export interface SourcedServer {
    readonly id: string;
    readonly scope: McpScope;
    readonly path: string;
    readonly server: StoredServer;
    readonly shadowed: readonly {
        readonly scope: McpScope;
        readonly path: string;
    }[];
}
/** The merged view of every source. */
export interface MergedSources {
    readonly servers: readonly SourcedServer[];
    readonly sources: readonly SourceRow[];
}
/** Inputs for {@link mergeSources}. */
export interface MergeInput {
    /** Read outcomes in precedence order, as `readScopeFiles` returns them. */
    readonly scopes: readonly ReadResult[];
    /** Legacy servers from the Loader entry `Config`. */
    readonly entryServers: Readonly<Record<string, StoredServer>>;
    /** Display path for the legacy row (the entry owns no file of its own). */
    readonly entryPath: string;
}
/**
 * Merge every source into the effective server set.
 * @param input - read outcomes and the legacy entry servers.
 * @returns the effective servers and one row per source.
 */
export declare function mergeSources(input: MergeInput): MergedSources;
/** Environment variables one stored server keeps as templates. */
export interface ServerTemplates {
    readonly env: readonly string[];
    readonly headers: readonly string[];
}
/**
 * Names the server still holds as `${…}` templates, for panel display.
 * @param server - the stored server.
 * @returns referenced names per map, in first-seen order.
 */
export declare function serverTemplates(server: StoredServer): ServerTemplates;
/** Outcome of projecting one server into an mcp-client-ready definition. */
export interface ExpandedServer {
    readonly server: StoredServer;
    /** Referenced variables with no value and no fallback. */
    readonly missing: readonly string[];
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
export declare function expandServer(server: StoredServer, env: Readonly<Record<string, string | undefined>>): ExpandedServer;
//# sourceMappingURL=mcp-sources.d.ts.map