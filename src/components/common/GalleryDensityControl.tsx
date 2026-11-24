import { motion } from 'motion/react'
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
        'hidden h-9 shrink-0 items-center rounded-full border border-border/70 bg-card/80 p-0.5 lg:inline-flex',
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
              'relative h-full cursor-pointer rounded-full px-2.5 font-mono text-xs font-medium transition-colors',
              active
                ? 'text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId="gallery-density-pill"
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="absolute inset-0 rounded-full bg-foreground"
              />
            )}
            <span className="relative z-10">{cols}列</span>
          </button>
        )
      })}
    </div>
  )
}
