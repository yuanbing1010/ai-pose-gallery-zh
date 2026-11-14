import { ReferenceComparisonDialog } from '@/components/common/ReferenceComparisonDialog'
import { ImageViewer } from '@/components/common/ImageViewer'
import { useQueryClient } from '@tanstack/react-query'
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
  CheckCircle2Icon,
  CircleAlertIcon,
  DicesIcon,
  DownloadIcon,
  EyeIcon,
  GripVerticalIcon,
  ImagesIcon,
  ImagePlusIcon,
  LayoutGridIcon,
  LinkIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  ShirtIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundIcon,
  WandSparklesIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/lib/notifications'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { StylePresetSelector } from '@/components/studio/StylePresetSelector'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  buildAspectRatioPatches,
  getStudioArtist,
  readCurrentAspectRatio,
  STUDIO_ARTISTS,
  STUDIO_ASPECT_RATIOS,
  type StudioAspectRatio,
} from '@/lib/artists'
import { validateReferenceCombinations, workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { selectCostumeView } from '@/lib/costumeSources'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import { poseImagePath, poseThumbPath, referenceImageUrl, uploadedReferences } from '@/lib/recipeImages'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'
import {
  buildRecipePrompt,
  fileToDataUrl,
  parseComfyWorkflowNodes,
  stitchRecipeCanvas,
  STYLE_PRESETS,
} from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'
import type { GenerationHistoryItem } from '@/types/gallery'

export const Route = createFileRoute('/studio')({
  staticData: { title: 'AI 合成台' },
  component: StudioPage,
})

function mergeSceneNote(basePrompt: string, sceneNote: string): string {
  const note = sceneNote.trim()
  if (!note) return basePrompt
  const anchor = '画面中没有任何文字、标志或水印。'
  const clause = `• 补充细节：${note}`
  if (basePrompt.includes(anchor)) {
    return basePrompt.replace(anchor, `${clause}\n${anchor}`)
  }
  return `${basePrompt}\n${clause}`
}

function SortableExtraPill({
  img,
  idx,
  onUpdateName,
  onRemove,
}: {
  img: { id: string; name: string; url: string }
  idx: number
  onUpdateName: (id: string, name: string) => void
  onRemove: (id: string) => void
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
      <img src={img.url} alt={img.name} className="size-5 shrink-0 rounded border border-border object-cover" />
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

function StudioPage() {
  const {
    hydrated,
    activeTask,
    resumeGeneration,
    stopTracking,
    recipe,
    apiConfig,
    history,
    previewUrl,
    setPreviewUrl,
    isGenerating,
    generationProgress,
    generationError,
    startGeneration,
    setPortrait,
    setCostume,
    setPose,
    toggleRecipePoseDepth,
    addExtraImage,
    removeExtraImage,
    updateExtraImageName,
    reorderExtraImages,
    updateApiConfig,
    updateGeminiParams,
    updateGptParams,
    updateQwenParams,
    updateDoubaoParams,
    randomizeRecipe,
    randomizeSlot,
    removeHistoryItem,
    clearHistory,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const slotInputRef = useRef<HTMLInputElement | null>(null)
  const uploadSlotRef = useRef<'portrait' | 'costume' | 'pose'>('portrait')
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [randomizingSlot, setRandomizingSlot] = useState<ReferenceSlot | null>(null)
  const [randomScopes, setRandomScopes] = useState<Record<ReferenceSlot, RandomScope>>({
    portrait: 'similar',
    costume: 'similar',
    pose: 'similar',
  })
  const costumeViews = recipe.costume?.views?.filter((view) => view.原图 && view.缩略图) || []
  const [showReferenceErrors, setShowReferenceErrors] = useState(false)
  const referenceErrorsRef = useRef<HTMLDivElement | null>(null)

  const [sceneNote, setSceneNote] = useState('')
  const [hoveredStyleKey, setHoveredStyleKey] = useState<string | null>(null)
  const [galleryModalOpen, setGalleryModalOpen] = useState(false)

  const activeProvider = apiConfig.activeProvider
  const activeArtist = getStudioArtist(activeProvider)
  const activeRatio = readCurrentAspectRatio(apiConfig)

  const activeWorkflowImages =
    activeProvider === 'comfyui' &&
    recipe.workflowImagesIdentity === workflowIdentity(apiConfig.comfyuiParams.workflowJson)
      ? Object.values(recipe.workflowImages || {})
      : []

  const extraImages = recipe.extraImages || []
  const hasStitchRefs = Boolean(recipe.portrait || recipe.costume || recipe.pose || extraImages.length > 0)
  const hasAnyRef = hasStitchRefs || activeWorkflowImages.length > 0
  const coreCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  const [extraUrlInput, setExtraUrlInput] = useState('')
  const [urlModalOpen, setUrlModalOpen] = useState(false)
  const [stitchModalUrl, setStitchModalUrl] = useState<string | null>(null)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const parsedComfyNodes = useMemo(
    () => parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson),
    [apiConfig.comfyuiParams.workflowJson]
  )

  const handleSelectAspectRatio = (ratio: StudioAspectRatio) => {
    const patches = buildAspectRatioPatches(ratio)
    updateGeminiParams(patches.gemini)
    updateGptParams(patches.gpt)
    updateQwenParams(patches.qwen)
    updateDoubaoParams(patches.doubao)
  }

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
      const url = await fileToDataUrl(file)
      const image = new Image()
      image.src = url
      await image.decode()
      const name = file.name.replace(/\.[^.]+$/, '') || '上传图片'
      const items = uploadedReferences(name, url, image.width, image.height, file.size)
      if (slot === 'portrait') setPortrait(items.portrait)
      if (slot === 'costume') setCostume(items.costume)
      if (slot === 'pose') setPose(items.pose)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片读取失败')
    } finally {
      setUploadingSlot(null)
    }
  }

  const missingReferences =
    activeProvider === 'comfyui'
      ? [
          { label: '人像', node: apiConfig.comfyuiParams.portraitNodeId, image: recipe.portrait },
          { label: '服装', node: apiConfig.comfyuiParams.costumeNodeId, image: recipe.costume },
          { label: '姿势', node: apiConfig.comfyuiParams.poseNodeId, image: recipe.pose },
        ]
          .filter(
            (slot) =>
              slot.node &&
              slot.node !== 'none' &&
              parsedComfyNodes.imageNodes.some((node) => node.id === slot.node && node.emptyValue === undefined) &&
              !slot.image
          )
          .map((slot) => slot.label)
      : []

  const processFiles = async (files: File[]) => {
    const imgFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imgFiles.length) return
    try {
      for (const file of imgFiles) {
        const dataUrl = await fileToDataUrl(file)
        const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 16)
        addExtraImage({ name: baseName || '附加图', url: dataUrl })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片读取失败')
    }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
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
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const handleRandom = async () => {
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

  const handleRandomSlot = async (slot: ReferenceSlot) => {
    const expectedId = recipe[slot]?.id ?? null
    setRandomizingSlot(slot)
    try {
      const pools =
        slot === 'portrait'
          ? { portraits: await qc.ensureQueryData(portraitsQuery) }
          : slot === 'costume'
            ? { costumes: await qc.ensureQueryData(costumesQuery) }
            : { poses: (await qc.ensureQueryData(posesQuery)).items }
      randomizeSlot(slot, randomScopes[slot], pools, expectedId)
    } catch {
      toast.error('素材库加载失败，请稍后重试')
    } finally {
      setRandomizingSlot(null)
    }
  }

  const toggleRandomScope = (slot: ReferenceSlot) => {
    setRandomScopes((cur) => ({
      ...cur,
      [slot]: cur[slot] === 'similar' ? 'all' : 'similar',
    }))
  }

  const handleUploadFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await processFiles(files)
    e.target.value = ''
  }

  const handleDropFiles = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    await processFiles(files)
  }

  const handleAddUrl = () => {
    const trimmed = extraUrlInput.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:image/')) {
      toast.error('请输入有效的 http(s):// 图片链接')
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
    if (snap.settings?.stylePreset && snap.settings.stylePreset in STYLE_PRESETS) {
      updateApiConfig({ stylePreset: snap.settings.stylePreset })
    }
    setGalleryModalOpen(false)
    toast.success('已套用该作品的角色配方')
  }

  const handleGenerate = () => {
    if (activeProvider === 'comfyui') {
      const cp = apiConfig.comfyuiParams
      const workflowImages =
        recipe.workflowImagesIdentity === workflowIdentity(cp.workflowJson) ? recipe.workflowImages || {} : {}
      const selected = [
        recipe.portrait ? cp.portraitNodeId : '',
        recipe.costume ? cp.costumeNodeId : '',
        recipe.pose ? cp.poseNodeId : '',
        ...Object.keys(workflowImages),
      ].filter((id) => id && id !== 'none')
      const combinationError = validateReferenceCombinations(cp.workflowJson, selected)
      if (combinationError) {
        toast.error(combinationError)
        return
      }
    }
    if (missingReferences.length) {
      setShowReferenceErrors(true)
      requestAnimationFrame(() => referenceErrorsRef.current?.focus())
      return
    }

    // 完整指令在后台按当前配方 + 画风 + 补充细节实时组装，不对外暴露可乱改模板
    const basePrompt = buildRecipePrompt(recipe, apiConfig.stylePreset, activeWorkflowImages, {
      prefix: apiConfig.defaultPromptPrefix,
      suffix: apiConfig.defaultPromptSuffix,
    })
    const finalPrompt = hasAnyRef ? mergeSceneNote(basePrompt, sceneNote) : basePrompt
    void startGeneration(finalPrompt)
  }

  const activeStyleKey = apiConfig.stylePreset in STYLE_PRESETS ? apiConfig.stylePreset : 'none'
  const viewfinderStyleKey = hoveredStyleKey && hoveredStyleKey in STYLE_PRESETS ? hoveredStyleKey : activeStyleKey
  const styleInfo = STYLE_PRESETS[viewfinderStyleKey]
  const styleVisual = getStyleVisualMeta(viewfinderStyleKey)
  const recentHistory = history.slice(0, 10)
  const previewArtist = previewResult ? getStudioArtist(previewResult.provider) : activeArtist

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 md:overflow-hidden">
      {/* 极简控制台单行顶栏 */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">AI 角色合成工作台</h1>
          <span className="hidden text-xs text-muted-foreground xl:inline">
            角色配方 · 挑选画师 · 设定画风与画幅
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {history.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGalleryModalOpen(true)}
              className="h-7 rounded-full bg-card px-3 text-xs font-medium"
            >
              <ImagesIcon className="size-3.5 text-[#E5A918]" />
              <span>作品集 ({history.length})</span>
            </Button>
          )}
          <Link
            to="/settings"
            title="接口与密钥配置"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-2xs transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <SlidersHorizontalIcon className="size-3.5" />
            <span>配置</span>
          </Link>
        </div>
      </header>

      {/* 主驾驶舱：桌面端锁定视口无滚动条，移动端流式堆叠 */}
      <ResizablePanelGroup
        orientation={isMobile ? 'vertical' : 'horizontal'}
        className="min-h-0 w-full flex-1 gap-3 md:gap-0"
      >
        {/* 左栏：1. 角色配方 → 2. 选择画师 → 3. 成图画风 → 4. 画面尺寸与细节 */}
        <ResizablePanel
          defaultSize={isMobile ? '100%' : '57%'}
          minSize={isMobile ? '30%' : '38%'}
          className="min-w-0 md:flex md:min-h-0 md:flex-col md:pr-2.5"
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDropFiles}
          >
            {/* 1. 角色配方卡带轨 */}
            <section
              data-impeccable-ignore="nested-cards"
              className="ks-elevation shrink-0 rounded-2xl border border-border bg-card p-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-extrabold tracking-tight sm:text-sm">1. 角色配方</h2>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                    {coreCount}/3
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6.5 rounded-full px-2.5 text-xs"
                    onClick={handleRandom}
                  >
                    <DicesIcon className="size-3 text-[#E5A918]" />
                    <span>全随机</span>
                  </Button>
                  {hasAnyRef && hasStitchRefs && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6.5 rounded-full px-2.5 text-xs"
                      onClick={handleOpenStitchModal}
                    >
                      <LayoutGridIcon className="size-3" />
                      <span>拼图</span>
                    </Button>
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

              {showReferenceErrors && missingReferences.length > 0 && (
                <div
                  id="reference-errors"
                  ref={referenceErrorsRef}
                  role="alert"
                  tabIndex={-1}
                  className="mt-1.5 rounded-xl border border-destructive bg-destructive/10 px-3 py-1.5 text-xs text-destructive focus-visible:outline-2"
                >
                  请先选择或上传：{missingReferences.join('、')}。
                </div>
              )}

              {/* 实体凹槽轨道：3 枚横向卡带 */}
              <div className="ks-recess mt-1.5 grid grid-cols-1 gap-1.5 rounded-xl border border-border/75 p-1.5 sm:grid-cols-3">
                {/* 01 人像卡带 */}
                <div
                  className={cn(
                    'ks-paper-keycap dark:ks-keycap group relative flex h-[72px] min-w-0 items-center gap-2 overflow-hidden rounded-lg border bg-card p-1.5 transition-all hover:-translate-y-0.5',
                    showReferenceErrors && missingReferences.includes('人像')
                      ? 'border-destructive ring-1 ring-destructive'
                      : 'border-border/80 hover:border-[#E5A918]/60'
                  )}
                >
                  <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-[#E5A918]" />
                  {recipe.portrait ? (
                    <button
                      type="button"
                      aria-label="放大人像参考图"
                      onClick={() => {
                        const item = recipe.portrait
                        if (item) setZoomImageUrl(referenceImageUrl(item.原图 || item.缩略图))
                      }}
                      className="relative h-full w-11 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border/80 bg-muted/30"
                    >
                      <img
                        src={referenceImageUrl(recipe.portrait.缩略图)}
                        alt={recipe.portrait.标题}
                        className="h-full w-full object-cover object-top"
                      />
                    </button>
                  ) : (
                    <Link
                      to="/portraits"
                      aria-label="前往人像库选图"
                      className="flex h-full w-11 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-[#B88300] transition-colors hover:border-[#E5A918] hover:bg-muted/60 dark:text-[#E5A918]"
                    >
                      <UserRoundIcon className="size-4" />
                    </Link>
                  )}

                  <div className="flex h-full min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[#B88300] dark:text-[#E5A918]">01 人像</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          title={recipe.portrait ? '上传替换人像' : '上传人像'}
                          aria-label={recipe.portrait ? '上传替换人像参考图' : '上传人像参考图'}
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onClick={() => {
                            uploadSlotRef.current = 'portrait'
                            slotInputRef.current?.click()
                          }}
                          className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {uploadingSlot === 'portrait' ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                        </button>
                        {recipe.portrait && (
                          <button
                            type="button"
                            title="清除人像"
                            aria-label="清除人像参考图"
                            onClick={() => setPortrait(null)}
                            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'truncate text-xs leading-tight',
                        recipe.portrait ? 'font-bold text-foreground' : 'text-muted-foreground'
                      )}
                      title={recipe.portrait?.发型名称}
                    >
                      {recipe.portrait ? (
                        recipe.portrait.发型名称
                      ) : (
                        <Link to="/portraits" className="hover:text-foreground hover:underline">
                          + 从人像库挑
                        </Link>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleRandomScope('portrait')}
                        aria-label={`切换人像换样范围，当前${randomScopes.portrait === 'similar' ? '同类' : '全部'}`}
                        className="h-5 shrink-0 rounded-md border border-border/80 bg-muted/50 px-1.5 text-xs leading-none font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {randomScopes.portrait === 'similar' ? '同类' : '全部'}
                      </button>
                      <button
                        type="button"
                        disabled={uploadingSlot !== null || randomizingSlot !== null}
                        onClick={() => void handleRandomSlot('portrait')}
                        aria-label="人像换一个"
                        className="inline-flex h-5 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-border/80 bg-muted/35 px-1.5 text-xs leading-none font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {randomizingSlot === 'portrait' ? (
                          <LoaderCircleIcon className="size-3 animate-spin" />
                        ) : (
                          <DicesIcon className="size-3 text-[#E5A918]" />
                        )}
                        <span className="truncate">换一个</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 02 服装卡带 */}
                <div
                  className={cn(
                    'ks-paper-keycap dark:ks-keycap group relative flex h-[72px] min-w-0 items-center gap-2 overflow-hidden rounded-lg border bg-card p-1.5 transition-all hover:-translate-y-0.5',
                    showReferenceErrors && missingReferences.includes('服装')
                      ? 'border-destructive ring-1 ring-destructive'
                      : 'border-border/80 hover:border-[#19857B]/60'
                  )}
                >
                  <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-[#19857B]" />
                  {recipe.costume ? (
                    <button
                      type="button"
                      aria-label="放大服装参考图"
                      onClick={() => {
                        const item = recipe.costume
                        if (item) setZoomImageUrl(referenceImageUrl(item.预览图 || item.原图 || item.缩略图))
                      }}
                      className="relative h-full w-11 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border/80 bg-white dark:bg-zinc-900"
                    >
                      <img
                        src={referenceImageUrl(recipe.costume.缩略图)}
                        alt={recipe.costume.服装名称}
                        className="h-full w-full object-contain p-0.5"
                      />
                    </button>
                  ) : (
                    <Link
                      to="/costumes"
                      aria-label="前往服装库选图"
                      className="flex h-full w-11 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-[#116E65] transition-colors hover:border-[#19857B] hover:bg-muted/60 dark:text-[#4FD1C5]"
                    >
                      <ShirtIcon className="size-4" />
                    </Link>
                  )}

                  <div className="flex h-full min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[#116E65] dark:text-[#4FD1C5]">02 服装</span>
                      <div className="flex items-center gap-0.5">
                        {recipe.costume && costumeViews.length > 0 && (
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
                            className="h-5 max-w-[3.4rem] rounded border border-border bg-muted/50 px-1 text-xs outline-none"
                          >
                            {costumeViews.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          title={recipe.costume ? '上传替换服装' : '上传服装'}
                          aria-label={recipe.costume ? '上传替换服装参考图' : '上传服装参考图'}
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onClick={() => {
                            uploadSlotRef.current = 'costume'
                            slotInputRef.current?.click()
                          }}
                          className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {uploadingSlot === 'costume' ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                        </button>
                        {recipe.costume && (
                          <button
                            type="button"
                            title="清除服装"
                            aria-label="清除服装参考图"
                            onClick={() => setCostume(null)}
                            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'truncate text-xs leading-tight',
                        recipe.costume ? 'font-bold text-foreground' : 'text-muted-foreground'
                      )}
                      title={recipe.costume?.服装名称}
                    >
                      {recipe.costume ? (
                        recipe.costume.服装名称
                      ) : (
                        <Link to="/costumes" className="hover:text-foreground hover:underline">
                          + 从服装库挑
                        </Link>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleRandomScope('costume')}
                        aria-label={`切换服装换样范围，当前${randomScopes.costume === 'similar' ? '同类' : '全部'}`}
                        className="h-5 shrink-0 rounded-md border border-border/80 bg-muted/50 px-1.5 text-xs leading-none font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {randomScopes.costume === 'similar' ? '同类' : '全部'}
                      </button>
                      <button
                        type="button"
                        disabled={uploadingSlot !== null || randomizingSlot !== null}
                        onClick={() => void handleRandomSlot('costume')}
                        aria-label="服装换一个"
                        className="inline-flex h-5 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-border/80 bg-muted/35 px-1.5 text-xs leading-none font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {randomizingSlot === 'costume' ? (
                          <LoaderCircleIcon className="size-3 animate-spin" />
                        ) : (
                          <DicesIcon className="size-3 text-[#19857B]" />
                        )}
                        <span className="truncate">换一个</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 03 姿势卡带 */}
                <div
                  className={cn(
                    'ks-paper-keycap dark:ks-keycap group relative flex h-[72px] min-w-0 items-center gap-2 overflow-hidden rounded-lg border bg-card p-1.5 transition-all hover:-translate-y-0.5',
                    showReferenceErrors && missingReferences.includes('姿势')
                      ? 'border-destructive ring-1 ring-destructive'
                      : 'border-border/80 hover:border-[#D9381E]/60'
                  )}
                >
                  <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-[#D9381E]" />
                  {recipe.pose ? (
                    <button
                      type="button"
                      aria-label="放大姿势参考图"
                      onClick={() => {
                        const item = recipe.pose
                        if (item) setZoomImageUrl(referenceImageUrl(poseImagePath(item)))
                      }}
                      className="relative h-full w-11 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border/80 bg-white dark:bg-zinc-900"
                    >
                      <img
                        src={referenceImageUrl(poseThumbPath(recipe.pose))}
                        alt={recipe.pose.姿势名称}
                        className="h-full w-full object-contain p-0.5"
                      />
                    </button>
                  ) : (
                    <Link
                      to="/poses"
                      aria-label="前往姿势库选图"
                      className="flex h-full w-11 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-[#D9381E] transition-colors hover:border-[#D9381E] hover:bg-muted/60 dark:text-[#FF7A59]"
                    >
                      <PersonStandingIcon className="size-4" />
                    </Link>
                  )}

                  <div className="flex h-full min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[#D9381E] dark:text-[#FF7A59]">03 姿势</span>
                      <div className="flex items-center gap-0.5">
                        {recipe.pose && recipe.pose.source !== 'upload' && (
                          <button
                            type="button"
                            onClick={toggleRecipePoseDepth}
                            aria-label={`切换白模或深度图，当前为${recipe.pose.useDepth ? '深度图' : '白模'}`}
                            className={cn(
                              'h-5 rounded-md px-1.5 text-xs leading-none font-semibold transition-colors',
                              recipe.pose.useDepth
                                ? 'bg-[#116E65] text-white'
                                : 'border border-border/80 bg-muted/50 text-foreground hover:bg-muted'
                            )}
                          >
                            {recipe.pose.useDepth ? '深度' : '白模'}
                          </button>
                        )}
                        <button
                          type="button"
                          title={recipe.pose ? '上传替换姿势' : '上传姿势'}
                          aria-label={recipe.pose ? '上传替换姿势参考图' : '上传姿势参考图'}
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onClick={() => {
                            uploadSlotRef.current = 'pose'
                            slotInputRef.current?.click()
                          }}
                          className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {uploadingSlot === 'pose' ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                        </button>
                        {recipe.pose && (
                          <button
                            type="button"
                            title="清除姿势"
                            aria-label="清除姿势参考图"
                            onClick={() => setPose(null)}
                            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'truncate text-xs leading-tight',
                        recipe.pose ? 'font-bold text-foreground' : 'text-muted-foreground'
                      )}
                      title={
                        recipe.pose
                          ? recipe.pose.角度
                            ? `${recipe.pose.姿势名称} · ${recipe.pose.角度}`
                            : recipe.pose.姿势名称
                          : undefined
                      }
                    >
                      {recipe.pose ? (
                        recipe.pose.角度 ? (
                          `${recipe.pose.姿势名称} · ${recipe.pose.角度}`
                        ) : (
                          recipe.pose.姿势名称
                        )
                      ) : (
                        <Link to="/poses" className="hover:text-foreground hover:underline">
                          + 从姿势库挑
                        </Link>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleRandomScope('pose')}
                        aria-label={`切换姿势换样范围，当前${randomScopes.pose === 'similar' ? '同类' : '全部'}`}
                        className="h-5 shrink-0 rounded-md border border-border/80 bg-muted/50 px-1.5 text-xs leading-none font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {randomScopes.pose === 'similar' ? '同类' : '全部'}
                      </button>
                      <button
                        type="button"
                        disabled={uploadingSlot !== null || randomizingSlot !== null}
                        onClick={() => void handleRandomSlot('pose')}
                        aria-label="姿势换一个"
                        className="inline-flex h-5 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-border/80 bg-muted/35 px-1.5 text-xs leading-none font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {randomizingSlot === 'pose' ? (
                          <LoaderCircleIcon className="size-3 animate-spin" />
                        ) : (
                          <DicesIcon className="size-3 text-[#D9381E]" />
                        )}
                        <span className="truncate">换一个</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 附图极简捷径条 */}
              <div
                onClick={() => extraImages.length === 0 && fileInputRef.current?.click()}
                className={cn(
                  'mt-1.5 flex min-h-8 items-center justify-between gap-2 rounded-xl border border-dashed px-2.5 py-1 transition-colors',
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
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5 truncate text-xs">
                    <ImagePlusIcon className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {isDragging ? '松开添加附加参考图' : '附图：点击上传、拖拽图片或 Ctrl+V / ⌘V 粘贴'}
                    </span>
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-1">
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

            {/* 控制台主区：2. 选择画师 + 3. 成图画风 + 4. 画幅尺寸与细节 + 生成按钮 */}
            <section
              data-impeccable-ignore="nested-cards"
              className="ks-elevation flex min-h-0 flex-1 flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-2.5"
            >
              {/* 2. 选择画师（创意代号，隐藏底层模型技术词） */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">2. 选择画师</span>
                  <div className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-[#FAF8F4] px-2.5 py-0.5 text-xs dark:bg-muted/50">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: activeArtist.accent }}
                    />
                    <span className="shrink-0 font-semibold text-foreground">{activeArtist.name}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="truncate text-muted-foreground">{activeArtist.bio}</span>
                  </div>
                </div>

                <div role="radiogroup" aria-label="选择画师" className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {STUDIO_ARTISTS.map((artist) => {
                    const selected = activeProvider === artist.id
                    const needsKey = artist.requiresKey && !apiConfig.providers[artist.id]?.apiKey?.trim()
                    return (
                      <button
                        key={artist.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${artist.name}（${artist.specialty}）：${artist.bio}`}
                        onClick={() => updateApiConfig({ activeProvider: artist.id })}
                        className={cn(
                          'relative flex min-w-0 flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left transition-all active:scale-[0.98]',
                          selected
                            ? 'border-foreground bg-foreground text-background shadow-xs'
                            : 'border-border/80 bg-[#FAF8F4] text-foreground hover:border-foreground/40 dark:bg-muted/35'
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: artist.accent }}
                            />
                            <span className="truncate text-xs font-bold leading-tight">{artist.name}</span>
                          </div>
                          {needsKey && (
                            <span
                              title="需在右上角「配置」中填写该画师密钥"
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                selected ? 'bg-[#E5A918]' : 'bg-[#E5A918]/75'
                              )}
                            />
                          )}
                        </div>
                        <span
                          className={cn(
                            'mt-0.5 truncate text-xs leading-tight',
                            selected ? 'text-background/75' : 'text-muted-foreground'
                          )}
                        >
                          {artist.specialty}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. 成图画风（跟随原图默认 + 13 种风格样张 7×2 矩阵） */}
              <div className="border-t border-border/70 pt-2">
                <StylePresetSelector
                  value={apiConfig.stylePreset}
                  onChange={(v) => updateApiConfig({ stylePreset: v })}
                  onHoverChange={setHoveredStyleKey}
                />
              </div>

              {/* 4. 画幅尺寸 + 细节补充 + 立即生成按钮 */}
              <div className="space-y-2 border-t border-border/70 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 text-xs font-extrabold tracking-tight text-foreground sm:text-sm">
                    4. 画幅与细节
                  </span>

                  {activeProvider === 'comfyui' ? (
                    <span className="rounded-lg border border-border/80 bg-[#FAF8F4] px-2.5 py-1 text-xs text-muted-foreground dark:bg-muted/35">
                      尺寸由本地工作流节点控制
                    </span>
                  ) : (
                    <div
                      role="group"
                      aria-label="选择成图画幅比例"
                      className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-[#FAF8F4] p-0.5 dark:bg-muted/35"
                    >
                      {STUDIO_ASPECT_RATIOS.map((opt) => {
                        const selected = activeRatio === opt.id
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={selected}
                            title={opt.hint}
                            onClick={() => handleSelectAspectRatio(opt.id)}
                            className={cn(
                              'rounded-lg px-2 py-1 font-mono text-xs font-semibold transition-colors',
                              selected
                                ? 'bg-foreground text-background shadow-2xs'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="relative min-w-[180px] flex-1">
                    <Input
                      id="studio-scene-note"
                      aria-label="补充画面细节"
                      value={sceneNote}
                      onChange={(e) => setSceneNote(e.target.value)}
                      placeholder="补充场景、光影或动作细节（可选，如：樱花树下逆光微笑…）"
                      className="h-8 rounded-xl bg-[#FAF8F4] pr-7 text-xs dark:bg-muted/30"
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
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={!hydrated || !!activeTask || isGenerating || uploadingSlot !== null}
                  className="ks-keycap h-10 w-full rounded-xl border-0 bg-[#D9381E] text-sm font-extrabold tracking-tight text-white hover:bg-[#C23018]"
                >
                  {isGenerating ? (
                    <>
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      <span>{activeArtist.name}正在绘制作品…</span>
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="size-4" />
                      <span>立即生成角色图</span>
                    </>
                  )}
                </Button>
              </div>
            </section>
          </motion.div>
        </ResizablePanel>

        {!isMobile && <ResizableHandle withHandle />}

        {/* 右栏：暗房取景监视器 + 成图胶片底片条 */}
        <ResizablePanel
          defaultSize={isMobile ? '100%' : '43%'}
          minSize={isMobile ? '30%' : '28%'}
          className="min-w-0 md:flex md:min-h-0 md:flex-col md:pl-2.5"
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.04 }}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
          >
            <section
              data-impeccable-ignore="nested-cards"
              className="ks-elevation flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card p-2.5"
            >
              <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-extrabold tracking-tight sm:text-sm">生成监视器</h2>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      isGenerating
                        ? 'bg-[#E5A918]/15 text-[#9A6B00] dark:text-[#E5A918]'
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
                          : previewUrl
                            ? 'bg-[#116E65] dark:bg-[#4FD1C5]'
                            : 'bg-muted-foreground/50'
                      )}
                    />
                    {isGenerating ? '绘制中' : previewUrl ? `${previewArtist.name} · 成图` : '待命'}
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

              {/* 主取景视窗：自适应剩余高度，永不撑出滚动条 */}
              <div className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-[#FAF8F4] p-3 md:min-h-0 dark:bg-[#141418]">
                {/* 取景器四角刻度 */}
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
                        <div className="w-56 max-w-full space-y-1.5 pt-1">
                          <div className="text-xs text-foreground/80">{generationProgress.message}</div>
                          {generationProgress.percent !== undefined && (
                            <div className="h-1.5 overflow-hidden rounded-full border border-border bg-card">
                              <div
                                className="h-full bg-[#D9381E] transition-all"
                                style={{ width: `${generationProgress.percent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      <p className="pt-1 text-xs text-muted-foreground">切换页面不会中断当前生成</p>
                    </div>
                  </div>
                ) : generationError ? (
                  <div className="flex max-w-md flex-col items-center gap-2 text-center">
                    <CircleAlertIcon className="size-7 text-destructive" />
                    <div className="text-sm font-bold text-destructive">生成未能完成</div>
                    <p className="whitespace-pre-wrap break-all text-left text-xs leading-relaxed text-muted-foreground">
                      {generationError}
                    </p>
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
                ) : previewUrl ? (
                  <button
                    type="button"
                    aria-label="放大生成结果"
                    onClick={() => setZoomImageUrl(previewUrl)}
                    className="group relative flex h-full w-full cursor-zoom-in items-center justify-center focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <img
                      src={previewUrl}
                      alt="生成结果"
                      className="max-h-full max-w-full rounded-lg border border-border/60 object-contain shadow-sm transition group-hover:opacity-95"
                    />
                  </button>
                ) : (
                  /* 待命舞台：卡带扇形合成预览 + 放大版画风/跟随原图相框 */
                  <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
                    <div className="flex items-center justify-center gap-3 sm:gap-4">
                      <div className="flex items-center -space-x-2.5">
                        {[
                          {
                            key: 'portrait',
                            label: '人像',
                            src: recipe.portrait ? referenceImageUrl(recipe.portrait.缩略图) : '',
                            icon: UserRoundIcon,
                            tint: 'text-[#B88300] dark:text-[#E5A918]',
                          },
                          {
                            key: 'costume',
                            label: '服装',
                            src: recipe.costume ? referenceImageUrl(recipe.costume.缩略图) : '',
                            icon: ShirtIcon,
                            tint: 'text-[#116E65] dark:text-[#4FD1C5]',
                          },
                          {
                            key: 'pose',
                            label: '姿势',
                            src: recipe.pose ? referenceImageUrl(poseThumbPath(recipe.pose)) : '',
                            icon: PersonStandingIcon,
                            tint: 'text-[#D9381E] dark:text-[#FF7A59]',
                          },
                        ].map((slot, i) => {
                          const Icon = slot.icon
                          return (
                            <div
                              key={slot.key}
                              style={{ transform: `rotate(${(i - 1) * 5}deg)` }}
                              className="flex h-24 w-18 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-sm"
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

                      {/* 目标画风预览相框 */}
                      <div className="relative flex size-28 shrink-0 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-[#D9381E]/85 bg-card shadow-md sm:size-32">
                        {styleVisual.preview ? (
                          <>
                            <img
                              src={styleVisual.preview}
                              alt={styleInfo.label}
                              className="h-full w-full object-cover object-top"
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pt-4 pb-1.5 text-center">
                              <span className="block truncate text-xs font-bold text-white">{styleVisual.shortLabel}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 border border-dashed border-border/80 bg-muted/20 p-2 text-center">
                            <WandSparklesIcon className="size-6 text-[#D9381E]" />
                            <span className="text-xs font-bold text-foreground">{styleVisual.shortLabel}</span>
                            <span className="text-xs text-muted-foreground">按原图直出</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm font-bold text-foreground">
                        {activeArtist.name} · {styleVisual.shortLabel}
                        {activeProvider !== 'comfyui' && ` · ${activeRatio}`}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {styleVisual.tagline || '支持从三大图库混搭，或拖拽 / 粘贴本地参考图'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                      {[
                        { label: '人像', ok: Boolean(recipe.portrait) },
                        { label: '服装', ok: Boolean(recipe.costume) },
                        {
                          label: recipe.pose ? `姿势(${recipe.pose.useDepth ? '深度' : '白模'})` : '姿势',
                          ok: Boolean(recipe.pose),
                        },
                      ].map((item) => (
                        <span
                          key={item.label}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium',
                            item.ok
                              ? 'border-[#116E65]/30 bg-[#116E65]/10 text-[#116E65] dark:border-[#4FD1C5]/30 dark:text-[#4FD1C5]'
                              : 'border-border bg-card text-muted-foreground'
                          )}
                        >
                          {item.ok && <CheckCircle2Icon className="size-3" />}
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 底部胶片底片条 */}
              {recentHistory.length > 0 && (
                <div className="mt-2 flex shrink-0 items-center gap-2 border-t border-border/70 pt-2">
                  <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
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

            {activeTask && (
              <section className="ks-elevation flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E5A918]/50 bg-card px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">
                  {activeTask.task
                    ? '检测到未完成的后台任务，可恢复继续等待成图'
                    : '上次提交可能已发送成功，请恢复确认或取消'}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 rounded-lg text-xs"
                    disabled={isGenerating || !activeTask.task}
                    onClick={() => void resumeGeneration()}
                  >
                    恢复等待
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 rounded-lg text-xs"
                    variant="outline"
                    onClick={() => void stopTracking()}
                  >
                    取消
                  </Button>
                </div>
              </section>
            )}
          </motion.div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* 全部作品集弹窗 */}
      <Dialog open={galleryModalOpen} onOpenChange={setGalleryModalOpen}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-4xl overflow-y-auto p-4 sm:max-w-4xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">我的作品集 ({history.length})</DialogTitle>
            {history.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 rounded-xl text-xs" onClick={clearHistory}>
                <Trash2Icon className="size-3.5" />
                清空全部
              </Button>
            )}
          </DialogHeader>

          {history.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">暂无生成作品</div>
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
                          {histArtist.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeHistoryItem(h.id)
                        }}
                        title="删除此作品"
                        className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white opacity-85 transition hover:bg-destructive hover:opacity-100"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>

                    <div className="mt-2 space-y-1.5 px-0.5">
                      <div className="truncate text-xs font-bold">{h.recipeSummary}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full rounded-xl bg-card text-xs"
                        onClick={() => setComparisonResult(h)}
                      >
                        对比参考
                      </Button>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyHistoryRecipe(h)}
                          className="flex h-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground transition hover:bg-muted/70"
                        >
                          套用配方
                        </button>
                        <a
                          href={h.imageUrl}
                          download={`character-${h.id}.png`}
                          className="flex h-7 items-center justify-center rounded-lg bg-[#D9381E] text-xs font-bold text-white transition hover:bg-[#C23018]"
                        >
                          下载
                        </a>
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
    </div>
  )
}
