import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { adminGalleryRoutes } from './adminGallery'
import {
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  PROVIDER_ORDER,
  PROVIDER_SUPPORTED_RESOLUTIONS,
  SUPPLIER_AUTH_MODE_META,
  getEffectiveProfileCreditCost,
  mergeGenerationQueueConfig,
  mergePoseSanitizeConfig,
  mergePromptTemplate,
  mergeVisionFallbackConfig,
  normalizeProfileResolutions,
  normalizeSupplierAuthMode,
  normalizeSupplierModelIds,
  resolveProfileDefaultResolution,
  validatePoseSanitizeInput,
  type AdminJobsStatsSummary,
  type AdminOverviewPayload,
  type AdminOverviewRecentFailureItem,
  type AdminOverviewTrendPoint,
  type ImageProviderId,
  type PlatformConfig,
  type ProfileResolutionOption,
  type ReferenceDescriptionKind,
  type StudioResolution,
  type StylePresetItem,
  type SupplierAuthMode,
  type SupplierQueriedModel,
} from '../../shared/studio'
import {
  detectImageFormat,
  encryptSecret,
  hashPassword,
  maskApiKey,
  timingSafeEqualText,
  verifyPassword,
} from '../crypto'
import {
  ADMIN_SESSION_COOKIE_NAME,
  adjustUserCredits,
  computeQueuePositions,
  createRedeemCodesBatch,
  createSession,
  createUserWithBonus,
  deleteReferenceDescription,
  deleteSession,
  findReferenceDescriptionById,
  getAdminProviderSlots,
  getAdminWechatConfig,
  getPlatformConfig,
  getSuppliers,
  getUserWithOAuthById,
  listActiveQueueRows,
  listReferenceDescriptions,
  mapAdminUserRow,
  mapJobRow,
  mapLedgerRow,
  mapUserRow,
  markSupplierKeyCooldown,
  markSupplierKeySuccess,
  parseKeyIdsJson,
  parseProfileRow,
  reapStaleProcessingJobs,
  resolveProfileForGeneration,
  resolveSupplierKeyRuntimeCredential,
  resolveSupplierSecret,
  resolveVisionFallbackTargets,
  sanitizeStyleCategoriesInput,
  sanitizeStylePresetsInput,
  sanitizeStyleSubcategoriesInput,
  savePlatformConfig,
  saveWechatOAuthConfig,
  syncSupplierLegacyKeyMirror,
  updateReferenceDescriptionManual,
  updateReferenceDescriptionRegenerated,
  type ChannelRow,
  type JobRow,
  type ModelProfileRow,
  type ProviderRow,
  type SupplierKeyRow,
  type SupplierRow,
  type UserRow,
} from '../db'
import {
  clearRateLimits,
  formatRetryWait,
  getRequestClientIp,
  inspectRateLimits,
  recordRateLimitHit,
  type RateLimitDescriptor,
} from '../rateLimit'
import {
  clearAdminSessionCookie,
  requireAdmin,
  setAdminSessionCookie,
} from '../middleware'
import {
  getMioSyncStatus,
  getOutfitDbSyncStatus,
  syncMioArchive,
  syncOutfitDbArchive,
} from '../externalSync'
import {
  buildGeminiNativeEndpoint,
  buildSourceFromPreviewPath,
  devProxyAwareFetch,
  regenerateReferenceDescriptionFromPreview,
  resolveOrTranscribeReferenceDescription,
  saveManualReferenceDescriptionFromSource,
} from '../aiProviders'
import {
  cancelQueuedJobViaCoordinator,
  fetchQueueSnapshotViaCoordinator,
  forceCancelProcessingJobViaCoordinator,
  reconcileQueueViaCoordinator,
} from '../generationQueue'
import {
  buildCodexRequestHeaders,
  buildXaiOAuthRequestHeaders,
  claimDraftOAuthSessionsForSupplier,
  completeSupplierOAuthPkceFlow,
  importSupplierOAuthJson,
  isOAuthAuthMode,
  pollSupplierOAuthDeviceFlow,
  resolveDraftOAuthSessionCredential,
  resolveValidSupplierOAuthKey,
  startSupplierOAuthDeviceFlow,
  startSupplierOAuthPkceFlow,
  type OAuthProviderMode,
} from '../supplierOAuth'
import type { AppEnv, Env } from '../types'
import {
  isPrivateOrLocalHostname,
  parseIntSafe,
  readResponseTextWithLimit,
  sanitizeCallbackBaseUrl,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../validation'

export const adminRoutes = new Hono<AppEnv>()

const WAVESPEED_CHANNEL_PARAM_KEYS = [
  'wavespeedSyncMode',
  'wavespeedOutputFormat',
  'wavespeedSeed',
  'wavespeedResolution',
  'wavespeedRefMode',
] as const

const DREAMINA_CHANNEL_PARAM_KEYS = [
  'dreaminaRefMode',
  'dreaminaOutputQuality',
] as const

const ALLOWED_CHANNEL_PARAM_KEYS: Record<ImageProviderId, ReadonlySet<string>> = {
  gpt: new Set([
    'endpointMode',
    'size',
    'quality',
    'complexity',
    'inputFidelity',
    'background',
    'outputFormat',
    'moderation',
    ...WAVESPEED_CHANNEL_PARAM_KEYS,
    ...DREAMINA_CHANNEL_PARAM_KEYS,
  ]),
  gemini: new Set([
    'endpointMode',
    'authMode',
    'aspectRatio',
    'imageSize',
    ...WAVESPEED_CHANNEL_PARAM_KEYS,
    ...DREAMINA_CHANNEL_PARAM_KEYS,
  ]),
  grok: new Set([
    'endpointMode',
    'aspectRatio',
    'resolution',
    'quality',
    'responseFormat',
    ...WAVESPEED_CHANNEL_PARAM_KEYS,
    ...DREAMINA_CHANNEL_PARAM_KEYS,
  ]),
  muse: new Set([
    'endpointMode',
    'aspectRatio',
    'responseFormat',
    ...WAVESPEED_CHANNEL_PARAM_KEYS,
    ...DREAMINA_CHANNEL_PARAM_KEYS,
  ]),
  seedream: new Set([
    'endpointMode',
    'aspectRatio',
    'resolution',
    'responseFormat',
    ...WAVESPEED_CHANNEL_PARAM_KEYS,
    ...DREAMINA_CHANNEL_PARAM_KEYS,
  ]),
}

function sanitizeChannelParams(providerId: ImageProviderId, raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const allowed = ALLOWED_CHANNEL_PARAM_KEYS[providerId]
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) continue
    if (typeof v === 'string') out[k] = v.slice(0, 100)
    else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] =
        k === 'dreaminaSampleStrength'
          ? Math.max(0, Math.min(1, Math.round(v * 100) / 100))
          : Math.trunc(v)
    } else if (typeof v === 'boolean') out[k] = v
  }
  return out
}

async function listAllR2Objects(
  bucket: R2Bucket,
  prefix: string
): Promise<Array<{ key: string; size: number }>> {
  const out: Array<{ key: string; size: number }> = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) })
    for (const obj of res.objects || []) {
      out.push({ key: obj.key, size: obj.size || 0 })
    }
    if (!res.truncated || !res.cursor) break
    cursor = res.cursor
  }
  return out
}

function isLocalBootstrapRequest(c: Context<AppEnv>): boolean {
  try {
    const hostname = new URL(c.req.url).hostname.toLowerCase()
    const isLoopbackHost =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    if (!isLoopbackHost) return false
    const cfIp = (c.req.header('cf-connecting-ip') || '').trim().toLowerCase()
    return !cfIp || cfIp === '127.0.0.1' || cfIp === '::1'
  } catch {
    return false
  }
}

function extractStyleAssetKey(url: string | undefined): string | null {
  if (!url) return null
  const m = url.trim().match(/^\/api\/style-assets\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|gif))$/i)
  return m ? `styles/${m[1]}` : null
}

function buildRecent7DaysBuckets(): { days: string[]; map: Map<string, AdminOverviewTrendPoint>; sinceMs: number } {
  const tzOffsetMs = 8 * 60 * 60 * 1000
  const nowCst = new Date(Date.now() + tzOffsetMs)
  nowCst.setUTCHours(0, 0, 0, 0)
  const todayMidnightCst = nowCst.getTime()
  const sinceMs = todayMidnightCst - 6 * 24 * 60 * 60 * 1000 - tzOffsetMs
  const days: string[] = []
  const map = new Map<string, AdminOverviewTrendPoint>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayMidnightCst - i * 24 * 60 * 60 * 1000)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const dateKey = `${yyyy}-${mm}-${dd}`
    const label = `${mm}/${dd}`
    days.push(dateKey)
    map.set(dateKey, {
      date: dateKey,
      label,
      jobsTotal: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      creditsConsumed: 0,
    })
  }
  return { days, map, sinceMs }
}

adminRoutes.get('/me', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({
    user: c.get('adminUser'),
    frontendUser: c.get('user'),
  })
})

const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000
const ADMIN_LOGIN_LOCK_MS = 5 * 60 * 1000
const ADMIN_LOGIN_IP_MAX = 8
const ADMIN_LOGIN_ACCOUNT_MAX = 5

adminRoutes.post('/login', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const account =
    typeof body.account === 'string'
      ? body.account.trim()
      : typeof body.username === 'string'
        ? body.username.trim()
        : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!account || !password) {
    return c.json({ error: { message: '请输入管理员账号和密码' } }, 400)
  }

  const lower = account.toLowerCase()
  const now = Date.now()
  const rlDescriptors: RateLimitDescriptor[] = [
    {
      scope: 'admin_ip',
      identifier: getRequestClientIp(c),
      maxAttempts: ADMIN_LOGIN_IP_MAX,
      windowMs: ADMIN_LOGIN_WINDOW_MS,
      lockMs: ADMIN_LOGIN_LOCK_MS,
    },
    {
      scope: 'admin_acct',
      identifier: lower,
      maxAttempts: ADMIN_LOGIN_ACCOUNT_MAX,
      windowMs: ADMIN_LOGIN_WINDOW_MS,
      lockMs: ADMIN_LOGIN_LOCK_MS,
    },
  ]
  const rlState = await inspectRateLimits(c.env.DB, rlDescriptors, now)

  if (rlState.blocked) {
    c.header('Retry-After', String(rlState.retryAfterSec))
    return c.json(
      {
        error: {
          message: `管理端登录失败次数过多，请 ${formatRetryWait(rlState.retryAfterSec)} 后再试`,
        },
      },
      429
    )
  }

  const row = await c.env.DB.prepare(
    `SELECT u.*,
            oa.openid AS wechat_openid,
            oa.nickname AS wechat_nickname,
            oa.avatar_url AS wechat_avatar_url
     FROM users u
     LEFT JOIN oauth_accounts oa ON oa.user_id = u.id AND oa.provider = 'wechat_open'
     WHERE u.username_lower = ? OR u.email_lower = ?
     LIMIT 1`
  )
    .bind(lower, lower)
    .first<UserRow>()

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    await recordRateLimitHit(c.env.DB, rlDescriptors, rlState, now)
    return c.json({ error: { message: '账号或密码错误' } }, 401)
  }
  if (row.status !== 'active') {
    await recordRateLimitHit(c.env.DB, rlDescriptors, rlState, now)
    return c.json({ error: { message: '该账号已被停用，请联系管理员' } }, 403)
  }
  if (row.role !== 'admin') {
    await recordRateLimitHit(c.env.DB, rlDescriptors, rlState, now)
    return c.json({ error: { message: '该账号不具备管理员权限' } }, 403)
  }

  await clearRateLimits(c.env.DB, rlState.keys)

  const { rawToken } = await createSession(c.env.DB, row.id, c.req.header('user-agent'))
  setAdminSessionCookie(c, rawToken)
  c.header('Cache-Control', 'no-store')
  return c.json({ user: mapUserRow({ ...row, last_login_at: now }) })
})

adminRoutes.post('/session-from-frontend', async (c) => {
  const frontUser = c.get('user')
  if (!frontUser || frontUser.role !== 'admin' || frontUser.status !== 'active') {
    return c.json({ error: { message: '当前前台会话不具备管理员权限' } }, 403)
  }
  const { rawToken } = await createSession(c.env.DB, frontUser.id, c.req.header('user-agent'))
  setAdminSessionCookie(c, rawToken)
  c.header('Cache-Control', 'no-store')
  return c.json({ user: frontUser })
})

adminRoutes.post('/logout', async (c) => {
  const adminToken = getCookie(c, ADMIN_SESSION_COOKIE_NAME)
  await deleteSession(c.env.DB, adminToken)
  clearAdminSessionCookie(c)
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true })
})

adminRoutes.get('/bootstrap-status', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`
  ).first<{ cnt: number }>()
  const needsSetup = (row?.cnt ?? 0) === 0
  const envToken = (c.env.BOOTSTRAP_SETUP_TOKEN || '').trim()
  const requiresSetupToken = Boolean(envToken)
  const localAllowed = isLocalBootstrapRequest(c)
  const remoteBlocked = needsSetup && !requiresSetupToken && !localAllowed
  c.header('Cache-Control', 'no-store')
  return c.json({ needsSetup, requiresSetupToken, remoteBlocked })
})

adminRoutes.post('/bootstrap', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`
  ).first<{ cnt: number }>()
  if ((row?.cnt ?? 0) > 0) {
    return c.json({ error: { message: '系统已存在管理员账号，请使用登录表单进入' } }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const envToken = (c.env.BOOTSTRAP_SETUP_TOKEN || '').trim()
  if (envToken) {
    const providedToken = typeof body.setupToken === 'string' ? body.setupToken.trim() : ''
    if (!providedToken || !(await timingSafeEqualText(providedToken, envToken))) {
      return c.json({ error: { message: '初始化安全口令不正确' } }, 403)
    }
  } else if (!isLocalBootstrapRequest(c)) {
    return c.json(
      {
        error: {
          message:
            '公网环境禁止无口令初始化管理员，请先配置 BOOTSTRAP_SETUP_TOKEN 或 BOOTSTRAP_ADMIN_USERNAME/PASSWORD Secret',
        },
      },
      403
    )
  }

  const username = validateUsername(body.username)
  const password = validatePassword(body.password)
  if (!username || !password) {
    return c.json({ error: { message: '管理员账号需 3~32 位，密码需 6~128 位' } }, 400)
  }

  const passwordHash = await hashPassword(password)
  const user = await createUserWithBonus(c.env.DB, {
    id: crypto.randomUUID(),
    username,
    email: null,
    displayName: username,
    passwordHash,
    role: 'admin',
    initialCredits: 1000,
    bonusNote: '首个管理员初始化赠送',
  })

  const { rawToken } = await createSession(c.env.DB, user.id, c.req.header('user-agent'))
  setAdminSessionCookie(c, rawToken)
  c.header('Cache-Control', 'no-store')
  return c.json({ user }, 201)
})

adminRoutes.use('*', requireAdmin)

adminRoutes.route('/gallery', adminGalleryRoutes)

adminRoutes.get('/overview', async (c) => {
  await reapStaleProcessingJobs(c.env.DB)
  const { days, map: trendMap, sinceMs } = buildRecent7DaysBuckets()
  const staleWarningCutoff = Date.now() - 2 * 60 * 1000

  const [
    usersStats,
    ledgerStats,
    jobsStats,
    redeemStats,
    supplierStats,
    profileStats,
    channelStats,
    assetsStats,
    platformCfg,
    recentJobsRes,
    recentFailuresRes,
    staleRow,
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_total
       FROM users`
    ).first<{ total: number; active_total: number | null }>(),
    c.env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('register_bonus', 'redeem_code', 'admin_adjust') AND delta > 0 THEN delta ELSE 0 END), 0) AS issued,
         COALESCE(SUM(CASE WHEN type = 'generate_deduct' THEN -delta ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN type = 'generate_refund' THEN delta ELSE 0 END), 0) AS net_consumed
       FROM credit_ledger`
    ).first<{ issued: number; net_consumed: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
              SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued
       FROM generation_jobs`
    ).first<{
      total: number
      succeeded: number | null
      failed: number | null
      processing: number | null
      queued: number | null
    }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM redeem_codes`).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM suppliers`).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM model_profiles`).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM provider_channels`).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM uploaded_assets) + (SELECT COUNT(*) FROM generation_jobs WHERE result_r2_key IS NOT NULL) AS total_files,
         COALESCE((SELECT SUM(bytes) FROM uploaded_assets), 0) + COALESCE((SELECT SUM(result_bytes) FROM generation_jobs), 0) AS total_bytes`
    ).first<{ total_files: number; total_bytes: number }>(),
    getPlatformConfig(c.env.DB),
    c.env.DB.prepare(
      `SELECT created_at, status, credits_cost, credits_refunded
       FROM generation_jobs
       WHERE created_at >= ?`
    )
      .bind(sinceMs)
      .all<{ created_at: number; status: string; credits_cost: number; credits_refunded: number }>(),
    c.env.DB.prepare(
      `SELECT j.id, j.provider, j.profile_name, j.channel_name, j.supplier_name, j.error_message, j.created_at, u.username
       FROM generation_jobs j
       LEFT JOIN users u ON u.id = j.user_id
       WHERE j.status = 'failed'
       ORDER BY j.created_at DESC
       LIMIT 5`
    ).all<{
      id: string
      provider: ImageProviderId
      profile_name: string | null
      channel_name: string | null
      supplier_name: string | null
      error_message: string | null
      created_at: number
      username: string | null
    }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM generation_jobs WHERE status = 'processing' AND COALESCE(started_at, created_at) < ?`
    )
      .bind(staleWarningCutoff)
      .first<{ cnt: number }>(),
  ])

  const tzOffsetMs = 8 * 60 * 60 * 1000
  for (const job of recentJobsRes.results || []) {
    const d = new Date(job.created_at + tzOffsetMs)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const pt = trendMap.get(key)
    if (!pt) continue
    pt.jobsTotal += 1
    if (job.status === 'succeeded') pt.jobsSucceeded += 1
    else if (job.status === 'failed') pt.jobsFailed += 1
    pt.creditsConsumed += Math.max(0, (job.credits_cost || 0) - (job.credits_refunded || 0))
  }

  const trend7d = days.map((k) => trendMap.get(k)!)
  const recentFailures: AdminOverviewRecentFailureItem[] = (recentFailuresRes.results || []).map((r) => ({
    id: r.id,
    username: r.username || '未知用户',
    provider: r.provider,
    profileName: r.profile_name,
    channelName: r.channel_name,
    supplierName: r.supplier_name,
    errorMessage: r.error_message || '未知错误',
    createdAt: r.created_at,
  }))

  const payload: AdminOverviewPayload = {
    usersTotal: usersStats?.total ?? 0,
    activeUsersTotal: usersStats?.active_total ?? 0,
    creditsIssuedTotal: ledgerStats?.issued ?? 0,
    creditsConsumedTotal: Math.max(0, ledgerStats?.net_consumed ?? 0),
    jobsTotal: jobsStats?.total ?? 0,
    jobsSucceeded: jobsStats?.succeeded ?? 0,
    jobsFailed: jobsStats?.failed ?? 0,
    jobsProcessing: jobsStats?.processing ?? 0,
    jobsQueued: jobsStats?.queued ?? 0,
    redeemCodesTotal: redeemStats?.total ?? 0,
    suppliersTotal: supplierStats?.total ?? 0,
    profilesTotal: profileStats?.total ?? 0,
    channelsTotal: channelStats?.total ?? 0,
    r2AssetsTotal: assetsStats?.total_files ?? 0,
    r2TotalBytes: assetsStats?.total_bytes ?? 0,
    encryptionConfigured: Boolean(c.env.APP_ENCRYPTION_KEY?.trim()),
    allowRegistration: platformCfg.allowRegistration,
    trend7d,
    recentFailures,
    staleProcessingCount: staleRow?.cnt ?? 0,
  }

  c.header('Cache-Control', 'no-store')
  return c.json(payload)
})

// ---------------------------------------------------------------------------
// 供应商管理 (Suppliers & Key Pools)
// ---------------------------------------------------------------------------

interface ParsedKeyInputItem {
  label: string
  apiKey: string
}

function parseBatchApiKeysInput(body: Record<string, unknown>): ParsedKeyInputItem[] {
  const result: ParsedKeyInputItem[] = []
  const seen = new Set<string>()
  const pushKey = (rawKey: unknown, rawLabel?: unknown) => {
    if (typeof rawKey !== 'string') return
    const apiKey = rawKey.trim()
    if (!apiKey || seen.has(apiKey)) return
    seen.add(apiKey)
    const label = typeof rawLabel === 'string' ? rawLabel.trim().slice(0, 40) : ''
    result.push({ label, apiKey })
  }

  if (Array.isArray(body.keys)) {
    for (const item of body.keys) {
      if (typeof item === 'string') {
        pushKey(item)
      } else if (item && typeof item === 'object') {
        const rec = item as { apiKey?: unknown; label?: unknown }
        pushKey(rec.apiKey, rec.label)
      }
    }
  }

  if (typeof body.rawKeysText === 'string' && body.rawKeysText.trim()) {
    const lines = body.rawKeysText.split(/\r?\n/)
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      // 支持 `备注|sk-xxx`、`备注\tsk-xxx`、`备注,sk-xxx` 或纯 `sk-xxx`
      const sepMatch = line.match(/^([^|\t,]{1,40})[|\t,]\s*(.+)$/)
      if (sepMatch) {
        pushKey(sepMatch[2], sepMatch[1])
      } else {
        pushKey(line)
      }
    }
  }

  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    pushKey(body.apiKey, body.keyLabel ?? body.label)
  }

  return result
}

async function insertSupplierKeysDedup(
  env: Env,
  supplierId: string,
  items: ParsedKeyInputItem[]
): Promise<{ addedCount: number; skippedCount: number }> {
  if (items.length === 0) return { addedCount: 0, skippedCount: 0 }

  const existingRows = await env.DB.prepare(
    `SELECT api_key_encrypted FROM supplier_keys WHERE supplier_id = ?`
  )
    .bind(supplierId)
    .all<{ api_key_encrypted: string }>()

  const existingPlainSet = new Set<string>()
  for (const row of existingRows.results || []) {
    const plain = await resolveSupplierSecret(row.api_key_encrypted, env)
    if (plain) existingPlainSet.add(plain)
  }

  const now = Date.now()
  const stmts: D1PreparedStatement[] = []
  let addedCount = 0
  let skippedCount = 0
  let seq = (existingRows.results || []).length

  for (const item of items) {
    if (existingPlainSet.has(item.apiKey)) {
      skippedCount += 1
      continue
    }
    existingPlainSet.add(item.apiKey)
    seq += 1
    const label = item.label || `密钥 #${seq}`
    const encrypted = await encryptSecret(item.apiKey, env.APP_ENCRYPTION_KEY)
    const hint = maskApiKey(item.apiKey)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO supplier_keys (
          id, supplier_id, label, api_key_encrypted, api_key_hint, enabled,
          cooldown_until, last_error, last_used_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 0, '', 0, ?, ?)`
      ).bind(crypto.randomUUID(), supplierId, label, encrypted, hint, now, now)
    )
    addedCount += 1
  }

  if (stmts.length > 0) {
    await env.DB.batch(stmts)
    await syncSupplierLegacyKeyMirror(env.DB, supplierId)
  }
  return { addedCount, skippedCount }
}

function isGoogleVertexHostname(host: string): boolean {
  const lower = host.toLowerCase()
  return lower === 'aiplatform.googleapis.com' || lower.endsWith('-aiplatform.googleapis.com')
}

function buildVertexCountTokensUrl(baseUrl: string, model: string): string {
  const { endpointUrl } = buildGeminiNativeEndpoint(baseUrl, model)
  return endpointUrl.replace(/:(?:stream)?generateContent(?=\?|$)/i, ':countTokens')
}

async function readUpstreamErrorDetail(
  resp: Response
): Promise<{ detail: string; isInvalidKey: boolean }> {
  try {
    const text = await readResponseTextWithLimit(resp, 256 * 1024)
    const lower = text.toLowerCase()
    const isInvalidKey =
      lower.includes('api_key_invalid') ||
      lower.includes('api key not valid') ||
      lower.includes('api key expired') ||
      lower.includes('invalid api key')
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown }
      const rawMsg = parsed?.error?.message ?? parsed?.message
      if (typeof rawMsg === 'string' && rawMsg.trim()) {
        return { detail: rawMsg.trim().slice(0, 160), isInvalidKey }
      }
    } catch {
      // ignore non-json error body
    }
    return { detail: text.trim().slice(0, 160), isInvalidKey }
  } catch {
    return { detail: '', isInvalidKey: false }
  }
}

type ProbeSupplierResult = {
  ok: boolean
  status: number | null
  latencyMs: number
  message: string
  isAuthError?: boolean
}

function formatProbeFailureMessage(
  status: number,
  detail: string,
  isInvalidKey: boolean
): { message: string; isAuthError: boolean } {
  if (status === 401 || status === 403 || isInvalidKey) {
    return {
      isAuthError: true,
      message: detail
        ? `鉴权失败：密钥无效或无权限 (HTTP ${status}：${detail})`
        : `鉴权失败：密钥无效或无权限 (HTTP ${status})`,
    }
  }
  return {
    isAuthError: false,
    message: detail ? `上游返回状态 HTTP ${status}：${detail}` : `上游返回状态 HTTP ${status}`,
  }
}

async function probeVertexSupplierApiKey(
  baseUrl: string,
  apiKey: string,
  env: Env,
  probeModels?: string[]
): Promise<ProbeSupplierResult> {
  // Vertex AI Express Mode (AQ.A...) 禁用 /models 列表接口且拒绝 Bearer，改用零费用的 :countTokens 探测；
  // 新建 GCP 项目可能已下线 2.5 系列模型，因此优先使用供应商绑定/常用新模型，遇到 404 自动顺延尝试
  const candidates = Array.from(
    new Set(
      [
        ...(probeModels || []),
        'gemini-4-hydrogen',
        'gemini-3.1-flash-image',
        'gemini-3-pro-image',
        'gemini-3.1-flash-lite-image',
        'gemini-nano-banana-2.1',
        'gemini-3.5-flash',
        'gemini-3-flash',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
      ]
        .map((m) => m.trim())
        .filter(Boolean)
    )
  ).slice(0, 12)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (/^ya29\./i.test(apiKey)) {
    headers.Authorization = `Bearer ${apiKey}`
  } else {
    headers['x-goog-api-key'] = apiKey
  }
  const probeBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
  })

  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i]
    const hasFallback = i < candidates.length - 1
    const probeUrl = buildVertexCountTokensUrl(baseUrl, model)
    const started = Date.now()
    try {
      const resp = await devProxyAwareFetch(
        probeUrl,
        {
          method: 'POST',
          headers,
          body: probeBody,
          signal: AbortSignal.timeout(10_000),
        },
        env,
        10_000
      )
      const latencyMs = Date.now() - started
      if (resp.ok) {
        return {
          ok: true,
          status: resp.status,
          latencyMs,
          message: `连接成功 (HTTP ${resp.status})`,
        }
      }

      const { detail, isInvalidKey } = await readUpstreamErrorDetail(resp)
      if (!isInvalidKey && (resp.status === 404 || resp.status === 400) && hasFallback) {
        continue
      }

      const formatted = formatProbeFailureMessage(resp.status, detail, isInvalidKey)
      return {
        ok: false,
        status: resp.status,
        latencyMs,
        message: formatted.message,
        isAuthError: formatted.isAuthError,
      }
    } catch (err) {
      const latencyMs = Date.now() - started
      const message =
        err instanceof Error && err.name === 'TimeoutError'
          ? '连接超时（>10s）'
          : err instanceof Error
            ? `网络不可达：${err.message}`
            : '连通测试失败'
      return { ok: false, status: null, latencyMs, message }
    }
  }

  return { ok: false, status: null, latencyMs: 0, message: '连通测试失败' }
}

async function probeSupplierApiKey(
  baseUrl: string,
  parsedUrl: URL,
  apiKey: string,
  env: Env,
  options?: { authMode?: SupplierAuthMode; accountId?: string; probeModels?: string[] }
): Promise<ProbeSupplierResult> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '')
  const host = parsedUrl.hostname.toLowerCase()
  const authMode = options?.authMode || 'api_key'

  if (authMode === 'api_key' && isGoogleVertexHostname(host)) {
    return probeVertexSupplierApiKey(cleanBase, apiKey, env, options?.probeModels)
  }

  let headers: Record<string, string> = { Accept: 'application/json' }
  let probeUrl: string
  if (authMode === 'oauth_openai_codex' || /chatgpt\.com\/backend-api\/codex/i.test(cleanBase)) {
    probeUrl = /\/models$/i.test(cleanBase)
      ? `${cleanBase}?client_version=0.162.1`
      : `${cleanBase}/models?client_version=0.162.1`
    headers = buildCodexRequestHeaders(apiKey, options?.accountId, { accept: 'application/json' })
  } else if (authMode === 'oauth_xai' || host.includes('cli-chat-proxy.grok.com')) {
    probeUrl = /\/v\d+(beta\d*)?$/i.test(cleanBase)
      ? `${cleanBase}/models`
      : `${cleanBase}/v1/models`
    headers = buildXaiOAuthRequestHeaders(apiKey)
  } else if (host.includes('generativelanguage.googleapis.com')) {
    if (/\/models$/i.test(cleanBase)) {
      probeUrl = cleanBase
    } else if (/\/v1(beta|alpha)?$/i.test(cleanBase)) {
      probeUrl = `${cleanBase}/models`
    } else {
      probeUrl = `${cleanBase}/v1beta/models`
    }
    if (/^ya29\./i.test(apiKey)) {
      headers.Authorization = `Bearer ${apiKey}`
    } else {
      headers['x-goog-api-key'] = apiKey
    }
  } else if (host.includes('wavespeed.ai')) {
    probeUrl = `${parsedUrl.origin}/api/v3/balance`
    headers.Authorization = `Bearer ${apiKey}`
  } else {
    probeUrl = /\/v\d+(beta\d*)?$/i.test(cleanBase)
      ? `${cleanBase}/models`
      : `${cleanBase}/v1/models`
    headers.Authorization = `Bearer ${apiKey}`
  }

  const started = Date.now()
  try {
    const resp = await devProxyAwareFetch(
      probeUrl,
      {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(12_000),
      },
      env,
      12_000
    )
    const latencyMs = Date.now() - started
    if (resp.ok) {
      return {
        ok: true,
        status: resp.status,
        latencyMs,
        message: `连接成功 (HTTP ${resp.status})`,
      }
    }
    const { detail, isInvalidKey } = await readUpstreamErrorDetail(resp)
    const formatted = formatProbeFailureMessage(resp.status, detail, isInvalidKey)
    return {
      ok: false,
      status: resp.status,
      latencyMs,
      message: formatted.message,
      isAuthError: formatted.isAuthError,
    }
  } catch (err) {
    const latencyMs = Date.now() - started
    const message =
      err instanceof Error && err.name === 'TimeoutError'
        ? '连接超时（>12s）'
        : err instanceof Error
          ? `网络不可达：${err.message}`
          : '连通测试失败'
    return { ok: false, status: null, latencyMs, message }
  }
}

function buildModelsQueryCandidates(
  parsedUrl: URL,
  authMode: SupplierAuthMode = 'api_key'
): Array<{ url: string; style: 'gemini' | 'openai' | 'codex' | 'xai_oauth' }> {
  const pathname = parsedUrl.pathname.replace(/\/+$/, '')
  const baseNoQuery = `${parsedUrl.origin}${pathname}`
  const search = parsedUrl.search || ''
  const host = parsedUrl.hostname.toLowerCase()

  if (authMode === 'oauth_openai_codex' || /chatgpt\.com$/i.test(host)) {
    const modelsPath = /\/models$/i.test(pathname) ? baseNoQuery : `${baseNoQuery}/models`
    const qs = search ? `${search}&client_version=0.162.1` : '?client_version=0.162.1'
    return [{ url: `${modelsPath}${qs}`, style: 'codex' }]
  }

  if (authMode === 'oauth_xai' || host.includes('cli-chat-proxy.grok.com')) {
    const url = /\/v\d+(beta\d*)?$/i.test(pathname)
      ? `${baseNoQuery}/models${search}`
      : `${baseNoQuery}/v1/models${search}`
    return [{ url, style: 'xai_oauth' }]
  }

  if (host.includes('generativelanguage.googleapis.com')) {
    const url = /\/models$/i.test(pathname)
      ? `${baseNoQuery}${search}`
      : /\/v\d+(beta\d*|alpha)?$/i.test(pathname)
        ? `${baseNoQuery}/models${search}`
        : `${baseNoQuery}/v1beta/models${search}`
    return [{ url, style: 'gemini' }]
  }

  if (isGoogleVertexHostname(host)) {
    let url: string
    if (/\/models$/i.test(pathname)) {
      url = `${baseNoQuery}${search}`
    } else if (/\/publishers\/[^/]+$/i.test(pathname)) {
      url = `${baseNoQuery}/models${search}`
    } else if (/^\/(v1|v1beta1|v1beta|v1alpha)(?:\/.*)?$/i.test(pathname)) {
      url = `${baseNoQuery}/publishers/google/models${search}`
    } else {
      url = `${baseNoQuery}/v1/publishers/google/models${search}`
    }
    return [{ url, style: 'openai' }]
  }

  if (/\/models$/i.test(pathname)) {
    return [{ url: `${baseNoQuery}${search}`, style: 'openai' }]
  }

  const candidates: Array<{ url: string; style: 'gemini' | 'openai' | 'codex' | 'xai_oauth' }> = [
    { url: `${baseNoQuery}/models${search}`, style: 'openai' },
  ]
  if (!/\/v\d+(beta\d*|alpha)?$/i.test(pathname)) {
    candidates.push({ url: `${baseNoQuery}/v1/models${search}`, style: 'openai' })
  }
  return candidates
}

function extractQueriedModelItems(items: unknown[]): SupplierQueriedModel[] {
  const seen = new Set<string>()
  const result: SupplierQueriedModel[] = []
  for (const item of items) {
    let rawId = ''
    let ownedBy: string | undefined
    if (typeof item === 'string') {
      rawId = item
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      if (typeof obj.id === 'string') {
        rawId = obj.id
      } else if (typeof obj.slug === 'string') {
        rawId = obj.slug
      } else if (typeof obj.name === 'string') {
        rawId = obj.name.replace(/^models\//i, '')
      }
      if (typeof obj.owned_by === 'string' && obj.owned_by.trim()) {
        ownedBy = obj.owned_by.trim().slice(0, 60)
      }
    }
    const id = rawId.trim().slice(0, 160)
    if (!id || id === 'custom' || seen.has(id)) continue
    seen.add(id)
    result.push(ownedBy ? { id, ownedBy } : { id })
    if (result.length >= 2000) break
  }
  result.sort((a, b) => a.id.localeCompare(b.id))
  return result
}

function parseQueriedModelsPayload(payload: unknown): SupplierQueriedModel[] | null {
  if (Array.isArray(payload)) {
    return extractQueriedModelItems(payload)
  }
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  if (Array.isArray(rec.data)) {
    return extractQueriedModelItems(rec.data)
  }
  if (Array.isArray(rec.models)) {
    return extractQueriedModelItems(rec.models)
  }
  return null
}

async function querySupplierModelsEndpoint(
  parsedUrl: URL,
  apiKey: string,
  env: Env,
  options?: { authMode?: SupplierAuthMode; accountId?: string }
): Promise<{
  ok: boolean
  status: number | null
  latencyMs: number
  endpointUrl: string
  models: SupplierQueriedModel[]
  message: string
}> {
  if (isGoogleVertexHostname(parsedUrl.hostname) && !/^ya29\./i.test(apiKey)) {
    return {
      ok: false,
      status: null,
      latencyMs: 0,
      endpointUrl: parsedUrl.toString(),
      models: [],
      message:
        'Google Vertex AI Express 接口暂不支持通过 API Key 拉取全量模型目录，请直接使用下方「常用模型」或手动输入添加',
    }
  }

  const candidates = buildModelsQueryCandidates(parsedUrl, options?.authMode || 'api_key')
  let lastFailure: {
    status: number | null
    latencyMs: number
    endpointUrl: string
    message: string
  } | null = null

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]
    const hasFallback = i < candidates.length - 1
    let headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) {
      if (candidate.style === 'codex') {
        headers = buildCodexRequestHeaders(apiKey, options?.accountId, {
          accept: 'application/json',
        })
      } else if (candidate.style === 'xai_oauth') {
        headers = buildXaiOAuthRequestHeaders(apiKey)
      } else if (candidate.style === 'gemini' && !/^ya29\./i.test(apiKey)) {
        headers['x-goog-api-key'] = apiKey
      } else {
        headers.Authorization = `Bearer ${apiKey}`
      }
    }

    const started = Date.now()
    try {
      const resp = await devProxyAwareFetch(
        candidate.url,
        {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(15_000),
        },
        env,
        15_000
      )
      const latencyMs = Date.now() - started

      if (resp.status === 401 || resp.status === 403) {
        return {
          ok: false,
          status: resp.status,
          latencyMs,
          endpointUrl: candidate.url,
          models: [],
          message: apiKey
            ? `鉴权失败：密钥无效或无权限 (HTTP ${resp.status})`
            : `该供应商需要访问密钥才能查询模型列表 (HTTP ${resp.status})`,
        }
      }

      if (!resp.ok) {
        let upstreamDetail = ''
        try {
          const errText = await readResponseTextWithLimit(resp, 256 * 1024)
          const errJson = JSON.parse(errText) as { error?: { message?: unknown }; message?: unknown }
          const rawMsg = errJson?.error?.message ?? errJson?.message
          if (typeof rawMsg === 'string' && rawMsg.trim()) {
            upstreamDetail = `：${rawMsg.trim().slice(0, 140)}`
          }
        } catch {
          // ignore non-json error body
        }
        lastFailure = {
          status: resp.status,
          latencyMs,
          endpointUrl: candidate.url,
          message: `查询模型接口返回 HTTP ${resp.status}${upstreamDetail}`,
        }
        if (hasFallback) continue
        return { ...lastFailure, ok: false, models: [] }
      }

      const rawText = await readResponseTextWithLimit(resp, 2 * 1024 * 1024)
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(rawText)
      } catch {
        lastFailure = {
          status: resp.status,
          latencyMs,
          endpointUrl: candidate.url,
          message: '上游未返回有效的 JSON 模型列表',
        }
        if (hasFallback) continue
        return { ...lastFailure, ok: false, models: [] }
      }

      const models = parseQueriedModelsPayload(parsedJson)
      if (models === null) {
        lastFailure = {
          status: resp.status,
          latencyMs,
          endpointUrl: candidate.url,
          message: '上游返回格式不兼容（未识别到 data 或 models 模型数组）',
        }
        if (hasFallback) continue
        return { ...lastFailure, ok: false, models: [] }
      }

      if (candidate.style === 'xai_oauth') {
        const seen = new Set(models.map((m) => m.id))
        for (const imgModel of [
          'grok-imagine-image-2.0',
          'grok-imagine-image-quality',
          'grok-imagine-image',
        ]) {
          if (!seen.has(imgModel)) {
            models.push({ id: imgModel, ownedBy: 'xAI (生图)' })
          }
        }
        models.sort((a, b) => a.id.localeCompare(b.id))
      }

      return {
        ok: true,
        status: resp.status,
        latencyMs,
        endpointUrl: candidate.url,
        models,
        message: `已获取 ${models.length} 个模型`,
      }
    } catch (err) {
      const latencyMs = Date.now() - started
      lastFailure = {
        status: null,
        latencyMs,
        endpointUrl: candidate.url,
        message:
          err instanceof Error && err.name === 'TimeoutError'
            ? '查询模型超时（>15s）'
            : err instanceof Error
              ? `网络不可达：${err.message}`
              : '查询模型失败',
      }
      if (hasFallback) continue
      return { ...lastFailure, ok: false, models: [] }
    }
  }

  return {
    ok: false,
    status: lastFailure?.status ?? null,
    latencyMs: lastFailure?.latencyMs ?? 0,
    endpointUrl: lastFailure?.endpointUrl ?? '',
    models: [],
    message: lastFailure?.message ?? '查询模型失败',
  }
}

adminRoutes.post('/suppliers/query-models', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : ''
  const existingSupplier = supplierId
    ? await c.env.DB.prepare(
        `SELECT id, auth_mode, base_url, api_key_encrypted FROM suppliers WHERE id = ?`
      )
        .bind(supplierId)
        .first<{ id: string; auth_mode?: string; base_url: string; api_key_encrypted: string }>()
    : null

  if (supplierId && !existingSupplier) {
    return c.json({ error: { message: '供应商不存在' } }, 404)
  }

  const authMode = normalizeSupplierAuthMode(
    body.authMode !== undefined ? body.authMode : existingSupplier?.auth_mode
  )

  const rawBaseUrl =
    typeof body.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim().replace(/\/+$/, '')
      : existingSupplier?.base_url?.trim().replace(/\/+$/, '') ||
        SUPPLIER_AUTH_MODE_META[authMode].defaultBaseUrl

  if (!/^https:\/\//i.test(rawBaseUrl)) {
    return c.json({ error: { message: '接口基础地址必须以 https:// 开头' } }, 400)
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawBaseUrl)
  } catch {
    return c.json({ error: { message: '接口基础地址格式无效' } }, 400)
  }
  if (parsedUrl.protocol !== 'https:' || isPrivateOrLocalHostname(parsedUrl.hostname)) {
    return c.json({ error: { message: '仅支持公网 HTTPS 接口查询模型列表' } }, 400)
  }

  let apiKey = parseBatchApiKeysInput(body)[0]?.apiKey || ''
  let accountId: string | undefined
  if (!apiKey && existingSupplier) {
    const keyRows = await c.env.DB.prepare(
      `SELECT id, credential_type, api_key_encrypted, oauth_account_id FROM supplier_keys
       WHERE supplier_id = ?
       ORDER BY enabled DESC, created_at ASC
       LIMIT 3`
    )
      .bind(existingSupplier.id)
      .all<{
        id: string
        credential_type?: string
        api_key_encrypted: string
        oauth_account_id?: string
      }>()
    for (const row of keyRows.results || []) {
      const cred = await resolveSupplierKeyRuntimeCredential(c.env, {
        id: row.id,
        credentialType: row.credential_type,
        apiKeyEncrypted: row.api_key_encrypted,
        oauthAccountId: row.oauth_account_id,
      })
      if (cred) {
        apiKey = cred.apiKey
        accountId = cred.oauthAccountId
        break
      }
    }
    if (!apiKey && existingSupplier.api_key_encrypted) {
      const cred = await resolveSupplierKeyRuntimeCredential(c.env, {
        apiKeyEncrypted: existingSupplier.api_key_encrypted,
      })
      if (cred) {
        apiKey = cred.apiKey
        accountId = cred.oauthAccountId
      }
    }
  }

  if (!apiKey && Array.isArray(body.oauthSessionIds)) {
    for (const rawSid of body.oauthSessionIds) {
      if (typeof rawSid !== 'string' || !rawSid.trim()) continue
      const draftCred = await resolveDraftOAuthSessionCredential(c.env, rawSid.trim())
      if (draftCred) {
        apiKey = draftCred.apiKey
        accountId = draftCred.accountId
        break
      }
    }
  }

  const res = await querySupplierModelsEndpoint(parsedUrl, apiKey, c.env, { authMode, accountId })
  c.header('Cache-Control', 'no-store')
  return c.json(res)
})

adminRoutes.get('/suppliers', async (c) => {
  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
})

adminRoutes.post('/suppliers', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const authMode = normalizeSupplierAuthMode(body.authMode)
  const rawBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : ''
  const baseUrl =
    rawBaseUrl && rawBaseUrl !== 'https:' && rawBaseUrl !== 'https://'
      ? rawBaseUrl
      : SUPPLIER_AUTH_MODE_META[authMode].defaultBaseUrl
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : 1
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : ''
  const normalizedModels = normalizeSupplierModelIds(body.models)
  const effectiveModels =
    normalizedModels.length > 0
      ? normalizedModels
      : [...SUPPLIER_AUTH_MODE_META[authMode].defaultModels]
  const modelsJson = JSON.stringify(effectiveModels)
  const parsedKeys = authMode === 'api_key' ? parseBatchApiKeysInput(body) : []

  if (!name) {
    return c.json({ error: { message: '请填写供应商名称' } }, 400)
  }
  if (!/^https:\/\/.+/i.test(baseUrl)) {
    return c.json({ error: { message: '接口基础地址必须以 https:// 开头' } }, 400)
  }

  const now = Date.now()
  const supplierId = crypto.randomUUID()
  const firstKey = parsedKeys[0]
  const encrypted = firstKey
    ? await encryptSecret(firstKey.apiKey, c.env.APP_ENCRYPTION_KEY)
    : ''
  const hint = firstKey ? maskApiKey(firstKey.apiKey) : ''

  await c.env.DB.prepare(
    `INSERT INTO suppliers (
      id, name, auth_mode, base_url, api_key_encrypted, api_key_hint, models_json, enabled, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(supplierId, name, authMode, baseUrl, encrypted, hint, modelsJson, enabled, note, now, now)
    .run()

  let addedCount = 0
  let skippedCount = 0
  if (parsedKeys.length > 0) {
    const res = await insertSupplierKeysDedup(c.env, supplierId, parsedKeys)
    addedCount = res.addedCount
    skippedCount = res.skippedCount
  }
  if (isOAuthAuthMode(authMode) && Array.isArray(body.oauthSessionIds)) {
    const sidList = body.oauthSessionIds.filter((s): s is string => typeof s === 'string')
    if (sidList.length > 0) {
      const claimed = await claimDraftOAuthSessionsForSupplier(
        c.env,
        supplierId,
        authMode,
        sidList
      )
      addedCount += claimed.claimedCount
    }
  }

  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers, createdSupplierId: supplierId, addedCount, skippedCount }, 201)
})

adminRoutes.put('/suppliers/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(`SELECT * FROM suppliers WHERE id = ?`)
    .bind(id)
    .first<SupplierRow>()
  if (!existing) {
    return c.json({ error: { message: '供应商不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 60)
      : existing.name
  const authMode =
    body.authMode !== undefined
      ? normalizeSupplierAuthMode(body.authMode)
      : normalizeSupplierAuthMode(existing.auth_mode)
  const baseUrl =
    typeof body.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim().replace(/\/+$/, '')
      : existing.base_url
  if (!/^https:\/\//i.test(baseUrl)) {
    return c.json({ error: { message: '接口基础地址必须以 https:// 开头' } }, 400)
  }

  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : existing.note
  const modelsJson =
    body.models !== undefined
      ? JSON.stringify(normalizeSupplierModelIds(body.models))
      : existing.models_json || '[]'

  await c.env.DB.prepare(
    `UPDATE suppliers
     SET name = ?, auth_mode = ?, base_url = ?, models_json = ?, enabled = ?, note = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(name, authMode, baseUrl, modelsJson, enabled, note, Date.now(), id)
    .run()

  if (body.clearApiKey === true) {
    await c.env.DB.prepare(`DELETE FROM supplier_keys WHERE supplier_id = ?`).bind(id).run()
    await syncSupplierLegacyKeyMirror(c.env.DB, id)
  } else {
    const batchKeys = parseBatchApiKeysInput({
      keys: body.keys,
      rawKeysText: body.rawKeysText,
    })
    if (batchKeys.length > 0) {
      await insertSupplierKeysDedup(c.env, id, batchKeys)
    }

    if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      const plain = body.apiKey.trim()
      const currentKeys = await c.env.DB.prepare(
        `SELECT id FROM supplier_keys WHERE supplier_id = ? ORDER BY created_at ASC`
      )
        .bind(id)
        .all<{ id: string }>()
      const keyRows = currentKeys.results || []
      if (keyRows.length === 1) {
        const encrypted = await encryptSecret(plain, c.env.APP_ENCRYPTION_KEY)
        const hint = maskApiKey(plain)
        await c.env.DB.prepare(
          `UPDATE supplier_keys
           SET api_key_encrypted = ?, api_key_hint = ?, cooldown_until = 0, last_error = '', updated_at = ?
           WHERE id = ?`
        )
          .bind(encrypted, hint, Date.now(), keyRows[0].id)
          .run()
        await syncSupplierLegacyKeyMirror(c.env.DB, id)
      } else {
        await insertSupplierKeysDedup(c.env, id, [{ label: '', apiKey: plain }])
      }
    }
  }

  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
})

adminRoutes.post('/suppliers/:id/keys', async (c) => {
  const supplierId = c.req.param('id')
  const existing = await c.env.DB.prepare(`SELECT id FROM suppliers WHERE id = ?`)
    .bind(supplierId)
    .first<{ id: string }>()
  if (!existing) {
    return c.json({ error: { message: '供应商不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const items = parseBatchApiKeysInput(body)
  if (items.length === 0) {
    return c.json({ error: { message: '请填写或粘贴至少 1 个有效 API 密钥' } }, 400)
  }

  const { addedCount, skippedCount } = await insertSupplierKeysDedup(c.env, supplierId, items)
  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers, addedCount, skippedCount }, addedCount > 0 ? 201 : 200)
})

adminRoutes.put('/suppliers/:id/keys/:keyId', async (c) => {
  const supplierId = c.req.param('id')
  const keyId = c.req.param('keyId')
  const existing = await c.env.DB.prepare(
    `SELECT * FROM supplier_keys WHERE id = ? AND supplier_id = ?`
  )
    .bind(keyId, supplierId)
    .first<SupplierKeyRow>()
  if (!existing) {
    return c.json({ error: { message: '供应商密钥不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const label =
    typeof body.label === 'string' ? body.label.trim().slice(0, 40) : existing.label
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  let encrypted = existing.api_key_encrypted
  let hint = existing.api_key_hint
  let cooldownUntil = body.clearCooldown === true ? 0 : existing.cooldown_until
  let lastError = body.clearCooldown === true ? '' : existing.last_error

  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const plain = body.apiKey.trim()
    encrypted = await encryptSecret(plain, c.env.APP_ENCRYPTION_KEY)
    hint = maskApiKey(plain)
    cooldownUntil = 0
    lastError = ''
  }

  await c.env.DB.prepare(
    `UPDATE supplier_keys
     SET label = ?, api_key_encrypted = ?, api_key_hint = ?, enabled = ?,
         cooldown_until = ?, last_error = ?, updated_at = ?
     WHERE id = ? AND supplier_id = ?`
  )
    .bind(label, encrypted, hint, enabled, cooldownUntil, lastError, Date.now(), keyId, supplierId)
    .run()

  await syncSupplierLegacyKeyMirror(c.env.DB, supplierId)
  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
})

adminRoutes.delete('/suppliers/:id/keys/:keyId', async (c) => {
  const supplierId = c.req.param('id')
  const keyId = c.req.param('keyId')
  await c.env.DB.prepare(`DELETE FROM supplier_keys WHERE id = ? AND supplier_id = ?`)
    .bind(keyId, supplierId)
    .run()

  // 同时从引用该供应商且绑定了特定 Key 列表的渠道中移除已删除的 keyId
  const boundChannels = await c.env.DB.prepare(
    `SELECT id, key_ids_json FROM provider_channels WHERE supplier_id = ? AND key_ids_json != '[]'`
  )
    .bind(supplierId)
    .all<{ id: string; key_ids_json: string }>()
  for (const ch of boundChannels.results || []) {
    const parsed = parseKeyIdsJson(ch.key_ids_json)
    if (parsed.includes(keyId)) {
      const next = parsed.filter((id) => id !== keyId)
      await c.env.DB.prepare(
        `UPDATE provider_channels SET key_ids_json = ?, updated_at = ? WHERE id = ?`
      )
        .bind(JSON.stringify(next), Date.now(), ch.id)
        .run()
    }
  }

  await syncSupplierLegacyKeyMirror(c.env.DB, supplierId)
  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
})

adminRoutes.delete('/suppliers/:id', async (c) => {
  const id = c.req.param('id')
  const [ref, platform] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM provider_channels WHERE supplier_id = ?`)
      .bind(id)
      .first<{ cnt: number }>(),
    getPlatformConfig(c.env.DB),
  ])
  if ((ref?.cnt ?? 0) > 0) {
    return c.json(
      { error: { message: `该供应商正被 ${ref?.cnt} 个模型渠道引用，请先删除或切换对应渠道` } },
      409
    )
  }
  if (platform.visionFallback?.supplierId === id) {
    return c.json(
      { error: { message: '该供应商正被「图转文兜底库」引用，请先切换兜底供应商后再删除' } },
      409
    )
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM supplier_keys WHERE supplier_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM suppliers WHERE id = ?`).bind(id),
  ])
  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
})

adminRoutes.post('/suppliers/:id/test', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(`SELECT * FROM suppliers WHERE id = ?`)
    .bind(id)
    .first<SupplierRow>()
  if (!row) {
    return c.json({ error: { message: '供应商不存在' } }, 404)
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(row.base_url)
  } catch {
    return c.json({ error: { message: '供应商接口地址格式无效' } }, 400)
  }
  if (parsedUrl.protocol !== 'https:' || isPrivateOrLocalHostname(parsedUrl.hostname)) {
    return c.json({ error: { message: '仅支持公网 HTTPS 接口的连通性测试' } }, 400)
  }

  let requestedKeyId = ''
  try {
    const body = (await c.req.json()) as { keyId?: unknown }
    if (typeof body?.keyId === 'string') {
      requestedKeyId = body.keyId.trim()
    }
  } catch {
    // body optional
  }

  const keyRowsRes = requestedKeyId
    ? await c.env.DB.prepare(
        `SELECT * FROM supplier_keys WHERE supplier_id = ? AND id = ?`
      )
        .bind(id, requestedKeyId)
        .all<SupplierKeyRow>()
    : await c.env.DB.prepare(
        `SELECT * FROM supplier_keys WHERE supplier_id = ? AND enabled = 1 ORDER BY created_at ASC`
      )
        .bind(id)
        .all<SupplierKeyRow>()

  const keyRows = keyRowsRes.results || []

  const authMode = normalizeSupplierAuthMode(row.auth_mode)

  let probeModels: string[] | undefined
  if (authMode === 'api_key' && isGoogleVertexHostname(parsedUrl.hostname)) {
    const presetModels = (() => {
      try {
        return normalizeSupplierModelIds(JSON.parse(row.models_json || '[]'))
      } catch {
        return []
      }
    })()
    let linkedModels: string[] = []
    let fallbackGeminiModels: string[] = []
    try {
      const linkedRes = await c.env.DB.prepare(
        `SELECT CASE WHEN model = 'custom' AND custom_model != '' THEN custom_model ELSE model END AS effective_model
         FROM provider_channels
         WHERE supplier_id = ?
         ORDER BY enabled DESC, priority DESC, created_at ASC
         LIMIT 10`
      )
        .bind(id)
        .all<{ effective_model: string }>()
      linkedModels = (linkedRes.results || [])
        .map((r) => (r.effective_model || '').trim())
        .filter((m) => Boolean(m) && m !== 'custom')

      if (linkedModels.length === 0 && presetModels.length === 0) {
        const [platformCfg, globalGeminiRes] = await Promise.all([
          getPlatformConfig(c.env.DB).catch(() => null),
          c.env.DB.prepare(
            `SELECT CASE WHEN model = 'custom' AND custom_model != '' THEN custom_model ELSE model END AS effective_model
             FROM provider_channels
             WHERE provider_id = 'gemini' AND enabled = 1
             ORDER BY priority DESC, created_at ASC
             LIMIT 8`
          )
            .all<{ effective_model: string }>()
            .catch(() => ({ results: [] as { effective_model: string }[] })),
        ])
        const visionModel = platformCfg?.visionFallback?.model?.trim()
        fallbackGeminiModels = [
          ...(visionModel ? [visionModel] : []),
          ...(globalGeminiRes.results || [])
            .map((r) => (r.effective_model || '').trim())
            .filter((m) => Boolean(m) && m !== 'custom'),
        ]
      }
    } catch {
      linkedModels = []
      fallbackGeminiModels = []
    }
    probeModels = Array.from(new Set([...linkedModels, ...presetModels, ...fallbackGeminiModels]))
  }

  if (keyRows.length === 0) {
    if (requestedKeyId) {
      return c.json({ error: { message: '指定的供应商密钥不存在' } }, 404)
    }
    const legacyCred = row.api_key_encrypted
      ? await resolveSupplierKeyRuntimeCredential(c.env, { apiKeyEncrypted: row.api_key_encrypted })
      : null
    if (!legacyCred) {
      return c.json(
        {
          error: {
            message: isOAuthAuthMode(authMode)
              ? '该供应商尚未完成 OAuth 订阅账号授权'
              : '该供应商尚未配置可用的 API 密钥',
          },
        },
        400
      )
    }
    const res = await probeSupplierApiKey(row.base_url, parsedUrl, legacyCred.apiKey, c.env, {
      authMode,
      accountId: legacyCred.oauthAccountId,
      probeModels,
    })
    return c.json(res)
  }

  const probeTargets = keyRows.slice(0, 20)
  const results = await Promise.all(
    probeTargets.map(async (keyRow) => {
      const cred = await resolveSupplierKeyRuntimeCredential(c.env, {
        id: keyRow.id,
        credentialType: keyRow.credential_type,
        apiKeyEncrypted: keyRow.api_key_encrypted,
        oauthAccountId: keyRow.oauth_account_id,
      })
      if (!cred) {
        return {
          keyId: keyRow.id,
          label: keyRow.label || keyRow.api_key_hint,
          apiKeyHint: keyRow.api_key_hint,
          ok: false,
          status: null as number | null,
          latencyMs: 0,
          message:
            keyRow.credential_type === 'oauth_token'
              ? 'OAuth Token 解析或续期失败，请重新授权'
              : '密钥解密失败',
        }
      }
      const probe = await probeSupplierApiKey(row.base_url, parsedUrl, cred.apiKey, c.env, {
        authMode,
        accountId: cred.oauthAccountId,
        probeModels,
      })
      if (probe.ok) {
        await markSupplierKeySuccess(c.env.DB, keyRow.id).catch(() => {})
      } else if (
        probe.isAuthError ||
        probe.status === 401 ||
        probe.status === 402 ||
        probe.status === 403 ||
        probe.status === 429
      ) {
        const cooldownMs = probe.status === 429 ? 60_000 : 10 * 60_000
        await markSupplierKeyCooldown(c.env.DB, keyRow.id, cooldownMs, probe.message).catch(() => {})
      }
      return {
        keyId: keyRow.id,
        label: keyRow.label || keyRow.api_key_hint,
        apiKeyHint: keyRow.api_key_hint,
        ...probe,
      }
    })
  )

  if (results.length === 1) {
    const single = results[0]
    return c.json({
      ok: single.ok,
      status: single.status,
      latencyMs: single.latencyMs,
      message: single.message,
      results,
    })
  }

  const passCount = results.filter((r) => r.ok).length
  const avgLatency = Math.round(
    results.reduce((sum, r) => sum + r.latencyMs, 0) / Math.max(1, results.length)
  )
  return c.json({
    ok: passCount > 0,
    status: results.find((r) => r.ok)?.status ?? results[0]?.status ?? null,
    latencyMs: avgLatency,
    message: `批量测活完成：${passCount}/${results.length} 个凭证连通正常`,
    results,
  })
})

async function resolveOAuthRouteTarget(
  c: Context<AppEnv>,
  supplierIdParam: string | null,
  body: Record<string, unknown>
): Promise<{ supplierId: string | null; authMode: OAuthProviderMode } | Response> {
  const supplierId =
    supplierIdParam ||
    (typeof body.supplierId === 'string' && body.supplierId.trim() ? body.supplierId.trim() : null)

  if (supplierId) {
    const sup = await c.env.DB.prepare(`SELECT id, auth_mode FROM suppliers WHERE id = ? LIMIT 1`)
      .bind(supplierId)
      .first<{ id: string; auth_mode?: string }>()
    if (!sup) {
      return c.json({ error: { message: '供应商不存在' } }, 404)
    }
    const authMode = normalizeSupplierAuthMode(sup.auth_mode)
    if (!isOAuthAuthMode(authMode)) {
      return c.json({ error: { message: '当前供应商认证方式不是 OAuth 模式' } }, 400)
    }
    return { supplierId: sup.id, authMode }
  }

  const authMode = normalizeSupplierAuthMode(body.authMode)
  if (!isOAuthAuthMode(authMode)) {
    return c.json({ error: { message: '请先选择有效的 OAuth 认证方式' } }, 400)
  }
  return { supplierId: null, authMode }
}

async function handleOAuthDeviceStart(c: Context<AppEnv>, supplierIdParam: string | null) {
  let body: Record<string, unknown> = {}
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const target = await resolveOAuthRouteTarget(c, supplierIdParam, body)
  if (target instanceof Response) return target
  const label = typeof body.label === 'string' ? body.label.trim() : ''

  try {
    const session = await startSupplierOAuthDeviceFlow(
      c.env,
      target.supplierId,
      target.authMode,
      label
    )
    c.header('Cache-Control', 'no-store')
    return c.json(session)
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '发起设备码授权失败' } },
      502
    )
  }
}

async function handleOAuthDevicePoll(c: Context<AppEnv>, supplierIdParam: string | null) {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) {
    return c.json({ error: { message: '缺少 sessionId 参数' } }, 400)
  }
  const supplierId =
    supplierIdParam ||
    (typeof body.supplierId === 'string' && body.supplierId.trim() ? body.supplierId.trim() : null)

  try {
    const outcome = await pollSupplierOAuthDeviceFlow(c.env, supplierId, sessionId)
    if (outcome.status === 'completed' && supplierId) {
      const suppliers = await getSuppliers(c.env)
      c.header('Cache-Control', 'no-store')
      return c.json({ ...outcome, suppliers })
    }
    c.header('Cache-Control', 'no-store')
    return c.json(outcome)
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '轮询设备码授权状态失败' } },
      400
    )
  }
}

async function handleOAuthPkceStart(c: Context<AppEnv>, supplierIdParam: string | null) {
  let body: Record<string, unknown> = {}
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const target = await resolveOAuthRouteTarget(c, supplierIdParam, body)
  if (target instanceof Response) return target
  const label = typeof body.label === 'string' ? body.label.trim() : ''

  const session = await startSupplierOAuthPkceFlow(c.env, target.supplierId, target.authMode, label)
  c.header('Cache-Control', 'no-store')
  return c.json(session)
}

async function handleOAuthPkceComplete(c: Context<AppEnv>, supplierIdParam: string | null) {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const callbackInput = typeof body.callbackInput === 'string' ? body.callbackInput.trim() : ''
  if (!sessionId || !callbackInput) {
    return c.json({ error: { message: '请提供 sessionId 与回调 URL / 授权码' } }, 400)
  }
  const supplierId =
    supplierIdParam ||
    (typeof body.supplierId === 'string' && body.supplierId.trim() ? body.supplierId.trim() : null)

  try {
    const saved = await completeSupplierOAuthPkceFlow(c.env, supplierId, sessionId, callbackInput)
    if (supplierId) {
      const suppliers = await getSuppliers(c.env)
      c.header('Cache-Control', 'no-store')
      return c.json({ ...saved, suppliers })
    }
    c.header('Cache-Control', 'no-store')
    return c.json(saved)
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : 'PKCE 授权兑换失败' } },
      400
    )
  }
}

async function handleOAuthImport(c: Context<AppEnv>, supplierIdParam: string | null) {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }
  const target = await resolveOAuthRouteTarget(c, supplierIdParam, body)
  if (target instanceof Response) return target
  const rawJson = typeof body.rawJson === 'string' ? body.rawJson : ''
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!rawJson.trim()) {
    return c.json({ error: { message: '请粘贴 auth.json 内容' } }, 400)
  }

  try {
    const saved = await importSupplierOAuthJson(
      c.env,
      target.supplierId,
      target.authMode,
      rawJson,
      label
    )
    if (target.supplierId) {
      const suppliers = await getSuppliers(c.env)
      c.header('Cache-Control', 'no-store')
      return c.json({ ...saved, suppliers }, 201)
    }
    c.header('Cache-Control', 'no-store')
    return c.json(saved, 201)
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '导入 OAuth 凭证失败' } },
      400
    )
  }
}

adminRoutes.post('/suppliers/oauth/device/start', (c) => handleOAuthDeviceStart(c, null))
adminRoutes.post('/suppliers/oauth/device/poll', (c) => handleOAuthDevicePoll(c, null))
adminRoutes.post('/suppliers/oauth/pkce/start', (c) => handleOAuthPkceStart(c, null))
adminRoutes.post('/suppliers/oauth/pkce/complete', (c) => handleOAuthPkceComplete(c, null))
adminRoutes.post('/suppliers/oauth/import', (c) => handleOAuthImport(c, null))

adminRoutes.post('/suppliers/:id/oauth/device/start', (c) =>
  handleOAuthDeviceStart(c, c.req.param('id'))
)
adminRoutes.post('/suppliers/:id/oauth/device/poll', (c) =>
  handleOAuthDevicePoll(c, c.req.param('id'))
)
adminRoutes.post('/suppliers/:id/oauth/pkce/start', (c) =>
  handleOAuthPkceStart(c, c.req.param('id'))
)
adminRoutes.post('/suppliers/:id/oauth/pkce/complete', (c) =>
  handleOAuthPkceComplete(c, c.req.param('id'))
)
adminRoutes.post('/suppliers/:id/oauth/import', (c) =>
  handleOAuthImport(c, c.req.param('id'))
)

adminRoutes.post('/suppliers/:id/keys/:keyId/refresh', async (c) => {
  const supplierId = c.req.param('id')
  const keyId = c.req.param('keyId')
  const row = await c.env.DB.prepare(
    `SELECT id, credential_type FROM supplier_keys WHERE id = ? AND supplier_id = ? LIMIT 1`
  )
    .bind(keyId, supplierId)
    .first<{ id: string; credential_type?: string }>()
  if (!row) {
    return c.json({ error: { message: '凭证记录不存在' } }, 404)
  }
  if (row.credential_type !== 'oauth_token') {
    return c.json({ error: { message: '仅 OAuth 订阅账号支持刷新 Token' } }, 400)
  }

  try {
    const resolved = await resolveValidSupplierOAuthKey(c.env, keyId, true)
    const suppliers = await getSuppliers(c.env)
    c.header('Cache-Control', 'no-store')
    return c.json({
      ok: true,
      expiresAt: resolved.expiresAt,
      message: 'Token 已刷新并同步入库',
      suppliers,
    })
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : 'Token 刷新失败' } },
      400
    )
  }
})

// ---------------------------------------------------------------------------
// 模型槽位定价与多渠道路由 (Provider Slots & Channels)
// ---------------------------------------------------------------------------

adminRoutes.get('/providers', async (c) => {
  const [slots, suppliers] = await Promise.all([
    getAdminProviderSlots(c.env),
    getSuppliers(c.env),
  ])
  c.header('Cache-Control', 'no-store')
  return c.json({ slots, suppliers })
})

adminRoutes.put('/providers/:id/slot', async (c) => {
  const id = c.req.param('id') as ImageProviderId
  if (!PROVIDER_ORDER.includes(id)) {
    return c.json({ error: { message: '未知的画师/模型槽位' } }, 400)
  }

  const existing = await c.env.DB.prepare(
    `SELECT * FROM provider_configs WHERE provider_id = ?`
  )
    .bind(id)
    .first<ProviderRow>()
  if (!existing) {
    return c.json({ error: { message: '模型槽位不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  const creditCost =
    body.creditCost !== undefined
      ? parseIntSafe(body.creditCost, 0, 100_000)
      : existing.credit_cost
  if (creditCost === null) {
    return c.json({ error: { message: '单次消耗积分必须为 0~100000 的整数' } }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE provider_configs SET enabled = ?, credit_cost = ?, updated_at = ? WHERE provider_id = ?`
  )
    .bind(enabled, creditCost, Date.now(), id)
    .run()

  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots })
})

function parseProfileInput(
  providerId: ImageProviderId,
  body: Record<string, unknown>,
  fallback?: {
    displayName: string
    badge: string
    tagline: string
    defaultModel: string
    defaultCustomModel: string
    enabled: boolean
    isDefault: boolean
    creditCost: number
    defaultResolution: StudioResolution | null
    resolutions: ProfileResolutionOption[]
    sortOrder: number
  }
):
  | {
      ok: true
      value: {
        displayName: string
        badge: string
        tagline: string
        defaultModel: string
        defaultCustomModel: string
        enabled: boolean
        isDefault: boolean
        creditCost: number
        defaultResolution: StudioResolution
        resolutions: ProfileResolutionOption[]
        sortOrder: number
      }
    }
  | { ok: false; message: string } {
  const displayName =
    typeof body.displayName === 'string'
      ? body.displayName.trim().slice(0, 40)
      : fallback?.displayName || ''
  if (!displayName) {
    return { ok: false, message: '请填写前端展示名称' }
  }

  const badge =
    typeof body.badge === 'string'
      ? body.badge.trim().slice(0, 16)
      : fallback?.badge || ''
  const tagline =
    typeof body.tagline === 'string'
      ? body.tagline.trim().slice(0, 80)
      : fallback?.tagline || ''
  const defaultModel =
    typeof body.defaultModel === 'string'
      ? body.defaultModel.trim().slice(0, 120)
      : (fallback?.defaultModel || '')
  const rawDefaultCustomModel =
    typeof body.defaultCustomModel === 'string'
      ? body.defaultCustomModel.trim().slice(0, 120)
      : (fallback?.defaultCustomModel || '')
  const defaultCustomModel = defaultModel === 'custom' ? rawDefaultCustomModel : ''
  if (defaultModel === 'custom' && !defaultCustomModel) {
    return { ok: false, message: '选择自定义模型时请填写标准自定义模型 ID' }
  }
  const enabled =
    typeof body.enabled === 'boolean' ? body.enabled : (fallback?.enabled ?? true)
  const isDefault =
    typeof body.isDefault === 'boolean' ? body.isDefault : (fallback?.isDefault ?? false)

  const sortOrder =
    body.sortOrder !== undefined
      ? parseIntSafe(body.sortOrder, -10_000, 10_000)
      : (fallback?.sortOrder ?? 0)
  if (sortOrder === null) {
    return { ok: false, message: '排序权重需为整数' }
  }

  const rawBaseCost =
    body.creditCost !== undefined
      ? parseIntSafe(body.creditCost, 0, 100_000)
      : (fallback?.creditCost ?? 10)
  if (rawBaseCost === null) {
    return { ok: false, message: '单次消耗积分必须为 0~100000 的整数' }
  }

  const supported = PROVIDER_SUPPORTED_RESOLUTIONS[providerId]
  let resolutions: ProfileResolutionOption[] = []
  let defaultResolution: StudioResolution = '2K'
  let effectiveCreditCost = rawBaseCost

  if (supported.length > 0) {
    const rawRes =
      body.resolutions !== undefined
        ? body.resolutions
        : (fallback?.resolutions ?? null)
    if (Array.isArray(rawRes)) {
      const enabledCount = rawRes.filter(
        (r) => r && typeof r === 'object' && (r as { enabled?: unknown }).enabled !== false
      ).length
      if (enabledCount === 0) {
        return { ok: false, message: '请至少启用 1 个输出分辨率' }
      }
      for (const item of rawRes) {
        if (!item || typeof item !== 'object') continue
        const cVal = parseIntSafe((item as { creditCost?: unknown }).creditCost ?? rawBaseCost, 0, 100_000)
        if (cVal === null) {
          return { ok: false, message: '各分辨率消耗积分必须为 0~100000 的整数' }
        }
      }
    }
    resolutions = normalizeProfileResolutions(providerId, rawRes, rawBaseCost)
    defaultResolution =
      resolveProfileDefaultResolution(
        providerId,
        body.defaultResolution ?? fallback?.defaultResolution ?? '2K',
        resolutions
      ) ?? '2K'
    effectiveCreditCost = getEffectiveProfileCreditCost(
      { creditCost: rawBaseCost, resolutions },
      defaultResolution
    )
  }

  return {
    ok: true,
    value: {
      displayName,
      badge,
      tagline,
      defaultModel,
      defaultCustomModel,
      enabled,
      isDefault,
      creditCost: effectiveCreditCost,
      defaultResolution,
      resolutions,
      sortOrder,
    },
  }
}

adminRoutes.post('/providers/:id/profiles', async (c) => {
  const providerId = c.req.param('id') as ImageProviderId
  if (!PROVIDER_ORDER.includes(providerId)) {
    return c.json({ error: { message: '未知的画师/模型分类' } }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const parsed = parseProfileInput(providerId, body)
  if (!parsed.ok) {
    return c.json({ error: { message: parsed.message } }, 400)
  }

  const val = parsed.value
  const now = Date.now()
  const newId = crypto.randomUUID()
  const existingCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM model_profiles WHERE provider_id = ?`
  )
    .bind(providerId)
    .first<{ cnt: number }>()
  const shouldBeDefault = val.isDefault || (existingCount?.cnt ?? 0) === 0

  const stmts: D1PreparedStatement[] = []
  if (shouldBeDefault) {
    stmts.push(
      c.env.DB.prepare(`UPDATE model_profiles SET is_default = 0 WHERE provider_id = ?`).bind(
        providerId
      )
    )
  }
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO model_profiles (
        id, provider_id, display_name, badge, tagline, default_model, default_custom_model,
        enabled, is_default, credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId,
      providerId,
      val.displayName,
      val.badge,
      val.tagline,
      val.defaultModel,
      val.defaultCustomModel,
      val.enabled ? 1 : 0,
      shouldBeDefault ? 1 : 0,
      val.creditCost,
      val.defaultResolution,
      JSON.stringify(val.resolutions),
      val.sortOrder,
      now,
      now
    )
  )

  await c.env.DB.batch(stmts)
  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots, createdProfileId: newId }, 201)
})

adminRoutes.put('/profiles/:profileId', async (c) => {
  const profileId = c.req.param('profileId')
  const existing = await c.env.DB.prepare(`SELECT * FROM model_profiles WHERE id = ?`)
    .bind(profileId)
    .first<ModelProfileRow>()
  if (!existing) {
    return c.json({ error: { message: '模型档位不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const prevParsed = parseProfileRow(existing)
  const parsed = parseProfileInput(existing.provider_id, body, {
    displayName: existing.display_name,
    badge: existing.badge,
    tagline: existing.tagline,
    defaultModel: existing.default_model || '',
    defaultCustomModel: existing.default_custom_model || '',
    enabled: existing.enabled === 1,
    isDefault: existing.is_default === 1,
    creditCost: prevParsed.effectiveCreditCost,
    defaultResolution: prevParsed.defaultResolution,
    resolutions: prevParsed.resolutions,
    sortOrder: existing.sort_order,
  })
  if (!parsed.ok) {
    return c.json({ error: { message: parsed.message } }, 400)
  }

  const val = parsed.value
  const now = Date.now()
  const stmts: D1PreparedStatement[] = []
  if (val.isDefault) {
    stmts.push(
      c.env.DB.prepare(`UPDATE model_profiles SET is_default = 0 WHERE provider_id = ?`).bind(
        existing.provider_id
      )
    )
  }
  stmts.push(
    c.env.DB.prepare(
      `UPDATE model_profiles
       SET display_name = ?, badge = ?, tagline = ?, default_model = ?, default_custom_model = ?,
           enabled = ?, is_default = ?, credit_cost = ?, default_resolution = ?, resolutions_json = ?,
           sort_order = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      val.displayName,
      val.badge,
      val.tagline,
      val.defaultModel,
      val.defaultCustomModel,
      val.enabled ? 1 : 0,
      val.isDefault ? 1 : 0,
      val.creditCost,
      val.defaultResolution,
      JSON.stringify(val.resolutions),
      val.sortOrder,
      now,
      profileId
    )
  )
  await c.env.DB.batch(stmts)

  // 若取消了唯一的默认标识，兜底指定同画师下第一个档位为默认
  if (!val.isDefault && existing.is_default === 1) {
    const fallback = await c.env.DB.prepare(
      `SELECT id FROM model_profiles WHERE provider_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1`
    )
      .bind(existing.provider_id)
      .first<{ id: string }>()
    if (fallback) {
      await c.env.DB.prepare(`UPDATE model_profiles SET is_default = 1 WHERE id = ?`)
        .bind(fallback.id)
        .run()
    }
  }

  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots })
})

adminRoutes.delete('/profiles/:profileId', async (c) => {
  const profileId = c.req.param('profileId')
  const existing = await c.env.DB.prepare(`SELECT * FROM model_profiles WHERE id = ?`)
    .bind(profileId)
    .first<ModelProfileRow>()
  if (!existing) {
    return c.json({ error: { message: '模型档位不存在' } }, 404)
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM model_profiles WHERE provider_id = ?`
  )
    .bind(existing.provider_id)
    .first<{ cnt: number }>()
  if ((countRow?.cnt ?? 0) <= 1) {
    return c.json({ error: { message: '每个画师至少需要保留 1 个模型档位' } }, 409)
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM provider_channels WHERE profile_id = ?`).bind(profileId),
    c.env.DB.prepare(`DELETE FROM model_profiles WHERE id = ?`).bind(profileId),
  ])

  if (existing.is_default === 1) {
    const nextDefault = await c.env.DB.prepare(
      `SELECT id FROM model_profiles WHERE provider_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1`
    )
      .bind(existing.provider_id)
      .first<{ id: string }>()
    if (nextDefault) {
      await c.env.DB.prepare(`UPDATE model_profiles SET is_default = 1 WHERE id = ?`)
        .bind(nextDefault.id)
        .run()
    }
  }

  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots })
})

async function validateSupplierKeysBinding(
  db: D1Database,
  supplierId: string,
  supplierLegacyEncrypted: string,
  rawKeyIds: unknown
): Promise<{ ok: true; keyIds: string[]; hasUsableKey: boolean } | { ok: false; message: string }> {
  const keysRes = await db
    .prepare(`SELECT id, enabled FROM supplier_keys WHERE supplier_id = ?`)
    .bind(supplierId)
    .all<{ id: string; enabled: number }>()
  const supKeys = keysRes.results || []
  const supKeyMap = new Map(supKeys.map((k) => [k.id, k.enabled === 1]))

  let keyIds: string[] = []
  if (Array.isArray(rawKeyIds)) {
    const cleaned = Array.from(
      new Set(
        rawKeyIds
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((s) => s.trim())
      )
    )
    for (const id of cleaned) {
      if (!supKeyMap.has(id)) {
        return { ok: false, message: '所选指定密钥不属于当前供应商或已删除' }
      }
    }
    keyIds = cleaned
  }

  const hasUsableKey =
    supKeys.length > 0
      ? supKeys.some((k) => k.enabled === 1 && (keyIds.length === 0 || keyIds.includes(k.id)))
      : Boolean(supplierLegacyEncrypted)

  return { ok: true, keyIds, hasUsableKey }
}

adminRoutes.post('/providers/:id/channels', async (c) => {
  const providerId = c.req.param('id') as ImageProviderId
  if (!PROVIDER_ORDER.includes(providerId)) {
    return c.json({ error: { message: '未知的模型分类' } }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const requestedProfileId = typeof body.profileId === 'string' ? body.profileId.trim() : ''
  const targetProfile = requestedProfileId
    ? await c.env.DB.prepare(`SELECT * FROM model_profiles WHERE id = ? AND provider_id = ?`)
        .bind(requestedProfileId, providerId)
        .first<ModelProfileRow>()
    : await resolveProfileForGeneration(c.env.DB, providerId, null)
  if (!targetProfile) {
    return c.json({ error: { message: '请选择有效的模型档位' } }, 400)
  }

  const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : ''
  const supplier = await c.env.DB.prepare(
    `SELECT id, name, enabled, api_key_encrypted FROM suppliers WHERE id = ?`
  )
    .bind(supplierId)
    .first<{ id: string; name: string; enabled: number; api_key_encrypted: string }>()
  if (!supplier) {
    return c.json({ error: { message: '请选择有效的供应商' } }, 400)
  }

  const keyBinding = await validateSupplierKeysBinding(
    c.env.DB,
    supplierId,
    supplier.api_key_encrypted,
    body.keyIds
  )
  if (!keyBinding.ok) {
    return c.json({ error: { message: keyBinding.message } }, 400)
  }

  const rawName = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const name = rawName || supplier.name.trim().slice(0, 60)
  if (!name) {
    return c.json({ error: { message: '请填写渠道名称' } }, 400)
  }

  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : 1
  if (enabled === 1 && (supplier.enabled !== 1 || !keyBinding.hasUsableKey)) {
    return c.json(
      {
        error: {
          message:
            keyBinding.keyIds.length > 0
              ? '所选供应商已停用或绑定的指定密钥未启用，请先调整密钥状态后再启用渠道'
              : '所选供应商已停用或尚未配置可用 API Key，请先在「03. 供应商凭证」完善后再启用渠道（或取消勾选启用）',
        },
      },
      400
    )
  }
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : PROVIDER_META[providerId].models[0].value
  const customModel = typeof body.customModel === 'string' ? body.customModel.trim() : ''
  if (model === 'custom' && !customModel) {
    return c.json({ error: { message: '选择自定义模型时请填写自定义模型 ID' } }, 400)
  }

  const priority = parseIntSafe(body.priority ?? 100, -10_000, 100_000)
  if (priority === null) {
    return c.json({ error: { message: '优先级需为整数' } }, 400)
  }

  const mergedParams = {
    ...DEFAULT_PROVIDER_PARAMS[providerId],
    ...sanitizeChannelParams(providerId, body.params),
  }

  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO provider_channels (
      id, provider_id, profile_id, supplier_id, name, enabled, model, custom_model,
      priority, weight, key_ids_json, params_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      providerId,
      targetProfile.id,
      supplierId,
      name,
      enabled,
      model,
      customModel,
      priority,
      JSON.stringify(keyBinding.keyIds),
      JSON.stringify(mergedParams),
      now,
      now
    )
    .run()

  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots }, 201)
})

adminRoutes.put('/channels/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const existing = await c.env.DB.prepare(`SELECT * FROM provider_channels WHERE id = ?`)
    .bind(channelId)
    .first<ChannelRow>()
  if (!existing) {
    return c.json({ error: { message: '渠道不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  let nextProfileId = existing.profile_id || ''
  if (typeof body.profileId === 'string' && body.profileId.trim()) {
    const targetProfile = await c.env.DB.prepare(
      `SELECT id FROM model_profiles WHERE id = ? AND provider_id = ?`
    )
      .bind(body.profileId.trim(), existing.provider_id)
      .first<{ id: string }>()
    if (!targetProfile) {
      return c.json({ error: { message: '所选模型档位不存在或不属于当前画师' } }, 400)
    }
    nextProfileId = targetProfile.id
  }

  const supplierId =
    typeof body.supplierId === 'string' && body.supplierId.trim()
      ? body.supplierId.trim()
      : existing.supplier_id
  const supplier = await c.env.DB.prepare(
    `SELECT id, name, enabled, api_key_encrypted FROM suppliers WHERE id = ?`
  )
    .bind(supplierId)
    .first<{ id: string; name: string; enabled: number; api_key_encrypted: string }>()
  if (!supplier) {
    return c.json({ error: { message: '所选供应商不存在' } }, 400)
  }

  const rawKeyIds =
    body.keyIds !== undefined
      ? body.keyIds
      : supplierId === existing.supplier_id
        ? parseKeyIdsJson(existing.key_ids_json)
        : []
  const keyBinding = await validateSupplierKeysBinding(
    c.env.DB,
    supplierId,
    supplier.api_key_encrypted,
    rawKeyIds
  )
  if (!keyBinding.ok) {
    return c.json({ error: { message: keyBinding.message } }, 400)
  }

  const name =
    typeof body.name === 'string'
      ? body.name.trim().slice(0, 60) || supplier.name.trim().slice(0, 60)
      : existing.name
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  if (enabled === 1 && (supplier.enabled !== 1 || !keyBinding.hasUsableKey)) {
    return c.json(
      {
        error: {
          message:
            keyBinding.keyIds.length > 0
              ? '所选供应商已停用或绑定的指定密钥未启用，请先调整密钥状态后再启用渠道'
              : '所选供应商已停用或尚未配置可用 API Key，请先在「03. 供应商凭证」完善后再启用渠道（或取消勾选启用）',
        },
      },
      400
    )
  }
  const model =
    typeof body.model === 'string' && body.model.trim() ? body.model.trim() : existing.model
  const customModel =
    typeof body.customModel === 'string' ? body.customModel.trim() : existing.custom_model
  if (model === 'custom' && !customModel) {
    return c.json({ error: { message: '选择自定义模型时请填写自定义模型 ID' } }, 400)
  }

  const priority =
    body.priority !== undefined ? parseIntSafe(body.priority, -10_000, 100_000) : existing.priority
  if (priority === null) {
    return c.json({ error: { message: '优先级参数无效' } }, 400)
  }

  if (!nextProfileId) {
    const fallbackProf = await resolveProfileForGeneration(c.env.DB, existing.provider_id, null)
    if (!fallbackProf) {
      return c.json({ error: { message: '当前画师尚无可用画笔档位' } }, 400)
    }
    nextProfileId = fallbackProf.id
  }

  let baseParams = { ...DEFAULT_PROVIDER_PARAMS[existing.provider_id] }
  try {
    baseParams = {
      ...baseParams,
      ...sanitizeChannelParams(existing.provider_id, JSON.parse(existing.params_json)),
    }
  } catch {
    // ignore
  }
  const mergedParams = {
    ...baseParams,
    ...sanitizeChannelParams(existing.provider_id, body.params),
  }

  await c.env.DB.prepare(
    `UPDATE provider_channels
     SET profile_id = ?, supplier_id = ?, name = ?, enabled = ?, model = ?, custom_model = ?,
         priority = ?, key_ids_json = ?, params_json = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      nextProfileId,
      supplierId,
      name,
      enabled,
      model,
      customModel,
      priority,
      JSON.stringify(keyBinding.keyIds),
      JSON.stringify(mergedParams),
      Date.now(),
      channelId
    )
    .run()

  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots })
})

adminRoutes.delete('/channels/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  await c.env.DB.prepare(`DELETE FROM provider_channels WHERE id = ?`).bind(channelId).run()
  const slots = await getAdminProviderSlots(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ slots })
})

// ---------------------------------------------------------------------------
// 平台配置、用户、卡密与审计
// ---------------------------------------------------------------------------

adminRoutes.post('/style-preview', async (c) => {
  const contentLength = Number(c.req.header('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024 + 256 * 1024) {
    return c.json({ error: { message: '示意图大小超出 5MB 上限' } }, 413)
  }
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ error: { message: '请使用 multipart/form-data 上传画风示意图' } }, 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: { message: '缺少 file 字段' } }, 400)
  }
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
    return c.json({ error: { message: '示意图大小需在 1B ~ 5MB 之间' } }, 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = detectImageFormat(bytes)
  if (!detected) {
    return c.json({ error: { message: '仅支持 PNG、JPEG、WebP 或 GIF 格式图片' } }, 400)
  }

  const assetId = crypto.randomUUID()
  const filename = `${assetId}.${detected.ext}`
  const r2Key = `styles/${filename}`

  await c.env.BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: detected.mime },
  })

  return c.json(
    {
      r2Key,
      url: `/api/style-assets/${filename}`,
      mimeType: detected.mime,
      bytes: bytes.byteLength,
    },
    201
  )
})

adminRoutes.get('/settings', async (c) => {
  const platform = await getPlatformConfig(c.env.DB)
  c.header('Cache-Control', 'no-store')
  return c.json({ platform })
})

adminRoutes.put('/settings', async (c) => {
  let body: Partial<PlatformConfig>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const current = await getPlatformConfig(c.env.DB)
  const bonus =
    body.registerBonusCredits !== undefined
      ? parseIntSafe(body.registerBonusCredits, 0, 100_000)
      : current.registerBonusCredits
  if (bonus === null) {
    return c.json({ error: { message: '新用户注册赠送积分必须为 0~100000 的整数' } }, 400)
  }

  const sanitizedCategories =
    body.styleCategories !== undefined ? sanitizeStyleCategoriesInput(body.styleCategories) : null
  if (body.styleCategories !== undefined && sanitizedCategories === null) {
    return c.json({ error: { message: '画风大类列表格式错误' } }, 400)
  }
  const nextStyleCategories = sanitizedCategories ?? current.styleCategories
  const validCategoryIds = new Set(nextStyleCategories.map((cat) => cat.id))

  const rawSubcategories =
    body.styleSubcategories !== undefined
      ? sanitizeStyleSubcategoriesInput(body.styleSubcategories)
      : null
  if (body.styleSubcategories !== undefined && rawSubcategories === null) {
    return c.json({ error: { message: '画风小类列表格式错误' } }, 400)
  }
  const candidateSubcategories = rawSubcategories ?? current.styleSubcategories
  const orphanSub = candidateSubcategories.find((sub) => !validCategoryIds.has(sub.categoryId))
  if (orphanSub) {
    return c.json(
      {
        error: {
          message:
            body.styleSubcategories === undefined
              ? `存在小类「${orphanSub.label}」仍引用该大类，请先移除或迁移对应小类`
              : `小类「${orphanSub.label}」引用的大类不存在`,
        },
      },
      body.styleSubcategories === undefined ? 409 : 400
    )
  }
  const nextStyleSubcategories = candidateSubcategories
  const subMap = new Map(nextStyleSubcategories.map((sub) => [sub.id, sub]))

  const rawStylePresets =
    body.stylePresets !== undefined ? sanitizeStylePresetsInput(body.stylePresets) : null
  if (body.stylePresets !== undefined && rawStylePresets === null) {
    return c.json({ error: { message: '画风预设列表格式错误' } }, 400)
  }

  let nextStylePresets = current.stylePresets
  if (rawStylePresets !== null) {
    const invalidPreset = rawStylePresets.find((p) => !subMap.has(p.subcategoryId))
    if (invalidPreset) {
      return c.json(
        { error: { message: `画风「${invalidPreset.label}」未绑定有效的二级小类` } },
        400
      )
    }
    nextStylePresets = rawStylePresets.map((p) => ({
      ...p,
      categoryId: subMap.get(p.subcategoryId)!.categoryId,
    }))
  } else {
    const orphanPreset = current.stylePresets.find((p) => !subMap.has(p.subcategoryId))
    if (orphanPreset) {
      return c.json(
        {
          error: {
            message: `小类正被画风「${orphanPreset.label}」引用，请先调整该画风的分类后再删除`,
          },
        },
        409
      )
    }
    nextStylePresets = current.stylePresets.map((p) => ({
      ...p,
      categoryId: subMap.get(p.subcategoryId)!.categoryId,
    }))
  }
  const validStyleIds = new Set(nextStylePresets.map((s) => s.id))

  const requestedDefaultStyle =
    typeof body.defaultStylePreset === 'string' ? body.defaultStylePreset : current.defaultStylePreset
  const defaultStylePreset =
    requestedDefaultStyle === 'none' || validStyleIds.has(requestedDefaultStyle)
      ? requestedDefaultStyle
      : 'none'

  const validatedPoseSanitize =
    body.poseSanitize !== undefined ? validatePoseSanitizeInput(body.poseSanitize) : null
  if (body.poseSanitize !== undefined && validatedPoseSanitize === null) {
    return c.json({ error: { message: '敏感词屏蔽配置格式错误' } }, 400)
  }

  if (typeof body.defaultPromptPrefix === 'string' && body.defaultPromptPrefix.length > 2000) {
    return c.json({ error: { message: '默认前置提示词不能超过 2000 个字符' } }, 400)
  }
  if (typeof body.defaultPromptSuffix === 'string' && body.defaultPromptSuffix.length > 2000) {
    return c.json({ error: { message: '默认后置提示词不能超过 2000 个字符' } }, 400)
  }

  const next: PlatformConfig = {
    registerBonusCredits: bonus,
    allowRegistration:
      typeof body.allowRegistration === 'boolean' ? body.allowRegistration : current.allowRegistration,
    defaultStylePreset,
    defaultPromptPrefix:
      typeof body.defaultPromptPrefix === 'string'
        ? body.defaultPromptPrefix
        : current.defaultPromptPrefix,
    defaultPromptSuffix:
      typeof body.defaultPromptSuffix === 'string'
        ? body.defaultPromptSuffix
        : current.defaultPromptSuffix,
    defaultNegativePrompt:
      typeof body.defaultNegativePrompt === 'string'
        ? body.defaultNegativePrompt.trim().slice(0, 1000)
        : current.defaultNegativePrompt,
    promptTemplate:
      body.promptTemplate !== undefined
        ? mergePromptTemplate(body.promptTemplate)
        : current.promptTemplate ?? mergePromptTemplate(null),
    poseSanitize:
      validatedPoseSanitize ?? current.poseSanitize ?? mergePoseSanitizeConfig(null),
    visionFallback:
      body.visionFallback !== undefined
        ? mergeVisionFallbackConfig(body.visionFallback)
        : current.visionFallback ?? mergeVisionFallbackConfig(null),
    queueConfig:
      body.queueConfig !== undefined
        ? mergeGenerationQueueConfig(body.queueConfig)
        : current.queueConfig ?? mergeGenerationQueueConfig(null),
    styleCategories: nextStyleCategories,
    styleSubcategories: nextStyleSubcategories,
    stylePresets: nextStylePresets,
    imagePassMode:
      body.imagePassMode === 'url' || body.imagePassMode === 'base64'
        ? body.imagePassMode
        : current.imagePassMode,
    sendStitchedSheet:
      typeof body.sendStitchedSheet === 'boolean' ? body.sendStitchedSheet : current.sendStitchedSheet,
  }

  await savePlatformConfig(c.env.DB, next)

  if (body.queueConfig !== undefined) {
    try {
      c.executionCtx.waitUntil(reconcileQueueViaCoordinator(c.env))
    } catch {
      // non-worker environment
    }
  }

  // 自动清理已从画风预设中删除或替换掉的 R2 示意图孤儿对象
  const nextStyleKeys = new Set(
    nextStylePresets.map((p) => extractStyleAssetKey(p.previewUrl)).filter((k): k is string => Boolean(k))
  )
  const obsoleteKeys = new Set<string>()
  for (const prevPreset of current.stylePresets) {
    const key = extractStyleAssetKey(prevPreset.previewUrl)
    if (key && !nextStyleKeys.has(key)) {
      obsoleteKeys.add(key)
    }
  }
  if (obsoleteKeys.size > 0) {
    await Promise.allSettled(Array.from(obsoleteKeys, (key) => c.env.BUCKET.delete(key)))
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ platform: next })
})

adminRoutes.get('/r2-cleanup', async (c) => {
  const [platform, styleObjects, stitchedStats, expiredStats] = await Promise.all([
    getPlatformConfig(c.env.DB),
    listAllR2Objects(c.env.BUCKET, 'styles/'),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(bytes), 0) AS bytes
       FROM uploaded_assets
       WHERE purpose = 'stitched'`
    ).first<{ cnt: number; bytes: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(bytes), 0) AS bytes
       FROM uploaded_assets
       WHERE purpose = 'stitched' AND created_at < ?`
    )
      .bind(Date.now() - 24 * 60 * 60 * 1000)
      .first<{ cnt: number; bytes: number }>(),
  ])

  const activeStyleKeys = new Set(
    platform.stylePresets
      .map((p: StylePresetItem) => extractStyleAssetKey(p.previewUrl))
      .filter((k): k is string => Boolean(k))
  )

  let orphanStyleKeysCount = 0
  let orphanStyleBytes = 0
  for (const obj of styleObjects) {
    if (!activeStyleKeys.has(obj.key)) {
      orphanStyleKeysCount += 1
      orphanStyleBytes += obj.size
    }
  }

  c.header('Cache-Control', 'no-store')
  return c.json({
    orphanStyleKeysCount,
    orphanStyleBytes,
    expiredStitchedCount: expiredStats?.cnt ?? 0,
    expiredStitchedBytes: expiredStats?.bytes ?? 0,
    totalStitchedCount: stitchedStats?.cnt ?? 0,
    totalStitchedBytes: stitchedStats?.bytes ?? 0,
  })
})

adminRoutes.post('/r2-cleanup', async (c) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const [platform, styleObjects, expiredRowsRes] = await Promise.all([
    getPlatformConfig(c.env.DB),
    listAllR2Objects(c.env.BUCKET, 'styles/'),
    c.env.DB.prepare(
      `SELECT id, r2_key, bytes
       FROM uploaded_assets
       WHERE purpose = 'stitched' AND created_at < ?
       LIMIT 200`
    )
      .bind(cutoff)
      .all<{ id: string; r2_key: string; bytes: number }>(),
  ])

  const activeStyleKeys = new Set(
    platform.stylePresets
      .map((p: StylePresetItem) => extractStyleAssetKey(p.previewUrl))
      .filter((k): k is string => Boolean(k))
  )

  const orphanStyleObjs = styleObjects.filter((obj) => !activeStyleKeys.has(obj.key))
  const expiredStitched = expiredRowsRes.results || []

  let freedBytes = 0
  if (orphanStyleObjs.length > 0) {
    await Promise.allSettled(orphanStyleObjs.map((obj) => c.env.BUCKET.delete(obj.key)))
    for (const obj of orphanStyleObjs) freedBytes += obj.size
  }

  if (expiredStitched.length > 0) {
    await Promise.allSettled(expiredStitched.map((row) => c.env.BUCKET.delete(row.r2_key)))
    const stmts = expiredStitched.map((row) =>
      c.env.DB.prepare(`DELETE FROM uploaded_assets WHERE id = ?`).bind(row.id)
    )
    await c.env.DB.batch(stmts)
    for (const row of expiredStitched) freedBytes += row.bytes || 0
  }

  c.header('Cache-Control', 'no-store')
  return c.json({
    deletedStylesCount: orphanStyleObjs.length,
    deletedStitchedCount: expiredStitched.length,
    freedBytes,
  })
})

adminRoutes.get('/wechat', async (c) => {
  const wechat = await getAdminWechatConfig(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ wechat })
})

adminRoutes.put('/wechat', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  let callbackBaseUrl: string | undefined
  if (body.callbackBaseUrl !== undefined) {
    const check = sanitizeCallbackBaseUrl(body.callbackBaseUrl)
    if (!check.valid) {
      return c.json(
        {
          error: {
            message: '回调基础地址必须为合法的 https:// 域名（本地联调可填 http://localhost 或 http://127.0.0.1）',
          },
        },
        400
      )
    }
    callbackBaseUrl = check.value
  }

  let appId: string | undefined
  if (typeof body.appId === 'string') {
    const cleanId = body.appId.trim()
    if (cleanId && !/^[a-zA-Z0-9_-]{4,64}$/.test(cleanId)) {
      return c.json({ error: { message: '微信 AppID 格式不正确' } }, 400)
    }
    appId = cleanId
  }

  const wechat = await saveWechatOAuthConfig(c.env, {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    appId,
    appSecret: typeof body.appSecret === 'string' ? body.appSecret : undefined,
    clearAppSecret: body.clearAppSecret === true,
    callbackBaseUrl,
  })
  c.header('Cache-Control', 'no-store')
  return c.json({ wechat })
})

adminRoutes.get('/users', async (c) => {
  const q = (c.req.query('q') || '').trim().toLowerCase()
  const filter = (c.req.query('filter') || 'all').trim()
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const clauses: string[] = []
  const bindings: unknown[] = []

  if (q) {
    const pattern = `%${q}%`
    clauses.push(
      `(u.username_lower LIKE ? OR u.email_lower LIKE ? OR LOWER(u.display_name) LIKE ? OR LOWER(COALESCE(u.admin_note, '')) LIKE ? OR LOWER(COALESCE(oa.nickname, '')) LIKE ?)`
    )
    bindings.push(pattern, pattern, pattern, pattern, pattern)
  }

  if (filter === 'active') {
    clauses.push(`u.status = 'active'`)
  } else if (filter === 'disabled') {
    clauses.push(`u.status = 'disabled'`)
  } else if (filter === 'admin') {
    clauses.push(`u.role = 'admin'`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  const listStmt = c.env.DB.prepare(
    `SELECT u.*,
            MAX(oa.openid) AS wechat_openid,
            MAX(oa.nickname) AS wechat_nickname,
            MAX(oa.avatar_url) AS wechat_avatar_url,
            COUNT(j.id) AS jobs_count
     FROM users u
     LEFT JOIN oauth_accounts oa ON oa.user_id = u.id AND oa.provider = 'wechat_open'
     LEFT JOIN generation_jobs j ON j.user_id = u.id
     ${whereClause}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...bindings, limit, offset)

  const countStmt = c.env.DB.prepare(
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     LEFT JOIN oauth_accounts oa ON oa.user_id = u.id AND oa.provider = 'wechat_open'
     ${whereClause}`
  ).bind(...bindings)

  const [listRes, countRes] = await Promise.all([
    listStmt.all<UserRow & { jobs_count: number }>(),
    countStmt.first<{ total: number }>(),
  ])

  c.header('Cache-Control', 'no-store')
  return c.json({
    users: (listRes.results || []).map((row) => mapAdminUserRow(row)),
    total: countRes?.total ?? 0,
  })
})

adminRoutes.post('/users', async (c) => {
  const adminUser = c.get('adminUser')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const username = validateUsername(body.username)
  if (!username) {
    return c.json({ error: { message: '用户名需为 3~32 位字母、数字、下划线或点/连字符' } }, 400)
  }

  const password = validatePassword(body.password)
  if (!password) {
    return c.json({ error: { message: '初始密码长度需在 6~128 位之间' } }, 400)
  }

  const emailCheck = validateEmail(body.email)
  if (!emailCheck.valid) {
    return c.json({ error: { message: '邮箱格式不正确' } }, 400)
  }

  const platform = await getPlatformConfig(c.env.DB)
  const initialCredits =
    body.initialCredits !== undefined && body.initialCredits !== ''
      ? parseIntSafe(body.initialCredits, 0, 1_000_000)
      : platform.registerBonusCredits
  if (initialCredits === null) {
    return c.json({ error: { message: '初始积分必须为 0~1000000 的整数' } }, 400)
  }

  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim().slice(0, 120) : ''
  const displayNameRaw = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const displayName = (displayNameRaw || username).slice(0, 40)
  const role = body.role === 'admin' ? 'admin' : 'user'

  const existingName = await c.env.DB.prepare(
    `SELECT id FROM users WHERE username_lower = ?`
  )
    .bind(username.toLowerCase())
    .first<{ id: string }>()
  if (existingName) {
    return c.json({ error: { message: '该用户名已被占用' } }, 409)
  }

  if (emailCheck.value) {
    const existingEmail = await c.env.DB.prepare(
      `SELECT id FROM users WHERE email_lower = ?`
    )
      .bind(emailCheck.value.toLowerCase())
      .first<{ id: string }>()
    if (existingEmail) {
      return c.json({ error: { message: '该邮箱已被占用' } }, 409)
    }
  }

  const passwordHash = await hashPassword(password)
  const created = await createUserWithBonus(c.env.DB, {
    id: crypto.randomUUID(),
    username,
    email: emailCheck.value,
    displayName,
    adminNote,
    passwordHash,
    role,
    initialCredits,
    bonusNote: `管理员创建账号赠送 ${initialCredits} 积分`,
    operatorId: adminUser.id,
  })

  c.header('Cache-Control', 'no-store')
  return c.json(
    {
      user: {
        ...created,
        jobsCount: 0,
        adminNote,
      },
    },
    201
  )
})

adminRoutes.patch('/users/:id', async (c) => {
  const adminUser = c.get('adminUser')!
  const targetUserId = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const target = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(targetUserId)
    .first<UserRow>()
  if (!target) {
    return c.json({ error: { message: '用户不存在' } }, 404)
  }

  const nextStatus =
    body.status === 'active' || body.status === 'disabled' ? body.status : target.status
  const nextRole = body.role === 'user' || body.role === 'admin' ? body.role : target.role

  if (targetUserId === adminUser.id && (nextStatus !== target.status || nextRole !== target.role)) {
    return c.json({ error: { message: '不能修改当前登录管理员自身的状态或角色' } }, 400)
  }

  const nextAdminNote =
    typeof body.adminNote === 'string'
      ? body.adminNote.trim().slice(0, 120)
      : target.admin_note || ''

  const nextDisplayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 40)
      : target.display_name

  let nextPasswordHash = target.password_hash
  let passwordChanged = false
  if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
    const validPwd = validatePassword(body.newPassword)
    if (!validPwd) {
      return c.json({ error: { message: '重置密码长度需在 6~128 位之间' } }, 400)
    }
    nextPasswordHash = await hashPassword(validPwd)
    passwordChanged = true
  }

  await c.env.DB.prepare(
    `UPDATE users
     SET display_name = ?, admin_note = ?, password_hash = ?, status = ?, role = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      nextDisplayName,
      nextAdminNote,
      nextPasswordHash,
      nextStatus,
      nextRole,
      Date.now(),
      targetUserId
    )
    .run()

  if (nextStatus === 'disabled' || (passwordChanged && targetUserId !== adminUser.id)) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(targetUserId).run()
  }

  const updated = await getUserWithOAuthById(c.env.DB, targetUserId)
  const jobCountRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM generation_jobs WHERE user_id = ?`
  )
    .bind(targetUserId)
    .first<{ cnt: number }>()

  c.header('Cache-Control', 'no-store')
  return c.json({
    user: updated ? mapAdminUserRow({ ...updated, jobs_count: jobCountRow?.cnt ?? 0 }) : null,
  })
})

adminRoutes.post('/users/:id/credits', async (c) => {
  const adminUser = c.get('adminUser')!
  const targetUserId = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const delta = parseIntSafe(body.delta, -1_000_000, 1_000_000)
  if (delta === null || delta === 0) {
    return c.json({ error: { message: '积分变动值必须为非零整数' } }, 400)
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : ''

  try {
    const creditBalance = await adjustUserCredits(c.env.DB, {
      userId: targetUserId,
      delta,
      note,
      operatorId: adminUser.id,
    })
    return c.json({ creditBalance })
  } catch (err) {
    return c.json({ error: { message: err instanceof Error ? err.message : '操作失败' } }, 400)
  }
})

adminRoutes.patch('/users/:id/status', async (c) => {
  const adminUser = c.get('adminUser')!
  const targetUserId = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  if (targetUserId === adminUser.id) {
    return c.json({ error: { message: '不能修改当前登录管理员自身的状态或角色' } }, 400)
  }

  const target = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(targetUserId)
    .first<UserRow>()
  if (!target) {
    return c.json({ error: { message: '用户不存在' } }, 404)
  }

  const nextStatus =
    body.status === 'active' || body.status === 'disabled' ? body.status : target.status
  const nextRole = body.role === 'user' || body.role === 'admin' ? body.role : target.role

  await c.env.DB.prepare(
    `UPDATE users SET status = ?, role = ?, updated_at = ? WHERE id = ?`
  )
    .bind(nextStatus, nextRole, Date.now(), targetUserId)
    .run()

  if (nextStatus === 'disabled') {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(targetUserId).run()
  }

  const updated = await getUserWithOAuthById(c.env.DB, targetUserId)
  return c.json({ user: updated ? mapUserRow(updated) : null })
})

adminRoutes.get('/ledger', async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)
  const q = (c.req.query('q') || '').trim().toLowerCase()
  const type = (c.req.query('type') || 'all').trim()

  const clauses: string[] = []
  const bindings: unknown[] = []
  if (
    type &&
    type !== 'all' &&
    ['register_bonus', 'redeem_code', 'admin_adjust', 'generate_deduct', 'generate_refund'].includes(type)
  ) {
    clauses.push('l.type = ?')
    bindings.push(type)
  }
  if (q) {
    const pattern = `%${q}%`
    clauses.push(
      `(LOWER(COALESCE(u.username, '')) LIKE ? OR LOWER(COALESCE(u.admin_note, '')) LIKE ? OR LOWER(COALESCE(l.note, '')) LIKE ?)`
    )
    bindings.push(pattern, pattern, pattern)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const [res, countRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT l.*, u.username, u.admin_note AS user_admin_note
       FROM credit_ledger l
       LEFT JOIN users u ON u.id = l.user_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM credit_ledger l
       LEFT JOIN users u ON u.id = l.user_id
       ${where}`
    )
      .bind(...bindings)
      .first<{ total: number }>(),
  ])

  c.header('Cache-Control', 'no-store')
  return c.json({
    items: (res.results || []).map(mapLedgerRow),
    total: countRes?.total ?? 0,
  })
})

adminRoutes.get('/redeem-codes', async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)
  const filter = (c.req.query('filter') || 'all').trim()
  const q = (c.req.query('q') || '').trim().toLowerCase()
  const now = Date.now()

  const clauses: string[] = []
  const bindings: unknown[] = []
  if (filter === 'active') {
    clauses.push(`status = 'active' AND used_count < max_uses AND (expires_at IS NULL OR expires_at > ?)`)
    bindings.push(now)
  } else if (filter === 'exhausted') {
    clauses.push(`used_count >= max_uses`)
  } else if (filter === 'disabled') {
    clauses.push(`status = 'disabled'`)
  } else if (filter === 'expired') {
    clauses.push(`expires_at IS NOT NULL AND expires_at <= ?`)
    bindings.push(now)
  }
  if (q) {
    const pattern = `%${q}%`
    clauses.push(`(LOWER(code) LIKE ? OR LOWER(COALESCE(note, '')) LIKE ?)`)
    bindings.push(pattern, pattern)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const [res, countRes, summaryRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM redeem_codes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM redeem_codes ${where}`)
      .bind(...bindings)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         COUNT(*) AS all_count,
         SUM(CASE WHEN status = 'active' AND used_count < max_uses AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN used_count >= max_uses THEN 1 ELSE 0 END) AS exhausted_count,
         SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled_count,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired_count
       FROM redeem_codes`
    )
      .bind(now, now)
      .first<{
        all_count: number
        active_count: number | null
        exhausted_count: number | null
        disabled_count: number | null
        expired_count: number | null
      }>(),
  ])

  c.header('Cache-Control', 'no-store')
  return c.json({
    codes: (res.results || []).map((r) => ({
      id: r.id,
      code: r.code,
      credits: r.credits,
      maxUses: r.max_uses,
      usedCount: r.used_count,
      expiresAt: r.expires_at,
      status: r.status,
      note: r.note,
      createdBy: r.created_by,
      createdAt: r.created_at,
    })),
    total: countRes?.total ?? 0,
    counts: {
      all: summaryRes?.all_count ?? 0,
      active: summaryRes?.active_count ?? 0,
      exhausted: summaryRes?.exhausted_count ?? 0,
      disabled: summaryRes?.disabled_count ?? 0,
      expired: summaryRes?.expired_count ?? 0,
    },
  })
})

adminRoutes.post('/redeem-codes', async (c) => {
  const adminUser = c.get('adminUser')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const count = parseIntSafe(body.count ?? 1, 1, 50)
  const credits = parseIntSafe(body.credits, 1, 1_000_000)
  const maxUses = parseIntSafe(body.maxUses ?? 1, 1, 100_000)
  if (!count || !credits || !maxUses) {
    return c.json({ error: { message: '数量(1~50)、积分(>=1)、可用次数(>=1)参数无效' } }, 400)
  }

  const hasExpiresDays =
    body.expiresDays !== undefined && body.expiresDays !== null && body.expiresDays !== ''
  const expiresDays = hasExpiresDays ? parseIntSafe(body.expiresDays, 1, 3650) : null
  if (hasExpiresDays && expiresDays === null) {
    return c.json({ error: { message: '有效天数需为 1~3650 的整数' } }, 400)
  }
  const expiresAt = expiresDays ? Date.now() + expiresDays * 24 * 60 * 60 * 1000 : null
  const prefix = typeof body.prefix === 'string' ? body.prefix : 'POSE'
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 120) : ''

  const created = await createRedeemCodesBatch(c.env.DB, {
    count,
    credits,
    maxUses,
    expiresAt,
    note,
    prefix,
    createdBy: adminUser.id,
  })
  return c.json({ codes: created }, 201)
})

adminRoutes.patch('/redeem-codes/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  if (body.status !== 'active' && body.status !== 'disabled') {
    return c.json({ error: { message: '无效的状态值' } }, 400)
  }

  await c.env.DB.prepare(`UPDATE redeem_codes SET status = ? WHERE id = ?`)
    .bind(body.status, id)
    .run()
  return c.json({ ok: true })
})

adminRoutes.delete('/redeem-codes/:id', async (c) => {
  const id = c.req.param('id')
  const res = await c.env.DB.prepare(
    `DELETE FROM redeem_codes WHERE id = ? AND used_count = 0`
  )
    .bind(id)
    .run()
  if ((res.meta?.changes ?? 0) === 0) {
    return c.json(
      { error: { message: '兑换码不存在或已被领取使用，无法删除（可改为停用）' } },
      409
    )
  }
  return c.json({ ok: true })
})

adminRoutes.get('/queue', async (c) => {
  const snapshot = await fetchQueueSnapshotViaCoordinator(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json(snapshot)
})

adminRoutes.post('/queue/reconcile', async (c) => {
  const res = await reconcileQueueViaCoordinator(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json(res)
})

adminRoutes.post('/queue/:id/cancel', async (c) => {
  const id = c.req.param('id')
  let body: { forceProcessing?: boolean; reason?: string } = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const forceProcessing = body.forceProcessing === true
  const existing = await c.env.DB.prepare(`SELECT id, status FROM generation_jobs WHERE id = ?`)
    .bind(id)
    .first<{ id: string; status: string }>()
  if (!existing) {
    return c.json({ error: { message: '任务不存在' } }, 404)
  }

  if (existing.status === 'queued') {
    const res = await cancelQueuedJobViaCoordinator(c.env, {
      jobId: id,
      reason: body.reason?.trim() || '管理员已取消排队，积分已全额退还',
      ledgerNote: '管理员取消排队退还',
    })
    if (!res.cancelled) {
      return c.json({ error: { message: '该任务状态已变化，无法取消排队' } }, 409)
    }
    return c.json({ ok: true, refunded: res.refunded, mode: 'cancelled_queued' })
  }

  if (existing.status === 'processing' && forceProcessing) {
    const res = await forceCancelProcessingJobViaCoordinator(c.env, {
      jobId: id,
      reason: body.reason?.trim() || '管理员强制中止绘制任务并全额退还积分',
    })
    return c.json({ ok: true, refunded: res.refunded, mode: 'aborted_processing' })
  }

  return c.json(
    {
      error: {
        message:
          existing.status === 'processing'
            ? '任务正在绘制中，如需强行中止请勾选强制中止操作'
            : '该任务已完结，无需取消',
      },
    },
    409
  )
})

adminRoutes.get('/generations', async (c) => {
  await reapStaleProcessingJobs(c.env.DB)
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)
  const status = (c.req.query('status') || '').trim()
  const provider = (c.req.query('provider') || '').trim()
  const q = (c.req.query('q') || '').trim().toLowerCase()

  const clauses: string[] = []
  const bindings: unknown[] = []
  if (status && ['queued', 'processing', 'succeeded', 'failed', 'cancelled'].includes(status)) {
    clauses.push('j.status = ?')
    bindings.push(status)
  }
  if (provider && PROVIDER_ORDER.includes(provider as ImageProviderId)) {
    clauses.push('j.provider = ?')
    bindings.push(provider)
  }
  if (q) {
    const pattern = `%${q}%`
    clauses.push(
      `(LOWER(COALESCE(u.username, '')) LIKE ? OR LOWER(j.prompt) LIKE ? OR LOWER(j.model) LIKE ? OR LOWER(COALESCE(j.profile_name, '')) LIKE ? OR LOWER(COALESCE(j.channel_name, '')) LIKE ? OR LOWER(COALESCE(j.supplier_name, '')) LIKE ? OR LOWER(COALESCE(j.error_message, '')) LIKE ?)`
    )
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const [res, statsRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT j.*, u.username
       FROM generation_jobs j
       LEFT JOIN users u ON u.id = j.user_id
       ${where}
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all<JobRow>(),
    c.env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN j.status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN j.status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN j.status = 'processing' THEN 1 ELSE 0 END) AS processing,
         SUM(CASE WHEN j.status = 'queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN j.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
         SUM(
           CASE
             WHEN j.trace_json IS NOT NULL
              AND json_valid(j.trace_json) = 1
              AND COALESCE(json_array_length(j.trace_json, '$.attempts'), 0) > 1
             THEN 1 ELSE 0
           END
         ) AS retried
       FROM generation_jobs j
       LEFT JOIN users u ON u.id = j.user_id
       ${where}`
    )
      .bind(...bindings)
      .first<{
        total: number
        succeeded: number | null
        failed: number | null
        processing: number | null
        queued: number | null
        cancelled: number | null
        retried: number | null
      }>(),
  ])

  const stats: AdminJobsStatsSummary = {
    total: statsRow?.total ?? 0,
    succeeded: statsRow?.succeeded ?? 0,
    failed: statsRow?.failed ?? 0,
    processing: statsRow?.processing ?? 0,
    queued: statsRow?.queued ?? 0,
    cancelled: statsRow?.cancelled ?? 0,
    retried: statsRow?.retried ?? 0,
  }

  const rows = res.results || []
  let queueMap = new Map<string, ReturnType<typeof computeQueuePositions> extends Map<string, infer V> ? V : never>()
  if (rows.some((r) => r.status === 'queued')) {
    const [activeRows, platform] = await Promise.all([
      listActiveQueueRows(c.env.DB),
      getPlatformConfig(c.env.DB),
    ])
    queueMap = computeQueuePositions(activeRows, mergeGenerationQueueConfig(platform.queueConfig))
  }

  c.header('Cache-Control', 'no-store')
  return c.json({
    items: rows.map((row) =>
      mapJobRow(row, {
        isAdmin: true,
        queueInfo: row.status === 'queued' ? queueMap.get(row.id) ?? null : null,
      })
    ),
    total: stats.total,
    stats,
  })
})

adminRoutes.get('/generations/:id', async (c) => {
  await reapStaleProcessingJobs(c.env.DB)
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(
    `SELECT j.*, u.username
     FROM generation_jobs j
     LEFT JOIN users u ON u.id = j.user_id
     WHERE j.id = ?`
  )
    .bind(id)
    .first<JobRow>()

  if (!row) {
    return c.json({ error: { message: '生成记录不存在' } }, 404)
  }

  let queueInfo = null
  if (row.status === 'queued') {
    const [activeRows, platform] = await Promise.all([
      listActiveQueueRows(c.env.DB),
      getPlatformConfig(c.env.DB),
    ])
    queueInfo =
      computeQueuePositions(activeRows, mergeGenerationQueueConfig(platform.queueConfig)).get(row.id) ??
      null
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ job: mapJobRow(row, { isAdmin: true, queueInfo }) })
})

adminRoutes.get('/sync/mio', async (c) => {
  const status = await getMioSyncStatus(c.env.BUCKET)
  c.header('Cache-Control', 'no-store')
  return c.json(status)
})

adminRoutes.post('/sync/mio', async (c) => {
  try {
    const status = await syncMioArchive(c.env, { throwOnError: true })
    c.header('Cache-Control', 'no-store')
    return c.json(status)
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步上游档案失败'
    return c.json({ error: { message } }, 502)
  }
})

adminRoutes.get('/sync/outfit-db', async (c) => {
  const status = await getOutfitDbSyncStatus(c.env.BUCKET)
  c.header('Cache-Control', 'no-store')
  return c.json(status)
})

adminRoutes.post('/sync/outfit-db', async (c) => {
  try {
    const status = await syncOutfitDbArchive(c.env, { throwOnError: true })
    c.header('Cache-Control', 'no-store')
    return c.json(status)
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步上游服装档案失败'
    return c.json({ error: { message } }, 502)
  }
})

const VALID_DESC_KINDS = new Set<ReferenceDescriptionKind>([
  'pose',
  'costume',
  'portrait',
  'extra',
])

adminRoutes.get('/reference-descriptions', async (c) => {
  const rawKind = (c.req.query('kind') || 'all').toLowerCase()
  const kind: 'all' | ReferenceDescriptionKind = VALID_DESC_KINDS.has(
    rawKind as ReferenceDescriptionKind
  )
    ? (rawKind as ReferenceDescriptionKind)
    : 'all'
  const q = c.req.query('q') || ''
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '20') || 20))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const data = await listReferenceDescriptions(c.env.DB, { kind, q, limit, offset })
  c.header('Cache-Control', 'no-store')
  return c.json(data)
})

adminRoutes.get('/reference-descriptions/preview', async (c) => {
  const key = (c.req.query('key') || '').trim()
  if (!key || !key.startsWith('uploads/') || key.includes('..')) {
    return c.json({ error: { message: '无效的图片键' } }, 400)
  }
  const obj = await c.env.BUCKET.get(key)
  if (!obj) {
    return c.json({ error: { message: '图片不存在' } }, 404)
  }
  const headers = new Headers()
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg')
  headers.set('Cache-Control', 'private, max-age=300')
  return new Response(obj.body, { status: 200, headers })
})

adminRoutes.post('/reference-descriptions/transcribe', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }
  const kind = VALID_DESC_KINDS.has(body.kind as ReferenceDescriptionKind)
    ? (body.kind as ReferenceDescriptionKind)
    : null
  const previewPath = typeof body.previewPath === 'string' ? body.previewPath.trim() : ''
  const sourceLabel = typeof body.sourceLabel === 'string' ? body.sourceLabel.trim() : ''
  const manualDescription = typeof body.description === 'string' ? body.description.trim() : ''
  if (!kind || !previewPath) {
    return c.json(
      { error: { message: '请指定有效类型 (pose/costume/portrait/extra) 与参考图路径' } },
      400
    )
  }

  const source = buildSourceFromPreviewPath(kind, previewPath, sourceLabel)
  if (!source) {
    return c.json({ error: { message: '参考图路径不合法或不受支持' } }, 400)
  }

  if (manualDescription) {
    if (manualDescription.length > 2000) {
      return c.json({ error: { message: '描述文本不能超过 2000 字符' } }, 400)
    }
    try {
      const item = await saveManualReferenceDescriptionFromSource({
        env: c.env,
        kind,
        source,
        description: manualDescription,
      })
      c.header('Cache-Control', 'no-store')
      return c.json({ item, cacheHit: false }, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存手动参考图描述失败'
      return c.json({ error: { message } }, 400)
    }
  }

  try {
    const platform = await getPlatformConfig(c.env.DB)
    const visionCfg = mergeVisionFallbackConfig(platform.visionFallback)
    const targets = await resolveVisionFallbackTargets(c.env, visionCfg)
    const res = await resolveOrTranscribeReferenceDescription({
      env: c.env,
      kind,
      source,
      visionConfig: visionCfg,
      targets,
    })
    c.header('Cache-Control', 'no-store')
    return c.json({
      description: res.description,
      cacheHit: res.cacheHit,
      visionModel: res.visionModel,
      item: res.item,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '即时视觉转译失败'
    return c.json({ error: { message } }, 502)
  }
})

adminRoutes.patch('/reference-descriptions/:id', async (c) => {
  const id = c.req.param('id')
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const sourceLabel = typeof body.sourceLabel === 'string' ? body.sourceLabel : undefined
  if (!description) {
    return c.json({ error: { message: '描述文本不能为空' } }, 400)
  }
  if (description.length > 2000) {
    return c.json({ error: { message: '描述文本不能超过 2000 字符' } }, 400)
  }

  const updated = await updateReferenceDescriptionManual(c.env.DB, id, {
    description,
    sourceLabel,
  })
  if (!updated) {
    return c.json({ error: { message: '未找到该参考图描述记录' } }, 404)
  }
  c.header('Cache-Control', 'no-store')
  return c.json({ item: updated })
})

adminRoutes.post('/reference-descriptions/:id/regenerate', async (c) => {
  const id = c.req.param('id')
  const existing = await findReferenceDescriptionById(c.env.DB, id)
  if (!existing) {
    return c.json({ error: { message: '未找到该参考图描述记录' } }, 404)
  }
  const previewPath =
    existing.previewPath ||
    existing.refKey.replace(/^(?:gallery|https):/, '')

  try {
    const platform = await getPlatformConfig(c.env.DB)
    const visionCfg = mergeVisionFallbackConfig(platform.visionFallback)
    const targets = await resolveVisionFallbackTargets(c.env, visionCfg)
    const regenerated = await regenerateReferenceDescriptionFromPreview({
      env: c.env,
      kind: existing.kind,
      previewPath,
      label: existing.sourceLabel,
      visionConfig: visionCfg,
      targets,
    })
    const updated = await updateReferenceDescriptionRegenerated(c.env.DB, id, regenerated)
    c.header('Cache-Control', 'no-store')
    return c.json({ item: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : '重新识图生成失败'
    return c.json({ error: { message } }, 502)
  }
})

adminRoutes.delete('/reference-descriptions/:id', async (c) => {
  const id = c.req.param('id')
  const ok = await deleteReferenceDescription(c.env.DB, id)
  if (!ok) {
    return c.json({ error: { message: '未找到该参考图描述记录' } }, 404)
  }
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true })
})
