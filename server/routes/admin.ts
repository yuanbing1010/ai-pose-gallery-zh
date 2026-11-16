import { Hono } from 'hono'
import {
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  PROVIDER_ORDER,
  mergePromptTemplate,
  type AdminOverviewPayload,
  type ImageProviderId,
  type PlatformConfig,
} from '../../shared/studio'
import { encryptSecret, hashPassword, maskApiKey, detectImageFormat } from '../crypto'
import {
  adjustUserCredits,
  createRedeemCodesBatch,
  createSession,
  createUserWithBonus,
  getAdminProviderSlots,
  getAdminWechatConfig,
  getPlatformConfig,
  getSuppliers,
  getUserWithOAuthById,
  mapAdminUserRow,
  mapJobRow,
  mapLedgerRow,
  mapUserRow,
  reapStaleProcessingJobs,
  sanitizeStyleCategoriesInput,
  sanitizeStylePresetsInput,
  sanitizeStyleSubcategoriesInput,
  savePlatformConfig,
  saveWechatOAuthConfig,
  type ChannelRow,
  type JobRow,
  type ProviderRow,
  type SupplierRow,
  type UserRow,
} from '../db'
import { requireAdmin, setSessionCookie } from '../middleware'
import type { AppEnv } from '../types'
import {
  parseIntSafe,
  sanitizeCallbackBaseUrl,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../validation'

export const adminRoutes = new Hono<AppEnv>()

adminRoutes.get('/bootstrap-status', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`
  ).first<{ cnt: number }>()
  c.header('Cache-Control', 'no-store')
  return c.json({ needsSetup: (row?.cnt ?? 0) === 0 })
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
  setSessionCookie(c, rawToken)
  c.header('Cache-Control', 'no-store')
  return c.json({ user }, 201)
})

adminRoutes.use('*', requireAdmin)

adminRoutes.get('/overview', async (c) => {
  await reapStaleProcessingJobs(c.env.DB)

  const [
    usersStats,
    ledgerStats,
    jobsStats,
    redeemStats,
    supplierStats,
    channelStats,
    assetsStats,
    platformCfg,
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
              SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing
       FROM generation_jobs`
    ).first<{ total: number; succeeded: number | null; failed: number | null; processing: number | null }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM redeem_codes`).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM suppliers`).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM provider_channels`).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM uploaded_assets) + (SELECT COUNT(*) FROM generation_jobs WHERE result_r2_key IS NOT NULL) AS total_files,
         COALESCE((SELECT SUM(bytes) FROM uploaded_assets), 0) + COALESCE((SELECT SUM(result_bytes) FROM generation_jobs), 0) AS total_bytes`
    ).first<{ total_files: number; total_bytes: number }>(),
    getPlatformConfig(c.env.DB),
  ])

  const payload: AdminOverviewPayload = {
    usersTotal: usersStats?.total ?? 0,
    activeUsersTotal: usersStats?.active_total ?? 0,
    creditsIssuedTotal: ledgerStats?.issued ?? 0,
    creditsConsumedTotal: Math.max(0, ledgerStats?.net_consumed ?? 0),
    jobsTotal: jobsStats?.total ?? 0,
    jobsSucceeded: jobsStats?.succeeded ?? 0,
    jobsFailed: jobsStats?.failed ?? 0,
    jobsProcessing: jobsStats?.processing ?? 0,
    redeemCodesTotal: redeemStats?.total ?? 0,
    suppliersTotal: supplierStats?.total ?? 0,
    channelsTotal: channelStats?.total ?? 0,
    r2AssetsTotal: assetsStats?.total_files ?? 0,
    r2TotalBytes: assetsStats?.total_bytes ?? 0,
    encryptionConfigured: Boolean(c.env.APP_ENCRYPTION_KEY?.trim()),
    allowRegistration: platformCfg.allowRegistration,
  }

  c.header('Cache-Control', 'no-store')
  return c.json(payload)
})

// ---------------------------------------------------------------------------
// 供应商管理 (Suppliers)
// ---------------------------------------------------------------------------

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
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : ''
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : 1
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : ''

  if (!name) {
    return c.json({ error: { message: '请填写供应商名称' } }, 400)
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    return c.json({ error: { message: '接口基础地址必须以 https:// 开头' } }, 400)
  }

  const now = Date.now()
  const encrypted = apiKey ? await encryptSecret(apiKey, c.env.APP_ENCRYPTION_KEY) : ''
  const hint = apiKey ? maskApiKey(apiKey) : ''

  await c.env.DB.prepare(
    `INSERT INTO suppliers (
      id, name, base_url, api_key_encrypted, api_key_hint, enabled, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), name, baseUrl, encrypted, hint, enabled, note, now, now)
    .run()

  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers }, 201)
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
  const baseUrl =
    typeof body.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim().replace(/\/+$/, '')
      : existing.base_url
  if (!/^https:\/\//i.test(baseUrl)) {
    return c.json({ error: { message: '接口基础地址必须以 https:// 开头' } }, 400)
  }

  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : existing.note

  let nextEncrypted = existing.api_key_encrypted
  let nextHint = existing.api_key_hint
  if (body.clearApiKey === true) {
    nextEncrypted = ''
    nextHint = ''
  } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const plain = body.apiKey.trim()
    nextEncrypted = await encryptSecret(plain, c.env.APP_ENCRYPTION_KEY)
    nextHint = maskApiKey(plain)
  }

  await c.env.DB.prepare(
    `UPDATE suppliers
     SET name = ?, base_url = ?, api_key_encrypted = ?, api_key_hint = ?, enabled = ?, note = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(name, baseUrl, nextEncrypted, nextHint, enabled, note, Date.now(), id)
    .run()

  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
})

adminRoutes.delete('/suppliers/:id', async (c) => {
  const id = c.req.param('id')
  const ref = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM provider_channels WHERE supplier_id = ?`
  )
    .bind(id)
    .first<{ cnt: number }>()
  if ((ref?.cnt ?? 0) > 0) {
    return c.json(
      { error: { message: `该供应商正被 ${ref?.cnt} 个模型渠道引用，请先删除或切换对应渠道` } },
      409
    )
  }
  await c.env.DB.prepare(`DELETE FROM suppliers WHERE id = ?`).bind(id).run()
  const suppliers = await getSuppliers(c.env)
  c.header('Cache-Control', 'no-store')
  return c.json({ suppliers })
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

  const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : ''
  const supplier = await c.env.DB.prepare(`SELECT id, name FROM suppliers WHERE id = ?`)
    .bind(supplierId)
    .first<{ id: string; name: string }>()
  if (!supplier) {
    return c.json({ error: { message: '请选择有效的供应商' } }, 400)
  }

  const rawName = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const name = rawName || supplier.name.trim().slice(0, 60)
  if (!name) {
    return c.json({ error: { message: '请填写渠道名称' } }, 400)
  }

  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : 1
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : PROVIDER_META[providerId].models[0].value
  const customModel = typeof body.customModel === 'string' ? body.customModel.trim() : ''

  const priority = parseIntSafe(body.priority ?? 100, -10_000, 100_000)
  if (priority === null) {
    return c.json({ error: { message: '优先级需为整数' } }, 400)
  }

  const mergedParams = {
    ...DEFAULT_PROVIDER_PARAMS[providerId],
    ...(body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : {}),
  }

  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO provider_channels (
      id, provider_id, supplier_id, name, enabled, model, custom_model,
      priority, weight, params_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      providerId,
      supplierId,
      name,
      enabled,
      model,
      customModel,
      priority,
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

  const supplierId =
    typeof body.supplierId === 'string' && body.supplierId.trim()
      ? body.supplierId.trim()
      : existing.supplier_id
  const supplier = await c.env.DB.prepare(`SELECT id, name FROM suppliers WHERE id = ?`)
    .bind(supplierId)
    .first<{ id: string; name: string }>()
  if (!supplier) {
    return c.json({ error: { message: '所选供应商不存在' } }, 400)
  }

  const name =
    typeof body.name === 'string'
      ? body.name.trim().slice(0, 60) || supplier.name.trim().slice(0, 60)
      : existing.name
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  const model =
    typeof body.model === 'string' && body.model.trim() ? body.model.trim() : existing.model
  const customModel =
    typeof body.customModel === 'string' ? body.customModel.trim() : existing.custom_model

  const priority =
    body.priority !== undefined ? parseIntSafe(body.priority, -10_000, 100_000) : existing.priority
  if (priority === null) {
    return c.json({ error: { message: '优先级参数无效' } }, 400)
  }

  let baseParams = { ...DEFAULT_PROVIDER_PARAMS[existing.provider_id] }
  try {
    baseParams = { ...baseParams, ...JSON.parse(existing.params_json) }
  } catch {
    // ignore
  }
  const mergedParams = {
    ...baseParams,
    ...(body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : {}),
  }

  await c.env.DB.prepare(
    `UPDATE provider_channels
     SET supplier_id = ?, name = ?, enabled = ?, model = ?, custom_model = ?,
         priority = ?, params_json = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      supplierId,
      name,
      enabled,
      model,
      customModel,
      priority,
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

  const stylePromptOverrides: Record<string, string> = {}

  const next: PlatformConfig = {
    registerBonusCredits: bonus,
    allowRegistration:
      typeof body.allowRegistration === 'boolean' ? body.allowRegistration : current.allowRegistration,
    defaultSafeMode:
      typeof body.defaultSafeMode === 'boolean' ? body.defaultSafeMode : current.defaultSafeMode,
    allowUserNsfwUnlock:
      typeof body.allowUserNsfwUnlock === 'boolean'
        ? body.allowUserNsfwUnlock
        : current.allowUserNsfwUnlock,
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
    styleCategories: nextStyleCategories,
    styleSubcategories: nextStyleSubcategories,
    stylePresets: nextStylePresets,
    stylePromptOverrides,
    imagePassMode:
      body.imagePassMode === 'url' || body.imagePassMode === 'base64'
        ? body.imagePassMode
        : current.imagePassMode,
    sendStitchedSheet:
      typeof body.sendStitchedSheet === 'boolean' ? body.sendStitchedSheet : current.sendStitchedSheet,
  }

  await savePlatformConfig(c.env.DB, next)
  c.header('Cache-Control', 'no-store')
  return c.json({ platform: next })
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
  const adminUser = c.get('user')!
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
  const displayName = (displayNameRaw || adminNote || username).slice(0, 40)
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
  const adminUser = c.get('user')!
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
  const adminUser = c.get('user')!
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
  const adminUser = c.get('user')!
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
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || '80') || 80))
  const res = await c.env.DB.prepare(
    `SELECT l.*, u.username, u.admin_note AS user_admin_note
     FROM credit_ledger l
     LEFT JOIN users u ON u.id = l.user_id
     ORDER BY l.created_at DESC
     LIMIT ?`
  )
    .bind(limit)
    .all<any>()

  c.header('Cache-Control', 'no-store')
  return c.json({ items: (res.results || []).map(mapLedgerRow) })
})

adminRoutes.get('/redeem-codes', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT * FROM redeem_codes ORDER BY created_at DESC LIMIT 200`
  ).all<any>()

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
  })
})

adminRoutes.post('/redeem-codes', async (c) => {
  const adminUser = c.get('user')!
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

  const expiresDays =
    body.expiresDays !== undefined && body.expiresDays !== null && body.expiresDays !== ''
      ? parseIntSafe(body.expiresDays, 1, 3650)
      : null
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

adminRoutes.get('/generations', async (c) => {
  await reapStaleProcessingJobs(c.env.DB)
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const status = (c.req.query('status') || '').trim()
  const provider = (c.req.query('provider') || '').trim()
  const q = (c.req.query('q') || '').trim().toLowerCase()

  const clauses: string[] = []
  const bindings: unknown[] = []
  if (status && ['processing', 'succeeded', 'failed'].includes(status)) {
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
      `(LOWER(COALESCE(u.username, '')) LIKE ? OR LOWER(j.prompt) LIKE ? OR LOWER(j.model) LIKE ? OR LOWER(COALESCE(j.channel_name, '')) LIKE ? OR LOWER(COALESCE(j.supplier_name, '')) LIKE ? OR LOWER(COALESCE(j.error_message, '')) LIKE ?)`
    )
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const res = await c.env.DB.prepare(
    `SELECT j.*, u.username
     FROM generation_jobs j
     LEFT JOIN users u ON u.id = j.user_id
     ${where}
     ORDER BY j.created_at DESC
     LIMIT ?`
  )
    .bind(...bindings, limit)
    .all<JobRow>()

  c.header('Cache-Control', 'no-store')
  return c.json({ items: (res.results || []).map((row) => mapJobRow(row, { isAdmin: true })) })
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

  c.header('Cache-Control', 'no-store')
  return c.json({ job: mapJobRow(row, { isAdmin: true }) })
})
