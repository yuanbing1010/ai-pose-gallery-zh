import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  ImportIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_DIALOG_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_SELECT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  formatAdminBytes,
  formatAdminDateTime,
  type AdminConfirmAction,
} from '@/components/admin/auditHelpers'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  createAdminXSyncSourceApi,
  deleteAdminGalleryCommentApi,
  deleteAdminGalleryItemApi,
  deleteAdminXSyncSourceApi,
  fetchAdminGalleryApi,
  fetchAdminGalleryCommentsApi,
  fetchAdminXSyncSourcesApi,
  importAdminXTweetApi,
  parseAdminXTweetApi,
  updateAdminGalleryItemApi,
  updateAdminXSyncSourceApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { GALLERY_CATEGORIES } from '../../../../shared/studio'
import type {
  AdminGalleryStatsSummary,
  GalleryCommentDTO,
  GalleryItemDTO,
  GalleryItemSourceType,
  GalleryItemStatus,
  ParsedXTweetPreview,
  StudioAspectRatio,
  XSyncSourceDTO,
} from '@/types/gallery'

export interface AdminGalleryTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction | null) => void
}

type GalleryAdminSection = 'moderation' | 'import_x' | 'x_sources' | 'comments'

const STATUS_LABELS: Record<GalleryItemStatus, string> = {
  pending: '待审核',
  published: '已上架',
  rejected: '已驳回',
  hidden: '已下架',
}

const SOURCE_LABELS: Record<GalleryItemSourceType, string> = {
  x_sync: 'X 同步',
  user_t2i: '用户文生图',
  user_recipe: '用户配方',
}

export function AdminGalleryTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
}: AdminGalleryTabProps) {
  const [section, setSection] = useState<GalleryAdminSection>('moderation')

  // 审核列表状态
  const [statusFilter, setStatusFilter] = useState<'all' | GalleryItemStatus>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | GalleryItemSourceType>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [items, setItems] = useState<GalleryItemDTO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AdminGalleryStatsSummary | null>(null)
  const [ingestKeyConfigured, setIngestKeyConfigured] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 驳回弹窗
  const [rejectTarget, setRejectTarget] = useState<GalleryItemDTO | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<GalleryItemDTO | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editPromptText, setEditPromptText] = useState('')
  const [editPromptZh, setEditPromptZh] = useState('')
  const [editCategory, setEditCategory] = useState<string>('写实人像')
  const [editTags, setEditTags] = useState('')
  const [editAspectRatio, setEditAspectRatio] = useState<StudioAspectRatio>('3:4')
  const [editFeatured, setEditFeatured] = useState(false)
  const [editStatus, setEditStatus] = useState<GalleryItemStatus>('published')
  const [editSaving, setEditSaving] = useState(false)

  // X 推文导入表单
  const [xUrlInput, setXUrlInput] = useState('')
  const [parsingX, setParsingX] = useState(false)
  const [parsedPreview, setParsedPreview] = useState<ParsedXTweetPreview | null>(null)
  const [importImageUrl, setImportImageUrl] = useState('')
  const [importWidth, setImportWidth] = useState<number | undefined>(undefined)
  const [importHeight, setImportHeight] = useState<number | undefined>(undefined)
  const [importAuthorHandle, setImportAuthorHandle] = useState('')
  const [importAuthorName, setImportAuthorName] = useState('')
  const [importAuthorAvatar, setImportAuthorAvatar] = useState<string | null>(null)
  const [importTitle, setImportTitle] = useState('')
  const [importPromptText, setImportPromptText] = useState('')
  const [importPromptZh, setImportPromptZh] = useState('')
  const [importCategory, setImportCategory] = useState<string>('写实人像')
  const [importTags, setImportTags] = useState('')
  const [importAspectRatio, setImportAspectRatio] = useState<StudioAspectRatio>('3:4')
  const [importPublishNow, setImportPublishNow] = useState(true)
  const [importFeatured, setImportFeatured] = useState(false)
  const [importingX, setImportingX] = useState(false)

  // X 博主白名单状态
  const [xSources, setXSources] = useState<XSyncSourceDTO[]>([])
  const [newSourceHandle, setNewSourceHandle] = useState('')
  const [newSourceDisplayName, setNewSourceDisplayName] = useState('')
  const [newSourceAutoPublish, setNewSourceAutoPublish] = useState(false)
  const [newSourceNote, setNewSourceNote] = useState('')
  const [creatingSource, setCreatingSource] = useState(false)

  // 评论治理状态
  const [adminComments, setAdminComments] = useState<GalleryCommentDTO[]>([])
  const [commentSearch, setCommentSearch] = useState('')
  const [commentsRefreshTick, setCommentsRefreshTick] = useState(0)

  const [localRefreshTick, setLocalRefreshTick] = useState(0)
  const triggerRefreshGallery = useCallback(() => {
    setLocalRefreshTick((n) => n + 1)
  }, [])

  const [xSourcesRefreshTick, setXSourcesRefreshTick] = useState(0)
  const triggerRefreshXSources = useCallback(() => {
    setXSourcesRefreshTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let active = true
    onLoadingChange(true)
    void fetchAdminGalleryApi({
      status: statusFilter,
      source: sourceFilter,
      q: searchQuery,
      limit: 80,
      offset: 0,
    })
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotal(res.total)
        setStats(res.stats)
        setIngestKeyConfigured(res.ingestKeyConfigured)
      })
      .catch((err) => {
        if (!active) return
        toast.error(err instanceof Error ? err.message : '加载画廊管理列表失败')
      })
      .finally(() => {
        if (active) onLoadingChange(false)
      })
    return () => {
      active = false
    }
  }, [onLoadingChange, searchQuery, sourceFilter, statusFilter, reloadTick, localRefreshTick])

  useEffect(() => {
    if (section !== 'x_sources') return
    let active = true
    void fetchAdminXSyncSourcesApi()
      .then((res) => {
        if (active) setXSources(res.items)
      })
      .catch((err) => {
        if (active) toast.error(err instanceof Error ? err.message : '加载 X 博主白名单失败')
      })
    return () => {
      active = false
    }
  }, [section, reloadTick, xSourcesRefreshTick])

  useEffect(() => {
    if (section !== 'comments') return
    let active = true
    void fetchAdminGalleryCommentsApi(commentSearch)
      .then((res) => {
        if (active) setAdminComments(res.items)
      })
      .catch((err) => {
        if (active) toast.error(err instanceof Error ? err.message : '加载评论列表失败')
      })
    return () => {
      active = false
    }
  }, [section, commentSearch, reloadTick, commentsRefreshTick])

  const loadGallery = triggerRefreshGallery
  const loadXSources = triggerRefreshXSources

  const handleQuickPatch = async (
    item: GalleryItemDTO,
    patch: Parameters<typeof updateAdminGalleryItemApi>[1],
    successMsg: string
  ) => {
    setBusyId(item.id)
    try {
      await updateAdminGalleryItemApi(item.id, patch)
      toast.success(successMsg)
      await loadGallery()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectTarget) return
    setBusyId(rejectTarget.id)
    try {
      await updateAdminGalleryItemApi(rejectTarget.id, {
        status: 'rejected',
        reviewNote: rejectReason.trim() || '暂不符合公共画廊展示规范',
      })
      toast.success('已驳回该投稿')
      setRejectTarget(null)
      setRejectReason('')
      await loadGallery()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '驳回失败')
    } finally {
      setBusyId(null)
    }
  }

  const openEditDialog = (item: GalleryItemDTO) => {
    setEditTarget(item)
    setEditTitle(item.title)
    setEditPromptText(item.promptText)
    setEditPromptZh(item.promptZh)
    setEditCategory(item.category || '其他')
    setEditTags(item.tags.join(', '))
    setEditAspectRatio(item.aspectRatio)
    setEditFeatured(item.isFeatured)
    setEditStatus(item.status)
  }

  const handleSaveEdit = async () => {
    if (!editTarget || editSaving) return
    setEditSaving(true)
    try {
      await updateAdminGalleryItemApi(editTarget.id, {
        title: editTitle.trim(),
        ...(editTarget.sourceType !== 'user_recipe'
          ? {
              promptText: editPromptText.trim(),
              promptZh: editPromptZh.trim(),
            }
          : {}),
        category: editCategory,
        tags: editTags,
        aspectRatio: editAspectRatio,
        isFeatured: editFeatured,
        status: editStatus,
      })
      toast.success('画廊作品信息已保存')
      setEditTarget(null)
      await loadGallery()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setEditSaving(false)
    }
  }

  const handleParseX = async () => {
    const clean = xUrlInput.trim()
    if (!clean) {
      toast.error('请先粘贴 X / Twitter 推文链接')
      return
    }
    setParsingX(true)
    try {
      const { preview } = await parseAdminXTweetApi(clean)
      setParsedPreview(preview)
      setImportAuthorHandle(preview.authorHandle)
      setImportAuthorName(preview.authorName)
      setImportAuthorAvatar(preview.authorAvatar ?? null)
      setImportTitle(preview.suggestedTitle)
      setImportPromptText(preview.suggestedPrompt)
      setImportAspectRatio(preview.suggestedAspectRatio)
      if (preview.images.length > 0) {
        setImportImageUrl(preview.images[0].url)
        setImportWidth(preview.images[0].width)
        setImportHeight(preview.images[0].height)
      } else {
        setImportImageUrl('')
        setImportWidth(undefined)
        setImportHeight(undefined)
      }
      if (preview.alreadyExists) {
        toast.warning('该条推文已在画廊中，请确认是否重复')
      } else {
        toast.success(`解析成功：检测到 ${preview.images.length} 张配图`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解析推文失败')
    } finally {
      setParsingX(false)
    }
  }

  const handleImportX = async () => {
    if (importingX) return
    if (!importImageUrl.trim()) {
      toast.error('请先选择推文配图或手动填入图片 HTTPS 地址')
      return
    }
    if (!importPromptText.trim()) {
      toast.error('请填写提示词正文')
      return
    }
    setImportingX(true)
    try {
      await importAdminXTweetApi({
        tweetUrl: parsedPreview?.tweetUrl || xUrlInput.trim() || undefined,
        tweetId: parsedPreview?.tweetId,
        authorHandle: importAuthorHandle.trim(),
        authorName: importAuthorName.trim(),
        authorAvatar: importAuthorAvatar,
        title: importTitle.trim(),
        promptText: importPromptText.trim(),
        promptZh: importPromptZh.trim(),
        imageUrl: importImageUrl.trim(),
        width: importWidth,
        height: importHeight,
        aspectRatio: importAspectRatio,
        category: importCategory,
        tags: importTags,
        publishNow: importPublishNow,
        isFeatured: importFeatured,
      })
      toast.success(
        importPublishNow ? '已转存 R2 并直接上架至公共画廊' : '已转存 R2 并加入待审核队列'
      )
      setXUrlInput('')
      setParsedPreview(null)
      setImportImageUrl('')
      setImportTitle('')
      setImportPromptText('')
      setImportPromptZh('')
      setImportTags('')
      await loadGallery()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImportingX(false)
    }
  }

  const handleAddXSource = async () => {
    if (!newSourceHandle.trim() || creatingSource) return
    setCreatingSource(true)
    try {
      await createAdminXSyncSourceApi({
        handle: newSourceHandle.trim(),
        displayName: newSourceDisplayName.trim() || undefined,
        autoPublish: newSourceAutoPublish,
        note: newSourceNote.trim() || undefined,
      })
      toast.success('已添加 X 同步博主')
      setNewSourceHandle('')
      setNewSourceDisplayName('')
      setNewSourceAutoPublish(false)
      setNewSourceNote('')
      await loadXSources()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败')
    } finally {
      setCreatingSource(false)
    }
  }

  const webhookExample = JSON.stringify(
    {
      items: [
        {
          tweetUrl: 'https://x.com/example_blogger/status/1900000000000000000',
          authorHandle: 'example_blogger',
          authorName: 'Example Blogger',
          title: '黄金时刻胶片人像',
          promptText: 'Cinematic portrait at golden hour, 35mm Kodak Portra 400...',
          promptZh: '黄金时刻电影感人像，35mm 柯达胶片颗粒质感……',
          imageUrl: 'https://pbs.twimg.com/media/EXAMPLE.jpg',
          category: '写实人像',
          tags: ['胶片', '黄金时刻'],
          autoPublish: false,
        },
      ],
    },
    null,
    2
  )

  return (
    <div className="space-y-6">
      {/* 顶栏：左侧分区切换，右侧快捷刷新 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={section === 'moderation' ? 'default' : 'outline'}
            className={ADMIN_BTN_CLS}
            onClick={() => setSection('moderation')}
          >
            <span>作品审核与管理</span>
            {stats && stats.pending > 0 && (
              <span className="ml-1.5 bg-red-600 px-1.5 py-0.5 font-mono text-xs font-bold text-white">
                {stats.pending}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant={section === 'import_x' ? 'default' : 'outline'}
            className={ADMIN_BTN_CLS}
            onClick={() => setSection('import_x')}
          >
            <ImportIcon className="size-3.5" />
            <span>X 推文一键导入</span>
          </Button>
          <Button
            type="button"
            variant={section === 'x_sources' ? 'default' : 'outline'}
            className={ADMIN_BTN_CLS}
            onClick={() => setSection('x_sources')}
          >
            <span>X 博主白名单 & Webhook</span>
          </Button>
          <Button
            type="button"
            variant={section === 'comments' ? 'default' : 'outline'}
            className={ADMIN_BTN_CLS}
            onClick={() => setSection('comments')}
          >
            <MessageSquareIcon className="size-3.5" />
            <span>评论治理</span>
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className={ADMIN_BTN_CLS}
          onClick={() => {
            void loadGallery()
            if (section === 'x_sources') void loadXSources()
            if (section === 'comments') setCommentsRefreshTick((n) => n + 1)
          }}
        >
          <RefreshCwIcon className="size-3.5" />
          <span>刷新数据</span>
        </Button>
      </div>

      {/* KPI 总览条 */}
      {stats && (
        <div className="grid grid-cols-2 border border-border sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: '画廊总数', value: stats.total },
            { label: '待审核', value: stats.pending, highlight: stats.pending > 0 },
            { label: '已上架公开', value: stats.published },
            { label: 'X 精选来源', value: stats.xSync },
            { label: '用户文生图', value: stats.userT2i },
            { label: '用户配方', value: stats.userRecipe },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="border-r border-b border-border p-3 last:border-r-0"
            >
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
              <div
                className={cn(
                  'mt-1 font-mono text-xl font-bold tabular-nums',
                  kpi.highlight && 'text-red-600 dark:text-red-400'
                )}
              >
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== 子区 1：审核与作品管理 ==================== */}
      {section === 'moderation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', '全部'],
                  ['pending', `待审核 (${stats?.pending ?? 0})`],
                  ['published', '已上架'],
                  ['rejected', '已驳回'],
                  ['hidden', '已下架'],
                ] as const
              ).map(([val, label]) => (
                <Button
                  key={val}
                  type="button"
                  variant={statusFilter === val ? 'default' : 'outline'}
                  className={ADMIN_BTN_SM_CLS}
                  onClick={() => setStatusFilter(val)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sourceFilter}
                onValueChange={(v) => setSourceFilter(v as 'all' | GalleryItemSourceType)}
              >
                <SelectTrigger className={cn(ADMIN_SELECT_CLS, 'w-32')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all" className="text-xs">
                    全部来源
                  </SelectItem>
                  <SelectItem value="x_sync" className="text-xs">
                    X 同步
                  </SelectItem>
                  <SelectItem value="user_t2i" className="text-xs">
                    用户文生图
                  </SelectItem>
                  <SelectItem value="user_recipe" className="text-xs">
                    用户配方
                  </SelectItem>
                </SelectContent>
              </Select>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setSearchQuery(searchInput.trim())
                }}
                className="flex items-center gap-1"
              >
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="搜索标题 / 提示词 / 作者…"
                    className={cn(ADMIN_TEXT_INPUT_CLS, 'w-52 pl-8')}
                  />
                </div>
                <Button type="submit" variant="outline" className={ADMIN_BTN_CLS}>
                  查询
                </Button>
              </form>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="border border-border p-10 text-center text-xs text-muted-foreground">
              当前筛选条件下暂无画廊记录（共 {total} 条）
            </div>
          ) : (
            <div className="divide-y divide-border border border-border">
              {items.map((item) => {
                const busy = busyId === item.id
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start"
                  >
                    <a
                      href={item.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-28 w-24 shrink-0 overflow-hidden border border-border bg-muted"
                    >
                      <img
                        src={item.thumbUrl || item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </a>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'border px-1.5 py-0.5 font-mono text-xs font-bold',
                            item.status === 'pending'
                              ? 'border-amber-600 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                              : item.status === 'published'
                                ? 'border-emerald-700 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                : item.status === 'rejected'
                                  ? 'border-red-600 bg-red-500/10 text-red-700 dark:text-red-400'
                                  : 'border-border bg-muted text-muted-foreground'
                          )}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className="border border-border px-1.5 py-0.5 font-mono text-xs">
                          {SOURCE_LABELS[item.sourceType]}
                        </span>
                        <span className="border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                          {item.category || '其他'}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.aspectRatio} · {formatAdminBytes(item.imageBytes)}
                        </span>
                        {item.isFeatured && (
                          <span className="bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-zinc-950">
                            精选
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-bold text-foreground">
                        {item.title || '未命名作品'}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>作者：{item.authorName}</span>
                        {item.xAuthorHandle && (
                          <span className="font-mono">@{item.xAuthorHandle}</span>
                        )}
                        {item.xTweetUrl && (
                          <a
                            href={item.xTweetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline"
                          >
                            <span>原推文</span>
                            <ExternalLinkIcon className="size-3" />
                          </a>
                        )}
                        <span className="font-mono">同款 {item.remixCount}</span>
                        <span className="font-mono">{formatAdminDateTime(item.createdAt)}</span>
                      </div>

                      {(item.promptText || item.promptZh) && (
                        <p className="line-clamp-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                          {item.promptZh || item.promptText}
                        </p>
                      )}

                      {item.reviewNote && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          审核备注：{item.reviewNote}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.status !== 'published' && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            className={cn(ADMIN_BTN_SM_CLS, 'bg-emerald-700 text-white hover:bg-emerald-800')}
                            onClick={() =>
                              void handleQuickPatch(
                                item,
                                { status: 'published', reviewNote: '' },
                                '已审核通过并上架公共画廊'
                              )
                            }
                          >
                            <CheckCircle2Icon className="size-3.5" />
                            <span>通过上架</span>
                          </Button>
                        )}
                        {item.status === 'pending' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            className={cn(ADMIN_BTN_SM_CLS, 'border-red-600/50 text-red-600')}
                            onClick={() => {
                              setRejectTarget(item)
                              setRejectReason('')
                            }}
                          >
                            <XCircleIcon className="size-3.5" />
                            <span>驳回</span>
                          </Button>
                        )}
                        {item.status === 'published' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            className={ADMIN_BTN_SM_CLS}
                            onClick={() =>
                              void handleQuickPatch(item, { status: 'hidden' }, '已下架该作品')
                            }
                          >
                            <EyeOffIcon className="size-3.5" />
                            <span>下架</span>
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className={ADMIN_BTN_SM_CLS}
                          onClick={() =>
                            void handleQuickPatch(
                              item,
                              { isFeatured: !item.isFeatured },
                              item.isFeatured ? '已取消精选' : '已设为精选推荐'
                            )
                          }
                        >
                          <StarIcon
                            className={cn('size-3.5', item.isFeatured && 'fill-amber-400 text-amber-500')}
                          />
                          <span>{item.isFeatured ? '取消精选' : '精选'}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className={ADMIN_BTN_SM_CLS}
                          onClick={() => openEditDialog(item)}
                        >
                          <PencilIcon className="size-3.5" />
                          <span>编辑</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          aria-label={`删除画廊作品「${item.title || item.id}」`}
                          title="删除画廊作品"
                          className={cn(ADMIN_BTN_SM_CLS, 'text-destructive hover:bg-destructive/10')}
                          onClick={() =>
                            onConfirm({
                              title: '删除画廊作品',
                              description: `确定永久删除「${item.title || item.id}」及其公共画廊图片吗？此操作不可恢复。`,
                              confirmLabel: '确认删除',
                              destructive: true,
                              run: async () => {
                                await deleteAdminGalleryItemApi(item.id)
                                toast.success('已删除画廊作品')
                                await loadGallery()
                              },
                            })
                          }
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== 子区 2：粘贴 X 推文一键导入 ==================== */}
      {section === 'import_x' && (
        <div className="space-y-4 border border-border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold">粘贴 X / Twitter 推文链接一键解析入库</h3>
            <p className="text-xs text-muted-foreground">
              支持自动拉取推文正文、原作者署名与配图，入库时会自动把图片转存至本站 Cloudflare R2 公共画廊前缀，国内用户高速直连且永不裂图。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={xUrlInput}
              onChange={(e) => setXUrlInput(e.target.value)}
              placeholder="粘贴 https://x.com/username/status/123456789..."
              className={cn(ADMIN_INPUT_CLS, 'min-w-[260px] flex-1')}
            />
            <Button
              type="button"
              disabled={parsingX}
              className={ADMIN_BTN_CLS}
              onClick={() => void handleParseX()}
            >
              {parsingX ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <ImportIcon className="size-3.5" />
              )}
              <span>抓取解析推文</span>
            </Button>
          </div>

          {parsedPreview && parsedPreview.images.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="text-xs font-semibold">
                选择要作为画廊展示图的一张配图（共 {parsedPreview.images.length} 张）：
              </div>
              <div className="flex flex-wrap gap-2">
                {parsedPreview.images.map((img, idx) => {
                  const selected = importImageUrl === img.url
                  return (
                    <button
                      key={`${img.url}-${idx}`}
                      type="button"
                      onClick={() => {
                        setImportImageUrl(img.url)
                        setImportWidth(img.width)
                        setImportHeight(img.height)
                      }}
                      className={cn(
                        'relative h-28 w-24 cursor-pointer overflow-hidden border-2 bg-muted',
                        selected ? 'border-zinc-950 dark:border-white' : 'border-border opacity-70 hover:opacity-100'
                      )}
                    >
                      <img src={img.url} alt={`配图 ${idx + 1}`} className="h-full w-full object-cover" />
                      {selected && (
                        <span className="absolute right-1 bottom-1 bg-zinc-950 px-1.5 py-0.5 font-mono text-xs text-white">
                          已选
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">作品图片 HTTPS 地址（必填）</Label>
              <Input
                value={importImageUrl}
                onChange={(e) => setImportImageUrl(e.target.value)}
                placeholder="https://pbs.twimg.com/media/..."
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">作品标题</Label>
              <Input
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
                placeholder="简短醒目的中文标题"
                className={ADMIN_TEXT_INPUT_CLS}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">原作者 @handle</Label>
              <Input
                value={importAuthorHandle}
                onChange={(e) => setImportAuthorHandle(e.target.value)}
                placeholder="例如：prompt_master"
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">原作者昵称</Label>
              <Input
                value={importAuthorName}
                onChange={(e) => setImportAuthorName(e.target.value)}
                placeholder="展示署名"
                className={ADMIN_TEXT_INPUT_CLS}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">画廊分类</Label>
              <Select value={importCategory} onValueChange={setImportCategory}>
                <SelectTrigger className={ADMIN_SELECT_CLS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {GALLERY_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">推荐比例</Label>
                <Select
                  value={importAspectRatio}
                  onValueChange={(v) => setImportAspectRatio(v as StudioAspectRatio)}
                >
                  <SelectTrigger className={ADMIN_SELECT_CLS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {(['3:4', '9:16', '1:1', '4:3', '16:9'] as const).map((r) => (
                      <SelectItem key={r} value={r} className="font-mono text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">标签（逗号分隔）</Label>
                <Input
                  value={importTags}
                  onChange={(e) => setImportTags(e.target.value)}
                  placeholder="胶片, 赛博, 人像"
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">原始提示词（英文/原文，用于做同款）</Label>
              <Textarea
                rows={5}
                value={importPromptText}
                onChange={(e) => setImportPromptText(e.target.value)}
                placeholder="清理后的纯提示词…"
                className="rounded-none font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">中文译文 / 说明（可选，方便浏览）</Label>
              <Textarea
                rows={5}
                value={importPromptZh}
                onChange={(e) => setImportPromptZh(e.target.value)}
                placeholder="中文翻译或画面风格亮点说明…"
                className="rounded-none text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={importPublishNow} onCheckedChange={setImportPublishNow} />
                <span>导入后直接上架公共画廊</span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={importFeatured} onCheckedChange={setImportFeatured} />
                <span>设为精选推荐</span>
              </label>
            </div>

            <Button
              type="button"
              disabled={importingX}
              className={ADMIN_BTN_CLS}
              onClick={() => void handleImportX()}
            >
              {importingX ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2Icon className="size-3.5" />
              )}
              <span>转存 R2 并导入画廊</span>
            </Button>
          </div>
        </div>
      )}

      {/* ==================== 子区 3：X 博主白名单 & Grok Bot Webhook ==================== */}
      {section === 'x_sources' && (
        <div className="space-y-6">
          <div className="space-y-3 border border-border p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold">X 提示词博主白名单</h3>
              <p className="text-xs text-muted-foreground">
                配置你要定期追踪的 X 提示词博主。GCP VPS 定时任务（结合你的 Grok Bot X 连接器）推送推文时，将按此处配置决定是直接上架还是进入待审核队列。
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <Input
                value={newSourceHandle}
                onChange={(e) => setNewSourceHandle(e.target.value)}
                placeholder="@handle 或主页链接"
                className={ADMIN_INPUT_CLS}
              />
              <Input
                value={newSourceDisplayName}
                onChange={(e) => setNewSourceDisplayName(e.target.value)}
                placeholder="博主昵称（可选）"
                className={ADMIN_TEXT_INPUT_CLS}
              />
              <Input
                value={newSourceNote}
                onChange={(e) => setNewSourceNote(e.target.value)}
                placeholder="擅长方向备注（如 写实人像）"
                className={ADMIN_TEXT_INPUT_CLS}
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <Switch
                    checked={newSourceAutoPublish}
                    onCheckedChange={setNewSourceAutoPublish}
                  />
                  <span>自动上架</span>
                </label>
                <Button
                  type="button"
                  disabled={creatingSource}
                  className={ADMIN_BTN_CLS}
                  onClick={() => void handleAddXSource()}
                >
                  <PlusIcon className="size-3.5" />
                  <span>添加</span>
                </Button>
              </div>
            </div>

            {xSources.length === 0 ? (
              <div className="border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                暂无已配置的 X 提示词博主，请在上方添加首个博主 handle。
              </div>
            ) : (
              <div className="divide-y divide-border border border-border">
                {xSources.map((src) => (
                  <div
                    key={src.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">@{src.handle}</span>
                        <span className="text-muted-foreground">{src.displayName}</span>
                        {src.note && (
                          <span className="border border-border px-1.5 py-0.5 text-muted-foreground">
                            {src.note}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-muted-foreground">
                        上次同步：
                        {src.lastSyncedAt ? formatAdminDateTime(src.lastSyncedAt) : '尚未同步'}
                        {src.lastTweetId ? ` · 游标 ${src.lastTweetId}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5">
                        <Switch
                          checked={src.enabled}
                          onCheckedChange={(checked) => {
                            void updateAdminXSyncSourceApi(src.id, { enabled: checked })
                              .then(() => loadXSources())
                              .catch((err) => {
                                toast.error(err instanceof Error ? err.message : '更新启用状态失败')
                              })
                          }}
                        />
                        <span>启用</span>
                      </label>
                      <label className="flex items-center gap-1.5">
                        <Switch
                          checked={src.autoPublish}
                          onCheckedChange={(checked) => {
                            void updateAdminXSyncSourceApi(src.id, { autoPublish: checked })
                              .then(() => loadXSources())
                              .catch((err) => {
                                toast.error(err instanceof Error ? err.message : '更新自动上架状态失败')
                              })
                          }}
                        />
                        <span>自动上架</span>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`移除 X 同步博主 @${src.handle}`}
                        title={`移除 @${src.handle}`}
                        className={cn(ADMIN_BTN_SM_CLS, 'text-destructive')}
                        onClick={() =>
                          onConfirm({
                            title: '移除 X 同步博主',
                            description: `确认将 @${src.handle} 从同步白名单移除吗？（已导入的画廊作品不会删除）`,
                            confirmLabel: '确认移除',
                            destructive: true,
                            run: async () => {
                              await deleteAdminXSyncSourceApi(src.id)
                              toast.success('已移除')
                              await loadXSources()
                            },
                          })
                        }
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">
                  GCP VPS / Grok Bot 自动同步入库接口（已就绪）
                </h3>
                <p className="text-xs text-muted-foreground">
                  在 Cloudflare Worker 中设置 Secret <code className="font-mono">GALLERY_INGEST_KEY</code>，即可由 VPS 定时任务通过{' '}
                  <code className="font-mono">POST /api/gallery/ingest</code> 批量推送清洗后的 X 提示词作品（支持 `tweetId` 自动幂等去重与 R2 自动转存）。
                </p>
              </div>
              <span
                className={cn(
                  'border px-2 py-0.5 font-mono text-xs font-bold',
                  ingestKeyConfigured
                    ? 'border-emerald-700 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-600 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                )}
              >
                {ingestKeyConfigured ? 'GALLERY_INGEST_KEY 已配置' : '待配置 GALLERY_INGEST_KEY'}
              </span>
            </div>

            <div className="relative">
              <pre className="overflow-x-auto border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                {`POST /api/gallery/ingest\nAuthorization: Bearer <GALLERY_INGEST_KEY>\nContent-Type: application/json\n\n${webhookExample}`}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(ADMIN_BTN_SM_CLS, 'absolute top-2 right-2')}
                onClick={() => {
                  void navigator.clipboard.writeText(webhookExample)
                  toast.success('已复制请求体示例')
                }}
              >
                <CopyIcon className="size-3" />
                <span>复制 JSON</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 子区 4：评论治理 ==================== */}
      {section === 'comments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              最近公开评论列表（共 {adminComments.length} 条），支持关键词筛选与一键屏蔽删除。
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                placeholder="搜索评论内容、用户或作品名…"
                className={cn(ADMIN_TEXT_INPUT_CLS, 'w-60')}
              />
            </div>
          </div>

          {adminComments.length === 0 ? (
            <div className="border border-border p-10 text-center text-xs text-muted-foreground">
              暂无匹配的公开评论
            </div>
          ) : (
            <div className="divide-y divide-border border border-border">
              {adminComments.map((cmt) => (
                <div
                  key={cmt.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground">{cmt.authorName}</span>
                      <span className="border border-border px-1.5 py-0.5 text-muted-foreground">
                        作品：{cmt.itemTitle}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatAdminDateTime(cmt.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-foreground/90">
                      {cmt.content}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(ADMIN_BTN_SM_CLS, 'text-destructive hover:bg-destructive/10')}
                    onClick={() =>
                      onConfirm({
                        title: '删除画廊评论',
                        description: `确定屏蔽并删除「${cmt.authorName}」的这条评论吗？`,
                        confirmLabel: '确认删除',
                        destructive: true,
                        run: async () => {
                          await deleteAdminGalleryCommentApi(cmt.id)
                          toast.success('已删除该评论')
                          setCommentsRefreshTick((n) => n + 1)
                        },
                      })
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                    <span>删除</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 驳回弹窗 */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
      >
        <DialogContent className={cn(ADMIN_DIALOG_CLS, 'max-w-md')}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">驳回画廊投稿</DialogTitle>
            <DialogDescription className="text-xs">
              驳回后用户可在「我的画廊 → 我的投稿」看到驳回原因并修改重提。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs font-semibold">驳回原因</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例如：画面包含敏感元素 / 提示词不完整…"
              className="rounded-none text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={ADMIN_BTN_CLS}
              onClick={() => setRejectTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={ADMIN_BTN_CLS}
              onClick={() => void handleConfirmReject()}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑作品弹窗 */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      >
        <DialogContent className={cn(ADMIN_DIALOG_CLS, 'max-h-[90dvh] max-w-xl overflow-y-auto')}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">编辑画廊作品</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">作品标题</Label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">审核状态</Label>
                  <Select
                    value={editStatus}
                    onValueChange={(v) => setEditStatus(v as GalleryItemStatus)}
                  >
                    <SelectTrigger className={ADMIN_SELECT_CLS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {(['pending', 'published', 'rejected', 'hidden'] as const).map((st) => (
                        <SelectItem key={st} value={st} className="text-xs">
                          {STATUS_LABELS[st]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">分类</Label>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger className={ADMIN_SELECT_CLS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {GALLERY_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat} className="text-xs">
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">比例</Label>
                  <Select
                    value={editAspectRatio}
                    onValueChange={(v) => setEditAspectRatio(v as StudioAspectRatio)}
                  >
                    <SelectTrigger className={ADMIN_SELECT_CLS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {(['3:4', '9:16', '1:1', '4:3', '16:9'] as const).map((r) => (
                        <SelectItem key={r} value={r} className="font-mono text-xs">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">标签（逗号分隔）</Label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </div>

              {editTarget.sourceType !== 'user_recipe' && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">原始提示词</Label>
                    <Textarea
                      rows={4}
                      value={editPromptText}
                      onChange={(e) => setEditPromptText(e.target.value)}
                      className="rounded-none font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">中文译文 / 说明</Label>
                    <Textarea
                      rows={3}
                      value={editPromptZh}
                      onChange={(e) => setEditPromptZh(e.target.value)}
                      className="rounded-none text-xs"
                    />
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 text-xs">
                <Switch checked={editFeatured} onCheckedChange={setEditFeatured} />
                <span>设为精选推荐</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={ADMIN_BTN_CLS}
              onClick={() => setEditTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={editSaving}
              className={ADMIN_BTN_CLS}
              onClick={() => void handleSaveEdit()}
            >
              {editSaving ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
              <span>保存修改</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
