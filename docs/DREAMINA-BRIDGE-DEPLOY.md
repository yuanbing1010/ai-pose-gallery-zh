# Dreamina 桥 · 日本 VPS 部署手册

面向执行部署的 agent。目标：在**日本 VPS** 上跑起一个无人值守的 HTTP 服务，对外提供「文生图 / 图生图 / 取原图」三类接口。

**边界**：这不是 Dreamina 官方 API。服务通过容器内的 Chromium 驱动真实网页，接口由页面内的风控 SDK 现签。去掉的是「人」，不是「浏览器」。

---

## 0. 完成标准

全部满足才算部署完成：

1. `docker compose ps` 显示 `healthy`
2. `GET /health` 返回 `page.loggedIn: true`，且 `page.hasPrompt` / `page.hasSubmit` 均为 `true`
3. `POST /v1/images/generations` 提交一条真实任务，轮询到 `status: "succeeded"` 并拿到图片 URL
4. `GET /v1/download?url=<该图片URL>` 返回 JPEG，长边 ≥ 1500（预览图只有 480×640）
5. 8790 端口不对公网直接暴露，只有带 `x-bridge-token` 的请求能通过

第 3 步会消耗账号额度（约 6 点），执行前先确认账号所有者同意。

---

## 1. 先决条件：账号所有者要配合一次登录

**这一条决定了整个部署能否成立，先确认再动手。**

实测结论：把登录 Cookie（甚至连同 localStorage）注入到一个全新的浏览器 profile，**无法恢复登录态**。Cookie 会写进去，但页面仍然显示 `Sign in`。

原因：Dreamina 的登录态与 profile 内的加密存储、设备标识绑定（App-Bound 加密按路径绑定），跨 profile 复制不成立。

因此唯一的服务化路径是：

> 在**容器内部**用虚拟屏 + VNC 做一次人工登录，登录后的 profile 持久化在 `/data/profile`，之后重启容器继续复用。

所以需要账号所有者：**能打开一个网页（noVNC）扫码/输密码登录一次**。约 1 分钟，全程只需一次。

---

## 2. 材料清单

| 材料 | 说明 | 谁提供 |
| --- | --- | --- |
| VPS | 日本地域，Ubuntu 22.04/24.04，≥2 核 / **4 GB 内存** / 30 GB 磁盘 | 账号所有者 |
| `DREAMINA_BRIDGE_TOKEN` | 你生成的长随机串（≥32 字符） | 你 |
| 对外暴露方式 | Cloudflare Tunnel 域名，或反向代理域名 | 账号所有者 |
| 一次性登录配合 | 账号所有者本人，能访问 noVNC 页面 | 账号所有者 |
| 登录用的手机/密码 | 扫码或账号密码 | 账号所有者 |

内存给到 4 GB：Chromium + 无头渲染 + 2K 图片处理，2 GB 会随机 OOM。

---

## 3. 服务器准备

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # 重新登录生效
docker --version && docker compose version
```

完成判据：`docker compose version` 有输出。

---

## 4. 部署文件

把 `scripts/dreamina-bridge/` 下这四个文件拷到 VPS 的 `/opt/dreamina-bridge/`：

- `bridge.mjs`
- `Dockerfile`
- `docker-compose.yml`
- `entrypoint.sh`

```bash
mkdir -p /opt/dreamina-bridge && cd /opt/dreamina-bridge
# 上传上述四个文件

cat > .env <<'EOF'
DREAMINA_BRIDGE_TOKEN=替换成你自己的长随机串
EOF
chmod 600 .env
```

---

## 5. 一次性登录（关键步骤）

这一步必须由账号所有者本人操作。

### 5.1 启动登录模式

```bash
docker compose run --rm --service-ports \
  -e DREAMINA_VNC=1 \
  -p 6080:6080 \
  dreamina-bridge
```

> `--service-ports` 不会映射 6080，所以显式加了 `-p 6080:6080`。若云厂商安全组未放行 6080，先临时放行，登录完成后立刻关闭。

### 5.2 打开虚拟桌面登录

浏览器访问 `http://<服务器IP>:6080/vnc.html`，点 **Connect**，会看到 Chromium 窗口停在 Dreamina 生成页。

在这个窗口里正常登录（扫码或账号密码）。**不要关窗口**，等页面右上角出现头像/额度数字，说明登录成功。

### 5.3 确认登录已写入 profile

另开一个终端：

```bash
curl -s -H "x-bridge-token: <token>" http://127.0.0.1:8790/health | jq '.page'
```

完成判据：`"loggedIn": true`。

拿到 `true` 后，回到 5.1 的终端按 `Ctrl+C` 停掉登录容器。

### 5.4 关闭 6080

```bash
# 云厂商安全组里删掉 6080 的放行规则
```

---

## 6. 正常运行

```bash
cd /opt/dreamina-bridge
docker compose up -d --build
docker compose logs -f --tail=50
```

**期望日志**：

```
[dreamina-bridge] listening on http://0.0.0.0:8790
[dreamina-bridge] 浏览器已连接：HeadlessChrome/...
```

完成判据：`curl /health` 返回 `page.loggedIn: true`。若为 `false`，说明 profile 没持久化住，回 §9.1。

---

## 7. 验收

```bash
TOKEN=<你的 token>
curl -s -H "x-bridge-token: $TOKEN" http://127.0.0.1:8790/health | jq .
```

真实生成（消耗额度）：

```bash
JOB=$(curl -s -X POST -H "x-bridge-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"prompt":"清晨薄雾中的江南石拱桥，一盏红灯笼，水墨质感"}' \
  http://127.0.0.1:8790/v1/images/generations | jq -r .id)

# 每 5 秒查一次，通常 45~120 秒完成
curl -s -H "x-bridge-token: $TOKEN" \
  "http://127.0.0.1:8790/v1/images/generations/$JOB" | jq '{status, stage, error, images}'
```

成功后取原图：

```bash
IMG=$(curl -s -H "x-bridge-token: $TOKEN" \
  "http://127.0.0.1:8790/v1/images/generations/$JOB" | jq -r '.images[0].download')

curl -s -H "x-bridge-token: $TOKEN" "http://127.0.0.1:8790$IMG" -o out.jpg
file out.jpg
```

完成判据：`out.jpg` 是合法 JPEG，长边 ≥ 1500。

---

## 8. 接口规格

所有请求都要带 `x-bridge-token`（或 `Authorization: Bearer <token>`）。缺失或错误返回 `401`。

### 8.1 提交任务

```
POST /v1/images/generations
content-type: application/json
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `prompt` | string | 是 | 提示词，中文可用 |
| `ref_images` | string[] | 否 | 参考图 URL，最多 6 张。传了就是图生图/图片编辑 |

```json
{ "prompt": "把灯笼改成青蓝色，其余不变", "ref_images": ["https://example.com/ref.jpg"] }
```

响应 `202`：

```json
{ "id": "dm_mwntd77v_sofev7", "status": "queued", "poll": "/v1/images/generations/dm_mwntd77v_sofev7" }
```

**任务串行执行**：同时提交多个会排队。这是单账号风控要求。

### 8.2 轮询任务

```
GET /v1/images/generations/{id}
```

```json
{
  "id": "dm_...",
  "status": "succeeded",
  "stage": "完成",
  "error": null,
  "images": [{
    "url": "https://p16-dreamina-sign-useast5.capcutcdn-us.com/...jpeg?...",
    "proxy": "/v1/proxy?url=https%3A%2F%2F...",
    "download": "/v1/download?url=https%3A%2F%2F...",
    "width": 480,
    "height": 640
  }]
}
```

| `status` | 含义 | 调用方动作 |
| --- | --- | --- |
| `queued` | 排队中 | 继续轮询 |
| `running` | 生成中，`stage` 是中文进度 | 继续轮询 |
| `succeeded` | 完成 | 取 `images` |
| `failed` | 失败，`error` 有原因 | 终止并上报 `error` |

`url` / `proxy` 是**预览图**（480×640）；`download` 才是**原图**（约 1776×2368）。业务交付用 `download`。

### 8.3 取原图

```
GET /v1/download?url=<images[].url 的值，URL 编码>
```

返回二进制，`content-type` 为 `image/jpeg` 或 `image/webp`。

服务端需要悬停图片才能点出「下载」按钮，单次 5~15 秒，**不要并发调用**。

### 8.4 取预览图

```
GET /v1/proxy?url=<images[].url 的值，URL 编码>
```

只允许 Dreamina/CapCut 素材域名，其他返回 `403`。

### 8.5 其他

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 健康检查 + 登录态 |
| `GET /v1/collect` | 只采集当前页面图片，不生成、不耗额度，用于排查 |

### 8.6 错误码

| 码 | 典型 `error` | 含义与处理 |
| --- | --- | --- |
| `400` | `prompt required` | 缺提示词 |
| `401` | `invalid token` | token 不对 |
| `404` | `job not found` | 任务 ID 不存在，或服务重启过（任务表在内存里） |
| `500` | 各种 | 内部异常，看日志 |
| `502` | `等待下载超时` / `点击下载失败` | 原图下载失败，见 §10.3 |

> 任务状态存在内存中，**容器重启后旧任务 ID 全部失效**。调用方按「重启即重试」设计。

---

## 9. 持久化与重启

登录态在 `/data/profile` 里，由 `dreamina-data` 卷承载。因此：

- `docker compose restart` / `up -d` → 登录态保留
- `docker compose down`（不带 `-v`）→ 卷保留，登录态保留
- `docker compose down -v` 或删卷 → **登录态丢失，需要重做 §5**

完成判据：重启一次容器后 `/health` 仍返回 `page.loggedIn: true`。**这一步必须验**，否则上线后一次重启就要重新找账号所有者。

---

## 10. 故障排查

### 10.1 `/health` 里 `loggedIn: false`

1. 检查 `/data/profile` 是否存在且非空：`docker compose exec dreamina-bridge ls /data/profile`
2. 空 → profile 没持久化，重做 §5
3. 非空但仍 false → 会话过期或被风控踢下线，重做 §5（可能需要账号所有者从日本 IP 重新登录）

### 10.2 提交后一直 `running`，最后超时

- 页面参数可能是「4 张 / 2K」，一次 5 分钟以上。默认超时 480s，可用 `DREAMINA_JOB_TIMEOUT_MS` 调大。
- 有人在同一会话手动画图会污染结果基线。**桥账号专用**。

### 10.3 `502` + `等待下载超时` / `点击下载失败`

按顺序查：

1. `GET /v1/collect` 的 `count` 是否 ≥1（页面里有没有图）
2. 容器内存是否够（`docker stats`），OOM 会导致渲染中断
3. 重启容器重试一次；仍失败则记录 `stage` 与日志上报

### 10.4 容器反复重启

```bash
docker compose logs --tail=200
```

常见原因：`shm_size` 太小导致 Chromium 崩、内存不足（<4 GB）、`/data` 权限不对。

---

## 11. 安全

- **端口只绑回环**：compose 已写死 `127.0.0.1:8790`，对外用 Tunnel 或 Nginx + TLS。
- **token 必须设**：为空时服务对所有人开放。
- **`/data` 等同账号凭证**：卷里的 profile 就是登录态，做好主机访问控制，不进备份外传。
- **6080 只在登录时开**，登录完立刻在安全组关闭。

---

## 12. 已知风险（部署前让账号所有者知情）

### 12.1 日本 IP 与账号注册地不一致

账号是美区。首次在日本 IP 上登录时，风控可能要求额外验证（短信/邮箱）。这是**一次性登录时**就要面对的，不是运行期问题——若登录时被拦，换美国出口再试，或放弃该链路。

### 12.2 会话过期

登录态会随时间失效（数周到数月）。到期表现为 `loggedIn: false`，需要重做 §5。这是方案的固有运维成本。

建议给 `/health` 配外部监控，`page.loggedIn == false` 时告警。

### 12.3 平台条款

用个人账号的网页会话为第三方用户批量产出，违反 Dreamina/CapCut 使用条款，存在封号风险。**面向公众的付费产能应走官方 API**，这条桥只适合内部/自用/小范围。

### 12.4 无头指纹

容器里是无头 Chromium，指纹与真人浏览器有差异，长期运行可能被标记。出现「能登录但生成总失败」时优先怀疑这一点。

---

## 13. 交付给站点后端的信息

| 项 | 值 |
| --- | --- |
| Base URL | `https://<隧道域名>` 或内网地址 |
| Token | `DREAMINA_BRIDGE_TOKEN` |
| 契约 | §8（提交 → 轮询 → 用 `download` 取原图；任务串行；重启后旧 ID 失效） |

调用方接入点见 `docs/DREAMINA-INTEGRATION.md` 第 6 节。
