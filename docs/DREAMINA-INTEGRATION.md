# 接入 Dreamina（即梦）能力

> 记录一次可行性评估：把 <https://dreamina.capcut.com> 的网页生图能力，变成站点后端可调用、前端用户可消耗积分的通道。
> 结论分两条路：**面向用户走官方 API，自用/内测走浏览器桥**。桥已经实现，见 `scripts/dreamina-bridge/`。

## 1. 先说结论

**你们的模型缺口其实已经补上了。** `shared/studio.ts` 的 `WAVESPEED_MODEL_OPTIONS` 里就有 `bytedance/seedream-v5.5/edit`，本地 D1 里也有一条 `endpointMode: "wavespeed"` 的通道在用。即梦底层就是 Seedream 系列，所以「模型能力」不是这次要解决的问题。

真正缺的是这两样，而它们只能靠登录态拿到：

1. **额度**：网页端用你自己账号的套餐/免费点数，边际成本接近 0；WaveSpeed 是按张计费。
2. **网页端独有功能**：智能画布、组图（一次多张分镜）、视频生成、Agent 模式等，聚合站只暴露了「一张图进、一张图出」。

所以选型的关键不是「能不能调」，而是**你打算把它给谁用**。

| 路线 | 边际成本 | 稳定性 | 能否对外经营 | 工作量 | 维护 |
| --- | --- | --- | --- | --- | --- |
| A. 官方 API（火山方舟 / BytePlus ModelArk） | 按张计费（约几毛/张） | 高，SLA 有保障 | ✅ 可以 | 中（加第 4 家通道） | 低 |
| B. 浏览器桥（本机已登录的 Chrome） | ≈ 0（吃你的套餐） | 中，依赖页面结构与风控 | ⚠️ 不建议 | 低（已实现） | 中，改版要修锚点 |
| C. 纯 HTTP 重放（Cookie + 自造签名） | ≈ 0 | 低 | ❌ 不要做 | 高 | 极高 |

## 2. 为什么不做「纯 HTTP 重放」

拆了 `dreamina.capcut.com` 的前端：`static/sidecode/` 下有 `cdnSecurity`、`headBdmsEndAndArgusStart`、`headArgusEndAndSecurityEnd` 三个分片，是字节的 Argus / bdms 风控 SDK；业务接口走同源 `/api/biz/v1/...`，由页面内 SDK 现签 `sign` / `a_bogus` / `device_time` / `web_id`。

这意味着：

- 抓一次请求的完整 URL 存下来重放，签名与时间戳绑定，**几分钟就会失效**；
- 自己造签名要逆向混淆 + wasm 的 SDK，还得复刻设备指纹；
- 非浏览器 TLS 指纹（尤其是 Workers 的出口）容易被风控直接拦。

结论：**C 是最差的选择**——投入最大、最不稳定，而且一旦官方改版，前面全白做。要「用登录态」就老老实实用浏览器当执行环境，也就是 B。

## 3. 已验证的页面事实

这些都是在本机无头 Chrome 里实测出来的，不是猜测：

| 事实 | 证据 |
| --- | --- |
| 生成页可用稳定测试钩子定位 | `[data-testid="dreamina.generator.submit"]` |
| 提示词框不是 textarea，是 tiptap / ProseMirror 的 contenteditable | `div[aria-label="Prompt"].tiptap.ProseMirror` |
| 写入提示词后提交按钮由 `disabled=true` 变 `false` | `execCommand('insertText')` 后实测翻转 |
| 未登录点击提交会弹登录墙 | 弹出 `Sign in to start creating` |
| 网页端当前图片模型 | 侧栏显示 `Seedream 5.5` |

> 注意：SSR 首屏 HTML 里会出现 `<textarea aria-label="Prompt">`，那是水合前的占位标记，**不要**按 textarea 写选择器，否则登录后必定失效。

## 4. 方案 B：浏览器桥（已实现）

设计要点：**请求永远发生在真实页面里**。浏览器负责登录态与签名，桥只负责「填词 → 点击 → 收图 → 暴露 HTTP」。

```
前端(积分) → Worker(server/aiProviders.ts) → Cloudflare Tunnel → 本机 bridge.mjs
                                                                    ↓ CDP
                                                          已登录的 Chrome 标签页 → dreamina 页面
```

接口刻意做成和现有 WaveSpeed 通道同构的「提交 + 轮询」，好处是 Worker 侧几乎照抄 `runWaveSpeedGeneration` 的轮询骨架：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 页面是否挂对、是否登录、模型提示 |
| POST | `/v1/images/generations` | `{ prompt, ref_images? }` → `{ id }` |
| GET | `/v1/images/generations/{id}` | `{ status, stage, error, images[] }` |
| GET | `/v1/proxy?url=` | 代理 CDN 图片，解决防盗链与 URL 过期 |

启动与自检见 [`scripts/dreamina-bridge/README.md`](../scripts/dreamina-bridge/README.md)。

### 为什么不能复用你日常浏览器的登录态（实测结论）

这是接入时最容易低估的一步。三条路都试过，全部走不通：

| 尝试 | 结果 |
| --- | --- |
| 直接在默认用户目录上开 `--remote-debugging-port` | Chrome 136+ 直接拒绝，端口不监听 |
| 把默认目录做成目录联接（junction），用新路径启动 | 端口能开（路径字符串校验被绕过），但 App-Bound 加密按路径绑定，`sessionid` 解不开，Chrome 把解不开的 Cookie **从库里删掉** |
| 关闭 Chrome，把 `Local State` + `Cookies` 拷到桥专用目录 | 同样因 App-Bound 解密失败被丢弃，只剩 `ttwid` / `_ga` / `x-web-secsdk-uid` 这类非鉴权项 |

结论：**必须在桥专用配置里登录一次**，没有捷径。判断登录态也不要匹配页面文案（会误判），要读 Cookie：`sessionid` / `sid_tt` 存在才算登录。桥的 `/health` 已经按这个口径返回 `loggedIn`。

而且被删掉的 Cookie **无法从磁盘回收**：删除后空闲页被清零，实测该库 196,608 字节中 98.3% 是零字节，只剩 7 条存活行，扫不到任何旧的 `encrypted_value` 记录。所以「先实验、出问题再从库里捞回来」这条路是不存在的。

> 血的教训：调试「复用现有配置」时，Chrome 会打开 `last_used` 指向的那个配置（`Local State` 里可查，如 `"last_used":"Profile 4"`）。用联接指向真实目录启动，会清掉那个配置里的登录态。做这类实验前先确认目标配置，或干脆只碰独立的桥配置。

### 稳定性设计

- **全局串行队列**：单账号并发容易触发风控，也违背网页端行为。宁可慢，不要多开。
- **窗口必须在前台**：这是最反直觉的一条。只 `Page.bringToFront` 激活标签页不够——窗口被别的窗口压住时 CSS `:hover` 不生效，「下载」这类悬停浮层永远不渲染。桥会用 `user32.SetForegroundWindow` 真正激活窗口（`DREAMINA_WINDOW_TITLE` 可配）。
- **启动参数要关后台节流**：`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion`。否则标签页 `visibilityState` 是 `hidden`，页面不渲染，出图也不显示。
- **先滚到底再采集**：结果区是虚拟列表，图片滚出视口会被卸载、滚进来才挂载。不滚动就永远收不到新图（这是第一次跑必超时的真正原因）。
- **只认生成结果**：结果图走 `*-dreamina-sign-*.capcutcdn-us.com`（URL 里带 `aigc` 标记）。实测不加过滤会把 `tiktokcdn` 上的营销横幅（4080×459）当成出图，所以同时用「域名 + aigc 标记 + 长宽比 ≤ 3.5」三重过滤。
- **超时按分钟算**：网页端当前默认是 `Seedream 5.0 Flash / 2K / 4 张`，一次生成数分钟起步。桥的默认超时已调到 480s（`DREAMINA_JOB_TIMEOUT_MS`）。
- **基线差分**：提交前快照页面已有图片，提交后只收新增的。注意：如果同一会话里有人同时手动画图，基线会被污染——桥账号应专用。
- **登录墙快速失败**：点击后 2.5s 检测登录弹窗，立刻报错而不是干等超时。
- **选择器只在两处**：提示词框与提交按钮。改版后跑 `probe.mjs` 重新定位，其余逻辑不动。

### 原图下载（三段式，缺一不可）

网页端出图给的是 `aigc_resize_mark` 预览（实测 480×640），改 URL 参数会被 CDN 拒（签名绑定路径）。原图只能走页面「下载」动作：

1. **悬停**结果卡片 → 浮出 `Download` 工具栏（按钮只在 hover 后渲染）
2. 点 `Download` → 弹出「Remove AI watermarks」偏好弹窗（首次）
3. 点 `Save preference` → 文件才真正落到下载目录

下载文件名是中文（`dreamina-2026-11-20-1647-<提示词>.jpeg`），返回给客户端时必须用 RFC 5987 编码，不能直接塞进 HTTP 头。

实测原图：**1776×2368 / ~0.9 MB**。注意水印开关默认是关的（保留 AI 水印）；开启后生成的图不再打水印，但会写入账号偏好，属用户自己的选择，桥不去动它。

### 图生图

参考图走「粘贴注入」而不是 file input（未登录态页面根本没有 file input，登录后也不稳定）：

1. 桥在 Node 侧下载参考图字节
2. base64 注入页面，构造 `File` + `DataTransfer`
3. 向提示词区派发 `ClipboardEvent('paste')`
4. 编辑器出现 `ref-0` 缩略图后，正常填词提交

实测：参考图 + 改色提示词 → 70 秒出图，原画构图保留、目标元素按指令改色，说明参考图确实参与了生成。

## 5. 方案 A：官方 API（建议对外）

即梦同源的 Seedream 模型在字节的开放平台上提供标准图片生成接口（国内火山方舟、国际 BytePlus ModelArk）。这条路要花钱，但换来的是稳定的并发、明确的 SLA、合规的使用条款——**面向付费用量，这是唯一站得住的选择**。

> 具体模型 ID、单张价格与限流以你控制台当前展示为准（本文档编写时无法从当前网络访问其文档站）。仓库里 `bytedance/seedream-v5.5/edit` 这条 WaveSpeed 记录可以作为「模型确实存在」的旁证。

好消息是改造量不大：他们的通道抽象本来就是 `provider → endpointMode → 提交/轮询`，官方接口形状几乎一样。

## 6. 仓库改造清单

不论走 A 还是 B，落地位置相同。

### 6.1 `shared/studio.ts`

- `ImageProviderId` 增加 `'dreamina'`；
- `ProviderParamsMap` 增加 `DreaminaParams`：`endpointMode: 'bridge' | 'ark'`、`aspectRatio`、`resolution`、`count`、`modelVersion`；
- `PROVIDER_META.dreamina` 填 `defaultBaseUrl`（桥地址或官方地址）与 `docUrl`；
- `DEFAULT_PROVIDER_PARAMS.dreamina`；
- `STUDIO_ARTISTS` 增加第 4 位画师人设（前台会多一张画师卡，这是唯一需要顺手调 UI 的地方）；
- `PROVIDER_ORDER` 决定画师顺序。

### 6.2 `migrations/0008_provider_dreamina.sql`

D1 改不了 `CHECK` 约束，照 `0002_providers_grok.sql` 的老路：建新表 → 拷数据 → 改名。
需要覆盖 `provider_configs`、`model_profiles`、`provider_channels`，以及 `generation_jobs` 里所有带 `provider_id` 的约束。

> 顺带一提：`0001_init.sql` 里原本就有 `qwen` / `doubao` 两个槽位，`0002` 才收敛成 `gemini / gpt / grok`。再加一个「豆包系」槽位属于熟路，不用重新设计表。

### 6.3 `server/aiProviders.ts`

新增一个分支，形状与 `runWaveSpeedGeneration` 一致（提交拿 id → 轮询 → 下载字节）：

```ts
// endpointMode === 'bridge' 时，apiKey 存的是 DREAMINA_BRIDGE_TOKEN
const headers = { 'content-type': 'application/json', 'x-bridge-token': apiKey }

const submit = await fetchUpstream(
  `${baseUrl}/v1/images/generations`,
  { method: 'POST', headers, body: JSON.stringify({ prompt, ref_images: refUrls }) },
  env,
  30_000
)
const taskId = String(submit.json?.id || '')
if (!taskId) throw new UpstreamError('Dreamina 桥未返回任务 ID', false, 502, false)

while (Date.now() - startedAt < 240_000) {
  await sleep(2500)
  const poll = await fetchUpstream(
    `${baseUrl}/v1/images/generations/${taskId}`,
    { headers: { 'x-bridge-token': apiKey } },
    env,
    25_000
  )
  const status = String(poll.json?.status || '')
  if (status === 'succeeded') {
    // 走代理下载，避免 CDN 防盗链 / 签名过期
    const img = await fetchUpstream(`${baseUrl}${poll.json.images[0].proxy}`, {}, env, 60_000)
    return { bytes: new Uint8Array(await img.res.arrayBuffer()), mime: 'image/png', ext: 'png' }
  }
  if (status === 'failed') throw new UpstreamError(String(poll.json?.error || '生成失败'), false, 400, false)
  await onStage?.('generating', poll.json?.stage || '正在绘制中…')
}
throw new UpstreamError('Dreamina 生成超时', false, 504, false)
```

两个坑：

- **不要走美国中继**。`fetchUpstream` 只在 `GEO_RESTRICTED_HOSTS` 命中时才转发，隧道域名不会命中，保持直连即可；如果桥部署在境内机器上，更不要加。
- **超时要放宽**。网页端排队 + 出图经常 60~120s，现有 120s 轮询上限定死了会误判超时，桥模式下建议 240s。

### 6.4 `src/routes/admin.index.tsx`

参数面板加一块：通道模式（桥 / 官方）、Base URL、Token、默认画幅与张数。密钥仍走现有 AES-GCM 加密存储，不回传前端。

### 6.5 计费

沿用现有积分账本，按「张」扣费。桥模式下边际成本为 0，但**必须加两道闸**，否则一个账号会被瞬间打穿：

- 单用户每日张数上限；
- 全局每日总张数上限（对应你账号的套餐额度）。

失败自动全额退款走现有逻辑即可，不用改。

## 7. 风险与合规

这一节请认真看，它决定这条通道能开多大。

- **ToS**：用个人账号的网页会话，为第三方用户批量产出，明确违反即梦/剪映的使用条款。轻则限流，重则封号，且素材可能被追溯。**不要把它做成面向公众的付费产能。**
- **水印**：免费额度产出的图带平台水印，付费计划才无水印。如果要做付费商品，这点必须先确认。
- **内容审核**：即梦有自己的审核策略，拦截率高于你自己接的厂商；被拦时按失败退款，别让用户白扣。
- **图片时效**：CDN 链接是带签名的临时地址，必须**立即**下载并落 R2（你们现有流程已经是这样，别改成直接存 URL）。
- **并发**：单账号串行是硬约束。想提并发只能加账号，而多账号养号本身又是一层风险。

## 8. 建议的推进顺序

1. **先只给管理员开**：桥接上，`/studio` 里给管理员一个专属通道，自己用两周，观察封控、限额、出图质量。
2. **再评估要不要对外**：如果确实有付费需求，切方案 A 的官方 API 承接公众流量，桥退回成「内部降本通道」。
3. **最后才谈第 4 位画师**：前台加人设卡、画风绑定、教程文案，这些是运营动作，等通道稳定再做。

## 9. 实测记录

真实跑通的数据（2026-11-19/20，Seedream 5.0 Flash / Auto ratio / 2K / 1 张）：

| 项目 | 文生图 | 图生图（1 张参考） |
| --- | --- | --- |
| 提交 → 完成 | **45 秒** | **70 秒** |
| 额度消耗 | 6 积分/张 | 6 积分/张 |
| 预览图 | 480×640 | 480×640 |
| 原图（下载动作） | **1776×2368 / 909 KB** | **1776×2368 / 934 KB** |

**分辨率必须走下载**：网页端出的是带 `aigc_resize_mark` 的预览图，改 URL 里的尺寸参数会因签名绑定路径被 CDN 直接拒（实测 `2048:2048` 和去掉 `tplv` 都是 502）。页面 DOM 里也只挂 `100×100` 与 `720` 两个变体，原图必须走「下载」动作。

另外 4 张 2K 的一次生成，实测 5 分钟以上仍未完成（同时有人手动画图、基线被污染）。所以桥的默认超时按 480s 设，并且**桥账号要专用**，不要和别人共用同一个会话。

## 11. 服务化部署

### 已实测：Cookie 搬不进新 profile

把导出的 43 个 Cookie 通过 CDP `Network.setCookie` 写进**全新的干净 profile**，结果：Cookie 确实写进去了（`Network.getAllCookies` 能读到 `sessionid`），但页面右上角仍是 `Sign in`，登录态没有恢复。补上 localStorage（75 个键，含 `DREAMINA_HAS_LOGIN`、`__lvweb_user_status`）后重载，依然未登录。有头模式与无头模式结果一致。

结论：**登录态不能靠配置 Cookie 迁移**。它与 profile 内的加密存储和设备标识绑定（App-Bound 加密按路径绑定），跨 profile 复制不成立。

> 这也解释了为什么「拷贝 Cookie 数据库」和「注入 Cookie 值」两条路都不通——问题不在加密层，而在 profile 本身。

### 可行的服务化形态

**容器内一次性人工登录 + profile 持久化**：

1. 容器以 VNC 模式启动（Xvfb + x11vnc + noVNC），Chromium 有头跑在虚拟屏上
2. 账号所有者打开 `http://<IP>:6080/vnc.html`，登录一次
3. 登录态写进 `/data/profile`，随卷持久化
4. 之后切回无头模式运行，重启容器仍保持登录

镜像与入口脚本见 [`scripts/dreamina-bridge/Dockerfile`](../scripts/dreamina-bridge/Dockerfile) 与 `entrypoint.sh`。完整步骤见 [`docs/DREAMINA-BRIDGE-DEPLOY.md`](./DREAMINA-BRIDGE-DEPLOY.md)。

### 仍然需要浏览器内核

不能退化成「纯 HTTP」。业务接口由页面内的 Argus/bdms SDK 现签（`sign` / `a_bogus` / `device_time` / `web_id`），纯 HTTP 客户端造不出合法签名。服务化的形态是 **Node 桥 + 容器内 Chromium**，仍然走「打开页面、驱动 UI」，只是把人工登录压缩成一次。

### 硬性要求

- **出口 IP**：账号在美区。首次在日本 IP 登录时可能触发二次验证，这是登录环节要面对的，不是运行期问题。
- **单账号串行**：桥内置全局队列，不要为提并发开多实例共用同一账号。
- **不要暴露到公网无鉴权**：`DREAMINA_BRIDGE_TOKEN` 必须设置；对外只经 Cloudflare Tunnel 或内网调用。
- **6080 只在登录时开**，登录完立刻关。
- **`/data` 等同账号凭证**：profile 里就是登录态，主机访问控制要做好。

### 运维成本

登录态会随时间失效（数周到数月），表现为 `/health` 的 `page.loggedIn: false`，届时需要重做一次 VNC 登录。这是方案固有成本，建议给 `/health` 配监控告警。

### 尚未验证的风险

- **日本 IP 首次登录是否被拦**：未验证，这是上线第一步要试的。
- **无头指纹**：headless Chromium 与真人浏览器有差异，长期跑可能被标记。
- **ToS**：用个人账号的网页会话为第三方用户批量产出，仍然违反平台条款。面向公众的付费产能请走官方 API（见第 5 节），桥只做内部/自用。

## 12. 相关文件

- `scripts/dreamina-bridge/bridge.mjs`：桥主体（零依赖，CDP）
- `scripts/dreamina-bridge/probe.mjs`：DOM 诊断与提示词写入自检
- `scripts/dreamina-bridge/README.md`：启动、自检、接口示例
- `server/aiProviders.ts`：`runWaveSpeedGeneration`（提交+轮询的参照实现）、`fetchUpstream`
- `shared/studio.ts`：`PROVIDER_META`、`DEFAULT_PROVIDER_PARAMS`
