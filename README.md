# DSH Web MCP Manager

MCP service management for the DeepSeek Harness Web profile. The plugin adds a **Settings → MCP** section for panel-managed servers, lifecycle actions, and per-tool enablement. Server definitions live in `mcp.json` files; the per-tool policy lives in the Loader entry `Config` for `web-mcp-manager`, which the panel edits through the official shared settings form (`ctx.configForms`) rather than through its own protocol.

## Server sources

One server name resolves to the highest-precedence definition; the rest are reported as *shadowed* rather than dropped.

| Scope | Path | Notes |
|---|---|---|
| project | `<workspace>/.dsh/mcp.json` | selected in the panel from the workspace registry; validated Host-side, so the RPC can never write outside a registered root |
| project (compat) | `<workspace>/.mcp.json` | Claude Code's file, read-only, ranks just below the project scope |
| profile | `~/.dsh/profiles/<profile>/mcp.json` | the default target for a new server |
| user | `~/.dsh/mcp.json` | honours `$DSH_HOME` |
| entry (legacy) | the `web-mcp-manager` Loader entry's `Config.servers` | what earlier versions stored; edited through the official `ctx.configForms` form, with a **Migrate to mcp.json** action |

The file format is the one the surrounding ecosystem already uses, so the same file works in Claude Code, Codex, pi, VS Code, and Codebuddy:

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${env:GITHUB_TOKEN}" }
    },
    "web": { "type": "http", "url": "https://example.com/mcp" }
  }
}
```

- Reads are wider than writes: VS Code's `servers` alias, `http` / `streamableHttp` spellings, and `enabled` / `disabled` are all accepted, and every field this plugin does not own round-trips untouched.
- `${env:NAME}`, `${NAME}`, and `${NAME:-fallback}` expand **only** on the way into `dsh-mcp-client`; the panel never receives the value, the file keeps the template, and a missing variable becomes a failure that names it.
- A panel-managed secret is declared with `"sensitive": { "env": ["GITHUB_TOKEN"] }`; without it, a key that looks like a secret is masked by name.
- SSE is refused with a clear message rather than silently downgraded, because `dsh-mcp-client` supports `stdio` and `streamable-http` only.
- Writes take the official cross-process file lock and commit through an atomic rename at mode `0600`; a file with a JSON syntax error refuses the write instead of being overwritten, and only that one scope reports the error.
- Every scope file is watched, so editing `~/.dsh/mcp.json` in an editor reconciles the running servers without a restart.

Writes go to different places depending on the scope, because the two layers are
owned by different parts of dsh:

- A `project` / `profile` / `user` definition is a file with no configuration
  surface in dsh, so the panel writes it through this plugin's own authenticated
  RPC, where `mutateScopeFile` re-reads it inside the official cross-process
  lock.
- The legacy `entry` definition is a Loader entry's own configuration, which dsh
  already has a surface for: the shared `ctx.configForms` form. The panel writes
  it there as revision-fenced path operations, and the RPC refuses an `entry`
  target outright rather than offering a second, unfenced path to the same
  document. The same form carries the per-tool policy (`disabledTools`), which
  stays in the entry whatever scope the definition came from.

Path operations are not merely tidier here: `env` and `headers` are declared
`role('secret')`, so their values are removed before the section reaches the
browser. A write that restated a whole server would silently drop every
credential it never received; the panel instead names only the fields it means,
and touches a secret only where a value was typed or a key was removed.

## Install

This plugin is installed from GitHub and is not published to npm. The repository contains the runnable `lib/` artifacts, so installation does not run `build`, `prepare`, or any other extra compilation step.

From outside the DeepSeek Harness checkout:

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
dsh web
```

Restart an already-running Web profile after installation. Bundle membership is mounted on the next profile start.

The plugin is mounted under its scoped npm package name `@junjiangao/dsh-web-mcp-manager`. The community registration identity `junjiangao/dsh-web-mcp-manager` is declared in the repository-root `registry.json`.

The Web **Plugins** page reads this plugin's display text from `locale/en.json` — the anchor the Host resolves first — plus one file per language beside it, each carrying `meta.title` and `meta.description`. Both files are read through the package specifier, so `exports` maps `"./locale/*.json"` and `files` carries `locale/*.json`; a locale file that is not exported is metadata the page never sees. Without them the page falls back to the untranslated `package.json` `name` and `description` — the raw `@junjiangao/dsh-web-mcp-manager`. The settings section's own copy is separate and lives in `src/client/locales.ts`, so a new string belongs in both places.

To upgrade from an older version installed under the unscoped package name `dsh-web-mcp-manager`, remove the old install first and then add the new one:

```bash
dsh plugin --profile web remove dsh-web-mcp-manager
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
```

Do not keep both the old and the new install in the same profile.

You can pin a branch or tag as well:

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager#main
```

## Compatibility

Requires DeepSeek Harness `0.2.x` (`0.2.0-rc.1` or later, prereleases included). dsh 0.2 owns plugin configuration
through the Loader entry, so this plugin exports `Config` from `src/settings.ts`
as the form the settings page renders, declares every live field `volatile()`,
and writes back through `ctx.settings.replace()`. The removed `settings.register()`
API and its `SettingsProvider`/`SettingsScope` types are not used. Volatile
changes arrive on the owning fiber through `loader/volatile-update`, allowing
the running MCP clients to reconcile without remounting the manager.

Revision conflicts carry the settings service's own identity. The controller
raises `SettingsConflictError` for its fail-fast check and classifies that class
structurally, so a conflict raised by `replace()` inside the service maps to the
same wire code. The write itself stays on `replace()` rather than the
path-addressed `settings.mutate()`: `mutate()` exists for a caller holding an
incomplete (redacted) view of a namespace, whereas this controller reads the
entry's volatile refs — the resolved config, secrets included — and therefore
restates every server. `ctx.settings.configure({ auto: false })` is used to keep
the generic generated form off: the purpose-built Settings → MCP panel is the
sole editor for this entry.

The Host entry declares `connection` (not `webServer`) in its injection set and
registers one **exact Fetch route per endpoint** on the Connection service's own
shared `/api` channel through `ctx.connection.fetch.register()`
(`src/host/rpc-channel.ts`). The physical `/api` prefix route is mounted by
`@deepseek-ai/dsh-client-connection` itself, so the Host/Origin fence and
browser authentication are applied before any handler runs and this plugin owns
no HTTP route. Two adjacent APIs stay deliberately unused:

- `connection.rpc.handle()` mounts its physical route through
  `owner.webServer`, where `owner` is the Connection service's own Context rather
  than the caller's, and fails at profile startup with
  `cannot get property "webServer" without inject`.
- `connection.rpc.intercept('/api', …)` admits exactly one interceptor per
  channel, and `@deepseek-ai/dsh-api-gateway` already owns it.

The browser half keeps using the standard Connection RPC envelope
(`connection.rpc.call('/api', 'mcp-manager/<endpoint>', …)`), so no other plugin
needs to be patched. Exact Fetch routes carry a 300 MiB buffered-body cap from
the carrier; the manager enforces its own 2 MiB ceiling inside each handler.

### Dependency surface and upgrade safety

`@deepseek-ai/*` packages are supplied by the running runtime, never installed
into the profile (`autoInstallPeers: false`). dsh routes a profile plugin's bare
specifiers through its own package table, and it only builds that routing layer
for packages the plugin **declares** — so every value import must appear in
`peerDependencies`. `tests/dependency-surface.spec.ts` enforces that, plus the
converse (no peer the plugin never references) and the `dsh.client.inject`
module-table contract.

dsh also gates every profile plugin before loading it: a `@deepseek-ai/dsh*`
peer requirement the running version does not satisfy leaves the Loader row
**disabled**, with a `dsh plugin allow-version` (or Plugins page) remedy writing
an exact `plugin@version → dsh version` exemption into
`~/.dsh/profiles/<profile>/compatibility.json`. `pnpm check:compat [version]`
reproduces that gate locally, including its `includePrerelease: true` detail —
without it `^0.2.0-rc.1` would wrongly reject `0.2.1-alpha.1`. CI runs it
against both ends of the supported train.

`@deepseek-ai/schemastery` is a peer rather than a dependency so the plugin and
dsh share one schema instance; the profile therefore installs no
`@deepseek-ai/*` package for this plugin at all.

The page's Host view lives in `@deepseek-ai/dsh-client-store`, the snapshot
store the Web shell seeds for every plugin: one reference-stable snapshot, one
subscription, and a single write face, read through `useSyncExternalStore`.
Keeping the load rule there rather than in component effects is what makes it
directly testable — "only the newest request may publish", "a failed background
read never discards a standing snapshot", and "a poll never clears an action
message" are asserted against a fake transport, with no clock involved.

Deleting a definition is destructive (it takes the per-tool policy with it and
has no undo), so it goes through the official `RiskConfirmation` dialog — a
warning, an acknowledgement checkbox, and a confirm that stays disabled until
it is ticked — rather than a blocking `window.confirm`.

Interactive chrome comes from `@deepseek-ai/dsh-client-ui-primitives`
(`Button`, `Input`, `Checkbox`, `Switch`, `Tag`, `StateDot`,
`SegmentedControl`, `RiskConfirmation`), which the Web shell already bundles and
serves through its shared module table — the plugin only declares it, never installs it. That
package publishes one flat ESM bundle whose undeclared imports include
`shiki`/`katex`/`micromark`, so it can only be loaded by a bundler or through
that table; under Vitest the specifier resolves to `tests/stubs/ui-primitives.tsx`,
a double that mirrors the published markup while `tsc` still checks every prop
against the real declarations.

## Development and artifacts

Source lives in `src/`; GitHub installation consumes the committed `lib/` artifacts. After changing source, refresh the artifacts before committing:

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run check:compat
pnpm run build
```

Do not add a `prepare` or `postinstall` build hook to this repository. GitHub installation should only fetch dependencies and use the checked-in artifacts.

## Scope

- Both `stdio` and `streamable-http` use the Host `@deepseek-ai/dsh-mcp-client`.
- MCP commands run outside the Host sandbox and are trusted executables explicitly configured by the user.
- MCP entries supplied by another Loader or agent-preset configuration are displayed read-only and are not migrated or edited.
- A per-tool disable list is profile-local policy, not portable server definition: it stays in the Loader entry `Config` (keyed by server id) and is never written into a shared `mcp.json`.
- `Loaded` means that this load and tool synchronization completed; it is not a promise of permanent connection health.
