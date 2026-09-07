# DSH Web MCP 面板插件设计与实施计划

## 1. 文档状态与交付边界

插件实现已经开始并以本仓库源码和已提交的 `lib/` 产物为交付物。插件不发布到 npm；用户通过 GitHub spec 安装，安装阶段不执行额外编译。实现仍以本文的第一版边界为准，未完成的运行时集成测试会在交付说明中单独列出。

推荐安装方式：

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
dsh web
```

Bundle 变化需要重启已经运行的 Web profile。源码变更后由维护者在提交前本地运行构建并更新 `lib/`，仓库不包含 `prepare` 或 `postinstall` 编译钩子。

## 2. 最低兼容版本与核查依据

最低兼容 `@deepseek-ai/dsh@0.1.2-rc.1`，以 `deepseek-harness` 仓库标签 `dsh-v0.1.2-rc.1`、提交 `a66e4702047846cdaa10c66c9d3df3951f5ea70d` 为基线。源码对照版本为 `0.1.3-alpha.1`，提交 `d347e70390`。核查日期：2026-09-07。

已通过本地标签源码和版本差异确认：

- 基线具备 Web 插件加载、`settings.section`、settings 持久化、原生 MCP 客户端、工具过滤与执行拦截接口。
- 本方案使用的 Connection `rpc.handle()` 和 `rpc.call()` 在基线可用。
- 后续版本增加的 Fetch POST 路由及流式请求体接口不作为插件依赖。
- 现有 MCP 客户端未公开持续连接健康状态；断线期间可能仍保留已注册工具。

主要源码依据：

| 能力 | 宿主源码位置 |
| --- | --- |
| MCP 配置及生命周期 | `packages/mcp/mcp-client/src/index.ts`、`src/connection.ts` |
| 工具注册名称及同步 | `packages/mcp/mcp-client/src/tools.ts` |
| 工具过滤与执行拦截 | `packages/core/tools/src/index.ts` |
| Agent 清单与生命周期 | `packages/core/agent/src/index.ts` |
| 设置存储与脱敏 | `packages/settings/settings/src/index.ts`、`src/redact.ts`、`packages/settings/settings-file/src/index.ts` |
| 设置页面扩展 | `packages/client/ui-settings/src/client/contract/slots.ts` |
| 认证后的 RPC 通道 | `packages/client/connection/src/rpc-host.ts`、`src/rpc.ts`、`src/client/index.ts` |
| 浏览器插件加载与构建格式 | `packages/client/modules/src/index.ts`、`packages/client/tsdown.client.ts` |
| 已有插件清单 | `packages/host/plugin-inventory/src/index.ts` |

实现使用基线版本的类型和公共导出；包元数据兼容 `0.1.2-alpha.1` 至 `<0.2.0` 的 DSH 依赖，验收仍应覆盖 `0.1.2-rc.1` 与 `0.1.3-alpha.1`。依赖范围显式处理预发布版本，不据此承诺兼容所有未来版本。上述结论是源码兼容性核查，尚非运行测试结果。

## 3. 插件功能与界面

独立包名为 `dsh-web-mcp-manager`，代码放在本项目，通过 Web profile 安装，同时提供 Host 和浏览器入口，不修改宿主源码。

- 在“设置 → MCP”提供服务列表、配置表单和工具列表，支持搜索、中英文、宿主主题和键盘操作。
- 面板自管服务支持新增、编辑、删除、启用、停用及重新加载，支持 `stdio` 和 `streamable-http`。
- stdio 配置包含命令、参数、工作目录及环境变量；HTTP 配置包含 URL 和请求头；高级配置包含调用超时和重连策略。
- 工具展示完整注册名称、描述、输入参数与开关。首次及后续新发现的工具默认启用，保存已关闭名单。
- 已有 Loader／preset MCP 配置只读展示条目标识、所属来源及可取得的启用和加载状态，不修改原文件、不自动迁移、不求值配置中的 JavaScript 表达式。
- 页面提供空状态、保存进度、错误提示和删除确认。

显示“已停用、等待加载、加载中、已加载、加载失败”和已注册工具数量。不将“已加载”或“存在工具”解释成实时连接正常。

## 4. 实现与接口约定

### 4.1 包结构与宿主接入

- 使用 `dsh.bundle` 和 `dsh.client` 注册，导出 Host 入口、浏览器入口和共享类型。
- 生成宿主支持的 lazy-CJS factory 浏览器产物，共享 React、Cordis 和宿主公共 UI 模块，不重复打包运行时。
- 构建脚本自包含，不依赖开发机器上的固定目录或相邻宿主 checkout。
- 复用 `@deepseek-ai/dsh-mcp-client` 及 Cordis 生命周期管理连接。连接配置变化只重载对应服务；工具开关不重建连接。

### 4.2 数据与持久化

- 使用宿主 settings 服务，在 `web-mcp-manager` 命名空间保存服务配置和工具禁用名单，默认位于 `$DSH_HOME/settings.yaml`，保留其他命名空间及配置。
- 数据按 Harness home 保存，在挂载本插件的进程中生效；同一 home 下的多个挂载实例共享该命名空间，不承诺 profile 级数据隔离。
- 服务使用稳定 ID；工具策略按服务 ID 与完整注册名称保存。校验名称冲突和工具归属歧义，不从规范化名称反推 MCP 原始工具名。
- 环境变量和请求头值使用可被宿主脱敏器遍历的 secret 字段。读取仅返回键名及是否设置；未编辑的值保留，清除必须显式提交。
- 存储 schema 使用对象和字典等宿主支持的脱敏结构，不把秘密放进脱敏器无法遍历的 union 分支。

### 4.3 工具开关

- 在现有及新建 Agent 上应用 `tools.restrict()`，随工具注册变化更新。
- 通过针对自管工具的 `tools.guard()` 阻止禁用后的新调用，覆盖 Native 和 PTC。
- 规则作用于当前 Host 的所有会话；已有只读服务不受这些开关影响。
- 已开始执行的调用不主动中断。服务重连、工具重新注册或 Host 重启后仍恢复已保存的禁用规则。

### 4.4 管理接口

通过宿主 Connection 注册 `/mcp-manager` RPC 通道，复用浏览器认证及 Host/Origin 校验。浏览器通过 `ctx.connection.rpc.call()` 调用，Host 使用 `ctx.connection.rpc.handle()` 注册。

| 操作 | 用途 |
| --- | --- |
| `snapshot` | 读取脱敏配置、revision、运行状态、工具列表及已有只读条目 |
| `upsertServer` | 新增或编辑面板自管服务 |
| `removeServer` | 删除面板自管服务 |
| `setServerEnabled` | 启用或停用服务 |
| `reloadServer` | 重新加载指定服务 |
| `setToolEnabled` | 更新指定工具的启用状态 |

请求和响应共享类型并进行运行时校验。配置写入携带读取时的 revision，冲突时拒绝覆盖并提示刷新。先验证和持久化，再调整运行状态，分别呈现保存结果与加载结果；不能将“配置已保存”表述为“连接成功”。

### 4.5 生命周期与刷新

- 每项服务串行处理生命周期操作，避免重载、停用和删除相互竞争。
- 页面请求取消不撤销已经提交的配置。
- 插件卸载等待连接及子进程清理完成，撤销工具规则、事件订阅和 RPC 注册。
- 页面可见时默认每 2 秒刷新运行状态；操作完成和浏览器重连后立即刷新。
- 关闭页面后停止轮询，刷新间隔作为插件配置项。

## 5. 第一版边界

第一版不包含手动执行工具、MCP 服务软件下载或安装、OAuth 登录、Resources／Prompts 管理、旧配置自动迁移及统一接管。

已有配置维持只读。连接健康状态受宿主公开接口限制，不通过日志字符串或工具数量推断为实时在线。

## 6. 已实施与后续验证顺序

当前源码已覆盖以下实现顺序：

1. 建立独立包、Host／Client 编译配置、浏览器构建、bundle patch 和共享类型，以最低兼容版本为开发基线。
2. 实现 Host 配置持久化、RPC、服务生命周期、脱敏和已有条目只读展示。
3. 实现工具禁用规则及 Agent 生命周期联动，覆盖 Native／PTC。
4. 实现“设置 → MCP”页面、表单、工具开关、中英文和状态刷新。
5. 运行相关测试、两个目标版本的集成验证、包内容检查及中英文安装说明。

开发验证使用独立临时 `DSH_HOME`。不直接修改用户现有 Web profile。

当前交付包括插件源码、构建与类型检查脚本、随仓库提交的 `lib/` 产物以及中英文安装说明。插件不要求生成或发布 `.tgz`；如需本地检查包内容，可使用 `pnpm pack --dry-run`，但正常安装走 GitHub：

```bash
dsh plugin --profile web add github:junjiangao/dsh-web-mcp-manager
dsh web
```

## 7. 测试与验收计划

以下运行时检查仍需在隔离的 DSH profile 中执行：

- **配置与持久化：**两种传输的有效、无效和边界输入，名称冲突，重启恢复，revision 冲突，秘密保留、清除和脱敏，无关设置保留。
- **生命周期：**使用本地 stdio 和 HTTP MCP 测试服务，验证新增、启停、重载、失败提示、工具变化、重连和卸载；确认连接及子进程完成清理。
- **工具控制：**现有及新建会话、Native／PTC 中的工具禁用、重新启用、新工具默认启用，以及重连后策略保持。
- **界面与接入：**设置入口、中英文、主题、键盘操作、表单错误、只读配置、刷新启停，以及未认证请求被宿主拒绝。
- **版本与发布产物：**在 `0.1.2-rc.1` 和 `0.1.3-alpha.1` 的隔离环境中执行类型检查、相关测试和打包安装验证，确认不修改或重新构建宿主前端即可加载面板。

本地已执行类型检查、浏览器/Host 构建和包内容 dry-run；这些静态检查不等同于真实 MCP 服务连接、浏览器 RPC 或宿主生命周期集成验证。
