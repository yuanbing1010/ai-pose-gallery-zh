import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from '@/lib/notifications'
import { isNsfwCostume, isNsfwPose } from '@/api/gallery'
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
import { idbRead, idbWrite } from '@/lib/idbStorage'
import { recipeBackup } from '@/lib/recipeImages'
import { randomSlot, type RandomScope, type ReferencePools, type ReferenceSlot } from '@/lib/randomRecipe'
import {
  ApiError,
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
} from '../../shared/studio'
import type {
  CostumeItem,
  ExtraReferenceImage,
  GenerationHistoryItem,
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
const SAFE_MODE_KEY = 'pose_atlas_safe_mode_user_v2'

export type AuthModalTab = 'login' | 'register'
export type AccountModalTab = 'overview' | 'redeem' | 'ledger' | 'security'

interface ClientPrefs {
  selectedProvider: ImageProviderId
  selectedProfileByProvider: Partial<Record<ImageProviderId, string>>
  selectedResolutionByProfile: Record<string, StudioResolution>
  stylePreset: string
  allowFaceStyleShift: boolean
  aspectRatio: StudioAspectRatio
  poseFrontOnly: boolean
  sceneNote: string
}

const DEFAULT_PREFS: ClientPrefs = {
  selectedProvider: 'gpt',
  selectedProfileByProvider: {},
  selectedResolutionByProfile: {},
  stylePreset: 'none',
  allowFaceStyleShift: false,
  aspectRatio: '3:4',
  poseFrontOnly: true,
  sceneNote: '',
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
    if (typeof v === 'string' && (v === '1K' || v === '2K' || v === '4K')) {
      out[k] = v
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

const initialSafeMode = (): boolean => {
  try {
    const raw = localStorage.getItem(SAFE_MODE_KEY)
    return raw === null ? true : raw !== 'false'
  } catch {
    return true
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
  aspectRatio: StudioAspectRatio
  history: GenerationHistoryItem[]
  safeMode: boolean
  poseDepthMode: boolean
  poseFrontOnly: boolean
  sceneNote: string
  previewUrl: string
  isGenerating: boolean
  generatingProvider: ImageProviderId | null
  generatingProfileId: string | null
  generationProgress: StreamGenerationProgress | null
  generationError: string
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
  setAspectRatio: (val: StudioAspectRatio) => void
  setHistory: (updater: Updater<GenerationHistoryItem[]>) => void
  setSafeMode: (updater: Updater<boolean>) => void
  setPoseDepthModeState: (updater: Updater<boolean>) => void
  setPoseFrontOnly: (updater: Updater<boolean>) => void
  setSceneNote: (updater: Updater<string>) => void
  setPreviewUrl: (updater: Updater<string>) => void
  setIsGenerating: (val: boolean) => void
  setGeneratingMeta: (provider: ImageProviderId | null, profileId: string | null) => void
  setGenerationProgress: (val: StreamGenerationProgress | null) => void
  setGenerationError: (val: string) => void
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
    aspectRatio: prefs.aspectRatio,
    history: [],
    safeMode: initialSafeMode(),
    poseDepthMode: Boolean(rec.pose?.useDepth),
    poseFrontOnly: prefs.poseFrontOnly,
    sceneNote: prefs.sceneNote,
    previewUrl: '',
    isGenerating: false,
    generatingProvider: null,
    generatingProfileId: null,
    generationProgress: null,
    generationError: '',
    idbHydrated: false,
    authModalOpen: false,
    authModalTab: 'login',
    accountModalOpen: false,
    accountModalTab: 'overview',
    setUser: (updater) =>
      set((s) => ({ user: typeof updater === 'function' ? updater(s.user) : updater })),
    setBootstrapLoaded: (bootstrapLoaded) => set({ bootstrapLoaded }),
    setProvidersLoaded: (providersLoaded) => set({ providersLoaded }),
    setPlatform: (platform) => set({ platform }),
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
    setStylePreset: (stylePreset) => set({ stylePreset }),
    setAllowFaceStyleShift: (updater) =>
      set((s) => ({
        allowFaceStyleShift:
          typeof updater === 'function' ? updater(s.allowFaceStyleShift) : updater,
      })),
    setAspectRatio: (aspectRatio) => set({ aspectRatio }),
    setHistory: (updater) =>
      set((s) => ({ history: typeof updater === 'function' ? updater(s.history) : updater })),
    setSafeMode: (updater) =>
      set((s) => ({ safeMode: typeof updater === 'function' ? updater(s.safeMode) : updater })),
    setPoseDepthModeState: (updater) =>
      set((s) => ({ poseDepthMode: typeof updater === 'function' ? updater(s.poseDepthMode) : updater })),
    setPoseFrontOnly: (updater) =>
      set((s) => ({ poseFrontOnly: typeof updater === 'function' ? updater(s.poseFrontOnly) : updater })),
    setSceneNote: (updater) =>
      set((s) => ({ sceneNote: typeof updater === 'function' ? updater(s.sceneNote) : updater })),
    setPreviewUrl: (updater) =>
      set((s) => ({ previewUrl: typeof updater === 'function' ? updater(s.previewUrl) : updater })),
    setIsGenerating: (isGenerating) => set({ isGenerating }),
    setGeneratingMeta: (generatingProvider, generatingProfileId) =>
      set({ generatingProvider, generatingProfileId }),
    setGenerationProgress: (generationProgress) => set({ generationProgress }),
    setGenerationError: (generationError) => set({ generationError }),
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
  aspectRatio: StudioAspectRatio
  history: GenerationHistoryItem[]
  safeMode: boolean
  poseDepthMode: boolean
  poseFrontOnly: boolean
  sceneNote: string
  previewUrl: string
  isGenerating: boolean
  generatingProvider: ImageProviderId | null
  generatingProfileId: string | null
  generationProgress: StreamGenerationProgress | null
  generationError: string
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
  login: (account: string, password: string, requireAdmin?: boolean) => Promise<PublicUser>
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
  setAspectRatio: (ratio: StudioAspectRatio) => void
  toggleSafeMode: () => void
  requestUnlockNsfw: (onUnlocked?: () => void) => void
  setPoseDepthMode: (val: boolean) => void
  setPoseFrontOnly: (val: boolean) => void
  setSceneNote: (updater: Updater<string>) => void
  toggleRecipePoseDepth: () => void
  setPreviewUrl: (url: string) => void
  startGeneration: (sceneNote?: string) => Promise<void>
  refreshStitchPreview: () => Promise<void>
  setPortrait: (item: PortraitItem | null) => void
  setCostume: (item: CostumeItem | null) => void
  setPose: (item: PoseItem | null) => void
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
}

const StudioContext = createContext<StudioContextValue | null>(null)

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
    aspectRatio,
    history,
    safeMode,
    poseDepthMode,
    poseFrontOnly,
    sceneNote,
    previewUrl,
    isGenerating,
    generatingProvider,
    generatingProfileId,
    generationProgress,
    generationError,
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
    setAspectRatio,
    setHistory,
    setSafeMode,
    setPoseDepthModeState,
    setPoseFrontOnly,
    setSceneNote,
    setPreviewUrl,
    setIsGenerating,
    setGeneratingMeta,
    setGenerationProgress,
    setGenerationError,
    setIdbHydrated,
    setAuthModalOpen,
    setAuthModalTab,
    setAccountModalOpen,
    setAccountModalTab,
  } = store

  const [ageGateOpen, setAgeGateOpen] = useState(false)
  const pendingUnlockCbRef = useRef<(() => void) | null>(null)

  const isGeneratingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastBootstrapAtRef = useRef(0)
  const prevProcessingIdsRef = useRef<Set<string>>(new Set())

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetchGenerationsApi(60, 0)
      const finishedFromProcessing = res.items.find(
        (x) => prevProcessingIdsRef.current.has(x.id) && x.status === 'succeeded' && x.imageUrl
      )
      const failedFromProcessing = res.items.find(
        (x) => prevProcessingIdsRef.current.has(x.id) && x.status === 'failed'
      )
      prevProcessingIdsRef.current = new Set(
        res.items.filter((x) => x.status === 'processing').map((x) => x.id)
      )

      setHistory(res.items)
      setUser((prev) => (prev ? { ...prev, creditBalance: res.creditBalance } : prev))
      if (finishedFromProcessing) {
        setPreviewUrl(finishedFromProcessing.imageUrl)
        setGenerationError('')
        toast.success('云端角色作品已生成并保存到作品集')
      } else if (failedFromProcessing) {
        const msg = failedFromProcessing.errorMessage || '生成失败，积分已全额退还'
        setGenerationError(msg)
        toast.error(msg)
      } else {
        setPreviewUrl((prev) => {
          if (prev && res.items.some((x) => x.imageUrl === prev)) return prev
          return res.items.find((x) => x.status === 'succeeded' && x.imageUrl)?.imageUrl || ''
        })
      }
    } catch {
      // ignore if logged out
    }
  }, [setGenerationError, setHistory, setPreviewUrl, setUser])

  const refreshBootstrap = useCallback(async () => {
    lastBootstrapAtRef.current = Date.now()
    try {
      const data = await fetchBootstrap()
      setUser(data.user)
      setPlatform(data.platform)
      setProviders(data.providers)
      setWechatLogin(data.wechatLogin ?? DEFAULT_WECHAT_LOGIN_INFO)
      setProvidersLoaded(true)

      setSafeMode(data.platform.defaultSafeMode)
      try {
        localStorage.removeItem(SAFE_MODE_KEY)
      } catch {}

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
    setSafeMode,
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
      if (useStudioStore.getState().user && !isGeneratingRef.current) {
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
          aspectRatio,
          poseFrontOnly,
          sceneNote,
        })
      )
    } catch {}
  }, [
    selectedProvider,
    selectedProfileByProvider,
    selectedResolutionByProfile,
    stylePreset,
    allowFaceStyleShift,
    aspectRatio,
    poseFrontOnly,
    sceneNote,
  ])

  // Only persist safeMode when the user explicitly toggles it (never overwrite platform.defaultSafeMode on mount)

  // 轮询未完成的云端任务（例如刷新页面 / 切换后台 / SSE 重连恢复后的 processing 任务）
  useEffect(() => {
    if (!user || isGenerating) return
    const processingIds = history.filter((item) => item.status === 'processing').map((item) => item.id)
    if (processingIds.length === 0) return
    prevProcessingIdsRef.current = new Set(processingIds)
    const timer = window.setInterval(() => {
      void refreshHistory()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [user, isGenerating, history, refreshHistory])

  useEffect(() => () => abortRef.current?.abort(), [])

  const openAuthModal = (tab: AuthModalTab = 'login') => {
    setAuthModalTab(tab)
    setAuthModalOpen(true)
    refreshBootstrapIfStale(0)
  }
  const closeAuthModal = () => setAuthModalOpen(false)
  const openAccountModal = (tab: AccountModalTab = 'overview') => {
    setAccountModalTab(tab)
    setAccountModalOpen(true)
  }
  const closeAccountModal = () => setAccountModalOpen(false)

  const login = async (account: string, password: string, requireAdmin?: boolean) => {
    const res = await loginApi({ account, password, requireAdmin })
    setUser(res.user)
    setAuthModalOpen(false)
    await refreshHistory()
    return res.user
  }

  const register = async (payload: {
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
  }

  const logout = async () => {
    await logoutApi()
    setUser(null)
    setHistory([])
    setPreviewUrl('')
    setAccountModalOpen(false)
    await refreshBootstrap()
  }

  const unbindWechat = async () => {
    const res = await unbindWechatApi()
    setUser(res.user)
    return res.user
  }

  const redeemCode = async (code: string) => {
    const res = await redeemCodeApi(code)
    setUser((prev) => (prev ? { ...prev, creditBalance: res.creditBalance } : prev))
    return res
  }

  const requestUnlockNsfw = (onUnlocked?: () => void) => {
    if (!platform.allowUserNsfwUnlock) {
      toast.info('当前画廊已开启统一内容保护')
      return
    }
    if (!safeMode) {
      onUnlocked?.()
      return
    }
    pendingUnlockCbRef.current = onUnlocked || null
    setAgeGateOpen(true)
  }

  const confirmUnlockNsfw = () => {
    setSafeMode(false)
    try {
      localStorage.setItem(SAFE_MODE_KEY, 'false')
    } catch {}
    setAgeGateOpen(false)
    toast.success('已解锁完整图库浏览')
    const cb = pendingUnlockCbRef.current
    pendingUnlockCbRef.current = null
    cb?.()
  }

  const toggleSafeMode = () => {
    if (safeMode) {
      requestUnlockNsfw()
    } else {
      setSafeMode(true)
      try {
        localStorage.setItem(SAFE_MODE_KEY, 'true')
      } catch {}
      toast.success('已切换回标准图库视图')
    }
  }

  const setPortrait = (portrait: PortraitItem | null) => setRecipe((r) => ({ ...r, portrait }))
  const setCostume = (costume: CostumeItem | null) => setRecipe((r) => ({ ...r, costume }))
  const setPose = (pose: PoseItem | null) => setRecipe((r) => ({ ...r, pose }))

  const setPoseDepthMode = (val: boolean) => {
    setPoseDepthModeState(val)
    setRecipe((r) => {
      if (!r.pose || r.pose.source === 'upload' || Boolean(r.pose.useDepth) === val) return r
      return { ...r, pose: { ...r.pose, useDepth: val } }
    })
  }

  const toggleRecipePoseDepth = () => {
    const next = !(recipe.pose?.useDepth ?? poseDepthMode)
    setPoseDepthMode(next)
    toast.success(next ? '已切换姿势图为：深度图 (Depth)' : '已切换姿势图为：素体白模')
  }

  const togglePortrait = (item: PortraitItem) => {
    const remove = recipe.portrait?.id === item.id
    setRecipe((r) => ({ ...r, portrait: remove ? null : item }))
    toast.success(remove ? '已移除人像' : `已选人像：${item.发型名称}`)
  }
  const toggleCostume = (item: CostumeItem) => {
    const remove =
      recipe.costume?.id === item.id &&
      (recipe.costume.selectedView || 'front') === (item.selectedView || 'front')
    setRecipe((r) => ({ ...r, costume: remove ? null : item }))
    toast.success(remove ? '已移除服装' : `已选服装：${item.服装名称}`)
  }
  const togglePose = (item: PoseItem) => {
    const useDepth = item.source === 'upload' ? false : (item.useDepth ?? poseDepthMode)
    const remove = recipe.pose?.id === item.id && Boolean(recipe.pose?.useDepth) === useDepth
    setRecipe((r) => ({ ...r, pose: remove ? null : { ...item, useDepth } }))
    toast.success(remove ? '已移除姿势' : `已选姿势：${item.姿势名称}（${item.角度}${useDepth ? ' · 深度图' : ''}）`)
  }

  const addExtraImage = (item: { name: string; url: string; r2Key?: string }) => {
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
  }

  const removeExtraImage = (id: string) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).filter((x) => x.id !== id),
    }))
  }

  const updateExtraImageName = (id: string, name: string) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).map((x) => (x.id === id ? { ...x, name } : x)),
    }))
  }

  const reorderExtraImages = (activeId: string, overId: string) => {
    if (activeId === overId) return
    setRecipe((r) => {
      const list = r.extraImages || []
      const oldIdx = list.findIndex((x) => x.id === activeId)
      const newIdx = list.findIndex((x) => x.id === overId)
      if (oldIdx < 0 || newIdx < 0) return r
      return { ...r, extraImages: arrayMove(list, oldIdx, newIdx) }
    })
  }

  const clearRecipe = () => {
    setRecipe({ portrait: null, costume: null, pose: null, extraImages: [] })
    toast.success('已清空配方')
  }

  const randomizeRecipe = (pools: {
    portraits?: PortraitItem[]
    costumes?: CostumeItem[]
    poses?: PoseItem[]
  }) => {
    const live = useStudioStore.getState()
    const safePosePool = live.safeMode
      ? (pools.poses || []).filter((p) => !isNsfwPose(p))
      : pools.poses || []
    const frontPosePool = live.poseFrontOnly
      ? safePosePool.filter((p) => p.角度 === '正面')
      : safePosePool
    const posePool = frontPosePool.length ? frontPosePool : safePosePool
    const costumePool = (pools.costumes || []).filter(
      (c) => !c.source && c.一级分类 !== '二次元' && (!live.safeMode || !isNsfwCostume(c))
    )
    const portraitPool = pools.portraits || []

    setRecipe((prev) => ({
      ...prev,
      portrait: portraitPool.length
        ? portraitPool[Math.floor(Math.random() * portraitPool.length)]
        : prev.portrait,
      costume: costumePool.length
        ? costumePool[Math.floor(Math.random() * costumePool.length)]
        : prev.costume,
      pose: posePool.length
        ? { ...posePool[Math.floor(Math.random() * posePool.length)], useDepth: live.poseDepthMode }
        : prev.pose,
    }))
    toast.success('已随机抽取一套角色配方')
  }

  const randomizeSlot = (
    slot: ReferenceSlot,
    scope: RandomScope,
    pools: ReferencePools,
    expectedId?: string | null
  ) => {
    const live = useStudioStore.getState()
    const current = {
      recipe: live.recipe,
      safeMode: live.safeMode,
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
      {
        ...pools,
        costumes: (pools.costumes || []).filter((item) => !current.safeMode || !isNsfwCostume(item)),
        poses: (pools.poses || []).filter((item) => !current.safeMode || !isNsfwPose(item)),
      },
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
  }

  const removeHistoryItem = async (id: string) => {
    try {
      await deleteGenerationApi(id)
      setHistory((current) => {
        const next = current.filter((x) => x.id !== id)
        setPreviewUrl((prev) => {
          const removed = current.find((x) => x.id === id)
          if (removed && removed.imageUrl === prev) {
            return next.find((x) => x.status === 'succeeded' && x.imageUrl)?.imageUrl || ''
          }
          return prev
        })
        return next
      })
      toast.success('已删除该条生成记录')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  const refreshStitchPreview = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setPreviewUrl(url)
      toast.success('已合成参考拼图')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
  }

  const ensureRecipeImagesUploaded = async (currentRecipe: RecipeState): Promise<RecipeState> => {
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
  }

  const startGeneration = async (sceneNote = '') => {
    if (idbHydrated === false || isGeneratingRef.current || history.some((x) => x.status === 'processing')) {
      if (history.some((x) => x.status === 'processing')) {
        toast.info('当前已有作品正在云端绘制，请稍候完成')
      }
      return
    }

    if (!user) {
      toast.info('请先登录或注册账号后再开始生成')
      openAuthModal('login')
      return
    }

    const providerMeta = providers.find((p) => p.providerId === selectedProvider)
    if (!providerMeta || !providerMeta.enabled || !providerMeta.configured) {
      toast.error('这位AI小画家外出采风啦，请轻点另一位出马！')
      return
    }

    const activeProfile = resolveActiveProviderProfile(
      providerMeta,
      selectedProfileByProvider[selectedProvider]
    )
    if (providerMeta.models.length > 0 && (!activeProfile || !activeProfile.enabled || !activeProfile.configured)) {
      toast.error('这支画笔墨水耗尽啦，换支画笔或换位AI小画家试试！')
      return
    }

    const activeResolution = resolveActiveProfileResolution(
      activeProfile,
      activeProfile ? selectedResolutionByProfile[activeProfile.profileId] : undefined
    )
    const activeCost = activeProfile
      ? getEffectiveProfileCreditCost(activeProfile, activeResolution)
      : providerMeta.creditCost

    if (user.creditBalance < activeCost) {
      toast.error(`积分不足：本次需要 ${activeCost} 积分，当前剩余 ${user.creditBalance} 积分`)
      openAccountModal('redeem')
      return
    }

    const hasAnyRef = Boolean(
      recipe.portrait || recipe.costume || recipe.pose || (recipe.extraImages?.length ?? 0) > 0
    )
    if (!hasAnyRef) {
      toast.error('请先选择或上传至少 1 张参考图')
      return
    }

    const clientStartedAt = Date.now()
    let maxPercent = 5
    let activeJobId: string | null = null
    isGeneratingRef.current = true
    setIsGenerating(true)
    setGeneratingMeta(selectedProvider, activeProfile?.profileId ?? null)
    setGenerationError('')
    setGenerationProgress({
      stage: 'uploading',
      message: '正在准备参考素材…',
      startedAt: clientStartedAt,
      stageStartedAt: clientStartedAt,
      percent: 5,
    })
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const uploadedRecipe = await ensureRecipeImagesUploaded(recipe)

      let stitchedR2Key: string | undefined
      if (platform.sendStitchedSheet) {
        const stitchedDataUrl = await stitchRecipeCanvas(uploadedRecipe, {
          sanitizeForCloud: true,
          poseSanitize: platform.poseSanitize,
        })
        const stitchedRes = await uploadReferenceFileApi({
          file: dataUrlToBlob(stitchedDataUrl),
          filename: 'stitched.jpg',
          purpose: 'stitched',
        })
        stitchedR2Key = stitchedRes.r2Key
      }

      const pendingSummary =
        [
          uploadedRecipe.pose?.姿势名称,
          uploadedRecipe.costume?.服装名称,
          uploadedRecipe.portrait?.发型名称,
        ]
          .filter(Boolean)
          .join(' + ') || '自定义合成'

      const result = await startGenerationStreamApi(
        {
          idempotencyKey: crypto.randomUUID(),
          provider: selectedProvider,
          modelProfileId: activeProfile?.profileId,
          resolution: activeResolution ?? undefined,
          stylePreset,
          allowFaceStyleShift,
          aspectRatio,
          sceneNote,
          recipe: uploadedRecipe,
          stitchedR2Key,
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
            setGenerationProgress(normalized)
            if (typeof normalized.creditBalance === 'number') {
              const nextBal = normalized.creditBalance
              setUser((prev) => (prev ? { ...prev, creditBalance: nextBal } : prev))
            }
            if (normalized.jobId) {
              activeJobId = normalized.jobId
              prevProcessingIdsRef.current.add(normalized.jobId)
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
                  status: 'processing',
                  creditsCost: activeCost,
                  creditsRefunded: 0,
                  provider: selectedProvider,
                  profileId: activeProfile?.profileId ?? null,
                  profileName: activeProfile?.displayName ?? null,
                  resolution: activeResolution,
                  model: activeProfile
                    ? `${providerMeta.artist.name} · ${activeProfile.displayName}`
                    : providerMeta.artist.name,
                  prompt: '',
                  aspectRatio,
                  stylePreset,
                  imageUrl: '',
                  recipeSummary: pendingSummary,
                  liveProgress: normalized,
                }
                return [placeholder, ...prev]
              })
            }
          },
        }
      )

      prevProcessingIdsRef.current.delete(result.job.id)
      setUser((prev) => (prev ? { ...prev, creditBalance: result.creditBalance } : prev))
      setPreviewUrl(result.job.imageUrl)
      setHistory((prev) => [result.job, ...prev.filter((x) => x.id !== result.job.id)])
      toast.success('角色作品已生成并保存到云端作品集')
    } catch (e) {
      // 若已建单后流连接被浏览器中断（例如移动端切后台或网络抖动），向服务端确认真实任务状态，避免误报失败
      if (activeJobId && !(e instanceof ApiError)) {
        try {
          const latest = await fetchGenerationByIdApi(activeJobId)
          if (latest.job.status === 'processing') {
            setGenerationError('')
            setHistory((prev) => [latest.job, ...prev.filter((x) => x.id !== latest.job.id)])
            prevProcessingIdsRef.current.add(latest.job.id)
            toast.info('连接短暂中断，云端仍在继续绘制并自动同步进度')
            return
          }
          if (latest.job.status === 'succeeded' && latest.job.imageUrl) {
            prevProcessingIdsRef.current.delete(latest.job.id)
            setPreviewUrl(latest.job.imageUrl)
            setHistory((prev) => [latest.job, ...prev.filter((x) => x.id !== latest.job.id)])
            void refreshHistory()
            toast.success('角色作品已在云端生成并保存')
            return
          }
        } catch {
          // fall through to normal error handling
        }
      }

      if (e instanceof ApiError && e.status === 401) {
        setUser(null)
        openAuthModal('login')
      } else if (e instanceof ApiError && e.code === 'INSUFFICIENT_CREDITS') {
        openAccountModal('redeem')
      }
      const msg = e instanceof Error ? e.message : '生成失败，请稍后重试'
      setGenerationError(msg)
      toast.error(msg.split('\n')[0])
      void refreshHistory()
    } finally {
      isGeneratingRef.current = false
      setIsGenerating(false)
      setGeneratingMeta(null, null)
      setGenerationProgress(null)
    }
  }

  return (
    <StudioContext.Provider
      value={{
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
        aspectRatio,
        history,
        safeMode,
        poseDepthMode,
        poseFrontOnly,
        sceneNote,
        previewUrl,
        isGenerating,
        generatingProvider,
        generatingProfileId,
        generationProgress,
        generationError,
        authModalOpen,
        authModalTab,
        accountModalOpen,
        accountModalTab,
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
        setAspectRatio,
        toggleSafeMode,
        requestUnlockNsfw,
        setPoseDepthMode,
        setPoseFrontOnly,
        setSceneNote,
        toggleRecipePoseDepth,
        setPreviewUrl,
        startGeneration,
        refreshStitchPreview,
        setPortrait,
        setCostume,
        setPose,
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
      }}
    >
      {children}

      <AlertDialog open={ageGateOpen} onOpenChange={setAgeGateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🔞 年龄确认与免责声明（NSFW 18+）</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left leading-relaxed">
              <span className="block">
                关闭「安全模式 (SFW)」后，图库将显示包含成人向艺术参考的敏感分类：
              </span>
              <span className="block rounded-lg bg-muted p-2.5 text-xs text-foreground">
                • <strong>动作姿势库</strong>：全身单人・性感系（399 张）、双人缠绵（275 张）
                <br />• <strong>服装穿搭库</strong>：内衣・睡衣（199 套）、性感穿搭（140 套）
              </span>
              <span className="block text-xs">
                <strong>免责声明</strong>：
                <br />1. <strong>年龄限制</strong>：未满 18 周岁的未成年人严禁关闭安全模式或浏览上述敏感分类。
                <br />2. <strong>来源说明</strong>：原有图鉴素材来自 ギア（@giaaibusi）；二次元服装来自 たき AI · CharaDB，适用独立来源条件，禁止真人、未成年人用途及图片再分发，首次使用须确认。
                <br />3. <strong>合法使用</strong>：本工具与素材<strong>仅供 AI 绘画学习与合法艺术创作使用，严禁用于任何违法违规、色情传播或侵害他人肖像权（如未经授权的真人换脸）等用途</strong>，使用者须自行承担一切法律责任。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingUnlockCbRef.current = null
              }}
            >
              保持安全模式
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlockNsfw}>
              我已年满 18 岁并同意免责声明
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StudioContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}
