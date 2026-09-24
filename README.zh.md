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

安装后插件以其 npm 作用域包名 `@junjiangao/dsh-web-mcp-manager` 挂载。社区注册身份 `junjiangao/dsh-web-mcp-manager` 由仓库根目录的 `registry.json` 声明。

从旧版本（包名 `dsh-web-mcp-manager`）升级时，需先移除旧安装再重新添加：

```bash
dsh plugin --profile web remove dsh-web-mcp-manager
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
```

同一 profile 不要同时保留新旧两个安装。

也可以固定分支或标签：

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager#main
```

## 兼容性

需要 DeepSeek Harness `0.1.7-rc.1` 或更高的 `0.1.x`。dsh 0.1.7 起，插件配置由
Loader entry 自身承载：本插件从 `src/settings.ts` 导出 `Config` 作为设置页渲染的表单，
每个字段声明为 `volatile()`，并通过 `ctx.settings.replace()` 写回。已被移除的
`settings.register()` 及其 `SettingsProvider`/`SettingsScope` 类型不再使用，因此更早的
0.1.x 版本不再受支持。

版本冲突沿用 settings 服务自身的错误身份：控制器的快速失败检查直接抛出
`SettingsConflictError`，错误分类也按类型结构化匹配，因此 `replace()` 在服务内部抛出的
冲突会映射到同一个线上错误码。写入仍使用 `replace()` 而非按路径的
`settings.mutate()`：`mutate()` 面向只持有命名空间**不完整视图**（脱敏后）的调用方，
而本控制器读取的是 entry 的 volatile refs（已解析、含密钥的完整配置），因此本来就会
重述每个服务。同样刻意不调用 `ctx.settings.configure({ auto: false })`：当前 Web
界面还没有消费 `autoGenerate` 的地方，调用它只是空操作。

Host 半边在注入集中声明
`webServer`，并在该服务上注册自有的、带鉴权的 `/mcp-manager` RPC 路由。插件刻意
不使用 `connection.rpc.handle()`：该 API 解析 `owner.webServer` 时从 Connection 的
fiber 出发，而不是调用方 fiber，会以
`cannot get property "webServer" without inject` 让 profile 启动失败。浏览器半边仍
使用标准 Connection RPC 信封，因此无需 patch 任何其他插件。

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
