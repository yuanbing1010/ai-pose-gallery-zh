import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { CheckIcon, PlusIcon, RotateCwIcon } from 'lucide-react'
import type { CardAccent } from '@/lib/cardAccents'
import { MOTION_EASE_OUT, prefersReducedMotionNow } from '@/lib/motionTokens'
import { playInkStamp, playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'

export interface GalleryHoloCardProps {
  title: string
  index?: number
  picked: boolean
  flipped: boolean
  hideFlip?: boolean
  accent: CardAccent
  onFlipToggle: () => void
  onPickToggle: () => void
  onOpenViewer: () => void
  flipAriaLabel?: string
  media: ReactNode
  backMedia: ReactNode
  backExtra?: ReactNode
}

export function GalleryHoloCard({
  title,
  index = 0,
  picked,
  flipped,
  hideFlip = false,
  accent,
  onFlipToggle,
  onPickToggle,
  onOpenViewer,
  flipAriaLabel = '翻转查看背面',
  media,
  backMedia,
  backExtra,
}: GalleryHoloCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const foilRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<DOMRect | null>(null)

  const handlePointerEnter = () => {
    const el = cardRef.current
    if (el) rectRef.current = el.getBoundingClientRect()
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el || flipped || e.pointerType !== 'mouse' || prefersReducedMotionNow()) return
    const rect = rectRef.current ?? el.getBoundingClientRect()
    rectRef.current = rect
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width)
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height)
    const rx = (0.5 - ny) * 7.5
    const ry = (nx - 0.5) * 9
    el.style.transitionDuration = '75ms'
    el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
    if (foilRef.current) {
      foilRef.current.style.transform = `translate3d(${((nx - 0.5) * 44).toFixed(1)}%, 0, 0)`
    }
  }

  const handlePointerLeave = () => {
    rectRef.current = null
    const el = cardRef.current
    if (!el) return
    el.style.transitionDuration = '240ms'
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)'
    if (foilRef.current) {
      foilRef.current.style.transform = 'translate3d(0%, 0, 0)'
    }
  }

  return (
    <div
      style={{ '--enter-index': index } as CSSProperties}
      className="md-tile-enter group break-inside-avoid select-none transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.985]"
    >
      <div
        ref={cardRef}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ perspective: '900px' }}
        className={cn(
          'relative overflow-hidden rounded-[14px] border bg-card transition-[transform,border-color] duration-220 ease-[var(--ease-out)] group-hover:shadow-[0_14px_30px_rgba(10,10,10,0.09)] dark:group-hover:shadow-[0_16px_36px_rgba(0,0,0,0.65)]',
          picked
            ? 'border-[#D9381E] ring-2 ring-[#D9381E]/35'
            : 'border-border/90 group-hover:border-foreground/30'
        )}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
          className="relative transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
        >
          {/* 正面 */}
          <div
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            className={cn('flex flex-col bg-card', flipped && 'pointer-events-none')}
          >
            <div className="relative w-full overflow-hidden">
              <button
                type="button"
                aria-label={`查看详情：${title}`}
                onClick={onOpenViewer}
                className="block w-full cursor-zoom-in overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-inset"
              >
                {media}
              </button>

              {/* 统一轻量化金箔扫光层（独立 GPU translate3d，无父级继承变量重算） */}
              <div
                ref={foilRef}
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-1/4 inset-y-0 z-[2] opacity-0 mix-blend-soft-light transition-opacity duration-220 group-hover:opacity-50 dark:mix-blend-screen dark:group-hover:opacity-30"
                style={{
                  background:
                    'linear-gradient(125deg, transparent 22%, rgba(229,169,24,0.2) 40%, rgba(255,250,240,0.3) 50%, rgba(217,56,30,0.1) 64%, transparent 88%)',
                }}
              />

              {/* 渐进披露悬浮操作胶囊（高对比暗金底确保在浅白姿势图上清晰可辨） */}
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-1 top-1 z-10 flex items-center gap-1 transition-opacity duration-200 sm:inset-x-2.5 sm:top-2.5 sm:gap-1.5',
                  hideFlip ? 'justify-end' : 'justify-between',
                  picked ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
                )}
              >
                {!hideFlip && (
                  <button
                    type="button"
                    aria-label={flipAriaLabel}
                    title={flipAriaLabel}
                    onClick={(e) => {
                      e.stopPropagation()
                      playMechanicalSwitch(1.06)
                      onFlipToggle()
                    }}
                    className="pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96] sm:size-7.5"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-[#151412]/80 text-white shadow-sm backdrop-blur-md transition-colors hover:bg-[#151412] sm:size-7.5">
                      <RotateCwIcon className="size-3.5" />
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  aria-label={picked ? '从配方移除' : '加入角色配方'}
                  title={picked ? '已锁入配方（点击移除）' : '加入角色配方'}
                  onClick={(e) => {
                    e.stopPropagation()
                    playInkStamp()
                    onPickToggle()
                  }}
                  className="pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96] sm:size-7.5"
                >
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition-colors sm:size-7.5',
                      picked
                        ? 'bg-[#C42F16] text-white ring-2 ring-background'
                        : 'border border-white/15 bg-[#151412]/80 text-white hover:bg-[#C42F16]'
                    )}
                  >
                    <motion.span
                      key={picked ? 'checked' : 'plus'}
                      initial={false}
                      animate={picked ? { scale: [0.65, 1.22, 1] } : { scale: 1 }}
                      transition={{ duration: 0.22, ease: MOTION_EASE_OUT }}
                      className="inline-flex items-center justify-center"
                    >
                      {picked ? <CheckIcon className="size-3.5 stroke-[2.5]" /> : <PlusIcon className="size-3.5" />}
                    </motion.span>
                  </span>
                </button>
              </div>
            </div>

            {/* Minimal Gallery 单基线编辑部画签 */}
            <button
              type="button"
              onClick={onOpenViewer}
              className="relative w-full cursor-zoom-in overflow-hidden border-t border-border/80 bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      picked ? 'bg-[#D9381E]' : accent.dot
                    )}
                  />
                  <span className="line-clamp-1 text-xs font-medium tracking-tight text-foreground">
                    {title}
                  </span>
                </div>
                {picked && (
                  <span className="shrink-0 font-mono text-xs font-semibold text-[#D9381E]">已选</span>
                )}
              </div>
            </button>
          </div>

          {/* 背面（按需翻转展示深度图与锁入操作） */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
            className={cn(
              'absolute inset-0 flex flex-col justify-between bg-card p-3 text-foreground',
              !flipped && 'pointer-events-none'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">[ 背面视图 ]</span>
              <button
                type="button"
                aria-label="翻回正面"
                onClick={(e) => {
                  e.stopPropagation()
                  playMechanicalSwitch(0.96)
                  onFlipToggle()
                }}
                className="cursor-pointer rounded-full border border-border bg-muted p-1.5 text-foreground transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] hover:bg-primary hover:text-primary-foreground active:scale-[0.96]"
              >
                <RotateCwIcon className="size-3.5" />
              </button>
            </div>

            <div className="my-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
              {flipped ? backMedia : null}
            </div>

            {backExtra && <div className="mb-2">{backExtra}</div>}

            <div className="space-y-1.5">
              <div className="truncate text-center text-xs font-semibold">{title}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playInkStamp()
                  onPickToggle()
                }}
                className={cn(
                  'w-full cursor-pointer rounded-full py-1.5 text-xs font-semibold transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
                  picked
                    ? 'bg-[#C42F16] text-white'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                )}
              >
                {picked ? '✓ 已锁入配方' : '+ 锁入配方'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
