# ChiHAL · 服装档案（outfit-db-cn）接入与同步说明

## 来源与版权归属

- **原整理站**：[服装提示词库 · ChiHAL 精选（中文）](https://sleepyzone.online/outfit-db-cn/)（仓库：[sleepy-zone/outfit-db-cn](https://github.com/sleepy-zone/outfit-db-cn)）
- **原作者**：**ChiHAL／AI服飾デザイナー（[@chihal_ai0509](https://x.com/chihal_ai0509)）**
- **收录内容**：原站精选服装设计套系（每套包含 1 张设计规格板 `board` + 1–4 张试穿效果图 `looks`，按风格分类与多标签/多视角结构录入服装参考库 `现实写真` 板块），ID 统一加前缀 `outfit-db-`（如 `outfit-db-CH044`）。
- **版权与使用边界**：
  - 素材（服装设计、图像及原提示词）版权归原作者 **ChiHAL（@chihal_ai0509）** 所有，中文结构整理归功于 `sleepyzone.online/outfit-db-cn/`；
  - 本项目**仅保存检索与分类元数据**（`data/costume-outfit-db-zh.json`、`data/outfit-db/data.js`、`data/outfit-db/source.json`），**不下载、不镜像、不随仓库或发布包二次分发图片本体**；所有缩略图与预览图直接由原站在线加载，原图与原帖请访问原作者 X 主页或原站深链；
  - 仅限个人学习与合法艺术创作参考，**请勿二次分发图片本体或用于商业再发布**。

## 定期同步机制（与 霧島澪 档案统一调度）

原站每日约 `20:31 CST (12:31 UTC)` 更新增量穿搭，本项目通过三层机制同步：

1. **Cloudflare Worker Cron 自动同步**：`wrangler.jsonc` 配置 `"0 13 * * *"`（每日 **北京时间 21:00**），由 `worker.ts` `scheduled` 调用 `syncOutfitDbArchive(env)`，拉取 `https://sleepyzone.online/outfit-db-cn/data.js` 解析后存入 R2 `sync/outfit-db-archive.json`，公开端点 `GET /api/gallery/outfit-db`（5 分钟缓存）向前端提供最新增量，前端 `src/api/gallery.ts` 自动比较版本日期与套数取最新。
2. **管理端手动即时同步**：登录 `/admin` 后，在「01 / 系统概览」可查看最近更新日期、套数与同步时间，点击 **「同步 ChiHAL」** 或 **「全部立即同步」**（`POST /api/admin/sync/outfit-db`）立即刷新云端快照并失效前端缓存。
3. **本地脚本 / GitHub Actions 静态快照同步**：

```bash
# 从原站抓取最新 data.js 并重建 data/costume-outfit-db-zh.json
python scripts/import_outfit_db.py --sync
# 或：
pnpm sync:outfit-db

# 同步全部分享档案（霧島澪 + ChiHAL）：
pnpm sync:external

# 离线校验 SHA-256 并重建目录
python scripts/import_outfit_db.py
```

`.github/workflows/sync-mio-archive.yml` 每日 **21:00 CST**（`0 13 * * *` UTC）自动执行上述同步并提交变更。
