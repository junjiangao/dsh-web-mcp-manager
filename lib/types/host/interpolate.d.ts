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
/** Result of expanding one value. */
export interface Expansion {
    /** The expanded text, with every resolvable reference substituted. */
    readonly value: string;
    /** Names that had no value and no fallback, in first-seen order. */
    readonly missing: readonly string[];
}
/**
 * Expand every environment reference in one value.
 * @param text - the raw value as stored in `mcp.json`.
 * @param env - environment mapping; `undefined` and `''` both count as unset.
 * @returns the expanded text and the unresolved names.
 */
export declare function expandTemplate(text: string, env: Readonly<Record<string, string | undefined>>): Expansion;
/**
 * Names one value references, without resolving them.
 *
 * The panel uses this to mark a stored entry as "from environment" and to keep
 * it out of the managed-secret flow: the file holds a template, not a value.
 * @param text - the raw value as stored in `mcp.json`.
 * @returns referenced names in first-seen order.
 */
export declare function templateEnvNames(text: string): string[];
/** Names referenced by any value of one map, in first-seen order. */
export declare function templateEnvNamesOf(values: Readonly<Record<string, string>>): string[];
/** Whether one value carries at least one reference. */
export declare function isTemplate(text: string): boolean;
/**
 * Expand every value of one map, collecting unresolved names across the map.
 * @param values - raw key/value pairs.
 * @param env - environment mapping.
 * @returns expanded pairs (insertion order preserved) and the unresolved names.
 */
export declare function expandMap(values: Readonly<Record<string, string>>, env: Readonly<Record<string, string | undefined>>): {
    readonly values: Record<string, string>;
    readonly missing: readonly string[];
};
//# sourceMappingURL=interpolate.d.ts.map