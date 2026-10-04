# DSH Web MCP Manager

DeepSeek Harness Web profile 的 MCP 服务管理插件。它在“设置 → MCP”提供面板自管服务的配置、启停、重载和工具开关；服务定义存放在 `mcp.json` 文件里；逐工具策略保存在 `web-mcp-manager` Loader 条目的 `Config` 中，由 dsh profile 配置层持久化，面板通过**官方共享设置表单**（`ctx.configForms`）读写它，而不是走插件私有协议。

## 服务来源

同名服务由优先级最高的定义生效，其余定义在面板中标注为“被上层覆盖”，不会被静默丢弃。

| 级别 | 路径 | 说明 |
|---|---|---|
| 项目级 | `<workspace>/.dsh/mcp.json` | 面板从工作区注册表中选择；Host 侧再次校验，RPC 无法写到未注册的目录 |
| 项目级兼容 | `<workspace>/.mcp.json` | Claude Code 约定，只读，优先级仅低于项目级自身文件 |
| 配置级 | `~/.dsh/profiles/<profile>/mcp.json` | 新建服务的默认落点 |
| 用户级 | `~/.dsh/mcp.json` | 尊重 `$DSH_HOME` |
| 遗留层 | Loader entry `web-mcp-manager` 的 `Config.servers` | 早期版本的存储位置，通过官方 `ctx.configForms` 表单编辑，并提供「迁移到 mcp.json」 |

文件格式与周边生态一致，同一份文件可被 Claude Code、Codex、pi、VS Code、Codebuddy 直接读取：

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

- 读宽写严：接受 VS Code 的 `servers` 别名、`http` / `streamableHttp` 等传输写法与 `enabled` / `disabled`；本插件不拥有的字段在往返写入中原样保留。
- `${env:NAME}`、`${NAME}`、`${NAME:-fallback}` **只在**投影给 `dsh-mcp-client` 时展开：面板永远拿不到值，文件里保留模板，变量缺失会变成指名道姓的失败。
- 面板管理的密钥用 `"sensitive": { "env": ["GITHUB_TOKEN"] }` 声明；未声明时按名称识别并掩码。
- SSE 会给出明确错误而不是静默降级 —— `dsh-mcp-client` 只支持 `stdio` 与 `streamable-http`。
- 写入使用官方跨进程文件锁并以原子 rename 提交（权限 `0600`）；JSON 语法损坏的文件会被拒绝覆盖，且只有该层报错，其余层照常工作。
- 每个来源文件都被监听：用编辑器改 `~/.dsh/mcp.json` 后无需重启即可重新协调。

写入落在哪里取决于层级，因为这两层归 dsh 的不同部分所有：

- `project` / `profile` / `user` 是文件，dsh 没有对应的配置面，因此面板走本插件自己的鉴权 RPC 写入，由 `mutateScopeFile` 在官方跨进程锁内重新读取再提交。
- 遗留的 `entry` 层是 Loader 条目自身的配置，dsh 本来就有配置面：官方共享 `ctx.configForms` 表单。面板以带 revision 栅栏的路径操作写入，RPC 则直接拒绝 `entry` 目标，而不是提供第二条没有栅栏的写路径。逐工具策略（`disabledTools`）也走同一个表单 —— 无论定义来自哪一层，它都存放在 entry 里。

用路径操作不只是更整洁：`env` / `headers` 声明为 `role('secret')`，其值在到达浏览器前就被删除，任何“重述整个 server”的写都会静默丢掉浏览器从未收到的凭据；面板只声明它真正要改的字段，只有用户输入了新值或删除了某个键时才会碰对应密钥。

## 安装

本插件只通过 GitHub 安装，不发布到 npm。仓库已经提交可运行的 `lib/` 产物，安装时不会执行 `build`、`prepare` 或其他额外编译步骤。

在 DeepSeek Harness 仓库外运行：

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
dsh web
```

如果 Web profile 已经在运行，安装完成后重启它；Bundle 成员是在下一次启动时挂载的。

安装后插件以其 npm 作用域包名 `@junjiangao/dsh-web-mcp-manager` 挂载。社区注册身份 `junjiangao/dsh-web-mcp-manager` 由仓库根目录的 `registry.json` 声明。

Web 的**插件页**读取本插件的显示文案来自 `locale/en.json`（Host 首先解析的锚点）以及同目录下的每种语言一个文件，各自携带 `meta.title` 与 `meta.description`。这些文件是**通过包说明符**解析的，因此 `exports` 里要有 `"./locale/*.json"`、`files` 里要有 `locale/*.json`；一个没有导出的 locale 文件对插件页等于不存在。缺失时会回退到未翻译的 `package.json` `name` 与 `description`，也就是裸露的 `@junjiangao/dsh-web-mcp-manager`。设置区自身的文案是另一套，位于 `src/client/locales.ts`，新增文案时两处都要写。

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

需要 DeepSeek Harness `0.2.x`（`0.2.0-rc.1` 及以上，含预发布版）。dsh 0.2 起，插件配置由 Loader entry
自身承载：本插件从 `src/settings.ts` 导出 `Config` 作为设置页渲染的表单，
所有实时字段声明为 `volatile()`，并通过 `ctx.settings.replace()` 写回。已移除的
`settings.register()` 及其 `SettingsProvider`/`SettingsScope` 类型不再使用。volatile
修改会在所属 fiber 上通过 `loader/volatile-update` 通知，使运行中的 MCP 客户端无需重挂载
即可重新协调。

版本冲突沿用 settings 服务自身的错误身份：控制器的快速失败检查直接抛出
`SettingsConflictError`，错误分类也按类型结构化匹配，因此 `replace()` 在服务内部抛出的
冲突会映射到同一个线上错误码。写入仍使用 `replace()` 而非按路径的
`settings.mutate()`：`mutate()` 面向只持有命名空间**不完整视图**（脱敏后）的调用方，
而本控制器读取的是 entry 的 volatile refs（已解析、含密钥的完整配置），因此本来就会
重述每个服务。调用 `ctx.settings.configure({ auto: false })` 关闭通用自动表单；本插件自带的
“设置 → MCP”面板是该条目的唯一编辑入口。

Host 半边在注入集中声明 `connection`（不再需要 `webServer`），并通过
`ctx.connection.fetch.register()` 在 Connection 服务自有的共享 `/api` 通道上为**每个端点注册一条精确
Fetch 路由**（`src/host/rpc-channel.ts`）。物理 `/api` 前缀路由由
`@deepseek-ai/dsh-client-connection` 自己挂载，Host/Origin 栅栏与浏览器鉴权在任何 handler
运行之前就已生效，因此本插件不再自持任何 HTTP 路由。相邻的两个 API 被刻意排除：

- `connection.rpc.handle()` 挂载物理路由时走 `owner.webServer`，而 `owner` 是 Connection
  服务自身的 Context 而非调用方 fiber，会以
  `cannot get property "webServer" without inject` 让 profile 启动失败。
- `connection.rpc.intercept('/api', …)` 每个 channel 只允许一个拦截器，而它已被
  `@deepseek-ai/dsh-api-gateway` 占用。

浏览器半边仍使用标准 Connection RPC 信封
（`connection.rpc.call('/api', 'mcp-manager/<endpoint>', …)`），因此无需 patch 任何其他插件。
精确 Fetch 路由继承载体 300 MiB 的缓冲上限，管理器在 handler 内自行坚持 2 MiB 上限。

### 依赖面与升级安全

`@deepseek-ai/*` 由运行中的 dsh 运行时提供，永远不会装进 profile
（`autoInstallPeers: false`）。dsh 会把 profile 内插件的 bare specifier 路由到自己的包表，而
**只有插件声明过的包才会建立这层路由** —— 因此每一个“值导入”都必须出现在
`peerDependencies` 中。`tests/dependency-surface.spec.ts` 同时守护这条规则、它的反面（不声明
从未引用的 peer）以及 `dsh.client.inject` 的浏览器模块表契约。

dsh 还会在加载插件前执行兼容门：运行版本不满足某个 `@deepseek-ai/dsh*` peer 要求时，该 Loader
行会被**禁用**，并给出 `dsh plugin allow-version`（或插件管理器）的补救入口 —— 它把精确的
`插件@版本 → dsh 版本` 豁免写进 `~/.dsh/profiles/<profile>/compatibility.json`。
`pnpm check:compat [version]` 在本地复现该判定，包含其 `includePrerelease: true` 细节 ——
没有这一项，`^0.2.0-rc.1` 会错误地拒绝 `0.2.1-alpha.1`。CI 会对支持区间的两端各跑一次。

`@deepseek-ai/schemastery` 声明为 peer 而非 dependency，使插件与 dsh 共用同一个 schema
实例；profile 因此不会为本插件安装任何 `@deepseek-ai/*` 包。

面板的 Host 视图存放在 `@deepseek-ai/dsh-client-store`（Web shell 为每个插件提供的
snapshot store）：一份引用稳定的快照、一个订阅、一套写入口，组件用
`useSyncExternalStore` 读取。把加载规则放在这里而不是组件 effect 里，是为了让它可被直接
断言 —— “只有最新请求能发布”“后台读失败不丢弃已有快照”“轮询不会清掉操作消息”现在都是
对着假传输的用例，不依赖时钟。

删除服务定义会连带移除其逐工具策略且无法撤销，因此走官方 `RiskConfirmation` 弹窗（警示
文案 + 必须勾选确认 + 勾选前禁用的确认按钮），而不是阻塞式 `window.confirm`。

交互控件来自 `@deepseek-ai/dsh-client-ui-primitives`（`Button`、`Input`、`Checkbox`、
`Switch`、`Tag`、`StateDot`、`SegmentedControl`、`RiskConfirmation`）。Web shell 已经打包该包并通过共享
module table 提供它，插件只声明、不安装。它发布的是单个扁平 ESM bundle，其中还引用了
`shiki`/`katex`/`micromark` 等未声明的依赖，因此只能由打包器或该 module table 加载；
在 Vitest 下该 specifier 解析到 `tests/stubs/ui-primitives.tsx`（复刻官方 DOM 的替身），
而每个 prop 仍由 `tsc` 对着官方声明做类型检查。

## 开发与更新产物

源码位于 `src/`，发布给 GitHub 安装器的是已提交的 `lib/`。修改源码后，在提交前执行：

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run check:compat
pnpm run build
```

不要在插件仓库中加入 `prepare` 或 `postinstall` 编译脚本；这样 GitHub 安装只需下载依赖并使用仓库内产物。

## 当前边界

- `stdio` 和 `streamable-http` 均由宿主的 `@deepseek-ai/dsh-mcp-client` 管理。
- MCP 命令在宿主进程外启动，属于用户明确配置的受信任可执行程序。
- 已由其他 Loader 或 Agent 预设配置提供的 MCP 条目仅展示，不会被插件迁移或修改。
- 逐工具开关是本 profile 的策略而非可移植的服务定义：它只存在 Loader 条目 `Config`（按 server id 索引），不会写入共享的 `mcp.json`。
- “已加载”表示本次加载及工具同步完成，不等同于永久连接健康状态。
