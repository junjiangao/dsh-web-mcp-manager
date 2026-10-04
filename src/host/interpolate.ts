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
const REFERENCE = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/gu
/** An escaped `$${…}`, kept literal and never reported as a reference. */
const ESCAPED = /\$\$\{/gu
/** Sentinel standing in for an escaped `$${` while references are matched. */
const ESCAPE_SENTINEL = '\u0000'

/** Result of expanding one value. */
export interface Expansion {
  /** The expanded text, with every resolvable reference substituted. */
  readonly value: string
  /** Names that had no value and no fallback, in first-seen order. */
  readonly missing: readonly string[]
}

/**
 * Expand every environment reference in one value.
 * @param text - the raw value as stored in `mcp.json`.
 * @param env - environment mapping; `undefined` and `''` both count as unset.
 * @returns the expanded text and the unresolved names.
 */
export function expandTemplate(text: string, env: Readonly<Record<string, string | undefined>>): Expansion {
  const missing: string[] = []
  const shielded = text.replace(ESCAPED, ESCAPE_SENTINEL)
  const value = shielded.replace(REFERENCE, (match, name: string, fallback: string | undefined) => {
    const resolved = env[name]
    if (resolved !== undefined && resolved !== '') return resolved
    if (fallback !== undefined) return fallback
    if (!missing.includes(name)) missing.push(name)
    return match
  }).split(ESCAPE_SENTINEL).join('${')
  return { value, missing }
}

/**
 * Names one value references, without resolving them.
 *
 * The panel uses this to mark a stored entry as "from environment" and to keep
 * it out of the managed-secret flow: the file holds a template, not a value.
 * @param text - the raw value as stored in `mcp.json`.
 * @returns referenced names in first-seen order.
 */
export function templateEnvNames(text: string): string[] {
  const names: string[] = []
  for (const match of text.replace(ESCAPED, ESCAPE_SENTINEL).matchAll(REFERENCE)) {
    const name = match[1] as string
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** Names referenced by any value of one map, in first-seen order. */
export function templateEnvNamesOf(values: Readonly<Record<string, string>>): string[] {
  const names: string[] = []
  for (const value of Object.values(values)) {
    for (const name of templateEnvNames(value)) if (!names.includes(name)) names.push(name)
  }
  return names
}

/** Whether one value carries at least one reference. */
export function isTemplate(text: string): boolean {
  return templateEnvNames(text).length > 0
}

/**
 * Expand every value of one map, collecting unresolved names across the map.
 * @param values - raw key/value pairs.
 * @param env - environment mapping.
 * @returns expanded pairs (insertion order preserved) and the unresolved names.
 */
export function expandMap(
  values: Readonly<Record<string, string>>,
  env: Readonly<Record<string, string | undefined>>,
): { readonly values: Record<string, string>; readonly missing: readonly string[] } {
  const expanded: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, value] of Object.entries(values)) {
    const result = expandTemplate(value, env)
    expanded[key] = result.value
    for (const name of result.missing) if (!missing.includes(name)) missing.push(name)
  }
  return { values: expanded, missing }
}
