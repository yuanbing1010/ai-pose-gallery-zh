import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { costumesQuery } from '@/api/gallery'
import { FashionCard } from '@/components/cards/FashionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { GalleryDensityControl } from '@/components/common/GalleryDensityControl'
import { HorizontalFilterStrip } from '@/components/common/HorizontalFilterStrip'
import { InfiniteScrollSentinel } from '@/components/common/InfiniteScrollSentinel'
import { LibraryPageHeader } from '@/components/common/LibraryPageHeader'
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton'
import { CostumeDetailModal } from '@/components/costumes/CostumeDetailModal'
import {
  CostumeFilterModal,
  type CostumeSourceFilter,
} from '@/components/costumes/CostumeFilterModal'
import { Skeleton } from '@/components/ui/skeleton'
import {
  COSTUME_STYLE_TABS,
  type CostumeStyleTab,
  matchCostumeStyle,
} from '@/lib/costumeFrame'
import { COSTUME_SOURCES, costumeSourceId, selectCostumeView } from '@/lib/costumeSources'
import { galleryGridClassName, useGalleryDesktopCols } from '@/lib/galleryDensity'
import { cn } from '@/lib/utils'
import { useStudioActions, useStudioShallow } from '@/store/studioStore'
import { OUTFIT_DB_SOURCE_LABEL } from '../../shared/outfitDbArchive'

export interface CostumesSearchParams {
  style?: CostumeStyleTab
  source?: CostumeSourceFilter
  category?: string
  tag?: string
  q?: string
}

export const Route = createFileRoute('/costumes')({
  staticData: { title: '服装穿搭库' },
  validateSearch: (raw: Record<string, unknown>): CostumesSearchParams => {
    const out: CostumesSearchParams = {}
    if (raw.style === 'realistic' || raw.style === 'anime' || raw.style === 'historical') {
      out.style = raw.style
    }
    if (
      raw.source === 'gia' ||
      raw.source === 'gia-anime' ||
      raw.source === 'charadb' ||
      raw.source === 'shisei' ||
      raw.source === 'mio' ||
      raw.source === 'outfit-db'
    ) {
      out.source = raw.source
    }
    if (typeof raw.category === 'string' && raw.category.trim()) out.category = raw.category.trim()
    if (typeof raw.tag === 'string' && raw.tag.trim() && raw.tag !== 'all') out.tag = raw.tag.trim()
    if (typeof raw.q === 'string' && raw.q) out.q = raw.q
    return out
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(costumesQuery),
  pendingComponent: () => (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-4 w-60 rounded-full" />
        </div>
        <Skeleton className="h-14 w-80 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, idx) => (
          <Skeleton key={idx} className="aspect-[2/3] rounded-[20px]" />
        ))}
      </div>
    </div>
  ),
  component: CostumesPage,
})

const SOURCE_FILTER_LABELS: Array<{ id: CostumeSourceFilter; label: string }> = [
  { id: 'all', label: '全部来源' },
  { id: 'gia', label: 'ギア · 写实' },
  { id: 'gia-anime', label: 'ギア · 动漫' },
  { id: 'charadb', label: 'たき AI · CharaDB' },
  { id: 'shisei', label: 'Shisei · 中国历代' },
  { id: 'mio', label: '霧島澪 · 设计档案' },
  { id: 'outfit-db', label: OUTFIT_DB_SOURCE_LABEL },
]

function CostumesPage() {
  const { data: costumes } = useSuspenseQuery(costumesQuery)
  const { recipeCostume } = useStudioShallow((s) => ({ recipeCostume: s.recipe.costume }))
  const { toggleCostume } = useStudioActions()
  const recipe = { costume: recipeCostume }
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const styleTab: CostumeStyleTab = search.style ?? 'all'
  const sourceFilter: CostumeSourceFilter = search.source ?? 'all'
  const category = search.category ?? ''
  const tag = search.tag ?? 'all'
  const query = search.q ?? ''

  const updateSearch = (patch: Partial<CostumesSearchParams>) => {
    void navigate({
      search: (prev) => {
        const next: CostumesSearchParams = { ...prev, ...patch }
        if (!next.style || next.style === 'all') delete next.style
        if (!next.source || next.source === 'all') delete next.source
        if (!next.category) delete next.category
        if (!next.tag || next.tag === 'all') delete next.tag
        if (!next.q) delete next.q
        return next
      },
      replace: true,
    })
  }

  const setStyleTab = (next: CostumeStyleTab) =>
    updateSearch({ style: next === 'all' ? undefined : next })
  const setSourceFilter = (next: CostumeSourceFilter) =>
    updateSearch({ source: next === 'all' ? undefined : next })
  const setCategory = (next: string) => updateSearch({ category: next || undefined })
  const setTag = (next: string) => updateSearch({ tag: next === 'all' ? undefined : next })
  const setQuery = (next: string) => updateSearch({ q: next || undefined })

  const [desktopCols, setDesktopCols] = useGalleryDesktopCols()
  const [view, setView] = useState({ itemId: '', id: 'front' })
  const [shown, setShown] = useState(60)
  const [filterOpen, setFilterOpen] = useState(false)
  const [viewerNav, setViewerNav] = useState<{ index: number | null; dir: 1 | -1 }>({
    index: null,
    dir: 1,
  })
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerStageMode, setViewerStageMode] = useState<'3d' | 'stack' | 'zoom'>('3d')

  const viewerIndex = viewerNav.index
  const searchInputRef = useRef<HTMLInputElement>(null)

  const openViewer = (idx: number) => {
    setViewerNav({ index: idx, dir: 1 })
    setViewerOpen(true)
  }

  const activeCategory = category

  const styleCounts = useMemo<Record<CostumeStyleTab, number>>(
    () => ({
      all: costumes.length,
      realistic: costumes.filter((x) => matchCostumeStyle(x, 'realistic')).length,
      anime: costumes.filter((x) => matchCostumeStyle(x, 'anime')).length,
      historical: costumes.filter((x) => matchCostumeStyle(x, 'historical')).length,
    }),
    [costumes]
  )

  const baseCostumes = useMemo(
    () =>
      costumes.filter((x) => {
        if (!matchCostumeStyle(x, styleTab)) return false
        if (sourceFilter !== 'all' && costumeSourceId(x) !== sourceFilter) return false
        return true
      }),
    [costumes, styleTab, sourceFilter]
  )

  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of baseCostumes) {
      map.set(item.分类, (map.get(item.分类) || 0) + 1)
    }
    return [...map.entries()].map(([label, count]) => ({ label, count }))
  }, [baseCostumes])

  const tagOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of baseCostumes) {
      if (activeCategory && item.分类 !== activeCategory) continue
      for (const t of item.标签 || []) {
        map.set(t, (map.get(t) || 0) + 1)
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }))
  }, [baseCostumes, activeCategory])

  const sourceOptions = useMemo(() => {
    const scoped = costumes.filter((x) => matchCostumeStyle(x, styleTab))
    return SOURCE_FILTER_LABELS.map((entry) => ({
      id: entry.id,
      label: entry.label,
      count: entry.id === 'all' ? scoped.length : scoped.filter((x) => costumeSourceId(x) === entry.id).length,
    })).filter((entry) => entry.id === 'all' || entry.count > 0)
  }, [costumes, styleTab])

  const activeTag =
    tag === 'all' || baseCostumes.some((x) => (!activeCategory || x.分类 === activeCategory) && (x.标签 || []).includes(tag))
      ? tag
      : 'all'

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return baseCostumes.filter((item) => {
      if (activeCategory && item.分类 !== activeCategory) return false
      if (activeTag !== 'all' && !(item.标签 || []).includes(activeTag)) return false
      if (q && !item.检索.toLowerCase().includes(q)) return false
      return true
    })
  }, [baseCostumes, activeCategory, activeTag, q])

  const activeFilterCount =
    (styleTab !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (activeCategory ? 1 : 0) +
    (activeTag !== 'all' ? 1 : 0)

  const hasActiveFilters = Boolean(activeFilterCount > 0 || query.trim())

  const viewedItem = viewerIndex !== null ? filtered[viewerIndex] : null
  const currentItem = viewedItem
    ? selectCostumeView(viewedItem, view.itemId === viewedItem.id ? view.id : 'front')
    : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewerOpen && viewerIndex !== null && filtered.length) {
        if (viewerStageMode === 'zoom') return
        if (e.key === 'ArrowRight') {
          setViewerNav({ index: (viewerIndex + 1) % filtered.length, dir: 1 })
          return
        }
        if (e.key === 'ArrowLeft') {
          setViewerNav({ index: (viewerIndex - 1 + filtered.length) % filtered.length, dir: -1 })
          return
        }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && currentItem?.views?.length && currentItem.views.length > 1) {
          e.preventDefault()
          const delta = e.key === 'ArrowDown' ? 1 : -1
          const curId = currentItem.selectedView || currentItem.views[0].id
          const curIdx = Math.max(0, currentItem.views.findIndex((v) => v.id === curId))
          const nextView = currentItem.views[(curIdx + delta + currentItem.views.length) % currentItem.views.length]
          if (nextView) setView({ itemId: currentItem.id, id: nextView.id })
          return
        }
      }

      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if ((e.key === 'f' || e.key === 'F') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !viewerOpen) {
        e.preventDefault()
        setFilterOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen, viewerIndex, viewerStageMode, filtered.length, currentItem])

  const resetFilters = () => {
    void navigate({ search: {}, replace: true })
    setShown(60)
  }

  return (
    <div className="space-y-5">
      <LibraryPageHeader
        title="服装穿搭"
        tabsLabel="穿搭风格板块"
        tabs={COSTUME_STYLE_TABS.map((tab) => ({
          id: tab.id,
          label: tab.label,
          count: styleCounts[tab.id],
          active: styleTab === tab.id,
          onClick: () => {
            setStyleTab(tab.id)
            setSourceFilter('all')
            setCategory('')
            setTag('all')
            setShown(60)
            setViewerOpen(false)
          },
        }))}
        searchValue={query}
        searchPlaceholder="搜索款式、材质或颜色…"
        searchInputRef={searchInputRef}
        onSearchChange={(val) => {
          setQuery(val)
          setShown(60)
        }}
        onOpenFilter={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        filteredCount={filtered.length}
        onResetFilters={resetFilters}
        extraControls={
          <GalleryDensityControl value={desktopCols} onChange={setDesktopCols} />
        }
      />

      {/* 单行横向轻盈分类胶囊 */}
      <div className="space-y-3">
        <HorizontalFilterStrip>
          {sourceFilter !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setSourceFilter('all')
                setShown(60)
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <span>来源：{SOURCE_FILTER_LABELS.find((s) => s.id === sourceFilter)?.label}</span>
              <XIcon className="size-3" />
            </button>
          )}

          {activeTag !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setTag('all')
                setShown(60)
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <span>#{activeTag}</span>
              <XIcon className="size-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setCategory('')
              setTag('all')
              setShown(60)
            }}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              activeCategory === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            全部分类
          </button>

          {categoryOptions.map((c) => {
            const isActive = activeCategory === c.label
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setCategory(isActive ? '' : c.label)
                  setTag('all')
                  setShown(60)
                }}
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {c.label}
                <span className={cn('ml-1.5 font-mono text-xs', isActive ? 'opacity-80' : 'text-muted-foreground')}>
                  {c.count}
                </span>
              </button>
            )
          })}
        </HorizontalFilterStrip>
      </div>

      {/* 对齐架构网格：无黑底、无裁切、与姿势库统一的底部色条铭牌 */}
      {filtered.length === 0 ? (
        <EmptyState
          title="没有找到匹配的服装穿搭"
          description="试试更换搜索词或重置筛选条件"
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-muted active:scale-95"
              >
                <span>重置全部筛选</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className={galleryGridClassName(desktopCols)}>
          {filtered.slice(0, shown).map((item, idx) => (
            <FashionCard
              key={item.id}
              item={item}
              index={idx % 60}
              aspect={styleTab === 'historical' ? '3/4' : '2/3'}
              picked={recipe.costume?.id === item.id}
              eager={idx < 6}
              onTogglePick={() => toggleCostume(item)}
              onOpenViewer={() => openViewer(idx)}
            />
          ))}
        </div>
      )}

      <InfiniteScrollSentinel
        shown={shown}
        total={filtered.length}
        unitLabel="套穿搭"
        onLoadMore={() => setShown((s) => s + 60)}
      />

      {/* 底部来源说明 */}
      <footer className="space-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        {COSTUME_SOURCES.map((entry) => (
          <p key={entry.id}>
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline hover:opacity-80">
              {entry.label}
            </a>
            ：{entry.notice}
          </p>
        ))}
      </footer>

      <CostumeFilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        styleTab={styleTab}
        onSelectStyle={(next) => {
          setStyleTab(next)
          setSourceFilter('all')
          setCategory('')
          setTag('all')
          setShown(60)
        }}
        sourceFilter={sourceFilter}
        onSelectSource={(next) => {
          setSourceFilter(next)
          setCategory('')
          setTag('all')
          setShown(60)
        }}
        category={activeCategory}
        onSelectCategory={(next) => {
          setCategory(next)
          setTag('all')
          setShown(60)
        }}
        tag={activeTag}
        onSelectTag={(next) => {
          setTag(next)
          setShown(60)
        }}
        styleCounts={styleCounts}
        sourceOptions={sourceOptions}
        categoryOptions={categoryOptions}
        tagOptions={tagOptions}
        resultCount={filtered.length}
        onReset={resetFilters}
      />

      {currentItem && viewerIndex !== null && (
        <CostumeDetailModal
          open={viewerOpen}
          onOpenChange={(o) => {
            setViewerOpen(o)
            if (!o) setViewerStageMode('3d')
          }}
          stageMode={viewerStageMode}
          onStageModeChange={setViewerStageMode}
          item={currentItem}
          picked={
            recipe.costume?.id === currentItem.id &&
            (recipe.costume.selectedView || 'front') === (currentItem.selectedView || 'front')
          }
          onTogglePick={() => toggleCostume(currentItem)}
          onSelectTag={(t) => {
            setTag(t)
            setShown(60)
          }}
          selectedViewId={currentItem.selectedView || 'front'}
          onSelectView={(nextId) => setView({ itemId: currentItem.id, id: nextId })}
          currentIndex={viewerIndex}
          totalCount={filtered.length}
          direction={viewerNav.dir}
          onPrev={() => setViewerNav({ index: (viewerIndex - 1 + filtered.length) % filtered.length, dir: -1 })}
          onNext={() => setViewerNav({ index: (viewerIndex + 1) % filtered.length, dir: 1 })}
        />
      )}
      <ScrollToTopButton />
    </div>
  )
}
