export type ImageProviderId = 'gemini' | 'gpt' | 'grok'
export type ImagePassMode = 'url' | 'base64'
export type UserRole = 'user' | 'admin'
export type UserStatus = 'active' | 'disabled'
export type CreditLedgerType =
  | 'register_bonus'
  | 'redeem_code'
  | 'admin_adjust'
  | 'generate_deduct'
  | 'generate_refund'
export type GenerationStatus = 'processing' | 'succeeded' | 'failed'

export interface PoseItem {
  source?: 'upload'
  useDepth?: boolean
  r2Key?: string
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
  source?: 'upload' | 'charadb' | 'gia-anime' | 'shisei'
  r2Key?: string
  views?: CostumeView[]
  selectedView?: string
  一级分类?: '现实' | '二次元'
  来源?: string
  来源地址?: string
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

export interface GptParams {
  endpointMode: 'images_edits_json' | 'images_edits' | 'responses' | 'chat'
  size: 'auto' | '1024x1536' | '1024x1024' | '1536x1024'
  quality: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  complexity?: 'auto' | 'low' | 'medium' | 'high'
  inputFidelity: 'high' | 'low'
  background: 'auto' | 'opaque' | 'transparent'
  outputFormat: 'png' | 'jpeg' | 'webp'
  moderation: 'auto' | 'low'
}

export interface GeminiParams {
  endpointMode: 'native' | 'openai_chat' | 'openai_edits_json' | 'openai_edits'
  authMode?: 'auto' | 'bearer' | 'goog_key' | 'both'
  aspectRatio: '3:4' | '1:1' | '4:3' | '9:16' | '16:9'
  imageSize: '1K' | '2K' | '4K'
}

export interface GrokParams {
  endpointMode: 'xai_edits' | 'openai_edits_json' | 'openai_edits' | 'openai_chat'
  aspectRatio: '3:4' | '1:1' | '4:3' | '9:16' | '16:9' | 'auto'
  resolution: '1k' | '2k'
  quality: 'auto' | 'low' | 'medium'
  responseFormat: 'b64_json' | 'url'
}

export type ProviderParamsMap = {
  gemini: GeminiParams
  gpt: GptParams
  grok: GrokParams
}

export interface ProviderModelOption {
  value: string
  label: string
}

export const PROVIDER_ORDER: ImageProviderId[] = ['gpt', 'grok', 'gemini']

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

export type StudioResolution = '1K' | '2K' | '4K'

export const STUDIO_RESOLUTION_ORDER: StudioResolution[] = ['1K', '2K', '4K']

export const PROVIDER_SUPPORTED_RESOLUTIONS: Record<ImageProviderId, StudioResolution[]> = {
  gpt: [],
  grok: ['1K', '2K'],
  gemini: ['1K', '2K', '4K'],
}

export const STUDIO_RESOLUTION_META: Record<
  StudioResolution,
  { label: string; hint: string; description: string }
> = {
  '1K': { label: '1K', hint: '标准', description: '快速响应 · 构图试错与高性价比出图' },
  '2K': { label: '2K', hint: '高清', description: '均衡推荐 · 细节锐度与速度的最佳平衡' },
  '4K': { label: '4K', hint: '超清', description: '极致细节 · 精绘壁纸与复杂服饰纹理首选' },
}

export interface ProfileResolutionOption {
  resolution: StudioResolution
  enabled: boolean
  creditCost: number
}

/**
 * 规范化模型档位的分辨率定价列表；对于不支持 1K/2K/4K 切换的厂商（如 GPT）返回空数组。
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
    return found ?? { resolution: res, enabled: true, creditCost: safeFallback }
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

export function buildAspectRatioPatches(ratio: StudioAspectRatio): {
  gemini: Partial<GeminiParams>
  gpt: Partial<GptParams>
  grok: Partial<GrokParams>
} {
  const opt = STUDIO_ASPECT_RATIOS.find((r) => r.id === ratio) ?? STUDIO_ASPECT_RATIOS[0]
  return {
    gemini: { aspectRatio: opt.id },
    gpt: { size: opt.gptSize },
    grok: { aspectRatio: opt.id },
  }
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

export interface StylePresetItem {
  id: string
  categoryId: string
  subcategoryId: string
  label: string
  shortLabel?: string
  tagline?: string
  prompt: string
  negativePrompt?: string
  previewUrl?: string
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
  | 'has_pose_and_others'
  | 'pose_only'
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
  { value: 'has_pose_and_others', label: '有姿势图且含其他参考图时' },
  { value: 'pose_only', label: '仅传姿势图（无其他参考图）时' },
  { value: 'has_pose', label: '有姿势图时' },
  { value: 'has_portrait', label: '有人像图时' },
  { value: 'no_portrait', label: '无人像图时' },
  { value: 'has_costume', label: '有服装图时' },
  { value: 'has_extra', label: '有附加参考图时' },
]

const VALID_CONSTRAINT_CONDITIONS = new Set<PromptConstraintCondition>(
  PROMPT_CONSTRAINT_CONDITION_OPTIONS.map((opt) => opt.value)
)

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
    text: '整张图片必须为单一连续的完整画面，严禁分屏、拼贴、多宫格、左右对比或同一人物在画面中重复出现。',
    enabled: true,
  },
  {
    id: 'c_skin_proportion',
    condition: 'always',
    text: '确保人物各露出部位肤色均匀一致，头部、颈部与身体比例自然协调，服装及饰品随实际姿势自然穿戴贴合；若姿势参考为半身或局部景别，优先保留该景别构图。',
    enabled: true,
  },
  {
    id: 'c_subject_count_pose',
    condition: 'has_pose',
    text: '画面中的人物数量与景别构图严格以{{姿势图}}为准（单人姿势图仅生成一位主体人物，除非额外要求另有说明），严禁擅自新增多余人物或分身。',
    enabled: true,
  },
  {
    id: 'c_pose_priority_others',
    condition: 'has_pose_and_others',
    text: '人物的脸部倾斜角度、身体动作和姿势严格以{{姿势图}}为唯一事实依据（仅借鉴结构与朝向，不保留其无五官白模质感），忽略{{非姿势图}}中的原有动作与站位。',
    enabled: true,
  },
  {
    id: 'c_pose_priority_only',
    condition: 'pose_only',
    text: '人物的脸部倾斜角度、身体动作和姿势严格以{{姿势图}}为唯一事实依据。',
    enabled: true,
  },
]

export interface PromptTemplateConfig {
  intro: string
  poseClause: string
  costumeClause: string
  portraitFullClause: string
  portraitWithPoseOnlyClause: string
  portraitOnlyClause: string
  facelessClause: string
  defaultPersonClause: string
  extraClause: string
  adaptiveCostumeClause: string
  adaptivePortraitFullClause: string
  adaptivePortraitWithPoseOnlyClause: string
  adaptivePortraitOnlyClause: string
  adaptivePortraitWithOwnOutfitOnlyClause: string
  adaptiveStyleSuffix: string
  constraints: PromptConstraintItem[]
}

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplateConfig = {
  intro:
    '请根据提供的 {{总数}} 张参考图（{{参考图序}}），生成单幅连续场景的人物{{媒介}}（整张图仅为一个完整画面，不要拆分成多格或左右对比图）：',
  poseClause:
    '让人物严格按照{{姿势图}}中人体模型的脸部倾斜角度、身体动作、头部朝向与镜头角度摆姿势。',
  costumeClause:
    '让人物穿上{{服装图}}中展示的整套服装和配饰，每件单品的颜色、款式、面料与配饰都以{{服装图}}为准。',
  portraitFullClause:
    '人物的身份长相、脸型、五官特征、神态、发型、发色与肤色严格以{{人像图}}为准（不沿用{{人像图}}的原始肢体动作与拍摄角度），并确保头身比例自然协调。',
  portraitWithPoseOnlyClause:
    '人物的身份长相、脸型、五官特征、神态、发型、发色、肤色与原有服装严格以{{人像图}}为准（不沿用{{人像图}}的原始肢体动作与拍摄角度），并确保头身比例自然协调。',
  portraitOnlyClause:
    '{{人像图}}中的人物，保持其面部特征、脸型、五官、发型、发色、肤色一致。',
  facelessClause: '生成无五官展示人物，全身肤色自然统一。',
  defaultPersonClause: '生成五官清晰、肤色自然的单一人物。',
  extraClause: '{{附图列表}}，按标注或合理画面关系自然融入图像。',
  adaptiveCostumeClause:
    '可参考{{服装图}}中的服装与配饰设计（大致保留配色与主要款式特征），无需拘泥于每处单品与面料的逐一还原，可随整体风格自然调整。',
  adaptivePortraitFullClause:
    '可参考{{人像图}}的发型、发色与整体人物神韵（不沿用{{人像图}}的原始肢体动作与拍摄角度），人物的长相、脸型、五官特征、神态与肤色等均可为契合风格适当调整，并确保头身比例自然协调。',
  adaptivePortraitWithPoseOnlyClause:
    '可参考{{人像图}}的发型、发色、神韵与大致穿搭印象（不沿用{{人像图}}的原始肢体动作与拍摄角度），人物的长相特征与服装配饰细节均可为契合风格适当调整，并确保头身比例自然协调。',
  adaptivePortraitOnlyClause:
    '可参考{{人像图}}的发型、发色与整体人物神韵，人物的面部特征、脸型、五官、神态与肤色等均可为契合风格适当调整。',
  adaptivePortraitWithOwnOutfitOnlyClause:
    '可参考{{人像图}}的发型、发色、神韵与大致穿搭印象，人物的面部特征与服饰配饰细节均可为契合风格适当调整。',
  adaptiveStyleSuffix:
    '尽量让人物的脸部和服装为当前风格做出调整，以完全适配整体风格。',
  constraints: DEFAULT_PROMPT_CONSTRAINTS.map((c) => ({ ...c })),
}

export function createDefaultPromptTemplate(): PromptTemplateConfig {
  return {
    ...DEFAULT_PROMPT_TEMPLATE,
    constraints: DEFAULT_PROMPT_CONSTRAINTS.map((c) => ({ ...c })),
  }
}

const LEGACY_DEFAULT_FACE_VISIBILITY_CONSTRAINT =
  '面部区域必须保持干净完整与清晰可见：除非参考姿势明确为纯背面仅见后脑勺，否则人物五官（眉眼、鼻、嘴）必须朝向合理且完全不被头发、刘海或阴影遮盖。'

function splitLegacyBaseConstraints(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  const parts = trimmed
    .split(/(?:^|(?<=[。！？；.!?\s]))\d+\s*[)）]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [trimmed]
}

export function mergePromptTemplate(
  raw?: Partial<PromptTemplateConfig> | Record<string, unknown> | null,
  options?: { preserveWhitespace?: boolean }
): PromptTemplateConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const preserveWhitespace = Boolean(options?.preserveWhitespace)

  const pickString = (
    key: Exclude<keyof PromptTemplateConfig, 'constraints'>
  ): string => {
    const val = src[key]
    if (typeof val !== 'string') return DEFAULT_PROMPT_TEMPLATE[key]
    return preserveWhitespace ? val.slice(0, 1500) : val.trim().slice(0, 1500)
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
      const condition: PromptConstraintCondition = VALID_CONSTRAINT_CONDITIONS.has(
        rawCondition as PromptConstraintCondition
      )
        ? (rawCondition as PromptConstraintCondition)
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
  } else if (
    'baseConstraints' in src ||
    'posePriorityConstraint' in src ||
    'poseOnlyPriorityConstraint' in src ||
    'faceVisibilityConstraint' in src
  ) {
    constraints = []
    if (typeof src.baseConstraints === 'string') {
      const parts = splitLegacyBaseConstraints(src.baseConstraints)
      parts.forEach((part, idx) => {
        constraints.push({
          id: `c_base_${idx + 1}`,
          condition: 'always',
          text: part.slice(0, 1500),
          enabled: true,
        })
      })
    }
    if (typeof src.posePriorityConstraint === 'string' && src.posePriorityConstraint.trim()) {
      constraints.push({
        id: 'c_pose_priority_others',
        condition: 'has_pose_and_others',
        text: src.posePriorityConstraint.trim().slice(0, 1500),
        enabled: true,
      })
    }
    if (
      typeof src.poseOnlyPriorityConstraint === 'string' &&
      src.poseOnlyPriorityConstraint.trim()
    ) {
      constraints.push({
        id: 'c_pose_priority_only',
        condition: 'pose_only',
        text: src.poseOnlyPriorityConstraint.trim().slice(0, 1500),
        enabled: true,
      })
    }
    if (typeof src.faceVisibilityConstraint === 'string') {
      const customFaceClause = src.faceVisibilityConstraint.trim()
      if (customFaceClause && customFaceClause !== LEGACY_DEFAULT_FACE_VISIBILITY_CONSTRAINT) {
        constraints.push({
          id: 'c_custom_portrait',
          condition: 'has_portrait',
          text: customFaceClause.slice(0, 1500),
          enabled: true,
        })
      }
    }
  } else {
    constraints = DEFAULT_PROMPT_CONSTRAINTS.map((c) => ({ ...c }))
  }

  return {
    intro: pickString('intro'),
    poseClause: pickString('poseClause'),
    costumeClause: pickString('costumeClause'),
    portraitFullClause: pickString('portraitFullClause'),
    portraitWithPoseOnlyClause: pickString('portraitWithPoseOnlyClause'),
    portraitOnlyClause: pickString('portraitOnlyClause'),
    facelessClause: pickString('facelessClause'),
    defaultPersonClause: pickString('defaultPersonClause'),
    extraClause: pickString('extraClause'),
    adaptiveCostumeClause: pickString('adaptiveCostumeClause'),
    adaptivePortraitFullClause: pickString('adaptivePortraitFullClause'),
    adaptivePortraitWithPoseOnlyClause: pickString('adaptivePortraitWithPoseOnlyClause'),
    adaptivePortraitOnlyClause: pickString('adaptivePortraitOnlyClause'),
    adaptivePortraitWithOwnOutfitOnlyClause: pickString('adaptivePortraitWithOwnOutfitOnlyClause'),
    adaptiveStyleSuffix: pickString('adaptiveStyleSuffix'),
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
  }
): boolean {
  switch (condition) {
    case 'always':
      return true
    case 'has_pose':
      return ctx.hasPose
    case 'has_pose_and_others':
      return ctx.hasPose && ctx.hasOthersWithPose
    case 'pose_only':
      return ctx.hasPose && !ctx.hasOthersWithPose
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
    promptTemplate?: Partial<PromptTemplateConfig> | null
    poseSanitize?: Partial<PoseSanitizeConfig> | null
    stylePresets?: StylePresetItem[]
    styleCategories?: StyleCategoryItem[]
    styleSubcategories?: StyleSubcategoryItem[]
  }
): string {
  const tpl = mergePromptTemplate(promptOverrides?.promptTemplate)
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
    extraRefs.length === 0
  ) {
    return '请先选择姿势/服装/人像或上传附加参考图。'
  }

  const refTag = (n: number) => `<IMAGE_${n}>`
  const totalRefs =
    (poseIdx !== null ? 1 : 0) +
    (costumeIdx !== null ? 1 : 0) +
    (portraitIdx !== null ? 1 : 0) +
    extraRefs.length

  const faceless = portraitIdx === null && costumeIdx !== null && poseIdx !== null
  const bullets: string[] = []

  const poseTagOrEmpty = poseIdx !== null ? refTag(poseIdx) : ''
  const poseTitle = sanitizePoseTitleForCloud(recipe.pose, promptOverrides?.poseSanitize)
  const poseClauseTag = poseTagOrEmpty
    ? poseTitle
      ? `${poseTagOrEmpty}(${poseTitle})`
      : poseTagOrEmpty
    : ''
  const costumeTagOrEmpty = costumeIdx !== null ? refTag(costumeIdx) : ''
  const portraitTagOrEmpty = portraitIdx !== null ? refTag(portraitIdx) : ''
  const extraList = extraRefs
    .map((item) => (item.name ? `${refTag(item.index)}（${item.name}）` : refTag(item.index)))
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

  if (poseIdx !== null) {
    const poseLine = renderPromptVars(tpl.poseClause.replace(/\r\n?/g, '\n'), {
      姿势图: poseClauseTag,
    })
    if (poseLine) bullets.push(`• 姿势：${poseLine}`)
  }

  if (costumeIdx !== null) {
    const costumeTpl = applyFaceStyleShift ? tpl.adaptiveCostumeClause : tpl.costumeClause
    const costumeLine = renderPromptVars(costumeTpl.replace(/\r\n?/g, '\n'), {
      服装图: costumeTagOrEmpty,
    })
    if (costumeLine) bullets.push(`• 服装：${costumeLine}`)
  }

  if (portraitIdx !== null) {
    const personTemplate = applyFaceStyleShift
      ? poseIdx !== null && costumeIdx !== null
        ? tpl.adaptivePortraitFullClause
        : poseIdx !== null
          ? tpl.adaptivePortraitWithPoseOnlyClause
          : costumeIdx !== null
            ? tpl.adaptivePortraitOnlyClause
            : tpl.adaptivePortraitWithOwnOutfitOnlyClause
      : poseIdx !== null && costumeIdx !== null
        ? tpl.portraitFullClause
        : poseIdx !== null
          ? tpl.portraitWithPoseOnlyClause
          : tpl.portraitOnlyClause
    const personLine = renderPromptVars(personTemplate.replace(/\r\n?/g, '\n'), {
      人像图: portraitTagOrEmpty,
      姿势图: poseTagOrEmpty,
    })
    if (personLine) bullets.push(`• 人物：${personLine}`)
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
  }

  if (effectiveStylePrompt) {
    const baseStyleText = ensureSentenceEnd(effectiveStylePrompt)
    const adaptiveSuffix = tpl.adaptiveStyleSuffix.replace(/\r\n?/g, '\n').trim()
    const styleLine =
      applyFaceStyleShift && adaptiveSuffix
        ? `${baseStyleText}${ensureSentenceEnd(adaptiveSuffix)}`
        : baseStyleText
    bullets.push(`• 风格：${styleLine}`)
  }

  const rawSceneNote = (promptOverrides?.sceneNote || '').replace(/\r\n?/g, '\n').trim()
  if (rawSceneNote) {
    bullets.push(`• 额外要求：${ensureSentenceEnd(rawSceneNote)}`)
  }

  const nonPoseTags = [costumeIdx, portraitIdx, ...extraRefs.map((item) => item.index)]
    .filter((n): n is number => n !== null)
    .map(refTag)
  const conditionCtx = {
    hasPose: poseIdx !== null,
    hasCostume: costumeIdx !== null,
    hasPortrait: portraitIdx !== null,
    hasExtra: extraRefs.length > 0,
    hasOthersWithPose: nonPoseTags.length > 0,
  }
  const constraintVars = {
    姿势图: poseTagOrEmpty,
    服装图: costumeTagOrEmpty,
    人像图: portraitTagOrEmpty,
    附图列表: extraList,
    非姿势图: joinChineseClauses(nonPoseTags, '或'),
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

  const headerTags = Array.from({ length: totalRefs }, (_, i) => refTag(i)).join('、')
  const headerRefDesc = totalRefs === 1 ? headerTags : `依次为${headerTags}`
  const introLine = renderPromptVars(tpl.intro.replace(/\r\n?/g, '\n'), {
    总数: String(totalRefs),
    参考图序: headerRefDesc,
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

export function poseThumbPath(pose: PoseItem, useDepth = Boolean(pose.useDepth)): string {
  const raw = pose.缩略图
  if (pose.source === 'upload' || !useDepth || /^(data:|https?:\/\/)/i.test(raw)) return raw
  const clean = raw.replace(/^\/+/, '')
  if (clean.startsWith('thumbs/depth/')) return raw
  if (clean.startsWith('thumbs/')) {
    return `thumbs/depth/${clean.slice('thumbs/'.length).replace(/\.(jpe?g|png)$/i, '.webp')}`
  }
  return raw
}

export function poseImagePath(pose: PoseItem, useDepth = Boolean(pose.useDepth)): string {
  const raw = pose.原图 || pose.缩略图
  if (pose.source === 'upload' || !useDepth || /^(data:|https?:\/\/)/i.test(raw)) return raw
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

export interface PlatformConfig {
  registerBonusCredits: number
  allowRegistration: boolean
  defaultStylePreset: string
  defaultPromptPrefix: string
  defaultPromptSuffix: string
  defaultNegativePrompt: string
  promptTemplate?: PromptTemplateConfig
  poseSanitize?: PoseSanitizeConfig
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
  defaultNegativePrompt: '分屏，拼图，多宫格，多视图，对比图，重复人物，双胞胎',
  promptTemplate: createDefaultPromptTemplate(),
  poseSanitize: createDefaultPoseSanitizeConfig(),
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
      prompt:
        '真实手机前置摄像头自拍风格，近距离手持自拍视角，自然随意的生活化姿态与表情，轻微广角透视，真实细腻的皮肤纹理与自然瑕疵，手机计算摄影特有的清晰度与HDR效果，自然环境光，未经刻意修饰的色彩，原汁原味的日常手机自拍质感。',
    },
    {
      id: 'photo_mirror_selfie',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '对镜自拍',
      prompt:
        '真实手机原相机镜面自拍风格，通过镜子反射拍摄人物，手机自然出现在镜面画面中，真实还原人物与镜面空间关系，自然随意的生活化姿态，真实细腻的皮肤与环境细节，手机计算摄影的清晰度与HDR效果，自然室内光线，未经刻意修饰的日常手机摄影质感。',
    },
    {
      id: 'photo_pov',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '第一人称POV',
      prompt:
        '真实手机第一人称POV拍摄风格，以拍摄者的主观视角呈现人物，镜头模拟拍摄者本人视线高度与观察距离，人物仿佛正在与镜头前的拍摄者互动，自然的眼神交流与生活化动作，真实环境光，细腻自然的皮肤纹理，轻微广角透视，手机原相机的真实成像与HDR质感。',
    },
    {
      id: 'photo_candid',
      categoryId: 'photography',
      subcategoryId: 'photo_phone',
      label: '第三人称抓拍',
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

export interface SupplierDTO {
  id: string
  name: string
  baseUrl: string
  hasApiKey: boolean
  apiKeyHint: string
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
  supplierBaseUrl: string
  supplierEnabled: boolean
  supplierHasKey: boolean
  name: string
  enabled: boolean
  model: string
  customModel: string
  priority: number
  params: GptParams | GeminiParams | GrokParams
  createdAt: number
  updatedAt: number
}

export interface ModelProfileDTO {
  id: string
  providerId: ImageProviderId
  displayName: string
  badge: string
  tagline: string
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
  params: GptParams | GeminiParams | GrokParams
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
  recipe: RecipeState
  prompt: string
  stylePreset: string
  allowFaceStyleShift?: boolean
  aspectRatio: StudioAspectRatio
  resolution?: StudioResolution
  sceneNote?: string
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
  finishedAt: number
  durationMs: number
  channelId: string
  channelName: string
  supplierId: string
  supplierName: string
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
  outcome: 'succeeded' | 'failed'
  error: string | null
  retryable?: boolean | null
  safetyBlocked?: boolean | null
}

export type GenerationLiveStage =
  | 'uploading'
  | 'deducted'
  | 'resolving_refs'
  | 'generating'
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
  percent?: number
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
  liveState?: GenerationLiveState | null
  promptBreakdown: {
    prefix: string
    suffix: string
    negativePrompt?: string
    sceneNote: string
    stylePreset: string
    styleLabel: string
    allowFaceStyleShift?: boolean
    finalPrompt: string
  }
  references: GenerationTraceReference[]
  candidateChannels: Array<{
    order: number
    channelId: string
    channelName: string
    supplierName: string
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
    winningModel: string
  } | null
  finalError?: string | null
}

export interface GenerationHistoryItem {
  id: string
  userId?: string
  username?: string
  createdAt: number
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
  aspectRatio: StudioAspectRatio
  stylePreset: string
  imageUrl: string
  recipeSummary: string
  errorMessage?: string | null
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
  retried: number
}
