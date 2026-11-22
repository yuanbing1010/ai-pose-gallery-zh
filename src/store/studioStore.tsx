import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from '@/lib/notifications'
import { idbRead, idbWrite } from '@/lib/idbStorage'
import { recipeBackup } from '@/lib/recipeImages'
import { randomSlot, type RandomScope, type ReferencePools, type ReferenceSlot } from '@/lib/randomRecipe'
import {
  ApiError,
  cancelQueuedGenerationApi,
  deleteGenerationApi,
  fetchBootstrap,
  fetchGenerationByIdApi,
  fetchGenerationsApi,
  loginApi,
  logoutApi,
  redeemCodeApi,
  registerApi,
  startGenerationStreamApi,
  unbindWechatApi,
  uploadReferenceFileApi,
  type StreamGenerationProgress,
} from '@/lib/apiClient'
import { dataUrlToBlob, stitchRecipeCanvas } from '@/services/aiGenerator'
import {
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_WECHAT_LOGIN_INFO,
  PROVIDER_ORDER,
  getEffectiveProfileCreditCost,
  getEffectiveStyleCatalog,
  getStudioArtist,
  hasPoseDepthMap,
  mergeGenerationQueueConfig,
  normalizeStudioResolution,
} from '../../shared/studio'
import type {
  CostumeItem,
  ExtraReferenceImage,
  GenerationHistoryItem,
  GenerationStatus,
  ImageProviderId,
  PlatformConfig,
  PortraitItem,
  PoseItem,
  ProviderModelPublicInfo,
  ProviderPublicInfo,
  PublicUser,
  RecipeState,
  StudioAspectRatio,
  StudioResolution,
  WechatLoginPublicInfo,
} from '@/types/gallery'

const PREFS_KEY = 'pose_atlas_client_prefs_v4'
const RECIPE_KEY = 'pose_atlas_recipe_v4'

export type AuthModalTab = 'login' | 'register'
export type AccountModalTab = 'overview' | 'redeem' | 'ledger' | 'security'

interface PoseAdaptOverride {
  styleId: string
  enabled: boolean
}

interface ClientPrefs {
  selectedProvider: ImageProviderId
  selectedProfileByProvider: Partial<Record<ImageProviderId, string>>
  selectedResolutionByProfile: Record<string, StudioResolution>
  stylePreset: string
  allowFaceStyleShift: boolean
  poseAdaptOverride: PoseAdaptOverride | null
  aspectRatio: StudioAspectRatio
  poseFrontOnly: boolean
  sceneNote: string
  textToImageMode: boolean
}

const DEFAULT_PREFS: ClientPrefs = {
  selectedProvider: 'gpt',
  selectedProfileByProvider: {},
  selectedResolutionByProfile: {},
  stylePreset: 'none',
  allowFaceStyleShift: false,
  poseAdaptOverride: null,
  aspectRatio: '3:4',
  poseFrontOnly: true,
  sceneNote: '',
  textToImageMode: false,
}

function sanitizePoseAdaptOverride(raw: unknown): PoseAdaptOverride | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.styleId !== 'string' || !rec.styleId.trim() || typeof rec.enabled !== 'boolean') {
    return null
  }
  return { styleId: rec.styleId.trim(), enabled: rec.enabled }
}

function resolveStyleDefaultPoseAdapt(platform: PlatformConfig, stylePreset: string): boolean {
  if (!stylePreset || stylePreset === 'none') return false
  const matched = getEffectiveStyleCatalog(platform).find((item) => item.id === stylePreset)
  return matched?.poseMode === 'adaptive'
}

function resolveEffectivePoseAdapt(
  platform: PlatformConfig,
  stylePreset: string,
  override: PoseAdaptOverride | null
): boolean {
  if (!stylePreset || stylePreset === 'none') return false
  if (override && override.styleId === stylePreset) {
    return override.enabled
  }
  return resolveStyleDefaultPoseAdapt(platform, stylePreset)
}

function sanitizeProfileMap(raw: unknown): Partial<Record<ImageProviderId, string>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<ImageProviderId, string>> = {}
  for (const pid of PROVIDER_ORDER) {
    const val = (raw as Record<string, unknown>)[pid]
    if (typeof val === 'string' && val.trim()) {
      out[pid] = val.trim()
    }
  }
  return out
}

function sanitizeResolutionMap(raw: unknown): Record<string, StudioResolution> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, StudioResolution> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeStudioResolution(v)
    if (normalized) {
      out[k] = normalized
    }
  }
  return out
}

const initialPrefs = (): ClientPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<ClientPrefs>
    return {
      selectedProvider:
        parsed.selectedProvider && PROVIDER_ORDER.includes(parsed.selectedProvider)
          ? parsed.selectedProvider
          : DEFAULT_PREFS.selectedProvider,
      selectedProfileByProvider: sanitizeProfileMap(parsed.selectedProfileByProvider),
      selectedResolutionByProfile: sanitizeResolutionMap(parsed.selectedResolutionByProfile),
      stylePreset:
        typeof parsed.stylePreset === 'string' && parsed.stylePreset.trim()
          ? parsed.stylePreset
          : DEFAULT_PREFS.stylePreset,
      allowFaceStyleShift:
        typeof parsed.allowFaceStyleShift === 'boolean'
          ? parsed.allowFaceStyleShift
          : DEFAULT_PREFS.allowFaceStyleShift,
      poseAdaptOverride: sanitizePoseAdaptOverride(parsed.poseAdaptOverride),
      aspectRatio:
        parsed.aspectRatio && ['3:4', '1:1', '4:3', '9:16', '16:9'].includes(parsed.aspectRatio)
          ? parsed.aspectRatio
          : DEFAULT_PREFS.aspectRatio,
      poseFrontOnly:
        typeof parsed.poseFrontOnly === 'boolean'
          ? parsed.poseFrontOnly
          : DEFAULT_PREFS.poseFrontOnly,
      sceneNote:
        typeof parsed.sceneNote === 'string'
          ? parsed.sceneNote
          : DEFAULT_PREFS.sceneNote,
      textToImageMode:
        typeof parsed.textToImageMode === 'boolean'
          ? parsed.textToImageMode
          : DEFAULT_PREFS.textToImageMode,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

const initialRecipe = (): RecipeState => {
  try {
    const raw = localStorage.getItem(RECIPE_KEY)
    if (!raw) return { portrait: null, costume: null, pose: null, extraImages: [] }
    const parsed = JSON.parse(raw)
    return {
      portrait: parsed.portrait ?? null,
      costume: parsed.costume ?? null,
      pose: parsed.pose ?? null,
      extraImages: Array.isArray(parsed.extraImages) ? parsed.extraImages : [],
    }
  } catch {
    return { portrait: null, costume: null, pose: null, extraImages: [] }
  }
}

const DEFAULT_PUBLIC_PROVIDERS: ProviderPublicInfo[] = PROVIDER_ORDER.map((id, idx) => ({
  providerId: id,
  enabled: true,
  configured: false,
  creditCost: 0,
  sortOrder: idx,
  artist: getStudioArtist(id),
  models: [],
}))

// oxlint-disable-next-line react/only-export-components
export function resolveActiveProviderProfile(
  providerInfo: ProviderPublicInfo | undefined,
  savedProfileId?: string
): ProviderModelPublicInfo | null {
  const models = providerInfo?.models || []
  if (models.length === 0) return null
  if (savedProfileId) {
    const matched = models.find((m) => m.profileId === savedProfileId && m.enabled)
    if (matched) return matched
  }
  return (
    models.find((m) => m.isDefault && m.enabled && m.configured) ??
    models.find((m) => m.enabled && m.configured) ??
    models.find((m) => m.isDefault && m.enabled) ??
    models.find((m) => m.enabled) ??
    models[0] ??
    null
  )
}

// oxlint-disable-next-line react/only-export-components
export function resolveActiveProfileResolution(
  profile: ProviderModelPublicInfo | null | undefined,
  savedResolution?: StudioResolution
): StudioResolution | null {
  if (!profile || profile.resolutions.length === 0) return null
  if (savedResolution && profile.resolutions.some((r) => r.resolution === savedResolution)) {
    return savedResolution
  }
  if (
    profile.defaultResolution &&
    profile.resolutions.some((r) => r.resolution === profile.defaultResolution)
  ) {
    return profile.defaultResolution
  }
  return profile.resolutions[0]?.resolution ?? null
}

type Updater<T> = T | ((prev: T) => T)

export interface FailedGenerationMeta {
  providerId: ImageProviderId
  profileId: string | null
}

interface StudioZustandStore {
  user: PublicUser | null
  bootstrapLoaded: boolean
  providersLoaded: boolean
  platform: PlatformConfig
  providers: ProviderPublicInfo[]
  wechatLogin: WechatLoginPublicInfo
  recipe: RecipeState
  selectedProvider: ImageProviderId
  selectedProfileByProvider: Partial<Record<ImageProviderId, string>>
  selectedResolutionByProfile: Record<string, StudioResolution>
  stylePreset: string
  allowFaceStyleShift: boolean
  poseAdaptOverride: PoseAdaptOverride | null
  allowPoseStyleShift: boolean
  aspectRatio: StudioAspectRatio
  history: GenerationHistoryItem[]
  poseDepthMode: boolean
  poseFrontOnly: boolean
  sceneNote: string
  textToImageMode: boolean
  previewUrl: string
  isSubmitting: boolean
  submittingProvider: ImageProviderId | null
  submittingProfileId: string | null
  submittingProgress: StreamGenerationProgress | null
  foregroundJobId: string | null
  cancellingJobIds: Record<string, boolean>
  generationError: string
  failedGenerationMeta: FailedGenerationMeta | null
  idbHydrated: boolean
  authModalOpen: boolean
  authModalTab: AuthModalTab
  accountModalOpen: boolean
  accountModalTab: AccountModalTab
  setUser: (updater: Updater<PublicUser | null>) => void
  setBootstrapLoaded: (val: boolean) => void
  setProvidersLoaded: (val: boolean) => void
  setPlatform: (val: PlatformConfig) => void
  setProviders: (val: ProviderPublicInfo[]) => void
  setWechatLogin: (val: WechatLoginPublicInfo) => void
  setRecipe: (updater: Updater<RecipeState>) => void
  setSelectedProvider: (val: ImageProviderId) => void
  setSelectedProfileForProvider: (providerId: ImageProviderId, profileId: string) => void
  setSelectedProfileByProviderState: (val: Partial<Record<ImageProviderId, string>>) => void
  setSelectedResolutionForProfile: (profileId: string, resolution: StudioResolution) => void
  setSelectedResolutionByProfileState: (val: Record<string, StudioResolution>) => void
  setStylePreset: (val: string) => void
  setAllowFaceStyleShift: (updater: Updater<boolean>) => void
  setAllowPoseStyleShift: (updater: Updater<boolean>) => void
  setAspectRatio: (val: StudioAspectRatio) => void
  setHistory: (updater: Updater<GenerationHistoryItem[]>) => void
  setPoseDepthModeState: (updater: Updater<boolean>) => void
  setPoseFrontOnly: (updater: Updater<boolean>) => void
  setSceneNote: (updater: Updater<string>) => void
  setTextToImageMode: (updater: Updater<boolean>) => void
  setPreviewUrl: (updater: Updater<string>) => void
  setIsSubmitting: (val: boolean) => void
  setSubmittingMeta: (provider: ImageProviderId | null, profileId: string | null) => void
  setSubmittingProgress: (val: StreamGenerationProgress | null) => void
  setForegroundJobId: (jobId: string | null) => void
  setCancellingJobId: (jobId: string, cancelling: boolean) => void
  setGenerationError: (val: string, meta?: FailedGenerationMeta | null) => void
  setIdbHydrated: (val: boolean) => void
  setAuthModalOpen: (open: boolean) => void
  setAuthModalTab: (tab: AuthModalTab) => void
  setAccountModalOpen: (open: boolean) => void
  setAccountModalTab: (tab: AccountModalTab) => void
}

// oxlint-disable-next-line react/only-export-components
export const useStudioStore = create<StudioZustandStore>((set) => {
  const rec = initialRecipe()
  const prefs = initialPrefs()
  return {
    user: null,
    bootstrapLoaded: false,
    providersLoaded: false,
    platform: DEFAULT_PLATFORM_CONFIG,
    providers: DEFAULT_PUBLIC_PROVIDERS,
    wechatLogin: DEFAULT_WECHAT_LOGIN_INFO,
    recipe: rec,
    selectedProvider: prefs.selectedProvider,
    selectedProfileByProvider: prefs.selectedProfileByProvider,
    selectedResolutionByProfile: prefs.selectedResolutionByProfile,
    stylePreset: prefs.stylePreset,
    allowFaceStyleShift: prefs.allowFaceStyleShift,
    poseAdaptOverride: prefs.poseAdaptOverride,
    allowPoseStyleShift: resolveEffectivePoseAdapt(
      DEFAULT_PLATFORM_CONFIG,
      prefs.stylePreset,
      prefs.poseAdaptOverride
    ),
    aspectRatio: prefs.aspectRatio,
    history: [],
    poseDepthMode: Boolean(rec.pose?.useDepth),
    poseFrontOnly: prefs.poseFrontOnly,
    sceneNote: prefs.sceneNote,
    textToImageMode: prefs.textToImageMode,
    previewUrl: '',
    isSubmitting: false,
    submittingProvider: null,
    submittingProfileId: null,
    submittingProgress: null,
    foregroundJobId: null,
    cancellingJobIds: {},
    generationError: '',
    failedGenerationMeta: null,
    idbHydrated: false,
    authModalOpen: false,
    authModalTab: 'login',
    accountModalOpen: false,
    accountModalTab: 'overview',
    setUser: (updater) =>
      set((s) => ({ user: typeof updater === 'function' ? updater(s.user) : updater })),
    setBootstrapLoaded: (bootstrapLoaded) => set({ bootstrapLoaded }),
    setProvidersLoaded: (providersLoaded) => set({ providersLoaded }),
    setPlatform: (platform) =>
      set((s) => ({
        platform,
        allowPoseStyleShift: resolveEffectivePoseAdapt(platform, s.stylePreset, s.poseAdaptOverride),
      })),
    setProviders: (providers) => set({ providers }),
    setWechatLogin: (wechatLogin) => set({ wechatLogin }),
    setRecipe: (updater) =>
      set((s) => ({ recipe: typeof updater === 'function' ? updater(s.recipe) : updater })),
    setSelectedProvider: (selectedProvider) => set({ selectedProvider }),
    setSelectedProfileForProvider: (providerId, profileId) =>
      set((s) => ({
        selectedProfileByProvider: { ...s.selectedProfileByProvider, [providerId]: profileId },
      })),
    setSelectedProfileByProviderState: (selectedProfileByProvider) =>
      set({ selectedProfileByProvider }),
    setSelectedResolutionForProfile: (profileId, resolution) =>
      set((s) => ({
        selectedResolutionByProfile: { ...s.selectedResolutionByProfile, [profileId]: resolution },
      })),
    setSelectedResolutionByProfileState: (selectedResolutionByProfile) =>
      set({ selectedResolutionByProfile }),
    setStylePreset: (stylePreset) =>
      set((s) => {
        if (s.stylePreset === stylePreset) return {}
        return {
          stylePreset,
          poseAdaptOverride: null,
          allowPoseStyleShift: resolveEffectivePoseAdapt(s.platform, stylePreset, null),
        }
      }),
    setAllowFaceStyleShift: (updater) =>
      set((s) => ({
        allowFaceStyleShift:
          typeof updater === 'function' ? updater(s.allowFaceStyleShift) : updater,
      })),
    setAllowPoseStyleShift: (updater) =>
      set((s) => {
        const next = typeof updater === 'function' ? updater(s.allowPoseStyleShift) : updater
        const defaultForStyle = resolveStyleDefaultPoseAdapt(s.platform, s.stylePreset)
        const nextOverride =
          s.stylePreset && s.stylePreset !== 'none' && next !== defaultForStyle
            ? { styleId: s.stylePreset, enabled: next }
            : null
        return {
          poseAdaptOverride: nextOverride,
          allowPoseStyleShift: next,
        }
      }),
    setAspectRatio: (aspectRatio) => set({ aspectRatio }),
    setHistory: (updater) =>
      set((s) => ({ history: typeof updater === 'function' ? updater(s.history) : updater })),
    setPoseDepthModeState: (updater) =>
      set((s) => ({ poseDepthMode: typeof updater === 'function' ? updater(s.poseDepthMode) : updater })),
    setPoseFrontOnly: (updater) =>
      set((s) => ({ poseFrontOnly: typeof updater === 'function' ? updater(s.poseFrontOnly) : updater })),
    setSceneNote: (updater) =>
      set((s) => ({ sceneNote: typeof updater === 'function' ? updater(s.sceneNote) : updater })),
    setTextToImageMode: (updater) =>
      set((s) => ({ textToImageMode: typeof updater === 'function' ? updater(s.textToImageMode) : updater })),
    setPreviewUrl: (updater) =>
      set((s) => ({ previewUrl: typeof updater === 'function' ? updater(s.previewUrl) : updater })),
    setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
    setSubmittingMeta: (submittingProvider, submittingProfileId) =>
      set({ submittingProvider, submittingProfileId }),
    setSubmittingProgress: (submittingProgress) => set({ submittingProgress }),
    setForegroundJobId: (foregroundJobId) => set({ foregroundJobId }),
    setCancellingJobId: (jobId, cancelling) =>
      set((s) => {
        const next = { ...s.cancellingJobIds }
        if (cancelling) next[jobId] = true
        else delete next[jobId]
        return { cancellingJobIds: next }
      }),
    setGenerationError: (generationError, meta) =>
      set((s) =>
        generationError === ''
          ? { generationError: '', failedGenerationMeta: null }
          : {
              generationError,
              failedGenerationMeta: meta !== undefined ? meta : s.failedGenerationMeta,
            }
      ),
    setIdbHydrated: (idbHydrated) => set({ idbHydrated }),
    setAuthModalOpen: (authModalOpen) => set({ authModalOpen }),
    setAuthModalTab: (authModalTab) => set({ authModalTab }),
    setAccountModalOpen: (accountModalOpen) => set({ accountModalOpen }),
    setAccountModalTab: (accountModalTab) => set({ accountModalTab }),
  }
})

interface StudioContextValue {
  user: PublicUser | null
  bootstrapLoaded: boolean
  providersLoaded: boolean
  platform: PlatformConfig
  providers: ProviderPublicInfo[]
  wechatLogin: WechatLoginPublicInfo
  hydrated: boolean
  recipe: RecipeState
  selectedProvider: ImageProviderId
  selectedProfileByProvider: Partial<Record<ImageProviderId, string>>
  selectedResolutionByProfile: Record<string, StudioResolution>
  stylePreset: string
  allowFaceStyleShift: boolean
  allowPoseStyleShift: boolean
  aspectRatio: StudioAspectRatio
  history: GenerationHistoryItem[]
  poseDepthMode: boolean
  poseFrontOnly: boolean
  sceneNote: string
  textToImageMode: boolean
  previewUrl: string
  isSubmitting: boolean
  submittingProvider: ImageProviderId | null
  submittingProfileId: string | null
  submittingProgress: StreamGenerationProgress | null
  foregroundJobId: string | null
  cancellingJobIds: Record<string, boolean>
  generationError: string
  failedGenerationMeta: FailedGenerationMeta | null
  authModalOpen: boolean
  authModalTab: AuthModalTab
  accountModalOpen: boolean
  accountModalTab: AccountModalTab
  openAuthModal: (tab?: AuthModalTab) => void
  closeAuthModal: () => void
  openAccountModal: (tab?: AccountModalTab) => void
  closeAccountModal: () => void
  refreshBootstrap: () => Promise<void>
  refreshHistory: () => Promise<void>
  login: (account: string, password: string) => Promise<PublicUser>
  register: (payload: {
    username: string
    email?: string
    displayName?: string
    password: string
  }) => Promise<PublicUser>
  logout: () => Promise<void>
  unbindWechat: () => Promise<PublicUser | null>
  redeemCode: (code: string) => Promise<{ credits: number; creditBalance: number }>
  setSelectedProvider: (id: ImageProviderId) => void
  setSelectedProfileForProvider: (providerId: ImageProviderId, profileId: string) => void
  setSelectedResolutionForProfile: (profileId: string, resolution: StudioResolution) => void
  setStylePreset: (preset: string) => void
  setAllowFaceStyleShift: (updater: Updater<boolean>) => void
  setAllowPoseStyleShift: (updater: Updater<boolean>) => void
  setAspectRatio: (ratio: StudioAspectRatio) => void
  setPoseDepthMode: (val: boolean) => void
  setPoseFrontOnly: (val: boolean) => void
  setSceneNote: (updater: Updater<string>) => void
  setTextToImageMode: (updater: Updater<boolean>) => void
  toggleRecipePoseDepth: () => void
  setPreviewUrl: (url: string) => void
  sendForegroundToBackground: () => void
  focusJobInMonitor: (jobId: string) => void
  cancelQueuedJob: (jobId: string) => Promise<boolean>
  setGenerationError: (val: string, meta?: FailedGenerationMeta | null) => void
  startGeneration: (sceneNote?: string, options?: { textToImage?: boolean }) => Promise<void>
  cancelGeneration: () => void
  setPortrait: (item: PortraitItem | null) => void
  setCostume: (item: CostumeItem | null) => void
  setPose: (item: PoseItem | null) => void
  applyRecipe: (next: RecipeState) => void
  togglePortrait: (item: PortraitItem) => void
  toggleCostume: (item: CostumeItem) => void
  togglePose: (item: PoseItem) => void
  addExtraImage: (item: { name: string; url: string; r2Key?: string }) => void
  removeExtraImage: (id: string) => void
  updateExtraImageName: (id: string, name: string) => void
  reorderExtraImages: (activeId: string, overId: string) => void
  clearRecipe: () => void
  randomizeRecipe: (pools: { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }) => void
  randomizeSlot: (slot: ReferenceSlot, scope: RandomScope, pools: ReferencePools, expectedId?: string | null) => void
  removeHistoryItem: (id: string) => Promise<void>
  removeHistoryItems: (ids: string[]) => Promise<void>
}

export type StudioActionsValue = Pick<
  StudioContextValue,
  | 'openAuthModal'
  | 'closeAuthModal'
  | 'openAccountModal'
  | 'closeAccountModal'
  | 'refreshBootstrap'
  | 'refreshHistory'
  | 'login'
  | 'register'
  | 'logout'
  | 'unbindWechat'
  | 'redeemCode'
  | 'setSelectedProvider'
  | 'setSelectedProfileForProvider'
  | 'setSelectedResolutionForProfile'
  | 'setStylePreset'
  | 'setAllowFaceStyleShift'
  | 'setAllowPoseStyleShift'
  | 'setAspectRatio'
  | 'setPoseDepthMode'
  | 'setPoseFrontOnly'
  | 'setSceneNote'
  | 'setTextToImageMode'
  | 'toggleRecipePoseDepth'
  | 'setPreviewUrl'
  | 'sendForegroundToBackground'
  | 'focusJobInMonitor'
  | 'cancelQueuedJob'
  | 'setGenerationError'
  | 'startGeneration'
  | 'cancelGeneration'
  | 'setPortrait'
  | 'setCostume'
  | 'setPose'
  | 'applyRecipe'
  | 'togglePortrait'
  | 'toggleCostume'
  | 'togglePose'
  | 'addExtraImage'
  | 'removeExtraImage'
  | 'updateExtraImageName'
  | 'reorderExtraImages'
  | 'clearRecipe'
  | 'randomizeRecipe'
  | 'randomizeSlot'
  | 'removeHistoryItem'
  | 'removeHistoryItems'
>

const StudioContext = createContext<StudioContextValue | null>(null)
const StudioActionsContext = createContext<StudioActionsValue | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const store = useStudioStore()
  const {
    user,
    bootstrapLoaded,
    providersLoaded,
    platform,
    providers,
    wechatLogin,
    recipe,
    selectedProvider,
    selectedProfileByProvider,
    selectedResolutionByProfile,
    stylePreset,
    allowFaceStyleShift,
    poseAdaptOverride,
    allowPoseStyleShift,
    aspectRatio,
    history,
    poseDepthMode,
    poseFrontOnly,
    sceneNote,
    textToImageMode,
    previewUrl,
    isSubmitting,
    submittingProvider,
    submittingProfileId,
    submittingProgress,
    foregroundJobId,
    cancellingJobIds,
    generationError,
    failedGenerationMeta,
    idbHydrated,
    authModalOpen,
    authModalTab,
    accountModalOpen,
    accountModalTab,
    setUser,
    setBootstrapLoaded,
    setProvidersLoaded,
    setPlatform,
    setProviders,
    setWechatLogin,
    setRecipe,
    setSelectedProvider,
    setSelectedProfileForProvider,
    setSelectedProfileByProviderState,
    setSelectedResolutionForProfile,
    setSelectedResolutionByProfileState,
    setStylePreset,
    setAllowFaceStyleShift,
    setAllowPoseStyleShift,
    setAspectRatio,
    setHistory,
    setPoseDepthModeState,
    setPoseFrontOnly,
    setSceneNote,
    setTextToImageMode,
    setPreviewUrl,
    setIsSubmitting,
    setSubmittingMeta,
    setSubmittingProgress,
    setForegroundJobId,
    setCancellingJobId,
    setGenerationError,
    setIdbHydrated,
    setAuthModalOpen,
    setAuthModalTab,
    setAccountModalOpen,
    setAccountModalTab,
  } = store

  const isSubmittingRef = useRef(false)
  const pendingSubmitTokenRef = useRef<string | null>(null)
  const pendingSubmitAbortRef = useRef<AbortController | null>(null)
  const activeStreamsRef = useRef<Map<string, AbortController>>(new Map())
  const sseActiveJobIdsRef = useRef<Set<string>>(new Set())
  const sseLiveProgressRef = useRef<Map<string, StreamGenerationProgress>>(new Map())
  const lastBootstrapAtRef = useRef(0)
  const prevActiveStatusRef = useRef<Map<string, GenerationStatus>>(new Map())
  const bootAutoFocusDoneRef = useRef(false)
  const bootPreviewInitializedRef = useRef(false)

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetchGenerationsApi(60, 0)
      const prevMap = prevActiveStatusRef.current
      const liveState = useStudioStore.getState()

      const finishedJobs: GenerationHistoryItem[] = []
      const failedJobs: GenerationHistoryItem[] = []
      const cancelledJobs: GenerationHistoryItem[] = []

      const mergedItems = res.items.map((item) => {
        if (item.status !== 'processing') {
          sseLiveProgressRef.current.delete(item.id)
          return item
        }
        const localProg = sseLiveProgressRef.current.get(item.id)
        if (!localProg) return item
        const localPct = localProg.percent ?? 0
        const serverPct = item.liveProgress?.percent ?? 0
        return localPct >= serverPct ? { ...item, liveProgress: localProg } : item
      })

      // 保留正在建连中的本地占位任务（避免与并发 in-flight refreshHistory 竞态丢失）
      const returnedIds = new Set(mergedItems.map((x) => x.id))
      const livePlaceholders = liveState.history.filter(
        (x) => sseActiveJobIdsRef.current.has(x.id) && !returnedIds.has(x.id)
      )
      const nextHistory =
        livePlaceholders.length > 0 ? [...livePlaceholders, ...mergedItems] : mergedItems

      for (const item of res.items) {
        const hadActiveStatus = prevMap.get(item.id)
        if (!hadActiveStatus) continue
        if (item.status === 'succeeded' && item.imageUrl) {
          finishedJobs.push(item)
        } else if (item.status === 'failed') {
          failedJobs.push(item)
        } else if (hadActiveStatus === 'queued' && item.status === 'cancelled') {
          cancelledJobs.push(item)
        }
      }

      const nextActiveMap = new Map<string, GenerationStatus>()
      for (const item of nextHistory) {
        if (item.status === 'processing' || item.status === 'queued') {
          nextActiveMap.set(item.id, item.status)
        }
      }
      prevActiveStatusRef.current = nextActiveMap

      setHistory(nextHistory)
      setUser((prev) => (prev ? { ...prev, creditBalance: res.creditBalance } : prev))

      let curFg = useStudioStore.getState().foregroundJobId
      const isSubmittingNow = isSubmittingRef.current

      // 首次加载时若云端存在未完成任务，自动将最近一个活跃任务恢复到监视器
      if (!bootAutoFocusDoneRef.current) {
        bootAutoFocusDoneRef.current = true
        if (!curFg && !isSubmittingNow) {
          const autoFocusTarget =
            nextHistory.find((x) => x.status === 'processing') ??
            nextHistory.find((x) => x.status === 'queued') ??
            null
          if (autoFocusTarget) {
            curFg = autoFocusTarget.id
            bootPreviewInitializedRef.current = true
            setForegroundJobId(autoFocusTarget.id)
          }
        }
      }

      // 如果当前聚焦的任务已不在活跃态，释放前景焦点
      if (curFg) {
        const fgItem = nextHistory.find((x) => x.id === curFg)
        if (!fgItem || (fgItem.status !== 'processing' && fgItem.status !== 'queued')) {
          setForegroundJobId(null)
          curFg = null
        }
      }

      const isForegroundBusyForOther = (jobId: string) =>
        isSubmittingNow || (Boolean(curFg) && curFg !== jobId)

      let previewUpdated = false
      for (const finished of finishedJobs) {
        const wasForeground = finished.id === liveState.foregroundJobId
        if (wasForeground || !isForegroundBusyForOther(finished.id)) {
          setPreviewUrl(finished.imageUrl)
          setGenerationError('')
          previewUpdated = true
          toast.success(
            wasForeground
              ? '云端角色作品已生成并保存到作品集'
              : '后台绘制完成！已自动展示并保存到云端作品集'
          )
        } else {
          toast.success(`后台作品「${finished.recipeSummary}」已绘制完成，可在云端作品集查看`)
        }
      }

      for (const failed of failedJobs) {
        const wasForeground = failed.id === liveState.foregroundJobId
        const msg = failed.errorMessage || '生成失败，积分已全额退还'
        if (wasForeground || !isForegroundBusyForOther(failed.id)) {
          setGenerationError(msg, {
            providerId: failed.provider,
            profileId: failed.profileId ?? null,
          })
          toast.error(msg.split('\n')[0])
        } else {
          toast.error(`后台任务「${failed.recipeSummary}」生成失败（已退积分）：${msg.split('\n')[0]}`)
        }
      }

      for (const cancelled of cancelledJobs) {
        if (cancelled.id === liveState.foregroundJobId) {
          bootPreviewInitializedRef.current = true
          setPreviewUrl('')
          setGenerationError('')
        }
        toast.info(
          cancelled.creditsRefunded > 0
            ? `任务「${cancelled.recipeSummary}」已取消排队，退还 ${cancelled.creditsRefunded} 积分`
            : `任务「${cancelled.recipeSummary}」已取消排队`
        )
      }

      if (!previewUpdated && finishedJobs.length === 0) {
        const allowInitialBackfill =
          !bootPreviewInitializedRef.current && !curFg && !isSubmittingNow
        if (allowInitialBackfill) {
          bootPreviewInitializedRef.current = true
        }
        setPreviewUrl((prev) => {
          if (prev && res.items.some((x) => x.imageUrl === prev)) return prev
          if (allowInitialBackfill) {
            return res.items.find((x) => x.status === 'succeeded' && x.imageUrl)?.imageUrl || ''
          }
          return ''
        })
      }
    } catch {
      // ignore if logged out
    }
  }, [
    setForegroundJobId,
    setGenerationError,
    setHistory,
    setPreviewUrl,
    setUser,
  ])

  const refreshBootstrap = useCallback(async () => {
    lastBootstrapAtRef.current = Date.now()
    try {
      const data = await fetchBootstrap()
      setUser(data.user)
      setPlatform(data.platform)
      setProviders(data.providers)
      setWechatLogin(data.wechatLogin ?? DEFAULT_WECHAT_LOGIN_INFO)
      setProvidersLoaded(true)

      const validStyleIds = new Set(getEffectiveStyleCatalog(data.platform).map((s) => s.id))
      const isValidStyle = (id: string | undefined) => id === 'none' || (Boolean(id) && validStyleIds.has(id!))

      if (!localStorage.getItem(PREFS_KEY)) {
        if (isValidStyle(data.platform.defaultStylePreset)) {
          setStylePreset(data.platform.defaultStylePreset)
        }
        const firstReady = data.providers.find((p) => p.enabled && p.configured)
        if (firstReady) {
          setSelectedProvider(firstReady.providerId)
        }
      } else {
        const curStyle = useStudioStore.getState().stylePreset
        if (!isValidStyle(curStyle)) {
          setStylePreset(
            isValidStyle(data.platform.defaultStylePreset) ? data.platform.defaultStylePreset : 'none'
          )
        }
        // 如果当前选中的画师已下线或未配置，自动切换到可用画师
        const cur = useStudioStore.getState().selectedProvider
        const curMeta = data.providers.find((p) => p.providerId === cur)
        if (!curMeta || !curMeta.enabled || !curMeta.configured) {
          const fallback =
            data.providers.find((p) => p.enabled && p.configured) ||
            data.providers.find((p) => p.enabled)
          if (fallback) setSelectedProvider(fallback.providerId)
        }
      }

      // 对每个画师已保存的模型档位与分辨率做有效性与回退校准
      const curState = useStudioStore.getState()
      const nextProfiles: Partial<Record<ImageProviderId, string>> = {}
      const nextResolutions: Record<string, StudioResolution> = {}
      for (const pInfo of data.providers) {
        const resolvedProfile = resolveActiveProviderProfile(
          pInfo,
          curState.selectedProfileByProvider[pInfo.providerId]
        )
        if (resolvedProfile) {
          nextProfiles[pInfo.providerId] = resolvedProfile.profileId
          for (const modelOpt of pInfo.models) {
            const res = resolveActiveProfileResolution(
              modelOpt,
              curState.selectedResolutionByProfile[modelOpt.profileId]
            )
            if (res) nextResolutions[modelOpt.profileId] = res
          }
        }
      }
      setSelectedProfileByProviderState(nextProfiles)
      setSelectedResolutionByProfileState(nextResolutions)

      if (data.user) {
        await refreshHistory()
      } else {
        setHistory([])
      }
    } catch {
      // ignore network blip on boot
    } finally {
      setBootstrapLoaded(true)
    }
  }, [
    refreshHistory,
    setBootstrapLoaded,
    setHistory,
    setPlatform,
    setProviders,
    setProvidersLoaded,
    setSelectedProfileByProviderState,
    setSelectedProvider,
    setSelectedResolutionByProfileState,
    setStylePreset,
    setUser,
    setWechatLogin,
  ])

  const refreshBootstrapIfStale = useCallback(
    (maxAgeMs = 8000) => {
      if (Date.now() - lastBootstrapAtRef.current >= maxAgeMs) {
        void refreshBootstrap()
      }
    },
    [refreshBootstrap]
  )

  useEffect(() => {
    void refreshBootstrap()
  }, [refreshBootstrap])

  // 处理微信 OAuth 回调重定向回前端后的状态提示并清理 URL 参数
  const wxCallbackHandledRef = useRef(false)
  useEffect(() => {
    if (wxCallbackHandledRef.current || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const wxStatus = url.searchParams.get('wx_status')
    if (!wxStatus) return
    wxCallbackHandledRef.current = true
    const wxCredits = Number(url.searchParams.get('wx_credits') || '0')
    const wxMessage = url.searchParams.get('wx_message') || ''
    url.searchParams.delete('wx_status')
    url.searchParams.delete('wx_credits')
    url.searchParams.delete('wx_message')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)

    const timer = window.setTimeout(() => {
      if (wxStatus === 'login') {
        toast.success('微信登录成功，欢迎回来！')
      } else if (wxStatus === 'registered') {
        toast.success(
          wxCredits > 0
            ? `微信注册成功！已赠送 ${wxCredits} 积分`
            : '微信注册成功！'
        )
      } else if (wxStatus === 'bound') {
        toast.success('微信账号已成功绑定')
        setAccountModalTab('security')
        setAccountModalOpen(true)
      } else if (wxStatus === 'cancelled') {
        toast.info(wxMessage || '已取消微信授权')
      } else if (wxStatus === 'error') {
        toast.error(wxMessage || '微信登录失败，请重试')
      }
    }, 80)

    return () => window.clearTimeout(timer)
  }, [setAccountModalOpen, setAccountModalTab])

  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return
      refreshBootstrapIfStale(10_000)
      if (useStudioStore.getState().user && !isSubmittingRef.current) {
        void refreshHistory()
      }
    }
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  }, [refreshBootstrapIfStale, refreshHistory])

  // 本地草稿配方恢复（含未登录时上传的本地图片）
  useEffect(() => {
    let active = true
    idbRead<RecipeState>(RECIPE_KEY)
      .then((savedRecipe) => {
        if (!active) return
        if (savedRecipe) {
          if (savedRecipe.pose?.useDepth !== undefined) {
            setPoseDepthModeState(Boolean(savedRecipe.pose.useDepth))
          }
          setRecipe({
            portrait: savedRecipe.portrait ?? null,
            costume: savedRecipe.costume ?? null,
            pose: savedRecipe.pose ?? null,
            extraImages: Array.isArray(savedRecipe.extraImages) ? savedRecipe.extraImages : [],
          })
        }
        setIdbHydrated(true)
      })
      .catch(() => {
        if (active) setIdbHydrated(true)
      })
    return () => {
      active = false
    }
  }, [setIdbHydrated, setPoseDepthModeState, setRecipe])

  useEffect(() => {
    if (!idbHydrated) return
    void idbWrite(RECIPE_KEY, recipe).catch(() => {})
    try {
      localStorage.setItem(RECIPE_KEY, JSON.stringify(recipeBackup(recipe)))
    } catch {}
  }, [recipe, idbHydrated])

  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          selectedProvider,
          selectedProfileByProvider,
          selectedResolutionByProfile,
          stylePreset,
          allowFaceStyleShift,
          poseAdaptOverride,
          aspectRatio,
          poseFrontOnly,
          sceneNote,
          textToImageMode,
        })
      )
    } catch {}
  }, [
    selectedProvider,
    selectedProfileByProvider,
    selectedResolutionByProfile,
    stylePreset,
    allowFaceStyleShift,
    poseAdaptOverride,
    aspectRatio,
    poseFrontOnly,
    sceneNote,
    textToImageMode,
  ])

  // 轮询未完成的云端任务（queued 排队位次/晋升 + processing 后台或重连任务）
  const hasActiveCloudJobs = history.some(
    (item) => item.status === 'processing' || item.status === 'queued'
  )
  useEffect(() => {
    if (!user || !hasActiveCloudJobs) return
    const timer = window.setInterval(() => {
      void refreshHistory()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [user, hasActiveCloudJobs, refreshHistory])

  useEffect(() => {
    const streams = activeStreamsRef.current
    return () => {
      for (const ctrl of streams.values()) {
        ctrl.abort()
      }
      streams.clear()
    }
  }, [])

  const openAuthModal = useCallback(
    (tab: AuthModalTab = 'login') => {
      setAuthModalTab(tab)
      setAuthModalOpen(true)
      refreshBootstrapIfStale(0)
    },
    [refreshBootstrapIfStale, setAuthModalOpen, setAuthModalTab]
  )
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), [setAuthModalOpen])
  const openAccountModal = useCallback(
    (tab: AccountModalTab = 'overview') => {
      setAccountModalTab(tab)
      setAccountModalOpen(true)
    },
    [setAccountModalOpen, setAccountModalTab]
  )
  const closeAccountModal = useCallback(() => setAccountModalOpen(false), [setAccountModalOpen])

  const login = useCallback(
    async (account: string, password: string) => {
      const res = await loginApi({ account, password })
      setUser(res.user)
      setAuthModalOpen(false)
      await refreshHistory()
      return res.user
    },
    [refreshHistory, setAuthModalOpen, setUser]
  )

  const register = useCallback(
    async (payload: {
      username: string
      email?: string
      displayName?: string
      password: string
    }) => {
      const res = await registerApi(payload)
      setUser(res.user)
      setAuthModalOpen(false)
      await refreshHistory()
      return res.user
    },
    [refreshHistory, setAuthModalOpen, setUser]
  )

  const logout = useCallback(async () => {
    await logoutApi()
    for (const ctrl of activeStreamsRef.current.values()) {
      ctrl.abort()
    }
    activeStreamsRef.current.clear()
    pendingSubmitAbortRef.current = null
    pendingSubmitTokenRef.current = null
    isSubmittingRef.current = false
    bootAutoFocusDoneRef.current = false
    bootPreviewInitializedRef.current = false
    prevActiveStatusRef.current.clear()
    sseActiveJobIdsRef.current.clear()
    sseLiveProgressRef.current.clear()
    setIsSubmitting(false)
    setSubmittingMeta(null, null)
    setSubmittingProgress(null)
    setForegroundJobId(null)
    setUser(null)
    setHistory([])
    setPreviewUrl('')
    setGenerationError('')
    setAccountModalOpen(false)
    await refreshBootstrap()
  }, [
    refreshBootstrap,
    setAccountModalOpen,
    setForegroundJobId,
    setGenerationError,
    setHistory,
    setIsSubmitting,
    setPreviewUrl,
    setSubmittingMeta,
    setSubmittingProgress,
    setUser,
  ])

  const unbindWechat = useCallback(async () => {
    const res = await unbindWechatApi()
    setUser(res.user)
    return res.user
  }, [setUser])

  const redeemCode = useCallback(
    async (code: string) => {
      const res = await redeemCodeApi(code)
      setUser((prev) => (prev ? { ...prev, creditBalance: res.creditBalance } : prev))
      return res
    },
    [setUser]
  )

  const setPortrait = useCallback(
    (portrait: PortraitItem | null) => {
      setRecipe((r) => ({ ...r, portrait }))
    },
    [setRecipe]
  )
  const setCostume = useCallback(
    (costume: CostumeItem | null) => {
      setRecipe((r) => ({ ...r, costume }))
    },
    [setRecipe]
  )
  const setPose = useCallback(
    (pose: PoseItem | null) => {
      setRecipe((r) => ({ ...r, pose }))
    },
    [setRecipe]
  )
  const applyRecipe = useCallback(
    (next: RecipeState) => {
      setRecipe({
        portrait: next.portrait ?? null,
        costume: next.costume ?? null,
        pose: next.pose ?? null,
        extraImages: next.extraImages ? [...next.extraImages] : [],
      })
    },
    [setRecipe]
  )

  const setPoseDepthMode = useCallback(
    (val: boolean) => {
      setPoseDepthModeState(val)
      setRecipe((r) => {
        if (!r.pose || !hasPoseDepthMap(r.pose) || Boolean(r.pose.useDepth) === val) return r
        return { ...r, pose: { ...r.pose, useDepth: val } }
      })
    },
    [setPoseDepthModeState, setRecipe]
  )

  const toggleRecipePoseDepth = useCallback(() => {
    const live = useStudioStore.getState()
    if (live.recipe.pose && !hasPoseDepthMap(live.recipe.pose)) {
      toast.info('当前姿势图不提供深度图视图')
      return
    }
    const next = !(live.recipe.pose?.useDepth ?? live.poseDepthMode)
    setPoseDepthMode(next)
    toast.success(next ? '已切换姿势图为：深度图 (Depth)' : '已切换姿势图为：素体白模')
  }, [setPoseDepthMode])

  const togglePortrait = useCallback(
    (item: PortraitItem) => {
      const current = useStudioStore.getState().recipe.portrait
      const remove = current?.id === item.id
      setRecipe((r) => ({ ...r, portrait: remove ? null : item }))
      toast.success(remove ? '已移除人像' : `已选人像：${item.发型名称}`)
    },
    [setRecipe]
  )
  const toggleCostume = useCallback(
    (item: CostumeItem) => {
      const current = useStudioStore.getState().recipe.costume
      const remove =
        current?.id === item.id &&
        (current.selectedView || 'front') === (item.selectedView || 'front')
      setRecipe((r) => ({ ...r, costume: remove ? null : item }))
      toast.success(remove ? '已移除服装' : `已选服装：${item.服装名称}`)
    },
    [setRecipe]
  )
  const togglePose = useCallback(
    (item: PoseItem) => {
      const live = useStudioStore.getState()
      const useDepth = hasPoseDepthMap(item) ? (item.useDepth ?? live.poseDepthMode) : false
      const remove = live.recipe.pose?.id === item.id && Boolean(live.recipe.pose?.useDepth) === useDepth
      setRecipe((r) => ({ ...r, pose: remove ? null : { ...item, useDepth } }))
      toast.success(remove ? '已移除姿势' : `已选姿势：${item.姿势名称}（${item.角度}${useDepth ? ' · 深度图' : ''}）`)
    },
    [setRecipe]
  )

  const addExtraImage = useCallback(
    (item: { name: string; url: string; r2Key?: string }) => {
      const newImg: ExtraReferenceImage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.name || '附加参考',
        url: item.url,
        r2Key: item.r2Key,
      }
      setRecipe((r) => ({
        ...r,
        extraImages: [...(r.extraImages || []), newImg],
      }))
      toast.success('已添加附加参考图')
    },
    [setRecipe]
  )

  const removeExtraImage = useCallback(
    (id: string) => {
      setRecipe((r) => ({
        ...r,
        extraImages: (r.extraImages || []).filter((x) => x.id !== id),
      }))
    },
    [setRecipe]
  )

  const updateExtraImageName = useCallback(
    (id: string, name: string) => {
      setRecipe((r) => ({
        ...r,
        extraImages: (r.extraImages || []).map((x) => (x.id === id ? { ...x, name } : x)),
      }))
    },
    [setRecipe]
  )

  const reorderExtraImages = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return
      setRecipe((r) => {
        const list = r.extraImages || []
        const oldIdx = list.findIndex((x) => x.id === activeId)
        const newIdx = list.findIndex((x) => x.id === overId)
        if (oldIdx < 0 || newIdx < 0) return r
        return { ...r, extraImages: arrayMove(list, oldIdx, newIdx) }
      })
    },
    [setRecipe]
  )

  const clearRecipe = useCallback(() => {
    const snapshot = useStudioStore.getState().recipe
    const hasContent = Boolean(
      snapshot.portrait ||
        snapshot.costume ||
        snapshot.pose ||
        (snapshot.extraImages?.length ?? 0) > 0
    )
    if (!hasContent) {
      toast.info('配方槽已是空的')
      return
    }
    setRecipe({ portrait: null, costume: null, pose: null, extraImages: [] })
    toast.info('已清空配方', {
      duration: 4000,
      action: {
        label: '撤销',
        onClick: () => {
          setRecipe(snapshot)
        },
      },
    })
  }, [setRecipe])

  const randomizeRecipe = useCallback(
    (pools: {
      portraits?: PortraitItem[]
      costumes?: CostumeItem[]
      poses?: PoseItem[]
    }) => {
      const live = useStudioStore.getState()
      const allPoses = pools.poses || []
      const frontPosePool = live.poseFrontOnly
        ? allPoses.filter((p) => p.角度 === '正面')
        : allPoses
      const posePool = frontPosePool.length ? frontPosePool : allPoses
      const costumePool = pools.costumes || []
      const portraitPool = pools.portraits || []

      setRecipe((prev) => ({
        ...prev,
        portrait: portraitPool.length
          ? portraitPool[Math.floor(Math.random() * portraitPool.length)]
          : prev.portrait,
        costume: costumePool.length
          ? costumePool[Math.floor(Math.random() * costumePool.length)]
          : prev.costume,
        pose: (() => {
          if (!posePool.length) return prev.pose
          const picked = posePool[Math.floor(Math.random() * posePool.length)]
          return { ...picked, useDepth: hasPoseDepthMap(picked) ? live.poseDepthMode : false }
        })(),
      }))
      toast.success('已随机抽取一套角色配方')
    },
    [setRecipe]
  )

  const randomizeSlot = useCallback(
    (
      slot: ReferenceSlot,
      scope: RandomScope,
      pools: ReferencePools,
      expectedId?: string | null
    ) => {
      const live = useStudioStore.getState()
      const current = {
        recipe: live.recipe,
        poseDepthMode: live.poseDepthMode,
        poseFrontOnly: live.poseFrontOnly,
      }
      if (expectedId !== undefined && (current.recipe[slot]?.id ?? null) !== expectedId) {
        toast.info('参考已更改，本次换样已取消')
        return
      }
      const next = randomSlot(
        current.recipe,
        slot,
        scope,
        pools,
        current.poseDepthMode,
        current.poseFrontOnly
      )
      if (!next) {
        if (scope === 'similar' && current.recipe[slot]?.source === 'upload') {
          toast.info('当前为本地上传参考，请点击“换其他”从图库抽取')
        } else {
          toast.info(scope === 'similar' ? '没有其他同类素材，可点击“换其他”试试' : '没有其他可用素材')
        }
        return
      }
      setRecipe((previous) => ({ ...previous, [slot]: next[slot] }))
      const slotLabel = { portrait: '人像', costume: '服装', pose: '姿势' }[slot]
      toast.success(
        `已为${slotLabel}${scope === 'similar' ? '换同类' : '换其他'}参考，其他槽位保持不变`
      )
    },
    [setRecipe]
  )

  const pruneHistoryIds = useCallback(
    (deletedIds: Set<string>) => {
      if (deletedIds.size === 0) return
      setHistory((current) => {
        const next = current.filter((x) => !deletedIds.has(x.id))
        setPreviewUrl((prev) => {
          const removedActive = current.some((x) => deletedIds.has(x.id) && x.imageUrl === prev)
          if (removedActive) {
            return next.find((x) => x.status === 'succeeded' && x.imageUrl)?.imageUrl || ''
          }
          return prev
        })
        return next
      })
    },
    [setHistory, setPreviewUrl]
  )

  const removeHistoryItem = useCallback(
    async (id: string) => {
      try {
        await deleteGenerationApi(id)
        pruneHistoryIds(new Set([id]))
        toast.success('已删除该条生成记录')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '删除失败')
      }
    },
    [pruneHistoryIds]
  )

  const removeHistoryItems = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      const deleted = new Set<string>()
      let failCount = 0
      for (const id of ids) {
        try {
          await deleteGenerationApi(id)
          deleted.add(id)
        } catch {
          failCount += 1
        }
      }
      pruneHistoryIds(deleted)
      if (deleted.size > 0 && failCount === 0) {
        toast.success(`已批量删除 ${deleted.size} 条记录`)
      } else if (deleted.size > 0) {
        toast.info(`已删除 ${deleted.size} 条记录，另有 ${failCount} 条删除失败`)
      } else {
        toast.error('批量删除失败，请稍后重试')
      }
    },
    [pruneHistoryIds]
  )

  const ensureRecipeImagesUploaded = useCallback(
    async (currentRecipe: RecipeState): Promise<RecipeState> => {
      const next = structuredClone(currentRecipe)
      let changed = false

      if (next.portrait?.source === 'upload' && !next.portrait.r2Key && next.portrait.原图.startsWith('data:')) {
        const uploaded = await uploadReferenceFileApi({
          file: dataUrlToBlob(next.portrait.原图),
          filename: `${next.portrait.发型名称 || 'portrait'}.png`,
          purpose: 'portrait',
          width: next.portrait.宽,
          height: next.portrait.高,
        })
        next.portrait.r2Key = uploaded.r2Key
        next.portrait.原图 = uploaded.url
        next.portrait.缩略图 = uploaded.url
        changed = true
      }

      if (next.costume?.source === 'upload' && !next.costume.r2Key && next.costume.原图.startsWith('data:')) {
        const uploaded = await uploadReferenceFileApi({
          file: dataUrlToBlob(next.costume.原图),
          filename: `${next.costume.服装名称 || 'costume'}.png`,
          purpose: 'costume',
        })
        next.costume.r2Key = uploaded.r2Key
        next.costume.原图 = uploaded.url
        next.costume.预览图 = uploaded.url
        next.costume.缩略图 = uploaded.url
        changed = true
      }

      if (next.pose?.source === 'upload' && !next.pose.r2Key && next.pose.原图.startsWith('data:')) {
        const uploaded = await uploadReferenceFileApi({
          file: dataUrlToBlob(next.pose.原图),
          filename: `${next.pose.姿势名称 || 'pose'}.png`,
          purpose: 'pose',
        })
        next.pose.r2Key = uploaded.r2Key
        next.pose.原图 = uploaded.url
        next.pose.缩略图 = uploaded.url
        changed = true
      }

      for (const extra of next.extraImages || []) {
        if (!extra.r2Key && extra.url.startsWith('data:')) {
          const uploaded = await uploadReferenceFileApi({
            file: dataUrlToBlob(extra.url),
            filename: `${extra.name || 'extra'}.png`,
            purpose: 'extra',
          })
          extra.r2Key = uploaded.r2Key
          extra.url = uploaded.url
          changed = true
        }
      }

      if (changed) {
        setRecipe(next)
      }
      return next
    },
    [setRecipe]
  )

  const sendForegroundToBackground = useCallback(() => {
    bootPreviewInitializedRef.current = true
    setForegroundJobId(null)
    setPreviewUrl('')
    setGenerationError('')
  }, [setForegroundJobId, setGenerationError, setPreviewUrl])

  const focusJobInMonitor = useCallback(
    (jobId: string) => {
      bootPreviewInitializedRef.current = true
      setGenerationError('')
      setForegroundJobId(jobId)
    },
    [setForegroundJobId, setGenerationError]
  )

  const cancelQueuedJob = useCallback(
    async (jobId: string): Promise<boolean> => {
      if (useStudioStore.getState().cancellingJobIds[jobId]) return false
      setCancellingJobId(jobId, true)
      try {
        const res = await cancelQueuedGenerationApi(jobId)
        prevActiveStatusRef.current.delete(jobId)
        sseActiveJobIdsRef.current.delete(jobId)
        sseLiveProgressRef.current.delete(jobId)
        setUser((prev) => (prev ? { ...prev, creditBalance: res.creditBalance } : prev))
        if (res.job) {
          setHistory((prev) => prev.map((x) => (x.id === jobId ? res.job! : x)))
        }
        if (useStudioStore.getState().foregroundJobId === jobId) {
          bootPreviewInitializedRef.current = true
          setForegroundJobId(null)
          setPreviewUrl('')
          setGenerationError('')
        }
        toast.success(
          res.refunded > 0
            ? `已取消排队，已全额退还 ${res.refunded} 积分`
            : '已取消排队任务'
        )
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : '取消排队失败，请刷新状态'
        toast.error(msg)
        void refreshHistory()
        return false
      } finally {
        setCancellingJobId(jobId, false)
      }
    },
    [refreshHistory, setCancellingJobId, setForegroundJobId, setGenerationError, setHistory, setPreviewUrl, setUser]
  )

  const cancelGeneration = useCallback(() => {
    bootPreviewInitializedRef.current = true
    setPreviewUrl('')
    setGenerationError('')
    const controller = pendingSubmitAbortRef.current
    if (!controller) return
    controller.abort()
  }, [setGenerationError, setPreviewUrl])

  const runGenerationTask = useCallback(
    async (params: {
      providerId: ImageProviderId
      activeProfile: ProviderModelPublicInfo | null
      activeResolution: StudioResolution | null
      activeCost: number
      stylePreset: string
      allowFaceStyleShift: boolean
      allowPoseStyleShift: boolean
      aspectRatio: StudioAspectRatio
      sceneNote: string
      recipe: RecipeState
      providerMeta: ProviderPublicInfo
      mode: 'regular' | 'text_fallback'
    }) => {
      const isTextFallback = params.mode === 'text_fallback'
      const clientStartedAt = Date.now()
      const localToken = crypto.randomUUID()
      let maxPercent = isTextFallback ? 8 : 5
      let activeJobId: string | null = null
      let uploadedRecipe = params.recipe

      const controller = new AbortController()
      activeStreamsRef.current.set(localToken, controller)
      pendingSubmitTokenRef.current = localToken
      pendingSubmitAbortRef.current = controller

      isSubmittingRef.current = true
      bootPreviewInitializedRef.current = true
      setIsSubmitting(true)
      setSubmittingMeta(params.providerId, params.activeProfile?.profileId ?? null)
      setGenerationError('')
      setSubmittingProgress(
        isTextFallback
          ? {
              stage: 'transcribing_refs',
              message: '正在将参考图转为文字描述…',
              startedAt: clientStartedAt,
              stageStartedAt: clientStartedAt,
              percent: 8,
            }
          : {
              stage: 'uploading',
              message: '正在准备参考素材…',
              startedAt: clientStartedAt,
              stageStartedAt: clientStartedAt,
              percent: 5,
            }
      )

      const releaseSubmitSlotIfOwner = () => {
        if (pendingSubmitTokenRef.current !== localToken) return
        pendingSubmitTokenRef.current = null
        pendingSubmitAbortRef.current = null
        isSubmittingRef.current = false
        setIsSubmitting(false)
        setSubmittingMeta(null, null)
        setSubmittingProgress(null)
      }

      const summaryFallback =
        [
          params.recipe.pose?.姿势名称,
          params.recipe.costume?.服装名称,
          params.recipe.portrait?.发型名称,
        ]
          .filter(Boolean)
          .join(' + ') || '自定义合成'

      try {
        uploadedRecipe = await ensureRecipeImagesUploaded(params.recipe)

        const refImageCount =
          (uploadedRecipe.pose ? 1 : 0) +
          (uploadedRecipe.costume ? 1 : 0) +
          (uploadedRecipe.portrait ? 1 : 0) +
          (uploadedRecipe.extraImages?.length || 0)

        let stitchedR2Key: string | undefined
        const livePlatform = useStudioStore.getState().platform
        if (
          !isTextFallback &&
          (livePlatform.sendStitchedSheet || (refImageCount >= 2 && params.activeProfile?.needsStitchedSheet))
        ) {
          const stitchedDataUrl = await stitchRecipeCanvas(uploadedRecipe, {
            sanitizeForCloud: true,
          })
          const stitchedRes = await uploadReferenceFileApi({
            file: dataUrlToBlob(stitchedDataUrl),
            filename: 'stitched.jpg',
            purpose: 'stitched',
          })
          stitchedR2Key = stitchedRes.r2Key
        }

        if (controller.signal.aborted) {
          releaseSubmitSlotIfOwner()
          bootPreviewInitializedRef.current = true
          setPreviewUrl('')
          setGenerationError('')
          toast.info('已取消生成请求')
          return
        }

        const pendingSummary =
          [
            uploadedRecipe.pose?.姿势名称,
            uploadedRecipe.costume?.服装名称,
            uploadedRecipe.portrait?.发型名称,
          ]
            .filter(Boolean)
            .join(' + ') || summaryFallback

        const result = await startGenerationStreamApi(
          {
            idempotencyKey: crypto.randomUUID(),
            provider: params.providerId,
            modelProfileId: params.activeProfile?.profileId,
            resolution: params.activeResolution ?? undefined,
            stylePreset: params.stylePreset,
            allowFaceStyleShift: params.allowFaceStyleShift,
            allowPoseStyleShift: params.allowPoseStyleShift,
            aspectRatio: params.aspectRatio,
            sceneNote: params.sceneNote,
            recipe: uploadedRecipe,
            ...(stitchedR2Key ? { stitchedR2Key } : {}),
            ...(isTextFallback ? { textFallbackOnly: true } : {}),
          },
          {
            signal: controller.signal,
            onProgress: (p) => {
              maxPercent = Math.max(maxPercent, typeof p.percent === 'number' ? p.percent : maxPercent)
              const normalized: StreamGenerationProgress = {
                ...p,
                startedAt: clientStartedAt,
                stageStartedAt: p.stageStartedAt ?? Date.now(),
                percent: maxPercent,
              }
              if (typeof normalized.creditBalance === 'number') {
                const nextBal = normalized.creditBalance
                setUser((prev) => (prev ? { ...prev, creditBalance: nextBal } : prev))
              }
              if (normalized.jobId) {
                const firstAttachment = activeJobId === null
                activeJobId = normalized.jobId
                sseActiveJobIdsRef.current.add(normalized.jobId)
                sseLiveProgressRef.current.set(normalized.jobId, normalized)
                prevActiveStatusRef.current.set(normalized.jobId, 'processing')

                if (firstAttachment) {
                  releaseSubmitSlotIfOwner()
                  bootPreviewInitializedRef.current = true
                  setForegroundJobId(normalized.jobId)
                }

                setHistory((prev) => {
                  const idx = prev.findIndex((item) => item.id === normalized.jobId)
                  if (idx >= 0) {
                    const next = [...prev]
                    next[idx] = { ...next[idx], liveProgress: normalized }
                    return next
                  }
                  const placeholder: GenerationHistoryItem = {
                    id: normalized.jobId!,
                    createdAt: clientStartedAt,
                    startedAt: clientStartedAt,
                    status: 'processing',
                    creditsCost: params.activeCost,
                    creditsRefunded: 0,
                    provider: params.providerId,
                    profileId: params.activeProfile?.profileId ?? null,
                    profileName: params.activeProfile?.displayName ?? null,
                    resolution: params.activeResolution,
                    model: params.activeProfile
                      ? `${params.providerMeta.artist.name} · ${params.activeProfile.displayName}`
                      : params.providerMeta.artist.name,
                    prompt: '',
                    aspectRatio: params.aspectRatio,
                    stylePreset: params.stylePreset,
                    imageUrl: '',
                    recipeSummary: pendingSummary,
                    liveProgress: normalized,
                  }
                  return [placeholder, ...prev]
                })
              } else if (pendingSubmitTokenRef.current === localToken) {
                setSubmittingProgress(normalized)
              }
            },
          }
        )

        if (result.kind === 'queued') {
          activeJobId = result.job.id
          releaseSubmitSlotIfOwner()
          bootAutoFocusDoneRef.current = true
          bootPreviewInitializedRef.current = true
          prevActiveStatusRef.current.set(result.job.id, 'queued')
          setUser((prev) => (prev ? { ...prev, creditBalance: result.creditBalance } : prev))
          setHistory((prev) => [result.job, ...prev.filter((x) => x.id !== result.job.id)])
          setForegroundJobId(result.job.id)
          toast.info(
            `已进入排队：第 ${result.queueInfo.position} 位（前面还有 ${result.queueInfo.aheadCount} 个任务）`
          )
          return
        }

        // 直通任务 SSE 完成
        activeJobId = result.job.id
        sseActiveJobIdsRef.current.delete(result.job.id)
        sseLiveProgressRef.current.delete(result.job.id)
        prevActiveStatusRef.current.delete(result.job.id)
        releaseSubmitSlotIfOwner()
        setUser((prev) => (prev ? { ...prev, creditBalance: result.creditBalance } : prev))
        setHistory((prev) => [result.job, ...prev.filter((x) => x.id !== result.job.id)])

        const live = useStudioStore.getState()
        const isMyForeground = live.foregroundJobId === result.job.id
        const isForegroundBusy =
          live.isSubmitting || (Boolean(live.foregroundJobId) && !isMyForeground)

        if (isMyForeground) {
          setForegroundJobId(null)
          setGenerationError('')
          setPreviewUrl(result.job.imageUrl)
          toast.success('角色作品已生成并保存到云端作品集')
        } else if (!isForegroundBusy) {
          setGenerationError('')
          setPreviewUrl(result.job.imageUrl)
          toast.success('后台绘制完成！已自动展示并保存到云端作品集')
        } else {
          toast.success(`后台作品「${result.job.recipeSummary}」已绘制完成，可在云端作品集查看`)
        }
      } catch (e) {
        releaseSubmitSlotIfOwner()

        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          bootPreviewInitializedRef.current = true
          if (activeJobId) {
            sseActiveJobIdsRef.current.delete(activeJobId)
            sseLiveProgressRef.current.delete(activeJobId)
            if (useStudioStore.getState().foregroundJobId === activeJobId) {
              setForegroundJobId(null)
              setPreviewUrl('')
              setGenerationError('')
            }
            toast.info('已转为后台处理；完成后会自动同步到云端作品集')
            void refreshHistory()
          } else {
            setPreviewUrl('')
            setGenerationError('')
            toast.info('已取消生成请求')
          }
          return
        }

        if (activeJobId && !(e instanceof ApiError)) {
          try {
            const latest = await fetchGenerationByIdApi(activeJobId)
            if (latest.job.status === 'processing' || latest.job.status === 'queued') {
              sseActiveJobIdsRef.current.delete(activeJobId)
              prevActiveStatusRef.current.set(latest.job.id, latest.job.status)
              setHistory((prev) => [latest.job, ...prev.filter((x) => x.id !== latest.job.id)])
              toast.info('连接短暂中断，云端仍在继续处理并自动同步进度')
              return
            }
            if (latest.job.status === 'succeeded' && latest.job.imageUrl) {
              sseActiveJobIdsRef.current.delete(latest.job.id)
              sseLiveProgressRef.current.delete(latest.job.id)
              prevActiveStatusRef.current.delete(latest.job.id)
              setHistory((prev) => [latest.job, ...prev.filter((x) => x.id !== latest.job.id)])
              const live = useStudioStore.getState()
              const isMyForeground = live.foregroundJobId === latest.job.id
              const isForegroundBusy =
                live.isSubmitting || (Boolean(live.foregroundJobId) && !isMyForeground)
              if (isMyForeground || !isForegroundBusy) {
                if (isMyForeground) setForegroundJobId(null)
                setGenerationError('')
                setPreviewUrl(latest.job.imageUrl)
                toast.success(
                  isMyForeground
                    ? '角色作品已在云端生成并保存'
                    : '后台绘制完成！已自动展示并保存到云端作品集'
                )
              } else {
                toast.success(`后台作品「${latest.job.recipeSummary}」已绘制完成`)
              }
              void refreshHistory()
              return
            }
            if (latest.job.status === 'failed') {
              sseActiveJobIdsRef.current.delete(latest.job.id)
              sseLiveProgressRef.current.delete(latest.job.id)
              prevActiveStatusRef.current.delete(latest.job.id)
              const live = useStudioStore.getState()
              const isMyForeground = live.foregroundJobId === latest.job.id
              const isForegroundBusy =
                live.isSubmitting || (Boolean(live.foregroundJobId) && !isMyForeground)
              if (isMyForeground) setForegroundJobId(null)
              const failMsg = latest.job.errorMessage || '生成失败，积分已全额退还'
              if (isMyForeground || !isForegroundBusy) {
                setGenerationError(failMsg, {
                  providerId: params.providerId,
                  profileId: params.activeProfile?.profileId ?? null,
                })
                toast.error(failMsg.split('\n')[0])
              } else {
                toast.error(`后台任务生成失败（已退积分）：${failMsg.split('\n')[0]}`)
              }
              void refreshHistory()
              return
            }
          } catch {
            // fall through to normal error handling
          }
        }

        const resolvedErrorJobId = e instanceof ApiError ? e.jobId || activeJobId : activeJobId
        if (resolvedErrorJobId) {
          sseActiveJobIdsRef.current.delete(resolvedErrorJobId)
          sseLiveProgressRef.current.delete(resolvedErrorJobId)
          prevActiveStatusRef.current.delete(resolvedErrorJobId)
        }

        if (e instanceof ApiError && e.status === 401) {
          setUser(null)
          openAuthModal('login')
        } else if (e instanceof ApiError && e.code === 'INSUFFICIENT_CREDITS') {
          openAccountModal('redeem')
        }

        const msg = e instanceof Error ? e.message : '生成失败，请稍后重试'
        const live = useStudioStore.getState()
        const isMyForeground =
          resolvedErrorJobId ? live.foregroundJobId === resolvedErrorJobId : !live.foregroundJobId
        const isForegroundBusy =
          live.isSubmitting ||
          (Boolean(live.foregroundJobId) && live.foregroundJobId !== resolvedErrorJobId)

        if (resolvedErrorJobId && live.foregroundJobId === resolvedErrorJobId) {
          setForegroundJobId(null)
        }

        if (isMyForeground || !isForegroundBusy) {
          setGenerationError(msg, {
            providerId: params.providerId,
            profileId: params.activeProfile?.profileId ?? null,
          })
          toast.error(msg.split('\n')[0])
        } else {
          toast.error(`后台任务失败：${msg.split('\n')[0]}`)
        }
        void refreshHistory()
      } finally {
        activeStreamsRef.current.delete(localToken)
        if (activeJobId) {
          sseActiveJobIdsRef.current.delete(activeJobId)
        }
        releaseSubmitSlotIfOwner()
      }
    },
    [
      ensureRecipeImagesUploaded,
      openAccountModal,
      openAuthModal,
      refreshHistory,
      setForegroundJobId,
      setGenerationError,
      setHistory,
      setIsSubmitting,
      setPreviewUrl,
      setSubmittingMeta,
      setSubmittingProgress,
      setUser,
    ]
  )

  const startGeneration = useCallback(
    async (sceneNoteArg = '', options?: { textToImage?: boolean }) => {
      const live = useStudioStore.getState()
      if (live.idbHydrated === false || isSubmittingRef.current) {
        return
      }

      if (!live.user) {
        toast.info('请先登录或注册账号后再开始生成')
        openAuthModal('login')
        return
      }

      const qCfg = mergeGenerationQueueConfig(live.platform.queueConfig)
      const runningCount = live.history.filter((x) => x.status === 'processing').length
      const queuedCount = live.history.filter((x) => x.status === 'queued').length
      if (
        runningCount >= qCfg.maxUserConcurrency &&
        queuedCount >= qCfg.maxUserQueuedJobs
      ) {
        toast.error(
          `您当前已有 ${runningCount} 个任务绘制中、${queuedCount} 个任务排队中（已达个人队列上限），请稍候再发起新任务`
        )
        return
      }

      const providerId = live.selectedProvider
      const providerMeta = live.providers.find((p) => p.providerId === providerId)
      if (!providerMeta || !providerMeta.enabled || !providerMeta.configured) {
        toast.error('这位AI小画家外出采风啦，请轻点另一位出马！')
        return
      }

      const activeProfile = resolveActiveProviderProfile(
        providerMeta,
        live.selectedProfileByProvider[providerId]
      )
      if (providerMeta.models.length > 0 && (!activeProfile || !activeProfile.enabled || !activeProfile.configured)) {
        toast.error('这支画笔墨水耗尽啦，换支画笔或换位AI小画家试试！')
        return
      }

      const activeResolution = resolveActiveProfileResolution(
        activeProfile,
        activeProfile ? live.selectedResolutionByProfile[activeProfile.profileId] : undefined
      )
      const activeCost = activeProfile
        ? getEffectiveProfileCreditCost(activeProfile, activeResolution)
        : providerMeta.creditCost

      if (live.user.creditBalance < activeCost) {
        toast.error(`积分不足：本次需要 ${activeCost} 积分，当前剩余 ${live.user.creditBalance} 积分`)
        openAccountModal('redeem')
        return
      }

      const hasAnyRef = Boolean(
        live.recipe.portrait || live.recipe.costume || live.recipe.pose || (live.recipe.extraImages?.length ?? 0) > 0
      )
      if (!hasAnyRef) {
        toast.error('请先选择或上传至少 1 张参考图')
        return
      }

      const requestedTextMode = options?.textToImage ?? live.textToImageMode
      const featureEnabled = live.platform.textFallbackEnabled !== false
      const profileSupports =
        providerMeta.models.length === 0
          ? providerMeta.configured
          : Boolean(activeProfile?.supportsTextFallback)
      if (options?.textToImage === true && (!featureEnabled || !profileSupports)) {
        toast.error(
          !featureEnabled
            ? '当前暂未开启图转文生图功能'
            : '当前画笔暂不支持图转文纯文生图模式，请换支画笔或换位AI小画家试试'
        )
        return
      }
      const effectiveTextMode = Boolean(requestedTextMode && featureEnabled && profileSupports)

      await runGenerationTask({
        providerId,
        activeProfile,
        activeResolution,
        activeCost,
        stylePreset: live.stylePreset,
        allowFaceStyleShift: live.allowFaceStyleShift,
        allowPoseStyleShift: live.allowPoseStyleShift,
        aspectRatio: live.aspectRatio,
        sceneNote: sceneNoteArg,
        recipe: live.recipe,
        providerMeta,
        mode: effectiveTextMode ? 'text_fallback' : 'regular',
      })
    },
    [openAccountModal, openAuthModal, runGenerationTask]
  )

  const actionsValue = useMemo<StudioActionsValue>(
    () => ({
      openAuthModal,
      closeAuthModal,
      openAccountModal,
      closeAccountModal,
      refreshBootstrap,
      refreshHistory,
      login,
      register,
      logout,
      unbindWechat,
      redeemCode,
      setSelectedProvider,
      setSelectedProfileForProvider,
      setSelectedResolutionForProfile,
      setStylePreset,
      setAllowFaceStyleShift,
      setAllowPoseStyleShift,
      setAspectRatio,
      setPoseDepthMode,
      setPoseFrontOnly,
      setSceneNote,
      setTextToImageMode,
      toggleRecipePoseDepth,
      setPreviewUrl,
      sendForegroundToBackground,
      focusJobInMonitor,
      cancelQueuedJob,
      setGenerationError,
      startGeneration,
      cancelGeneration,
      setPortrait,
      setCostume,
      setPose,
      applyRecipe,
      togglePortrait,
      toggleCostume,
      togglePose,
      addExtraImage,
      removeExtraImage,
      updateExtraImageName,
      reorderExtraImages,
      clearRecipe,
      randomizeRecipe,
      randomizeSlot,
      removeHistoryItem,
      removeHistoryItems,
    }),
    [
      openAuthModal,
      closeAuthModal,
      openAccountModal,
      closeAccountModal,
      refreshBootstrap,
      refreshHistory,
      login,
      register,
      logout,
      unbindWechat,
      redeemCode,
      setSelectedProvider,
      setSelectedProfileForProvider,
      setSelectedResolutionForProfile,
      setStylePreset,
      setAllowFaceStyleShift,
      setAllowPoseStyleShift,
      setAspectRatio,
      setPoseDepthMode,
      setPoseFrontOnly,
      setSceneNote,
      setTextToImageMode,
      toggleRecipePoseDepth,
      setPreviewUrl,
      sendForegroundToBackground,
      focusJobInMonitor,
      cancelQueuedJob,
      setGenerationError,
      startGeneration,
      cancelGeneration,
      setPortrait,
      setCostume,
      setPose,
      applyRecipe,
      togglePortrait,
      toggleCostume,
      togglePose,
      addExtraImage,
      removeExtraImage,
      updateExtraImageName,
      reorderExtraImages,
      clearRecipe,
      randomizeRecipe,
      randomizeSlot,
      removeHistoryItem,
      removeHistoryItems,
    ]
  )

  const contextValue = useMemo<StudioContextValue>(
    () => ({
      user,
      bootstrapLoaded,
      providersLoaded,
      platform,
      providers,
      wechatLogin,
      hydrated: idbHydrated,
      recipe,
      selectedProvider,
      selectedProfileByProvider,
      selectedResolutionByProfile,
      stylePreset,
      allowFaceStyleShift,
      allowPoseStyleShift,
      aspectRatio,
      history,
      poseDepthMode,
      poseFrontOnly,
      sceneNote,
      textToImageMode,
      previewUrl,
      isSubmitting,
      submittingProvider,
      submittingProfileId,
      submittingProgress,
      foregroundJobId,
      cancellingJobIds,
      generationError,
      failedGenerationMeta,
      authModalOpen,
      authModalTab,
      accountModalOpen,
      accountModalTab,
      ...actionsValue,
    }),
    [
      user,
      bootstrapLoaded,
      providersLoaded,
      platform,
      providers,
      wechatLogin,
      idbHydrated,
      recipe,
      selectedProvider,
      selectedProfileByProvider,
      selectedResolutionByProfile,
      stylePreset,
      allowFaceStyleShift,
      allowPoseStyleShift,
      aspectRatio,
      history,
      poseDepthMode,
      poseFrontOnly,
      sceneNote,
      textToImageMode,
      previewUrl,
      isSubmitting,
      submittingProvider,
      submittingProfileId,
      submittingProgress,
      foregroundJobId,
      cancellingJobIds,
      generationError,
      failedGenerationMeta,
      authModalOpen,
      authModalTab,
      accountModalOpen,
      accountModalTab,
      actionsValue,
    ]
  )

  return (
    <StudioActionsContext.Provider value={actionsValue}>
      <StudioContext.Provider value={contextValue}>
        {children}
      </StudioContext.Provider>
    </StudioActionsContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}

// oxlint-disable-next-line react/only-export-components
export function useStudioActions() {
  const ctx = useContext(StudioActionsContext)
  if (!ctx) throw new Error('useStudioActions must be used within StudioProvider')
  return ctx
}

// oxlint-disable-next-line react/only-export-components
export function useStudioShallow<T>(selector: (state: StudioZustandStore) => T): T {
  return useStudioStore(useShallow(selector))
}
