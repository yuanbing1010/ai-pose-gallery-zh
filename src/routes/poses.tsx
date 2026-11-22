import { ZoomViewport } from '@/components/common/ZoomViewport'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  BoxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ANGLES, posesQuery } from '@/api/gallery'
import Stack from '@/components/cards/Stack'
import { EmptyState } from '@/components/common/EmptyState'
import { GalleryDensityControl } from '@/components/common/GalleryDensityControl'
import { HorizontalFilterStrip } from '@/components/common/HorizontalFilterStrip'
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton'
import { ShowcaseDialog, ShowcaseStageTabs, type ShowcaseStageTabItem } from '@/components/common/ShowcaseDialog'
import { GlowCard3D } from '@/components/costumes/GlowCard3D'
import { GalleryHoloCard } from '@/components/cards/GalleryHoloCard'
import { PoseFilterModal, type PoseSourceFilter } from '@/components/poses/PoseFilterModal'
import { Skeleton } from '@/components/ui/skeleton'
import { getPoseAccent } from '@/lib/cardAccents'
import { type GalleryDesktopCols, galleryGridClassName, useGalleryDesktopCols } from '@/lib/galleryDensity'
import { getPoseFrameBounds, POSE_THUMB_HEIGHT, POSE_THUMB_WIDTH } from '@/lib/poseBounds'
import { hasPoseDepthMap, poseImagePath, poseThumbPath, referenceImageUrl, downloadFileName } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import type { PoseGroup, PoseItem } from '@/types/gallery'
import {
  MIO_ARCHIVE_ORIGIN,
  MIO_COPYRIGHT_NOTICE,
  MIO_POSE_SYSTEM,
  MIO_SOURCE_LABEL,
} from '../../shared/mioArchive'

export interface PosesSearchParams {
  line?: string
  source?: PoseSourceFilter
  category?: string
  angle?: string
  q?: string
}

const POSE_SOURCE_LABELS: Array<{ id: PoseSourceFilter; label: string }> = [
  { id: 'all', label: '全部来源' },
  { id: 'gia', label: 'ギア · 素体白模与深度图' },
  { id: 'mio', label: MIO_SOURCE_LABEL },
]

export const Route = createFileRoute('/poses')({
  staticData: { title: '动作姿势库' },
  validateSearch: (raw: Record<string, unknown>): PosesSearchParams => {
    const out: PosesSearchParams = {}
    if (typeof raw.line === 'string' && raw.line.trim()) out.line = raw.line.trim()
    if (raw.source === 'gia' || raw.source === 'mio') out.source = raw.source
    if (typeof raw.category === 'string' && raw.category.trim() && raw.category !== 'all') {
      out.category = raw.category.trim()
    }
    if (typeof raw.angle === 'string' && raw.angle.trim()) out.angle = raw.angle.trim()
    if (typeof raw.q === 'string' && raw.q) out.q = raw.q
    return out
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(posesQuery),
  pendingComponent: () => (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-4 w-64 rounded-full" />
        </div>
        <Skeleton className="h-14 w-80 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, idx) => (
          <Skeleton key={idx} className="aspect-[3/4] rounded-[20px]" />
        ))}
      </div>
    </div>
  ),
  component: PosesPage,
})

function computeMasonryColumns(w: number, desktopCols: GalleryDesktopCols) {
  if (w >= 1024) return desktopCols
  if (w >= 768) return 4
  if (w >= 640) return 3
  return 2
}

function useMasonryColumns(desktopCols: GalleryDesktopCols) {
  const [cols, setCols] = useState(() =>
    typeof window === 'undefined' ? 2 : computeMasonryColumns(window.innerWidth, desktopCols)
  )
  useEffect(() => {
    const update = () => setCols(computeMasonryColumns(window.innerWidth, desktopCols))
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [desktopCols])
  return cols
}

function PosesPage() {
  const { data } = useSuspenseQuery(posesQuery)
  const { recipe, togglePose, poseDepthMode, setPoseDepthMode } = useStudio()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const line = search.line ?? ''
  const sourceFilter: PoseSourceFilter = search.source ?? 'all'
  const category = search.category ?? 'all'
  const angle = search.angle ?? ''
  const query = search.q ?? ''

  const updateSearch = (patch: Partial<PosesSearchParams>) => {
    void navigate({
      search: (prev) => {
        const next: PosesSearchParams = { ...prev, ...patch }
        if (!next.line) delete next.line
        if (!next.source || next.source === 'all') delete next.source
        if (!next.category || next.category === 'all') delete next.category
        if (!next.angle) delete next.angle
        if (!next.q) delete next.q
        return next
      },
      replace: true,
    })
  }

  const setLine = (next: string) => updateSearch({ line: next || undefined })
  const setSourceFilter = (next: PoseSourceFilter) =>
    updateSearch({ source: next === 'all' ? undefined : next })
  const setCategory = (next: string) =>
    updateSearch({ category: next === 'all' ? undefined : next })
  const setAngle = (next: string) => updateSearch({ angle: next || undefined })
  const setQuery = (next: string) => updateSearch({ q: next || undefined })

  const [desktopCols, setDesktopCols] = useGalleryDesktopCols()
  const [shown, setShown] = useState(60)
  const [filterOpen, setFilterOpen] = useState(false)
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({})
  const [viewer, setViewer] = useState<{ groupIndex: number; item: PoseItem; dir?: 1 | -1; depth?: boolean } | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerStageMode, setViewerStageMode] = useState<'3d' | 'stack' | 'zoom'>('3d')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const openViewer = (next: { groupIndex: number; item: PoseItem; depth?: boolean }) => {
    setViewer({ ...next, dir: 1 })
    setViewerOpen(true)
  }

  const activeLine = line
  const baseGroups = data.groups
  const visibleLines = data.lines

  const lineOptions = useMemo(
    () =>
      visibleLines.map((l) => ({
        label: l,
        count: baseGroups.filter((g) => g.system === l).length,
      })),
    [visibleLines, baseGroups]
  )

  const sourceOptions = useMemo(() => {
    const scoped = activeLine ? baseGroups.filter((g) => g.system === activeLine) : baseGroups
    return POSE_SOURCE_LABELS.map((entry) => ({
      id: entry.id,
      label: entry.label,
      count:
        entry.id === 'all'
          ? scoped.length
          : scoped.filter((g) => {
              const isMio = g.items.some((it) => it.source === 'mio')
              return entry.id === 'mio' ? isMio : !isMio
            }).length,
    })).filter((entry) => entry.id === 'all' || entry.count > 0)
  }, [baseGroups, activeLine])

  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of baseGroups) {
      if (activeLine && g.system !== activeLine) continue
      const isMio = g.items.some((it) => it.source === 'mio')
      if (sourceFilter === 'mio' && !isMio) continue
      if (sourceFilter === 'gia' && isMio) continue
      if (g.category) map.set(g.category, (map.get(g.category) || 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
      .map(([label, count]) => ({ label, count }))
  }, [baseGroups, activeLine, sourceFilter])

  const angleCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of ANGLES) map[a] = 0
    for (const g of baseGroups) {
      if (activeLine && g.system !== activeLine) continue
      const isMio = g.items.some((it) => it.source === 'mio')
      if (sourceFilter === 'mio' && !isMio) continue
      if (sourceFilter === 'gia' && isMio) continue
      if (category !== 'all' && g.category !== category) continue
      for (const a of ANGLES) {
        if (g.angles[a]) map[a] = (map[a] || 0) + 1
      }
    }
    return map
  }, [baseGroups, activeLine, sourceFilter, category])

  const q = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    return baseGroups.filter((g) => {
      if (activeLine && g.system !== activeLine) return false
      const isMio = g.items.some((it) => it.source === 'mio')
      if (sourceFilter === 'mio' && !isMio) return false
      if (sourceFilter === 'gia' && isMio) return false
      if (category !== 'all' && g.category !== category) return false
      return g.items.some((it) => {
        if (angle && it.角度 !== angle) return false
        if (q && !(it.检索 || `${it.姿势名称} ${it.id} ${it.分类} ${it.姿势编号} ${it.体系}`).toLowerCase().includes(q)) return false
        return true
      })
    })
  }, [baseGroups, activeLine, sourceFilter, category, angle, q])

  const activeFilterCount =
    (activeLine ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (angle ? 1 : 0)

  const hasActiveFilters = Boolean(activeFilterCount > 0 || query.trim())

  const resetFilters = () => {
    void navigate({ search: {}, replace: true })
    setShown(60)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewer && viewerOpen) {
        if (viewerStageMode === 'zoom') return
        const grp = filteredGroups[viewer.groupIndex]
        if (grp) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            if (filteredGroups.length <= 1) return
            e.preventDefault()
            const dir: 1 | -1 = e.key === 'ArrowRight' ? 1 : -1
            const nextIdx = (viewer.groupIndex + dir + filteredGroups.length) % filteredGroups.length
            const nextGrp = filteredGroups[nextIdx]
            const nextItem = nextGrp.angles[viewer.item.角度] || nextGrp.order[0]
            setViewer((prev) => ({ groupIndex: nextIdx, item: nextItem, dir, depth: prev?.depth }))
            return
          }
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && grp.order.length > 1) {
            e.preventDefault()
            const dir: 1 | -1 = e.key === 'ArrowDown' ? 1 : -1
            const idx = grp.order.findIndex((x) => x.id === viewer.item.id)
            const nextItem = grp.order[(idx + dir + grp.order.length) % grp.order.length]
            if (nextItem) {
              setViewer((prev) => ({ groupIndex: viewer.groupIndex, item: nextItem, dir, depth: prev?.depth }))
            }
            return
          }
        }
      }

      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
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
  }, [viewer, viewerOpen, viewerStageMode, filteredGroups])

  const getActiveGroupItem = (group: PoseGroup): PoseItem => {
    if (angle && group.angles[angle]) return group.angles[angle]
    return group.order[0]
  }

  const totalCount = filteredGroups.length
  const matchedImageCount = useMemo(
    () => filteredGroups.reduce((sum, g) => sum + g.order.length, 0),
    [filteredGroups]
  )
  const masonryCols = useMasonryColumns(desktopCols)
  const distributedCols = useMemo(() => {
    const columns: Array<Array<{ group: PoseGroup; gIdx: number }>> = Array.from(
      { length: masonryCols },
      () => []
    )
    const heights = new Array<number>(masonryCols).fill(0)
    const visible = filteredGroups.slice(0, shown)
    for (let gIdx = 0; gIdx < visible.length; gIdx++) {
      const group = visible[gIdx]
      const item = angle && group.angles[angle] ? group.angles[angle] : group.order[0]
      const bounds = getPoseFrameBounds(item.id)
      const ratio = item.source === 'mio' ? 1 + 0.34 : bounds.cropH / POSE_THUMB_WIDTH + 0.34
      let minCol = 0
      for (let c = 1; c < masonryCols; c++) {
        if (heights[c] < heights[minCol]) minCol = c
      }
      columns[minCol].push({ group, gIdx })
      heights[minCol] += ratio
    }
    return columns
  }, [filteredGroups, shown, masonryCols, angle])

  const lineShortLabel = (label: string) =>
    label
      .replace('全身单人・标准系', '全身标准')
      .replace('全身单人・性感系', '全身性感')
      .replace('上半身单人', '上半身')
      .replace(MIO_POSE_SYSTEM, '霧島澪')

  return (
    <div className="space-y-5">
      {/* 与服装库统一的 StyleKit 式顶栏 + 体系统计矩阵 */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-px w-5 bg-foreground/40" aria-hidden="true" />
            <span>人体动态与空间深度集合</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            动作姿势库
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            5 视角 3D 素体白模与深度图参考 · 当前匹配{' '}
            <span className="font-mono font-medium text-foreground">{totalCount.toLocaleString('zh-CN')}</span> 组（{matchedImageCount.toLocaleString('zh-CN')} 张）
          </p>
        </div>

        <div
          role="tablist"
          aria-label="姿势体系板块"
          className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card [&>*:first-child:nth-last-child(odd)]:col-span-2 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:divide-y-0 sm:[&>*:first-child:nth-last-child(odd)]:col-span-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeLine === ''}
            onClick={() => {
              setLine('')
              setCategory('all')
              setShown(60)
            }}
            className={cn(
              'px-3.5 py-2.5 text-center transition-colors sm:px-5',
              activeLine === ''
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted/60'
            )}
          >
            <div className={cn('text-xs whitespace-nowrap', activeLine === '' ? 'opacity-80' : 'text-muted-foreground')}>
              全部姿势
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
              {baseGroups.length}
            </div>
          </button>

          {lineOptions.map((opt) => {
            const active = activeLine === opt.label
            return (
              <button
                key={opt.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setLine(opt.label)
                  setCategory('all')
                  setShown(60)
                }}
                className={cn(
                  'px-3.5 py-2.5 text-center transition-colors sm:px-5',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted/60'
                )}
              >
                <div className={cn('text-xs whitespace-nowrap', active ? 'opacity-80' : 'text-muted-foreground')}>
                  {lineShortLabel(opt.label)}
                </div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {opt.count}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 与服装库统一的控制栏：搜索 (/) + 筛选 (F) + 白模/深度切换 + 单行分类带 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex h-10 min-w-[160px] flex-1 items-center rounded-xl border border-border bg-card px-3.5 transition-colors focus-within:border-foreground/40">
            <SearchIcon className="mr-2.5 size-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(60)
              }}
              placeholder="搜索姿势名称、动作分类或编号（如 站姿、坐姿、单膝）…"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => {
                  setQuery('')
                  setShown(60)
                }}
                className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            ) : (
              <kbd className="ml-2 hidden shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline-block">
                /
              </kbd>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-medium transition-colors active:scale-[0.98]',
              activeFilterCount > 0
                ? 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                : 'border-border bg-card text-foreground hover:bg-muted'
            )}
          >
            <SlidersHorizontalIcon className="size-3.5" />
            <span>筛选</span>
            {activeFilterCount > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-background font-mono text-xs font-semibold text-foreground">
                {activeFilterCount}
              </span>
            ) : (
              <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline-block">
                F
              </kbd>
            )}
          </button>

          <div className="inline-flex h-10 shrink-0 items-center rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setPoseDepthMode(false)}
              className={cn(
                'h-full rounded-lg px-3 text-xs font-medium transition-colors',
                !poseDepthMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              素体白模
            </button>
            <button
              type="button"
              onClick={() => setPoseDepthMode(true)}
              className={cn(
                'h-full rounded-lg px-3 text-xs font-medium transition-colors',
                poseDepthMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              深度图
            </button>
          </div>

          <GalleryDensityControl value={desktopCols} onChange={setDesktopCols} />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98]"
            >
              <RotateCcwIcon className="size-3.5" />
              <span>重置</span>
            </button>
          )}
        </div>

        {/* 单行横向轻盈动作分类胶囊 */}
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
              <span>来源：{POSE_SOURCE_LABELS.find((s) => s.id === sourceFilter)?.label}</span>
              <XIcon className="size-3" />
            </button>
          )}

          {angle && (
            <button
              type="button"
              onClick={() => {
                setAngle('')
                setShown(60)
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <span>视角：{angle}</span>
              <XIcon className="size-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setCategory('all')
              setShown(60)
            }}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              category === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            全部分类
          </button>

          {categoryOptions.map((c) => {
            const isActive = category === c.label
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setCategory(isActive ? 'all' : c.label)
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

      {/* 真实姿势高度驱动的错落自由手牌瀑布流 */}
      {totalCount === 0 ? (
        <EmptyState title="没有找到匹配的姿势" description="试试更换搜索词或重置筛选条件" />
      ) : (
        <div className={cn(galleryGridClassName(desktopCols), 'items-start gap-5')}>
          {distributedCols.map((colItems, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-6">
              {colItems.map(({ group, gIdx }) => {
                const item = getActiveGroupItem(group)
                const isMio = item.source === 'mio'
                const hasDepth = hasPoseDepthMap(item)
                const isFlipped = Boolean(flippedIds[group.key])
                const activeLayerIsDepth = hasDepth && (isFlipped ? !poseDepthMode : poseDepthMode)
                const picked = recipe.pose?.id === item.id && Boolean(recipe.pose?.useDepth) === activeLayerIsDepth
                const accent = getPoseAccent(group.category, group.system, gIdx)
                const bounds = getPoseFrameBounds(item.id)
                return (
                  <GalleryHoloCard
                    key={group.key}
                    title={group.name}
                    index={gIdx % 60}
                    picked={picked}
                    flipped={isFlipped}
                    hideFlip={!hasDepth}
                    accent={accent}
                    flipAriaLabel="翻转查看深度图"
                    onFlipToggle={() => setFlippedIds((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                    onPickToggle={() => togglePose({ ...item, useDepth: activeLayerIsDepth })}
                    onOpenViewer={() => openViewer({ groupIndex: gIdx, item, depth: activeLayerIsDepth })}
                    media={
                      isMio ? (
                        <div className="relative aspect-square w-full overflow-hidden bg-[#F4F1EA] dark:bg-[#232328]">
                          <img
                            src={referenceImageUrl(poseThumbPath(item, false))}
                            alt={group.name}
                            loading="lazy"
                            decoding="async"
                            className="pointer-events-none block size-full select-none object-contain"
                          />
                        </div>
                      ) : (
                        <div
                          style={{ aspectRatio: `${POSE_THUMB_WIDTH} / ${bounds.cropH}` }}
                          className={cn(
                            'relative w-full overflow-hidden transition-[aspect-ratio] duration-300',
                            poseDepthMode ? 'bg-[#2B2B32]' : 'bg-white'
                          )}
                        >
                          <img
                            src={referenceImageUrl(poseThumbPath(item, poseDepthMode))}
                            alt={group.name}
                            loading="lazy"
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: `${-(bounds.y1 / bounds.cropH) * 100}%`,
                              width: '100%',
                              height: `${(POSE_THUMB_HEIGHT / bounds.cropH) * 100}%`,
                              maxWidth: 'none',
                            }}
                            className="pointer-events-none block select-none object-cover"
                          />
                        </div>
                      )
                    }
                    backMedia={
                      <div
                        className={cn(
                          'relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl',
                          !poseDepthMode ? 'bg-[#2B2B32]' : 'bg-white'
                        )}
                      >
                        <img
                          src={referenceImageUrl(poseThumbPath(item, !poseDepthMode))}
                          alt={group.name}
                          className="h-full w-full object-contain"
                        />
                        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-xs">
                          {!poseDepthMode ? '深度图' : '素体白模'}
                        </span>
                      </div>
                    }
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {shown < totalCount && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setShown((s) => s + 60)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-6 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98]"
          >
            <SparklesIcon className="size-3.5 text-muted-foreground" />
            加载更多姿势（剩余 {totalCount - shown} 组）
          </button>
        </div>
      )}

      {/* 5 视角卡牌堆叠赏析与高清预览弹窗 */}
      {viewer && (() => {
        const grp = filteredGroups[viewer.groupIndex]
        const it = viewer.item
        const isMio = it.source === 'mio'
        const hasDepth = hasPoseDepthMap(it)
        const viewerDepth = hasDepth ? (viewer.depth ?? poseDepthMode) : false
        const picked = recipe.pose?.id === it.id && Boolean(recipe.pose?.useDepth) === viewerDepth
        const activeImgPath = poseImagePath(it, viewerDepth)
        const activeImgUrl = referenceImageUrl(activeImgPath)
        const accent = getPoseAccent(it.分类, it.体系)
        const stackItems = grp ? ANGLES.map((a) => grp.angles[a]).filter(Boolean) : [it]
        const hasMultiAngles = stackItems.length > 1
        const activeAngleIdx = Math.max(0, stackItems.findIndex((x) => x.id === it.id))
        const effectiveStageMode = viewerStageMode === 'stack' && !hasMultiAngles ? '3d' : viewerStageMode
        const stageTabItems: ShowcaseStageTabItem<'3d' | 'stack' | 'zoom'>[] = [
          { id: '3d', label: '3D 卡牌', icon: BoxIcon },
          ...(hasMultiAngles ? [{ id: 'stack' as const, label: '叠牌视角', icon: LayersIcon }] : []),
          { id: 'zoom', label: '细节缩放', icon: ZoomInIcon },
        ]
        const switchGroup = (delta: 1 | -1) => {
          if (filteredGroups.length <= 1) return
          const nextIdx = (viewer.groupIndex + delta + filteredGroups.length) % filteredGroups.length
          const nextGrp = filteredGroups[nextIdx]
          const nextItem = nextGrp.angles[it.角度] || nextGrp.order[0]
          setViewer((prev) => ({ groupIndex: nextIdx, item: nextItem, dir: delta, depth: prev?.depth }))
        }

        return (
          <ShowcaseDialog
            open={viewerOpen}
            onOpenChange={(o) => {
              setViewerOpen(o)
              if (!o) setViewerStageMode('3d')
            }}
            accent={accent}
            categoryLabel={it.分类}
            secondaryTag={it.角度}
            title={it.姿势名称}
            picked={picked}
            pickLabel={
              picked
                ? '已在配方中（点击移除）'
                : hasDepth
                  ? `锁入角色配方（${viewerDepth ? '深度图' : '白模'}）`
                  : '锁入角色配方'
            }
            onTogglePick={() => togglePose({ ...it, useDepth: viewerDepth })}
            downloadHref={activeImgUrl}
            downloadName={downloadFileName(it.id, activeImgUrl, isMio ? 'jpg' : viewerDepth ? 'webp' : 'png')}
            downloadExternal={isMio}
            downloadLabel={isMio ? '前往来源原图' : '下载高清原图'}
            externalHref={isMio ? it.来源地址 || activeImgUrl : activeImgUrl}
            externalLabel={isMio ? '原作者站点' : '新窗口打开'}
            stageTopLeft={
              <ShowcaseStageTabs
                layoutId="pose-stage-tab"
                value={effectiveStageMode}
                onChange={setViewerStageMode}
                items={stageTabItems}
              />
            }
            stageContent={
              effectiveStageMode === 'zoom' ? (
                <div className="w-full pt-2">
                  <ZoomViewport
                    imageUrl={activeImgUrl}
                    alt={it.姿势名称}
                    className="min-h-0 h-[56dvh] rounded-2xl border border-border bg-card dark:border-white/12 dark:bg-[#161620] p-3"
                  />
                </div>
              ) : effectiveStageMode === 'stack' && hasMultiAngles ? (
                <div className="h-[360px] w-[270px] pl-3 pt-2 sm:h-[420px] sm:w-[315px]">
                  <Stack
                    key={`${grp?.key || it.id}-${viewerDepth ? 'depth' : 'white'}`}
                    layout="fan"
                    visible={stackItems.length}
                    spread={0.44}
                    depth={0.46}
                    radius={22}
                    frame={4}
                    frameColor={viewerDepth ? '#2B2B32' : '#F4F4F6'}
                    tilt={22}
                    speed={1.08}
                    sendToBackOnClick
                    objectFit="contain"
                    activeIndex={activeAngleIdx}
                    onChange={(nextIdx) => {
                      const nextItem = stackItems[nextIdx]
                      if (nextItem && nextItem.id !== it.id) {
                        const dir: 1 | -1 = nextIdx < activeAngleIdx ? -1 : 1
                        setViewer((prev) => ({ groupIndex: viewer.groupIndex, item: nextItem, dir, depth: prev?.depth }))
                      }
                    }}
                    cards={stackItems.map((angleItem, idx) => (
                      <div
                        key={angleItem.id}
                        className={cn(
                          'relative h-full w-full overflow-hidden rounded-[18px]',
                          viewerDepth ? 'bg-[#2B2B32]' : 'bg-white'
                        )}
                      >
                        <img
                          src={referenceImageUrl(poseImagePath(angleItem, viewerDepth))}
                          alt={`${angleItem.姿势名称} · ${angleItem.角度}`}
                          draggable={false}
                          className="h-full w-full object-contain"
                        />
                        <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center justify-between">
                          <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
                            {angleItem.角度}
                          </span>
                          <span className="rounded-full bg-black/75 px-2 py-0.5 font-mono text-xs text-white/95 ring-1 ring-white/15 backdrop-blur-md">
                            {idx + 1}/{stackItems.length}
                          </span>
                        </div>
                      </div>
                    ))}
                  />
                </div>
              ) : (
                <div className="relative -mx-6 flex w-[calc(100%+3rem)] items-center justify-center">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-10 top-1/2 h-72 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.065)_0%,transparent_70%)] blur-xl"
                  />
                  {hasMultiAngles && (
                    <>
                      <button
                        type="button"
                        aria-label="上一视角"
                        onClick={() => {
                          const prev = stackItems[(activeAngleIdx - 1 + stackItems.length) % stackItems.length]
                          setViewer((v) => ({ groupIndex: viewer.groupIndex, item: prev, dir: -1, depth: v?.depth }))
                        }}
                        className="absolute top-1/2 left-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                      >
                        <ChevronLeftIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="下一视角"
                        onClick={() => {
                          const next = stackItems[(activeAngleIdx + 1) % stackItems.length]
                          setViewer((v) => ({ groupIndex: viewer.groupIndex, item: next, dir: 1, depth: v?.depth }))
                        }}
                        className="absolute top-1/2 right-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                      >
                        <ChevronRightIcon className="size-4" />
                      </button>
                    </>
                  )}
                  <GlowCard3D
                    imageUrl={activeImgUrl}
                    alt={`${it.姿势名称} · ${it.角度}`}
                    direction={viewer.dir || 1}
                  />
                </div>
              )
            }
            stageFooter={
              effectiveStageMode !== 'zoom' ? (
                <>
                  {hasMultiAngles && (
                    <div className="flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1.5 backdrop-blur-md">
                      <div className="flex items-center gap-1.5">
                        {stackItems.map((angleItem, idx) => {
                          const active = idx === activeAngleIdx
                          return (
                            <button
                              key={angleItem.id}
                              type="button"
                              aria-label={`切换到${angleItem.角度}`}
                              onClick={() => {
                                const dir: 1 | -1 = idx < activeAngleIdx ? -1 : 1
                                setViewer((v) => ({ groupIndex: viewer.groupIndex, item: angleItem, dir, depth: v?.depth }))
                              }}
                              className={cn(
                                'h-2 rounded-full transition-all duration-300',
                                active ? 'w-6 bg-foreground' : 'w-2 bg-muted-foreground/35 hover:bg-muted-foreground/65'
                              )}
                            />
                          )
                        })}
                      </div>
                      <span className="pl-1 font-mono text-xs text-muted-foreground">
                        {it.角度} · {activeAngleIdx + 1}/{stackItems.length}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {effectiveStageMode === 'stack'
                      ? '点击或拖拽牌面丝滑切换多视角'
                      : '悬停倾斜 · 按住拖拽旋转 · ←/→ 换姿势 · ↑/↓ 切视角'}
                  </p>
                </>
              ) : null
            }
            sidebarBody={
              <div className="space-y-5">
                {hasDepth && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground">参考底图类型</div>
                    <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-muted/45 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPoseDepthMode(false)
                          setViewer((v) => (v ? { ...v, depth: false } : v))
                          if (grp) setFlippedIds((prev) => ({ ...prev, [grp.key]: false }))
                        }}
                        className={cn(
                          'rounded-xl py-2 text-xs font-medium transition-all',
                          !viewerDepth ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        3D 素体白模
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPoseDepthMode(true)
                          setViewer((v) => (v ? { ...v, depth: true } : v))
                          if (grp) setFlippedIds((prev) => ({ ...prev, [grp.key]: false }))
                        }}
                        className={cn(
                          'rounded-xl py-2 text-xs font-medium transition-all',
                          viewerDepth ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        深度图
                      </button>
                    </div>
                  </div>
                )}

                {hasMultiAngles && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium tracking-wide text-muted-foreground">快速切换视角</span>
                      <span className="font-mono text-muted-foreground">← / →</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {stackItems.map((angItem, idx) => {
                        const isCurrent = angItem.id === it.id
                        return (
                          <button
                            key={angItem.id}
                            type="button"
                            onClick={() => {
                              const dir: 1 | -1 = idx < activeAngleIdx ? -1 : 1
                              setViewer((v) => ({ groupIndex: viewer.groupIndex, item: angItem, dir, depth: v?.depth }))
                            }}
                            className={cn(
                              'rounded-xl py-2 text-xs font-medium transition-all',
                              isCurrent
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            {angItem.角度}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium tracking-wide text-muted-foreground">姿势档案</span>
                      {filteredGroups.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="上一组姿势"
                            onClick={() => switchGroup(-1)}
                            className="flex size-6 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChevronLeftIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="下一组姿势"
                            onClick={() => switchGroup(1)}
                            className="flex size-6 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChevronRightIcon className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {filteredGroups.length > 1 && (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {viewer.groupIndex + 1} / {filteredGroups.length}
                      </span>
                    )}
                  </div>
                  <dl className="grid grid-cols-[68px_1fr] gap-y-2 rounded-2xl border border-border bg-muted/45 p-3.5 text-xs">
                    <dt className="text-muted-foreground">编号</dt>
                    <dd className="font-mono text-foreground">{it.id}</dd>
                    <dt className="text-muted-foreground">动作体系</dt>
                    <dd className="text-foreground">{it.体系}</dd>
                    <dt className="text-muted-foreground">动作分类</dt>
                    <dd className="text-foreground">{it.分类}</dd>
                    <dt className="text-muted-foreground">当前视角</dt>
                    <dd className="text-foreground">{it.角度}</dd>
                    <dt className="text-muted-foreground">底图模式</dt>
                    <dd className="text-foreground">
                      {isMio ? '素体人偶' : viewerDepth ? '深度图' : '素体白模'}
                    </dd>
                    <dt className="text-muted-foreground">可用视角</dt>
                    <dd className="font-mono text-foreground">{stackItems.length} 视角</dd>
                    <dt className="text-muted-foreground">来源</dt>
                    <dd className="truncate text-foreground">{it.来源 || 'ギア（@giaaibusi）'}</dd>
                  </dl>
                </div>
              </div>
            }
          />
        )
      })()}

      {/* 底部来源说明 */}
      <footer className="space-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <p>
          <a href="https://ai-pose-gallery.pages.dev/" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline hover:opacity-80">
            ギア · 素体白模与深度图
          </a>
          ：ギア（@giaaibusi）基础人体动态与 5 视角深度图参考，源自原作者公开图集并作中文本地化整理。
        </p>
        <p>
          <a href={MIO_ARCHIVE_ORIGIN} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline hover:opacity-80">
            {MIO_SOURCE_LABEL}
          </a>
          ：{MIO_COPYRIGHT_NOTICE}
        </p>
      </footer>

      <PoseFilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        line={activeLine}
        onSelectLine={(next) => {
          setLine(next)
          setCategory('all')
          setShown(60)
        }}
        sourceFilter={sourceFilter}
        onSelectSource={(next) => {
          setSourceFilter(next)
          setCategory('all')
          setShown(60)
        }}
        sourceOptions={sourceOptions}
        category={category}
        onSelectCategory={(next) => {
          setCategory(next)
          setShown(60)
        }}
        angle={angle}
        onSelectAngle={(next) => {
          setAngle(next)
          setShown(60)
        }}
        poseDepthMode={poseDepthMode}
        onSetDepthMode={setPoseDepthMode}
        totalCount={baseGroups.length}
        lineOptions={lineOptions}
        categoryOptions={categoryOptions}
        angleCounts={angleCounts}
        resultCount={totalCount}
        onReset={resetFilters}
      />
      <ScrollToTopButton />
    </div>
  )
}
