import { useEffect, useState } from 'react'
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { ArtistLogo } from '@/components/studio/StudioEmblems'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getEstimatedOutputDimensions, getStudioArtist } from '@/lib/artists'
import { comparisonReferences } from '@/lib/comparisonReferences'
import { toast } from '@/lib/notifications'
import { downloadFileName } from '@/lib/recipeImages'
import { formatFullDateTime, formatJobDuration } from '@/lib/studioPromptChips'
import { cn } from '@/lib/utils'
import { NONE_STYLE_PRESET, type StylePresetItem } from '../../../shared/studio'
import type { GenerationHistoryItem } from '@/types/gallery'

export interface WorkDetailDialogProps {
  item: GenerationHistoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  styleCatalog: StylePresetItem[]
  canPrev?: boolean
  canNext?: boolean
  onPrev?: () => void
  onNext?: () => void
  onZoom: (imageUrl: string) => void
  onCompare: (item: GenerationHistoryItem) => void
  onApplyRecipe: (item: GenerationHistoryItem) => void
  onRegenerate?: (item: GenerationHistoryItem) => void
  onUseAsExtraRef?: (item: GenerationHistoryItem) => void
  onFocusMonitor?: (jobId: string) => void
  onCancelQueued?: (jobId: string) => void
  onDelete: (item: GenerationHistoryItem) => void
}

const STATUS_META = {
  succeeded: {
    label: '已完成',
    dot: 'bg-[#116E65] dark:bg-[#4FD1C5]',
    pill: 'bg-[#116E65]/12 text-[#116E65] dark:text-[#4FD1C5]',
  },
  processing: {
    label: '绘制中',
    dot: 'animate-pulse bg-[#E5A918]',
    pill: 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#F5C443]',
  },
  queued: {
    label: '排队中',
    dot: 'bg-[#E5A918]',
    pill: 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#F5C443]',
  },
  failed: {
    label: '生成失败',
    dot: 'bg-destructive',
    pill: 'bg-destructive/12 text-destructive',
  },
  cancelled: {
    label: '已取消',
    dot: 'bg-muted-foreground/60',
    pill: 'bg-muted text-muted-foreground',
  },
} as const

export function WorkDetailDialog({
  item,
  open,
  onOpenChange,
  styleCatalog,
  canPrev = false,
  canNext = false,
  onPrev,
  onNext,
  onZoom,
  onCompare,
  onApplyRecipe,
  onRegenerate,
  onUseAsExtraRef,
  onFocusMonitor,
  onCancelQueued,
  onDelete,
}: WorkDetailDialogProps) {
  const [paramsExpanded, setParamsExpanded] = useState(true)
  const [copiedPromptForId, setCopiedPromptForId] = useState<string | null>(null)
  const [expandedPromptForId, setExpandedPromptForId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canPrev && onPrev) {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight' && canNext && onNext) {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, canPrev, canNext, onPrev, onNext])

  if (!item) return null

  const artist = getStudioArtist(item.provider)
  const statusMeta = STATUS_META[item.status] ?? STATUS_META.succeeded
  const styleItem =
    item.stylePreset === 'none'
      ? null
      : styleCatalog.find((s) => s.id === item.stylePreset) ?? null
  const styleLabel =
    item.stylePreset === 'none'
      ? NONE_STYLE_PRESET.label
      : styleItem?.label || item.stylePreset
  const dims = getEstimatedOutputDimensions(item.provider, item.aspectRatio, item.resolution)
  const durationLabel = formatJobDuration(item.startedAt ?? item.createdAt, item.finishedAt)
  const refs = comparisonReferences(item)
  const sceneNote = item.snapshot?.sceneNote?.trim() || ''
  const copyPayload = sceneNote
    ? `${item.recipeSummary}\n补充细节：${sceneNote}\n\n${item.prompt}`
    : item.prompt || item.recipeSummary

  const copiedPrompt = copiedPromptForId === item.id
  const promptExpanded = expandedPromptForId === item.id

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(copyPayload)
      setCopiedPromptForId(item.id)
      toast.success('已复制配方与提示词')
      window.setTimeout(() => {
        setCopiedPromptForId((curr) => (curr === item.id ? null : curr))
      }, 1800)
    } catch {
      toast.error('复制失败，请手动选中复制')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] w-[96vw] max-w-[980px] overflow-y-auto rounded-[24px] border border-border bg-card p-0 text-foreground shadow-2xl sm:max-w-[980px] md:overflow-hidden"
      >
        <div className="relative grid md:h-[min(86dvh,760px)] md:grid-cols-[1.28fr_360px]">
          {/* 左侧：暗房画框展示区 */}
          <div className="relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden bg-[#FAF8F4] p-4 pt-14 sm:min-h-[420px] sm:p-6 sm:pt-16 dark:bg-[#121210]">
            {/* 左上角尺寸/比例徽章 */}
            <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1.5 sm:top-4 sm:left-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 font-mono text-xs font-semibold text-foreground backdrop-blur-md">
                <span>{dims.label}</span>
                <span className="text-muted-foreground">·</span>
                <span>{item.aspectRatio}</span>
                {item.resolution && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span>{item.resolution}</span>
                  </>
                )}
              </span>
            </div>

            {/* 右上角快捷图片工具栏 */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 sm:top-4 sm:right-4">
              {item.status === 'succeeded' && item.imageUrl && (
                <>
                  {refs.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onCompare(item)}
                      className="h-8 rounded-full bg-background/90 px-2.5 text-xs backdrop-blur-md"
                    >
                      <EyeIcon className="size-3.5" />
                      <span className="hidden sm:inline">对比参考</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onZoom(item.imageUrl)}
                    className="h-8 rounded-full bg-background/90 px-2.5 text-xs backdrop-blur-md"
                  >
                    <ZoomInIcon className="size-3.5" />
                    <span className="hidden sm:inline">大图</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-8 rounded-full bg-background/90 px-2.5 text-xs backdrop-blur-md"
                  >
                    <a
                      href={item.imageUrl}
                      download={downloadFileName(`character-${item.id}`, item.imageUrl)}
                    >
                      <DownloadIcon className="size-3.5" />
                      <span>下载</span>
                    </a>
                  </Button>
                </>
              )}
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="关闭任务详情"
                  className="flex size-8 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground backdrop-blur-md transition-colors hover:bg-muted hover:text-foreground md:hidden"
                >
                  <XIcon className="size-4" />
                </button>
              </DialogClose>
            </div>

            {/* 左右切换作品箭头 */}
            {canPrev && onPrev && (
              <button
                type="button"
                aria-label="上一张作品"
                onClick={onPrev}
                className="absolute top-1/2 left-3 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground shadow-sm backdrop-blur-md transition hover:bg-background"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
            )}
            {canNext && onNext && (
              <button
                type="button"
                aria-label="下一张作品"
                onClick={onNext}
                className="absolute top-1/2 right-3 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground shadow-sm backdrop-blur-md transition hover:bg-background"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            )}

            {/* 主视觉内容 */}
            {item.status === 'succeeded' && item.imageUrl ? (
              <button
                type="button"
                onClick={() => onZoom(item.imageUrl)}
                className="group relative flex max-h-full max-w-full cursor-zoom-in items-center justify-center"
              >
                <img
                  src={item.imageUrl}
                  alt={item.recipeSummary}
                  className="max-h-[54dvh] max-w-full rounded-xl border border-border/70 object-contain shadow-lg transition group-hover:brightness-[1.02] md:max-h-[72dvh]"
                />
              </button>
            ) : item.status === 'processing' ? (
              <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                <LoaderCircleIcon className="size-8 animate-spin text-[#E5A918]" />
                <div className="text-sm font-bold text-foreground">
                  {item.liveProgress?.message || 'AI小画家正在绘制中…'}
                </div>
                {onFocusMonitor && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false)
                      onFocusMonitor(item.id)
                    }}
                    className="rounded-full text-xs"
                  >
                    回到监视器查看
                  </Button>
                )}
              </div>
            ) : item.status === 'queued' ? (
              <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                <ClockIcon className="size-8 text-[#B88300] dark:text-[#E5A918]" />
                <div className="text-sm font-bold text-foreground">
                  排队第 {item.queueInfo?.position ?? '—'} 位
                </div>
                <p className="text-xs text-muted-foreground">
                  前面还有 {item.queueInfo?.aheadCount ?? 0} 个任务等待中
                </p>
                <div className="flex items-center gap-2">
                  {onFocusMonitor && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false)
                        onFocusMonitor(item.id)
                      }}
                      className="rounded-full text-xs"
                    >
                      监视器查看
                    </Button>
                  )}
                  {onCancelQueued && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onCancelQueued(item.id)}
                      className="rounded-full border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                    >
                      取消排队
                    </Button>
                  )}
                </div>
              </div>
            ) : item.status === 'cancelled' ? (
              <div className="flex max-w-xs flex-col items-center gap-2 text-center">
                <BanIcon className="size-7 text-muted-foreground" />
                <div className="text-sm font-bold text-foreground">已取消排队</div>
                {item.errorMessage && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{item.errorMessage}</p>
                )}
              </div>
            ) : (
              <div className="flex max-w-xs flex-col items-center gap-2 text-center">
                <CircleAlertIcon className="size-7 text-destructive" />
                <div className="text-sm font-bold text-destructive">生成失败</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {item.errorMessage || '生成未成功，已自动退还积分'}
                </p>
              </div>
            )}
          </div>

          {/* 右侧：结构化任务信息栏 */}
          <div className="flex min-h-0 flex-col border-t border-border bg-card md:border-t-0 md:border-l">
            {/* 头部 */}
            <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b border-border px-5 py-4 text-left">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-extrabold tracking-tight">任务信息</DialogTitle>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                    statusMeta.pill
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', statusMeta.dot)} />
                  <span>{statusMeta.label}</span>
                </span>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="关闭任务详情"
                  className="hidden size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
                >
                  <XIcon className="size-4" />
                </button>
              </DialogClose>
            </DialogHeader>

            {/* 可滚动元信息主体 */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* 配方摘要与提示词 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">输入内容与提示词</span>
                  <button
                    type="button"
                    onClick={() => void handleCopyPrompt()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                  >
                    {copiedPrompt ? (
                      <>
                        <CheckIcon className="size-3 text-[#116E65]" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="size-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-xl border border-border/80 bg-[#FAF8F4] p-3 text-xs leading-relaxed dark:bg-muted/35">
                  <div className="font-bold text-foreground">{item.recipeSummary}</div>
                  {sceneNote && (
                    <div className="mt-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-foreground">
                      <span className="font-semibold text-muted-foreground">补充细节：</span>
                      {sceneNote}
                    </div>
                  )}
                  {item.prompt && (
                    <div className="mt-2 border-t border-border/60 pt-2 text-muted-foreground">
                      <p className={cn(!promptExpanded && 'line-clamp-4')}>{item.prompt}</p>
                      {item.prompt.length > 140 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPromptForId((curr) => (curr === item.id ? null : item.id))
                          }
                          className="mt-1 font-semibold text-foreground hover:underline"
                        >
                          {promptExpanded ? '收起提示词' : '展开完整提示词'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 本次参考图缩略条 */}
              {refs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      使用参考图 ({refs.length})
                    </span>
                    {item.status === 'succeeded' && (
                      <button
                        type="button"
                        onClick={() => onCompare(item)}
                        className="text-xs font-semibold text-[#B82914] hover:underline dark:text-[#FF7A59]"
                      >
                        缩放对比 →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {refs.map((ref) => (
                      <button
                        key={ref.id}
                        type="button"
                        onClick={() => {
                          if (item.status === 'succeeded') onCompare(item)
                          else onZoom(ref.url)
                        }}
                        title={ref.label}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/30"
                      >
                        <img
                          src={ref.url}
                          alt={ref.label}
                          className="h-full w-full object-cover object-top transition group-hover:scale-105"
                        />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 via-black/45 to-transparent px-1.5 pt-3 pb-1 text-center text-xs font-medium text-white">
                          {ref.label.split('：')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 参数配置可折叠瓦片 */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setParamsExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span>参数配置</span>
                  <ChevronDownIcon
                    className={cn('size-4 transition-transform', paramsExpanded && 'rotate-180')}
                  />
                </button>

                {paramsExpanded && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-2 rounded-xl border border-border/80 bg-[#FAF8F4] px-3 py-2 dark:bg-muted/35">
                      <ArtistLogo providerId={item.provider} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">画师与画笔</div>
                        <div className="truncate text-xs font-bold text-foreground">
                          {artist.name} · {item.profileName || item.model}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-[#FAF8F4] px-3 py-2 dark:bg-muted/35">
                      <div className="text-xs text-muted-foreground">成图画风</div>
                      <div className="mt-0.5 truncate text-xs font-bold text-foreground">
                        {styleLabel}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-[#FAF8F4] px-3 py-2 dark:bg-muted/35">
                      <div className="text-xs text-muted-foreground">比例与档位</div>
                      <div className="mt-0.5 truncate font-mono text-xs font-bold text-foreground">
                        {item.aspectRatio}
                        {item.resolution ? ` · ${item.resolution}` : ''}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-[#FAF8F4] px-3 py-2 dark:bg-muted/35">
                      <div className="text-xs text-muted-foreground">生成模式</div>
                      <div className="mt-0.5 truncate text-xs font-bold text-foreground">
                        {item.snapshot?.textFallbackOnly ? '图转文纯文' : '直传参考图'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-[#FAF8F4] px-3 py-2 dark:bg-muted/35">
                      <div className="text-xs text-muted-foreground">积分消耗</div>
                      <div className="mt-0.5 truncate font-mono text-xs font-bold text-foreground">
                        {item.creditsRefunded > 0
                          ? `已退 ${item.creditsRefunded} 积分`
                          : `${item.creditsCost} 积分`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 底部固定状态与行动区 */}
            <div className="shrink-0 space-y-2.5 border-t border-border bg-card px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{formatFullDateTime(item.createdAt)}</span>
                {durationLabel && (
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    耗时 {durationLabel}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {item.snapshot?.recipe && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onApplyRecipe(item)
                      onOpenChange(false)
                    }}
                    className="h-8 flex-1 rounded-xl text-xs font-semibold"
                  >
                    <RotateCcwIcon className="size-3.5" />
                    <span>套用配方</span>
                  </Button>
                )}
                {item.snapshot?.recipe && onRegenerate && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false)
                      onRegenerate(item)
                    }}
                    className="ks-keycap h-8 flex-1 rounded-xl border-0 bg-[#D9381E] text-xs font-bold text-white hover:bg-[#C23018]"
                  >
                    <SparklesIcon className="size-3.5" />
                    <span>同配重绘</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {item.status === 'succeeded' && item.imageUrl && onUseAsExtraRef && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onUseAsExtraRef(item)
                      onOpenChange(false)
                    }}
                    className="h-8 flex-1 rounded-xl text-xs font-semibold"
                  >
                    <ImagePlusIcon className="size-3.5 text-[#116E65] dark:text-[#4FD1C5]" />
                    <span>设为附图继续创作</span>
                  </Button>
                )}
                {item.status !== 'processing' && item.status !== 'queued' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(item)}
                    aria-label="删除此作品"
                    title="删除此作品"
                    className="h-8 rounded-xl border-border px-2.5 text-xs text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
