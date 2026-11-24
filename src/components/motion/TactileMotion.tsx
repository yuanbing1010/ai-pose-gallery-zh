import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  CheckCircle2Icon,
  PersonStandingIcon,
  ShirtIcon,
  UserRoundIcon,
  ZoomInIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StudioAspectRatio } from '@/lib/artists'

/* ============================================================================
 * 1. InteractiveRecipeFan
 * 盲盒级物理手感：三张参考卡（姿势 / 服装 / 人像）以 3D 扇形卡组呈现，
 * 悬停自动舒展、点选放大/切换、随机洗牌触发弹簧弹跳洗牌编排。
 * ============================================================================ */

export interface RecipeFanCardItem {
  key: 'pose' | 'costume' | 'portrait'
  label: string
  subtitle?: string
  imageUrl?: string
  isContain?: boolean
  isDepth?: boolean
  onClick?: () => void
}

export function InteractiveRecipeFan({
  cards,
  shuffleTick = 0,
  variant = 'darkroom',
  size = 'md',
  className,
}: {
  cards: RecipeFanCardItem[]
  shuffleTick?: number
  variant?: 'darkroom' | 'lookbook' | 'editorial' | 'kinpaku'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  const [hovered, setHovered] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const dims =
    size === 'sm'
      ? { w: 62, h: 86, spreadX: 52, restX: 40 }
      : size === 'xl'
        ? { w: 120, h: 168, spreadX: 128, restX: 108 }
        : size === 'lg'
          ? { w: 104, h: 144, spreadX: 108, restX: 92 }
          : { w: 84, h: 118, spreadX: 92, restX: 78 }

  const icons = {
    pose: PersonStandingIcon,
    costume: ShirtIcon,
    portrait: UserRoundIcon,
  }

  return (
    <div
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        setHovered(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        setHovered(false)
        setActiveIndex(null)
      }}
      className={cn(
        'relative flex select-none items-center justify-center',
        size === 'sm'
          ? 'h-[98px] w-[178px]'
          : size === 'xl'
            ? 'h-[228px] w-full max-w-[380px] sm:h-[246px] sm:max-w-[440px]'
            : size === 'lg'
              ? 'h-[192px] w-[332px]'
              : 'h-[146px] w-[276px]',
        className
      )}
    >
      {cards.map((card, i) => {
        const offset = i - 1 // -1, 0, 1
        const isFocused = activeIndex === i
        const baseRotate = offset * (hovered ? 11 : 6.5)
        const baseX = offset * (hovered ? dims.spreadX : dims.restX)
        const baseY = Math.abs(offset) * (hovered ? 6 : 8) - (hovered ? 4 : 0)
        const Icon = icons[card.key]

        const frameClass =
          variant === 'darkroom'
            ? 'rounded-2xl border border-white/15 bg-zinc-950/90 shadow-[0_18px_40px_rgba(0,0,0,0.6)]'
            : variant === 'lookbook'
              ? 'rounded-[22px] border-[3px] border-white bg-white shadow-[0_14px_34px_rgba(0,0,0,0.12)] dark:border-zinc-800 dark:bg-zinc-900'
              : variant === 'editorial'
                ? 'rounded-2xl border border-border bg-card shadow-lg'
                : 'rounded-xl border border-border bg-card shadow-md'

        return (
          <motion.button
            key={`${card.key}-${shuffleTick}`}
            type="button"
            onClick={card.onClick}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return
              setActiveIndex(i)
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return
              setActiveIndex(null)
            }}
            aria-label={`${card.label}${card.subtitle ? `：${card.subtitle}` : '（未选）'}`}
            initial={
              prefersReduced || shuffleTick === 0
                ? false
                : {
                    x: 0,
                    y: 26,
                    rotate: offset * 22,
                    scale: 0.78,
                    opacity: 0.35,
                  }
            }
            animate={{
              x: baseX,
              y: isFocused ? baseY - 16 : baseY,
              rotate: isFocused ? 0 : baseRotate,
              scale: isFocused ? 1.09 : 1,
              opacity: 1,
              zIndex: isFocused ? 30 : i === 1 ? 15 : 10 + i,
            }}
            whileTap={{ scale: 0.96 }}
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 26,
              mass: 0.85,
              delay: shuffleTick > 0 ? i * 0.045 : 0,
            }}
            style={{ width: dims.w, height: dims.h }}
            className={cn(
              'group absolute cursor-pointer overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-ring',
              frameClass
            )}
          >
            {card.imageUrl ? (
              <>
                <img
                  src={card.imageUrl}
                  alt={card.label}
                  className={cn(
                    'h-full w-full transition-transform duration-300 group-hover:scale-105',
                    card.isDepth
                      ? 'bg-[#2B2B32] object-contain p-1'
                      : card.isContain
                        ? 'bg-muted/60 object-contain p-1'
                        : 'object-cover object-top'
                  )}
                />
                {/* 悬浮光泽扫过 */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/55 via-transparent to-white/15 opacity-75 transition-opacity group-hover:opacity-95"
                />
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/40 p-2 text-center">
                <Icon className="size-5 text-muted-foreground/70" />
                <span className="text-xs font-semibold text-muted-foreground">待选{card.label}</span>
              </div>
            )}

            {/* 底部极简角标 */}
            <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold backdrop-blur-md',
                  card.imageUrl
                    ? 'bg-black/65 text-white'
                    : 'bg-background/85 text-muted-foreground'
                )}
              >
                {card.imageUrl && <CheckCircle2Icon className="size-3 text-emerald-400" />}
                <span>{card.label}</span>
              </span>
              {card.imageUrl && size !== 'sm' && (
                <span className="flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomInIcon className="size-3" />
                </span>
              )}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

/* ============================================================================
 * 2. VisualAspectMorphCard
 * 比例物理形变视窗：悬停或切换 3:4 / 9:16 / 1:1 / 4:3 / 16:9 时，
 * 内部画幅框以弹簧插值丝滑变形，配对准星与像素估算。
 * ============================================================================ */

const RATIO_BOX_SIZES: Record<StudioAspectRatio, { w: number; h: number; deg: number }> = {
  '3:4': { w: 40, h: 52, deg: -36 },
  '9:16': { w: 32, h: 56, deg: -18 },
  '1:1': { w: 46, h: 46, deg: 0 },
  '4:3': { w: 52, h: 40, deg: 18 },
  '16:9': { w: 56, h: 32, deg: 36 },
}

const DIAL_TICKS = Array.from({ length: 24 }, (_, i) => i * 15)

export function VisualAspectMorphCard({
  ratio,
  label,
  hint,
  dimensionsLabel,
  compact = false,
  className,
}: {
  ratio: StudioAspectRatio
  label: string
  hint: string
  dimensionsLabel: string
  compact?: boolean
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  const box = RATIO_BOX_SIZES[ratio] ?? RATIO_BOX_SIZES['3:4']
  const baseMax = compact ? 36 : 48
  const scaleX = Math.min(1, (box.w * (compact ? 0.68 : 0.94)) / baseMax)
  const scaleY = Math.min(1, (box.h * (compact ? 0.68 : 0.94)) / baseMax)

  return (
    <div
      data-impeccable-ignore="nested-cards"
      className={cn(
        'flex items-center gap-3 rounded-xl bg-gradient-to-b from-[#1B1916] to-[#131210] px-3 py-2 text-[#F5F1E8] ring-1 ring-[#E5A918]/22 shadow-[inset_0_1px_0_rgba(255,245,220,0.08)]',
        className
      )}
    >
      {/* 拟物徕卡滚花旋钮取景刻度环 */}
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0C0B0A] shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)]',
          compact ? 'size-13' : 'size-17'
        )}
      >
        <motion.svg
          viewBox="0 0 80 80"
          aria-hidden="true"
          animate={{ rotate: box.deg }}
          transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 26 }}
          className="pointer-events-none absolute inset-0 size-full"
        >
          {DIAL_TICKS.map((deg, idx) => (
            <line
              key={deg}
              x1="40"
              y1={idx % 6 === 0 ? '3' : '5'}
              x2="40"
              y2="9"
              stroke={idx % 6 === 0 ? '#E5A918' : 'rgba(255,245,225,0.28)'}
              strokeWidth={idx % 6 === 0 ? '1.6' : '1'}
              transform={`rotate(${deg} 40 40)`}
            />
          ))}
        </motion.svg>

        {/* 纯 GPU 合成层 scaleX/scaleY 形变取景框，消除逐帧 width/height 布局重排 */}
        <motion.div
          animate={{ scaleX, scaleY }}
          transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 440, damping: 30 }}
          style={{ width: baseMax, height: baseMax }}
          className="relative flex items-center justify-center rounded-[4px] border border-[#E5A918]/85 bg-[#E5A918]/12"
        >
          <span aria-hidden="true" className="absolute top-0.5 left-0.5 size-1 border-t border-l border-[#D9381E]" />
          <span aria-hidden="true" className="absolute right-0.5 bottom-0.5 size-1 border-r border-b border-[#D9381E]" />
        </motion.div>
        {!compact && (
          <span className="pointer-events-none absolute font-mono text-xs font-bold leading-none text-[#F5C443]">
            {label}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-extrabold text-[#F5C443]">{label}</span>
          <span className="rounded-full border border-white/12 bg-white/[0.08] px-2 py-0.5 text-xs font-semibold text-white">
            {hint}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-[#B5ADA0]">
          {dimensionsLabel}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
 * 3. DarkroomExposureReveal
 * 暗房显影成图展示器：支持胶片渐显（模糊→锐利 + 扫光）与 3D 指针微倾光晕，
 * 保留 data-monitor-result-img 契约确保与 SpriteTravelPortal 无缝联动。
 * ============================================================================ */

export function DarkroomExposureReveal({
  previewUrl,
  onZoom,
  hiddenForDelivery = false,
  skipIntro = false,
  onImageReady,
  variant = 'darkroom',
  className,
}: {
  previewUrl: string
  onZoom: () => void
  hiddenForDelivery?: boolean
  skipIntro?: boolean
  onImageReady?: () => void
  variant?: 'darkroom' | 'lookbook' | 'x-stream'
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  const frameRef = useRef<HTMLButtonElement | null>(null)
  const glareRef = useRef<HTMLSpanElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!onImageReady) return
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      const raf = requestAnimationFrame(() => onImageReady())
      return () => cancelAnimationFrame(raf)
    }
  }, [previewUrl, onImageReady])

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (prefersReduced || e.pointerType !== 'mouse') return
    const el = frameRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1))
    const maxRx = variant === 'x-stream' ? 2.4 : 4.2
    const maxRy = variant === 'x-stream' ? 2.8 : 5.0
    el.style.transform = `rotateX(${(-ny * maxRx).toFixed(2)}deg) rotateY(${(nx * maxRy).toFixed(2)}deg)`
    if (glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${((nx + 1) * 50).toFixed(1)}% ${((ny + 1) * 50).toFixed(1)}%, rgba(255,255,255,0.16) 0%, transparent 52%)`
    }
  }

  const resetTilt = () => {
    const el = frameRef.current
    if (!el) return
    el.style.transform = 'rotateX(0deg) rotateY(0deg)'
  }

  return (
    <div
      className={cn(
        'st-sprite-perspective relative flex h-full w-full items-center justify-center',
        hiddenForDelivery && 'pointer-events-none opacity-0',
        className
      )}
    >
      <motion.button
        ref={frameRef}
        key={previewUrl}
        type="button"
        aria-label="点击放大查看生成结果"
        initial={
          skipIntro
            ? false
            : prefersReduced
              ? { opacity: 0 }
              : variant === 'darkroom'
                ? { opacity: 0, scale: 1.025 }
                : variant === 'lookbook'
                  ? { opacity: 0, y: 14, scale: 0.96 }
                  : { opacity: 0, scale: 0.97 }
        }
        animate={
          prefersReduced
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, y: 0 }
        }
        transition={
          prefersReduced
            ? { duration: 0.16, ease: 'easeOut' }
            : { duration: variant === 'darkroom' ? 0.34 : 0.28, ease: [0.23, 1, 0.32, 1] }
        }
        onClick={onZoom}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          setHovered(true)
          handlePointerMove(e)
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHovered(false)
          resetTilt()
        }}
        data-hover={hovered ? 'true' : 'false'}
        className="st-sprite-rig group relative flex h-full w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
      >
        <img
          ref={imgRef}
          data-monitor-result-img
          src={previewUrl}
          alt="生成结果"
          onLoad={onImageReady}
          className={cn(
            'max-h-full max-w-full object-contain transition-[filter] duration-220 group-hover:brightness-[1.03]',
            variant === 'darkroom'
              ? 'rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.65)]'
              : variant === 'lookbook'
                ? 'rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)]'
                : 'rounded-2xl border border-border'
          )}
        />
        <span
          ref={glareRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-220 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, rgba(255,255,255,0.16) 0%, transparent 52%)',
          }}
        />
        {!hiddenForDelivery && (
          <span
            aria-hidden="true"
            className="st-reveal-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          />
        )}
      </motion.button>
    </div>
  )
}

/* ============================================================================
 * 4. SpotlightSurface
 * 极克制的指针光学追光容器（无彩色霓虹外发光，仅细微黑白环境光）
 * ============================================================================ */

export function SpotlightSurface({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const spotRef = useRef<HTMLSpanElement | null>(null)
  const [active, setActive] = useState(false)

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    const spot = spotRef.current
    if (!el || !spot) return
    const rect = el.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)
    spot.style.background = `radial-gradient(360px circle at ${x}px ${y}px, rgba(127,127,127,0.08), transparent 65%)`
  }

  return (
    <div
      ref={ref}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setActive(true)
      }}
      onPointerMove={handleMove}
      onPointerLeave={() => setActive(false)}
      style={style}
      className={cn('relative overflow-hidden', className)}
    >
      <span
        ref={spotRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 z-0 transition-opacity duration-220',
          active ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          background:
            'radial-gradient(360px circle at 50% 50%, rgba(127,127,127,0.08), transparent 65%)',
        }}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  )
}

/* ============================================================================
 * 5. SpringBurstRing
 * 点赞 / 收藏瞬间绽放的轻盈涟漪环（搭配 AnimatePresence 使用）
 * ============================================================================ */

export function SpringBurstRing({
  active,
  colorClass = 'border-rose-500/70',
}: {
  active: boolean
  colorClass?: string
}) {
  const prefersReduced = useReducedMotion()
  if (prefersReduced) return null
  return (
    <AnimatePresence>
      {active && (
        <motion.span
          key="burst"
          aria-hidden="true"
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.85, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.36, ease: [0.23, 1, 0.32, 1] }}
          className={cn('pointer-events-none absolute inset-0 rounded-full border-2', colorClass)}
        />
      )}
    </AnimatePresence>
  )
}
