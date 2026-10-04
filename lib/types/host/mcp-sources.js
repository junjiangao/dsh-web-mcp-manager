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
import { expandMap, expandTemplate, isTemplate } from "./interpolate.js";
import { normalizeServer } from "./mcp-json.js";
/**
 * Merge every source into the effective server set.
 * @param input - read outcomes and the legacy entry servers.
 * @returns the effective servers and one row per source.
 */
export function mergeSources(input) {
    const winners = new Map();
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
                problems.push({ id, error: normalized.error });
                continue;
            }
            accepted += 1;
            const existing = winners.get(id);
            if (existing === undefined) {
                order.push(id);
                winners.set(id, { id, scope: read.scope, path: read.path, server: normalized.server, shadowed: [] });
            }
            else {
                winners.set(id, { ...existing, shadowed: [...existing.shadowed, { scope: read.scope, path: read.path }] });
            }
        }
        rows.push({
            scope: read.scope,
            path: read.path,
            writable: read.writable,
            compat: read.compat,
            exists: read.exists,
            serverCount: accepted,
            ...read.error === undefined ? {} : { error: read.error },
            ...problems.length === 0 ? {} : { problems },
        });
    }
    const entryNames = Object.keys(input.entryServers).sort((a, b) => a.localeCompare(b));
    for (const id of entryNames) {
        const server = input.entryServers[id];
        if (server === undefined)
            continue;
        const existing = winners.get(id);
        if (existing === undefined) {
            order.push(id);
            winners.set(id, { id, scope: 'entry', path: input.entryPath, server, shadowed: [] });
        }
        else {
            winners.set(id, { ...existing, shadowed: [...existing.shadowed, { scope: 'entry', path: input.entryPath }] });
        }
    }
    rows.push({
        scope: 'entry',
        path: input.entryPath,
        writable: true,
        compat: false,
        exists: entryNames.length > 0,
        serverCount: entryNames.length,
    });
    return { servers: order.map(id => winners.get(id)), sources: rows };
}
/**
 * Names the server still holds as `${…}` templates, for panel display.
 * @param server - the stored server.
 * @returns referenced names per map, in first-seen order.
 */
export function serverTemplates(server) {
    // The KEYS whose stored value is still a template: the panel shows those as
    // "from environment" instead of as a managed secret.
    const templated = (values) => Object.keys(values).filter(key => isTemplate(values[key]));
    return { env: templated(server.env), headers: templated(server.headers) };
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
export function expandServer(server, env) {
    const missing = [];
    const record = (names) => {
        for (const name of names)
            if (!missing.includes(name))
                missing.push(name);
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
            headers: headerMap.values,
        },
        missing,
    };
}
//# sourceMappingURL=mcp-sources.js.map