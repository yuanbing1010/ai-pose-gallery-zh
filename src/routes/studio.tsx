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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  CopyIcon,
  DicesIcon,
  DownloadIcon,
  EyeIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  LayoutGridIcon,
  LinkIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  RotateCcwIcon,
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
import { Section } from '@/components/common/FormSection'
import { PageHeader } from '@/components/common/PageHeader'
import { StylePresetSelector } from '@/components/studio/StylePresetSelector'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/hooks/use-mobile'
import { validateReferenceCombinations, workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { selectCostumeView } from '@/lib/costumeSources'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import { poseImagePath, poseThumbPath, referenceImageUrl, uploadedReferences } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import {
  buildRecipePrompt,
  fileToDataUrl,
  parseComfyWorkflowNodes,
  PROVIDER_META,
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

function SortableExtraImageItem({
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
        'flex items-center gap-2 rounded-2xl border bg-[#FAF8F4] p-2 transition-all dark:bg-muted/35',
        isDragging ? 'border-[#E5A918] opacity-95 shadow-lg' : 'border-border/80'
      )}
    >
      <button
        type="button"
        aria-label={`拖拽排序附图 ${idx + 1}`}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <img
        src={img.url}
        alt={img.name}
        className="h-11 w-9 shrink-0 rounded-xl border border-border object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs font-bold text-[#B88300] dark:text-[#E5A918]">附图 #{idx + 1}</div>
        <input
          type="text"
          value={img.name}
          onChange={(e) => onUpdateName(img.id, e.target.value)}
          placeholder="备注(如:配饰/背景)"
          className="w-full truncate bg-transparent text-xs font-medium outline-none focus:underline"
        />
      </div>
      <button
        type="button"
        aria-label={`删除附图 ${idx + 1}`}
        onClick={() => onRemove(img.id)}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3.5" />
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
    customPrompt,
    setCustomPrompt,
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
  const [promptExpanded, setPromptExpanded] = useState(false)

  const activeProvider = apiConfig.activeProvider
  const activeWorkflowImages =
    activeProvider === 'comfyui' &&
    recipe.workflowImagesIdentity === workflowIdentity(apiConfig.comfyuiParams.workflowJson)
      ? Object.values(recipe.workflowImages || {})
      : []

  const extraImages = recipe.extraImages || []
  const hasStitchRefs = Boolean(recipe.portrait || recipe.costume || recipe.pose || extraImages.length > 0)
  const hasAnyRef = hasStitchRefs || activeWorkflowImages.length > 0
  const coreCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  const defaultPrompt = buildRecipePrompt(recipe, apiConfig.stylePreset, activeWorkflowImages, {
    prefix: apiConfig.defaultPromptPrefix,
    suffix: apiConfig.defaultPromptSuffix,
  })
  const syncedPrompt = hasAnyRef ? mergeSceneNote(defaultPrompt, sceneNote) : defaultPrompt
  const prompt = customPrompt ?? syncedPrompt

  const [extraUrlInput, setExtraUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [stitchModalUrl, setStitchModalUrl] = useState<string | null>(null)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const parsedComfyNodes = useMemo(
    () => parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson),
    [apiConfig.comfyuiParams.workflowJson]
  )

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

  const randomControls = (slot: ReferenceSlot, label: string) => (
    <div className="mt-2 flex items-center gap-1.5 border-t border-border/70 pt-2">
      <Select
        value={randomScopes[slot]}
        onValueChange={(value) => setRandomScopes((current) => ({ ...current, [slot]: value as RandomScope }))}
      >
        <SelectTrigger aria-label={`${label}换样范围`} className="h-9 w-[4.5rem] shrink-0 rounded-xl bg-card text-xs sm:h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="similar">同类</SelectItem>
          <SelectItem value="all">全部</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        className="h-9 min-w-0 flex-1 rounded-xl bg-card px-2.5 text-xs sm:h-8"
        disabled={uploadingSlot !== null || randomizingSlot !== null}
        onClick={() => void handleRandomSlot(slot)}
        aria-label={`${label}换一个`}
      >
        {randomizingSlot === slot ? (
          <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
        ) : (
          <DicesIcon className="size-3.5" />
        )}
        换一个
      </Button>
    </div>
  )

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
    setShowUrlInput(false)
  }

  const handleOpenStitchModal = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setStitchModalUrl(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
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
    void startGeneration(prompt)
  }

  const activeStyleKey = apiConfig.stylePreset in STYLE_PRESETS ? apiConfig.stylePreset : 'realistic'
  const styleInfo = STYLE_PRESETS[activeStyleKey]
  const styleVisual = getStyleVisualMeta(activeStyleKey)
  const recentHistory = history.slice(0, 8)
  const promptModified = customPrompt !== null || sceneNote.trim().length > 0

  return (
    <>
      <PageHeader
        title="AI 角色合成工作台"
        description="自由组合人像、服装与动作姿势卡牌，挑选直观画风与细节描述，一键生成角色立绘"
        actions={
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-2xs transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <SlidersHorizontalIcon className="size-3.5 text-[#116E65] dark:text-[#4FD1C5]" />
            <span>引擎：{PROVIDER_META[activeProvider].shortName}</span>
            <span className="text-border">|</span>
            <span className="font-mono font-semibold text-foreground">{coreCount}/3 参考</span>
          </Link>
        }
      />

      <ResizablePanelGroup orientation={isMobile ? 'vertical' : 'horizontal'} className="min-h-0 w-full gap-4 lg:gap-0">
        {/* 左栏：角色配方卡槽 + 可视化画风与描述 */}
        <ResizablePanel
          defaultSize={isMobile ? '100%' : '56%'}
          minSize={isMobile ? '30%' : '36%'}
          className="min-w-0 lg:pr-3"
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex min-w-0 flex-col gap-4"
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDropFiles}
          >
            {/* 1. 角色配方卡槽 */}
            <Section
              title="1. 角色配方卡槽"
              className="@lg/section:grid-cols-1"
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleUploadFiles}
                  />
                  <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={handleRandom}>
                    <DicesIcon className="size-3.5 text-[#E5A918]" />
                    随机配装
                  </Button>
                  {hasAnyRef && hasStitchRefs && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={handleOpenStitchModal}
                    >
                      <LayoutGridIcon className="size-3.5" />
                      参考拼图
                    </Button>
                  )}
                </div>
              }
            >
              <input ref={slotInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlotUpload} />
              {showReferenceErrors && missingReferences.length > 0 && (
                <div
                  id="reference-errors"
                  ref={referenceErrorsRef}
                  role="alert"
                  tabIndex={-1}
                  className="rounded-xl border border-destructive bg-destructive/10 p-3 text-xs text-destructive focus-visible:outline-2"
                >
                  请先选择或上传：{missingReferences.join('、')}。
                </div>
              )}

              <div
                data-impeccable-ignore="nested-cards"
                className="grid min-w-0 grid-cols-1 gap-3 @min-[40rem]/section:grid-cols-3"
              >
                {/* 01 人像槽 */}
                <div
                  className={cn(
                    'flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border bg-[#FAF8F4] p-2.5 dark:bg-muted/30',
                    showReferenceErrors && missingReferences.includes('人像')
                      ? 'border-destructive ring-1 ring-destructive'
                      : 'border-border/80'
                  )}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[#B88300] dark:text-[#E5A918]">
                        01 人像
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={recipe.portrait ? '上传替换人像参考图' : '上传人像参考图'}
                          aria-busy={uploadingSlot === 'portrait'}
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onClick={() => {
                            uploadSlotRef.current = 'portrait'
                            slotInputRef.current?.click()
                          }}
                          className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          {uploadingSlot === 'portrait' ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                          <span>{recipe.portrait ? '换图' : '上传'}</span>
                        </button>
                        {recipe.portrait && (
                          <button
                            type="button"
                            aria-label="清除人像参考图"
                            onClick={() => setPortrait(null)}
                            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {recipe.portrait ? (
                      <button
                        type="button"
                        aria-label="放大人像参考图"
                        onClick={() => {
                          const item = recipe.portrait
                          if (item) setZoomImageUrl(referenceImageUrl(item.原图 || item.缩略图))
                        }}
                        className="group relative block h-24 w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-card focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <img
                          src={referenceImageUrl(recipe.portrait.缩略图)}
                          alt={recipe.portrait.标题}
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <ZoomInIcon className="size-3.5" />
                        </span>
                      </button>
                    ) : (
                      <Link
                        to="/portraits"
                        className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/65 p-2 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-card hover:text-foreground"
                      >
                        <div className="flex size-8 items-center justify-center rounded-xl bg-muted text-[#B88300] dark:text-[#E5A918]">
                          <UserRoundIcon className="size-4" />
                        </div>
                        <span className="text-xs font-semibold">+ 从人像库挑选</span>
                      </Link>
                    )}

                    <div className="mt-2 min-h-[1.25rem]">
                      <div
                        className={cn(
                          'truncate text-xs leading-snug',
                          recipe.portrait ? 'font-bold text-foreground' : 'text-muted-foreground'
                        )}
                        title={recipe.portrait?.发型名称}
                      >
                        {recipe.portrait ? recipe.portrait.发型名称 : '未指定人像（可留空生成）'}
                      </div>
                    </div>
                  </div>

                  {randomControls('portrait', '人像')}
                </div>

                {/* 02 服装槽 */}
                <div
                  className={cn(
                    'flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border bg-[#FAF8F4] p-2.5 dark:bg-muted/30',
                    showReferenceErrors && missingReferences.includes('服装')
                      ? 'border-destructive ring-1 ring-destructive'
                      : 'border-border/80'
                  )}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[#116E65] dark:text-[#4FD1C5]">
                        02 服装
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={recipe.costume ? '上传替换服装参考图' : '上传服装参考图'}
                          aria-busy={uploadingSlot === 'costume'}
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onClick={() => {
                            uploadSlotRef.current = 'costume'
                            slotInputRef.current?.click()
                          }}
                          className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          {uploadingSlot === 'costume' ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                          <span>{recipe.costume ? '换图' : '上传'}</span>
                        </button>
                        {recipe.costume && (
                          <button
                            type="button"
                            aria-label="清除服装参考图"
                            onClick={() => setCostume(null)}
                            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {recipe.costume ? (
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="放大服装参考图"
                          onClick={() => {
                            const item = recipe.costume
                            if (item) setZoomImageUrl(referenceImageUrl(item.预览图 || item.原图 || item.缩略图))
                          }}
                          className="group relative block h-24 w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-white focus-visible:outline-2 focus-visible:outline-ring dark:bg-zinc-900"
                        >
                          <img
                            src={referenceImageUrl(recipe.costume.缩略图)}
                            alt={recipe.costume.服装名称}
                            className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                          />
                          <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <ZoomInIcon className="size-3.5" />
                          </span>
                        </button>
                      </div>
                    ) : (
                      <Link
                        to="/costumes"
                        className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/65 p-2 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-card hover:text-foreground"
                      >
                        <div className="flex size-8 items-center justify-center rounded-xl bg-muted text-[#116E65] dark:text-[#4FD1C5]">
                          <ShirtIcon className="size-4" />
                        </div>
                        <span className="text-xs font-semibold">+ 从服装库挑选</span>
                      </Link>
                    )}

                    <div className="mt-2 min-h-[1.25rem] space-y-1.5">
                      <div
                        className={cn(
                          'truncate text-xs leading-snug',
                          recipe.costume ? 'font-bold text-foreground' : 'text-muted-foreground'
                        )}
                        title={recipe.costume?.服装名称}
                      >
                        {recipe.costume ? recipe.costume.服装名称 : '未指定服装穿搭'}
                      </div>
                      {recipe.costume && costumeViews.length > 0 && (
                        <Select
                          value={
                            costumeViews.find((view) => view.id === recipe.costume?.selectedView)?.id ||
                            costumeViews.find((view) => view.id === 'front')?.id ||
                            costumeViews[0].id
                          }
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onValueChange={(value) => {
                            if (recipe.costume && uploadingSlot === null && randomizingSlot === null)
                              setCostume(selectCostumeView(recipe.costume, value))
                          }}
                        >
                          <SelectTrigger aria-label="已选服装视角" className="h-7 w-full rounded-lg bg-card text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {costumeViews.map((view) => (
                              <SelectItem key={view.id} value={view.id}>
                                {view.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  {randomControls('costume', '服装')}
                </div>

                {/* 03 姿势槽 */}
                <div
                  className={cn(
                    'flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border bg-[#FAF8F4] p-2.5 dark:bg-muted/30',
                    showReferenceErrors && missingReferences.includes('姿势')
                      ? 'border-destructive ring-1 ring-destructive'
                      : 'border-border/80'
                  )}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-[#D9381E] dark:text-[#FF7A59]">
                        03 姿势
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={recipe.pose ? '上传替换姿势参考图' : '上传姿势参考图'}
                          aria-busy={uploadingSlot === 'pose'}
                          disabled={uploadingSlot !== null || randomizingSlot !== null}
                          onClick={() => {
                            uploadSlotRef.current = 'pose'
                            slotInputRef.current?.click()
                          }}
                          className="inline-flex h-6 items-center gap-1 rounded-full border border-border/80 bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          {uploadingSlot === 'pose' ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <UploadIcon className="size-3" />
                          )}
                          <span>{recipe.pose ? '换图' : '上传'}</span>
                        </button>
                        {recipe.pose && (
                          <button
                            type="button"
                            aria-label="清除姿势参考图"
                            onClick={() => setPose(null)}
                            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {recipe.pose ? (
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="放大姿势参考图"
                          onClick={() => {
                            const item = recipe.pose
                            if (item) setZoomImageUrl(referenceImageUrl(poseImagePath(item)))
                          }}
                          className="group relative block h-24 w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-white focus-visible:outline-2 focus-visible:outline-ring dark:bg-zinc-900"
                        >
                          <img
                            src={referenceImageUrl(poseThumbPath(recipe.pose))}
                            alt={recipe.pose.姿势名称}
                            className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                          />
                          <span className="pointer-events-none absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <ZoomInIcon className="size-3.5" />
                          </span>
                        </button>
                        {recipe.pose.source !== 'upload' && (
                          <div
                            role="group"
                            aria-label="切换素体白模或深度图"
                            className="md-pill absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full p-0.5 text-xs leading-none"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (recipe.pose?.useDepth) toggleRecipePoseDepth()
                              }}
                              className={cn(
                                'rounded-full px-2 py-0.5 font-semibold transition',
                                !recipe.pose.useDepth
                                  ? 'bg-[#116E65] text-white'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              白模
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!recipe.pose?.useDepth) toggleRecipePoseDepth()
                              }}
                              className={cn(
                                'rounded-full px-2 py-0.5 font-semibold transition',
                                recipe.pose.useDepth
                                  ? 'bg-[#116E65] text-white'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              深度
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Link
                        to="/poses"
                        className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/65 p-2 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-card hover:text-foreground"
                      >
                        <div className="flex size-8 items-center justify-center rounded-xl bg-muted text-[#D9381E] dark:text-[#FF7A59]">
                          <PersonStandingIcon className="size-4" />
                        </div>
                        <span className="text-xs font-semibold">+ 从姿势库挑选</span>
                      </Link>
                    )}

                    <div className="mt-2 min-h-[1.25rem]">
                      <div
                        className={cn(
                          'truncate text-xs leading-snug',
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
                        {recipe.pose
                          ? recipe.pose.角度
                            ? `${recipe.pose.姿势名称} · ${recipe.pose.角度}`
                            : recipe.pose.姿势名称
                          : '未指定动作姿势'}
                      </div>
                    </div>
                  </div>

                  {randomControls('pose', '姿势')}
                </div>
              </div>

              {/* 附加参考图列表（支持 dnd-kit 拖拽排序） */}
              <div className="space-y-2 pt-1">
                {extraImages.length > 0 && (
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleExtraDragEnd}>
                    <SortableContext items={extraImages.map((x) => x.id)} strategy={rectSortingStrategy}>
                      <div className="grid min-w-0 grid-cols-1 gap-2 @min-[42rem]/section:grid-cols-3">
                        {extraImages.map((img, idx) => (
                          <SortableExtraImageItem
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
                )}

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-3 py-2.5 text-center transition sm:flex-row sm:justify-between',
                    isDragging
                      ? 'border-[#E5A918] bg-muted text-foreground'
                      : 'border-border bg-[#FAF8F4]/70 text-muted-foreground hover:border-foreground/50 hover:bg-[#FAF8F4] hover:text-foreground dark:bg-muted/20 dark:hover:bg-muted/35'
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <ImagePlusIcon className="size-4 shrink-0" />
                    <span>
                      {isDragging
                        ? '松开鼠标添加附加参考图'
                        : '添加附加参考图：点击上传、拖拽图片至此，或按 Ctrl+V / ⌘V 粘贴'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowUrlInput((s) => !s)
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <LinkIcon className="size-3" />
                    输入图片 URL
                  </button>
                </div>

                {showUrlInput && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={extraUrlInput}
                      onChange={(e) => setExtraUrlInput(e.target.value)}
                      placeholder="粘贴 https://... 图片地址"
                      className="rounded-xl bg-[#FAF8F4] font-mono text-xs dark:bg-muted/30"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                    />
                    <Button size="sm" className="rounded-xl text-xs" onClick={handleAddUrl}>
                      添加
                    </Button>
                  </div>
                )}
              </div>
            </Section>

            {/* 2. 画风、画面描述与一键生成 */}
            <Section
              title="2. 画风与画面描述"
              className="@lg/section:grid-cols-1"
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                      customPrompt !== null
                        ? 'bg-[#E5A918]/15 text-[#9A6B00] dark:text-[#E5A918]'
                        : 'bg-[#116E65]/12 text-[#116E65] dark:text-[#4FD1C5]'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        customPrompt !== null ? 'bg-[#E5A918]' : 'bg-[#116E65] dark:bg-[#4FD1C5]'
                      )}
                    />
                    {customPrompt !== null ? '已手动锁定' : '随配方自动同步'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!promptModified}
                    className="h-7 rounded-xl text-xs"
                    onClick={() => {
                      setCustomPrompt(null)
                      setSceneNote('')
                      toast.success('已恢复自动同步描述')
                    }}
                  >
                    <RotateCcwIcon className="size-3.5" />
                    恢复默认
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-xl text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(prompt)
                      toast.success('已复制画面描述')
                    }}
                  >
                    <CopyIcon className="size-3.5" />
                    复制
                  </Button>
                </div>
              }
            >
              <StylePresetSelector
                value={apiConfig.stylePreset}
                onChange={(v) => updateApiConfig({ stylePreset: v })}
              />

              {/* 分层提示词区：快速细节补充 + 可展开完整生成指令 */}
              <div className="min-w-0 space-y-2.5 border-t border-border/70 pt-3">
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="studio-scene-note" className="block text-sm font-semibold select-none">
                    补充画面细节（场景 / 光影 / 情绪，可选）
                  </label>
                  <Input
                    id="studio-scene-note"
                    value={sceneNote}
                    disabled={customPrompt !== null}
                    onChange={(e) => setSceneNote(e.target.value)}
                    placeholder={
                      customPrompt !== null
                        ? '当前为手动完整编辑模式，请点击「恢复默认」以启用自动拼入'
                        : '例如：午后逆光、微风吹起发丝、简约街拍背景、镜头微笑…'
                    }
                    className="h-10 rounded-xl bg-[#FAF8F4] text-xs dark:bg-muted/30"
                  />
                </div>

                <div className="min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-[#FAF8F4] dark:bg-muted/25">
                  <button
                    type="button"
                    aria-expanded={promptExpanded}
                    onClick={() => setPromptExpanded((v) => !v)}
                    className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                      <span className="shrink-0 font-semibold text-foreground">完整生成指令</span>
                      {!promptExpanded && (
                        <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
                          {prompt.replace(/\s+/g, ' ').slice(0, 72)}…
                        </span>
                      )}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                      <span>{promptExpanded ? '收起' : '展开微调'}</span>
                      <ChevronDownIcon
                        className={cn('size-3.5 transition-transform duration-200', promptExpanded && 'rotate-180')}
                      />
                    </span>
                  </button>

                  {promptExpanded && (
                    <div className="border-t border-border/70 p-2.5">
                      <Textarea
                        aria-label="完整生成指令"
                        value={prompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        rows={6}
                        className="rounded-xl bg-card text-xs leading-relaxed"
                      />
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!hydrated || !!activeTask || isGenerating || uploadingSlot !== null}
                className="ks-keycap h-11 w-full rounded-2xl border-0 bg-[#D9381E] text-sm font-extrabold tracking-tight text-white hover:bg-[#C23018]"
              >
                {isGenerating ? (
                  <>
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    正在生成角色图…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-4" />
                    立即生成角色图
                  </>
                )}
              </Button>
            </Section>
          </motion.div>
        </ResizablePanel>

        {!isMobile && <ResizableHandle withHandle />}

        {/* 右栏：全高对齐取景画布 + 待命配方预览 + 最近胶片条 */}
        <ResizablePanel
          defaultSize={isMobile ? '100%' : '44%'}
          minSize={isMobile ? '30%' : '28%'}
          className="min-w-0 lg:pl-3"
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.04 }}
            className="flex h-full min-w-0 flex-col gap-4"
          >
            <Section
              title="生成作品"
              outerClassName="flex flex-1 flex-col"
              className="flex-1 grid-rows-[1fr_auto] @lg/section:grid-cols-1"
              actions={
                previewUrl && !isGenerating ? (
                  <div className="flex items-center gap-1.5">
                    {previewResult && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-xl text-xs"
                        onClick={() => setComparisonResult(previewResult)}
                      >
                        对比参考
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-7 rounded-xl text-xs" asChild>
                      <a href={previewUrl} download="character.png">
                        <DownloadIcon className="size-3.5" />
                        下载图片
                      </a>
                    </Button>
                  </div>
                ) : null
              }
            >
              <div className="relative flex min-h-[380px] h-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#FAF8F4] p-4 sm:min-h-[460px] dark:bg-muted/25">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-[#E5A918] shadow-xs">
                      <LoaderCircleIcon className="size-6 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold">正在绘制角色作品…</div>
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
                  <div className="flex w-full flex-col items-center gap-3">
                    <button
                      type="button"
                      aria-label="放大生成结果"
                      onClick={() => setZoomImageUrl(previewUrl)}
                      className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-border bg-card shadow-xs focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <img
                        src={previewUrl}
                        alt="生成结果"
                        className="max-h-[440px] w-auto object-contain transition group-hover:opacity-95"
                      />
                      <span className="pointer-events-none absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <ZoomInIcon className="size-3.5" />
                        放大查看
                      </span>
                    </button>

                    <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-3 py-2 text-xs">
                      <div className="min-w-0 truncate text-muted-foreground">
                        {previewResult ? (
                          <span>
                            <strong className="font-semibold text-foreground">{previewResult.model}</strong>
                            {' · '}
                            {new Date(previewResult.createdAt).toLocaleTimeString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          <span>当前生成预览</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {previewResult && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg px-2.5 text-xs"
                            onClick={() => setComparisonResult(previewResult)}
                          >
                            <EyeIcon className="size-3.5" />
                            对比参考
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-lg px-2.5 text-xs"
                          onClick={() => setZoomImageUrl(previewUrl)}
                        >
                          <ZoomInIcon className="size-3.5" />
                          大图
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 待命取景板：实时展示当前配方卡片组合 + 选中画风 */
                  <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      {/* 3 张待合成分轨微缩卡 */}
                      <div className="flex items-center -space-x-2">
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
                              style={{ transform: `rotate(${(i - 1) * 4}deg)` }}
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

                      {/* 目标画风预览卡 */}
                      <div className="relative flex h-24 w-18 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-[#D9381E]/75 bg-card shadow-sm">
                        {styleVisual.preview ? (
                          <>
                            <img
                              src={styleVisual.preview}
                              alt={styleInfo.label}
                              className="h-full w-full object-cover object-top"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-xs font-semibold text-white">
                              {styleVisual.shortLabel}
                            </span>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 p-1.5 text-muted-foreground">
                            <WandSparklesIcon className="size-4 text-[#D9381E]" />
                            <span className="text-xs font-semibold text-foreground">{styleVisual.shortLabel}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-sm font-bold text-foreground">
                        {hasAnyRef ? '合成取景器已就绪' : '请先挑选参考图或随机配装'}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {hasAnyRef
                          ? `目标画风：${styleInfo.label}${styleVisual.tagline ? `（${styleVisual.tagline}）` : ''}`
                          : '支持从人像、服装、姿势库混搭，或拖拽 / 粘贴本地参考图'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                      {[
                        { label: '人像', ok: Boolean(recipe.portrait) },
                        { label: '服装', ok: Boolean(recipe.costume) },
                        {
                          label: recipe.pose
                            ? `姿势(${recipe.pose.useDepth ? '深度' : '白模'})`
                            : '姿势',
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

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {hasStitchRefs ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full bg-card px-3 text-xs"
                          onClick={handleOpenStitchModal}
                        >
                          <LayoutGridIcon className="size-3.5" />
                          预览三合一拼图
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full bg-card px-3 text-xs"
                          onClick={handleRandom}
                        >
                          <DicesIcon className="size-3.5 text-[#E5A918]" />
                          随机配装试试
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 最近成图胶片切换条 */}
              {recentHistory.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">最近成图 ({history.length})</span>
                    <span>点击切换主预览</span>
                  </div>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                    {recentHistory.map((h) => {
                      const active = h.imageUrl === previewUrl
                      return (
                        <button
                          key={h.id}
                          type="button"
                          aria-label={`切换到成图：${h.recipeSummary}`}
                          onClick={() => setPreviewUrl(h.imageUrl)}
                          className={cn(
                            'relative aspect-[3/4] w-13 shrink-0 overflow-hidden rounded-xl border transition-all',
                            active
                              ? 'border-[#D9381E] ring-2 ring-[#D9381E]/80'
                              : 'border-border/80 opacity-80 hover:opacity-100'
                          )}
                        >
                          <img src={h.imageUrl} alt={h.recipeSummary} className="h-full w-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </Section>

            {activeTask && (
              <Section title="进行中的任务" className="@lg/section:grid-cols-1">
                <p className="break-all text-xs text-muted-foreground">
                  {activeTask.task
                    ? '检测到未完成的生成任务，点击恢复即可继续等待成图。'
                    : '上次提交可能已发送成功，请恢复确认或手动取消。'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="rounded-xl text-xs"
                    disabled={isGenerating || !activeTask.task}
                    onClick={() => void resumeGeneration()}
                  >
                    恢复等待
                  </Button>
                  <Button className="rounded-xl text-xs" variant="outline" onClick={() => void stopTracking()}>
                    取消等待
                  </Button>
                </div>
              </Section>
            )}
          </motion.div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* 生成历史作品集 */}
      {history.length > 0 && (
        <Section
          title={`我的作品集 (${history.length})`}
          className="grid-cols-2 @lg/section:grid-cols-3 @3xl/section:grid-cols-4"
          actions={
            <Button variant="outline" size="sm" className="h-7 rounded-xl text-xs" onClick={clearHistory}>
              <Trash2Icon className="size-3.5" />
              清空
            </Button>
          }
        >
          {history.map((h) => (
            <div
              key={h.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-[#FAF8F4] p-2 shadow-2xs dark:bg-muted/30"
            >
              <div className="relative aspect-3/4 overflow-hidden rounded-xl bg-muted/20">
                <button
                  type="button"
                  aria-label={`查看生成记录：${h.recipeSummary}`}
                  onClick={() => setZoomImageUrl(h.imageUrl)}
                  className="block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <img
                    src={h.imageUrl}
                    alt={h.recipeSummary}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-black/75 px-2 py-0.5 font-mono text-xs text-white">
                    {new Date(h.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
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

              <div className="mt-2 space-y-1.5 px-1">
                <div className="truncate text-xs font-bold">{h.recipeSummary}</div>
                <Button
                  variant="outline"
                  className="min-h-10 w-full rounded-xl bg-card text-xs"
                  onClick={() => setComparisonResult(h)}
                >
                  对比参考
                </Button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPrompt(h.prompt)
                      setPromptExpanded(true)
                      toast.success('已恢复该图描述词')
                    }}
                    className="flex h-8 items-center justify-center rounded-xl bg-muted text-xs font-semibold whitespace-nowrap text-foreground transition hover:bg-muted/70"
                  >
                    复用描述
                  </button>
                  <a
                    href={h.imageUrl}
                    download={`character-${h.id}.png`}
                    className="flex h-8 items-center justify-center rounded-xl bg-[#D9381E] text-xs font-bold whitespace-nowrap text-white transition hover:bg-[#C23018]"
                  >
                    下载
                  </a>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

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
    </>
  )
}
