# AGENTS.md

本文件面向 AI 编码代理，说明本仓库的架构、命令、数据契约和容易踩坑的地方。开始任务前先读本文件；涉及部署、ComfyUI 或生成协议时，再读 `README.md` 与对应 `docs/` 文档。

## 项目概览

`ai-pose-gallery-zh` 是一个「姿势 + 服装 + 人像」三合一 AI 角色参考库与合成工作台：

- React 19 + TypeScript 7 + Vite 8 单页应用，TanStack Router / TanStack Query、Tailwind CSS 4、shadcn/ui。
- 图库元数据为静态 JSON + 本地图片（约 12,000 张，仓库约 1.1 GB）；用户体系、积分账本、卡密、模型配置与生成任务保存在 **Cloudflare D1**，上传参考图与生成作品保存在 **Cloudflare R2**。
- 后端由 `worker.ts` + `server/`（Hono）运行在 **Cloudflare Workers** 上，统一在服务端使用加密存储的厂商 API Key 代调 Google Gemini、OpenAI GPT Image、xAI Grok Imagine（支持官方与中转站，已下线前端直连代理与浏览器本地 ComfyUI 通道）。
- 根目录保留的 `__init__.py` + `comfyui_plugin/` 仍作为独立的 ComfyUI 自定义节点插件存在。
- 界面文案与图库元数据以简体中文为主；JSON 中的中文字段名是对外数据契约，不是临时命名。

## 环境与常用命令

要求 **Node.js 20+** 和 **pnpm**（请使用 pnpm，不要用 npm/yarn 更新依赖）。Python 3 只用于数据与图片维护。Windows 上执行 `bash scripts/build.sh` 需要 Git Bash 或 WSL。

> 使用 nvm-windows 时，`nvm` 命令必须在真实的 PowerShell/CMD 窗口中执行；它要求 stdout 是控制台设备，从 Agent/CI 的管道 shell 直接调用会弹出 “Terminal Only” 提示并退出。

```bash
pnpm install
pnpm dev                 # 应用本地 D1 迁移并同时启动 Worker(8787) + Vite(5173)
pnpm dev:web             # 仅启动前端 Vite（/api 代理到 http://127.0.0.1:8787）
pnpm dev:worker          # 仅启动本地 Wrangler Worker（模拟 D1 + R2）
pnpm db:migrate:local    # 应用 migrations/*.sql 到本地 D1
pnpm db:migrate:remote   # 应用 migrations/*.sql 到线上 D1
pnpm build               # tsc -b && vite build（只构建前端，不包含 data/ thumbs/ img/）
pnpm lint                # oxlint
pnpm preview             # 预览构建结果

bash scripts/build.sh    # 生成可部署的 dist/：前端构建 + 复制 data/ thumbs/ img/ 等
pnpm run deploy          # build.sh + wrangler deploy
```

数据维护脚本（在仓库根目录执行；macOS/Linux 用 `python3`）：

```bash
python scripts/download.py                    # 下载/补全三站图片，支持 DATASET=pose|depth|costume|portrait 与 WORKERS=N
python scripts/apply_translation.py           # 由 scripts/i18n.py 词典重新生成三库 *-zh.json
python scripts/verify.py                      # 校验本地图片存在性、大小与文件头
python scripts/import_charadb.py              # 更新 CharaDB 二次元服装数据
python scripts/import_gia_anime.py            # 更新 ギア 动漫服装数据
python scripts/import_shisei_costumes.py      # 更新 Shisei 中国历代服装数据
```

## 目录地图

| 路径 | 职责 |
| --- | --- |
| `shared/studio.ts` | 前后端共享的类型定义、画师/厂商元数据、画风预设、提示词组装逻辑 |
| `server/` | Cloudflare Workers 后端（Hono 路由、PBKDF2/AES-GCM 加密、D1 原子积分账本、R2 文件读写、4 家 AI 模型代调） |
| `migrations/` | Cloudflare D1 SQL 迁移脚本（`0001_init.sql`） |
| `worker.ts` / `wrangler.jsonc` | Cloudflare Worker 入口与 D1 (`DB`) / R2 (`BUCKET`) / 静态资源 (`ASSETS`) 绑定配置 |
| `src/routes/` | 页面路由：`index` 总览、`poses`、`costumes`、`portraits`、`studio`、`guide`、`admin.login`、`admin.index`、`admin.jobs.$jobId`；`__root.tsx` 是整体布局 |
| `src/api/gallery.ts` | React Query 查询、姿势分组与图库筛选辅助 |
| `src/lib/apiClient.ts` | 前端 `/api/*` 请求与 SSE 生成流解析客户端 |
| `src/store/studioStore.tsx` | 登录态、积分余额、平台配置、云端作品历史、草稿配方（IndexedDB 草稿 + localStorage 偏好） |
| `src/services/aiGenerator.ts` | 浏览器端图片缩放、`stitchRecipeCanvas` 参考拼图与共享提示词导出 |
| `src/lib/` | 通用逻辑：图片路径、随机配方、IndexedDB 草稿、通知、对比参考等 |
| `src/components/auth/` | 用户登录/注册弹窗（`AuthModal`）、账户积分/卡密兑换/流水弹窗（`AccountModal`） |
| `src/components/ui/` | shadcn/ui 生成组件（`components.json` 使用 `radix-nova` 风格），通常不要手改 |
| `src/components/{common,layout,studio,theme}/` | 业务组件、导航栏/配方 Dock、画风选择器、主题 |
| `src/types/gallery.ts` | 图库与工作台类型重导出 |
| `comfyui_plugin/` + `__init__.py` | 独立 ComfyUI 节点、PromptServer 路由、前端弹窗选图器 |
| `data/` | 三库 JSON 与翻译对照表；`*-zh.json` 是前端实际加载的数据 |
| `thumbs/` / `img/` | 缩略图与高清原图（体积大，勿批量移动或重命名） |
| `scripts/` | Python 下载、翻译、导入、校验脚本及 `dev-all.mjs`、`build.sh` |
| `skills/` | Agent 技能包（`SKILL.md` + `references/catalog.csv`），不是应用代码 |
| `docs/` | Cloudflare D1/R2 部署指南、图片数据说明等文档 |

## 数据与图片约定

- 前端从 `/data/pose-zh.json`、`costume-zh.json`、`costume-anime-zh.json`、`costume-gia-anime-zh.json`、`costume-shisei-zh.json`、`portrait-zh.json` 读取数据。服装查询会把后 4 个服装文件合并成一个列表。
- `pose-zh.json` 有 1,439 条，按「体系 + 姿势编号」在 `buildPoseGroups()` 中分组；深度图没有单独索引，通过 `poseThumbPath()` / `poseImagePath()` 把 `thumbs/...`、`img/...` 映射到 `thumbs/depth/...webp`、`img/depth/...webp`。
- 图片路径在 JSON 中不带前导 `/`；组件通过 `referenceImageUrl()` 或 `poseThumbPath()` / `poseImagePath()` 解析。
- 服装目录命名不完全统一：ギア写实缩略图在 `thumbs/costume/`（单数），Shisei 在 `thumbs/costumes/shisei/`（复数）；高清图同理。不要擅自合并目录。
- CharaDB（`source: "charadb"`）与 ギア动漫（`source: "gia-anime"`）的图片是原站热链，仓库和发布包不存图；不要假设它们有本地文件，也不要破坏热链 URL。
- `data/*-zh.json` 由脚本生成。需要改翻译或分类时，优先修改 `scripts/i18n.py` 或对应导入脚本，再运行 `apply_translation.py` / 导入脚本，避免下次生成时覆盖手改内容。
- 修改数据字段时，必须同步 `src/types/gallery.ts`、数据生成脚本、所有读取该字段的页面/助手，以及 ComfyUI 插件里按字段名取值的代码。
- `.gitignore` 会忽略 `img/costume/*.png`、`img/portrait/*.png`、`img/depth/*.png`、`thumbs/depth/*.jpg` 等原始备份；新增这些目录下的图片前先确认是否应被 Git 跟踪。
- 大批量图片迁移、重命名、重新压缩会同时影响 JSON、部署包和缓存头，除非任务明确要求，否则不要做。

## 关键行为与安全约束

- **API Key 与会话安全**：厂商 API Key 由管理员在 `/admin` 配置并使用 `APP_ENCRYPTION_KEY` AES-GCM 加密后存于 D1 `provider_configs`，**绝不下发给前端或写入快照**；用户会话采用 HttpOnly Cookie + SHA-256 `sessions` 表。
- **积分账本与 D1 事务**：Cloudflare D1 不支持交互式 `BEGIN/COMMIT`，所有扣费、退款、卡密核销与手动调积分必须通过 `env.DB.batch([...])` + 表级约束（`CHECK (credit_balance >= 0)`、`idx_credit_ledger_unique_refund`、`UNIQUE (code_id, user_id)`）保证原子性与幂等性。
- **R2 图片私有访问与 SSRF 防护**：用户上传参考图（`uploads/<userId>/...`）与 AI 成图（`generations/<userId>/...`）保存在私有 R2 桶，通过 `/api/files/*` 校验归属权后读取；外部图链仅允许安全公网 `https://`，禁止内网地址。
- **浏览器存储**：仅用 IndexedDB（`src/lib/idbStorage.ts`）保存当前草稿配方、用 localStorage 保存轻量 UI 偏好（`pose_atlas_client_prefs_v4`），已生成作品与历史记录统一持久化在 D1 + R2。
- **通知**：业务代码统一使用 `@/lib/notifications` 的 `toast`，它处理了 Sonner 溢出提示的计时问题；不要在新代码里直接 `import { toast } from 'sonner'`。
- **路由**：TanStack Router 文件式路由，`src/routeTree.gen.ts` 由 Vite 插件自动生成，**不要手改**。新增页面时创建 `src/routes/<name>.tsx`，在其中 `createFileRoute('/<name>')` 并设置 `staticData.title`，再把导航项加到 `src/components/layout/nav.ts`；运行 dev/build 让路由树重新生成。
- **静态资源**：`vite.config.ts` 设置了 `publicDir: false`，开发/预览时由自定义插件直接从仓库根目录提供 `/data/`、`/thumbs/`、`/img/`、`/og-cover.jpg`、`/robots.txt`、`/sitemap.xml`，同时将 `/api/*` 代理到本地 `wrangler dev`（`127.0.0.1:8787`）。新增根级静态路径时，要同时更新该插件的 `prefixes` 和 `scripts/build.sh` 的复制清单。
- **界面与前端技术栈规范**：
  - **原则**：优先复用成熟库、组件源代码可控、严格限制重复依赖；用户端遵循 `DESIGN.md`（Kinpaku & Tactile Studio Instrument 暖纸箔金微拟物设计，最小字号 `12px` / `text-xs`，禁止蓝紫渐变与彩色外发光）；`/admin` 管理端沿用瑞士极简画廊风（Swiss Minimalist Gallery：0 圆角直角网格、1px 通栏分割细线、高对比黑白排印、等宽字体编号）。
  - **UI 组件**：统一使用 `shadcn/ui Nova`（`components.json` 中 `style: "radix-nova"`，源码位于 `src/components/ui/`）。
  - **图标**：统一使用 `Lucide`（`lucide-react`）。
  - **动画**：统一使用 `Motion`（`motion/react`）。
  - **分栏布局**：统一使用 `react-resizable-panels`（通过 `@/components/ui/resizable` 封装复用）。
  - **拖拽交互**：统一使用 `dnd-kit`（`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`）。
  - **状态管理**：统一使用 `Zustand`（`zustand`，集中在 `src/store/studioStore.tsx`）。
  - **响应式**：用户可见文案使用简体中文；布局同时考虑桌面与手机（容器查询 `@container` / `@lg/...`）。
  - **组件头部信息排布**：整站保持行为与视觉逻辑统一——一般情况下，组件/区块的**左上方**放置标题与操作按钮，**右上方**放置所选名称、状态或说明文字。
- **依赖**：项目没有测试框架，也没有 Oxfmt 脚本；严格限制重复依赖，不要引入功能重叠的同类库。升级/新增依赖后用 pnpm 更新 `pnpm-lock.yaml`。

## 常见任务提示

- **新增图库页面或筛选**：先看 `src/routes/poses.tsx` 或 `costumes.tsx` 的查询、分页（默认每次 60 条）、灯箱和「加入配方」模式；复用 `EmptyState`、`ShowcaseDialog`、`GalleryHoloCard` 等通用组件。
- **新增云端生图厂商**：同步修改 `shared/studio.ts`（`PROVIDER_ORDER`、`PROVIDER_META`、`STUDIO_ARTISTS`、`DEFAULT_PROVIDER_PARAMS`）、`migrations/` 中 `provider_configs.provider_id` 约束、`server/aiProviders.ts`、`src/routes/admin.index.tsx` 参数面板。
- **修改 ComfyUI 插件**：独立 Python 节点在 `comfyui_plugin/nodes.py`、`routes.py`、`web/extension.js` + `style.css`（纯 JS，无构建步骤）。改完用 `python -m compileall __init__.py comfyui_plugin` 做语法检查。
- **修改图片/数据**：跑 `python scripts/verify.py`；改动生成脚本后重新生成 `*-zh.json` 并抽查首条与边界条目。

## 验证清单

当前仓库没有自动化测试。提交前至少执行：

```bash
pnpm build     # 含 tsc -b 类型检查（覆盖 src、vite.config.ts 与 worker/server）
pnpm lint
```

涉及后端或 UI 时启动 `pnpm dev:all`，手动检查 `/`、`/poses`、`/costumes`、`/portraits`、`/studio`、`/admin/login`、`/admin`，并验证：

- 管理员初始化/登录、厂商加密配置保存（不泄漏密钥）、用户注册/登录、卡密兑换与手动调积分。
- 管理端独立会话（`/admin/login`、`pose_atlas_admin_sid`）与 10 个管理分区（`overview`/`users`/`redeem`/`suppliers`/`api`/`jobs`/`styles`/`access`/`prompts`/`sanitize`）的权限校验、筛选分页及未保存离开提醒正常。
- 生图失败自动全额退还积分、R2 文件仅本人/管理员可访问、跨设备云端作品集列表与对比正常。
- 部署构建用 `bash scripts/build.sh`，确认 `dist/` 包含 `data/thumbs/img`，并留意 Cloudflare 的单文件 25 MiB、文件数 20,000 限制。

## 参考文档

- `README.md`：功能、数据规模、完整目录结构、部署方式。
- `docs/cloudflare-d1-r2.md`：Cloudflare Workers + D1 + R2 本地联调、数据库迁移与线上部署步骤。
- `docs/SHISEI-COSTUMES.md`、`docs/GIA-ANIME-COSTUMES.md`：两类外部服装数据说明。
- `skills/`：姿势/服装/人像检索技能包及图片来源限制。

## 内容与许可边界

前端代码（`src/`）、ComfyUI 插件（`comfyui_plugin/`）和脚本（`scripts/`）以 MIT 协议开源；`img/`、`thumbs/`、`data/` 中的图片与原始数据**不在此协议覆盖范围内**。不要将图库图片打包倒卖或付费分发；CharaDB 图片仅在线引用，并受原作者条款限制。
