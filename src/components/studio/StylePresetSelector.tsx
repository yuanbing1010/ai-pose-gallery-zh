import { memo, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  ChevronDownIcon,
  DicesIcon,
  LayersIcon,
  LockIcon,
  LockOpenIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { StyleOrbitCarousel } from '@/components/studio/Style3DShowcase'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getVisualStylePresets } from '@/lib/stylePresets'
import { playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { useStudioShallow } from '@/store/studioStore'
import { NONE_STYLE_PRESET, resolveStyleInfo } from '../../../shared/studio'

export const StylePresetSelector = memo(function StylePresetSelector({
  value,
  allowFaceStyleShift,
  allowPoseStyleShift,
  onChange,
  onAllowFaceStyleShiftChange,
  onAllowPoseStyleShiftChange,
  onOpenBrowser,
  collapsible = false,
  enabled = true,
  onEnabledChange,
  showReferenceLocks = true,
}: {
  value: string
  allowFaceStyleShift: boolean
  allowPoseStyleShift: boolean
  onChange: (presetKey: string) => void
  onAllowFaceStyleShiftChange: (val: boolean) => void
  onAllowPoseStyleShiftChange: (val: boolean) => void
  onOpenBrowser: (initialCategoryId?: string) => void
  collapsible?: boolean
  enabled?: boolean
  onEnabledChange?: (val: boolean) => void
  showReferenceLocks?: boolean
}) {
  const { platform } = useStudioShallow((s) => ({ platform: s.platform }))
  const [diceSpin, setDiceSpin] = useState(0)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const isExpanded = !collapsible || enabled
  const visualStyles = useMemo(() => getVisualStylePresets(platform), [platform])
  const isNone = value === 'none' || !visualStyles.some((s) => s.key === value)
  const effectiveKey = isNone ? 'none' : value
  const activeVisual = visualStyles.find((s) => s.key === effectiveKey) ?? null
  const faceLocked = !allowFaceStyleShift
  const poseLocked = !allowPoseStyleShift
  const resolved = resolveStyleInfo(effectiveKey, platform)
  const hoveredVisual = hoveredKey ? visualStyles.find((s) => s.key === hoveredKey) ?? null : null

  const title = activeVisual?.label || NONE_STYLE_PRESET.label
  const categoryBadge =
    !isNone && resolved.categoryLabel && resolved.subcategoryLabel
      ? `${resolved.categoryLabel} · ${resolved.subcategoryLabel}`
      : collapsible
        ? '点选下方画风生效'
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

  const handleToggleEnabled = (next: boolean) => {
    playMechanicalSwitch(next ? 1.06 : 0.94)
    if (!next) setHoveredKey(null)
    onEnabledChange?.(next)
  }

  const pickRandomStyle = () => {
    const candidates = visualStyles.map((s) => s.key).filter((k) => k !== effectiveKey)
    const pool = candidates.length > 0 ? candidates : visualStyles.map((s) => s.key)
    if (!pool.length) return
    setDiceSpin((s) => s + 1)
    onChange(pool[Math.floor(Math.random() * pool.length)])
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 @[620px]/controls:flex-nowrap">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">
            风格
          </span>

          {collapsible && (
            <Switch
              size="sm"
              checked={isExpanded}
              onCheckedChange={handleToggleEnabled}
              aria-label={isExpanded ? '关闭风格预设并折叠' : '启用风格预设并展开'}
            />
          )}

          {isExpanded && (
            <>
              <button
                type="button"
                onClick={() => onOpenBrowser('all')}
                title="更换风格（打开全部风格图鉴）"
                aria-label="更换风格（打开全部风格图鉴）"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-border/80 bg-secondary/55 px-2.5 text-xs font-medium text-muted-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/40 hover:text-foreground active:scale-[0.97] sm:h-6.5 sm:px-2 dark:bg-muted/40"
              >
                <LayersIcon className="size-3 text-[var(--skin-accent)]" />
                <span>更换</span>
              </button>

              <button
                type="button"
                onClick={pickRandomStyle}
                disabled={visualStyles.length === 0}
                title="盲选：随机切换一种风格"
                aria-label="随机切换一种风格"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-border/80 bg-secondary/55 px-2.5 text-xs font-medium text-muted-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918]/70 hover:text-foreground active:scale-[0.97] disabled:opacity-40 sm:h-6.5 sm:px-2 dark:bg-muted/40"
              >
                <motion.span
                  key={diceSpin}
                  animate={{ rotate: diceSpin ? 360 : 0 }}
                  transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
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
                    onClick={() => onChange('none')}
                    title="清除已选风格，恢复无预设风格"
                    aria-label="清除已选风格，恢复无预设风格"
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-border/80 bg-secondary/55 px-2.5 text-xs font-medium text-muted-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/40 hover:text-foreground active:scale-[0.97] sm:h-6.5 sm:px-2 dark:bg-muted/40"
                  >
                    <RotateCcwIcon className="size-2.5" />
                    <span>清除</span>
                  </button>

                  {showReferenceLocks && (
                    <>
                      <span aria-hidden="true" className="mx-0.5 h-3.5 w-px shrink-0 bg-border/80" />

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-pressed={faceLocked}
                            onClick={() => onAllowFaceStyleShiftChange(!allowFaceStyleShift)}
                            aria-label={
                              faceLocked
                                ? '已锁定外貌，点击解锁以允许随风格调整'
                                : '已解锁外貌，点击锁定参考图外貌'
                            }
                            className={cn(
                              'inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] sm:h-6.5',
                              faceLocked
                                ? 'border-[#C42F16] bg-[#C42F16] font-bold text-white shadow-xs hover:bg-[#B22812]'
                                : 'border-border/80 bg-secondary/55 font-medium text-muted-foreground hover:border-foreground/45 hover:text-foreground dark:bg-muted/40'
                            )}
                          >
                            {faceLocked ? (
                              <LockIcon className="size-3 shrink-0 text-white" />
                            ) : (
                              <LockOpenIcon className="size-3 shrink-0 opacity-70" />
                            )}
                            <span>锁定外貌</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                          {faceLocked
                            ? '已锁定「外貌」：严格按人像与服装参考图还原（点击解锁，允许长相和服装随当前风格调整）'
                            : '已解锁「外貌」：允许人物长相、肤色和服装细节随当前风格调整（点击重新锁定原图）'}
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-pressed={poseLocked}
                            onClick={() => onAllowPoseStyleShiftChange(!allowPoseStyleShift)}
                            aria-label={
                              poseLocked
                                ? '已锁定姿势，点击解锁以允许随风格微调'
                                : '已解锁姿势，点击锁定参考图姿势'
                            }
                            className={cn(
                              'inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] sm:h-6.5',
                              poseLocked
                                ? 'border-[#116E65] bg-[#116E65] font-bold text-white shadow-xs hover:bg-[#0E5C54]'
                                : 'border-border/80 bg-secondary/55 font-medium text-muted-foreground hover:border-foreground/45 hover:text-foreground dark:bg-muted/40'
                            )}
                          >
                            {poseLocked ? (
                              <LockIcon className="size-3 shrink-0 text-white" />
                            ) : (
                              <LockOpenIcon className="size-3 shrink-0 opacity-70" />
                            )}
                            <span>锁定姿势</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                          {poseLocked
                            ? '已锁定「姿势」：严格按姿势图动作与机位生成（点击解锁，允许动作与机位配合当前风格微调）'
                            : '已解锁「姿势」：保留核心动态，允许微调动作与机位配合自拍、监控等风格（点击重新锁定姿势）'}
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {!isExpanded ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => handleToggleEnabled(true)}
            title="点击启用并展开画风预设"
            className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-full border border-border/80 bg-secondary/45 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground dark:bg-muted/40"
          >
            <span className="truncate">未启用 · 按提示词直出</span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-75" />
          </button>
        ) : (
          <motion.div
            key={displayKey}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            data-style-caption="true"
            title={`${displayTitle} · ${displayDetail}`}
            className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-secondary/55 px-2.5 py-0.5 text-xs dark:bg-muted/50"
          >
            <span className="max-w-[10rem] shrink-0 truncate font-semibold text-foreground">
              {displayTitle}
            </span>
            <span className="shrink-0 text-muted-foreground/50">·</span>
            <span className="truncate text-muted-foreground">{displayDetail}</span>
          </motion.div>
        )}
      </div>

      {/* 持续循环转动的 3D 透视画风卡牌轮盘（文生图关闭风格时平滑折叠） */}
      {collapsible ? (
        <div
          data-open={isExpanded ? 'true' : 'false'}
          aria-hidden={!isExpanded}
          className="ks-accordion-grid"
        >
          <div className="ks-accordion-inner">
            {isExpanded && (
              <div className="pt-0.5">
                <StyleOrbitCarousel
                  items={visualStyles}
                  value={effectiveKey}
                  onSelect={onChange}
                  onHoverChange={setHoveredKey}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <StyleOrbitCarousel
          items={visualStyles}
          value={effectiveKey}
          onSelect={onChange}
          onHoverChange={setHoveredKey}
        />
      )}
    </div>
  )
})
