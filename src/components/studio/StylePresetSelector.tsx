import { useState } from 'react'
import { CheckIcon, DicesIcon } from 'lucide-react'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import { STYLE_PRESETS } from '@/services/aiGenerator'

export function StylePresetSelector({
  value,
  onChange,
  onHoverChange,
}: {
  value: string
  onChange: (presetKey: string) => void
  onHoverChange?: (presetKey: string | null) => void
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const keys = Object.keys(STYLE_PRESETS)
  const effectiveValue = value in STYLE_PRESETS ? value : 'realistic'
  const displayKey = hoveredKey ?? effectiveValue
  const activePreset = STYLE_PRESETS[displayKey] ?? STYLE_PRESETS.realistic
  const activeMeta = getStyleVisualMeta(displayKey)

  const setHover = (key: string | null) => {
    setHoveredKey(key)
    onHoverChange?.(key)
  }

  const pickRandomStyle = () => {
    const candidates = keys.filter((k) => k !== effectiveValue)
    if (!candidates.length) return
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    onChange(next)
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">2. 成图画风</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {keys.length}
          </span>
        </div>
        <div
          data-style-caption
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 py-0.5 text-xs dark:bg-muted/50"
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

      {/* 13 种画风 + 1 枚随机盲盒卡（中屏 5 列 / 宽屏 7×2 完整矩阵） */}
      <div
        role="radiogroup"
        aria-label="成图画风选择"
        onMouseLeave={() => setHover(null)}
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 xl:grid-cols-7"
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
              onMouseEnter={() => setHover(key)}
              onFocus={() => setHover(key)}
              onBlur={() => setHover(null)}
              className={cn(
                'group relative aspect-[4/3] w-full overflow-hidden rounded-xl border text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.97] xl:aspect-square',
                selected
                  ? 'z-10 border-[#D9381E] ring-2 ring-[#D9381E] ring-offset-1 ring-offset-card shadow-sm'
                  : 'border-border/80 bg-[#FAF8F4] hover:z-10 hover:scale-[1.04] hover:border-foreground/50 dark:bg-muted/35'
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
                className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent"
              />
              <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate text-center text-xs font-semibold leading-tight text-white drop-shadow-xs">
                {meta.shortLabel}
              </span>

              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-[#D9381E] text-white shadow-sm"
                >
                  <CheckIcon className="size-2.5 stroke-[3]" />
                </span>
              )}
            </button>
          )
        })}

        {/* 第 14 格：随机画风盲盒键 */}
        <button
          type="button"
          onClick={pickRandomStyle}
          aria-label="随机切换一种画风"
          className="ks-recess group relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/90 p-1 text-center text-muted-foreground transition-all duration-150 hover:border-[#E5A918]/80 hover:text-foreground active:scale-[0.97] xl:aspect-square"
        >
          <DicesIcon className="size-5 text-[#B88300] transition-transform duration-300 group-hover:rotate-45 dark:text-[#E5A918]" />
          <span className="text-xs font-semibold leading-tight">随机画风</span>
        </button>
      </div>
    </div>
  )
}
