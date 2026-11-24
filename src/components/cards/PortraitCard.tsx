import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { CheckIcon, FlameIcon, ImageOffIcon, PlusIcon } from 'lucide-react'
import { getPortraitAccent } from '@/lib/cardAccents'
import { referenceImageUrl } from '@/lib/recipeImages'
import { playInkStamp } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import type { PortraitItem } from '@/types/gallery'

export interface PortraitCardProps {
  item: PortraitItem
  index?: number
  picked: boolean
  eager?: boolean
  onTogglePick: () => void
  onOpenViewer: () => void
}

export function PortraitCard({
  item,
  index = 0,
  picked,
  eager = false,
  onTogglePick,
  onOpenViewer,
}: PortraitCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const foilRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const [imgError, setImgError] = useState(false)
  const accent = getPortraitAccent(item.分区, item.发长, item.热门, index)

  const handleTogglePick = (e: MouseEvent) => {
    e.stopPropagation()
    playInkStamp()
    onTogglePick()
  }

  const handlePointerEnter = () => {
    const el = cardRef.current
    if (el) rectRef.current = el.getBoundingClientRect()
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el || e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = rectRef.current ?? el.getBoundingClientRect()
    rectRef.current = rect
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width)
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height)
    const rx = (0.5 - ny) * 8
    const ry = (nx - 0.5) * 9.5
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
    <figure
      style={{ '--enter-index': index } as CSSProperties}
      className="md-tile-enter group select-none transition-transform duration-150 active:scale-[0.985]"
    >
      <div
        ref={cardRef}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-[14px] border bg-card transition-[transform,border-color] duration-220 ease-[var(--ease-out)] group-hover:shadow-[0_14px_30px_rgba(10,10,10,0.09)] dark:group-hover:shadow-[0_16px_36px_rgba(0,0,0,0.65)]',
          picked
            ? 'border-[#D9381E] ring-2 ring-[#D9381E]/35'
            : 'border-border/90 group-hover:border-foreground/30'
        )}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted/35">
          <button
            type="button"
            aria-label={`查看人像详情：${item.发型名称} #${item.id}`}
            onClick={onOpenViewer}
            className="relative block size-full cursor-zoom-in overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-inset"
          >
            {imgError ? (
              <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted/60 px-3 text-center text-xs text-muted-foreground">
                <ImageOffIcon className="size-5 opacity-60" />
                <span>人像加载失败</span>
              </div>
            ) : (
              <img
                src={referenceImageUrl(item.缩略图)}
                alt={item.标题}
                loading={eager ? 'eager' : 'lazy'}
                fetchPriority={eager ? 'high' : undefined}
                decoding="async"
                onError={() => setImgError(true)}
                className="block size-full object-cover transition-transform duration-220 ease-[var(--ease-out)] group-hover:scale-[1.03] motion-reduce:transform-none"
              />
            )}
          </button>

          <div
            ref={foilRef}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-1/4 inset-y-0 z-[2] opacity-0 mix-blend-soft-light transition-opacity duration-220 group-hover:opacity-55 dark:mix-blend-screen dark:group-hover:opacity-35"
            style={{
              background:
                'linear-gradient(125deg, transparent 22%, rgba(229,169,24,0.2) 40%, rgba(255,250,240,0.3) 50%, rgba(217,56,30,0.1) 64%, transparent 88%)',
            }}
          />

          <button
            type="button"
            title={picked ? '已在角色配方中（点击移除）' : '锁入角色配方'}
            aria-label={picked ? '从配方移除' : '锁入角色配方'}
            aria-pressed={picked}
            onClick={handleTogglePick}
            className={cn(
              'absolute top-1 right-1 z-[4] flex size-11 cursor-pointer items-center justify-center rounded-full transition-[transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-90 sm:top-2.5 sm:right-2.5 sm:size-7.5',
              picked
                ? 'opacity-100'
                : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
            )}
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-full shadow-sm transition-colors sm:size-7.5',
                picked
                  ? 'bg-[#C42F16] text-white ring-2 ring-background'
                  : 'md-pill hover:bg-primary hover:text-primary-foreground'
              )}
            >
              <motion.span
                key={picked ? 'checked' : 'plus'}
                initial={false}
                animate={picked ? { scale: [0.65, 1.22, 1] } : { scale: 1 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="inline-flex items-center justify-center"
              >
                {picked ? <CheckIcon className="size-3.5 stroke-[2.5]" /> : <PlusIcon className="size-3.5" />}
              </motion.span>
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenViewer}
          className="w-full cursor-zoom-in border-t border-border/80 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/35"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('size-1.5 shrink-0 rounded-full', picked ? 'bg-[#D9381E]' : accent.dot)} />
              <span className="line-clamp-1 text-xs font-medium tracking-tight text-foreground">
                {item.发型名称}
              </span>
            </div>
            {picked ? (
              <span className="shrink-0 font-mono text-xs font-semibold text-[#C42F16] dark:text-[#FF7A63]">已选</span>
            ) : item.热门 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-xs font-semibold text-[#855B00] dark:text-[#E5A918]">
                <FlameIcon className="size-3" />
                <span>热门</span>
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </figure>
  )
}
