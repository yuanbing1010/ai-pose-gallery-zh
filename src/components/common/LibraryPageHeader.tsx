import type { ReactNode, RefObject } from 'react'
import { motion } from 'motion/react'
import { RotateCcwIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { KineticRollText } from '@/components/motion/SignatureBlocks'
import { playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'

export interface LibraryTabItem {
  id: string
  label: string
  count?: number
  active: boolean
  onClick: () => void
}

export interface LibraryPageHeaderProps {
  title: string
  tabsLabel: string
  tabs: LibraryTabItem[]
  searchValue: string
  searchPlaceholder: string
  searchInputRef?: RefObject<HTMLInputElement | null>
  onSearchChange: (val: string) => void
  onOpenFilter: () => void
  activeFilterCount: number
  hasActiveFilters: boolean
  filteredCount?: number
  onResetFilters: () => void
  extraControls?: ReactNode
}

const LIBRARY_CHAPTER_META: Record<
  string,
  {
    vol: string
    code: string
    sub: string
    glowBg: string
    accentHex: string
    pillTint: string
  }
> = {
  动作姿势: {
    vol: '01',
    code: 'POSES ARCHIVE',
    sub: '多角度白模与深度骨骼参考',
    glowBg: 'linear-gradient(180deg, #1d1816 0%, #131110 100%)',
    accentHex: '#D9381E',
    pillTint: 'text-[#FF8A75]',
  },
  服装穿搭: {
    vol: '02',
    code: 'COSTUMES ARCHIVE',
    sub: '写实、二次元与历代服饰图鉴',
    glowBg: 'linear-gradient(180deg, #141c1a 0%, #101413 100%)',
    accentHex: '#2DD4BF',
    pillTint: 'text-[#5EEAD4]',
  },
  人像颜值: {
    vol: '03',
    code: 'PORTRAITS ARCHIVE',
    sub: '多气质发型与正脸氛围参考',
    glowBg: 'linear-gradient(180deg, #1d1913 0%, #13110f 100%)',
    accentHex: '#E5A918',
    pillTint: 'text-[#F5C443]',
  },
}

export function LibraryPageHeader({
  title,
  tabsLabel,
  tabs,
  searchValue,
  searchPlaceholder,
  searchInputRef,
  onSearchChange,
  onOpenFilter,
  activeFilterCount,
  hasActiveFilters,
  filteredCount,
  onResetFilters,
  extraControls,
}: LibraryPageHeaderProps) {
  const meta = LIBRARY_CHAPTER_META[title] ?? LIBRARY_CHAPTER_META['动作姿势']
  const totalCount = tabs.find((t) => t.id === 'all' || t.label === '全部')?.count

  return (
    <header className="space-y-4">
      {/* 黑曜石画册扉页主横幅（含衬线卷号水印、影棚主题光与黑金搜索操作区） */}
      <div
        className="dark relative overflow-hidden rounded-[22px] border border-[#E5A918]/22 px-5 py-4.5 text-[#F6F2EA] shadow-[0_16px_42px_rgba(15,13,10,0.18)] sm:px-7 sm:py-5"
        style={{ background: meta.glowBg }}
      >
        <span aria-hidden="true" className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1.5px]" />
        <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 size-2.5 border-t border-l border-[#E5A918]/45 sm:top-3 sm:left-3 sm:size-3" />
        <span aria-hidden="true" className="pointer-events-none absolute top-2 right-2 size-2.5 border-t border-r border-[#E5A918]/45 sm:top-3 sm:right-3 sm:size-3" />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 size-2.5 border-b border-l border-[#E5A918]/45 sm:bottom-3 sm:left-3 sm:size-3" />
        <span aria-hidden="true" className="pointer-events-none absolute right-2 bottom-2 size-2.5 border-r border-b border-[#E5A918]/45 sm:right-3 sm:bottom-3 sm:size-3" />
        {/* 巨型衬线体卷号金箔水印（纯装饰内联 SVG，避免低对比度文本告警与字号阶梯污染） */}
        <svg
          aria-hidden="true"
          viewBox="0 0 280 116"
          className="pointer-events-none absolute -top-2 right-6 hidden h-[96px] w-[236px] select-none sm:block"
        >
          <text
            x="276"
            y="88"
            textAnchor="end"
            fill="#E5A918"
            fillOpacity="0.08"
            fontFamily="var(--font-serif-editorial)"
            fontSize="88"
            fontWeight="700"
          >
            Vol.{meta.vol}
          </text>
        </svg>

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-[#D8D0C2]">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: meta.accentHex }}
              />
              <span className={cn('font-semibold', meta.pillTint)}>
                VOL.{meta.vol} · {meta.code}
              </span>
              {totalCount !== undefined && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="tabular-nums text-[#E5A918]">
                    {hasActiveFilters && filteredCount !== undefined
                      ? `匹配 ${filteredCount.toLocaleString('zh-CN')} / ${totalCount.toLocaleString('zh-CN')}`
                      : `${totalCount.toLocaleString('zh-CN')} ITEMS`}
                  </span>
                </>
              )}
            </div>
            <h1 className="ed-headline-tight flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-2xl font-bold sm:text-3xl">
              <span className="text-white">{title}</span>
              <span className="text-base font-medium text-[#D2C9B8] sm:text-lg">
                {meta.sub}
              </span>
            </h1>
          </div>

          {/* 右侧：检索胶囊 + 筛选 + 列密度 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex h-10 w-full items-center rounded-full border border-white/15 bg-black/45 pr-2 pl-4 backdrop-blur-md transition-colors focus-within:border-[#E5A918]/65 sm:w-64">
              <SearchIcon className="mr-2 size-3.5 shrink-0 text-[#C8C0B2]" />
              <input
                ref={searchInputRef}
                type="search"
                aria-label={searchPlaceholder}
                enterKeyHint="search"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-white placeholder:text-[#A9A192] focus:outline-none"
              />
              {searchValue ? (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => onSearchChange('')}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-[#C42F16] active:scale-95"
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="hidden h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.08] px-1.5 font-mono text-xs leading-none text-[#C8C0B2] sm:inline-flex"
                >
                  /
                </kbd>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenFilter}
              className={cn(
                'group inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
                activeFilterCount > 0
                  ? 'skin-accent-btn border-transparent'
                  : 'border-white/15 bg-white/[0.08] text-white hover:border-[#E5A918]/55 hover:bg-white/[0.14]'
              )}
            >
              <SlidersHorizontalIcon className="size-3.5" />
              <KineticRollText text="筛选" />
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 font-mono text-xs leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {extraControls}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                aria-label="重置筛选"
                title="重置筛选"
                className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-[#D8D0C2] transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918]/55 hover:text-white active:scale-95"
              >
                <RotateCcwIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 底行：Curated 右侧渐隐遮罩 + Landing Love 行内浅灰计数横向分类条 */}
      <div className="ed-fade-mask-x no-scrollbar flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pr-8">
        <div role="tablist" aria-label={tabsLabel} className="flex items-center gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.active}
              onClick={() => {
                if (!tab.active) playMechanicalSwitch(1.02)
                tab.onClick()
              }}
              className={cn(
                'relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-xs whitespace-nowrap transition-colors',
                tab.active
                  ? 'font-semibold text-white dark:text-[#121110]'
                  : 'border border-border/85 bg-card/85 font-medium text-muted-foreground hover:border-foreground/35 hover:text-foreground'
              )}
            >
              {tab.active && (
                <motion.span
                  layoutId={`lib-tab-${title}`}
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  className="pointer-events-none absolute inset-0 rounded-full bg-[#151412] shadow-sm dark:bg-[#F5F2EB]"
                />
              )}
              <span className="relative z-10">{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'relative z-10 font-mono text-xs tabular-nums',
                    tab.active ? 'text-[#F5C443] dark:text-[#B82812]' : 'text-muted-foreground'
                  )}
                >
                  {tab.count.toLocaleString('zh-CN')}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
