import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowUpRightIcon,
  DicesIcon,
  HeartIcon,
  SparklesIcon,
} from 'lucide-react'
import { KineticRollText } from '@/components/motion/SignatureBlocks'
import { MOTION_EASE_OUT, prefersReducedMotionNow } from '@/lib/motionTokens'
import {
  INSPIRATION_CAMERA,
  INSPIRATION_LIGHTING,
  INSPIRATION_SUBJECTS,
  rollAnalogInspirationPrompt,
} from '@/lib/studioPromptChips'
import {
  playBrassDialTick,
  playCameraShutter,
  playDrumRollAndChime,
  playInkStamp,
  playMechanicalSwitch,
  playPolaroidEject,
} from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import type { GalleryItemDTO } from '@/types/gallery'

/* ============================================================================
 * 1. MechanicalCameraShutter
 * 拟物 8 叶片徕卡金属快门光圈：
 * 当 triggerTick 递增时，8 片深黑金属光圈叶片瞬间向心旋合再弹开，
 * 伴随真实合成机械快门声 + 极克制的暗房显影闪光。
 * ============================================================================ */

const SHUTTER_BLADES = Array.from({ length: 8 }, (_, i) => i * 45)

export function MechanicalCameraShutter({
  triggerTick,
  className,
}: {
  triggerTick: number
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  const [phase, setPhase] = useState<'idle' | 'closed'>('idle')
  const prevTickRef = useRef(triggerTick)

  useEffect(() => {
    if (triggerTick <= prevTickRef.current) return
    prevTickRef.current = triggerTick
    playCameraShutter()
    if (prefersReduced) return

    const openTimer = window.setTimeout(() => setPhase('closed'), 0)
    const releaseTimer = window.setTimeout(() => setPhase('idle'), 210)
    return () => {
      window.clearTimeout(openTimer)
      window.clearTimeout(releaseTimer)
    }
  }, [triggerTick, prefersReduced])

  if (prefersReduced) return null

  return (
    <AnimatePresence>
      {phase === 'closed' && (
        <motion.div
          key={`shutter-${triggerTick}`}
          aria-hidden="true"
          initial={{ opacity: 0.95 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: MOTION_EASE_OUT }}
          className={cn(
            'pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[inherit]',
            className
          )}
        >
          <svg viewBox="0 0 200 200" className="h-[155%] w-[155%] shrink-0">
            <g transform="translate(100 100)">
              {SHUTTER_BLADES.map((angle) => (
                <motion.path
                  key={angle}
                  d="M 0 0 L 125 -22 L 125 65 Z"
                  fill="#151412"
                  stroke="rgba(229,169,24,0.42)"
                  strokeWidth="1.2"
                  initial={{ rotate: angle - 34, scale: 1.15 }}
                  animate={{ rotate: angle, scale: 1 }}
                  exit={{ rotate: angle - 42, scale: 1.25, opacity: 0 }}
                  transition={{ duration: 0.18, ease: MOTION_EASE_OUT }}
                />
              ))}
            </g>
          </svg>
          {/* 中心一闪而过的快门闪光 */}
          <motion.span
            initial={{ opacity: 0.65, scale: 0.4 }}
            animate={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.26, ease: 'easeOut' }}
            className="absolute size-24 rounded-full bg-[#FFF7E2]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ============================================================================
 * 2. AnalogInspirationSlotDrum
 * 拟物黄铜机械滚轮 + 可下拉物理弹力球拉杆：
 * 下拉或点击黄铜球拉杆，三组机械翻牌滚轮逐一翻滚落定（主体 × 光影 × 镜头氛围），
 * 伴随棘轮滴答与黄铜铃音，自动组装高质量中/英文文生图提示词！
 * ============================================================================ */

export function AnalogInspirationSlotDrum({
  onRollPrompt,
  compact = false,
  className,
}: {
  onRollPrompt: (composedPrompt: string, summary: string) => void
  compact?: boolean
  className?: string
}) {
  const [indices, setIndices] = useState<[number, number, number]>([0, 0, 0])
  const [spinTick, setSpinTick] = useState(0)
  const [leverPulled, setLeverPulled] = useState(false)
  const dragTriggeredRef = useRef(false)

  const handlePull = () => {
    playDrumRollAndChime()
    setLeverPulled(true)
    window.setTimeout(() => setLeverPulled(false), 380)

    const next = rollAnalogInspirationPrompt(indices)
    setIndices(next.indices)
    setSpinTick((t) => t + 1)
    onRollPrompt(next.prompt, next.summary)
  }

  const slots = [
    { code: '01 主体', text: INSPIRATION_SUBJECTS[indices[0]].label, delay: 0 },
    { code: '02 光影', text: INSPIRATION_LIGHTING[indices[1]].label, delay: 0.08 },
    { code: '03 质感', text: INSPIRATION_CAMERA[indices[2]].label, delay: 0.16 },
  ]

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 text-[#F5F1E8]',
        className
      )}
    >
      {/* 三枚实体翻牌滚轮视窗（无嵌套外卡边框，以凹槽内阴影表现机械仪表盘） */}
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 rounded-xl bg-black/45 p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
        {slots.map((slot, idx) => (
          <div
            key={slot.code}
            className={cn(
              'relative overflow-hidden rounded-lg bg-gradient-to-b from-[#0E0D0C] via-[#1B1916] to-[#0E0D0C] px-2 text-center ring-1 ring-white/[0.08]',
              compact ? 'py-1.5' : 'py-2'
            )}
          >
            {/* 机械翻牌中缝细线 */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[1px] bg-black/55"
            />
            <div className="font-mono text-xs text-[#E5A918]/75">{slot.code}</div>
            <div className="relative mt-0.5 h-5 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={`${idx}-${spinTick}-${slot.text}`}
                  initial={{ y: -22, opacity: 0, rotateX: 55 }}
                  animate={{ y: 0, opacity: 1, rotateX: 0 }}
                  exit={{ y: 22, opacity: 0, rotateX: -55 }}
                  transition={{
                    type: 'spring',
                    stiffness: 360,
                    damping: 22,
                    delay: slot.delay,
                  }}
                  className="truncate text-xs font-bold text-white"
                >
                  {slot.text}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* 可点击 / 可下拉的拟物黄铜弹力球拉杆（touch-none 防滚屏冲突 + 防拖拽松手二次触发 onClick） */}
      <motion.button
        type="button"
        onClick={() => {
          if (dragTriggeredRef.current) {
            dragTriggeredRef.current = false
            return
          }
          handlePull()
        }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 18 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.y > 8) {
            dragTriggeredRef.current = true
            handlePull()
            window.setTimeout(() => {
              dragTriggeredRef.current = false
            }, 120)
          }
        }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.94, y: 4 }}
        animate={{ y: leverPulled ? 6 : 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 20 }}
        title="点击或下拉黄铜拉杆，随机摇出一条完整文生图灵感"
        aria-label="下拉灵感滚轮随机生成提示词"
        className="group relative flex shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-1 rounded-xl border border-[#E5A918]/45 bg-gradient-to-b from-[#2B251B] to-[#17140F] px-3 py-2 text-xs font-bold text-[#F5C443] shadow-[inset_0_1px_0_rgba(255,236,180,0.28),0_4px_12px_rgba(0,0,0,0.45)] active:cursor-grabbing"
      >
        <span className="relative flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-[#FDE68A] via-[#E5A918] to-[#9A6700] text-[#151412] shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
          <DicesIcon className={cn('size-3', leverPulled && 'animate-spin motion-reduce:animate-none')} />
        </span>
        <span className="whitespace-nowrap">拉杆摇词</span>
      </motion.button>
    </div>
  )
}

/* ============================================================================
 * 3. MechanicalRockerSwitch
 * Teenage Engineering / Leica 风格拟物阳极氧化金属实体拨动开关：
 * 带真实凹槽轨道、凸起磨砂键帽、LED 状态指示灯珠与机械咔哒音效。
 * ============================================================================ */

export function MechanicalRockerSwitch<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  layoutId = 'mech-rocker',
  className,
}: {
  options: Array<{ id: T; label: string; icon?: ReactNode; ledColor?: string }>
  value: T
  onChange: (next: T) => void
  ariaLabel: string
  layoutId?: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/90 bg-[#E6E1D6] p-1 shadow-[inset_0_2px_5px_rgba(20,16,10,0.14)] dark:bg-[#151412] dark:shadow-[inset_0_2px_6px_rgba(0,0,0,0.75)]',
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.id
        const led = opt.ledColor || '#D9381E'
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) {
                playMechanicalSwitch(opt.id === options[0].id ? 0.96 : 1.08)
                onChange(opt.id)
              }
            }}
            className={cn(
              'relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors',
              active
                ? 'text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                className="pointer-events-none absolute inset-0 rounded-full border border-white/15 bg-gradient-to-b from-[#2A2825] to-[#141311] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_3px_8px_rgba(0,0,0,0.28)] dark:border-[#E5A918]/40 dark:from-[#34302A] dark:to-[#22201C] dark:shadow-[inset_0_1px_0_rgba(245,196,67,0.22),0_3px_10px_rgba(0,0,0,0.48)]"
              />
            )}
            <span
              aria-hidden="true"
              className="relative z-10 size-1.5 rounded-full transition-[transform,background-color,opacity] duration-150"
              style={{
                backgroundColor: active ? led : 'rgba(128,128,128,0.35)',
                boxShadow: active ? `0 0 8px ${led}` : 'none',
              }}
            />
            {opt.icon && <span className="relative z-10 inline-flex">{opt.icon}</span>}
            <span className="relative z-10">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ============================================================================
 * 4. PolaroidEjectShowcase
 * 拟物金属拍立得吐片取景器（落地首页画廊入口）：
 * 点击黄铜吐片按钮，金属出片口发出马达声并缓缓吐出下一张公共画廊作品相纸，
 * 相纸从暗部显影化学态渐变为清晰彩色，并支持指针 3D 悬停微倾与一键做同款！
 * ============================================================================ */

export function PolaroidEjectShowcase({
  items,
  onRemix,
  onOpenGallery,
}: {
  items: GalleryItemDTO[]
  onRemix: (item: GalleryItemDTO) => void
  onOpenGallery: () => void
}) {
  const prefersReduced = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const [ejectCount, setEjectCount] = useState(0)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const current = items.length > 0 ? items[idx % items.length] : null

  const handleEjectNext = () => {
    if (items.length === 0) {
      onOpenGallery()
      return
    }
    playPolaroidEject()
    setIdx((prev) => (prev + 1) % items.length)
    setEjectCount((c) => c + 1)
  }

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el || e.pointerType !== 'mouse' || prefersReducedMotionNow()) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    el.style.transform = `perspective(800px) rotateX(${(-ny * 7).toFixed(2)}deg) rotateY(${(nx * 8).toFixed(2)}deg)`
  }

  const resetMove = () => {
    const el = cardRef.current
    if (!el) return
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg)'
  }

  return (
    <div className="dark ks-obsidian-stage relative flex flex-col justify-between overflow-hidden rounded-[22px] p-4 text-[#F6F2EA]">
      <span aria-hidden="true" className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1.5px]" />

      {/* 顶栏：机器铭牌 + 实体黄铜吐片按钮 */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="font-mono text-xs font-semibold tracking-wider text-[#E5A918]">01 · POLAROID GALLERY</div>
          <h3 className="text-base font-bold text-white">灵感画廊 · 拍立得取片机</h3>
        </div>
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleEjectNext}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[#E5A918]/50 bg-gradient-to-b from-[#E5A918] to-[#B88300] px-3 text-xs font-extrabold text-[#151412] shadow-[0_4px_14px_rgba(229,169,24,0.35)]"
        >
          <SparklesIcon className="size-3.5" />
          <span>{items.length > 0 ? '吐一张灵感' : '逛画廊'}</span>
        </motion.button>
      </div>

      {/* 拟物金属出片槽 + 缓吐显影拍立得相纸 */}
      <div className="relative my-4 flex flex-col items-center">
        {/* 金属出片口狭缝 */}
        <div className="relative z-20 h-3 w-[86%] rounded-full border border-white/15 bg-[#090807] shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)]">
          <span className="absolute inset-x-4 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-black" />
        </div>

        {/* 吐出的拍立得实体相纸 */}
        <div className="relative -mt-1.5 flex h-[238px] w-full items-start justify-center overflow-hidden pt-1">
          {current ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${current.id}-${ejectCount}`}
                initial={{ y: -175, opacity: 0.9, rotate: -2 }}
                animate={{ y: 0, opacity: 1, rotate: ejectCount % 2 === 0 ? -1.5 : 1.5 }}
                exit={{ y: 60, opacity: 0, scale: 0.92 }}
                transition={{
                  type: 'spring',
                  stiffness: 170,
                  damping: 20,
                  mass: 1.1,
                }}
                className="w-[186px]"
              >
                <div
                  ref={cardRef}
                  onPointerMove={handleMove}
                  onPointerLeave={resetMove}
                  style={{
                    transform: 'perspective(800px) rotateX(0deg) rotateY(0deg)',
                  }}
                  className="rounded-[10px] border border-black/15 bg-[#FAF8F2] p-2 pb-3 text-[#151412] shadow-[0_18px_36px_rgba(0,0,0,0.55)] transition-transform duration-150 ease-[var(--ease-out)]"
                >
                  <div className="relative aspect-[4/4.2] w-full overflow-hidden rounded-[6px] bg-[#141311]">
                    {/* 相纸化学显影动画：从暗棕模糊逐渐显影为高清全彩（降噪模式下跳过滤镜动画） */}
                    <motion.img
                      src={current.thumbUrl || current.imageUrl}
                      alt={current.title || '画廊灵感'}
                      initial={
                        prefersReduced
                          ? { opacity: 0 }
                          : { filter: 'brightness(0.22) sepia(0.75) blur(7px)' }
                      }
                      animate={
                        prefersReduced
                          ? { opacity: 1 }
                          : { filter: 'brightness(1) sepia(0) blur(0px)' }
                      }
                      transition={{
                        duration: prefersReduced ? 0.16 : 1.0,
                        ease: [0.23, 1, 0.32, 1],
                      }}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1.5 px-0.5">
                    <span className="truncate text-xs font-bold text-[#151412]">
                      {current.title || '精选提示词'}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-xs text-[#D9381E]">
                      <HeartIcon className="size-3 fill-current" />
                      {current.likeCount}
                    </span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="mt-4 flex h-[196px] w-[186px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[#E5A918]/35 bg-white/[0.04] p-4 text-center">
              <SparklesIcon className="size-6 text-[#E5A918]" />
              <span className="text-xs font-medium text-[#D6CEC0]">
                精选 X 提示词与社区画廊，支持点赞收藏与一键同款
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 底栏操作 */}
      <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={onOpenGallery}
          className="group inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#EAE4D7] hover:text-[#F5C443]"
        >
          <KineticRollText text="进入灵感画廊" />
          <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>

        {current && (
          <button
            type="button"
            onClick={() => onRemix(current)}
            className="group skin-accent-btn inline-flex h-7.5 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-bold active:scale-[0.97]"
          >
            <KineticRollText text="做同款" />
            <ArrowUpRightIcon className="size-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
 * 5. VermilionHankoStamp
 * 物理朱砂篆刻落印动效层：
 * 当 stampTick 递增时，一枚高质感朱砂印章从空中大力盖下并伴随轻微回弹与木质落印音效，
 * 停留约 1.15 秒后淡出，适合「已入配方」「已复制」「已珍藏」等高光反馈。
 * ============================================================================ */

export function VermilionHankoStamp({
  stampTick,
  label = '已入配方',
  sublabel = 'CASTDECK',
  playSound = true,
  className,
}: {
  stampTick: number
  label?: string
  sublabel?: string
  playSound?: boolean
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const prevTickRef = useRef(stampTick)

  useEffect(() => {
    if (stampTick <= prevTickRef.current) return
    prevTickRef.current = stampTick
    if (playSound) playInkStamp()
    const showTimer = window.setTimeout(() => setVisible(true), 0)
    const hideTimer = window.setTimeout(() => setVisible(false), 1150)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [stampTick, playSound])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`hanko-${stampTick}`}
          aria-hidden="true"
          initial={
            prefersReduced
              ? { opacity: 0 }
              : { opacity: 0, scale: 1.95, rotate: -24, y: -18 }
          }
          animate={
            prefersReduced
              ? { opacity: 1 }
              : { opacity: 1, scale: 1, rotate: -11, y: 0 }
          }
          exit={
            prefersReduced
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.94, transition: { duration: 0.25 } }
          }
          transition={{ type: 'spring', stiffness: 480, damping: 22, mass: 0.85 }}
          className={cn(
            'pointer-events-none absolute z-30 flex flex-col items-center justify-center rounded-xl border-[3px] border-[#D9381E] bg-[#FAF6EE]/92 px-3.5 py-2 text-[#D9381E] shadow-[0_10px_28px_rgba(217,56,30,0.32)] backdrop-blur-[2px] dark:bg-[#1B1412]/92',
            className
          )}
        >
          <span className="border-b border-[#D9381E]/45 pb-0.5 font-mono text-xs font-bold tracking-[0.22em]">
            {sublabel}
          </span>
          <span className="font-editorial-serif pt-0.5 text-lg font-bold tracking-[0.14em]">
            {label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ============================================================================
 * 6. OpticalSplitCurtain
 * 拟物光学暗房光幕扫描对比器（如「白模原图 ⇄ 3D 深度骨骼图」）：
 * 拖动实体黄铜滚花游标左右扫过，实时以物理剪裁幕布对比两层影像，
 * 每跨越 10% 刻度自动发出轻微徕卡黄铜棘轮咔哒声。
 * ============================================================================ */

export function OpticalSplitCurtain({
  leftSrc,
  rightSrc,
  leftLabel = '3D 深度骨骼',
  rightLabel = '高清白模原图',
  title = '光学深度扫描对比',
  countLabel = '1,439 ORIGINAL POSES',
  onShuffle,
  viewportClassName,
  className,
}: {
  leftSrc: string
  rightSrc: string
  leftLabel?: string
  rightLabel?: string
  title?: string
  countLabel?: string
  onShuffle?: () => void
  viewportClassName?: string
  className?: string
}) {
  const [percent, setPercent] = useState(50)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const clipLayerRef = useRef<HTMLDivElement | null>(null)
  const dividerTrackRef = useRef<HTMLDivElement | null>(null)
  const readoutRef = useRef<HTMLSpanElement | null>(null)
  const livePercentRef = useRef(50)
  const draggingRef = useRef(false)
  const lastBucketRef = useRef(5)

  const applyVisualPercent = (clamped: number, commitState = false) => {
    livePercentRef.current = clamped
    const bucket = Math.floor(clamped / 10)
    if (bucket !== lastBucketRef.current) {
      lastBucketRef.current = bucket
      playBrassDialTick()
    }
    if (clipLayerRef.current) {
      clipLayerRef.current.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`
    }
    if (dividerTrackRef.current) {
      dividerTrackRef.current.style.transform = `translate3d(${clamped}%, 0, 0)`
    }
    if (readoutRef.current) {
      readoutRef.current.textContent = `DEPTH ${clamped}%`
    }
    if (commitState) {
      setPercent(clamped)
    }
  }

  const updateFromClientX = (clientX: number, commitState = false) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width) return
    const raw = ((clientX - rect.left) / rect.width) * 100
    const clamped = Math.min(94, Math.max(6, Math.round(raw)))
    applyVisualPercent(clamped, commitState)
  }

  const activePointerIdRef = useRef<number | null>(null)
  const commitDragEnd = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    activePointerIdRef.current = null
    setPercent(livePercentRef.current)
  }

  return (
    <div
      className={cn(
        'ks-obsidian-stage dark relative overflow-hidden rounded-[22px] border border-[#E5A918]/28 p-3.5 text-[#F5F1E8]',
        className
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 font-mono text-xs">
          <span className="size-1.5 shrink-0 rounded-full bg-[#D9381E]" />
          <span className="hidden shrink-0 font-bold tracking-wider text-[#F5C443] sm:inline">DEPTH SCANNER</span>
          <span className="truncate text-[#EAE4D7] sm:text-[#C8C0B2]">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span ref={readoutRef} className="font-mono text-xs tabular-nums text-[#E5A918]">
            DEPTH {percent}%
          </span>
          {onShuffle && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                playMechanicalSwitch(1.06)
                onShuffle()
              }}
              className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full border border-[#E5A918]/40 bg-[#E5A918]/12 px-3 font-mono text-xs font-bold text-[#F5C443] transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918] hover:bg-[#E5A918]/22 sm:h-7 sm:px-2.5"
            >
              <DicesIcon className="size-3" />
              <span>换标本</span>
            </motion.button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label={`白模与深度图光学对比滑块${title ? `：${title}` : ''}`}
        aria-valuemin={6}
        aria-valuemax={94}
        aria-valuenow={percent}
        aria-valuetext={`深度图占比 ${percent}%`}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return
          if (draggingRef.current) return
          activePointerIdRef.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          draggingRef.current = true
          updateFromClientX(e.clientX, false)
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current || activePointerIdRef.current !== e.pointerId) return
          updateFromClientX(e.clientX, false)
        }}
        onPointerUp={(e) => {
          if (activePointerIdRef.current === e.pointerId) commitDragEnd()
        }}
        onPointerCancel={(e) => {
          if (activePointerIdRef.current === e.pointerId) commitDragEnd()
        }}
        onLostPointerCapture={commitDragEnd}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 5
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            applyVisualPercent(Math.max(6, livePercentRef.current - step), true)
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            applyVisualPercent(Math.min(94, livePercentRef.current + step), true)
          } else if (e.key === 'Home') {
            e.preventDefault()
            applyVisualPercent(6, true)
          } else if (e.key === 'End') {
            e.preventDefault()
            applyVisualPercent(94, true)
          }
        }}
        className={cn(
          'relative h-[200px] w-full cursor-ew-resize touch-pan-y overflow-hidden rounded-2xl border border-white/10 bg-[#0D0C0B] select-none focus-visible:ring-2 focus-visible:ring-[#E5A918] focus-visible:outline-none sm:h-[224px]',
          viewportClassName
        )}
      >
        {/* 暗房放大台径向聚光灯场 + 底层白模原图（首屏 LCP 主图优先拉取） */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(62%_82%_at_50%_50%,rgba(229,169,24,0.12)_0%,rgba(255,248,232,0.04)_44%,transparent_76%)]"
        />
        <img
          src={rightSrc}
          alt={rightLabel}
          fetchPriority="high"
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-contain p-3"
        />

        {/* 上层：左侧深度骨骼图（拖拽期间由 ref 直写 clipPath，零 React 重渲染） */}
        <div
          ref={clipLayerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0A0A0C]"
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
        >
          <img
            src={leftSrc}
            alt={leftLabel}
            decoding="async"
            draggable={false}
            className="size-full object-contain p-3"
          />
        </div>

        {/* 底部光学游标标尺刻度 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 bottom-2 z-10 flex items-end justify-between opacity-45"
        >
          {Array.from({ length: 19 }).map((_, idx) => (
            <span
              key={idx}
              className={cn(
                'w-px bg-[#E5A918]',
                idx === 9 ? 'h-2.5 bg-[#F5C443]' : idx % 3 === 0 ? 'h-2 opacity-80' : 'h-1 opacity-45'
              )}
            />
          ))}
        </div>

        {/* 左右角标 */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-full border border-[#E5A918]/40 bg-black/70 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#F5C443] backdrop-blur-md">
          {leftLabel}
        </span>
        <span className="pointer-events-none absolute top-2.5 right-2.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-0.5 font-mono text-xs font-semibold text-white backdrop-blur-md">
          {rightLabel}
        </span>

        {/* 实体黄铜分割线与滚花拖拽手柄（纯合成层 translate3d，无 left 布局属性重排、无彩色暗底光晕） */}
        <div
          ref={dividerTrackRef}
          aria-hidden="true"
          style={{ transform: `translate3d(${percent}%, 0, 0)` }}
          className="pointer-events-none absolute inset-0 z-20"
        >
          <div className="relative h-full w-0">
            <div className="h-full w-[2px] -translate-x-1/2 bg-gradient-to-b from-[#F5C443] via-[#D9381E] to-[#F5C443]" />
            <div className="absolute top-1/2 left-0 flex h-9 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#FDE68A]/70 bg-gradient-to-b from-[#2B251B] to-[#151412] font-mono text-xs font-bold text-[#F5C443] shadow-[0_6px_18px_rgba(0,0,0,0.65)]">
              ⇄
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-xs text-[#9C9486]">
        <span>左右拖动或方向键微调黄铜游标，实时透视人体深度骨架</span>
        <span>{countLabel}</span>
      </div>
    </div>
  )
}
