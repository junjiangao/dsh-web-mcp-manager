# DSH Web MCP Manager

MCP service management for the DeepSeek Harness Web profile. The plugin adds a **Settings → MCP** section for panel-managed servers, lifecycle actions, and per-tool enablement. State is stored in the Host `web-mcp-manager` settings namespace.

## Install

This plugin is installed from GitHub and is not published to npm. The repository contains the runnable `lib/` artifacts, so installation does not run `build`, `prepare`, or any other extra compilation step.

From outside the DeepSeek Harness checkout:

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
dsh web
```

Restart an already-running Web profile after installation. Bundle membership is mounted on the next profile start.

The plugin is mounted under its scoped npm package name `@junjiangao/dsh-web-mcp-manager`. The community registration identity `junjiangao/dsh-web-mcp-manager` is declared in the repository-root `registry.json`.

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

Requires DeepSeek Harness `0.1.7-rc.1` or a later `0.1.x`. dsh 0.1.7 owns plugin
configuration through the Loader entry, so this plugin exports `Config` from
`src/settings.ts` as the form the settings page renders, declares every field
`volatile()`, and writes back through `ctx.settings.replace()`. The removed
`settings.register()` API and its `SettingsProvider`/`SettingsScope` types are no
longer used, so earlier 0.1.x builds are not supported.

Revision conflicts carry the settings service's own identity. The controller
raises `SettingsConflictError` for its fail-fast check and classifies that class
structurally, so a conflict raised by `replace()` inside the service maps to the
same wire code. The write itself stays on `replace()` rather than the
path-addressed `settings.mutate()`: `mutate()` exists for a caller holding an
incomplete (redacted) view of a namespace, whereas this controller reads the
entry's volatile refs — the resolved config, secrets included — and therefore
restates every server. `ctx.settings.configure({ auto: false })` is deliberately
not called either: no shipped Web surface consumes `autoGenerate` yet, so it
would be a no-op.

The Host entry
declares `webServer` in its injection set and registers its own authenticated
`/mcp-manager` RPC route on that service. It deliberately does not use
`connection.rpc.handle()`: that API resolves `owner.webServer` from the
Connection fiber rather than the caller fiber and therefore fails at profile
startup with `cannot get property "webServer" without inject`. The browser half
keeps using the standard Connection RPC envelope, so no other plugin needs to be
patched.

## Development and artifacts

Source lives in `src/`; GitHub installation consumes the committed `lib/` artifacts. After changing source, refresh the artifacts before committing:

```bash
pnpm install
pnpm run build
```

Do not add a `prepare` or `postinstall` build hook to this repository. GitHub installation should only fetch dependencies and use the checked-in artifacts.

## Scope

- Both `stdio` and `streamable-http` use the Host `@deepseek-ai/dsh-mcp-client`.
- MCP commands run outside the Host sandbox and are trusted executables explicitly configured by the user.
- MCP entries supplied by another Loader or agent-preset configuration are displayed read-only and are not migrated or edited.
- `Loaded` means that this load and tool synchronization completed; it is not a promise of permanent connection health.
