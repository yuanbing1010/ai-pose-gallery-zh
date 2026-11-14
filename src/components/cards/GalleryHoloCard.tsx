import type { CSSProperties, ReactNode } from 'react'
import { CheckIcon, PlusIcon, RotateCwIcon } from 'lucide-react'
import TiltedCard from '@/components/cards/TiltedCard'
import type { CardAccent } from '@/lib/cardAccents'
import { cn } from '@/lib/utils'

const PARALLAX_TITLE_STYLE = {
  '--tc-depth': 8,
  transform:
    'translate3d(calc(var(--tc-px, 0) * var(--tc-depth, 0) * 1px), calc(var(--tc-py, 0) * var(--tc-depth, 0) * 1px), 0)',
} as CSSProperties

export interface GalleryHoloCardProps {
  title: string
  index?: number
  picked: boolean
  flipped: boolean
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
  accent,
  onFlipToggle,
  onPickToggle,
  onOpenViewer,
  flipAriaLabel = '翻转查看背面',
  media,
  backMedia,
  backExtra,
}: GalleryHoloCardProps) {
  return (
    <div
      style={{ '--enter-index': index } as CSSProperties}
      className={cn('md-tile-enter break-inside-avoid transition-transform duration-300', accent.tilt)}
    >
      <TiltedCard
        containerWidth="100%"
        containerHeight="auto"
        imageWidth="100%"
        imageHeight="auto"
        altText={title}
        radius={20}
        rotateAmplitude={12}
        scaleOnHover={1.03}
        glare={0.45}
        shadow={0.32}
        parallax={1.1}
        flipped={flipped}
        flipOnClick={false}
        intro={false}
        className={cn(
          'rounded-[20px] border border-border bg-card shadow-[0_6px_20px_rgba(10,10,10,0.05)] dark:shadow-none',
          picked && 'border-foreground ring-2 ring-foreground'
        )}
        backContent={
          <div className="flex h-full w-full flex-col justify-between bg-card p-3.5 text-foreground">
            <div className="flex items-center justify-end">
              <button
                type="button"
                aria-label="翻回正面"
                onClick={(e) => {
                  e.stopPropagation()
                  onFlipToggle()
                }}
                className="rounded-full border border-border bg-muted p-1.5 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <RotateCwIcon className="size-3.5" />
              </button>
            </div>

            <div className="my-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
              {backMedia}
            </div>

            {backExtra && <div className="mb-2">{backExtra}</div>}

            <div className="space-y-1.5">
              <div className="truncate text-center text-xs font-semibold">{title}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPickToggle()
                }}
                className={cn(
                  'w-full rounded-full py-1.5 text-xs font-semibold transition-colors',
                  picked
                    ? 'bg-[#19857B] text-white'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                )}
              >
                {picked ? '✓ 已锁入' : '+ 锁入配方'}
              </button>
            </div>
          </div>
        }
      >
        <div className={cn('flex flex-col bg-card', flipped && 'pointer-events-none')}>
          <div onClick={onOpenViewer} className="relative w-full cursor-zoom-in overflow-hidden">
            {media}

            <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-1.5">
              <button
                type="button"
                aria-label={flipAriaLabel}
                title={flipAriaLabel}
                onClick={(e) => {
                  e.stopPropagation()
                  onFlipToggle()
                }}
                className="md-pill pointer-events-auto flex size-7 items-center justify-center rounded-full transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <RotateCwIcon className="size-3.5" />
              </button>

              <button
                type="button"
                aria-label={picked ? '从配方移除' : '加入角色配方'}
                title={picked ? '已锁入配方（点击移除）' : '加入角色配方'}
                onClick={(e) => {
                  e.stopPropagation()
                  onPickToggle()
                }}
                className={cn(
                  'pointer-events-auto flex size-7 items-center justify-center rounded-full shadow-sm transition-all',
                  picked
                    ? 'bg-primary text-primary-foreground ring-2 ring-background'
                    : 'md-pill hover:bg-primary hover:text-primary-foreground'
                )}
              >
                {picked ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
              </button>
            </div>
          </div>

          {/* 卡底洁净中文铭牌（亮暗自适应） */}
          <div
            onClick={onOpenViewer}
            className="relative cursor-zoom-in overflow-hidden border-t border-border bg-card px-3 py-2.5"
          >
            <div style={PARALLAX_TITLE_STYLE} className="relative flex items-center gap-2">
              <span className={cn('h-3.5 w-1 shrink-0 rounded-full', accent.dot)} />
              <span className="line-clamp-1 text-xs font-semibold tracking-tight text-foreground">
                {title}
              </span>
            </div>
          </div>
        </div>
      </TiltedCard>
    </div>
  )
}
