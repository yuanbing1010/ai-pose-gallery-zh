---
name: CASTDECK
description: Kinpaku Editorial & Tactile Studio Instrument — 和纸编辑部画册 × 精密实体暗房仪器设计系统
colors:
  vermilion-seal: "#d9381e"
  vermilion-aa: "#c42f16"
  vermilion-dark-text: "#ff7a63"
  kinpaku-gold: "#e5a918"
  kinpaku-aa: "#855b00"
  kinpaku-dark-text: "#f5c443"
  patina-jade: "#19857b"
  paper-canvas: "#f7f6f2"
  paper-card: "#ffffff"
  paper-mat: "#efece5"
  paper-secondary: "#eae7df"
  ink-primary: "#0a0a0a"
  ink-muted: "#52525b"
  obsidian-canvas: "#121110"
  obsidian-card: "#161513"
  obsidian-tile: "#181715"
  obsidian-popover: "#1a1916"
  obsidian-muted: "#1d1c19"
  obsidian-raised: "#22211e"
  obsidian-fg: "#fafafa"
  obsidian-muted-fg: "#a6a199"
  destructive: "#dc2626"
typography:
  display-hero:
    fontFamily: "'Hanken Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  display:
    fontFamily: "'Hanken Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Hanken Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Hanken Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Hanken Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.04em"
  editorial-watermark:
    fontFamily: "'Songti SC', 'Noto Serif SC', 'STSong', 'Georgia', serif"
    fontSize: "5.75rem"
    fontWeight: 400
    lineHeight: 1
rounded:
  none: "0px"
  sm: "7.2px"
  md: "9.6px"
  lg: "12px"
  xl: "16.8px"
  2xl: "21.6px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion-aa}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "40px"
  button-ink:
    backgroundColor: "{colors.ink-primary}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.paper-secondary}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  card-mat:
    backgroundColor: "{colors.paper-mat}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.xl}"
    padding: "12px"
  stage-obsidian:
    backgroundColor: "{colors.obsidian-canvas}"
    textColor: "{colors.obsidian-fg}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
---

# Design System: CASTDECK

## Overview

**Creative North Star: "Kinpaku Editorial & Tactile Studio Instrument（金箔编辑部画册 × 精密实体暗房仪器）"**

CASTDECK 将日本角色设定画册的温润和纸装裱质感（`Stripe Press`、`Minimal Gallery`、`Landing Love`）、编辑部双色调排印克制（`FinalLap`、`HUMAN.md`、`Curated Design`），与 `Leica / Teenage Engineering` 式精密光学暗房硬件触感融为一体。用户端覆盖首页（`/`）、三大参考图库（`/poses`、`/costumes`、`/portraits`）、配方创作台（`/studio`）、灵感画廊（`/gallery`）、盲盒抽卡（`/blindbox`）与无限画布（`/canvas`）；视觉核心始终围绕「让高密度角色参考图呼吸，让混搭与生成具备可触摸的实体反馈」。

系统存在明确的**双界面边界**：面向创作者的全部前台界面遵循本「和纸箔金 × 精密暗房」语言；独立后台 `/admin` 与 `/admin/login` 保持 **Swiss Minimalist Gallery（瑞士极简画廊风）**——`0px` 直角网格、`1px` 通栏细线、高对比黑白排印与等宽序号，不混用前台暖纸拟物阴影与圆角。

> 完整六站高审美调研与组件范式沉淀见 [docs/DESIGN-TASTE-SYSTEM.md](docs/DESIGN-TASTE-SYSTEM.md) 与 [skills/editorial-design-craft/SKILL.md](skills/editorial-design-craft/SKILL.md)。

**Key Characteristics:**
- **暖纸画册底 × 黑曜石暗房舞台**：日常浏览区采用温润和纸底（`#F7F6F2`），光学取景器、深度对比扫描器、顶部档案横幅与悬浮配方坞采用嵌入式黑曜石硬件模块（`.ks-obsidian-stage`），以 `1px` 金箔细线（`.ks-foil-hairline`）收口。
- **单基线克制与渐进披露**：图库卡片静息态只让画面呼吸，最多保留一行基线信息；收藏、点赞、翻面、加入配方收纳进悬停磨砂层（触屏端提供直达可达角标）。
- **克制的实体微拟物与工坊器物感**：通过高阻尼弹簧、实体键帽压感（`:active` 微缩）与可选 Web Audio 物理拟音建立触感；工作台小画家与盲盒箔包属于「暗房工坊器物」支线，色彩收敛在金箔/朱砂/松石/暖金属内，避免破坏画册克制感。

## Colors

整站 95% 面积由和纸暖白、纯白画框、暖石垫色与深墨黑承载；三枚功能强调色按**可访问对比度分级**区分「装饰/图标色」与「WCAG AA 正文/按钮色」。

### Primary
- **Vermilion Seal（朱砂印章红）** (`#D9381E` / `oklch(0.54 0.19 34)`): 品牌标点圆点（`CASTDECK.`）、导航激活微点、装饰性印章。
- **Vermilion AA Lacquer（深朱砂行动漆面）** (`#C42F16`, 按钮渐变 `#D1351B → #C42F16 → #AA2510`): 日间模式下用于白色文字的主行动按钮（保障 `≥ 4.6:1` 对比度）及浅底朱砂功能字。
- **Vermilion Dark Text（暗房亮朱砂）** (`#FF7A63`): 暖黑暗房底色（`#121110`）上的朱砂强调文字与状态标签。

### Secondary
- **Kinpaku Gold（金箔琥珀）** (`#E5A918` / `oklch(0.83 0.17 82)`): 暗底金箔细线、精选徽标、积分图标与深色舞台高光点缀。
- **Kinpaku AA Ink（日间鎏金墨）** (`#855B00` / `#7A5200`): 日间和纸底上的金色功能文字与双色调标题点缀（避免 `#E5A918` 直接印在浅纸上导致对比度不足）。
- **Kinpaku Dark Text（暗房鎏金亮色）** (`#F5C443`): 深色暗房背景上的金色数字、状态与双色调标题副句。

### Tertiary
- **Patina Jade（青铜松石）** (`#19857B` / `oklch(0.50 0.11 188)`，暗色模式图表/亮态 `oklch(0.68 0.12 188)`): 3D 姿势深度图标识、服装槽位状态、成功与完成态确认。

### Neutral
- **Paper Canvas（和纸画布，Light）** (`#F7F6F2`): 页面基底，配合 `.sk-grid-bg` 柔光棚拍渐变与极淡 `.ks-paper-grain` 和纸微粒。
- **Paper Card & Mat（画纸与装裱垫，Light）** (`#FFFFFF` 纯白画框、`#EFECE5` 装裱垫、`#EAE7DF` 次级底、`rgba(20,18,14,0.10)` `1px` 建筑细线)。
- **Ink Ramp（墨黑文字，Light）** (`#0A0A0A` 主墨黑、`#52525B` 暖灰次要文字)。
- **Obsidian Studio Ramp（暖黑暗房，Dark）** (`#121110` 暗房底、`#161513` 卡片、`#181715` 图库画框、`#1A1916` 浮层、`#1D1C19` 凹槽静音底、`#22211E` 抬升面、`rgba(255,255,255,0.10)` 细线、`#FAFAFA` 主字、`#A6A199` 暖灰辅字)。

### Named Rules
- **The Surgical Vermilion Rule（朱砂印章铁律）.** 朱砂红是印章而非墙漆——单屏内只允许出现**一个**朱砂红主行动按钮（凡页面本身已有主创作行动按钮或悬浮 `RecipeDock` 时，如 `/`、`/poses`、`/costumes`、`/portraits`、`/gallery`、`/blindbox`、`/canvas`，顶栏「立即创作」自动降级为次级轮廓胶囊，画布工具栏与画廊快门钮采用暖金黄铜色），绝不把朱砂红铺涂到次级徽章、工具栏或筛选标签。
- **The Dual-Ramp Contrast Rule（亮暗对比度双轨律）.** 任何浅底上的功能文字与白字实底按钮必须达到 WCAG AA（`≥ 4.5:1`）：浅底朱砂字/白字主按钮用 `#C42F16` 阶，浅底金箔字用 `#855B00` 阶；严禁把装饰用 `#E5A918` 直接作为浅底正文色；页面扉页大号背景水印（如 `Vol.01`）采用内联装饰 `<svg aria-hidden="true">` 绘制，避免低对比度纯文本元素污染无障碍与字号阶梯。

## Typography

**Display & Body Font:** `'Hanken Grotesk Variable'`（仅加载 Latin 可变子集，开启 `font-optical-sizing: auto` 与 `font-display: swap`，以精密仪器几何无衬线替代泛用 Inter），中文回退 `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif`。
**Label / Mono Font:** `'JetBrains Mono Variable'`（仅加载 Latin 可变子集 `40KB`），回退 `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`。
**Archival Serif Accent:** `'Songti SC', 'Noto Serif SC', 'STSong', 'Georgia', serif`（`.font-editorial-serif`），仅用于大号背景期号水印（如 `Vol.01`）与印章/正体编辑部装饰字。

**Character:** 高对比紧字距仪器感无衬线搭配等宽档案眉标，形成「画册主标 × 精密仪器刻度」的秩序感；启用 `font-optical-sizing: auto`、`tabular-nums` 等宽数字，并统一为浏览器表面（`::selection` 暖金选中高亮、`caret-color` 朱砂光标、`text-underline-offset`）注入品牌色板。

### Hierarchy
- **Display** (`700`, `30px–48px`, `line-height: 1.15`, `letter-spacing: -0.03em`, `text-wrap: balance`): 页面首屏双色调分裂大标题（核心词墨黑 + 辅助语暖灰或可访问金箔 `#855B00`/`#F5C443`）。
- **Headline** (`700`, `20px–24px`, `line-height: 1.25`, `letter-spacing: -0.025em`): 区块与工作台分栏标题。
- **Title** (`600`, `14px–16px`, `line-height: 1.4`): 卡片单行基线标题、弹窗标题、组件左上方区块标头。
- **Body** (`400`, `14px`, `line-height: 1.6`, `text-wrap: pretty`): 说明文案与表单内容；移动端触屏输入域强制 `≥ 16px` 防止 iOS 自动缩放。
- **Label / Eyebrow** (`500`, `12px`, `letter-spacing: 0.04em`, `tabular-nums`): 档案眉标（`● 1,439 POSES · ARCHIVE`、`[ 01 · BLINDBOX ]`）、筛选计数与画幅参数。

### Named Rules
- **The 12px Legibility Floor Rule（12px 最小可读底线）.** 全站所有功能文字、眉标、徽章、时间戳与辅助说明不得小于 `12px`（`text-xs`）。
- **The No Faux-Italic CJK Rule（禁止中文伪斜体律）.** 严禁对 `.font-editorial-serif`（宋体）或任何中文标题施加 `italic` 样式；中文字体缺乏真斜体字重，浏览器机械倾斜会破坏编辑部高级感，需要强调时改用正体金箔色阶或字重对比。
- **The Header Polarity Rule（组件头部左操右态律）.** 整站组件与分区头部保持统一排布：**左上方**放置标题与操作按钮，**右上方**放置当前所选名称、状态或说明文字。
- **The Eyebrow Restraint Rule（眉标克制律）.** 等宽档案编号（如 `VOL.01 · POSES ARCHIVE`、`DEPTH SCANNER`）保持裸字距排印，不使用 `[ ... ]` 代码终端方括号装饰；高频密集控件分组优先使用简洁中文标题。
- **The Semantic Workspace Heading Rule（全站语义主标题律）.** 含全屏工作台在内的每条路由（如 `/studio`、`/blindbox`、`/canvas`）必须包含唯一语义 `<h1>`（可见标题或 `sr-only`），保证屏幕阅读器与文档大纲完整。

## Layout

- **响应式与容器查询**：全站同时面向桌面（`1280px–1440px+`）与手机（`390px` 起），优先使用容器查询（`@container`）驱动卡片与工作台分栏自适应；禁止在非营销全屏以外写死 `100vh`，统一使用 `100dvh`（应用壳、工作台、抽屉）与 `100svh`（首屏剧场与稳定高度区块）。
- **移动端安全区与触控底线**：启用 `viewport-fit=cover, interactive-widget=resizes-content`；所有吸顶导航、底部悬浮配方坞（含 `/blindbox`）、`SheetContent` 底部与右上角关闭钮、`/canvas` 底部 HUD 必须叠加 `env(safe-area-inset-*)`；可点击控件保证 `44×44px` 触控热区（桌面紧凑图标通过 `before:-inset-2` 隐形扩展点击区）。
- **滚动隔离与渐隐条**：根页面 `overscroll-behavior: none`，所有弹窗、抽屉、下拉菜单与工作台内滚容器加 `overscroll-contain`；横向分类筛选条使用 `.ed-fade-mask-x` 右侧平滑渐隐并内联等宽计数，长列表横滑条结合 `scroll-snap-type: x proximity`。
- **单焦原则与工作台节奏**：首页避免多个同功能提示词输入框同屏竞夺焦点（如滚动剧场首幕与底部悬浮输入框互斥显隐），且底部浮层不得遮挡页脚品牌字标；`/studio` 移动端 3 槽配方区避免强塞 `grid-cols-3` 导致 24px 按钮误触；`/canvas` 顶部工具栏在手机端收束为单行横向滑动仪器条（`flex-nowrap overflow-x-auto`），释放 `130px+` 纵向画布创作视口。

## Elevation & Depth

采用 **「1px 建筑细线 + 材质分层 + 微拟物仪器触感」** 混合深度体系：静态内容面板默认扁平靠色差与 `1px` 细线（`var(--border)`）分层；仅实体键帽、嵌入式暗房舞台与悬浮磨砂胶囊承载明确阴影。

### Shadow & Surface Vocabulary
- **Museum Matting（`.ed-mat`）**: 温润渐变底垫（日间 `#F3F0E8 → #EAE5DA`，暗间 `#1F1E1A → #171613`）+ `1px` 内描边 + 顶部微高光，用于作品与标本装裱。
- **Obsidian Stage（`.ks-obsidian-stage`）**: 阳极氧化黑曜石渐变（`#1B1916 → #131210 → #0E0D0C`）+ `1px rgba(229,169,24,0.22)` 暗金细边 + `0 18px 46px rgba(15,13,10,0.22)`，用于暗房取景器、深度对比扫描器与页面档案头。
- **Tactile Instrument Keycaps（`.ks-recess` / `.ks-keycap` / `.ks-paper-keycap`）**: 凹槽内阴影（`inset 0 1px 2px rgba(0,0,0,0.08)`）与实体键帽顶缘高光，用于参数切换槽与配方按钮。
- **Frosted Glass Pills（`.md-pill` / `.md-glass`）**: 半透明磨砂层（`backdrop-filter: blur(12px–16px) saturate(1.4–1.5)`，模糊半径严格控制在 `< 20px` 以兼顾 Safari 性能），用于卡片悬浮操作与悬浮配方坞。

### Named Rules
- **The Zero Nested Card Clutter Rule（禁止盒中套盒铁律）.** 严禁把带边框的 `bg-card` 卡片再套进另一个带边框的 `bg-card` 容器里（例如工作台左侧栏内已用 `divide-y` 分隔，画笔笔搁与暗房监视视窗采用无边框内陷凹槽 `.ks-recess` 或纯色差底垫分层，不得叠加多层圆角边框）。
- **The Zero One-Sided Stripe Rule（禁止圆角盒单侧色条律）.** 严禁在圆角卡片单侧粘贴竖向装饰色条（如配方槽左侧色条）；需要区分轨道语义时改用全边细框、前置色标徽章或圆点指示器。
- **The Reduced Transparency & High Contrast Rule（降透与高对比自适应律）.** 所有磨砂玻璃层（`.md-pill`、`.md-glass`、吸顶导航/刻度条 `[data-frosted-surface]` 与弹窗/抽屉遮罩）必须提供 `@media (prefers-reduced-transparency: reduce)` 实色不透明回退，并在 `@media (prefers-contrast: more)` 下强化边界对比度；全屏遮罩模糊半径控制在 `8px` 以兼顾 Safari 与移动端帧率。
- **The Warm Darkroom Keycap Rule（暗房温润键帽律）.** 暖黑主题（`.dark`）下的分段激活胶囊与凹槽内选定键帽（如 `MechanicalRockerSwitch`、`AuthModal` / `AccountModal` 选项卡）优先采用温润米金或阳极氧化枪灰键帽（`#EFECE5` 配 `#121110` 墨字，或 `#2A2722`–`#34302A` 配 `#E5A918/35–40` 金箔细边），确保在 `#151412` 凹槽上清晰可辨且避免刺眼纯白 `#FFFFFF` 眩光。

## Shapes

- **前台画册与仪器圆角阶梯**：基础圆角 `--radius: 12px`（`rounded-lg`）；紧凑控件/键帽 `8px–10px`；装裱画垫与内部区块 `12px–16px`；图库画框（`.md-tile-frame`）与黑曜石主舞台 `20px–22px`；行动胶囊、筛选条与内嵌圆箭采用全圆角 `9999px`。
- **后台瑞士极简圆角**：`/admin` 及其所有表单、开关、卡片与表格统一 `0px` 直角（`rounded-none`）。

## Components

### Buttons & Tactile Motion
- **Shape & Press**: 普通按钮 `12px` 圆角（`32px` 桌面高，移动端热区 `≥ 44px`），主行动按钮为全圆角漆面胶囊（`.skin-accent-btn`）配右侧内嵌圆形箭头徽章。
- **Press Feedback Rule**: 所有使用 `active:scale-[0.96–0.98]` 的按钮必须声明 `transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)]`（**禁止**只写 `transition-colors`，禁止对 `box-shadow` 或 `width` / `height` 做逐帧过渡）。
- **Motion Token Discipline**: 全站 CSS 与 Framer Motion（集中于 `src/lib/motionTokens.ts`）统一使用 `var(--ease-out)` / `MOTION_EASE_OUT`（`cubic-bezier(0.23, 1, 0.32, 1)`）、`var(--ease-in-out)`（`cubic-bezier(0.77, 0, 0.175, 1)`）与 `var(--ease-drawer)`（`cubic-bezier(0.32, 0.72, 0, 1)`）；常规 UI 动效 `≤ 300ms` 且退出快于进入（如弹窗进 `180ms` / 出 `130ms`）；方向性轮播切换必须为 `<AnimatePresence custom={direction}>` 搭配函数式 variants 防止反向退场错位；群组卡片入场采用递减节拍波动（非等距节拍器）；高频键盘动作与命令面板（`⌘K`）保持 `0ms` 瞬开瞬关；`pointermove` 中复用单例 `prefersReducedMotionNow()` 避免逐帧构造 `matchMedia`；严禁使用 `ease-in`、`scale(0)`、`transition: all` 或关键帧 `box-shadow` 动画。

### Cards & Reference Tiles
- **Unified GPU Gallery Engine**: 三大参考图库（`/poses`、`/costumes`、`/portraits`）统一采用轻量化直写 `transform` + 独立 GPU `foilRef` 扫光架构，并预留明确 `aspect-ratio` 与破图 `onError` 兜底；首屏前 6 张图 `loading="eager"`，其余 `loading="lazy"`；禁止在每张卡片上创建独立 `IntersectionObserver` 或逐帧向父容器写入可继承 CSS 变量。
- **Progressive Disclosure**: 静息态仅展示单行基线；悬停操作与 JS `onPointerEnter` 动效必须限定 `e.pointerType === 'mouse'` 或 `@media (hover: hover) and (pointer: fine)`，避免触屏点按残留悬停态；紧凑移动端配方槽（`<60px`）不在缩略图角落叠放删卡 `X` 按钮，改为点按缩略图在操作菜单中移除，防止误触。
- **Performance & Bundle Guard**: 仅在拖拽/激活时按需使用 `will-change: transform`；禁止对全分辨率大图做 `filter: blur()` 入场动画、对折叠手风琴做 `height: 'auto'` 逐帧重排、在静止态维持空转 60fps rAF 或在首页挂载全局 `pointermove` 装饰光标；图库页通过细粒度 `useStudioShallow` 订阅避免后台任务推送引起整页卡片重渲染，工作台非首屏弹窗按需 `React.lazy` 拆分且跨库查询按需启用。

### Overlays, Sheets & Modals
- **Origin & Motion**: 弹出层（Popover / Dropdown / Select / Tooltip）以触发器为缩放原点（`origin-(--radix-*-content-transform-origin)`），模态框保持居中；`SheetContent` 必须按 `100%` 自身宽高滑入并适配上下左右安全区；大图灯箱（`ImageViewer` / `ZoomViewport`）全屏遮罩统一 `blur(8px)` + `data-frosted-surface` 降透回退，并支持鼠标双击 `1× ↔ 2.2×` 缩放与单帧原子化双指捏合平移；`@media (prefers-reduced-motion: reduce)` 下清除位移、缩放、脉冲与滤镜动画，保留柔和的 `160ms` 透明度淡入淡出。

### Studio Workbench & High-Stakes Controls
- **Privacy & Credit Display**: 用户端任何页面、弹窗、进度条及非管理员 API 严禁出现画师内部代号或系统生图提示词；仅展示画笔名称、配方摘要与用户补充词；单次生图积分消耗只标在主生成按钮与会立即扣费的快捷重绘按钮上。
- **Confirmation & Recovery**: 涉及立即扣积分的操作（如「同配重绘」）必须明示积分或二次确认；不可逆批量删除云端作品/画廊投稿必须经过 `AlertDialog` 或 `TactileHoldButton` 长按确认；失败态延续「自动全额退还积分 + 重试/图转文兜底」的安心体验。

### Signature Instruments
- `OpticalSplitCurtain`（白模 ⇄ 3D 深度图光学拉帘，需做多指 `pointerId` 防护）
- `RecipeDock`（跨图库悬浮三轨配方坞，收起/展开平滑过渡并带安全区留白）
- `InteractiveRecipeFan` / `VisualAspectMorphCard` / `DarkroomExposureReveal`（高阻尼弹簧交互，避免每帧动画 `width` / `height` 触发布局重排）
- `PackStage`（3D 手撕盲盒箔包，核心徽章 `.hp-orb` 锁定金箔/古铜/象牙/朱砂金属光泽，禁止 `hue-rotate` 全彩轮转）
- `GlowCard3D`（WebGL2 3D 服装卡片：采用 `kinpakuFoil` 金箔古铜边缘高光取代 RGB 彩虹着色器，拖拽带单指 `pointerId` + `lostpointercapture` 防护，且在 `prefers-reduced-motion: reduce` 下切换为按需单帧渲染，静止态 GPU 零空转）

## Do's and Don'ts

### Do:
- **Do** 用 `1px` 建筑细线与留白分层，让参考图成为绝对主角；卡片预留 `aspect-ratio` 并提供破图 `onError` 兜底。
- **Do** 统一复用 `--ease-out` / `--ease-in-out` / `--ease-drawer` 缓动变量，按键按下给出 `150ms` `scale(0.97)` 物理微缩，命令面板与键盘导航保持 `0ms` 零延迟。
- **Do** 为所有仅图标按钮、表单控件和关键状态开关提供 `aria-label` 与聚焦可见说明（不依赖鼠标悬停 `title`），并在移动端保障 `44×44px` 点击区与安全区留白。
- **Do** 在涉及扣积分或不可逆删除的高风险操作前给出清晰费用提示、二次确认或长按确认，并保持失败自动退积分的明确反馈。

### Don't:
- **Don't** 使用廉价 AI 蓝紫霓虹渐变、彩虹糖果渐变（如盲盒核心球体）或彩色外发光（`dark-glow`）。
- **Don't** 制造「盒中套盒」（带边框卡片内再嵌套多层带边框圆角卡片）或在同一视口放置两个互相竞争的朱砂红主按钮/双提示词输入框。
- **Don't** 使用小于 `12px` 的功能文字、对中文宋体施加伪斜体 `italic`，或将装饰性金箔 `#E5A918` 直接用作浅底文字。
- **Don't** 使用 `transition: all`、`ease-in`、`scale(0)`、在 `active:scale-*` 上搭配 `transition-colors`、对 `width` / `height` 做逐帧弹簧动画，或在 `prefers-reduced-motion: reduce` 下仍播放位移/滤镜动画。
- **Don't** 在任何用户端界面暴露画师代号与内部编译提示词，或在用户无感知的情况下静默扣积分/批量删除云端数据。
