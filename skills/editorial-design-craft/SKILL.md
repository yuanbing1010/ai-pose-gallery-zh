---
name: editorial-design-craft
description: High-taste anti-AI-slop editorial web design craft distilled from minimal.gallery, curated.design, landingly.co, recent.design (godly), landing.love, landingfolio.com, Stripe Press, FinalLap, and HUMAN.md. Use whenever designing, refactoring, or polishing frontend pages, galleries, creative studios, navbars, buttons, cards, or motion micro-interactions so the UI feels memorable, tactile, and bespoke rather than generic AI SaaS templates.
---

# Editorial Design Craft (Anti-AI-Slop Skill)

Use this skill when designing or overhauling web pages, galleries, creative tools, or UI components so the result carries genuine visual taste, architectural clarity, and tactile memorability.

## Core Philosophy

Modern AI-generated UIs look "clean" yet instantly forgettable because they repeat the same formula: centered purple gradients, puffy rounded-2xl cards nested inside cards, 4 badges stacked under every thumbnail, and heavy boxed navigation tabs.

High-taste editorial products (seen across `minimal.gallery`, `curated.design`, `landingly.co`, `recent.design`, `landing.love`, `landingfolio.com`, `Stripe Press`, `FinalLap`, and `HUMAN.md`) win through **restraint, typographic tension, gallery matting, progressive hover disclosure, and physical micro-interactions**.

## 7 Actionable Craft Patterns

### 1. Monospace Archival Eyebrows (`Landingfolio` + `Stripe Press`)
Place a crisp `12px` monospace status eyebrow above key page titles or studio sections:
- Dotted live eyebrow: `● 1,439 POSES · ARCHIVE`
- Bracketed archival eyebrow: `[ 01 · BLINDBOX EDITION ]` or `[ 配方槽位 3/3 ]`
- Always use `font-mono tabular-nums`, never smaller than `12px` (`text-xs`).

### 2. Two-Tone Split Display Headlines (`Landingly` + `Landingfolio` + `FinalLap`)
Replace generic single-color headings + long paragraph descriptions with a tight-tracked (`tracking-[-0.03em]`) split headline:
- Primary phrase in full ink (`text-foreground font-bold`).
- Secondary phrase in muted warm stone (`text-muted-foreground/75 font-medium`).
- Keeps above-the-fold height compact while creating immediate editorial rhythm.

### 3. Surgical Accent Restraint (`HUMAN.md` + `FinalLap` + `Landing Love`)
Treat the primary brand accent (e.g., Vermilion `#D9381E`) like a red ink seal, never wall paint:
- Use it on the brand wordmark punctuation dot (`CASTDECK.`), the tiny active navigation dot (`•`), embedded circular arrow submit buttons, and the single primary CTA per viewport.
- Let warm archival paper (`#F7F6F2`), crisp white surfaces (`#FFFFFF`), muted stone mats (`#EFECE5`), and deep ink (`#0A0A0A`) carry 95% of the canvas.

### 4. Active Dot Navigation & Zero-Chrome Chrome (`Recent Design` + `Minimal Gallery`)
- Avoid heavy filled pill boxes for every nav tab. Mark the active link with a crisp `5px–6px` accent dot (`•`) or spring-sliding underline hairline.
- Separate major workspace regions with `1px` structural hairlines (`border-border`) instead of stacking nested shadowed boxes.

### 5. Embedded-Arrow Pill Inputs & CTAs (`Curated Design` + `Landingly`)
- Inside pill search inputs or prompt bars, embed a solid circular arrow button (`size-8 rounded-full`) flush on the right edge.
- On primary pill CTAs, pair crisp text with an embedded circular icon badge whose arrow glides `+2px` on hover (`group-hover:translate-x-0.5`).

### 6. Faded Horizontal Filter Strips with Inline Counts (`Curated Design` + `Landing Love`)
- Render category filters as a single horizontally scrollable row with a right-edge CSS mask (`mask-image: linear-gradient(to right, black calc(100% - 32px), transparent)`) so users see scroll affordance without ugly scrollbars.
- Display muted inline counts inside pills (`全部 1,439`, `站姿 320`) in `font-mono tabular-nums`.

### 7. Museum Print Matting & Single-Baseline Progressive Disclosure (`Minimal Gallery` + `Curated Design` + `Landing Love`)
- Frame visual cards inside a subtle warm-stone mat (`1px` hairline + disciplined `8px–12px` architectural corners).
- **At rest**: zero floating badge clutter; at most ONE crisp baseline below the image (`Title` left, 1 datum right).
- **On hover**: reveal frosted-glass floating action pills cleanly inside the frame (like/bookmark with spring burst ring, remix/pick CTA, zoom).

## Tactile Motion Rules (`motion/react`)
- Use high-damping springs (`stiffness: 380–520, damping: 28–38`) for pill transitions, 3D fanned card decks, live morphing aspect-ratio viewfinders, and film-exposure image reveals.
- Always respect `prefers-reduced-motion`.
- Never use neon glows, infinite bounce loops, or blue-purple AI gradients.

## Ready-to-Use Signature Components in This Repo
Reuse these bespoke components instead of rebuilding plain buttons or static cards:
- `src/components/motion/SignatureBlocks.tsx`:
  - `KineticRollText` — Godly / Curated / Landingly vertical hover text-roll for primary CTAs.
  - `TactileHoldButton` — Recent Design physical hold-to-confirm liquid-fill sweep button for destructive clears/confirmations.
  - `InlineHeadlineStamp` — Landingly tilted live mini-thumbnail embedded directly inside display headlines (3D spring pop on hover).
  - `EditorialMarqueeRibbon` — Stripe Press 1px-bordered archival marquee ticker (pauses on hover, respects reduced motion).
  - `EditorialSpotlightCarousel` — Stripe Press 3D floating specimen + shifting ambient archival wash + Landing Love peeking neighbor cards + FinalLap `#01`–`#06` numbered lot pills.
- `src/components/motion/TactileMotion.tsx`:
  - `InteractiveRecipeFan` — Blind-box-inspired 3D spring-fanned collector card stack with shuffle burst.
  - `VisualAspectMorphCard` — Spring-morphing proportional aspect ratio viewfinder frame.
  - `DarkroomExposureReveal` — Exposure unmasking + 3D tilt glare + hover sheen for generated art.
  - `SpringBurstRing` — Tactile expanding ring burst on likes/bookmarks.

## Pre-Ship Aesthetic Audit Checklist
1. Are there any nested card-inside-card boxes that can be replaced by `1px` hairlines and whitespace?
2. Does any card stack 3+ tags/badges at rest instead of using single-baseline + hover disclosure?
3. Is the primary accent color restricted to focal seal points rather than sprayed across secondary badges?
4. Do horizontal filter bars use right-edge fade masks instead of visible scrollbars or awkward wrapping?
5. Are all functional labels/eyebrows/badges at least `12px` (`text-xs`) with `tabular-nums` for numbers?
6. Does every primary interaction have crisp tactile feedback (spring press, arrow glide, exposure reveal, or burst ring)?
