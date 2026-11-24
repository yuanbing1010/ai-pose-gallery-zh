import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookmarkIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  HeartIcon,
  ImageOffIcon,
  ImagesIcon,
  LayersIcon,
  LoaderCircleIcon,
  LogInIcon,
  MessageCircleIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  Share2Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  WandSparklesIcon,
  XCircleIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { EmptyState } from '@/components/common/EmptyState'
import { ImageViewer } from '@/components/common/ImageViewer'
import { PublishToGalleryDialog } from '@/components/gallery/PublishToGalleryDialog'
import { SpringBurstRing } from '@/components/motion/TactileMotion'
import {
  EditorialMarqueeRibbon,
  EditorialSpotlightCarousel,
  InlineHeadlineStamp,
  KineticRollText,
  type MarqueeRibbonItem,
} from '@/components/motion/SignatureBlocks'
import { VermilionHankoStamp } from '@/components/motion/SkeuomorphicInstruments'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import {
  createGalleryCommentApi,
  deleteGalleryCommentApi,
  deleteMyGalleryItemApi,
  fetchGalleryCommentsApi,
  fetchMyGalleryBookmarksApi,
  fetchMyGalleryItemsApi,
  fetchPublicGalleryItemsApi,
  toggleGalleryBookmarkApi,
  toggleGalleryLikeApi,
  withdrawMyGalleryItemApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { playBrassDialTick, playInkStamp, playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import { GALLERY_CATEGORIES, referenceImageUrl } from '../../../shared/studio'
import type {
  GalleryCommentDTO,
  GalleryItemDTO,
  GalleryItemSourceType,
  GalleryItemStatus,
  GallerySortOrder,
  GenerationHistoryItem,
  StudioAspectRatio,
} from '@/types/gallery'

export const GALLERY_EXTERNAL_SEARCH_EVENT = 'castdeck:gallery-search'
export const GALLERY_SWITCH_TAB_EVENT = 'castdeck:gallery-switch-tab'

type GalleryMainTab = 'public' | 'mine'
type MineSubTab = 'works' | 'bookmarks' | 'submissions'
type MasonryDensity = 3 | 4 | 5

const SOURCE_OPTIONS: Array<{ value: 'all' | GalleryItemSourceType; label: string }> = [
  { value: 'all', label: '全部来源' },
  { value: 'x_sync', label: 'X 精选' },
  { value: 'user_t2i', label: '文生图' },
  { value: 'user_recipe', label: '配方合图' },
]

const SORT_OPTIONS: Array<{ value: GallerySortOrder; label: string }> = [
  { value: 'featured', label: '精选推荐' },
  { value: 'popular', label: '最受欢迎' },
  { value: 'latest', label: '最新发布' },
  { value: 'remixes', label: '最多同款' },
]

const STATUS_BADGE_META: Record<
  GalleryItemStatus,
  { label: string; cls: string; icon: typeof CheckCircle2Icon }
> = {
  published: {
    label: '已上架',
    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    icon: CheckCircle2Icon,
  },
  pending: {
    label: '审核中',
    cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon: ClockIcon,
  },
  rejected: {
    label: '未通过',
    cls: 'bg-destructive/15 text-destructive',
    icon: XCircleIcon,
  },
  hidden: {
    label: '已撤回',
    cls: 'bg-muted text-muted-foreground',
    icon: EyeOffIcon,
  },
}

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时`
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}天`
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function GalleryExperience() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    user,
    history,
    openAuthModal,
    applyGalleryRemix,
    setStudioMode,
    setUserPrompt,
    setAspectRatio,
    setRemixGallerySource,
  } = useStudio()

  const [mainTab, setMainTab] = useState<GalleryMainTab>('public')
  const [mineSubTab, setMineSubTab] = useState<MineSubTab>('works')

  // 快捷文生图输入栏（Curated 内嵌圆箭胶囊）
  const [quickPrompt, setQuickPrompt] = useState('')
  const [quickRatio, setQuickRatio] = useState<StudioAspectRatio>('3:4')

  // 公共画廊筛选状态
  const [sourceFilter, setSourceFilter] = useState<'all' | GalleryItemSourceType>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('全部')
  const [sortOrder, setSortOrder] = useState<GallerySortOrder>('featured')
  const [aspectFilter, setAspectFilter] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [density, setDensity] = useState<MasonryDensity>(4)
  const [pageLimit, setPageLimit] = useState(40)

  // 详情、互动与弹窗状态
  const [activeItem, setActiveItem] = useState<GalleryItemDTO | null>(null)
  const [promptLang, setPromptLang] = useState<'orig' | 'zh'>('orig')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [detailStampTick, setDetailStampTick] = useState(0)
  const [detailStampLabel, setDetailStampLabel] = useState('已复制')
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)
  const [publishJob, setPublishJob] = useState<GenerationHistoryItem | null>(null)
  const [busyMineId, setBusyMineId] = useState<string | null>(null)
  const [pendingMineAction, setPendingMineAction] = useState<{
    type: 'withdraw' | 'delete'
    item: GalleryItemDTO
  } | null>(null)
  const [brokenImgIds, setBrokenImgIds] = useState<Record<string, boolean>>({})
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [interactionPendingIds, setInteractionPendingIds] = useState<Record<string, boolean>>({})

  // 评论区状态
  const [commentInput, setCommentInput] = useState('')
  const [replyTarget, setReplyTarget] = useState<GalleryCommentDTO | null>(null)
  const [postingComment, setPostingComment] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  // 响应小红书顶栏居中搜索框 & 移动端底部“我的”切换事件
  useEffect(() => {
    const onExternalSearch = (e: Event) => {
      const q = (e as CustomEvent<string>).detail ?? ''
      setSearchInput(q)
      setSearchQuery(q.trim())
      setMainTab('public')
    }
    const onSwitchTab = (e: Event) => {
      const target = (e as CustomEvent<GalleryMainTab>).detail
      if (target === 'public' || target === 'mine') {
        setMainTab(target)
      }
    }
    window.addEventListener(GALLERY_EXTERNAL_SEARCH_EVENT, onExternalSearch)
    window.addEventListener(GALLERY_SWITCH_TAB_EVENT, onSwitchTab)
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (isEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        setMainTab('public')
        requestAnimationFrame(() => searchInputRef.current?.focus())
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setMainTab('public')
        setFilterPopoverOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener(GALLERY_EXTERNAL_SEARCH_EVENT, onExternalSearch)
      window.removeEventListener(GALLERY_SWITCH_TAB_EVENT, onSwitchTab)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const publicQuery = useQuery({
    queryKey: [
      'gallery-public',
      user?.id ?? 'anon',
      sourceFilter,
      categoryFilter,
      sortOrder,
      aspectFilter,
      searchQuery,
      pageLimit,
    ],
    queryFn: () =>
      fetchPublicGalleryItemsApi({
        source: sourceFilter,
        category: categoryFilter,
        sort: sortOrder,
        aspectRatio: aspectFilter,
        q: searchQuery,
        limit: pageLimit,
        offset: 0,
      }),
    staleTime: 25_000,
  })

  const mineQuery = useQuery({
    queryKey: ['gallery-mine', user?.id],
    queryFn: () => fetchMyGalleryItemsApi(100, 0),
    enabled: Boolean(user),
    staleTime: 20_000,
  })

  const bookmarksQuery = useQuery({
    queryKey: ['gallery-bookmarks', user?.id],
    queryFn: () => fetchMyGalleryBookmarksApi(100, 0),
    enabled: Boolean(user) && mainTab === 'mine' && mineSubTab === 'bookmarks',
    staleTime: 20_000,
  })

  const commentsQuery = useQuery({
    queryKey: ['gallery-comments', activeItem?.id],
    queryFn: () => fetchGalleryCommentsApi(activeItem!.id),
    enabled: Boolean(activeItem && activeItem.status === 'published'),
    staleTime: 10_000,
  })

  const publicItems = publicQuery.data?.items ?? []
  const publicTotal = publicQuery.data?.total ?? 0
  const mySubmissions = useMemo(() => mineQuery.data?.items ?? [], [mineQuery.data?.items])
  const myBookmarks = useMemo(() => bookmarksQuery.data?.items ?? [], [bookmarksQuery.data?.items])
  const comments = commentsQuery.data?.items ?? []

  const submissionByJobId = useMemo(() => {
    const map = new Map<string, GalleryItemDTO>()
    for (const item of mySubmissions) {
      if (item.sourceJobId) map.set(item.sourceJobId, item)
    }
    return map
  }, [mySubmissions])

  const succeededWorks = useMemo(
    () => history.filter((item) => item.status === 'succeeded' && Boolean(item.imageUrl)),
    [history]
  )

  const activeFilterCount =
    (sourceFilter !== 'all' ? 1 : 0) +
    (sortOrder !== 'featured' ? 1 : 0) +
    (aspectFilter !== 'all' ? 1 : 0)

  const handleLaunchQuickPrompt = () => {
    const clean = quickPrompt.trim()
    setStudioMode('prompt')
    setRemixGallerySource(null)
    if (clean) {
      setUserPrompt(clean)
      setAspectRatio(quickRatio)
    }
    void navigate({ to: '/studio' })
  }

  const patchItemAcrossCaches = (itemId: string, patch: Partial<GalleryItemDTO>) => {
    setActiveItem((curr) => (curr && curr.id === itemId ? { ...curr, ...patch } : curr))
    queryClient.setQueriesData<{ items: GalleryItemDTO[]; total: number }>(
      { queryKey: ['gallery-public'] },
      (old) =>
        old
          ? {
              ...old,
              items: old.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
            }
          : old
    )
    queryClient.setQueriesData<{ items: GalleryItemDTO[]; total: number }>(
      { queryKey: ['gallery-bookmarks'] },
      (old) =>
        old
          ? {
              ...old,
              items: old.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
            }
          : old
    )
  }

  const handleToggleLike = async (item: GalleryItemDTO) => {
    if (!user) {
      toast.info('登录后即可点赞心仪作品')
      openAuthModal('login')
      return
    }
    if (interactionPendingIds[`like:${item.id}`]) return
    const prevLiked = Boolean(item.likedByMe)
    const prevCount = item.likeCount
    const nextLiked = !prevLiked
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1))

    setInteractionPendingIds((p) => ({ ...p, [`like:${item.id}`]: true }))
    playInkStamp()
    patchItemAcrossCaches(item.id, { likedByMe: nextLiked, likeCount: nextCount })

    try {
      const res = await toggleGalleryLikeApi(item.id)
      patchItemAcrossCaches(item.id, { likedByMe: res.liked, likeCount: res.likeCount })
    } catch (err) {
      patchItemAcrossCaches(item.id, { likedByMe: prevLiked, likeCount: prevCount })
      toast.error(err instanceof Error ? err.message : '点赞失败')
    } finally {
      setInteractionPendingIds((p) => {
        const copy = { ...p }
        delete copy[`like:${item.id}`]
        return copy
      })
    }
  }

  const handleToggleBookmark = async (item: GalleryItemDTO) => {
    if (!user) {
      toast.info('登录后即可收藏到个人空间')
      openAuthModal('login')
      return
    }
    if (interactionPendingIds[`bm:${item.id}`]) return
    const prevSaved = Boolean(item.bookmarkedByMe)
    const prevCount = item.bookmarkCount
    const nextSaved = !prevSaved
    const nextCount = Math.max(0, prevCount + (nextSaved ? 1 : -1))

    setInteractionPendingIds((p) => ({ ...p, [`bm:${item.id}`]: true }))
    playInkStamp()
    patchItemAcrossCaches(item.id, { bookmarkedByMe: nextSaved, bookmarkCount: nextCount })

    try {
      const res = await toggleGalleryBookmarkApi(item.id)
      patchItemAcrossCaches(item.id, {
        bookmarkedByMe: res.bookmarked,
        bookmarkCount: res.bookmarkCount,
      })
      void queryClient.invalidateQueries({ queryKey: ['gallery-bookmarks'] })
      if (res.bookmarked) toast.success('已收藏到我的空间')
    } catch (err) {
      patchItemAcrossCaches(item.id, { bookmarkedByMe: prevSaved, bookmarkCount: prevCount })
      toast.error(err instanceof Error ? err.message : '收藏失败')
    } finally {
      setInteractionPendingIds((p) => {
        const copy = { ...p }
        delete copy[`bm:${item.id}`]
        return copy
      })
    }
  }

  const handlePostComment = async () => {
    if (!activeItem || postingComment) return
    if (!user) {
      toast.info('登录后即可发表评论交流')
      openAuthModal('login')
      return
    }
    const clean = commentInput.trim()
    if (!clean) return
    setPostingComment(true)
    try {
      const res = await createGalleryCommentApi(activeItem.id, {
        content: clean,
        replyToId: replyTarget?.id ?? null,
      })
      setCommentInput('')
      setReplyTarget(null)
      patchItemAcrossCaches(activeItem.id, { commentCount: res.commentCount })
      void queryClient.invalidateQueries({ queryKey: ['gallery-comments', activeItem.id] })
      toast.success('评论已发布')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '评论发布失败')
    } finally {
      setPostingComment(false)
    }
  }

  const handleDeleteComment = async (comment: GalleryCommentDTO) => {
    if (!activeItem || deletingCommentId) return
    setDeletingCommentId(comment.id)
    try {
      const res = await deleteGalleryCommentApi(comment.id)
      patchItemAcrossCaches(activeItem.id, { commentCount: res.commentCount })
      void queryClient.invalidateQueries({ queryKey: ['gallery-comments', activeItem.id] })
      toast.success('评论已删除')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除评论失败')
    } finally {
      setDeletingCommentId(null)
    }
  }

  const handleOpenDetail = (item: GalleryItemDTO) => {
    setActiveItem(item)
    setPromptLang(item.promptText ? 'orig' : 'zh')
    setCommentInput('')
    setReplyTarget(null)
  }

  const handleRemix = (item: GalleryItemDTO) => {
    applyGalleryRemix(item)
    setActiveItem(null)
    void navigate({ to: '/studio' })
  }

  const handleCopyPrompt = async (item: GalleryItemDTO) => {
    const text =
      promptLang === 'zh' && item.promptZh
        ? item.promptZh
        : item.promptText || item.promptZh
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(item.id)
      setDetailStampLabel('已复制')
      setDetailStampTick((t) => t + 1)
      toast.success('已复制提示词')
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === item.id ? null : curr))
      }, 1800)
    } catch {
      toast.error('复制失败，请手动选中复制')
    }
  }

  const handleWithdraw = async (item: GalleryItemDTO) => {
    setBusyMineId(item.id)
    try {
      await withdrawMyGalleryItemApi(item.id)
      toast.success('已撤回公开展示')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-mine'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-public'] }),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '撤回失败')
    } finally {
      setBusyMineId(null)
    }
  }

  const handleDeleteSubmission = async (item: GalleryItemDTO) => {
    setBusyMineId(item.id)
    try {
      await deleteMyGalleryItemApi(item.id)
      toast.success('已删除投稿记录')
      if (activeItem?.id === item.id) setActiveItem(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-mine'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-public'] }),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusyMineId(null)
    }
  }

  const masonryColsCls =
    density === 3
      ? 'columns-1 gap-5 sm:columns-2 lg:columns-3'
      : density === 5
        ? 'columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5'
        : 'columns-2 gap-5 sm:columns-3 lg:columns-4'

  const renderFilterPopover = () => (
    <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
            activeFilterCount > 0
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-secondary/60 text-foreground hover:bg-secondary'
          )}
        >
          <SlidersHorizontalIcon className="size-3.5" />
          <span>筛选</span>
          {activeFilterCount > 0 && <span className="font-mono text-xs">{activeFilterCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 space-y-4 rounded-2xl border border-border bg-popover p-4 shadow-2xl"
      >
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">排序方式</div>
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSortOrder(opt.value)}
                className={cn(
                  'h-7 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors',
                  sortOrder === opt.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-foreground hover:bg-accent'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">作品来源</div>
          <div className="flex flex-wrap gap-1.5">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceFilter(opt.value)}
                className={cn(
                  'h-7 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors',
                  sourceFilter === opt.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-foreground hover:bg-accent'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">画幅比例</div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', '3:4', '9:16', '1:1', '4:3', '16:9'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setAspectFilter(r)}
                className={cn(
                  'h-7 cursor-pointer rounded-full px-2.5 font-mono text-xs font-medium transition-colors',
                  aspectFilter === r
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-foreground hover:bg-accent'
                )}
              >
                {r === 'all' ? '全部' : r}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 lg:hidden">
          <div className="text-xs font-semibold text-muted-foreground">画面密度</div>
          <div className="flex gap-1.5">
            {([3, 4, 5] as const).map((cols) => (
              <button
                key={cols}
                type="button"
                onClick={() => setDensity(cols)}
                className={cn(
                  'h-7 flex-1 cursor-pointer rounded-full font-mono text-xs font-medium transition-colors',
                  density === cols
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-foreground hover:bg-accent'
                )}
              >
                {cols} 列
              </button>
            ))}
          </div>
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSourceFilter('all')
              setSortOrder('featured')
              setAspectFilter('all')
            }}
            className="w-full cursor-pointer border-t border-border pt-2.5 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            重置筛选
          </button>
        )}
      </PopoverContent>
    </Popover>
  )

  /** 编辑部画册装裱瀑布流卡（Minimal Gallery 单基线 + Curated 悬浮渐进披露 + Landing Love 暖纸装裱） */
  const renderMasonryCard = (item: GalleryItemDTO, index = 0) => {
    const liked = Boolean(item.likedByMe)
    const bookmarked = Boolean(item.bookmarkedByMe)
    const eager = index < 6
    const aspectRatioValue =
      item.width && item.height
        ? `${item.width} / ${item.height}`
        : item.aspectRatio
          ? item.aspectRatio.replace(':', ' / ')
          : '3 / 4'
    const isBroken = Boolean(brokenImgIds[item.id])

    return (
      <motion.article
        key={item.id}
        initial={eager ? false : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.05 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
        className="group mb-5 break-inside-avoid"
      >
        {/* 博物馆装裱画框：静息态零文字零徽章干扰，悬停渐进披露操作胶囊 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetail(item)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleOpenDetail(item)
            }
          }}
          className="ed-mat relative cursor-pointer overflow-hidden rounded-[12px] p-1.5 transition-[border-color] duration-200 group-hover:border-foreground/25 group-hover:shadow-[0_14px_30px_rgba(10,10,10,0.08)] dark:group-hover:shadow-[0_16px_36px_rgba(0,0,0,0.55)]"
        >
          <div
            className="relative overflow-hidden rounded-[8px] bg-muted"
            style={{ aspectRatio: aspectRatioValue }}
          >
            {isBroken ? (
              <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted/60 px-3 text-center text-xs text-muted-foreground">
                <ImageOffIcon className="size-5 opacity-60" />
                <span>图片加载失败</span>
              </div>
            ) : (
              <img
                src={item.thumbUrl || item.imageUrl}
                alt={item.title || '画廊作品'}
                loading={eager ? 'eager' : 'lazy'}
                fetchPriority={index < 4 ? 'high' : undefined}
                decoding="async"
                onError={() =>
                  setBrokenImgIds((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: true }))
                }
                className="block size-full object-cover transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-[1.028] motion-reduce:transform-none"
              />
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-transparent opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100" />

            {/* 悬停浮现磨砂互动条（移动端常显防触屏盲区，桌面端悬停/聚焦披露） */}
            <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <div className="flex items-center gap-1.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  aria-label={liked ? '取消点赞' : '点赞'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleToggleLike(item)
                  }}
                  className={cn(
                    'relative inline-flex size-10 cursor-pointer items-center justify-center rounded-full backdrop-blur-md transition-[transform,background-color] duration-150 ease-[var(--ease-out)] sm:size-8',
                    liked ? 'bg-[#C42F16] text-white' : 'bg-black/55 text-white hover:bg-black/75'
                  )}
                >
                  <SpringBurstRing active={liked} colorClass="border-rose-400" />
                  <HeartIcon className={cn('relative z-10 size-3.5', liked && 'fill-current')} />
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  aria-label={bookmarked ? '取消收藏' : '收藏'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleToggleBookmark(item)
                  }}
                  className={cn(
                    'relative inline-flex size-10 cursor-pointer items-center justify-center rounded-full backdrop-blur-md transition-[transform,background-color] duration-150 ease-[var(--ease-out)] sm:size-8',
                    bookmarked
                      ? 'bg-[#E5A918] text-zinc-950'
                      : 'bg-black/55 text-white hover:bg-black/75'
                  )}
                >
                  <SpringBurstRing active={bookmarked} colorClass="border-amber-300" />
                  <BookmarkIcon className={cn('relative z-10 size-3.5', bookmarked && 'fill-current')} />
                </motion.button>
              </div>

              {(item.promptText || item.promptZh || item.sourceType === 'user_recipe') && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemix(item)
                  }}
                  className="group/btn inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-white/95 pr-2.5 pl-3 text-xs font-bold text-zinc-950 shadow-sm backdrop-blur-md transition hover:bg-white"
                >
                  <KineticRollText text="做同款" />
                  <ArrowUpRightIcon className="size-3.5 text-[#D9381E] transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Minimal Gallery 单基线画签：左标题 · 右作者与点赞数 */}
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            onClick={() => handleOpenDetail(item)}
            className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs font-medium tracking-tight text-foreground transition-colors hover:text-[#D9381E]"
          >
            {item.title || item.promptZh || item.promptText || '未命名灵感'}
          </button>

          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden max-w-[88px] truncate sm:inline">
              {item.xAuthorHandle ? `@${item.xAuthorHandle}` : item.authorName}
            </span>
            <button
              type="button"
              onClick={() => void handleToggleLike(item)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 font-mono tabular-nums transition-colors',
                liked ? 'font-semibold text-[#D9381E]' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <HeartIcon className={cn('size-3', liked && 'fill-current')} />
              <span>{item.likeCount}</span>
            </button>
          </div>
        </div>
      </motion.article>
    )
  }

  const marqueeItems: MarqueeRibbonItem[] =
    publicItems.length > 0
      ? publicItems.slice(0, 8).map((item, idx) => ({
          id: item.id,
          code: String(idx + 1).padStart(2, '0'),
          label: item.title || item.promptZh?.slice(0, 24) || item.promptText?.slice(0, 24) || '灵感作品',
          accent: idx === 0,
          onClick: () => handleOpenDetail(item),
        }))
      : GALLERY_CATEGORIES.map((cat, idx) => ({
          id: cat,
          code: String(idx + 1).padStart(2, '0'),
          label: `${cat} · 精选提示词`,
          accent: idx === 0,
          onClick: () => {
            setMainTab('public')
            setCategoryFilter(cat)
          },
        }))

  const stampA = publicItems[0]
  const stampB = publicItems[1]
  const showSpotlight =
    mainTab === 'public' &&
    categoryFilter === '全部' &&
    sourceFilter === 'all' &&
    !searchQuery &&
    publicItems.length >= 2

  return (
    <div className="flex w-full flex-col">
      {/* 仅在存在公开画廊作品时展示精选跑马灯带，避免空态与跑马灯宣传自相矛盾 */}
      {mainTab === 'public' && publicItems.length > 0 && (
        <EditorialMarqueeRibbon
          items={marqueeItems}
          className="rounded-none border-x-0"
        />
      )}

      {/* ==================== 全宽通栏编辑部画廊门户刊头 ==================== */}
      <header className="relative w-full border-b border-border/75 py-8 sm:py-11">
        <div className="mx-auto max-w-[1440px] space-y-6 px-4 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="ed-eyebrow flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#C42F16]" />
              <span className="whitespace-nowrap font-semibold text-foreground">CURATED PROMPT GALLERY</span>
              <span className="opacity-40">·</span>
              <span className="font-editorial-serif whitespace-nowrap text-[#855B00] dark:text-[#E5A918]">
                {publicTotal > 0 ? `Vol. ${publicTotal.toLocaleString('zh-CN')}` : '待收录首件公开作品'}
              </span>
            </div>

            {/* Recent Design 风格极简圆点分区切换 */}
            <div role="tablist" aria-label="画廊主分区" className="flex items-center gap-1 rounded-full border border-border/90 bg-card/90 p-0.5 shadow-xs">
              {(
                [
                  ['public', '公共灵感'],
                  ['mine', '我的空间'],
                ] as const
              ).map(([key, label]) => {
                const active = mainTab === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      if (!active) {
                        playMechanicalSwitch(key === 'public' ? 0.96 : 1.06)
                        setMainTab(key)
                      }
                    }}
                    className={cn(
                      'relative inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs transition-colors',
                      active
                        ? 'bg-[#151412] font-semibold text-white dark:bg-[#F5F2EB] dark:text-[#121110]'
                        : 'font-medium text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {active && <span aria-hidden="true" className="size-1.5 rounded-full bg-[#D9381E]" />}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {mainTab === 'public' && (
            <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,540px)]">
              <div className="space-y-3">
                <h1 className="ed-headline-tight text-3xl font-bold leading-[1.18] sm:text-5xl">
                  <span className="whitespace-nowrap text-foreground">值得收藏的</span>
                  {stampA && (
                    <InlineHeadlineStamp
                      src={stampA.thumbUrl || stampA.imageUrl}
                      alt={stampA.title || '精选作品'}
                      rotate={-6}
                      onClick={() => handleOpenDetail(stampA)}
                    />
                  )}
                  <span className="whitespace-nowrap text-foreground">提示词画册，</span>
                  <br />
                  <span className="mr-1.5 font-bold text-[#855B00] dark:text-[#F5C443]">
                    一键
                  </span>
                  {stampB && (
                    <InlineHeadlineStamp
                      src={stampB.thumbUrl || stampB.imageUrl}
                      alt={stampB.title || '精选作品'}
                      rotate={5}
                      onClick={() => handleOpenDetail(stampB)}
                    />
                  )}
                  <span className="whitespace-nowrap text-muted-foreground/80">
                    做同款或即刻文生图。
                  </span>
                </h1>
                <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  同步全网精选 X 提示词博主与社区创作者作品，支持中英双语提示词一键复制、点赞珍藏、讨论与直达工作台复现。
                </p>
              </div>

              {/* 黑曜石阳极氧化文生图发令台（高对比黑金质感 + 朱砂漆面发射钮） */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleLaunchQuickPrompt()
                }}
                className="ks-obsidian-stage dark flex flex-col gap-2.5 rounded-[22px] p-3 text-[#F6F2EA] shadow-[0_20px_54px_rgba(15,12,8,0.22)] transition-[border-color] duration-150 focus-within:border-[#E5A918]/55"
              >
                <div className="flex items-center gap-2 pl-2.5">
                  <WandSparklesIcon className="size-4 shrink-0 text-[#E5A918]" />
                  <input
                    aria-label="输入中英文画面灵感前往文生图创作台"
                    enterKeyHint="send"
                    value={quickPrompt}
                    onChange={(e) => setQuickPrompt(e.target.value)}
                    placeholder="输入画面灵感，直达文生图…"
                    className="h-9.5 min-w-0 flex-1 bg-transparent pr-1 text-xs text-white placeholder:text-[#A9A192] focus:outline-none sm:text-sm"
                  />
                  <button
                    type="submit"
                    aria-label="前往文生图创作"
                    title="前往文生图创作"
                    className="group relative flex size-9.5 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#F5C443] text-[#151412] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-[#FDE68A] active:scale-[0.96]"
                  >
                    <ArrowRightIcon className="relative z-10 size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2.5 pt-2">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-[#A9A192]">RATIO</span>
                    {(['3:4', '9:16', '1:1', '16:9'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          playBrassDialTick()
                          setQuickRatio(r)
                        }}
                        className={cn(
                          'h-6 cursor-pointer rounded-full px-2 font-mono text-xs transition-colors',
                          quickRatio === r
                            ? 'bg-[#E5A918] font-bold text-[#151412]'
                            : 'text-[#BDB5A6] hover:bg-white/10 hover:text-white'
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <span className="hidden font-mono text-xs text-[#E5A918]/85 sm:inline">Enter 直达</span>
                  <span className="font-mono text-xs text-[#E5A918]/85 sm:hidden">点箭头直达</span>
                </div>
              </form>
            </div>
          )}
        </div>
        <span aria-hidden="true" className="ks-foil-hairline absolute inset-x-0 bottom-0 h-[1px]" />
      </header>

      {/* ==================== 公共发现画廊内容 ==================== */}
      {mainTab === 'public' ? (
        <div className="flex w-full flex-col">
          {/* 全宽黑曜石聚光影院展厅带 */}
          {showSpotlight && (
            <section className="ks-obsidian-stage dark relative w-full border-b border-[#E5A918]/22 py-8 sm:py-10">
              <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
                <EditorialSpotlightCarousel
                  items={publicItems}
                  onOpenDetail={handleOpenDetail}
                  onRemix={handleRemix}
                  onToggleLike={(it) => void handleToggleLike(it)}
                />
              </div>
              <span aria-hidden="true" className="ks-foil-hairline pointer-events-none absolute inset-x-0 bottom-0 h-[1px]" />
            </section>
          )}

          {/* 暖和纸主展厅瀑布流区 */}
          <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pt-8 pb-28 sm:px-6 lg:px-10">
            {/* Curated 右侧渐隐横向分类条 + 搜索 + 筛选 + 密度切换 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="ed-fade-mask-x no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain pr-10">
                {(['全部', ...GALLERY_CATEGORIES] as const).map((cat) => {
                  const active = categoryFilter === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        if (!active) {
                          playBrassDialTick()
                          setCategoryFilter(cat)
                        }
                      }}
                      className={cn(
                        'relative inline-flex h-8.5 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs whitespace-nowrap transition-colors',
                        active
                          ? 'font-semibold text-background'
                          : 'border border-border/75 bg-card/75 font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="gallery-cat-pill"
                          transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                          className="pointer-events-none absolute inset-0 rounded-full bg-foreground"
                        />
                      )}
                      <span className="relative z-10">{cat}</span>
                    </button>
                  )
                })}
              </div>

              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setSearchQuery(searchInput.trim())
                  }}
                  className="relative flex min-w-0 flex-1 items-center sm:flex-initial"
                >
                  <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value)
                      if (!e.target.value.trim() && searchQuery) setSearchQuery('')
                    }}
                    placeholder="搜索提示词、风格或博主…"
                    className="h-9 w-full rounded-full border-border/90 bg-card/90 pr-7 pl-9 text-xs shadow-none sm:w-52"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      aria-label="清空搜索"
                      onClick={() => {
                        setSearchInput('')
                        setSearchQuery('')
                      }}
                      className="absolute right-2.5 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  )}
                </form>

                {renderFilterPopover()}

                {/* Curated 式紧凑列数切换 */}
                <div className="hidden items-center rounded-full border border-border/90 bg-card/90 p-0.5 lg:inline-flex">
                  {([3, 4, 5] as const).map((cols) => (
                    <button
                      key={cols}
                      type="button"
                      onClick={() => {
                        playBrassDialTick()
                        setDensity(cols)
                      }}
                      className={cn(
                        'h-7.5 cursor-pointer rounded-full px-2.5 font-mono text-xs transition-colors',
                        density === cols
                          ? 'bg-foreground font-semibold text-background'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {cols}列
                    </button>
                  ))}
                </div>
              </div>
            </div>

          {publicQuery.isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" />
                <span>加载灵感画廊…</span>
              </div>
            </div>
          ) : publicItems.length === 0 ? (
            <EmptyState
              icon={ImagesIcon}
              title={
                activeFilterCount > 0 || categoryFilter !== '全部' || searchQuery
                  ? '没有符合当前筛选的作品'
                  : '画廊暂未收录公开作品'
              }
              description={
                activeFilterCount > 0 || categoryFilter !== '全部' || searchQuery
                  ? '可以一键重置筛选条件，或前往创作台生成新作品。'
                  : '当前公共灵感库还是空的，去自由文生图或配方创作台发布第一件作品吧。'
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(activeFilterCount > 0 || categoryFilter !== '全部' || searchQuery) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => {
                        setSourceFilter('all')
                        setCategoryFilter('全部')
                        setSortOrder('featured')
                        setAspectFilter('all')
                        setSearchInput('')
                        setSearchQuery('')
                      }}
                    >
                      重置筛选
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="skin-accent-btn rounded-full border-0 text-xs font-semibold"
                    onClick={() => {
                      setStudioMode('prompt')
                      void navigate({ to: '/studio' })
                    }}
                  >
                    <WandSparklesIcon className="size-3.5" />
                    <span>去文生图创作</span>
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              <div className={masonryColsCls}>
                {publicItems.map((item, idx) => renderMasonryCard(item, idx))}
              </div>

              {publicItems.length < publicTotal && (
                <div className="flex justify-center pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPageLimit((n) => n + 40)}
                    className="h-9 rounded-full px-7 text-xs font-medium"
                  >
                    查看更多（{publicItems.length} / {publicTotal}）
                  </Button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      ) : (
        /* ==================== 我的空间（云端作品 · 我的收藏 · 我的投稿） ==================== */
        <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pt-8 pb-28 sm:px-6 lg:px-10">
          {!user ? (
            <EmptyState
              icon={LogInIcon}
              title="登录以进入个人空间"
              description="管理你的云端作品、查看收藏的灵感提示词，或将得意之作投稿到公共画廊。"
              action={
                <Button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="skin-accent-btn rounded-full border-0 px-6 text-xs font-semibold"
                >
                  登录 / 注册
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['works', `云端作品 (${succeededWorks.length})`],
                    ['bookmarks', `我的收藏${bookmarksQuery.data ? ` (${bookmarksQuery.data.total})` : ''}`],
                    ['submissions', `我的投稿 (${mySubmissions.length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMineSubTab(key)}
                    className={cn(
                      'h-8 cursor-pointer rounded-full px-4 text-xs transition-colors',
                      mineSubTab === key
                        ? 'bg-foreground font-semibold text-background'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mineSubTab === 'works' &&
                (succeededWorks.length === 0 ? (
                  <EmptyState
                    icon={SparklesIcon}
                    title="还没有已完成的云端作品"
                    description="前往创作台生成作品后，可随时在此一键分享至公共画廊。"
                    action={
                      <Link
                        to="/studio"
                        className="skin-accent-btn inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-xs font-semibold"
                      >
                        <WandSparklesIcon className="size-3.5" />
                        <span>前往创作台</span>
                      </Link>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {succeededWorks.map((job) => {
                      const sub = submissionByJobId.get(job.id)
                      const statusMeta = sub ? STATUS_BADGE_META[sub.status] : null
                      const canShare = !sub || sub.status === 'rejected' || sub.status === 'hidden'
                      const isPromptJob = job.snapshot?.generationMode === 'prompt'

                      return (
                        <article key={job.id} className="group flex flex-col">
                          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                            <img
                              src={job.imageUrl}
                              alt={job.recipeSummary}
                              loading="lazy"
                              decoding="async"
                              onClick={() => setZoomUrl(job.imageUrl)}
                              className="h-full w-full cursor-zoom-in object-cover transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-[1.025]"
                            />
                            {statusMeta && (
                              <span
                                className={cn(
                                  'absolute top-2.5 left-2.5 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md',
                                  statusMeta.cls
                                )}
                              >
                                {statusMeta.label}
                              </span>
                            )}
                            <div className="absolute inset-x-3 bottom-3 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              {canShare ? (
                                <button
                                  type="button"
                                  onClick={() => setPublishJob(job)}
                                  className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white/95 text-xs font-bold text-zinc-950 shadow-sm backdrop-blur-md hover:bg-white"
                                >
                                  <Share2Icon
                                    className="size-3.5"
                                    style={{ color: 'var(--skin-accent)' }}
                                  />
                                  <span>{sub ? '重新投稿' : '分享到公共画廊'}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => sub && handleOpenDetail(sub)}
                                  className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-full bg-black/70 text-xs font-semibold text-white backdrop-blur-md hover:bg-black/85"
                                >
                                  查看详情
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
                              {isPromptJob && job.snapshot?.userPrompt
                                ? job.snapshot.userPrompt
                                : job.recipeSummary}
                            </span>
                            {canShare && (
                              <button
                                type="button"
                                onClick={() => setPublishJob(job)}
                                className="shrink-0 cursor-pointer text-xs font-medium hover:underline sm:hidden"
                                style={{ color: 'var(--skin-accent)' }}
                              >
                                分享
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ))}

              {mineSubTab === 'bookmarks' &&
                (bookmarksQuery.isLoading ? (
                  <div className="flex min-h-[260px] items-center justify-center">
                    <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : myBookmarks.length === 0 ? (
                  <EmptyState
                    icon={BookmarkIcon}
                    title="还没有收藏任何作品"
                    description="在公共画廊看到喜欢的提示词或构图时，点一下收藏即可随时在此复用。"
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => setMainTab('public')}
                      >
                        去画廊逛逛
                      </Button>
                    }
                  />
                ) : (
                  <div className={masonryColsCls}>
                    {myBookmarks.map((item) => renderMasonryCard(item))}
                  </div>
                ))}

              {mineSubTab === 'submissions' &&
                (mineQuery.isLoading ? (
                  <div className="flex min-h-[260px] items-center justify-center">
                    <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : mySubmissions.length === 0 ? (
                  <EmptyState
                    icon={Share2Icon}
                    title="还没有投稿记录"
                    description="在「云端作品」挑选满意的成图即可提交至公共画廊审核。"
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => setMineSubTab('works')}
                      >
                        去挑选作品
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mySubmissions.map((item) => {
                      const meta = STATUS_BADGE_META[item.status]
                      const StatusIcon = meta.icon
                      const isBusy = busyMineId === item.id
                      return (
                        <article
                          key={item.id}
                          className="flex gap-3.5 rounded-2xl border border-border bg-card p-3.5"
                        >
                          <img
                            src={item.thumbUrl || item.imageUrl}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            onClick={() => handleOpenDetail(item)}
                            className="h-28 w-22 shrink-0 cursor-pointer rounded-xl object-cover"
                          />
                          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                                    meta.cls
                                  )}
                                >
                                  <StatusIcon className="size-3" />
                                  <span>{meta.label}</span>
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(item.createdAt)}
                                </span>
                              </div>
                              <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
                                {item.title || '无题作品'}
                              </h3>
                              {item.status === 'rejected' && item.reviewNote && (
                                <p className="text-xs text-destructive">驳回：{item.reviewNote}</p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                                <span>赞 {item.likeCount}</span>
                                <span>藏 {item.bookmarkCount}</span>
                                <span>同款 {item.remixCount}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDetail(item)}
                                className="h-7 rounded-full px-3 text-xs"
                              >
                                查看
                              </Button>
                              {(item.status === 'published' || item.status === 'pending') && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => setPendingMineAction({ type: 'withdraw', item })}
                                  className="h-7 rounded-full px-3 text-xs"
                                >
                                  撤回
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => setPendingMineAction({ type: 'delete', item })}
                                className="h-7 rounded-full px-2 text-xs text-muted-foreground hover:text-destructive"
                                aria-label="删除投稿"
                              >
                                <Trash2Icon className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ))}
            </>
          )}
        </div>
      )}

      {/* ==================== 作品详情与评论弹窗 ==================== */}
      <Dialog
        open={activeItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveItem(null)
            setReplyTarget(null)
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[92dvh] w-[96vw] max-w-[1060px] overflow-y-auto rounded-[24px] border border-border bg-card p-0 text-foreground shadow-2xl sm:max-w-[1060px] md:overflow-hidden"
        >
          {activeItem && (
            <div className="relative grid md:h-[min(88dvh,780px)] md:grid-cols-[1.24fr_410px]">
              <div className="ks-obsidian-stage dark relative flex min-h-[280px] items-center justify-center overflow-hidden p-5 sm:min-h-[420px] sm:p-8">
                <span
                  aria-hidden="true"
                  className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1px]"
                />
                <span aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3.5 size-3.5 border-t border-l border-[#E5A918]/45" />
                <span aria-hidden="true" className="pointer-events-none absolute top-3.5 right-3.5 size-3.5 border-t border-r border-[#E5A918]/45" />
                <span aria-hidden="true" className="pointer-events-none absolute bottom-3.5 left-3.5 size-3.5 border-b border-l border-[#E5A918]/45" />
                <span aria-hidden="true" className="pointer-events-none absolute right-3.5 bottom-3.5 size-3.5 border-r border-b border-[#E5A918]/45" />

                <VermilionHankoStamp
                  stampTick={detailStampTick}
                  label={detailStampLabel}
                  sublabel="GALLERY"
                  playSound={detailStampLabel === '已复制'}
                  className="right-6 bottom-16"
                />

                <img
                  src={activeItem.imageUrl}
                  alt={activeItem.title}
                  decoding="async"
                  onClick={() => setZoomUrl(activeItem.imageUrl)}
                  className="relative z-10 max-h-[76dvh] w-auto max-w-full cursor-zoom-in rounded-xl border border-white/10 object-contain shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
                />
                <button
                  type="button"
                  onClick={() => setZoomUrl(activeItem.imageUrl)}
                  aria-label="放大原图"
                  className="absolute right-4 bottom-4 z-20 flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-md transition hover:border-[#E5A918]/60 hover:bg-black/85"
                >
                  <ZoomInIcon className="size-4" />
                </button>
              </div>

              <div className="flex min-h-0 flex-col border-t border-border bg-card md:border-t-0 md:border-l">
                <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 border-b border-border px-6 py-4 text-left">
                  <div className="min-w-0 space-y-1">
                    <DialogTitle className="line-clamp-2 text-base font-bold leading-snug">
                      {activeItem.title || '无题作品'}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{activeItem.authorName}</span>
                      {activeItem.xAuthorHandle && (
                        <span className="font-mono">@{activeItem.xAuthorHandle}</span>
                      )}
                      {activeItem.xTweetUrl && (
                        <a
                          href={activeItem.xTweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 hover:underline"
                          style={{ color: 'var(--skin-accent)' }}
                        >
                          <span>原推文</span>
                          <ExternalLinkIcon className="size-3" />
                        </a>
                      )}
                      <span>·</span>
                      <span>{formatRelativeTime(activeItem.publishedAt || activeItem.createdAt)}</span>
                    </div>
                  </div>
                  <DialogClose asChild>
                    <button
                      type="button"
                      aria-label="关闭"
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </DialogClose>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                  {activeItem.sourceType !== 'user_recipe' &&
                    (activeItem.promptText || activeItem.promptZh ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">提示词</span>
                            {activeItem.promptText && activeItem.promptZh && (
                              <div className="inline-flex items-center gap-1 rounded-full bg-secondary p-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    playMechanicalSwitch(0.96)
                                    setPromptLang('orig')
                                  }}
                                  className={cn(
                                    'cursor-pointer rounded-full px-2 py-0.5 text-xs',
                                    promptLang === 'orig'
                                      ? 'bg-card font-semibold text-foreground'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  原文
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    playMechanicalSwitch(1.06)
                                    setPromptLang('zh')
                                  }}
                                  className={cn(
                                    'cursor-pointer rounded-full px-2 py-0.5 text-xs',
                                    promptLang === 'zh'
                                      ? 'bg-card font-semibold text-foreground'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  中文
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCopyPrompt(activeItem)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                          >
                            {copiedId === activeItem.id ? (
                              <>
                                <CheckIcon className="size-3.5 text-emerald-500" />
                                <span className="text-emerald-500">已复制</span>
                              </>
                            ) : (
                              <>
                                <CopyIcon className="size-3.5" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="max-h-44 overflow-y-auto rounded-2xl bg-secondary/70 p-3.5 text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
                          {promptLang === 'zh' && activeItem.promptZh
                            ? activeItem.promptZh
                            : activeItem.promptText || activeItem.promptZh}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-secondary/50 p-3.5 text-xs text-muted-foreground">
                        作者未公开原始提示词。
                      </div>
                    ))}

                  {activeItem.sourceType === 'user_recipe' && activeItem.recipePublic && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <LayersIcon className="size-3.5" />
                        <span>公开配方</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ['姿势', activeItem.recipePublic.pose],
                            ['服装', activeItem.recipePublic.costume],
                            ['人像', activeItem.recipePublic.portrait],
                          ] as const
                        ).map(([label, ref]) =>
                          ref ? (
                            <div
                              key={label}
                              className="overflow-hidden rounded-xl bg-secondary/50 ring-1 ring-border"
                            >
                              {ref.thumb && (
                                <img
                                  src={referenceImageUrl(ref.thumb)}
                                  alt={ref.name}
                                  loading="lazy"
                                  decoding="async"
                                  className="aspect-square w-full object-cover"
                                />
                              )}
                              <div className="p-1.5">
                                <div className="truncate text-xs font-medium text-foreground">
                                  {ref.name}
                                </div>
                              </div>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{activeItem.category || '其他'}</span>
                    <span>·</span>
                    <span className="font-mono">{activeItem.aspectRatio}</span>
                    {activeItem.profileName && (
                      <>
                        <span>·</span>
                        <span>{activeItem.profileName}</span>
                      </>
                    )}
                    {activeItem.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-muted-foreground/80">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {activeItem.status === 'published' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (!activeItem.likedByMe) {
                              setDetailStampLabel('已赞赏')
                              setDetailStampTick((t) => t + 1)
                            }
                            void handleToggleLike(activeItem)
                          }}
                          className={cn(
                            'inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition',
                            activeItem.likedByMe
                              ? 'border-rose-500/40 bg-rose-500/12 text-rose-500'
                              : 'border-border bg-secondary/40 text-foreground hover:bg-secondary'
                          )}
                        >
                          <HeartIcon
                            className={cn('size-4', activeItem.likedByMe && 'fill-current')}
                          />
                          <span className="tabular-nums">{activeItem.likeCount}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!activeItem.bookmarkedByMe) {
                              setDetailStampLabel('已珍藏')
                              setDetailStampTick((t) => t + 1)
                            }
                            void handleToggleBookmark(activeItem)
                          }}
                          className={cn(
                            'inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition',
                            activeItem.bookmarkedByMe
                              ? 'border-amber-400/50 bg-amber-400/15 text-amber-500'
                              : 'border-border bg-secondary/40 text-foreground hover:bg-secondary'
                          )}
                        >
                          <BookmarkIcon
                            className={cn('size-4', activeItem.bookmarkedByMe && 'fill-current')}
                          />
                          <span className="tabular-nums">{activeItem.bookmarkCount}</span>
                        </button>
                      </>
                    )}

                    {(activeItem.promptText ||
                      activeItem.promptZh ||
                      activeItem.sourceType === 'user_recipe') && (
                      <Button
                        type="button"
                        onClick={() => handleRemix(activeItem)}
                        className="skin-accent-btn h-10 flex-1 rounded-full border-0 text-xs font-bold"
                      >
                        <SparklesIcon className="size-4" />
                        <span>
                          {activeItem.sourceType === 'user_recipe' ? '套用同款配方' : '一键做同款'}
                        </span>
                        {activeItem.remixCount > 0 && (
                          <span className="font-mono opacity-85">({activeItem.remixCount})</span>
                        )}
                      </Button>
                    )}
                  </div>

                  {activeItem.status === 'published' && (
                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <MessageCircleIcon className="size-3.5 text-muted-foreground" />
                        <span>评论 ({activeItem.commentCount})</span>
                      </div>

                      {commentsQuery.isLoading ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          加载评论中…
                        </div>
                      ) : comments.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          还没有评论，来写下第一条灵感交流吧
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {comments.map((cmt) => (
                            <div key={cmt.id} className="group flex items-start gap-2.5">
                              {cmt.authorAvatar ? (
                                <img
                                  src={cmt.authorAvatar}
                                  alt={cmt.authorName}
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="mt-0.5 size-7 shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                                  <UserRoundIcon className="size-3.5" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-foreground">
                                      {cmt.authorName}
                                    </span>
                                    {cmt.replyToAuthorName && (
                                      <span className="text-muted-foreground">
                                        回复 <span className="text-foreground">@{cmt.replyToAuthorName}</span>
                                      </span>
                                    )}
                                    <span className="text-muted-foreground/80">
                                      {formatRelativeTime(cmt.createdAt)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => setReplyTarget(cmt)}
                                      className="inline-flex cursor-pointer items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    >
                                      <ReplyIcon className="size-3" />
                                      <span>回复</span>
                                    </button>
                                    {cmt.canDelete && (
                                      <button
                                        type="button"
                                        disabled={deletingCommentId === cmt.id}
                                        onClick={() => void handleDeleteComment(cmt)}
                                        className="inline-flex cursor-pointer items-center rounded-full p-1 text-muted-foreground hover:text-destructive"
                                        aria-label="删除评论"
                                      >
                                        <Trash2Icon className="size-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
                                  {cmt.content}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {activeItem.status === 'published' && (
                  <div className="shrink-0 space-y-2 border-t border-border bg-card px-5 py-3.5">
                    {replyTarget && (
                      <div className="flex items-center justify-between rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                        <span className="truncate">回复 @{replyTarget.authorName}</span>
                        <button
                          type="button"
                          aria-label="取消回复"
                          onClick={() => setReplyTarget(null)}
                          className="cursor-pointer rounded-full p-1 hover:text-foreground"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <Textarea
                        rows={1}
                        maxLength={300}
                        aria-label="输入评论内容"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            void handlePostComment()
                          }
                        }}
                        placeholder={
                          user
                            ? replyTarget
                              ? `回复 @${replyTarget.authorName}…`
                              : '说说你的看法或出图心得…'
                            : '登录后参与评论交流…'
                        }
                        className="min-h-[38px] max-h-24 flex-1 resize-none rounded-2xl bg-secondary/70 px-3.5 py-2 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        aria-label="发送评论"
                        disabled={postingComment || (Boolean(user) && !commentInput.trim())}
                        onClick={() => void handlePostComment()}
                        className="skin-accent-btn h-9 rounded-full border-0 px-3.5 text-xs font-semibold"
                      >
                        {postingComment ? (
                          <LoaderCircleIcon className="size-3.5 animate-spin" />
                        ) : (
                          <SendIcon className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PublishToGalleryDialog
        job={publishJob}
        open={publishJob !== null}
        onOpenChange={(open) => {
          if (!open) setPublishJob(null)
        }}
        onPublished={() => {
          void queryClient.invalidateQueries({ queryKey: ['gallery-mine'] })
        }}
      />

      <AlertDialog
        open={pendingMineAction !== null}
        onOpenChange={(next) => {
          if (!next && !busyMineId) setPendingMineAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMineAction?.type === 'withdraw' ? '确认撤回公开展示？' : '确认删除此投稿记录？'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              {pendingMineAction?.type === 'withdraw'
                ? `撤回后「${pendingMineAction.item.title || '无题作品'}」将从公共灵感画廊下架（你的云端原始作品仍会保留）。`
                : `将永久删除投稿「${pendingMineAction?.item.title || '无题作品'}」及其点赞、评论记录，删除后不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyMineId !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingMineAction?.type === 'delete' ? 'destructive' : 'default'}
              disabled={busyMineId !== null}
              onClick={() => {
                if (!pendingMineAction) return
                const current = pendingMineAction
                setPendingMineAction(null)
                if (current.type === 'withdraw') {
                  void handleWithdraw(current.item)
                } else {
                  void handleDeleteSubmission(current.item)
                }
              }}
            >
              {pendingMineAction?.type === 'withdraw' ? '确认撤回' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImageViewer
        open={zoomUrl !== null}
        imageUrl={zoomUrl || ''}
        title="画廊高清预览"
        onOpenChange={(open) => {
          if (!open) setZoomUrl(null)
        }}
      />
    </div>
  )
}
