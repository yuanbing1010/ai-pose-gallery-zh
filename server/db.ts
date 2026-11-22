import {
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  PROVIDER_ORDER,
  createDefaultGenerationQueueConfig,
  createDefaultPoseSanitizeConfig,
  createDefaultPromptTemplate,
  createDefaultVisionFallbackConfig,
  formatUserFacingGenerationError,
  getEffectiveProfileCreditCost,
  getStudioArtist,
  isChannelStitchedSingleMode,
  isNativeArtistChannel,
  mergeGenerationQueueConfig,
  mergePoseSanitizeConfig,
  mergePromptTemplate,
  mergeVisionFallbackConfig,
  normalizeProfileResolutions,
  normalizeStudioResolution,
  normalizeStylePresetTaxonomy,
  normalizeSupplierModelIds,
  resolveProfileConcurrencyLimit,
  resolveProfileDefaultResolution,
  type AdminProviderSlotDTO,
  type AdminUserItem,
  type AdminWechatConfigDTO,
  type CreditLedgerItem,
  type GenerationAuditTrace,
  type GenerationHistoryItem,
  type GenerationQueueConfig,
  type GenerationQueueInfo,
  type GenerationQueueWaitReason,
  type GenerationSnapshot,
  type GenerationStatus,
  type ImageProviderId,
  type ModelProfileDTO,
  type PlatformConfig,
  type ProfileResolutionOption,
  type ProviderChannelDTO,
  type ProviderModelPublicInfo,
  type ProviderPublicInfo,
  type PublicUser,
  type RedeemCodeItem,
  type ReferenceDescriptionDTO,
  type ReferenceDescriptionKind,
  type StudioAspectRatio,
  type StudioResolution,
  type StyleCategoryItem,
  type StylePresetItem,
  type StyleSubcategoryItem,
  type SupplierChannelRef,
  type SupplierDTO,
  type SupplierKeyDTO,
  type UserRole,
  type UserStatus,
  type VisionFallbackConfig,
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
export const ADMIN_SESSION_COOKIE_NAME = 'pose_atlas_admin_sid'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const DEFAULT_CREDIT_COSTS: Record<ImageProviderId, number> = {
  gemini: 10,
  gpt: 15,
  grok: 10,
  muse: 10,
  seedream: 10,
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
  profile_id?: string | null
  profile_name?: string | null
  resolution?: string | null
  model: string
  channel_id?: string | null
  channel_name?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  status: GenerationStatus
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
  started_at?: number | null
  finished_at: number | null
  queue_payload_json?: string | null
}

export interface SupplierKeyRow {
  id: string
  supplier_id: string
  label: string
  api_key_encrypted: string
  api_key_hint: string
  enabled: number
  cooldown_until: number
  last_error: string
  last_used_at: number
  created_at: number
  updated_at: number
}

export interface SupplierRow {
  id: string
  name: string
  base_url: string
  api_key_encrypted: string
  api_key_hint: string
  models_json?: string
  enabled: number
  note: string
  created_at: number
  updated_at: number
  channel_count?: number
}

export interface ModelProfileRow {
  id: string
  provider_id: ImageProviderId
  display_name: string
  badge: string
  tagline: string
  default_model?: string
  default_custom_model?: string
  enabled: number
  is_default: number
  credit_cost: number
  default_resolution: string
  resolutions_json: string
  sort_order: number
  created_at: number
  updated_at: number
}

export interface ChannelRow {
  id: string
  provider_id: ImageProviderId
  profile_id?: string | null
  supplier_id: string
  name: string
  enabled: number
  model: string
  custom_model: string
  priority: number
  weight?: number
  key_ids_json?: string
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
  supplierKeyId?: string
  supplierKeyLabel?: string
  supplierKeyHint?: string
  cooldownUntil?: number
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
  options: { isAdmin?: boolean; queueInfo?: GenerationQueueInfo | null } = {}
): GenerationHistoryItem {
  const isAdmin = Boolean(options.isAdmin)
  const artistName = getStudioArtist(row.provider).name
  const profileName = row.profile_name || null
  const resolution = normalizeStudioResolution(row.resolution)
  const maskedModelLabel = profileName ? `${artistName} · ${profileName}` : artistName
  let snapshot: GenerationSnapshot | undefined
  try {
    const parsed = JSON.parse(row.snapshot_json) as GenerationSnapshot
    snapshot = isAdmin
      ? parsed
      : {
          ...parsed,
          model: parsed.profileName ? `${artistName} · ${parsed.profileName}` : maskedModelLabel,
        }
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
          startedAt:
            parsedTrace.liveState.startedAt ??
            parsedTrace.startedAt ??
            row.started_at ??
            row.created_at,
          stageStartedAt: parsedTrace.liveState.stageStartedAt,
          percent: parsedTrace.liveState.percent,
        }
      : row.status === 'processing'
        ? {
            stage: 'generating' as const,
            message: `${profileName ? `${artistName}（${profileName}）` : artistName}正在云端绘制作品…`,
            startedAt: parsedTrace?.startedAt ?? row.started_at ?? row.created_at,
          }
        : row.status === 'queued'
          ? {
              stage: 'queued' as const,
              message: options.queueInfo
                ? `排队第 ${options.queueInfo.position} 位（前面还有 ${options.queueInfo.aheadCount} 个）`
                : '排队等待中…',
              attempt: 0,
              totalAttempts: 1,
              startedAt: row.created_at,
              stageStartedAt: row.created_at,
              percent: 8,
            }
          : undefined
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at,
    status: row.status,
    creditsCost: row.credits_cost,
    creditsRefunded: row.credits_refunded,
    provider: row.provider,
    profileId: row.profile_id ?? null,
    profileName,
    resolution,
    model: isAdmin ? row.model : maskedModelLabel,
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
      ? isAdmin || row.status === 'cancelled'
        ? row.error_message
        : formatUserFacingGenerationError(row.error_message, row.provider, profileName)
      : row.error_message,
    ...(options.queueInfo ? { queueInfo: options.queueInfo } : {}),
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
    case 'muse':
      return (env.MUSE_API_KEY || '').trim()
    case 'seedream':
      return ''
  }
}

export async function resolveSupplierSecret(stored: string, env: Env): Promise<string> {
  const trimmed = stored.trim()
  if (trimmed === 'env:MUSE_API_KEY') {
    return (env.MUSE_API_KEY || '').trim()
  }
  return (await decryptSecret(trimmed, env.APP_ENCRYPTION_KEY)).trim()
}

export async function resolveProviderApiKey(env: Env, row: ProviderRow): Promise<string> {
  const fromDb = await decryptSecret(row.api_key_encrypted, env.APP_ENCRYPTION_KEY)
  if (fromDb.trim()) return fromDb.trim()
  return getEnvFallbackApiKey(env, row.provider_id)
}

let platformSeeded = false
let seedingPromise: Promise<void> | null = null

function getDefaultProfilePreset(providerId: ImageProviderId): {
  displayName: string
  badge: string
  tagline: string
} {
  switch (providerId) {
    case 'gemini':
      return {
        displayName: '灵绘主笔',
        badge: '理解准',
        tagline: '中文语义与画风迁移细腻自然',
      }
    case 'gpt':
      return {
        displayName: '精绘稳笔',
        badge: '画得稳',
        tagline: '人体结构与光影还原稳定，适合精细成图',
      }
    case 'grok':
      return {
        displayName: '星舰主笔',
        badge: '张力强',
        tagline: '画面张力与光影质感突出',
      }
    case 'muse':
      return {
        displayName: '灵韵织画',
        badge: '创意强',
        tagline: '中文理解细腻 · 光影氛围与创意绘染表现突出',
      }
    case 'seedream':
      return {
        displayName: '即梦绘境',
        badge: '多图稳',
        tagline: '中文语义理解精准 · 服饰结构与国风质感表现突出',
      }
  }
}

export async function ensurePlatformSeeded(env: Env): Promise<void> {
  if (platformSeeded) return
  if (!seedingPromise) {
    seedingPromise = (async () => {
      const [existingProviders, existingProfiles] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS cnt FROM provider_configs`).first<{ cnt: number }>(),
        env.DB.prepare(`SELECT COUNT(*) AS cnt FROM model_profiles`).first<{ cnt: number }>(),
      ])
      const now = Date.now()
      const statements: D1PreparedStatement[] = []

      if ((existingProviders?.cnt ?? 0) < PROVIDER_ORDER.length) {
        statements.push(
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
          })
        )
      }

      if ((existingProfiles?.cnt ?? 0) === 0 || (existingProviders?.cnt ?? 0) < PROVIDER_ORDER.length) {
        for (const id of PROVIDER_ORDER) {
          const baseCost = DEFAULT_CREDIT_COSTS[id]
          const resolutions = normalizeProfileResolutions(id, null, baseCost)
          const defaultRes = resolveProfileDefaultResolution(id, '2K', resolutions) ?? '2K'
          const preset = getDefaultProfilePreset(id)
          statements.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO model_profiles (
                id, provider_id, display_name, badge, tagline, enabled, is_default,
                credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, 0, ?, ?)`
            ).bind(
              `prof_${id}_default`,
              id,
              preset.displayName,
              preset.badge,
              preset.tagline,
              baseCost,
              defaultRes,
              JSON.stringify(resolutions),
              now,
              now
            )
          )
        }
      }

      if (statements.length > 0) {
        await env.DB.batch(statements)
      }

      // 兜底回填历史上无 profile_id 的渠道记录
      await env.DB.prepare(
        `UPDATE provider_channels
         SET profile_id = COALESCE(
           (SELECT id FROM model_profiles mp WHERE mp.provider_id = provider_channels.provider_id ORDER BY mp.is_default DESC, mp.sort_order ASC LIMIT 1),
           'prof_' || provider_id || '_default'
         )
         WHERE profile_id IS NULL OR profile_id = ''`
      ).run()

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
      ...(rec.poseMode === 'adaptive' ? { poseMode: 'adaptive' as const } : {}),
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
  if (!row) {
    return {
      ...DEFAULT_PLATFORM_CONFIG,
      promptTemplate: createDefaultPromptTemplate(),
      poseSanitize: createDefaultPoseSanitizeConfig(),
      visionFallback: createDefaultVisionFallbackConfig(),
      queueConfig: createDefaultGenerationQueueConfig(),
    }
  }
  try {
    const parsed = JSON.parse(row.value_json) as Partial<PlatformConfig>
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
      poseSanitize: mergePoseSanitizeConfig(parsed.poseSanitize),
      visionFallback: mergeVisionFallbackConfig(parsed.visionFallback),
      queueConfig: mergeGenerationQueueConfig(parsed.queueConfig),
      styleCategories,
      styleSubcategories,
      stylePresets,
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
    return {
      ...DEFAULT_PLATFORM_CONFIG,
      promptTemplate: createDefaultPromptTemplate(),
      poseSanitize: createDefaultPoseSanitizeConfig(),
      visionFallback: createDefaultVisionFallbackConfig(),
      queueConfig: createDefaultGenerationQueueConfig(),
    }
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

export function parseKeyIdsJson(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return Array.from(
      new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((s) => s.trim()))
    )
  } catch {
    return []
  }
}

export function parseSupplierModelsJson(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    return normalizeSupplierModelIds(JSON.parse(raw))
  } catch {
    return []
  }
}

export async function syncSupplierLegacyKeyMirror(
  db: D1Database,
  supplierId: string
): Promise<void> {
  const keysRes = await db
    .prepare(
      `SELECT api_key_encrypted, api_key_hint, enabled
       FROM supplier_keys
       WHERE supplier_id = ?
       ORDER BY enabled DESC, created_at ASC`
    )
    .bind(supplierId)
    .all<{ api_key_encrypted: string; api_key_hint: string; enabled: number }>()

  const rows = keysRes.results || []
  const enabledRows = rows.filter((r) => r.enabled === 1)
  const primary = enabledRows[0] || rows[0] || null
  const hint =
    rows.length === 0
      ? ''
      : rows.length === 1
        ? primary?.api_key_hint || ''
        : `${enabledRows.length}/${rows.length} 个密钥`

  await db
    .prepare(
      `UPDATE suppliers
       SET api_key_encrypted = ?, api_key_hint = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(primary?.api_key_encrypted || '', hint, Date.now(), supplierId)
    .run()
}

export async function markSupplierKeyCooldown(
  db: D1Database,
  keyId: string,
  cooldownMs: number,
  lastError: string
): Promise<void> {
  if (!keyId) return
  const now = Date.now()
  await db
    .prepare(
      `UPDATE supplier_keys
       SET cooldown_until = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(now + Math.max(0, cooldownMs), lastError.slice(0, 200), now, keyId)
    .run()
}

export async function markSupplierKeyDispatched(db: D1Database, keyId: string): Promise<void> {
  if (!keyId) return
  const now = Date.now()
  await db
    .prepare(
      `UPDATE supplier_keys
       SET last_used_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(now, now, keyId)
    .run()
}

export async function markSupplierKeySuccess(db: D1Database, keyId: string): Promise<void> {
  if (!keyId) return
  const now = Date.now()
  await db
    .prepare(
      `UPDATE supplier_keys
       SET cooldown_until = 0, last_error = '', last_used_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(now, now, keyId)
    .run()
}

export async function getSuppliers(env: Env): Promise<SupplierDTO[]> {
  const [res, keysRes, chRes] = await Promise.all([
    env.DB.prepare(
      `SELECT s.*, COUNT(c.id) AS channel_count
       FROM suppliers s
       LEFT JOIN provider_channels c ON c.supplier_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
    ).all<SupplierRow>(),
    env.DB.prepare(
      `SELECT * FROM supplier_keys
       ORDER BY enabled DESC, created_at ASC`
    ).all<SupplierKeyRow>(),
    env.DB.prepare(
      `SELECT c.id AS channel_id,
              c.supplier_id,
              c.name AS channel_name,
              c.provider_id,
              COALESCE(c.profile_id, '') AS profile_id,
              COALESCE(mp.display_name, '默认画笔') AS profile_name,
              c.enabled,
              CASE WHEN c.model = 'custom' AND c.custom_model != '' THEN c.custom_model ELSE c.model END AS effective_model
       FROM provider_channels c
       LEFT JOIN model_profiles mp ON mp.id = c.profile_id
       ORDER BY c.provider_id ASC, c.priority DESC, c.created_at ASC`
    ).all<{
      channel_id: string
      supplier_id: string
      channel_name: string
      provider_id: ImageProviderId
      profile_id: string
      profile_name: string
      enabled: number
      effective_model: string
    }>(),
  ])

  const keysBySupplier = new Map<string, SupplierKeyDTO[]>()
  for (const k of keysRes.results || []) {
    const list = keysBySupplier.get(k.supplier_id) || []
    list.push({
      id: k.id,
      supplierId: k.supplier_id,
      label: k.label || '',
      apiKeyHint: k.api_key_hint || '',
      enabled: k.enabled === 1,
      cooldownUntil: k.cooldown_until || 0,
      lastError: k.last_error || '',
      lastUsedAt: k.last_used_at || 0,
      createdAt: k.created_at,
      updatedAt: k.updated_at,
    })
    keysBySupplier.set(k.supplier_id, list)
  }

  const channelsBySupplier = new Map<string, SupplierChannelRef[]>()
  for (const ch of chRes.results || []) {
    const list = channelsBySupplier.get(ch.supplier_id) || []
    list.push({
      channelId: ch.channel_id,
      channelName: ch.channel_name,
      providerId: ch.provider_id,
      profileId: ch.profile_id || '',
      profileName: ch.profile_name,
      enabled: ch.enabled === 1,
      model: ch.effective_model,
    })
    channelsBySupplier.set(ch.supplier_id, list)
  }

  return (res.results || []).map((row) => {
    const keys = keysBySupplier.get(row.id) || []
    const activeKeyCount = keys.filter((k) => k.enabled).length
    const hasLegacyOnlyKey = keys.length === 0 && Boolean(row.api_key_encrypted)
    const keyCount = keys.length > 0 ? keys.length : hasLegacyOnlyKey ? 1 : 0
    const effectiveActiveCount = keys.length > 0 ? activeKeyCount : hasLegacyOnlyKey ? 1 : 0
    const hint =
      keys.length === 1
        ? keys[0].apiKeyHint
        : keys.length > 1
          ? `${activeKeyCount}/${keys.length} 启用 · ${keys.find((k) => k.enabled)?.apiKeyHint || keys[0].apiKeyHint}`
          : row.api_key_hint || ''

    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      hasApiKey: effectiveActiveCount > 0,
      apiKeyHint: hint,
      keyCount,
      activeKeyCount: effectiveActiveCount,
      keys,
      models: parseSupplierModelsJson(row.models_json),
      enabled: row.enabled === 1,
      note: row.note || '',
      channelCount: row.channel_count || 0,
      channels: channelsBySupplier.get(row.id) || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
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

export function parseProfileRow(row: ModelProfileRow): {
  resolutions: ProfileResolutionOption[]
  defaultResolution: StudioResolution | null
  effectiveCreditCost: number
} {
  let rawResolutions: unknown = []
  try {
    rawResolutions = JSON.parse(row.resolutions_json)
  } catch {
    rawResolutions = []
  }
  const resolutions = normalizeProfileResolutions(row.provider_id, rawResolutions, row.credit_cost)
  const defaultResolution = resolveProfileDefaultResolution(
    row.provider_id,
    row.default_resolution,
    resolutions
  )
  const effectiveCreditCost = getEffectiveProfileCreditCost(
    { creditCost: row.credit_cost, resolutions },
    defaultResolution
  )
  return { resolutions, defaultResolution, effectiveCreditCost }
}

export async function getAllModelProfiles(db: D1Database): Promise<ModelProfileRow[]> {
  const res = await db
    .prepare(
      `SELECT * FROM model_profiles
       ORDER BY is_default DESC, sort_order ASC, created_at ASC`
    )
    .all<ModelProfileRow>()
  return res.results || []
}

export async function resolveProfileForGeneration(
  db: D1Database,
  providerId: ImageProviderId,
  requestedProfileId?: string | null
): Promise<ModelProfileRow | null> {
  const cleanId = typeof requestedProfileId === 'string' ? requestedProfileId.trim() : ''
  if (cleanId) {
    const requested = await db
      .prepare(`SELECT * FROM model_profiles WHERE id = ? AND provider_id = ? AND enabled = 1`)
      .bind(cleanId, providerId)
      .first<ModelProfileRow>()
    if (requested) return requested
  }
  return db
    .prepare(
      `SELECT * FROM model_profiles
       WHERE provider_id = ? AND enabled = 1
       ORDER BY is_default DESC, sort_order ASC, created_at ASC
       LIMIT 1`
    )
    .bind(providerId)
    .first<ModelProfileRow>()
}

export async function getAdminProviderSlots(env: Env): Promise<AdminProviderSlotDTO[]> {
  const [slotRows, profileRows, channelRes, keysRes] = await Promise.all([
    getAllProviderRows(env.DB),
    getAllModelProfiles(env.DB),
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
    env.DB.prepare(
      `SELECT id, supplier_id, enabled FROM supplier_keys`
    ).all<{ id: string; supplier_id: string; enabled: number }>(),
  ])

  const keysBySupplier = new Map<string, Array<{ id: string; enabled: boolean }>>()
  for (const k of keysRes.results || []) {
    const list = keysBySupplier.get(k.supplier_id) || []
    list.push({ id: k.id, enabled: k.enabled === 1 })
    keysBySupplier.set(k.supplier_id, list)
  }

  const defaultProfileByProvider = new Map<ImageProviderId, string>()
  for (const prof of profileRows) {
    if (!defaultProfileByProvider.has(prof.provider_id) || prof.is_default === 1) {
      defaultProfileByProvider.set(prof.provider_id, prof.id)
    }
  }

  const channelsByProfile = new Map<string, ProviderChannelDTO[]>()
  for (const ch of channelRes.results || []) {
    const resolvedProfileId =
      (ch.profile_id && ch.profile_id.trim()) ||
      defaultProfileByProvider.get(ch.provider_id) ||
      ''
    const keyIds = parseKeyIdsJson(ch.key_ids_json)
    const supKeys = keysBySupplier.get(ch.supplier_id) || []
    const availableKeyCount =
      supKeys.length > 0
        ? supKeys.filter((k) => k.enabled && (keyIds.length === 0 || keyIds.includes(k.id))).length
        : ch.supplier_api_key_encrypted
          ? 1
          : 0

    const list = channelsByProfile.get(resolvedProfileId) || []
    list.push({
      id: ch.id,
      providerId: ch.provider_id,
      profileId: resolvedProfileId,
      supplierId: ch.supplier_id,
      supplierName: ch.supplier_name || '未知供应商',
      supplierBaseUrl: ch.supplier_base_url || '',
      supplierEnabled: ch.supplier_enabled === 1,
      supplierHasKey: availableKeyCount > 0,
      keyIds,
      availableKeyCount,
      name: ch.name,
      enabled: ch.enabled === 1,
      model: ch.model,
      customModel: ch.custom_model || '',
      priority: ch.priority,
      params: parseChannelParams(ch.provider_id, ch.params_json),
      createdAt: ch.created_at,
      updatedAt: ch.updated_at,
    })
    channelsByProfile.set(resolvedProfileId, list)
  }

  const profilesByProvider = new Map<ImageProviderId, ModelProfileDTO[]>()
  for (const prof of profileRows) {
    const parsed = parseProfileRow(prof)
    const list = profilesByProvider.get(prof.provider_id) || []
    list.push({
      id: prof.id,
      providerId: prof.provider_id,
      displayName: prof.display_name,
      badge: prof.badge || '',
      tagline: prof.tagline || '',
      defaultModel: prof.default_model || '',
      defaultCustomModel: prof.default_custom_model || '',
      enabled: prof.enabled === 1,
      isDefault: prof.is_default === 1,
      creditCost: parsed.effectiveCreditCost,
      defaultResolution: parsed.defaultResolution,
      resolutions: parsed.resolutions,
      sortOrder: prof.sort_order,
      createdAt: prof.created_at,
      updatedAt: prof.updated_at,
      channels: channelsByProfile.get(prof.id) || [],
    })
    profilesByProvider.set(prof.provider_id, list)
  }

  for (const [, list] of profilesByProvider) {
    list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.createdAt - b.createdAt
    })
  }

  return slotRows.map((row) => {
    const profiles = profilesByProvider.get(row.provider_id) || []
    const defaultProf = profiles.find((p) => p.isDefault) ?? profiles[0]
    const totalChannels = profiles.reduce((sum, p) => sum + p.channels.length, 0)
    const hasEnvKey = Boolean(getEnvFallbackApiKey(env, row.provider_id))
    return {
      providerId: row.provider_id,
      enabled: row.enabled === 1,
      creditCost: defaultProf?.creditCost ?? row.credit_cost,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at,
      hasEnvKey,
      usesEnvFallback: totalChannels === 0 && hasEnvKey,
      profiles,
    }
  })
}

function shuffleTier<T>(items: T[]): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

/** 按最久未用时间升序（LRU 轮询）排序，相同时间戳内随机打散 */
function sortKeysByLru<T extends { lastUsedAt: number }>(items: T[]): T[] {
  return shuffleTier(items).sort((a, b) => a.lastUsedAt - b.lastUsedAt)
}

export async function selectOrderedRunnableChannels(
  env: Env,
  providerId: ImageProviderId,
  profileId?: string | null
): Promise<RunnableChannel[]> {
  const [res, providerChannelCount, keysRes] = await Promise.all([
    profileId
      ? env.DB.prepare(
          `SELECT c.*,
                  s.name AS supplier_name,
                  s.base_url AS supplier_base_url,
                  s.api_key_encrypted AS supplier_api_key_encrypted,
                  s.enabled AS supplier_enabled
           FROM provider_channels c
           JOIN suppliers s ON s.id = c.supplier_id
           WHERE c.provider_id = ? AND c.profile_id = ?
           ORDER BY c.priority DESC, c.created_at ASC`
        )
          .bind(providerId, profileId)
          .all<ChannelRow>()
      : env.DB.prepare(
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
          .all<ChannelRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM provider_channels WHERE provider_id = ?`)
      .bind(providerId)
      .first<{ cnt: number }>(),
    env.DB.prepare(
      `SELECT id, supplier_id, label, api_key_encrypted, api_key_hint, enabled, cooldown_until, last_used_at
       FROM supplier_keys
       ORDER BY created_at ASC`
    ).all<{
      id: string
      supplier_id: string
      label: string
      api_key_encrypted: string
      api_key_hint: string
      enabled: number
      cooldown_until: number
      last_used_at: number
    }>(),
  ])

  const keysBySupplier = new Map<
    string,
    Array<{
      id: string
      label: string
      apiKeyEncrypted: string
      apiKeyHint: string
      enabled: boolean
      cooldownUntil: number
      lastUsedAt: number
    }>
  >()
  for (const k of keysRes.results || []) {
    const list = keysBySupplier.get(k.supplier_id) || []
    list.push({
      id: k.id,
      label: k.label || '',
      apiKeyEncrypted: k.api_key_encrypted,
      apiKeyHint: k.api_key_hint || '',
      enabled: k.enabled === 1,
      cooldownUntil: k.cooldown_until || 0,
      lastUsedAt: k.last_used_at || 0,
    })
    keysBySupplier.set(k.supplier_id, list)
  }

  const profileChannels = res.results || []
  const now = Date.now()
  const activeChannels = profileChannels.filter(
    (ch) => ch.enabled === 1 && ch.supplier_enabled === 1
  )

  // 先按 priority 分层并在同优先级渠道间随机打散，保证异构供应商负载均衡
  const tierMap = new Map<number, ChannelRow[]>()
  for (const ch of activeChannels) {
    const arr = tierMap.get(ch.priority) || []
    arr.push(ch)
    tierMap.set(ch.priority, arr)
  }
  const sortedPriorities = Array.from(tierMap.keys()).sort((a, b) => b - a)
  const orderedChannels: ChannelRow[] = []
  for (const p of sortedPriorities) {
    orderedChannels.push(...shuffleTier(tierMap.get(p)!))
  }

  const runnable: RunnableChannel[] = []
  for (const ch of orderedChannels) {
    const effectiveModel =
      ch.model === 'custom'
        ? ch.custom_model.trim() || PROVIDER_META[providerId].models[0].value
        : ch.model
    const baseUrl = (ch.supplier_base_url || PROVIDER_META[providerId].defaultBaseUrl).trim()
    const supKeys = keysBySupplier.get(ch.supplier_id) || []
    const boundKeyIds = parseKeyIdsJson(ch.key_ids_json)

    if (supKeys.length > 0) {
      const eligibleKeys = supKeys.filter(
        (k) => k.enabled && (boundKeyIds.length === 0 || boundKeyIds.includes(k.id))
      )
      const healthy = sortKeysByLru(eligibleKeys.filter((k) => k.cooldownUntil <= now))
      const cooling = eligibleKeys
        .filter((k) => k.cooldownUntil > now)
        .sort((a, b) => a.cooldownUntil - b.cooldownUntil)
      for (const keyRow of [...healthy, ...cooling]) {
        const apiKey = await resolveSupplierSecret(keyRow.apiKeyEncrypted, env)
        if (!apiKey) continue
        runnable.push({
          channelId: ch.id,
          channelName: ch.name,
          supplierId: ch.supplier_id,
          supplierName: ch.supplier_name || '',
          supplierKeyId: keyRow.id,
          supplierKeyLabel: keyRow.label || undefined,
          supplierKeyHint: keyRow.apiKeyHint || undefined,
          cooldownUntil: keyRow.cooldownUntil,
          baseUrl,
          apiKey,
          providerId,
          model: effectiveModel,
          paramsJson: ch.params_json,
          priority: ch.priority,
        })
      }
    } else if (ch.supplier_api_key_encrypted) {
      const apiKey = await resolveSupplierSecret(ch.supplier_api_key_encrypted, env)
      if (!apiKey) continue
      runnable.push({
        channelId: ch.id,
        channelName: ch.name,
        supplierId: ch.supplier_id,
        supplierName: ch.supplier_name || '',
        baseUrl,
        apiKey,
        providerId,
        model: effectiveModel,
        paramsJson: ch.params_json,
        priority: ch.priority,
      })
    }
  }

  // 仅当该画师尚未在数据库中配置任何渠道时，才允许使用环境变量兜底（防止跨模型档位串流）
  if ((providerChannelCount?.cnt ?? 0) === 0) {
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

  return runnable
}

export async function getPublicProviders(env: Env): Promise<ProviderPublicInfo[]> {
  const [rows, profileRows, readyChannelsRes, providerTotalsRes, keysRes] = await Promise.all([
    getAllProviderRows(env.DB),
    getAllModelProfiles(env.DB),
    env.DB.prepare(
      `SELECT c.profile_id, c.supplier_id, c.key_ids_json, c.model, c.custom_model, c.params_json,
              s.api_key_encrypted AS supplier_api_key_encrypted
       FROM provider_channels c
       JOIN suppliers s ON s.id = c.supplier_id
       WHERE c.enabled = 1 AND s.enabled = 1`
    ).all<{
      profile_id: string | null
      supplier_id: string
      key_ids_json: string | null
      model: string
      custom_model: string
      params_json: string
      supplier_api_key_encrypted: string
    }>(),
    env.DB.prepare(
      `SELECT provider_id, COUNT(*) AS total_channels
       FROM provider_channels
       GROUP BY provider_id`
    ).all<{ provider_id: ImageProviderId; total_channels: number }>(),
    env.DB.prepare(
      `SELECT id, supplier_id, enabled FROM supplier_keys`
    ).all<{ id: string; supplier_id: string; enabled: number }>(),
  ])

  const keysBySupplier = new Map<string, Array<{ id: string; enabled: boolean }>>()
  for (const k of keysRes.results || []) {
    const list = keysBySupplier.get(k.supplier_id) || []
    list.push({ id: k.id, enabled: k.enabled === 1 })
    keysBySupplier.set(k.supplier_id, list)
  }

  const readyByProfile = new Map<string, number>()
  const stitchedByProfile = new Map<string, boolean>()
  const nativeByProfile = new Map<string, boolean>()
  for (const ch of readyChannelsRes.results || []) {
    if (!ch.profile_id) continue
    const supKeys = keysBySupplier.get(ch.supplier_id) || []
    const boundKeyIds = parseKeyIdsJson(ch.key_ids_json)
    const hasUsableKey =
      supKeys.length > 0
        ? supKeys.some((k) => k.enabled && (boundKeyIds.length === 0 || boundKeyIds.includes(k.id)))
        : Boolean(ch.supplier_api_key_encrypted)
    if (!hasUsableKey) continue

    readyByProfile.set(ch.profile_id, (readyByProfile.get(ch.profile_id) || 0) + 1)
    const effectiveModel = ch.model === 'custom' ? ch.custom_model.trim() : ch.model
    if (isChannelStitchedSingleMode({ model: effectiveModel, paramsJson: ch.params_json }, 2)) {
      stitchedByProfile.set(ch.profile_id, true)
    }
    if (isNativeArtistChannel({ paramsJson: ch.params_json })) {
      nativeByProfile.set(ch.profile_id, true)
    }
  }
  const totalByProvider = new Map<ImageProviderId, number>()
  for (const r of providerTotalsRes.results || []) {
    totalByProvider.set(r.provider_id, r.total_channels || 0)
  }

  const profilesByProvider = new Map<ImageProviderId, ModelProfileRow[]>()
  for (const prof of profileRows) {
    const list = profilesByProvider.get(prof.provider_id) || []
    list.push(prof)
    profilesByProvider.set(prof.provider_id, list)
  }

  return rows.map((row) => {
    const totalProviderChannels = totalByProvider.get(row.provider_id) || 0
    const hasEnvFallback = totalProviderChannels === 0 && Boolean(getEnvFallbackApiKey(env, row.provider_id))
    const rawProfiles = [...(profilesByProvider.get(row.provider_id) || [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      if (a.is_default !== b.is_default) return b.is_default - a.is_default
      return a.created_at - b.created_at
    })

    const models: ProviderModelPublicInfo[] = rawProfiles.map((prof) => {
      const parsed = parseProfileRow(prof)
      const readyCount = readyByProfile.get(prof.id) || 0
      const configured = readyCount > 0 || (hasEnvFallback && prof.is_default === 1)
      return {
        profileId: prof.id,
        displayName: prof.display_name,
        badge: prof.badge || '',
        tagline: prof.tagline || '',
        enabled: prof.enabled === 1,
        configured,
        creditCost: parsed.effectiveCreditCost,
        defaultResolution: parsed.defaultResolution,
        resolutions: parsed.resolutions
          .filter((r) => r.enabled)
          .map(({ resolution, creditCost }) => ({ resolution, creditCost })),
        isDefault: prof.is_default === 1,
        needsStitchedSheet: stitchedByProfile.get(prof.id) === true,
        supportsTextFallback:
          nativeByProfile.get(prof.id) === true || (hasEnvFallback && prof.is_default === 1),
        sortOrder: prof.sort_order,
      }
    })

    const defaultPublicModel =
      models.find((m) => m.isDefault && m.enabled && m.configured) ??
      models.find((m) => m.enabled && m.configured) ??
      models.find((m) => m.isDefault) ??
      models[0]

    return {
      providerId: row.provider_id,
      enabled: row.enabled === 1,
      configured: models.some((m) => m.enabled && m.configured) || (models.length === 0 && hasEnvFallback),
      creditCost: defaultPublicModel?.creditCost ?? row.credit_cost,
      sortOrder: row.sort_order,
      artist: getStudioArtist(row.provider_id),
      models,
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
): Promise<{ user: PublicUser; sessionId: string; renewed: boolean } | null> {
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
  let renewed = false
  if (now - row.session_last_seen > 15 * 60 * 1000) {
    await db
      .prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
      .bind(now, now + SESSION_TTL_MS, row.session_id)
      .run()
    renewed = true
  }
  return { user: mapUserRow(row), sessionId: row.session_id, renewed }
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
    profileId?: string | null
    profileName?: string | null
    resolution?: StudioResolution | null
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
    initialStatus?: 'queued' | 'processing'
    startedAt?: number | null
    queuePayloadJson?: string | null
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
  const initialStatus = params.initialStatus === 'queued' ? 'queued' : 'processing'
  const startedAt =
    params.startedAt !== undefined
      ? params.startedAt
      : initialStatus === 'processing'
        ? now
        : null
  const cost = Math.max(0, Math.floor(params.creditsCost))
  const ledgerLabel = [
    getStudioArtist(params.provider).name,
    params.profileName?.trim() || null,
    params.resolution || null,
  ]
    .filter(Boolean)
    .join(' · ')

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO generation_jobs (
          id, user_id, idempotency_key, provider, profile_id, profile_name, resolution, model,
          channel_id, channel_name, supplier_id, supplier_name,
          status, credits_cost, credits_refunded, prompt, recipe_summary, aspect_ratio, style_preset,
          snapshot_json, trace_json, created_at, started_at, queue_payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.jobId,
        params.userId,
        params.idempotencyKey,
        params.provider,
        params.profileId ?? null,
        params.profileName ?? null,
        params.resolution ?? null,
        params.model,
        params.channelId ?? null,
        params.channelName ?? null,
        params.supplierId ?? null,
        params.supplierName ?? null,
        initialStatus,
        cost,
        params.prompt,
        params.recipeSummary,
        params.aspectRatio,
        params.stylePreset,
        params.snapshotJson,
        capTraceJson(params.traceJson),
        now,
        startedAt,
        params.queuePayloadJson ?? null
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
        `生成消耗 · ${ledgerLabel}`,
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
  const updateRes = await db
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
           queue_payload_json = NULL,
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
  if ((updateRes.meta?.changes ?? 0) === 0) {
    return null
  }
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
    if (Array.isArray(parsed.attempts)) {
      for (const attempt of parsed.attempts) {
        if (attempt && attempt.outcome === 'in_progress') {
          attempt.outcome = 'failed'
          attempt.finishedAt = attempt.finishedAt ?? now
          attempt.durationMs =
            attempt.durationMs ?? Math.max(0, (attempt.finishedAt || now) - attempt.startedAt)
          attempt.error = attempt.error || errorMessage
        }
      }
    }
    parsed.finishedAt = parsed.finishedAt ?? now
    parsed.totalDurationMs =
      parsed.totalDurationMs ?? Math.max(0, (parsed.finishedAt || now) - parsed.startedAt)
    parsed.creditsRefunded = refundCredits
    parsed.finalError = parsed.finalError || errorMessage
    parsed.liveState = null
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
  if (
    !job ||
    job.status === 'succeeded' ||
    job.status === 'cancelled' ||
    (job.status === 'failed' && (job.credits_refunded > 0 || job.credits_cost === 0))
  ) {
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
             queue_payload_json = NULL,
             finished_at = ?
         WHERE id = ? AND status IN ('processing', 'queued')`
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
            (SELECT u.credit_balance FROM users u INNER JOIN generation_jobs j ON j.user_id = u.id WHERE u.id = ? AND j.id = ? AND j.status IN ('processing', 'queued')),
            'generate_refund', ?, ?, NULL, ?
          )`
        )
        .bind(
          crypto.randomUUID(),
          job.user_id,
          job.credits_cost,
          job.user_id,
          job.id,
          job.id,
          `生成失败退还 · ${[
            getStudioArtist(job.provider).name,
            job.profile_name?.trim() || null,
            job.resolution || null,
          ]
            .filter(Boolean)
            .join(' · ')}`,
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
               queue_payload_json = NULL,
               finished_at = ?
           WHERE id = ? AND status IN ('processing', 'queued')`
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
             queue_payload_json = NULL,
             finished_at = COALESCE(finished_at, ?)
         WHERE id = ? AND status IN ('processing', 'queued')`
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

export async function promoteQueuedJobToProcessing(
  db: D1Database,
  jobId: string,
  now = Date.now()
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE generation_jobs
       SET status = 'processing',
           started_at = ?
       WHERE id = ? AND status = 'queued'`
    )
    .bind(now, jobId)
    .run()
  return (res.meta?.changes ?? 0) === 1
}

export async function cancelQueuedJob(
  db: D1Database,
  jobId: string,
  reason: string,
  options?: { ledgerNote?: string; expectedUserId?: string }
): Promise<{
  cancelled: boolean
  notFound?: boolean
  forbidden?: boolean
  alreadyStatus?: GenerationStatus
  refunded: number
  creditBalance?: number
  job?: JobRow
}> {
  const job = await db
    .prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .bind(jobId)
    .first<JobRow>()
  if (!job) {
    return { cancelled: false, notFound: true, refunded: 0 }
  }
  if (options?.expectedUserId && job.user_id !== options.expectedUserId) {
    return { cancelled: false, forbidden: true, refunded: 0 }
  }
  if (job.status !== 'queued') {
    return { cancelled: false, alreadyStatus: job.status, refunded: 0, job }
  }

  const now = Date.now()
  const nextTrace = finalizeTraceForFailure(job.trace_json, null, reason, job.credits_cost, now)
  const cleanReason = reason.trim().slice(0, 500) || '已取消排队，积分已退还'
  const ledgerPrefix = options?.ledgerNote?.trim() || '取消排队退还'
  const ledgerLabel = [
    getStudioArtist(job.provider).name,
    job.profile_name?.trim() || null,
    job.resolution || null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (job.credits_cost <= 0) {
    const upd = await db
      .prepare(
        `UPDATE generation_jobs
         SET status = 'cancelled',
             error_message = ?,
             finished_at = ?,
             queue_payload_json = NULL,
             trace_json = COALESCE(?, trace_json)
         WHERE id = ? AND status = 'queued'`
      )
      .bind(cleanReason, now, nextTrace, job.id)
      .run()
    const fresh = await db
      .prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
      .bind(job.id)
      .first<JobRow>()
    if ((upd.meta?.changes ?? 0) === 0) {
      return {
        cancelled: false,
        alreadyStatus: fresh?.status,
        refunded: 0,
        job: fresh ?? undefined,
      }
    }
    const userRow = await db
      .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(job.user_id)
      .first<{ credit_balance: number }>()
    return {
      cancelled: true,
      refunded: 0,
      creditBalance: userRow?.credit_balance,
      job: fresh ?? undefined,
    }
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
            (SELECT u.credit_balance FROM users u INNER JOIN generation_jobs j ON j.user_id = u.id WHERE u.id = ? AND j.id = ? AND j.status = 'queued'),
            'generate_refund', ?, ?, NULL, ?
          )`
        )
        .bind(
          crypto.randomUUID(),
          job.user_id,
          job.credits_cost,
          job.user_id,
          job.id,
          job.id,
          `${ledgerPrefix} · ${ledgerLabel}`,
          now
        ),
      db
        .prepare(
          `UPDATE generation_jobs
           SET status = 'cancelled',
               credits_refunded = credits_cost,
               error_message = ?,
               finished_at = ?,
               queue_payload_json = NULL,
               trace_json = COALESCE(?, trace_json)
           WHERE id = ? AND status = 'queued'`
        )
        .bind(cleanReason, now, nextTrace, job.id),
    ])
    const [fresh, userRow] = await Promise.all([
      db.prepare(`SELECT * FROM generation_jobs WHERE id = ?`).bind(job.id).first<JobRow>(),
      db
        .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
        .bind(job.user_id)
        .first<{ credit_balance: number }>(),
    ])
    return {
      cancelled: true,
      refunded: job.credits_cost,
      creditBalance: userRow?.credit_balance,
      job: fresh ?? undefined,
    }
  } catch {
    const fresh = await db
      .prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
      .bind(job.id)
      .first<JobRow>()
    const userRow = await db
      .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(job.user_id)
      .first<{ credit_balance: number }>()
    return {
      cancelled: false,
      alreadyStatus: fresh?.status,
      refunded: 0,
      creditBalance: userRow?.credit_balance,
      job: fresh ?? undefined,
    }
  }
}

export async function forceCancelProcessingJob(
  db: D1Database,
  jobId: string,
  reason = '管理员强制中止绘制任务并全额退还积分'
): Promise<{ creditBalance?: number; refunded: boolean }> {
  return refundFailedJob(db, jobId, reason)
}

export async function listActiveQueueRows(
  db: D1Database
): Promise<Array<JobRow & { username?: string }>> {
  const res = await db
    .prepare(
      `SELECT g.*, u.username
       FROM generation_jobs g
       LEFT JOIN users u ON u.id = g.user_id
       WHERE g.status IN ('processing', 'queued')
       ORDER BY g.created_at ASC, g.id ASC`
    )
    .all<JobRow & { username?: string }>()
  return res.results || []
}

export function computeQueuePositions(
  activeRows: JobRow[],
  queueConfig: GenerationQueueConfig
): Map<string, GenerationQueueInfo> {
  const result = new Map<string, GenerationQueueInfo>()
  const modelRunning = new Map<string, number>()
  const userRunning = new Map<string, number>()
  const queuedRows: JobRow[] = []

  for (const row of activeRows) {
    if (row.status === 'processing') {
      const mKey = row.profile_id || row.provider
      modelRunning.set(mKey, (modelRunning.get(mKey) ?? 0) + 1)
      userRunning.set(row.user_id, (userRunning.get(row.user_id) ?? 0) + 1)
    } else if (row.status === 'queued') {
      queuedRows.push(row)
    }
  }

  queuedRows.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
  const totalQueued = queuedRows.length
  const modelQueuedSeen = new Map<string, number>()

  for (let i = 0; i < queuedRows.length; i++) {
    const row = queuedRows[i]
    const position = i + 1
    const mKey = row.profile_id || row.provider
    const modelPosition = (modelQueuedSeen.get(mKey) ?? 0) + 1
    modelQueuedSeen.set(mKey, modelPosition)

    const userRunCount = userRunning.get(row.user_id) ?? 0
    const modelRunCount = modelRunning.get(mKey) ?? 0
    const modelLimit = resolveProfileConcurrencyLimit(queueConfig, row.profile_id)
    const reason: GenerationQueueWaitReason =
      userRunCount >= queueConfig.maxUserConcurrency
        ? 'user_busy'
        : modelRunCount >= modelLimit
          ? 'model_busy'
          : 'global_busy'

    result.set(row.id, {
      position,
      aheadCount: position - 1,
      totalQueued,
      modelPosition,
      modelAheadCount: modelPosition - 1,
      reason,
      queuedAt: row.created_at,
    })
  }

  return result
}

export async function reapStaleProcessingJobs(
  db: D1Database,
  userId?: string
): Promise<{ reapedProcessing: number; reapedQueued: number }> {
  const platform = await getPlatformConfig(db)
  const queueCfg = mergeGenerationQueueConfig(platform.queueConfig)
  const now = Date.now()
  const processingCutoff = now - queueCfg.processingTimeoutSec * 1000
  const queueCutoff = now - queueCfg.queueWaitTimeoutSec * 1000

  let reapedProcessing = 0
  let reapedQueued = 0

  for (let round = 0; round < 5; round++) {
    const query = userId
      ? db
          .prepare(
            `SELECT id FROM generation_jobs
             WHERE user_id = ? AND status = 'processing' AND COALESCE(started_at, created_at) < ?
             LIMIT 100`
          )
          .bind(userId, processingCutoff)
      : db
          .prepare(
            `SELECT id FROM generation_jobs
             WHERE status = 'processing' AND COALESCE(started_at, created_at) < ?
             LIMIT 100`
          )
          .bind(processingCutoff)

    const stale = await query.all<{ id: string }>()
    const rows = stale.results || []
    if (rows.length === 0) break
    for (const row of rows) {
      await refundFailedJob(db, row.id, '生成任务超时未返回结果，系统已自动退还积分')
      reapedProcessing += 1
    }
    if (rows.length < 100) break
  }

  for (let round = 0; round < 5; round++) {
    const query = userId
      ? db
          .prepare(
            `SELECT id FROM generation_jobs
             WHERE user_id = ? AND status = 'queued' AND created_at < ?
             LIMIT 100`
          )
          .bind(userId, queueCutoff)
      : db
          .prepare(
            `SELECT id FROM generation_jobs
             WHERE status = 'queued' AND created_at < ?
             LIMIT 100`
          )
          .bind(queueCutoff)

    const staleQueued = await query.all<{ id: string }>()
    const rows = staleQueued.results || []
    if (rows.length === 0) break
    for (const row of rows) {
      await cancelQueuedJob(db, row.id, '排队等待超时，系统已自动取消并全额退还积分', {
        ledgerNote: '排队超时自动退还',
      })
      reapedQueued += 1
    }
    if (rows.length < 100) break
  }

  return { reapedProcessing, reapedQueued }
}

export async function cleanupExpiredSessionsAndOauth(db: D1Database): Promise<void> {
  const now = Date.now()
  const rlCutoff = now - 24 * 60 * 60 * 1000
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now),
    db.prepare(`DELETE FROM oauth_states WHERE expires_at <= ?`).bind(now),
    db
      .prepare(
        `DELETE FROM system_settings WHERE (key LIKE 'rl_%' OR key LIKE 'admin_login_rl_%') AND updated_at < ?`
      )
      .bind(rlCutoff),
  ])
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
          `INSERT INTO redeem_claims (id, code_id, user_id, credits, created_at)
           VALUES (
             ?, ?, ?,
             (SELECT credits FROM redeem_codes
              WHERE id = ? AND status = 'active' AND used_count < max_uses AND (expires_at IS NULL OR expires_at > ?)),
             ?
           )`
        )
        .bind(crypto.randomUUID(), row.id, params.userId, row.id, now, now),
      db
        .prepare(
          `UPDATE redeem_codes
           SET used_count = used_count + 1
           WHERE id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)`
        )
        .bind(row.id, now),
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

// ===========================================================================
// 参考图文字描述缓存（姿势图 / 服装图单次即时转译入库与后台管理）
// ===========================================================================

interface ReferenceDescriptionRow {
  id: string
  kind: ReferenceDescriptionKind
  ref_key: string
  source_label: string
  preview_path: string
  description: string
  source_type: 'auto' | 'manual'
  vision_model: string
  vision_supplier_id: string
  created_at: number
  updated_at: number
}

export function mapReferenceDescriptionRow(row: ReferenceDescriptionRow): ReferenceDescriptionDTO {
  return {
    id: row.id,
    kind: row.kind,
    refKey: row.ref_key,
    sourceLabel: row.source_label || '',
    previewPath: row.preview_path || '',
    description: row.description || '',
    sourceType: row.source_type === 'manual' ? 'manual' : 'auto',
    visionModel: row.vision_model || '',
    visionSupplierId: row.vision_supplier_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findReferenceDescriptionByKey(
  db: D1Database,
  kind: ReferenceDescriptionKind,
  refKey: string
): Promise<ReferenceDescriptionDTO | null> {
  const row = await db
    .prepare(`SELECT * FROM reference_descriptions WHERE kind = ? AND ref_key = ? LIMIT 1`)
    .bind(kind, refKey)
    .first<ReferenceDescriptionRow>()
  return row ? mapReferenceDescriptionRow(row) : null
}

export async function findReferenceDescriptionById(
  db: D1Database,
  id: string
): Promise<ReferenceDescriptionDTO | null> {
  const row = await db
    .prepare(`SELECT * FROM reference_descriptions WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ReferenceDescriptionRow>()
  return row ? mapReferenceDescriptionRow(row) : null
}

/**
 * 以唯一键 (kind, ref_key) 幂等写入自动转译描述；若并发请求已先写入，则直接读取库中既有记录。
 */
export async function upsertAutoReferenceDescription(
  db: D1Database,
  params: {
    kind: ReferenceDescriptionKind
    refKey: string
    sourceLabel: string
    previewPath: string
    description: string
    visionModel: string
    visionSupplierId: string
  }
): Promise<ReferenceDescriptionDTO> {
  const now = Date.now()
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO reference_descriptions (
        id, kind, ref_key, source_label, preview_path, description,
        source_type, vision_model, vision_supplier_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'auto', ?, ?, ?, ?)
      ON CONFLICT(kind, ref_key) DO NOTHING`
    )
    .bind(
      id,
      params.kind,
      params.refKey,
      params.sourceLabel.slice(0, 200),
      params.previewPath.slice(0, 600),
      params.description,
      params.visionModel.slice(0, 120),
      params.visionSupplierId.slice(0, 120),
      now,
      now
    )
    .run()

  const stored = await findReferenceDescriptionByKey(db, params.kind, params.refKey)
  if (stored) return stored
  return {
    id,
    kind: params.kind,
    refKey: params.refKey,
    sourceLabel: params.sourceLabel,
    previewPath: params.previewPath,
    description: params.description,
    sourceType: 'auto',
    visionModel: params.visionModel,
    visionSupplierId: params.visionSupplierId,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateReferenceDescriptionManual(
  db: D1Database,
  id: string,
  params: { description: string; sourceLabel?: string }
): Promise<ReferenceDescriptionDTO | null> {
  const existing = await findReferenceDescriptionById(db, id)
  if (!existing) return null
  const now = Date.now()
  await db
    .prepare(
      `UPDATE reference_descriptions
       SET description = ?, source_label = ?, source_type = 'manual', updated_at = ?
       WHERE id = ?`
    )
    .bind(
      params.description.trim(),
      typeof params.sourceLabel === 'string' ? params.sourceLabel.trim().slice(0, 200) : existing.sourceLabel,
      now,
      id
    )
    .run()
  return findReferenceDescriptionById(db, id)
}

export async function updateReferenceDescriptionRegenerated(
  db: D1Database,
  id: string,
  params: { description: string; visionModel: string; visionSupplierId: string }
): Promise<ReferenceDescriptionDTO | null> {
  const existing = await findReferenceDescriptionById(db, id)
  if (!existing) return null
  const now = Date.now()
  await db
    .prepare(
      `UPDATE reference_descriptions
       SET description = ?, source_type = 'auto', vision_model = ?, vision_supplier_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      params.description.trim(),
      params.visionModel.slice(0, 120),
      params.visionSupplierId.slice(0, 120),
      now,
      id
    )
    .run()
  return findReferenceDescriptionById(db, id)
}

export async function listReferenceDescriptions(
  db: D1Database,
  params: {
    kind?: 'all' | ReferenceDescriptionKind
    q?: string
    limit?: number
    offset?: number
  }
): Promise<{
  items: ReferenceDescriptionDTO[]
  total: number
  poseCount: number
  costumeCount: number
  portraitCount: number
  extraCount: number
}> {
  const whereClauses: string[] = []
  const bindings: unknown[] = []
  if (
    params.kind === 'pose' ||
    params.kind === 'costume' ||
    params.kind === 'portrait' ||
    params.kind === 'extra'
  ) {
    whereClauses.push(`kind = ?`)
    bindings.push(params.kind)
  }
  const kw = (params.q || '').trim()
  if (kw) {
    const like = `%${kw}%`
    whereClauses.push(`(source_label LIKE ? OR ref_key LIKE ? OR description LIKE ? OR preview_path LIKE ?)`)
    bindings.push(like, like, like, like)
  }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const limit = Math.min(100, Math.max(1, Number(params.limit || 20)))
  const offset = Math.max(0, Number(params.offset || 0))

  const [rowsRes, countRow, summaryRow] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM reference_descriptions ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...bindings, limit, offset)
      .all<ReferenceDescriptionRow>(),
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM reference_descriptions ${where}`)
      .bind(...bindings)
      .first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN kind = 'pose' THEN 1 ELSE 0 END) AS pose_cnt,
           SUM(CASE WHEN kind = 'costume' THEN 1 ELSE 0 END) AS costume_cnt,
           SUM(CASE WHEN kind = 'portrait' THEN 1 ELSE 0 END) AS portrait_cnt,
           SUM(CASE WHEN kind = 'extra' THEN 1 ELSE 0 END) AS extra_cnt
         FROM reference_descriptions`
      )
      .first<{
        pose_cnt: number | null
        costume_cnt: number | null
        portrait_cnt: number | null
        extra_cnt: number | null
      }>(),
  ])

  return {
    items: (rowsRes.results || []).map(mapReferenceDescriptionRow),
    total: countRow?.cnt ?? 0,
    poseCount: summaryRow?.pose_cnt ?? 0,
    costumeCount: summaryRow?.costume_cnt ?? 0,
    portraitCount: summaryRow?.portrait_cnt ?? 0,
    extraCount: summaryRow?.extra_cnt ?? 0,
  }
}

export async function deleteReferenceDescription(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare(`DELETE FROM reference_descriptions WHERE id = ?`).bind(id).run()
  return (res.meta?.changes ?? 0) > 0
}

export interface VisionFallbackTarget {
  supplierId: string
  supplierName: string
  baseUrl: string
  apiKey: string
  model: string
  endpointMode: 'gemini_native' | 'openai_chat'
  authMode: 'auto' | 'bearer' | 'goog_key' | 'both'
}

async function resolveSupplierPoolApiKeys(
  env: Env,
  supplierId: string,
  legacyEncrypted?: string
): Promise<string[]> {
  const keysRes = await env.DB.prepare(
    `SELECT api_key_encrypted, cooldown_until, last_used_at
     FROM supplier_keys
     WHERE supplier_id = ? AND enabled = 1
     ORDER BY created_at ASC`
  )
    .bind(supplierId)
    .all<{ api_key_encrypted: string; cooldown_until: number; last_used_at: number }>()

  const rows = keysRes.results || []
  const now = Date.now()
  if (rows.length > 0) {
    const healthy = sortKeysByLru(
      rows
        .filter((r) => (r.cooldown_until || 0) <= now)
        .map((r) => ({ ...r, lastUsedAt: r.last_used_at || 0 }))
    )
    const cooling = rows
      .filter((r) => (r.cooldown_until || 0) > now)
      .sort((a, b) => (a.cooldown_until || 0) - (b.cooldown_until || 0))
    const resolved: string[] = []
    for (const item of [...healthy, ...cooling]) {
      const plain = await resolveSupplierSecret(item.api_key_encrypted, env)
      if (plain) resolved.push(plain)
    }
    return resolved
  }

  if (legacyEncrypted) {
    const plain = await resolveSupplierSecret(legacyEncrypted, env)
    if (plain) return [plain]
  }
  return []
}

/**
 * 按后台配置的视觉模型与供应商筛选出按优先级排列的“看图转文字”执行目标：
 * 若未显式指定供应商，优先匹配当前启用的同协议渠道或供应商地址（例如复用 Google 官方供应商的 Base URL 与密钥）。
 */
export async function resolveVisionFallbackTargets(
  env: Env,
  cfg: VisionFallbackConfig
): Promise<VisionFallbackTarget[]> {
  const model = (cfg.model || 'gemini-4-hydrogen').trim() || 'gemini-4-hydrogen'
  const endpointMode = cfg.endpointMode === 'openai_chat' ? 'openai_chat' : 'gemini_native'
  const authMode = cfg.authMode || 'auto'

  if (cfg.supplierId.trim()) {
    const sup = await env.DB.prepare(
      `SELECT id, name, base_url, api_key_encrypted, enabled FROM suppliers WHERE id = ? LIMIT 1`
    )
      .bind(cfg.supplierId.trim())
      .first<{ id: string; name: string; base_url: string; api_key_encrypted: string; enabled: number }>()
    if (!sup || sup.enabled !== 1) return []
    const apiKeys = await resolveSupplierPoolApiKeys(env, sup.id, sup.api_key_encrypted)
    if (apiKeys.length === 0) return []
    return apiKeys.slice(0, 3).map((apiKey) => ({
      supplierId: sup.id,
      supplierName: sup.name,
      baseUrl: sup.base_url.trim(),
      apiKey,
      model,
      endpointMode,
      authMode,
    }))
  }

  const channelRows = await env.DB.prepare(
    `SELECT c.provider_id, c.model, c.custom_model, c.params_json, c.priority,
            s.id AS supplier_id, s.name AS supplier_name, s.base_url AS supplier_base_url,
            s.api_key_encrypted AS supplier_api_key_encrypted
     FROM provider_channels c
     JOIN suppliers s ON s.id = c.supplier_id
     WHERE c.enabled = 1 AND s.enabled = 1
     ORDER BY c.priority DESC, c.created_at ASC`
  ).all<{
    provider_id: ImageProviderId
    model: string
    custom_model: string
    params_json: string
    priority: number
    supplier_id: string
    supplier_name: string
    supplier_base_url: string
    supplier_api_key_encrypted: string
  }>()

  const seenSuppliers = new Set<string>()
  const exactMatches: VisionFallbackTarget[] = []
  const providerMatches: VisionFallbackTarget[] = []
  const targetLower = model.toLowerCase()

  for (const row of channelRows.results || []) {
    if (seenSuppliers.has(row.supplier_id)) continue
    let parsedParams: Record<string, unknown> = {}
    try {
      parsedParams = JSON.parse(row.params_json) as Record<string, unknown>
    } catch {
      parsedParams = {}
    }
    if (parsedParams.endpointMode === 'wavespeed' || parsedParams.endpointMode === 'dreamina') continue

    const effectiveChModel = (row.model === 'custom' ? row.custom_model : row.model).trim()
    const isExactModel = effectiveChModel.toLowerCase() === targetLower
    const isGeminiSlot = row.provider_id === 'gemini' && parsedParams.endpointMode === 'native'
    const isCompatibleProtocol =
      endpointMode === 'gemini_native'
        ? isGeminiSlot || isExactModel
        : row.provider_id === 'gpt' || isExactModel

    if (!isExactModel && !isCompatibleProtocol) continue

    const apiKeys = await resolveSupplierPoolApiKeys(
      env,
      row.supplier_id,
      row.supplier_api_key_encrypted
    )
    if (apiKeys.length === 0) continue
    seenSuppliers.add(row.supplier_id)

    const chAuthMode =
      typeof parsedParams.authMode === 'string' &&
      ['auto', 'bearer', 'goog_key', 'both'].includes(parsedParams.authMode)
        ? (parsedParams.authMode as VisionFallbackTarget['authMode'])
        : authMode

    const target: VisionFallbackTarget = {
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      baseUrl: (row.supplier_base_url || PROVIDER_META[row.provider_id].defaultBaseUrl).trim(),
      apiKey: apiKeys[0],
      model,
      endpointMode,
      authMode: cfg.authMode && cfg.authMode !== 'auto' ? cfg.authMode : chAuthMode,
    }
    if (isExactModel) {
      exactMatches.push(target)
    } else {
      providerMatches.push(target)
    }
  }

  const combined = [...exactMatches, ...providerMatches]
  if (combined.length > 0) return combined

  // 若尚无对应协议的生图渠道，直接检索已启用的同厂商域名供应商作为兜底
  const supRows = await env.DB.prepare(
    `SELECT id, name, base_url, api_key_encrypted
     FROM suppliers
     WHERE enabled = 1
     ORDER BY created_at ASC`
  ).all<{ id: string; name: string; base_url: string; api_key_encrypted: string }>()

  const directMatches: VisionFallbackTarget[] = []
  for (const sup of supRows.results || []) {
    const lowerUrl = sup.base_url.toLowerCase()
    const matchesProtocol =
      endpointMode === 'gemini_native'
        ? /googleapis\.com|aiplatform|gemini/.test(lowerUrl)
        : /api\.openai\.com|\/v1(?:\/|$)/.test(lowerUrl) && !/wavespeed\.ai/.test(lowerUrl)
    if (!matchesProtocol) continue
    const apiKeys = await resolveSupplierPoolApiKeys(env, sup.id, sup.api_key_encrypted)
    if (apiKeys.length === 0) continue
    directMatches.push({
      supplierId: sup.id,
      supplierName: sup.name,
      baseUrl: sup.base_url.trim(),
      apiKey: apiKeys[0],
      model,
      endpointMode,
      authMode,
    })
  }
  return directMatches
}
