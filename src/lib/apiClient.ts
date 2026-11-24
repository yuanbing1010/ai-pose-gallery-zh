import type {
  AdminGalleryStatsSummary,
  AdminJobsStatsSummary,
  AdminOverviewPayload,
  AdminProviderSlotDTO,
  AdminQueueSnapshotDTO,
  AdminR2CleanupReport,
  AdminR2CleanupResult,
  AdminUserItem,
  AdminWechatConfigDTO,
  BootstrapPayload,
  CreditLedgerItem,
  GalleryCommentDTO,
  GalleryItemDTO,
  GalleryItemSourceType,
  GalleryItemStatus,
  GalleryListResponse,
  GallerySortOrder,
  GenerationHistoryItem,
  GenerationAspectRatio,
  GenerationLiveStage,
  GenerationQueueInfo,
  ImageProviderId,
  MioSyncStatus,
  OutfitDbSyncStatus,
  ParsedXTweetPreview,
  PlatformConfig,
  ProfileResolutionOption,
  PublicUser,
  RecipeState,
  RedeemCodeItem,
  ReferenceDescriptionDTO,
  ReferenceDescriptionKind,
  StudioAspectRatio,
  StudioGenerationMode,
  StudioResolution,
  SupplierAuthMode,
  SupplierDTO,
  SupplierQueriedModel,
  UserRole,
  UserStatus,
  XSyncSourceDTO,
} from '@/types/gallery'

export class ApiError extends Error {
  status: number
  code?: string
  jobId?: string
  refunded?: boolean

  constructor(
    message: string,
    status: number,
    code?: string,
    extra?: { jobId?: string; refunded?: boolean }
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.jobId = extra?.jobId
    this.refunded = extra?.refunded
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

export function cancelQueuedGenerationApi(id: string): Promise<{
  ok: boolean
  job: GenerationHistoryItem | null
  refunded: number
  creditBalance: number
}> {
  return requestJson(`/api/generations/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
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

export type StartGenerationStreamResult =
  | { kind: 'done'; job: GenerationHistoryItem; creditBalance: number }
  | {
      kind: 'queued'
      job: GenerationHistoryItem
      creditBalance: number
      queueInfo: GenerationQueueInfo
    }

export async function startGenerationStreamApi(
  payload: {
    idempotencyKey: string
    generationMode?: StudioGenerationMode
    userPrompt?: string
    remixGalleryItemId?: string
    provider: ImageProviderId
    modelProfileId?: string
    resolution?: StudioResolution
    stylePreset: string
    allowFaceStyleShift?: boolean
    allowPoseStyleShift?: boolean
    aspectRatio: GenerationAspectRatio
    sceneNote?: string
    recipe: RecipeState
    stitchedR2Key?: string
    textFallbackOnly?: boolean
  },
  handlers: {
    onProgress: (p: StreamGenerationProgress) => void
    signal?: AbortSignal
  }
): Promise<StartGenerationStreamResult> {
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
  let queuedResult: {
    job: GenerationHistoryItem
    creditBalance: number
    queueInfo: GenerationQueueInfo
  } | null = null
  let streamError: {
    message: string
    jobId?: string
    refunded?: boolean
    creditBalance?: number
  } | null = null

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
    } else if (eventName === 'queued') {
      queuedResult = parsed as {
        job: GenerationHistoryItem
        creditBalance: number
        queueInfo: GenerationQueueInfo
      }
    } else if (eventName === 'done') {
      finalResult = parsed as { job: GenerationHistoryItem; creditBalance: number }
    } else if (eventName === 'error') {
      const msg = typeof parsed?.message === 'string' && parsed.message ? parsed.message : '生成失败'
      streamError = {
        message: msg,
        jobId: typeof parsed?.jobId === 'string' ? parsed.jobId : undefined,
        refunded: typeof parsed?.refunded === 'boolean' ? parsed.refunded : undefined,
        creditBalance: typeof parsed?.creditBalance === 'number' ? parsed.creditBalance : undefined,
      }
      if (typeof parsed?.creditBalance === 'number') {
        handlers.onProgress({
          stage: 'saving',
          message: msg,
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
    const errInfo = streamError as {
      message: string
      jobId?: string
      refunded?: boolean
    }
    throw new ApiError(errInfo.message, 500, undefined, {
      jobId: errInfo.jobId,
      refunded: errInfo.refunded,
    })
  }
  if (queuedResult) {
    const q = queuedResult as {
      job: GenerationHistoryItem
      creditBalance: number
      queueInfo: GenerationQueueInfo
    }
    return { kind: 'queued', ...q }
  }
  if (finalResult) {
    const d = finalResult as { job: GenerationHistoryItem; creditBalance: number }
    return { kind: 'done', ...d }
  }
  throw new ApiError('连接提前断开，请在「作品集」中确认生成结果或自动退还状态', 502)
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
  authMode?: SupplierAuthMode
  baseUrl: string
  apiKey?: string
  rawKeysText?: string
  oauthSessionIds?: string[]
  models?: string[]
  enabled?: boolean
  note?: string
}): Promise<{
  suppliers: SupplierDTO[]
  createdSupplierId?: string
  addedCount?: number
  skippedCount?: number
}> {
  return requestJson('/api/admin/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminSupplierApi(
  id: string,
  payload: {
    name?: string
    authMode?: SupplierAuthMode
    baseUrl?: string
    apiKey?: string
    rawKeysText?: string
    models?: string[]
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

export interface SupplierModelsQueryResult {
  ok: boolean
  status: number | null
  latencyMs: number
  endpointUrl: string
  models: SupplierQueriedModel[]
  message: string
}

export function queryAdminSupplierModelsApi(payload: {
  supplierId?: string
  authMode?: SupplierAuthMode
  baseUrl: string
  apiKey?: string
  rawKeysText?: string
  oauthSessionIds?: string[]
}): Promise<SupplierModelsQueryResult> {
  return requestJson('/api/admin/suppliers/query-models', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function addAdminSupplierKeysApi(
  supplierId: string,
  payload: {
    rawKeysText?: string
    apiKey?: string
    label?: string
    keys?: Array<{ label?: string; apiKey: string }>
  }
): Promise<{ suppliers: SupplierDTO[]; addedCount: number; skippedCount: number }> {
  return requestJson(`/api/admin/suppliers/${encodeURIComponent(supplierId)}/keys`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminSupplierKeyApi(
  supplierId: string,
  keyId: string,
  payload: {
    label?: string
    enabled?: boolean
    apiKey?: string
    clearCooldown?: boolean
  }
): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson(
    `/api/admin/suppliers/${encodeURIComponent(supplierId)}/keys/${encodeURIComponent(keyId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  )
}

export function deleteAdminSupplierKeyApi(
  supplierId: string,
  keyId: string
): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson(
    `/api/admin/suppliers/${encodeURIComponent(supplierId)}/keys/${encodeURIComponent(keyId)}`,
    {
      method: 'DELETE',
    }
  )
}

export function deleteAdminSupplierApi(id: string): Promise<{ suppliers: SupplierDTO[] }> {
  return requestJson(`/api/admin/suppliers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export interface SupplierKeyTestResult {
  keyId: string
  label: string
  apiKeyHint: string
  ok: boolean
  status: number | null
  latencyMs: number
  message: string
}

export function testAdminSupplierApi(
  id: string,
  keyId?: string
): Promise<{
  ok: boolean
  status: number | null
  latencyMs: number
  message: string
  results?: SupplierKeyTestResult[]
}> {
  return requestJson(`/api/admin/suppliers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    ...(keyId ? { body: JSON.stringify({ keyId }) } : {}),
  })
}

export interface DraftOAuthAccountSummary {
  sessionId: string
  label: string
  accountHint: string
  accountId: string
  expiresAt: number
}

export interface SupplierOAuthDeviceStartResult {
  sessionId: string
  flowType: 'device_code'
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  intervalSec: number
  expiresAt: number
}

export interface SupplierOAuthDevicePollResult {
  status: 'pending' | 'completed' | 'expired' | 'failed'
  intervalSec?: number
  error?: string
  keyId?: string
  updatedExisting?: boolean
  draftAccount?: DraftOAuthAccountSummary
  suppliers?: SupplierDTO[]
}

export interface SupplierOAuthPkceStartResult {
  sessionId: string
  flowType: 'pkce'
  authorizeUrl: string
  redirectUri: string
  expiresAt: number
}

export interface SupplierOAuthCompleteResult {
  keyId?: string
  updatedExisting?: boolean
  draftAccount?: DraftOAuthAccountSummary
  suppliers?: SupplierDTO[]
}

export function startAdminSupplierOAuthDeviceApi(payload: {
  supplierId?: string
  authMode?: SupplierAuthMode
  label?: string
}): Promise<SupplierOAuthDeviceStartResult> {
  return requestJson('/api/admin/suppliers/oauth/device/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function pollAdminSupplierOAuthDeviceApi(payload: {
  supplierId?: string
  sessionId: string
}): Promise<SupplierOAuthDevicePollResult> {
  return requestJson('/api/admin/suppliers/oauth/device/poll', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function startAdminSupplierOAuthPkceApi(payload: {
  supplierId?: string
  authMode?: SupplierAuthMode
  label?: string
}): Promise<SupplierOAuthPkceStartResult> {
  return requestJson('/api/admin/suppliers/oauth/pkce/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function completeAdminSupplierOAuthPkceApi(payload: {
  supplierId?: string
  sessionId: string
  callbackInput: string
}): Promise<SupplierOAuthCompleteResult> {
  return requestJson('/api/admin/suppliers/oauth/pkce/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function importAdminSupplierOAuthJsonApi(payload: {
  supplierId?: string
  authMode?: SupplierAuthMode
  rawJson: string
  label?: string
}): Promise<SupplierOAuthCompleteResult> {
  return requestJson('/api/admin/suppliers/oauth/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function refreshAdminSupplierKeyTokenApi(
  supplierId: string,
  keyId: string
): Promise<{ ok: boolean; expiresAt: number; message: string; suppliers: SupplierDTO[] }> {
  return requestJson(
    `/api/admin/suppliers/${encodeURIComponent(supplierId)}/keys/${encodeURIComponent(keyId)}/refresh`,
    { method: 'POST' }
  )
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
  defaultModel?: string
  defaultCustomModel?: string
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
    keyIds?: string[]
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
    keyIds?: string[]
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

export function deleteAdminRedeemCodeApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/admin/redeem-codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
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

export function fetchAdminQueueApi(): Promise<AdminQueueSnapshotDTO> {
  return requestJson('/api/admin/queue')
}

export function reconcileAdminQueueApi(): Promise<{
  ok: boolean
  reapedProcessing: number
  reapedQueued: number
  promotedCount: number
}> {
  return requestJson('/api/admin/queue/reconcile', {
    method: 'POST',
  })
}

export function cancelAdminQueueJobApi(
  id: string,
  opts?: { forceProcessing?: boolean; reason?: string }
): Promise<{ ok: boolean; refunded: number | boolean; mode: string }> {
  return requestJson(`/api/admin/queue/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  })
}

export function fetchAdminMioSyncStatusApi(): Promise<MioSyncStatus> {
  return requestJson('/api/admin/sync/mio')
}

export function runAdminMioSyncApi(): Promise<MioSyncStatus> {
  return requestJson('/api/admin/sync/mio', {
    method: 'POST',
  })
}

export function fetchAdminOutfitDbSyncStatusApi(): Promise<OutfitDbSyncStatus> {
  return requestJson('/api/admin/sync/outfit-db')
}

export function runAdminOutfitDbSyncApi(): Promise<OutfitDbSyncStatus> {
  return requestJson('/api/admin/sync/outfit-db', {
    method: 'POST',
  })
}

export function fetchAdminReferenceDescriptionsApi(params?: {
  kind?: 'all' | ReferenceDescriptionKind
  q?: string
  limit?: number
  offset?: number
}): Promise<{
  items: ReferenceDescriptionDTO[]
  total: number
  poseCount: number
  costumeCount: number
  portraitCount: number
  extraCount: number
}> {
  const qs = new URLSearchParams()
  if (params?.kind && params.kind !== 'all') qs.set('kind', params.kind)
  if (params?.q) qs.set('q', params.q)
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestJson(`/api/admin/reference-descriptions${suffix}`)
}

export function transcribeAdminReferenceDescriptionApi(payload: {
  kind: ReferenceDescriptionKind
  previewPath: string
  sourceLabel?: string
  description?: string
}): Promise<{
  item: ReferenceDescriptionDTO | null
  description?: string
  cacheHit?: boolean
  visionModel?: string
}> {
  return requestJson('/api/admin/reference-descriptions/transcribe', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminReferenceDescriptionApi(
  id: string,
  payload: { description: string; sourceLabel?: string }
): Promise<{ item: ReferenceDescriptionDTO }> {
  return requestJson(`/api/admin/reference-descriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function regenerateAdminReferenceDescriptionApi(
  id: string
): Promise<{ item: ReferenceDescriptionDTO }> {
  return requestJson(
    `/api/admin/reference-descriptions/${encodeURIComponent(id)}/regenerate`,
    { method: 'POST' }
  )
}

export function deleteAdminReferenceDescriptionApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/admin/reference-descriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// 灵感画廊 API（公共画廊 / 个人画廊投稿 / 管理端审核与 X 推文导入）
// ---------------------------------------------------------------------------

export function fetchPublicGalleryItemsApi(params?: {
  sort?: GallerySortOrder
  source?: 'all' | GalleryItemSourceType
  category?: string
  aspectRatio?: string
  q?: string
  limit?: number
  offset?: number
}): Promise<GalleryListResponse> {
  const sp = new URLSearchParams()
  if (params?.sort) sp.set('sort', params.sort)
  if (params?.source && params.source !== 'all') sp.set('source', params.source)
  if (params?.category && params.category !== '全部') sp.set('category', params.category)
  if (params?.aspectRatio && params.aspectRatio !== 'all') sp.set('aspectRatio', params.aspectRatio)
  if (params?.q) sp.set('q', params.q)
  if (params?.limit) sp.set('limit', String(params.limit))
  if (params?.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return requestJson(`/api/gallery/items${qs ? `?${qs}` : ''}`)
}

export function fetchGalleryItemDetailApi(id: string): Promise<{ item: GalleryItemDTO }> {
  return requestJson(`/api/gallery/items/${encodeURIComponent(id)}`)
}

export function fetchMyGalleryItemsApi(limit = 60, offset = 0): Promise<GalleryListResponse> {
  return requestJson(`/api/gallery/mine?limit=${limit}&offset=${offset}`)
}

export function publishToGalleryApi(payload: {
  jobId: string
  title?: string
  category?: string
  tags?: string[] | string
  promptPublic?: boolean
  promptZh?: string
}): Promise<{ ok: boolean; item: GalleryItemDTO | null }> {
  return requestJson('/api/gallery/publish', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function withdrawMyGalleryItemApi(
  id: string
): Promise<{ ok: boolean; item: GalleryItemDTO | null }> {
  return requestJson(`/api/gallery/mine/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST',
  })
}

export function deleteMyGalleryItemApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/gallery/mine/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function fetchAdminGalleryApi(params?: {
  status?: 'all' | GalleryItemStatus
  source?: 'all' | GalleryItemSourceType
  q?: string
  limit?: number
  offset?: number
}): Promise<{
  items: GalleryItemDTO[]
  total: number
  stats: AdminGalleryStatsSummary
  ingestKeyConfigured: boolean
}> {
  const sp = new URLSearchParams()
  if (params?.status && params.status !== 'all') sp.set('status', params.status)
  if (params?.source && params.source !== 'all') sp.set('source', params.source)
  if (params?.q) sp.set('q', params.q)
  if (params?.limit) sp.set('limit', String(params.limit))
  if (params?.offset) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return requestJson(`/api/admin/gallery${qs ? `?${qs}` : ''}`)
}

export function updateAdminGalleryItemApi(
  id: string,
  payload: {
    status?: GalleryItemStatus
    title?: string
    promptText?: string
    promptZh?: string
    promptPublic?: boolean
    category?: string
    tags?: string[] | string
    aspectRatio?: StudioAspectRatio
    isFeatured?: boolean
    reviewNote?: string
  }
): Promise<{ ok: boolean; item: GalleryItemDTO | null }> {
  return requestJson(`/api/admin/gallery/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteAdminGalleryItemApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/admin/gallery/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function parseAdminXTweetApi(url: string): Promise<{ preview: ParsedXTweetPreview }> {
  return requestJson('/api/admin/gallery/parse-x', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export function importAdminXTweetApi(payload: {
  tweetUrl?: string
  tweetId?: string
  authorHandle?: string
  authorName?: string
  authorAvatar?: string | null
  title?: string
  promptText: string
  promptZh?: string
  imageUrl: string
  width?: number
  height?: number
  aspectRatio?: StudioAspectRatio
  category?: string
  tags?: string[] | string
  publishNow?: boolean
  isFeatured?: boolean
}): Promise<{ ok: boolean; item: GalleryItemDTO | null }> {
  return requestJson('/api/admin/gallery/import-x', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchAdminXSyncSourcesApi(): Promise<{ items: XSyncSourceDTO[] }> {
  return requestJson('/api/admin/gallery/x-sources')
}

export function createAdminXSyncSourceApi(payload: {
  handle: string
  displayName?: string
  autoPublish?: boolean
  note?: string
}): Promise<{ ok: boolean; source: XSyncSourceDTO | null }> {
  return requestJson('/api/admin/gallery/x-sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAdminXSyncSourceApi(
  id: string,
  payload: {
    displayName?: string
    autoPublish?: boolean
    enabled?: boolean
    note?: string
  }
): Promise<{ ok: boolean; source: XSyncSourceDTO | null }> {
  return requestJson(`/api/admin/gallery/x-sources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteAdminXSyncSourceApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/admin/gallery/x-sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function toggleGalleryLikeApi(
  itemId: string
): Promise<{ ok: boolean; liked: boolean; likeCount: number }> {
  return requestJson(`/api/gallery/items/${encodeURIComponent(itemId)}/like`, {
    method: 'POST',
  })
}

export function toggleGalleryBookmarkApi(
  itemId: string
): Promise<{ ok: boolean; bookmarked: boolean; bookmarkCount: number }> {
  return requestJson(`/api/gallery/items/${encodeURIComponent(itemId)}/bookmark`, {
    method: 'POST',
  })
}

export function fetchMyGalleryBookmarksApi(limit = 60, offset = 0): Promise<GalleryListResponse> {
  return requestJson(`/api/gallery/bookmarks?limit=${limit}&offset=${offset}`)
}

export function fetchGalleryCommentsApi(
  itemId: string
): Promise<{ items: GalleryCommentDTO[] }> {
  return requestJson(`/api/gallery/items/${encodeURIComponent(itemId)}/comments`)
}

export function createGalleryCommentApi(
  itemId: string,
  payload: { content: string; replyToId?: string | null }
): Promise<{ ok: boolean; comment: GalleryCommentDTO; commentCount: number }> {
  return requestJson(`/api/gallery/items/${encodeURIComponent(itemId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteGalleryCommentApi(
  commentId: string
): Promise<{ ok: boolean; commentCount: number }> {
  return requestJson(`/api/gallery/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  })
}

export function fetchAdminGalleryCommentsApi(q = ''): Promise<{ items: GalleryCommentDTO[] }> {
  const sp = new URLSearchParams()
  if (q.trim()) sp.set('q', q.trim())
  const qs = sp.toString()
  return requestJson(`/api/admin/gallery/comments${qs ? `?${qs}` : ''}`)
}

export function deleteAdminGalleryCommentApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/admin/gallery/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export interface CanvasProjectPayload {
  id: string
  name: string
  updatedAt: number
  bgPattern: 'dots' | 'grid' | 'blank'
  pan: { x: number; y: number }
  zoom: number
  nodes: unknown[]
  edges: unknown[]
}

export function fetchCloudCanvasProjectsApi(): Promise<{ projects: CanvasProjectPayload[] }> {
  return requestJson('/api/canvas/projects')
}

export function saveCloudCanvasProjectApi(
  project: CanvasProjectPayload
): Promise<{ ok: boolean; project: CanvasProjectPayload }> {
  return requestJson(`/api/canvas/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    body: JSON.stringify(project),
  })
}

export function deleteCloudCanvasProjectApi(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/canvas/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
