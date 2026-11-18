# DESIGN.md

## Aesthetic Direction
**Kinpaku & Tactile Studio Instrument（金箔画册 × 精密实体合成器）**
融合日本角色设定画册的温润纸感、时尚 Lookbook 错落瀑布流，以及 Teenage Engineering / Leica 式的阳极氧化金属实体按键触感。拒绝廉价的 AI 蓝紫霓虹渐变、拒绝发光彩色阴影（dark-glow）、拒绝小于 11px 的微型不可读文字。

## Color Palette
- **Paper Canvas (Light)**: `#F7F6F2` (`oklch(0.975 0.005 85)`) 温润画册纸底，搭配 `#FFFFFF` 纯白画框卡片。
- **Obsidian Studio (Dark)**: `#121210` (`oklch(0.14 0.005 85)`) 暖黑暗房底色，搭配 `#1C1C19` 炭黑仪器面板。
- **Instrument Chrome**: `#1F1F1C` (`oklch(0.22 0.005 85)`) 精密硬件控制条底色，搭配实体凹槽轨道与凸起键帽。
- **Primary Accent — Vermilion (朱砂橘红)**: `#D9381E`（实际暖纸白底高对比主行动色，兼顾可读性对比度与印章朱砂质感），用于主行动按钮与关键触发器。
- **Secondary Accent — Kinpaku Gold (金箔琥珀)**: `#E5A918` (`oklch(0.80 0.16 82)`)，用于指示灯、排名徽章与高亮标记。
- **Tertiary Accent — Patina Jade (青铜松石)**: `#19857B`（`oklch(0.58 0.11 188)`），用于 3D 姿势、服装材质与状态确认。

## Typography
- **Heading & UI Sans**: `'Inter Variable'`, `'PingFang SC'`, `'Hiragino Sans GB'`, `'Microsoft YaHei'`, sans-serif。标题与正文保持明确字号阶梯（H1 `2.25rem–3rem`，H2 `1.35rem–1.65rem`，正文 `0.875rem–1rem`）。
- **Technical Mono**: `'JetBrains Mono'`, monospace，用于资产编号、分辨率与配方槽位序号。
- **Legibility Floor**: 所有功能性文字、徽章、标签字号不得低于 `12px`（`0.75rem` / `text-xs`），正文行高保持 `1.5–1.65`，标题使用 `text-wrap: balance`。

## Layout & Motion
- **Gallery Waterfall**: 姿势库、服装库、人像库与首页混搭墙采用高低错落的多列瀑布流（Masonry Waterfall），支持实时切换列密度（3 列 / 4 列 / 5 列）。
- **Tactile Motion**: 使用 `motion/react` 实现物理平滑过渡（`cubic-bezier(0.2, 0.8, 0.2, 1)` 或高阻尼弹簧），不滥用无线循环跑马灯，让用户掌控浏览节奏。
