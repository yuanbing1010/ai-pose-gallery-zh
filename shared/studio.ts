export type ImageProviderId = 'gemini' | 'gpt' | 'grok' | 'muse' | 'seedream'
export type ImagePassMode = 'url' | 'base64'
export type UserRole = 'user' | 'admin'
export type UserStatus = 'active' | 'disabled'
export type CreditLedgerType =
  | 'register_bonus'
  | 'redeem_code'
  | 'admin_adjust'
  | 'generate_deduct'
  | 'generate_refund'
export type GenerationStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'

export interface PoseItem {
  source?: 'upload' | 'mio'
  useDepth?: boolean
  r2Key?: string
  来源?: string
  来源地址?: string
  原帖地址?: string
  描述?: string
  标签?: string[]
  关键词?: string
  id: string
  体系: string
  姿势编号: string
  分类: string
  姿势名称: string
  角度: string
  缩略图: string
  原图: string
  检索: string
}

export interface PoseGroup {
  key: string
  system: string
  number: string
  name: string
  category: string
  items: PoseItem[]
  angles: Record<string, PoseItem>
  order: PoseItem[]
}

export interface CostumeView {
  id: string
  label: string
  缩略图: string
  预览图: string
  原图: string
}

export interface CostumeItem {
  source?: 'upload' | 'charadb' | 'gia-anime' | 'shisei' | 'mio' | 'outfit-db'
  r2Key?: string
  views?: CostumeView[]
  selectedView?: string
  一级分类?: '现实' | '二次元'
  来源?: string
  来源地址?: string
  原帖地址?: string
  描述?: string
  日文名称?: string
  敏感?: boolean
  id: string
  分类: string
  服装名称: string
  标签: string[]
  关键词: string
  缩略图: string
  预览图: string
  原图: string
  检索: string
}

export interface PortraitItem {
  source?: 'upload'
  r2Key?: string
  id: string
  分区: string
  发长: string
  发型名称: string
  标题: string
  宽: number
  高: number
  字节数: number
  精选: boolean
  热门: boolean
  缩略图: string
  原图: string
  检索: string
}

export interface ExtraReferenceImage {
  id: string
  name: string
  url: string
  r2Key?: string
}

export interface RecipeState {
  portrait: PortraitItem | null
  costume: CostumeItem | null
  pose: PoseItem | null
  extraImages?: ExtraReferenceImage[]
}

export interface WaveSpeedChannelOptions {
  /** 同步优先模式（enable_sync_mode）：单次请求最多等待约 105s，未完成时自动降级为异步轮询 */
  wavespeedSyncMode?: boolean
  /** 输出图片格式偏好（auto 时自动匹配各模型支持的输出格式） */
  wavespeedOutputFormat?: 'auto' | 'png' | 'jpeg' | 'webp'
  /** 随机种子（-1 或留空表示随机） */
  wavespeedSeed?: number
  /** 分辨率档位策略（auto 跟随前端自选并在未选时默认 1.5K；也可固定为 1k / 1.5k / 2k） */
  wavespeedResolution?: 'auto' | '1k' | '1.5k' | '2k'
  /** 参考图传输模式：stitched_single 仅传 1 张左中右拼合图（默认，省钱且支持单图模型）；multi 多图模型传独立原图 */
  wavespeedRefMode?: 'stitched_single' | 'multi'
}

export interface DreaminaChannelOptions {
  /** Dreamina 参考图传输模式：multi 传独立多参考图（默认，最多 6 张）；stitched_single 仅传 1 张左中右拼合图 */
  dreaminaRefMode?: 'multi' | 'stitched_single'
  /** Dreamina 取图清晰度：original 走 /v1/download 取全分辨率原图（默认推荐）；preview 走 /v1/proxy 快速取预览图 */
  dreaminaOutputQuality?: 'original' | 'preview'
}

export interface GptParams extends WaveSpeedChannelOptions, DreaminaChannelOptions {
  endpointMode: 'images_edits_json' | 'images_edits' | 'responses' | 'chat' | 'wavespeed' | 'dreamina'
  size: 'auto' | '1024x1536' | '1024x1024' | '1536x1024'
  quality: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  complexity?: 'auto' | 'low' | 'medium' | 'high'
  inputFidelity: 'high' | 'low'
  background: 'auto' | 'opaque' | 'transparent'
  outputFormat: 'png' | 'jpeg' | 'webp'
  moderation: 'auto' | 'low'
}

export interface GeminiParams extends WaveSpeedChannelOptions, DreaminaChannelOptions {
  endpointMode: 'native' | 'openai_chat' | 'openai_edits_json' | 'openai_edits' | 'wavespeed' | 'dreamina'
  authMode?: 'auto' | 'bearer' | 'goog_key' | 'both'
  aspectRatio: '3:4' | '1:1' | '4:3' | '9:16' | '16:9' | 'auto'
  imageSize: '1K' | '2K'
}

export interface GrokParams extends WaveSpeedChannelOptions, DreaminaChannelOptions {
  endpointMode: 'xai_edits' | 'openai_edits_json' | 'openai_edits' | 'openai_chat' | 'wavespeed' | 'dreamina'
  aspectRatio: '3:4' | '1:1' | '4:3' | '9:16' | '16:9' | 'auto'
  resolution: '1k' | '2k'
  quality: 'auto' | 'low' | 'medium'
  responseFormat: 'b64_json' | 'url'
}

export interface MuseParams extends WaveSpeedChannelOptions, DreaminaChannelOptions {
  endpointMode: 'muse_tasks' | 'openai_generations' | 'openai_edits_json' | 'openai_edits' | 'wavespeed' | 'dreamina'
  aspectRatio: '3:4' | '1:1' | '4:3' | '9:16' | '16:9' | 'auto'
  responseFormat: 'b64_json' | 'url'
}

export interface SeedreamParams extends WaveSpeedChannelOptions, DreaminaChannelOptions {
  endpointMode: 'wavespeed' | 'dreamina' | 'openai_edits_json' | 'openai_edits' | 'openai_generations'
  aspectRatio: '3:4' | '1:1' | '4:3' | '9:16' | '16:9' | 'auto'
  resolution: '1k' | '1.5k' | '2k'
  responseFormat: 'b64_json' | 'url'
}

export type ProviderParamsMap = {
  gemini: GeminiParams
  gpt: GptParams
  grok: GrokParams
  muse: MuseParams
  seedream: SeedreamParams
}

export interface ProviderModelOption {
  value: string
  label: string
}

/** WaveSpeed API v3 精简模型目录（可在 GPT / Grok / Gemini 任一槽位下选用） */
export const WAVESPEED_MODEL_OPTIONS: ProviderModelOption[] = [
  {
    value: 'bytedance/seedream-v5.5/edit',
    label: 'ByteDance Seedream 5.5 Edit（即梦 5.5 · 多图/拼图旗舰）',
  },
  {
    value: 'minimax/image-01/image-to-image',
    label: 'MiniMax Image-01 I2I（单图/拼图图生图）',
  },
]

/** Dreamina 浏览器桥 (scripts/dreamina-bridge) 模型目录（独立于 Muse，可在任意画师槽位下与 WaveSpeed 混配） */
export const DREAMINA_MODEL_OPTIONS: ProviderModelOption[] = [
  {
    value: 'seedream-5.0-flash',
    label: 'Seedream 5.0 Flash（网页默认主力 · 速度与质量均衡）',
  },
  {
    value: 'seedream-5.0-pro',
    label: 'Seedream 5.0 Pro（高精旗舰 · 需页面同步切换）',
  },
  {
    value: 'seedream-5.5',
    label: 'Seedream 5.5（若账号页面已开放 5.5 可选）',
  },
]

/** 判断供应商地址是否属于自建 Dreamina Workers 服务 */
export function isDreaminaBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    return host.includes('dreamina')
  } catch {
    return /dreamina/i.test(trimmed)
  }
}

/** 判断供应商地址是否属于 WaveSpeed API v3 接口 */
export function isWaveSpeedBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    return host === 'api.wavespeed.ai' || host.endsWith('.wavespeed.ai') || /\/api\/v3(?:\/|$)/.test(path)
  } catch {
    return /wavespeed\.ai|\/api\/v3(?:\/|$)/i.test(trimmed)
  }
}

/** 若供应商 Base URL 中直接带有 /api/v3/{model_id} 后缀，提取出对应的模型 ID */
export function extractWaveSpeedModelFromUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  const match = trimmed.match(/\/api\/v3\/(.+)$/i)
  if (!match) return null
  const rest = match[1].replace(/^\/+|\/+$/g, '')
  if (!rest) return null
  if (/^(?:predictions|media|models|balance)(?:\/|$)/i.test(rest)) return null
  return rest
}

/** 根据厂商槽位与接口协议返回管理端可选的模型列表 */
export function getChannelModelOptions(
  providerId: ImageProviderId,
  endpointMode?: string
): ProviderModelOption[] {
  if (endpointMode === 'wavespeed') {
    return [
      ...WAVESPEED_MODEL_OPTIONS,
      { value: 'custom', label: '自定义模型 ID' },
    ]
  }
  if (endpointMode === 'dreamina') {
    return [
      ...DREAMINA_MODEL_OPTIONS,
      { value: 'custom', label: '自定义模型 ID' },
    ]
  }
  return PROVIDER_META[providerId].models
}

/** 判断 WaveSpeed 模型是否仅接受单张输入图（需在多参考图时强制使用拼合图） */
export function isWaveSpeedSingleImageModel(modelId: string): boolean {
  const lower = modelId.trim().toLowerCase()
  return (
    lower === 'minimax/image-01/image-to-image' ||
    /kontext|image-to-image|grok-imagine-image\/edit/.test(lower)
  )
}

/** 判断指定渠道在当前参考图数量下是否应采用“单张左中右拼合参考图”模式 */
export function isChannelStitchedSingleMode(
  channel: { model: string; paramsJson?: string; params?: Record<string, unknown> },
  refCount = 2
): boolean {
  if (refCount < 2) return false
  let params: Record<string, unknown> = {}
  if (channel.params && typeof channel.params === 'object') {
    params = channel.params
  } else if (typeof channel.paramsJson === 'string' && channel.paramsJson.trim()) {
    try {
      const parsed = JSON.parse(channel.paramsJson)
      if (parsed && typeof parsed === 'object') {
        params = parsed as Record<string, unknown>
      }
    } catch {
      params = {}
    }
  }
  if (params.endpointMode === 'dreamina') {
    return (params.dreaminaRefMode as string | undefined) === 'stitched_single'
  }
  if (params.endpointMode !== 'wavespeed') return false
  if (isWaveSpeedSingleImageModel(channel.model)) return true
  return (params.wavespeedRefMode as string | undefined) !== 'multi'
}

/** 判断渠道是否属于各画师自家协议渠道（非 WaveSpeed / Dreamina 跨槽位通用协议） */
export function isNativeArtistChannel(channel: {
  paramsJson?: string
  params?: Record<string, unknown>
}): boolean {
  let params: Record<string, unknown> = {}
  if (channel.params && typeof channel.params === 'object') {
    params = channel.params
  } else if (typeof channel.paramsJson === 'string' && channel.paramsJson.trim()) {
    try {
      const parsed = JSON.parse(channel.paramsJson)
      if (parsed && typeof parsed === 'object') {
        params = parsed as Record<string, unknown>
      }
    } catch {
      params = {}
    }
  }
  return params.endpointMode !== 'wavespeed' && params.endpointMode !== 'dreamina'
}

export const PROVIDER_ORDER: ImageProviderId[] = ['gpt', 'grok', 'gemini', 'muse', 'seedream']

export const PROVIDER_META: Record<
  ImageProviderId,
  {
    id: ImageProviderId
    name: string
    shortName: string
    defaultBaseUrl: string
    docUrl: string
    models: ProviderModelOption[]
  }
> = {
  gpt: {
    id: 'gpt',
    name: 'OpenAI GPT Image',
    shortName: 'GPT',
    defaultBaseUrl: 'https://api.openai.com/v1',
    docUrl: 'https://developers.openai.com/api/docs/guides/image-generation',
    models: [
      { value: 'gpt-image-2.6-sunburst', label: 'gpt-image-2.6-sunburst（画得稳 · 精细旗舰）' },
      { value: 'gpt-image-2.6-flare', label: 'gpt-image-2.6-flare（画得快 · 高速出图）' },
      { value: 'gpt-image-2.5-sunburst', label: 'gpt-image-2.5-sunburst（画得稳）' },
      { value: 'gpt-image-2.5-flare', label: 'gpt-image-2.5-flare（画得快）' },
      { value: 'gpt-image-2', label: 'gpt-image-2' },
      { value: 'gpt-image-1.5', label: 'gpt-image-1.5' },
      { value: 'chatgpt-image-latest', label: 'chatgpt-image-latest' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  grok: {
    id: 'grok',
    name: 'xAI Grok Imagine',
    shortName: 'Grok',
    defaultBaseUrl: 'https://api.x.ai/v1',
    docUrl: 'https://docs.x.ai/developers/model-capabilities/images/editing',
    models: [
      { value: 'grok-imagine-image-2.0', label: 'grok-imagine-image-2.0（张力强 · 支持5图）' },
      { value: 'grok-imagine-image-quality', label: 'grok-imagine-image-quality（精绘质感版）' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    docUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    models: [
      { value: 'gemini-nano-banana-2.1', label: 'gemini-nano-banana-2.1（最新主力 · 理解准）' },
      { value: 'gemini-3.1-flash-image', label: 'gemini-3.1-flash-image（画得快 · 均衡版）' },
      { value: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview（预览版）' },
      { value: 'gemini-3.1-flash-lite-image', label: 'gemini-3.1-flash-lite-image（超快轻量版）' },
      { value: 'gemini-3-pro-image', label: 'gemini-3-pro-image（细节足 · 精绘版）' },
      { value: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview（精细预览版）' },
      { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image（轻量经典版）' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  muse: {
    id: 'muse',
    name: 'Muse Image',
    shortName: 'Muse',
    defaultBaseUrl: 'https://muse.geminirun.com/v1',
    docUrl: 'https://muse.ai/',
    models: [
      { value: 'muse-image', label: 'muse-image（织梦主绘 · 支持多图参考）' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  seedream: {
    id: 'seedream',
    name: 'ByteDance Seedream',
    shortName: '即梦',
    defaultBaseUrl: 'https://api.wavespeed.ai',
    docUrl: 'https://jimeng.jianying.com/',
    models: [
      { value: 'bytedance/seedream-v5.5/edit', label: 'ByteDance Seedream 5.5 Edit（即梦 5.5 · 多图/拼图旗舰）' },
      { value: 'seedream-5.0-flash', label: 'Seedream 5.0 Flash（网页默认主力 · 速度与质量均衡）' },
      { value: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro（高精旗舰）' },
      { value: 'seedream-5.5', label: 'Seedream 5.5（网页 5.5 版）' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
}

export const DEFAULT_PROVIDER_PARAMS: ProviderParamsMap = {
  gpt: {
    endpointMode: 'images_edits_json',
    size: '1024x1536',
    quality: 'high',
    complexity: 'auto',
    inputFidelity: 'high',
    background: 'auto',
    outputFormat: 'png',
    moderation: 'auto',
  },
  grok: {
    endpointMode: 'xai_edits',
    aspectRatio: '3:4',
    resolution: '2k',
    quality: 'medium',
    responseFormat: 'b64_json',
  },
  gemini: {
    endpointMode: 'native',
    authMode: 'auto',
    aspectRatio: '3:4',
    imageSize: '2K',
  },
  muse: {
    endpointMode: 'muse_tasks',
    aspectRatio: '3:4',
    responseFormat: 'b64_json',
  },
  seedream: {
    endpointMode: 'wavespeed',
    aspectRatio: '3:4',
    resolution: '2k',
    responseFormat: 'b64_json',
    wavespeedSyncMode: true,
    wavespeedOutputFormat: 'auto',
    wavespeedResolution: 'auto',
    wavespeedRefMode: 'multi',
    dreaminaRefMode: 'multi',
    dreaminaOutputQuality: 'original',
  },
}

export interface StudioArtistPersona {
  id: ImageProviderId
  name: string
  specialty: string
  bio: string
  accent: string
}

export const STUDIO_ARTISTS: StudioArtistPersona[] = [
  {
    id: 'gpt',
    name: '白匣造物主',
    specialty: '',
    bio: '',
    accent: '#19857B',
  },
  {
    id: 'grok',
    name: '星舰造像师',
    specialty: '',
    bio: '',
    accent: '#6366F1',
  },
  {
    id: 'gemini',
    name: '蕉糖幻想家',
    specialty: '',
    bio: '',
    accent: '#E5A918',
  },
  {
    id: 'muse',
    name: '缪斯织梦师',
    specialty: '',
    bio: '',
    accent: '#0064E0',
  },
  {
    id: 'seedream',
    name: '旋梦造境师',
    specialty: '',
    bio: '',
    accent: '#06B6D4',
  },
]

export function formatUserFacingGenerationError(
  rawMessage: string | null | undefined,
  _provider?: ImageProviderId,
  _profileName?: string | null
): string {
  const raw = (rawMessage || '').trim()
  if (!raw) {
    return '灵感星云暂时飘散了，积分已原路退还'
  }
  if (/429|rate.?limit|too many|busy|排期|繁忙|overload/i.test(raw)) {
    return 'AI小画家排队打盹中，积分已退还，换支画笔或稍后再试吧！'
  }
  if (/401|403|key|unauthorized|forbidden|尚未.*配置|暂未开放/i.test(raw)) {
    return 'AI小画家暂时开小差啦，积分已飞回口袋，换支画笔或换位AI小画家试试！'
  }
  if (/safety|prohibited|content_policy|moderation|blocked|policy|nsfw|sexual/i.test(raw)) {
    return '这条幻想被安全星环拦下啦，积分已退还，调整描述后再试试吧！'
  }
  if (/超时|timeout|network|fetch|internal error|502|503|504|500|连接|网络/i.test(raw)) {
    return '星际传画信号波动超时，积分已全额退还，请再试一次！'
  }
  if (/400|422|unsupported|does not support|invalid|格式|解析|未解析/i.test(raw)) {
    return '灵感调色盘不太对味，积分已退还，请换支画笔或调整参考图重试！'
  }
  return '灵感信号飘走啦，积分已全额退还，再试一次吧！'
}

export function getStudioArtist(id: ImageProviderId): StudioArtistPersona {
  return STUDIO_ARTISTS.find((a) => a.id === id) ?? STUDIO_ARTISTS[0]
}

export type StudioResolution = '1K' | '1.5K' | '2K'

export const STUDIO_RESOLUTION_ORDER: StudioResolution[] = ['1K', '1.5K', '2K']

export const PROVIDER_SUPPORTED_RESOLUTIONS: Record<ImageProviderId, StudioResolution[]> = {
  gpt: [],
  grok: ['1K', '2K'],
  gemini: ['1K', '2K'],
  muse: [],
  seedream: ['1K', '1.5K', '2K'],
}

export const STUDIO_RESOLUTION_META: Record<
  StudioResolution,
  { label: string; hint: string; description: string }
> = {
  '1K': { label: '1K', hint: '标准', description: '快速响应 · 构图试错与高性价比出图' },
  '1.5K': { label: '1.5K', hint: '清晰', description: '性价比优选 · 细节更清晰且成本接近 1K' },
  '2K': { label: '2K', hint: '高清', description: '均衡推荐 · 细节锐度与速度的最佳平衡' },
}

export function normalizeStudioResolution(raw: unknown): StudioResolution | null {
  if (typeof raw !== 'string') return null
  const upper = raw.trim().toUpperCase()
  if (upper === '1K' || upper === '1.5K' || upper === '2K') {
    return upper
  }
  if (upper === '4K') {
    return '2K'
  }
  return null
}

export interface ProfileResolutionOption {
  resolution: StudioResolution
  enabled: boolean
  creditCost: number
}

/**
 * 规范化模型档位的分辨率定价列表；对于不支持分辨率切换的厂商（如 GPT）返回空数组。
 */
export function normalizeProfileResolutions(
  providerId: ImageProviderId,
  raw: unknown,
  fallbackCreditCost = 10
): ProfileResolutionOption[] {
  const supported = PROVIDER_SUPPORTED_RESOLUTIONS[providerId]
  if (!supported || supported.length === 0) return []

  const safeFallback = Math.max(0, Math.floor(Number(fallbackCreditCost) || 0))
  const byRes = new Map<StudioResolution, ProfileResolutionOption>()

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const res = typeof rec.resolution === 'string' ? (rec.resolution.toUpperCase() as StudioResolution) : null
      if (!res || !supported.includes(res)) continue
      const enabled = typeof rec.enabled === 'boolean' ? rec.enabled : true
      const rawCost = Number(rec.creditCost)
      const creditCost = Number.isFinite(rawCost) && rawCost >= 0 ? Math.floor(rawCost) : safeFallback
      byRes.set(res, { resolution: res, enabled, creditCost })
    }
  }

  const normalized = supported.map((res) => {
    const found = byRes.get(res)
    if (found) return found
    const fallback =
      res === '1.5K' ? (byRes.get('1K')?.creditCost ?? safeFallback) : safeFallback
    return { resolution: res, enabled: true, creditCost: fallback }
  })

  // 至少保证有 1 个分辨率处于开启状态
  if (!normalized.some((item) => item.enabled)) {
    const defIdx = normalized.findIndex((item) => item.resolution === '2K')
    const targetIdx = defIdx >= 0 ? defIdx : 0
    normalized[targetIdx] = { ...normalized[targetIdx], enabled: true }
  }

  return normalized
}

export function resolveProfileDefaultResolution(
  providerId: ImageProviderId,
  preferred: unknown,
  resolutions: ProfileResolutionOption[]
): StudioResolution | null {
  const enabled = resolutions.filter((r) => r.enabled)
  if (enabled.length === 0) return null
  const upper = typeof preferred === 'string' ? (preferred.toUpperCase() as StudioResolution) : null
  if (upper && enabled.some((r) => r.resolution === upper)) {
    return upper
  }
  const preferred2K = enabled.find((r) => r.resolution === '2K')
  if (preferred2K) return preferred2K.resolution
  return enabled[0]?.resolution ?? (PROVIDER_SUPPORTED_RESOLUTIONS[providerId][0] ?? null)
}

export function getEffectiveProfileCreditCost(
  profile: {
    creditCost: number
    resolutions?: Array<{ resolution: StudioResolution; enabled?: boolean; creditCost: number }>
  },
  resolution?: StudioResolution | null
): number {
  const enabledList = (profile.resolutions || []).filter((r) => r.enabled !== false)
  if (enabledList.length === 0) return Math.max(0, Math.floor(profile.creditCost))
  if (resolution) {
    const matched = enabledList.find((r) => r.resolution === resolution)
    if (matched) return Math.max(0, Math.floor(matched.creditCost))
  }
  return Math.max(0, Math.floor(enabledList[0]?.creditCost ?? profile.creditCost))
}

export function getProfileCreditRange(profile: {
  creditCost: number
  resolutions?: Array<{ resolution: StudioResolution; enabled?: boolean; creditCost: number }>
}): { min: number; max: number } {
  const enabledList = (profile.resolutions || []).filter((r) => r.enabled !== false)
  if (enabledList.length === 0) {
    const v = Math.max(0, Math.floor(profile.creditCost))
    return { min: v, max: v }
  }
  const costs = enabledList.map((r) => Math.max(0, Math.floor(r.creditCost)))
  return { min: Math.min(...costs), max: Math.max(...costs) }
}

export type StudioAspectRatio = '3:4' | '1:1' | '4:3' | '9:16' | '16:9'
export type GenerationAspectRatio = StudioAspectRatio | 'auto'

export function formatAspectRatioLabel(ratio?: string | null): string {
  if (!ratio || ratio === 'auto') return '自动画幅'
  return ratio
}

export interface AspectRatioOption {
  id: StudioAspectRatio
  label: string
  hint: string
  description: string
  gptSize: GptParams['size']
}

export const STUDIO_ASPECT_RATIOS: AspectRatioOption[] = [
  {
    id: '3:4',
    label: '3:4',
    hint: '立绘竖版',
    description: '标准角色立绘与半身/全身展示黄金比例',
    gptSize: '1024x1536',
  },
  {
    id: '1:1',
    label: '1:1',
    hint: '方形头像',
    description: '对称构图 · 角色头像、资料卡与方图首选',
    gptSize: '1024x1024',
  },
  {
    id: '4:3',
    label: '4:3',
    hint: '画报横版',
    description: '经典画册杂志与双人互动横向构图比例',
    gptSize: '1536x1024',
  },
  {
    id: '9:16',
    label: '9:16',
    hint: '竖屏壁纸',
    description: '修长纵向视野 · 手机壁纸与全身动态海报',
    gptSize: '1024x1536',
  },
  {
    id: '16:9',
    label: '16:9',
    hint: '宽屏剧照',
    description: '电影宽银幕视角 · 适合带环境叙事的场面',
    gptSize: '1536x1024',
  },
]

export function buildAspectRatioPatches(ratio: GenerationAspectRatio): {
  gemini: Partial<GeminiParams>
  gpt: Partial<GptParams>
  grok: Partial<GrokParams>
  muse: Partial<MuseParams>
  seedream: Partial<SeedreamParams>
} {
  if (ratio === 'auto') {
    return {
      gemini: { aspectRatio: 'auto' },
      gpt: { size: 'auto' },
      grok: { aspectRatio: 'auto' },
      muse: { aspectRatio: 'auto' },
      seedream: { aspectRatio: 'auto' },
    }
  }
  const opt = STUDIO_ASPECT_RATIOS.find((r) => r.id === ratio) ?? STUDIO_ASPECT_RATIOS[0]
  return {
    gemini: { aspectRatio: opt.id },
    gpt: { size: opt.gptSize },
    grok: { aspectRatio: opt.id },
    muse: { aspectRatio: opt.id },
    seedream: { aspectRatio: opt.id },
  }
}

const ESTIMATED_PIXELS_1K: Record<StudioAspectRatio, [number, number]> = {
  '1:1': [1024, 1024],
  '3:4': [768, 1024],
  '4:3': [1024, 768],
  '9:16': [576, 1024],
  '16:9': [1024, 576],
}

const ESTIMATED_PIXELS_1536: Record<StudioAspectRatio, [number, number]> = {
  '1:1': [1536, 1536],
  '3:4': [1152, 1536],
  '4:3': [1536, 1152],
  '9:16': [864, 1536],
  '16:9': [1536, 864],
}

const ESTIMATED_PIXELS_2K: Record<StudioAspectRatio, [number, number]> = {
  '1:1': [2048, 2048],
  '3:4': [1536, 2048],
  '4:3': [2048, 1536],
  '9:16': [1152, 2048],
  '16:9': [2048, 1152],
}

/** 估算当前画师、画幅比例与分辨率档位对应的输出像素尺寸 */
export function getEstimatedOutputDimensions(
  providerId: ImageProviderId,
  ratio: GenerationAspectRatio,
  resolution?: StudioResolution | null
): { width: number; height: number; label: string } {
  if (ratio === 'auto') {
    return { width: 0, height: 0, label: '自动尺寸' }
  }
  if (providerId === 'gpt') {
    const opt = STUDIO_ASPECT_RATIOS.find((r) => r.id === ratio) ?? STUDIO_ASPECT_RATIOS[0]
    const [w, h] = opt.gptSize.split('x').map((n) => Number(n) || 1024)
    return { width: w, height: h, label: `${w}×${h}` }
  }
  const tier =
    resolution ??
    (providerId === 'seedream' ? '2K' : providerId === 'gemini' || providerId === 'grok' ? '2K' : '1.5K')
  const table =
    tier === '1K'
      ? ESTIMATED_PIXELS_1K
      : tier === '1.5K'
        ? ESTIMATED_PIXELS_1536
        : ESTIMATED_PIXELS_2K
  const [width, height] = table[ratio] ?? table['3:4']
  return { width, height, label: `${width}×${height}` }
}

export const NONE_STYLE_PRESET = {
  id: 'none',
  label: '无预设画风',
  prompt: '',
} as const

export interface StyleCategoryItem {
  id: string
  label: string
}

export interface StyleSubcategoryItem {
  id: string
  categoryId: string
  label: string
}

export type StylePoseMode = 'strict' | 'adaptive'

export interface StylePresetItem {
  id: string
  categoryId: string
  subcategoryId: string
  label: string
  shortLabel?: string
  tagline?: string
  poseMode?: StylePoseMode
  prompt: string
  negativePrompt?: string
  previewUrl?: string
}

export function isAdaptivePoseStyle(style?: Pick<StylePresetItem, 'poseMode'> | null): boolean {
  return style?.poseMode === 'adaptive'
}

export interface StyleTaxonomyRef {
  styleCategories?: StyleCategoryItem[]
  styleSubcategories?: StyleSubcategoryItem[]
  stylePresets?: StylePresetItem[]
}

export function getEffectiveStyleCategories(platform?: StyleTaxonomyRef | null): StyleCategoryItem[] {
  return Array.isArray(platform?.styleCategories) ? platform.styleCategories : []
}

export function getEffectiveStyleSubcategories(
  platform?: StyleTaxonomyRef | null,
  categoryId?: string
): StyleSubcategoryItem[] {
  const categories = getEffectiveStyleCategories(platform)
  const validCategoryIds = new Set(categories.map((c) => c.id))
  const rawList = Array.isArray(platform?.styleSubcategories) ? platform.styleSubcategories : []
  const validList = rawList.filter((sub) => validCategoryIds.has(sub.categoryId))
  return categoryId ? validList.filter((sub) => sub.categoryId === categoryId) : validList
}

export function normalizeStylePresetTaxonomy(
  item: Partial<StylePresetItem> & { id: string; label: string; prompt: string },
  categories: StyleCategoryItem[],
  subcategories: StyleSubcategoryItem[]
): StylePresetItem {
  const subById = new Map(subcategories.map((s) => [s.id, s]))
  const catById = new Map(categories.map((c) => [c.id, c]))

  const directSub = item.subcategoryId ? subById.get(item.subcategoryId) : undefined
  const catFirstSub =
    item.categoryId && catById.has(item.categoryId)
      ? subcategories.find((s) => s.categoryId === item.categoryId)
      : undefined
  const resolvedSub = directSub ?? catFirstSub ?? subcategories[0]

  const categoryId =
    resolvedSub?.categoryId ??
    (item.categoryId && catById.has(item.categoryId) ? item.categoryId : undefined) ??
    categories[0]?.id ??
    ''
  const subcategoryId = resolvedSub?.id ?? ''

  return {
    id: item.id,
    categoryId,
    subcategoryId,
    label: item.label,
    ...(item.shortLabel ? { shortLabel: item.shortLabel } : {}),
    ...(item.tagline ? { tagline: item.tagline } : {}),
    ...(item.poseMode === 'adaptive' ? { poseMode: 'adaptive' as const } : {}),
    prompt: item.prompt,
    ...(item.negativePrompt ? { negativePrompt: item.negativePrompt } : {}),
    ...(item.previewUrl ? { previewUrl: item.previewUrl } : {}),
  }
}

export function getEffectiveStyleCatalog(platform?: StyleTaxonomyRef | null): StylePresetItem[] {
  if (!Array.isArray(platform?.stylePresets)) return []
  const categories = getEffectiveStyleCategories(platform)
  const subcategories = getEffectiveStyleSubcategories(platform)
  return platform.stylePresets.map((item) =>
    normalizeStylePresetTaxonomy(item, categories, subcategories)
  )
}

export function resolveStyleInfo(
  stylePreset: string,
  platform?: StyleTaxonomyRef | null
): {
  id: string
  categoryId?: string
  categoryLabel?: string
  subcategoryId?: string
  subcategoryLabel?: string
  label: string
  shortLabel?: string
  tagline?: string
  poseMode?: StylePoseMode
  prompt: string
  negativePrompt?: string
  previewUrl?: string
} {
  if (stylePreset === 'none') {
    return {
      id: 'none',
      label: NONE_STYLE_PRESET.label,
      prompt: '',
      negativePrompt: '',
    }
  }
  const categories = getEffectiveStyleCategories(platform)
  const subcategories = getEffectiveStyleSubcategories(platform)
  const catMap = new Map(categories.map((c) => [c.id, c.label]))
  const subMap = new Map(subcategories.map((s) => [s.id, s.label]))
  const catalog = getEffectiveStyleCatalog(platform)
  const found = catalog.find((s) => s.id === stylePreset)
  if (found) {
    return {
      ...found,
      categoryLabel: catMap.get(found.categoryId) || '',
      subcategoryLabel: subMap.get(found.subcategoryId) || '',
      prompt: found.prompt.trim(),
      negativePrompt: found.negativePrompt?.trim() || '',
    }
  }
  return {
    id: 'none',
    label: NONE_STYLE_PRESET.label,
    prompt: '',
    negativePrompt: '',
  }
}

export function resolveStylePrompt(
  stylePreset: string,
  stylePresets?: StylePresetItem[],
  styleCategories?: StyleCategoryItem[],
  styleSubcategories?: StyleSubcategoryItem[]
): string {
  return resolveStyleInfo(stylePreset, {
    stylePresets,
    styleCategories,
    styleSubcategories,
  }).prompt
}

export function mergeNegativePrompts(
  globalNegative?: string,
  styleNegative?: string
): string {
  const parts: string[] = []
  for (const raw of [globalNegative, styleNegative]) {
    const cleaned = (raw || '').trim()
    if (cleaned && !parts.includes(cleaned)) {
      parts.push(cleaned)
    }
  }
  return parts.join('，')
}

export function mergeSceneNote(basePrompt: string, sceneNote: string): string {
  const note = sceneNote.trim()
  if (!note) return basePrompt
  return `${basePrompt}\n补充：${note}`
}

function ensureSentenceEnd(text: string): string {
  const cleaned = text.replace(/\r\n?/g, '\n').trim().replace(/[，,、]+$/, '')
  if (!cleaned) return ''
  return /[。！？；.!?;]$/.test(cleaned) ? cleaned : `${cleaned}。`
}

function joinChineseClauses(parts: string[], conj = '或'): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]}${conj}${parts[1]}`
  return `${parts.slice(0, -1).join('、')}${conj}${parts[parts.length - 1]}`
}

export type PromptConstraintCondition =
  | 'always'
  | 'has_pose'
  | 'has_pose_strict'
  | 'has_pose_adaptive'
  | 'has_pose_and_others'
  | 'has_portrait'
  | 'no_portrait'
  | 'has_costume'
  | 'has_extra'

export interface PromptConstraintItem {
  id: string
  condition: PromptConstraintCondition
  text: string
  enabled: boolean
}

export const PROMPT_CONSTRAINT_CONDITION_OPTIONS: Array<{
  value: PromptConstraintCondition
  label: string
}> = [
  { value: 'always', label: '始终生效（全部场景）' },
  { value: 'has_pose', label: '有姿势图时' },
  { value: 'has_pose_strict', label: '有姿势图时（严格锁姿势）' },
  { value: 'has_pose_adaptive', label: '有姿势图时（开启姿势适配）' },
  { value: 'has_pose_and_others', label: '有姿势图且含其他参考图时' },
  { value: 'has_portrait', label: '有人像图时' },
  { value: 'no_portrait', label: '无人像图时' },
  { value: 'has_costume', label: '有服装图时' },
  { value: 'has_extra', label: '有附加参考图时' },
]

const VALID_CONSTRAINT_CONDITIONS = new Set<PromptConstraintCondition>(
  PROMPT_CONSTRAINT_CONDITION_OPTIONS.map((opt) => opt.value)
)

const LEGACY_CONSTRAINT_CONDITION_MAP: Record<string, PromptConstraintCondition> = {
  has_pose_and_others_strict: 'has_pose_and_others',
  has_pose_and_others_adaptive: 'has_pose_and_others',
  pose_only: 'has_pose',
  pose_only_strict: 'has_pose_strict',
  pose_only_adaptive: 'has_pose_adaptive',
}

export const DEFAULT_PROMPT_CONSTRAINTS: PromptConstraintItem[] = [
  {
    id: 'c_no_text',
    condition: 'always',
    text: '画面中没有任何文字、标志或水印。',
    enabled: true,
  },
  {
    id: 'c_single_canvas',
    condition: 'always',
    text: '整张图仅为一个单一连续完整画面，严禁分屏、拼贴或同人重复出现。',
    enabled: true,
  },
  {
    id: 'c_anatomy',
    condition: 'always',
    text: '人物有且仅有左、右两条手臂、双手与左、右两条腿（共两条腿，绝不额外生出第三条腿或多余手臂），保持正常成年人头身与上下肢长度比例、肤色均匀及自然透视（构图偏窄时允许肢体末梢自然出画而非压短双腿）。',
    enabled: true,
  },
  {
    id: 'c_pose_count',
    condition: 'has_pose',
    text: '人物数量严格以{{姿势图}}为准，严禁擅自增减人物。',
    enabled: true,
  },
  {
    id: 'c_pose_ignore_others',
    condition: 'has_pose_and_others',
    text: '仅借鉴{{姿势图}}的动作骨架与四肢比例（不保留白模、线稿质感或边缘编号/残影），严格忽略{{非姿势图}}中的原有动作、站位、膝腿弯曲姿态或垂坠袜腿轮廓。',
    enabled: true,
  },
]

export interface PromptTemplateConfig {
  intro: string
  poseClause: string
  costumeClause: string
  portraitClause: string
  portraitOwnOutfitClause: string
  facelessClause: string
  defaultPersonClause: string
  extraClause: string
  adaptiveCostumeClause: string
  adaptivePortraitClause: string
  adaptiveStyleSuffix: string
  adaptivePoseClause: string
  adaptiveNoPoseRecompositionClause: string
  adaptivePoseStyleSuffix: string
  constraints: PromptConstraintItem[]
}

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplateConfig = {
  intro:
    '请根据提供的 {{总数}} 张参考图（{{参考图序}}），生成单幅连续场景的人物{{媒介}}：',
  poseClause:
    '严格按照{{姿势图}}的头部朝向、身体动作、头身与四肢长度比例（尤其双腿各自的伸直或屈膝角度及前后层次）、景别构图与镜头角度摆姿势。',
  costumeClause:
    '穿上{{服装图}}中的整套服装与配饰，配色、款式与面料细节以{{服装图}}为准。',
  portraitClause:
    '外貌、脸型五官、神态、发型发色与肤色严格以{{人像图}}为准。',
  portraitOwnOutfitClause:
    '沿用{{人像图}}中的原有服装穿搭。',
  facelessClause: '生成无五官展示人物，全身肤色自然统一。',
  defaultPersonClause: '生成五官清晰、肤色自然的单一人物。',
  extraClause: '{{附图列表}}，按标注或合理画面关系自然融入图像。',
  adaptiveCostumeClause:
    '参考{{服装图}}的配色与主要款式，细节可随当前风格自然调整。',
  adaptivePortraitClause:
    '参考{{人像图}}的发型发色与整体神韵，五官特征与肤色随当前风格自然适配调整。',
  adaptiveStyleSuffix:
    '尽量让人物的外貌与服饰适配当前整体风格。',
  adaptivePoseClause:
    '参考{{姿势图}}的躯干朝向、重心与整体姿态，但必须优先按当前画风调整机位与手臂动作：人物有且仅有左右两条手臂，当画风需要单臂配合拍摄或互动时，必须直接改用其中一条手臂执行（不得完整照搬参考图的双手对称姿势，仅可保留另一条空余手臂做单侧动作）。',
  adaptiveNoPoseRecompositionClause:
    '不沿用{{人像图}}原本的机位、景别与站姿，按当前画风自然重新构图与动作。',
  adaptivePoseStyleSuffix:
    '优先满足该画风特有的镜头机位、景别透视与自然交互（交互动作直接占用人物原有双臂之一）。',
  constraints: DEFAULT_PROMPT_CONSTRAINTS.map((c) => ({ ...c })),
}

export function createDefaultPromptTemplate(): PromptTemplateConfig {
  return {
    ...DEFAULT_PROMPT_TEMPLATE,
    constraints: DEFAULT_PROMPT_CONSTRAINTS.map((c) => ({ ...c })),
  }
}

export function mergePromptTemplate(
  raw?: Partial<PromptTemplateConfig> | Record<string, unknown> | null,
  options?: { preserveWhitespace?: boolean }
): PromptTemplateConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const preserveWhitespace = Boolean(options?.preserveWhitespace)

  const normalizeStr = (val: unknown): string | null =>
    typeof val === 'string'
      ? preserveWhitespace
        ? val.slice(0, 1500)
        : val.trim().slice(0, 1500)
      : null

  const pickString = (
    key: Exclude<keyof PromptTemplateConfig, 'constraints'>,
    legacyFallbacks: string[] = []
  ): string => {
    const direct = normalizeStr(src[key])
    if (direct !== null) return direct
    for (const fbKey of legacyFallbacks) {
      const fb = normalizeStr(src[fbKey])
      if (fb !== null) return fb
    }
    return DEFAULT_PROMPT_TEMPLATE[key]
  }

  let constraints: PromptConstraintItem[]
  if (Array.isArray(src.constraints)) {
    constraints = []
    const seenIds = new Set<string>()
    for (let i = 0; i < Math.min(src.constraints.length, 30); i++) {
      const item = src.constraints[i]
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const rawText = typeof rec.text === 'string' ? rec.text : ''
      const text = preserveWhitespace ? rawText.slice(0, 1500) : rawText.trim().slice(0, 1500)
      if (!preserveWhitespace && !text) continue
      const rawCondition = typeof rec.condition === 'string' ? rec.condition : 'always'
      const mappedCondition = LEGACY_CONSTRAINT_CONDITION_MAP[rawCondition] ?? rawCondition
      const condition: PromptConstraintCondition = VALID_CONSTRAINT_CONDITIONS.has(
        mappedCondition as PromptConstraintCondition
      )
        ? (mappedCondition as PromptConstraintCondition)
        : 'always'
      const enabled = typeof rec.enabled === 'boolean' ? rec.enabled : true
      const rawId =
        typeof rec.id === 'string' && rec.id.trim()
          ? rec.id.trim().slice(0, 64)
          : `c_${i + 1}`
      let id = rawId
      let suffix = 2
      while (seenIds.has(id)) {
        id = `${rawId}_${suffix++}`
      }
      seenIds.add(id)
      constraints.push({ id, condition, text, enabled })
    }
  } else {
    constraints = DEFAULT_PROMPT_CONSTRAINTS.map((c) => ({ ...c }))
  }

  return {
    intro: pickString('intro'),
    poseClause: pickString('poseClause'),
    costumeClause: pickString('costumeClause'),
    portraitClause: pickString('portraitClause', ['portraitFullClause']),
    portraitOwnOutfitClause: pickString('portraitOwnOutfitClause'),
    facelessClause: pickString('facelessClause'),
    defaultPersonClause: pickString('defaultPersonClause'),
    extraClause: pickString('extraClause'),
    adaptiveCostumeClause: pickString('adaptiveCostumeClause'),
    adaptivePortraitClause: pickString('adaptivePortraitClause', ['adaptivePortraitFullClause']),
    adaptiveStyleSuffix: pickString('adaptiveStyleSuffix'),
    adaptivePoseClause: pickString('adaptivePoseClause'),
    adaptiveNoPoseRecompositionClause: pickString('adaptiveNoPoseRecompositionClause'),
    adaptivePoseStyleSuffix: pickString('adaptivePoseStyleSuffix'),
    constraints,
  }
}

function matchesConstraintCondition(
  condition: PromptConstraintCondition,
  ctx: {
    hasPose: boolean
    hasCostume: boolean
    hasPortrait: boolean
    hasExtra: boolean
    hasOthersWithPose: boolean
    adaptivePose: boolean
  }
): boolean {
  switch (condition) {
    case 'always':
      return true
    case 'has_pose':
      return ctx.hasPose
    case 'has_pose_strict':
      return ctx.hasPose && !ctx.adaptivePose
    case 'has_pose_adaptive':
      return ctx.hasPose && ctx.adaptivePose
    case 'has_pose_and_others':
      return ctx.hasPose && ctx.hasOthersWithPose
    case 'has_portrait':
      return ctx.hasPortrait
    case 'no_portrait':
      return !ctx.hasPortrait
    case 'has_costume':
      return ctx.hasCostume
    case 'has_extra':
      return ctx.hasExtra
  }
}

function renderPromptVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? '').trim()
}

export interface CloudTermReplacement {
  from: string
  to: string
}

export interface PoseSanitizeConfig {
  enabled: boolean
  blockedTerms: string[]
  blockedPoseSystems: string[]
  blockedPoseCategoryKeywords: string[]
  replacements: CloudTermReplacement[]
}

export interface PoseSanitizeInspectResult {
  original: string
  sanitized: string
  action: 'unchanged' | 'modified' | 'silenced' | 'disabled'
  reason: string
  matchedSystem?: string
  matchedCategoryKeyword?: string
  matchedReplacements: CloudTermReplacement[]
  matchedTerms: string[]
}

// 屏蔽含有性暗示、敏感部位或露骨体位描述的词汇，防止仅参考文本就触发云端模型安全拦截
export const DEFAULT_CLOUD_BLOCKED_TERMS: string[] = [
  '挺胸',
  '后入',
  '正常位',
  '传教士',
  '骑乘',
  '女上位',
  '老汉推车',
  '观音坐莲',
  '口交',
  '口活',
  '深喉',
  '手淫',
  '自慰',
  '足交',
  '乳交',
  '胸推',
  '臀推',
  '性交',
  '做爱',
  '交合',
  '抽插',
  '内射',
  '潮吹',
  '高潮',
  '捆绑',
  '调教',
  '拘束',
  '情色',
  '色情',
  '成人向',
  '工口',
  '肉欲',
  '春宫',
  '猥亵',
  '缠绵',
  '淫',
  '顶胯',
  '沉胯',
  '压胯',
  '摆胯',
  '抬胯',
  '高抬胯',
  '胯部',
  '翘臀',
  '臀部',
  '美臀',
  '电臀',
  '丰臀',
  '揉胸',
  '挤胸',
  '捧胸',
  '托胸',
  '托起胸部',
  '抚胸',
  '摸胸',
  '抓胸',
  '捏胸',
  '袭胸',
  '置上胸',
  '胸下缘',
  '胸口视角',
  '胸伏',
  '胸贴地',
  '挺胸突出',
  '胸前沟壑',
  '乳沟',
  '沟壑',
  '事业线',
  '乳房',
  '双乳',
  '巨乳',
  '爆乳',
  '乳头',
  '乳晕',
  '私处',
  '阴部',
  '阴道',
  '阴茎',
  '下体',
  '股间',
  '大腿内侧',
  '双腿之间',
  '遮掩',
  '遮蔽',
  '自下托起',
  '胸下交叉托起',
  '另一手托起',
  '向内挤',
  '夹紧',
  '褪下肩带',
  '解挂钩',
  '解内衣',
  '内衣',
  '内裤',
  '丁字裤',
  '比基尼',
  '情趣',
  '走光',
  '露点',
  '春光',
  '全裸',
  '半裸',
  '裸体',
  '裸露',
  '赤裸',
  '裸',
  '沐浴',
  '入浴',
  'M字',
  '单M字',
  'V字开腿',
  'V字打开',
  '开腿',
  '开膝',
  '双膝打开',
  '大幅外开',
  '双膝微开',
  '外展打开',
  '大幅打开',
  '抱腿打开',
  '跨跪',
  '含于唇边',
  '坐于腰上',
  '坐于膝上',
  '蹲于膝上',
  '膝上',
  '床上',
  '邀约',
  '撒娇请求',
  '撩人',
  '诱惑',
  '挑逗',
  '魅惑',
  '性感',
  '大胆',
  '被按住',
  '俯身压上',
  '亲吻',
  '叠压',
  '缠腰',
  '缠绕',
  'doggy style',
  'doggystyle',
  'rear entry',
  'reverse cowgirl',
  'cowgirl',
  'missionary',
  'facesitting',
  'bondage',
  'bdsm',
  'nsfw',
  'hentai',
  'ecchi',
  'erotic',
  'porn',
  'nude',
  'naked',
  'cleavage',
  'grope',
  'fondle',
  'boob',
  'boobs',
  'tits',
  'nipple',
  'nipples',
  'breast',
  'breasts',
  'crotch',
  'pussy',
  'penis',
  'dick',
  'cock',
  'blowjob',
  'orgasm',
  'masturbate',
  'masturbating',
  'masturbation',
  'spread legs',
  'open legs',
  'upskirt',
  'lingerie',
  'sexy',
  'seductive',
  'sensual',
  'hip thrust',
  'twerk',
  'spank',
  'spanking',
  'sex',
  'sexual',
]

export const DEFAULT_CLOUD_BLOCKED_POSE_SYSTEMS: string[] = ['双人缠绵']

export const DEFAULT_CLOUD_BLOCKED_POSE_CATEGORY_KEYWORDS: string[] = [
  '后入',
  '骑乘',
  '传教士',
  '正常位',
  '贴脸',
]

export const DEFAULT_CLOUD_TERM_REPLACEMENTS: CloudTermReplacement[] = [
  { from: '前屈翘臀', to: '前屈' },
  { from: '手扶墙顶胯', to: '手扶墙' },
  { from: '双手前撑挤胸', to: '双手前撑' },
  { from: '双臂内夹合手', to: '双臂合于身前' },
]

export function createDefaultPoseSanitizeConfig(): PoseSanitizeConfig {
  return {
    enabled: true,
    blockedTerms: [...DEFAULT_CLOUD_BLOCKED_TERMS],
    blockedPoseSystems: [...DEFAULT_CLOUD_BLOCKED_POSE_SYSTEMS],
    blockedPoseCategoryKeywords: [...DEFAULT_CLOUD_BLOCKED_POSE_CATEGORY_KEYWORDS],
    replacements: DEFAULT_CLOUD_TERM_REPLACEMENTS.map((r) => ({ ...r })),
  }
}

function normalizeSanitizeStringList(
  raw: unknown,
  fallback: string[],
  maxItems: number,
  maxLen = 80
): string[] {
  if (!Array.isArray(raw)) return [...fallback]
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const clean = item.trim().slice(0, maxLen)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length >= maxItems) break
  }
  return out
}

function normalizeSanitizeReplacements(raw: unknown): CloudTermReplacement[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_CLOUD_TERM_REPLACEMENTS.map((r) => ({ ...r }))
  }
  const out: CloudTermReplacement[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const from = typeof rec.from === 'string' ? rec.from.trim().slice(0, 80) : ''
    if (!from) continue
    const key = from.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const to = typeof rec.to === 'string' ? rec.to.trim().slice(0, 80) : ''
    out.push({ from, to })
    if (out.length >= 200) break
  }
  return out
}

export function mergePoseSanitizeConfig(
  raw?: Partial<PoseSanitizeConfig> | Record<string, unknown> | null
): PoseSanitizeConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultPoseSanitizeConfig()
  }
  const src = raw as Record<string, unknown>
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
    blockedTerms: normalizeSanitizeStringList(src.blockedTerms, DEFAULT_CLOUD_BLOCKED_TERMS, 1000),
    blockedPoseSystems: normalizeSanitizeStringList(
      src.blockedPoseSystems,
      DEFAULT_CLOUD_BLOCKED_POSE_SYSTEMS,
      100
    ),
    blockedPoseCategoryKeywords: normalizeSanitizeStringList(
      src.blockedPoseCategoryKeywords,
      DEFAULT_CLOUD_BLOCKED_POSE_CATEGORY_KEYWORDS,
      100
    ),
    replacements: normalizeSanitizeReplacements(src.replacements),
  }
}

export function validatePoseSanitizeInput(raw: unknown): PoseSanitizeConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>
  if (src.enabled !== undefined && typeof src.enabled !== 'boolean') return null
  if (src.blockedTerms !== undefined && !Array.isArray(src.blockedTerms)) return null
  if (src.blockedPoseSystems !== undefined && !Array.isArray(src.blockedPoseSystems)) return null
  if (
    src.blockedPoseCategoryKeywords !== undefined &&
    !Array.isArray(src.blockedPoseCategoryKeywords)
  ) {
    return null
  }
  if (src.replacements !== undefined && !Array.isArray(src.replacements)) return null
  return mergePoseSanitizeConfig(src)
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSingleTermPattern(term: string): string {
  // 纯 ASCII 字母数字词组启用词边界，避免如 "sex" 误伤包含子串的普通英文词
  if (/^[a-z0-9](?:[a-z0-9\s_-]*[a-z0-9])?$/i.test(term)) {
    return `\\b${escapeRegExp(term).replace(/\s+/g, '\\s+')}\\b`
  }
  return escapeRegExp(term)
}

interface CompiledPoseSanitizeRuntime {
  config: PoseSanitizeConfig
  blockedTermsRe: RegExp | null
  replacementMatchers: Array<{ from: string; to: string; re: RegExp }>
  getTermMatchers: () => Array<{ term: string; re: RegExp }>
}

const sanitizeRuntimeCache = new Map<string, CompiledPoseSanitizeRuntime>()

function getCompiledPoseSanitizeRuntime(
  raw?: Partial<PoseSanitizeConfig> | null
): CompiledPoseSanitizeRuntime {
  const config = mergePoseSanitizeConfig(raw)
  const cacheKey = JSON.stringify(config)
  const cached = sanitizeRuntimeCache.get(cacheKey)
  if (cached) return cached

  const sortedTerms = [...config.blockedTerms].sort((a, b) => b.length - a.length)
  const patterns = sortedTerms.map(buildSingleTermPattern).filter(Boolean)
  const blockedTermsRe = patterns.length > 0 ? new RegExp(patterns.join('|'), 'i') : null

  const replacementMatchers = config.replacements
    .filter((r) => r.from)
    .map((r) => ({
      from: r.from,
      to: r.to,
      re: new RegExp(escapeRegExp(r.from), 'gi'),
    }))

  let lazyTermMatchers: Array<{ term: string; re: RegExp }> | null = null
  const runtime: CompiledPoseSanitizeRuntime = {
    config,
    blockedTermsRe,
    replacementMatchers,
    getTermMatchers: () => {
      if (!lazyTermMatchers) {
        lazyTermMatchers = config.blockedTerms.map((term) => ({
          term,
          re: new RegExp(buildSingleTermPattern(term), 'i'),
        }))
      }
      return lazyTermMatchers
    },
  }

  if (sanitizeRuntimeCache.size >= 12) {
    const firstKey = sanitizeRuntimeCache.keys().next().value
    if (firstKey !== undefined) sanitizeRuntimeCache.delete(firstKey)
  }
  sanitizeRuntimeCache.set(cacheKey, runtime)
  return runtime
}

function collectMatchedTerms(
  segment: string,
  runtime: CompiledPoseSanitizeRuntime,
  target: Set<string>
): void {
  for (const item of runtime.getTermMatchers()) {
    if (item.re.test(segment)) {
      target.add(item.term)
    }
  }
}

function evaluateCloudTextSanitize(
  raw: string | null | undefined,
  runtime: CompiledPoseSanitizeRuntime,
  collectDetails: boolean
): PoseSanitizeInspectResult {
  const original = raw ? String(raw).trim() : ''
  if (!original) {
    return {
      original: '',
      sanitized: '',
      action: 'unchanged',
      reason: '空名称',
      matchedReplacements: [],
      matchedTerms: [],
    }
  }
  if (!runtime.config.enabled) {
    return {
      original,
      sanitized: original,
      action: 'disabled',
      reason: '敏感词屏蔽已关闭（原样发送）',
      matchedReplacements: [],
      matchedTerms: [],
    }
  }

  let text = original
  const matchedReplacements: CloudTermReplacement[] = []
  for (const rep of runtime.replacementMatchers) {
    const next = text.replace(rep.re, rep.to)
    if (next !== text) {
      text = next
      if (collectDetails) {
        matchedReplacements.push({ from: rep.from, to: rep.to })
      }
    }
  }

  const matchedTermsSet = new Set<string>()
  const filterCleanSegments = (segText: string): string[] =>
    segText
      .split(/[・·]/)
      .map((s) => s.trim())
      .filter((s) => {
        if (!s) return false
        if (runtime.blockedTermsRe && runtime.blockedTermsRe.test(s)) {
          if (collectDetails) collectMatchedTerms(s, runtime, matchedTermsSet)
          return false
        }
        return true
      })

  const parenNotes: string[] = []
  text = text.replace(/[（(]([^）)]*)[）)]/g, (_, inner: string) => {
    const cleanInner = filterCleanSegments(inner)
    if (cleanInner.length > 0) parenNotes.push(cleanInner.join('・'))
    return ''
  })

  const plusParts = text
    .split('＋')
    .map((part) => filterCleanSegments(part).join('・'))
    .filter(Boolean)

  let out = plusParts.join('＋').replace(/[（()）]/g, '').trim()
  if (!out && parenNotes.length > 0) {
    out = parenNotes.join('・')
  } else if (out && parenNotes.length > 0) {
    out = `${out}（${parenNotes.join('・')}）`
  }
  out = out.replace(/^[・·＋\s]+|[・·＋\s]+$/g, '').trim()
  if (!out || (runtime.blockedTermsRe && runtime.blockedTermsRe.test(out))) {
    if (collectDetails && out && runtime.blockedTermsRe) {
      collectMatchedTerms(out, runtime, matchedTermsSet)
    }
    out = ''
  }

  const matchedTerms = Array.from(matchedTermsSet)
  let action: PoseSanitizeInspectResult['action'] = 'unchanged'
  let reason = '未命中敏感词，原样发送'
  if (!out) {
    action = 'silenced'
    reason =
      matchedTerms.length > 0
        ? `命中屏蔽词（${matchedTerms.join('、')}），整条静默仅发图`
        : '过滤后无剩余安全词段，整条静默仅发图'
  } else if (out !== original) {
    action = 'modified'
    const parts: string[] = []
    if (matchedReplacements.length > 0) {
      parts.push(
        `安全替换：${matchedReplacements.map((r) => `${r.from}→${r.to || '删除'}`).join('、')}`
      )
    }
    if (matchedTerms.length > 0) {
      parts.push(`剔除敏感词：${matchedTerms.join('、')}`)
    }
    reason = parts.join('；') || '已清洗格式并精简'
  }

  return {
    original,
    sanitized: out,
    action,
    reason,
    matchedReplacements,
    matchedTerms,
  }
}

/** 过滤发往云端提示词或云端拼图标签中的性暗示/敏感词汇，仅保留安全无害的体态描述 */
export function sanitizeCloudTextSegment(
  raw?: string | null,
  sanitizeConfig?: Partial<PoseSanitizeConfig> | null
): string {
  const runtime = getCompiledPoseSanitizeRuntime(sanitizeConfig)
  return evaluateCloudTextSanitize(raw, runtime, false).sanitized
}

function evaluatePoseTitleSanitize(
  pose: Pick<PoseItem, '体系' | '分类' | '姿势名称'> | string | null | undefined,
  sanitizeConfig: Partial<PoseSanitizeConfig> | null | undefined,
  collectDetails: boolean
): PoseSanitizeInspectResult {
  if (!pose) {
    return {
      original: '',
      sanitized: '',
      action: 'unchanged',
      reason: '未选择姿势',
      matchedReplacements: [],
      matchedTerms: [],
    }
  }
  const runtime = getCompiledPoseSanitizeRuntime(sanitizeConfig)
  if (typeof pose === 'string') {
    return evaluateCloudTextSanitize(pose, runtime, collectDetails)
  }

  const original = (pose.姿势名称 || '').trim()
  if (!runtime.config.enabled) {
    return {
      original,
      sanitized: original,
      action: 'disabled',
      reason: '敏感词屏蔽已关闭（原样发送）',
      matchedReplacements: [],
      matchedTerms: [],
    }
  }

  const sys = (pose.体系 || '').trim()
  const sysLower = sys.toLowerCase()
  const matchedSystem = runtime.config.blockedPoseSystems.find(
    (s) => s.toLowerCase() === sysLower
  )
  if (matchedSystem) {
    return {
      original,
      sanitized: '',
      action: 'silenced',
      reason: `命中整类静默体系「${matchedSystem}」`,
      matchedSystem,
      matchedReplacements: [],
      matchedTerms: [],
    }
  }

  const cat = (pose.分类 || '').trim()
  const catLower = cat.toLowerCase()
  const matchedCategoryKeyword = runtime.config.blockedPoseCategoryKeywords.find(
    (kw) => kw && catLower.includes(kw.toLowerCase())
  )
  if (matchedCategoryKeyword) {
    return {
      original,
      sanitized: '',
      action: 'silenced',
      reason: `命中整类静默分类关键词「${matchedCategoryKeyword}」`,
      matchedCategoryKeyword,
      matchedReplacements: [],
      matchedTerms: [],
    }
  }

  return evaluateCloudTextSanitize(pose.姿势名称, runtime, collectDetails)
}

/** 对姿势条目进行云端发图脱敏：命中整类静默体系/分类时完全省去文本标注，其余按敏感词规则剔除或替换 */
export function sanitizePoseTitleForCloud(
  pose?: Pick<PoseItem, '体系' | '分类' | '姿势名称'> | string | null,
  sanitizeConfig?: Partial<PoseSanitizeConfig> | null
): string {
  return evaluatePoseTitleSanitize(pose, sanitizeConfig, false).sanitized
}

/** 用于管理端实时检测和审计姿势脱敏结果 */
export function inspectPoseSanitizeForCloud(
  pose?: Pick<PoseItem, '体系' | '分类' | '姿势名称'> | string | null,
  sanitizeConfig?: Partial<PoseSanitizeConfig> | null
): PoseSanitizeInspectResult {
  return evaluatePoseTitleSanitize(pose, sanitizeConfig, true)
}

export interface StitchedPanelDescriptor {
  /** 从 1 起始的拼图面板编号 */
  index: number
  /** 零起始的原始参考槽位下标 */
  zeroIndex: number
  slot: 'pose' | 'costume' | 'portrait' | 'extra'
  /** 面板所在方位文案（如 左侧 / 中间 / 右侧 或 第1格） */
  positionLabel: string
  /** 面板角色名（姿势 / 服装 / 人像 / 附加） */
  roleLabel: string
  /** 画布顶栏展示标签（如 图1 · 左侧 · 姿势） */
  canvasTag: string
  /** 画布顶栏副标题（经脱敏或原始名称） */
  canvasSub: string
  /** 拼合单图模式下在提示词中对应的指代文本（如 图1(左侧姿势区)） */
  promptRef: string
  /** 在拼合图总览句中的描述片段（如 图1[左侧]为姿势参考） */
  summarySegment: string
  /** 原始图片地址或路径 */
  src: string
}

/** 生成三合一/多合一拼图的统一编号、方位顺序及画布/提示词映射 */
export function buildStitchedPanelLayout(
  recipe: RecipeState,
  options?: { sanitizeForCloud?: boolean; poseSanitize?: Partial<PoseSanitizeConfig> | null }
): StitchedPanelDescriptor[] {
  const sanitizeForCloud = Boolean(options?.sanitizeForCloud)
  const poseSanitize = options?.poseSanitize
  const hasSanitizeRules = Boolean(poseSanitize)

  const rawItems: Array<{
    slot: StitchedPanelDescriptor['slot']
    roleLabel: string
    canvasSub: string
    src: string
  }> = []

  if (recipe.pose) {
    const depthSuffix = recipe.pose.useDepth && hasPoseDepthMap(recipe.pose) ? ' · 深度图' : ''
    const poseName = sanitizeForCloud
      ? hasSanitizeRules
        ? sanitizePoseTitleForCloud(recipe.pose, poseSanitize) || '姿势参考'
        : '姿势参考'
      : recipe.pose.姿势名称
    rawItems.push({
      slot: 'pose',
      roleLabel: '姿势',
      canvasSub: sanitizeForCloud && !hasSanitizeRules
        ? `姿势参考${depthSuffix}`
        : `${poseName}（${recipe.pose.角度}${depthSuffix}）`,
      src: poseImagePath(recipe.pose),
    })
  }
  if (recipe.costume) {
    const cat = sanitizeForCloud
      ? hasSanitizeRules
        ? sanitizeCloudTextSegment(recipe.costume.分类, poseSanitize)
        : ''
      : recipe.costume.分类
    const name = sanitizeForCloud
      ? hasSanitizeRules
        ? sanitizeCloudTextSegment(recipe.costume.服装名称, poseSanitize) || '服装参考'
        : '服装参考'
      : recipe.costume.服装名称
    rawItems.push({
      slot: 'costume',
      roleLabel: '服装',
      canvasSub: cat ? `${cat} · ${name}` : name,
      src: recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图,
    })
  }
  if (recipe.portrait) {
    const title = sanitizeForCloud
      ? hasSanitizeRules
        ? sanitizeCloudTextSegment(recipe.portrait.标题, poseSanitize) || '人像参考'
        : '人像参考'
      : recipe.portrait.标题
    rawItems.push({
      slot: 'portrait',
      roleLabel: '人像',
      canvasSub: title,
      src: recipe.portrait.原图 || recipe.portrait.缩略图,
    })
  }
  for (const extra of recipe.extraImages || []) {
    const extraName = sanitizeForCloud
      ? hasSanitizeRules
        ? sanitizeCloudTextSegment(extra.name, poseSanitize) || '附加参考图'
        : '附加参考'
      : extra.name || '自定义参考图'
    rawItems.push({
      slot: 'extra',
      roleLabel: '附加',
      canvasSub: extraName,
      src: extra.url,
    })
  }

  const total = rawItems.length
  return rawItems.map((item, idx) => {
    const num = idx + 1
    let positionLabel = ''
    if (total === 2) {
      positionLabel = num === 1 ? '左侧' : '右侧'
    } else if (total === 3) {
      positionLabel = num === 1 ? '左侧' : num === 2 ? '中间' : '右侧'
    } else if (total >= 4) {
      positionLabel = num === 1 ? '第1格·最左' : num === total ? `第${num}格·最右` : `第${num}格`
    }

    const canvasTag = positionLabel
      ? `图${num} · ${positionLabel} · ${item.roleLabel}`
      : `图${num} · ${item.roleLabel}`
    const promptRef = positionLabel ? `图${num}[${positionLabel}${item.roleLabel}区]` : '<IMAGE_0>'
    const summarySegment = positionLabel
      ? `图${num}[${positionLabel}]为${item.roleLabel}参考`
      : `图${num}为${item.roleLabel}参考`

    return {
      index: num,
      zeroIndex: idx,
      slot: item.slot,
      positionLabel,
      roleLabel: item.roleLabel,
      canvasTag,
      canvasSub: item.canvasSub,
      promptRef,
      summarySegment,
      src: item.src,
    }
  })
}

export type StudioGenerationMode = 'recipe' | 'prompt'

export function buildTextToImagePrompt(
  userPrompt: string,
  stylePreset = 'none',
  options?: {
    stylePresets?: StylePresetItem[]
    styleCategories?: StyleCategoryItem[]
    styleSubcategories?: StyleSubcategoryItem[]
    hasReferenceImages?: boolean
  }
): string {
  const cleanUserPrompt = userPrompt.replace(/\r\n?/g, '\n').trim()
  const parts: string[] = []
  if (cleanUserPrompt) {
    parts.push(cleanUserPrompt)
  }
  if (stylePreset && stylePreset !== 'none') {
    const styleInfo = resolveStyleInfo(stylePreset, {
      stylePresets: options?.stylePresets,
      styleCategories: options?.styleCategories,
      styleSubcategories: options?.styleSubcategories,
    })
    const stylePrompt = (styleInfo.prompt || '').trim()
    if (stylePrompt) {
      parts.push(`Visual Style: ${stylePrompt}`)
    }
  }
  return parts.join('\n\n')
}

export function buildRecipePrompt(
  recipe: RecipeState,
  stylePreset = 'none',
  promptOverrides?: {
    prefix?: string
    suffix?: string
    sceneNote?: string
    negativePrompt?: string
    stylePrompt?: string
    styleNegativePrompt?: string
    allowFaceStyleShift?: boolean
    allowPoseStyleShift?: boolean
    /** 为 true 且存在 >=2 张参考图时，生成“单张左中右编号拼合参考图 <IMAGE_0>”专属提示词 */
    singleStitchedSheet?: boolean
    /** 失败兜底降级时由视觉模型或数据库读取到的全部参考图文字描述（此时对应图片已从 recipe 中移除） */
    textDescriptions?: {
      pose?: string
      costume?: string
      portrait?: string
      extras?: Array<{ name?: string; description: string }>
    }
    promptTemplate?: Partial<PromptTemplateConfig> | null
    poseSanitize?: Partial<PoseSanitizeConfig> | null
    stylePresets?: StylePresetItem[]
    styleCategories?: StyleCategoryItem[]
    styleSubcategories?: StyleSubcategoryItem[]
  }
): string {
  const tpl = mergePromptTemplate(promptOverrides?.promptTemplate)
  const poseTextDesc = (promptOverrides?.textDescriptions?.pose || '').trim()
  const costumeTextDesc = (promptOverrides?.textDescriptions?.costume || '').trim()
  const portraitTextDesc = (promptOverrides?.textDescriptions?.portrait || '').trim()
  const extraTextDescs = (promptOverrides?.textDescriptions?.extras || [])
    .map((item) => ({
      name: sanitizeCloudTextSegment(item.name || '', promptOverrides?.poseSanitize),
      description: (item.description || '').trim(),
    }))
    .filter((item) => Boolean(item.description))

  let idx = 0
  const poseIdx = recipe.pose ? idx++ : null
  const costumeIdx = recipe.costume ? idx++ : null
  const portraitIdx = recipe.portrait ? idx++ : null
  const extraRefs = (recipe.extraImages || []).map((extra) => ({
    index: idx++,
    name: sanitizeCloudTextSegment(extra.name, promptOverrides?.poseSanitize),
  }))

  if (
    poseIdx === null &&
    costumeIdx === null &&
    portraitIdx === null &&
    extraRefs.length === 0 &&
    !poseTextDesc &&
    !costumeTextDesc &&
    !portraitTextDesc &&
    extraTextDescs.length === 0
  ) {
    return '请先选择姿势/服装/人像或上传附加参考图。'
  }

  const refTag = (n: number) => `<IMAGE_${n}>`
  const totalRefs =
    (poseIdx !== null ? 1 : 0) +
    (costumeIdx !== null ? 1 : 0) +
    (portraitIdx !== null ? 1 : 0) +
    extraRefs.length

  const useStitchedPrompt = Boolean(promptOverrides?.singleStitchedSheet && totalRefs >= 2)
  const stitchedPanels = useStitchedPrompt
    ? buildStitchedPanelLayout(recipe, {
        sanitizeForCloud: true,
        poseSanitize: promptOverrides?.poseSanitize,
      })
    : []

  const hasAnyCostume = costumeIdx !== null || Boolean(costumeTextDesc)
  const hasAnyPose = poseIdx !== null || Boolean(poseTextDesc)
  const hasAnyPortrait = portraitIdx !== null || Boolean(portraitTextDesc)
  const hasAnyExtra = extraRefs.length > 0 || extraTextDescs.length > 0
  const faceless = !hasAnyPortrait && hasAnyCostume && hasAnyPose
  const bullets: string[] = []

  const panelRef = (slotIdx: number | null) => {
    if (slotIdx === null) return ''
    if (!useStitchedPrompt) return refTag(slotIdx)
    return stitchedPanels[slotIdx]?.promptRef || refTag(slotIdx)
  }

  const poseTagOrEmpty =
    poseIdx !== null ? panelRef(poseIdx) : poseTextDesc ? '上文姿势描述' : ''
  const costumeTagOrEmpty =
    costumeIdx !== null ? panelRef(costumeIdx) : costumeTextDesc ? '上文服装描述' : ''
  const portraitTagOrEmpty = panelRef(portraitIdx)
  const extraList = extraRefs
    .map((item) => {
      const tag = panelRef(item.index)
      return item.name ? `${tag}（${item.name}）` : tag
    })
    .join('、')

  const resolvedStyle = resolveStyleInfo(stylePreset, {
    stylePresets: promptOverrides?.stylePresets,
    styleCategories: promptOverrides?.styleCategories,
    styleSubcategories: promptOverrides?.styleSubcategories,
  })
  const isNoStylePreset = stylePreset === 'none' || resolvedStyle.id === 'none'
  const effectiveStylePrompt = isNoStylePreset
    ? ''
    : (promptOverrides?.stylePrompt || resolvedStyle.prompt).replace(/\r\n?/g, '\n').trim()
  const applyFaceStyleShift = Boolean(promptOverrides?.allowFaceStyleShift && effectiveStylePrompt)
  const applyPoseStyleShift = Boolean(promptOverrides?.allowPoseStyleShift && effectiveStylePrompt)

  if (poseIdx !== null) {
    // 姿势适配模式下不附带文字标题（如“双V”“双手放锁骨”），避免文字标题与画风让臂规则冲突
    const poseTitle = applyPoseStyleShift
      ? ''
      : sanitizePoseTitleForCloud(recipe.pose, promptOverrides?.poseSanitize)
    const poseClauseTag = poseTitle ? `${poseTagOrEmpty}(${poseTitle})` : poseTagOrEmpty
    const poseTpl = applyPoseStyleShift ? tpl.adaptivePoseClause : tpl.poseClause
    const poseLine = renderPromptVars(poseTpl.replace(/\r\n?/g, '\n'), {
      姿势图: poseClauseTag,
    })
    const rawPoseDesc =
      !applyPoseStyleShift && poseTitle && recipe.pose?.描述
        ? sanitizeCloudTextSegment(recipe.pose.描述, promptOverrides?.poseSanitize)
        : ''
    const cleanPoseDesc = rawPoseDesc.replace(/[。！？；.!?;]+$/, '').trim()
    const combinedPoseLine =
      poseLine && cleanPoseDesc
        ? `${poseLine.replace(/[。！？；.!?;]+$/, '').trim()}（动作要领：${cleanPoseDesc}）。`
        : poseLine
    if (combinedPoseLine) bullets.push(`• 姿势：${combinedPoseLine}`)
  } else if (poseTextDesc) {
    const textPoseLine = ensureSentenceEnd(poseTextDesc)
    if (textPoseLine) bullets.push(`• 姿势：${textPoseLine}`)
  }

  if (costumeIdx !== null) {
    const costumeTpl = applyFaceStyleShift ? tpl.adaptiveCostumeClause : tpl.costumeClause
    const costumeLine = renderPromptVars(costumeTpl.replace(/\r\n?/g, '\n'), {
      服装图: costumeTagOrEmpty,
    })
    if (costumeLine) bullets.push(`• 服装：${costumeLine}`)
  } else if (costumeTextDesc) {
    const textCostumeLine = ensureSentenceEnd(costumeTextDesc)
    if (textCostumeLine) bullets.push(`• 服装：${textCostumeLine}`)
  }

  if (portraitIdx !== null) {
    const identityLine = renderPromptVars(
      (applyFaceStyleShift ? tpl.adaptivePortraitClause : tpl.portraitClause).replace(/\r\n?/g, '\n'),
      { 人像图: portraitTagOrEmpty }
    )
    const ownOutfitLine =
      !hasAnyCostume
        ? renderPromptVars(tpl.portraitOwnOutfitClause.replace(/\r\n?/g, '\n'), {
            人像图: portraitTagOrEmpty,
          })
        : ''
    const recompositionLine =
      !hasAnyPose && applyPoseStyleShift
        ? renderPromptVars(
            tpl.adaptiveNoPoseRecompositionClause.replace(/\r\n?/g, '\n'),
            { 人像图: portraitTagOrEmpty }
          )
        : ''
    const personParts = [identityLine, ownOutfitLine, recompositionLine]
      .map((s) => ensureSentenceEnd(s.trim()))
      .filter(Boolean)
    if (personParts.length > 0) bullets.push(`• 人物：${personParts.join('')}`)
  } else if (portraitTextDesc) {
    const textPortraitLine = ensureSentenceEnd(portraitTextDesc)
    if (textPortraitLine) bullets.push(`• 人物：${textPortraitLine}`)
  } else {
    const personLine = renderPromptVars(
      (faceless ? tpl.facelessClause : tpl.defaultPersonClause).replace(/\r\n?/g, '\n'),
      {}
    )
    if (personLine) bullets.push(`• 人物：${personLine}`)
  }

  if (extraRefs.length > 0) {
    const extraLine = renderPromptVars(tpl.extraClause.replace(/\r\n?/g, '\n'), {
      附图列表: extraList,
    })
    if (extraLine) bullets.push(`• 补充参考：${extraLine}`)
  } else if (extraTextDescs.length > 0) {
    const mergedExtras = extraTextDescs
      .map((item) =>
        item.name ? `[${item.name}] ${ensureSentenceEnd(item.description)}` : ensureSentenceEnd(item.description)
      )
      .join(' ')
    bullets.push(`• 补充参考：结合以下附加参考画面细节与氛围描写自然融入画面：${mergedExtras}`)
  }

  if (effectiveStylePrompt) {
    const styleParts = [ensureSentenceEnd(effectiveStylePrompt)]
    const adaptiveSuffix = tpl.adaptiveStyleSuffix.replace(/\r\n?/g, '\n').trim()
    if (applyFaceStyleShift && adaptiveSuffix) {
      styleParts.push(ensureSentenceEnd(adaptiveSuffix))
    }
    const adaptivePoseSuffix = tpl.adaptivePoseStyleSuffix.replace(/\r\n?/g, '\n').trim()
    if (applyPoseStyleShift && adaptivePoseSuffix) {
      styleParts.push(ensureSentenceEnd(adaptivePoseSuffix))
    }
    bullets.push(`• 风格：${styleParts.join('')}`)
  }

  const rawSceneNote = (promptOverrides?.sceneNote || '').replace(/\r\n?/g, '\n').trim()
  if (rawSceneNote) {
    bullets.push(`• 额外要求：${ensureSentenceEnd(rawSceneNote)}`)
  }

  const nonPoseImageTags = [
    costumeIdx !== null ? costumeTagOrEmpty : '',
    portraitTagOrEmpty,
    ...extraRefs.map((item) => panelRef(item.index)),
  ].filter(Boolean)
  const conditionCtx = {
    hasPose: hasAnyPose,
    hasCostume: hasAnyCostume,
    hasPortrait: hasAnyPortrait,
    hasExtra: hasAnyExtra,
    hasOthersWithPose: nonPoseImageTags.length > 0,
    adaptivePose: applyPoseStyleShift,
  }
  const constraintVars = {
    姿势图: poseTagOrEmpty,
    服装图: costumeTagOrEmpty,
    人像图: portraitTagOrEmpty,
    附图列表: extraList,
    非姿势图: joinChineseClauses(nonPoseImageTags, '或'),
  }

  const constraintItems: string[] = []
  let nextConstraintNum = 1
  for (const item of tpl.constraints) {
    if (!item.enabled) continue
    if (!matchesConstraintCondition(item.condition, conditionCtx)) continue
    const rendered = renderPromptVars(item.text, constraintVars).trim()
    if (!rendered) continue
    constraintItems.push(`${nextConstraintNum++}) ${ensureSentenceEnd(rendered)}`)
  }
  if (useStitchedPrompt) {
    constraintItems.push(
      `${nextConstraintNum++}) 仅从拼合参考图<IMAGE_0>的各个分区提取动作、服饰与外貌特征，彻底去除原拼图自带的边框、色块分隔及编号文字，输出单一连贯画面。`
    )
  }
  if (poseIdx === null && poseTextDesc && applyPoseStyleShift) {
    constraintItems.push(
      `${nextConstraintNum++}) 上文「姿势」中的文字细节仅作动态与重心参考；若其中双臂分配、局部手势或取景范围与「风格」表述冲突，须优先服从「风格」并顺滑重组为单侧或兼容动作，严禁叠加多余手臂。`
    )
  }
  if (constraintItems.length > 0) {
    bullets.push(`• 约束：${constraintItems.join('')}`)
  }

  const isPhotoCategory =
    !resolvedStyle.categoryId ||
    resolvedStyle.categoryId === 'photography' ||
    /摄影|写真|photo/i.test(
      `${resolvedStyle.categoryId} ${resolvedStyle.categoryLabel || ''}`
    )
  const subjectMedia = isPhotoCategory ? '照片' : '图像'

  const effectiveNegative = mergeNegativePrompts(
    promptOverrides?.negativePrompt,
    promptOverrides?.styleNegativePrompt ?? resolvedStyle.negativePrompt
  )

  const hasTextFallback = Boolean(
    poseTextDesc || costumeTextDesc || portraitTextDesc || extraTextDescs.length > 0
  )
  const introLine = useStitchedPrompt
    ? `请根据提供的 1 张多格拼合参考图（<IMAGE_0>，画幅按从左到右分为 ${totalRefs} 个编号区域：${stitchedPanels.map((p) => p.summarySegment).join('、')}），将各区域要素融合生成一幅单一完整的连续人物${subjectMedia}（严禁保留分格线、深色底框或标注文字）：`
    : hasTextFallback
      ? totalRefs > 0
        ? `请根据提供的 ${totalRefs} 张参考图（${totalRefs === 1 ? refTag(0) : `依次为${Array.from({ length: totalRefs }, (_, i) => refTag(i)).join('、')}`}），并严格结合下文给出的文字描述，生成单幅连续场景的人物${subjectMedia}：`
        : `请严格结合下文给出的人物外貌、姿态、服装与场景文字描述，进行纯文字生图，生成单幅连续场景的人物${subjectMedia}：`
      : renderPromptVars(tpl.intro.replace(/\r\n?/g, '\n'), {
          总数: String(totalRefs),
          参考图序: totalRefs === 1 ? refTag(0) : `依次为${Array.from({ length: totalRefs }, (_, i) => refTag(i)).join('、')}`,
          媒介: subjectMedia,
        })

  const rawPrefix = (promptOverrides?.prefix || '').replace(/\r\n?/g, '\n').trim()
  const rawSuffix = (promptOverrides?.suffix || '').replace(/\r\n?/g, '\n').trim()
  const lines: string[] = [
    ...(rawPrefix ? [rawPrefix] : []),
    ...(introLine ? [introLine] : []),
    ...bullets,
    ...(effectiveNegative ? [`避免：${effectiveNegative}`] : []),
    ...(rawSuffix ? [rawSuffix] : []),
  ]
  return lines.join('\n')
}

export function referenceImageUrl(src: string): string {
  return /^(data:|https?:\/\/|\/)/i.test(src) ? src : `/${src}`
}

export function hasPoseDepthMap(pose?: Pick<PoseItem, 'source' | '缩略图'> | null): boolean {
  if (!pose) return false
  if (pose.source === 'upload' || pose.source === 'mio') return false
  const raw = pose.缩略图 || ''
  return !/^(data:|https?:\/\/)/i.test(raw)
}

export function poseThumbPath(pose: PoseItem, useDepth = Boolean(pose.useDepth)): string {
  const raw = pose.缩略图
  if (!hasPoseDepthMap(pose) || !useDepth) return raw
  const clean = raw.replace(/^\/+/, '')
  if (clean.startsWith('thumbs/depth/')) return raw
  if (clean.startsWith('thumbs/')) {
    return `thumbs/depth/${clean.slice('thumbs/'.length).replace(/\.(jpe?g|png)$/i, '.webp')}`
  }
  return raw
}

export function poseImagePath(pose: PoseItem, useDepth = Boolean(pose.useDepth)): string {
  const raw = pose.原图 || pose.缩略图
  if (!hasPoseDepthMap(pose) || !useDepth) return raw
  const clean = raw.replace(/^\/+/, '')
  if (clean.startsWith('img/depth/')) return raw
  if (clean.startsWith('img/')) {
    return `img/depth/${clean.slice('img/'.length).replace(/\.(png|jpe?g)$/i, '.webp')}`
  }
  return raw
}

// ---------------------------------------------------------------------------
// 平台配置与接口 DTO 类型
// ---------------------------------------------------------------------------

export type ReferenceDescriptionKind = 'pose' | 'costume' | 'portrait' | 'extra'

export const DEFAULT_POSE_DESCRIBE_PROMPT =
  '你是一名专业摄影造型与人体姿态分析师。请精准观察参考图中的人物姿态，用一段流畅、客观、精炼的简体中文（90~150字）概括动作造型与重心关系，涵盖：整体机位感与身体朝向、头部倾斜与视线方向、躯干动态与双肩姿态、双臂大致伸展走势与手部动作意象、以及下肢站坐蹲姿（未呈现下肢时只需说明身体直立或重心倾斜状态）。严格要求：1) 禁止输出“腿部未入镜”“仅拍摄至腰部”等锁死画幅裁剪的否定句，也不要逐根手指写死微动作，以便不同画风自由重构景别与双臂交互；2) 只描述空间动作与姿态关系，绝不提及白模、石膏人偶、网格线条、外貌五官、服装或背景；3) 全文采用中性雅正的摄影体态措辞，避免贴近敏感部位的生硬表述或易触发审核拦截的词汇。仅输出最终描述正文，不要任何前缀或列表符号。'

export const DEFAULT_COSTUME_DESCRIBE_PROMPT =
  '你是一名专业服装造型设计师。请精准观察参考图中的服装穿搭，用一段流畅、客观、得体的简体中文（90~160字）完整描述全套服饰细节，涵盖：整体穿搭风格与分层结构（如上装/内搭/外套/裙装/裤装等）、精确的主色调与辅色搭配、面料纹理与材质质感（如丝绒、缎面、针织、薄纱、蕾丝、皮革等）、领口/袖型/腰部剪裁与装饰配件，以及袜履头饰（如有）。严格要求：1) 仅描述服饰本身，完全忽略人物五官、肤色、身材评价与拍摄背景；2) 必须采用克制典雅的时装设计术语，对贴身或轻薄款服饰用客观版型与面料语言表达，绝不出现低俗、露骨或可能触发审核拦截的词汇。仅输出最终描述正文，不要任何前缀或标题。'

export const DEFAULT_PORTRAIT_DESCRIBE_PROMPT =
  '你是一名专业人像造型与特征描摹师。请精准观察参考图中的人物面部与发型造型，用一段流畅、客观、得体的简体中文（100~180字）准确描述人物外形核心特征，涵盖：性别特征与年龄气质、脸型轮廓与五官细节（眉形眼型、眼神神态、鼻梁唇形等）、肤色质感与妆容特点、以及发型发色详情（发长、卷直度、分缝刘海、扎发编发与发饰）。严格要求：1) 只描摹头部相貌、神态与发型，绝不描摹人物当前站姿动作、身体穿戴的服装，也不要描述拍摄背景；2) 必须采用中性雅正的人像描摹措辞，绝不使用敏感或可能触发审核拦截的词汇。仅输出最终描述正文，不要任何前缀或列表符号。'

export const DEFAULT_EXTRA_DESCRIBE_PROMPT =
  '你是一名专业视觉美术分析师。请精准观察该附加参考图中的视觉信息，用一段客观、清晰、安全合规的简体中文（80~140字）概括图中关键要素，涵盖：场景环境氛围、光线色彩基调、道具元素或画面构成关系，避免任何可能触发审核拦截的词汇。仅输出最终描述正文，不要任何前缀或标题。'

export interface VisionFallbackConfig {
  /** 是否在前台工作台常驻开启“图转文 · 纯文生图”功能 */
  enabled: boolean
  /** 优先复用的供应商 ID（留空则自动匹配模型对应的已启用渠道供应商） */
  supplierId: string
  /** 接口协议模式 */
  endpointMode: 'gemini_native' | 'openai_chat'
  /** Gemini 原生接口鉴权模式 */
  authMode?: 'auto' | 'bearer' | 'goog_key' | 'both'
  /** 视觉识别模型 ID（默认 gemini-4-hydrogen） */
  model: string
  /** 姿势图转文字指令提示词 */
  poseDescribePrompt: string
  /** 服装图转文字指令提示词 */
  costumeDescribePrompt: string
  /** 人像图转文字指令提示词 */
  portraitDescribePrompt: string
  /** 附加参考图转文字指令提示词 */
  extraDescribePrompt: string
}

export function createDefaultVisionFallbackConfig(): VisionFallbackConfig {
  return {
    enabled: true,
    supplierId: '',
    endpointMode: 'gemini_native',
    authMode: 'auto',
    model: 'gemini-4-hydrogen',
    poseDescribePrompt: DEFAULT_POSE_DESCRIBE_PROMPT,
    costumeDescribePrompt: DEFAULT_COSTUME_DESCRIBE_PROMPT,
    portraitDescribePrompt: DEFAULT_PORTRAIT_DESCRIBE_PROMPT,
    extraDescribePrompt: DEFAULT_EXTRA_DESCRIBE_PROMPT,
  }
}

export function mergeVisionFallbackConfig(
  raw?: Partial<VisionFallbackConfig> | Record<string, unknown> | null
): VisionFallbackConfig {
  const def = createDefaultVisionFallbackConfig()
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const endpointMode =
    src.endpointMode === 'openai_chat' || src.endpointMode === 'gemini_native'
      ? src.endpointMode
      : def.endpointMode
  const authMode =
    src.authMode === 'auto' ||
    src.authMode === 'bearer' ||
    src.authMode === 'goog_key' ||
    src.authMode === 'both'
      ? src.authMode
      : def.authMode
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : def.enabled,
    supplierId: typeof src.supplierId === 'string' ? src.supplierId.trim().slice(0, 120) : def.supplierId,
    endpointMode,
    authMode,
    model:
      typeof src.model === 'string' && src.model.trim()
        ? src.model.trim().slice(0, 120)
        : def.model,
    poseDescribePrompt:
      typeof src.poseDescribePrompt === 'string' && src.poseDescribePrompt.trim()
        ? src.poseDescribePrompt.trim().slice(0, 2000)
        : def.poseDescribePrompt,
    costumeDescribePrompt:
      typeof src.costumeDescribePrompt === 'string' && src.costumeDescribePrompt.trim()
        ? src.costumeDescribePrompt.trim().slice(0, 2000)
        : def.costumeDescribePrompt,
    portraitDescribePrompt:
      typeof src.portraitDescribePrompt === 'string' && src.portraitDescribePrompt.trim()
        ? src.portraitDescribePrompt.trim().slice(0, 2000)
        : def.portraitDescribePrompt,
    extraDescribePrompt:
      typeof src.extraDescribePrompt === 'string' && src.extraDescribePrompt.trim()
        ? src.extraDescribePrompt.trim().slice(0, 2000)
        : def.extraDescribePrompt,
  }
}

export interface ReferenceDescriptionDTO {
  id: string
  kind: ReferenceDescriptionKind
  refKey: string
  sourceLabel: string
  previewPath: string
  description: string
  sourceType: 'auto' | 'manual'
  visionModel: string
  visionSupplierId: string
  createdAt: number
  updatedAt: number
}

export type GenerationQueueWaitReason = 'model_busy' | 'user_busy' | 'global_busy'

export interface GenerationQueueConfig {
  /** 全站最大同时执行任务数 */
  maxGlobalConcurrency: number
  /** 单个画笔档位默认最大同时执行数 */
  maxModelConcurrency: number
  /** 按具体画笔档位 profileId 覆写最大同时执行数 */
  profileConcurrencyOverrides: Record<string, number>
  /** 单个用户最大同时执行数 */
  maxUserConcurrency: number
  /** 单个用户最多排队等待数 */
  maxUserQueuedJobs: number
  /** 全站排队队列总容量上限 */
  maxQueueSize: number
  /** 排队最长等待超时（秒），超时自动取消并全额退还积分 */
  queueWaitTimeoutSec: number
  /** 绘制执行超时（秒），超时自动回收并全额退还积分 */
  processingTimeoutSec: number
}

export function createDefaultGenerationQueueConfig(): GenerationQueueConfig {
  return {
    maxGlobalConcurrency: 8,
    maxModelConcurrency: 3,
    profileConcurrencyOverrides: {},
    maxUserConcurrency: 2,
    maxUserQueuedJobs: 4,
    maxQueueSize: 50,
    queueWaitTimeoutSec: 600,
    processingTimeoutSec: 360,
  }
}

function clampQueueInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

export function mergeGenerationQueueConfig(
  raw?: Partial<GenerationQueueConfig> | Record<string, unknown> | null
): GenerationQueueConfig {
  const def = createDefaultGenerationQueueConfig()
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawOverrides =
    src.profileConcurrencyOverrides && typeof src.profileConcurrencyOverrides === 'object'
      ? (src.profileConcurrencyOverrides as Record<string, unknown>)
      : {}
  const overrides: Record<string, number> = {}
  for (const [k, v] of Object.entries(rawOverrides)) {
    const key = k.trim()
    if (!key) continue
    const num = Number(v)
    if (Number.isFinite(num) && num >= 1) {
      overrides[key] = Math.min(20, Math.max(1, Math.round(num)))
    }
  }
  return {
    maxGlobalConcurrency: clampQueueInt(src.maxGlobalConcurrency, def.maxGlobalConcurrency, 1, 50),
    maxModelConcurrency: clampQueueInt(src.maxModelConcurrency, def.maxModelConcurrency, 1, 20),
    profileConcurrencyOverrides: overrides,
    maxUserConcurrency: clampQueueInt(src.maxUserConcurrency, def.maxUserConcurrency, 1, 10),
    maxUserQueuedJobs: clampQueueInt(src.maxUserQueuedJobs, def.maxUserQueuedJobs, 0, 20),
    maxQueueSize: clampQueueInt(src.maxQueueSize, def.maxQueueSize, 1, 500),
    queueWaitTimeoutSec: clampQueueInt(src.queueWaitTimeoutSec, def.queueWaitTimeoutSec, 60, 3600),
    processingTimeoutSec: clampQueueInt(src.processingTimeoutSec, def.processingTimeoutSec, 30, 900),
  }
}

export function resolveProfileConcurrencyLimit(
  cfg: GenerationQueueConfig | null | undefined,
  profileId?: string | null
): number {
  const resolved = cfg ?? createDefaultGenerationQueueConfig()
  if (profileId && typeof resolved.profileConcurrencyOverrides[profileId] === 'number') {
    return resolved.profileConcurrencyOverrides[profileId]
  }
  return resolved.maxModelConcurrency
}

/** 活跃执行器心跳间隔与失联回收阈值（毫秒） */
export const JOB_HEARTBEAT_INTERVAL_MS = 12_000
export const JOB_HEARTBEAT_STALE_MS = 60_000

/**
 * 按画师/协议分层计算单任务有效执行超时上限（秒）：
 * - 同步直连 API（GPT / Gemini / Grok）：封顶 150s，避免被 Dreamina/Muse 的 360s 长超时拖累
 * - 异步轮询（Muse）：封顶 270s（覆盖 muse2api 250s 轮询 + 存图余量）
 * - WaveSpeed 异步轮询：封顶 180s
 * - Dreamina 浏览器桥 / 其余 Seedream 渠道：沿用全局 processingTimeoutSec（默认 360s）
 * 若管理员手动将全局 processingTimeoutSec 调得更小，则以全局值为准。
 */
export function resolveEffectiveProcessingTimeoutSec(
  cfg: GenerationQueueConfig | null | undefined,
  provider: ImageProviderId,
  endpointMode?: string | null
): number {
  const globalMax = (cfg ?? createDefaultGenerationQueueConfig()).processingTimeoutSec
  if (endpointMode === 'dreamina') {
    return globalMax
  }
  if (endpointMode === 'wavespeed') {
    return Math.min(globalMax, 180)
  }
  if (provider === 'muse') {
    return Math.min(globalMax, 270)
  }
  if (provider === 'seedream') {
    return globalMax
  }
  // gpt / gemini / grok 同步直连画师
  return Math.min(globalMax, 150)
}

export interface GenerationQueueInfo {
  /** 全站排队位次（1 表示队首第 1 位） */
  position: number
  /** 前面还有多少个任务等待（position - 1） */
  aheadCount: number
  /** 当前全站排队总数 */
  totalQueued: number
  /** 同画笔档位内排队位次（1 表示第 1 位） */
  modelPosition: number
  /** 同画笔档位前面还有多少个任务 */
  modelAheadCount: number
  /** 当前主要等待原因 */
  reason: GenerationQueueWaitReason
  /** 入队时间戳 */
  queuedAt: number
}

export interface PlatformConfig {
  registerBonusCredits: number
  allowRegistration: boolean
  defaultStylePreset: string
  defaultPromptPrefix: string
  defaultPromptSuffix: string
  defaultNegativePrompt: string
  promptTemplate?: PromptTemplateConfig
  poseSanitize?: PoseSanitizeConfig
  visionFallback?: VisionFallbackConfig
  textFallbackEnabled?: boolean
  queueConfig?: GenerationQueueConfig
  styleCategories: StyleCategoryItem[]
  styleSubcategories: StyleSubcategoryItem[]
  stylePresets: StylePresetItem[]
  imagePassMode: ImagePassMode
  sendStitchedSheet: boolean
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  registerBonusCredits: 50,
  allowRegistration: true,
  defaultStylePreset: 'none',
  defaultPromptPrefix: '',
  defaultPromptSuffix: '',
  defaultNegativePrompt: '分屏，拼图，多宫格，多视图，对比图，重复人物，双胞胎，多余手臂，多余肢体',
  promptTemplate: createDefaultPromptTemplate(),
  poseSanitize: createDefaultPoseSanitizeConfig(),
  visionFallback: createDefaultVisionFallbackConfig(),
  textFallbackEnabled: true,
  queueConfig: createDefaultGenerationQueueConfig(),
  styleCategories: [
    { id: 'acg', label: 'ACG' },
    { id: 'photography', label: '摄影' },
  ],
  styleSubcategories: [
    { id: 'acg_2d_anime', categoryId: 'acg', label: '2D动漫' },
    { id: 'acg_3d_anime', categoryId: 'acg', label: '3D动漫' },
    { id: 'acg_game', categoryId: 'acg', label: '游戏' },
    { id: 'photo_phone', categoryId: 'photography', label: '真实手机' },
    { id: 'photo_pro', categoryId: 'photography', label: '专业设备' },
  ],
  stylePresets: [
    {
      id: 'jp_retro',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '日系复古',
      previewUrl: '/api/style-assets/fbdeba37-d9dc-48d4-a0e9-0198a209a5ec.png',
      prompt:
        '正宗90年代日本复古动画风格，传统手绘二维赛璐璐动画，富有表现力的大眼睛，略带棱角的柔和五官，经典复古动漫人物比例，粗细变化自然的手绘墨线轮廓，经典双色赛璐璐阴影，精心绘制的局部高光，轻微传统胶片动画瑕疵，怀旧复古色彩，原汁原味的90年代日本剧场版与电视动画美学。',
    },
    {
      id: 'miyazaki',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '宫崎骏风格',
      previewUrl: '/api/style-assets/fe00c664-9e79-4f1d-b503-2e81c369bca3.png',
      prompt:
        '吉卜力工作室 / 宫崎骏式日本经典手绘动画人物风格，具有鲜明的吉卜力角色设计特征。人物面部以自然柔和的椭圆形或圆润脸型为主，额头饱满，下颌线圆润流畅，五官简洁而协调。眼睛大小适中，采用清澈灵动的椭圆形眼型，瞳孔简洁，眉毛自然舒展，通过细微的眉眼变化传递丰富情绪；鼻子小巧简练，嘴巴线条简洁，面部结构概括而生动。保留自然的人体比例与亲切朴素的角色气质，避免过度夸张的动漫化五官。发型采用自然蓬松、富有整体轮廓感的手绘造型，发丝简化而富有流动性。人物轮廓使用流畅自然、粗细适度变化的手绘线条，采用传统二维赛璐璐平涂与柔和手绘阴影，结合细腻的水彩、水粉质感。色彩温暖清新、柔和自然，面部带有细腻的肤色层次与淡淡红润感，整体呈现质朴、生动、亲切、充满生命力的经典日本动画电影人物美学。',
    },
    {
      id: 'shinkai',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '新海诚风格',
      previewUrl: '/api/style-assets/4093e3dd-d3ae-4e93-b295-544998c3a553.png',
      prompt:
        '新海诚式现代日本动画风格，精致协调的现代动漫五官比例，晶莹通透的表现力眼睛，细腻干净的线稿，精致数字赛璐璐与柔和数字厚涂结合，通透清澈的色彩，细致的发丝高光，微妙的皮肤透光感，精准细腻的面部光影，明亮柔美的色彩过渡，精致唯美的动画电影级人物表现。',
    },
    {
      id: 'toriyama',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '鸟山明风格',
      previewUrl: '/api/style-assets/89bfe219-7bdf-4ea7-83ce-883d3cec6822.png',
      prompt:
        '鸟山明式日本漫画与动画风格，独特圆润的几何造型，简洁流畅的自信墨线，简化而富有表现力的五官，灵动夸张的表情，鲜明易识别的人物轮廓，富有魅力的卡通人体结构，流畅自然的形体曲线，清爽平涂赛璐璐上色，干净利落的阴影色块，明快和谐的经典冒险漫画色彩。',
    },
    {
      id: 'clamp',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: 'CLAMP风格',
      previewUrl: '/api/style-assets/75a1e1f1-af61-44e4-baa8-035296d0d1b7.png',
      prompt:
        'CLAMP式日本漫画风格，优雅修长的面部比例，精致尖细的下巴，细腻华丽的表现力眼睛，纤细优雅的人体结构，流畅飘逸的发型轮廓，精密细致的手绘线条，细腻的面部刻画，精致平涂上色，富有装饰感与幻想气息的高级漫画人物设计。',
    },
    {
      id: 'jojo',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: 'JOJO风格',
      previewUrl: '/api/style-assets/f5f75b9a-3a0c-48f4-ad3c-5f276576a39c.png',
      prompt:
        'JOJO式日本漫画风格，极具雕塑感的人物面部结构，鲜明锐利的五官轮廓，精致夸张的眉眼设计，富有力量感的肌肉与人体比例，优雅而戏剧化的动态姿势，时尚化服饰造型，流畅精准的手绘墨线，强烈的明暗对比，鲜明大胆的装饰性色彩，独特华丽的超现实漫画美学。',
    },
    {
      id: 'kon_satoshi',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '今敏风格',
      previewUrl: '/api/style-assets/de59e3a3-7819-4b2f-ba43-5e2936c95ddc.png',
      prompt:
        '今敏式日本动画电影风格，成熟半写实动漫面部结构，自然真实的人物比例，接近真实人类的眼睛与面部比例，微妙自然的面部不对称，细腻复杂的情绪表达，成熟精确的手绘轮廓，克制的动漫化处理，真实自然的明暗塑造，细腻的人体结构刻画，成熟写实的电影动画美学。',
    },
    {
      id: 'jp_bw_manga',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '日系黑白',
      previewUrl: '/api/style-assets/b33e12ee-2b1b-4fb1-9d21-ab50dc5c60a4.png',
      prompt:
        '正宗日本黑白漫画原稿风格，精细流畅的G笔手绘墨线，粗细变化鲜明的轮廓线，富有表现力的日式漫画五官，精准细腻的人物结构刻画，经典45度网点纸阴影，细密排线与交叉排线，黑白高对比明暗塑造，局部纯黑色块，传统漫画原稿质感。',
    },
    {
      id: 'hk_manhua',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '中国港漫',
      previewUrl: '/api/style-assets/66f1a0e1-3d30-42b1-a7c2-d7c9f3e47ec2.png',
      prompt:
        '经典中国香港彩色漫画风格，成熟写实的人物面部结构，鲜明立体的五官轮廓，精准细腻的人体解剖，刚劲有力的手绘墨线，精密复杂的排线与明暗刻画，强烈的戏剧化光影，极具冲击力的动态透视，细腻丰富的传统漫画厚涂上色，高饱和冷暖对比色彩，华丽细致的商业漫画原稿质感，经典港式武侠与动作漫画美学。',
    },
    {
      id: 'kr_webtoon',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '韩系彩漫',
      previewUrl: '/api/style-assets/2bb56a43-ae17-4726-af76-c758f8f0cb52.png',
      prompt:
        '正宗韩国Webtoon彩色网漫风格，精致修长的韩系动漫五官，优雅协调的面部比例，细腻流畅的数字线稿，晶莹通透的表现力眼睛，柔和细腻的数字渐变上色，精致的发丝高光，自然细腻的皮肤光影，清爽明亮的色彩，精致唯美的现代韩漫人物插画质感。',
    },
    {
      id: 'us_superhero',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '美式超英',
      previewUrl: '/api/style-assets/c3da4e1d-225b-4f60-bd1a-53a1215ac90b.png',
      prompt:
        '经典美式超级英雄漫画风格，鲜明有力的人体解剖结构，立体饱满的肌肉与骨骼表现，富有力量感的面部轮廓，粗犷自信的手绘墨线，强烈的明暗对比，戏剧化硬边阴影，精细交叉排线，经典半色调网点，鲜明饱和的漫画色彩，传统美式漫画印刷质感。',
    },
    {
      id: 'disney_2d',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '迪士尼经典',
      previewUrl: '/api/style-assets/fc7b5ff1-01df-4b74-b0e3-e9b39496fa8d.png',
      prompt:
        '经典迪士尼二维手绘动画风格，优雅协调的人物面部比例，富有表现力的大眼睛，优美弧形眉毛，柔和圆润的脸颊，流畅自然的人物轮廓，生动丰富的动画表情，优雅飘逸的角色剪影，传统手绘墨线，丰富细腻的赛璐璐色彩，层次柔和的阴影色块，经典剧场版童话动画美学。',
    },
    {
      id: 'rubber_hose',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '橡皮管复古',
      previewUrl: '/api/style-assets/c5093a28-176d-4633-8859-1edfb9e08358.png',
      prompt:
        '1930年代经典橡皮管卡通动画风格，夸张圆润的大脑袋，经典扇形切口卡通眼睛，极度简化的五官，富有弹性的面条状四肢，夸张的挤压与拉伸人体结构，粗犷流畅的黑色轮廓线，圆润有机的造型，有限色彩的平面填色，轻微复古印刷纹理，原汁原味的早期手绘卡通动画美学。',
    },
    {
      id: 'simpsons',
      categoryId: 'acg',
      subcategoryId: 'acg_2d_anime',
      label: '辛普森一家风格',
      previewUrl: '/api/style-assets/de59eb03-d5e3-4910-9df4-25d13363c309.png',
      prompt:
        '辛普森一家式美国电视卡通风格，标志性的黄色卡通皮肤，夸张圆形眼睛，独特的上唇与嘴部结构，极简几何化五官，统一粗黑色轮廓线，纯色平面填充，极简阴影处理，夸张幽默的面部表情，简洁鲜明的卡通人物剪影，经典美国情景喜剧动画美学。',
    },
    {
      id: 'pixar',
      categoryId: 'acg',
      subcategoryId: 'acg_3d_anime',
      label: '皮克斯风格',
      previewUrl: '/api/style-assets/dd9f4d0b-fa37-413b-a833-61eb05e341dc.png',
      prompt:
        '皮克斯式3D动画角色风格，圆润立体的雕塑感面部结构，富有表现力的大眼睛，讨喜的卡通人物比例，柔和饱满的脸颊体积，精致细腻的三维角色建模，真实自然的次表面散射皮肤效果，光滑细腻的材质表现，生动的面部表情结构，温暖电影级全局光照，高品质动画电影渲染。',
    },
    {
      id: 'disney_3d',
      categoryId: 'acg',
      subcategoryId: 'acg_3d_anime',
      label: '迪士尼风格',
      previewUrl: '/api/style-assets/7065213d-1997-48ea-95db-78953f2c3c65.png',
      prompt:
        '迪士尼式3D动画角色风格，优雅精致的风格化面部比例，柔美协调的椭圆脸型，晶莹灵动的表现力眼睛，优雅流畅的面部轮廓，精致自然的鼻唇结构，细腻生动的动画表情，精美的三维角色建模，通透柔和的皮肤光影，精致的发丝渲染，唯美优雅的童话动画电影质感。',
    },
    {
      id: 'aardman_clay',
      categoryId: 'acg',
      subcategoryId: 'acg_3d_anime',
      label: '阿德曼黏土',
      previewUrl: '/api/style-assets/5b2f92a4-2396-490c-abce-36d4f14d81fb.png',
      prompt:
        '阿德曼式黏土定格动画风格，完全由手工塑造的橡皮泥人物，夸张立体的雕塑式五官，鲜明突出的鼻子，生动灵活的眼睛，富有魅力的不规则人物比例，柔软自然的黏土几何形体，清晰可见的手指压痕与手工塑形痕迹，哑光黏土表面，有机不完美的轮廓，真实细腻的英国手工定格动画质感。',
    },
    {
      id: 'cn_puppetry',
      categoryId: 'acg',
      subcategoryId: 'acg_3d_anime',
      label: '中国布袋戏',
      previewUrl: '/api/style-assets/832337d3-82e2-44ea-9109-9cc5723d342a.png',
      prompt:
        '中国传统布袋戏木偶人物风格，精雕细琢的木偶头部造型，程式化的立体雕塑五官，富有表现力的彩绘眼睛与眉毛，优雅协调的面部结构，精致细腻的面部雕刻层次，光滑细腻的彩绘木质表面，传统木偶工艺细节，华丽精美的东方戏曲木偶人物美学。',
    },
    {
      id: 'mihoyo',
      categoryId: 'acg',
      subcategoryId: 'acg_game',
      label: '米哈游风格',
      previewUrl: '/api/style-assets/c2479e7f-cb0a-4662-b803-17dc6816b0c0.png',
      prompt:
        '米哈游式高品质日系二次元游戏角色美术风格，精致协调的动漫五官比例，晶莹通透的表现力眼睛，细腻流畅的数字线稿，精致赛璐璐与数字厚涂结合，细腻丰富的发丝高光，柔和通透的皮肤光影，精美复杂的角色造型刻画，鲜明优雅的色彩搭配，精致华丽的商业游戏角色立绘质感。',
    },
    {
      id: 'ue5_3d',
      categoryId: 'acg',
      subcategoryId: 'acg_game',
      label: 'UE5次世代3D',
      previewUrl: '/api/style-assets/8b3b8c8b-f085-4bdf-9f7f-8474bcf2c2ba.png',
      prompt:
        'Unreal Engine 5次世代写实3D角色渲染风格，真实自然的人体解剖结构，精准细腻的面部建模，符合真人比例的五官结构，超高精度皮肤纹理与毛孔细节，真实的次表面散射效果，精细自然的发丝建模，物理准确的PBR材质，细腻真实的材质反射与光影，全局光照与电影级渲染，极致逼真的次世代游戏角色视觉效果。',
    },
    {
      id: 'persona5',
      categoryId: 'acg',
      subcategoryId: 'acg_game',
      label: '女神异闻录5风格',
      previewUrl: '/api/style-assets/8fa370ea-4e55-44db-986f-630567e0435c.png',
      prompt:
        '女神异闻录5式日本潮流动漫游戏美术风格，鲜明锐利的日系动漫五官，时尚化的人物造型比例，流畅利落的手绘线稿，强烈的红黑白对比色彩，大胆鲜明的平面色块，硬朗清晰的赛璐璐阴影，夸张倾斜的动态构图，强烈的平面图形设计感，充满街头潮流与先锋视觉张力的游戏角色插画美学。',
    },
    {
      id: 'photo_selfie',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '自拍',
      poseMode: 'adaptive',
      prompt:
        '前置广角镜头近景自拍风格，由人物自身一侧手臂向镜头方向自然前伸出画（拍摄设备位于取景框之外，画面中只呈现人物肩臂自然延展至画面边缘）、另一侧手臂自然放松或做单侧姿态，自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，清晰的高动态范围计算摄影效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常前置自拍质感。',
      negativePrompt: '手机，智能手机，手持手机，握着手机，底部伸出的手，第三只手',
    },
    {
      id: 'photo_mirror_selfie',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '对镜自拍',
      poseMode: 'adaptive',
      prompt:
        '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，单手持机对准镜面、另一侧自然配合姿态（手机自然出现在镜面画面中），真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。',
    },
    {
      id: 'photo_pov',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '第一人称POV',
      poseMode: 'adaptive',
      prompt:
        '真实手机第一人称POV拍摄风格，以拍摄者的主观视角呈现人物，镜头模拟拍摄者本人视线高度与观察距离，人物仿佛正在与镜头前的拍摄者互动，自然的眼神交流与生活化动作，真实环境光，细腻自然的皮肤纹理，轻微广角透视，手机原相机的真实成像与HDR质感。',
    },
    {
      id: 'photo_candid',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '第三人称抓拍',
      poseMode: 'adaptive',
      prompt:
        '真实手机第三人称随手抓拍风格，以旁观者视角拍摄人物，人物自然处于生活环境中，不刻意摆拍，不要求直视镜头，捕捉真实随意的动作与瞬间表情，非专业摄影构图，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，轻微广角透视，未经刻意修饰的日常手机摄影质感。',
    },
    {
      id: 'photo_commercial',
      categoryId: 'photography',
      subcategoryId: 'photo_pro',
      label: '商业写真',
      prompt:
        '高品质专业模特写真摄影风格，成熟商业写真机构级拍摄水准，精致自然的人物面部与身体比例，细腻真实的皮肤质感，精致专业的妆容与人物造型，优雅自然且富有表现力的姿态，专业摄影布光与精准曝光，细腻真实的色彩与材质表现，清晰锐利的主体细节，构图精致协调，呈现高品质网红模特、职业Coser及商业写真集的专业摄影质感。',
    },
    {
      id: 'photo_magazine',
      categoryId: 'photography',
      subcategoryId: 'photo_pro',
      label: '时尚杂志',
      prompt:
        '高级时尚杂志摄影风格，精致高级的人物造型与时尚表现力，优雅而富有张力的人物姿态，专业戏剧化布光，鲜明而高级的色彩搭配，清晰细腻的皮肤与服装材质，具有视觉冲击力的时尚构图，强烈的画面设计感与艺术表现力，奢华精致的商业时尚大片质感。',
    },
    {
      id: 'photo_polaroid',
      categoryId: 'photography',
      subcategoryId: 'photo_pro',
      label: '拍立得',
      prompt:
        '经典拍立得即时成像摄影风格，真实即时显影照片质感，柔和自然的色彩表现，低饱和复古色调，细腻的模拟成像颗粒，柔和的高光过渡与适度曝光偏差，轻微色彩褪变，独特的即时相纸成像质感，自然随意的生活摄影氛围，经典宝丽来与Instax拍立得摄影美学。',
    },
    {
      id: 'photo_dv',
      categoryId: 'photography',
      subcategoryId: 'photo_pro',
      label: 'DV录像',
      prompt:
        '90年代至2000年代复古家用DV录像成像风格，真实低分辨率数字视频画面，明显的早期数码摄像机成像特征，柔和模糊的细节，轻微色彩溢出与视频压缩痕迹，交错扫描纹理，动态画面残影，有限的动态范围与不均匀曝光，怀旧的家庭录像质感，原汁原味的MiniDV与早期Handycam影像美学。',
    },
    {
      id: 'photo_cctv',
      categoryId: 'photography',
      subcategoryId: 'photo_pro',
      label: '监控摄像头',
      poseMode: 'adaptive',
      prompt:
        '真实监控摄像头录像画面风格，固定机位的高位俯拍或广角监控视角，明显的桶形畸变与空间透视，低分辨率数字成像，有限的动态范围，轻微数字噪点与视频压缩痕迹，偏冷或偏灰的监控色彩，较深的景深与大范围环境记录，缺乏专业摄影布光的真实监控影像质感。',
    },
    {
      id: 'photo_vintage_film',
      categoryId: 'photography',
      subcategoryId: 'photo_pro',
      label: '复古胶片',
      prompt:
        '经典复古彩色胶片摄影风格，真实自然的模拟胶片成像质感，有机细腻的胶片颗粒，柔和自然的高光过渡，丰富细腻的中间调，温暖通透的胶片色彩，自然真实的肤色表现，柔和适度的明暗反差，轻微色彩偏移与细腻的胶片光晕，保留真实的光学成像质感，呈现原汁原味的经典35mm彩色胶片摄影美学。',
    },
  ],
  imagePassMode: 'url',
  sendStitchedSheet: false,
}

export interface PublicUser {
  id: string
  username: string
  email: string | null
  displayName: string
  avatarUrl?: string | null
  hasPassword?: boolean
  wechatBound?: boolean
  wechatNickname?: string | null
  role: UserRole
  creditBalance: number
  status: UserStatus
  createdAt: number
  lastLoginAt: number | null
}

export interface AdminUserItem extends PublicUser {
  jobsCount: number
  adminNote: string
}

export interface WechatLoginPublicInfo {
  enabled: boolean
  configured: boolean
}

export const DEFAULT_WECHAT_LOGIN_INFO: WechatLoginPublicInfo = {
  enabled: false,
  configured: false,
}

export interface AdminWechatConfigDTO {
  enabled: boolean
  appId: string
  hasAppSecret: boolean
  appSecretHint: string
  callbackBaseUrl: string
  hasEnvFallback: boolean
  envAppIdHint: string
  updatedAt: number
}

export interface ProviderModelPublicInfo {
  profileId: string
  displayName: string
  badge: string
  tagline: string
  enabled: boolean
  configured: boolean
  creditCost: number
  defaultResolution: StudioResolution | null
  resolutions: Array<{ resolution: StudioResolution; creditCost: number }>
  isDefault: boolean
  /** 当该档位下存在单图或 WaveSpeed 拼合省钱模式渠道时为 true，前端据此自动制备三合一拼图 */
  needsStitchedSheet?: boolean
  /** 当该档位下存在可用的自家协议（非 WaveSpeed）渠道时为 true，支持常驻“图转文 · 纯文生图” */
  supportsTextFallback?: boolean
  sortOrder: number
}

export interface ProviderPublicInfo {
  providerId: ImageProviderId
  enabled: boolean
  configured: boolean
  creditCost: number
  sortOrder: number
  artist: StudioArtistPersona
  models: ProviderModelPublicInfo[]
}

export interface BootstrapPayload {
  user: PublicUser | null
  platform: PlatformConfig
  providers: ProviderPublicInfo[]
  wechatLogin?: WechatLoginPublicInfo
}

export interface SupplierChannelRef {
  channelId: string
  channelName: string
  providerId: ImageProviderId
  profileId: string
  profileName: string
  enabled: boolean
  model: string
}

export type SupplierAuthMode = 'api_key' | 'oauth_openai_codex' | 'oauth_xai'
export type SupplierCredentialType = 'api_key' | 'oauth_token'

export const SUPPLIER_AUTH_MODES: SupplierAuthMode[] = [
  'api_key',
  'oauth_openai_codex',
  'oauth_xai',
]

export const SUPPLIER_AUTH_MODE_META: Record<
  SupplierAuthMode,
  {
    label: string
    shortLabel: string
    description: string
    defaultBaseUrl: string
    defaultModels: string[]
    recommendedProvider?: ImageProviderId
  }
> = {
  api_key: {
    label: 'API Key / 静态密钥',
    shortLabel: 'API Key',
    description: '适用于官方 API Key 或各类中转站（支持单条/批量导入多 Key 轮询）。',
    defaultBaseUrl: 'https://',
    defaultModels: [],
  },
  oauth_openai_codex: {
    label: 'OpenAI Codex OAuth（ChatGPT 订阅）',
    shortLabel: 'Codex OAuth',
    description:
      '使用 ChatGPT Plus / Pro / Team 订阅账号通过设备码或 PKCE 登录，自动托管刷新 Token，推理走 chatgpt.com/backend-api/codex。',
    defaultBaseUrl: 'https://chatgpt.com/backend-api/codex',
    defaultModels: [],
    recommendedProvider: 'gpt',
  },
  oauth_xai: {
    label: 'xAI Grok OAuth（SuperGrok 订阅）',
    shortLabel: 'Grok OAuth',
    description:
      '使用 SuperGrok / X Premium+ 订阅账号通过设备码或 PKCE 登录，自动托管刷新 Token，推理走 cli-chat-proxy.grok.com/v1。',
    defaultBaseUrl: 'https://cli-chat-proxy.grok.com/v1',
    defaultModels: ['grok-imagine-image-2.0', 'grok-imagine-image-quality'],
    recommendedProvider: 'grok',
  },
}

export function normalizeSupplierAuthMode(raw: unknown): SupplierAuthMode {
  if (raw === 'oauth_openai_codex' || raw === 'oauth_xai') return raw
  return 'api_key'
}

export interface SupplierKeyDTO {
  id: string
  supplierId: string
  label: string
  credentialType: SupplierCredentialType
  apiKeyHint: string
  oauthExpiresAt: number
  oauthAccountId: string
  enabled: boolean
  cooldownUntil: number
  lastError: string
  lastUsedAt: number
  createdAt: number
  updatedAt: number
}

export interface SupplierQueriedModel {
  id: string
  ownedBy?: string
}

export function normalizeSupplierModelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().slice(0, 160)
    if (!trimmed || trimmed === 'custom' || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= 500) break
  }
  return result
}

export interface SupplierDTO {
  id: string
  name: string
  authMode: SupplierAuthMode
  baseUrl: string
  hasApiKey: boolean
  apiKeyHint: string
  keyCount: number
  activeKeyCount: number
  keys: SupplierKeyDTO[]
  models: string[]
  enabled: boolean
  note: string
  channelCount: number
  channels?: SupplierChannelRef[]
  createdAt: number
  updatedAt: number
}

export interface ProviderChannelDTO {
  id: string
  providerId: ImageProviderId
  profileId: string
  supplierId: string
  supplierName: string
  supplierAuthMode?: SupplierAuthMode
  supplierBaseUrl: string
  supplierEnabled: boolean
  supplierHasKey: boolean
  keyIds: string[]
  availableKeyCount?: number
  name: string
  enabled: boolean
  model: string
  customModel: string
  priority: number
  params: GptParams | GeminiParams | GrokParams | MuseParams | SeedreamParams
  createdAt: number
  updatedAt: number
}

export interface ModelProfileDTO {
  id: string
  providerId: ImageProviderId
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
  createdAt: number
  updatedAt: number
  channels: ProviderChannelDTO[]
}

export interface AdminProviderSlotDTO {
  providerId: ImageProviderId
  enabled: boolean
  creditCost: number
  sortOrder: number
  updatedAt: number
  usesEnvFallback?: boolean
  hasEnvKey?: boolean
  profiles: ModelProfileDTO[]
}

export interface AdminProviderConfig {
  providerId: ImageProviderId
  enabled: boolean
  creditCost: number
  baseUrl: string
  model: string
  customModel: string
  hasApiKey: boolean
  apiKeyHint: string
  params: GptParams | GeminiParams | GrokParams | MuseParams | SeedreamParams
  sortOrder: number
  updatedAt: number
}

export interface CreditLedgerItem {
  id: string
  userId: string
  username?: string
  userAdminNote?: string
  delta: number
  balanceAfter: number
  type: CreditLedgerType
  refId: string | null
  note: string
  operatorId: string | null
  createdAt: number
}

export interface RedeemCodeItem {
  id: string
  code: string
  credits: number
  maxUses: number
  usedCount: number
  expiresAt: number | null
  status: 'active' | 'disabled'
  note: string
  createdBy: string | null
  createdAt: number
}

export interface GenerationSnapshot {
  generationMode?: StudioGenerationMode
  userPrompt?: string
  remixGalleryItemId?: string
  recipe: RecipeState
  prompt: string
  stylePreset: string
  allowFaceStyleShift?: boolean
  allowPoseStyleShift?: boolean
  aspectRatio: GenerationAspectRatio
  resolution?: StudioResolution
  sceneNote?: string
  textFallbackOnly?: boolean
  provider: ImageProviderId
  profileId?: string
  profileName?: string
  model: string
}

export type GenerationAttemptTriggerType =
  | 'initial'
  | 'failover_switch'
  | 'transient_retry'
  | 'fallback_retry'
  | 'compat_downgrade'
  | 'text_fallback'

export interface GenerationTraceReference {
  index: number
  slot: 'portrait' | 'costume' | 'pose' | 'extra' | 'stitched'
  label: string
  sourceKind: 'gallery' | 'r2' | 'https'
  rawPath: string
  deliveryMode?: 'url' | 'base64' | 'multipart'
  mime?: string
  bytes?: number
}

export interface GenerationAttemptTrace {
  attemptIndex: number
  triggerType: GenerationAttemptTriggerType
  triggerReason: string
  previousError?: string | null
  delayMs: number
  startedAt: number
  finishedAt: number | null
  durationMs: number | null
  channelId: string
  channelName: string
  supplierId: string
  supplierName: string
  supplierKeyId?: string
  supplierKeyLabel?: string
  supplierKeyHint?: string
  provider: ImageProviderId
  model: string
  endpointMode: string
  request: {
    method: string
    url: string
    authSummary?: string
    params: Record<string, unknown>
  }
  response: {
    status: number | null
    ok: boolean
    requestId?: string | null
    body: unknown
    outputSummary?: {
      kind: 'b64_data' | 'external_url'
      externalUrl?: string
      mime: string
      bytes: number
    } | null
  } | null
  outcome: 'in_progress' | 'succeeded' | 'failed'
  error: string | null
  retryable?: boolean | null
  safetyBlocked?: boolean | null
}

export type GenerationLiveStage =
  | 'uploading'
  | 'queued'
  | 'deducted'
  | 'resolving_refs'
  | 'transcribing_refs'
  | 'generating'
  | 'text_generating'
  | 'retrying'
  | 'downloading_output'
  | 'saving'

export interface GenerationLiveState {
  stage: GenerationLiveStage
  message: string
  attempt?: number
  totalAttempts?: number
  startedAt?: number
  stageStartedAt?: number
  heartbeatAt?: number
  percent?: number
}

export interface GenerationTextFallbackInfo {
  triggered: boolean
  sourceJobId?: string | null
  poseCacheHit?: boolean
  costumeCacheHit?: boolean
  portraitCacheHit?: boolean
  extraCacheHits?: boolean[]
  poseDescription?: string
  costumeDescription?: string
  portraitDescription?: string
  extraDescriptions?: string[]
  visionModel?: string
  visionSupplierName?: string
  error?: string
}

export interface GenerationAuditTrace {
  version: 1
  startedAt: number
  finishedAt?: number | null
  totalDurationMs?: number | null
  creditsCost: number
  creditsRefunded: number
  profileId?: string
  profileName?: string
  requestedResolution?: StudioResolution | null
  imagePassMode: ImagePassMode
  sendStitchedSheet: boolean
  textFallbackAvailable?: boolean
  textFallbackChannelId?: string | null
  textFallbackConsumedJobId?: string | null
  textFallbackInfo?: GenerationTextFallbackInfo | null
  liveState?: GenerationLiveState | null
  promptBreakdown: {
    prefix: string
    suffix: string
    negativePrompt?: string
    sceneNote: string
    stylePreset: string
    styleLabel: string
    allowFaceStyleShift?: boolean
    allowPoseStyleShift?: boolean
    finalPrompt: string
  }
  references: GenerationTraceReference[]
  candidateChannels: Array<{
    order: number
    channelId: string
    channelName: string
    supplierName: string
    supplierKeyHint?: string
    supplierKeyLabel?: string
    model: string
    priority: number
  }>
  attempts: GenerationAttemptTrace[]
  result?: {
    r2Key: string
    mime: string
    bytes: number
    winningAttemptIndex: number
    winningChannelId: string
    winningChannelName: string
    winningSupplierName: string
    winningSupplierKeyHint?: string
    winningSupplierKeyLabel?: string
    winningModel: string
  } | null
  finalError?: string | null
}

export interface GenerationHistoryItem {
  id: string
  userId?: string
  username?: string
  createdAt: number
  startedAt?: number | null
  finishedAt?: number | null
  status: GenerationStatus
  creditsCost: number
  creditsRefunded: number
  provider: ImageProviderId
  profileId?: string | null
  profileName?: string | null
  resolution?: StudioResolution | null
  model: string
  channelId?: string | null
  channelName?: string | null
  supplierId?: string | null
  supplierName?: string | null
  prompt: string
  aspectRatio: GenerationAspectRatio
  stylePreset: string
  imageUrl: string
  recipeSummary: string
  errorMessage?: string | null
  queueInfo?: GenerationQueueInfo | null
  liveProgress?: GenerationLiveState | null
  snapshot?: GenerationSnapshot
  auditTrace?: GenerationAuditTrace | null
}

export interface AdminOverviewTrendPoint {
  date: string
  label: string
  jobsTotal: number
  jobsSucceeded: number
  jobsFailed: number
  creditsConsumed: number
}

export interface AdminOverviewRecentFailureItem {
  id: string
  username: string
  provider: ImageProviderId
  profileName: string | null
  channelName: string | null
  supplierName: string | null
  errorMessage: string
  createdAt: number
}

export interface AdminOverviewPayload {
  usersTotal: number
  activeUsersTotal: number
  creditsIssuedTotal: number
  creditsConsumedTotal: number
  jobsTotal: number
  jobsSucceeded: number
  jobsFailed: number
  jobsProcessing: number
  jobsQueued?: number
  redeemCodesTotal: number
  suppliersTotal: number
  profilesTotal?: number
  channelsTotal: number
  r2AssetsTotal: number
  r2TotalBytes: number
  encryptionConfigured: boolean
  allowRegistration?: boolean
  trend7d?: AdminOverviewTrendPoint[]
  recentFailures?: AdminOverviewRecentFailureItem[]
  staleProcessingCount?: number
}

export interface AdminQueueJobItem {
  id: string
  userId: string
  username: string
  provider: ImageProviderId
  profileId: string | null
  profileName: string | null
  resolution: StudioResolution | null
  model: string
  status: 'queued' | 'processing'
  creditsCost: number
  recipeSummary: string
  createdAt: number
  startedAt: number | null
  queueInfo?: GenerationQueueInfo | null
  liveStage?: GenerationLiveStage | null
  liveMessage?: string | null
}

export interface AdminQueueModelStat {
  key: string
  provider: ImageProviderId
  profileId: string | null
  profileName: string
  runningCount: number
  queuedCount: number
  concurrencyLimit: number
  hasOverride: boolean
  enabled: boolean
}

export interface AdminQueueSnapshotDTO {
  now: number
  config: GenerationQueueConfig
  summary: {
    globalRunning: number
    globalQueued: number
    maxGlobalConcurrency: number
    maxQueueSize: number
    activeUsers: number
  }
  runningJobs: AdminQueueJobItem[]
  queuedJobs: AdminQueueJobItem[]
  modelStats: AdminQueueModelStat[]
}

export interface AdminR2CleanupReport {
  orphanStyleKeysCount: number
  orphanStyleBytes: number
  expiredStitchedCount: number
  expiredStitchedBytes: number
  totalStitchedCount: number
  totalStitchedBytes: number
}

export interface AdminR2CleanupResult {
  deletedStylesCount: number
  deletedStitchedCount: number
  freedBytes: number
}

export interface AdminJobsStatsSummary {
  total: number
  succeeded: number
  failed: number
  processing: number
  queued?: number
  cancelled?: number
  retried: number
}

export interface MioSyncStatus {
  synced: boolean
  generated: string | null
  syncedAt: number | null
  checkedAt: number | null
  poseCount: number
  costumeCount: number
  poseVolumeCount: number
  costumeVolumeCount: number
  sourceSha256: string | null
  lastError: string | null
  archiveUrl: string
  dataUrl: string
  authorName: string
  authorHandle: string
  authorUrl: string
}

export interface MioGalleryPayload extends MioSyncStatus {
  poses: PoseItem[]
  costumes: CostumeItem[]
}

export interface OutfitDbSyncStatus {
  synced: boolean
  updated: string | null
  syncedAt: number | null
  checkedAt: number | null
  costumeCount: number
  familyCount: number
  sourceSha256: string | null
  lastError: string | null
  archiveUrl: string
  dataUrl: string
  authorName: string
  authorHandle: string
  authorUrl: string
}

export interface OutfitDbGalleryPayload extends OutfitDbSyncStatus {
  costumes: CostumeItem[]
}

export const GALLERY_CATEGORIES = [
  '写实人像',
  '二次元',
  '时尚穿搭',
  '光影氛围',
  '场景建筑',
  '创意艺术',
  '其他',
] as const

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number]
export type GalleryItemSourceType = 'user_t2i' | 'user_recipe' | 'x_sync'
export type GalleryItemStatus = 'pending' | 'published' | 'rejected' | 'hidden'
export type GallerySortOrder = 'featured' | 'latest' | 'remixes' | 'popular'

export interface GalleryPublicRecipeRef {
  pose?: { id: string; name: string; thumb: string; item?: PoseItem } | null
  costume?: { id: string; name: string; thumb: string; item?: CostumeItem } | null
  portrait?: { id: string; name: string; thumb: string; item?: PortraitItem } | null
  stylePreset?: string
  sceneNote?: string
  hasPrivateUploads?: boolean
}

export interface GalleryItemDTO {
  id: string
  sourceType: GalleryItemSourceType
  status: GalleryItemStatus
  authorUserId?: string | null
  authorName: string
  sourceJobId?: string | null
  xTweetId?: string | null
  xAuthorHandle?: string | null
  xAuthorName?: string | null
  xAuthorAvatar?: string | null
  xTweetUrl?: string | null
  title: string
  /** 仅在用户公开文生图提示词或 X 同步作品时返回；配方合图绝不返回内部编译指令 */
  promptText: string
  promptZh: string
  promptPublic: boolean
  recipePublic?: GalleryPublicRecipeRef | null
  aspectRatio: StudioAspectRatio
  width?: number | null
  height?: number | null
  profileName?: string | null
  stylePreset: string
  imageUrl: string
  thumbUrl: string
  imageMime: string
  imageBytes: number
  tags: string[]
  category: string
  likeCount: number
  bookmarkCount: number
  commentCount: number
  remixCount: number
  likedByMe?: boolean
  bookmarkedByMe?: boolean
  isFeatured: boolean
  reviewNote?: string
  reviewedAt?: number | null
  createdAt: number
  updatedAt: number
  publishedAt?: number | null
}

export interface GalleryCommentDTO {
  id: string
  itemId: string
  itemTitle?: string
  userId: string
  authorName: string
  authorAvatar?: string | null
  replyToId?: string | null
  replyToAuthorName?: string | null
  content: string
  createdAt: number
  canDelete: boolean
}

export interface GalleryListResponse {
  items: GalleryItemDTO[]
  total: number
}

export interface AdminGalleryStatsSummary {
  total: number
  pending: number
  published: number
  rejected: number
  hidden: number
  xSync: number
  userT2i: number
  userRecipe: number
}

export interface XSyncSourceDTO {
  id: string
  handle: string
  displayName: string
  autoPublish: boolean
  enabled: boolean
  note: string
  lastTweetId?: string | null
  lastSyncedAt?: number | null
  lastError?: string | null
  createdAt: number
  updatedAt: number
}

export interface ParsedXTweetPreview {
  tweetId: string
  tweetUrl: string
  authorHandle: string
  authorName: string
  authorAvatar?: string | null
  rawText: string
  suggestedPrompt: string
  suggestedTitle: string
  images: Array<{
    url: string
    width?: number
    height?: number
  }>
  suggestedAspectRatio: StudioAspectRatio
  alreadyExists?: boolean
}
