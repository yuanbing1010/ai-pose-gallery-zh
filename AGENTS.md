# AGENTS.md

本文件面向 AI 编码代理，说明本仓库的架构、命令、数据契约和容易踩坑的地方。开始任务前先读本文件；涉及部署、ComfyUI 或生成协议时，再读 `README.md` 与对应 `docs/` 文档。

## 项目概览

`ai-pose-gallery-zh` 是一个「姿势 + 服装 + 人像」三合一 AI 角色参考库与合成工作台：

- React 19 + TypeScript 7 + Vite 8 单页应用，TanStack Router / TanStack Query、Tailwind CSS 4、shadcn/ui。
- 数据为静态 JSON + 本地图片（约 12,000 张，仓库约 1.1 GB），没有后端数据库。
- 合成台可调用 Gemini、OpenAI GPT Image、阿里云百炼 Qwen、火山方舟 Doubao、本地 ComfyUI；生图历史与未决任务保存在浏览器 IndexedDB。
- 同一个仓库也是 ComfyUI 自定义节点插件（根 `__init__.py` + `comfyui_plugin/`），克隆到 `custom_nodes/` 即可使用。
- 通过 Cloudflare Workers / Pages 部署；Worker 同时提供 `/api/proxy` 同源代理。
- 界面文案与图库元数据以简体中文为主；JSON 中的中文字段名是对外数据契约，不是临时命名。

## 环境与常用命令

要求 **Node.js 20+** 和 **pnpm**（`pnpm-lock.yaml` 为 v9，请使用 pnpm，不要用 npm/yarn 更新依赖）。Python 3 只用于数据与图片维护，ComfyUI 可选。Windows 上执行 `bash scripts/build.sh` 需要 Git Bash 或 WSL。

> 使用 nvm-windows 时，`nvm` 命令必须在真实的 PowerShell/CMD 窗口中执行；它要求 stdout 是控制台设备，从 Agent/CI 的管道 shell 直接调用会弹出 “Terminal Only” 提示并退出。

```bash
pnpm install
pnpm dev                 # http://localhost:5173
pnpm build               # tsc -b && vite build（只构建前端，不包含 data/ thumbs/ img/）
pnpm lint                # oxlint
pnpm preview             # 预览构建结果

bash scripts/build.sh    # 生成可部署的 dist/：前端构建 + 复制 data/ thumbs/ img/ 等
npx wrangler deploy      # 部署到 Cloudflare Workers（wrangler.jsonc 指向 ./dist）
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
| `src/routes/` | 页面路由：`index` 总览、`poses`、`costumes`、`portraits`、`studio`、`settings`、`guide`；`__root.tsx` 是整体布局 |
| `src/api/gallery.ts` | React Query 查询、姿势分组、NSFW 分类判定 |
| `src/store/studioStore.tsx` | 全局配方、API 配置、安全模式、生成历史、生成任务生命周期；localStorage + IndexedDB 持久化 |
| `src/store/useComfyConnection.ts` | ComfyUI HTTP 连接检测器（全应用共享） |
| `src/services/aiGenerator.ts` | 提示词组装、Canvas 拼图、5 家生图协议客户端、ComfyUI 工作流解析/上传/任务跟踪 |
| `src/lib/` | 通用逻辑：图片路径、随机配方、IndexedDB、通知、ComfyUI 参数、生成快照等 |
| `src/components/ui/` | shadcn/ui 生成组件（`components.json` 使用 `radix-vega` 风格），通常不要手改 |
| `src/components/{common,layout,studio,theme}/` | 业务组件、侧边栏/头部/配方 Dock、合成台组件、主题 |
| `src/types/gallery.ts` | 三库数据、配方、5 家协议参数、历史记录的类型定义 |
| `src/workflows/*.api.json` | 内置 ComfyUI API 格式工作流 |
| `functions/api/proxy.ts` | `/api/proxy` 处理器，同时被 Cloudflare Pages Functions 和 `worker.ts` 复用 |
| `worker.ts` / `wrangler.jsonc` | Cloudflare Worker 入口与部署配置（静态资源 `ASSETS` 绑定 `./dist`） |
| `comfyui_plugin/` + `__init__.py` | ComfyUI 节点、PromptServer 路由、前端弹窗选图器 |
| `data/` | 三库 JSON 与翻译对照表；`*-zh.json` 是前端实际加载的数据 |
| `thumbs/` / `img/` | 缩略图与高清原图（体积大，勿批量移动或重命名） |
| `scripts/` | Python 下载、翻译、导入、校验脚本，不参与前端运行时 |
| `skills/` | 9 个 Agent 技能包（`SKILL.md` + `references/catalog.csv`），不是应用代码 |
| `docs/` | ComfyUI 本地部署、工作流参数、任务恢复、预览图等深入文档 |

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

- **SFW 安全模式默认开启**：状态在 `studioStore.tsx`，NSFW 判定集中在 `src/api/gallery.ts`（`NSFW_POSE_SYSTEMS`、`NSFW_COSTUME_CATEGORIES`、`isNsfwPose*`、`isNsfwCostume*`）。新增图库筛选、随机配方、拼图或 ComfyUI 选图入口时，必须继续遵守 `safeMode`，不得默认展示或随机到 NSFW 内容。
- **API Key 只留在浏览器**：配置存于 localStorage（`pose_atlas_api_config_v3`），历史和未决任务存于 IndexedDB（`pose_atlas_studio_db`）。不要把 Key 写进代码、提交、日志、URL 或生成快照；`GenerationSnapshot` 明确不包含提供商 Key，保持这一点。
- **浏览器存储**：大图片/生成结果/未决任务用 IndexedDB（`src/lib/idbStorage.ts`），不要塞进 localStorage；`durableImage()` / `snapshotGeneration()` 负责生成可持久化数据。
- **通知**：业务代码统一使用 `@/lib/notifications` 的 `toast`，它处理了 Sonner 溢出提示的计时问题；不要在新代码里直接 `import { toast } from 'sonner'`。
- **路由**：TanStack Router 文件式路由，`src/routeTree.gen.ts` 由 Vite 插件自动生成，**不要手改**。新增页面时创建 `src/routes/<name>.tsx`，在其中 `createFileRoute('/<name>')` 并设置 `staticData.title`，再把导航项加到 `src/components/layout/nav.ts`；运行 dev/build 让路由树重新生成。
- **静态资源**：`vite.config.ts` 设置了 `publicDir: false`，开发/预览时由自定义插件直接从仓库根目录提供 `/data/`、`/thumbs/`、`/img/`、`/og-cover.jpg`、`/robots.txt`、`/sitemap.xml`。新增根级静态路径时，要同时更新该插件的 `prefixes` 和 `scripts/build.sh` 的复制清单，否则会出现「本地能看、部署 404」。
- **代理安全**：生产 `/api/proxy` 只接受 POST、https、默认四家官方域名（可通过 `PROXY_ALLOWED_ORIGINS` 扩展）、请求体上限 10 MiB，只转发 `content-type`、`authorization`、`x-goog-api-key`、`x-dashscope-async`。不要为了方便放宽白名单、协议或大小限制。
- **ComfyUI 代理**：本地 dev/preview 的 `/comfy/*` 由 Vite 代理到 `COMFYUI_URL`（默认 `http://127.0.0.1:8000`）并移除 Origin；线上可直连。修改 ComfyUI 调用时同时考虑「`/comfy` 相对地址」和「绝对地址」两种情况。
- **ComfyUI 任务语义**：提交响应丢失时后端可能已经收到任务，不能把网络错误当作安全重试依据；刷新恢复只查询原任务，不重新提交 `/prompt`。相关逻辑在 `aiGenerator.ts`，详细约束见 `docs/comfyui-task-tracking.md`。
- **ComfyUI 工作流元数据**：`_meta.studio.controls`、`hiddenInputs`、`imageRole`、`referenceCombinations` 是本项目扩展约定，不是 ComfyUI 标准。修改工作流参数 UI 时保持「只覆盖真实存在且类型匹配的字段」的校验。
- **界面与前端技术栈规范**：
  - **原则**：优先复用成熟库、组件源代码可控、统一设计语言（瑞士纯血极简画廊风 / Swiss Minimalist Gallery：0 圆角直角网格、1px 通栏分割细线、高对比黑白排印、等宽字体编号）、严格限制重复依赖。
  - **UI 组件**：统一使用 `shadcn/ui Nova`（`components.json` 中 `style: "radix-nova"`，源码位于 `src/components/ui/`）。
  - **图标**：统一使用 `Lucide`（`lucide-react`）。
  - **动画**：统一使用 `Motion`（`motion/react`）。
  - **分栏布局**：统一使用 `react-resizable-panels`（通过 `@/components/ui/resizable` 封装复用）。
  - **拖拽交互**：统一使用 `dnd-kit`（`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`）。
  - **状态管理**：统一使用 `Zustand`（`zustand`，集中在 `src/store/studioStore.tsx`）。
  - **响应式**：用户可见文案使用简体中文；布局同时考虑桌面与手机（容器查询 `@container` / `@lg/...`）。
- **依赖**：项目没有测试框架，也没有 Oxfmt 脚本；严格限制重复依赖，不要引入功能重叠的同类库。升级/新增依赖后用 pnpm 更新 `pnpm-lock.yaml`。

## 常见任务提示

- **新增图库页面或筛选**：先看 `src/routes/poses.tsx` 或 `costumes.tsx` 的查询、分页（默认每次 60 条）、灯箱和「加入配方」模式；复用 `PageHeader`、`EmptyState`、`GalleryLightbox` 等通用组件，并确保安全模式过滤。
- **新增生图协议**：同步修改 `src/types/gallery.ts`、`src/services/aiGenerator.ts` 的 `PROVIDER_META` 与调用逻辑、`studioStore.tsx` 的默认配置与 `mergeStoredConfig()`、`settings.tsx` 的配置 UI；若上游域名不在默认白名单，再更新 `functions/api/proxy.ts` 并说明原因。
- **修改 ComfyUI 插件**：Python 节点在 `comfyui_plugin/nodes.py`，HTTP 路由在 `comfyui_plugin/routes.py`，前端在 `comfyui_plugin/web/extension.js` + `style.css`（纯 JS，无构建步骤）。改完用 `python -m compileall __init__.py comfyui_plugin` 做语法检查；真正的运行验证需要 ComfyUI 环境。节点输入输出名必须与前端扩展保持一致。
- **修改代理**：`functions/api/proxy.ts` 是 Worker 与 Pages 共用的实现；`vite.config.ts` 里的开发代理是另一套实现。若要求本地与线上行为一致，两边都要改并分别验证。
- **修改图片/数据**：跑 `python scripts/verify.py`；改动生成脚本后重新生成 `*-zh.json` 并抽查首条与边界条目。

## 验证清单

当前仓库没有自动化测试。提交前至少执行：

```bash
pnpm build     # 含 tsc -b 类型检查
pnpm lint
```

涉及数据/图片时再执行 `python scripts/verify.py`。涉及 UI 时启动 `pnpm dev`，手动检查 `/`、`/poses`、`/costumes`、`/portraits`、`/studio`、`/settings` 中受影响页面，并验证：

- 安全模式开启时 NSFW 分类不可见、不可随机到；关闭/解锁流程正常。
- 图片缩略图、原图、深度图切换与灯箱下载正常，无 404。
- 手机宽度下布局、侧边栏、配方 Dock 不溢出。
- 合成台切换协议、保存配置、刷新后配方/历史恢复；ComfyUI 相关改动需连接真实实例验证提交与恢复。
- 部署构建用 `bash scripts/build.sh`，确认 `dist/` 包含 `data/thumbs/img`，并留意 Cloudflare 的单文件 25 MiB、文件数 20,000 限制。

## 参考文档

- `README.md`：功能、数据规模、完整目录结构、部署方式。
- `docs/comfyui-local.md`：本地 ComfyUI 三图合成所需模型与运行方式。
- `docs/comfyui-workflow-parameters.md`：工作流高级参数与 `_meta.studio` 约定。
- `docs/comfyui-task-tracking.md`：ComfyUI WebSocket/HTTP 任务跟踪与刷新恢复。
- `docs/SHISEI-COSTUMES.md`、`docs/GIA-ANIME-COSTUMES.md`：两类外部服装数据说明。
- `skills/`：姿势/服装/人像检索技能包及图片来源限制。

## 内容与许可边界

前端代码（`src/`）、ComfyUI 插件（`comfyui_plugin/`）和脚本（`scripts/`）以 MIT 协议开源；`img/`、`thumbs/`、`data/` 中的图片与原始数据**不在此协议覆盖范围内**。不要将图库图片打包倒卖或付费分发；CharaDB 图片仅在线引用，并受原作者条款限制。改动涉及 NSFW 内容时保持默认 SFW 与免责声明，不新增绕过安全模式的入口。
