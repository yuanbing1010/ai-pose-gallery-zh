import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { DragEndEvent } from '@dnd-kit/core'
import { DownloadIcon, LayersIcon } from 'lucide-react'
import {
  Suspense,
  lazy,
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from '@/lib/notifications'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import {
  type HomeworkThrowTask,
  type SpriteTravelTask,
  SpriteTravelPortal,
} from '@/components/studio/SpriteTravelPortal'
import { ClassicStudioLayout } from '@/components/studio/layouts/ClassicStudioLayout'

const ReferenceComparisonDialog = lazy(() =>
  import('@/components/common/ReferenceComparisonDialog').then((m) => ({
    default: m.ReferenceComparisonDialog,
  }))
)
const ImageViewer = lazy(() =>
  import('@/components/common/ImageViewer').then((m) => ({ default: m.ImageViewer }))
)
const CloudWorksDialog = lazy(() =>
  import('@/components/studio/CloudWorksDialog').then((m) => ({ default: m.CloudWorksDialog }))
)
const LocalImageToolsDialog = lazy(() =>
  import('@/components/studio/LocalImageToolsDialog').then((m) => ({
    default: m.LocalImageToolsDialog,
  }))
)
const StyleBrowserPanel = lazy(() =>
  import('@/components/studio/StyleBrowserPanel').then((m) => ({ default: m.StyleBrowserPanel }))
)
const PublishToGalleryDialog = lazy(() =>
  import('@/components/gallery/PublishToGalleryDialog').then((m) => ({
    default: m.PublishToGalleryDialog,
  }))
)
const WorkDetailDialog = lazy(() =>
  import('@/components/studio/WorkDetailDialog').then((m) => ({ default: m.WorkDetailDialog }))
)
import type { StudioLayoutProps } from '@/components/studio/layouts/types'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { uploadReferenceFileApi } from '@/lib/apiClient'
import {
  getEstimatedOutputDimensions,
  getStudioArtist,
  STUDIO_ASPECT_RATIOS,
  type StudioAspectRatio,
} from '@/lib/artists'
import { getBrushPalette } from '@/lib/brushPalettes'
import { isContainCostumeSource } from '@/lib/costumeSources'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import { poseThumbPath, referenceImageUrl, uploadedReferences } from '@/lib/recipeImages'
import {
  getStudioMuted,
  playHomeworkThrow,
  playMonitorReveal,
  playSpriteSelect,
  playSpriteTravel,
  setStudioMuted,
  unlockStudioAudio,
} from '@/lib/studioAudio'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import {
  dataUrlToBlob,
  fileToDataUrl,
  stitchRecipeCanvas,
} from '@/services/aiGenerator'
import {
  NONE_STYLE_PRESET,
  getEffectiveProfileCreditCost,
  getEffectiveStyleCatalog,
  mergeGenerationQueueConfig,
  type GenerationLiveStage,
  type ImageProviderId,
} from '../../shared/studio'
import {
  resolveActiveProfileResolution,
  resolveActiveProviderProfile,
  useStudio,
} from '@/store/studioStore'
import type { GenerationHistoryItem } from '@/types/gallery'

export const Route = createFileRoute('/studio')({
  staticData: { title: 'AI 视觉创作台' },
  validateSearch: (search: Record<string, unknown>): { mode?: 'prompt' | 'recipe' } => ({
    mode:
      search.mode === 'prompt' || search.mode === 'recipe'
        ? search.mode
        : undefined,
  }),
  component: StudioPage,
})

function StudioPage() {
  const {
    user,
    bootstrapLoaded,
    providersLoaded,
    platform,
    providers,
    hydrated,
    recipe,
    selectedProvider,
    setSelectedProvider,
    selectedProfileByProvider,
    setSelectedProfileForProvider,
    selectedResolutionByProfile,
    setSelectedResolutionForProfile,
    stylePreset,
    setStylePreset,
    promptStyleEnabled,
    setPromptStyleEnabled,
    promptStylePreset,
    setPromptStylePreset,
    allowFaceStyleShift,
    setAllowFaceStyleShift,
    allowPoseStyleShift,
    setAllowPoseStyleShift,
    aspectRatio,
    setAspectRatio,
    promptAspectRatioEnabled,
    setPromptAspectRatioEnabled,
    promptAspectRatio,
    setPromptAspectRatio,
    history,
    previewUrl,
    setPreviewUrl,
    isSubmitting,
    submittingProvider,
    submittingProfileId,
    submittingProgress,
    foregroundJobId,
    cancellingJobIds,
    sendForegroundToBackground,
    focusJobInMonitor,
    cancelQueuedJob,
    generationError,
    setGenerationError,
    failedGenerationMeta,
    textToImageMode,
    setTextToImageMode,
    studioMode,
    setStudioMode,
    userPrompt,
    setUserPrompt,
    remixGallerySource,
    setRemixGallerySource,
    refreshBootstrap,
    refreshHistory,
    startGeneration,
    cancelGeneration,
    openAuthModal,
    openAccountModal,
    setPortrait,
    setCostume,
    setPose,
    applyRecipe,
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
    removeHistoryItems,
  } = useStudio()

  const { mode: routeMode } = Route.useSearch()
  const isMobile = useIsMobile()
  const [shutterTick, setShutterTick] = useState(0)

  useEffect(() => {
    if (routeMode === 'prompt' || routeMode === 'recipe') {
      setStudioMode(routeMode)
    }
  }, [routeMode, setStudioMode])
  const handleExtraDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderExtraImages(String(active.id), String(over.id))
    }
  }

  const [comparisonResult, setComparisonResult] = useState<GenerationHistoryItem | null>(null)
  const [detailWorkItem, setDetailWorkItem] = useState<GenerationHistoryItem | null>(null)
  const [shareGalleryJob, setShareGalleryJob] = useState<GenerationHistoryItem | null>(null)
  const [pendingDeleteHistoryItem, setPendingDeleteHistoryItem] = useState<GenerationHistoryItem | null>(null)
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null)
  const [promptChipsOpen, setPromptChipsOpen] = useState(false)
  const [localToolsOpen, setLocalToolsOpen] = useState(false)
  const previewResult = history.find((item) => item.imageUrl === previewUrl)
  const qc = useQueryClient()
  const { data: posesData } = useQuery({
    ...posesQuery,
    enabled: Boolean(recipe.pose && recipe.pose.source !== 'upload'),
  })
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
  const [randomizingAll, setRandomizingAll] = useState(false)
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
  const [studioMuted, setStudioMutedState] = useState(() => getStudioMuted())
  const [artistReturnTick, setArtistReturnTick] = useState(0)
  const [stageResumeTick, setStageResumeTick] = useState(0)
  const [entranceDone, setEntranceDone] = useState(false)
  const [spriteTravelTasks, setSpriteTravelTasks] = useState<SpriteTravelTask[]>([])
  const [homeworkThrowTask, setHomeworkThrowTask] = useState<HomeworkThrowTask | null>(null)
  const [deliveryState, setDeliveryState] = useState<{
    phase: 'cheering' | 'throwing'
    imageUrl: string
    providerId: ImageProviderId
    brushHex: string
    brushGlow: string
  } | null>(null)
  const [resultImgLoadedUrl, setResultImgLoadedUrl] = useState<string | null>(null)
  const [skipResultIntro, setSkipResultIntro] = useState(false)
  const travelSeqRef = useRef(0)
  const entranceStartedRef = useRef(false)
  const runningJobSnapshotRef = useRef<{
    providerId: ImageProviderId
    brushHex: string
    brushGlow: string
  } | null>(null)

  const toggleStudioMute = () => {
    const next = !studioMuted
    setStudioMuted(next)
    setStudioMutedState(next)
    if (!next) {
      unlockStudioAudio()
    }
  }

  const activeProviderInfo =
    providers.find((p) => p.providerId === selectedProvider) ?? {
      providerId: selectedProvider,
      enabled: true,
      configured: false,
      creditCost: 0,
      sortOrder: 0,
      artist: getStudioArtist(selectedProvider),
      models: [],
    }
  const activeArtist = activeProviderInfo.artist
  const visibleModels = activeProviderInfo.models.filter((m) => m.enabled)
  const activeProfile = resolveActiveProviderProfile(
    activeProviderInfo,
    selectedProfileByProvider[selectedProvider]
  )
  const activeProfileResolutions = activeProfile?.resolutions || []
  const activeResolution = resolveActiveProfileResolution(
    activeProfile,
    activeProfile ? selectedResolutionByProfile[activeProfile.profileId] : undefined
  )
  const activeProviderReady =
    activeProviderInfo.enabled &&
    activeProviderInfo.configured &&
    (activeProviderInfo.models.length === 0 ||
      Boolean(activeProfile && activeProfile.enabled && activeProfile.configured))
  const activeCost = activeProfile
    ? getEffectiveProfileCreditCost(activeProfile, activeResolution)
    : activeProviderInfo.creditCost
  const activeBrushIndex = activeProfile
    ? Math.max(
        0,
        visibleModels.findIndex((m) => m.profileId === activeProfile.profileId)
      )
    : 0
  const activeBrushPalette = activeProfile ? getBrushPalette(activeBrushIndex) : null
  const textFallbackFeatureEnabled = platform.textFallbackEnabled !== false
  const activeProfileSupportsTextFallback =
    activeProviderInfo.models.length === 0
      ? activeProviderInfo.configured
      : Boolean(activeProfile?.supportsTextFallback)
  const effectiveTextToImageMode = Boolean(
    textFallbackFeatureEnabled && activeProfileSupportsTextFallback && textToImageMode
  )
  const activeAspectRatio = studioMode === 'prompt' ? promptAspectRatio : aspectRatio
  const handleAspectRatioChange = useCallback(
    (nextRatio: StudioAspectRatio) => {
      if (studioMode === 'prompt') {
        setPromptAspectRatio(nextRatio)
        setPromptAspectRatioEnabled(true)
        return
      }
      setAspectRatio(nextRatio)
    },
    [setAspectRatio, setPromptAspectRatio, setPromptAspectRatioEnabled, studioMode]
  )
  const displayRatio =
    STUDIO_ASPECT_RATIOS.find((r) => r.id === (hoveredRatio ?? activeAspectRatio)) ??
    STUDIO_ASPECT_RATIOS[0]
  const displayRatioDims = getEstimatedOutputDimensions(
    selectedProvider,
    displayRatio.id,
    activeResolution
  )

  const extraImages = recipe.extraImages || []
  const hasAnyRef = Boolean(recipe.portrait || recipe.costume || recipe.pose || extraImages.length > 0)
  const coreCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  const [extraUrlInput, setExtraUrlInput] = useState('')
  const [urlModalOpen, setUrlModalOpen] = useState(false)
  const [stitchModalUrl, setStitchModalUrl] = useState<string | null>(null)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [progressHighWater, setProgressHighWater] = useState(0)

  const queueCfg = useMemo(
    () => mergeGenerationQueueConfig(platform.queueConfig),
    [platform.queueConfig]
  )
  const processingJobs = history.filter((item) => item.status === 'processing')
  const queuedJobs = history.filter((item) => item.status === 'queued')
  const activeJobsCount = processingJobs.length + queuedJobs.length
  const userQueueFull =
    processingJobs.length >= queueCfg.maxUserConcurrency &&
    queuedJobs.length >= queueCfg.maxUserQueuedJobs

  const foregroundJob = foregroundJobId
    ? history.find(
        (item) =>
          item.id === foregroundJobId && (item.status === 'processing' || item.status === 'queued')
      ) ?? null
    : null

  const showSubmittingState = isSubmitting && !foregroundJob
  const showForegroundQueued = foregroundJob?.status === 'queued'
  const showForegroundProcessing = foregroundJob?.status === 'processing'
  const showGeneratingState = showSubmittingState || showForegroundProcessing || showForegroundQueued
  const activeCloudJobId = foregroundJob?.id ?? null
  const isForegroundCancelling = Boolean(foregroundJob && cancellingJobIds[foregroundJob.id])
  const effectiveProgress = showSubmittingState
    ? submittingProgress
    : foregroundJob?.liveProgress ?? null
  const runningArtist = foregroundJob
    ? getStudioArtist(foregroundJob.provider)
    : submittingProvider
      ? getStudioArtist(submittingProvider)
      : activeArtist
  const runningProviderInfo = providers.find((p) => p.providerId === runningArtist.id)
  const runningEnabledModels = (runningProviderInfo?.models || []).filter((m) => m.enabled)
  const runningProfileId = foregroundJob?.profileId ?? submittingProfileId
  const runningBrushIdx = runningProfileId
    ? Math.max(
        0,
        runningEnabledModels.findIndex((m) => m.profileId === runningProfileId)
      )
    : activeBrushIndex
  const runningBrushPalette = getBrushPalette(runningBrushIdx)
  const runningBrushColorHex = runningBrushPalette.hex
  const runningBrushGlowHex = runningBrushPalette.glowHex
  const effectiveStartedAt = showForegroundQueued
    ? foregroundJob?.createdAt ?? null
    : foregroundJob?.startedAt ??
      effectiveProgress?.startedAt ??
      foregroundJob?.createdAt ??
      null
  const elapsedSeconds = effectiveStartedAt
    ? Math.max(0, Math.floor((nowTick - effectiveStartedAt) / 1000))
    : 0
  const liveStage: GenerationLiveStage = effectiveProgress?.stage ?? 'generating'
  const liveStageOrder =
    liveStage === 'uploading' ||
    liveStage === 'queued' ||
    liveStage === 'deducted' ||
    liveStage === 'resolving_refs' ||
    liveStage === 'transcribing_refs'
      ? 0
      : liveStage === 'generating' || liveStage === 'text_generating' || liveStage === 'retrying'
        ? 1
        : 2
  const isDrawingStage =
    liveStage === 'generating' || liveStage === 'text_generating' || liveStage === 'retrying'
  const smoothWaitPercent = Math.min(
    78,
    Math.round(32 + (1 - Math.exp(-elapsedSeconds / 24)) * 46)
  )
  const rawProgressPercent = isDrawingStage
    ? Math.max(effectiveProgress?.percent ?? 32, smoothWaitPercent)
    : effectiveProgress?.percent ?? (liveStageOrder === 0 ? 18 : 88)
  const barWidth = showGeneratingState ? Math.max(progressHighWater, rawProgressPercent) : 0

  useEffect(() => {
    void refreshBootstrap()
    if (user && !isSubmitting) {
      void refreshHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showGeneratingState) return
    setNowTick(Date.now())
    const timer = window.setInterval(() => setNowTick(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [showGeneratingState])

  useEffect(() => {
    if (!showGeneratingState) {
      setProgressHighWater(0)
      return
    }
    setProgressHighWater((prev) => (rawProgressPercent > prev ? rawProgressPercent : prev))
  }, [showGeneratingState, rawProgressPercent])

  // 1. 开始绘画时，小精灵以各自性格动效从左栏底座移动到画图舞台中心
  useEffect(() => {
    if (!showGeneratingState) {
      entranceStartedRef.current = false
      return
    }
    runningJobSnapshotRef.current = {
      providerId: runningArtist.id,
      brushHex: runningBrushColorHex,
      brushGlow: runningBrushGlowHex,
    }
    if (entranceDone || entranceStartedRef.current) return

    let dispatched = false
    const raf = requestAnimationFrame(() => {
      if (entranceStartedRef.current) return
      entranceStartedRef.current = true
      dispatched = true

      const reduceMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      if (reduceMotion) {
        setEntranceDone(true)
        return
      }

      const fromEl = document.querySelector<HTMLElement>(
        `[data-artist-sprite-target="${runningArtist.id}"]`
      )
      const toEl = document.querySelector<HTMLElement>('[data-monitor-sprite-slot]')
      if (fromEl && toEl) {
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        const inView =
          fromRect.width > 0 &&
          toRect.width > 0 &&
          fromRect.bottom > 0 &&
          fromRect.top < window.innerHeight &&
          toRect.bottom > 0 &&
          toRect.top < window.innerHeight
        if (inView) {
          playSpriteTravel(runningArtist.id, 'to_canvas')
          travelSeqRef.current += 1
          const nextTask: SpriteTravelTask = {
            id: travelSeqRef.current,
            providerId: runningArtist.id,
            direction: 'to_canvas',
            brushColorHex: runningBrushColorHex,
            brushGlowHex: runningBrushGlowHex,
            fromRect: {
              left: fromRect.left,
              top: fromRect.top,
              width: fromRect.width,
              height: fromRect.height,
            },
            toRect: {
              left: toRect.left,
              top: toRect.top,
              width: toRect.width,
              height: toRect.height,
            },
          }
          setSpriteTravelTasks((prev) => [
            ...prev.filter((t) => t.providerId !== nextTask.providerId),
            nextTask,
          ])
          return
        }
      }
      setEntranceDone(true)
    })

    return () => {
      cancelAnimationFrame(raf)
      if (!dispatched) {
        entranceStartedRef.current = false
      }
    }
  }, [
    showGeneratingState,
    entranceDone,
    runningArtist.id,
    runningBrushColorHex,
    runningBrushGlowHex,
  ])

  const wasGeneratingRef = useRef(showGeneratingState)
  const lastRevealedUrlRef = useRef<string | null>(previewUrl)

  // 2. 绘画完成瞬间：若生成成功则进入「欢呼交作业」阶段；若失败则留在画布原地露出沮丧表情；否则回位
  useEffect(() => {
    const was = wasGeneratingRef.current
    wasGeneratingRef.current = showGeneratingState

    if (was && !showGeneratingState) {
      const snap = runningJobSnapshotRef.current
      const enteringFailedStage = Boolean(generationError)
      const shouldDeliver =
        !enteringFailedStage &&
        Boolean(previewUrl) &&
        previewUrl !== lastRevealedUrlRef.current &&
        Boolean(snap)

      if (previewUrl) {
        lastRevealedUrlRef.current = previewUrl
      }

      const raf = requestAnimationFrame(() => {
        setSpriteTravelTasks((prev) => prev.filter((t) => t.direction !== 'to_canvas'))
        setStageResumeTick(0)

        if (enteringFailedStage) {
          setEntranceDone(true)
          return
        }

        setEntranceDone(false)
        const reduceMotion =
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

        if (shouldDeliver && previewUrl && snap && !reduceMotion) {
          setSkipResultIntro(false)
          setDeliveryState({
            phase: 'cheering',
            imageUrl: previewUrl,
            providerId: snap.providerId,
            brushHex: snap.brushHex,
            brushGlow: snap.brushGlow,
          })
        } else if (shouldDeliver) {
          playMonitorReveal()
        }
      })
      return () => cancelAnimationFrame(raf)
    }

    if (!showGeneratingState && previewUrl) {
      lastRevealedUrlRef.current = previewUrl
    }
  }, [showGeneratingState, previewUrl, generationError])

  // 3. 欢呼雀跃后把画纸甩向屏幕（从桌面小纸丝滑变大为最终成图尺寸），同时画师回到左栏原位
  useEffect(() => {
    if (deliveryState?.phase !== 'cheering') return

    const launchThrow = () => {
      const paperEl = document.querySelector<HTMLElement>('[data-monitor-paper-slot]')
      const resultImgEl = document.querySelector<HTMLElement>('[data-monitor-result-img]')
      const spriteSlotEl = document.querySelector<HTMLElement>('[data-monitor-sprite-slot]')
      const homeEl = document.querySelector<HTMLElement>(
        `[data-artist-sprite-target="${deliveryState.providerId}"]`
      )

      if (paperEl && resultImgEl) {
        const paperRect = paperEl.getBoundingClientRect()
        const targetRect = resultImgEl.getBoundingClientRect()
        if (paperRect.width > 0 && targetRect.width > 20 && targetRect.height > 20) {
          playHomeworkThrow()
          setSkipResultIntro(true)
          setDeliveryState((prev) => (prev ? { ...prev, phase: 'throwing' } : null))
          travelSeqRef.current += 1
          setHomeworkThrowTask({
            id: travelSeqRef.current,
            imageUrl: deliveryState.imageUrl,
            fromRect: {
              left: paperRect.left,
              top: paperRect.top,
              width: paperRect.width,
              height: paperRect.height,
            },
            toRect: {
              left: targetRect.left,
              top: targetRect.top,
              width: targetRect.width,
              height: targetRect.height,
            },
          })

          if (spriteSlotEl && homeEl) {
            const sFrom = spriteSlotEl.getBoundingClientRect()
            const sTo = homeEl.getBoundingClientRect()
            if (sFrom.width > 0 && sTo.width > 0) {
              playSpriteTravel(deliveryState.providerId, 'to_home')
              travelSeqRef.current += 1
              const nextTask: SpriteTravelTask = {
                id: travelSeqRef.current,
                providerId: deliveryState.providerId,
                direction: 'to_home',
                brushColorHex: deliveryState.brushHex,
                brushGlowHex: deliveryState.brushGlow,
                fromRect: {
                  left: sFrom.left,
                  top: sFrom.top,
                  width: sFrom.width,
                  height: sFrom.height,
                },
                toRect: {
                  left: sTo.left,
                  top: sTo.top,
                  width: sTo.width,
                  height: sTo.height,
                },
              }
              setSpriteTravelTasks((prev) => [
                ...prev.filter((t) => t.providerId !== nextTask.providerId),
                nextTask,
              ])
            }
          }
          return
        }
      }

      setDeliveryState(null)
      playMonitorReveal()
    }

    const imgReady = resultImgLoadedUrl === deliveryState.imageUrl
    const timer = window.setTimeout(launchThrow, imgReady ? 780 : 1300)
    return () => window.clearTimeout(timer)
  }, [deliveryState, resultImgLoadedUrl])

  const isEnteringMonitor = showGeneratingState && !entranceDone
  const showDeliveryScene = Boolean(deliveryState)
  const showFailedStage = !showGeneratingState && !deliveryState && Boolean(generationError)

  const failedStageArtist = useMemo(() => {
    if (!showFailedStage) return null
    const providerId = failedGenerationMeta?.providerId ?? selectedProvider
    const pInfo = providers.find((p) => p.providerId === providerId)
    const enabledModels = (pInfo?.models || []).filter((m) => m.enabled)
    const targetProfileId =
      providerId === selectedProvider
        ? (activeProfile?.profileId ?? failedGenerationMeta?.profileId ?? null)
        : (failedGenerationMeta?.profileId ?? null)
    const idx = targetProfileId
      ? Math.max(0, enabledModels.findIndex((m) => m.profileId === targetProfileId))
      : 0
    const palette = getBrushPalette(idx)
    return {
      providerId,
      brushHex: palette.hex,
      brushGlow: palette.glowHex,
    }
  }, [
    showFailedStage,
    failedGenerationMeta,
    selectedProvider,
    providers,
    activeProfile?.profileId,
  ])

  const failedStageSnapRef = useRef<{
    providerId: ImageProviderId
    brushHex: string
    brushGlow: string
    slotRect: { left: number; top: number; width: number; height: number } | null
  } | null>(null)
  const wasFailedStageRef = useRef(showFailedStage)

  const launchArtistReturnHome = useCallback(
    (info: {
      providerId: ImageProviderId
      brushHex: string
      brushGlow: string
      frustrated?: boolean
      fromRect?: { left: number; top: number; width: number; height: number } | null
    }) => {
      const reduceMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      if (reduceMotion) {
        setArtistReturnTick((n) => n + 1)
        return
      }
      const spriteSlotEl = document.querySelector<HTMLElement>('[data-monitor-sprite-slot]')
      const homeEl = document.querySelector<HTMLElement>(
        `[data-artist-sprite-target="${info.providerId}"]`
      )
      const measuredFrom = spriteSlotEl?.getBoundingClientRect()
      const sFrom =
        measuredFrom && measuredFrom.width > 0 ? measuredFrom : info.fromRect ?? null
      const sTo = homeEl?.getBoundingClientRect() ?? null
      if (
        sFrom &&
        sTo &&
        sFrom.width > 0 &&
        sTo.width > 0 &&
        sFrom.top + sFrom.height > 0 &&
        sFrom.top < window.innerHeight &&
        sTo.bottom > 0 &&
        sTo.top < window.innerHeight
      ) {
        playSpriteTravel(info.providerId, 'to_home')
        travelSeqRef.current += 1
        const nextTask: SpriteTravelTask = {
          id: travelSeqRef.current,
          providerId: info.providerId,
          direction: 'to_home',
          brushColorHex: info.brushHex,
          brushGlowHex: info.brushGlow,
          frustrated: info.frustrated,
          fromRect: {
            left: sFrom.left,
            top: sFrom.top,
            width: sFrom.width,
            height: sFrom.height,
          },
          toRect: {
            left: sTo.left,
            top: sTo.top,
            width: sTo.width,
            height: sTo.height,
          },
        }
        setSpriteTravelTasks((prev) => [
          ...prev.filter((t) => t.providerId !== nextTask.providerId),
          nextTask,
        ])
        return
      }
      setArtistReturnTick((n) => n + 1)
    },
    []
  )

  useEffect(() => {
    if (!showFailedStage || !failedStageArtist) return
    const capture = () => {
      const slotEl = document.querySelector<HTMLElement>('[data-monitor-sprite-slot]')
      const r = slotEl?.getBoundingClientRect()
      failedStageSnapRef.current = {
        ...failedStageArtist,
        slotRect:
          r && r.width > 0
            ? { left: r.left, top: r.top, width: r.width, height: r.height }
            : failedStageSnapRef.current?.slotRect ?? null,
      }
    }
    const raf = requestAnimationFrame(capture)
    window.addEventListener('resize', capture, { passive: true })
    window.addEventListener('scroll', capture, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', capture)
      window.removeEventListener('scroll', capture, true)
    }
  }, [showFailedStage, failedStageArtist])

  // 当用户离开失败原地沮丧舞台（如返回预览或切换另一位画师重画）时，让旧画师带着沮丧表情飞回左栏底座
  useEffect(() => {
    const was = wasFailedStageRef.current
    wasFailedStageRef.current = showFailedStage
    if (was && !showFailedStage) {
      const snap = failedStageSnapRef.current
      failedStageSnapRef.current = null
      if (!snap) return
      if (showGeneratingState && runningArtist.id === snap.providerId) return
      const raf = requestAnimationFrame(() => {
        if (!showGeneratingState) {
          setEntranceDone(false)
        }
        launchArtistReturnHome({
          providerId: snap.providerId,
          brushHex: snap.brushHex,
          brushGlow: snap.brushGlow,
          frustrated: true,
          fromRect: snap.slotRect,
        })
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [showFailedStage, showGeneratingState, runningArtist.id, launchArtistReturnHome])

  const frustratedAwayProviderId: ImageProviderId | null =
    showFailedStage && failedStageArtist ? failedStageArtist.providerId : null

  const awayProviderIds = useMemo<ImageProviderId[]>(() => {
    const ids = new Set<ImageProviderId>()
    if (showGeneratingState) ids.add(runningArtist.id)
    if (deliveryState) ids.add(deliveryState.providerId)
    if (frustratedAwayProviderId) ids.add(frustratedAwayProviderId)
    for (const task of spriteTravelTasks) {
      if (task.direction === 'to_home') ids.add(task.providerId)
    }
    return Array.from(ids)
  }, [
    showGeneratingState,
    runningArtist.id,
    deliveryState,
    frustratedAwayProviderId,
    spriteTravelTasks,
  ])

  const applyDataUrlToSlot = async (
    slot: 'portrait' | 'costume' | 'pose' | 'extra',
    dataUrl: string,
    rawName: string,
    sourceBytes?: number
  ) => {
    const cleanName = rawName.replace(/\.[^.]+$/, '').slice(0, 24) || '参考图'
    if (slot === 'extra') {
      if (user) {
        const uploaded = await uploadReferenceFileApi({
          file: dataUrlToBlob(dataUrl),
          filename: `${cleanName}.png`,
          purpose: 'extra',
        })
        addExtraImage({ name: cleanName, url: uploaded.url, r2Key: uploaded.r2Key })
      } else {
        addExtraImage({ name: cleanName, url: dataUrl })
      }
      return
    }
    setUploadingSlot(slot)
    try {
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const blob = dataUrlToBlob(dataUrl)
      let finalUrl = dataUrl
      let r2Key: string | undefined
      let finalBytes = sourceBytes ?? blob.size
      if (user) {
        const uploaded = await uploadReferenceFileApi({
          file: blob,
          filename: `${cleanName}.png`,
          purpose: slot,
          width: image.width,
          height: image.height,
        })
        finalUrl = uploaded.url
        r2Key = uploaded.r2Key
        finalBytes = uploaded.bytes
      }
      const items = uploadedReferences(cleanName, finalUrl, image.width, image.height, finalBytes, r2Key)
      if (slot === 'portrait') setPortrait(items.portrait)
      if (slot === 'costume') setCostume(items.costume)
      if (slot === 'pose') setPose(items.pose)
      toast.success(user ? '参考图已上传至云端' : '已暂存参考图（登录后将自动同步云端）')
    } finally {
      setUploadingSlot(null)
    }
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
    try {
      const dataUrl = await fileToDataUrl(file)
      await applyDataUrlToSlot(slot, dataUrl, file.name, file.size)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片读取失败')
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
    if (randomizingAll) return
    setRandomizingAll(true)
    setAllDiceSpin((s) => s + 1)
    try {
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
    } catch {
      toast.error('素材库加载失败，请稍后重试')
    } finally {
      setRandomizingAll(false)
    }
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

  const handleApplyHistoryRecipe = (item: GenerationHistoryItem, opts?: { silent?: boolean }) => {
    if (!item.snapshot?.recipe) {
      toast.info('该作品未保存配方快照')
      return false
    }
    const snap = item.snapshot
    applyRecipe(snap.recipe)
    const validStyleIds = new Set(getEffectiveStyleCatalog(platform).map((s) => s.id))
    const validRatioIds = new Set<StudioAspectRatio>(['3:4', '1:1', '4:3', '9:16', '16:9'])
    if (snap.generationMode === 'prompt') {
      setStudioMode('prompt')
      setUserPrompt(snap.userPrompt ?? '')
      setRemixGallerySource(null)
      const restoredPromptStyle =
        snap.stylePreset && snap.stylePreset !== 'none' && validStyleIds.has(snap.stylePreset)
          ? snap.stylePreset
          : 'none'
      setPromptStylePreset(restoredPromptStyle)
      setPromptStyleEnabled(restoredPromptStyle !== 'none')
      if (snap.aspectRatio && snap.aspectRatio !== 'auto' && validRatioIds.has(snap.aspectRatio)) {
        setPromptAspectRatio(snap.aspectRatio)
        setPromptAspectRatioEnabled(true)
      } else {
        setPromptAspectRatioEnabled(false)
      }
    } else {
      setStudioMode('recipe')
      if (snap.aspectRatio && snap.aspectRatio !== 'auto' && validRatioIds.has(snap.aspectRatio)) {
        setAspectRatio(snap.aspectRatio)
      }
      if (snap.stylePreset && (snap.stylePreset === 'none' || validStyleIds.has(snap.stylePreset))) {
        setStylePreset(snap.stylePreset)
      }
      setAllowFaceStyleShift(Boolean(snap.allowFaceStyleShift))
      setAllowPoseStyleShift(Boolean(snap.allowPoseStyleShift))
      setSceneNote(snap.sceneNote ?? '')
    }
    if (typeof snap.textFallbackOnly === 'boolean') {
      setTextToImageMode(snap.textFallbackOnly)
    }
    if (snap.provider) {
      const targetProv = providers.find((p) => p.providerId === snap.provider)
      if (targetProv && targetProv.enabled) {
        setSelectedProvider(snap.provider)
        if (snap.profileId) {
          const targetProf = targetProv.models.find(
            (m) => m.profileId === snap.profileId && m.enabled
          )
          if (targetProf) {
            setSelectedProfileForProvider(snap.provider, targetProf.profileId)
            if (
              snap.resolution &&
              targetProf.resolutions.some((r) => r.resolution === snap.resolution)
            ) {
              setSelectedResolutionForProfile(targetProf.profileId, snap.resolution)
            }
          }
        }
      }
    }
    setGalleryModalOpen(false)
    if (!opts?.silent) {
      toast.success('已套用该作品的角色配方')
    }
    return true
  }

  const handleUseImageAsExtraRef = (item: GenerationHistoryItem) => {
    if (!item.imageUrl) return
    const r2Key = item.imageUrl.startsWith('/api/files/')
      ? item.imageUrl.slice('/api/files/'.length)
      : undefined
    addExtraImage({
      name: item.recipeSummary ? `成图：${item.recipeSummary}` : '生成成图参考',
      url: item.imageUrl,
      r2Key,
    })
  }

  const handleRegenerateFromHistory = (item: GenerationHistoryItem) => {
    const applied = handleApplyHistoryRecipe(item, { silent: true })
    if (!applied) return
    void startGeneration(item.snapshot?.sceneNote ?? '', {
      textToImage: Boolean(item.snapshot?.textFallbackOnly),
    })
  }

  const handleGenerate = (opts?: { textToImage?: boolean }) => {
    if (!user) {
      openAuthModal('login')
      return
    }
    if (user.creditBalance < activeCost) {
      toast.error(`积分不足（需要 ${activeCost} 积分，当前 ${user.creditBalance} 积分）`)
      openAccountModal('redeem')
      return
    }
    if (userQueueFull) {
      void startGeneration(sceneNote, opts)
      return
    }
    if (studioMode === 'prompt') {
      if (userPrompt.trim().length < 2) {
        toast.error('请输入文生图提示词（至少 2 个字符）')
        return
      }
    } else if (!hasAnyRef) {
      toast.error('请先选择或上传至少 1 张参考图')
      return
    }
    if (showFailedStage && failedStageArtist?.providerId === selectedProvider) {
      unlockStudioAudio()
      setShutterTick((n) => n + 1)
      setEntranceDone(true)
      entranceStartedRef.current = true
      setStageResumeTick((n) => n + 1)
      playSpriteSelect(selectedProvider)
      void startGeneration(sceneNote, opts)
      return
    }
    if (showFailedStage) {
      setEntranceDone(false)
      entranceStartedRef.current = false
    }
    setShutterTick((n) => n + 1)
    void startGeneration(sceneNote, opts)
  }

  const styleCatalog = useMemo(() => getEffectiveStyleCatalog(platform), [platform])
  const isKnownStyle = (key: string | null | undefined) =>
    key === 'none' || Boolean(key && styleCatalog.some((s) => s.id === key))
  const activeStyleValue = studioMode === 'prompt' ? promptStylePreset : stylePreset
  const effectiveStylePreset =
    studioMode === 'prompt'
      ? promptStyleEnabled
        ? promptStylePreset
        : 'none'
      : stylePreset
  const activeStyleKey = isKnownStyle(effectiveStylePreset) ? effectiveStylePreset : 'none'
  const activeStyleItem = styleCatalog.find((s) => s.id === activeStyleKey) ?? null
  const styleVisual = getStyleVisualMeta(activeStyleKey, activeStyleItem)
  const viewfinderStyleLabel = activeStyleItem?.label || NONE_STYLE_PRESET.label

  const handleStyleChange = useCallback(
    (nextPreset: string) => {
      if (studioMode === 'prompt') {
        setPromptStylePreset(nextPreset)
        if (nextPreset !== 'none') {
          setPromptStyleEnabled(true)
        }
        return
      }
      setStylePreset(nextPreset)
    },
    [setPromptStyleEnabled, setPromptStylePreset, setStylePreset, studioMode]
  )
  const succeededHistory = history.filter((h) => h.status === 'succeeded' && h.imageUrl)
  const recentHistory = succeededHistory.slice(0, 10)

  const openStylePicker = useCallback((categoryId = 'all') => {
    setStyleModalInitialCat(categoryId)
    setStyleModalSeed((n) => n + 1)
    setStyleModalOpen(true)
  }, [])

  const insufficientCredits = Boolean(user && activeProviderReady && user.creditBalance < activeCost)

  const handleMoveToBackground = () => {
    launchArtistReturnHome({
      providerId: runningArtist.id,
      brushHex: runningBrushColorHex,
      brushGlow: runningBrushGlowHex,
    })
    setEntranceDone(false)
    entranceStartedRef.current = false
    sendForegroundToBackground()
    toast.info(
      showForegroundQueued
        ? '已转入后台排队，可继续发起新创作，轮到后自动绘制并在完成后通知'
        : '已转入后台绘制，可继续发起新创作，完成后自动通知入库'
    )
  }

  const handleCancelForegroundQueued = async () => {
    if (!foregroundJob || foregroundJob.status !== 'queued') return
    const targetId = foregroundJob.id
    const slotRectRaw = document
      .querySelector<HTMLElement>('[data-monitor-sprite-slot]')
      ?.getBoundingClientRect()
    const fromRect =
      slotRectRaw && slotRectRaw.width > 0
        ? {
            left: slotRectRaw.left,
            top: slotRectRaw.top,
            width: slotRectRaw.width,
            height: slotRectRaw.height,
          }
        : null
    const info = {
      providerId: runningArtist.id,
      brushHex: runningBrushColorHex,
      brushGlow: runningBrushGlowHex,
      fromRect,
    }
    const cancelled = await cancelQueuedJob(targetId)
    if (cancelled) {
      launchArtistReturnHome(info)
      setEntranceDone(false)
      entranceStartedRef.current = false
    }
  }

  const handleCancelBeforeJob = () => {
    if (entranceDone) {
      launchArtistReturnHome({
        providerId: runningArtist.id,
        brushHex: runningBrushColorHex,
        brushGlow: runningBrushGlowHex,
      })
    }
    setEntranceDone(false)
    entranceStartedRef.current = false
    cancelGeneration()
  }

  const activeBadgeLabel =
    processingJobs.length > 0 && queuedJobs.length > 0
      ? `绘制 ${processingJobs.length} · 排队 ${queuedJobs.length}`
      : processingJobs.length > 0
        ? `绘制中 ${processingJobs.length}`
        : queuedJobs.length > 0
          ? `排队中 ${queuedJobs.length}`
          : ''

  const recipeFanCards: StudioLayoutProps['recipeFanCards'] = [
    {
      key: 'pose',
      label: '姿势',
      subtitle: recipe.pose?.姿势名称,
      imageUrl: recipe.pose ? referenceImageUrl(poseThumbPath(recipe.pose)) : undefined,
      isContain: true,
      isDepth: Boolean(recipe.pose?.useDepth),
    },
    {
      key: 'costume',
      label: '服装',
      subtitle: recipe.costume?.服装名称,
      imageUrl: recipe.costume ? referenceImageUrl(recipe.costume.缩略图) : undefined,
      isContain: recipe.costume ? isContainCostumeSource(recipe.costume.source) : false,
    },
    {
      key: 'portrait',
      label: '人像',
      subtitle: recipe.portrait?.发型名称,
      imageUrl: recipe.portrait ? referenceImageUrl(recipe.portrait.缩略图) : undefined,
    },
  ]

  const layoutProps: StudioLayoutProps = {
    user,
    bootstrapLoaded,
    providersLoaded,
    platform,
    providers,
    hydrated,
    isMobile,
    studioMode,
    setStudioMode,
    userPrompt,
    setUserPrompt,
    remixGallerySource,
    setRemixGallerySource,
    sceneNote,
    setSceneNote,
    promptChipsOpen,
    setPromptChipsOpen,
    recipe,
    recipeFanCards,
    coreCount,
    hasAnyRef,
    extraImages,
    poseAngles,
    poseFrontOnly,
    costumeViews,
    isDragging,
    uploadingSlot,
    randomizingAll,
    randomizingAction,
    allDiceSpin,
    slotActionSpin,
    setPose,
    setCostume,
    setPortrait,
    toggleRecipePoseDepth,
    clearRecipe,
    handleTogglePoseFrontOnly,
    handleRandom,
    handleRandomSlot,
    handleOpenStitchModal,
    triggerSlotUpload: (slot) => {
      uploadSlotRef.current = slot
      slotInputRef.current?.click()
    },
    triggerExtraFileUpload: () => fileInputRef.current?.click(),
    openUrlModal: () => setUrlModalOpen(true),
    updateExtraImageName,
    removeExtraImage,
    handleExtraDragEnd,
    fileInputRef,
    slotInputRef,
    selectedProvider,
    setSelectedProvider,
    selectedProfileByProvider,
    setSelectedProfileForProvider,
    activeProfile,
    activeProfileResolutions,
    activeResolution,
    setSelectedResolutionForProfile,
    activeProviderReady,
    activeCost,
    insufficientCredits,
    activeBrushPalette,
    artistReturnTick,
    awayProviderIds,
    frustratedAwayProviderId,
    stylePreset: activeStyleValue,
    setStylePreset: handleStyleChange,
    promptStyleEnabled,
    setPromptStyleEnabled,
    allowFaceStyleShift,
    setAllowFaceStyleShift,
    allowPoseStyleShift,
    setAllowPoseStyleShift,
    styleVisual,
    viewfinderStyleLabel,
    openStylePicker,
    aspectRatio: activeAspectRatio,
    setAspectRatio: handleAspectRatioChange,
    promptAspectRatioEnabled,
    setPromptAspectRatioEnabled,
    hoveredRatio,
    setHoveredRatio,
    displayRatio,
    displayRatioDims,
    textFallbackFeatureEnabled,
    activeProfileSupportsTextFallback,
    effectiveTextToImageMode,
    setTextToImageMode,
    history,
    recentHistory,
    previewUrl,
    previewResult,
    activeJobsCount,
    activeBadgeLabel: activeBadgeLabel || null,
    processingJobsCount: processingJobs.length,
    queuedJobsCount: queuedJobs.length,
    userQueueFull,
    foregroundJob,
    activeCloudJobId,
    showGeneratingState,
    showForegroundQueued,
    showDeliveryScene,
    showFailedStage,
    isEnteringMonitor,
    isForegroundCancelling,
    isDrawingStage,
    liveStage,
    liveStageOrder,
    barWidth,
    elapsedSeconds,
    generationError,
    deliveryState,
    failedStageArtist,
    runningArtistId: runningArtist.id,
    runningBrushColorHex,
    runningBrushGlowHex,
    stageResumeTick,
    shutterTick,
    skipResultIntro,
    handleGenerate,
    handleMoveToBackground,
    handleCancelBeforeJob,
    handleCancelForegroundQueued,
    clearFailedAndPreview: () => {
      setGenerationError('')
      setPreviewUrl('')
    },
    selectHistoryPreview: (h) => {
      setDeliveryState(null)
      setHomeworkThrowTask(null)
      setSkipResultIntro(false)
      setGenerationError('')
      setPreviewUrl(h.imageUrl)
    },
    setResultImgLoadedUrl,
    setZoomImageUrl,
    setDetailWorkItem,
    setComparisonResult,
    setShareGalleryJob,
    handleUseImageAsExtraRef,
    openGalleryModal: () => setGalleryModalOpen(true),
    openLocalToolsModal: () => setLocalToolsOpen(true),
    openAuthModal,
    studioMuted,
    toggleStudioMute,
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
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
      <input ref={slotInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlotUpload} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUploadFiles}
      />

      <ClassicStudioLayout s={layoutProps} />

      {/* 云端作品集（按需懒加载，避免拉大工作台首屏包体积） */}
      {galleryModalOpen && (
        <Suspense fallback={null}>
          <CloudWorksDialog
            open={galleryModalOpen}
            onOpenChange={setGalleryModalOpen}
            history={history}
            foregroundJobId={foregroundJobId}
            cancellingJobIds={cancellingJobIds}
            onRefresh={refreshHistory}
            onOpenDetail={(item) => setDetailWorkItem(item)}
            onFocusMonitor={focusJobInMonitor}
            onCancelQueued={cancelQueuedJob}
            onCompare={(item) => setComparisonResult(item)}
            onApplyRecipe={(item) => handleApplyHistoryRecipe(item)}
            onRegenerate={(item) => handleRegenerateFromHistory(item)}
            onUseAsExtraRef={(item) => handleUseImageAsExtraRef(item)}
            onRequestDelete={(item) => setPendingDeleteHistoryItem(item)}
            onBatchDelete={removeHistoryItems}
          />
        </Suspense>
      )}

      {/* 分栏任务详情灯箱 */}
      {detailWorkItem !== null && (() => {
        const detailIdx = history.findIndex((item) => item.id === detailWorkItem.id)
        const activeDetail = detailIdx >= 0 ? history[detailIdx] : detailWorkItem
        return (
          <Suspense fallback={null}>
            <WorkDetailDialog
              item={activeDetail}
              open
              onOpenChange={(open) => {
                if (!open) setDetailWorkItem(null)
              }}
              styleCatalog={styleCatalog}
              canPrev={detailIdx > 0}
              canNext={detailIdx >= 0 && detailIdx < history.length - 1}
              onPrev={() => {
                if (detailIdx > 0) setDetailWorkItem(history[detailIdx - 1])
              }}
              onNext={() => {
                if (detailIdx >= 0 && detailIdx < history.length - 1) {
                  setDetailWorkItem(history[detailIdx + 1])
                }
              }}
              onZoom={(url) => setZoomImageUrl(url)}
              onCompare={(item) => setComparisonResult(item)}
              onApplyRecipe={(item) => handleApplyHistoryRecipe(item)}
              onRegenerate={(item) => handleRegenerateFromHistory(item)}
              onUseAsExtraRef={(item) => handleUseImageAsExtraRef(item)}
              onShareToGallery={(item) => setShareGalleryJob(item)}
              onFocusMonitor={focusJobInMonitor}
              onCancelQueued={(id) => void cancelQueuedJob(id)}
              onDelete={(item) => setPendingDeleteHistoryItem(item)}
            />
          </Suspense>
        )
      })()}

      {shareGalleryJob !== null && (
        <Suspense fallback={null}>
          <PublishToGalleryDialog
            job={shareGalleryJob}
            open
            onOpenChange={(open) => {
              if (!open) setShareGalleryJob(null)
            }}
          />
        </Suspense>
      )}

      {localToolsOpen && (
        <Suspense fallback={null}>
          <LocalImageToolsDialog
            open={localToolsOpen}
            onOpenChange={setLocalToolsOpen}
            currentMonitorUrl={previewUrl || undefined}
            onApplyToSlot={(slot, dataUrl, fileName) => {
              void applyDataUrlToSlot(slot, dataUrl, fileName).catch((err) => {
                toast.error(err instanceof Error ? err.message : '载入参考槽位失败')
              })
            }}
          />
        </Suspense>
      )}

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

      {comparisonResult !== null && (
        <Suspense fallback={null}>
          <ReferenceComparisonDialog
            result={comparisonResult}
            open
            onOpenChange={(open) => !open && setComparisonResult(null)}
          />
        </Suspense>
      )}

      <Dialog
        open={pendingDeleteHistoryItem !== null}
        onOpenChange={(open) => {
          if (!open && !deletingHistoryId) setPendingDeleteHistoryItem(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">确认删除作品？</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              将从云端作品集永久移除「{pendingDeleteHistoryItem?.recipeSummary || '未命名作品'}」，删除后不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deletingHistoryId !== null}
              onClick={() => setPendingDeleteHistoryItem(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deletingHistoryId !== null}
              onClick={async () => {
                if (!pendingDeleteHistoryItem) return
                const targetId = pendingDeleteHistoryItem.id
                setDeletingHistoryId(targetId)
                try {
                  await removeHistoryItem(targetId)
                  setDetailWorkItem((prev) => (prev?.id === targetId ? null : prev))
                  setPendingDeleteHistoryItem(null)
                } finally {
                  setDeletingHistoryId(null)
                }
              }}
            >
              {deletingHistoryId ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {Boolean(zoomImageUrl) && (
        <Suspense fallback={null}>
          <ImageViewer
            imageUrl={zoomImageUrl || ''}
            open
            onOpenChange={(open) => !open && setZoomImageUrl(null)}
          />
        </Suspense>
      )}

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
              <LayersIcon className="size-4 text-[var(--skin-accent)]" />
              <span>画风图鉴</span>
            </DialogTitle>
          </DialogHeader>
          {styleModalOpen && (
            <Suspense fallback={<div className="min-h-0 flex-1" />}>
              <StyleBrowserPanel
                key={`${styleModalSeed}-${styleModalInitialCat}`}
                initialCategoryId={styleModalInitialCat}
                value={effectiveStylePreset}
                onChange={handleStyleChange}
                onSelectComplete={() => setStyleModalOpen(false)}
                gridColsClassName="grid-cols-2 sm:grid-cols-3"
                className="min-h-0 flex-1"
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>

      <SpriteTravelPortal
        spriteTasks={spriteTravelTasks}
        homeworkTask={homeworkThrowTask}
        onSpriteArrive={(taskId) => {
          const arrived = spriteTravelTasks.find((t) => t.id === taskId)
          if (!arrived) return
          if (arrived.direction === 'to_canvas') {
            setEntranceDone(true)
          } else {
            setArtistReturnTick((n) => n + 1)
          }
          setSpriteTravelTasks((prev) => prev.filter((t) => t.id !== taskId))
        }}
        onHomeworkLand={(taskId) => {
          setHomeworkThrowTask((prev) => (prev && prev.id === taskId ? null : prev))
          setDeliveryState(null)
          playMonitorReveal()
        }}
      />
    </div>
  )
}
