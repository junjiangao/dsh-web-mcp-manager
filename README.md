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
