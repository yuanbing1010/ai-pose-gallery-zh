# PRODUCT.md

## Users
插画师、概念设计师、漫画作者与 AI 角色创作者。他们需要在桌面上或手机上快速检索人体 3D 姿势（含深度图）、现实/二次元/中国历代服装穿搭以及 CC0 人像发型参考，并将三者组合成一套角色配方，一键发送给云端生图模型（Gemini、GPT Image、Qwen、Doubao）或本地 ComfyUI 生成角色立绘。

## Product Purpose
提供「3D 动作姿势 + 全品类服装穿搭 + CC0 颜值人像」三合一的高密度视觉参考瀑布流与角色合成工作台，让创作者在几秒内完成「找参考 → 混搭三轨配方 → 生成立绘」的闭环。

## Platform & Constraints
- Web 单页应用（React 19 + TypeScript + Tailwind CSS 4 + Motion），兼顾桌面大屏瀑布流检阅与移动端单手选图。
- 默认开启 SFW 安全模式（隐藏 18+ 敏感姿势与内衣分类），必须经过显式年龄确认弹窗才可解锁。
- API Key 仅存储在本地浏览器，生图历史与未决任务保存在 IndexedDB。
- 管理端（`/admin/login` 与 `/admin`）为独立后台系统，与用户前端完全分离。
