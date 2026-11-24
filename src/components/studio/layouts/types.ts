import type { DragEndEvent } from '@dnd-kit/core'
import type { RefObject } from 'react'
import type { StudioAspectRatio } from '@/lib/artists'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import type { RecipeFanCardItem } from '@/components/motion/TactileMotion'
import type { RemixGallerySource } from '@/store/studioStore'
import type {
  GenerationHistoryItem,
  GenerationLiveStage,
  ImageProviderId,
  PlatformConfig,
  PoseItem,
  ProviderModelPublicInfo,
  ProviderPublicInfo,
  PublicUser,
  RecipeState,
  StudioGenerationMode,
  StudioResolution,
} from '@/types/gallery'
import type { StyleVisualMeta } from '@/lib/stylePresets'

export interface StudioDeliveryState {
  phase: 'cheering' | 'throwing'
  imageUrl: string
  providerId: ImageProviderId
  brushHex: string
  brushGlow: string
}

export interface StudioLayoutProps {
  // 用户与平台状态
  user: PublicUser | null
  bootstrapLoaded: boolean
  providersLoaded: boolean
  platform: PlatformConfig
  providers: ProviderPublicInfo[]
  hydrated: boolean
  isMobile: boolean

  // 创作模式与提示词
  studioMode: StudioGenerationMode
  setStudioMode: (mode: StudioGenerationMode) => void
  userPrompt: string
  setUserPrompt: (next: string | ((prev: string) => string)) => void
  remixGallerySource: RemixGallerySource | null
  setRemixGallerySource: (src: RemixGallerySource | null) => void
  sceneNote: string
  setSceneNote: (next: string | ((prev: string) => string)) => void
  promptChipsOpen: boolean
  setPromptChipsOpen: (next: boolean | ((prev: boolean) => boolean)) => void

  // 配方与槽位状态
  recipe: RecipeState
  recipeFanCards: RecipeFanCardItem[]
  coreCount: number
  hasAnyRef: boolean
  extraImages: NonNullable<RecipeState['extraImages']>
  poseAngles: PoseItem[]
  poseFrontOnly: boolean
  costumeViews: Array<{ id: string; label: string; 原图?: string; 缩略图?: string }>
  isDragging: boolean
  uploadingSlot: string | null
  randomizingAll: boolean
  randomizingAction: { slot: ReferenceSlot; scope: RandomScope } | null
  allDiceSpin: number
  slotActionSpin: Record<string, number>

  // 配方操作
  setPose: (pose: RecipeState['pose']) => void
  setCostume: (costume: RecipeState['costume']) => void
  setPortrait: (portrait: RecipeState['portrait']) => void
  toggleRecipePoseDepth: () => void
  clearRecipe: () => void
  handleTogglePoseFrontOnly: () => Promise<void>
  handleRandom: () => Promise<void>
  handleRandomSlot: (slot: ReferenceSlot, scope: RandomScope) => Promise<void>
  handleOpenStitchModal: () => void
  triggerSlotUpload: (slot: 'pose' | 'costume' | 'portrait') => void
  triggerExtraFileUpload: () => void
  openUrlModal: () => void
  updateExtraImageName: (id: string, name: string) => void
  removeExtraImage: (id: string) => void
  handleExtraDragEnd: (event: DragEndEvent) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  slotInputRef: RefObject<HTMLInputElement | null>

  // AI 小画家 / 画笔 / 画风 / 比例 / 分辨率 / 图转文
  selectedProvider: ImageProviderId
  setSelectedProvider: (id: ImageProviderId) => void
  selectedProfileByProvider: Partial<Record<ImageProviderId, string>>
  setSelectedProfileForProvider: (providerId: ImageProviderId, profileId: string) => void
  activeProfile: ProviderModelPublicInfo | null
  activeProfileResolutions: NonNullable<ProviderModelPublicInfo['resolutions']>
  activeResolution: StudioResolution | null | undefined
  setSelectedResolutionForProfile: (profileId: string, resolution: StudioResolution) => void
  activeProviderReady: boolean
  activeCost: number
  insufficientCredits: boolean
  activeBrushPalette: { hex: string; glowHex: string } | null
  artistReturnTick: number
  awayProviderIds: ImageProviderId[]
  frustratedAwayProviderId: ImageProviderId | null

  stylePreset: string
  setStylePreset: (v: string) => void
  promptStyleEnabled: boolean
  setPromptStyleEnabled: (v: boolean) => void
  allowFaceStyleShift: boolean
  setAllowFaceStyleShift: (v: boolean) => void
  allowPoseStyleShift: boolean
  setAllowPoseStyleShift: (v: boolean) => void
  styleVisual: StyleVisualMeta
  viewfinderStyleLabel: string
  openStylePicker: (initialCategory?: string) => void

  aspectRatio: StudioAspectRatio
  setAspectRatio: (r: StudioAspectRatio) => void
  promptAspectRatioEnabled: boolean
  setPromptAspectRatioEnabled: (v: boolean) => void
  hoveredRatio: StudioAspectRatio | null
  setHoveredRatio: (r: StudioAspectRatio | null) => void
  displayRatio: { id: StudioAspectRatio; label: string; hint: string }
  displayRatioDims: { label: string }

  textFallbackFeatureEnabled: boolean
  activeProfileSupportsTextFallback: boolean
  effectiveTextToImageMode: boolean
  setTextToImageMode: (v: boolean) => void

  // 生成执行与监控状态
  history: GenerationHistoryItem[]
  recentHistory: GenerationHistoryItem[]
  previewUrl: string
  previewResult: GenerationHistoryItem | undefined
  activeJobsCount: number
  activeBadgeLabel: string | null
  processingJobsCount: number
  queuedJobsCount: number
  userQueueFull: boolean
  foregroundJob: GenerationHistoryItem | null
  activeCloudJobId: string | null
  showGeneratingState: boolean
  showForegroundQueued: boolean
  showDeliveryScene: boolean
  showFailedStage: boolean
  isEnteringMonitor: boolean
  isForegroundCancelling: boolean
  isDrawingStage: boolean
  liveStage: GenerationLiveStage
  liveStageOrder: number
  barWidth: number
  elapsedSeconds: number
  generationError: string
  deliveryState: StudioDeliveryState | null
  failedStageArtist: { providerId: ImageProviderId; brushHex: string; brushGlow: string } | null
  runningArtistId: ImageProviderId
  runningBrushColorHex: string
  runningBrushGlowHex: string
  stageResumeTick: number
  shutterTick: number
  skipResultIntro: boolean

  // 动作回调
  handleGenerate: (overrides?: { textToImage?: boolean }) => void
  handleMoveToBackground: () => void
  handleCancelBeforeJob: () => void
  handleCancelForegroundQueued: () => Promise<void>
  clearFailedAndPreview: () => void
  selectHistoryPreview: (item: GenerationHistoryItem) => void
  setResultImgLoadedUrl: (url: string) => void
  setZoomImageUrl: (url: string | null) => void
  setDetailWorkItem: (item: GenerationHistoryItem | null) => void
  setComparisonResult: (item: GenerationHistoryItem | null) => void
  setShareGalleryJob: (item: GenerationHistoryItem | null) => void
  handleUseImageAsExtraRef: (item: GenerationHistoryItem) => void
  openGalleryModal: () => void
  openLocalToolsModal: () => void
  openAuthModal: (mode: 'login' | 'register') => void
  studioMuted: boolean
  toggleStudioMute: () => void
}
