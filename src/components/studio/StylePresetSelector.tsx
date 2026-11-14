import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import { STYLE_PRESETS } from '@/services/aiGenerator'

export function StylePresetSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (presetKey: string) => void
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const effectiveValue = value in STYLE_PRESETS ? value : 'realistic'
  const displayKey = hoveredKey ?? effectiveValue
  const activePreset = STYLE_PRESETS[displayKey] ?? STYLE_PRESETS.realistic
  const activeMeta = getStyleVisualMeta(displayKey)

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold select-none">成图画风</span>
        <div
          aria-live="polite"
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 py-1 text-xs dark:bg-muted/50"
        >
          <span className="shrink-0 font-semibold text-foreground">{activePreset.label}</span>
          {activeMeta.tagline && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="truncate text-muted-foreground">{activeMeta.tagline}</span>
            </>
          )}
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="成图画风选择"
        onMouseLeave={() => setHoveredKey(null)}
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        {Object.entries(STYLE_PRESETS).map(([key, info]) => {
          const meta = getStyleVisualMeta(key)
          const selected = effectiveValue === key

          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${info.label}：${meta.tagline}`}
              onClick={() => onChange(key)}
              onMouseEnter={() => setHoveredKey(key)}
              onFocus={() => setHoveredKey(key)}
              onBlur={() => setHoveredKey(null)}
              className={cn(
                'group relative aspect-square w-full overflow-hidden rounded-xl border text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]',
                selected
                  ? 'border-[#D9381E] ring-2 ring-[#D9381E]/85 ring-offset-2 ring-offset-card shadow-sm'
                  : 'border-border/80 bg-[#FAF8F4] hover:border-foreground/40 dark:bg-muted/35'
              )}
            >
              {meta.preview && (
                <img
                  src={meta.preview}
                  alt={info.label}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/82 via-black/45 to-transparent"
              />
              <span className="pointer-events-none absolute inset-x-2 bottom-1.5 truncate text-xs font-semibold leading-tight text-white drop-shadow-xs">
                {meta.shortLabel}
              </span>

              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-[#D9381E] text-white shadow-sm"
                >
                  <CheckIcon className="size-3 stroke-[3]" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
