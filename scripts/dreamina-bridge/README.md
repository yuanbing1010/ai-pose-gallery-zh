# Dreamina 浏览器桥

把本机浏览器里**已登录的 Dreamina**（dreamina.capcut.com）包装成一个「提交任务 → 轮询 → 取图」的 HTTP 服务，供站点后端调用。

零依赖：只需要 Node 20+，不安装 Playwright/Puppeteer，走 Chrome DevTools Protocol。

## 为什么是浏览器桥，而不是直接调接口

`dreamina.capcut.com` 的 `/api` 请求由页面内的 Argus / bdms 风控 SDK 现签（`sign` / `a_bogus` / `device_time` / `web_id` 等），签名与时间戳、设备指纹绑定，并且对 TLS 指纹敏感。把一次抓到的 URL 直接重放，通常几分钟内就失效；要使它稳定，就得把混淆 + wasm 的签名逻辑整体搬出来，维护成本远高于收益。

所以这里换一个思路：**让请求始终发生在真实页面里**。浏览器负责登录态与签名，桥只负责「填词 → 点击 → 收图 → 暴露 HTTP」。

## 一次性准备

1. 用**独立用户目录**启动一个带调试端口的 Chrome（Chrome 136+ 禁止在默认用户目录上开调试端口，所以必须独立目录）：

   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9222 `
     --user-data-dir="$env:LOCALAPPDATA\dreamina-bridge-profile" `
     --disable-backgrounding-occluded-windows `
     --disable-renderer-backgrounding `
     --disable-background-timer-throttling `
     --disable-features=CalculateNativeWinOcclusion
   ```

   > 后四个参数不是可选项。没有它们，标签页在后台时 `visibilityState` 是 `hidden`，页面不渲染、hover 浮层不出现，「下载」按钮永远点不到。

2. 在这个窗口里打开 <https://dreamina.capcut.com/ai-tool/generate> 并登录。之后**保持这个窗口开着**，会话会一直复用。

   > 必须在**这个**配置里登录一次，没法把你日常浏览器的登录态搬过来。Chrome 136+ 禁止在默认用户目录开调试端口，而 App-Bound 加密会让跨目录拷贝的 Cookie 解密失败并被删除（实测三种做法都不行，详见 `docs/DREAMINA-INTEGRATION.md`）。

3. 启动桥：

   ```powershell
   $env:DREAMINA_BRIDGE_TOKEN = "换成你自己的长随机串"
   node scripts/dreamina-bridge/bridge.mjs
   ```

## 自检

```powershell
# 页面是否挂对、有没有登录
Invoke-RestMethod http://127.0.0.1:8790/health | ConvertTo-Json -Depth 5
```

期望看到 `page.hasPrompt = true`、`page.hasSubmit = true`、`page.loggedIn = true`。

判定登录看的是真实 Cookie（`sessionid` / `sid_tt`），不是页面文案——页面没渲染完时文案匹配会误判。

想单独核对登录态：

```powershell
node scripts/dreamina-bridge/cookies.mjs           # 列出桥浏览器里的 capcut/dreamina Cookie
```

真实 DOM 结构有变化时，用诊断脚本直接看：

```powershell
node scripts/dreamina-bridge/probe.mjs                          # 结构 + 试写提示词
$env:PROBE_CLICK="1"; node scripts/dreamina-bridge/probe.mjs     # 顺带点一次提交
node scripts/dreamina-bridge/hover-probe.mjs                     # 悬停结果图，列出浮层按钮
node scripts/dreamina-bridge/screenshot.mjs out.png              # 截图，确认页面实际渲染
node scripts/dreamina-bridge/cdp_eval.mjs --file expr.js         # 在页面里执行任意 JS
node scripts/dreamina-bridge/download-debug.mjs <图片URL>         # 原图下载逐步骤诊断
node scripts/dreamina-bridge/net-capture.mjs <资源哈希>           # 记录接口请求/响应
```

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 桥 + 页面 + 登录态自检 |
| POST | `/v1/session` | 运行时注入 Cookie（`{cookies:[...]}`），热更新登录态 |
| GET | `/v1/collect` | 只跑一次「滚动 + 采集」，不提交生成、不消耗额度 |
| POST | `/v1/images/generations` | 提交任务，立刻返回 `id` |
| GET | `/v1/images/generations/{id}` | 轮询状态与图片 |
| GET | `/v1/proxy?url=` | 代理即梦 CDN 图片（带 Referer，避免防盗链/过期问题） |
| GET | `/v1/download?url=` | **取原图**：走页面「下载」动作拿全分辨率文件（预览图只有 480×640，原图 1776×2368） |

> `/v1/download` 会把 Chrome 窗口拉到系统前台——因为「下载」按钮只在真实悬停时才渲染，窗口被压住时 CSS `:hover` 不生效。桥机器建议独占一块屏幕。

提交（文生图）：

```powershell
$h = @{ 'x-bridge-token' = $env:DREAMINA_BRIDGE_TOKEN }
$body = @{ prompt = "水墨风的江南石桥，晨雾，一只红灯笼"; ref_images = @() } | ConvertTo-Json
$job = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8790/v1/images/generations `
  -Headers $h -ContentType 'application/json' -Body $body
$job.id
```

提交（图生图 / 图片编辑）：把参考图 URL 放进 `ref_images`，桥会自己下载字节、粘贴进编辑器，最多 6 张。

```powershell
$body = @{
  prompt     = "保持原图构图与质感，把灯笼改为青蓝色，其余不变"
  ref_images = @("https://.../ref.jpg")
} | ConvertTo-Json
```

轮询：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8790/v1/images/generations/$($job.id)" -Headers $h | ConvertTo-Json -Depth 6
```

返回形如：

```json
{
  "id": "dm_...",
  "status": "succeeded",
  "stage": "完成",
  "error": null,
  "images": [{
    "url": "https://p16-dreamina-sign...",
    "proxy": "/v1/proxy?url=...",
    "download": "/v1/download?url=...",
    "width": 480,
    "height": 640
  }]
}
```

`status`：`queued` → `running` → `succeeded` / `failed`。`images[].download` 才是原图，`url`/`proxy` 是 480×640 预览。

## 接到站点后端

1. 把本机端口暴露到公网（二选一）：
   - Cloudflare Tunnel：`cloudflared tunnel --url http://127.0.0.1:8790`，拿到 `https://xxx.trycloudflare.com`
   - 或只在内网 / 自己的服务器上跑，Worker 通过内网地址调用
2. 在管理端把「Dreamina」通道的 `Base URL` 填成上面的地址，`API Key` 填 `DREAMINA_BRIDGE_TOKEN`。
3. Worker 侧按现有的「提交 → 轮询」流程调用即可（见 `docs/DREAMINA-INTEGRATION.md`）。

## 独立服务（容器内一次性登录 + profile 持久化）

**Cookie 不能替代登录。** 实测把 43 个 Cookie（连 localStorage 一起）注入全新 profile，页面仍显示 `Sign in`——登录态与 profile 内的加密存储和设备标识绑定，跨 profile 复制不成立。

可行做法是让 profile 本身保持登录：

```bash
# 1) 登录模式：容器起 Xvfb + noVNC，浏览器打开 6080 扫码登录一次
docker compose run --rm --service-ports -e DREAMINA_VNC=1 -p 6080:6080 dreamina-bridge
#    浏览器访问 http://<IP>:6080/vnc.html，登录后确认 /health 的 loggedIn=true，Ctrl+C

# 2) 正常运行：无头复用 /data/profile 里的会话
docker compose up -d --build
```

`/data` 卷里就是登录态，等同账号凭证：`docker compose down -v` 会清掉，需要重做第 1 步。

完整步骤（含安全组、验收、故障排查）见 [`docs/DREAMINA-BRIDGE-DEPLOY.md`](../../docs/DREAMINA-BRIDGE-DEPLOY.md)。

> 仍然需要浏览器内核：业务接口由页面内的 Argus SDK 现签，纯 HTTP + Cookie 造不出合法签名。服务化去掉的是「人」，不是「浏览器」。

### 诊断用脚本

`cookies-export.mjs` / `cookies-inject.mjs` 仍保留，用于验证「某个 profile 到底有没有登录态」，但**不要**把它们当成部署手段。

## 已知边界

- **单账号串行**：任务队列是全局串行的。并发跑同一账号容易触发风控，也不符合即梦网页端的行为。
- **依赖页面结构**：锚点 `[data-testid="dreamina.generator.submit"]` 与 `[aria-label="Prompt"][contenteditable="true"]` 是当前结构；即梦改版后跑一次 `probe.mjs` 就能定位新锚点。
- **图生图**：参考图走「粘贴上传」（`ClipboardEvent` + `DataTransfer`），未登录时页面没有 file input，所以没有走 `DOM.setFileInputFiles`。
- **合规**：这是个人会话的自动化，不是即梦官方 API。请勿把它作为面向公众的付费产能，详见 `docs/DREAMINA-INTEGRATION.md` 的风险一节。
