import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArtistMesh3D, type SpriteMood, type SpritePoseTarget } from '@/components/studio/ArtistMesh3D'
import { ArtistPaintbrush } from '@/components/studio/ArtistPaintbrush'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  BRUSH_NIB_LABELS,
  getBrushPalette,
  resolveBrushNibStyle,
  type BrushNibStyle,
} from '@/lib/brushPalettes'
import { toast } from '@/lib/notifications'
import {
  playBrushHover,
  playBrushSelect,
  playPencilCaseToggle,
  playSpriteHover,
  playSpritePoke,
  playSpriteSelect,
  unlockStudioAudio,
} from '@/lib/studioAudio'
import { cn } from '@/lib/utils'
import '@/styles/studio-sprites.css'
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
  frustrated?: boolean
  holdingBrush?: boolean
  /** 明确强制隐藏手中画笔（用于 Muse 先掷笔再空手滚转等独立编排，不被 frustrated/generating/cheering 覆盖） */
  hideHeldBrush?: boolean
  /** 穿梭动画进行中（隐藏原地监视台等待决策的静态气泡等装饰） */
  traveling?: boolean
  watchingPainter?: boolean
  watchTargetSelector?: string
  pointerTiltRef?: RefObject<PointerTiltState>
  overridePoseRef?: RefObject<SpritePoseTarget | null>
  pokedCombo?: number
  reactionTick?: number
  brushColorHex?: string
  brushGlowHex?: string
  brushNibStyle?: BrushNibStyle
  brushViewWidth?: number
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
  muse: ['灵感波浪同频中', '灵犀笔触流动起来啦', '捕捉到一缕灵犀', '轻点！波纹会痒 > <', '随时织梦出图 ✦'],
  seedream: ['四重音浪同频中 ♪', '咚咚！灵感字节跳起来啦', '四重幻境，节奏拉满！', '别戳音柱啦，会跑调的 > <', '随时为你跃动出图 ✦'],
}

function getArtistGlowColor(providerId: ImageProviderId): string {
  if (providerId === 'gpt') return '#19857B'
  if (providerId === 'grok') return '#78716C'
  if (providerId === 'muse') return '#B88300'
  if (providerId === 'seedream') return '#C42F16'
  return '#C78F00'
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
  muse: [
    { id: 'peek-right', rotateY: 22, rotateX: -3, rotateZ: 3.5, y: 0, lookX: 0.68, lookY: 0.16, durationMs: 1650 },
    { id: 'center-a', rotateY: 0, rotateX: 0, rotateZ: 0, y: 0, lookX: 0, lookY: 0, durationMs: 2150 },
    { id: 'tilt-muse', rotateY: -20, rotateX: -6, rotateZ: -5, y: 0, lookX: -0.58, lookY: 0.32, durationMs: 1700 },
    { id: 'peek-left', rotateY: -22, rotateX: 4, rotateZ: 3.5, y: 0, lookX: -0.68, lookY: -0.2, durationMs: 1550 },
    CENTER_POSE,
  ],
  seedream: [
    { id: 'precess-left', rotateY: -22, rotateX: -8, rotateZ: -9, y: -1.5, lookX: -0.65, lookY: 0.25, durationMs: 1550 },
    { id: 'precess-right', rotateY: 22, rotateX: 6, rotateZ: 7, y: -2, lookX: 0.65, lookY: -0.2, durationMs: 1550 },
    { id: 'center-a', rotateY: 0, rotateX: 0, rotateZ: 0, y: 0, lookX: 0, lookY: 0, durationMs: 2050 },
    { id: 'spin-nod', rotateY: 14, rotateX: -12, rotateZ: -5, y: -2.5, lookX: 0.4, lookY: 0.45, durationMs: 1400 },
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
  const [stars] = useState<GeminiRandomStarSpec[]>(() =>
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

const MUSE_MUSIC_NOTES = [
  { kind: 'single', x: '4%', y: '34%', size: 12.5, dx: '-6px', tilt: '-14deg', dur: '2.9s', delay: '0s', fill: '#0082FB' },
  { kind: 'double', x: '82%', y: '27%', size: 14, dx: '6px', tilt: '12deg', dur: '3.2s', delay: '0.75s', fill: '#38BDF8' },
  { kind: 'double', x: '7%', y: '70%', size: 12, dx: '-5px', tilt: '14deg', dur: '3.1s', delay: '1.45s', fill: '#F48C82' },
  { kind: 'single', x: '81%', y: '66%', size: 12.5, dx: '6px', tilt: '-12deg', dur: '2.8s', delay: '2.1s', fill: '#E5A952' },
] as const

function MuseDreamNotes({
  active,
  isLg,
  prefersReduced,
}: {
  active: boolean
  isLg: boolean
  prefersReduced: boolean
}) {
  const scaleFactor = isLg ? 1.28 : 1

  return (
    <span
      aria-hidden="true"
      data-particle-kind="muse-notes"
      className="pointer-events-none absolute inset-[-10%] z-20"
    >
      {/* 皇冠与绒球背后的柔和织梦暖蓝双色光晕 */}
      <span
        className={cn(
          'absolute inset-[10%] rounded-full',
          active && !prefersReduced && 'st-muse-crown-halo'
        )}
        style={{
          background: active
            ? 'radial-gradient(circle at 50% 24%, rgba(0,130,251,0.24) 0%, rgba(56,189,248,0.12) 34%, transparent 62%), radial-gradient(circle at 50% 58%, rgba(234,184,128,0.22) 22%, transparent 74%)'
            : 'radial-gradient(circle at 50% 24%, rgba(0,130,251,0.12) 0%, transparent 56%), radial-gradient(circle at 50% 58%, rgba(234,184,128,0.12) 22%, transparent 74%)',
        }}
      />

      {/* 随节拍轻快跃动的小音符（对应经典小舞者形象，零水流线条与气泡） */}
      {MUSE_MUSIC_NOTES.map((n, idx) => {
        const px = n.size * scaleFactor
        const isDouble = n.kind === 'double'
        return (
          <svg
            key={idx}
            viewBox={isDouble ? '0 0 22 20' : '0 0 18 20'}
            fill="none"
            className={cn('absolute overflow-visible', !prefersReduced && 'st-muse-note')}
            style={
              {
                left: n.x,
                top: n.y,
                width: px,
                height: px * (isDouble ? 0.91 : 1.11),
                opacity: prefersReduced ? 0.82 : undefined,
                '--note-dx': n.dx,
                '--note-tilt': n.tilt,
                '--note-dur': n.dur,
                '--note-delay': n.delay,
              } as CSSProperties
            }
          >
            {isDouble ? (
              <g
                fill={n.fill}
                stroke="#FFFFFF"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ paintOrder: 'stroke' }}
              >
                <path d="M7.6 14.8 V5.0 L17.6 3.2 V13.2" fill="none" stroke="#FFFFFF" strokeWidth="3.2" />
                <path d="M7.6 14.8 V5.0 L17.6 3.2 V13.2" fill="none" stroke={n.fill} strokeWidth="2.1" />
                <path d="M7.0 5.1 L18.2 3.1" stroke={n.fill} strokeWidth="3.1" />
                <ellipse cx="5.1" cy="15.0" rx="3.3" ry="2.4" transform="rotate(-20 5.1 15.0)" />
                <ellipse cx="15.1" cy="13.4" rx="3.3" ry="2.4" transform="rotate(-20 15.1 13.4)" />
              </g>
            ) : (
              <g
                fill={n.fill}
                stroke="#FFFFFF"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ paintOrder: 'stroke' }}
              >
                <path d="M8.6 14.5 V3.6 C11.4 3.8 14.8 5.6 14.6 9.2" fill="none" stroke="#FFFFFF" strokeWidth="3.3" />
                <path d="M8.6 14.5 V3.6 C11.4 3.8 14.8 5.6 14.6 9.2" fill="none" stroke={n.fill} strokeWidth="2.2" />
                <ellipse cx="5.9" cy="14.6" rx="3.4" ry="2.5" transform="rotate(-20 5.9 14.6)" />
              </g>
            )}
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
        {/* 紧贴黑洞外环的暖炭金暗影晕（遵循 DESIGN.md 无蓝紫霓虹约束） */}
        <span
          className="absolute inset-[18%] rounded-full"
          style={{
            background: active
              ? 'radial-gradient(circle, rgba(24,22,19,0.52) 24%, rgba(168,144,104,0.22) 54%, transparent 78%)'
              : 'radial-gradient(circle, rgba(24,22,19,0.28) 24%, rgba(168,144,104,0.12) 54%, transparent 78%)',
          }}
        />
        {/* 5 道紧凑匀速衔接的同心金属水波环 */}
        {GROK_HALO_WAVES.map((w, idx) => (
          <span
            key={idx}
            className="st-bh-pulse-wave absolute inset-0 rounded-full"
            style={
              {
                background: active
                  ? 'radial-gradient(circle, transparent 36%, rgba(120,113,108,0.24) 49%, rgba(229,169,24,0.34) 60%, rgba(214,209,198,0.18) 72%, rgba(245,241,232,0.06) 81%, transparent 90%)'
                  : 'radial-gradient(circle, transparent 36%, rgba(120,113,108,0.14) 49%, rgba(229,169,24,0.20) 60%, rgba(214,209,198,0.10) 72%, rgba(245,241,232,0.04) 81%, transparent 90%)',
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

  if (providerId === 'muse') {
    return <MuseDreamNotes active={active} isLg={isLg} prefersReduced={prefersReduced} />
  }

  if (providerId === 'seedream') {
    return (
      <span
        aria-hidden="true"
        data-particle-kind="seedream-aura"
        className="pointer-events-none absolute inset-[-8%] z-20"
      >
        <span
          className="absolute inset-[10%] rounded-full"
          style={{
            background: active
              ? 'radial-gradient(circle, rgba(34,211,238,0.24) 28%, rgba(56,189,248,0.11) 56%, transparent 76%)'
              : 'radial-gradient(circle, rgba(34,211,238,0.14) 28%, rgba(56,189,248,0.06) 56%, transparent 74%)',
          }}
        />
      </span>
    )
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
  frustrated = false,
  holdingBrush = false,
  hideHeldBrush = false,
  traveling = false,
  watchingPainter = false,
  watchTargetSelector = '[data-monitor-sprite-slot]',
  pointerTiltRef,
  overridePoseRef,
  pokedCombo = 0,
  reactionTick = 0,
  brushColorHex,
  brushGlowHex,
  brushNibStyle = 'round',
  brushViewWidth = 224,
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
    const baseDelay =
      providerId === 'gpt'
        ? 3400
        : providerId === 'grok'
          ? 4200
          : providerId === 'muse'
            ? 3700
            : providerId === 'seedream'
              ? 3200
              : 2900
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

  const isPeerWatching = Boolean(
    watchingPainter && !disabled && !generating && !cheering && !frustrated
  )

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
    if (disabled || generating || cheering || frustrated || hovered || isPeerWatching || prefersReducedMotion) return
    const script = IDLE_CHOREO_SCRIPTS[providerId]
    const initialOffset =
      providerId === 'gpt'
        ? 750
        : providerId === 'grok'
          ? 1650
          : providerId === 'muse'
            ? 2050
            : providerId === 'seedream'
              ? 2400
              : 1200
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
  }, [providerId, disabled, generating, cheering, frustrated, hovered, isPeerWatching, prefersReducedMotion])

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
      : frustrated
        ? 'frustrated'
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
    disabled || generating || cheering || frustrated || prefersReducedMotion
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
    if (frustrated) {
      return { yawDeg: -8, pitchDeg: -14, rollDeg: -6, lookX: -0.18, lookY: 0.42, liftY: 4 }
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
    frustrated,
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
      {/* 悬浮底座物理接触投影（暖灰微影，拒绝蓝青荧光底光） */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full transition-opacity duration-300"
        style={{
          width: isLg ? '72%' : selected || hovered ? '76%' : '60%',
          height: isLg ? 11 : 8,
          backgroundColor: 'rgba(20, 18, 14, 0.24)',
          filter: 'blur(4px)',
          opacity: disabled ? 0.14 : frustrated ? 0.18 : generating ? 0.45 : selected ? 0.38 : hovered ? 0.3 : 0.18,
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
          active={!frustrated && (selected || hovered || generating)}
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
          frustrated={frustrated}
          reactionTick={reactionTick}
          prefersReducedMotion={Boolean(prefersReducedMotion)}
          sizePx={sizePx}
          getTargetPose={getTargetPose}
          overridePoseRef={overridePoseRef}
          getGlareOffset={getGlareOffset}
          onPoseFrame={handlePoseFrame}
          className="pointer-events-none shrink-0"
        />
      </div>

      {/* 小精灵握持的完整画笔（与 3D 骨架姿态实时同步；Muse 穿梭等独立掷笔场景通过 hideHeldBrush 彻底隐藏，避免重复粘连） */}
      {(generating || cheering || frustrated || (selected && holdingBrush)) && !disabled && !hideHeldBrush && (
        <div
          ref={brushWrapperRef}
          aria-hidden="true"
          className="st-preserve-3d pointer-events-none absolute inset-0 z-20"
          style={{ transform: `translateZ(${isLg ? 20 : 15}px)` }}
        >
          <div
            className={cn(
              'absolute origin-center',
              isLg ? '-right-8 bottom-0' : '-right-2 -bottom-0.5',
              cheering
                ? '-rotate-45 -translate-y-2'
                : frustrated
                  ? 'rotate-[22deg] translate-y-2.5 opacity-80 transition-transform duration-300'
                  : generating
                    ? isWiping
                      ? 'st-brush-rest'
                      : 'st-brush-paint'
                    : 'st-held-brush-sway'
            )}
          >
            <ArtistPaintbrush
              variant="chunky"
              viewWidth={brushViewWidth}
              colorHex={activeColor}
              glowHex={activeGlow}
              nibStyle={brushNibStyle}
              active={Boolean((selected || generating || cheering) && !frustrated)}
              style={{
                width: isLg ? 100 : 68,
                aspectRatio: `${brushViewWidth} / 48`,
              }}
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

      {/* 生成失败后在原地等待决策的沮丧黑线与委屈气泡（穿梭飞行/滚转途中隐藏避免随体倒转挤压） */}
      {isLg && frustrated && !generating && !cheering && !traveling && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <svg
            viewBox="0 0 18 22"
            aria-hidden="true"
            className="absolute top-1.5 right-0.5 h-5 w-4 text-slate-400/85 dark:text-slate-300/70"
          >
            <path
              d="M3 2 L3 17 M9 1 L9 20 M15 3 L15 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <motion.span
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
            className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border border-[#E5A918]/45 bg-card px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-foreground shadow-sm"
          >
            呜…这次没画成
          </motion.span>
        </div>
      )}
    </div>
  )
}

/**
 * 右侧生成监视器专属「画师作画 + 静止画纸」舞台：
 * 画纸独立固定在桌面，不随画师上下浮动；画师停下来擦汗时，画纸上的笔触也会同步停下。
 * 支持进入入场(entering)、排队待命(queued)、作画(working)、沮丧等待决策(frustrated)、欢呼交作业(cheering)、甩纸飞回(returning)六阶段。
 */
export function GeneratingSpriteStage({
  providerId,
  brushColorHex,
  brushGlowHex,
  stagePhase = 'working',
  previewImageUrl,
  reactionTick = 0,
}: {
  providerId: ImageProviderId
  brushColorHex: string
  brushGlowHex: string
  stagePhase?: 'entering' | 'queued' | 'working' | 'frustrated' | 'cheering' | 'returning'
  previewImageUrl?: string | null
  reactionTick?: number
}) {
  const [workPhase, setWorkPhase] = useState<'painting' | 'wiping'>('painting')

  useEffect(() => {
    if (stagePhase !== 'working') return
    const resetRaf = requestAnimationFrame(() => setWorkPhase('painting'))
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
      cancelAnimationFrame(resetRaf)
      if (timer) window.clearTimeout(timer)
    }
  }, [providerId, stagePhase])

  const isWiping = stagePhase === 'working' && workPhase === 'wiping'
  const isCheering = stagePhase === 'cheering'
  const isFrustrated = stagePhase === 'frustrated'
  const isQueued = stagePhase === 'queued'
  const showSpriteBody = stagePhase === 'working' || isQueued || isCheering || isFrustrated
  const showDeskPaper = stagePhase !== 'returning'

  return (
    <div
      className={cn(
        'relative flex w-56 shrink-0 flex-col items-center justify-center',
        isFrustrated ? 'pt-6' : 'h-44'
      )}
    >
      {/* 3D 画师小精灵落位槽（舞台刻度环随精灵槽位同心对齐） */}
      <div
        data-monitor-sprite-slot
        className={cn(
          'relative z-20 flex size-28 items-center justify-center',
          isFrustrated ? 'mt-0' : '-mt-5'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -inset-2 rounded-full border border-dashed border-foreground/15',
            !isFrustrated && 'st-spin-slow'
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-0.5 rounded-full border border-foreground/[0.07]"
        />
        {isQueued && (
          <span className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[#E5A918]/50 bg-card px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[#7A5200] shadow-xs dark:text-[#F5C443]">
            握笔排队待命中…
          </span>
        )}
        {showSpriteBody && (
          <ArtistSprite3D
            providerId={providerId}
            selected
            generating={stagePhase === 'working'}
            holdingBrush={isQueued}
            cheering={isCheering}
            frustrated={isFrustrated}
            isWiping={isWiping}
            reactionTick={stagePhase === 'working' ? reactionTick : 0}
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
            isCheering && '-translate-y-1 scale-105 border-[#E5A918]/70 shadow-md',
            isFrustrated && 'border-[#E5A918]/45 opacity-85'
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

function getBrushFallbackTrait(modelOpt: ProviderModelPublicInfo): string {
  const customTrait = modelOpt.tagline?.trim()
  if (customTrait) return customTrait
  const lower = modelOpt.profileId.toLowerCase()
  if (lower.includes('pro') || lower.includes('1.5')) return '细节更细腻'
  if (lower.includes('flash') || lower.includes('fast') || lower.includes('mini')) return '出图速度快'
  if (lower.includes('imagine')) return '质感张力强'
  return '画风稳定'
}

export interface HoveredBrushInfo {
  providerId: ImageProviderId
  profile: ProviderModelPublicInfo
  colorHex: string
  glowHex: string
}

export type BrushRackMode = 'palette' | 'pencil_case' | 'pen_slots'

export interface ArtistStageSelectorProps {
  artists: StudioArtistPersona[]
  providers: ProviderPublicInfo[]
  providersLoaded: boolean
  selectedProvider: ImageProviderId
  selectedProfileId?: string | null
  selectedProfileByProvider?: Partial<Record<ImageProviderId, string>>
  activeBrushColorHex?: string
  activeBrushGlowHex?: string
  brushReactionTick?: number
  brushRackMode?: BrushRackMode
  generatingProviderId?: ImageProviderId | null
  awayProviderIds?: ImageProviderId[]
  frustratedAwayProviderId?: ImageProviderId | null
  onSelectProvider: (providerId: ImageProviderId) => void
  onSelectProfile?: (providerId: ImageProviderId, profileId: string) => void
  onHoverBrushChange?: (info: HoveredBrushInfo | null) => void
}

function resolveCardActiveProfileId(
  models: ProviderModelPublicInfo[],
  preferredId: string | null | undefined
): string | null {
  if (models.length === 0) return null
  if (preferredId && models.some((m) => m.profileId === preferredId)) return preferredId
  return models.find((m) => m.isDefault)?.profileId ?? models[0]?.profileId ?? null
}

const PRESET_BRUSH_WIDTH = 220
const RACK_BRUSH_HEIGHT = 52
const RACK_BRUSH_CAP_LEFT = 52
const RACK_BRUSH_CAP_RIGHT = Math.ceil((28 * RACK_BRUSH_HEIGHT) / 48)
const RACK_BARREL_H_PADDING = 28
const HELD_BRUSH_WIDTH = 68

interface FlyingBrushFlight {
  id: number
  providerId: ImageProviderId
  hex: string
  glowHex: string
  nibStyle: BrushNibStyle
  viewWidth: number
  label: string
  baseWidth: number
  baseHeight: number
  x: number[]
  y: number[]
  rotate: number[]
  scale: number[]
  times: number[]
}

function buildSmoothBrushFlightTrack(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startRotate: number,
  endRotate: number,
  baseWidth: number,
  baseHeight: number,
  startScale: number,
  endScale: number
) {
  const dx = endX - startX
  const ctrlX = (startX + endX) * 0.5 + (dx >= 0 ? -34 : 34)
  const ctrlY = Math.min(startY, endY) - 46

  const LUT = 48
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

  const STEPS = 18
  const x: number[] = []
  const y: number[] = []
  const rotate: number[] = []
  const scale: number[] = []
  const times: number[] = []
  let lutIdx = 0

  for (let k = 0; k <= STEPS; k++) {
    const s = k / STEPS
    const u = 1 - Math.pow(1 - s, 1.8)
    const targetDist = u * totalLen
    while (lutIdx < LUT - 1 && cumLen[lutIdx + 1] < targetDist) {
      lutIdx += 1
    }
    const segStart = cumLen[lutIdx]
    const segSpan = Math.max(1e-4, cumLen[lutIdx + 1] - segStart)
    const alpha = Math.max(0, Math.min(1, (targetDist - segStart) / segSpan))
    const px = rawX[lutIdx] + (rawX[lutIdx + 1] - rawX[lutIdx]) * alpha
    const py = rawY[lutIdx] + (rawY[lutIdx + 1] - rawY[lutIdx]) * alpha

    x.push(px - baseWidth * 0.5)
    y.push(py - baseHeight * 0.5)
    rotate.push(startRotate + (endRotate - startRotate) * u)
    // 从一开始的巨型状态在飞往画师手中过程中逐渐等比缩小
    const shrinkT = Math.pow(u, 0.85)
    scale.push(startScale + (endScale - startScale) * shrinkT)
    times.push(s)
  }
  return { x, y, rotate, scale, times }
}

export function ArtistStageSelector({
  artists,
  providers,
  providersLoaded,
  selectedProvider,
  selectedProfileId = null,
  selectedProfileByProvider,
  activeBrushColorHex,
  activeBrushGlowHex,
  brushReactionTick = 0,
  brushRackMode = 'palette',
  generatingProviderId = null,
  awayProviderIds = [],
  frustratedAwayProviderId = null,
  onSelectProvider,
  onSelectProfile,
  onHoverBrushChange,
}: ArtistStageSelectorProps) {
  const prefersReducedMotion = useReducedMotion()
  const stageContainerRef = useRef<HTMLDivElement | null>(null)
  const activeWorkingArtistId = generatingProviderId ?? awayProviderIds[0] ?? null
  const [prevWorkingId, setPrevWorkingId] = useState<ImageProviderId | null>(activeWorkingArtistId)
  const [interactedWatcherIds, setInteractedWatcherIds] = useState<ImageProviderId[]>([])
  const [localBrushReactionTick, setLocalBrushReactionTick] = useState(0)
  const [flyingBrush, setFlyingBrush] = useState<FlyingBrushFlight | null>(null)
  const [uniformBrushWidth, setUniformBrushWidth] = useState(PRESET_BRUSH_WIDTH)
  const measureContainerRef = useRef<HTMLDivElement | null>(null)
  const flightIdRef = useRef(0)
  const flightTimerRef = useRef<number | null>(null)
  const flightRafRef = useRef<number | null>(null)

  const allBrushLabels = useMemo(() => {
    const seen = new Set<string>()
    for (const p of providers) {
      for (const m of p.models ?? []) {
        if (!m.enabled) continue
        const lbl = m.displayName?.trim() || m.profileId
        if (lbl) seen.add(lbl)
      }
    }
    return Array.from(seen)
  }, [providers])

  useLayoutEffect(() => {
    const container = measureContainerRef.current
    if (!container) return
    let maxTextWidth = 0
    for (const child of Array.from(container.children)) {
      const w = (child as HTMLElement).getBoundingClientRect().width
      if (w > maxTextWidth) maxTextWidth = w
    }
    const neededWidth = Math.ceil(
      RACK_BRUSH_CAP_LEFT + maxTextWidth + RACK_BARREL_H_PADDING + RACK_BRUSH_CAP_RIGHT
    )
    const nextWidth = Math.max(PRESET_BRUSH_WIDTH, neededWidth)
    setUniformBrushWidth((prev) => (prev === nextWidth ? prev : nextWidth))
  }, [allBrushLabels])

  const brushViewWidth = Math.round((uniformBrushWidth * 48) / RACK_BRUSH_HEIGHT)

  useEffect(() => {
    return () => {
      if (flightTimerRef.current) window.clearTimeout(flightTimerRef.current)
      if (flightRafRef.current) window.cancelAnimationFrame(flightRafRef.current)
    }
  }, [])

  if (prevWorkingId !== activeWorkingArtistId) {
    setPrevWorkingId(activeWorkingArtistId)
    if (interactedWatcherIds.length > 0) setInteractedWatcherIds([])
  }

  const activeProviderInfo = providers.find((p) => p.providerId === selectedProvider)
  const activeEnabledModels = (activeProviderInfo?.models ?? []).filter((m) => m.enabled)
  const activeArtistReady =
    providersLoaded &&
    Boolean(activeProviderInfo?.enabled) &&
    Boolean(activeProviderInfo?.configured) &&
    activeEnabledModels.length > 0

  const effectiveSelectedProfileId = resolveCardActiveProfileId(
    activeEnabledModels,
    selectedProfileId ?? selectedProfileByProvider?.[selectedProvider]
  )

  const handlePickBrush = useCallback(
    (modelOpt: ProviderModelPublicInfo, idx: number, sourceEl?: HTMLElement | null) => {
      unlockStudioAudio()
      playBrushSelect(idx)
      onSelectProfile?.(selectedProvider, modelOpt.profileId)

      const isAway = awayProviderIds.includes(selectedProvider)
      if (prefersReducedMotion || isAway || typeof document === 'undefined') {
        setLocalBrushReactionTick((n) => n + 1)
        return
      }

      if (flightRafRef.current) {
        window.cancelAnimationFrame(flightRafRef.current)
        flightRafRef.current = null
      }

      const fid = ++flightIdRef.current
      flightRafRef.current = window.requestAnimationFrame(() => {
        flightRafRef.current = null
        if (fid !== flightIdRef.current) return

        const scopeRoot = stageContainerRef.current ?? document
        const fromEl =
          scopeRoot.querySelector<HTMLElement>('[data-pen-rest-brush="true"]') ??
          sourceEl ??
          scopeRoot.querySelector<HTMLElement>(`[data-brush-option="${modelOpt.profileId}"]`)
        const targetEl = scopeRoot.querySelector<HTMLElement>(
          `[data-artist-sprite-target="${selectedProvider}"]`
        )

        if (!fromEl || !targetEl) {
          setLocalBrushReactionTick((n) => n + 1)
          return
        }

        const fromRect = fromEl.getBoundingClientRect()
        const toRect = targetEl.getBoundingClientRect()
        if (fromRect.width <= 0 || toRect.width <= 0) {
          setLocalBrushReactionTick((n) => n + 1)
          return
        }

        const palette = getBrushPalette(idx)
        const nibStyle = resolveBrushNibStyle(modelOpt)
        const label = modelOpt.displayName?.trim() || modelOpt.profileId
        const sourceWidth = fromEl.offsetWidth || Math.round(fromRect.width) || uniformBrushWidth
        const baseWidth = uniformBrushWidth
        const baseHeight = RACK_BRUSH_HEIGHT
        const startScale = Math.min(1.04, Math.max(0.5, sourceWidth / baseWidth) * 1.04)
        const endScale = Math.min(1, Math.max(0.2, HELD_BRUSH_WIDTH / baseWidth))
        const startX = fromRect.left + fromRect.width * 0.5
        const startY = fromRect.top + fromRect.height * 0.5
        // 对齐画师右掌持笔位置 (-right-2 -bottom-0.5, 宽度 68px, 角度 -28deg)
        const endX = toRect.right - 26
        const endY = toRect.bottom - 5.5
        // 顺时针旋转一圈后平稳落至 -28deg（332deg），并在飞行过程中从巨型逐渐缩小到掌中尺寸
        const track = buildSmoothBrushFlightTrack(
          startX,
          startY,
          endX,
          endY,
          -2,
          332,
          baseWidth,
          baseHeight,
          startScale,
          endScale
        )

        if (flightTimerRef.current) window.clearTimeout(flightTimerRef.current)
        setFlyingBrush({
          id: fid,
          providerId: selectedProvider,
          hex: palette.hex,
          glowHex: palette.glowHex,
          nibStyle,
          viewWidth: brushViewWidth,
          label,
          baseWidth,
          baseHeight,
          ...track,
        })

        flightTimerRef.current = window.setTimeout(() => {
          flightTimerRef.current = null
          setFlyingBrush((curr) => (curr?.id === fid ? null : curr))
          setLocalBrushReactionTick((n) => n + 1)
        }, 420)
      })
    },
    [awayProviderIds, brushViewWidth, onSelectProfile, prefersReducedMotion, selectedProvider, uniformBrushWidth]
  )

  return (
    <div ref={stageContainerRef} className="space-y-1.5">
      {/* 离屏精确测算当前全站最长画笔名称所需的统一笔身宽度 */}
      <div
        ref={measureContainerRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed -top-[9999px] -left-[9999px] flex flex-col items-start"
      >
        {allBrushLabels.map((lbl) => (
          <span
            key={lbl}
            className="whitespace-nowrap text-xs font-extrabold leading-none tracking-tight"
          >
            {lbl}
          </span>
        ))}
      </div>
      <div
        role="radiogroup"
        aria-label="选择AI小画家"
        className="no-scrollbar flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain pt-1 pb-0.5 @[460px]/controls:grid @[460px]/controls:grid-cols-5 @[460px]/controls:overflow-visible @[460px]/controls:pb-0"
      >
        {artists.map((artist) => {
          const pInfo = providers.find((p) => p.providerId === artist.id)
          const enabled = pInfo ? pInfo.enabled : true
          const configured = pInfo ? pInfo.configured : false
          const selected = selectedProvider === artist.id
          const available = enabled && configured
          const enabledModels = (pInfo?.models ?? []).filter((m) => m.enabled)
          const cardActiveProfileId = resolveCardActiveProfileId(
            enabledModels,
            selected ? effectiveSelectedProfileId : selectedProfileByProvider?.[artist.id]
          )
          const cardActiveIndex = cardActiveProfileId
            ? Math.max(
                0,
                enabledModels.findIndex((m) => m.profileId === cardActiveProfileId)
              )
            : 0
          const cardBrushPalette =
            enabledModels.length > 0 ? getBrushPalette(cardActiveIndex) : null
          const cardActiveModel =
            enabledModels.find((m) => m.profileId === cardActiveProfileId) ??
            enabledModels[0] ??
            null
          const cardBrushNibStyle = resolveBrushNibStyle(cardActiveModel)
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
              away={awayProviderIds.includes(artist.id)}
              awayFrustrated={frustratedAwayProviderId === artist.id}
              watchingPainter={isWatchingPainter}
              holdingBrush={selected && available && Boolean(activeBrushColorHex || cardBrushPalette)}
              hideHeldBrush={Boolean(flyingBrush && flyingBrush.providerId === artist.id)}
              brushColorHex={selected ? activeBrushColorHex || cardBrushPalette?.hex : undefined}
              brushGlowHex={selected ? activeBrushGlowHex || cardBrushPalette?.glowHex : undefined}
              brushNibStyle={cardBrushNibStyle}
              brushViewWidth={brushViewWidth}
              externalReactionTick={selected ? brushReactionTick + localBrushReactionTick : 0}
              models={enabledModels}
              activeProfileId={cardActiveProfileId}
              onInteract={() => {
                if (activeWorkingArtistId && activeWorkingArtistId !== artist.id) {
                  setInteractedWatcherIds((prev) =>
                    prev.includes(artist.id) ? prev : [...prev, artist.id]
                  )
                }
              }}
              onSelect={() => {
                if (flightRafRef.current) {
                  window.cancelAnimationFrame(flightRafRef.current)
                  flightRafRef.current = null
                }
                if (flightTimerRef.current) {
                  window.clearTimeout(flightTimerRef.current)
                  flightTimerRef.current = null
                }
                setFlyingBrush(null)
                onHoverBrushChange?.(null)
                onSelectProvider(artist.id)
              }}
            />
          )
        })}
      </div>

      {activeArtistReady &&
        (brushRackMode === 'pen_slots' ? (
          <ArtistPenSlotsRack
            providerId={selectedProvider}
            models={activeEnabledModels}
            selectedProfileId={effectiveSelectedProfileId}
            onPickBrush={handlePickBrush}
            onHoverBrushChange={(info) =>
              onHoverBrushChange?.(info ? { providerId: selectedProvider, ...info } : null)
            }
          />
        ) : brushRackMode === 'pencil_case' ? (
          <ArtistPencilCaseRack
            key={selectedProvider}
            providerId={selectedProvider}
            models={activeEnabledModels}
            selectedProfileId={effectiveSelectedProfileId}
            onPickBrush={handlePickBrush}
            onHoverBrushChange={(info) =>
              onHoverBrushChange?.(info ? { providerId: selectedProvider, ...info } : null)
            }
          />
        ) : (
          <ArtistBrushRack
            models={activeEnabledModels}
            selectedProfileId={effectiveSelectedProfileId}
            uniformWidth={uniformBrushWidth}
            viewWidth={brushViewWidth}
            onPickBrush={handlePickBrush}
          />
        ))}

      {/* 点击画笔或切换箭头后：画笔旋转着沿着弧线飞入当前选中画家的手中 */}
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
              duration: 0.42,
              ease: 'linear',
              times: flyingBrush.times,
            }}
            style={{
              filter: `drop-shadow(0 8px 16px ${flyingBrush.glowHex})`,
            }}
          >
            <ArtistPaintbrush
              variant="chunky"
              viewWidth={flyingBrush.viewWidth}
              label={flyingBrush.label}
              colorHex={flyingBrush.hex}
              glowHex={flyingBrush.glowHex}
              nibStyle={flyingBrush.nibStyle}
              active
              style={{
                width: flyingBrush.baseWidth,
                height: flyingBrush.baseHeight,
              }}
            />
          </motion.div>,
          document.body
        )}
    </div>
  )
}

function ArtistPenSlotsRack({
  providerId,
  models,
  selectedProfileId,
  onPickBrush,
  onHoverBrushChange,
}: {
  providerId: ImageProviderId
  models: ProviderModelPublicInfo[]
  selectedProfileId: string | null
  onPickBrush: (modelOpt: ProviderModelPublicInfo, idx: number) => void
  onHoverBrushChange?: (
    info: { profile: ProviderModelPublicInfo; colorHex: string; glowHex: string } | null
  ) => void
}) {
  const prefersReducedMotion = useReducedMotion()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hoveredIdRef = useRef<string | null>(null)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const activeIdx = Math.max(
    0,
    models.findIndex((m) => m.profileId === selectedProfileId)
  )
  const activeModel = models[activeIdx] ?? models[0] ?? null
  const hoveredIdx = hoveredId ? models.findIndex((m) => m.profileId === hoveredId) : -1
  const hoveredModel = hoveredIdx >= 0 ? models[hoveredIdx] : null

  const displayIdx = hoveredModel ? hoveredIdx : activeIdx
  const displayModel = hoveredModel ?? activeModel
  const displayPalette = getBrushPalette(displayIdx)
  const displayNibLabel = BRUSH_NIB_LABELS[resolveBrushNibStyle(displayModel)]
  const displayDetail = displayModel
    ? displayModel.tagline?.trim() || displayModel.badge?.trim() || displayNibLabel
    : ''

  const handleHoverEnter = (
    modelOpt: ProviderModelPublicInfo,
    palette: { hex: string; glowHex: string }
  ) => {
    if (hoveredIdRef.current !== modelOpt.profileId) {
      playBrushHover()
    }
    hoveredIdRef.current = modelOpt.profileId
    setHoveredId(modelOpt.profileId)
    onHoverBrushChange?.({
      profile: modelOpt,
      colorHex: palette.hex,
      glowHex: palette.glowHex,
    })
  }

  const clearHover = (onlyProfileId?: string) => {
    if (onlyProfileId && hoveredIdRef.current !== onlyProfileId) return
    if (hoveredIdRef.current === null) return
    hoveredIdRef.current = null
    setHoveredId(null)
    onHoverBrushChange?.(null)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (models.length <= 1) return
    let delta = 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') delta = 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') delta = -1
    if (delta === 0) return

    e.preventDefault()
    const nextIdx = (activeIdx + delta + models.length) % models.length
    const nextModel = models[nextIdx]
    if (!nextModel) return
    onPickBrush(nextModel, nextIdx)
    buttonRefs.current[nextIdx]?.focus()
  }

  const gridColsClass =
    models.length <= 1
      ? 'grid-cols-1'
      : models.length === 2
        ? 'grid-cols-2'
        : models.length === 3
          ? 'grid-cols-2 @[420px]/controls:grid-cols-3'
          : 'grid-cols-2 @[420px]/controls:grid-cols-4'

  return (
    <div
      data-pen-slots-rack="true"
      data-brush-count={models.length}
      className="rounded-xl border border-border/80 bg-[#FAF8F4]/90 p-1.5 dark:bg-muted/30"
    >
      <div className="flex min-h-[22px] flex-wrap items-center justify-between gap-2 px-1 pb-1.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-tight text-foreground">
            立式画笔架
          </span>
          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs font-semibold leading-none text-muted-foreground dark:bg-white/[0.08]">
            {models.length} 支
          </span>
        </div>

        {displayModel && (
          <div
            data-hovered-brush-badge={hoveredModel ? 'true' : undefined}
            title={
              displayDetail
                ? `${displayModel.displayName} · ${displayDetail}`
                : displayModel.displayName
            }
            className="flex min-w-0 max-w-[340px] items-center gap-1.5 truncate text-xs leading-none"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full transition-colors duration-100"
              style={{
                backgroundColor: displayPalette.hex,
                boxShadow: `0 0 6px ${displayPalette.glowHex}`,
              }}
            />
            <span className="shrink-0 font-bold text-foreground">
              {displayModel.displayName}
            </span>
            {displayDetail && (
              <span className="truncate font-medium text-muted-foreground">
                · {displayDetail}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="选择画笔"
        onKeyDown={handleKeyDown}
        onPointerLeave={() => clearHover()}
        className={cn(
          'grid gap-1.5',
          gridColsClass,
          models.length > 8 && 'max-h-[188px] overflow-y-auto pr-0.5'
        )}
      >
        {models.map((modelOpt, idx) => {
          const palette = getBrushPalette(idx)
          const nibStyle = resolveBrushNibStyle(modelOpt)
          const nibLabel = BRUSH_NIB_LABELS[nibStyle]
          const isActive = modelOpt.profileId === activeModel?.profileId
          const isHovered = hoveredId === modelOpt.profileId
          const label = modelOpt.displayName || getBrushFallbackTrait(modelOpt)
          const trait = modelOpt.tagline?.trim() || nibLabel

          return (
            <button
              key={modelOpt.profileId}
              ref={(el) => {
                buttonRefs.current[idx] = el
              }}
              type="button"
              role="radio"
              aria-checked={isActive}
              data-brush-option={modelOpt.profileId}
              data-brush-name={label}
              data-active-brush={isActive ? 'true' : 'false'}
              title={trait ? `${label} · ${trait}` : label}
              onPointerEnter={() => handleHoverEnter(modelOpt, palette)}
              onFocus={() => handleHoverEnter(modelOpt, palette)}
              onBlur={() => clearHover(modelOpt.profileId)}
              onClick={() => onPickBrush(modelOpt, idx)}
              style={
                isActive
                  ? {
                      borderColor: palette.hex,
                      boxShadow: `0 6px 14px -8px ${palette.hex}95`,
                    }
                  : undefined
              }
              className={cn(
                'group/stand relative flex h-[82px] min-w-0 cursor-pointer flex-col items-center justify-end overflow-hidden rounded-xl border text-center transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] select-none active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-ring',
                isActive
                  ? 'bg-white text-foreground dark:bg-[#24211D] dark:text-white'
                  : 'border-border/75 bg-[#ECE8DE]/85 text-foreground/85 hover:border-foreground/35 hover:bg-[#F5F2EA] hover:text-foreground dark:bg-[#151412]/95 dark:hover:bg-[#1E1C19]'
              )}
            >
              {/* 选中微光背景 */}
              {isActive && (
                <motion.span
                  layoutId={
                    prefersReducedMotion ? undefined : `pen-slots-active-${providerId}`
                  }
                  transition={{ type: 'spring', stiffness: 580, damping: 40 }}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[11px]"
                  style={{
                    background: `radial-gradient(85% 70% at 50% 28%, ${palette.hex}1A 0%, ${palette.hex}06 65%, transparent 100%)`,
                  }}
                />
              )}

              {/* 上层斜插笔身（下端插入前侧铭牌槽口后方；悬停/选中时拔起一段） */}
              <span
                aria-hidden="true"
                className="pointer-events-none relative z-10 flex w-full flex-1 items-center justify-center overflow-visible"
              >
                <span
                  className="pointer-events-none absolute top-1.5 size-7 rounded-full blur-[6px] transition-opacity duration-150"
                  style={{
                    backgroundColor: palette.glowHex,
                    opacity: isActive ? 0.42 : isHovered ? 0.34 : 0.12,
                  }}
                />
                <motion.span
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          y: isActive ? 0 : isHovered ? 1 : 6,
                          scale: isActive ? 1.06 : isHovered ? 1.04 : 0.96,
                        }
                  }
                  transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                  className="relative z-10 flex items-center justify-center -rotate-[74deg]"
                >
                  <ArtistPaintbrush
                    colorHex={palette.hex}
                    glowHex={palette.glowHex}
                    nibStyle={nibStyle}
                    active={isActive || isHovered}
                    className="h-[18px] w-[58px]"
                  />
                </motion.span>
              </span>

              {/* 前侧笔插护板 + 清晰双行铭牌（固定高度保证同排护板齐平，遮住笔杆下端形成真实插笔槽口） */}
              <span
                className={cn(
                  'relative z-20 flex h-[36px] w-full shrink-0 items-center justify-center gap-1 border-t px-1.5 py-0.5 transition-colors',
                  isActive
                    ? 'border-border/60 bg-white/95 dark:border-white/10 dark:bg-[#272420]/95'
                    : 'border-border/75 bg-[#FAF8F4]/95 group-hover/stand:bg-white/95 dark:border-white/10 dark:bg-[#1B1916]/95'
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: palette.hex,
                    boxShadow: isActive ? `0 0 6px ${palette.glowHex}` : undefined,
                  }}
                />
                <span
                  className={cn(
                    'line-clamp-2 min-w-0 text-xs leading-[1.15]',
                    isActive ? 'font-extrabold text-foreground' : 'font-semibold text-foreground/85'
                  )}
                >
                  {label}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ArtistPencilCaseRack({
  providerId,
  models,
  selectedProfileId,
  onPickBrush,
  onHoverBrushChange,
}: {
  providerId: ImageProviderId
  models: ProviderModelPublicInfo[]
  selectedProfileId: string | null
  onPickBrush: (modelOpt: ProviderModelPublicInfo, idx: number) => void
  onHoverBrushChange?: (
    info: { profile: ProviderModelPublicInfo; colorHex: string; glowHex: string } | null
  ) => void
}) {
  const prefersReducedMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hoveredIdRef = useRef<string | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [barWidth, setBarWidth] = useState<number | null>(null)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lastWheelAtRef = useRef(0)

  const activeIdx = Math.max(
    0,
    models.findIndex((m) => m.profileId === selectedProfileId)
  )
  const activeModel = models[activeIdx] ?? models[0] ?? null
  const activePalette = getBrushPalette(activeIdx)
  const activeNibStyle = resolveBrushNibStyle(activeModel)
  const activeNibLabel = BRUSH_NIB_LABELS[activeNibStyle]
  const activeDetail = activeModel
    ? activeModel.tagline?.trim() || activeModel.badge?.trim() || getBrushFallbackTrait(activeModel)
    : ''

  const hoveredIdx = hoveredId ? models.findIndex((m) => m.profileId === hoveredId) : -1
  const hoveredModel = hoveredIdx >= 0 ? models[hoveredIdx] : null
  const displayIdx = hoveredModel ? hoveredIdx : activeIdx
  const displayModel = hoveredModel ?? activeModel
  const displayPalette = getBrushPalette(displayIdx)
  const displayDetail = displayModel
    ? displayModel.tagline?.trim() || displayModel.badge?.trim() || getBrushFallbackTrait(displayModel)
    : ''

  const stepBrush = useCallback(
    (delta: number, moveFocus = false) => {
      if (models.length <= 1) return
      const nextIdx = (activeIdx + delta + models.length) % models.length
      const nextModel = models[nextIdx]
      if (!nextModel) return
      onPickBrush(nextModel, nextIdx)
      if (moveFocus) {
        buttonRefs.current[nextIdx]?.focus()
      }
    },
    [activeIdx, models, onPickBrush]
  )

  useEffect(() => {
    const el = barRef.current
    if (!el || models.length <= 1 || open) return
    const handleWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(delta) < 2) return
      e.preventDefault()
      const now = performance.now()
      if (now - lastWheelAtRef.current < 75) return
      lastWheelAtRef.current = now
      stepBrush(delta > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [models.length, open, stepBrush])

  const syncBarWidth = useCallback(() => {
    const w = barRef.current?.getBoundingClientRect().width
    if (w && w > 0) setBarWidth(Math.round(w))
  }, [])

  useEffect(() => {
    if (!open) return
    syncBarWidth()
    window.addEventListener('resize', syncBarWidth)
    return () => window.removeEventListener('resize', syncBarWidth)
  }, [open, syncBarWidth])

  const handleOpenChange = (next: boolean) => {
    unlockStudioAudio()
    playPencilCaseToggle(next)
    if (next) {
      syncBarWidth()
    } else {
      hoveredIdRef.current = null
      setHoveredId(null)
      onHoverBrushChange?.(null)
    }
    setOpen(next)
  }

  const handleHoverEnter = (
    modelOpt: ProviderModelPublicInfo,
    palette: { hex: string; glowHex: string }
  ) => {
    if (hoveredIdRef.current !== modelOpt.profileId) {
      playBrushHover()
    }
    hoveredIdRef.current = modelOpt.profileId
    setHoveredId(modelOpt.profileId)
    onHoverBrushChange?.({
      profile: modelOpt,
      colorHex: palette.hex,
      glowHex: palette.glowHex,
    })
  }

  const clearHover = (onlyProfileId?: string) => {
    if (onlyProfileId && hoveredIdRef.current !== onlyProfileId) return
    if (hoveredIdRef.current === null) return
    hoveredIdRef.current = null
    setHoveredId(null)
    onHoverBrushChange?.(null)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (models.length <= 1) return
    let delta = 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') delta = 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') delta = -1
    if (delta === 0) return
    e.preventDefault()
    stepBrush(delta, true)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div
          ref={barRef}
          data-pencil-case-bar="true"
          data-brush-count={models.length}
          data-open={open ? 'true' : 'false'}
          className={cn(
            'flex items-center gap-1 rounded-xl border bg-[#FAF8F4] p-1 shadow-2xs transition-colors duration-150 dark:bg-[#1C1C19]',
            open
              ? 'border-[#C9A86A] ring-2 ring-[#E5A918]/20 dark:border-[#E5A918]/60'
              : 'border-border/85 hover:border-foreground/30'
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              data-pencil-case-trigger="true"
              aria-expanded={open}
              aria-label={
                activeModel
                  ? `当前画笔 ${activeModel.displayName}，点击${open ? '合上' : '打开'}实木画笔盒`
                  : '打开实木画笔盒'
              }
              title={
                models.length > 1
                  ? '点击打开实木画笔盒，或在此栏滚动滚轮快切画笔'
                  : '点击查看画笔详情'
              }
              className="group/case flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-black/[0.03] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ring @[400px]/controls:gap-2.5 @[400px]/controls:px-1.5 dark:hover:bg-white/[0.04]"
            >
              {/* 笔匣左侧主画笔凹槽 */}
              <span className="relative flex h-[28px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/75 bg-[#EFECE4]/95 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] @[400px]/controls:h-[32px] @[400px]/controls:w-[84px] dark:bg-[#141311] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-1.5 size-5 -translate-y-1/2 rounded-full opacity-40 blur-[5px] transition-colors duration-150 @[400px]/controls:left-2 @[400px]/controls:size-6"
                  style={{ backgroundColor: activePalette.glowHex }}
                />
                <motion.span
                  key={`${activeModel?.profileId ?? 'none'}-${activeNibStyle}`}
                  initial={
                    prefersReducedMotion
                      ? false
                      : { x: -4, y: 1.5, rotate: -12, scale: 0.96 }
                  }
                  animate={{ x: 0, y: 0, rotate: -5, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                  className="relative z-10 flex items-center justify-center"
                >
                  <ArtistPaintbrush
                    colorHex={activePalette.hex}
                    glowHex={activePalette.glowHex}
                    nibStyle={activeNibStyle}
                    active
                    className="h-[15px] w-[50px] @[400px]/controls:h-[19px] @[400px]/controls:w-[68px]"
                  />
                </motion.span>
              </span>

              {/* 中央当前画笔名与特点 */}
              {activeModel && (
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: activePalette.hex,
                        boxShadow: `0 0 6px ${activePalette.glowHex}`,
                      }}
                    />
                    <span className="truncate text-xs font-extrabold leading-tight text-foreground">
                      {activeModel.displayName}
                    </span>
                    {activeModel.badge && (
                      <span className="hidden shrink-0 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-xs font-medium leading-none text-muted-foreground sm:inline-block dark:bg-white/[0.08]">
                        {activeModel.badge}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs font-medium leading-tight text-muted-foreground">
                    {activeNibLabel}
                    {activeDetail ? ` · ${activeDetail}` : ''}
                  </span>
                </span>
              )}

              {/* 金属卡扣翻盖指示器 */}
              <span
                className={cn(
                  'inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md border px-1.5 font-mono text-xs font-semibold leading-none transition-colors @[400px]/controls:gap-1 @[400px]/controls:px-2',
                  open
                    ? 'border-[#D4A017]/60 bg-[#E5A918]/15 text-[#925800] dark:text-[#FBBF24]'
                    : 'border-border/75 bg-white/80 text-muted-foreground group-hover/case:border-foreground/35 group-hover/case:text-foreground dark:bg-card/70'
                )}
              >
                <span>
                  {activeIdx + 1}/{models.length}
                </span>
                <ChevronDownIcon
                  className={cn(
                    'size-3.5 transition-transform duration-150',
                    open && 'rotate-180'
                  )}
                />
              </span>
            </button>
          </PopoverTrigger>

          {models.length > 1 && (
            <>
              <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border/75" />
              <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
                <button
                  type="button"
                  aria-label="上一支画笔"
                  title="上一支画笔"
                  onClick={() => stepBrush(-1)}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-border/80 hover:bg-white hover:text-foreground active:scale-90 @[400px]/controls:size-7 dark:hover:bg-card"
                >
                  <ChevronLeftIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="下一支画笔"
                  title="下一支画笔"
                  onClick={() => stepBrush(1)}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-border/80 hover:bg-white hover:text-foreground active:scale-90 @[400px]/controls:size-7 dark:hover:bg-card"
                >
                  <ChevronRightIcon className="size-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        style={barWidth ? { width: `${barWidth}px` } : undefined}
        className="@container/case max-w-[calc(100vw-24px)] rounded-2xl border border-[#C9B99B]/85 bg-[#F6F3EB] p-2 shadow-xl dark:border-[#3B352B] dark:bg-[#191815]"
      >
        <div data-pencil-case-drawer="true" className="space-y-1.5">
          <div className="flex min-h-[22px] flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs font-extrabold tracking-tight text-foreground">
                实木画笔盒
              </span>
              <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs font-semibold leading-none text-muted-foreground dark:bg-white/[0.08]">
                {models.length} 支
              </span>
            </div>

            {displayModel && (
              <div
                data-hovered-brush-badge={hoveredModel ? 'true' : undefined}
                className="flex min-w-0 max-w-[280px] items-center gap-1.5 truncate text-xs leading-none"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: displayPalette.hex,
                    boxShadow: `0 0 6px ${displayPalette.glowHex}`,
                  }}
                />
                <span className="shrink-0 font-bold text-foreground">
                  {displayModel.displayName}
                </span>
                {displayDetail && (
                  <span className="truncate font-medium text-muted-foreground">
                    · {displayDetail}
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            role="radiogroup"
            aria-label="选择画笔"
            onKeyDown={handleKeyDown}
            onPointerLeave={() => clearHover()}
            className={cn(
              'grid gap-1.5',
              models.length === 1 ? 'grid-cols-1' : 'grid-cols-1 @[420px]/case:grid-cols-2',
              models.length > 8 && 'max-h-[264px] overflow-y-auto pr-0.5'
            )}
          >
            {models.map((modelOpt, idx) => {
              const palette = getBrushPalette(idx)
              const nibStyle = resolveBrushNibStyle(modelOpt)
              const nibLabel = BRUSH_NIB_LABELS[nibStyle]
              const isActive = modelOpt.profileId === activeModel?.profileId
              const isHovered = hoveredId === modelOpt.profileId
              const label = modelOpt.displayName || getBrushFallbackTrait(modelOpt)
              const trait = modelOpt.tagline?.trim() || nibLabel

              return (
                <button
                  key={modelOpt.profileId}
                  ref={(el) => {
                    buttonRefs.current[idx] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  data-brush-option={modelOpt.profileId}
                  data-brush-name={label}
                  data-active-brush={isActive ? 'true' : 'false'}
                  onPointerEnter={() => handleHoverEnter(modelOpt, palette)}
                  onFocus={() => handleHoverEnter(modelOpt, palette)}
                  onBlur={() => clearHover(modelOpt.profileId)}
                  onClick={() => {
                    onPickBrush(modelOpt, idx)
                    handleOpenChange(false)
                  }}
                  style={
                    isActive
                      ? {
                          borderColor: palette.hex,
                          boxShadow: `0 6px 16px -8px ${palette.hex}90`,
                        }
                      : undefined
                  }
                  className={cn(
                    'group/slot relative flex min-h-[44px] min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] select-none active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ring',
                    isActive
                      ? 'bg-white text-foreground dark:bg-[#24211D] dark:text-white'
                      : 'border-border/75 bg-[#EFECE3]/85 text-foreground/85 hover:border-foreground/35 hover:bg-white hover:text-foreground dark:bg-[#141311]/90 dark:hover:bg-[#1F1D19]'
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId={
                        prefersReducedMotion ? undefined : `pencil-case-active-${providerId}`
                      }
                      transition={{ type: 'spring', stiffness: 580, damping: 40 }}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-[11px]"
                      style={{
                        backgroundColor: `${palette.hex}12`,
                      }}
                    />
                  )}

                  {/* 盒内绒布凹槽 + 完整大号画笔 */}
                  <span className="relative z-10 flex h-[26px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/[0.04]">
                    <span
                      className={cn(
                        'flex items-center justify-center transition-transform duration-150',
                        isActive || isHovered ? '-rotate-[4deg] scale-105' : '-rotate-[9deg]'
                      )}
                    >
                      <ArtistPaintbrush
                        colorHex={palette.hex}
                        glowHex={palette.glowHex}
                        nibStyle={nibStyle}
                        active={isActive || isHovered}
                        className="h-[15px] w-[46px]"
                      />
                    </span>
                  </span>

                  <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate text-xs leading-tight',
                          isActive ? 'font-extrabold' : 'font-bold'
                        )}
                      >
                        {label}
                      </span>
                      {modelOpt.badge && (
                        <span className="shrink-0 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-xs font-medium leading-none text-muted-foreground dark:bg-white/[0.08]">
                          {modelOpt.badge}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs font-medium leading-tight text-muted-foreground">
                      {trait}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ArtistBrushRack({
  models,
  selectedProfileId,
  uniformWidth,
  viewWidth,
  onPickBrush,
}: {
  models: ProviderModelPublicInfo[]
  selectedProfileId: string | null
  uniformWidth: number
  viewWidth: number
  onPickBrush: (
    modelOpt: ProviderModelPublicInfo,
    idx: number,
    sourceEl?: HTMLElement | null
  ) => void
}) {
  const prefersReducedMotion = useReducedMotion()
  const penRestRef = useRef<HTMLDivElement | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const lastWheelAtRef = useRef(0)
  const [slotWidth, setSlotWidth] = useState(0)

  useLayoutEffect(() => {
    const el = slotRef.current
    if (!el) return
    const sync = () => setSlotWidth(el.clientWidth)
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitScale = slotWidth > 0 ? Math.min(1, Math.max(0.55, (slotWidth - 8) / uniformWidth)) : 1
  const fittedWidth = Math.round(uniformWidth * fitScale)
  const fittedHeight = Math.round(RACK_BRUSH_HEIGHT * fitScale)

  const activeIdx = Math.max(
    0,
    models.findIndex((m) => m.profileId === selectedProfileId)
  )
  const activeModel = models[activeIdx] ?? models[0] ?? null
  const activePalette = getBrushPalette(activeIdx)
  const activeNibStyle = resolveBrushNibStyle(activeModel)
  const activeLabel = activeModel?.displayName?.trim() || activeModel?.profileId || ''

  const stepBrush = useCallback(
    (delta: number) => {
      if (models.length <= 1) return
      const nextIdx = (activeIdx + delta + models.length) % models.length
      const nextModel = models[nextIdx]
      if (!nextModel) return
      onPickBrush(nextModel, nextIdx, penRestRef.current)
    },
    [activeIdx, models, onPickBrush]
  )

  useEffect(() => {
    const el = penRestRef.current
    if (!el || models.length <= 1) return
    const handleWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(delta) < 2) return
      e.preventDefault()
      const now = performance.now()
      if (now - lastWheelAtRef.current < 75) return
      lastWheelAtRef.current = now
      stepBrush(delta > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [models.length, stepBrush])

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (models.length <= 1) return
    let delta = 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') delta = 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') delta = -1
    if (delta === 0) return

    e.preventDefault()
    stepBrush(delta)
  }

  return (
    <div
      data-brush-rack="true"
      data-brush-count={models.length}
      className="space-y-1 pt-0.5"
    >
      <div className="flex min-h-[18px] items-center gap-1.5 px-1 pb-1">
        <span className="text-xs font-extrabold tracking-tight text-foreground">
          选择画笔
        </span>
        <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-xs font-semibold leading-none text-muted-foreground dark:bg-white/[0.08]">
          {models.length > 1 ? `${activeIdx + 1}/${models.length}` : models.length}
        </span>
      </div>

      {/* 实体主画笔笔搁（无缝内陷凹槽 + 左右切换按键 + 粗大拟物画笔本体） */}
      <div
        ref={penRestRef}
        role="group"
        aria-label={activeLabel ? `选择画笔，当前：${activeLabel}` : '选择画笔'}
        tabIndex={models.length > 1 ? 0 : undefined}
        onKeyDown={handleKeyDown}
        data-brush-pen-rest="true"
        data-impeccable-ignore="nested-cards"
        data-brush-option={activeModel?.profileId}
        data-brush-name={activeLabel}
        className={cn(
          'ks-recess relative flex min-h-[54px] w-full items-center justify-between gap-1.5 overflow-hidden rounded-xl bg-[#EFECE4]/90 px-1.5 py-0.5 focus-visible:outline-2 focus-visible:outline-ring @[360px]/controls:min-h-[58px] dark:bg-[#161513]/90',
          models.length > 1 && 'cursor-ns-resize'
        )}
      >
        {/* 笔锋下方微弱湿润颜料光晕池 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-35 blur-lg transition-colors duration-150"
          style={{ backgroundColor: activePalette.glowHex }}
        />

        {models.length > 1 && (
          <button
            type="button"
            aria-label="上一支画笔"
            onClick={() => stepBrush(-1)}
            className="relative z-10 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/80 bg-white/90 text-foreground/80 shadow-2xs transition-[transform,border-color,background-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/45 hover:bg-white hover:text-foreground active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-ring @[360px]/controls:size-9 dark:bg-card/85"
          >
            <ChevronLeftIcon className="size-4.5" />
          </button>
        )}

        <div
          ref={slotRef}
          className="relative z-10 flex min-w-0 flex-1 items-center justify-center overflow-visible px-1 py-1"
        >
          <motion.button
            key={`${activeModel?.profileId ?? 'none'}-${activeNibStyle}`}
            type="button"
            data-pen-rest-brush="true"
            aria-label={activeLabel ? `当前画笔：${activeLabel}，点击飞递给AI小画家` : '点击画笔飞递给AI小画家'}
            title={activeLabel ? `${activeLabel} · 点击飞递给AI小画家` : '点击飞递给AI小画家'}
            onClick={(e) => {
              if (activeModel) {
                onPickBrush(activeModel, activeIdx, e.currentTarget)
              }
            }}
            initial={
              prefersReducedMotion
                ? false
                : { x: -6, y: 3, rotate: -7, scale: 0.94 }
            }
            animate={{ x: 0, y: 0, rotate: -2, scale: 1 }}
            whileHover={prefersReducedMotion ? undefined : { scale: 1.03, rotate: -1 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.95, rotate: -4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            style={{ width: fittedWidth, height: fittedHeight }}
            className="mx-auto flex shrink-0 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ArtistPaintbrush
              variant="chunky"
              viewWidth={viewWidth}
              label={activeLabel}
              colorHex={activePalette.hex}
              glowHex={activePalette.glowHex}
              nibStyle={activeNibStyle}
              active
              style={{
                width: uniformWidth,
                height: RACK_BRUSH_HEIGHT,
                flexShrink: 0,
                transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
                transformOrigin: 'center center',
              }}
            />
          </motion.button>
        </div>

        {models.length > 1 && (
          <button
            type="button"
            aria-label="下一支画笔"
            onClick={() => stepBrush(1)}
            className="relative z-10 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/80 bg-white/90 text-foreground/80 shadow-2xs transition-[transform,border-color,background-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/45 hover:bg-white hover:text-foreground active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-ring @[360px]/controls:size-9 dark:bg-card/85"
          >
            <ChevronRightIcon className="size-4.5" />
          </button>
        )}
      </div>
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
  awayFrustrated = false,
  watchingPainter,
  holdingBrush,
  hideHeldBrush = false,
  brushColorHex,
  brushGlowHex,
  brushNibStyle = 'round',
  brushViewWidth = 224,
  externalReactionTick,
  models,
  activeProfileId,
  onInteract,
  onSelect,
}: {
  artist: StudioArtistPersona
  selected: boolean
  enabled: boolean
  available: boolean
  providersLoaded: boolean
  generating: boolean
  away: boolean
  awayFrustrated?: boolean
  watchingPainter: boolean
  holdingBrush: boolean
  hideHeldBrush?: boolean
  brushColorHex?: string
  brushGlowHex?: string
  brushNibStyle?: BrushNibStyle
  brushViewWidth?: number
  externalReactionTick: number
  models: ProviderModelPublicInfo[]
  activeProfileId?: string | null
  onInteract?: () => void
  onSelect: () => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const pointerTiltRef = useRef<PointerTiltState>({ nx: 0, ny: 0, active: false })
  const resetTimerRef = useRef<number | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)
  const [hovered, setHovered] = useState(false)
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
        ? awayFrustrated
          ? '在画布那边沮丧中…'
          : '努力创作中，马上好 ✦'
        : nextCombo >= 3
          ? lines[3]
          : lines[(nextCombo - 1) % lines.length]
      showBubble(msg)
    } else {
      setPokeCombo(1)
      playSpriteSelect(artist.id)
      showBubble(
        away
          ? awayFrustrated
            ? '在画布那边等你重试'
            : '正在出勤作画中 ✦'
          : POKE_LINES[artist.id][4]
      )
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
  const activeModel = models.find((m) => m.profileId === activeProfileId) || models[0] || null
  const showBrushPips = !statusFallback && models.length > 0
  const brushPreviewNames = models
    .map((m) => m.displayName?.trim())
    .filter((name): name is string => Boolean(name))
  const brushTooltipText =
    brushPreviewNames.length > 0
      ? `可选画笔（${brushPreviewNames.length}）：${brushPreviewNames.slice(0, 4).join(' · ')}${brushPreviewNames.length > 4 ? ' …' : ''}`
      : statusFallback
        ? `当前状态：${statusFallback}`
        : null

  return (
    <div
      ref={cardRef}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        if (!away) {
          setHovered(true)
          updatePointerTilt(e)
        }
        if (enabled) playSpriteHover(artist.id)
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return
        if (!away) updatePointerTilt(e)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        setHovered(false)
        clearPointerTilt()
      }}
      className={cn(
        'ks-paper-keycap group relative flex min-h-[92px] min-w-[78px] shrink-0 snap-start flex-col items-center justify-between overflow-visible rounded-xl border px-1.5 pt-1 pb-1.5 text-center transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] @[320px]/controls:min-h-[98px] @[460px]/controls:min-w-0',
        !enabled && 'opacity-55',
        selected
          ? 'z-20 -translate-y-0.5 bg-white text-foreground dark:bg-[#23211E] dark:text-white'
          : 'border-border/80 bg-[#FAF8F4] text-foreground hover:z-10 hover:-translate-y-0.5 hover:border-foreground/45 dark:bg-muted/35'
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
      {brushTooltipText ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={
                statusFallback
                  ? `AI小画家（${statusFallback}）`
                  : away
                    ? `AI小画家（${awayFrustrated ? '失落中' : '出勤中'}）`
                    : activeModel
                      ? activeModel.displayName
                      : 'AI小画家'
              }
              onClick={handleArtistClick}
              className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-xs">
            {brushTooltipText}
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={
            statusFallback
              ? `AI小画家（${statusFallback}）`
              : away
                ? `AI小画家（${awayFrustrated ? '失落中' : '出勤中'}）`
                : activeModel
                  ? activeModel.displayName
                  : 'AI小画家'
          }
          onClick={handleArtistClick}
          className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      )}

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
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            className="pointer-events-none absolute -top-2.5 left-1/2 z-30 max-w-[180px] -translate-x-1/2 truncate rounded-full border border-border/90 bg-popover px-2 py-0.5 text-xs font-bold leading-none whitespace-nowrap text-popover-foreground shadow-md"
          >
            {bubbleText}
          </motion.span>
        )}
      </AnimatePresence>

      {/* 3D 互动精灵主体（出勤中占位与实体小精灵维持完全相同的 74×74 盒尺寸与槽位偏移，避免起落返程移位） */}
      <div
        data-artist-sprite-target={artist.id}
        className="pointer-events-none relative z-10 flex size-[74px] shrink-0 items-center justify-center"
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
              {awayFrustrated ? '失落中' : '出勤中'}
            </span>
          </div>
        ) : (
          <ArtistSprite3D
            providerId={artist.id}
            selected={selected}
            hovered={hovered}
            disabled={!enabled}
            generating={generating}
            watchingPainter={watchingPainter}
            pointerTiltRef={pointerTiltRef}
            holdingBrush={holdingBrush}
            hideHeldBrush={hideHeldBrush}
            pokedCombo={pokeCombo}
            reactionTick={combinedReactionTick}
            brushColorHex={brushColorHex}
            brushGlowHex={brushGlowHex}
            brushNibStyle={brushNibStyle}
            brushViewWidth={brushViewWidth}
            size="md"
          />
        )}
      </div>

      {/* 底部紧凑色阶宝石胶囊指示条（仅指示画笔数量与当前激活画笔，不在窄卡内堆叠文字） */}
      {showBrushPips && (
        <div
          aria-hidden="true"
          className="pointer-events-none relative z-20 flex max-w-full items-center justify-center gap-1 overflow-hidden px-1 pt-0.5"
        >
          {models.slice(0, 8).map((modelOpt, idx) => {
            const palette = getBrushPalette(idx)
            const isActivePip = modelOpt.profileId === activeModel?.profileId
            return (
              <span
                key={modelOpt.profileId}
                className={cn(
                  'h-1.5 w-2 rounded-full transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)]',
                  isActivePip
                    ? selected
                      ? 'scale-x-[1.65] opacity-100'
                      : 'scale-x-[1.25] opacity-85'
                    : selected
                      ? 'scale-x-[0.75] opacity-55'
                      : 'scale-x-[0.75] opacity-35'
                )}
                style={{
                  backgroundColor: palette.hex,
                }}
              />
            )
          })}
          {models.length > 8 && (
            <span className="size-1 rounded-full bg-muted-foreground/50" />
          )}
        </div>
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
