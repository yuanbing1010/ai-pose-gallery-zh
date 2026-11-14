import { useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { CheckIcon, LayersIcon, PlusIcon } from 'lucide-react'
import { getCostumeAccent } from '@/lib/cardAccents'
import { referenceImageUrl } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import type { CostumeItem } from '@/types/gallery'

export interface FashionCardProps {
  item: CostumeItem
  index?: number
  aspect?: '2/3' | '3/4'
  picked: boolean
  onTogglePick: () => void
  onOpenViewer: () => void
}

export function FashionCard({
  item,
  index = 0,
  aspect = '2/3',
  picked,
  onTogglePick,
  onOpenViewer,
}: FashionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const isShisei = item.source === 'shisei'
  const viewCount = item.views?.length || 0
  const accent = getCostumeAccent(item.分类, item.一级分类, index)
  const thumbUrl = referenceImageUrl(item.缩略图)
  const isMixedShisei = isShisei && aspect === '2/3'

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el || e.pointerType !== 'mouse') return
    const rect = el.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width)
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height)
    const rx = (0.5 - ny) * 11
    const ry = (nx - 0.5) * 13
    el.style.transitionDuration = '75ms'
    el.style.setProperty('--rx', `${rx.toFixed(2)}deg`)
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`)
    el.style.setProperty('--gx', `${(nx * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(ny * 100).toFixed(1)}%`)
    el.style.setProperty('--foil-pos', `${(nx * 120 - 10).toFixed(1)}%`)
  }

  const handlePointerLeave = () => {
    const el = cardRef.current
    if (!el) return
    el.style.transitionDuration = '360ms'
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--gx', '50%')
    el.style.setProperty('--gy', '35%')
  }

  const handleTogglePick = (e: MouseEvent) => {
    e.stopPropagation()
    onTogglePick()
  }

  return (
    <figure
      style={{ '--enter-index': index } as CSSProperties}
      className="md-tile-enter group select-none transition-transform duration-150 active:scale-[0.985]"
    >
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={
          {
            '--rx': '0deg',
            '--ry': '0deg',
            '--gx': '50%',
            '--gy': '35%',
            '--foil-pos': '50%',
            transform: 'perspective(880px) rotateX(var(--rx)) rotateY(var(--ry))',
          } as CSSProperties
        }
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-[20px] border bg-card shadow-[0_6px_20px_rgba(10,10,10,0.05)] transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:shadow-[0_18px_36px_rgba(10,10,10,0.12)] dark:shadow-none dark:group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.7)]',
          picked ? 'border-foreground ring-2 ring-foreground' : 'border-border group-hover:border-foreground/25'
        )}
      >
        {/* 主画幅区 */}
        <div
          className={cn(
            'relative w-full overflow-hidden',
            aspect === '3/4' ? 'aspect-[3/4]' : 'aspect-[2/3]',
            isMixedShisei ? 'bg-[#E6E6E8]' : 'bg-muted/30'
          )}
        >
          <button
            type="button"
            aria-label={`查看服装详情：${item.服装名称}`}
            onClick={onOpenViewer}
            className="relative block size-full cursor-zoom-in overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-inset"
          >
            <img
              src={thumbUrl}
              alt={item.服装名称}
              loading="lazy"
              decoding="async"
              className={cn(
                'block size-full transition-transform duration-300 ease-out group-hover:scale-[1.03]',
                isMixedShisei ? 'object-contain' : 'object-cover'
              )}
            />
          </button>

          {/* 随光标角度偏移的彩虹全息箔片扫光 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[2] opacity-0 mix-blend-color-dodge transition-opacity duration-300 group-hover:opacity-45 dark:mix-blend-screen dark:group-hover:opacity-65"
            style={{
              background:
                'linear-gradient(125deg, transparent 18%, rgba(255,95,180,0.22) 34%, rgba(78,228,255,0.28) 49%, rgba(255,224,102,0.24) 64%, rgba(154,114,255,0.22) 78%, transparent 90%)',
              backgroundSize: '200% 200%',
              backgroundPosition: 'var(--foil-pos) 50%',
            }}
          />

          {/* 光标点状镜面反射 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[3] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                'radial-gradient(220px circle at var(--gx) var(--gy), rgba(255,255,255,0.2), transparent 70%)',
            }}
          />

          {/* 左下角：多视角微标 */}
          {viewCount > 1 && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-[4]">
              <span className="md-pill inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium">
                <LayersIcon className="size-3" />
                <span>{viewCount} 视角</span>
              </span>
            </div>
          )}

          {/* 右上角：与全站统一的「锁入配方」圆钮 */}
          <button
            type="button"
            title={picked ? '已在角色配方中（点击移除）' : '锁入角色配方'}
            aria-label={picked ? '从配方移除' : '锁入角色配方'}
            aria-pressed={picked}
            onClick={handleTogglePick}
            className={cn(
              'absolute top-2 right-2 z-[4] flex size-7 items-center justify-center rounded-full shadow-sm transition-all duration-150 active:scale-90',
              picked
                ? 'bg-primary text-primary-foreground ring-2 ring-background'
                : 'md-pill opacity-85 hover:bg-primary hover:text-primary-foreground group-hover:opacity-100 group-focus-within:opacity-100'
            )}
          >
            <motion.span
              key={picked ? 'checked' : 'plus'}
              initial={false}
              animate={picked ? { scale: [0.65, 1.22, 1] } : { scale: 1 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center justify-center"
            >
              {picked ? <CheckIcon className="size-3.5 stroke-[2.5]" /> : <PlusIcon className="size-3.5" />}
            </motion.span>
          </button>
        </div>

        {/* 卡底一体铭牌条 */}
        <button
          type="button"
          onClick={onOpenViewer}
          className="w-full cursor-zoom-in border-t border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-2">
            <span className={cn('h-3.5 w-1 shrink-0 rounded-full', accent.dot)} />
            <span className="line-clamp-1 text-xs font-semibold tracking-tight text-foreground">
              {item.服装名称}
            </span>
          </div>
        </button>
      </div>
    </figure>
  )
}
