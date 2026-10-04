# dsh-web-mcp-manager 优化调整方案（对齐 dsh 0.2.1-alpha.1）

> **落地状态（2026-10-04）**
>
> | 批次 | 状态 | 说明 |
> | --- | --- | --- |
> | P0-1 官方 `connection.fetch` 传输层 | ✅ 已落地 | `src/host/rpc-channel.ts`；`rpc-route.ts` 与 `tests/rpc-route.spec.ts` 已删除 |
> | P0-2/3 依赖与版本 | ✅ 已落地 | peer 20 → **14**（含 P1 新增 2 个），`dependencies` 归零，devDeps 升到 0.2.1-alpha.1 |
> | P0-4 升级兼容守卫 | ✅ 已落地 | `scripts/check-dsh-compat.mjs`、`tests/dependency-surface.spec.ts`、CI 双版本检查 |
> | P1a `mcp.json` 核心 | ✅ 已落地 | `mcp-json.ts` / `mcp-file.ts` / `mcp-sources.ts` / `interpolate.ts` + controller/protocol 接入 |
> | P1b 面板 | ✅ 已落地 | 层级徽标、遮盖标注、来源列表、工作区选择、模板只读行、迁移按钮 |
> | P2-1 官方 UI 基元 | ✅ 已落地 | `Button` / `Input` / `Checkbox` / `Switch` / `Tag` / `StateDot` / `SegmentedControl` |
> | P2-2 官方 `configForms` | ✅ 已落地 | entry 层读写改走官方共享表单；Host 侧 entry 写入路径整体删除 |
> | P2-3 官方 store + 确认弹窗 | ✅ 已落地 | `manager-store.ts`（`createSnapshotStore`）、`RiskConfirmation` |
>
> 验收：`pnpm typecheck` 通过；**110 个用例 / 14 个文件**全绿；`pnpm build` 字节级幂等且 `lib/` 已提交；
> `pnpm check:compat` 对 `0.2.0-rc.1` 与 `0.2.1-alpha.1` 均通过；
> `pnpm install --frozen-lockfile` 通过。

- 仓库：`/work/Repos/github/dsh-web-mcp-manager`（分支 `integrate-dsh-0.2`）
- 插件版本：`@junjiangao/dsh-web-mcp-manager@0.4.0`（本轮从 `0.3.1` 升上来，见 `package.json`）
- 对照运行时：DeepSeek Harness **0.2.1-alpha.1.20261004.2**（本机唯一安装版本，`~/.dsh/profiles/desktop` 正在使用）
- 核查日期：2026-10-04
- 基线状态：`npx vitest run` → 9 个文件 / 53 个用例全绿；`lib/` 已随仓库提交（`index.js` 1105 行、`client.js` 1785 行）

方案目标（按用户要求排序）：

1. **基于最新 dsh**：所有结论以 0.2.1-alpha.1 的实机产物为准，并给出可复验证据。
2. **减少依赖**：peer 从 20 个降到 12 个（P0）→ 14 个（P1 后），`dependencies` 从 1 个降到 0，删掉 174 行自建 HTTP 传输层。
3. **尽量基于官方基座**：用官方 `connection.fetch` 注册面、官方设置读写面、官方 UI 基元与官方原子写文件能力替换自研实现。
4. **避免升级不兼容**：把"会被运行时拒绝"的机制摸清（兼容门 + 解析路由），加上自动守卫测试。
5. **功能增强**：新增 `.dsh/profiles/<profile>/mcp.json`（配置级）、`~/.dsh/mcp.json`（用户级）、`<project>/.dsh/mcp.json`（项目级）三级 MCP 配置的读写、合并、监听与迁移。

---

## 1. 核查结论（先给可复验事实，再给方案）

### 1.1 版本与注册表

| 事实 | 证据 |
| --- | --- |
| 本机运行时为 0.2.1-alpha.1 | `.../versions/0.2.1-alpha.1.20261004.2/resources/app.asar.unpacked/dsh/package.json` → `@deepseek-ai/dsh-desktop-runtime@0.2.1-alpha.1` |
| 该版本的核心包与插件所用 API 面**零变化** | 把 `@deepseek-ai/dsh-{settings,mcp-client,client-connection,client-ui-settings,host-plugin-inventory,timeout}@0.2.1-alpha.1` 从 registry 拉下，与工程内 `node_modules` 的 `0.2.0-rc.1` 做 `diff -rq lib/types`：除 `dsh-tools` 的 `ptc.*` / 删除 `invariant.d.ts`（插件未使用）外**无差异** |
| 插件声明的 peer 范围被运行时接受 | 见 1.2 |

### 1.2 官方"插件兼容门"（这是"升级不兼容"的第一道关）

`@deepseek-ai/dsh-app-boot` 在 profile 启动时对每个插件执行 `evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)`，实现（`dsh-app-boot/lib/index.js:286-313`）：

```js
if (name !== "@deepseek-ai/dsh" && !name.startsWith("@deepseek-ai/dsh-")) continue;
if (requirement.trim() === "" ||
    !semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })) peers[name] = range;
```

- 只检查 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 前缀的 peer（`@deepseek-ai/cordis`、`@deepseek-ai/schemastery` **不在检查范围内**）。
- 关键：使用了 `includePrerelease: true`。用运行时自带 semver 实测：

  | range | `0.2.1-alpha.1`（默认） | `0.2.1-alpha.1`（includePrerelease） |
  | --- | --- | --- |
  | `^0.2.0-rc.1` | ❌ false | ✅ true |
  | `>=0.2.0-rc.1 <0.3.0` | ❌ false | ✅ true |

  即：**pnpm 认为不满足，dsh 自己认为满足**。现有 `^0.2.0-rc.1` 不会被兼容门拒绝，可以保留。
- 不兼容的后果不是崩溃，而是 **该 Loader 行被静默禁用**（`compatibility-preflight.ts`：denied row 获得 `disabled`），可用 `dsh plugin allow-version` / 插件管理器写 `~/.dsh/profiles/<p>/compatibility.json` 做**精确版本豁免**（本机已有一个此类豁免：`@mars-sea/dsh-commandcode-provider@0.11.17 → 0.2.0-rc.2`）。

> 结论：**peer 范围是"开关"，不是文档**。写错 = 插件在下次 dsh 升级后直接消失（带告警）。方案 B 会加自动守卫。

### 1.3 运行时模块解析路由（这是"升级不兼容"的第二道关，也是减依赖的关键约束）

`dsh-app-boot` 用 Node 内部模块钩子装了一个 `ResolutionRouter`（`index.js:1416` / `1707-1760`）：

- **凡是位于 profile 目录树内的模块**，其 bare specifier 都会被拦截，改从"安装作用域包表"（即 dsh 运行时自己的 `node_modules`）解析；
- 只有当 profile 的 `node_modules` 里存在同名**本地副本**时，本地副本优先（`routeScoped` 的 local candidate 分支）。

同时 profile 的 pnpm 配置是 `autoInstallPeers: false` + `nodeLinker: hoisted`（`~/.dsh/profiles/desktop/pnpm-workspace.yaml`、`.modules.yaml`）：**peer 永远不会被安装**，只有 `dependencies` 会落到 profile 里。

实机反证（非常关键）：

- `@mars-sea/dsh-commandcode-provider@0.12.4` 的 `dependencies` 是**空**，`@deepseek-ai/schemastery` 只写在 `peerDependencies`（`~3.18.5-alpha.1`），而它的 `lib` 确实 `import ... from "@deepseek-ai/schemastery"` —— 该插件在本机正常运行。
- 本机 profile 的 `node_modules/@deepseek-ai/` 只有 `schemastery`、`cosmokit`（来自本插件和 tavily 插件的 `dependencies`）。

> 结论：
> 1. **每个"值导入"的 `@deepseek-ai/*` 包都必须写进 `peerDependencies`** —— 解析路由靠它建拦截层。写了不 import 只是冗余；import 了不写则解析落到原生查找、在 profile 里必然失败。仅 `import type` 的包不参与运行时解析，写在 `devDependencies` 即可。
> 2. 把 `@deepseek-ai/schemastery` 从 `dependencies` 改成 `peerDependencies`，可让插件与 dsh 共用**同一个 schemastery 实例**，同时让 profile 不再安装 `schemastery` + `cosmokit` + `@standard-schema/spec`。这是"减依赖"最干净的一刀，且已有同生态先例。

### 1.4 传输层：官方能力现状（决定"基于官方基座"能走多深）

| 路径 | 0.2.1-alpha.1 状态 | 证据 |
| --- | --- | --- |
| `connection.rpc.handle(channel, handler)` | **仍不可用**。`get rpc() { const owner = this.ctx; ... }`，`register()` 里 `owner.effect(() => owner.webServer.register(route))` —— owner 是 Connection 服务自己的 Context，`webServer` 不在该 fiber 上，抛 `cannot get property "webServer" without inject` | `dsh-client-connection/lib/index.js:573-583, 643-660` |
| `connection.rpc.intercept('/api', …)` | **不可用**。`registerInterceptor` 对同一 channel **只允许一个拦截器**，`/api` 已被 `dsh-api-gateway` 占用 | `index.js:661-680`；`dsh-api-gateway/lib/index.js:624` |
| **`connection.fetch.register(route)`** | ✅ **可用且是官方正解**。`get fetch() { const owner = this.ctx; return { register: r => this.registerFetchRoute(owner, r) } }`，`registerFetchRoute` **只碰 `owner.effect`，不碰 `webServer`**；且精确路由优先于拦截器 | `index.js:581-584, 608-640` |
| 精确路由的鉴权 | ✅ 物理 `/api` 前缀路由由 Connection 自己挂在 webServer 上，先 `admit()`（Host/Origin 栅栏 + 浏览器认证）再委派给共享 fetch handler | `index.js:820-845` |
| 请求/响应桥接 | ✅ `bridge()` 把 node:http 请求转成 Fetch `Request`、把返回的 `Response` 写回 socket（含 abort 传播） | `index.js:34-100` |
| 该 API 在 0.2.0-rc.1 是否已有 | ✅ 有（同样的 `get fetch()`），迁移不会把最低版本抬高 | 工程内 `node_modules/@deepseek-ai/dsh-client-connection/lib/index.js:581` |

**这是本方案最大的一处"基于官方基座 + 减依赖"：删掉 `src/host/rpc-route.ts`（174 行自建 HTTP 路由 + 自建请求体上限 + 自建 body/envelope 解析 + 自建鉴权调用），换成约 40 行的 `connection.fetch.register` 适配器；`inject` 去掉 `webServer`，peer 去掉 `dsh-host-webserver`。**

### 1.5 其它官方基座部件（新功能可直接用）

| 部件 | 用途 | 证据 |
| --- | --- | --- |
| `@deepseek-ai/dsh-atomic-write` | `writeFileAtomic(path, content, {mode, dirMode})` + `withFileLock(path, fn, {waitMs})`，**零依赖**，`wx` 独占临时文件 + rename 提交、跨进程写锁、死锁接管 | `lib/types/index.d.ts` |
| `@deepseek-ai/dsh-home-paths` | `dshHomePath(...)` / `resolveDshHome()`（尊重 `$DSH_HOME`）、`canonicalizeWatchPath()`（Windows 安全监听路径） | `lib/types/index.d.ts` |
| `settings.documentPath`（已注入） | 直接给出当前 profile 的 patch 路径 → `dirname` 即 profile 目录 | `dsh-settings/lib/types/index.d.ts` |
| `ctx.workspaceRegistry` | 规范化的工作区根路径（`Workspace.path` 为 `fs.realpath` 结果） | `dsh-workspace/lib/types/types.d.ts:57-65` |
| `@deepseek-ai/dsh-client-ui-primitives` | 官方 `Button/Input/Switch/Pill/Tag/StateDot/SegmentedControl/Modal/DisclosureRow/RiskConfirmation/Toast`，只依赖 `--dsw-*` token | `lib/types/index.d.ts` |
| `@deepseek-ai/dsh-host-plugin-inventory` | 根入口已 `export type * from './types.ts'`，可把现有的深路径导入 `.../types` 换掉 | `lib/types/index.d.ts` |
| `@deepseek-ai/dsh-config-editor` | `documentPath` / `entries()` / `configuration()` / `edit(entry, change)`，官方 profile patch 编辑面 | `lib/types/index.d.ts` |

### 1.6 现状盘点（当前插件的实际依赖面）

`grep` 出的真实 bare import（16 个）：

```
@deepseek-ai/cordis                        @deepseek-ai/dsh-mcp-client
@deepseek-ai/cordis-plugin-loader (type)   @deepseek-ai/dsh-settings
@deepseek-ai/dsh-agent                     @deepseek-ai/dsh-timeout  ← 只用了 MAX_TIMER_DELAY_MS
@deepseek-ai/dsh-client-connection         @deepseek-ai/dsh-tools
@deepseek-ai/dsh-client-connection/client  @deepseek-ai/schemastery
@deepseek-ai/dsh-client-locale/client      react
@deepseek-ai/dsh-client-ui-renderer/client (type)
@deepseek-ai/dsh-client-ui-settings/client (type)
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-host-plugin-inventory/types  ← 深路径，应改根入口
@deepseek-ai/dsh-host-webserver              ← 迁移后可删
```

而 `peerDependencies` 声明了 20 个，其中**在本仓库任何位置都没被引用的 7 个**：`dsh-attachment`、`dsh-brand`、`dsh-invariants`、`dsh-llm`、`dsh-scope`、`dsh-session`、`dsh-subprocess`。`devDependencies` 有 30 项，其中 20 项是 `@deepseek-ai/*@0.2.0-rc.1` 精确 pin，`pnpm-workspace.yaml` 还为此维护了 40 行 `minimumReleaseAgeExclude`。

注意"被引用"分两种，二者的处理不同（这决定删哪些 peer）：

| 类别 | 判定方式 | 是否需要 peer |
| --- | --- | --- |
| **值导入**（运行时真的会加载） | 构建产物 `lib/index.js` / `lib/client.js` 里还能看到 | **必须**，否则解析路由无拦截层，profile 里必然找不到 |
| **类型导入**（`import type` / `import type {}`，构建后被擦除） | 只在 `src/**` 出现，产物里没有 | 运行时不必要，但**建议保留**：兼容门只检查 peer，保留才能让 dsh 升级时把浏览器半边的 API 漂移也照出来 |
| **`dsh.client.inject`** 里列的包 | `package.json` 字段 | 是浏览器模块表的加载契约，应同时出现在 peer 里以接受兼容门检查 |

实测构建产物（当前版本）：

- `lib/index.js` 的运行时外部依赖**只有 4 个**：`@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-settings`、`@deepseek-ai/dsh-timeout`、`@deepseek-ai/schemastery`。
- `lib/client.js` 的运行时外部依赖**只有 2 个**：`react`、`react/jsx-runtime`；`dsh-client-*` 全部是类型导入，已被擦除（浏览器插件拿到的是页面注入的 `ctx`，不是自己 import 框架）。

所以"减依赖"的正确切法是：**删掉完全没被引用的 7 个**，而不是删掉所有类型导入的包。

### 1.7 mcp.json：官方**没有任何**支持

在 `0.2.1-alpha.1` 的 292 个 `@deepseek-ai/*` 包中检索 `mcp.json` / `mcpServers`，除 `dsh-acp`（ACP 协议里客户端传入的 `mcpServers` 字段）外**零命中**。本机已有的事实标准文件：

| 文件 | 结构 |
| --- | --- |
| `~/.pi/agent/mcp.json`、`~/.codebuddy/.mcp.json` | `{"mcpServers": {"<name>": {"command": "...", "args": []}}}`（Claude Code 系） |
| `~/.config/Code/User/mcp.json` | `{"servers": {"<name>": {"type": "stdio", "command": ..., "args": [...]}}, "inputs": []}`（VS Code 系） |

所以"`.dsh/profiles/xxx/mcp.json` 兼容 + 用户级 + 项目级"是**本插件要新增的能力**，而不是对齐现有官方行为。这正好是它相对官方基座不可替代的价值。

---

## 2. 总目标与量化指标

| 指标 | 现状 | 目标 |
| --- | --- | --- |
| `peerDependencies` | 20 | 12（P0 完成）→ 14（P1 增加 `dsh-atomic-write`、`dsh-home-paths`） |
| `dependencies` | 1（schemastery） | 0（转 peer，共用运行时实例） |
| Host 运行时外部依赖 | 4（mcp-client / settings / timeout / schemastery） | 3（mcp-client / settings / schemastery）→ P1 5 个 |
| 自建 HTTP 传输代码 | 174 行（`rpc-route.ts`，含自建鉴权/限额/编解码） | ≈40 行官方适配器 |
| Host `inject` | `webServer, settings, connection, tools` | `settings, connection, tools`（+ 按需 `pluginInventory`） |
| MCP 配置来源 | 只有 Loader entry Config | 4 级：项目 > 配置（profile）> 用户 > entry（遗留兼容） |
| 升级守卫 | 无 | `pnpm check:compat` + 静态 import/peer 一致性测试进 CI |
| 必须保持 | `tests/` 53 例全绿；`lib/` 与源码零漂移（CI 已校验） | 同上 |

---

## 3. 方案 A（P0）：依赖精简

### A1. 用官方 `connection.fetch` 取代自建路由

**新增** `src/host/rpc-channel.ts`（替换 `src/host/rpc-route.ts`）：

```ts
// 关键点：channel 与 endpoint 的拆法由客户端 assertTarget 决定
//   CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/   → channel 必须是单段，只能传 "/api"
//   ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/
//   client: rpc.call('/api', `mcp-manager/${endpoint}`, payload) → POST /api/mcp-manager/<endpoint>
// Host: 每个 endpoint 注册一条精确 Fetch 路由
const ROUTES = ['snapshot','upsertServer','removeServer','setServerEnabled','reloadServer','setToolEnabled'] as const

export function registerManagerRpcRoute(ctx, channel, endpoint, dispatch) {
  return ctx.effect(() => ctx.connection.fetch.register({
    path: `${channel}/${endpoint}`,          // 例：/api/mcp-manager/snapshot
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => { /* 认证已由 /api 物理路由完成；只做 content-type + 2 MiB + envelope 校验 + dispatch */ },
  }))
}
```

要点与收益：

- **鉴权**由 Connection 的物理 `/api` 路由 `admit()` 完成（Host/Origin 防 DNS rebinding + 浏览器令牌），删除 `ctx.connection.requestRejection` 手工调用与 401/403 分支。
- **不存在** `owner.webServer` 问题（这是 `rpc.handle()` 一直失败的原因）。
- 与 `dsh-api-gateway` 的 `/api` 拦截器无冲突（精确路由优先，且它的 `claimsEndpoint` 只认 2 段端点）。
- 请求体：`bridge` 的 buffered 上限是 Connection 配置的 `maxRequestBodyBytes`（默认 300 MiB）。**插件必须在 handler 内自行坚持 2 MiB 上限**（先看 `content-length`，再在解析后复核），不要依赖传输层。
- 响应：直接返回 `new Response(JSON.stringify(serverResponse), {headers:{'content-type':'application/json'}})`，`bridge` 原样回写。
- 客户端 `src/client/api.ts` 只改一行：`rpc.call('/api', \`mcp-manager/${endpoint}\`, payload, signal)`；`src/types.ts` 的 `MCP_MANAGER_CHANNEL` 拆成 `MCP_MANAGER_API_CHANNEL = '/api'` + `MCP_MANAGER_ENDPOINT_PREFIX = 'mcp-manager'`。
- `src/host/index.ts`：`inject` 去掉 `'webServer'`；README/注释里那段"为什么不用 `connection.rpc.handle()`"补上"也不能用 `intercept`（api-gateway 独占）"的理由，并把结论改成"用官方 `connection.fetch.register`"。

**验收**：新增 `tests/rpc-channel.spec.ts`，用真实 `HostConnectionService`（`new HostConnectionService(ctx, [...], fakeBrowserAuth)`，参考现有 `tests/host-load.spec.ts` 的 `RecordCredentials` double）+ 假 `webServer` 收集路由；断言：6 条路由注册在 `/api/mcp-manager/*`；把它们交给 `createSharedFetchHandler('/api')` 后，一个 `POST /api/mcp-manager/snapshot` 的 Fetch 请求能拿到合法 `server-response` 外壳；`GET` 与超长 body 被正确拒绝。同时把 `tests/host-load.spec.ts` 的拓扑保留为"回归护栏"。

### A2. 删掉只是为了一个常量的 `dsh-timeout`

`src/settings.ts` 只用了 `MAX_TIMER_DELAY_MS`。改为本地常量（值 `2**31 - 1`）或从 `@deepseek-ai/cordis-plugin-timer` 取；删 `dsh-timeout` peer。`tests/config-validation.spec.ts` 里已有的"与 mcp-client 默认值奇偶校验"保留。

### A3. 深路径导入收敛

- `import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'` → 改为包根（根入口已 `export type *`）。
- `@deepseek-ai/dsh-client-connection/client`、`dsh-client-locale/client`、`dsh-client-ui-settings/client`、`dsh-client-ui-renderer/client` **保留**（这是官方约定的浏览器半边入口，且写在 `package.json.dsh.client.inject` 里）。
- `src/client/index.ts` 里 `dsh-client-ui-renderer/client` 只是 `type {}` 空导入（构建后已擦除，不构成运行时依赖）。保留它是因为它带来 `SlotsMap`/JSX 的类型增强；P2 迁移 UI 基元后若 `typecheck` 不再需要，可连同 peer 一起删（列为"待验证"）。
- `@deepseek-ai/cordis-plugin-loader` 保持现状（只在 `devDependencies`，源码里是 `import type {} from`，用于 `loader/volatile-update` 事件类型），与同作者的 `dsh-web-search-tavily` 做法一致；不要为了"整齐"把它提成 peer。
- 深路径与类型导入的规则写进 `tests/dependency-surface.spec.ts` 的注释，避免后人反复踩。

### A4. schemastery 从 dependency 变 peer

```diff
- "dependencies": { "@deepseek-ai/schemastery": "~3.18.4" },
+ "dependencies": {},
+ "peerDependencies": { "...": "...", "@deepseek-ai/schemastery": ">=3.18.4 <3.19.0" }
```

- 依据：1.3 的解析路由（peer-only 会被路由到运行时副本，commandcode 已验证可行）+ 运行时确有 `@deepseek-ai/schemastery@3.18.5-alpha.1`。
- 收益：插件与 `dsh-settings` 共用同一个 schemastery（避免 3.18.4 / 3.18.5-alpha.1 双实例带来的 schema 身份歧义）；profile 少装 3 个包。
- 风险与回退：若 0.2.0-rc.1 运行时的 schemastery 是 3.18.4 而范围写成 `~3.18.5-alpha.1`，会解析失败。**因此范围写成 `>=3.18.4 <3.19.0`**，并在验收里各跑一次 0.2.0-rc.1 / 0.2.1-alpha.1。若仍不稳，回退为 dependency（这是唯一一处"减依赖"与"稳"冲突时的让步点）。

### A5. devDependencies 与 pnpm 配置

- devDeps 里 22 项 `@deepseek-ai/*` 统一升到 `0.2.1-alpha.1`（类型面已确认零变化），并保留一组 `0.2.0-rc.1` 的 `compat` 配置用于"双版本 typecheck"（见 B3）。
- `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 从 40 行缩到实际安装的少数几行（去掉所有不再安装的包）。
- `package.json` 增加 `keywords: ["dsh-plugin","dsh","deepseek-harness","mcp"]`、`engines.node`（与 dsh 对齐：`^22.19.0 || >=24.0.0`）、`dsh.manifestVersion: 1`、可选的 `icon`（官方 `readPluginMeta` 支持 SVG/PNG/JPEG/WebP ≤256 KiB，Plugins 页会显示）。

**A 阶段产出**：peer 20 → **12**。保留 11 个有引用的（`cordis`、`dsh-agent`、`dsh-client-connection`、`dsh-client-locale`、`dsh-client-ui-renderer`、`dsh-client-ui-settings`、`dsh-client-ui-slots`、`dsh-host-plugin-inventory`、`dsh-mcp-client`、`dsh-settings`、`dsh-tools`），加上由 `dependencies` 迁入的 `schemastery`；删除 9 个（`dsh-attachment`、`dsh-brand`、`dsh-invariants`、`dsh-llm`、`dsh-scope`、`dsh-session`、`dsh-subprocess`、`dsh-host-webserver`、`dsh-timeout`）；`dependencies` 1 → 0；少 174 行自建传输。P1 再补 2 个（`dsh-atomic-write`、`dsh-home-paths`），最终 14。

---

## 4. 方案 B（P0）：升级兼容性守卫

### B1. peer 范围策略（冻结规则）

| 包类别 | 范围写法 | 理由 |
| --- | --- | --- |
| `@deepseek-ai/dsh*` | **保持 `^0.2.0-rc.1`** | 兼容门用 `includePrerelease`，已实测接受 0.2.1-alpha.1；同时挡住 0.3.x |
| `@deepseek-ai/cordis` | `~4.0.4`（现状） | 兼容门不检查它；运行时是 `4.0.5-alpha.1`，`~4.0.4` 加 includePrerelease 也接受，Cordis 只在 dev 期用类型 |
| `@deepseek-ai/schemastery` | `>=3.18.4 <3.19.0` | 见 A4 |
| 新增 `@deepseek-ai/dsh-atomic-write` / `dsh-home-paths` | `^0.2.0-rc.1` | 同 dsh 系 |

**不要**为了"更保险"改成精确 pin（如 commandcode 的 `0.2.1-alpha.1`）：那样每次 dsh 打补丁都要跟着发版，否则插件被兼容门禁用。`^0.2.0-rc.1` + 兼容门 + 豁免文件是官方推荐路径。

### B2. `engines.dsh` 声明

`package.json` 加：

```json
"engines": { "dsh": ">=0.2.0-rc.1 <0.3.0", "node": "^22.19.0 || >=24.0.0" }
```

`@deepseek-ai/dsh-package-manifest` 明确写了 `engines.dsh` 是**声明式**的（"DSH compatibility is declarative until a reader enforces it"），真正的强制来自 peer + 兼容门。两者都写，UI 与日志才有完整信息。

### B3. 新增两个守卫（进 CI）

1. **`scripts/check-dsh-compat.mjs`**（`pnpm run check:compat`）
   直接 `import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'`，喂 `package.json` + 运行中的 dsh 版本，不匹配就 `process.exit(1)` 并打印 `pluginCompatibilityWarning`。CI 里对 **0.2.0-rc.1 与 0.2.1-alpha.1 两个版本**各跑一次。
   这一条把"用户升级 dsh → 插件忽然不出现"从线上问题变成 CI 红灯。

2. **`tests/dependency-surface.spec.ts`**
   两条断言：
   - **值导入**（源码里非 `import type` 的 `@deepseek-ai/*` specifier）必须全部出现在 `peerDependencies` —— 这是 1.3 那条"解析路由靠 peer 建拦截层"的直接守卫；
   - `package.json.dsh.client.inject` 里的每个包也必须出现在 `peerDependencies`（浏览器模块表契约 + 兼容门覆盖）。
   实现上把 `/client`、`/types` 等子路径归一到包名后再比对；`import type` 的包只需存在于 `devDependencies`（`cordis-plugin-loader` 即属此类）。

3. （可选，P1 之后）**`scripts/verify-upgrade.mjs`**：在临时目录用两个版本的 `@deepseek-ai/*` 各 `tsc --noEmit` 一遍 `src/`，覆盖"类型面漂移"。

### B4. 文档化豁免流程

README「Compatibility」一节补上：

```bash
dsh plugin allow-version          # 或插件管理器里的授权入口
# 会写入 ~/.dsh/profiles/<profile>/compatibility.json：
# { "@junjiangao/dsh-web-mcp-manager@<ver>": ["<dsh-ver>"] }
```

并说明"**精确到 plugin@version 与 dsh version**，且需要显式确认风险"。

---

## 5. 方案 C（P1）：`.dsh` 多级 `mcp.json` 兼容（功能增强主体）

### C1. 作用域与优先级

| 级别 | 路径 | 说明 |
| --- | --- | --- |
| 项目级（最高） | `<workspace>/.dsh/mcp.json` | 只在该项目生效；`realpath` 规范化后必须落在已注册工作区内 |
| 项目级兼容读 | `<workspace>/.mcp.json` | Claude Code 约定，**只读**（除非用户在面板显式选择"接管"，才写回 `.dsh/mcp.json`） |
| 配置级（profile） | `~/.dsh/profiles/<profile>/mcp.json` | 本 profile 私有（新建服务的默认落点） |
| 用户级 | `~/.dsh/mcp.json` | 跨 profile/项目共享；**`$DSH_HOME` 优先**，用 `dshHomePath()` 解析 |
| 遗留层（最低） | Loader entry `web-mcp-manager` 的 `Config.servers` | 现有安装的存量数据；只读展示 + 显式迁移 |

同一 `serverName` 冲突时按上表优先级取胜，**面板必须把被遮盖的条目显示为只读并标注"被 X 级覆盖"**，而不是静默丢弃。

### C2. 文件格式（读宽写严）

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/junjiangao/dsh-web-mcp-manager/main/schema/mcp.schema.json",
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "cwd": "",
      "env": { "GITHUB_TOKEN": "${env:GITHUB_TOKEN}" },
      "toolCallTimeoutMs": 60000,
      "reconnect": { "enabled": true, "initialDelayMs": 500, "maxDelayMs": 30000, "maxAttempts": 10 },
      "enabled": true,
      "sensitive": { "env": ["GITHUB_TOKEN"], "headers": [] }
    },
    "web": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:MCP_TOKEN}" }
    }
  }
}
```

**读（兼容）**：

- 顶层键：`mcpServers`（主）或 `servers`（VS Code，别名）。
- `type`：`stdio` | `http` | `streamable-http` | `streamableHttp` → 归一为 `streamable-http`；`sse` → **明确失败**并给出人话原因（`dsh-mcp-client` 不支持 SSE），不静默降级。
- `enabled: false` 或 `disabled: true` → 停用；`disabledTools: [...]`（dsh 扩展）→ 逐工具开关。
- `args` 必须是数组；字符串形式明确报错（不猜、不 split）。
- 未知字段**保留原样**（读—改—写往返不丢字段），这是与其它 MCP 工具互操作的前提。

**写（严格）**：`JSON.stringify(doc, null, 2) + "\n"`；2 空格缩进；键顺序稳定（先 `$schema`，再 `mcpServers`，服务器内按固定字段序）；不写 `undefined`。

### C3. 变量插值（Host 侧，读取时）

支持 `${env:NAME}`、`${NAME}`、`${NAME:-default}`（Claude Code / Cursor 系语法）。

- 展开**只发生在构造 `dsh-mcp-client` Config 的那一刻**，不写回文件、不进面板。
- 未解析的变量 → 该服务状态置 `failed`，错误信息写明缺哪个变量名（**不静默跳过**）。
- 面板对"值是模板"的键显示为"来自环境"，只读且不参与 `envSensitive` 掩码逻辑。
- 与之对应，`sensitive.env/headers` 用于标记**字面量**密钥；若未声明，按 `/(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH)/i` 兜底推断。

### C4. 读写与并发（全部走官方能力）

- 写：`withFileLock(path, () => read-modify-write, { waitMs: 5000 })` 包住 `writeFileAtomic(path, text, { mode: 0o600, dirMode: 0o700 })`。
- 权限：文件可能含字面量密钥 → 默认 `0o600`；不含字面量密钥时 `0o644`。项目级文件写 `.dsh/mcp.json` 时同样 `0o700` 目录。
- 读：`fs.readFile` + `JSON.parse`，失败（文件不存在）视为空层；**解析失败视为该层错误**（面板显示"项目级 mcp.json 有语法错误：…"，其余层继续生效），绝不因为一个坏文件让整个面板不可用。
- 监听：`fs.watch` 每个存在的源文件（`canonicalizeWatchPath` 规范化）+ 250 ms 去抖；目录不存在时监听其最近的已存在祖先，文件出现后自动接管。变更 → 重读 → 只 reconcile 受影响的 server id（复用现有 `PerKeyQueue`）。
- 自写抑制：写入前记录 `content hash`，watcher 收到同 hash 事件直接丢弃，避免自激循环。

### C5. 路径解析（用官方面，不猜）

| 目标 | 解析方式 |
| --- | --- |
| dsh home | `dshHomePath()`（尊重 `$DSH_HOME`） |
| profile 目录 | `dirname(ctx.settings.documentPath)`（官方给出的当前 profile patch 路径）；取不到时回退 `ctx.get('configEditor')?.documentPath` |
| 项目根 | 渲染进程传入"当前工作区 id"，Host 侧用 `ctx.workspaceRegistry` 查 `Workspace.path`（已 `realpath`）；**拒绝任何不在注册表内的路径**，防止 RPC 变成任意文件写入 |

### C6. 迁移与"遗留层"处理

- 面板在"遗留层"存在服务器且配置级 `mcp.json` 不存在时，显示一个**显式**的「迁移到 `profiles/<p>/mcp.json`」按钮；迁移是"写入 + 校验读回成功 + 才清空 entry Config"，任一步失败不改动原数据。
- 迁移不做自动触发（现有 README 明确"不自动迁移"，保持一致）。
- 迁移后保留 `"x-dsh-migratedFrom": "loader-entry@2026-10-04"` 之类的注释性字段，便于审计。

### C7. 面板与协议改动

- `Snapshot` 增加 `sources: SourceView[]`：
  ```ts
  interface SourceView { scope: 'project'|'profile'|'user'|'entry'; path: string; exists: boolean; writable: boolean; serverCount: number; error?: string }
  ```
- `ManagedServerView` 增加 `scope`、`shadowedBy?: scope`、`fromTemplate: {env: string[], headers: string[]}`。
- 端点扩展：`upsertServer` / `removeServer` / `setServerEnabled` 增加 `scope` 字段；新增 `moveServer {id, from, to}`。
- 删除安全：删除只作用于它所在的层；若上层有同名覆盖，删除后下层会"浮现"，面板必须在确认框里说清楚。

### C8. 明确不做的事

- 不写 `<workspace>/.mcp.json`（只读兼容）；想接管必须由用户显式选择，接管只写 `.dsh/mcp.json`。
- **`disabledTools`（逐工具开关）继续只存在 Loader entry `Config` 里**，不写进任何 `mcp.json`。理由：它是"这台机器上这个 profile 的面板策略"，不是可移植的服务器定义；放进三份文件会产生三处策略副本与写入放大。键仍是 server id（不变）—— 同名服务器只有优先级最高的那一层会被挂载，不存在策略串台；当上层文件被删除、下层同名服务器"浮现"时，原策略继续适用，这是期望行为。
- 不做 SSE 传输。
- 不把解析后的环境变量值写回任何文件。

---

## 6. 方案 D（P2）：UI 与官方基座对齐 —— 落地结果

### 6.1 entry 层读写改走官方 `ctx.configForms`（已完成）

`src/client/entry-form.ts` 把 entry 层（旧 Loader entry 的 `Config`）的读写交给官方共享表单：

- 读：`ctx.configForms.get('web-mcp-manager')` 的 `ConfigFormSnapshot`（`value` 已由官方 `redactSecrets` 脱敏、`revision`/`writable`/`mode` 官方维护）。
- 写：`form.mutate(pathOps)` 按路径改字段。**这是唯一安全的写法**——`env`/`headers` 声明为 `role('secret')`，其值在过线前就被删除，任何"重述整个 server"的写都会静默丢掉浏览器从未收到的凭据；路径写只动用户真正改过的那几个键。

由此删除的 Host 代码（都在 `src/host/controller.ts`）：

| 删除项 | 原因 |
| --- | --- |
| `write()` / `settings.replace()` | entry 文档不再由 Host 写 |
| `assertRevision()` / `SettingsConflictError` 分类 | 官方 `mutate` 自带 revision fence 与拒绝恢复 |
| `enqueueMutation()` / `mutationTail` | 文件写由 `mutateScopeFile` 的跨进程锁保证原子；entry 写由官方表单串行 |
| `setToolEnabled` 端点 | `disabledTools` 是 entry 文档的一部分，改由表单写 |
| `revision()` / `snapshot.revision` | 客户端不再需要读 revision |
| 各请求的 `expectedRevision` 字段 | 同上 |

RPC 端点从 6 个减到 5 个，且**只覆盖 `mcp.json` 各 scope 与运行时状态**；显式指定 `entry` 或以 entry 为赢家的写请求会以 `bad-request` 拒绝，而不是提供第二条无 fence 的写路径。

一处刻意的取舍：**entry 层的"显示读"仍由 Host 的解析快照提供**。Host 本来就必须合并 `project → profile → user → entry` 才能挂载服务器，面板渲染这份唯一的优先级真相，比在浏览器里再合并一份副本更不容易分叉；官方 mirror 另外提供可用性/可写性与 revision。

### 6.2 面板迁移到官方 UI 基元（已完成）

`src/client/McpSection.tsx` 的交互控件全部换成 `@deepseek-ai/dsh-client-ui-primitives`：

`Button`（primary/outline/ghost）、`Input`、`Checkbox`、`Switch`、`Tag`、`StateDot`、`SegmentedControl`（scope 与 transport）。面板删掉了自维护的按钮/输入框/徽标/chip 样式常量与对应的 hover CSS，只保留布局、卡片 hover、`<details>` 箭头、原生 `select`/`textarea` 度量，以及两处刻意的例外：

- `.mcp-fill`：官方 `Input` 把 `className` 放在自己的 inline-flex wrapper 上，只给内层 input 设宽度撑不满。
- `[data-mcp-danger]`：官方 `Button` 没有 destructive variant，删除/移除按钮用描边按钮 + 该属性上色。

刻意**没有**采用的部分及理由：

- `SettingsFormModel` / `SettingsForm` / `SettingsValueField`：它们的字段是**同一 namespace 内的扁平标量路径**（`settingsTextField('field')` 生成 `['field']`）。本插件的编辑器是一个 server 字典，且一半写入目标是**没有 namespace 的 `mcp.json` 文件**；`SettingsForm` 还是"离开页面即丢弃、不提供取消"的页面框，而这里是带显式取消的内联卡片。
- `DisclosureRow`：它是带图标的操作行折叠组件，语义上不优于原生 `<details>`。

顺带修正了一处无障碍语义：`SegmentedControl` 之前被包在 `<label>` 里（一个 `<label>` 只能关联一个表单控件），会使每个 segment 的可访问名变空；现在分组控件走新的 `FieldGroup`（`<div>` + 文案），`<label>` 只留给单个原生控件。

### 6.3 面板状态迁到官方 store（已完成）

`src/client/manager-store.ts` 用官方 `@deepseek-ai/dsh-client-store` 的 `createSnapshotStore` 持有面板的 Host 视图（`status` / `snapshot` / `error` / `pollFailed` / `busy` / `message` / `projectPath`），并在 `index.ts` 里和两个传输层并列创建，组件用 `useSyncExternalStore` 读它。组件只留真正的本地编辑态（`query`、`draft`）与一个新的确认弹窗态。

这不是纯装饰性重构，收益是**可测性**：原先"单调 seq、只有最新请求能发布、后台读失败不丢弃已有快照、失败的后台读不碰操作消息"这套规则活在组件 effect 里，唯一能观察它的方式是一个等真实轮询周期的 jsdom 用例（2.1 s 睡眠）。现在它是 `manager-store.ts` 里对着假传输就能直接断言的普通代码：`tests/manager-store.spec.ts` 用假定时器覆盖全部规则，面板 spec 里那个 2.1 s 的等待被删除，jsdom 用例从 2442 ms 降到 340 ms。

顺带修正一处语义：卸载页面时 `AbortController` 触发的中止不再被记成"轮询失败"（`signal.aborted` 直接返回），这是刻意拆除，不是故障。

### 6.4 删除确认改用官方 `RiskConfirmation`（已完成）

`window.confirm` 换成官方 `RiskConfirmation`（内部就是 `Modal`）：带警示文案、必须勾选"我明白这会删除该服务的配置"、确认按钮在勾选前禁用，并提供取消与关闭。删除一个服务定义会同时移除它的逐工具策略且无法撤销，值得一道显式确认；迁移只是复制，不加确认。

### 6.5 `locale/*.json` 的 `meta` 多语言（此前已完成）

核对结论：`dsh-app-boot` 的 `readPluginMeta` 读 `<specifier>/locale/en.json`，再用同目录下所有 `*.json` 组字典，取值路径是 `parsed.meta.title` / `parsed.meta.description`；`package.json` 的 `exports` 里有 `"./locale/*.json"`。本仓库的 `locale/zh.json`、`locale/en.json` 早已是 `{"meta": {"title", "description"}}` 结构，与读取路径一致，**无需改动**。

### 6.6 仍未做（方案内的可选项）

- `package.json` 的插件 `icon`：官方 `readPluginMeta` 支持 SVG/PNG/JPEG/WebP ≤256 KiB，但需要一个真实图标资源，属于品牌决策，未擅自生成。
- `scripts/verify-upgrade.mjs`：在临时目录用两个 `@deepseek-ai/*` 版本各 `tsc --noEmit` 一遍 `src/`，覆盖"类型面漂移"。当前 `check:compat`（版本门）+ `dependency-surface`（解析面）已覆盖声明区间，该脚本是更重的双装校验，暂缓。

---

## 7. 分批落地计划（每批可独立验收）

| 批次 | 内容 | 写作用域（文件） | 依赖 |
| --- | --- | --- | --- |
| **P0-1** | 传输层换官方 `connection.fetch`；`inject` 去 `webServer` | `src/host/rpc-channel.ts`(新) `src/host/rpc-route.ts`(删) `src/host/index.ts` `src/host/controller.ts` `src/types.ts` `src/client/api.ts` `tests/rpc-channel.spec.ts`(新) `tests/rpc-route.spec.ts`(删) `tests/host-load.spec.ts` | — |
| **P0-2** | peer/devDep 版本、`engines.dsh`、pnpm 配置瘦身 | `package.json` `pnpm-workspace.yaml` `.github/workflows/ci.yml` | — |
| **P0-3** | 删 7 个无用 peer、`dsh-host-webserver`、`dsh-timeout`；深路径收敛；schemastery 转 peer | `package.json` 相关 `src/**` 少量 | P0-1 |
| **P0-4** | 兼容守卫 | `scripts/check-dsh-compat.mjs`(新) `tests/dependency-surface.spec.ts`(新) `.github/workflows/ci.yml` `README*.md` | P0-2/3 |
| **P1-1** | 源抽象：scope 解析 + 读/解析/合并 + 插值 | `src/host/mcp-sources.ts`(新) `src/host/interpolate.ts`(新) `src/types.ts` `tests/mcp-sources.spec.ts`(新) `tests/interpolate.spec.ts`(新) | — |
| **P1-2** | 文件读写 + 锁 + 监听（官方 atomic-write / home-paths） | `src/host/mcp-file.ts`(新) `tests/mcp-file.spec.ts`(新) `package.json`(peer) | P1-1 |
| **P1-3** | controller/protocol 接入 scope；项目根经 workspaceRegistry 校验 | `src/host/controller.ts` `src/protocol.ts` `src/settings.ts` | P1-1/2 |
| **P1-4** | 面板：来源徽标、scope 选择、只读遮盖提示、迁移入口 | `src/client/McpSection.tsx` `src/client/draft.ts` `src/client/locales.ts` `locale/*.json` `tests/McpSection.spec.tsx` | P1-3 |
| **P2-1** | 官方 UI 基元迁移 | `src/client/McpSection.tsx` `package.json` `vitest.config.ts`(新) `tests/stubs/ui-primitives.tsx`(新) | P1-4 |
| **P2-2** | entry 层读写改走官方 `configForms` | `src/client/entry-form.ts`(新) `src/client/McpSection.tsx` `src/client/index.ts` `src/client/api.ts` `src/host/controller.ts` `src/protocol.ts` `src/types.ts` `src/settings.ts` | P1-4 |
| **P2-3** | 面板状态迁官方 `dsh-client-store`；删除确认改 `RiskConfirmation` | `src/client/manager-store.ts`(新) `src/client/McpSection.tsx` `src/client/index.ts` `src/client/locales.ts` `tests/manager-store.spec.ts`(新) `package.json` | P2-1 |

**流程约束（沿用本仓库既有做法）**：

- 源码改动后必须 `pnpm run build`，并把 `lib/` 变更一起提交 —— CI 有 `git diff --exit-code -- lib/` 的零漂移校验。
- 每批合并前至少跑：`pnpm typecheck && pnpm test && pnpm build && pnpm check:compat`。
- P0 与 P1 涉及同一批文件（`controller.ts`/`types.ts`/`McpSection.tsx`），**串行执行**，不要并行改同一文件。

---

## 8. 验收标准

**功能回归（每批都跑）**

- [ ] `pnpm typecheck` 通过；`pnpm test` 全绿（≥53 例，新增用例只增不减）。
- [ ] `pnpm build` 后 `git diff --exit-code -- lib/` 为空。
- [ ] `pnpm check:compat` 在 0.2.0-rc.1 与 0.2.1-alpha.1 两个版本上都通过。

**P0 专项**

- [ ] 桌面/Web profile 启动无 `cannot get property "webServer" without inject`，无插件兼容告警。
- [ ] `grep -rn "webServer" src/host/ src/client/` 无命中（注释里的历史说明除外）。
- [ ] `ls ~/.dsh/profiles/<profile>/node_modules/@deepseek-ai/` 不再出现 `schemastery`、`cosmokit`、`@standard-schema`。
- [ ] 面板一次完整往返（list → 新增 stdio 服务 → 保存 → `loaded` → 工具出现在模型工具表 → 停用工具 → 删除）成功。

**P1 专项（mcp.json）**

- [ ] 在项目级 `<repo>/.dsh/mcp.json` 写入一个 server → 面板出现该条目且带"项目级"徽标；`<repo>/.mcp.json` 中的同 id 被覆盖并标注只读。
- [ ] 外部 `$EDITOR` 修改 `~/.dsh/mcp.json` → 面板 ≤1 s 内反映，无需重启；MCP 工具集按新配置重连。
- [ ] 写出的文件权限为 `0600`、目录 `0700`；同目录并发两个写入进程不产生丢失更新（`withFileLock` 生效）。
- [ ] 语法损坏的某一层只让该层报错，其余层与面板继续工作。
- [ ] `${env:X}` 在配置里保持模板形态（面板不回显值）；`X` 未设置时该服务状态为 `failed` 且错误信息含变量名。
- [ ] `dsh plugin` 之外的任何 MCP 客户端（pi / Codebuddy / VS Code 格式）读取本插件写出的文件不报错。
- [ ] 迁移：遗留 entry 层服务器迁移到 profile `mcp.json` 后工具仍在；中途失败时原数据未变。

**安全**

- [ ] 项目级 scope 只接受 `workspaceRegistry` 中已注册的工作区路径；伪造一个 `/etc` 路径的 RPC 被拒绝（新增单测）。
- [ ] 面板响应中不出现任何明文密钥（沿用现有 `SecretState`；新增 `fromTemplate` 也不携带解析后的值）。

---

## 9. 风险与回退

| 风险 | 概率 | 影响 | 缓解 / 回退 |
| --- | --- | --- | --- |
| `connection.fetch.register` 在用户的 dsh 0.2.0-rc.1 上行为差异 | 低（两版实现逐行同源） | 面板全挂 | P0-1 在双版本上跑集成测试；回退即还原 `rpc-route.ts`（一个 commit） |
| schemastery 转 peer 后在某些运行时解析失败 | 中 | 插件加载失败 | 范围写成 `>=3.18.4 <3.19.0`；失败即回退为 `dependencies` |
| 官方精确路由丢失 2 MiB 请求体上限 | 确定 | 理论 DoS 面扩大（需已通过浏览器认证） | handler 内自校验 `content-length` + 解析后复核；文档记录 |
| `.dsh/mcp.json` 与其它工具抢写同一文件 | 中 | 覆盖用户配置 | 自写 hash 抑制 + `withFileLock` + 未知字段原样保留 + 写前重新读 |
| 项目级路径被 RPC 滥用 | 低 | 任意文件写入 | 只认 `workspaceRegistry` 的 `Workspace.path`（已 realpath）；白名单式校验 + 单测 |
| 官方 UI 基元在 0.2.0-rc.1 与 0.2.1-alpha.1 间签名变化 | 低 | 面板渲染失败 | P2 可与 P0/P1 解耦，最后做；出问题单独回退 |
| 一次改太多导致 `lib/` 漂移 | 中 | CI 红 | 按批次提交，每批都 `pnpm build` 后提交 `lib/` |

---

## 10. 与官方路线的关系（为什么这个插件仍然值得存在）

官方基座在 0.2.1-alpha.1 里给了：MCP 客户端（`dsh-mcp-client`，一服务器 = 一条 Loader entry）、插件管理（`dsh-plugin-manager` + Plugins 页）、配置编辑（`configEditor`/`settings`/`configForms`）、文件原子写、UI 基元、兼容门。

**官方没有给的**，正是本插件的立足点：

1. 在 `cordis.patch.yml` 之外维护 MCP 服务器——官方只能把它们写成 Loader entry（混进 Cordis 组合，且改一个服务器要动整个 patch 文件）；
2. **跨工具可互操作的 `mcp.json`**（Claude Code / Codex / pi / VS Code / Codebuddy 生态）+ 用户级 / 项目级分层；
3. MCP 生命周期与逐工具开关的**可视化运维**（状态、工具清单、重连观察）。

所以本方案的原则是：**能力尽量从官方借（传输、鉴权、写文件、UI、配置读写、兼容门），只在官方确实没有的地方留自研代码**——这与"减少依赖、基于官方基座、避免升级不兼容"三个要求是同一件事。

---

## 附录 A：本次核查用到的命令

```bash
# 运行时版本与全部官方包
node -e "console.log(require('<DSH>/package.json').version)"
ls <DSH>/node_modules/@deepseek-ai | wc -l          # 292

# 官方 API 契约（npm registry 可用 0.2.1-alpha.1）
npm pack @deepseek-ai/dsh-{settings,mcp-client,client-connection,client-ui-settings,host-plugin-inventory,tools,timeout,app-boot,atomic-write,home-paths,workspace,config-editor,client-ui-primitives}@0.2.1-alpha.1
diff -rq node_modules/@deepseek-ai/<pkg>/lib/types <tarball>/package/lib/types

# 兼容门实现
grep -n "function evaluatePluginCompatibility" -A 30 <DSH>/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js
# semver 实测
node -e "const s=require('<DSH>/node_modules/semver');console.log(s.satisfies('0.2.1-alpha.1','^0.2.0-rc.1',{includePrerelease:true}))"   # true

# 解析路由
grep -n "var ResolutionRouter = class" <DSH>/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js
# 官方 rpc / fetch 面
grep -n "get rpc()\|get fetch()\|registerFetchRoute\|registerInterceptor" <DSH>/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js
# /api 拦截器已被 api-gateway 占用
grep -rn "rpc.intercept(" <DSH>/node_modules/@deepseek-ai/*/lib/*.js

# mcp.json 在官方零支持（"mcp.json" 无命中；"mcpServers" 仅 ACP 协议字段）
grep -rl "mcp\.json" <DSH>/node_modules/@deepseek-ai/          # 空
grep -rl "mcpServers" <DSH>/node_modules/@deepseek-ai/         # 仅 dsh-acp
```
