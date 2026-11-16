import { ReferenceComparisonDialog } from '@/components/common/ReferenceComparisonDialog'
import { ImageViewer } from '@/components/common/ImageViewer'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CoinsIcon,
  DicesIcon,
  DownloadIcon,
  EyeIcon,
  GripVerticalIcon,
  ImagesIcon,
  ImagePlusIcon,
  LayersIcon,
  LayoutGridIcon,
  LinkIcon,
  LoaderCircleIcon,
  LogInIcon,
  MonitorIcon,
  PersonStandingIcon,
  RotateCcwIcon,
  ShirtIcon,
  ShuffleIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundIcon,
  WandSparklesIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { type ChangeEvent, type DragEvent, type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react'
import { toast } from '@/lib/notifications'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { ArtistLogo, AspectRatioLogo } from '@/components/studio/StudioEmblems'
import { StyleBrowserPanel } from '@/components/studio/StyleBrowserPanel'
import { StylePresetSelector } from '@/components/studio/StylePresetSelector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useIsMobile } from '@/hooks/use-mobile'
import { uploadReferenceFileApi } from '@/lib/apiClient'
import {
  getStudioArtist,
  STUDIO_ARTISTS,
  STUDIO_ASPECT_RATIOS,
  type StudioAspectRatio,
} from '@/lib/artists'
import { selectCostumeView } from '@/lib/costumeSources'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import { poseImagePath, poseThumbPath, referenceImageUrl, uploadedReferences } from '@/lib/recipeImages'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import {
  dataUrlToBlob,
  fileToDataUrl,
  stitchRecipeCanvas,
} from '@/services/aiGenerator'
import { getEffectiveStyleCatalog } from '../../shared/studio'
import { useStudio } from '@/store/studioStore'
import type { GenerationHistoryItem } from '@/types/gallery'

export const Route = createFileRoute('/studio')({
  staticData: { title: '角色合成台' },
  component: StudioPage,
})

const SCENE_QUICK_TAGS = [
  '全身立绘构图',
  '七分身半身景别',
  '低角度仰拍张力',
  '伦勃朗戏剧光影',
  '电影级逆光发丝',
  '棚拍柔光箱打光',
  '丁达尔体积光束',
  '微风拂动发丝衣摆',
  '精细织物纹理褶皱',
  '浅景深虚化背景',
  '极简纯色棚拍背景',
  '冷暖对比氛围光',
] as const

function SortableExtraPill({
  img,
  idx,
  onUpdateName,
  onRemove,
  onPreview,
}: {
  img: { id: string; name: string; url: string }
  idx: number
  onUpdateName: (id: string, name: string) => void
  onRemove: (id: string) => void
  onPreview: (url: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-lg border bg-card pr-1 pl-1 transition-all',
        isDragging ? 'border-[#E5A918] opacity-95 shadow-md' : 'border-border/80'
      )}
    >
      <button
        type="button"
        aria-label={`拖拽排序附图 ${idx + 1}`}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3" />
      </button>
      <button
        type="button"
        aria-label={`放大预览附图 ${idx + 1}`}
        onClick={(e) => {
          e.stopPropagation()
          onPreview(img.url)
        }}
        className="shrink-0 cursor-zoom-in overflow-hidden rounded border border-border transition-transform hover:scale-105"
      >
        <img src={img.url} alt={img.name} className="size-5 object-cover" />
      </button>
      <input
        type="text"
        value={img.name}
        onChange={(e) => onUpdateName(img.id, e.target.value)}
        placeholder={`附图#${idx + 1}`}
        aria-label={`附图 ${idx + 1} 备注`}
        className="w-16 truncate bg-transparent text-xs font-medium outline-none focus:w-24 focus:underline"
      />
      <button
        type="button"
        aria-label={`删除附图 ${idx + 1}`}
        onClick={() => onRemove(img.id)}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  )
}

function SlotSwapActions({
  slot,
  diceColorClass,
  similarTitle,
  otherTitle,
  uploadLabel,
  disabled,
  randomizingAction,
  uploadingSlot,
  spinKey,
  onRandomSlot,
  onUploadClick,
}: {
  slot: ReferenceSlot
  diceColorClass: string
  similarTitle: string
  otherTitle: string
  uploadLabel: string
  disabled: boolean
  randomizingAction: { slot: ReferenceSlot; scope: RandomScope } | null
  uploadingSlot: string | null
  spinKey: number
  onRandomSlot: (slot: ReferenceSlot, scope: RandomScope) => void
  onUploadClick: () => void
}) {
  const slotLabel = slot === 'portrait' ? '人像' : slot === 'costume' ? '服装' : '姿势'
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRandomSlot(slot, 'similar')}
        aria-label={`${slotLabel}换同类`}
        title={similarTitle}
        className="inline-flex h-7.5 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border/80 bg-[#FAF8F4] px-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground/35 hover:bg-muted disabled:opacity-50 dark:bg-muted/35"
      >
        {randomizingAction?.slot === slot && randomizingAction.scope === 'similar' ? (
          <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
        ) : (
          <motion.span
            key={spinKey}
            animate={{ rotate: spinKey ? 360 : 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex shrink-0 items-center"
          >
            <DicesIcon className={cn('size-3.5', diceColorClass)} />
          </motion.span>
        )}
        <span>换同类</span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onRandomSlot(slot, 'other')}
        aria-label={`${slotLabel}换其他`}
        title={otherTitle}
        className="inline-flex h-7.5 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border/80 bg-[#FAF8F4] px-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/35 hover:bg-muted disabled:opacity-50 dark:bg-muted/35"
      >
        {randomizingAction?.slot === slot && randomizingAction.scope === 'other' ? (
          <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
        ) : (
          <ShuffleIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span>换其他</span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onUploadClick}
        title={uploadLabel}
        aria-label={uploadLabel}
        className="inline-flex h-7.5 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border/80 bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/35 hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {uploadingSlot === slot ? (
          <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <UploadIcon className="size-3.5 shrink-0" />
        )}
        <span>上传</span>
      </button>
    </div>
  )
}

function StudioSplitLayout({
  isMobile,
  left,
  right,
}: {
  isMobile: boolean
  left: ReactNode
  right: ReactNode
}) {
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {left}
        {right}
      </div>
    )
  }
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 w-full flex-1 gap-0">
      <ResizablePanel defaultSize="46%" minSize="34%" className="flex h-full min-h-0 min-w-0 flex-col pr-2.5">
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="54%" minSize="34%" className="flex h-full min-h-0 min-w-0 flex-col pl-2.5">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function StudioPage() {
  const {
    user,
    providersLoaded,
    platform,
    providers,
    hydrated,
    recipe,
    selectedProvider,
    setSelectedProvider,
    stylePreset,
    setStylePreset,
    aspectRatio,
    setAspectRatio,
    history,
    previewUrl,
    setPreviewUrl,
    isGenerating,
    generationProgress,
    generationError,
    startGeneration,
    openAuthModal,
    openAccountModal,
    setPortrait,
    setCostume,
    setPose,
    clearRecipe,
    poseFrontOnly,
    setPoseFrontOnly,
    sceneNote,
    setSceneNote,
    toggleRecipePoseDepth,
    addExtraImage,
    removeExtraImage,
    updateExtraImageName,
    reorderExtraImages,
    randomizeRecipe,
    randomizeSlot,
    removeHistoryItem,
  } = useStudio()

  const isMobile = useIsMobile()
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const handleExtraDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderExtraImages(String(active.id), String(over.id))
    }
  }

  const [comparisonResult, setComparisonResult] = useState<GenerationHistoryItem | null>(null)
  const previewResult = history.find((item) => item.imageUrl === previewUrl)
  const qc = useQueryClient()
  const { data: posesData } = useQuery(posesQuery)
  const activePoseGroup =
    recipe.pose && recipe.pose.source !== 'upload' && posesData
      ? posesData.groups.find(
          (g) => g.key === `${recipe.pose?.体系}|${recipe.pose?.姿势编号 || recipe.pose?.id}`
        ) ??
        posesData.groups.find((g) => g.items.some((it) => it.id === recipe.pose?.id)) ??
        null
      : null
  const poseAngles = activePoseGroup?.order || []
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const slotInputRef = useRef<HTMLInputElement | null>(null)
  const uploadSlotRef = useRef<'portrait' | 'costume' | 'pose'>('portrait')
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [randomizingAction, setRandomizingAction] = useState<{
    slot: ReferenceSlot
    scope: RandomScope
  } | null>(null)
  const costumeViews = recipe.costume?.views?.filter((view) => view.原图 && view.缩略图) || []

  const dragDepthRef = useRef(0)
  const [hoveredRatio, setHoveredRatio] = useState<StudioAspectRatio | null>(null)
  const [styleModalOpen, setStyleModalOpen] = useState(false)
  const [styleModalInitialCat, setStyleModalInitialCat] = useState('all')
  const [styleModalSeed, setStyleModalSeed] = useState(0)
  const [galleryModalOpen, setGalleryModalOpen] = useState(false)
  const [allDiceSpin, setAllDiceSpin] = useState(0)
  const [slotActionSpin, setSlotActionSpin] = useState<Record<string, number>>({})

  const activeProviderInfo =
    providers.find((p) => p.providerId === selectedProvider) ?? {
      providerId: selectedProvider,
      enabled: true,
      configured: false,
      creditCost: 0,
      sortOrder: 0,
      artist: getStudioArtist(selectedProvider),
    }
  const activeArtist = activeProviderInfo.artist
  const activeProviderReady = activeProviderInfo.enabled && activeProviderInfo.configured
  const activeCost = activeProviderInfo.creditCost
  const displayRatio =
    STUDIO_ASPECT_RATIOS.find((r) => r.id === (hoveredRatio ?? aspectRatio)) ??
    STUDIO_ASPECT_RATIOS[0]

  const extraImages = recipe.extraImages || []
  const hasAnyRef = Boolean(recipe.portrait || recipe.costume || recipe.pose || extraImages.length > 0)
  const coreCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  const [extraUrlInput, setExtraUrlInput] = useState('')
  const [urlModalOpen, setUrlModalOpen] = useState(false)
  const [stitchModalUrl, setStitchModalUrl] = useState<string | null>(null)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleSlotUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const slot = uploadSlotRef.current
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setUploadingSlot(slot)
    try {
      const dataUrl = await fileToDataUrl(file)
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const name = file.name.replace(/\.[^.]+$/, '') || '上传图片'
      let finalUrl = dataUrl
      let r2Key: string | undefined
      let finalBytes = file.size
      if (user) {
        const blob = dataUrlToBlob(dataUrl)
        const uploaded = await uploadReferenceFileApi({
          file: blob,
          filename: `${name}.png`,
          purpose: slot,
          width: image.width,
          height: image.height,
        })
        finalUrl = uploaded.url
        r2Key = uploaded.r2Key
        finalBytes = uploaded.bytes
      }
      const items = uploadedReferences(name, finalUrl, image.width, image.height, finalBytes, r2Key)
      if (slot === 'portrait') setPortrait(items.portrait)
      if (slot === 'costume') setCostume(items.costume)
      if (slot === 'pose') setPose(items.pose)
      toast.success(user ? '参考图已上传至云端' : '已暂存参考图（登录后将自动同步云端）')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片读取失败')
    } finally {
      setUploadingSlot(null)
    }
  }

  const processFiles = async (files: File[]) => {
    const imgFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imgFiles.length) return
    try {
      for (const file of imgFiles) {
        const dataUrl = await fileToDataUrl(file)
        const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 16) || '附加图'
        if (user) {
          const uploaded = await uploadReferenceFileApi({
            file: dataUrlToBlob(dataUrl),
            filename: `${baseName}.png`,
            purpose: 'extra',
          })
          addExtraImage({ name: baseName, url: uploaded.url, r2Key: uploaded.r2Key })
        } else {
          addExtraImage({ name: baseName, url: dataUrl })
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片上传失败')
    }
  }

  const handleWindowPaste = useEffectEvent((e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    const items = Array.from(e.clipboardData?.items || [])
    const files = items
      .filter((it) => it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean) as File[]
    if (files.length > 0) {
      e.preventDefault()
      void processFiles(files)
    }
  })

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => handleWindowPaste(e)
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const handleRandom = async () => {
    setAllDiceSpin((s) => s + 1)
    const [posesRes, costumes, portraits] = await Promise.all([
      qc.ensureQueryData(posesQuery),
      qc.ensureQueryData(costumesQuery),
      qc.ensureQueryData(portraitsQuery),
    ])
    randomizeRecipe({
      poses: posesRes.items,
      costumes,
      portraits,
    })
  }

  const handleRandomSlot = async (slot: ReferenceSlot, scope: RandomScope) => {
    const expectedId = recipe[slot]?.id ?? null
    const key = `${slot}:${scope}`
    setSlotActionSpin((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
    setRandomizingAction({ slot, scope })
    try {
      const pools =
        slot === 'portrait'
          ? { portraits: await qc.ensureQueryData(portraitsQuery) }
          : slot === 'costume'
            ? { costumes: await qc.ensureQueryData(costumesQuery) }
            : { poses: (await qc.ensureQueryData(posesQuery)).items }
      randomizeSlot(slot, scope, pools, expectedId)
    } catch {
      toast.error('素材库加载失败，请稍后重试')
    } finally {
      setRandomizingAction(null)
    }
  }

  const handleTogglePoseFrontOnly = async () => {
    const next = !poseFrontOnly
    setPoseFrontOnly(next)
    if (next && recipe.pose && recipe.pose.source !== 'upload' && recipe.pose.角度 !== '正面') {
      try {
        const data = posesData ?? (await qc.ensureQueryData(posesQuery))
        const group =
          data.groups.find(
            (g) => g.key === `${recipe.pose?.体系}|${recipe.pose?.姿势编号 || recipe.pose?.id}`
          ) ?? data.groups.find((g) => g.items.some((it) => it.id === recipe.pose?.id))
        const frontItem = group?.angles['正面']
        if (frontItem) {
          setPose({ ...frontItem, useDepth: Boolean(recipe.pose.useDepth) })
          toast.success('已锁定「正面」随机，并切换当前姿势为正面')
          return
        }
      } catch {
        // ignore if pose dataset failed to load
      }
    }
    toast.success(
      next
        ? '已锁定「正面」：换同类/换其他与全随机仅抽正面视角'
        : '已切为全视角：换同类/换其他与全随机可抽取任意视角'
    )
  }

  const handleUploadFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await processFiles(files)
    e.target.value = ''
  }

  const handleDropFiles = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    await processFiles(files)
  }

  const handleAddUrl = () => {
    const trimmed = extraUrlInput.trim()
    if (!trimmed) return
    if (!/^https:\/\//i.test(trimmed)) {
      toast.error('出于安全限制，外部附图链接必须以 https:// 开头')
      return
    }
    addExtraImage({ name: '外部参考图', url: trimmed })
    setExtraUrlInput('')
    setUrlModalOpen(false)
  }

  const handleOpenStitchModal = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setStitchModalUrl(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
  }

  const handleApplyHistoryRecipe = (item: GenerationHistoryItem) => {
    if (!item.snapshot?.recipe) {
      toast.info('该作品未保存配方快照')
      return
    }
    const snap = item.snapshot
    setPortrait(snap.recipe.portrait ?? null)
    setCostume(snap.recipe.costume ?? null)
    setPose(snap.recipe.pose ?? null)
    const validStyleIds = new Set(getEffectiveStyleCatalog(platform).map((s) => s.id))
    if (snap.stylePreset && (snap.stylePreset === 'none' || validStyleIds.has(snap.stylePreset))) {
      setStylePreset(snap.stylePreset)
    }
    if (snap.aspectRatio) {
      setAspectRatio(snap.aspectRatio)
    }
    if (snap.sceneNote) {
      setSceneNote(snap.sceneNote)
    }
    setGalleryModalOpen(false)
    toast.success('已套用该作品的角色配方')
  }

  const handleGenerate = () => {
    if (!user) {
      openAuthModal('login')
      return
    }
    if (user.creditBalance < activeCost) {
      toast.error(`积分不足（需要 ${activeCost} 积分，当前 ${user.creditBalance} 积分）`)
      openAccountModal('redeem')
      return
    }
    void startGeneration(sceneNote)
  }

  const styleCatalog = getEffectiveStyleCatalog(platform)
  const isKnownStyle = (key: string | null | undefined) =>
    key === 'none' || Boolean(key && styleCatalog.some((s) => s.id === key))
  const activeStyleKey = isKnownStyle(stylePreset) ? stylePreset : 'none'
  const activeStyleItem = styleCatalog.find((s) => s.id === activeStyleKey) ?? null
  const styleVisual = getStyleVisualMeta(activeStyleKey, activeStyleItem)
  const viewfinderStyleLabel = activeStyleItem?.label || '无预设（跟随参考图）'
  const succeededHistory = history.filter((h) => h.status === 'succeeded' && h.imageUrl)
  const recentHistory = succeededHistory.slice(0, 10)
  const previewArtist = previewResult ? getStudioArtist(previewResult.provider) : activeArtist

  const openStylePicker = (categoryId = 'all') => {
    setStyleModalInitialCat(categoryId)
    setStyleModalSeed((n) => n + 1)
    setStyleModalOpen(true)
  }

  const toggleSceneQuickTag = (tag: string) => {
    setSceneNote((prev) => {
      const tokens = prev
        .split(/[，,、]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const exists = tokens.includes(tag)
      const next = exists ? tokens.filter((t) => t !== tag) : [...tokens, tag]
      return next.join('，')
    })
  }

  const insufficientCredits = Boolean(user && activeProviderReady && user.creditBalance < activeCost)

  return (
    <div
      className="flex flex-col gap-2 md:min-h-0 md:flex-1"
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepthRef.current += 1
        setIsDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setIsDragging(false)
      }}
      onDrop={handleDropFiles}
    >
      {/* 极简控制台单行顶栏 */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">角色合成工作台</h1>
          <span className="hidden truncate font-mono text-xs text-muted-foreground lg:inline">
            {coreCount}/3 参考图 · {activeArtist.name} · {styleVisual.shortLabel} · {aspectRatio}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!user && platform.registerBonusCredits > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openAuthModal('register')}
              className="h-7 rounded-full bg-card px-3 text-xs font-semibold"
            >
              <LogInIcon className="size-3.5 text-[#D9381E]" />
              <span>注册即赠 {platform.registerBonusCredits} 积分</span>
            </Button>
          )}

          {history.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGalleryModalOpen(true)}
              className="h-7 rounded-full bg-card px-3 text-xs font-medium"
            >
              <ImagesIcon className="size-3.5 text-[#E5A918]" />
              <span>云端作品集 ({history.length})</span>
            </Button>
          )}
        </div>
      </header>

      {/* 上区：横跨全宽的三合一角色配方舞台（姿势 / 服装 / 人像 + 附图条） */}
      <section
        data-impeccable-ignore="nested-cards"
        className="ks-elevation shrink-0 rounded-2xl border border-border bg-card p-2 sm:p-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-xs font-extrabold tracking-tight sm:text-sm">角色配方</h2>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
              {coreCount}/3
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              点图片查看大图，空位跳转图库挑图，支持拖拽或 Ctrl+V / ⌘V 粘贴附图
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs active:scale-95"
              onClick={handleRandom}
            >
              <motion.span
                key={allDiceSpin}
                animate={{ rotate: allDiceSpin ? 360 : 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center"
              >
                <DicesIcon className="size-3.5 text-[#E5A918]" />
              </motion.span>
              <span>全随机</span>
            </Button>
            {hasAnyRef && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs"
                  onClick={handleOpenStitchModal}
                >
                  <LayoutGridIcon className="size-3.5" />
                  <span>拼图</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={clearRecipe}
                >
                  <Trash2Icon className="size-3.5" />
                  <span>清空</span>
                </Button>
              </>
            )}
          </div>
        </div>

        <input ref={slotInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlotUpload} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleUploadFiles}
        />

        {/* 三列横向大卡：姿势 / 服装 / 人像 */}
        <div className="ks-recess mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border/75 p-1.5 md:grid-cols-3">
          {/* 左卡：姿势 */}
          <div className="ks-paper-keycap @container/slot relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-border/80 bg-card p-2 pl-3 transition-colors hover:border-[#D9381E]/60">
            <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-1 rounded-r bg-[#D9381E]" />

            <div className="relative row-span-1 shrink-0 self-start @[360px]/slot:row-span-2">
              {recipe.pose ? (
                <>
                  <button
                    type="button"
                    aria-label="放大姿势参考图"
                    onClick={() => {
                      const item = recipe.pose
                      if (item) setZoomImageUrl(referenceImageUrl(poseImagePath(item)))
                    }}
                    className={cn(
                      'group/img relative block h-[104px] w-[78px] cursor-zoom-in overflow-hidden rounded-xl border border-border/80 @[300px]/slot:h-28 @[300px]/slot:w-[84px]',
                      recipe.pose.useDepth ? 'bg-[#2B2B32]' : 'bg-white dark:bg-zinc-900'
                    )}
                  >
                    <img
                      src={referenceImageUrl(poseThumbPath(recipe.pose))}
                      alt={recipe.pose.姿势名称}
                      className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover/img:scale-105"
                    />
                    <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                      <ZoomInIcon className="size-3" />
                    </span>
                  </button>
                  <button
                    type="button"
                    title="清除姿势"
                    aria-label="清除姿势参考图"
                    onClick={() => setPose(null)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </>
              ) : (
                <Link
                  to="/poses"
                  aria-label="前往姿势库选图"
                  className="flex h-[104px] w-[78px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/25 text-[#B82914] transition-colors hover:border-[#D9381E] hover:bg-muted/50 @[300px]/slot:h-28 @[300px]/slot:w-[84px] dark:text-[#FF7A59]"
                >
                  <PersonStandingIcon className="size-5.5" />
                  <span className="text-[11px] font-semibold">挑选姿势</span>
                </Link>
              )}
            </div>

            <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center rounded-md bg-[#D9381E]/10 px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-[#B82914] dark:bg-[#D9381E]/20 dark:text-[#FF7A59]">
                    姿势
                  </span>
                  {recipe.pose && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {recipe.pose.分类 || recipe.pose.体系}
                    </span>
                  )}
                </div>
                <Link
                  to="/poses"
                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>图库</span>
                  <ArrowUpRightIcon className="size-3" />
                </Link>
              </div>

              {recipe.pose ? (
                <div
                  className="line-clamp-2 text-xs leading-snug font-bold text-foreground sm:text-[13px]"
                  title={
                    recipe.pose.角度
                      ? `${recipe.pose.姿势名称} · ${recipe.pose.角度}`
                      : recipe.pose.姿势名称
                  }
                >
                  {poseAngles.length > 1
                    ? recipe.pose.姿势名称
                    : recipe.pose.角度
                      ? `${recipe.pose.姿势名称} · ${recipe.pose.角度}`
                      : recipe.pose.姿势名称}
                </div>
              ) : (
                <Link
                  to="/poses"
                  className="line-clamp-2 text-xs leading-snug text-muted-foreground hover:text-foreground hover:underline"
                >
                  尚未指定，点左侧前往图库挑图，或直接随机 / 上传
                </Link>
              )}

              {/* 姿势辅助控制：锁定正面随机 / 视角切换 / 白模与深度图 */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  aria-pressed={poseFrontOnly}
                  title={
                    poseFrontOnly
                      ? '已锁定「仅随机正面」：换同类/换其他/全随机仅抽正面（点击取消锁定）'
                      : '点击锁定「仅随机正面视角」'
                  }
                  aria-label={
                    poseFrontOnly
                      ? '已开启仅随机正面视角，点击关闭'
                      : '未开启仅随机正面视角，点击开启'
                  }
                  onClick={() => void handleTogglePoseFrontOnly()}
                  className={cn(
                    'h-6 shrink-0 whitespace-nowrap rounded-md border px-2 text-[11px] leading-none transition-colors',
                    poseFrontOnly
                      ? 'border-[#D9381E] bg-[#D9381E] font-semibold text-white'
                      : 'border-border/80 bg-[#FAF8F4] font-medium text-muted-foreground hover:text-foreground dark:bg-muted/45'
                  )}
                >
                  仅正面
                </button>

                {recipe.pose && poseAngles.length > 1 && (
                  <select
                    aria-label="已选姿势视角"
                    title="切换当前姿势视角"
                    value={recipe.pose.角度}
                    onChange={(e) => {
                      const nextPose = poseAngles.find((p) => p.角度 === e.target.value)
                      if (nextPose && recipe.pose) {
                        setPose({ ...nextPose, useDepth: Boolean(recipe.pose.useDepth) })
                      }
                    }}
                    className="h-6 max-w-[5.25rem] shrink-0 rounded-md border border-border/80 bg-[#FAF8F4] px-1.5 text-[11px] font-medium text-foreground outline-none transition-colors hover:bg-muted dark:bg-muted/45"
                  >
                    {poseAngles.map((p) => (
                      <option key={p.id} value={p.角度}>
                        {p.角度}
                      </option>
                    ))}
                  </select>
                )}

                {recipe.pose && recipe.pose.source !== 'upload' && (
                  <button
                    type="button"
                    onClick={toggleRecipePoseDepth}
                    aria-label={`切换白模或深度图，当前为${recipe.pose.useDepth ? '深度图' : '白模'}`}
                    className={cn(
                      'h-6 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] leading-none font-semibold transition-colors',
                      recipe.pose.useDepth
                        ? 'bg-[#116E65] text-white'
                        : 'border border-border/80 bg-[#FAF8F4] text-foreground hover:bg-muted dark:bg-muted/45'
                    )}
                  >
                    {recipe.pose.useDepth ? '深度图' : '白模图'}
                  </button>
                )}
              </div>
            </div>

            <div className="col-span-2 @[360px]/slot:col-span-1 @[360px]/slot:col-start-2 @[360px]/slot:row-start-2 @[360px]/slot:self-end">
              <SlotSwapActions
                slot="pose"
                diceColorClass="text-[#D9381E]"
                similarTitle="在相同体系与动作分类中换一个"
                otherTitle="从其他体系或动作分类中换一个"
                uploadLabel={recipe.pose ? '上传替换姿势参考图' : '上传姿势参考图'}
                disabled={uploadingSlot !== null || randomizingAction !== null}
                randomizingAction={randomizingAction}
                uploadingSlot={uploadingSlot}
                spinKey={slotActionSpin['pose:similar'] || 0}
                onRandomSlot={(s, scope) => void handleRandomSlot(s, scope)}
                onUploadClick={() => {
                  uploadSlotRef.current = 'pose'
                  slotInputRef.current?.click()
                }}
              />
            </div>
          </div>

          {/* 中卡：服装 */}
          <div className="ks-paper-keycap @container/slot relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-border/80 bg-card p-2 pl-3 transition-colors hover:border-[#19857B]/60">
            <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-1 rounded-r bg-[#19857B]" />

            <div className="relative row-span-1 shrink-0 self-start @[360px]/slot:row-span-2">
              {recipe.costume ? (
                <>
                  <button
                    type="button"
                    aria-label="放大服装参考图"
                    onClick={() => {
                      const item = recipe.costume
                      if (item) setZoomImageUrl(referenceImageUrl(item.预览图 || item.原图 || item.缩略图))
                    }}
                    className="group/img relative block h-[104px] w-[78px] cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-white @[300px]/slot:h-28 @[300px]/slot:w-[84px] dark:bg-zinc-900"
                  >
                    <img
                      src={referenceImageUrl(recipe.costume.缩略图)}
                      alt={recipe.costume.服装名称}
                      className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover/img:scale-105"
                    />
                    <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                      <ZoomInIcon className="size-3" />
                    </span>
                  </button>
                  <button
                    type="button"
                    title="清除服装"
                    aria-label="清除服装参考图"
                    onClick={() => setCostume(null)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </>
              ) : (
                <Link
                  to="/costumes"
                  aria-label="前往服装库选图"
                  className="flex h-[104px] w-[78px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/25 text-[#116E65] transition-colors hover:border-[#19857B] hover:bg-muted/50 @[300px]/slot:h-28 @[300px]/slot:w-[84px] dark:text-[#4FD1C5]"
                >
                  <ShirtIcon className="size-5.5" />
                  <span className="text-[11px] font-semibold">挑选服装</span>
                </Link>
              )}
            </div>

            <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center rounded-md bg-[#19857B]/12 px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-[#116E65] dark:bg-[#19857B]/20 dark:text-[#4FD1C5]">
                    服装
                  </span>
                  {recipe.costume && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {recipe.costume.一级分类 || recipe.costume.分类}
                    </span>
                  )}
                </div>
                <Link
                  to="/costumes"
                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>图库</span>
                  <ArrowUpRightIcon className="size-3" />
                </Link>
              </div>

              {recipe.costume ? (
                <div
                  className="line-clamp-2 text-xs leading-snug font-bold text-foreground sm:text-[13px]"
                  title={recipe.costume.服装名称}
                >
                  {recipe.costume.服装名称}
                </div>
              ) : (
                <Link
                  to="/costumes"
                  className="line-clamp-2 text-xs leading-snug text-muted-foreground hover:text-foreground hover:underline"
                >
                  尚未指定，点左侧前往图库挑图，或直接随机 / 上传
                </Link>
              )}

              {recipe.costume && costumeViews.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[11px] text-muted-foreground">视角</span>
                  <select
                    aria-label="已选服装视角"
                    value={
                      costumeViews.find((view) => view.id === recipe.costume?.selectedView)?.id ||
                      costumeViews.find((view) => view.id === 'front')?.id ||
                      costumeViews[0].id
                    }
                    onChange={(e) => {
                      if (recipe.costume) setCostume(selectCostumeView(recipe.costume, e.target.value))
                    }}
                    className="h-6.5 max-w-[7rem] rounded-md border border-border/80 bg-[#FAF8F4] px-1.5 text-[11px] font-medium text-foreground outline-none transition-colors hover:bg-muted dark:bg-muted/45"
                  >
                    {costumeViews.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="col-span-2 @[360px]/slot:col-span-1 @[360px]/slot:col-start-2 @[360px]/slot:row-start-2 @[360px]/slot:self-end">
              <SlotSwapActions
                slot="costume"
                diceColorClass="text-[#19857B]"
                similarTitle="在相同来源与分类中换一套"
                otherTitle="从其他分类或来源中换一套"
                uploadLabel={recipe.costume ? '上传替换服装参考图' : '上传服装参考图'}
                disabled={uploadingSlot !== null || randomizingAction !== null}
                randomizingAction={randomizingAction}
                uploadingSlot={uploadingSlot}
                spinKey={slotActionSpin['costume:similar'] || 0}
                onRandomSlot={(s, scope) => void handleRandomSlot(s, scope)}
                onUploadClick={() => {
                  uploadSlotRef.current = 'costume'
                  slotInputRef.current?.click()
                }}
              />
            </div>
          </div>

          {/* 右卡：人像 */}
          <div className="ks-paper-keycap @container/slot relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-border/80 bg-card p-2 pl-3 transition-colors hover:border-[#E5A918]/60">
            <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-1 rounded-r bg-[#E5A918]" />

            <div className="relative row-span-1 shrink-0 self-start @[360px]/slot:row-span-2">
              {recipe.portrait ? (
                <>
                  <button
                    type="button"
                    aria-label="放大人像参考图"
                    onClick={() => {
                      const item = recipe.portrait
                      if (item) setZoomImageUrl(referenceImageUrl(item.原图 || item.缩略图))
                    }}
                    className="group/img relative block h-[104px] w-[78px] cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-muted/30 @[300px]/slot:h-28 @[300px]/slot:w-[84px]"
                  >
                    <img
                      src={referenceImageUrl(recipe.portrait.缩略图)}
                      alt={recipe.portrait.标题}
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover/img:scale-105"
                    />
                    <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                      <ZoomInIcon className="size-3" />
                    </span>
                  </button>
                  <button
                    type="button"
                    title="清除人像"
                    aria-label="清除人像参考图"
                    onClick={() => setPortrait(null)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </>
              ) : (
                <Link
                  to="/portraits"
                  aria-label="前往人像库选图"
                  className="flex h-[104px] w-[78px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/25 text-[#7A5200] transition-colors hover:border-[#E5A918] hover:bg-muted/50 @[300px]/slot:h-28 @[300px]/slot:w-[84px] dark:text-[#E5A918]"
                >
                  <UserRoundIcon className="size-5.5" />
                  <span className="text-[11px] font-semibold">挑选人像</span>
                </Link>
              )}
            </div>

            <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center rounded-md bg-[#E5A918]/14 px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-[#7A5200] dark:bg-[#E5A918]/20 dark:text-[#F5C443]">
                    人像
                  </span>
                  {recipe.portrait && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {recipe.portrait.分区} · {recipe.portrait.发长}
                    </span>
                  )}
                </div>
                <Link
                  to="/portraits"
                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>图库</span>
                  <ArrowUpRightIcon className="size-3" />
                </Link>
              </div>

              {recipe.portrait ? (
                <div
                  className="line-clamp-2 text-xs leading-snug font-bold text-foreground sm:text-[13px]"
                  title={recipe.portrait.发型名称}
                >
                  {recipe.portrait.发型名称}
                </div>
              ) : (
                <Link
                  to="/portraits"
                  className="line-clamp-2 text-xs leading-snug text-muted-foreground hover:text-foreground hover:underline"
                >
                  尚未指定，点左侧前往图库挑图，或直接随机 / 上传
                </Link>
              )}
            </div>

            <div className="col-span-2 @[360px]/slot:col-span-1 @[360px]/slot:col-start-2 @[360px]/slot:row-start-2 @[360px]/slot:self-end">
              <SlotSwapActions
                slot="portrait"
                diceColorClass="text-[#E5A918]"
                similarTitle="在相同分区与发长中换一个"
                otherTitle="从其他分类中换一个"
                uploadLabel={recipe.portrait ? '上传替换人像参考图' : '上传人像参考图'}
                disabled={uploadingSlot !== null || randomizingAction !== null}
                randomizingAction={randomizingAction}
                uploadingSlot={uploadingSlot}
                spinKey={slotActionSpin['portrait:similar'] || 0}
                onRandomSlot={(s, scope) => void handleRandomSlot(s, scope)}
                onUploadClick={() => {
                  uploadSlotRef.current = 'portrait'
                  slotInputRef.current?.click()
                }}
              />
            </div>
          </div>
        </div>

        {/* 附加参考图全宽捷径条 */}
        <div
          onClick={() => extraImages.length === 0 && fileInputRef.current?.click()}
          className={cn(
            'mt-2 flex min-h-7 items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-0.5 transition-colors',
            isDragging
              ? 'border-[#E5A918] bg-muted text-foreground'
              : extraImages.length === 0
                ? 'cursor-pointer border-border bg-[#FAF8F4]/80 text-muted-foreground hover:border-foreground/40 hover:text-foreground dark:bg-muted/20'
                : 'border-border/80 bg-[#FAF8F4]/70 dark:bg-muted/20'
          )}
        >
          {extraImages.length > 0 ? (
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleExtraDragEnd}>
              <SortableContext
                items={extraImages.map((x) => x.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                  {extraImages.map((img, idx) => (
                    <SortableExtraPill
                      key={img.id}
                      img={img}
                      idx={idx}
                      onUpdateName={updateExtraImageName}
                      onRemove={removeExtraImage}
                      onPreview={setZoomImageUrl}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5 truncate text-xs">
              <ImagePlusIcon className="size-3.5 shrink-0" />
              <span className="truncate sm:hidden">
                {isDragging ? '松开添加到附加参考图' : '附加参考图 · 点击上传或粘贴'}
              </span>
              <span className="hidden truncate sm:inline">
                {isDragging
                  ? '松开添加到附加参考图'
                  : '附加参考图（道具 / 背景 / 风格参考）：点击上传、拖拽图片或 Ctrl+V / ⌘V 粘贴'}
              </span>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1.5">
            {extraImages.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground hover:bg-muted"
              >
                <ImagePlusIcon className="size-3" />
                <span>+ 图</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setUrlModalOpen(true)
              }}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <LinkIcon className="size-3" />
              <span>URL</span>
            </button>
          </div>
        </div>
      </section>

      {/* 下区：左侧生成控制 + 右侧纯净生成监视器 */}
      <StudioSplitLayout
        isMobile={isMobile}
        left={
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            {/* 控制台主区：选择画师 + 成图画风 + 画幅比例 + 画面细节 + 生成主按钮 */}
            <section
              data-impeccable-ignore="nested-cards"
              className="ks-elevation @container/controls flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
              {/* 选择画师 */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">选择画师</span>
                  <motion.div
                    key={activeArtist.id}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14 }}
                    className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 py-0.5 text-xs dark:bg-muted/50"
                  >
                    <ArtistLogo providerId={activeArtist.id} variant="inline" />
                    <span className="shrink-0 font-semibold text-foreground">{activeArtist.name}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="shrink-0 text-muted-foreground @[540px]/controls:hidden">{activeArtist.specialty}</span>
                    <span className="hidden truncate text-muted-foreground @[540px]/controls:inline">{activeArtist.bio}</span>
                  </motion.div>
                </div>

                <div role="radiogroup" aria-label="选择画师" className="grid grid-cols-1 gap-1.5 @[490px]/controls:grid-cols-3">
                  {STUDIO_ARTISTS.map((artist) => {
                    const pInfo = providers.find((p) => p.providerId === artist.id)
                    const enabled = pInfo ? pInfo.enabled : true
                    const configured = pInfo ? pInfo.configured : false
                    const cost = pInfo ? pInfo.creditCost : 0
                    const available = enabled && configured
                    const selected = selectedProvider === artist.id
                    return (
                      <button
                        key={artist.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={
                          providersLoaded
                            ? `${artist.name}（消耗 ${cost} 积分）：${artist.bio}`
                            : `${artist.name}：${artist.bio}`
                        }
                        onClick={() => {
                          if (!enabled) {
                            toast.info(`${artist.name}今日暂未开棚，先试试其他画师吧`)
                            return
                          }
                          setSelectedProvider(artist.id)
                        }}
                        className={cn(
                          'relative flex min-w-0 items-center gap-1.5 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-colors active:scale-[0.98]',
                          !enabled && 'opacity-45',
                          selected
                            ? 'border-foreground text-background shadow-xs'
                            : 'border-border/80 bg-[#FAF8F4] text-foreground hover:border-foreground/40 dark:bg-muted/35'
                        )}
                      >
                        {selected && (
                          <motion.span
                            layoutId="studio-artist-pill"
                            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                            className="absolute inset-0 bg-foreground"
                          />
                        )}
                        <div className="relative z-10 flex w-full min-w-0 items-center justify-between gap-1.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <ArtistLogo providerId={artist.id} selected={selected} />
                            <span className="truncate text-xs font-bold leading-tight">{artist.name}</span>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none',
                              selected
                                ? 'bg-background/20 text-background'
                                : available
                                  ? 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#E5A918]'
                                  : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {!providersLoaded
                              ? '加载中'
                              : !enabled
                                ? '暂休'
                                : !configured
                                  ? '整备中'
                                  : `${cost} 积分`}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 2. 成图画风 */}
              <div className="border-t border-border/70 pt-1.5">
                <StylePresetSelector
                  value={stylePreset}
                  onChange={setStylePreset}
                  onOpenBrowser={openStylePicker}
                />
              </div>

              {/* 画幅比例（独立步骤 + 右上角实时说明） */}
              <div className="space-y-1 border-t border-border/70 pt-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">画幅比例</span>
                  <motion.div
                    key={displayRatio.id}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14 }}
                    className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 py-0.5 text-xs dark:bg-muted/50"
                  >
                    <AspectRatioLogo ratio={displayRatio.id} compact className="text-foreground" />
                    <span className="shrink-0 font-mono font-bold text-foreground">{displayRatio.label}</span>
                    <span className="shrink-0 font-semibold text-foreground">{displayRatio.hint}</span>
                    <span className="hidden text-muted-foreground/50 @[540px]/controls:inline">·</span>
                    <span className="hidden truncate text-muted-foreground @[540px]/controls:inline">{displayRatio.description}</span>
                  </motion.div>
                </div>

                <div
                  role="group"
                  aria-label="选择成图画幅比例"
                  onMouseLeave={() => setHoveredRatio(null)}
                  className="grid grid-cols-5 gap-1 rounded-xl border border-border/80 bg-[#FAF8F4] p-1 dark:bg-muted/35"
                >
                  {STUDIO_ASPECT_RATIOS.map((opt) => {
                    const selected = aspectRatio === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${opt.label} ${opt.hint}`}
                        onClick={() => setAspectRatio(opt.id)}
                        onMouseEnter={() => setHoveredRatio(opt.id)}
                        onFocus={() => setHoveredRatio(opt.id)}
                        onBlur={() => setHoveredRatio(null)}
                        className={cn(
                          'relative flex min-h-[36px] flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-0.5 transition-colors',
                          selected ? 'text-background' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {selected && (
                          <motion.span
                            layoutId="studio-ratio-pill"
                            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                            className="absolute inset-0 rounded-lg bg-foreground shadow-2xs"
                          />
                        )}
                        <AspectRatioLogo
                          ratio={opt.id}
                          selected={selected}
                          className="relative z-10 size-4.5 sm:size-5"
                        />
                        <span className="relative z-10 font-mono text-xs font-bold leading-none">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 画面细节（独立步骤 + 单行横滑灵感条） */}
              <div className="space-y-1 border-t border-border/70 pt-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">画面细节</span>
                  <span className="text-xs text-muted-foreground">
                    点选标签或补充描述<span className="hidden sm:inline">（Cmd/Ctrl+Enter 生成）</span>
                  </span>
                </div>

                <div className="relative">
                  <Input
                    id="studio-scene-note"
                    aria-label="补充画面细节"
                    value={sceneNote}
                    onChange={(e) => setSceneNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === 'Enter' &&
                        hydrated &&
                        !isGenerating &&
                        uploadingSlot === null
                      ) {
                        e.preventDefault()
                        handleGenerate()
                      }
                    }}
                    placeholder="补充服装材质、灯光氛围、镜头景别或背景环境（可选）…"
                    className="h-7.5 rounded-xl bg-[#FAF8F4] pr-7 text-xs dark:bg-muted/30"
                  />
                  {sceneNote && (
                    <button
                      type="button"
                      aria-label="清空补充细节"
                      onClick={() => setSceneNote('')}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  )}
                </div>

                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
                  {SCENE_QUICK_TAGS.map((tag) => {
                    const active = sceneNote
                      .split(/[，,、]+/)
                      .map((s) => s.trim())
                      .includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleSceneQuickTag(tag)}
                        className={cn(
                          'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-tight font-medium transition-colors active:scale-95',
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border/80 bg-[#FAF8F4] text-muted-foreground hover:border-foreground/40 hover:text-foreground dark:bg-muted/35'
                        )}
                      >
                        +{tag}
                      </button>
                    )
                  })}
                </div>
              </div>
              </div>

              <div className="shrink-0 border-t border-border/75 bg-card/95 p-2">
                <Button
                  onClick={handleGenerate}
                  disabled={!hydrated || isGenerating || uploadingSlot !== null || (Boolean(user) && !activeProviderReady)}
                  className={cn(
                    'ks-keycap h-10 w-full rounded-xl border-0 text-sm font-extrabold tracking-tight text-white',
                    insufficientCredits
                      ? 'bg-[#B88300] hover:bg-[#9A6B00]'
                      : 'bg-[#D9381E] hover:bg-[#C23018]'
                  )}
                >
                  {isGenerating ? (
                    <>
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      <span>{activeArtist.name}正在绘制作品…</span>
                    </>
                  ) : !user ? (
                    <>
                      <LogInIcon className="size-4" />
                      <span>
                        {providersLoaded && activeProviderReady
                          ? `登录后立即生成角色图（消耗 ${activeCost} 积分）`
                          : '登录后立即生成角色图'}
                      </span>
                    </>
                  ) : !activeProviderReady ? (
                    <>
                      <CircleAlertIcon className="size-4" />
                      <span>{activeArtist.name}画室整备中，先试试其他画师吧</span>
                    </>
                  ) : insufficientCredits ? (
                    <>
                      <CoinsIcon className="size-4" />
                      <span>积分不足（需 {activeCost} / 剩 {user.creditBalance}）· 点击兑换积分</span>
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="size-4" />
                      <span>立即生成角色图 · 消耗 {activeCost} 积分</span>
                    </>
                  )}
                </Button>
              </div>
            </section>
          </div>
        }
        right={
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <section
              data-impeccable-ignore="nested-cards"
              className="ks-elevation flex min-h-[380px] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card p-2.5 md:min-h-0 md:p-3"
            >
              <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-1.5">
                <div className="flex items-center gap-2">
                  <MonitorIcon className="size-4 text-[#D9381E]" />
                  <h2 className="text-xs font-extrabold tracking-tight sm:text-sm">生成监视器</h2>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      isGenerating
                        ? 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#E5A918]'
                        : generationError
                          ? 'bg-destructive/15 text-destructive'
                          : previewUrl
                            ? 'bg-[#116E65]/12 text-[#116E65] dark:text-[#4FD1C5]'
                            : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        isGenerating
                          ? 'animate-pulse bg-[#E5A918]'
                          : generationError
                            ? 'bg-destructive'
                            : previewUrl
                              ? 'bg-[#116E65] dark:bg-[#4FD1C5]'
                              : 'bg-muted-foreground/50'
                      )}
                    />
                    {isGenerating
                      ? '绘制中'
                      : generationError
                        ? '生成失败'
                        : previewUrl
                          ? `${previewArtist.name} · 成图`
                          : '待命'}
                  </span>
                </div>

                {previewUrl && !isGenerating && (
                  <div className="flex items-center gap-1.5">
                    {previewResult && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-xs"
                        onClick={() => setComparisonResult(previewResult)}
                      >
                        <EyeIcon className="size-3.5" />
                        <span>对比</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-lg px-2 text-xs"
                      onClick={() => setZoomImageUrl(previewUrl)}
                    >
                      <ZoomInIcon className="size-3.5" />
                      <span>大图</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs" asChild>
                      <a href={previewUrl} download="character.png">
                        <DownloadIcon className="size-3.5" />
                        <span>下载</span>
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              {/* 主取景视窗（高度始终跟随分栏空间自适应，不被生成图片原始尺寸撑大） */}
              <div className="relative flex h-[340px] items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-[#FAF8F4] p-2.5 sm:h-[380px] md:h-auto md:min-h-0 md:flex-1 dark:bg-[#141418]">
                <span aria-hidden="true" className="pointer-events-none absolute top-2.5 left-2.5 size-3 border-t border-l border-foreground/20" />
                <span aria-hidden="true" className="pointer-events-none absolute top-2.5 right-2.5 size-3 border-t border-r border-foreground/20" />
                <span aria-hidden="true" className="pointer-events-none absolute bottom-2.5 left-2.5 size-3 border-b border-l border-foreground/20" />
                <span aria-hidden="true" className="pointer-events-none absolute right-2.5 bottom-2.5 size-3 border-r border-b border-foreground/20" />

                {isGenerating ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-[#E5A918] shadow-xs">
                      <LoaderCircleIcon className="size-6 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold">{activeArtist.name}正在绘制角色作品…</div>
                      {generationProgress && (
                        <div className="w-60 max-w-full space-y-1.5 pt-1">
                          <div className="text-xs text-foreground/80">{generationProgress.message}</div>
                          {generationProgress.percent !== undefined && (
                            <div className="h-1.5 overflow-hidden rounded-full border border-border bg-card">
                              <div
                                className="h-full bg-[#D9381E] transition-all duration-500"
                                style={{ width: `${generationProgress.percent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      <p className="pt-1 text-xs text-muted-foreground">云端生成中，若失败将自动全额退还积分</p>
                    </div>
                  </div>
                ) : generationError ? (
                  <div className="flex max-w-md flex-col items-center gap-2.5 text-center">
                    <CircleAlertIcon className="size-7 text-destructive" />
                    <div className="text-sm font-bold text-destructive">草稿未能顺利显影（已自动退还积分）</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {generationError}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="rounded-xl bg-[#D9381E] text-xs font-bold text-white hover:bg-[#C23018]"
                        onClick={handleGenerate}
                      >
                        <RotateCcwIcon className="size-3.5" />
                        重试生成（{activeCost} 积分/次）
                      </Button>
                      {previewUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-xs"
                          onClick={() => setZoomImageUrl(previewUrl)}
                        >
                          查看上一张作品
                        </Button>
                      )}
                    </div>
                  </div>
                ) : previewUrl ? (
                  <div className="absolute inset-2.5 flex items-center justify-center">
                    <motion.button
                      key={previewUrl}
                      type="button"
                      aria-label="放大生成结果"
                      initial={{ opacity: 0, scale: 0.97, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                      onClick={() => setZoomImageUrl(previewUrl)}
                      className="group relative flex h-full w-full cursor-zoom-in items-center justify-center focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <img
                        src={previewUrl}
                        alt="生成结果"
                        className="max-h-full max-w-full rounded-lg border border-border/60 object-contain shadow-sm transition group-hover:opacity-95"
                      />
                    </motion.button>
                  </div>
                ) : (
                  <div className="relative flex w-full max-w-md flex-col items-center gap-3.5 text-center sm:gap-4">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-foreground/[0.08]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/[0.04]"
                    />

                    <div className="relative flex max-w-full items-center justify-center gap-2 sm:gap-5">
                      <div className="flex items-center -space-x-4 sm:-space-x-3">
                        {[
                          {
                            key: 'pose',
                            label: '姿势',
                            src: recipe.pose ? referenceImageUrl(poseThumbPath(recipe.pose)) : '',
                            icon: PersonStandingIcon,
                            tint: 'text-[#D9381E] dark:text-[#FF7A59]',
                          },
                          {
                            key: 'costume',
                            label: '服装',
                            src: recipe.costume ? referenceImageUrl(recipe.costume.缩略图) : '',
                            icon: ShirtIcon,
                            tint: 'text-[#116E65] dark:text-[#4FD1C5]',
                          },
                          {
                            key: 'portrait',
                            label: '人像',
                            src: recipe.portrait ? referenceImageUrl(recipe.portrait.缩略图) : '',
                            icon: UserRoundIcon,
                            tint: 'text-[#B88300] dark:text-[#E5A918]',
                          },
                        ].map((slot, i) => {
                          const Icon = slot.icon
                          return (
                            <div
                              key={slot.key}
                              style={{ transform: `rotate(${(i - 1) * 5.5}deg)` }}
                              className="flex h-[76px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-transform sm:h-28 sm:w-[84px]"
                            >
                              {slot.src ? (
                                <img
                                  src={slot.src}
                                  alt={slot.label}
                                  className="h-full w-full object-cover object-top"
                                />
                              ) : (
                                <Icon className={cn('size-5 opacity-60', slot.tint)} />
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground/70" />

                      <button
                        type="button"
                        onClick={() => openStylePicker('all')}
                        aria-label={`更换画风（当前：${viewfinderStyleLabel}）`}
                        className="group relative flex size-22 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-[#D9381E]/85 bg-card shadow-md transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-ring sm:size-32"
                      >
                        {styleVisual.preview ? (
                          <>
                            <img
                              src={styleVisual.preview}
                              alt={viewfinderStyleLabel}
                              className="h-full w-full object-cover object-top"
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pt-4 pb-1.5 text-center">
                              <span className="block truncate text-xs font-bold text-white">{styleVisual.shortLabel}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 border border-dashed border-border/80 bg-muted/20 p-2 text-center">
                            <WandSparklesIcon className="size-5 text-[#D9381E] sm:size-6" />
                            <span className="text-[11px] font-bold text-foreground sm:text-xs">{styleVisual.shortLabel}</span>
                            <span className="text-[11px] text-muted-foreground sm:text-xs">按原图直出</span>
                          </div>
                        )}
                      </button>
                    </div>

                    <div className="relative space-y-1">
                      <div className="text-sm font-bold text-foreground">
                        {activeArtist.name} · {styleVisual.shortLabel} · {aspectRatio}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {styleVisual.tagline || '从三大图库挑卡，或自传参考图后点击生成'}
                      </p>
                    </div>

                    <div className="relative flex flex-wrap items-center justify-center gap-1.5 text-xs">
                      {[
                        {
                          label: recipe.pose
                            ? `姿势(${recipe.pose.角度 ? `${recipe.pose.角度}·` : ''}${recipe.pose.useDepth ? '深度' : '白模'})`
                            : '姿势',
                          to: '/poses' as const,
                          ok: Boolean(recipe.pose),
                        },
                        { label: '服装', to: '/costumes' as const, ok: Boolean(recipe.costume) },
                        { label: '人像', to: '/portraits' as const, ok: Boolean(recipe.portrait) },
                      ].map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors hover:border-foreground/40',
                            item.ok
                              ? 'border-[#116E65]/30 bg-[#116E65]/10 text-[#116E65] dark:border-[#4FD1C5]/30 dark:text-[#4FD1C5]'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {item.ok && <CheckCircle2Icon className="size-3" />}
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 底部胶片底片条 */}
              {recentHistory.length > 0 && (
                <div className="mt-2 flex shrink-0 items-center gap-2 border-t border-border/70 pt-2">
                  <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1">
                    {recentHistory.map((h) => {
                      const active = h.imageUrl === previewUrl
                      return (
                        <button
                          key={h.id}
                          type="button"
                          aria-label={`切换到成图：${h.recipeSummary}`}
                          onClick={() => setPreviewUrl(h.imageUrl)}
                          className={cn(
                            'relative h-12 w-10 shrink-0 overflow-hidden rounded-lg border transition-all',
                            active
                              ? 'border-[#D9381E] ring-2 ring-[#D9381E]/85'
                              : 'border-border/80 opacity-75 hover:opacity-100'
                          )}
                        >
                          <img src={h.imageUrl} alt={h.recipeSummary} className="h-full w-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGalleryModalOpen(true)}
                    className="h-12 shrink-0 rounded-lg px-2.5 text-xs font-medium"
                  >
                    全部 ({history.length})
                  </Button>
                </div>
              )}
            </section>
          </div>
        }
      />

      {/* 全部云端作品集弹窗 */}
      <Dialog open={galleryModalOpen} onOpenChange={setGalleryModalOpen}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-4xl overflow-y-auto p-4 sm:max-w-4xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">云端作品集 ({history.length})</DialogTitle>
          </DialogHeader>

          {history.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">暂无云端生成作品</div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {history.map((h) => {
                const histArtist = getStudioArtist(h.provider)
                return (
                  <div
                    key={h.id}
                    className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-[#FAF8F4] p-2 shadow-2xs dark:bg-muted/30"
                  >
                    <div className="relative aspect-3/4 overflow-hidden rounded-xl bg-muted/20">
                      {h.status === 'succeeded' && h.imageUrl ? (
                        <button
                          type="button"
                          aria-label={`查看生成记录：${h.recipeSummary}`}
                          onClick={() => {
                            setPreviewUrl(h.imageUrl)
                            setZoomImageUrl(h.imageUrl)
                          }}
                          className="block h-full w-full cursor-zoom-in"
                        >
                          <img
                            src={h.imageUrl}
                            alt={h.recipeSummary}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-black/75 px-2 py-0.5 font-mono text-xs text-white">
                            {histArtist.name} · {h.creditsCost} 积分
                          </span>
                        </button>
                      ) : h.status === 'processing' ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
                          <LoaderCircleIcon className="size-6 animate-spin text-[#E5A918]" />
                          <span>{histArtist.name}正在绘制中…</span>
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3 text-center">
                          <CircleAlertIcon className="size-5 text-destructive" />
                          <span className="text-xs font-semibold text-destructive">草稿未能显影</span>
                          <span className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                            {h.errorMessage || `${histArtist.name}刚打了会儿盹，再试一次吧~`}
                          </span>
                          {h.creditsRefunded > 0 && (
                            <span className="rounded-full bg-[#116E65]/15 px-2 py-0.5 text-[11px] font-semibold text-[#116E65] dark:text-[#4FD1C5]">
                              已退 {h.creditsRefunded} 积分
                            </span>
                          )}
                        </div>
                      )}

                      {h.status !== 'processing' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void removeHistoryItem(h.id)
                          }}
                          title="删除此作品"
                          className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white opacity-85 transition hover:bg-destructive hover:opacity-100"
                        >
                          <XIcon className="size-3" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2 space-y-1.5 px-0.5">
                      <div className="truncate text-xs font-bold">{h.recipeSummary}</div>
                      {h.status === 'succeeded' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-full rounded-xl bg-card text-xs"
                          onClick={() => setComparisonResult(h)}
                        >
                          对比参考
                        </Button>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyHistoryRecipe(h)}
                          className="flex h-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground transition hover:bg-muted/70"
                        >
                          套用配方
                        </button>
                        {h.status === 'succeeded' && h.imageUrl ? (
                          <a
                            href={h.imageUrl}
                            download={`character-${h.id}.png`}
                            className="flex h-7 items-center justify-center rounded-lg bg-[#D9381E] text-xs font-bold text-white transition hover:bg-[#C23018]"
                          >
                            下载
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled={h.status === 'processing'}
                            onClick={() => void removeHistoryItem(h.id)}
                            className="flex h-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-destructive transition hover:bg-destructive/15 disabled:opacity-40"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* URL 添加附图弹窗 */}
      <Dialog open={urlModalOpen} onOpenChange={setUrlModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">通过图片 URL 添加附图</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 pt-2">
            <Input
              value={extraUrlInput}
              onChange={(e) => setExtraUrlInput(e.target.value)}
              placeholder="粘贴 https://... 图片地址"
              className="rounded-xl bg-background font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <Button size="sm" className="rounded-xl text-xs" onClick={handleAddUrl}>
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ReferenceComparisonDialog
        result={comparisonResult}
        open={comparisonResult !== null}
        onOpenChange={(open) => !open && setComparisonResult(null)}
      />
      <ImageViewer
        imageUrl={zoomImageUrl || ''}
        open={Boolean(zoomImageUrl)}
        onOpenChange={(open) => !open && setZoomImageUrl(null)}
      />

      <Dialog open={Boolean(stitchModalUrl)} onOpenChange={(o) => !o && setStitchModalUrl(null)}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">参考图拼合卡片</DialogTitle>
            {stitchModalUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={stitchModalUrl} download="reference-sheet.jpg">
                  <DownloadIcon className="size-3.5" />
                  下载拼图
                </a>
              </Button>
            )}
          </DialogHeader>
          {stitchModalUrl && (
            <div className="mt-2 flex items-center justify-center overflow-hidden rounded-xl bg-muted p-2">
              <img src={stitchModalUrl} alt="参考拼图" className="max-h-[70dvh] w-auto rounded-lg object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 画风图鉴弹窗（移动端选风 + 桌面端放大浏览） */}
      <Dialog open={styleModalOpen} onOpenChange={setStyleModalOpen}>
        <DialogContent className="flex h-[86dvh] w-[96vw] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <LayersIcon className="size-4 text-[#D9381E]" />
              <span>画风图鉴 · 按大类 / 小类筛选</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              先按大类与小类缩小范围，再点选画风卡片；选中后自动返回工作台。
            </DialogDescription>
          </DialogHeader>
          <StyleBrowserPanel
            key={`${styleModalSeed}-${styleModalInitialCat}`}
            initialCategoryId={styleModalInitialCat}
            value={stylePreset}
            onChange={setStylePreset}
            onSelectComplete={() => setStyleModalOpen(false)}
            gridColsClassName="grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            className="min-h-0 flex-1"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
