import { useEffect, useEffectEvent, useRef } from 'react'
import { SparklesIcon } from 'lucide-react'

interface InfiniteScrollSentinelProps {
  shown: number
  total: number
  unitLabel: string
  onLoadMore: () => void
}

/**
 * 基于 IntersectionObserver 的无感瀑布流增量加载哨兵，
 * 同时提供清晰的浏览进度条与手动点击兜底按钮。
 */
export function InfiniteScrollSentinel({
  shown,
  total,
  unitLabel,
  onLoadMore,
}: InfiniteScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const triggerLoadMore = useEffectEvent(onLoadMore)

  const hasMore = shown < total
  const progress =
    total > 0 ? Math.min(100, Math.round((Math.min(shown, total) / total) * 100)) : 100

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          triggerLoadMore()
        }
      },
      { rootMargin: '520px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, shown])

  if (total === 0) return null

  return (
    <div ref={sentinelRef} className="flex flex-col items-center gap-3 pt-4">
      <div className="flex w-full max-w-xs items-center gap-2.5 text-xs text-muted-foreground">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/80">
          <div
            className="h-full w-full origin-left rounded-full bg-foreground/75 transition-transform duration-200 ease-[var(--ease-out)]"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
        <span className="shrink-0 font-mono tabular-nums">
          {Math.min(shown, total).toLocaleString('zh-CN')} / {total.toLocaleString('zh-CN')}{' '}
          {unitLabel}
        </span>
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="ks-paper-keycap inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-6 text-xs font-medium text-foreground transition-[transform,background-color] duration-150 hover:bg-muted active:scale-[0.98]"
        >
          <SparklesIcon className="size-3.5 text-[#E5A918]" />
          <span>
            加载更多（剩余 {(total - shown).toLocaleString('zh-CN')} {unitLabel}）
          </span>
        </button>
      )}
    </div>
  )
}
