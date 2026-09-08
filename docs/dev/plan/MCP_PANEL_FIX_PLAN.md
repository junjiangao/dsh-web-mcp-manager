# MCP 面板缺陷修复计划

- 基线：HEAD `8345fda`
- 范围：配置编辑正确性 → 并发保护 → 生命周期 → 测试与发布保障
- 原则：RPC 协议、settings 存储格式、`types.ts` 公共契约不变；Host 校验与 revision 冲突语义不变

## 1. 问题清单与核实结论

按影响程度排序，全部 8 项均已通过源码核查；问题 3、5 另有本机运行时验证。

| # | 优先级 | 问题 | 核实结论 |
| --- | --- | --- | --- |
| 1 | 高 | 编辑草稿可能覆盖其他页面的修改 | `src/client/McpSection.tsx:492-498` `save` 使用轮询更新后的 `snapshot.revision`。页面 A 开始编辑、页面 B 保存、A 轮询拿到新 revision 后提交旧草稿，Host 接受写入，冲突保护失效 |
| 2 | 高 | 删除环境变量/请求头行后旧值仍存在 | 删除按钮（`McpSection.tsx:649`）仅从草稿移除行，`secretPatch`(:383) 不为消失的键产出 patch；`mergeSecretMap`(`src/protocol.ts:174`) 明确保留未提交键。重命名键同样遗留旧键 |
| 3 | 中 | 参数编辑不能无损保存 | `McpSection.tsx:343` `args.join('\n')` 与 :366 `split+trim+filter(Boolean)` 破坏空白、丢弃空参数、无法往返含换行参数。本机实测 `@deepseek-ai/dsh-mcp-client` Config 接受 `["a",""," padded "]`（`z.array(String)`），无损提交可行 |
| 4 | 中 | 键名输入可能逐字符失焦 | `McpSection.tsx:627` 行 React key 含可编辑的 `entry.key`，键名变化使整行重挂载（React 元素身份，代码级确认） |
| 5 | 中 | 服务 ID 浏览器校验失效 | `McpSection.tsx:555` `pattern="[-A-Za-z0-9_]{1,32}"` 在 v 模式下非法；本机实测 `new RegExp('[-A-Za-z0-9_]{1,32}','v')` 抛 `Invalid character in character class`，且 `[\-A-Za-z0-9_]{1,32}` 实测通过 v 编译。现有测试只覆盖普通 JS 正则 |
| 6 | 中 | 不同服务的生命周期被全局串行化 | `src/host/controller.ts:303` 所有服务共用 `lifecycleTail`，队列等待 `fiber.await()`；mutation 写配置后又 `await` 该队列，慢启动拖住其他服务的重载/停用与后续写操作 |
| 7 | 中 | 轮询可能覆盖较新状态并过早清除错误提示 | `useVisiblePolling`(`McpSection.tsx:407-439`) 2 秒 setInterval 不等前次、无响应顺序保护；`accept`(:457) 每次成功清 `message`，保存失败/冲突提示被吞 |
| 8 | 工程 | 操作路径测试与发布产物一致性缺失 | 现有 `tests/protocol.spec.ts`、`tests/config-validation.spec.ts` 仅覆盖校验与协议函数；无 CI（无 `.github/`）；`lib/` 产物随仓库提交 |

## 2. 修复设计

### 2.1 阶段一：配置编辑正确性（客户端）

**F1 草稿冲突保护（问题 1）**
- `ServerDraft` 增加 `baseRevision`；`draftFromServer(server, revision)` 记录打开编辑器那一刻的 `snapshot.revision`，新增服务同样固定。
- `save` 用 `draft.baseRevision` 作 `expectedRevision`，不再读轮询后的 `snapshot.revision`。
- 冲突（`McpManagerRpcError.code === 'conflict'`）时保留草稿并显示提示，提供「重新加载最新配置」动作（rebase：用当前 snapshot 中该服务的最新视图重建草稿，明确告知丢弃草稿修改）。不引入 force 覆盖参数。

**F2 删除/重命名生效 + 稳定行 ID（问题 2、4）**
- `SecretDraft` 增加 `uid`（模块级自增计数器，草稿生命周期内稳定）与 `originalKey?`（`draftFromServer` 时记录既有键，新增行为 `undefined`）。
- `SecretFields` 以 `uid` 作 React key（修复失焦）。
- patch 生成对比 `originalKey` 与当前条目集合：
  - 键未变 → 按现值（`{clear:true}` 或新值）；
  - 键变更（重命名）→ 旧键 `{ clear: true }` + 新键新值；
  - 行被删除 → 该 `originalKey` 输出 `{ clear: true }`。
- 重复键校验：`duplicateDraftKeys` 检测 trim 后重复键，`save` 前拦截并提示。
- `envSensitive`/`headerSensitive` 保持 full-list 语义，删除键自动从敏感列表消失。

**F3 参数无损编辑（问题 3）**
- `ServerDraft.args: string[]`，`draftFromServer` 直接拷贝 `server.args`，移除 join/split/trim/filter。
- 新增 `ArgsFields` 逐项编辑器（每行一个参数输入 + 删除 + 添加），逐项编辑不做 trim。
- `draftPatch` 原样提交 `draft.args`（含空串、首尾空格、含换行参数），所见即所存；Host 已实测接受空串参数。

**F4 HTML pattern 修复（问题 5）**
- ID 输入框 pattern 改为 `[\-A-Za-z0-9_]{1,32}`（源码中写作 `[\\-A-Za-z0-9_]{1,32}`）。
- 抽取纯函数到新模块 `src/client/draft.ts` 并导出（`ServerDraft`/`SecretDraft` 类型、`draftFromServer`、`draftPatch`、`secretPatch`、`sensitiveKeys`、`duplicateDraftKeys`、`SERVER_ID_PATTERN`），`McpSection.tsx` 改为导入，为测试提供可测入口。

### 2.2 阶段二：并发与状态管理

**F5 轮询与消息分离（问题 7）**
- 无重叠：in-flight 标志，tick 时上一请求未完成则跳过。
- 顺序保护：组件级单调递增 seq（`useRef`），轮询、手动刷新、操作的所有快照响应统一按 seq 应用，过期响应丢弃。
- 错误分离：
  - `pollFailed`（布尔）：轮询连续失败显示轻提示（`role="status"`），成功后清除；首次加载失败仍进入 error 态；
  - `actionMessage`：仅由用户操作设置与清除，轮询成功不再清除；提供关闭按钮；新操作成功时清除、失败时覆盖。

**F6 生命周期按服务串行与超时（问题 6）**
- `lifecycleTail` 替换为 per-id 队列：`Map<string, Promise<void>>`（新模块 `src/host/keyed-queue.ts` 的 `PerKeyQueue`：`enqueue(key, task)`、`drain()`、错误隔离），不同服务互不阻塞；`reconcileAll` 的 `Promise.all` 语义保持。
- mutation（upsert/remove/setEnabled）写完配置后 **不再 await** 本服务 reconcile（`void` 触发），与设计文档「先持久化、再调整运行状态、分别呈现结果」一致；写入串行（`mutationTail`）与 revision 校验保持不变。`reloadServer` 保持等待本服务队列（per-id + 超时兜底）。
- 超时边界：`START_TIMEOUT_MS = 30_000`、`DISPOSE_TIMEOUT_MS = 15_000`（初值，可调）：
  - `fiber.await()` 超时 → `status='failed'`、error 记录超时，保留 fiber 引用供后续 dispose；状态更新前检查 `runtime.fiber` 引用，防迟到完成覆盖新操作结果；
  - `fiber.dispose()` 超时 → 记录警告并继续（防卸载阻塞）。
- `dispose()` 先 `drain()` 所有 per-id 队列，再 `await mutationTail`，最后逐 runtime dispose。

### 2.3 阶段三：工程保障

**F7 测试补齐**（详见第 3 节）

**F8 CI 与产物一致性**
- 新增 `.github/workflows/ci.yml`：checkout → 安装 pnpm → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm build` → `git diff --exit-code -- lib/`（重建产物零差异，防止源码与提交产物漂移）。
- 两个宿主版本（`0.1.2-rc.1`、`0.1.3-alpha.1`）的运行验收保留人工步骤（CI 无法起 DSH GUI），命令见第 4 节。

**F9 文档落地**
- 本文件即修复计划文档（`docs/dev/plan/MCP_PANEL_FIX_PLAN.md`）。
- 同步小改 `docs/dev/plan/MCP_PANEL_PLAN.md` 第 4.5 节（每服务串行 + 超时）与第 7 节（测试清单）。
- 源码修改后运行 `pnpm build` 重建并提交 `lib/` 产物（仓库约定源码与产物同步）。

## 3. 测试计划

- `tests/draft.spec.ts`：删除已有 env 行生成 `{clear:true}` 且 `mergeServerPatch` 后旧键消失；重命名 = 旧键 clear + 新键 set；重复键拦截；args 无损往返（`[" padded ", "", "ok"]`、含换行参数）并以 `mcp-client` Config 接受性锁定；无编辑时 patch 幂等；`new RegExp(SERVER_ID_PATTERN,'v')` 编译通过且与 `validateServerId` 行为一致。
- `tests/keyed-queue.spec.ts`：per-key 顺序、跨 key 并行、错误隔离、drain。
- `tests/McpSection.spec.tsx`（vitest jsdom + @testing-library/react + user-event，devDeps 增加 `jsdom`、`@testing-library/react`、`@testing-library/user-event`）：保存携带打开时 revision；冲突后草稿保留且后续轮询成功不清除提示；删除 env 行提交 clear；键名编辑输入框保持挂载（焦点不丢）；慢轮询响应晚到不覆盖新快照。
- `tests/controller.spec.ts`（fake Host 上下文桩，经公开 `handle()` 驱动）：revision 冲突返回 conflict；服务 A 启动挂起时服务 B 的写操作不被阻塞；启动超时标记 failed。
- `tests/config-validation.spec.ts` 补充 pattern v 模式用例。

## 4. 验收标准

- `pnpm typecheck`、`pnpm test` 全绿；新增测试覆盖全部修复路径。
- 本地 `pnpm build` 后 `git diff --exit-code -- lib/` 零差异（与 CI 同款检查）。
- 手工验收（隔离 DSH profile）：
  1. 双页面冲突：A 编辑中 B 保存，A 保存被拒且草稿保留，可 rebase；
  2. 删除/重命名 env 键后 `settings.yaml` 中旧键消失；
  3. 参数含空格/空串/换行保存后往返一致；
  4. 键名输入不丢焦；
  5. 浏览器端 ID pattern 校验生效（非法 ID 阻止提交）；
  6. A 服务慢启动时 B 服务可独立启停；
  7. 保存失败提示在轮询下保持可见；
  8. `0.1.2-rc.1` 与 `0.1.3-alpha.1` 双版本冒烟。

## 5. 公共 API / 数据流变化

- 不变：RPC 协议、`ServerPatch`/`SecretInput`/`SecretPatch`、settings schema、存储格式、revision 冲突语义、Host 校验。
- 客户端内部：`ServerDraft.args: string[]`；`SecretDraft` 增 `uid`/`originalKey`（仅组件内部状态，不跨 RPC）。
- Host 内部：`lifecycleTail` → per-id 队列（行为变化：不同服务生命周期不再互等）；mutation 不等待 reconcile（保存响应与加载结果分离，与既有设计文档一致）；启动/卸载超时上限。
- locale（`src/client/locales.ts`）新增 `pollFailed`、`rebase`、`duplicateKey`、`dismiss`、`argument`、`argsHint`，调整 `args` 文案，zh/en 同步。

## 6. 边界情况与失败模式

- 保存冲突：草稿保留 + rebase 提示，提示不被轮询清除；rebase 时服务已被删除则关闭草稿。
- 删除敏感键：patch 含 clear，敏感列表同步移除。
- 重命名为已存在键：客户端重复键校验拦截为第一道防线。
- 空串/带空格参数：原样提交（Host 已实测接受）。
- 启动超时后 fiber 迟到完成：fiber 引用比对防止状态回退；迟到 fiber 由下一次 reload/dispose 清理。
- 卸载：先 drain 队列再 dispose；dispose 超时仅告警不阻塞。
- 轮询与操作响应交错：seq 单调递增丢弃过期响应；组件卸载 AbortController 终止。

## 7. 实施顺序与状态

1. ✅ F4 + 草稿模块抽取（`src/client/draft.ts`）
2. ✅ F2 + F4（uid/originalKey、删除/重命名 clear、重复键校验、稳定 key）
3. ✅ F3 参数逐项编辑
4. ✅ F1 baseRevision + 冲突 UI
5. ✅ F5 轮询重构
6. ✅ F6 per-id 队列 + 超时
7. ✅ F7 测试补齐
8. ✅ F8 CI
9. ✅ F9 文档同步 + `lib/` 产物重建

### 实施结果（2026-09-08）

- **代码**：`src/client/draft.ts`（纯函数 + `SERVER_ID_PATTERN`）、`src/host/keyed-queue.ts`（`PerKeyQueue`）；`src/client/McpSection.tsx`、`src/client/locales.ts`、`src/host/controller.ts` 改造完成。
- **测试**：新增 `tests/draft.spec.ts`（7）、`tests/keyed-queue.spec.ts`（5）、`tests/McpSection.spec.tsx`（5）、`tests/controller.spec.ts`（4），连同既有 14 个用例共 **35 个全部通过**；`pnpm typecheck` 干净。devDeps 新增 `jsdom`、`@testing-library/react`、`@testing-library/user-event`、`@testing-library/dom`、`react-dom@18`（与 react 18 匹配）。
- **产物**：`pnpm build` 重建 `lib/` 并验证**构建幂等**（连续两次 build 的 lib diff 一致），CI 的 `git diff --exit-code -- lib/` 检查可行。
- **CI**：`.github/workflows/ci.yml` 已落地（typecheck → test → build → lib 一致性）。
- **遗留人工验收**：双页面冲突复现、env 键删除/重命名落盘、args 往返、焦点、pattern 浏览器校验、慢启动服务隔离、`0.1.2-rc.1` 与 `0.1.3-alpha.1` 双版本冒烟（见第 4 节，需隔离 DSH profile 执行）。
