# DSH Web MCP Manager

DeepSeek Harness Web profile 的 MCP 服务管理插件。它在“设置 → MCP”提供面板自管服务的配置、启停、重载和工具开关；配置保存在宿主的 `web-mcp-manager` settings 命名空间中。

## 安装

本插件只通过 GitHub 安装，不发布到 npm。仓库已经提交可运行的 `lib/` 产物，安装时不会执行 `build`、`prepare` 或其他额外编译步骤。

在 DeepSeek Harness 仓库外运行：

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
dsh web
```

如果 Web profile 已经在运行，安装完成后重启它；Bundle 成员是在下一次启动时挂载的。

也可以固定分支或标签：

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager#main
```

## 开发与更新产物

源码位于 `src/`，发布给 GitHub 安装器的是已提交的 `lib/`。修改源码后，在提交前执行：

```bash
pnpm install
pnpm run build
```

不要在插件仓库中加入 `prepare` 或 `postinstall` 编译脚本；这样 GitHub 安装只需下载依赖并使用仓库内产物。

## 当前边界

- `stdio` 和 `streamable-http` 均由宿主的 `@deepseek-ai/dsh-mcp-client` 管理。
- MCP 命令在宿主进程外启动，属于用户明确配置的受信任可执行程序。
- 已由其他 Loader 或 Agent 预设配置提供的 MCP 条目仅展示，不会被插件迁移或修改。
- “已加载”表示本次加载及工具同步完成，不等同于永久连接健康状态。
