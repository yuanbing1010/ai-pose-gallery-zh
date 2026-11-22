import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  BoxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlameIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { portraitsQuery } from '@/api/gallery'
import { PortraitCard } from '@/components/cards/PortraitCard'
import { EmptyState } from '@/components/common/EmptyState'
import { GalleryDensityControl } from '@/components/common/GalleryDensityControl'
import { HorizontalFilterStrip } from '@/components/common/HorizontalFilterStrip'
import { ShowcaseDialog, ShowcaseStageTabs } from '@/components/common/ShowcaseDialog'
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton'
import { ZoomViewport } from '@/components/common/ZoomViewport'
import { GlowCard3D } from '@/components/costumes/GlowCard3D'
import { PortraitFilterModal } from '@/components/portraits/PortraitFilterModal'
import { Skeleton } from '@/components/ui/skeleton'
import { getPortraitAccent } from '@/lib/cardAccents'
import { galleryGridClassName, useGalleryDesktopCols } from '@/lib/galleryDensity'
import { downloadFileName, referenceImageUrl } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'

export interface PortraitsSearchParams {
  section?: '正脸参考' | '造型氛围'
  hair?: string
  style?: string
  hot?: boolean
  q?: string
}

export const Route = createFileRoute('/portraits')({
  staticData: { title: '人像颜值库' },
  validateSearch: (raw: Record<string, unknown>): PortraitsSearchParams => {
    const out: PortraitsSearchParams = {}
    if (raw.section === '正脸参考' || raw.section === '造型氛围') out.section = raw.section
    if (typeof raw.hair === 'string' && raw.hair.trim()) out.hair = raw.hair.trim()
    if (typeof raw.style === 'string' && raw.style.trim() && raw.style !== 'all') {
      out.style = raw.style.trim()
    }
    if (raw.hot === true || raw.hot === 'true' || raw.hot === '1') out.hot = true
    if (typeof raw.q === 'string' && raw.q) out.q = raw.q
    return out
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(portraitsQuery),
  pendingComponent: () => (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36 rounded-full" />
          <Skeleton className="h-9 w-48 rounded-xl" />
          <Skeleton className="h-4 w-56 rounded-full" />
        </div>
        <Skeleton className="h-14 w-72 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, idx) => (
          <Skeleton key={idx} className="aspect-[4/5] rounded-[20px]" />
        ))}
      </div>
    </div>
  ),
  component: PortraitsPage,
})

const HAIRS = ['短发', '中发', '中长发', '长发'] as const

function PortraitsPage() {
  const { data: portraits } = useSuspenseQuery(portraitsQuery)
  const { recipe, togglePortrait } = useStudio()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const section: '' | '正脸参考' | '造型氛围' = search.section ?? ''
  const hair = search.hair ?? ''
  const styleName = search.style ?? 'all'
  const onlyHot = Boolean(search.hot)
  const query = search.q ?? ''

  const updateSearch = (patch: Partial<PortraitsSearchParams>) => {
    void navigate({
      search: (prev) => {
        const next: PortraitsSearchParams = { ...prev, ...patch }
        if (!next.section) delete next.section
        if (!next.hair) delete next.hair
        if (!next.style || next.style === 'all') delete next.style
        if (!next.hot) delete next.hot
        if (!next.q) delete next.q
        return next
      },
      replace: true,
    })
  }

  const setSection = (next: '' | '正脸参考' | '造型氛围') =>
    updateSearch({ section: next || undefined })
  const setHair = (next: string) => updateSearch({ hair: next || undefined })
  const setStyleName = (next: string) =>
    updateSearch({ style: next === 'all' ? undefined : next })
  const setOnlyHot = (updater: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof updater === 'function' ? updater(onlyHot) : updater
    updateSearch({ hot: nextVal || undefined })
  }
  const setQuery = (next: string) => updateSearch({ q: next || undefined })

  const [desktopCols, setDesktopCols] = useGalleryDesktopCols()
  const [shown, setShown] = useState(60)
  const [filterOpen, setFilterOpen] = useState(false)
  const [viewerNav, setViewerNav] = useState<{ index: number | null; dir: 1 | -1 }>({
    index: null,
    dir: 1,
  })
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerStageMode, setViewerStageMode] = useState<'3d' | 'zoom'>('3d')

  const viewerIndex = viewerNav.index
  const searchInputRef = useRef<HTMLInputElement>(null)

  const openViewer = (idx: number) => {
    setViewerNav({ index: idx, dir: 1 })
    setViewerOpen(true)
  }

  const sectionCounts = useMemo(
    () => ({
      正脸参考: portraits.filter((x) => x.分区 === '正脸参考').length,
      造型氛围: portraits.filter((x) => x.分区 === '造型氛围').length,
    }),
    [portraits]
  )

  const hairOptions = useMemo(() => {
    const sub = portraits.filter((p) => !section || p.分区 === section)
    return HAIRS.map((h) => ({
      label: h,
      count: sub.filter((p) => p.发长 === h).length,
    }))
  }, [portraits, section])

  const styleOptions = useMemo(() => {
    const sub = portraits.filter((p) => (!section || p.分区 === section) && (!hair || p.发长 === hair))
    const map = new Map<string, number>()
    for (const p of sub) {
      if (p.发型名称) map.set(p.发型名称, (map.get(p.发型名称) || 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([label, count]) => ({ label, count }))
  }, [portraits, section, hair])

  const hotCount = useMemo(
    () => portraits.filter((p) => p.热门 && (!section || p.分区 === section)).length,
    [portraits, section]
  )

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return portraits.filter((item) => {
      if (section && item.分区 !== section) return false
      if (hair && item.发长 !== hair) return false
      if (styleName !== 'all' && item.发型名称 !== styleName) return false
      if (onlyHot && !item.热门) return false
      if (q && !item.检索.toLowerCase().includes(q)) return false
      return true
    })
  }, [portraits, section, hair, styleName, onlyHot, q])

  const activeFilterCount =
    (section ? 1 : 0) +
    (hair ? 1 : 0) +
    (styleName !== 'all' ? 1 : 0) +
    (onlyHot ? 1 : 0)

  const hasActiveFilters = Boolean(activeFilterCount > 0 || query.trim())

  const allStyleCount = useMemo(() => {
    const names = new Set<string>()
    for (const p of portraits) {
      if (p.发型名称) names.add(p.发型名称)
    }
    return names.size
  }, [portraits])

  const resetFilters = () => {
    void navigate({ search: {}, replace: true })
    setShown(60)
  }

  const currentItem = viewerIndex !== null ? filtered[viewerIndex] : null

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
  }, [viewerOpen, viewerIndex, viewerStageMode, filtered.length])

  return (
    <div className="space-y-5">
      {/* 与服装库、姿势库统一的 StyleKit 式顶栏 + 分区统计矩阵 */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-px w-5 bg-foreground/40" aria-hidden="true" />
            <span>人物面部与发型风格参考</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            人像颜值库
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {allStyleCount} 款日系发型细分 · 当前匹配{' '}
            <span className="font-mono font-medium text-foreground">{filtered.length.toLocaleString('zh-CN')}</span> 张
          </p>
        </div>

        <div
          role="tablist"
          aria-label="人像画面分区"
          className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card [&>*:first-child]:col-span-2 sm:grid-cols-3 sm:divide-y-0 sm:[&>*:first-child]:col-span-1"
        >
          {(
            [
              { id: '', label: '全部人像', count: portraits.length },
              { id: '正脸参考', label: '正脸参考', count: sectionCounts.正脸参考 },
              { id: '造型氛围', label: '造型氛围', count: sectionCounts.造型氛围 },
            ] as const
          ).map((tab) => {
            const active = section === tab.id
            return (
              <button
                key={tab.id || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSection(tab.id)
                  setStyleName('all')
                  setShown(60)
                  setViewerOpen(false)
                }}
                className={cn(
                  'px-3.5 py-2.5 text-center transition-colors sm:px-5',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted/60'
                )}
              >
                <div className={cn('text-xs whitespace-nowrap', active ? 'opacity-80' : 'text-muted-foreground')}>
                  {tab.label}
                </div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {tab.count.toLocaleString('zh-CN')}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 与服装库、姿势库统一的控制栏：搜索 (/) + 筛选 (F) + Top 10 切换 + 单行横向发长/发型带 */}
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
              placeholder="搜索发型款式、发色或 ID（如：波波头、狼尾、空气刘海、挑染、韩式）…"
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

          <button
            type="button"
            aria-pressed={onlyHot}
            onClick={() => {
              setOnlyHot((v) => !v)
              setShown(60)
            }}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors active:scale-[0.98]',
              onlyHot
                ? 'border-[#E5A918] bg-[#E5A918] text-zinc-950'
                : 'border-border bg-card text-foreground hover:bg-muted'
            )}
          >
            <FlameIcon className="size-3.5" />
            <span>Top 10 人气</span>
          </button>

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

        {/* 单行横向发长 + 细分发型胶囊带 */}
        <HorizontalFilterStrip>
          {styleName !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setStyleName('all')
                setShown(60)
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <span>发型：{styleName}</span>
              <XIcon className="size-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setHair('')
              setStyleName('all')
              setShown(60)
            }}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              hair === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            全部发长
          </button>

          {hairOptions.map((h) => {
            const isActive = hair === h.label
            return (
              <button
                key={h.label}
                type="button"
                onClick={() => {
                  setHair(isActive ? '' : h.label)
                  setStyleName('all')
                  setShown(60)
                }}
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {h.label}
                <span className={cn('ml-1.5 font-mono text-xs', isActive ? 'opacity-80' : 'text-muted-foreground')}>{h.count}</span>
              </button>
            )
          })}

          {styleOptions.length > 0 && (
            <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
          )}

          {styleOptions.slice(0, 12).map((s) => {
            const isActive = styleName === s.label
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setStyleName(isActive ? 'all' : s.label)
                  setShown(60)
                }}
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {s.label}
                <span className={cn('ml-1.5 font-mono text-xs', isActive ? 'opacity-80' : 'text-muted-foreground')}>{s.count}</span>
              </button>
            )
          })}
        </HorizontalFilterStrip>
      </div>

      {/* 与服装库完全对齐的 4:5 架构画廊网格 */}
      {filtered.length === 0 ? (
        <EmptyState title="没有找到匹配的人像参考" description="试试更换发型关键词或重置筛选" />
      ) : (
        <div className={galleryGridClassName(desktopCols)}>
          {filtered.slice(0, shown).map((item, idx) => (
            <PortraitCard
              key={item.id}
              item={item}
              index={idx % 60}
              picked={recipe.portrait?.id === item.id}
              onTogglePick={() => togglePortrait(item)}
              onOpenViewer={() => openViewer(idx)}
            />
          ))}
        </div>
      )}

      {shown < filtered.length && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setShown((s) => s + 60)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-6 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98]"
          >
            <SparklesIcon className="size-3.5 text-muted-foreground" />
            加载更多人像（剩余 {(filtered.length - shown).toLocaleString('zh-CN')} 张）
          </button>
        </div>
      )}

      {/* 底部来源说明 */}
      <footer className="space-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <p>
          人像颜值与日系发型细分图集：精选正脸参考与造型氛围人像素材，支持按发长与细节发型检索并直接锁入角色合成台配方。
        </p>
      </footer>

      {/* 双栏命令筛选面板 */}
      <PortraitFilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        section={section}
        onSelectSection={(next) => {
          setSection(next)
          setStyleName('all')
          setShown(60)
        }}
        hair={hair}
        onSelectHair={(next) => {
          setHair(next)
          setStyleName('all')
          setShown(60)
        }}
        styleName={styleName}
        onSelectStyleName={(next) => {
          setStyleName(next)
          setShown(60)
        }}
        onlyHot={onlyHot}
        onSetOnlyHot={(next) => {
          setOnlyHot(next)
          setShown(60)
        }}
        totalCount={portraits.length}
        sectionCounts={sectionCounts}
        hairOptions={hairOptions}
        styleOptions={styleOptions}
        hotCount={hotCount}
        resultCount={filtered.length}
        onReset={resetFilters}
      />

      {/* 与服装库、姿势库完全统一的 ShowcaseDialog + GlowCard3D 详情弹框 */}
      {currentItem && viewerIndex !== null && (() => {
        const picked = recipe.portrait?.id === currentItem.id
        const accent = getPortraitAccent(currentItem.分区, currentItem.发长, currentItem.热门)
        const fullImageUrl = referenceImageUrl(currentItem.原图)

        return (
          <ShowcaseDialog
            open={viewerOpen}
            onOpenChange={(o) => {
              setViewerOpen(o)
              if (!o) setViewerStageMode('3d')
            }}
            accent={accent}
            categoryLabel={currentItem.分区}
            secondaryTag={currentItem.发长}
            title={currentItem.标题}
            picked={picked}
            pickLabel={picked ? '已在配方中（点击移除）' : '锁入角色配方'}
            onTogglePick={() => togglePortrait(currentItem)}
            downloadHref={fullImageUrl}
            downloadName={downloadFileName(currentItem.id, currentItem.原图, 'webp')}
            downloadLabel="下载高清原图"
            externalHref={fullImageUrl}
            externalLabel="新窗口打开"
            stageTopLeft={
              <ShowcaseStageTabs
                layoutId="portrait-stage-tab"
                value={viewerStageMode}
                onChange={setViewerStageMode}
                items={[
                  { id: '3d', label: '3D 卡牌', icon: BoxIcon },
                  { id: 'zoom', label: '细节缩放', icon: ZoomInIcon },
                ]}
              />
            }
            stageContent={
              viewerStageMode === '3d' ? (
                <div className="relative -mx-6 flex w-[calc(100%+3rem)] items-center justify-center">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-10 top-1/2 h-72 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.065)_0%,transparent_70%)] blur-xl"
                  />
                  {filtered.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="上一张人像"
                        onClick={() => setViewerNav({ index: (viewerIndex - 1 + filtered.length) % filtered.length, dir: -1 })}
                        className="absolute top-1/2 left-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                      >
                        <ChevronLeftIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="下一张人像"
                        onClick={() => setViewerNav({ index: (viewerIndex + 1) % filtered.length, dir: 1 })}
                        className="absolute top-1/2 right-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                      >
                        <ChevronRightIcon className="size-4" />
                      </button>
                    </>
                  )}
                  <GlowCard3D
                    imageUrl={fullImageUrl}
                    alt={currentItem.标题}
                    direction={viewerNav.dir}
                  />
                </div>
              ) : (
                <div className="w-full pt-2">
                  <ZoomViewport
                    imageUrl={fullImageUrl}
                    alt={currentItem.标题}
                    className="min-h-0 h-[56dvh] rounded-2xl border border-border bg-card dark:border-white/12 dark:bg-[#161620] p-3"
                  />
                </div>
              )
            }
            stageFooter={
              viewerStageMode !== 'zoom' ? (
                <>
                  {filtered.length > 1 && (
                    <span className="rounded-full border border-border bg-background/85 px-3 py-1 font-mono text-xs font-medium tabular-nums text-foreground backdrop-blur-md">
                      {viewerIndex + 1} / {filtered.length}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    悬停倾斜 · 按住拖拽旋转 · 左右箭头切牌
                  </p>
                </>
              ) : null
            }
            sidebarBody={
              <div className="space-y-5">
                {currentItem.热门 && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#E5A918]/15 px-3 py-1 text-xs font-semibold text-[#7A5200] ring-1 ring-[#E5A918]/30 dark:text-[#E5A918]">
                    <FlameIcon className="size-3.5" />
                    <span>Top 10 人气缪斯</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground">人像档案</div>
                  <dl className="grid grid-cols-[68px_1fr] gap-y-2 rounded-2xl border border-border bg-muted/45 p-3.5 text-xs">
                    <dt className="text-muted-foreground">编号</dt>
                    <dd className="font-mono text-foreground">{currentItem.id}</dd>
                    <dt className="text-muted-foreground">发型款式</dt>
                    <dd className="text-foreground">{currentItem.发型名称}</dd>
                    <dt className="text-muted-foreground">画面分区</dt>
                    <dd className="text-foreground">{currentItem.分区}</dd>
                    <dt className="text-muted-foreground">头发长度</dt>
                    <dd className="text-foreground">{currentItem.发长}</dd>
                    <dt className="text-muted-foreground">原图尺寸</dt>
                    <dd className="font-mono text-foreground">
                      {currentItem.宽} × {currentItem.高}
                    </dd>
                  </dl>
                </div>
              </div>
            }
          />
        )
      })()}
      <ScrollToTopButton />
    </div>
  )
}
