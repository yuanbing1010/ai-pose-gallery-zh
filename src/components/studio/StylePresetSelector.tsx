import { useState } from 'react'
import { motion } from 'motion/react'
import {
  ChevronRightIcon,
  DicesIcon,
  LayersIcon,
  RotateCcwIcon,
  WandSparklesIcon,
} from 'lucide-react'
import {
  getStyleTaxonomyTree,
  getStyleVisualMeta,
  getVisualStylePresets,
} from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import { NONE_STYLE_PRESET, resolveStyleInfo } from '../../../shared/studio'

export function StylePresetSelector({
  value,
  onChange,
  onOpenBrowser,
}: {
  value: string
  onChange: (presetKey: string) => void
  onOpenBrowser: (initialCategoryId?: string) => void
}) {
  const { platform } = useStudio()
  const [diceSpin, setDiceSpin] = useState(0)

  const visualStyles = getVisualStylePresets(platform)
  const taxonomy = getStyleTaxonomyTree(platform)
  const isNone = value === 'none' || !visualStyles.some((s) => s.key === value)
  const effectiveKey = isNone ? 'none' : value
  const activeVisual = visualStyles.find((s) => s.key === effectiveKey) ?? null
  const resolved = resolveStyleInfo(effectiveKey, platform)
  const noneMeta = getStyleVisualMeta('none')

  const previewImg = activeVisual?.preview
  const title = activeVisual?.label || NONE_STYLE_PRESET.label
  const tagline = activeVisual?.tagline || noneMeta.tagline
  const categoryBadge =
    !isNone && resolved.categoryLabel && resolved.subcategoryLabel
      ? `${resolved.categoryLabel} · ${resolved.subcategoryLabel}`
      : '默认直出'

  const pickRandomStyle = () => {
    const candidates = visualStyles.map((s) => s.key).filter((k) => k !== effectiveKey)
    const pool = candidates.length > 0 ? candidates : visualStyles.map((s) => s.key)
    if (!pool.length) return
    setDiceSpin((s) => s + 1)
    onChange(pool[Math.floor(Math.random() * pool.length)])
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">
            成图画风
          </span>
          <button
            type="button"
            onClick={pickRandomStyle}
            disabled={visualStyles.length === 0}
            title="随机画风"
            aria-label="随机切换一种画风"
            className="inline-flex h-5.5 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-[#E5A918]/70 hover:text-foreground active:scale-95 disabled:opacity-40 dark:bg-muted/40"
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
            <button
              type="button"
              onClick={() => onChange('none')}
              title="恢复为无预设（跟随参考图）"
              className="inline-flex h-5.5 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground active:scale-95 dark:bg-muted/40"
            >
              <RotateCcwIcon className="size-2.5" />
              <span>跟随原图</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenBrowser('all')}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:border-foreground/45 active:scale-95 dark:bg-muted/40"
        >
          <LayersIcon className="size-3" />
          <span>全部画风图鉴 ({visualStyles.length})</span>
        </button>
      </div>

      {/* 当前已选画风主卡带：点击打开聚焦画风图鉴弹窗 */}
      <button
        type="button"
        onClick={() => onOpenBrowser('all')}
        aria-label={`当前画风：${title}，点击打开大类与小类筛选图鉴`}
        className="ks-paper-keycap group relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-border/80 bg-card p-1.5 text-left transition-all hover:border-foreground/45 active:scale-[0.99]"
      >
        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-muted/30">
          {previewImg ? (
            <img
              src={previewImg}
              alt={title}
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center border border-dashed border-border/70 bg-muted/20">
              <WandSparklesIcon className="size-4 text-[#D9381E]" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none',
                isNone
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-[#D9381E]/10 text-[#B82914] dark:bg-[#D9381E]/20 dark:text-[#FF7A59]'
              )}
            >
              {categoryBadge}
            </span>
            <span className="truncate text-xs font-extrabold text-foreground sm:text-[13px]">
              {title}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{tagline}</p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-[#FAF8F4] px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:border-foreground/35 group-hover:text-foreground dark:bg-muted/40">
          <span>更换画风</span>
          <ChevronRightIcon className="size-3.5" />
        </span>
      </button>

      {/* 一级大类快捷直达栏：一点直接按该大类打开小类与画风筛选弹窗 */}
      {taxonomy.length > 0 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">按大类：</span>
          {taxonomy.map((cat) => {
            const belongsHere = !isNone && activeVisual?.categoryId === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onOpenBrowser(cat.id)}
                className={cn(
                  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors active:scale-95',
                  belongsHere
                    ? 'border-[#D9381E]/55 bg-[#D9381E]/10 font-bold text-[#B82914] dark:text-[#FF7A59]'
                    : 'border-border/80 bg-[#FAF8F4] font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground dark:bg-muted/35'
                )}
              >
                <span>{cat.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{cat.count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
