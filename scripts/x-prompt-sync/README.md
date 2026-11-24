# X 提示词博主定时同步服务（GCP 东京 VPS + Grok Bot X 连接器）

本目录提供零依赖 Node.js 20+ 定时同步脚本，用于部署到你的 GCP 东京 VPS（`/opt/x-prompt-sync`），借助 Grok 的 X 连接器每日定期拉取精选博主提示词作品，并通过 `fxtwitter` 核验高清原图后推送到本站 `POST /api/gallery/ingest`（自动转存 Cloudflare R2）。

## 1. 在 Cloudflare Worker 配置入库密钥

在仓库根目录执行：

```bash
npx wrangler secret put GALLERY_INGEST_KEY
```

输入一个强随机字符串并保存。

## 2. 在管理端维护 X 博主白名单

进入 `/admin?tab=gallery` → **「X 博主白名单 & Webhook」**，添加你要追踪的博主 `@handle`，并按信任度选择是否开启「自动上架」（默认关闭，即先审后发）。

## 3. 在 GCP 东京 VPS 上部署

```bash
sudo mkdir -p /opt/x-prompt-sync
# 将 sync.mjs 与 .env.example 上传至 /opt/x-prompt-sync
cd /opt/x-prompt-sync
cp .env.example .env
nano .env   # 填入 SITE_ORIGIN / GALLERY_INGEST_KEY / GROK_API_KEY 等

# 先试跑一次（DRY_RUN=1 不写入线上）
set -a && source .env && set +a
DRY_RUN=1 node /opt/x-prompt-sync/sync.mjs

# 确认输出正常后正式跑一次
node /opt/x-prompt-sync/sync.mjs
```

## 4. 配置每日定时任务（Crontab）

例如每天北京时间 08:00（UTC 00:00）自动执行一次，刚好充分利用 Grok Bot 每日 X 连接器额度：

```bash
crontab -e
# 添加以下一行：
0 0 * * * bash -lc 'set -a && source /opt/x-prompt-sync/.env && set +a && /usr/bin/node /opt/x-prompt-sync/sync.mjs >> /opt/x-prompt-sync/sync.log 2>&1'
```
