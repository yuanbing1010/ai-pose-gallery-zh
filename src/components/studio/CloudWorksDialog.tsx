import { useMemo, useState } from 'react'
import {
  BanIcon,
  CheckIcon,
  CheckSquareIcon,
  CircleAlertIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  ImagePlusIcon,
  InfoIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getStudioArtist, STUDIO_ARTISTS } from '@/lib/artists'
import { downloadFileName } from '@/lib/recipeImages'
import { formatJobDuration, formatShortTime } from '@/lib/studioPromptChips'
import { cn } from '@/lib/utils'
import type { GenerationHistoryItem } from '@/types/gallery'
import type { ImageProviderId } from '../../../shared/studio'

type StatusFilter = 'all' | 'succeeded' | 'processing' | 'queued' | 'failed'

export interface CloudWorksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: GenerationHistoryItem[]
  foregroundJobId: string | null
  cancellingJobIds: Record<string, boolean>
  onRefresh: () => Promise<void>
  onOpenDetail: (item: GenerationHistoryItem) => void
  onFocusMonitor: (jobId: string) => void
  onCancelQueued: (jobId: string) => Promise<boolean>
  onCompare: (item: GenerationHistoryItem) => void
  onApplyRecipe: (item: GenerationHistoryItem) => void
  onRegenerate: (item: GenerationHistoryItem) => void
  onUseAsExtraRef: (item: GenerationHistoryItem) => void
  onRequestDelete: (item: GenerationHistoryItem) => void
  onBatchDelete: (ids: string[]) => Promise<void>
}

export function CloudWorksDialog({
  open,
  onOpenChange,
  history,
  foregroundJobId,
  cancellingJobIds,
  onRefresh,
  onOpenDetail,
  onFocusMonitor,
  onCancelQueued,
  onCompare,
  onApplyRecipe,
  onRegenerate,
  onUseAsExtraRef,
  onRequestDelete,
  onBatchDelete,
}: CloudWorksDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [providerFilter, setProviderFilter] = useState<'all' | ImageProviderId>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  const counts = useMemo(() => {
    const map = { all: history.length, succeeded: 0, processing: 0, queued: 0, failed: 0 }
    for (const item of history) {
      if (item.status === 'succeeded') map.succeeded += 1
      else if (item.status === 'processing') map.processing += 1
      else if (item.status === 'queued') map.queued += 1
      else map.failed += 1
    }
    return map
  }, [history])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return history.filter((item) => {
      if (statusFilter === 'succeeded' && item.status !== 'succeeded') return false
      if (statusFilter === 'processing' && item.status !== 'processing') return false
      if (statusFilter === 'queued' && item.status !== 'queued') return false
      if (
        statusFilter === 'failed' &&
        item.status !== 'failed' &&
        item.status !== 'cancelled'
      ) {
        return false
      }
      if (providerFilter !== 'all' && item.provider !== providerFilter) return false
      if (!q) return true
      const artist = getStudioArtist(item.provider)
      const haystack = [
        item.recipeSummary,
        item.prompt,
        item.snapshot?.sceneNote || '',
        item.profileName || '',
        item.model,
        artist.name,
        item.aspectRatio,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [history, searchQuery, statusFilter, providerFilter])

  const deletableFilteredIds = useMemo(
    () =>
      filteredItems
        .filter((item) => item.status !== 'processing' && item.status !== 'queued')
        .map((item) => item.id),
    [filteredItems]
  )

  const hasActiveFilter =
    searchQuery.trim().length > 0 || statusFilter !== 'all' || providerFilter !== 'all'

  const resetFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setProviderFilter('all')
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleBatchMode = () => {
    setBatchMode((prev) => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  const handleSelectAllFiltered = () => {
    if (
      deletableFilteredIds.length > 0 &&
      deletableFilteredIds.every((id) => selectedIds.has(id))
    ) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(deletableFilteredIds))
  }

  const handleBatchDeleteConfirm = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0 || batchDeleting) return
    setBatchDeleting(true)
    try {
      await onBatchDelete(ids)
      setSelectedIds(new Set())
      setBatchMode(false)
    } finally {
      setBatchDeleting(false)
    }
  }

  const statusTabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'succeeded', label: '已完成', count: counts.succeeded },
    { id: 'processing', label: '绘制中', count: counts.processing },
    { id: 'queued', label: '排队中', count: counts.queued },
    { id: 'failed', label: '失败/取消', count: counts.failed },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[96vw] max-w-5xl flex-col gap-3 overflow-hidden rounded-[24px] p-4 sm:max-w-5xl sm:p-5">
        {/* 顶栏：左标题 + 右侧刷新与批量管理 */}
        <DialogHeader className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 pr-8 text-left">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <DialogTitle className="text-base font-extrabold tracking-tight sm:text-lg">
              云端作品集 ({history.length})
            </DialogTitle>
            <span className="text-xs text-muted-foreground">
              点击缩略图查看任务配方详情与提示词
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
              className="h-8 rounded-full px-3 text-xs"
            >
              <RefreshCwIcon className={cn('size-3.5', refreshing && 'animate-spin')} />
              <span>刷新</span>
            </Button>
            {history.length > 0 && (
              <Button
                type="button"
                variant={batchMode ? 'default' : 'outline'}
                size="sm"
                onClick={toggleBatchMode}
                className="h-8 rounded-full px-3 text-xs"
              >
                <CheckSquareIcon className="size-3.5" />
                <span>{batchMode ? '退出批量' : '批量管理'}</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* 搜索与状态筛选栏 */}
        {history.length > 0 && (
          <div className="shrink-0 space-y-2 rounded-2xl border border-border/80 bg-[#FAF8F4] p-2.5 dark:bg-muted/30">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索配方、补充细节、提示词或画笔…"
                  className="h-8 rounded-xl bg-card pr-8 pl-8 text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Select
                  value={providerFilter}
                  onValueChange={(v) => setProviderFilter(v as 'all' | ImageProviderId)}
                >
                  <SelectTrigger
                    aria-label="按画师筛选"
                    className="h-8 w-full rounded-xl bg-card text-xs sm:w-40"
                  >
                    <SelectValue placeholder="全部画师" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部画师</SelectItem>
                    {STUDIO_ARTISTS.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilter && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-8 shrink-0 rounded-xl px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    重置
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="radiogroup"
                aria-label="按生成状态筛选"
                className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto"
              >
                {statusTabs.map((tab) => {
                  const active = statusFilter === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStatusFilter(tab.id)}
                      className={cn(
                        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border/80 bg-card text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          'font-mono text-xs tabular-nums',
                          active ? 'text-background/80' : 'text-muted-foreground/80'
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {batchMode && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deletableFilteredIds.length === 0}
                    onClick={handleSelectAllFiltered}
                    className="h-7 rounded-full bg-card px-2.5 text-xs"
                  >
                    {deletableFilteredIds.length > 0 &&
                    deletableFilteredIds.every((id) => selectedIds.has(id))
                      ? '取消全选'
                      : `全选可删 (${deletableFilteredIds.length})`}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={selectedIds.size === 0 || batchDeleting}
                    onClick={() => void handleBatchDeleteConfirm()}
                    className="h-7 rounded-full px-3 text-xs font-semibold"
                  >
                    {batchDeleting ? '删除中…' : `删除选中 (${selectedIds.size})`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 主体列表区 */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <SparklesIcon className="size-7 text-[#E5A918]" />
              <div className="text-sm font-bold text-foreground">暂无云端生成作品</div>
              <p className="text-xs text-muted-foreground">
                在角色合成台生成第一张角色图后，将自动存档至此并支持跨设备回看。
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-center">
              <SearchIcon className="size-7 text-muted-foreground/60" />
              <div className="text-sm font-bold text-foreground">没有匹配的作品记录</div>
              <p className="text-xs text-muted-foreground">试试调整搜索关键词、状态或画师筛选。</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="rounded-full text-xs"
              >
                清除全部筛选
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredItems.map((h) => {
                const artist = getStudioArtist(h.provider)
                const duration = formatJobDuration(h.startedAt ?? h.createdAt, h.finishedAt)
                const sceneNote = h.snapshot?.sceneNote?.trim()
                const deletable = h.status !== 'processing' && h.status !== 'queued'
                const selected = selectedIds.has(h.id)

                return (
                  <article
                    key={h.id}
                    className={cn(
                      'group flex overflow-hidden rounded-2xl border bg-card transition-colors',
                      selected
                        ? 'border-[#D9381E] ring-1 ring-[#D9381E]/60'
                        : 'border-border/85 hover:border-foreground/25'
                    )}
                  >
                    {/* 左侧封面舞台（固定宽高比例，点击进详情或批量勾选） */}
                    <div className="relative w-34 shrink-0 overflow-hidden bg-[#FAF8F4] sm:w-42 dark:bg-muted/35">
                      {h.status === 'succeeded' && h.imageUrl ? (
                        <button
                          type="button"
                          aria-label={
                            batchMode
                              ? `选择作品：${h.recipeSummary}`
                              : `查看详情：${h.recipeSummary}`
                          }
                          onClick={() => {
                            if (batchMode && deletable) toggleSelect(h.id)
                            else onOpenDetail(h)
                          }}
                          className="block h-full min-h-[168px] w-full cursor-pointer overflow-hidden"
                        >
                          <img
                            src={h.imageUrl}
                            alt={h.recipeSummary}
                            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
                          />
                        </button>
                      ) : h.status === 'processing' ? (
                        <div className="flex h-full min-h-[168px] flex-col items-center justify-center gap-2 p-3 text-center">
                          <LoaderCircleIcon className="size-6 animate-spin text-[#E5A918]" />
                          <span className="text-xs font-semibold text-foreground">
                            {h.liveProgress?.message || '绘制中…'}
                          </span>
                          {foregroundJobId !== h.id ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onOpenChange(false)
                                onFocusMonitor(h.id)
                              }}
                              className="h-7 rounded-full border-[#E5A918]/55 px-2.5 text-xs font-semibold hover:bg-[#E5A918]/10"
                            >
                              监视器查看
                            </Button>
                          ) : (
                            <span className="rounded-full bg-[#E5A918]/15 px-2 py-0.5 text-xs font-semibold text-[#7A5200] dark:text-[#F5C443]">
                              前台展示中
                            </span>
                          )}
                        </div>
                      ) : h.status === 'queued' ? (
                        <div className="flex h-full min-h-[168px] flex-col items-center justify-center gap-1.5 p-3 text-center">
                          <ClockIcon className="size-6 text-[#B88300] dark:text-[#E5A918]" />
                          <span className="text-xs font-bold text-foreground">
                            第 {h.queueInfo?.position ?? '—'} 位
                          </span>
                          <span className="text-xs text-muted-foreground">
                            前有 {h.queueInfo?.aheadCount ?? 0} 项
                          </span>
                          {foregroundJobId !== h.id && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onOpenChange(false)
                                onFocusMonitor(h.id)
                              }}
                              className="mt-1 h-7 rounded-full px-2 text-xs"
                            >
                              监视器查看
                            </Button>
                          )}
                        </div>
                      ) : h.status === 'cancelled' ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (batchMode && deletable) toggleSelect(h.id)
                            else onOpenDetail(h)
                          }}
                          className="flex h-full min-h-[168px] w-full flex-col items-center justify-center gap-1.5 p-3 text-center"
                        >
                          <BanIcon className="size-5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-foreground">已取消排队</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (batchMode && deletable) toggleSelect(h.id)
                            else onOpenDetail(h)
                          }}
                          className="flex h-full min-h-[168px] w-full flex-col items-center justify-center gap-1.5 p-3 text-center"
                        >
                          <CircleAlertIcon className="size-5 text-destructive" />
                          <span className="text-xs font-semibold text-destructive">生成失败</span>
                        </button>
                      )}

                      {/* 左上角磨砂时间戳胶囊 */}
                      <span className="pointer-events-none absolute top-2 left-2 rounded-full border border-border/60 bg-background/88 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-foreground backdrop-blur-sm">
                        {formatShortTime(h.createdAt)}
                      </span>

                      {/* 批量模式下右上角勾选徽章 */}
                      {batchMode && deletable && (
                        <button
                          type="button"
                          aria-label={selected ? '取消选中' : '选中此项'}
                          onClick={() => toggleSelect(h.id)}
                          className={cn(
                            'absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border transition',
                            selected
                              ? 'border-[#D9381E] bg-[#D9381E] text-white'
                              : 'border-border bg-background/90 text-transparent hover:border-foreground'
                          )}
                        >
                          <CheckIcon className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 右侧结构化元信息与快捷操作 */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(h)}
                            className="min-w-0 flex-1 text-left text-xs font-extrabold leading-snug text-foreground hover:underline sm:text-sm"
                          >
                            <span className="line-clamp-1">{h.recipeSummary}</span>
                          </button>
                        </div>

                        {/* 标签行：画师/画笔、画幅分辨率、耗时、积分 */}
                        <div className="flex flex-wrap items-center gap-1 text-xs">
                          <span className="rounded-md border border-border/80 bg-[#FAF8F4] px-1.5 py-0.5 font-medium text-foreground dark:bg-muted/40">
                            {h.profileName || artist.name}
                          </span>
                          <span className="rounded-md border border-border/80 bg-[#FAF8F4] px-1.5 py-0.5 font-mono text-foreground dark:bg-muted/40">
                            {h.aspectRatio}
                            {h.resolution ? ` · ${h.resolution}` : ''}
                          </span>
                          {duration && (
                            <span className="rounded-md border border-border/80 bg-[#FAF8F4] px-1.5 py-0.5 font-mono tabular-nums text-muted-foreground dark:bg-muted/40">
                              {duration}
                            </span>
                          )}
                          <span
                            className={cn(
                              'rounded-md px-1.5 py-0.5 font-mono font-semibold tabular-nums',
                              h.creditsRefunded > 0
                                ? 'bg-[#116E65]/12 text-[#116E65] dark:text-[#4FD1C5]'
                                : 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#F5C443]'
                            )}
                          >
                            {h.creditsRefunded > 0
                              ? `已退 ${h.creditsRefunded}`
                              : `${h.creditsCost} 积分`}
                          </span>
                        </div>

                        {/* 细节或错误摘要 */}
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {h.status === 'failed' || h.status === 'cancelled'
                            ? h.errorMessage || '任务未生成成图'
                            : sceneNote || h.prompt || '无额外细节描述'}
                        </p>
                      </div>

                      {/* 底部快捷图标操作栏 */}
                      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/70 pt-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            title="查看任务信息与提示词"
                            aria-label="查看任务信息与提示词"
                            onClick={() => onOpenDetail(h)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/75 bg-background px-2 text-xs font-medium text-foreground transition hover:bg-muted"
                          >
                            <InfoIcon className="size-3.5" />
                            <span>详情</span>
                          </button>

                          {h.snapshot?.recipe && (
                            <>
                              <button
                                type="button"
                                title="套用该作品的配方与参数"
                                aria-label="套用配方"
                                onClick={() => onApplyRecipe(h)}
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-border/75 bg-background text-foreground transition hover:bg-muted"
                              >
                                <RotateCcwIcon className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                title="用相同配方再来一张"
                                aria-label="同配重绘"
                                onClick={() => {
                                  onOpenChange(false)
                                  onRegenerate(h)
                                }}
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-border/75 bg-background text-[#D9381E] transition hover:bg-[#D9381E]/10"
                              >
                                <SparklesIcon className="size-3.5" />
                              </button>
                            </>
                          )}

                          {h.status === 'succeeded' && h.imageUrl && (
                            <>
                              <button
                                type="button"
                                title="设为附加参考图继续迭代"
                                aria-label="设为附加参考图"
                                onClick={() => {
                                  onUseAsExtraRef(h)
                                  onOpenChange(false)
                                }}
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-border/75 bg-background text-[#116E65] transition hover:bg-[#116E65]/10 dark:text-[#4FD1C5]"
                              >
                                <ImagePlusIcon className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                title="与参考图缩放对比"
                                aria-label="对比参考"
                                onClick={() => onCompare(h)}
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-border/75 bg-background text-foreground transition hover:bg-muted"
                              >
                                <EyeIcon className="size-3.5" />
                              </button>
                              <a
                                href={h.imageUrl}
                                download={downloadFileName(`character-${h.id}`, h.imageUrl)}
                                title="下载原图"
                                aria-label="下载原图"
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-border/75 bg-background text-foreground transition hover:bg-muted"
                              >
                                <DownloadIcon className="size-3.5" />
                              </a>
                            </>
                          )}
                        </div>

                        {h.status === 'queued' ? (
                          <button
                            type="button"
                            disabled={Boolean(cancellingJobIds[h.id])}
                            onClick={() => void onCancelQueued(h.id)}
                            className="inline-flex h-7 items-center rounded-lg bg-destructive/12 px-2 text-xs font-semibold text-destructive transition hover:bg-destructive/20 disabled:opacity-40"
                          >
                            {cancellingJobIds[h.id] ? '取消中…' : '取消排队'}
                          </button>
                        ) : deletable ? (
                          <button
                            type="button"
                            title="删除此作品"
                            aria-label="删除此作品"
                            onClick={() => onRequestDelete(h)}
                            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/12 hover:text-destructive"
                          >
                            <Trash2Icon className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
