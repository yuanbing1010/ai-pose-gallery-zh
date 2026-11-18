import type {
  AdminJobsStatsSummary,
  AdminOverviewPayload,
  AdminProviderSlotDTO,
  AdminR2CleanupReport,
  AdminR2CleanupResult,
  AdminUserItem,
  AdminWechatConfigDTO,
  BootstrapPayload,
  CreditLedgerItem,
  GenerationHistoryItem,
  ImageProviderId,
  PlatformConfig,
  ProfileResolutionOption,
  PublicUser,
  RecipeState,
  RedeemCodeItem,
  StudioAspectRatio,
  StudioResolution,
  SupplierDTO,
  UserRole,
  UserStatus,
} from '@/types/gallery'
import type { GenerationLiveStage } from '../../shared/studio'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })
  const text = await res.text()
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    const fallbackMsg =
      res.status === 502 || res.status === 504
        ? '无法连接后端 Worker 服务（本地请确认已启动 pnpm dev 或 pnpm dev:worker）'
        : `请求失败 (HTTP ${res.status})`
    throw new ApiError(
      data?.error?.message || fallbackMsg,
      res.status,
      data?.error?.code
    )
  }
  return data as T
}

export function fetchBootstrap(): Promise<BootstrapPayload> {
  return requestJson('/api/bootstrap')
}

export function fetchMe(): Promise<{ user: PublicUser | null }> {
  return requestJson('/api/auth/me')
}

export function loginApi(payload: {
  account: string
  password: string
  requireAdmin?: boolean
}): Promise<{ user: PublicUser }> {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function registerApi(payload: {
  username: string
  email?: string
  displayName?: string
  password: string
}): Promise<{ user: PublicUser }> {
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logoutApi(): Promise<{ ok: boolean }> {
  return requestJson('/api/auth/logout', { method: 'POST' })
}

export function changePasswordApi(payload: {
  currentPassword?: string
  newPassword: string
}): Promise<{ ok: boolean; hasPassword?: boolean }> {
  return requestJson('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function startWechatAuthApi(payload: {
  intent: 'login' | 'bind'
  returnTo?: string
}): Promise<{ authorizeUrl: string; iframeUrl: string; expiresAt: number }> {
  return requestJson('/api/auth/wechat/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function unbindWechatApi(): Promise<{ ok: boolean; user: PublicUser | null }> {
  return requestJson('/api/account/wechat/unbind', { method: 'POST' })
}

export function fetchLedgerApi(limit = 50): Promise<{
  items: CreditLedgerItem[]
  creditBalance: number
}> {
  return requestJson(`/api/account/ledger?limit=${limit}`)
}

export function redeemCodeApi(code: string): Promise<{
  credits: number
  creditBalance: number
}> {
  return requestJson('/api/account/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function uploadReferenceFileApi(params: {
  file: Blob
  filename: string
  purpose: 'portrait' | 'costume' | 'pose' | 'extra' | 'stitched'
  width?: number
  height?: number
}): Promise<{
  id: string
  r2Key: string
  url: string
  mimeType: string
  bytes: number
}> {
  const form = new FormData()
  form.append('file', params.file, params.filename)
  form.append('purpose', params.purpose)
  if (params.width) form.append('width', String(params.width))
  if (params.height) form.append('height', String(params.height))
  return requestJson('/api/uploads', {
    method: 'POST',
    body: form,
  })
}

export function fetchGenerationsApi(limit = 60, offset = 0): Promise<{
  items: GenerationHistoryItem[]
  total: number
  creditBalance: number
}> {
  return requestJson(`/api/generations?limit=${limit}&offset=${offset}`)
}

export function fetchGenerationByIdApi(id: string): Promise<{ job: GenerationHistoryItem }> {
  return requestJson(`/api/generations/${encodeURIComponent(id)}`)
}

export function deleteGenerationApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/generations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface StreamGenerationProgress {
  stage: GenerationLiveStage
  message: string
  attempt?: number
  totalAttempts?: number
  startedAt?: number
  stageStartedAt?: number
  percent?: number
  jobId?: string
  creditBalance?: number
}

export async function startGenerationStreamApi(
  payload: {
    idempotencyKey: string
    provider: ImageProviderId
    modelProfileId?: string
    resolution?: StudioResolution
    stylePreset: string
    allowFaceStyleShift?: boolean
    aspectRatio: StudioAspectRatio
    sceneNote?: string
    recipe: RecipeState
    stitchedR2Key?: string
  },
  handlers: {
    onProgress: (p: StreamGenerationProgress) => void
    signal?: AbortSignal
  }
): Promise<{ job: GenerationHistoryItem; creditBalance: number }> {
  const res = await fetch('/api/generations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  })

  if (!res.ok) {
    const text = await res.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = {}
    }
    throw new ApiError(
      data?.error?.message || `生成请求失败 (HTTP ${res.status})`,
      res.status,
      data?.error?.code
    )
  }

  if (!res.body) {
    throw new ApiError('服务器未返回流式响应', 502)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: { job: GenerationHistoryItem; creditBalance: number } | null = null
  let streamError: string | null = null

  const processBlock = (block: string) => {
    const lines = block.split(/\r?\n/)
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }
    if (!dataLines.length) return
    let parsed: any = {}
    try {
      parsed = JSON.parse(dataLines.join('\n'))
    } catch {
      return
    }
    if (eventName === 'progress') {
      handlers.onProgress(parsed as StreamGenerationProgress)
    } else if (eventName === 'done') {
      finalResult = parsed as { job: GenerationHistoryItem; creditBalance: number }
    } else if (eventName === 'error') {
      streamError = parsed?.message || '生成失败'
      if (typeof parsed?.creditBalance === 'number') {
        handlers.onProgress({
          stage: 'saving',
          message: streamError || '生成失败',
          creditBalance: parsed.creditBalance,
        })
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const sepMatch = buffer.slice(idx).match(/^\r?\n\r?\n/)
      const sepLen = sepMatch ? sepMatch[0].length : 2
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + sepLen)
      processBlock(block)
    }
  }

  if (buffer.trim()) {
    processBlock(buffer)
  }

  if (streamError) {
    throw new ApiError(streamError, 500)
  }
  if (!finalResult) {
    throw new ApiError('连接提前断开，请在「作品集」中确认生成结果或自动退还状态', 502)
  }
  return finalResult
}

// ---------------------------------------------------------------------------
// 管理端接口
// ---------------------------------------------------------------------------

export function fetchAdminMeApi(): Promise<{
  user: PublicUser | null
  frontendUser: PublicUser | null
}> {
  return requestJson('/api/admin/me')
}

export function adminLoginApi(payload: {
  account: string
  password: string
}): Promise<{ user: PublicUser }> {
  return requestJson('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminSessionFromFrontendApi(): Promise<{ user: PublicUser }> {
  return requestJson('/api/admin/session-from-frontend', {
    method: 'POST',
  })
}

export function adminLogoutApi(): Promise<{ ok: boolean }> {
  return requestJson('/api/admin/logout', {
    method: 'POST',
  })
}

export function fetchAdminBootstrapStatusApi(): Promise<{
  needsSetup: boolean
  requiresSetupToken: boolean
  remoteBlocked: boolean
}> {
  return requestJson('/api/admin/bootstrap-status')
}

export function bootstrapAdminApi(payload: {
  username: string
  password: string
  setupToken?: string
}): Promise<{ user: PublicUser }> {
  return requestJson('/api/admin/bootstrap', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchAdminOverviewApi(): Promise<AdminOverviewPayload> {
  return requestJson('/api/admin/overview')
}

export function fetchAdminR2CleanupApi(): Promise<AdminR2CleanupReport> {
  return requestJson('/api/admin/r2-cleanup')
}

export function runAdminR2CleanupApi(): Promise<AdminR2CleanupResult> {
  return requestJson('/api/admin/r2-cleanup', {
    method: 'POST',
  })
}

export function fetchAdminSuppliersApi(): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson('/api/admin/suppliers')
}

export function createAdminSupplierApi(payload: {
  name: string
  baseUrl: string
  apiKey?: string
  enabled?: boolean
  note?: string
}): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson('/api/admin/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminSupplierApi(
  id: string,
  payload: {
    name?: string
    baseUrl?: string
    apiKey?: string
    clearApiKey?: boolean
    enabled?: boolean
    note?: string
  }
): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson(`/api/admin/suppliers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAdminSupplierApi(id: string): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson(`/api/admin/suppliers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function fetchAdminProvidersApi(): Promise<{
  slots: AdminProviderSlotDTO[]
  suppliers: SupplierDTO[]
}> {
  return requestJson('/api/admin/providers')
}

export function updateAdminProviderSlotApi(
  id: ImageProviderId,
  patch: { enabled?: boolean; creditCost?: number }
): Promise<{ slots: AdminProviderSlotDTO[] }> {
  return requestJson(`/api/admin/providers/${encodeURIComponent(id)}/slot`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export interface AdminProfilePayload {
  displayName?: string
  badge?: string
  tagline?: string
  enabled?: boolean
  isDefault?: boolean
  creditCost?: number
  defaultResolution?: StudioResolution | null
  resolutions?: ProfileResolutionOption[]
  sortOrder?: number
}

export function createAdminProfileApi(
  providerId: ImageProviderId,
  payload: AdminProfilePayload
): Promise<{ slots: AdminProviderSlotDTO[]; createdProfileId?: string }> {
  return requestJson(`/api/admin/providers/${encodeURIComponent(providerId)}/profiles`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminProfileApi(
  profileId: string,
  payload: AdminProfilePayload
): Promise<{ slots: AdminProviderSlotDTO[] }> {
  return requestJson(`/api/admin/profiles/${encodeURIComponent(profileId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAdminProfileApi(
  profileId: string
): Promise<{ slots: AdminProviderSlotDTO[] }> {
  return requestJson(`/api/admin/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  })
}

export function createAdminChannelApi(
  providerId: ImageProviderId,
  payload: {
    profileId?: string
    supplierId: string
    name: string
    enabled: boolean
    model: string
    customModel: string
    priority: number
    params: Record<string, unknown>
  }
): Promise<{ slots: AdminProviderSlotDTO[] }> {
  return requestJson(`/api/admin/providers/${encodeURIComponent(providerId)}/channels`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminChannelApi(
  channelId: string,
  payload: {
    profileId?: string
    supplierId?: string
    name?: string
    enabled?: boolean
    model?: string
    customModel?: string
    priority?: number
    params?: Record<string, unknown>
  }
): Promise<{ slots: AdminProviderSlotDTO[] }> {
  return requestJson(`/api/admin/channels/${encodeURIComponent(channelId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAdminChannelApi(channelId: string): Promise<{ slots: AdminProviderSlotDTO[] }> {
  return requestJson(`/api/admin/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
  })
}

export function fetchAdminSettingsApi(): Promise<{ platform: PlatformConfig }> {
  return requestJson('/api/admin/settings')
}

export function updateAdminSettingsApi(patch: Partial<PlatformConfig>): Promise<{ platform: PlatformConfig }> {
  return requestJson('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export function fetchAdminWechatApi(): Promise<{ wechat: AdminWechatConfigDTO }> {
  return requestJson('/api/admin/wechat')
}

export function updateAdminWechatApi(payload: {
  enabled?: boolean
  appId?: string
  appSecret?: string
  clearAppSecret?: boolean
  callbackBaseUrl?: string
}): Promise<{ wechat: AdminWechatConfigDTO }> {
  return requestJson('/api/admin/wechat', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function uploadAdminStylePreviewApi(params: {
  file: Blob
  filename: string
}): Promise<{
  r2Key: string
  url: string
  mimeType: string
  bytes: number
}> {
  const form = new FormData()
  form.append('file', params.file, params.filename)
  return requestJson('/api/admin/style-preview', {
    method: 'POST',
    body: form,
  })
}

export function fetchAdminUsersApi(
  q = '',
  limit = 50,
  offset = 0,
  filter: 'all' | 'active' | 'disabled' | 'admin' = 'all'
): Promise<{
  users: AdminUserItem[]
  total: number
}> {
  const qs = new URLSearchParams({
    q,
    limit: String(limit),
    offset: String(offset),
    filter,
  })
  return requestJson(`/api/admin/users?${qs.toString()}`)
}

export function createAdminUserApi(payload: {
  username: string
  password: string
  displayName?: string
  adminNote?: string
  email?: string
  initialCredits?: number
  role?: UserRole
}): Promise<{ user: AdminUserItem }> {
  return requestJson('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminUserApi(
  userId: string,
  patch: {
    displayName?: string
    adminNote?: string
    newPassword?: string
    status?: UserStatus
    role?: UserRole
  }
): Promise<{ user: AdminUserItem | null }> {
  return requestJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function adjustUserCreditsApi(
  userId: string,
  delta: number,
  note: string
): Promise<{ creditBalance: number }> {
  return requestJson(`/api/admin/users/${encodeURIComponent(userId)}/credits`, {
    method: 'POST',
    body: JSON.stringify({ delta, note }),
  })
}

export function updateUserStatusApi(
  userId: string,
  patch: { status?: UserStatus; role?: UserRole }
): Promise<{ user: PublicUser | null }> {
  return requestJson(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function fetchAdminLedgerApi(params?: {
  limit?: number
  offset?: number
  q?: string
  type?: string
}): Promise<{ items: CreditLedgerItem[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  if (params?.q) qs.set('q', params.q)
  if (params?.type && params.type !== 'all') qs.set('type', params.type)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestJson(`/api/admin/ledger${suffix}`)
}

export function fetchAdminRedeemCodesApi(params?: {
  limit?: number
  offset?: number
  filter?: 'all' | 'active' | 'exhausted' | 'disabled' | 'expired'
  q?: string
}): Promise<{
  codes: RedeemCodeItem[]
  total: number
  counts: {
    all: number
    active: number
    exhausted: number
    disabled: number
    expired: number
  }
}> {
  const qs = new URLSearchParams()
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  if (params?.filter && params.filter !== 'all') qs.set('filter', params.filter)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestJson(`/api/admin/redeem-codes${suffix}`)
}

export function createAdminRedeemCodesApi(payload: {
  count: number
  credits: number
  maxUses: number
  expiresDays?: number | null
  prefix?: string
  note?: string
}): Promise<{ codes: RedeemCodeItem[] }> {
  return requestJson('/api/admin/redeem-codes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function toggleAdminRedeemCodeApi(
  id: string,
  status: 'active' | 'disabled'
): Promise<{ ok: boolean }> {
  return requestJson(`/api/admin/redeem-codes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function fetchAdminGenerationsApi(params?: {
  status?: string
  provider?: string
  q?: string
  limit?: number
  offset?: number
}): Promise<{ items: GenerationHistoryItem[]; total: number; stats: AdminJobsStatsSummary }> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.provider) qs.set('provider', params.provider)
  if (params?.q) qs.set('q', params.q)
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestJson(`/api/admin/generations${suffix}`)
}

export function fetchAdminGenerationByIdApi(id: string): Promise<{ job: GenerationHistoryItem }> {
  return requestJson(`/api/admin/generations/${encodeURIComponent(id)}`)
}
