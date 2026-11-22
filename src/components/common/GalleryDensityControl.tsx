import type { GalleryDesktopCols } from '@/lib/galleryDensity'
import { cn } from '@/lib/utils'

const COLUMN_OPTIONS: readonly GalleryDesktopCols[] = [3, 4, 5]

export function GalleryDensityControl({
  value,
  onChange,
  className,
}: {
  value: GalleryDesktopCols
  onChange: (next: GalleryDesktopCols) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="桌面端网格列数"
      className={cn(
        'hidden h-10 shrink-0 items-center rounded-xl border border-border bg-card p-1 lg:inline-flex',
        className
      )}
    >
      {COLUMN_OPTIONS.map((cols) => {
        const active = value === cols
        return (
          <button
            key={cols}
            type="button"
            aria-pressed={active}
            title={`切换为每行 ${cols} 列`}
            onClick={() => onChange(cols)}
            className={cn(
              'h-full rounded-lg px-2.5 font-mono text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {cols}列
          </button>
        )
      })}
    </div>
  )
}
