# Cloudflare Workers + D1 + R2 全栈部署与本地开发指南

## 架构概览

- **后端入口**：`worker.ts` + `server/`（基于 Hono，运行在 Cloudflare Workers）
- **数据库**：Cloudflare D1（`migrations/0001_init.sql`）
  - 用户与会话：`users`、`sessions`
  - 平台配置、供应商与多渠道路由：`system_settings`、`provider_configs`（画师槽位定价与开关）、`suppliers`（可复用的官方/中转站域名与 AES-256-GCM 加密 API Key）、`provider_channels`（每家模型可挂多条渠道并按优先级调度与自动故障转移）
  - 积分账本与卡密：`credit_ledger`、`redeem_codes`、`redeem_claims`
  - 生成任务与上传资源：`generation_jobs`、`uploaded_assets`
- **对象存储**：Cloudflare R2（私有桶 `BUCKET`）
  - 用户上传参考图：`uploads/<userId>/<assetId>.<ext>`
  - AI 生成成图：`generations/<userId>/<jobId>.<ext>`
  - 通过 `GET /api/files/*` 校验登录态与归属权后流式读取，不对外暴露公开桶 URL。
- **生图流式响应与积分事务**：
  - `POST /api/generations` 使用 D1 `batch()` 原子扣积分并写入 `processing` 任务，然后通过 SSE（含心跳保活）完成上游调用与 R2 转存。
  - 若上游失败、超时或连接中断，服务端通过幂等退款索引保证同一任务最多退还一次积分，并在查询列表时自动清理超时的 `processing` 任务。

## 本地联调

1. 安装依赖：
   ```bash
   pnpm install
   ```
2. 确认 `.dev.vars` 存在（已提供默认本地开发配置，可参考 `.dev.vars.example`）：
   - `APP_ENCRYPTION_KEY`：本地加密测试密钥
   - `DEV_ASSETS_ORIGIN=http://127.0.0.1:5173`：让本地 Worker 能直接读取仓库根目录的 1.1 GB `img/`、`thumbs/` 图库资源
3. 一键启动本地联调（自动应用本地 D1 迁移 + 启动 Wrangler Worker `8787` + Vite 前端 `5173`）：
   ```bash
   pnpm dev
   ```
4. 首次初始化管理员：
   - 浏览器打开 `http://localhost:5173/admin/login`，若数据库尚无管理员，将自动显示「初始化首个管理员账号」表单。
   - 也可在 `.dev.vars` 中配置 `BOOTSTRAP_ADMIN_USERNAME` 与 `BOOTSTRAP_ADMIN_PASSWORD` 自动创建。

## 生产部署（Cloudflare）

1. 登录 Cloudflare CLI：
   ```bash
   npx wrangler login
   ```
2. 创建 D1 数据库与 R2 存储桶：
   ```bash
   npx wrangler d1 create ai-pose-gallery-db
   npx wrangler r2 bucket create ai-pose-gallery-bucket
   ```
   将 `d1 create` 返回的 `database_id` 填入 `wrangler.jsonc` 中的 `d1_databases[0].database_id`。
3. 设置生产加密密钥（强烈建议使用 32 位以上随机字符串）：
   ```bash
   npx wrangler secret put APP_ENCRYPTION_KEY
   ```
   可选：也可按需配置 `GEMINI_API_KEY`、`OPENAI_API_KEY`、`XAI_API_KEY` 作为环境变量兜底，或直接在 `/admin` 后台界面中录入并加密存入 D1。
4. 应用远程 D1 迁移：
   ```bash
   pnpm run db:migrate:remote
   ```
5. 构建静态资源（含 `data/`、`thumbs/`、`img/`）并部署 Worker：
   ```bash
   pnpm run deploy
   ```
6. 访问线上 `https://<你的域名>/admin/login` 完成首个管理员初始化（建议提前通过 `npx wrangler secret put BOOTSTRAP_SETUP_TOKEN` 设置初始化口令，或直接配置 `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` 自动建号），配置至少一家厂商的 API Key 与积分单价即可开放使用。
