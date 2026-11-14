import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, DicesIcon, WandSparklesIcon } from 'lucide-react'
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
  const [diceSpin, setDiceSpin] = useState(0)
  const keys = Object.keys(STYLE_PRESETS)
  const effectiveValue = value in STYLE_PRESETS ? value : 'none'
  const displayKey = hoveredKey ?? effectiveValue
  const activePreset = STYLE_PRESETS[displayKey] ?? STYLE_PRESETS.none
  const activeMeta = getStyleVisualMeta(displayKey)

  const setHover = (key: string | null) => {
    setHoveredKey(key)
    onHoverChange?.(key)
  }

  const pickRandomStyle = () => {
    const candidates = keys.filter((k) => k !== effectiveValue)
    if (!candidates.length) return
    setDiceSpin((s) => s + 1)
    onChange(candidates[Math.floor(Math.random() * candidates.length)])
  }

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">3. 成图画风</span>
          <button
            type="button"
            onClick={pickRandomStyle}
            title="随机画风"
            aria-label="随机切换一种画风"
            className="inline-flex h-5.5 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-[#E5A918]/70 hover:text-foreground active:scale-95 dark:bg-muted/40"
          >
            <motion.span
              key={diceSpin}
              animate={{ rotate: diceSpin ? 360 : 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center"
            >
              <DicesIcon className="size-3 text-[#E5A918]" />
            </motion.span>
            <span>盲选</span>
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={displayKey}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.14 }}
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 1 个跟随原图(默认) + 13 张实景图画风 = 完整 7×2 矩阵（14格零缺角） */}
      <div
        role="radiogroup"
        aria-label="成图画风选择"
        onMouseLeave={() => setHover(null)}
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:gap-2"
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
                'group relative aspect-[16/11] w-full overflow-hidden rounded-xl border text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.97] lg:aspect-[5/6]',
                selected
                  ? 'z-10 border-[#D9381E] ring-2 ring-[#D9381E] ring-offset-1 ring-offset-card shadow-sm'
                  : 'border-border/80 bg-[#FAF8F4] hover:z-10 hover:scale-[1.04] hover:border-foreground/50 dark:bg-muted/35'
              )}
            >
              {meta.preview ? (
                <>
                  <img
                    src={meta.preview}
                    alt={info.label}
                    className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
                  />
                  <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate text-center text-xs font-semibold leading-tight text-white drop-shadow-xs">
                    {meta.shortLabel}
                  </span>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-border/80 bg-muted/30 p-1 text-center">
                  <WandSparklesIcon
                    className={cn(
                      'size-4 transition-colors',
                      selected ? 'text-[#D9381E]' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  <span className="truncate text-xs font-semibold leading-tight text-foreground">
                    {meta.shortLabel}
                  </span>
                </div>
              )}

              {selected && (
                <motion.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                  aria-hidden="true"
                  className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-[#D9381E] text-white shadow-sm"
                >
                  <CheckIcon className="size-2.5 stroke-[3]" />
                </motion.span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
