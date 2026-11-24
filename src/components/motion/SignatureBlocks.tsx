import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  HeartIcon,
  SparklesIcon,
} from 'lucide-react'
import { MOTION_EASE_OUT, prefersReducedMotionNow } from '@/lib/motionTokens'
import { cn } from '@/lib/utils'
import type { GalleryItemDTO } from '@/types/gallery'

/* ============================================================================
 * 1. KineticRollText (Godly / Curated / Landingly 招牌双层滚字按钮动效)
 * 悬停时文字优雅上卷、下方副本同步滚入，赋予每个核心按钮强烈的质感记忆点。
 * 搭配父级 `group` 使用。
 * ============================================================================ */

export function KineticRollText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex overflow-hidden align-middle leading-[1.2]', className)}>
      <span className="inline-block transition-transform duration-220 ease-[var(--ease-out)] group-hover:-translate-y-[115%] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        {text}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 inline-block translate-y-[115%] transition-transform duration-220 ease-[var(--ease-out)] group-hover:translate-y-0 motion-reduce:hidden"
      >
        {text}
      </span>
    </span>
  )
}

/* ============================================================================
 * 2. TactileHoldButton (Recent Design 招牌物理「长按确认」按钮)
 * 按住不放时朱砂/警示液面平滑横扫填满胶囊，满格瞬间触发回调并释放弹簧回弹，
 * 杜绝误触的同时带来类似 Leica / Teenage Engineering 实体拨杆的高级触感。
 * ============================================================================ */

export function TactileHoldButton({
  label,
  holdingLabel = '继续按住…',
  icon,
  holdDurationMs = 550,
  onConfirm,
  disabled = false,
  className,
}: {
  label: string
  holdingLabel?: string
  icon?: ReactNode
  holdDurationMs?: number
  onConfirm: () => void
  disabled?: boolean
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<number | null>(null)
  const confirmedRef = useRef(false)

  const cancelHold = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setHolding(false)
    confirmedRef.current = false
  }, [])

  useEffect(() => () => cancelHold(), [cancelHold])

  const startHold = () => {
    if (disabled) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    confirmedRef.current = false
    setHolding(true)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!confirmedRef.current) {
        confirmedRef.current = true
        onConfirm()
      }
      setHolding(false)
    }, holdDurationMs)
  }

  return (
    <motion.button
      type="button"
      disabled={disabled}
      title={`${label}（长按确认，防误触）`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        startHold()
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={() => {
        if (holding) cancelHold()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onConfirm()
        }
      }}
      animate={prefersReduced ? undefined : { scale: holding ? 0.96 : 1 }}
      transition={{ duration: holding ? 0.16 : 0.14, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        'relative inline-flex h-7 cursor-pointer select-none items-center gap-1 overflow-hidden rounded-full border border-border/80 bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/45 hover:text-destructive disabled:pointer-events-none disabled:opacity-45',
        holding && 'border-destructive text-white',
        className
      )}
    >
      {/* 纯合成层 scaleX 横扫液面（按住线性推进，中途松手 140ms 非对称快弹收回） */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-left bg-destructive"
        style={{
          transform: holding ? 'scaleX(1)' : 'scaleX(0)',
          transition: prefersReduced
            ? 'none'
            : holding
              ? `transform ${holdDurationMs}ms linear`
              : 'transform 140ms var(--ease-out)',
        }}
      />
      <span className={cn('relative z-10 inline-flex items-center gap-1', holding && 'text-white')}>
        {icon}
        <span>{holding ? holdingLabel : label}</span>
      </span>
    </motion.button>
  )
}

/* ============================================================================
 * 3. InlineHeadlineStamp (Landingly 招牌「大标题内联悬浮缩略图印记」)
 * 将真实作品缩略图以微倾和纸相框嵌在展示标题字里行间，悬停时 3D 弹起回正！
 * ============================================================================ */

export function InlineHeadlineStamp({
  src,
  alt,
  rotate = -6,
  onClick,
  className,
}: {
  src: string
  alt: string
  rotate?: number
  onClick?: () => void
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`预览精选作品：${alt}`}
      initial={prefersReduced ? false : { rotate }}
      whileHover={prefersReduced ? undefined : { rotate: 0, scale: 1.18, y: -3, zIndex: 20 }}
      whileTap={prefersReduced ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className={cn(
        'relative mx-1.5 inline-flex h-9 w-12 shrink-0 cursor-pointer align-middle overflow-hidden rounded-[9px] border-2 border-[#FFFDF8] bg-muted shadow-[0_8px_20px_rgba(20,16,10,0.22)] ring-1 ring-[#E5A918]/55 sm:h-11 sm:w-14 dark:border-[#2A2824]',
        className
      )}
    >
      <img src={src} alt={alt} className="size-full object-cover" />
    </motion.button>
  )
}

/* ============================================================================
 * 4. EditorialMarqueeRibbon (Stripe Press 招牌 1px 细线档案跑马灯带)
 * 顶部以极克制的 1px 建筑细线框出，缓慢流动展示精选主题与灵感标题，
 * 悬停即停（尊重 prefers-reduced-motion），点击条目直接触发筛选或打开作品。
 * ============================================================================ */

export interface MarqueeRibbonItem {
  id: string
  code: string
  label: string
  accent?: boolean
  onClick?: () => void
}

export function EditorialMarqueeRibbon({
  items,
  className,
}: {
  items: MarqueeRibbonItem[]
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  if (items.length === 0) return null

  const renderGroup = (prefix: string) =>
    items.map((item) => (
      <button
        key={`${prefix}-${item.id}`}
        type="button"
        onClick={item.onClick}
        className="group/mq inline-flex shrink-0 cursor-pointer items-center gap-2.5 px-4 py-2 text-xs whitespace-nowrap text-[#EAE4D7]/80 transition-colors hover:text-white"
      >
        <span
          className={cn(
            'font-mono text-xs tabular-nums',
            item.accent ? 'font-bold text-[#F5C443]' : 'text-[#E5A918]/75'
          )}
        >
          [{item.code}]
        </span>
        <span className="font-medium tracking-tight group-hover/mq:text-[#F5C443] group-hover/mq:underline group-hover/mq:underline-offset-4">
          {item.label}
        </span>
        <span aria-hidden="true" className="ml-2 text-[#E5A918]/30">
          ◆
        </span>
      </button>
    ))

  return (
    <div
      className={cn(
        'ed-marquee-wrap relative overflow-hidden border-y border-[#E5A918]/25 bg-[#151412] shadow-[0_6px_20px_rgba(15,13,10,0.14)]',
        className
      )}
    >
      <div
        className={cn(
          'flex w-max items-center',
          !prefersReduced && 'ed-marquee-track'
        )}
      >
        <div className="flex shrink-0 items-center">{renderGroup('a')}</div>
        {!prefersReduced && (
          <div aria-hidden="true" className="flex shrink-0 items-center">
            {renderGroup('b')}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
 * 5. EditorialSpotlightCarousel
 * 黑曜石绒面 × 金箔高定聚光展台：
 * 融合 Stripe Press 3D 浮空画册脊边 + 随作品切换的浓烈画廊灯光幕布
 *   + Landing Love 两侧露边聚光卡 + FinalLap 编号胶片号签（#01 – #06）
 * ============================================================================ */

const SPOTLIGHT_AMBIENTS = [
  'rgba(217, 56, 30, 0.28)',
  'rgba(229, 169, 24, 0.26)',
  'rgba(25, 133, 123, 0.28)',
  'rgba(156, 46, 68, 0.28)',
  'rgba(196, 114, 34, 0.28)',
  'rgba(120, 92, 58, 0.26)',
] as const

const SPOTLIGHT_CARD_VARIANTS = {
  enter: (dir: 1 | -1) => ({ opacity: 0, x: dir * 60, scale: 0.9, rotate: dir * 3 }),
  center: { opacity: 1, x: 0, scale: 1, rotate: 0 },
  exit: (dir: 1 | -1) => ({ opacity: 0, x: dir * -60, scale: 0.9, rotate: dir * -3 }),
}

export function EditorialSpotlightCarousel({
  items,
  onOpenDetail,
  onRemix,
  onToggleLike,
}: {
  items: GalleryItemDTO[]
  onOpenDetail: (item: GalleryItemDTO) => void
  onRemix: (item: GalleryItemDTO) => void
  onToggleLike: (item: GalleryItemDTO) => void
}) {
  const featured = items.slice(0, 6)
  const [rawIdx, setRawIdx] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const glareRef = useRef<HTMLSpanElement | null>(null)

  if (featured.length < 2) return null

  const activeIdx = rawIdx % featured.length
  const current = featured[activeIdx]
  const prevIdx = (activeIdx - 1 + featured.length) % featured.length
  const nextIdx = (activeIdx + 1) % featured.length
  const prevItem = featured[prevIdx]
  const nextItem = featured[nextIdx]
  const ambientColor = SPOTLIGHT_AMBIENTS[activeIdx % SPOTLIGHT_AMBIENTS.length]

  const goTo = (targetIdx: number, dir: 1 | -1) => {
    setDirection(dir)
    setRawIdx((targetIdx + featured.length) % featured.length)
  }

  const handleCardMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el || e.pointerType !== 'mouse') return
    if (prefersReducedMotionNow()) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    el.style.transform = `perspective(900px) rotateX(${(-ny * 7).toFixed(2)}deg) rotateY(${(nx * 8.5).toFixed(2)}deg)`
    if (glareRef.current) {
      glareRef.current.style.transform = `translate3d(${(nx * 24).toFixed(1)}%, ${(ny * 20).toFixed(1)}%, 0)`
    }
  }

  const resetCardMove = () => {
    const el = cardRef.current
    if (!el) return
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)'
    if (glareRef.current) {
      glareRef.current.style.transform = 'translate3d(0%, 0%, 0)'
    }
  }

  return (
    <section className="ks-obsidian-stage relative overflow-hidden rounded-[24px] p-5 text-[#F6F2EA] sm:p-7">
      {/* 顶部微米金箔高光细线 */}
      <span aria-hidden="true" className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1.5px]" />

      {/* 柔和径向影棚顶光幕布（零 96px 重模糊滤镜开销） */}
      <motion.div
        aria-hidden="true"
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: MOTION_EASE_OUT }}
        style={{
          background: `radial-gradient(ellipse 68% 60% at 35% 0%, ${ambientColor} 0%, transparent 72%)`,
        }}
        className="pointer-events-none absolute inset-0"
      />

      {/* 顶部栏：金箔眉标 + FinalLap 阳极氧化编号 Lot 条 (#01 - #06) */}
      <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-xs tracking-wider text-[#E5A918]">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#D9381E]" />
          <span>SPOTLIGHT ATELIER · 馆藏精选展台</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] p-0.5 backdrop-blur-md">
            {featured.map((f, i) => {
              const isAct = i === activeIdx
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => goTo(i, i >= activeIdx ? 1 : -1)}
                  className={cn(
                    'relative h-6.5 cursor-pointer rounded-full px-2.5 font-mono text-xs tabular-nums transition-colors',
                    isAct ? 'font-bold text-white' : 'text-[#C8C0B2] hover:text-white'
                  )}
                >
                  {isAct && (
                    <motion.span
                      layoutId="spotlight-lot-pill"
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                      className="pointer-events-none absolute inset-0 rounded-full bg-[#D9381E]"
                    />
                  )}
                  <span className="relative z-10">#{String(i + 1).padStart(2, '0')}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            aria-label="上一件精选"
            onClick={() => goTo(prevIdx, -1)}
            className="flex size-7.5 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-white transition hover:border-[#E5A918]/60 hover:bg-white/[0.14] active:scale-95"
          >
            <ArrowLeftIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="下一件精选"
            onClick={() => goTo(nextIdx, 1)}
            className="flex size-7.5 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-white transition hover:border-[#E5A918]/60 hover:bg-white/[0.14] active:scale-95"
          >
            <ArrowRightIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 主体：左 3D 立体画册展台（含露边邻居 + 金箔脊边） + 右编辑部衬线大号策展导读 */}
      <div className="relative z-10 grid grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="relative flex h-[310px] items-center justify-center sm:h-[372px]">
          {/* 左侧露边卡 */}
          <motion.button
            key={`prev-${prevItem.id}`}
            type="button"
            aria-label={`切换到：${prevItem.title || '上一件精选'}`}
            onClick={() => goTo(prevIdx, -1)}
            whileHover={{ x: -8, scale: 1.04, opacity: 0.9 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="absolute left-0 hidden h-[226px] w-[158px] -rotate-6 cursor-pointer overflow-hidden rounded-[14px] border border-white/15 bg-[#1F1D1A] p-1.5 opacity-55 shadow-[0_20px_40px_rgba(0,0,0,0.6)] sm:block lg:left-3"
          >
            <img
              src={prevItem.thumbUrl || prevItem.imageUrl}
              alt={prevItem.title || '上一件精选'}
              className="size-full rounded-[9px] object-cover"
            />
          </motion.button>

          {/* 右侧露边卡 */}
          <motion.button
            key={`next-${nextItem.id}`}
            type="button"
            aria-label={`切换到：${nextItem.title || '下一件精选'}`}
            onClick={() => goTo(nextIdx, 1)}
            whileHover={{ x: 8, scale: 1.04, opacity: 0.9 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="absolute right-0 hidden h-[226px] w-[158px] rotate-6 cursor-pointer overflow-hidden rounded-[14px] border border-white/15 bg-[#1F1D1A] p-1.5 opacity-55 shadow-[0_20px_40px_rgba(0,0,0,0.6)] sm:block lg:right-3"
          >
            <img
              src={nextItem.thumbUrl || nextItem.imageUrl}
              alt={nextItem.title || '下一件精选'}
              className="size-full rounded-[9px] object-cover"
            />
          </motion.button>

          {/* 中央 3D 浮空精装画册主展框（通过 custom={direction} 保证切向反转时退场方向同步） */}
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={current.id}
              custom={direction}
              variants={SPOTLIGHT_CARD_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="relative z-10 h-[298px] w-[230px] sm:h-[354px] sm:w-[272px]"
            >
              {/* Stripe Press 式精装书页厚边叠影 */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-2 -right-2 bottom-2 w-3 rounded-r-xl border border-[#E5A918]/30 bg-gradient-to-r from-[#2D2923] via-[#EDE6D6] to-[#C8BEA8] opacity-85 shadow-lg"
              />
              <div
                ref={cardRef}
                onPointerMove={handleCardMove}
                onPointerLeave={resetCardMove}
                onClick={() => onOpenDetail(current)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenDetail(current)
                  }
                }}
                style={{
                  transform: 'perspective(900px) rotateX(0deg) rotateY(0deg)',
                }}
                className="group relative size-full cursor-pointer overflow-hidden rounded-[16px] border border-[#E5A918]/40 bg-[#1D1B18] p-2 shadow-[0_30px_70px_rgba(0,0,0,0.72)] transition-transform duration-150 ease-[var(--ease-out)]"
              >
                <div className="relative size-full overflow-hidden rounded-[10px] bg-black">
                  <img
                    src={current.thumbUrl || current.imageUrl}
                    alt={current.title || '精选作品'}
                    decoding="async"
                    className="size-full object-cover transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-[1.035]"
                  />
                  {/* 指针金箔反光扫光（独立合成层 translate3d，无父级 CSS 变量重算） */}
                  <span
                    ref={glareRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1/4 opacity-0 transition-[transform,opacity] duration-200 ease-[var(--ease-out)] group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(240px circle at 50% 45%, rgba(245,196,67,0.28), transparent 65%)',
                    }}
                  />
                  <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-full border border-[#E5A918]/40 bg-black/75 px-2.5 py-0.5 font-mono text-xs font-bold text-[#F5C443] backdrop-blur-md">
                    VOL.{String(activeIdx + 1).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 右侧：金箔衬线大号水印 + 策展文字 + 漆面朱砂主按钮 */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`meta-${current.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: MOTION_EASE_OUT } }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.14, ease: MOTION_EASE_OUT } }}
            className="relative flex flex-col gap-4 text-left"
          >
            {/* 衬线体巨型金箔水印编号（纯装饰内联 SVG，避免低对比度文本告警与字阶污染） */}
            <svg
              aria-hidden="true"
              viewBox="0 0 140 100"
              className="pointer-events-none absolute -top-8 right-0 h-24 w-32 select-none sm:h-28 sm:w-36"
            >
              <text
                x="136"
                y="84"
                textAnchor="end"
                fill="#E5A918"
                fillOpacity="0.11"
                fontFamily="var(--font-serif-editorial)"
                fontSize="88"
                fontWeight="700"
              >
                {String(activeIdx + 1).padStart(2, '0')}
              </text>
            </svg>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#C8C0B2]">
              <span className="rounded-full border border-[#E5A918]/40 bg-[#E5A918]/15 px-3 py-0.5 font-mono font-semibold text-[#F5C443]">
                {current.category || '精选'}
              </span>
              {current.aspectRatio && (
                <span className="font-mono text-[#E8E2D5]/80">{current.aspectRatio}</span>
              )}
              <span className="opacity-45">·</span>
              <span className="text-[#E8E2D5]/85">
                {current.xAuthorHandle ? `@${current.xAuthorHandle}` : current.authorName}
              </span>
            </div>

            <h2 className="ed-headline-tight line-clamp-2 text-2xl font-bold text-white sm:text-3xl">
              {current.title || '编辑部精选提示词作品'}
            </h2>

            {(current.promptZh || current.promptText) && (
              <p className="line-clamp-3 rounded-xl border border-white/12 bg-black/40 px-4 py-3 font-mono text-xs leading-relaxed text-[#DDD6C8]">
                {current.promptZh || current.promptText}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onRemix(current)}
                className="group skin-accent-btn relative inline-flex h-10.5 cursor-pointer items-center gap-2 overflow-hidden rounded-full py-1 pr-1.5 pl-4 text-xs font-bold transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                <span
                  aria-hidden="true"
                  className="ks-cta-glint pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
                <SparklesIcon className="relative z-10 size-3.5 shrink-0" />
                <KineticRollText text="一键做同款" className="relative z-10" />
                <span className="relative z-10 flex size-7.5 items-center justify-center rounded-full bg-white/20 text-white transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  <ArrowUpRightIcon className="size-3.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenDetail(current)}
                className="group inline-flex h-10.5 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-4 text-xs font-semibold text-white transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918]/55 hover:bg-white/[0.12] active:scale-[0.97]"
              >
                <KineticRollText text="细看提示词" />
              </button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onToggleLike(current)}
                className={cn(
                  'inline-flex h-10.5 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 font-mono text-xs font-semibold tabular-nums transition-colors',
                  current.likedByMe
                    ? 'border-[#D9381E]/60 bg-[#D9381E]/25 text-[#FF8A75]'
                    : 'border-white/15 bg-white/[0.06] text-[#DDD6C8] hover:border-white/35 hover:text-white'
                )}
              >
                <HeartIcon className={cn('size-3.5', current.likedByMe && 'fill-current')} />
                <span>{current.likeCount}</span>
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
