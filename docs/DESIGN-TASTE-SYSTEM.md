# Editorial Design Taste System — 高辨识度反 AI 模板化美学沉淀

> 本指南沉淀自对全球 6 个顶级网页设计画廊（`minimal.gallery`、`curated.design`、`landingly.co`、`godly.website / recent.design`、`landing.love`、`landingfolio.com`）及其精选标杆案例（`Stripe Press`、`FinalLap`、`HUMAN.md`、`Polar`、`Lindy`）的实地研究，旨在根治「越来越像 AI 生成的标准 SaaS 后台」的视觉趋同，将 **CASTDECK 经典金箔暖纸 × 朱砂印记（Kinpaku & Vermilion）** 打造成真正有记忆点的编辑部级数字产品。

---

## 一、六大高审美参考站核心 DNA 拆解

| 来源站点 | 网址 | 最值得吸收的核心设计范式 | 落地到本项目的转化方式 |
| --- | --- | --- | --- |
| **Minimal Gallery** | `https://minimal.gallery/` | **极致元数据克制**：静息态零外框/零冗余徽章；图下仅保留「左标题 + 右单维信息」的单一基线；展示标题紧凑字距（`-0.03em`）；利落 `6px–10px` 建筑圆角。 | 画廊与参考库卡片静息态去除徽章堆砌，保持单一基线信息；标题收紧追踪字距。 |
| **Curated Design** | `https://www.curated.design/` | **悬浮渐进披露 + 内嵌圆形箭头按钮 + 渐隐横向筛选条**：静息纯画、悬浮浮现磨砂操作胶囊；搜索框内嵌实心圆形箭头提交按钮；横向分类条右侧以线性渐变平滑淡出（无丑陋滚动条）；`2/3/4` 列密度切换。 | 灵感画廊搜索/文生图快捷胶囊内嵌朱砂红圆形箭头按钮；分类条引入 `.ed-fade-mask-x` 右侧渐隐遮罩；悬停浮现磨砂互动条。 |
| **Landingly** | `https://www.landingly.co/` | **双色调分裂大标题 + 内联微型视觉印记**：主句纯墨黑、副句暖灰退后形成自然节奏；轻量多维下拉药丸；白底细框双按钮搭配内嵌箭头圆章。 | 画廊页、参考库页采用「纯墨主句 + 暖灰副句」双色调标题排版，消除沉闷大段描述文字。 |
| **Godly / Recent Design** | `https://recent.design/?ref=godly` | **极简圆点激活态 + 物理材质交互**：导航/筛选激活态仅用一枚利落小圆点（`•`）而非厚重实心色块；`1px` 建筑细线框定异形画面；物理手感微动效（纸张、橡皮、按住确认、弹簧卡扣）。 | 顶栏主导航改用朱砂红小圆点（`•`）指示激活项；保留并强化盲盒抽卡与 3D 扇形卡组的物理弹簧手感。 |
| **Landing Love** | `https://www.landing.love/` | **博物馆画框装裱（Matting）+ 行内浅灰计数 + 聚光灯留边轮播**：将媒体画面装裱在微暖中性底垫中；筛选药丸内联柔和计数（`全部 1,439`）；精选焦点区两侧露边预示可探索内容。 | 创作台监视器与参考卡片引入温润和纸装裱垫（`.ed-mat`）；筛选药丸内联等宽浅灰计数。 |
| **Landingfolio** | `https://www.landingfolio.com/` | **等宽状态眉标 + 建筑细线网格**：大标题上方点缀一枚带实心小圆点的等宽眉标（`● 1,439 POSES · ARCHIVE`）；精准的表格/网格 1px 分割节奏与色卡圆点集群。 | 全站关键区块头部使用 `[ 01 · BLINDBOX ]` 或 `● 公共灵感画廊 · CURATED` 等宽眉标建立档案质感。 |

### 标杆案例精髓（与本仓库「和纸 × 朱砂」基因高度契合）
1. **Stripe Press (`stripe.press`)**：温润档案纸底 + `1px` 利落细线分割 + 方括号等宽标签（`[ NEW RELEASES ]`）+ 实体立体书脊与随内容切换的克制氛围。
2. **FinalLap (`finallap`)**：暖石纸底 + 紧凑编辑部主标 + **朱砂红主行动胶囊**嵌入分段式工具条 + 横向编号胶片条（`#01`–`#08`）。
3. **HUMAN.md (`human.md`)**：无衬线字标搭配一枚**朱砂红标点圆点**作为强烈品牌记忆点，四周大量留白，克制到极致。

---

## 二、反 AI 模板化（Anti-AI-Slop）设计铁律

1. **禁止盒中套盒（Zero Nested Card Clutter）**
   - 用 `1px` 建筑细线（`border-border`）与留白划分区域，不再把卡片塞进卡片再套上圆角灰框。
2. **禁止信息堆砌（Single-Baseline Discipline）**
   - 视觉卡片在静息态只做一件事：**让图片呼吸**。卡片下方最多保留一行基线（左标题 + 右 1 个核心数字或分类）；点赞、收藏、做同款、翻面、加入配方统一收敛为悬停渐进披露的磨砂悬浮层。
3. **朱砂红极度克制（Surgical Vermilion Accent）**
   - `#D9381E` 是印章，不是油漆。只在 **品牌标点圆点、导航激活微点、搜索内嵌圆箭、单页唯一主行动按钮（CTA）** 出现；其余界面交给和纸暖白（`#F7F6F2`）、纯白画纸（`#FFFFFF`）、暖石垫色（`#EFECE5`）与深墨黑（`#0A0A0A`）。
4. **排版必须有张力（Typographic Tension）**
   - 主标题采用双色调分裂（墨黑核心词 + 暖灰补充语）与 `-0.03em` 紧字距；编号、数量、画幅与状态统一使用 `JetBrains Mono` 等宽字体（`tabular-nums`）和方括号/圆点眉标，营造「实体设计画册 × 精密仪器」的记忆点。
5. **物理微动效克制而有触感（Tactile Spring Craft）**
   - 借鉴首页 `PackStage` 盲盒抽卡的质感：用 `motion/react` 高阻尼弹簧驱动导航指示点、3D 扇形卡组舒展、画幅取景框物理形变、成图显影扫光与点赞涟漪——绝不使用廉价霓虹发光、蓝紫渐变或无休止的弹跳动画。

---

## 三、核心组件原子规范

- **眉标（`.ed-eyebrow`）**：`12px` 等宽大写/中文标签，前配 `6px` 朱砂红或松石绿圆点，或 `[ 01 · ARCHIVE ]` 档案括弧。
- **双色调标题（Two-Tone Headline）**：`<span className="text-foreground">主陈述</span><span className="text-muted-foreground/75">副陈述</span>`，`tracking-[-0.03em]`。
- **内嵌圆箭胶囊（Embedded-Arrow Pill）**：胶囊搜索框或主按钮右侧内嵌一枚 `size-7`–`size-8` 实心圆形箭头徽章，悬停时内部箭头向右轻滑 `2px`。
- **渐隐横向筛选条（`.ed-fade-mask-x`）**：`mask-image: linear-gradient(to right, black calc(100% - 32px), transparent)`，优雅消解横向滚动条。
- **博物馆装裱画框（`.ed-mat`）**：微暖石色底垫 + `1px` 细线内框 + 建筑级 `8px–14px` 圆角，让每张参考图和生成作品像美术馆画册插页一样被郑重呈现。
