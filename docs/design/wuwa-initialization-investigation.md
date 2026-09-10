# WuWa 完整初始化链路调查

核查日期：2026-09-10。分支：main。范围：点击人物卡、开场准备、原生会话、MVU 初值保存及卡片自检。本文记录现状，不代表整卡兼容已验证。

## 当前结论

真实会话的 journal 回放确认：12:10:37.208，`tavern-helper.messages` 在 revision 5981 将 `openingInitialization.status` 改成 `complete`，15 个开场变量均已保存。此前只看阶段性 snapshot 会漏掉后续写入；本次使用生产 `createChatJournalStore.read()` 回放。

同一个 loadId 的时间线（北京时间）：

| 阶段 | 时间 |
| --- | --- |
| 官方 MVU 下载开始 | 12:09:05.447 |
| 官方 MVU 执行完成 | 12:09:05.842 |
| subscriptions-ready | 12:09:06.009 |
| 伴随脚本 mouse 错误 | 12:09:06.435 |
| 宿主判断初值超时 | 12:09:21.916 |
| 全部开场变量保存 | 12:10:37.208 |
| 浏览器确认 initialization-ready | 12:10:37.548 |

约 92 秒后最终完成；15 秒提示失败不代表初始化任务已经停止。现有日志不能进一步证明 90 秒具体耗在哪一个 await，不能据此归因到某一个网络请求。

## 完整调用链

1. **选择卡片**：`src/client/main.js` 的 `preparePlayConversation` 调用 `getCardOpenings`，等待期间 UI busy。
2. **投影开场**：`lib/index.js:getCardOpenings` 读取卡片、扩展、预设正则，固定远程脚本依赖，调用 `projectCardOpeningPreviews`。本卡有 15 个开场、549 条世界书。全部开场 HTML 投影会放大返回体，需与脚本启动耗时区分。
3. **准备页运行时**：`lib/domain/opening-preparation.js:create` 建立内存 draft、世界书副本、单条带 15 个 swipe 的合成消息，并初始化 EJS 变量。此时还不是正式游戏的变量存档。
4. **进入游戏**：`lib/domain/conversation-initialization.js:initialize` 建立 Tavern Chat，设置 MVU pending，为全部开场分配空变量，发布 Chat，并经 `appendNativeOpening` 写入原生会话。准备页世界书可转入正式局；正式 MVU 变量仍需要初始化。
5. **宿主投影**：`projectTavernHelperContext` 提供消息、当前 swipe 变量、世界书、脚本变量与扩展设置。浏览器执行者加载共享脚本 iframe；多窗口执行权与 iframe 生命周期也是前置条件。
6. **脚本启动**：`main.js:buildTavernHelperScriptParts` 先加载宿主 jQuery/UI，再依次加载官方 MVU 和伴随脚本。模块完成指顶层执行完成，不保证其异步 ready 回调结束。官方 Mvu 全局可用后才继续伴随脚本。
7. **MVU 聊天初始化**：host-build 在官方 `main.ts` 中加入等待 `__dshTavernCompanionScriptsReady`，之后串行 `transitionToChat → initChatLevel → initCharacterSettingsOverride → initInitvar → initCheck`。
8. **读取初值**：`upstream/src/function/initvar/variable_init.ts` 读取已有变量、绑定世界书，解析 `[initvar]` 条目并合并，生成 schema。该条目即使 disabled 也会作为初始化输入，不应为了初始化把它打开。若世界书已初始化且无新增，`is_updated=false` 会直接返回。
9. **执行每个开场**：对 15 个 swipes 执行 `Promise.all`；各自处理开场 `<initvar>` 覆盖，然后等待 `VARIABLE_INITIALIZED` 监听器、`updateVariables`。全部完成后才调用一次 `setChatMessages({swipes_data})`。一个开场或监听器迟迟不返回，就会拖住这次批量保存。
10. **跨边界写入**：客户端 `setChatMessages → updateTavernHelperMessages` RPC，经 `lib/domain/tavern-script-host-adapter.js:updateMessages` 修改 Chat，检查所有开场有 `stat_data/schema`，写 journal 并置 complete，返回新 context。
11. **浏览器就绪**：`main.js:syncMvuDataReadiness` 依据 context 检查当前变量，清除错误并报告 initialization-ready。计时器超时只改变展示状态，没有取消上游初始化。
12. **卡片自身自检**：开场 HTML 独立检查 parent/global/DOM 标志。这不是 MVU 初值保存的确认，也不是宿主实际 EJS 能力的可靠替代。

## 已确认的负担与兼容边界

- 上述约 92 秒中有 654 次 Chat 写入：651 次提示词、2 次变量、1 次消息；610 次仅改变版本号和时间戳。卡片剧情逻辑每秒调用提示词同步；宿主 `withScript` 在回调结束后等待该脚本的 pending 提示词写入清空。无效写入是确定存在的负担，但尚未证明它独自造成全部等待。
- 一次核心 `subscriptions-ready` 不能表示所有伴随脚本及其异步初始化完成。当前诊断缺少每个伴随模块、每个 MVU 初始化 await 的耗时，导致超时提示不能定位卡点。
- 当前 `schema` 为字符串“没有用别管这个”。上游 `schema.ts` 明确将它视为 mvu_zod 兼容标记并转成 any，不能称为数据损坏。日志另有 expected object schema but got any；是否影响具体变量更新需要实际更新验证，不能把日志归属的 scriptId 直接认作报错代码来源。
- 卡片通过 `ST_WIN = window.parent` 后检查 `ST_WIN.SillyTavern...EjsTemplate.enabled`；宿主已有局部 facade 和 EJS readiness 投影，但直接 parent/top 属性重写不覆盖这种别名。自检的“未检测到”不能直接解释为 EJS 没实现。
- 世界书控制检查 DOM `#wb-float-monitor` 或全局 `SWITCHER_CONFIG`，仍需验证对象位于哪个文档，以及脚本是否完成；不能直接伪造标志消除红灯。
- 仍有 jquery-ui ESM 的 mouse 错误。宿主完整 UI 已加载不代表外部模块使用的是同一个 jQuery 实例。

## 后续验证优先级

1. 在单一执行者、隔离新局中记录 companion barrier、initCheck、逐 swipe 回调、prompt drain、最终保存的起止。预测：可区分模块未完成、回调/写入队列阻塞、批量开场放大三种原因。
2. 对相同提示词写入构造生产路径回归，验证去掉无效写入是否缩短初始化。不能仅提高超时阈值。
3. 分别验证 EJS 实际求值、世界书实际控制、一次 MVU 更新及刷新恢复；然后修正自检的访问边界。

本次只调查，未改变运行时代码、卡片内容和正式存档。未进行生成模型正文的验证。


## 已补充的验证与通用日志

本次已补上初始化计时，而非改变初始化策略：

- 通用 `initialization-timing` 经现有 MVU 诊断 RPC 写入日志，随“日志”ZIP 的 `mvu/diagnostics.json` 导出。记录伴随脚本整体等待和逐模块加载、世界书读取、初始化事件监听器、回调、提示词 drain，以及提示词/变量/消息写入。
- 按阶段和脚本 ID 聚合次数、失败数、总耗时、最大耗时、pending 数、最早 pending 等待时间。约每 5 秒采样，32 组上限，启动后最多 3 分钟；不保存脚本源码、RPC 参数、变量值。异步脚本身份的既有边界不因此消失。
- 更深层的官方 bundle await 计时仅在隔离测试启用：测试使用 AST 包裹初始化 await，保持原产物不变；正式环境没有重写官方 bundle。一般日志覆盖宿主边界，并不声称覆盖官方每一个内部 await。
- 补齐旧浏览器 smoke 的本地 runtime-assets 路由、真实世界书读取、提示词写入；增加临时目录的生产 Journal/ChatPersistence。测试数据与用户正式局隔离。

实测（暖资源缓存，真实卡片，隔离执行者；不是完整正式 UI 的端到端结果）：

| 用例 | 结果 |
| --- | --- |
| WuWa 15 个开场，生产 Journal | 最终一轮 4287ms；全部保存；0 次模型调用 |
| 刷新已初始化的隔离页 | 15 个开场变量仍完整 |
| 中性卡伴随脚本故意延迟 20 秒 | 20505ms 完成；5/10/15 秒日志可定位 slow-companion pending |
| 上述延迟卡套正常 15 秒门槛 | 断言失败，证明验证器能捕获慢初始化 |
| 延迟卡套预期延迟断言 | 通过；明确观察到 pending 后完成 |
| 相关 Node 测试 | 99 项通过 |

原运行环境的约 92 秒等待没有在隔离测试复现，仍未定位其根因。EJS、世界书控制的实际交互和 schema 整理报错没有因此判定修好。正式酒馆已重启加载通用计时，下一次复现可从导出日志定位宿主等待边界。

复跑方法（从仓库根目录运行；CARD_PATH 指向本机卡片 JSON，别把私人卡片提交进仓库）：

```sh
MVU_SMOKE_TRACE=1 MVU_SMOKE_JOURNAL=1 MVU_SMOKE_CARD_PATH="$CARD_PATH" node tests/fixtures/mvu-initialization-browser-smoke.mjs
```

在真实浏览器打开输出 URL 的 `?mode=opening-card`，等待初始化。然后执行：

```sh
node tests/fixtures/verify-mvu-initialization.mjs http://127.0.0.1:PORT opening-card-trusted
```

同服务打开 `?mode=opening-slow`，20 秒后：

```sh
node tests/fixtures/verify-mvu-initialization.mjs http://127.0.0.1:PORT opening-slow-trusted --expect-slow
```

去掉 `--expect-slow` 应触发 15 秒门槛失败。冷缓存联网耗时可能改变结果；测试使用的缓存状态必须随结果说明。验证器不会自动点击卡片或生成模型正文。
