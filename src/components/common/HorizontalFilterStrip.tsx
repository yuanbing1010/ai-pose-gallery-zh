import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HorizontalFilterStripProps {
  children: ReactNode
  className?: string
}

/**
 * 带有左右溢出渐变遮罩与便捷步进箭头的横向筛选胶囊带，
 * 避免隐藏滚动条后右侧未显示分类被静默裁切。
 */
export function HorizontalFilterStrip({ children, className }: HorizontalFilterStripProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const syncOverflow = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 4) {
      setCanLeft(false)
      setCanRight(false)
      return
    }
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < maxScroll - 4)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const rafId = window.requestAnimationFrame(syncOverflow)
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncOverflow) : null
    observer?.observe(el)
    return () => {
      window.cancelAnimationFrame(rafId)
      observer?.disconnect()
    }
  }, [children, syncOverflow])

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const step = Math.max(160, Math.round(el.clientWidth * 0.55))
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        ref={scrollerRef}
        onScroll={syncOverflow}
        className={cn(
          'no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5',
          canLeft && 'pl-7',
          canRight && 'pr-7'
        )}
      >
        {children}
      </div>

      {canLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-background via-background/85 to-transparent pr-3 pb-0.5">
          <button
            type="button"
            aria-label="向左查看分类"
            onClick={() => scrollByDir(-1)}
            className="pointer-events-auto inline-flex size-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
        </div>
      )}

      {canRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-background via-background/85 to-transparent pb-0.5 pl-3">
          <button
            type="button"
            aria-label="向右查看更多分类"
            onClick={() => scrollByDir(1)}
            className="pointer-events-auto inline-flex size-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
          >
            <ChevronRightIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
