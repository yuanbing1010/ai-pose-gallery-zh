import { memo, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  DicesIcon,
  LayersIcon,
  RotateCcwIcon,
  SparklesIcon,
} from 'lucide-react'
import { StyleOrbitCarousel } from '@/components/studio/Style3DShowcase'
import { getVisualStylePresets } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import { NONE_STYLE_PRESET, resolveStyleInfo } from '../../../shared/studio'

export const StylePresetSelector = memo(function StylePresetSelector({
  value,
  allowFaceStyleShift,
  onChange,
  onAllowFaceStyleShiftChange,
  onOpenBrowser,
}: {
  value: string
  allowFaceStyleShift: boolean
  onChange: (presetKey: string) => void
  onAllowFaceStyleShiftChange: (val: boolean) => void
  onOpenBrowser: (initialCategoryId?: string) => void
}) {
  const { platform } = useStudio()
  const [diceSpin, setDiceSpin] = useState(0)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const visualStyles = useMemo(() => getVisualStylePresets(platform), [platform])
  const isNone = value === 'none' || !visualStyles.some((s) => s.key === value)
  const effectiveKey = isNone ? 'none' : value
  const activeVisual = visualStyles.find((s) => s.key === effectiveKey) ?? null
  const resolved = resolveStyleInfo(effectiveKey, platform)
  const hoveredVisual = hoveredKey ? visualStyles.find((s) => s.key === hoveredKey) ?? null : null

  const title = activeVisual?.label || NONE_STYLE_PRESET.label
  const categoryBadge =
    !isNone && resolved.categoryLabel && resolved.subcategoryLabel
      ? `${resolved.categoryLabel} · ${resolved.subcategoryLabel}`
      : '默认直出'

  const displayVisual = hoveredVisual ?? activeVisual
  const displayKey = hoveredVisual ? `hover-${hoveredVisual.key}` : effectiveKey
  const displayTitle = hoveredVisual ? hoveredVisual.label : title
  const displayCategory = hoveredVisual
    ? `${hoveredVisual.categoryLabel} · ${hoveredVisual.subcategoryLabel}`
    : categoryBadge
  const displayTagline = (displayVisual?.tagline || resolved.tagline || '').trim()
  const displayDetail = displayTagline
    ? `${displayCategory} · ${displayTagline}`
    : displayCategory

  const pickRandomStyle = () => {
    const candidates = visualStyles.map((s) => s.key).filter((k) => k !== effectiveKey)
    const pool = candidates.length > 0 ? candidates : visualStyles.map((s) => s.key)
    if (!pool.length) return
    setDiceSpin((s) => s + 1)
    onChange(pool[Math.floor(Math.random() * pool.length)])
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 @[480px]/controls:flex-nowrap">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">
            成图画风
          </span>
          <button
            type="button"
            onClick={() => onOpenBrowser('all')}
            title="打开全部画风图鉴"
            className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground active:scale-95 dark:bg-muted/40"
          >
            <LayersIcon className="size-3 text-[#D9381E]" />
            <span>更换画风</span>
          </button>

          <button
            type="button"
            onClick={pickRandomStyle}
            disabled={visualStyles.length === 0}
            title="随机画风"
            aria-label="随机切换一种画风"
            className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-[#E5A918]/70 hover:text-foreground active:scale-95 disabled:opacity-40 dark:bg-muted/40"
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

          {!isNone && (
            <>
              <button
                type="button"
                aria-pressed={allowFaceStyleShift}
                onClick={() => onAllowFaceStyleShiftChange(!allowFaceStyleShift)}
                title={
                  allowFaceStyleShift
                    ? '已开启「跟随画风」：允许人物脸部和服装为当前画风做出调整（点击恢复默认锁定）'
                    : '默认按参考图锁定长相与服装；点击开启「跟随画风」，让脸部和服装适配所选画风'
                }
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs transition-all active:scale-95',
                  allowFaceStyleShift
                    ? 'border-[#D9381E] bg-[#D9381E] font-bold text-white shadow-[0_0_12px_-1px_rgba(217,56,30,0.68)] ring-1 ring-[#FF7A59]/50 hover:bg-[#C23018]'
                    : 'border-border/80 bg-[#FAF8F4] font-medium text-muted-foreground hover:border-foreground/45 hover:text-foreground dark:bg-muted/40'
                )}
              >
                <SparklesIcon className={cn('size-3', allowFaceStyleShift ? 'text-white' : 'opacity-70')} />
                <span>跟随画风</span>
              </button>

              <button
                type="button"
                onClick={() => onChange('none')}
                title="清除已选画风，恢复无预设画风"
                className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground active:scale-95 dark:bg-muted/40"
              >
                <RotateCcwIcon className="size-2.5" />
                <span>清除画风</span>
              </button>
            </>
          )}
        </div>

        <motion.div
          key={displayKey}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14 }}
          data-style-caption="true"
          title={`${displayTitle} · ${displayDetail}`}
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 py-0.5 text-xs dark:bg-muted/50"
        >
          <span className="max-w-[10rem] shrink-0 truncate font-semibold text-foreground">
            {displayTitle}
          </span>
          <span className="shrink-0 text-muted-foreground/50">·</span>
          <span className="truncate text-muted-foreground">{displayDetail}</span>
        </motion.div>
      </div>

      {/* 持续循环转动的 3D 透视画风卡牌轮盘 */}
      <StyleOrbitCarousel
        items={visualStyles}
        value={effectiveKey}
        onSelect={onChange}
        onHoverChange={setHoveredKey}
      />
    </div>
  )
})
