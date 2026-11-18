import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArtistMesh3D, type SpriteMood, type SpritePoseTarget } from '@/components/studio/ArtistMesh3D'
import { ArtistPaintbrush } from '@/components/studio/ArtistPaintbrush'
import { getBrushPalette } from '@/lib/brushPalettes'
import { toast } from '@/lib/notifications'
import {
  playBrushHover,
  playBrushSelect,
  playSpriteHover,
  playSpritePoke,
  playSpriteSelect,
  unlockStudioAudio,
} from '@/lib/studioAudio'
import { cn } from '@/lib/utils'
import type {
  ImageProviderId,
  ProviderModelPublicInfo,
  ProviderPublicInfo,
  StudioArtistPersona,
} from '../../../shared/studio'

export interface PointerTiltState {
  nx: number
  ny: number
  active: boolean
}

export interface ArtistSprite3DProps {
  providerId: ImageProviderId
  selected?: boolean
  hovered?: boolean
  disabled?: boolean
  generating?: boolean
  isWiping?: boolean
  cheering?: boolean
  holdingBrush?: boolean
  watchingPainter?: boolean
  watchTargetSelector?: string
  pointerTiltRef?: RefObject<PointerTiltState>
  pokedCombo?: number
  reactionTick?: number
  brushColorHex?: string
  brushGlowHex?: string
  size?: 'md' | 'lg'
  className?: string
}

/** 漫画风格小巧汗珠（统一围绕头顶呈放射状持续往外冒） */
function MangaSweatBead({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 14 18"
      aria-hidden="true"
      style={style}
      className={cn('pointer-events-none', className)}
    >
      <path
        d="M7 1.2 C4.2 6.2 1.6 9.3 1.6 12.2 C1.6 15.0 4.0 16.8 7 16.8 C10.0 16.8 12.4 15.0 12.4 12.2 C12.4 9.3 9.8 6.2 7 1.2 Z"
        fill="#38BDF8"
        stroke="#0284C7"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path
        d="M4.8 10.6 C4.4 12.2 4.8 13.7 6.0 14.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface CrownSweatSpec {
  angleDeg: number
  radiusPct: number
  distPx: number
  width: number
  height: number
  dur: string
  delay: string
}

// 9 颗均匀分布在头顶圆弧的小巧汗珠，采用统一放射轨迹 + 负相位错峰循环实现“一直往外冒”
const CROWN_SWEAT_SPECS: CrownSweatSpec[] = [
  { angleDeg: -78, radiusPct: 43, distPx: 16, width: 7.5, height: 9.5, dur: '0.88s', delay: '-0.12s' },
  { angleDeg: -58, radiusPct: 44, distPx: 18, width: 8.5, height: 11, dur: '0.92s', delay: '-0.56s' },
  { angleDeg: -38, radiusPct: 45, distPx: 19, width: 8, height: 10.5, dur: '0.86s', delay: '-0.30s' },
  { angleDeg: -19, radiusPct: 45, distPx: 20, width: 9, height: 11.5, dur: '0.94s', delay: '-0.72s' },
  { angleDeg: 0, radiusPct: 45, distPx: 19, width: 8, height: 10.5, dur: '0.88s', delay: '-0.42s' },
  { angleDeg: 19, radiusPct: 45, distPx: 20, width: 9, height: 11.5, dur: '0.90s', delay: '-0.18s' },
  { angleDeg: 38, radiusPct: 45, distPx: 19, width: 8, height: 10.5, dur: '0.96s', delay: '-0.64s' },
  { angleDeg: 58, radiusPct: 44, distPx: 18, width: 8.5, height: 11, dur: '0.88s', delay: '-0.36s' },
  { angleDeg: 78, radiusPct: 43, distPx: 16, width: 7.5, height: 9.5, dur: '0.92s', delay: '-0.80s' },
]

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

const POKE_LINES: Record<ImageProviderId, string[]> = {
  gpt: ['核心校准完成', '咔哒！灵感 +1', '六瓣全开运转中', '别戳花心啦 > <', '随时准备出图 ✦'],
  grok: ['黑洞视界已锁定', '吸积光流加速中', '小心被吸进去啦', '别戳事件视界 > <', '随时跃迁出图 ✦'],
  gemini: ['棱镜星芒充能中', '灵感色彩流动起来了', '捕捉到高光灵犀', '呀、好痒 > <', '幻彩魔法就绪 ✦'],
}

function getArtistGlowColor(providerId: ImageProviderId): string {
  if (providerId === 'gpt') return '#2DD4BF'
  if (providerId === 'grok') return '#818CF8'
  return '#60A5FA'
}

interface IdleChoreoPose {
  id: string
  rotateY: number
  rotateX: number
  rotateZ: number
  y: number
  lookX: number
  lookY: number
  durationMs: number
}

const CENTER_POSE: IdleChoreoPose = {
  id: 'center',
  rotateY: 0,
  rotateX: 0,
  rotateZ: 0,
  y: 0,
  lookX: 0,
  lookY: 0,
  durationMs: 2200,
}

/** 实时计算围观小画家朝向目标作画区中心的真实 3D 方位角（支持右下方、正下方及任意方位） */
function computeWatchTargetPose(
  selfEl: HTMLElement | null,
  watchTargetSelector: string
): SpritePoseTarget {
  const fallbackRight =
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 767px)').matches : true

  let dx = fallbackRight ? 480 : 0
  let dy = fallbackRight ? 220 : 240

  if (selfEl && typeof document !== 'undefined') {
    const selfRect = selfEl.getBoundingClientRect()
    const targetEl = document.querySelector<HTMLElement>(watchTargetSelector)
    const targetRect = targetEl?.getBoundingClientRect()
    if (
      selfRect.width > 0 &&
      selfRect.height > 0 &&
      targetRect &&
      targetRect.width > 0 &&
      targetRect.height > 0
    ) {
      const sx = selfRect.left + selfRect.width * 0.5
      const sy = selfRect.top + selfRect.height * 0.5
      const tx = targetRect.left + targetRect.width * 0.5
      const ty = targetRect.top + targetRect.height * 0.5
      dx = tx - sx
      dy = ty - sy
    }
  }

  const dist = Math.hypot(dx, dy)
  if (dist < 10) {
    return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, lookX: 0, lookY: 0, liftY: 0 }
  }

  // 对纵向视差作适度透视增强，使右下方目标时的「向右转 + 向下看」俯仰一眼可辨
  const dyPerceived =
    dy > 0 ? Math.max(dy * 1.75, Math.min(Math.abs(dx) * 0.56, dy * 2.5)) : dy * 1.3
  const screenTheta = Math.atan2(dyPerceived, dx)
  const turnDeg = Math.max(26, Math.min(48, dist * 0.14))
  const turnRad = (turnDeg * Math.PI) / 180
  const sinT = Math.sin(turnRad)
  const cosT = Math.cos(turnRad)

  const nx = sinT * Math.cos(screenTheta)
  const ny = sinT * Math.sin(screenTheta)
  const nz = cosT

  const yawDeg = (Math.asin(Math.max(-0.98, Math.min(0.98, nx))) * 180) / Math.PI
  const pitchDeg = (-Math.atan2(ny, nz) * 180) / Math.PI
  const rollDeg = Math.cos(screenTheta) * 2.4

  return {
    yawDeg,
    pitchDeg,
    rollDeg,
    lookX: Math.cos(screenTheta) * 0.92,
    lookY: Math.sin(screenTheta) * 0.92,
    liftY: 0,
  }
}

// 真 3D 实体建模支持大角度空间转头与歪头（rotateX 负值=低头向下看，正值=抬头向上看，与 lookY 方向完全一致）
const IDLE_CHOREO_SCRIPTS: Record<ImageProviderId, IdleChoreoPose[]> = {
  gpt: [
    { id: 'peek-right', rotateY: 26, rotateX: 4, rotateZ: 3, y: -1, lookX: 0.72, lookY: -0.1, durationMs: 1700 },
    { id: 'center-a', rotateY: 0, rotateX: 0, rotateZ: 0, y: 0, lookX: 0, lookY: 0, durationMs: 2100 },
    { id: 'tilt-ponder', rotateY: -20, rotateX: -12, rotateZ: -7, y: -1.5, lookX: -0.55, lookY: 0.45, durationMs: 1750 },
    { id: 'nod-agree', rotateY: 6, rotateX: -14, rotateZ: 0, y: -2.5, lookX: 0.18, lookY: 0.55, durationMs: 1200 },
    { id: 'peek-left', rotateY: -28, rotateX: 5, rotateZ: -3.5, y: 0, lookX: -0.75, lookY: -0.22, durationMs: 1600 },
    CENTER_POSE,
  ],
  grok: [
    { id: 'peek-left', rotateY: -28, rotateX: -6, rotateZ: -3, y: -1, lookX: -0.75, lookY: 0.2, durationMs: 1550 },
    { id: 'peek-right', rotateY: 28, rotateX: 6, rotateZ: 3.5, y: -1.5, lookX: 0.75, lookY: -0.2, durationMs: 1550 },
    { id: 'center-a', rotateY: 0, rotateX: 0, rotateZ: 0, y: 0, lookX: 0, lookY: 0, durationMs: 2300 },
    { id: 'tilt-orbit', rotateY: -18, rotateX: -13, rotateZ: 7, y: -2.5, lookX: -0.45, lookY: 0.5, durationMs: 1700 },
    { id: 'hop-peek', rotateY: 14, rotateX: 11, rotateZ: -4.5, y: -3, lookX: 0.4, lookY: -0.45, durationMs: 1350 },
    CENTER_POSE,
  ],
  gemini: [
    { id: 'peek-left', rotateY: -26, rotateX: -6, rotateZ: -5.5, y: -1.5, lookX: -0.72, lookY: 0.22, durationMs: 1600 },
    { id: 'nod-hop', rotateY: 18, rotateX: 12, rotateZ: 6, y: -3, lookX: 0.48, lookY: -0.45, durationMs: 1500 },
    { id: 'center-a', rotateY: 0, rotateX: 0, rotateZ: 0, y: 0, lookX: 0, lookY: 0, durationMs: 2000 },
    { id: 'peek-right', rotateY: 24, rotateX: -8, rotateZ: 4.5, y: -1, lookX: 0.65, lookY: 0.28, durationMs: 1550 },
    { id: 'tilt-dream', rotateY: -18, rotateX: -11, rotateZ: -8, y: -1, lookX: -0.48, lookY: 0.42, durationMs: 1700 },
    CENTER_POSE,
  ],
}

const GPT_BUBBLES = [
  { x: '8%', y: '62%', size: 8.5, dx: '-4px', dur: '2.9s', delay: '0s', rim: '#10B981', glow: '#34D399' },
  { x: '82%', y: '56%', size: 11, dx: '4px', dur: '3.2s', delay: '0.55s', rim: '#059669', glow: '#6EE7B7' },
  { x: '16%', y: '78%', size: 7, dx: '3px', dur: '2.6s', delay: '1.15s', rim: '#14B8A6', glow: '#5EEAD4' },
  { x: '76%', y: '74%', size: 9.5, dx: '-3px', dur: '3.1s', delay: '1.7s', rim: '#10B981', glow: '#A7F3D0' },
  { x: '6%', y: '44%', size: 6.5, dx: '-3px', dur: '2.8s', delay: '2.2s', rim: '#0D9488', glow: '#99F6E4' },
  { x: '86%', y: '38%', size: 7.5, dx: '3px', dur: '3.0s', delay: '2.65s', rim: '#10B981', glow: '#6EE7B7' },
]

const GEMINI_STAR_COLORS = [
  '#F59E0B',
  '#3B82F6',
  '#EC4899',
  '#10B981',
  '#8B5CF6',
  '#06B6D4',
] as const

const GEMINI_SLOT_DURS = ['1.95s', '2.35s', '2.15s', '2.65s', '2.45s'] as const

interface GeminiRandomStarSpec {
  x: string
  y: string
  size: number
  color: string
  delay: string
}

function sampleGeminiStarSpec(slotIdx: number, isInitial = false): GeminiRandomStarSpec {
  // 每次循环结束在透明度为 0 时随机重采身周环形位置、尺寸与颜色（避开中央眼睛区域）
  const baseAngle = (slotIdx * Math.PI * 2) / GEMINI_SLOT_DURS.length + (Math.random() - 0.5) * 1.35
  const radiusPct = 32 + Math.random() * 15
  const cx = 50 + Math.cos(baseAngle) * radiusPct
  const cy = 50 + Math.sin(baseAngle) * radiusPct
  const size = Number((5.8 + Math.random() * 5.2).toFixed(1))
  const color = GEMINI_STAR_COLORS[Math.floor(Math.random() * GEMINI_STAR_COLORS.length)]
  return {
    x: `${Math.max(5, Math.min(89, cx)).toFixed(1)}%`,
    y: `${Math.max(5, Math.min(89, cy)).toFixed(1)}%`,
    size,
    color,
    delay: isInitial ? `${(slotIdx * 0.42).toFixed(2)}s` : '0s',
  }
}

const GROK_HALO_WAVES = [
  { delay: '0s', dur: '3.0s' },
  { delay: '0.6s', dur: '3.0s' },
  { delay: '1.2s', dur: '3.0s' },
  { delay: '1.8s', dur: '3.0s' },
  { delay: '2.4s', dur: '3.0s' },
]

function GeminiRandomStars({
  isLg,
  prefersReduced,
}: {
  isLg: boolean
  prefersReduced: boolean
}) {
  const scaleFactor = isLg ? 1.32 : 1
  const [stars, setStars] = useState<GeminiRandomStarSpec[]>(() =>
    GEMINI_SLOT_DURS.map((_, idx) => sampleGeminiStarSpec(idx, true))
  )

  return (
    <span
      aria-hidden="true"
      data-particle-kind="gemini-star"
      className="pointer-events-none absolute inset-[-4%] z-20"
      style={{ transform: `translateZ(${isLg ? 18 : 13}px)` }}
    >
      {stars.map((s, idx) => {
        const px = s.size * scaleFactor
        return (
          <svg
            key={idx}
            viewBox="0 0 24 24"
            onAnimationIteration={
              prefersReduced
                ? undefined
                : () =>
                    setStars((prev) =>
                      prev.map((item, i) => (i === idx ? sampleGeminiStarSpec(i, false) : item))
                    )
            }
            className="st-star-sparkle absolute overflow-visible"
            style={
              {
                left: s.x,
                top: s.y,
                width: px,
                height: px,
                opacity: prefersReduced ? 0.8 : undefined,
                '--star-dur': GEMINI_SLOT_DURS[idx],
                '--star-delay': s.delay,
              } as CSSProperties
            }
          >
            <path
              d="M12 0.8 L14.5 9.5 L23.2 12 L14.5 14.5 L12 23.2 L9.5 14.5 L0.8 12 L9.5 9.5 Z"
              fill={s.color}
            />
            <path
              d="M12 5.2 L13.4 10.6 L18.8 12 L13.4 13.4 L12 18.8 L10.6 13.4 L5.2 12 L10.6 10.6 Z"
              fill="#FFFFFF"
              opacity="0.94"
            />
          </svg>
        )
      })}
    </span>
  )
}

function AmbientSpriteParticles({
  providerId,
  active,
  isLg,
  prefersReduced,
}: {
  providerId: ImageProviderId
  active: boolean
  isLg: boolean
  prefersReduced: boolean
}) {
  const scaleFactor = isLg ? 1.32 : 1
  if (providerId === 'grok') {
    return (
      <span
        aria-hidden="true"
        data-particle-kind="grok-blackhole"
        className="pointer-events-none absolute inset-[-8%] z-0"
      >
        {/* 紧贴黑洞外环的中心暗影晕 */}
        <span
          className="absolute inset-[18%] rounded-full"
          style={{
            background: active
              ? 'radial-gradient(circle, rgba(30,27,75,0.42) 24%, rgba(79,70,229,0.2) 54%, transparent 78%)'
              : 'radial-gradient(circle, rgba(30,27,75,0.24) 24%, rgba(79,70,229,0.11) 54%, transparent 78%)',
          }}
        />
        {/* 5 道紧凑匀速衔接的同心水波光晕：持续不断由深变浅晕染扩散 */}
        {GROK_HALO_WAVES.map((w, idx) => (
          <span
            key={idx}
            className="st-bh-pulse-wave absolute inset-0 rounded-full"
            style={
              {
                background: active
                  ? 'radial-gradient(circle, transparent 36%, rgba(79,70,229,0.28) 49%, rgba(99,102,241,0.44) 60%, rgba(167,139,250,0.22) 72%, rgba(199,210,254,0.08) 81%, transparent 90%)'
                  : 'radial-gradient(circle, transparent 36%, rgba(79,70,229,0.18) 49%, rgba(99,102,241,0.28) 60%, rgba(167,139,250,0.13) 72%, rgba(199,210,254,0.05) 81%, transparent 90%)',
                '--bh-dur': w.dur,
                '--bh-delay': w.delay,
              } as CSSProperties
            }
          />
        ))}
      </span>
    )
  }

  if (providerId === 'gemini') {
    return <GeminiRandomStars isLg={isLg} prefersReduced={prefersReduced} />
  }

  return (
    <span
      aria-hidden="true"
      data-particle-kind="gpt-bubbles"
      className="pointer-events-none absolute inset-[-8%] z-20"
    >
      {/* 翡翠微光底晕 + 持续上浮的通透翡翠玻璃泡泡（纯 GPU transform/opacity） */}
      <span
        className="absolute inset-[10%] rounded-full"
        style={{
          background: active
            ? 'radial-gradient(circle, rgba(16,185,129,0.24) 32%, rgba(45,212,191,0.1) 56%, transparent 76%)'
            : 'radial-gradient(circle, rgba(16,185,129,0.12) 32%, rgba(45,212,191,0.05) 56%, transparent 76%)',
        }}
      />

      {GPT_BUBBLES.map((b, idx) => {
        const px = b.size * scaleFactor
        return (
          <span
            key={idx}
            className="st-gpt-bubble absolute block rounded-full"
            style={
              {
                left: b.x,
                top: b.y,
                width: px,
                height: px,
                border: `1px solid ${b.rim}`,
                background:
                  'radial-gradient(circle at 30% 26%, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.92) 14%, rgba(167,243,208,0.7) 38%, rgba(16,185,129,0.34) 76%, rgba(5,150,105,0.52) 100%)',
                '--bub-dx': b.dx,
                '--bub-dur': b.dur,
                '--bub-delay': b.delay,
              } as CSSProperties
            }
          />
        )
      })}
    </span>
  )
}

export function ArtistSprite3D({
  providerId,
  selected = false,
  hovered = false,
  disabled = false,
  generating = false,
  isWiping = false,
  cheering = false,
  holdingBrush = false,
  watchingPainter = false,
  watchTargetSelector = '[data-monitor-sprite-slot]',
  pointerTiltRef,
  pokedCombo = 0,
  reactionTick = 0,
  brushColorHex,
  brushGlowHex,
  size = 'md',
  className,
}: ArtistSprite3DProps) {
  const prefersReducedMotion = useReducedMotion()
  const spriteRootRef = useRef<HTMLDivElement | null>(null)
  const brushWrapperRef = useRef<HTMLDivElement | null>(null)
  const [isBlinking, setIsBlinking] = useState(false)
  const [settledReactionTick, setSettledReactionTick] = useState(0)
  const [choreoStep, setChoreoStep] = useState(0)
  const choreoIdxRef = useRef(0)
  const watchPoseRef = useRef<SpritePoseTarget>({
    yawDeg: 38,
    pitchDeg: -22,
    rollDeg: 2,
    lookX: 0.78,
    lookY: 0.45,
    liftY: 0,
  })

  // 错峰自然眨眼，让三个小精灵各有呼吸感
  useEffect(() => {
    if (disabled) return
    const baseDelay = providerId === 'gpt' ? 3400 : providerId === 'grok' ? 4200 : 2900
    let blinkTimer: number | undefined
    let nextTimer: number | undefined

    const scheduleBlink = () => {
      const jitter = Math.random() * 1400
      nextTimer = window.setTimeout(() => {
        setIsBlinking(true)
        blinkTimer = window.setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 125)
      }, baseDelay + jitter)
    }
    scheduleBlink()

    return () => {
      if (nextTimer) window.clearTimeout(nextTimer)
      if (blinkTimer) window.clearTimeout(blinkTimer)
    }
  }, [providerId, disabled])

  const isPeerWatching = Boolean(watchingPainter && !disabled && !generating && !cheering)

  // 实时跟踪围观目标画布坐标（支持右下方、窄屏下方与任意分栏拖拽后的实时空间视角追踪）
  useEffect(() => {
    if (!isPeerWatching) return
    const refreshWatchPose = () => {
      watchPoseRef.current = computeWatchTargetPose(spriteRootRef.current, watchTargetSelector)
    }
    refreshWatchPose()

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(refreshWatchPose)
        : null
    const targetEl =
      typeof document !== 'undefined'
        ? document.querySelector<HTMLElement>(watchTargetSelector)
        : null
    if (observer && spriteRootRef.current) observer.observe(spriteRootRef.current)
    if (observer && targetEl) observer.observe(targetEl)

    window.addEventListener('resize', refreshWatchPose, { passive: true })
    window.addEventListener('scroll', refreshWatchPose, { capture: true, passive: true })
    window.addEventListener('pointerup', refreshWatchPose, { passive: true })

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', refreshWatchPose)
      window.removeEventListener('scroll', refreshWatchPose, { capture: true })
      window.removeEventListener('pointerup', refreshWatchPose)
    }
  }, [isPeerWatching, watchTargetSelector])

  // 自主 3D 动作编排器：左顾右盼、好奇歪头、轻跳点头（队友作画围观时暂停，一直凝神看向对方）
  useEffect(() => {
    if (disabled || generating || cheering || hovered || isPeerWatching || prefersReducedMotion) return
    const script = IDLE_CHOREO_SCRIPTS[providerId]
    const initialOffset =
      providerId === 'gpt' ? 750 : providerId === 'grok' ? 1650 : 1200
    let stepTimer: number | undefined

    const advance = (waitMs: number) => {
      stepTimer = window.setTimeout(() => {
        const nextIdx = (choreoIdxRef.current + 1) % script.length
        choreoIdxRef.current = nextIdx
        const nextPose = script[nextIdx]
        setChoreoStep(nextIdx)
        advance(nextPose.durationMs + Math.round(Math.random() * 550))
      }, waitMs)
    }

    advance(initialOffset)
    return () => {
      if (stepTimer) window.clearTimeout(stepTimer)
    }
  }, [providerId, disabled, generating, cheering, hovered, isPeerWatching, prefersReducedMotion])

  // 触发点击/换笔开心反应态
  useEffect(() => {
    if (reactionTick <= 0) return
    const timer = window.setTimeout(() => setSettledReactionTick(reactionTick), 760)
    return () => window.clearTimeout(timer)
  }, [reactionTick])

  const blinkingActive = !disabled && isBlinking
  const justReacted = reactionTick > 0 && reactionTick !== settledReactionTick

  const mood: SpriteMood = disabled
    ? 'sleep'
    : cheering
      ? 'cheer'
      : pokedCombo >= 3 && justReacted
        ? 'dizzy'
        : generating && isWiping
          ? 'wipe'
          : generating
            ? 'focus'
            : justReacted
              ? 'happy'
              : hovered
                ? 'hover'
                : 'idle'

  const activeScript = IDLE_CHOREO_SCRIPTS[providerId]
  const rawIdlePose =
    disabled || generating || cheering || prefersReducedMotion
      ? CENTER_POSE
      : isPeerWatching || hovered
        ? CENTER_POSE
        : activeScript[choreoStep % activeScript.length] ?? CENTER_POSE

  const accentGlow = brushColorHex || getArtistGlowColor(providerId)
  const isLg = size === 'lg'
  const sizePx = isLg ? 112 : 84
  const activeColor = brushColorHex || '#D9381E'
  const activeGlow = brushGlowHex || brushColorHex || '#FF7A59'

  const getTargetPose = useCallback((): SpritePoseTarget => {
    if (disabled) {
      return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, lookX: 0, lookY: 0, liftY: 0 }
    }
    if (cheering) {
      return { yawDeg: 0, pitchDeg: 8, rollDeg: 0, lookX: 0, lookY: -0.2, liftY: 0 }
    }
    if (generating) {
      if (isWiping) {
        return { yawDeg: 0, pitchDeg: -8, rollDeg: 0, lookX: 0, lookY: 0.25, liftY: 0 }
      }
      return { yawDeg: 4, pitchDeg: -16, rollDeg: 2, lookX: 0.12, lookY: 0.45, liftY: 0 }
    }
    if (isPeerWatching) {
      return watchPoseRef.current
    }
    if (hovered) {
      const pt = pointerTiltRef?.current
      if (pt && pt.active) {
        return {
          yawDeg: pt.nx * 32,
          pitchDeg: -pt.ny * 26,
          rollDeg: pt.nx * 4.5,
          lookX: pt.nx * 0.78,
          lookY: pt.ny * 0.68,
          liftY: 0,
        }
      }
      return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, lookX: 0, lookY: 0, liftY: 0 }
    }
    return {
      yawDeg: rawIdlePose.rotateY,
      pitchDeg: rawIdlePose.rotateX,
      rollDeg: rawIdlePose.rotateZ,
      lookX: rawIdlePose.lookX,
      lookY: rawIdlePose.lookY,
      liftY: rawIdlePose.y,
    }
  }, [
    disabled,
    cheering,
    generating,
    isWiping,
    isPeerWatching,
    hovered,
    pointerTiltRef,
    rawIdlePose,
  ])

  const getGlareOffset = useCallback(() => {
    if (hovered && !isPeerWatching && pointerTiltRef?.current?.active) {
      return { x: pointerTiltRef.current.nx, y: pointerTiltRef.current.ny }
    }
    return { x: -0.35, y: -0.45 }
  }, [hovered, isPeerWatching, pointerTiltRef])

  const lastPoseTransformRef = useRef('')

  const handlePoseFrame = useCallback(
    ({
      yawDeg,
      pitchDeg,
      rollDeg,
      bobY,
      scaleX,
      scaleY,
    }: {
      yawDeg: number
      pitchDeg: number
      rollDeg: number
      bobY: number
      scaleX: number
      scaleY: number
    }) => {
      const el = brushWrapperRef.current
      if (!el) return
      const zPx = isLg ? 20 : 15
      const nextTransform = `perspective(520px) translate3d(0px, ${bobY.toFixed(2)}px, 0px) rotateZ(${rollDeg.toFixed(2)}deg) rotateX(${pitchDeg.toFixed(2)}deg) rotateY(${yawDeg.toFixed(2)}deg) translateZ(${zPx}px) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`
      if (nextTransform === lastPoseTransformRef.current) return
      lastPoseTransformRef.current = nextTransform
      el.style.transform = nextTransform
    },
    [isLg]
  )

  return (
    <div
      ref={spriteRootRef}
      data-watching-painter={isPeerWatching ? 'true' : 'false'}
      data-idle-action={isPeerWatching ? 'watch-target' : hovered ? 'hover-track' : rawIdlePose.id}
      className={cn(
        'st-sprite-perspective relative flex items-center justify-center select-none',
        isLg ? 'size-28' : 'size-[84px]',
        disabled && 'opacity-50 grayscale-[0.55]',
        className
      )}
    >
      {/* 悬浮底座投影光盘（径向渐变替代实时高斯模糊，减小合成开销） */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full transition-opacity duration-300"
        style={{
          width: isLg ? '72%' : selected || hovered ? '76%' : '60%',
          height: isLg ? 12 : 9,
          background: `radial-gradient(closest-side, ${selected || generating ? accentGlow : getArtistGlowColor(providerId)} 0%, transparent 100%)`,
          opacity: disabled ? 0.16 : generating ? 0.55 : selected ? 0.45 : hovered ? 0.35 : 0.18,
        }}
      />

      {/* 点击/落笔星尘爆裂粒子 */}
      {reactionTick > 0 && (
        <span
          key={`sparks-${reactionTick}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20"
        >
          {SPARK_ANGLES.map((deg, idx) => (
            <span
              key={deg}
              className="st-ink-dot absolute top-1/2 left-1/2 rounded-full"
              style={
                {
                  width: idx % 2 === 0 ? (isLg ? 6 : 4.5) : isLg ? 4 : 3,
                  height: idx % 2 === 0 ? (isLg ? 6 : 4.5) : isLg ? 4 : 3,
                  backgroundColor: idx % 2 === 0 ? accentGlow : getArtistGlowColor(providerId),
                  '--ink-a': `${deg}deg`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}

      {/* 环境光效粒子层 */}
      {!disabled && (
        <AmbientSpriteParticles
          providerId={providerId}
          active={selected || hovered || generating}
          isLg={isLg}
          prefersReduced={Boolean(prefersReducedMotion)}
        />
      )}

      {/* 真 3D 立体画师渲染层（支持任意 360° 空间视角、贴面弯曲表情与实心景深） */}
      <div className="pointer-events-none relative z-10 flex size-full items-center justify-center overflow-visible">
        <ArtistMesh3D
          providerId={providerId}
          mood={mood}
          isBlinking={blinkingActive}
          selected={selected}
          hovered={hovered}
          disabled={disabled}
          generating={generating}
          isWiping={isWiping}
          cheering={cheering}
          reactionTick={reactionTick}
          prefersReducedMotion={Boolean(prefersReducedMotion)}
          sizePx={sizePx}
          getTargetPose={getTargetPose}
          getGlareOffset={getGlareOffset}
          onPoseFrame={handlePoseFrame}
          className="pointer-events-none shrink-0"
        />
      </div>

      {/* 小精灵握持的完整画笔（与 3D 骨架姿态实时同步） */}
      {(generating || cheering || (selected && holdingBrush)) && !disabled && (
        <div
          ref={brushWrapperRef}
          aria-hidden="true"
          className="st-preserve-3d pointer-events-none absolute inset-0 z-20"
          style={{ transform: `translateZ(${isLg ? 20 : 15}px)` }}
        >
          <div
            className={cn(
              'absolute origin-center',
              isLg ? '-right-7 bottom-0' : '-right-5 -bottom-0.5',
              cheering
                ? '-rotate-45 -translate-y-2'
                : generating
                  ? isWiping
                    ? 'st-brush-rest'
                    : 'st-brush-paint'
                  : 'st-held-brush-sway'
            )}
          >
            <ArtistPaintbrush
              colorHex={activeColor}
              glowHex={activeGlow}
              active={selected || generating || cheering}
              className={isLg ? 'h-7 w-18' : 'h-[22px] w-[58px]'}
            />
          </div>
        </div>
      )}

      {/* 埋头猛画阶段：统一围绕头顶呈放射状持续往外冒的小巧汗珠 */}
      {isLg && generating && !isWiping && !cheering && (
        <div
          data-manga-sweat="true"
          className="pointer-events-none absolute inset-0 z-30"
        >
          {CROWN_SWEAT_SPECS.map((sp, idx) => {
            const rad = (sp.angleDeg * Math.PI) / 180
            const ux = Math.sin(rad)
            const uy = -Math.cos(rad)
            const leftPct = 50 + ux * sp.radiusPct
            const topPct = 46 + uy * sp.radiusPct
            const dx = ux * sp.distPx
            const dy = uy * sp.distPx
            return (
              <MangaSweatBead
                key={idx}
                className="st-sweat-burst absolute"
                style={
                  {
                    left: `${leftPct.toFixed(1)}%`,
                    top: `${topPct.toFixed(1)}%`,
                    width: sp.width,
                    height: sp.height,
                    marginLeft: -sp.width * 0.5,
                    marginTop: -sp.height * 0.5,
                    '--sweat-dx': `${dx.toFixed(1)}px`,
                    '--sweat-dy': `${dy.toFixed(1)}px`,
                    '--sweat-rot': `${sp.angleDeg + 180}deg`,
                    '--sweat-dur': sp.dur,
                    '--sweat-delay': sp.delay,
                  } as CSSProperties
                }
              />
            )
          })}
        </div>
      )}

      {/* 擦汗休息阶段：抹汗小毛巾与休息气泡 */}
      {isLg && generating && isWiping && !cheering && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div className="st-wipe-paw absolute -top-2.5 left-1/2 -translate-x-1/2">
            <div className="flex h-4 w-7 items-center justify-center rounded-full border border-black/15 bg-white shadow-sm">
              <span className="h-0.5 w-3.5 rounded-full bg-zinc-300" />
            </div>
          </div>

          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.85 }}
            animate={{ opacity: 1, y: -4, scale: 1 }}
            className="absolute -top-7 -right-8 rounded-full border border-border/80 bg-card px-2 py-0.5 text-xs font-bold whitespace-nowrap text-foreground shadow-sm"
          >
            呼…擦擦汗继续画 ✦
          </motion.span>
        </div>
      )}

      {/* 交作业欢呼雀跃阶段的庆祝星尘与气泡 */}
      {isLg && cheering && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <span className="pointer-events-none absolute inset-0">
            {SPARK_ANGLES.map((deg, idx) => (
              <span
                key={deg}
                className="st-ink-dot absolute top-1/2 left-1/2 rounded-full"
                style={
                  {
                    width: idx % 2 === 0 ? 6 : 4,
                    height: idx % 2 === 0 ? 6 : 4,
                    backgroundColor: idx % 2 === 0 ? activeGlow : '#FACC15',
                    '--ink-a': `${deg}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.85 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full border border-border/80 bg-card px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-foreground shadow-md"
          >
            画好啦！交作业 ✦
          </motion.span>
        </div>
      )}
    </div>
  )
}

/**
 * 右侧生成监视器专属「画师作画 + 静止画纸」舞台：
 * 画纸独立固定在桌面，不随画师上下浮动；画师停下来擦汗时，画纸上的笔触也会同步停下。
 * 支持进入入场(entering)、作画(working)、欢呼交作业(cheering)、甩纸飞回(returning)四阶段。
 */
export function GeneratingSpriteStage({
  providerId,
  brushColorHex,
  brushGlowHex,
  stagePhase = 'working',
  previewImageUrl,
}: {
  providerId: ImageProviderId
  brushColorHex: string
  brushGlowHex: string
  stagePhase?: 'entering' | 'working' | 'cheering' | 'returning'
  previewImageUrl?: string | null
}) {
  const [workPhase, setWorkPhase] = useState<'painting' | 'wiping'>('painting')

  useEffect(() => {
    if (stagePhase !== 'working') return
    let phase: 'painting' | 'wiping' = 'painting'
    let timer: number | undefined
    const tick = () => {
      const wait = phase === 'painting' ? 3000 : 1450
      timer = window.setTimeout(() => {
        phase = phase === 'painting' ? 'wiping' : 'painting'
        setWorkPhase(phase)
        tick()
      }, wait)
    }
    tick()
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [providerId, stagePhase])

  const isWiping = stagePhase === 'working' && workPhase === 'wiping'
  const isCheering = stagePhase === 'cheering'
  const showSpriteBody = stagePhase === 'working' || stagePhase === 'cheering'
  const showDeskPaper = stagePhase !== 'returning'

  return (
    <div className="relative flex h-44 w-56 flex-col items-center justify-center">
      {/* 3D 画师小精灵落位槽（舞台刻度环随精灵槽位同心对齐） */}
      <div
        data-monitor-sprite-slot
        className="relative z-20 -mt-5 flex size-28 items-center justify-center"
      >
        <span
          aria-hidden="true"
          className="st-spin-slow pointer-events-none absolute -inset-2 rounded-full border border-dashed border-foreground/15"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-0.5 rounded-full border border-foreground/[0.07]"
        />
        {showSpriteBody && (
          <ArtistSprite3D
            providerId={providerId}
            selected
            generating={stagePhase === 'working'}
            cheering={isCheering}
            isWiping={isWiping}
            brushColorHex={brushColorHex}
            brushGlowHex={brushGlowHex}
            size="lg"
          />
        )}
      </div>

      {/* 静止固定在桌面的画纸（带 data-monitor-paper-slot 作为交作业甩出起点） */}
      <div
        data-monitor-paper-slot
        className={cn(
          'relative z-10 -mt-1 flex flex-col items-center transition-opacity duration-150',
          !showDeskPaper && 'opacity-0'
        )}
      >
        <div
          className={cn(
            'relative h-12 w-32 overflow-hidden rounded-lg border border-border/90 bg-[#FFFDF8] px-2.5 py-1.5 shadow-[0_6px_14px_-6px_rgba(20,20,18,0.22)] transition-transform duration-300 dark:bg-[#1E2028]',
            isCheering && '-translate-y-1 scale-105 border-[#E5A918]/70 shadow-md'
          )}
        >
          <span
            aria-hidden="true"
            className="absolute top-0.5 left-1.5 z-10 h-1.5 w-3.5 -rotate-12 rounded-[1px] bg-[#E5A918]/45"
          />
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-1.5 z-10 h-1.5 w-3.5 rotate-12 rounded-[1px] bg-[#E5A918]/45"
          />

          {isCheering && previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="画好啦"
              className="size-full rounded-[4px] object-cover object-top"
            />
          ) : (
            <svg viewBox="0 0 112 36" aria-hidden="true" className="h-full w-full overflow-visible">
              <path
                d="M14 28 C26 14, 42 12, 54 22 C66 30, 82 12, 98 16"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M14 25 Q 32 10, 48 22 T 86 15"
                fill="none"
                stroke={brushColorHex}
                strokeWidth="4.2"
                strokeLinecap="round"
                strokeDasharray="48 26"
                className={
                  stagePhase === 'working' && !isWiping
                    ? 'st-paint-trail'
                    : 'st-paint-trail-paused'
                }
              />
              <circle cx="94" cy="19" r="2.6" fill={brushGlowHex} fillOpacity={isWiping ? 0.55 : 0.9} />
              <circle cx="22" cy="14" r="1.8" fill={brushColorHex} fillOpacity={isWiping ? 0.45 : 0.75} />
            </svg>
          )}
        </div>
        <span
          aria-hidden="true"
          className="-mt-0.5 h-2 w-28 rounded-full opacity-25 dark:opacity-55"
          style={{
            background: 'radial-gradient(closest-side, #000000 0%, transparent 100%)',
          }}
        />
      </div>
    </div>
  )
}

interface FlyingPeekingBrush {
  id: number
  hex: string
  glowHex: string
  x: number[]
  y: number[]
  rotate: number[]
  scale: number[]
  times: number[]
}

function buildSmoothBrushTrack(
  startX: number,
  startY: number,
  ctrlX: number,
  ctrlY: number,
  endX: number,
  endY: number,
  startRotate: number,
  endRotate: number
) {
  // 先构建弧长查找表，保证屏幕上沿任意抛物线的像素线速度连续流畅、中段绝无停顿
  const LUT = 64
  const rawX: number[] = []
  const rawY: number[] = []
  const cumLen: number[] = [0]
  for (let i = 0; i <= LUT; i++) {
    const t = i / LUT
    const inv = 1 - t
    const px = inv * inv * startX + 2 * inv * t * ctrlX + t * t * endX
    const py = inv * inv * startY + 2 * inv * t * ctrlY + t * t * endY
    rawX.push(px)
    rawY.push(py)
    if (i > 0) {
      cumLen.push(cumLen[i - 1] + Math.hypot(px - rawX[i - 1], py - rawY[i - 1]))
    }
  }
  const totalLen = Math.max(1, cumLen[LUT])

  const STEPS = 20
  const x: number[] = []
  const y: number[] = []
  const rotate: number[] = []
  const scale: number[] = []
  const times: number[] = []
  let lutIdx = 0

  for (let k = 0; k <= STEPS; k++) {
    const s = k / STEPS
    // 丝滑无顿挫的单调缓动：起飞明快、中段匀畅、落掌柔顺收住
    const u = 1 - Math.pow(1 - s, 1.75)
    const targetDist = u * totalLen
    while (lutIdx < LUT - 1 && cumLen[lutIdx + 1] < targetDist) {
      lutIdx += 1
    }
    const segStart = cumLen[lutIdx]
    const segSpan = Math.max(1e-4, cumLen[lutIdx + 1] - segStart)
    const alpha = Math.max(0, Math.min(1, (targetDist - segStart) / segSpan))
    const px = rawX[lutIdx] + (rawX[lutIdx + 1] - rawX[lutIdx]) * alpha
    const py = rawY[lutIdx] + (rawY[lutIdx + 1] - rawY[lutIdx]) * alpha

    x.push(px - 31)
    y.push(py - 12)
    rotate.push(startRotate + (endRotate - startRotate) * u)
    scale.push(0.94 + Math.sin(u * Math.PI) * 0.22)
    times.push(s)
  }
  return { x, y, rotate, scale, times }
}

function getPeekingBrushTrait(modelOpt: ProviderModelPublicInfo): string {
  const customTrait = modelOpt.tagline?.trim()
  if (customTrait) return customTrait
  const lower = modelOpt.profileId.toLowerCase()
  if (lower.includes('pro') || lower.includes('1.5')) return '细节更细腻'
  if (lower.includes('flash') || lower.includes('fast') || lower.includes('mini')) return '出图速度快'
  if (lower.includes('imagine')) return '质感张力强'
  return '画风稳定'
}

interface PeekBrushLayout {
  leftPct: number
  restBottomPx: number
  hoverLiftPx: number
  tiltDeg: number
  hoverTiltDeg: number
}

function getPeekBrushLayout(idx: number, total: number): PeekBrushLayout {
  if (total <= 1) {
    // 只有 1 支画笔：正中间垂直向上探出脑袋，位于快捷色点底座后方
    return {
      leftPct: 50,
      restBottomPx: 4,
      hoverLiftPx: 14,
      tiltDeg: 0,
      hoverTiltDeg: 0,
    }
  }
  if (total === 2) {
    return idx === 0
      ? { leftPct: 33, restBottomPx: 4, hoverLiftPx: 14, tiltDeg: -13, hoverTiltDeg: -5 }
      : { leftPct: 67, restBottomPx: 2, hoverLiftPx: 15, tiltDeg: 14, hoverTiltDeg: 5 }
  }
  if (total === 3) {
    if (idx === 0) return { leftPct: 24, restBottomPx: 2, hoverLiftPx: 14, tiltDeg: -16, hoverTiltDeg: -6 }
    if (idx === 1) return { leftPct: 50, restBottomPx: 5, hoverLiftPx: 15, tiltDeg: 2, hoverTiltDeg: 0 }
    return { leftPct: 76, restBottomPx: 2, hoverLiftPx: 14, tiltDeg: 15, hoverTiltDeg: 6 }
  }
  const t = total > 1 ? idx / (total - 1) : 0.5
  return {
    leftPct: 18 + t * 64,
    restBottomPx: idx % 2 === 0 ? 4 : 2,
    hoverLiftPx: 14,
    tiltDeg: -16 + t * 32,
    hoverTiltDeg: (-16 + t * 32) * 0.4,
  }
}

export interface HoveredBrushInfo {
  providerId: ImageProviderId
  profile: ProviderModelPublicInfo
  colorHex: string
  glowHex: string
}

export interface AutoGrabBrushTrigger {
  providerId: ImageProviderId
  profileId: string
  seq: number
}

export interface ArtistStageSelectorProps {
  artists: StudioArtistPersona[]
  providers: ProviderPublicInfo[]
  providersLoaded: boolean
  selectedProvider: ImageProviderId
  selectedProfileId?: string | null
  equippedBrushId?: string | null
  hasActiveBrush?: boolean
  hideHeldBrush?: boolean
  activeBrushColorHex?: string
  activeBrushGlowHex?: string
  brushReactionTick?: number
  generatingProviderId?: ImageProviderId | null
  awayProviderId?: ImageProviderId | null
  autoGrabTrigger?: AutoGrabBrushTrigger | null
  onSelectProvider: (providerId: ImageProviderId) => void
  onSelectProfile?: (providerId: ImageProviderId, profileId: string) => void
  onHoverBrushChange?: (info: HoveredBrushInfo | null) => void
  onBrushFlightStart?: () => void
  onBrushFlightLand?: () => void
}

export function ArtistStageSelector({
  artists,
  providers,
  providersLoaded,
  selectedProvider,
  selectedProfileId = null,
  equippedBrushId = null,
  hasActiveBrush = false,
  hideHeldBrush = false,
  activeBrushColorHex,
  activeBrushGlowHex,
  brushReactionTick = 0,
  generatingProviderId = null,
  awayProviderId = null,
  autoGrabTrigger = null,
  onSelectProvider,
  onSelectProfile,
  onHoverBrushChange,
  onBrushFlightStart,
  onBrushFlightLand,
}: ArtistStageSelectorProps) {
  const prefersReducedMotion = useReducedMotion()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [flyingBrush, setFlyingBrush] = useState<FlyingPeekingBrush | null>(null)
  const flightIdRef = useRef(0)
  const flightTimersRef = useRef<number[]>([])
  const lastAutoGrabSeqRef = useRef(0)
  const activeWorkingArtistId = generatingProviderId ?? awayProviderId
  const [prevWorkingId, setPrevWorkingId] = useState<ImageProviderId | null>(activeWorkingArtistId)
  const [interactedWatcherIds, setInteractedWatcherIds] = useState<ImageProviderId[]>([])

  if (prevWorkingId !== activeWorkingArtistId) {
    setPrevWorkingId(activeWorkingArtistId)
    if (interactedWatcherIds.length > 0) setInteractedWatcherIds([])
  }

  useEffect(() => {
    const timers = flightTimersRef.current
    return () => {
      for (const tid of timers) window.clearTimeout(tid)
    }
  }, [])

  const launchBrushHop = useCallback(
    (
      providerId: ImageProviderId,
      modelOpt: ProviderModelPublicInfo,
      brushIndex: number,
      brushEl: HTMLElement | null
    ) => {
      const palette = getBrushPalette(brushIndex)
      playBrushSelect(brushIndex)
      onHoverBrushChange?.(null)

      if (prefersReducedMotion || !brushEl) {
        onSelectProfile?.(providerId, modelOpt.profileId)
        onBrushFlightStart?.()
        const t = window.setTimeout(() => onBrushFlightLand?.(), 140)
        flightTimersRef.current.push(t)
        return
      }

      const targetEl = document.querySelector<HTMLElement>(
        `[data-artist-sprite-target="${providerId}"]`
      )
      if (!targetEl) {
        onSelectProfile?.(providerId, modelOpt.profileId)
        onBrushFlightStart?.()
        const t = window.setTimeout(() => onBrushFlightLand?.(), 140)
        flightTimersRef.current.push(t)
        return
      }

      const pInfo = providers.find((p) => p.providerId === providerId)
      const enabledCount = (pInfo?.models ?? []).filter((m) => m.enabled).length
      const peekLayout = getPeekBrushLayout(brushIndex, Math.max(1, enabledCount))
      const fromRect = brushEl.getBoundingClientRect()
      const toRect = targetEl.getBoundingClientRect()
      const startX = fromRect.left + fromRect.width * 0.5
      const startY = fromRect.top + fromRect.height * 0.42
      // 精准对齐画师右掌持笔位置 (-right-5 -bottom-0.5, 角度 -28deg, 宽 58px)
      const endX = toRect.right - 9
      const endY = toRect.bottom - 9
      const swingX = startX <= endX ? -30 : 22
      const ctrlX = (startX + endX) * 0.5 + swingX
      const ctrlY = Math.min(startY, endY) - 26
      const track = buildSmoothBrushTrack(
        startX,
        startY,
        ctrlX,
        ctrlY,
        endX,
        endY,
        90 + peekLayout.tiltDeg,
        -28
      )

      onSelectProfile?.(providerId, modelOpt.profileId)

      const fid = ++flightIdRef.current
      setFlyingBrush({
        id: fid,
        hex: palette.hex,
        glowHex: palette.glowHex,
        ...track,
      })
      onBrushFlightStart?.()

      const landTimer = window.setTimeout(() => {
        setFlyingBrush((curr) => (curr?.id === fid ? null : curr))
        onBrushFlightLand?.()
      }, 440)
      flightTimersRef.current.push(landTimer)
    },
    [
      onBrushFlightLand,
      onBrushFlightStart,
      onHoverBrushChange,
      onSelectProfile,
      prefersReducedMotion,
      providers,
    ]
  )

  useEffect(() => {
    if (!autoGrabTrigger || autoGrabTrigger.seq === lastAutoGrabSeqRef.current) return
    lastAutoGrabSeqRef.current = autoGrabTrigger.seq
    const pInfo = providers.find((p) => p.providerId === autoGrabTrigger.providerId)
    const enabledModels = (pInfo?.models ?? []).filter((m) => m.enabled)
    const idx = enabledModels.findIndex((m) => m.profileId === autoGrabTrigger.profileId)
    const modelOpt = idx >= 0 ? enabledModels[idx] : enabledModels[0]
    if (!modelOpt) return
    const safeIdx = idx >= 0 ? idx : 0
    const scopeRoot = stageRef.current ?? document
    const brushEl =
      scopeRoot.querySelector<HTMLElement>(
        `[data-peeking-brush="${modelOpt.profileId}"]`
      ) ??
      scopeRoot.querySelector<HTMLElement>(
        `[data-brush-dot="${modelOpt.profileId}"]`
      )
    launchBrushHop(autoGrabTrigger.providerId, modelOpt, safeIdx, brushEl)
  }, [autoGrabTrigger, launchBrushHop, providers])

  return (
    <div
      ref={stageRef}
      role="radiogroup"
      aria-label="选择AI小画家"
      className="grid grid-cols-1 gap-1.5 pt-1.5 @[320px]/controls:grid-cols-3"
    >
      {artists.map((artist) => {
        const pInfo = providers.find((p) => p.providerId === artist.id)
        const enabled = pInfo ? pInfo.enabled : true
        const configured = pInfo ? pInfo.configured : false
        const selected = selectedProvider === artist.id
        const available = enabled && configured
        const enabledModels = (pInfo?.models ?? []).filter((m) => m.enabled)
        const isWatchingPainter = Boolean(
          activeWorkingArtistId &&
            activeWorkingArtistId !== artist.id &&
            !interactedWatcherIds.includes(artist.id)
        )

        return (
          <ArtistPedestalCard
            key={artist.id}
            artist={artist}
            selected={selected}
            enabled={enabled}
            available={available}
            providersLoaded={providersLoaded}
            generating={generatingProviderId === artist.id}
            away={awayProviderId === artist.id}
            watchingPainter={isWatchingPainter}
            holdingBrush={selected && hasActiveBrush && !hideHeldBrush}
            brushColorHex={selected ? activeBrushColorHex : undefined}
            brushGlowHex={selected ? activeBrushGlowHex : undefined}
            externalReactionTick={selected ? brushReactionTick : 0}
            models={enabledModels}
            selectedProfileId={selected ? selectedProfileId : null}
            equippedBrushId={selected ? equippedBrushId : null}
            onInteract={() => {
              if (activeWorkingArtistId && activeWorkingArtistId !== artist.id) {
                setInteractedWatcherIds((prev) =>
                  prev.includes(artist.id) ? prev : [...prev, artist.id]
                )
              }
            }}
            onSelect={() => {
              onHoverBrushChange?.(null)
              onSelectProvider(artist.id)
            }}
            onHoverBrush={(info) =>
              onHoverBrushChange?.(
                info ? { providerId: artist.id, ...info } : null
              )
            }
            onPickBrush={(modelOpt, idx, el) => launchBrushHop(artist.id, modelOpt, idx, el)}
          />
        )
      })}

      {/* 方案 A · 点击色点或扇形画笔后：从底座槽跃起并落入上方 AI小画家掌心 */}
      {typeof document !== 'undefined' &&
        flyingBrush &&
        createPortal(
          <motion.div
            key={flyingBrush.id}
            aria-hidden="true"
            data-flying-brush="true"
            className="pointer-events-none fixed top-0 left-0 z-50"
            initial={{
              x: flyingBrush.x[0],
              y: flyingBrush.y[0],
              scale: flyingBrush.scale[0],
              rotate: flyingBrush.rotate[0],
              opacity: 1,
            }}
            animate={{
              x: flyingBrush.x,
              y: flyingBrush.y,
              scale: flyingBrush.scale,
              rotate: flyingBrush.rotate,
              opacity: 1,
            }}
            transition={{
              duration: 0.44,
              ease: 'linear',
              times: flyingBrush.times,
            }}
            style={{
              filter: `drop-shadow(0 6px 12px ${flyingBrush.glowHex})`,
            }}
          >
            <ArtistPaintbrush
              colorHex={flyingBrush.hex}
              glowHex={flyingBrush.glowHex}
              active
              className="h-[24px] w-[62px]"
            />
          </motion.div>,
          document.body
        )}
    </div>
  )
}

function ArtistPedestalCard({
  artist,
  selected,
  enabled,
  available,
  providersLoaded,
  generating,
  away,
  watchingPainter,
  holdingBrush,
  brushColorHex,
  brushGlowHex,
  externalReactionTick,
  models,
  selectedProfileId,
  equippedBrushId,
  onInteract,
  onSelect,
  onHoverBrush,
  onPickBrush,
}: {
  artist: StudioArtistPersona
  selected: boolean
  enabled: boolean
  available: boolean
  providersLoaded: boolean
  generating: boolean
  away: boolean
  watchingPainter: boolean
  holdingBrush: boolean
  brushColorHex?: string
  brushGlowHex?: string
  externalReactionTick: number
  models: ProviderModelPublicInfo[]
  selectedProfileId?: string | null
  equippedBrushId?: string | null
  onInteract?: () => void
  onSelect: () => void
  onHoverBrush?: (
    info: { profile: ProviderModelPublicInfo; colorHex: string; glowHex: string } | null
  ) => void
  onPickBrush: (modelOpt: ProviderModelPublicInfo, idx: number, brushEl: HTMLElement | null) => void
}) {
  const prefersReducedMotion = useReducedMotion()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const pointerTiltRef = useRef<PointerTiltState>({ nx: 0, ny: 0, active: false })
  const resetTimerRef = useRef<number | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)
  const [hovered, setHovered] = useState(false)
  const [hoveredBrushId, setHoveredBrushId] = useState<string | null>(null)
  const hoveredBrushIdRef = useRef<string | null>(null)
  const [pokeCombo, setPokeCombo] = useState(0)
  const [localReactionTick, setLocalReactionTick] = useState(0)
  const [bubbleText, setBubbleText] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
    }
  }, [])

  const updatePointerTilt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1))
    pointerTiltRef.current = { nx, ny, active: true }
  }

  const clearPointerTilt = () => {
    pointerTiltRef.current = { nx: 0, ny: 0, active: false }
  }

  const showBubble = (text: string) => {
    setBubbleText(text)
    if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = window.setTimeout(() => setBubbleText(null), 1150)
  }

  const handleArtistClick = () => {
    unlockStudioAudio()
    if (!enabled) {
      setLocalReactionTick((n) => n + 1)
      toast.info('这位AI小画家外出采风啦，点另一位试试！')
      return
    }
    onInteract?.()
    setLocalReactionTick((n) => n + 1)

    if (selected) {
      const nextCombo = pokeCombo + 1
      setPokeCombo(nextCombo)
      playSpritePoke(artist.id, nextCombo)
      const lines = POKE_LINES[artist.id]
      const msg = away
        ? '努力创作中，马上好 ✦'
        : nextCombo >= 3
          ? lines[3]
          : lines[(nextCombo - 1) % lines.length]
      showBubble(msg)
    } else {
      setPokeCombo(1)
      playSpriteSelect(artist.id)
      showBubble(away ? '正在出勤作画中 ✦' : POKE_LINES[artist.id][4])
      onSelect()
    }

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => setPokeCombo(0), 1900)
  }

  const combinedReactionTick = localReactionTick + externalReactionTick
  const spotColor = brushColorHex || artist.accent
  const statusFallback = !providersLoaded
    ? '加载中'
    : !enabled
      ? '未开放'
      : !available
        ? '不可用'
        : null
  const showPeekingBrushes = selected && enabled && !away && !statusFallback && models.length > 0
  const activeTierId = equippedBrushId || selectedProfileId || models[0]?.profileId || null
  const isFanExpanded = showPeekingBrushes && (hovered || hoveredBrushId !== null)

  const handleBrushHoverStart = (
    modelOpt: ProviderModelPublicInfo,
    palette: { hex: string; glowHex: string }
  ) => {
    if (hoveredBrushIdRef.current !== modelOpt.profileId) {
      playBrushHover()
    }
    hoveredBrushIdRef.current = modelOpt.profileId
    setHoveredBrushId(modelOpt.profileId)
    onHoverBrush?.({
      profile: modelOpt,
      colorHex: palette.hex,
      glowHex: palette.glowHex,
    })
  }

  const handleBrushHoverEnd = (profileId: string) => {
    if (hoveredBrushIdRef.current !== profileId) return
    hoveredBrushIdRef.current = null
    setHoveredBrushId(null)
    onHoverBrush?.(null)
  }

  return (
    <div
      ref={cardRef}
      onPointerEnter={(e) => {
        if (!away) {
          setHovered(true)
          updatePointerTilt(e)
        }
        if (enabled) playSpriteHover(artist.id)
      }}
      onPointerMove={(e) => {
        if (!away) updatePointerTilt(e)
      }}
      onPointerLeave={() => {
        setHovered(false)
        hoveredBrushIdRef.current = null
        setHoveredBrushId(null)
        onHoverBrush?.(null)
        clearPointerTilt()
      }}
      className={cn(
        'ks-paper-keycap group relative flex min-h-[128px] min-w-0 flex-col items-center justify-start overflow-visible rounded-xl border px-2 pt-1.5 pb-1.5 text-center transition-[transform,border-color,background-color] duration-150 @[320px]/controls:h-[144px]',
        !enabled && 'opacity-55',
        selected
          ? '-translate-y-0.5 bg-white text-foreground dark:bg-[#1E2130] dark:text-white'
          : 'border-border/80 bg-[#FAF8F4] text-foreground hover:-translate-y-0.5 hover:border-foreground/45 dark:bg-muted/35'
      )}
      style={
        selected
          ? {
              borderColor: spotColor,
              boxShadow: `0 10px 22px -10px ${spotColor}66, 0 0 0 1px ${spotColor}38, inset 0 1px 0 rgba(255,255,255,0.92)`,
            }
          : undefined
      }
    >
      {/* 主选画师点击热区（与快捷色点及画笔独立同级，避免嵌套 button；出勤中同样支持点击选中） */}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={
          statusFallback
            ? `AI小画家（${statusFallback}）`
            : away
              ? 'AI小画家（出勤中）'
              : 'AI小画家'
        }
        onClick={handleArtistClick}
        className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      {/* 活泼亮彩选中光效 */}
      {selected && (
        <span
          aria-hidden="true"
          data-selected-stage-frame="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <span
            className="absolute inset-0"
            style={{
              background: `radial-gradient(96% 88% at 50% 42%, ${spotColor}24 0%, ${spotColor}0B 52%, transparent 80%)`,
            }}
          />
          <svg viewBox="0 0 12 12" className="absolute top-1.5 left-1.5 size-2.5 opacity-85">
            <path d="M1.5 9V2.5A1 1 0 0 1 2.5 1.5H9" fill="none" stroke={spotColor} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <svg viewBox="0 0 12 12" className="absolute top-1.5 right-1.5 size-2.5 opacity-85">
            <path d="M3 1.5H9.5A1 1 0 0 1 10.5 2.5V9" fill="none" stroke={spotColor} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <svg viewBox="0 0 12 12" className="absolute bottom-1.5 left-1.5 size-2.5 opacity-85">
            <path d="M1.5 3V9.5A1 1 0 0 0 2.5 10.5H9" fill="none" stroke={spotColor} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <svg viewBox="0 0 12 12" className="absolute right-1.5 bottom-1.5 size-2.5 opacity-85">
            <path d="M3 10.5H9.5A1 1 0 0 0 10.5 9.5V3" fill="none" stroke={spotColor} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span
            className="absolute inset-x-4 bottom-0 h-[3px] rounded-t-full opacity-90"
            style={{ backgroundColor: spotColor }}
          />
        </span>
      )}

      {/* 交互浮现小气泡 */}
      <AnimatePresence mode="wait">
        {bubbleText && (
          <motion.span
            key={bubbleText}
            data-artist-poke-bubble="true"
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -3, scale: 0.92 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute -top-2.5 left-1/2 z-30 max-w-[180px] -translate-x-1/2 truncate rounded-full border border-border/90 bg-popover px-2 py-0.5 text-xs font-bold leading-none whitespace-nowrap text-popover-foreground shadow-md"
          >
            {bubbleText}
          </motion.span>
        )}
      </AnimatePresence>

      {/* 3D 互动精灵主体 */}
      <div
        data-artist-sprite-target={artist.id}
        className={cn(
          'pointer-events-none relative z-10 flex shrink-0 items-center justify-center transition-transform duration-150',
          showPeekingBrushes ? '-translate-y-1' : statusFallback ? 'translate-y-1' : 'translate-y-2'
        )}
      >
        {away ? (
          <div
            key={combinedReactionTick > 0 ? `away-pop-${combinedReactionTick}` : 'away-init'}
            className={cn(
              'st-away-pulse flex size-16 flex-col items-center justify-center rounded-full border border-dashed border-current/30 bg-current/[0.06]',
              combinedReactionTick > 0 && 'st-squish-pop'
            )}
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-full opacity-75"
              style={{ backgroundColor: spotColor }}
            />
            <span className="mt-1 text-xs font-semibold leading-none opacity-75">
              出勤中
            </span>
          </div>
        ) : (
          <ArtistSprite3D
            providerId={artist.id}
            selected={selected}
            hovered={hovered && !hoveredBrushId}
            disabled={!enabled}
            generating={generating}
            watchingPainter={watchingPainter}
            pointerTiltRef={pointerTiltRef}
            holdingBrush={holdingBrush}
            pokedCombo={pokeCombo}
            reactionTick={combinedReactionTick}
            brushColorHex={brushColorHex}
            brushGlowHex={brushGlowHex}
            size="md"
          />
        )}
      </div>

      {/* 方案 A - 背后实体画笔扇面：静止时从色点槽后微探笔尖，悬停卡片或色点时展开为扇形 */}
      {showPeekingBrushes && (
        <div
          key="bottom-brushes-stage"
          data-bottom-brushes-stage="true"
          data-brush-count={models.length}
          data-fan-expanded={isFanExpanded ? 'true' : 'false'}
          aria-label="悬浮展开画笔扇面"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[92px] overflow-hidden rounded-b-[11px]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2.5 bg-gradient-to-t from-foreground/[0.12] to-transparent dark:from-black/45"
          />

          {models.map((modelOpt, idx) => {
            const palette = getBrushPalette(idx)
            const isEmptyTaken = modelOpt.profileId === equippedBrushId
            if (isEmptyTaken) return null

            const isHovered = hoveredBrushId === modelOpt.profileId
            const layout = getPeekBrushLayout(idx, models.length)
            const brushDisplayLabel = modelOpt.displayName || getPeekingBrushTrait(modelOpt)
            const targetY = isHovered ? -15 : isFanExpanded ? -6 : 11
            const targetScale = isHovered ? 1.24 : isFanExpanded ? 1.06 : 0.9
            const targetRotate =
              90 +
              (isHovered
                ? layout.hoverTiltDeg * 1.15
                : isFanExpanded
                  ? layout.tiltDeg * 1.35
                  : layout.tiltDeg)

            return (
              <motion.button
                key={modelOpt.profileId}
                type="button"
                data-peeking-brush={modelOpt.profileId}
                data-brush-name={brushDisplayLabel}
                data-hovered={isHovered ? 'true' : 'false'}
                data-active-brush="false"
                aria-label={brushDisplayLabel}
                aria-pressed={false}
                initial={
                  prefersReducedMotion
                    ? false
                    : { y: 36, opacity: 0, rotate: 90 + layout.tiltDeg }
                }
                animate={{
                  y: targetY,
                  scale: targetScale,
                  rotate: targetRotate,
                  opacity: isFanExpanded ? 1 : 0.88,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 28,
                  delay: prefersReducedMotion || isFanExpanded || isHovered ? 0 : idx * 0.02,
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation()
                  handleBrushHoverStart(modelOpt, palette)
                }}
                onMouseLeave={() => handleBrushHoverEnd(modelOpt.profileId)}
                onFocus={() => handleBrushHoverStart(modelOpt, palette)}
                onBlur={() => handleBrushHoverEnd(modelOpt.profileId)}
                onClick={(e) => {
                  e.stopPropagation()
                  unlockStudioAudio()
                  handleBrushHoverEnd(modelOpt.profileId)
                  onPickBrush(modelOpt, idx, e.currentTarget)
                }}
                style={{
                  left: `${layout.leftPct}%`,
                  bottom: `${layout.restBottomPx}px`,
                  marginLeft: '-29px',
                  filter: isHovered
                    ? `drop-shadow(0 4px 8px ${palette.glowHex})`
                    : undefined,
                }}
                className="pointer-events-auto absolute flex h-[32px] w-[58px] origin-center cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ArtistPaintbrush
                  colorHex={palette.hex}
                  glowHex={palette.glowHex}
                  active={isHovered}
                  className="h-[22px] w-[58px]"
                />
              </motion.button>
            )
          })}
        </div>
      )}

      {/* 方案 A - 前置常驻快捷色点栏：桌面/触屏一键直切（无积分展示，右上角同步预览名称与标签） */}
      {showPeekingBrushes && (
        <div
          role="radiogroup"
          aria-label="快捷切换画笔"
          data-brush-dot-dock="true"
          className="relative z-30 mt-auto inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4]/96 px-1.5 py-0.5 shadow-2xs dark:border-white/15 dark:bg-[#141622]/96"
        >
          {models.map((modelOpt, idx) => {
            const palette = getBrushPalette(idx)
            const isActiveTier = modelOpt.profileId === activeTierId
            const isEquipped = modelOpt.profileId === equippedBrushId
            const isDotHovered = hoveredBrushId === modelOpt.profileId
            const shortLabel = modelOpt.badge?.trim() || getPeekingBrushTrait(modelOpt)
            const brushLabel = `${modelOpt.displayName}${modelOpt.badge ? `（${modelOpt.badge}）` : ''}`

            return (
              <button
                key={modelOpt.profileId}
                type="button"
                role="radio"
                aria-checked={isActiveTier}
                aria-label={brushLabel}
                title={brushLabel}
                data-brush-dot={modelOpt.profileId}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={(e) => {
                  e.stopPropagation()
                  handleBrushHoverStart(modelOpt, palette)
                }}
                onMouseLeave={() => handleBrushHoverEnd(modelOpt.profileId)}
                onFocus={() => handleBrushHoverStart(modelOpt, palette)}
                onBlur={() => handleBrushHoverEnd(modelOpt.profileId)}
                onClick={(e) => {
                  e.stopPropagation()
                  unlockStudioAudio()
                  if (isEquipped) {
                    setLocalReactionTick((n) => n + 1)
                    playBrushHover()
                    showBubble(`${shortLabel} · 已装备 ✦`)
                    return
                  }
                  const peekingEl =
                    cardRef.current?.querySelector<HTMLElement>(
                      `[data-peeking-brush="${modelOpt.profileId}"]`
                    ) ?? e.currentTarget
                  handleBrushHoverEnd(modelOpt.profileId)
                  onPickBrush(modelOpt, idx, peekingEl)
                }}
                className={cn(
                  'relative flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-ring',
                  isActiveTier
                    ? 'h-[18px] min-w-[24px] gap-1 bg-foreground px-1.5 text-background shadow-2xs'
                    : 'size-[18px] hover:scale-115'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block rounded-full transition-transform',
                    isActiveTier
                      ? 'size-2.5 ring-1 ring-white/80'
                      : isDotHovered
                        ? 'size-3 ring-2 ring-foreground/40'
                        : 'size-2.5 ring-1 ring-black/20 dark:ring-white/25'
                  )}
                  style={{
                    backgroundColor: palette.hex,
                    boxShadow: isActiveTier || isDotHovered ? `0 0 6px ${palette.glowHex}` : undefined,
                  }}
                />
                {isActiveTier && (
                  <span className="hidden max-w-[54px] truncate text-xs font-bold leading-none @[440px]/controls:inline">
                    {shortLabel}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 未选中多档位画师底部迷你指示点 */}
      {!selected && enabled && !away && !statusFallback && models.length > 1 && (
        <span
          aria-hidden="true"
          className="pointer-events-none relative z-20 mt-auto mb-0.5 flex items-center justify-center gap-1 opacity-60"
        >
          {models.map((modelOpt, idx) => (
            <span
              key={modelOpt.profileId}
              className="size-1.5 rounded-full"
              style={{ backgroundColor: getBrushPalette(idx).hex }}
            />
          ))}
        </span>
      )}

      {statusFallback && (
        <span
          className={cn(
            'pointer-events-none relative z-30 mt-auto shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold leading-none',
            selected
              ? 'bg-foreground/10 text-foreground dark:bg-white/15 dark:text-white'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {statusFallback}
        </span>
      )}
    </div>
  )
}
