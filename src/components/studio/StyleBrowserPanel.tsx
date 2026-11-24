import { useId, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  CheckIcon,
  DicesIcon,
  FilterXIcon,
  FolderOpenIcon,
  SearchIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from 'lucide-react'
import {
  getStyleTaxonomyTree,
  getVisualStylePresets,
  type VisualStyleItem,
} from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import { NONE_STYLE_PRESET } from '../../../shared/studio'

export interface StyleBrowserPanelProps {
  value: string
  onChange: (presetKey: string) => void
  onHoverChange?: (presetKey: string | null) => void
  onSelectComplete?: () => void
  initialCategoryId?: string
  gridColsClassName?: string
  className?: string
}

export function StyleBrowserPanel({
  value,
  onChange,
  onHoverChange,
  onSelectComplete,
  initialCategoryId = 'all',
  gridColsClassName = 'grid-cols-2 sm:grid-cols-3',
  className,
}: StyleBrowserPanelProps) {
  const { platform } = useStudio()
  const instanceId = useId()

  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategoryId || 'all')
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [diceSpin, setDiceSpin] = useState(0)

  const visualStyles = useMemo(() => getVisualStylePresets(platform), [platform])
  const taxonomy = useMemo(() => getStyleTaxonomyTree(platform), [platform])

  // 若后台删除了当前筛选中的分类，自动回退到 all
  const activeCategory =
    categoryFilter === 'all' ? null : taxonomy.find((c) => c.id === categoryFilter) ?? null
  const effectiveCategoryId = activeCategory ? activeCategory.id : 'all'

  const allSubcategories = useMemo(
    () =>
      taxonomy.flatMap((cat) =>
        cat.subcategories.map((sub) => ({
          ...sub,
          categoryLabel: cat.label,
        }))
      ),
    [taxonomy]
  )

  const visibleSubcategories = useMemo(() => {
    if (activeCategory) {
      return activeCategory.subcategories.map((sub) => ({
        ...sub,
        categoryLabel: activeCategory.label,
      }))
    }
    return allSubcategories
  }, [activeCategory, allSubcategories])

  const effectiveSubcategoryId =
    subcategoryFilter === 'all'
      ? 'all'
      : visibleSubcategories.some((s) => s.id === subcategoryFilter)
        ? subcategoryFilter
        : 'all'

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredStyles = useMemo(() => {
    return visualStyles.filter((item) => {
      if (effectiveCategoryId !== 'all' && item.categoryId !== effectiveCategoryId) {
        return false
      }
      if (effectiveSubcategoryId !== 'all' && item.subcategoryId !== effectiveSubcategoryId) {
        return false
      }
      if (normalizedQuery) {
        const haystack = [
          item.label,
          item.shortLabel,
          item.tagline,
          item.categoryLabel,
          item.subcategoryLabel,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      return true
    })
  }, [visualStyles, effectiveCategoryId, effectiveSubcategoryId, normalizedQuery])

  const hasActiveFilter =
    effectiveCategoryId !== 'all' || effectiveSubcategoryId !== 'all' || normalizedQuery !== ''

  const groupedSections = useMemo(() => {
    if (hasActiveFilter) return null
    const sections = taxonomy
      .map((cat) => ({
        category: cat,
        items: filteredStyles.filter((s) => s.categoryId === cat.id),
      }))
      .filter((sec) => sec.items.length > 0)
    const knownCatIds = new Set(taxonomy.map((c) => c.id))
    const uncategorized = filteredStyles.filter((s) => !knownCatIds.has(s.categoryId))
    if (uncategorized.length > 0) {
      sections.push({
        category: { id: '__other__', label: '其他画风', count: uncategorized.length, subcategories: [] },
        items: uncategorized,
      })
    }
    return sections
  }, [filteredStyles, hasActiveFilter, taxonomy])

  const selectStyle = (key: string) => {
    onChange(key)
    onSelectComplete?.()
  }

  const pickRandomFiltered = () => {
    const pool = filteredStyles.length > 0 ? filteredStyles : visualStyles
    if (!pool.length) return
    const candidates = pool.filter((item) => item.key !== value)
    const targetPool = candidates.length > 0 ? candidates : pool
    setDiceSpin((s) => s + 1)
    const picked = targetPool[Math.floor(Math.random() * targetPool.length)]
    if (picked) {
      onChange(picked.key)
    }
  }

  const resetFilters = () => {
    setCategoryFilter('all')
    setSubcategoryFilter('all')
    setSearchQuery('')
  }

  const activeCategoryLabel = activeCategory?.label || ''
  const activeSubcategoryLabel =
    effectiveSubcategoryId === 'all'
      ? ''
      : visibleSubcategories.find((s) => s.id === effectiveSubcategoryId)?.label || ''

  const renderStyleCard = (item: VisualStyleItem, showCategoryPrefix: boolean) => {
    const selected = value === item.key
    const badgeText = showCategoryPrefix
      ? `${item.categoryLabel} · ${item.subcategoryLabel}`
      : item.subcategoryLabel

    return (
      <button
        key={item.key}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => selectStyle(item.key)}
        onMouseEnter={() => onHoverChange?.(item.key)}
        onMouseLeave={() => onHoverChange?.(null)}
        onFocus={() => onHoverChange?.(item.key)}
        onBlur={() => onHoverChange?.(null)}
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[transform,border-color,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]',
          selected
            ? 'border-[#D9381E] bg-card ring-2 ring-[#D9381E]/85 shadow-sm'
            : 'border-border/80 bg-secondary/55 hover:border-foreground/45 hover:bg-card hover:shadow-xs dark:bg-muted/30'
        )}
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
          {item.preview ? (
            <img
              src={item.preview}
              alt={item.label}
              loading="lazy"
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 border-b border-dashed border-border/70 bg-muted/25 text-muted-foreground">
              <SparklesIcon className="size-5 opacity-70" />
              <span className="text-xs font-medium">{item.shortLabel}</span>
            </div>
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/55 to-transparent"
          />

          <span className="pointer-events-none absolute top-1.5 left-1.5 max-w-[calc(100%-34px)] truncate rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            {badgeText}
          </span>

          {selected && (
            <motion.span
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 flex size-4.5 items-center justify-center rounded-full bg-[var(--skin-accent)] text-white shadow-sm"
            >
              <CheckIcon className="size-3 stroke-[3]" />
            </motion.span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center p-2">
          <span className="truncate text-xs font-bold text-foreground">{item.label}</span>
        </div>
      </button>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {/* 顶部搜索 + 清除画风 + 筛选内盲选 */}
      <div className="shrink-0 space-y-2 border-b border-border/70 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-[160px] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索画风或分类…"
              aria-label="搜索画风"
              className="h-8 w-full rounded-xl border border-border/80 bg-secondary/55 pr-7 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none dark:bg-muted/35"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="清空画风搜索"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={pickRandomFiltered}
            disabled={visualStyles.length === 0}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-border/80 bg-secondary/55 px-2.5 text-xs font-semibold text-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918]/70 active:scale-95 disabled:opacity-40 dark:bg-muted/35"
            title={hasActiveFilter ? '在当前筛选结果中随机挑选' : '随机挑选一种画风'}
          >
            <motion.span
              key={diceSpin}
              animate={{ rotate: diceSpin ? 360 : 0 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="inline-flex items-center"
            >
              <DicesIcon className="size-3.5 text-[#E5A918]" />
            </motion.span>
            <span>{hasActiveFilter ? '筛选内盲选' : '盲选'}</span>
          </button>

          <button
            type="button"
            onClick={() => selectStyle('none')}
            aria-pressed={value === 'none'}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-95',
              value === 'none'
                ? 'border-[#D9381E] bg-[var(--skin-accent)]/12 text-[#C23018] dark:text-[#FF7A59]'
                : 'border-border/80 bg-secondary/55 text-muted-foreground hover:border-foreground/40 hover:text-foreground dark:bg-muted/35'
            )}
            title={NONE_STYLE_PRESET.label}
          >
            <WandSparklesIcon className="size-3.5" />
            <span>清除画风</span>
          </button>
        </div>

        {/* 一级大类筛选轨 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
              大类
            </span>
            <div
              role="tablist"
              aria-label="画风大类筛选"
              className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={effectiveCategoryId === 'all'}
                onClick={() => {
                  setCategoryFilter('all')
                  setSubcategoryFilter('all')
                }}
                className={cn(
                  'inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                  effectiveCategoryId === 'all'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border/80 bg-secondary/55 text-muted-foreground hover:border-foreground/40 hover:text-foreground dark:bg-muted/35'
                )}
              >
                <span>全部</span>
                <span className="font-mono text-xs opacity-80">{visualStyles.length}</span>
              </button>

              {taxonomy.map((cat) => {
                const active = effectiveCategoryId === cat.id
                return (
                  <button
                    key={`${instanceId}-cat-${cat.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setCategoryFilter(cat.id)
                      setSubcategoryFilter('all')
                    }}
                    className={cn(
                      'inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border/80 bg-secondary/55 text-muted-foreground hover:border-foreground/40 hover:text-foreground dark:bg-muted/35'
                    )}
                  >
                    <span>{cat.label}</span>
                    <span className="font-mono text-xs opacity-80">{cat.count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 二级小类筛选轨 */}
          {visibleSubcategories.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-7 shrink-0 font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                小类
              </span>
              <div
                role="tablist"
                aria-label="画风小类筛选"
                className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveSubcategoryId === 'all'}
                  onClick={() => setSubcategoryFilter('all')}
                  className={cn(
                    'inline-flex h-6 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors',
                    effectiveSubcategoryId === 'all'
                      ? 'border-[#D9381E] bg-[var(--skin-accent)]/12 font-semibold text-[#C23018] dark:text-[#FF7A59]'
                      : 'border-border/70 bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                  )}
                >
                  <span>{activeCategory ? `全部${activeCategory.label}` : '全部小类'}</span>
                </button>

                {visibleSubcategories.map((sub) => {
                  const active = effectiveSubcategoryId === sub.id
                  return (
                    <button
                      key={`${instanceId}-sub-${sub.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      title={
                        effectiveCategoryId === 'all'
                          ? `${sub.categoryLabel} · ${sub.label}`
                          : sub.label
                      }
                      onClick={() => {
                        setCategoryFilter(sub.categoryId)
                        setSubcategoryFilter(sub.id)
                      }}
                      className={cn(
                        'inline-flex h-6 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors',
                        active
                          ? 'border-[#D9381E] bg-[var(--skin-accent)]/12 font-semibold text-[#C23018] dark:text-[#FF7A59]'
                          : sub.count === 0
                            ? 'border-border/50 bg-muted/25 text-muted-foreground/65 hover:border-border hover:text-muted-foreground'
                            : 'border-border/70 bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                      )}
                    >
                      <span>{sub.label}</span>
                      <span className="font-mono text-xs opacity-80">{sub.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 筛选结果统计条 */}
        {hasActiveFilter && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--skin-accent)] hover:bg-[var(--skin-accent)]/12"
            >
              <FilterXIcon className="size-3" />
              <span>重置筛选</span>
            </button>
            <span className="min-w-0 truncate text-right">
              当前筛选：
              {activeCategoryLabel ? (
                <strong className="text-foreground"> {activeCategoryLabel}</strong>
              ) : (
                ' 全部大类'
              )}
              {activeSubcategoryLabel ? (
                <>
                  {' / '}
                  <strong className="text-foreground">{activeSubcategoryLabel}</strong>
                </>
              ) : null}
              {normalizedQuery ? ` · 关键词「${searchQuery.trim()}」` : ''}
              {' · '}共 <strong className="font-mono text-foreground">{filteredStyles.length}</strong> 种
            </span>
          </div>
        )}
      </div>

      {/* 可滚动画风卡片网格区 */}
      <div
        role="radiogroup"
        aria-label="成图画风库"
        className="min-h-0 flex-1 overflow-y-auto pt-2.5 pr-0.5"
      >
        {visualStyles.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border/80 bg-secondary/55/60 p-6 text-center dark:bg-muted/20">
            <FolderOpenIcon className="size-7 text-muted-foreground/60" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-foreground">暂无预设画风</div>
              <p className="text-xs text-muted-foreground">
                当前暂未配置画风预设，可保持无预设画风直接出图。
              </p>
            </div>
          </div>
        ) : filteredStyles.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border/80 bg-secondary/55/60 p-6 text-center dark:bg-muted/20">
            <FolderOpenIcon className="size-7 text-muted-foreground/60" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-foreground">
                {activeSubcategoryLabel
                  ? `「${activeCategoryLabel} / ${activeSubcategoryLabel}」下暂无画风预设`
                  : activeCategoryLabel
                    ? `「${activeCategoryLabel}」下暂无画风预设`
                    : '未找到匹配的画风'}
              </div>
              <p className="text-xs text-muted-foreground">
                试试切换其他大类、小类，或清空搜索关键词查看全部画风。
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {effectiveSubcategoryId !== 'all' && activeCategory && (
                <button
                  type="button"
                  onClick={() => setSubcategoryFilter('all')}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  查看「{activeCategory.label}」全部
                </button>
              )}
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background hover:opacity-90"
              >
                查看全部画风
              </button>
            </div>
          </div>
        ) : groupedSections ? (
          <div className="space-y-4 pb-2">
            {groupedSections.map((section, idx) => (
              <section key={section.category.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-xs font-extrabold tracking-tight text-foreground">
                      {section.category.label}
                    </h3>
                    {section.category.id !== '__other__' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter(section.category.id)
                          setSubcategoryFilter('all')
                        }}
                        className="rounded-full border border-border/80 bg-secondary/55 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground dark:bg-muted/35"
                      >
                        仅看此类 →
                      </button>
                    )}
                  </div>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                    共 {section.items.length} 种
                  </span>
                </div>
                <div className={cn('grid gap-2', gridColsClassName)}>
                  {section.items.map((item) => renderStyleCard(item, false))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={cn('grid gap-2 pb-2', gridColsClassName)}>
            {filteredStyles.map((item) => renderStyleCard(item, effectiveCategoryId === 'all'))}
          </div>
        )}
      </div>
    </div>
  )
}
