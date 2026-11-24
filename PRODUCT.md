# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

插画师、概念设计师、漫画作者与 AI 角色创作者。他们需要在桌面或手机上快速检索人体 3D 姿势（含深度骨骼图）、现实/二次元/中国历代服装穿搭以及 CC0 人像发型参考，并在登录后消耗积分，通过平台服务端代调云端生图模型（Google Gemini、OpenAI GPT Image、xAI Grok Imagine）生成角色立绘并保存云端作品集。

## Product Purpose

提供「3D 动作姿势 + 全品类服装穿搭 + CC0 颜值人像」三合一的高密度视觉参考瀑布流与角色合成工作台，配套用户账号体系、积分账本、卡密兑换、公共灵感画廊、无限节点画布、盲盒抽卡、R2 云端作品集与管理控制台，实现「找参考 → 混搭三轨配方 / 自由文生图 / 画布拖线对比 → 扣积分生图 → 跨设备查看作品与配方回放」闭环。

## Positioning

面向中文创作者的一体化角色参考与暗房创作工作台：将经过本地整理与中文检索索引的 3D 白模/深度骨骼姿势、跨风格服饰（写实、二次元与历代服饰）和人像气质库，与三轨配方合图、无限 DAG 节点画布、物理手撕盲盒抽卡及独立 ComfyUI 插件打通；所有云端生图厂商 API Key 由管理员在服务端加密托管，并基于 Cloudflare D1 原子批处理保障积分扣费与失败自动全额退还。

## Operating Context

- **创作者日常流**：在 `/poses`、`/costumes`、`/portraits` 检索并勾选标本至悬浮配方坞（`RecipeDock`），或在 `/blindbox` 手撕盲盒随机掉落三卡；进入 `/studio`（自由文生图 / 配方合图）或 `/canvas`（多节点拖线并行 A/B 出图）消耗积分生成作品，在 `/gallery` 浏览精选提示词、点赞珍藏、评论与一键做同款，并跨设备回放云端作品集。
- **独立插件流**：桌面 ComfyUI 用户通过根目录 `__init__.py` + `comfyui_plugin/` 节点与前端弹窗选图器复用本地三库数据。
- **运维管理流**：管理员通过独立会话的 `/admin/login` 与 `/admin`（11 个管理分区）维护成员准入、卡密批次、原子积分账本、加密厂商配置、画风图鉴与全链路生成任务审计。

## Capabilities and Constraints

- 全栈运行于 Cloudflare Workers（Hono + D1 + R2）+ React 19 / TypeScript 7 / Vite 8 / Tailwind CSS 4 / TanStack Router & Query 单页应用，包管理统一使用 `pnpm`。
- 厂商 API Key 统一由管理员在 `/admin` 配置并使用 `APP_ENCRYPTION_KEY` AES-GCM 加密存储于 Cloudflare D1，绝不下发至用户浏览器或写入公开快照；前端直连代理与浏览器本地 ComfyUI 通道已下线。
- 用户上传参考图与 AI 成图保存在 Cloudflare R2 私有桶，通过 `/api/files/*` 校验归属权后读取；外部图链仅允许安全公网 `https://`；生成记录、卡密核销与积分流水通过 D1 `env.DB.batch([...])` + 表级约束保证原子性与幂等性。
- 管理端（`/admin/login` 与 `/admin`）为独立后台系统，采用服务端 HttpOnly Cookie 会话（`pose_atlas_admin_sid`）与角色鉴权。
- 界面文案与图库元数据以简体中文为主；`data/*-zh.json` 中的中文字段名是对外数据契约；CharaDB 与 ギア动漫服饰图片采用原站热链，不得破坏热链 URL 或假定其存在本地文件。

## Brand Commitments

- **品牌名称**：`CASTDECK`（中文产品定位：三轨角色参考库与 AI 合成工作台）。
- **隐私与费用展示铁律**：严禁在任何用户端页面、弹窗、进度提示及非管理员 API 返回中暴露画师内部代号或系统编译生图提示词；前端仅展示画笔名称、用户配方摘要与补充细节；单次生图积分消耗仅标注在主生成按钮与立即扣费的重绘按钮上。
- **双语言视觉边界**：面向创作者的前台页面遵循和纸箔金 × 精密暗房仪器语言（详见 `DESIGN.md`）；独立管理后台 `/admin` 保持瑞士极简画廊风（0 圆角直角网格与高对比黑白排印）。

## Evidence on Hand

- **本地实体参考库**：`data/pose-zh.json`（1,439 条 3D 素体白模与对应深度骨骼图）、`data/costume*-zh.json`（3,364+ 套写实、二次元与历代服饰，含 CharaDB 与 ギア动漫热链目录）、`data/portrait-zh.json`（1,499 张 CC0 人像与发型参考），配套本地缩略图 `thumbs/` 与高清图 `img/`。
- **自动化脚本与插件**：`scripts/` 数据下载/翻译/校验与发布构建脚本、`comfyui_plugin/` 独立 ComfyUI 自定义节点。
- **未证实内容约束**：仓库不含第三方客户证言、付费转化基准或媒体背书，后续设计与文案不得虚构评价、用户规模或虚假社会证明。

## Product Principles

1. **参考图永远是主角**：减少界面装饰与嵌套容器噪声，让姿势、服饰与人像标本在首屏直接呼吸。
2. **三轨精准可控且零阻塞探索**：支持从自由文生图、三轨配方合图、无限节点画布到盲盒抽卡的无缝流转，且草稿配方本地持久化不丢进度。
3. **密钥与账本服务端绝对可信**：密钥永不触达客户端，高风险扣费与删除操作明确提示或二次确认，生图失败自动全额退还积分。
4. **桌移双端与无障碍同等对待**：在 390px 手机端与桌面宽屏均维持清晰信息层级、触控热区与可预期手势。

## Accessibility & Inclusion

- 亮暗双主题功能文字与实底主按钮满足 WCAG AA 对比度（≥ 4.5:1），全站功能字号不低于 `12px`（触屏输入域自动 ≥ `16px` 防 iOS 缩放）。
- 所有仅图标按钮与表单控件配备 `aria-label` 与键盘焦点反馈，移动端交互热区保障 `44×44px` 并适配全面屏 `env(safe-area-inset-*)` 安全区。
- 完整遵循 `prefers-reduced-motion: reduce`（停止 WebGL/脉冲/位移与缩放动效）与 `prefers-reduced-transparency: reduce`（磨砂层与全屏遮罩回退为实色不透明）。
