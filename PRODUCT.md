# PRODUCT.md

## Users
插画师、概念设计师、漫画作者与 AI 角色创作者。他们需要在桌面上或手机上快速检索人体 3D 姿势（含深度图）、现实/二次元/中国历代服装穿搭以及 CC0 人像发型参考，并在登录后消耗积分，通过平台服务端代调云端生图模型（Google Gemini、OpenAI GPT Image、xAI Grok Imagine）生成角色立绘并保存云端作品集。

## Product Purpose
提供「3D 动作姿势 + 全品类服装穿搭 + CC0 颜值人像」三合一的高密度视觉参考瀑布流与角色合成工作台，配套用户账号体系、积分账本、卡密兑换、R2 云端作品集与管理控制台，实现「找参考 → 混搭三轨配方 → 扣积分生图 → 跨设备查看作品与配方回放」闭环。

## Platform & Constraints
- 全栈运行于 Cloudflare Workers（Hono + D1 + R2）+ React 19 / TypeScript 7 / Tailwind CSS 4 单页应用。
- 厂商 API Key 统一由管理员在 `/admin` 配置并加密存储于 Cloudflare D1，绝不下发至用户浏览器。
- 用户上传参考图与 AI 成图保存在 Cloudflare R2 私有桶，由 Worker 鉴权读取；生成记录与积分流水保存于 D1。
- 管理端（`/admin/login` 与 `/admin`）为独立后台系统，采用服务端 HttpOnly Cookie 会话与角色鉴权。
