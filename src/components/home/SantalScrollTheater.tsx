import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import {
  ApertureIcon,
  ArrowUpRightIcon,
  CameraIcon,
  SparklesIcon,
} from 'lucide-react'
import { ArtistSprite3D, type PointerTiltState } from '@/components/studio/ArtistSprite3D'
import { KineticRollText } from '@/components/motion/SignatureBlocks'
import {
  AnalogInspirationSlotDrum,
  MechanicalCameraShutter,
} from '@/components/motion/SkeuomorphicInstruments'
import { playSpriteHover, playSpritePoke } from '@/lib/studioAudio'
import { toggleSceneNoteChip } from '@/lib/studioPromptChips'
import { playBrassDialTick, playMechanicalSwitch, playTypewriterKey } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import type { ImageProviderId } from '@/types/gallery'

export interface TheaterSampleCards {
  pose?: { thumb: string; title: string }
  costume?: { thumb: string; title: string; contain?: boolean }
  portrait?: { thumb: string; title: string }
}

const THEATER_ACTS = [
  { index: 0, code: '01', label: '自由文生图', en: 'TEXT-TO-IMAGE', targetRatio: 0.04 },
  { index: 1, code: '02', label: '灵动创作精灵', en: '3D TACTILE SPRITES', targetRatio: 0.36 },
  { index: 2, code: '03', label: '实体烫金盲盒', en: 'FOIL BLINDBOX', targetRatio: 0.66 },
  { index: 3, code: '04', label: '无限节点画布', en: 'INFINITE CANVAS', targetRatio: 0.94 },
] as const

const THEATER_SPRITES: Array<{
  providerId: ImageProviderId
  brushColorHex: string
  brushGlowHex: string
  offsetY: number
}> = [
  { providerId: 'gpt', brushColorHex: '#10A37F', brushGlowHex: 'rgba(16,163,127,0.35)', offsetY: 14 },
  { providerId: 'gemini', brushColorHex: '#E5A918', brushGlowHex: 'rgba(229,169,24,0.35)', offsetY: 4 },
  { providerId: 'grok', brushColorHex: '#D9381E', brushGlowHex: 'rgba(217,56,30,0.35)', offsetY: -6 },
  { providerId: 'muse', brushColorHex: '#19857B', brushGlowHex: 'rgba(25,133,123,0.35)', offsetY: 4 },
  { providerId: 'seedream', brushColorHex: '#F59E0B', brushGlowHex: 'rgba(245,158,11,0.35)', offsetY: 14 },
]

const QUICK_MOODS = [
  { label: '胶片颗粒', text: 'Kodak Portra 400 analog film grain, organic halation', led: '#E5A918' },
  { label: '黄金逆光', text: 'warm golden hour backlit rim light, glowing hair edges', led: '#F59E0B' },
  { label: '高定画报', text: 'luxury editorial magazine photography, architectural lighting', led: '#D9381E' },
  { label: '电影宽幅', text: 'cinematic 35mm anamorphic still, rich atmospheric depth', led: '#19857B' },
] as const

export function SantalScrollTheater({
  sampleCards,
  draftPrompt,
  onDraftPromptChange,
  onLaunchTextToImage,
  onOpenBlindbox,
  onOpenCanvas,
  onOpenStudio,
}: {
  sampleCards: TheaterSampleCards
  draftPrompt: string
  onDraftPromptChange: (next: string) => void
  onLaunchTextToImage: (promptOverride?: string) => void
  onOpenBlindbox: () => void
  onOpenCanvas: () => void
  onOpenStudio: () => void
}) {
  const prefersReduced = useReducedMotion()
  const trackRef = useRef<HTMLDivElement | null>(null)
  const pointerTiltRef = useRef<PointerTiltState>({ nx: 0, ny: 0, active: false })

  const [activeAct, setActiveAct] = useState(0)
  const [shutterTick, setShutterTick] = useState(0)
  const [hoveredSprite, setHoveredSprite] = useState<ImageProviderId | null>(null)
  const [pokedSprite, setPokedSprite] = useState<Record<string, { combo: number; tick: number }>>({})
  const stageCardRef = useRef<HTMLDivElement | null>(null)

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  })

  const smooth = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.32,
  })

  useMotionValueEvent(smooth, 'change', (latest) => {
    const nextAct = latest < 0.24 ? 0 : latest < 0.51 ? 1 : latest < 0.77 ? 2 : 3
    setActiveAct((prev) => (prev === nextAct ? prev : nextAct))
  })

  // ==================== 四幕丝滑滚动渐变与 3D 景深驱动曲线 ====================
  // ACT 01: 0.00 -> 0.26
  const act1Opacity = useTransform(smooth, [0, 0.19, 0.27], [1, 1, 0])
  const act1Scale = useTransform(smooth, [0, 0.27], prefersReduced ? [1, 1] : [1, 0.94])
  const act1Y = useTransform(smooth, [0, 0.27], prefersReduced ? [0, 0] : [0, -30])

  // ACT 02 (3D 精灵舞台): 0.21 -> 0.54
  const act2Opacity = useTransform(smooth, [0.19, 0.28, 0.46, 0.54], [0, 1, 1, 0])
  const act2Scale = useTransform(smooth, [0.19, 0.3, 0.54], prefersReduced ? [1, 1, 1] : [0.93, 1, 1.04])
  const act2Y = useTransform(smooth, [0.19, 0.3, 0.54], prefersReduced ? [0, 0, 0] : [38, 0, -32])

  // ACT 03 (盲盒随滚动开袋展卡): 0.48 -> 0.80
  const act3Opacity = useTransform(smooth, [0.46, 0.55, 0.72, 0.8], [0, 1, 1, 0])
  const act3Scale = useTransform(smooth, [0.46, 0.56, 0.8], prefersReduced ? [1, 1, 1] : [0.93, 1, 1.04])
  const cardLeftX = useTransform(smooth, [0.5, 0.68], prefersReduced ? [-184, -184] : [0, -184])
  const cardLeftRot = useTransform(smooth, [0.5, 0.68], prefersReduced ? [-13, -13] : [0, -13])
  const cardRightX = useTransform(smooth, [0.5, 0.68], prefersReduced ? [184, 184] : [0, 184])
  const cardRightRot = useTransform(smooth, [0.5, 0.68], prefersReduced ? [13, 13] : [0, 13])
  const cardTopY = useTransform(smooth, [0.5, 0.68], prefersReduced ? [-112, -112] : [16, -112])
  const foilTilt = useTransform(smooth, [0.5, 0.74], prefersReduced ? [0, 0] : [-6, 6])

  // ACT 04 (无限画布随滚动逐路画线): 0.72 -> 1.00（入幕即完整连通至右侧输出节点）
  const act4Opacity = useTransform(smooth, [0.73, 0.82, 1], [0, 1, 1])
  const act4Scale = useTransform(smooth, [0.73, 0.84, 1], prefersReduced ? [1, 1, 1] : [0.94, 1, 1])
  const wirePathLength = useTransform(smooth, [0.72, 0.85], prefersReduced ? [1, 1] : [0, 1])

  const scrollToAct = (ratio: number) => {
    playBrassDialTick()
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const scrollTop = window.scrollY + rect.top
    const scrollable = Math.max(0, el.offsetHeight - window.innerHeight)
    window.scrollTo({
      top: scrollTop + scrollable * ratio,
      behavior: prefersReduced ? 'auto' : 'smooth',
    })
  }

  const handleStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || prefersReduced) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    pointerTiltRef.current = { nx, ny, active: true }
    if (stageCardRef.current) {
      stageCardRef.current.style.transform = `perspective(1100px) rotateX(${(-ny * 3.0).toFixed(2)}deg) rotateY(${(nx * 4.0).toFixed(2)}deg)`
    }
  }

  const handleStagePointerLeave = () => {
    pointerTiltRef.current = { nx: 0, ny: 0, active: false }
    if (stageCardRef.current) {
      stageCardRef.current.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg)'
    }
  }

  const handlePokeSprite = (pid: ImageProviderId) => {
    const nextCombo = (pokedSprite[pid]?.combo ?? 0) + 1
    playSpritePoke(pid, nextCombo)
    setPokedSprite((prev) => {
      const curr = prev[pid] ?? { combo: 0, tick: 0 }
      return {
        ...prev,
        [pid]: { combo: curr.combo + 1, tick: curr.tick + 1 },
      }
    })
  }

  const handleLaunchNow = (override?: string) => {
    setShutterTick((t) => t + 1)
    window.setTimeout(() => onLaunchTextToImage(override), 210)
  }

  return (
    <section className="relative w-full">
      {/* ==================== 桌面端：220svh 吸顶滚动渐变剧场（外轨铺黑曜石底色避免视口外漏浅底，非激活幕自动 inert） ==================== */}
      <div ref={trackRef} className="relative hidden h-[220svh] w-full bg-[#121110] md:block">
        <div
          onPointerMove={handleStagePointerMove}
          onPointerLeave={handleStagePointerLeave}
          className="ks-obsidian-stage dark sticky top-[calc(88px+env(safe-area-inset-top,0px))] flex h-[calc(100svh-88px-env(safe-area-inset-top,0px))] min-h-[580px] w-full flex-col justify-between overflow-hidden border-t border-[#E5A918]/28 text-[#F5F1E8]"
        >
          <span
            aria-hidden="true"
            className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 z-30 h-[1px]"
          />

          {/* 建筑纵线投影 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 mx-auto grid max-w-[1360px] grid-cols-4 px-10"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-full border-l border-white/[0.04] last:border-r" />
            ))}
          </div>

          <MechanicalCameraShutter triggerTick={shutterTick} />

          {/* 顶行剧场遥测 HUD（01 | 04 计数 + 快捷跳幕胶囊） */}
          <div className="relative z-30 mx-auto flex w-full max-w-[1360px] items-center justify-between gap-4 border-b border-white/10 px-6 py-3.5 lg:px-10">
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="font-bold text-[#F5C443] tabular-nums">
                {THEATER_ACTS[activeAct].code} <span className="text-white/30">|</span> 04
              </span>
              <span className="text-[#C8C0B2]">{THEATER_ACTS[activeAct].en}</span>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-white/12 bg-black/45 p-1 backdrop-blur-md">
              {THEATER_ACTS.map((act) => {
                const isAct = activeAct === act.index
                return (
                  <button
                    key={act.code}
                    type="button"
                    aria-current={isAct ? 'step' : undefined}
                    onClick={() => scrollToAct(act.targetRatio)}
                    className={cn(
                      'relative inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                      isAct ? 'text-[#151412]' : 'text-[#D6CFC2] hover:text-white'
                    )}
                  >
                    {isAct && (
                      <motion.span
                        layoutId="theater-act-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-[#F5C443] to-[#C88E0B]"
                      />
                    )}
                    <span className="relative z-10 font-mono">{act.code}</span>
                    <span className="relative z-10">{act.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden w-24 items-center gap-2 lg:flex">
                <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/15">
                  <motion.div
                    style={{ scaleX: smooth, transformOrigin: '0% 50%' }}
                    className="h-full w-full bg-gradient-to-r from-[#C42F16] to-[#F5C443]"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = trackRef.current?.closest('section')?.nextElementSibling as HTMLElement | null
                  if (next) next.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
                }}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 font-mono text-xs text-[#D6CFC2] transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918]/55 hover:text-white active:scale-95"
              >
                <span>跳过剧场 ↓</span>
              </button>
            </div>
          </div>

          {/* ==================== 中央四幕叠加丝滑变换舞台 ==================== */}
          <div className="relative z-20 mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 items-center justify-center px-6 lg:px-10">
            {/* ACT 01 · 自由文生图暗房 */}
            <motion.div
              inert={activeAct !== 0}
              aria-hidden={activeAct !== 0}
              style={{ opacity: act1Opacity, scale: act1Scale, y: act1Y }}
              className={cn(
                'absolute inset-x-6 grid grid-cols-12 items-center gap-10 lg:inset-x-10',
                activeAct === 0 ? 'pointer-events-auto z-20' : 'pointer-events-none z-10'
              )}
            >
              <div className="col-span-5 space-y-5">
                <h2 className="ed-headline-tight text-4xl font-bold text-white lg:text-5xl">
                  <span>一句话，</span>
                  <br />
                  <span className="font-bold text-[#F5C443]">
                    直出杂志级大片。
                  </span>
                </h2>
                <p className="text-sm leading-relaxed text-[#C8C0B2]">
                  拉杆摇词或直接描述画面，一键进入暗房显影。
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleLaunchNow()}
                    className="group skin-accent-btn relative inline-flex h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-full py-1 pr-2 pl-5 text-xs font-bold"
                  >
                    <CameraIcon className="size-3.5" />
                    <KineticRollText text="快门开拍" />
                    <span className="flex size-6.5 items-center justify-center rounded-full bg-white/20">
                      <ArrowUpRightIcon className="size-3.5" />
                    </span>
                  </button>
                </div>
              </div>

              <div
                ref={stageCardRef}
                data-impeccable-ignore="nested-cards"
                style={{
                  transform: 'perspective(1100px) rotateX(0deg) rotateY(0deg)',
                }}
                className="col-span-7 space-y-3.5 rounded-[22px] bg-[#141311]/92 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-[#E5A918]/25 transition-transform duration-200 ease-[var(--ease-out)]"
              >
                <AnalogInspirationSlotDrum
                  onRollPrompt={(composed) => onDraftPromptChange(composed)}
                />
                <textarea
                  rows={3}
                  value={draftPrompt}
                  onChange={(e) => onDraftPromptChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleLaunchNow()
                    }
                  }}
                  placeholder="输入你想生成的画面（支持中/英文），或点击上方黄铜拉杆摇词…"
                  className="w-full resize-none rounded-xl border border-white/12 bg-black/50 px-3.5 py-2.5 text-sm text-white placeholder:text-[#9A9386] focus:border-[#E5A918]/70 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_MOODS.map((sw) => {
                    const active = draftPrompt.includes(sw.text)
                    return (
                      <button
                        key={sw.label}
                        type="button"
                        onClick={() => {
                          playTypewriterKey()
                          onDraftPromptChange(toggleSceneNoteChip(draftPrompt, sw.text).next)
                        }}
                        className={cn(
                          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition',
                          active
                            ? 'border-[#E5A918]/65 bg-[#2A251D] text-white'
                            : 'border-white/12 bg-[#1A1815] text-[#D2CBBF] hover:border-white/30'
                        )}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: active ? sw.led : 'rgba(255,255,255,0.28)',
                          }}
                        />
                        <span>{sw.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>

            {/* ACT 02 · 五只 3D 创作精灵实时眼神跟随与戳一戳互动 */}
            <motion.div
              inert={activeAct !== 1}
              aria-hidden={activeAct !== 1}
              style={{ opacity: act2Opacity, scale: act2Scale, y: act2Y }}
              className={cn(
                'absolute inset-x-6 flex flex-col items-center gap-6 text-center lg:inset-x-10',
                activeAct === 1 ? 'pointer-events-auto z-20' : 'pointer-events-none z-10'
              )}
            >
              <div className="max-w-2xl space-y-2.5">
                <h2 className="ed-headline-tight text-4xl font-bold text-white lg:text-5xl">
                  <span>五路暗房引擎，</span>
                  <span className="font-bold text-[#F5C443]">
                    灵动协同显影。
                  </span>
                </h2>
                <p className="text-sm text-[#C8C0B2]">
                  移动鼠标感受眼神追踪，轻戳任意精灵触发拟物弹跳反应。
                </p>
              </div>

              {/* 五只真实 3D 精灵圆弧展台（严格零画师名、零积分标） */}
              <div className="relative flex w-full max-w-[920px] items-end justify-center gap-3 rounded-[28px] border border-[#E5A918]/25 bg-gradient-to-b from-white/[0.03] to-black/45 px-6 pt-8 pb-6 shadow-[inset_0_1px_0_rgba(255,235,190,0.12)] lg:gap-8">
                {THEATER_SPRITES.map((sp, idx) => {
                  const isHov = hoveredSprite === sp.providerId
                  const poke = pokedSprite[sp.providerId]
                  return (
                    <motion.button
                      key={sp.providerId}
                      type="button"
                      onMouseEnter={() => {
                        setHoveredSprite(sp.providerId)
                        playSpriteHover(sp.providerId)
                      }}
                      onMouseLeave={() => setHoveredSprite(null)}
                      onClick={() => handlePokeSprite(sp.providerId)}
                      whileHover={{ y: -8, scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                      style={{ marginBottom: sp.offsetY }}
                      aria-label={`互动 3D 创作精灵 0${idx + 1}`}
                      className="group relative flex cursor-pointer flex-col items-center justify-end rounded-2xl p-2 transition focus-visible:outline-2 focus-visible:outline-[#E5A918]"
                    >
                      <ArtistSprite3D
                        providerId={sp.providerId}
                        selected={isHov}
                        hovered={isHov}
                        cheering={Boolean(poke && poke.tick > 0)}
                        holdingBrush
                        pointerTiltRef={pointerTiltRef}
                        pokedCombo={poke?.combo ?? 0}
                        reactionTick={poke?.tick ?? 0}
                        brushColorHex={sp.brushColorHex}
                        brushGlowHex={sp.brushGlowHex}
                        size="lg"
                      />
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>

            {/* ACT 03 · 实体烫金盲盒：随滚动进度自动从箔袋背后扇形展开三张真实参考卡 */}
            <motion.div
              inert={activeAct !== 2}
              aria-hidden={activeAct !== 2}
              style={{ opacity: act3Opacity, scale: act3Scale }}
              className={cn(
                'absolute inset-x-6 grid grid-cols-12 items-center gap-8 lg:inset-x-10',
                activeAct === 2 ? 'pointer-events-auto z-20' : 'pointer-events-none z-10'
              )}
            >
              <div className="col-span-5 space-y-5">
                <h2 className="ed-headline-tight text-4xl font-bold text-white lg:text-5xl">
                  <span>轻滑滚轮，</span>
                  <br />
                  <span className="font-bold text-[#F5C443]">
                    看三卡破袋舒展。
                  </span>
                </h2>
                <p className="text-sm leading-relaxed text-[#C8C0B2]">
                  点击右侧烫金箔袋，进入全屏盲盒舞台手撕抽卡。
                </p>
              </div>

              {/* 随滚动自动扇形舒展的箔袋 + 三张真实标本卡 */}
              <div className="relative col-span-7 flex h-[380px] items-center justify-center">
                <motion.div
                  style={{ x: cardLeftX, rotate: cardLeftRot }}
                  className="absolute z-10 w-[148px] overflow-hidden rounded-2xl border border-[#E5A918]/45 bg-[#1B1916] p-1.5 shadow-[0_22px_50px_rgba(0,0,0,0.65)]"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-xl bg-[#100F0D]">
                    {sampleCards.pose?.thumb && (
                      <img
                        src={sampleCards.pose.thumb}
                        alt={sampleCards.pose.title}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-contain p-1"
                      />
                    )}
                  </div>
                  <div className="mt-1.5 truncate px-1 font-mono text-xs text-[#F5C443]">
                    01 · 姿势
                  </div>
                </motion.div>

                <motion.div
                  style={{ y: cardTopY }}
                  className="absolute z-15 w-[148px] overflow-hidden rounded-2xl border border-[#E5A918]/55 bg-[#1B1916] p-1.5 shadow-[0_24px_54px_rgba(0,0,0,0.7)]"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-xl bg-[#100F0D]">
                    {sampleCards.portrait?.thumb && (
                      <img
                        src={sampleCards.portrait.thumb}
                        alt={sampleCards.portrait.title}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover object-top"
                      />
                    )}
                  </div>
                  <div className="mt-1.5 truncate px-1 font-mono text-xs text-[#F5C443]">
                    02 · 人像
                  </div>
                </motion.div>

                <motion.div
                  style={{ x: cardRightX, rotate: cardRightRot }}
                  className="absolute z-10 w-[148px] overflow-hidden rounded-2xl border border-[#2DD4BF]/50 bg-[#1B1916] p-1.5 shadow-[0_22px_50px_rgba(0,0,0,0.65)]"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-xl bg-[#100F0D]">
                    {sampleCards.costume?.thumb && (
                      <img
                        src={sampleCards.costume.thumb}
                        alt={sampleCards.costume.title}
                        loading="lazy"
                        decoding="async"
                        className={cn(
                          'size-full',
                          sampleCards.costume.contain ? 'bg-white object-contain p-1' : 'object-cover object-top'
                        )}
                      />
                    )}
                  </div>
                  <div className="mt-1.5 truncate px-1 font-mono text-xs text-[#5EEAD4]">
                    03 · 服装
                  </div>
                </motion.div>

                <motion.button
                  type="button"
                  onClick={onOpenBlindbox}
                  style={{ rotate: foilTilt }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  className="relative z-20 flex h-[272px] w-[196px] cursor-pointer flex-col justify-between overflow-hidden rounded-[18px] border border-[#E5A918]/65 bg-gradient-to-br from-[#2B1B17] via-[#9E2814] to-[#171210] p-4 text-left text-white shadow-[0_28px_60px_rgba(0,0,0,0.55)]"
                >
                  <div className="flex items-center justify-between border-b border-dashed border-[#FDE68A]/55 pb-2 font-mono text-xs text-[#FDE68A]">
                    <span>TEAR HERE</span>
                    <span>✂</span>
                  </div>
                  <div className="space-y-1 text-center">
                    <span className="font-editorial-serif block text-4xl font-bold text-[#FDE68A]">
                      No.01
                    </span>
                    <span className="block font-mono text-xs font-bold tracking-[0.2em]">
                      CASTDECK FOIL
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/15 pt-2 font-mono text-xs text-[#FDE68A]">
                    <span>3 CARDS</span>
                    <span>撕开 ↗</span>
                  </div>
                </motion.button>
              </div>
            </motion.div>

            {/* ACT 04 · 无限节点画布：SVG 黄铜贝塞尔连线随滚动进度逐像素点亮绘制 */}
            <motion.div
              inert={activeAct !== 3}
              aria-hidden={activeAct !== 3}
              style={{ opacity: act4Opacity, scale: act4Scale }}
              className={cn(
                'absolute inset-x-6 grid grid-cols-12 items-center gap-8 lg:inset-x-10',
                activeAct === 3 ? 'pointer-events-auto z-20' : 'pointer-events-none z-10'
              )}
            >
              <div className="col-span-5 space-y-5">
                <h2 className="ed-headline-tight text-4xl font-bold text-white lg:text-5xl">
                  <span>自由拖线，</span>
                  <br />
                  <span className="font-bold text-[#F5C443]">
                    画布内原地生图对比。
                  </span>
                </h2>
                <p className="text-sm leading-relaxed text-[#C8C0B2]">
                  自由拖线编排提示词、光学与三库参考，原地并发 A/B 生图与链式迭代。
                </p>
              </div>

              {/* 随滚动动态绘制 SVG 贝塞尔连线的拟物节点示意图 */}
              <div
                className="relative col-span-7 h-[356px] overflow-hidden rounded-[24px] border border-[#E5A918]/30 bg-[#0D0C0A] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(229,169,24,0.22) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 680 356"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 size-full"
                >
                  {/* 底层暗金导轨：任何滚屏进度下均保持物理连通感 */}
                  <path
                    d="M 214 54 C 312 54, 338 158, 446 158"
                    fill="none"
                    stroke="rgba(229,169,24,0.18)"
                    strokeWidth="2"
                    strokeDasharray="4 5"
                  />
                  <path
                    d="M 214 178 C 312 178, 338 178, 446 178"
                    fill="none"
                    stroke="rgba(229,169,24,0.18)"
                    strokeWidth="2"
                    strokeDasharray="4 5"
                  />
                  <path
                    d="M 214 302 C 312 302, 338 198, 446 198"
                    fill="none"
                    stroke="rgba(229,169,24,0.18)"
                    strokeWidth="2"
                    strokeDasharray="4 5"
                  />
                  {/* 动态点亮信号连线 */}
                  <motion.path
                    d="M 214 54 C 312 54, 338 158, 446 158"
                    fill="none"
                    stroke="#D9381E"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    style={{ pathLength: wirePathLength }}
                  />
                  <motion.path
                    d="M 214 178 C 312 178, 338 178, 446 178"
                    fill="none"
                    stroke="#E5A918"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    style={{ pathLength: wirePathLength }}
                  />
                  <motion.path
                    d="M 214 302 C 312 302, 338 198, 446 198"
                    fill="none"
                    stroke="#2DD4BF"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    style={{ pathLength: wirePathLength }}
                  />
                </svg>

                {/* 左侧 3 张上游节点 */}
                <div className="relative z-10 flex h-full flex-col justify-between">
                  {[
                    { tag: '01 · PROMPT', title: '主体提示卡', dot: '#D9381E' },
                    { tag: '02 · OPTICS', title: 'Portra 400 胶片逆光', dot: '#E5A918' },
                    { tag: '03 · ASSET', title: '姿势 / 服装 / 人像标本', dot: '#2DD4BF' },
                  ].map((item) => (
                    <div
                      key={item.tag}
                      className="w-[210px] rounded-xl border border-white/14 bg-[#181613]/95 px-3.5 py-2.5 shadow-lg"
                    >
                      <div className="flex items-center gap-2 font-mono text-xs text-[#D2CBBF]">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: item.dot }}
                        />
                        <span>{item.tag}</span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-white">{item.title}</div>
                    </div>
                  ))}
                </div>

                {/* 右侧原地生图输出节点 */}
                <div className="absolute top-1/2 right-6 z-10 w-[238px] -translate-y-1/2 rounded-2xl border border-[#E5A918]/50 bg-gradient-to-b from-[#1E1C18] to-[#131210] p-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#F5C443]">
                      <ApertureIcon className="size-3.5" />
                      <span>RENDER NODE</span>
                    </span>
                    <span className="font-mono text-xs text-[#4FD1C5]">A/B BRANCH</span>
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3 text-xs leading-relaxed text-[#D8D0C2]">
                    自动汇聚全部上游提示词与参考图，画布内原地并行出图，成品向右拉线继续迭代。
                  </div>
                  <Link
                    to="/canvas"
                    onClick={() => playMechanicalSwitch(1.05)}
                    className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#E5A918] text-xs font-bold text-[#151412] transition hover:bg-[#F5C443]"
                  >
                    <SparklesIcon className="size-3.5" />
                    <span>立即体验无限画布</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 底行：极简滚动提示 */}
          <div className="relative z-30 mx-auto flex w-full max-w-[1360px] items-center justify-between gap-6 border-t border-white/10 px-6 py-2.5 font-mono text-xs text-[#B5AEA2] lg:px-10">
            <span className="hidden xl:inline">CASTDECK CINEMA STAGE · 随滚轮丝滑切换四幕</span>
            <span className="ml-auto text-[#F5C443]">
              {activeAct < 3 ? '继续向下滑动切换下一幕 ↓' : '继续向下查看完整创作链路 ↓'}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== 移动端精简卡片流 ==================== */}
      <div className="ks-obsidian-stage dark space-y-4 border-t border-[#E5A918]/25 px-4 py-10 text-[#F5F1E8] md:hidden">
        <div className="font-mono text-xs font-semibold text-[#F5C443]">[ 暗房工坊四条创作线 ]</div>
        <div className="grid grid-cols-1 gap-3">
          {[
            { code: '01', title: '自由文生图', desc: '黄铜摇词与五路引擎高分辨率直出', onClick: () => handleLaunchNow() },
            { code: '02', title: '多引擎灵动画笔', desc: '3D 拟物精灵交互，自由切换风格画笔', onClick: onOpenStudio },
            { code: '03', title: '实体烫金盲盒', desc: '手撕箔袋三卡落槽，打破空白灵感', onClick: onOpenBlindbox },
            { code: '04', title: '无限节点画布', desc: '自由拖线编排，画布内原地并发 A/B 生图', onClick: onOpenCanvas },
          ].map((card) => (
            <button
              key={card.code}
              type="button"
              onClick={card.onClick}
              className="flex min-h-14 items-center justify-between rounded-2xl border border-white/12 bg-white/[0.04] p-4 text-left"
            >
              <div>
                <div className="font-mono text-xs text-[#F5C443]">{card.code}</div>
                <div className="mt-0.5 text-base font-bold text-white">{card.title}</div>
                <div className="mt-0.5 text-xs text-[#D2CBBF]">{card.desc}</div>
              </div>
              <ArrowUpRightIcon className="size-4 shrink-0 text-[#F5C443]" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
