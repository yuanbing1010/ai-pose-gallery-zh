import {
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  PROVIDER_ORDER,
  formatUserFacingGenerationError,
  getStudioArtist,
  mergePromptTemplate,
  normalizeStylePresetTaxonomy,
  type AdminProviderSlotDTO,
  type AdminUserItem,
  type AdminWechatConfigDTO,
  type CreditLedgerItem,
  type GenerationAuditTrace,
  type GenerationHistoryItem,
  type GenerationSnapshot,
  type ImageProviderId,
  type PlatformConfig,
  type ProviderChannelDTO,
  type ProviderPublicInfo,
  type PublicUser,
  type RedeemCodeItem,
  type StudioAspectRatio,
  type StyleCategoryItem,
  type StylePresetItem,
  type StyleSubcategoryItem,
  type SupplierDTO,
  type UserRole,
  type UserStatus,
  type WechatLoginPublicInfo,
} from '../shared/studio'
import {
  decryptSecret,
  encryptSecret,
  generateRedeemCode,
  hashPassword,
  maskApiKey,
  randomTokenHex,
  sha256Hex,
} from './crypto'
import type { Env } from './types'
import { validateExternalImageUrl } from './validation'

export const SESSION_COOKIE_NAME = 'pose_atlas_sid'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const DEFAULT_CREDIT_COSTS: Record<ImageProviderId, number> = {
  gemini: 10,
  gpt: 15,
  grok: 10,
}

export interface UserRow {
  id: string
  username: string
  username_lower: string
  email: string | null
  email_lower: string | null
  display_name: string
  password_hash: string
  role: UserRole
  credit_balance: number
  status: UserStatus
  created_at: number
  updated_at: number
  last_login_at: number | null
  wechat_openid?: string | null
  wechat_nickname?: string | null
  wechat_avatar_url?: string | null
  admin_note?: string | null
}

export interface ProviderRow {
  provider_id: ImageProviderId
  enabled: number
  credit_cost: number
  base_url: string
  model: string
  custom_model: string
  api_key_encrypted: string
  api_key_hint: string
  params_json: string
  sort_order: number
  updated_at: number
}

export interface JobRow {
  id: string
  user_id: string
  username?: string
  idempotency_key: string
  provider: ImageProviderId
  model: string
  channel_id?: string | null
  channel_name?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  status: 'processing' | 'succeeded' | 'failed'
  credits_cost: number
  credits_refunded: number
  prompt: string
  recipe_summary: string
  aspect_ratio: StudioAspectRatio
  style_preset: string
  snapshot_json: string
  trace_json?: string | null
  result_r2_key: string | null
  result_mime: string | null
  result_bytes: number | null
  error_message: string | null
  created_at: number
  finished_at: number | null
}

export interface SupplierRow {
  id: string
  name: string
  base_url: string
  api_key_encrypted: string
  api_key_hint: string
  enabled: number
  note: string
  created_at: number
  updated_at: number
  channel_count?: number
}

export interface ChannelRow {
  id: string
  provider_id: ImageProviderId
  supplier_id: string
  name: string
  enabled: number
  model: string
  custom_model: string
  priority: number
  weight?: number
  params_json: string
  created_at: number
  updated_at: number
  supplier_name?: string
  supplier_base_url?: string
  supplier_api_key_encrypted?: string
  supplier_api_key_hint?: string
  supplier_enabled?: number
}

export interface RunnableChannel {
  channelId: string
  channelName: string
  supplierId: string
  supplierName: string
  baseUrl: string
  apiKey: string
  providerId: ImageProviderId
  model: string
  paramsJson: string
  priority: number
}

export function mapUserRow(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.wechat_avatar_url || null,
    hasPassword: Boolean(row.password_hash),
    wechatBound: Boolean(row.wechat_openid),
    wechatNickname: row.wechat_nickname || null,
    role: row.role,
    creditBalance: row.credit_balance,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export function mapAdminUserRow(
  row: UserRow & { jobs_count?: number }
): AdminUserItem {
  return {
    ...mapUserRow(row),
    jobsCount: row.jobs_count || 0,
    adminNote: row.admin_note || '',
  }
}

export async function getUserWithOAuthById(db: D1Database, userId: string): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT u.*,
              oa.openid AS wechat_openid,
              oa.nickname AS wechat_nickname,
              oa.avatar_url AS wechat_avatar_url
       FROM users u
       LEFT JOIN oauth_accounts oa ON oa.user_id = u.id AND oa.provider = 'wechat_open'
       WHERE u.id = ?`
    )
    .bind(userId)
    .first<UserRow>()
}

export function mapJobRow(
  row: JobRow,
  options: { isAdmin?: boolean } = {}
): GenerationHistoryItem {
  const isAdmin = Boolean(options.isAdmin)
  const artistName = getStudioArtist(row.provider).name
  let snapshot: GenerationSnapshot | undefined
  try {
    const parsed = JSON.parse(row.snapshot_json) as GenerationSnapshot
    snapshot = isAdmin ? parsed : { ...parsed, model: artistName }
  } catch {
    snapshot = undefined
  }
  let auditTrace: GenerationAuditTrace | null | undefined
  let parsedTrace: GenerationAuditTrace | null = null
  if (row.trace_json) {
    try {
      parsedTrace = JSON.parse(row.trace_json) as GenerationAuditTrace
    } catch {
      parsedTrace = null
    }
  }
  if (isAdmin) {
    auditTrace = parsedTrace
  }
  const liveProgress =
    row.status === 'processing' && parsedTrace?.liveState
      ? {
          stage: parsedTrace.liveState.stage,
          message: parsedTrace.liveState.message,
          attempt: parsedTrace.liveState.attempt,
          totalAttempts: parsedTrace.liveState.totalAttempts,
          startedAt: parsedTrace.liveState.startedAt ?? parsedTrace.startedAt ?? row.created_at,
          stageStartedAt: parsedTrace.liveState.stageStartedAt,
          percent: parsedTrace.liveState.percent,
        }
      : row.status === 'processing'
        ? {
            stage: 'generating' as const,
            message: `${artistName}正在云端绘制作品…`,
            startedAt: parsedTrace?.startedAt ?? row.created_at,
          }
        : undefined
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    status: row.status,
    creditsCost: row.credits_cost,
    creditsRefunded: row.credits_refunded,
    provider: row.provider,
    model: isAdmin ? row.model : artistName,
    ...(isAdmin
      ? {
          channelId: row.channel_id ?? null,
          channelName: row.channel_name ?? null,
          supplierId: row.supplier_id ?? null,
          supplierName: row.supplier_name ?? null,
          auditTrace,
        }
      : {}),
    prompt: row.prompt,
    aspectRatio: row.aspect_ratio || '3:4',
    stylePreset: row.style_preset || 'none',
    imageUrl: row.result_r2_key ? `/api/files/${row.result_r2_key}` : '',
    recipeSummary: row.recipe_summary,
    errorMessage: row.error_message
      ? isAdmin
        ? row.error_message
        : formatUserFacingGenerationError(row.error_message, row.provider)
      : row.error_message,
    ...(liveProgress ? { liveProgress } : {}),
    snapshot,
  }
}

export function getEnvFallbackApiKey(env: Env, providerId: ImageProviderId): string {
  switch (providerId) {
    case 'gemini':
      return (env.GEMINI_API_KEY || '').trim()
    case 'gpt':
      return (env.OPENAI_API_KEY || '').trim()
    case 'grok':
      return (env.XAI_API_KEY || '').trim()
  }
}

export async function resolveProviderApiKey(env: Env, row: ProviderRow): Promise<string> {
  const fromDb = await decryptSecret(row.api_key_encrypted, env.APP_ENCRYPTION_KEY)
  if (fromDb.trim()) return fromDb.trim()
  return getEnvFallbackApiKey(env, row.provider_id)
}

let platformSeeded = false
let seedingPromise: Promise<void> | null = null

export async function ensurePlatformSeeded(env: Env): Promise<void> {
  if (platformSeeded) return
  if (!seedingPromise) {
    seedingPromise = (async () => {
      const existing = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM provider_configs`
      ).first<{ cnt: number }>()
      if ((existing?.cnt ?? 0) < PROVIDER_ORDER.length) {
        const now = Date.now()
        const statements: D1PreparedStatement[] = [
          env.DB.prepare(
            `INSERT OR IGNORE INTO system_settings (key, value_json, updated_at) VALUES ('platform_config', ?, ?)`
          ).bind(JSON.stringify(DEFAULT_PLATFORM_CONFIG), now),
          ...PROVIDER_ORDER.map((id, idx) => {
            const meta = PROVIDER_META[id]
            return env.DB.prepare(
              `INSERT OR IGNORE INTO provider_configs (
                provider_id, enabled, credit_cost, base_url, model, custom_model,
                api_key_encrypted, api_key_hint, params_json, sort_order, updated_at
              ) VALUES (?, 1, ?, ?, ?, '', '', '', ?, ?, ?)`
            ).bind(
              id,
              DEFAULT_CREDIT_COSTS[id],
              meta.defaultBaseUrl,
              meta.models[0].value,
              JSON.stringify(DEFAULT_PROVIDER_PARAMS[id]),
              idx,
              now
            )
          }),
        ]
        await env.DB.batch(statements)
      }

      // 可选通过环境变量自动初始化首个管理员账号
      const bootUser = (env.BOOTSTRAP_ADMIN_USERNAME || '').trim()
      const bootPass = env.BOOTSTRAP_ADMIN_PASSWORD || ''
      if (bootUser && bootPass.length >= 6) {
        const existingAdmin = await env.DB.prepare(
          `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`
        ).first<{ cnt: number }>()
        if ((existingAdmin?.cnt ?? 0) === 0) {
          const passwordHash = await hashPassword(bootPass)
          const adminId = crypto.randomUUID()
          try {
            await createUserWithBonus(env.DB, {
              id: adminId,
              username: bootUser,
              email: null,
              displayName: bootUser,
              passwordHash,
              role: 'admin',
              initialCredits: 1000,
              bonusNote: '管理员初始化赠送',
            })
          } catch {
            // 并发请求下已被创建时忽略
          }
        }
      }
      platformSeeded = true
    })().finally(() => {
      seedingPromise = null
    })
  }
  await seedingPromise
}

function sanitizeStylePreviewUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const val = raw.trim()
  if (!val) return undefined
  if (/^\/api\/style-assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif)$/i.test(val)) {
    return val
  }
  if (/^\/assets\/[a-zA-Z0-9_.-]+$/i.test(val)) {
    return val
  }
  if (/^https:\/\//i.test(val)) {
    const validated = validateExternalImageUrl(val)
    return validated ? validated.toString() : undefined
  }
  return undefined
}

export function sanitizeStyleCategoriesInput(rawList: unknown): StyleCategoryItem[] | null {
  if (!Array.isArray(rawList)) return null
  const result: StyleCategoryItem[] = []
  const seen = new Set<string>()
  for (const item of rawList.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const rawId = typeof rec.id === 'string' ? rec.id.trim() : ''
    if (!rawId || rawId === 'all' || !/^[a-zA-Z0-9_-]{1,48}$/.test(rawId) || seen.has(rawId)) {
      continue
    }
    const label = typeof rec.label === 'string' ? rec.label.trim().slice(0, 40) : ''
    if (!label) continue
    seen.add(rawId)
    result.push({ id: rawId, label })
  }
  return result
}

export function sanitizeStyleSubcategoriesInput(
  rawList: unknown,
  validCategoryIds?: Set<string>
): StyleSubcategoryItem[] | null {
  if (!Array.isArray(rawList)) return null
  const result: StyleSubcategoryItem[] = []
  const seen = new Set<string>()
  for (const item of rawList.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const rawId = typeof rec.id === 'string' ? rec.id.trim() : ''
    if (!rawId || rawId === 'all' || !/^[a-zA-Z0-9_-]{1,48}$/.test(rawId) || seen.has(rawId)) {
      continue
    }
    const categoryId = typeof rec.categoryId === 'string' ? rec.categoryId.trim() : ''
    if (!categoryId || !/^[a-zA-Z0-9_-]{1,48}$/.test(categoryId)) {
      continue
    }
    if (validCategoryIds && !validCategoryIds.has(categoryId)) {
      continue
    }
    const label = typeof rec.label === 'string' ? rec.label.trim().slice(0, 40) : ''
    if (!label) continue
    seen.add(rawId)
    result.push({ id: rawId, categoryId, label })
  }
  return result
}

export function sanitizeStylePresetsInput(
  rawList: unknown,
  categories?: StyleCategoryItem[],
  subcategories?: StyleSubcategoryItem[]
): StylePresetItem[] | null {
  if (!Array.isArray(rawList)) return null
  const result: StylePresetItem[] = []
  const seen = new Set<string>()
  for (const item of rawList.slice(0, 300)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const rawId = typeof rec.id === 'string' ? rec.id.trim() : ''
    if (!rawId || rawId === 'none' || !/^[a-zA-Z0-9_-]{1,48}$/.test(rawId) || seen.has(rawId)) {
      continue
    }
    const label = typeof rec.label === 'string' ? rec.label.trim().slice(0, 60) : ''
    if (!label) continue
    seen.add(rawId)
    const categoryId = typeof rec.categoryId === 'string' ? rec.categoryId.trim().slice(0, 48) : ''
    const subcategoryId =
      typeof rec.subcategoryId === 'string' ? rec.subcategoryId.trim().slice(0, 48) : ''
    const shortLabel =
      typeof rec.shortLabel === 'string' ? rec.shortLabel.trim().slice(0, 24) : ''
    const tagline = typeof rec.tagline === 'string' ? rec.tagline.trim().slice(0, 120) : ''
    const prompt = typeof rec.prompt === 'string' ? rec.prompt.trim().slice(0, 1000) : ''
    const negativePrompt =
      typeof rec.negativePrompt === 'string' ? rec.negativePrompt.trim().slice(0, 1000) : ''
    const previewUrl = sanitizeStylePreviewUrl(rec.previewUrl)
    const baseItem = {
      id: rawId,
      categoryId,
      subcategoryId,
      label,
      ...(shortLabel ? { shortLabel } : {}),
      ...(tagline ? { tagline } : {}),
      prompt,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    }
    result.push(
      categories && subcategories
        ? normalizeStylePresetTaxonomy(baseItem, categories, subcategories)
        : baseItem
    )
  }
  return result
}

export async function getPlatformConfig(db: D1Database): Promise<PlatformConfig> {
  const row = await db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'platform_config'`)
    .first<{ value_json: string }>()
  if (!row) return { ...DEFAULT_PLATFORM_CONFIG }
  try {
    const parsed = JSON.parse(row.value_json) as Partial<PlatformConfig>
    const stylePromptOverrides: Record<string, string> = {}
    const sanitizedCategories = sanitizeStyleCategoriesInput(parsed.styleCategories)
    const styleCategories = sanitizedCategories ?? []
    const validCatIds = new Set(styleCategories.map((c) => c.id))
    const sanitizedSubcategories = sanitizeStyleSubcategoriesInput(
      parsed.styleSubcategories,
      validCatIds
    )
    const styleSubcategories = sanitizedSubcategories ?? []
    const sanitizedPresets = sanitizeStylePresetsInput(
      parsed.stylePresets,
      styleCategories,
      styleSubcategories
    )
    const stylePresets = sanitizedPresets ?? []
    const validStyleIds = new Set(stylePresets.map((s) => s.id))
    const style =
      parsed.defaultStylePreset === 'none' ||
      (typeof parsed.defaultStylePreset === 'string' && validStyleIds.has(parsed.defaultStylePreset))
        ? parsed.defaultStylePreset
        : DEFAULT_PLATFORM_CONFIG.defaultStylePreset

    return {
      registerBonusCredits:
        typeof parsed.registerBonusCredits === 'number' && parsed.registerBonusCredits >= 0
          ? Math.floor(parsed.registerBonusCredits)
          : DEFAULT_PLATFORM_CONFIG.registerBonusCredits,
      allowRegistration:
        typeof parsed.allowRegistration === 'boolean'
          ? parsed.allowRegistration
          : DEFAULT_PLATFORM_CONFIG.allowRegistration,
      defaultSafeMode:
        typeof parsed.defaultSafeMode === 'boolean'
          ? parsed.defaultSafeMode
          : DEFAULT_PLATFORM_CONFIG.defaultSafeMode,
      allowUserNsfwUnlock:
        typeof parsed.allowUserNsfwUnlock === 'boolean'
          ? parsed.allowUserNsfwUnlock
          : DEFAULT_PLATFORM_CONFIG.allowUserNsfwUnlock,
      defaultStylePreset: style,
      defaultPromptPrefix:
        typeof parsed.defaultPromptPrefix === 'string'
          ? parsed.defaultPromptPrefix
          : DEFAULT_PLATFORM_CONFIG.defaultPromptPrefix,
      defaultPromptSuffix:
        typeof parsed.defaultPromptSuffix === 'string'
          ? parsed.defaultPromptSuffix
          : DEFAULT_PLATFORM_CONFIG.defaultPromptSuffix,
      defaultNegativePrompt:
        typeof parsed.defaultNegativePrompt === 'string'
          ? parsed.defaultNegativePrompt.trim().slice(0, 1000)
          : DEFAULT_PLATFORM_CONFIG.defaultNegativePrompt,
      promptTemplate: mergePromptTemplate(parsed.promptTemplate),
      styleCategories,
      styleSubcategories,
      stylePresets,
      stylePromptOverrides,
      imagePassMode:
        parsed.imagePassMode === 'base64' || parsed.imagePassMode === 'url'
          ? parsed.imagePassMode
          : DEFAULT_PLATFORM_CONFIG.imagePassMode,
      sendStitchedSheet:
        typeof parsed.sendStitchedSheet === 'boolean'
          ? parsed.sendStitchedSheet
          : DEFAULT_PLATFORM_CONFIG.sendStitchedSheet,
    }
  } catch {
    return { ...DEFAULT_PLATFORM_CONFIG }
  }
}

export async function savePlatformConfig(db: D1Database, cfg: PlatformConfig): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value_json, updated_at)
       VALUES ('platform_config', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .bind(JSON.stringify(cfg), Date.now())
    .run()
}

export async function getAllProviderRows(db: D1Database): Promise<ProviderRow[]> {
  const res = await db
    .prepare(`SELECT * FROM provider_configs ORDER BY sort_order ASC`)
    .all<ProviderRow>()
  return [...(res.results || [])].sort((a, b) => {
    const idxA = PROVIDER_ORDER.indexOf(a.provider_id)
    const idxB = PROVIDER_ORDER.indexOf(b.provider_id)
    const orderA = idxA === -1 ? 99 : idxA
    const orderB = idxB === -1 ? 99 : idxB
    return orderA - orderB
  })
}

export async function getSuppliers(env: Env): Promise<SupplierDTO[]> {
  const res = await env.DB.prepare(
    `SELECT s.*, COUNT(c.id) AS channel_count
     FROM suppliers s
     LEFT JOIN provider_channels c ON c.supplier_id = s.id
     GROUP BY s.id
     ORDER BY s.created_at DESC`
  ).all<SupplierRow>()
  return (res.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key_encrypted),
    apiKeyHint: row.api_key_hint || '',
    enabled: row.enabled === 1,
    note: row.note || '',
    channelCount: row.channel_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function parseChannelParams(providerId: ImageProviderId, paramsJson: string) {
  let params = { ...DEFAULT_PROVIDER_PARAMS[providerId] }
  try {
    params = { ...params, ...JSON.parse(paramsJson) }
  } catch {
    // fallback default
  }
  return params
}

export async function getAdminProviderSlots(env: Env): Promise<AdminProviderSlotDTO[]> {
  const [slotRows, channelRes] = await Promise.all([
    getAllProviderRows(env.DB),
    env.DB.prepare(
      `SELECT c.*,
              s.name AS supplier_name,
              s.base_url AS supplier_base_url,
              s.api_key_encrypted AS supplier_api_key_encrypted,
              s.enabled AS supplier_enabled
       FROM provider_channels c
       JOIN suppliers s ON s.id = c.supplier_id
       ORDER BY c.priority DESC, c.created_at ASC`
    ).all<ChannelRow>(),
  ])

  const channelsByProvider = new Map<ImageProviderId, ProviderChannelDTO[]>()
  for (const ch of channelRes.results || []) {
    const list = channelsByProvider.get(ch.provider_id) || []
    list.push({
      id: ch.id,
      providerId: ch.provider_id,
      supplierId: ch.supplier_id,
      supplierName: ch.supplier_name || '未知供应商',
      supplierBaseUrl: ch.supplier_base_url || '',
      supplierEnabled: ch.supplier_enabled === 1,
      supplierHasKey: Boolean(ch.supplier_api_key_encrypted),
      name: ch.name,
      enabled: ch.enabled === 1,
      model: ch.model,
      customModel: ch.custom_model || '',
      priority: ch.priority,
      params: parseChannelParams(ch.provider_id, ch.params_json),
      createdAt: ch.created_at,
      updatedAt: ch.updated_at,
    })
    channelsByProvider.set(ch.provider_id, list)
  }

  return slotRows.map((row) => ({
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    creditCost: row.credit_cost,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    channels: channelsByProvider.get(row.provider_id) || [],
  }))
}

function shuffleTier<T>(items: T[]): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export async function selectOrderedRunnableChannels(
  env: Env,
  providerId: ImageProviderId
): Promise<RunnableChannel[]> {
  const res = await env.DB.prepare(
    `SELECT c.*,
            s.name AS supplier_name,
            s.base_url AS supplier_base_url,
            s.api_key_encrypted AS supplier_api_key_encrypted,
            s.enabled AS supplier_enabled
     FROM provider_channels c
     JOIN suppliers s ON s.id = c.supplier_id
     WHERE c.provider_id = ?
     ORDER BY c.priority DESC, c.created_at ASC`
  )
    .bind(providerId)
    .all<ChannelRow>()

  const allDbChannels = res.results || []
  const runnable: RunnableChannel[] = []

  for (const ch of allDbChannels) {
    if (ch.enabled !== 1 || ch.supplier_enabled !== 1) continue
    const decrypted = await decryptSecret(
      ch.supplier_api_key_encrypted || '',
      env.APP_ENCRYPTION_KEY
    )
    const apiKey = decrypted.trim()
    if (!apiKey) continue
    const effectiveModel =
      ch.model === 'custom'
        ? ch.custom_model.trim() || PROVIDER_META[providerId].models[0].value
        : ch.model
    runnable.push({
      channelId: ch.id,
      channelName: ch.name,
      supplierId: ch.supplier_id,
      supplierName: ch.supplier_name || '',
      baseUrl: (ch.supplier_base_url || PROVIDER_META[providerId].defaultBaseUrl).trim(),
      apiKey,
      providerId,
      model: effectiveModel,
      paramsJson: ch.params_json,
      priority: ch.priority,
    })
  }

  // 若数据库中该模型尚未配置任何渠道，允许使用环境变量兜底
  if (allDbChannels.length === 0) {
    const envKey = getEnvFallbackApiKey(env, providerId)
    if (envKey) {
      const legacyRow = await env.DB.prepare(
        `SELECT * FROM provider_configs WHERE provider_id = ?`
      )
        .bind(providerId)
        .first<ProviderRow>()
      const modelVal =
        legacyRow?.model === 'custom'
          ? legacyRow.custom_model.trim() || PROVIDER_META[providerId].models[0].value
          : legacyRow?.model || PROVIDER_META[providerId].models[0].value
      runnable.push({
        channelId: `env_${providerId}`,
        channelName: '环境变量默认渠道',
        supplierId: `env_${providerId}`,
        supplierName: '环境变量密钥',
        baseUrl: legacyRow?.base_url || PROVIDER_META[providerId].defaultBaseUrl,
        apiKey: envKey,
        providerId,
        model: modelVal,
        paramsJson: legacyRow?.params_json || JSON.stringify(DEFAULT_PROVIDER_PARAMS[providerId]),
        priority: 100,
      })
    }
  }

  // 按 priority 从高到低分层，同优先级均衡打散（同时作为自动故障转移顺序）
  const tierMap = new Map<number, RunnableChannel[]>()
  for (const item of runnable) {
    const arr = tierMap.get(item.priority) || []
    arr.push(item)
    tierMap.set(item.priority, arr)
  }
  const sortedPriorities = Array.from(tierMap.keys()).sort((a, b) => b - a)
  const finalOrder: RunnableChannel[] = []
  for (const p of sortedPriorities) {
    finalOrder.push(...shuffleTier(tierMap.get(p)!))
  }
  return finalOrder
}

export async function getPublicProviders(env: Env): Promise<ProviderPublicInfo[]> {
  const [rows, countsRes] = await Promise.all([
    getAllProviderRows(env.DB),
    env.DB.prepare(
      `SELECT c.provider_id,
              COUNT(*) AS total_channels,
              SUM(CASE WHEN c.enabled = 1 AND s.enabled = 1 AND s.api_key_encrypted != '' THEN 1 ELSE 0 END) AS ready_channels
       FROM provider_channels c
       JOIN suppliers s ON s.id = c.supplier_id
       GROUP BY c.provider_id`
    ).all<{ provider_id: ImageProviderId; total_channels: number; ready_channels: number | null }>(),
  ])

  const countMap = new Map<ImageProviderId, { total: number; ready: number }>()
  for (const r of countsRes.results || []) {
    countMap.set(r.provider_id, { total: r.total_channels || 0, ready: r.ready_channels || 0 })
  }

  return rows.map((row) => {
    const stats = countMap.get(row.provider_id) || { total: 0, ready: 0 }
    const hasEnvFallback = stats.total === 0 && Boolean(getEnvFallbackApiKey(env, row.provider_id))
    return {
      providerId: row.provider_id,
      enabled: row.enabled === 1,
      configured: stats.ready > 0 || hasEnvFallback,
      creditCost: row.credit_cost,
      sortOrder: row.sort_order,
      artist: getStudioArtist(row.provider_id),
    }
  })
}

export async function createUserWithBonus(
  db: D1Database,
  params: {
    id: string
    username: string
    email: string | null
    displayName: string
    adminNote?: string
    passwordHash: string
    role: UserRole
    initialCredits: number
    bonusNote?: string
    operatorId?: string | null
  }
): Promise<PublicUser> {
  const now = Date.now()
  const credits = Math.max(0, Math.floor(params.initialCredits))
  const adminNote = (params.adminNote || '').trim().slice(0, 120)
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO users (
          id, username, username_lower, email, email_lower, display_name,
          admin_note, password_hash, role, credit_balance, status, created_at, updated_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .bind(
        params.id,
        params.username,
        params.username.toLowerCase(),
        params.email,
        params.email ? params.email.toLowerCase() : null,
        params.displayName,
        adminNote,
        params.passwordHash,
        params.role,
        credits,
        now,
        now,
        now
      ),
  ]

  if (credits > 0) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO credit_ledger (
            id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
          ) VALUES (?, ?, ?, ?, 'register_bonus', NULL, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          params.id,
          credits,
          credits,
          params.bonusNote || '新用户注册赠送积分',
          params.operatorId ?? null,
          now
        )
    )
  }

  await db.batch(stmts)

  return {
    id: params.id,
    username: params.username,
    email: params.email,
    displayName: params.displayName,
    avatarUrl: null,
    hasPassword: Boolean(params.passwordHash),
    wechatBound: false,
    wechatNickname: null,
    role: params.role,
    creditBalance: credits,
    status: 'active',
    createdAt: now,
    lastLoginAt: now,
  }
}

export async function createSession(
  db: D1Database,
  userId: string,
  userAgent?: string | null
): Promise<{ rawToken: string; expiresAt: number }> {
  const rawToken = randomTokenHex(32)
  const tokenHash = await sha256Hex(rawToken)
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS
  await db.batch([
    db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, now, now, (userAgent || '').slice(0, 200)),
    db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(now, userId),
  ])
  return { rawToken, expiresAt }
}

export async function resolveSessionUser(
  db: D1Database,
  rawToken: string | undefined
): Promise<{ user: PublicUser; sessionId: string } | null> {
  if (!rawToken || rawToken.length < 16) return null
  const tokenHash = await sha256Hex(rawToken)
  const now = Date.now()
  const row = await db
    .prepare(
      `SELECT u.*,
              oa.openid AS wechat_openid,
              oa.nickname AS wechat_nickname,
              oa.avatar_url AS wechat_avatar_url,
              s.id AS session_id,
              s.expires_at AS session_expires_at,
              s.last_seen_at AS session_last_seen
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN oauth_accounts oa ON oa.user_id = u.id AND oa.provider = 'wechat_open'
       WHERE s.token_hash = ?`
    )
    .bind(tokenHash)
    .first<UserRow & { session_id: string; session_expires_at: number; session_last_seen: number }>()

  if (!row) return null
  if (row.session_expires_at <= now || row.status !== 'active') {
    await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(row.session_id).run()
    return null
  }
  if (now - row.session_last_seen > 15 * 60 * 1000) {
    await db
      .prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
      .bind(now, now + SESSION_TTL_MS, row.session_id)
      .run()
  }
  return { user: mapUserRow(row), sessionId: row.session_id }
}

export async function deleteSession(db: D1Database, rawToken: string | undefined): Promise<void> {
  if (!rawToken) return
  const tokenHash = await sha256Hex(rawToken)
  await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run()
}

function capTraceJson(traceJson: string | null | undefined): string | null {
  if (!traceJson) return null
  if (traceJson.length <= 300_000) return traceJson
  try {
    const parsed = JSON.parse(traceJson) as GenerationAuditTrace
    if (Array.isArray(parsed.attempts)) {
      for (const att of parsed.attempts) {
        if (att.response && att.response.body !== undefined) {
          const serialized = JSON.stringify(att.response.body)
          if (serialized.length > 4000) {
            att.response.body = `${serialized.slice(0, 4000)}... [已截断，原长 ${serialized.length} 字符]`
          }
        }
      }
    }
    const slim = JSON.stringify(parsed)
    return slim.length <= 450_000 ? slim : slim.slice(0, 450_000)
  } catch {
    return traceJson.slice(0, 300_000)
  }
}

export async function deductCreditsAndCreateJob(
  db: D1Database,
  params: {
    jobId: string
    userId: string
    idempotencyKey: string
    provider: ImageProviderId
    model: string
    channelId?: string | null
    channelName?: string | null
    supplierId?: string | null
    supplierName?: string | null
    creditsCost: number
    prompt: string
    recipeSummary: string
    aspectRatio: StudioAspectRatio
    stylePreset: string
    snapshotJson: string
    traceJson?: string | null
  }
): Promise<{ existing?: JobRow; creditBalance: number }> {
  const existing = await db
    .prepare(`SELECT * FROM generation_jobs WHERE user_id = ? AND idempotency_key = ?`)
    .bind(params.userId, params.idempotencyKey)
    .first<JobRow>()
  if (existing) {
    const userRow = await db
      .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(params.userId)
      .first<{ credit_balance: number }>()
    return { existing, creditBalance: userRow?.credit_balance ?? 0 }
  }

  const now = Date.now()
  const cost = Math.max(0, Math.floor(params.creditsCost))

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO generation_jobs (
          id, user_id, idempotency_key, provider, model,
          channel_id, channel_name, supplier_id, supplier_name,
          status, credits_cost, credits_refunded, prompt, recipe_summary, aspect_ratio, style_preset,
          snapshot_json, trace_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, 0, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.jobId,
        params.userId,
        params.idempotencyKey,
        params.provider,
        params.model,
        params.channelId ?? null,
        params.channelName ?? null,
        params.supplierId ?? null,
        params.supplierName ?? null,
        cost,
        params.prompt,
        params.recipeSummary,
        params.aspectRatio,
        params.stylePreset,
        params.snapshotJson,
        capTraceJson(params.traceJson),
        now
      ),
    db
      .prepare(
        `UPDATE users
         SET credit_balance = credit_balance - ?, updated_at = ?
         WHERE id = ? AND status = 'active'`
      )
      .bind(cost, now, params.userId),
    db
      .prepare(
        `INSERT INTO credit_ledger (
          id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
        ) VALUES (
          ?, ?, ?,
          (SELECT credit_balance FROM users WHERE id = ? AND status = 'active'),
          'generate_deduct', ?, ?, NULL, ?
        )`
      )
      .bind(
        crypto.randomUUID(),
        params.userId,
        -cost,
        params.userId,
        params.jobId,
        `生成消耗 · ${getStudioArtist(params.provider).name}`,
        now
      ),
  ]

  await db.batch(stmts)
  const updated = await db
    .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
    .bind(params.userId)
    .first<{ credit_balance: number }>()
  return { creditBalance: updated?.credit_balance ?? 0 }
}

export async function updateJobTrace(
  db: D1Database,
  jobId: string,
  traceJson: string
): Promise<void> {
  const capped = capTraceJson(traceJson)
  if (!capped) return
  try {
    await db
      .prepare(`UPDATE generation_jobs SET trace_json = ? WHERE id = ? AND status = 'processing'`)
      .bind(capped, jobId)
      .run()
  } catch {
    // non-fatal incremental trace write
  }
}

export async function markJobSucceeded(
  db: D1Database,
  params: {
    jobId: string
    resultR2Key: string
    resultMime: string
    resultBytes: number
    model?: string
    channelId?: string
    channelName?: string
    supplierId?: string
    supplierName?: string
    traceJson?: string | null
  }
): Promise<JobRow | null> {
  const now = Date.now()
  await db
    .prepare(
      `UPDATE generation_jobs
       SET status = 'succeeded',
           result_r2_key = ?,
           result_mime = ?,
           result_bytes = ?,
           model = COALESCE(?, model),
           channel_id = COALESCE(?, channel_id),
           channel_name = COALESCE(?, channel_name),
           supplier_id = COALESCE(?, supplier_id),
           supplier_name = COALESCE(?, supplier_name),
           trace_json = COALESCE(?, trace_json),
           error_message = NULL,
           finished_at = ?
       WHERE id = ? AND status = 'processing'`
    )
    .bind(
      params.resultR2Key,
      params.resultMime,
      params.resultBytes,
      params.model ?? null,
      params.channelId ?? null,
      params.channelName ?? null,
      params.supplierId ?? null,
      params.supplierName ?? null,
      capTraceJson(params.traceJson),
      now,
      params.jobId
    )
    .run()
  return db.prepare(`SELECT * FROM generation_jobs WHERE id = ?`).bind(params.jobId).first<JobRow>()
}

function finalizeTraceForFailure(
  existingTraceJson: string | null | undefined,
  explicitTraceJson: string | null | undefined,
  errorMessage: string,
  refundCredits: number,
  now: number
): string | null {
  const raw = explicitTraceJson ?? existingTraceJson
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as GenerationAuditTrace
    parsed.finishedAt = parsed.finishedAt ?? now
    parsed.totalDurationMs = parsed.totalDurationMs ?? Math.max(0, (parsed.finishedAt || now) - parsed.startedAt)
    parsed.creditsRefunded = refundCredits
    parsed.finalError = parsed.finalError || errorMessage
    return capTraceJson(JSON.stringify(parsed))
  } catch {
    return capTraceJson(raw)
  }
}

export async function refundFailedJob(
  db: D1Database,
  jobId: string,
  errorMessage: string,
  options?: {
    traceJson?: string | null
    model?: string
    channelId?: string
    channelName?: string
    supplierId?: string
    supplierName?: string
  }
): Promise<{ creditBalance?: number; refunded: boolean }> {
  const job = await db
    .prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .bind(jobId)
    .first<JobRow>()
  if (!job || job.status === 'succeeded') {
    return { refunded: false }
  }
  const now = Date.now()
  const nextTrace = finalizeTraceForFailure(
    job.trace_json,
    options?.traceJson,
    errorMessage,
    job.credits_cost,
    now
  )

  if (job.credits_cost <= 0) {
    await db
      .prepare(
        `UPDATE generation_jobs
         SET status = 'failed',
             error_message = ?,
             model = COALESCE(?, model),
             channel_id = COALESCE(?, channel_id),
             channel_name = COALESCE(?, channel_name),
             supplier_id = COALESCE(?, supplier_id),
             supplier_name = COALESCE(?, supplier_name),
             trace_json = COALESCE(?, trace_json),
             finished_at = ?
         WHERE id = ? AND status = 'processing'`
      )
      .bind(
        errorMessage.slice(0, 1000),
        options?.model ?? null,
        options?.channelId ?? null,
        options?.channelName ?? null,
        options?.supplierId ?? null,
        options?.supplierName ?? null,
        nextTrace,
        now,
        jobId
      )
      .run()
    return { refunded: false }
  }

  try {
    await db.batch([
      db
        .prepare(`UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?`)
        .bind(job.credits_cost, now, job.user_id),
      db
        .prepare(
          `INSERT INTO credit_ledger (
            id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
          ) VALUES (
            ?, ?, ?,
            (SELECT credit_balance FROM users WHERE id = ?),
            'generate_refund', ?, ?, NULL, ?
          )`
        )
        .bind(
          crypto.randomUUID(),
          job.user_id,
          job.credits_cost,
          job.user_id,
          job.id,
          `生成失败退还 · ${getStudioArtist(job.provider).name}`,
          now
        ),
      db
        .prepare(
          `UPDATE generation_jobs
           SET status = 'failed',
               credits_refunded = credits_cost,
               error_message = ?,
               model = COALESCE(?, model),
               channel_id = COALESCE(?, channel_id),
               channel_name = COALESCE(?, channel_name),
               supplier_id = COALESCE(?, supplier_id),
               supplier_name = COALESCE(?, supplier_name),
               trace_json = COALESCE(?, trace_json),
               finished_at = ?
           WHERE id = ? AND status != 'succeeded'`
        )
        .bind(
          errorMessage.slice(0, 1000),
          options?.model ?? null,
          options?.channelId ?? null,
          options?.channelName ?? null,
          options?.supplierId ?? null,
          options?.supplierName ?? null,
          nextTrace,
          now,
          job.id
        ),
    ])
    const userRow = await db
      .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(job.user_id)
      .first<{ credit_balance: number }>()
    return { creditBalance: userRow?.credit_balance, refunded: true }
  } catch {
    // 幂等索引 idx_credit_ledger_unique_refund 命中说明已经退还过
    await db
      .prepare(
        `UPDATE generation_jobs
         SET status = 'failed',
             error_message = COALESCE(error_message, ?),
             trace_json = COALESCE(?, trace_json),
             finished_at = COALESCE(finished_at, ?)
         WHERE id = ? AND status = 'processing'`
      )
      .bind(errorMessage.slice(0, 1000), nextTrace, now, job.id)
      .run()
    const userRow = await db
      .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(job.user_id)
      .first<{ credit_balance: number }>()
    return { creditBalance: userRow?.credit_balance, refunded: false }
  }
}

export async function reapStaleProcessingJobs(db: D1Database, userId?: string): Promise<void> {
  const cutoff = Date.now() - 4 * 60 * 1000
  const query = userId
    ? db
        .prepare(`SELECT id FROM generation_jobs WHERE user_id = ? AND status = 'processing' AND created_at < ? LIMIT 20`)
        .bind(userId, cutoff)
    : db
        .prepare(`SELECT id FROM generation_jobs WHERE status = 'processing' AND created_at < ? LIMIT 20`)
        .bind(cutoff)

  const stale = await query.all<{ id: string }>()
  for (const row of stale.results || []) {
    await refundFailedJob(db, row.id, '生成任务超时未返回结果，系统已自动退还积分')
  }
}

export async function claimRedeemCode(
  db: D1Database,
  params: { code: string; userId: string }
): Promise<{ credits: number; creditBalance: number }> {
  const cleanCode = params.code.trim().toUpperCase()
  if (!cleanCode) throw new Error('请输入兑换码')

  const row = await db
    .prepare(`SELECT * FROM redeem_codes WHERE code = ?`)
    .bind(cleanCode)
    .first<{
      id: string
      code: string
      credits: number
      max_uses: number
      used_count: number
      expires_at: number | null
      status: string
    }>()

  if (!row) throw new Error('兑换码不存在，请检查拼写')
  if (row.status !== 'active') throw new Error('该兑换码已被停用')
  const now = Date.now()
  if (row.expires_at && row.expires_at <= now) throw new Error('该兑换码已过期')
  if (row.used_count >= row.max_uses) throw new Error('该兑换码已被领完')

  const already = await db
    .prepare(`SELECT id FROM redeem_claims WHERE code_id = ? AND user_id = ?`)
    .bind(row.id, params.userId)
    .first<{ id: string }>()
  if (already) throw new Error('您已领取过该兑换码')

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO redeem_claims (id, code_id, user_id, credits, created_at) VALUES (?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), row.id, params.userId, row.credits, now),
      db
        .prepare(
          `UPDATE redeem_codes SET used_count = used_count + 1 WHERE id = ? AND status = 'active'`
        )
        .bind(row.id),
      db
        .prepare(
          `UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ? AND status = 'active'`
        )
        .bind(row.credits, now, params.userId),
      db
        .prepare(
          `INSERT INTO credit_ledger (
            id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
          ) VALUES (
            ?, ?, ?,
            (SELECT credit_balance FROM users WHERE id = ? AND status = 'active'),
            'redeem_code', ?, ?, NULL, ?
          )`
        )
        .bind(
          crypto.randomUUID(),
          params.userId,
          row.credits,
          params.userId,
          row.id,
          `兑换码充值 · ${row.code}`,
          now
        ),
    ])
  } catch {
    throw new Error('兑换失败：兑换码已被抢光或您已兑换过')
  }

  const updated = await db
    .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
    .bind(params.userId)
    .first<{ credit_balance: number }>()
  return { credits: row.credits, creditBalance: updated?.credit_balance ?? 0 }
}

export async function createRedeemCodesBatch(
  db: D1Database,
  params: {
    count: number
    credits: number
    maxUses: number
    expiresAt: number | null
    note: string
    prefix: string
    createdBy: string
  }
): Promise<RedeemCodeItem[]> {
  const now = Date.now()
  const items: RedeemCodeItem[] = []
  const stmts: D1PreparedStatement[] = []
  const seen = new Set<string>()

  while (items.length < params.count) {
    const code = generateRedeemCode(params.prefix)
    if (seen.has(code)) continue
    seen.add(code)
    const id = crypto.randomUUID()
    items.push({
      id,
      code,
      credits: params.credits,
      maxUses: params.maxUses,
      usedCount: 0,
      expiresAt: params.expiresAt,
      status: 'active',
      note: params.note,
      createdBy: params.createdBy,
      createdAt: now,
    })
    stmts.push(
      db
        .prepare(
          `INSERT INTO redeem_codes (
            id, code, credits, max_uses, used_count, expires_at, status, note, created_by, created_at
          ) VALUES (?, ?, ?, ?, 0, ?, 'active', ?, ?, ?)`
        )
        .bind(id, code, params.credits, params.maxUses, params.expiresAt, params.note, params.createdBy, now)
    )
  }

  await db.batch(stmts)
  return items
}

export async function adjustUserCredits(
  db: D1Database,
  params: {
    userId: string
    delta: number
    note: string
    operatorId: string
  }
): Promise<number> {
  const delta = Math.trunc(params.delta)
  if (!delta) throw new Error('调整积分数不能为 0')
  const now = Date.now()

  const user = await db.prepare(`SELECT id, credit_balance FROM users WHERE id = ?`).bind(params.userId).first<{ id: string; credit_balance: number }>()
  if (!user) throw new Error('目标用户不存在')
  if (user.credit_balance + delta < 0) {
    throw new Error(`扣减失败：当前余额 ${user.credit_balance} 不足 ${Math.abs(delta)}`)
  }

  await db.batch([
    db
      .prepare(`UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?`)
      .bind(delta, now, params.userId),
    db
      .prepare(
        `INSERT INTO credit_ledger (
          id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
        ) VALUES (
          ?, ?, ?,
          (SELECT credit_balance FROM users WHERE id = ?),
          'admin_adjust', NULL, ?, ?, ?
        )`
      )
      .bind(
        crypto.randomUUID(),
        params.userId,
        delta,
        params.userId,
        params.note.trim() || (delta > 0 ? '管理员后台充值' : '管理员后台扣减'),
        params.operatorId,
        now
      ),
  ])

  const updated = await db
    .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
    .bind(params.userId)
    .first<{ credit_balance: number }>()
  return updated?.credit_balance ?? 0
}

export function mapLedgerRow(row: {
  id: string
  user_id: string
  username?: string
  user_admin_note?: string
  delta: number
  balance_after: number
  type: CreditLedgerItem['type']
  ref_id: string | null
  note: string
  operator_id: string | null
  created_at: number
}): CreditLedgerItem {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    ...(row.user_admin_note ? { userAdminNote: row.user_admin_note } : {}),
    delta: row.delta,
    balanceAfter: row.balance_after,
    type: row.type,
    refId: row.ref_id,
    note: row.note,
    operatorId: row.operator_id,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// 微信开放平台 OAuth 配置与账号关联
// ---------------------------------------------------------------------------

interface StoredWechatOAuthRow {
  enabled: boolean
  appId: string
  appSecretEncrypted: string
  appSecretHint: string
  callbackBaseUrl: string
  updatedAt: number
}

const WECHAT_SETTINGS_KEY = 'wechat_oauth_config'

function getEnvWechatFallback(env: Env): { appId: string; appSecret: string } {
  return {
    appId: (env.WECHAT_APP_ID || '').trim(),
    appSecret: (env.WECHAT_APP_SECRET || '').trim(),
  }
}

async function readStoredWechatConfig(
  db: D1Database
): Promise<{ exists: boolean; data: StoredWechatOAuthRow }> {
  const row = await db
    .prepare(`SELECT value_json, updated_at FROM system_settings WHERE key = ?`)
    .bind(WECHAT_SETTINGS_KEY)
    .first<{ value_json: string; updated_at: number }>()
  if (!row) {
    return {
      exists: false,
      data: {
        enabled: false,
        appId: '',
        appSecretEncrypted: '',
        appSecretHint: '',
        callbackBaseUrl: '',
        updatedAt: 0,
      },
    }
  }
  try {
    const parsed = JSON.parse(row.value_json) as Partial<StoredWechatOAuthRow>
    return {
      exists: true,
      data: {
        enabled: Boolean(parsed.enabled),
        appId: typeof parsed.appId === 'string' ? parsed.appId.trim() : '',
        appSecretEncrypted:
          typeof parsed.appSecretEncrypted === 'string' ? parsed.appSecretEncrypted : '',
        appSecretHint: typeof parsed.appSecretHint === 'string' ? parsed.appSecretHint : '',
        callbackBaseUrl:
          typeof parsed.callbackBaseUrl === 'string' ? parsed.callbackBaseUrl.trim() : '',
        updatedAt:
          typeof parsed.updatedAt === 'number' ? parsed.updatedAt : row.updated_at || 0,
      },
    }
  } catch {
    return {
      exists: true,
      data: {
        enabled: false,
        appId: '',
        appSecretEncrypted: '',
        appSecretHint: '',
        callbackBaseUrl: '',
        updatedAt: row.updated_at || 0,
      },
    }
  }
}

export async function getAdminWechatConfig(env: Env): Promise<AdminWechatConfigDTO> {
  const { exists, data } = await readStoredWechatConfig(env.DB)
  const envFallback = getEnvWechatFallback(env)
  const hasEnvFallback = Boolean(envFallback.appId && envFallback.appSecret)
  return {
    enabled: exists ? data.enabled : hasEnvFallback,
    appId: data.appId,
    hasAppSecret: Boolean(data.appSecretEncrypted),
    appSecretHint: data.appSecretHint,
    callbackBaseUrl: data.callbackBaseUrl,
    hasEnvFallback,
    envAppIdHint: envFallback.appId ? maskApiKey(envFallback.appId) : '',
    updatedAt: data.updatedAt,
  }
}

export async function resolveRuntimeWechatConfig(env: Env): Promise<{
  enabled: boolean
  appId: string
  appSecret: string
  callbackBaseUrl: string
}> {
  const { exists, data } = await readStoredWechatConfig(env.DB)
  const envFallback = getEnvWechatFallback(env)
  const hasEnvFallback = Boolean(envFallback.appId && envFallback.appSecret)
  const decryptedSecret = data.appSecretEncrypted
    ? (await decryptSecret(data.appSecretEncrypted, env.APP_ENCRYPTION_KEY)).trim()
    : ''
  return {
    enabled: exists ? data.enabled : hasEnvFallback,
    appId: data.appId || envFallback.appId,
    appSecret: decryptedSecret || envFallback.appSecret,
    callbackBaseUrl: data.callbackBaseUrl,
  }
}

export async function getPublicWechatLoginInfo(env: Env): Promise<WechatLoginPublicInfo> {
  const cfg = await resolveRuntimeWechatConfig(env)
  return {
    enabled: cfg.enabled,
    configured: Boolean(cfg.appId && cfg.appSecret),
  }
}

export async function saveWechatOAuthConfig(
  env: Env,
  patch: {
    enabled?: boolean
    appId?: string
    appSecret?: string
    clearAppSecret?: boolean
    callbackBaseUrl?: string
  }
): Promise<AdminWechatConfigDTO> {
  const { exists, data } = await readStoredWechatConfig(env.DB)
  const envFallback = getEnvWechatFallback(env)
  const hasEnvFallback = Boolean(envFallback.appId && envFallback.appSecret)
  const now = Date.now()

  let nextEncrypted = data.appSecretEncrypted
  let nextHint = data.appSecretHint
  if (patch.clearAppSecret) {
    nextEncrypted = ''
    nextHint = ''
  } else if (typeof patch.appSecret === 'string' && patch.appSecret.trim()) {
    const plain = patch.appSecret.trim()
    nextEncrypted = await encryptSecret(plain, env.APP_ENCRYPTION_KEY)
    nextHint = maskApiKey(plain)
  }

  const nextStored: StoredWechatOAuthRow = {
    enabled:
      typeof patch.enabled === 'boolean'
        ? patch.enabled
        : exists
          ? data.enabled
          : hasEnvFallback,
    appId: typeof patch.appId === 'string' ? patch.appId.trim() : data.appId,
    appSecretEncrypted: nextEncrypted,
    appSecretHint: nextHint,
    callbackBaseUrl:
      typeof patch.callbackBaseUrl === 'string'
        ? patch.callbackBaseUrl.trim().replace(/\/+$/, '')
        : data.callbackBaseUrl,
    updatedAt: now,
  }

  await env.DB.prepare(
    `INSERT INTO system_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  )
    .bind(WECHAT_SETTINGS_KEY, JSON.stringify(nextStored), now)
    .run()

  return getAdminWechatConfig(env)
}

export interface OAuthAccountRow {
  id: string
  user_id: string
  provider: 'wechat_open'
  openid: string
  unionid: string | null
  nickname: string
  avatar_url: string
  created_at: number
  updated_at: number
}

export async function findWechatOAuthBinding(
  db: D1Database,
  openid: string,
  unionid: string | null
): Promise<OAuthAccountRow | null> {
  const byOpenId = await db
    .prepare(`SELECT * FROM oauth_accounts WHERE provider = 'wechat_open' AND openid = ? LIMIT 1`)
    .bind(openid)
    .first<OAuthAccountRow>()
  if (byOpenId) return byOpenId

  if (unionid) {
    return db
      .prepare(
        `SELECT * FROM oauth_accounts WHERE provider = 'wechat_open' AND unionid = ? LIMIT 1`
      )
      .bind(unionid)
      .first<OAuthAccountRow>()
  }
  return null
}

export async function createWechatUserWithBonus(
  db: D1Database,
  params: {
    userId: string
    username: string
    displayName: string
    initialCredits: number
    bonusNote?: string
    openid: string
    unionid: string | null
    nickname: string
    avatarUrl: string
  }
): Promise<PublicUser> {
  const now = Date.now()
  const credits = Math.max(0, Math.floor(params.initialCredits))
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO users (
          id, username, username_lower, email, email_lower, display_name,
          password_hash, role, credit_balance, status, created_at, updated_at, last_login_at
        ) VALUES (?, ?, ?, NULL, NULL, ?, '', 'user', ?, 'active', ?, ?, ?)`
      )
      .bind(
        params.userId,
        params.username,
        params.username.toLowerCase(),
        params.displayName,
        credits,
        now,
        now,
        now
      ),
    db
      .prepare(
        `INSERT INTO oauth_accounts (
          id, user_id, provider, openid, unionid, nickname, avatar_url, created_at, updated_at
        ) VALUES (?, ?, 'wechat_open', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        params.userId,
        params.openid,
        params.unionid,
        params.nickname,
        params.avatarUrl,
        now,
        now
      ),
  ]

  if (credits > 0) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO credit_ledger (
            id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
          ) VALUES (?, ?, ?, ?, 'register_bonus', NULL, ?, NULL, ?)`
        )
        .bind(
          crypto.randomUUID(),
          params.userId,
          credits,
          credits,
          params.bonusNote || '微信新用户注册赠送积分',
          now
        )
    )
  }

  await db.batch(stmts)

  return {
    id: params.userId,
    username: params.username,
    email: null,
    displayName: params.displayName,
    avatarUrl: params.avatarUrl || null,
    hasPassword: false,
    wechatBound: true,
    wechatNickname: params.nickname || null,
    role: 'user',
    creditBalance: credits,
    status: 'active',
    createdAt: now,
    lastLoginAt: now,
  }
}
