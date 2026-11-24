# GCP 东京 VPS 连接与运维说明

本文档记录项目自建上游服务（`muse2api`）所在 **Google Cloud Platform（GCP）东京 VPS** 的连接方式、服务布局与常用运维命令，方便后续开发会话或 AI 编码代理快速排查与维护。

> 安全约定：本文档会被 Git 跟踪，**严禁在文档中写入 API Key 明文、Cookie 或 SSH 私钥正文**；相关密钥分别保存在本机 `.dev.vars`、Cloudflare Worker Secret（`MUSE_API_KEY`）以及 VPS 上的 `/opt/muse2api/.env`。

---

## 1. 服务器与 SSH 连接信息

| 项目 | 值 |
| --- | --- |
| 云厂商 / 地域 | Google Cloud Platform（东京） |
| 主机名 | `gcp` |
| 公网 IP | `34.84.121.143` |
| 操作系统 | `Debian GNU/Linux 13 (trixie)` |
| 规格 | 2 vCPU / 3.8 GiB 内存 + 2.0 GiB Swap |
| SSH 用户名 | `oci-vps-2026` |
| 本地私钥路径（Windows） | `C:\Users\xinxin\.ssh\oci_vps` |
| `sudo` 权限 | 支持免密或当前用户提权执行容器/Nginx 命令 |

### 快速连接命令（Windows PowerShell / CMD）

```powershell
ssh -i C:\Users\xinxin\.ssh\oci_vps oci-vps-2026@34.84.121.143
```

非交互探活或超时保护连接：

```powershell
ssh -i C:\Users\xinxin\.ssh\oci_vps -o ConnectTimeout=8 oci-vps-2026@34.84.121.143 "hostname && sudo docker ps"
```

---

## 2. 已部署服务与域名信息

### 2.1 `muse2api`（Muse 生图网关）

| 项目 | 说明 |
| --- | --- |
| 服务名称 | `muse2api`（基于 `czg86389-hub/muse2api`） |
| 部署目录 | `/opt/muse2api`（`docker-compose.yml` + `docker-compose.override.yml` + `.env`） |
| 持久化数据目录 | `/opt/muse2api/data`（账号 Cookie、媒体缓存、任务状态） |
| Docker 容器 | `muse2api`（镜像 `muse2api:latest`），仅本机监听 `127.0.0.1:18610->18610/tcp` |
| 公网域名 | `https://muse.geminirun.com` |
| API Base URL | `https://muse.geminirun.com/v1` |
| DNS 解析 | Cloudflare `A` 记录：`muse.geminirun.com` → `34.84.121.143`（`proxied: false`，灰度仅 DNS 直连） |
| 反向代理与证书 | `/etc/nginx/sites-available/muse.geminirun.com`（软链至 `sites-enabled`）+ Let's Encrypt Certbot HTTPS |
| 管理面板 | `https://muse.geminirun.com/admin`（使用 `muse2api` 访问密钥登录，查看账号 Cookie 保活状态与队列任务） |

### 2.2 `colab-gpu-studio`（Colab GPU ComfyUI 控制台）

| 项目 | 说明 |
| --- | --- |
| 服务名称 | `colab-gpu-studio`（基于 `TizenryA/colab-gpu-studio` `v0.3.1`） |
| 部署目录 | `/opt/colab-gpu-studio`（`docker-compose.yml` + `.env`） |
| 持久化数据卷 | Docker 命名卷 `colab-gpu-studio_studio-data`（挂载到容器 `/data`，含 SQLite `studio.db`，**切勿执行 `docker compose down -v`**） |
| Docker 容器 | `colab-gpu-studio-api-1`（监听 `127.0.0.1:8788->8788/tcp`）、`colab-gpu-studio-worker-1`、`colab-gpu-studio-watchdog-1` |
| 预定域名 | `https://colab.geminirun.com`（Cloudflare `A` 记录 `proxied: false`，Nginx 反代 `/etc/nginx/sites-available/colab.geminirun.com` + Let's Encrypt Certbot HTTPS 已启用） |
| 登录与密钥来源 | 登录密码（`STUDIO_PASSWORD`）与加密密钥（`ENCRYPTION_KEY`、`SESSION_SECRET`）保存在 VPS `/opt/colab-gpu-studio/.env`；已配置 `GPU_REAL_ENABLED=1`、`GPU_STORAGE=drive` 与预算保护配额（见 `.env`） |

### 2.3 `dreamina-bridge`（即梦桥接）

| 项目 | 说明 |
| --- | --- |
| 部署目录 | `/opt/dreamina-bridge` |
| Docker 容器 | `dreamina-bridge`（监听 `127.0.0.1:8790->8790/tcp`） |
| 反向代理与域名 | `/etc/nginx/sites-available/dreamina.geminirun.com`（`https://dreamina.geminirun.com`） |

### 与本站 (`ai-pose-gallery-zh`) 的对接位置

- **供应商凭证**：D1 `suppliers` 表中 `sup_muse`（`Muse官方`），接口地址 `https://muse.geminirun.com/v1`，密钥引用 `env:MUSE_API_KEY`（脱敏显示 `m2a_***f17b`）。
- **默认渠道**：D1 `provider_channels` 表中 `ch_muse_default`，绑定画笔 `prof_muse_default`，默认走异步任务模式 `muse_tasks`（`POST /v1/images/tasks` + 轮询 `GET /v1/images/tasks/{task_id}`）。
- **密钥来源**：
  - 线上 Worker：Cloudflare Worker Secret `MUSE_API_KEY`
  - 本地 `pnpm dev`：仓库根目录 `.dev.vars` 中的 `MUSE_API_KEY`
  - VPS 上游：`/opt/muse2api/.env`

---

## 3. 常用排查与运维命令

```bash
# 1. 查看容器状态与实时日志
cd /opt/muse2api
sudo docker ps
sudo docker compose logs --tail=100 -f

# 2. 重启 muse2api 容器
cd /opt/muse2api && sudo docker compose restart

# 3. 检查服务就绪状态（无需密钥）与账号状态（需 Bearer Key）
curl -sS https://muse.geminirun.com/healthz
curl -sS https://muse.geminirun.com/readyz

# 从 .env 读取密钥验证 /admin/status
KEY=$(grep -E '^MUSE2API_API_KEY=' /opt/muse2api/.env | cut -d= -f2-)
curl -sS -H "Authorization: Bearer $KEY" https://muse.geminirun.com/admin/status

# 4. 检查 Nginx 配置与证书续期状态
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo certbot certificates

# 5. 拉取 muse2api 上游更新并重建容器
cd /opt/muse2api
git pull
sudo docker compose up -d --build

# 6. colab-gpu-studio 常用运维（日志 / 重启 / 更新，切勿带 -v 删除数据卷）
cd /opt/colab-gpu-studio
sudo docker compose ps
sudo docker compose logs --tail=100 -f api worker watchdog
sudo docker compose restart
curl -fsS http://127.0.0.1:8788/api/health
```
