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

<!-- impeccable:design-map -->
Name: CASTDECK
Colors: primary: vermilion-seal #d9381e; secondary: kinpaku-gold #e5a918; tertiary: patina-jade #19857b; neutral: paper-canvas #f7f6f2; primary: vermilion-aa #c42f16; neutral: obsidian-canvas #121110
Fonts: Hanken Grotesk Variable (display-hero, display, headline, title, body); JetBrains Mono Variable (label); Songti SC (editorial-watermark)
Spacing: xs 4px, sm 8px, md 12px, lg 16px, xl 24px, 2xl 32px
Radius: none 0px, sm 7.2px, md 9.6px, lg 12px, xl 16.8px, 2xl 21.6px, pill 9999px
North Star: "Kinpaku Editorial & Tactile Studio Instrument（金箔编辑部画册 × 精密实体暗房仪器）"
Elevation:
- Museum Matting（.ed-mat）: 温润渐变底垫（日间 #F3F0E8 → #EAE5DA，暗间 #1F1E1A → #171613）+ 1px 内描边 + 顶部微高光，用于作品与标本装裱。
- Obsidian Stage（.ks-obsidian-stage）: 阳极氧化黑曜石渐变（#1B1916 → #131210 → #0E0D0C）+ 1px rgba(229,169,24,0.22) 暗金细边 + 0 18px 46px rgba(15,13,10,0.22)，用于暗房取景器、深度对比扫描器与页面档案头。
- Tactile Instrument Keycaps（.ks-recess / .ks-keycap / .ks-paper-keycap）: 凹槽内阴影（inset 0 1px 2px rgba(0,0,0,0.08)）与实体键帽顶缘高光，用于参数切换槽与配方按钮。
- (+5 more)
Don't:
- Don't 使用廉价 AI 蓝紫霓虹渐变、彩虹糖果渐变（如盲盒核心球体）或彩色外发光（`dark-glow`）。
- Don't 制造「盒中套盒」（带边框卡片内再嵌套多层带边框圆角卡片）或在同一视口放置两个互相竞争的朱砂红主按钮/双提示词输入框。
- Don't 使用小于 `12px` 的功能文字、对中文宋体施加伪斜体 `italic`，或将装饰性金箔 `#E5A918` 直接用作浅底文字。
- Don't 使用 `transition: all`、`ease-in`、`scale(0)`、在 `active:scale-*` 上搭配 `transition-colors`、对 `width` / `height` 做逐帧弹簧动画，或在 `prefers-reduced-motion: reduce` 下仍播放位移/滤镜动画。
- Don't 在任何用户端界面暴露画师代号与内部编译提示词，或在用户无感知的情况下静默扣积分/批量删除云端数据。
Map: docs/DESIGN-TASTE-SYSTEM.md
Map: skills/editorial-design-craft/SKILL.md
Map: src/lib/motionTokens.ts
Full: .impeccable/design-full.md (read a section when you need its detail)
