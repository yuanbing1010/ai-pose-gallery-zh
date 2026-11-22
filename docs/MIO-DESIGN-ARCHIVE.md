# 霧島澪 · 设计档案（Mio Design Archive）接入与同步说明

## 来源与版权归属

- **原档案站**：[霧島澪 · 姿势与服装设计档案](https://sleepyzone.online/mio-design-archive/)（仓库：[sleepy-zone/mio-design-archive](https://github.com/sleepy-zone/mio-design-archive)）
- **原作者**：**霧島澪 / Kirishima Mio（[@Mio_2am](https://x.com/Mio_2am)）**
- **收录范围**：仅导入原站中的**姿势（`pose`）**与**服装（`cloth`）**设计条目（不导入发型 `hair`）。截至 `2026-11-18` 快照，共收录 **250 项姿势（27 卷）**与 **117 套服装（13 卷）**，ID 统一加前缀 `mio-`（如 `mio-P-01-01`、`mio-C-01-01`）。
- **版权与使用边界**：
  - 原站及原作者明确声明：**设计、图片和角色版权归原作者 @Mio_2am（霧島澪 / Kirishima Mio）及原网站（`sleepyzone.online/mio-design-archive`）所有**；
  - 本项目**仅保存检索与分类元数据**（`data/pose-mio-zh.json`、`data/costume-mio-zh.json` 及 `data/mio/source.json`），**不下载、不镜像、不随仓库或发布包二次分发图片本体**；所有缩略图与原图直接由原站在线加载，并在姿势库、服装库、详情弹窗、使用指南与 ComfyUI 插件中完整展示原站、X 原帖链接与作者署名。
  - 仅限个人学习、动态研究与合法艺术创作参考，**禁止二次分发图片本体或用于商业再发布**。

## 定期同步机制（三层支持）

原站每日定时更新增量内容，本项目同时提供以下同步方式：

### 1. Cloudflare Worker 定时自动同步（线上生产环境）

- `wrangler.jsonc` 已配置 Cron 触发器 `"30 12 * * *"`（UTC 12:30 = **北京时间每日 20:30**，紧随原站 20:00 CST 更新后执行）。
- `worker.ts` 的 `scheduled` 处理器调用 `server/mioSync.ts`，拉取原站 `data.json` 并通过 `shared/mioArchive.ts` 转换为标准 `PoseItem` / `CostumeItem` 写入 R2 对象 `sync/mio-archive.json`。
- 公开接口 `GET /api/gallery/mio` 直接返回云端已同步数据；前端 `src/api/gallery.ts` 会自动比较云端与随包静态快照的 `generated` 日期及条目数，优先采用更新的版本，若纯静态部署或未同步过则无缝退回静态快照。

### 2. 管理端一键手动同步

- 登录 `/admin` 后，在「01 / 系统概览」的 **「外部参考档案定期同步（霧島澪 · 设计档案）」** 面板可查看原站生成日期、云端同步时间与收录数量，点击 **「立即同步」**（`POST /api/admin/sync/mio`）即可即时刷新 R2 云端快照并失效前端缓存。

### 3. 本地 / GitHub Actions 静态快照同步

```bash
# 从原站抓取最新 data.json 并重建静态快照（data/mio/* 与 data/*-mio-zh.json）
python scripts/import_mio.py --sync
# 或：
pnpm sync:mio

# 仅从已提交快照离线校验并重建目录（不访问网络）
python scripts/import_mio.py
```

- 仓库内附 `.github/workflows/sync-mio-archive.yml`，每日 **20:30 CST** 自动执行 `python scripts/import_mio.py --sync` 并在有新卷时自动提交静态快照更新（也支持 GitHub Actions 页面手动触发）。
