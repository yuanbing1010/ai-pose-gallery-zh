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
      { value: 'gpt-image-2.6-sunburst', label: 'gpt-image-2.6-sunburst (最新旗舰精细版)' },
      { value: 'gpt-image-2.6-flare', label: 'gpt-image-2.6-flare (最新高速版)' },
      { value: 'gpt-image-2.5-sunburst', label: 'gpt-image-2.5-sunburst' },
      { value: 'gpt-image-2.5-flare', label: 'gpt-image-2.5-flare' },
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
      { value: 'grok-imagine-image-2.0', label: 'grok-imagine-image-2.0 (最新旗舰 · 支持5图)' },
      { value: 'grok-imagine-image-quality', label: 'grok-imagine-image-quality' },
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
      { value: 'gemini-3.1-flash-image', label: 'gemini-3.1-flash-image (Nano Banana 2 正式版)' },
      { value: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview (预览版)' },
      { value: 'gemini-3.1-flash-lite-image', label: 'gemini-3.1-flash-lite-image (轻量高速版)' },
      { value: 'gemini-3-pro-image', label: 'gemini-3-pro-image (Nano Banana Pro 正式版)' },
      { value: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview (Pro 预览版)' },
      { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image (Nano Banana 1)' },
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
    specialty: '听话鬼才',
    bio: '领悟力天花板，复杂服饰层叠与细节补充指令丝毫不差',
    accent: '#19857B',
  },
  {
    id: 'grok',
    name: '星舰造像师',
    specialty: '光影锐度',
    bio: '擅长极致的材质光影锐度与电影质感大片，动态张力拉满',
    accent: '#6366F1',
  },
  {
    id: 'gemini',
    name: '蕉糖幻想家',
    specialty: '多图极稳',
    bio: '跨次元融合极稳，人像五官还原与柔光材质层次细腻',
    accent: '#E5A918',
  },
]

export function formatUserFacingGenerationError(
  rawMessage: string | null | undefined,
  provider: ImageProviderId
): string {
  const artist = getStudioArtist(provider)
  const raw = (rawMessage || '').trim()
  if (!raw) {
    return `${artist.name}不小心打翻了颜料盘，这张草稿没能画成，积分已全额退还~`
  }
  if (/429|rate.?limit|too many|busy|排期|繁忙|overload/i.test(raw)) {
    return `${artist.name}正在画室赶制大量约稿，暂时排不过来啦，请稍等片刻再试~`
  }
  if (/401|403|key|unauthorized|forbidden|尚未.*配置|暂未开放/i.test(raw)) {
    return `${artist.name}今天忘带画室钥匙啦（画室例行整备中），先试试旁边其他画师吧！`
  }
  if (/safety|prohibited|content_policy|moderation|blocked|policy|nsfw|sexual/i.test(raw)) {
    return `${artist.name}对这组灵感搭配有点拿捏不准边界，试试微调穿搭、姿势或补充描述后再画吧~`
  }
  if (/超时|timeout|network|fetch|internal error|502|503|504|500|连接|网络/i.test(raw)) {
    return `${artist.name}的灵感信号被宇宙电波短暂干扰了，积分已自动退还，点下方再试一次吧！`
  }
  if (/400|422|unsupported|does not support|invalid|格式|解析|未解析/i.test(raw)) {
    return `${artist.name}一时没对齐这组画笔的魔法暗号，请重新点击生成或切换其他画师试试~`
  }
  return `${artist.name}刚刚打了个盹，这次成图没能顺利显影，消耗的积分已全额退还！`
}

export function getStudioArtist(id: ImageProviderId): StudioArtistPersona {
  return STUDIO_ARTISTS.find((a) => a.id === id) ?? STUDIO_ARTISTS[0]
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
  label: '无预设（跟随参考图）',
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
  stylePromptOverrides?: Record<string, string>
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
  _stylePromptOverrides?: Record<string, string>,
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
  const cleaned = text.trim().replace(/[，,、]+$/, '')
  if (!cleaned) return ''
  return /[。！？；.!?;]$/.test(cleaned) ? cleaned : `${cleaned}。`
}

function joinChineseClauses(parts: string[], conj = '或'): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]}${conj}${parts[1]}`
  return `${parts.slice(0, -1).join('、')}${conj}${parts[parts.length - 1]}`
}

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
  followStyleClause: string
  baseConstraints: string
  posePriorityConstraint: string
  poseOnlyPriorityConstraint: string
  faceVisibilityConstraint: string
  portraitBuiltinNegative: string
}

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplateConfig = {
  intro: '请根据提供的 {{总数}} 张参考图（{{参考图序}}），生成一张完整的人物{{媒介}}：',
  poseClause:
    '让人物严格按照{{姿势图}}中人体模型的身体动作、四肢姿态、头部朝向与镜头角度摆姿势，明确区分正脸与后脑勺朝向（非纯粹背身时必须清晰展现头部正面或侧面轮廓）。',
  costumeClause:
    '让人物穿上{{服装图}}中展示的整套服装和配饰，每件单品的颜色、款式、面料与配饰都以{{服装图}}为准。',
  portraitFullClause:
    '人物的身份长相、脸型、五官特征、神态、发色与肤色严格以{{人像图}}为准（不沿用{{人像图}}的原始肢体动作与拍摄角度）；确保头身比例自然协调，双眉、双眼、鼻梁与嘴唇完整清晰显露在发丝之外，头发与刘海仅自然分布于头顶、两侧鬓角与脑后，严禁垂落头发遮挡眼睛或覆盖整张面部。',
  portraitWithPoseOnlyClause:
    '人物的身份长相、脸型、五官特征、神态、发色与肤色与原有服装严格以{{人像图}}为准（不沿用{{人像图}}的原始肢体动作与拍摄角度）；确保头身比例自然协调，双眉、双眼、鼻梁与嘴唇完整清晰显露在发丝之外，头发与刘海仅自然分布于头顶、两侧鬓角与脑后，严禁垂落头发遮挡眼睛或覆盖整张面部。',
  portraitOnlyClause:
    '{{人像图}}中的人物，保持其面部特征、脸型、五官、发型、发色、肤色一致，并确保眉眼鼻唇五官清晰外露、不被头发遮盖面部。',
  facelessClause: '生成无五官展示人物，全身肤色自然统一。',
  defaultPersonClause: '生成五官清晰、肤色自然的单一人物。',
  extraClause: '{{附图列表}}，按标注或合理画面关系自然融入图像。',
  followStyleClause: '沿用{{基准风格图}}参考图原本的视觉质感与成像风格。',
  baseConstraints:
    '1) 画面中没有任何文字、标志或水印。2) 确保人物从头到脚每处的肤色一致，头部、颈部、身体比例协调，服装及饰品穿戴自然贴合。',
  posePriorityConstraint:
    '人物的身体动作、四肢姿态、头部角度与镜头视角严格以{{姿势图}}为唯一事实依据（仅借鉴结构与朝向，不保留其无五官白模质感），忽略{{非姿势图}}中的原有动作与站位。',
  poseOnlyPriorityConstraint:
    '人物的身体动作、四肢姿态、头部角度与镜头视角严格以{{姿势图}}为唯一事实依据。',
  faceVisibilityConstraint:
    '面部区域必须保持干净完整与清晰可见：除非参考姿势明确为纯背面仅见后脑勺，否则人物五官（眉眼、鼻、嘴）必须朝向合理且完全不被头发、刘海或阴影遮盖。',
  portraitBuiltinNegative:
    '头发遮住整张脸，刘海完全挡住眼睛和五官，无五官空白脸，正反面头部朝向混淆',
}

export function mergePromptTemplate(
  raw?: Partial<PromptTemplateConfig> | null
): PromptTemplateConfig {
  const src = raw && typeof raw === 'object' ? raw : {}
  const pick = (key: keyof PromptTemplateConfig): string => {
    const val = src[key]
    return typeof val === 'string' ? val.trim().slice(0, 1500) : DEFAULT_PROMPT_TEMPLATE[key]
  }
  return {
    intro: pick('intro'),
    poseClause: pick('poseClause'),
    costumeClause: pick('costumeClause'),
    portraitFullClause: pick('portraitFullClause'),
    portraitWithPoseOnlyClause: pick('portraitWithPoseOnlyClause'),
    portraitOnlyClause: pick('portraitOnlyClause'),
    facelessClause: pick('facelessClause'),
    defaultPersonClause: pick('defaultPersonClause'),
    extraClause: pick('extraClause'),
    followStyleClause: pick('followStyleClause'),
    baseConstraints: pick('baseConstraints'),
    posePriorityConstraint: pick('posePriorityConstraint'),
    poseOnlyPriorityConstraint: pick('poseOnlyPriorityConstraint'),
    faceVisibilityConstraint: pick('faceVisibilityConstraint'),
    portraitBuiltinNegative: pick('portraitBuiltinNegative'),
  }
}

function renderPromptVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? '').trim()
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
    promptTemplate?: Partial<PromptTemplateConfig> | null
    stylePromptOverrides?: Record<string, string>
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
    name: (extra.name || '').trim(),
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

  if (poseIdx !== null) {
    const poseTag = refTag(poseIdx)
    const poseLine = renderPromptVars(tpl.poseClause, { 姿势图: poseTag })
    if (poseLine) bullets.push(`• 姿势：${poseLine}`)
  }

  if (costumeIdx !== null) {
    const costumeTag = refTag(costumeIdx)
    const costumeLine = renderPromptVars(tpl.costumeClause, { 服装图: costumeTag })
    if (costumeLine) bullets.push(`• 服装：${costumeLine}`)
  }

  if (portraitIdx !== null) {
    const portraitTag = refTag(portraitIdx)
    const poseTagOrEmpty = poseIdx !== null ? refTag(poseIdx) : ''
    const personTemplate =
      poseIdx !== null && costumeIdx !== null
        ? tpl.portraitFullClause
        : poseIdx !== null
          ? tpl.portraitWithPoseOnlyClause
          : tpl.portraitOnlyClause
    const personLine = renderPromptVars(personTemplate, {
      人像图: portraitTag,
      姿势图: poseTagOrEmpty,
    })
    if (personLine) bullets.push(`• 人物：${personLine}`)
  } else {
    const personLine = renderPromptVars(
      faceless ? tpl.facelessClause : tpl.defaultPersonClause,
      {}
    )
    if (personLine) bullets.push(`• 人物：${personLine}`)
  }

  if (extraRefs.length > 0) {
    const extraList = extraRefs
      .map((item) => (item.name ? `${refTag(item.index)}（${item.name}）` : refTag(item.index)))
      .join('、')
    const extraLine = renderPromptVars(tpl.extraClause, { 附图列表: extraList })
    if (extraLine) bullets.push(`• 补充参考：${extraLine}`)
  }

  const resolvedStyle = resolveStyleInfo(stylePreset, {
    stylePresets: promptOverrides?.stylePresets,
    styleCategories: promptOverrides?.styleCategories,
    styleSubcategories: promptOverrides?.styleSubcategories,
    stylePromptOverrides: promptOverrides?.stylePromptOverrides,
  })
  const effectiveStylePrompt = promptOverrides?.stylePrompt?.trim() || resolvedStyle.prompt
  if (effectiveStylePrompt) {
    bullets.push(`• 风格：${ensureSentenceEnd(effectiveStylePrompt)}`)
  } else {
    const baseStyleRefs = [portraitIdx, costumeIdx]
      .filter((n): n is number => n !== null)
      .map(refTag)
    const styleFollowClause =
      baseStyleRefs.length > 0
        ? renderPromptVars(tpl.followStyleClause, {
            基准风格图: joinChineseClauses(baseStyleRefs, '与'),
          })
        : '自然真实的视觉质感与协调光影。'
    if (styleFollowClause) bullets.push(`• 风格：${styleFollowClause}`)
  }

  const rawSceneNote = promptOverrides?.sceneNote?.trim() || ''
  if (rawSceneNote) {
    bullets.push(`• 额外要求：${ensureSentenceEnd(rawSceneNote)}`)
  }

  const constraintItems: string[] = []
  const baseConstraintText = renderPromptVars(tpl.baseConstraints, {})
  if (baseConstraintText) constraintItems.push(baseConstraintText)
  let nextConstraintNum = baseConstraintText
    ? baseConstraintText.includes('2)')
      ? 3
      : 2
    : 1

  if (poseIdx !== null) {
    const poseTag = refTag(poseIdx)
    const nonPoseTags = [costumeIdx, portraitIdx, ...extraRefs.map((item) => item.index)]
      .filter((n): n is number => n !== null)
      .map(refTag)
    if (nonPoseTags.length > 0) {
      const clause = renderPromptVars(tpl.posePriorityConstraint, {
        姿势图: poseTag,
        非姿势图: joinChineseClauses(nonPoseTags, '或'),
      })
      if (clause) constraintItems.push(`${nextConstraintNum++}) ${clause}`)
    } else {
      const clause = renderPromptVars(tpl.poseOnlyPriorityConstraint, {
        姿势图: poseTag,
      })
      if (clause) constraintItems.push(`${nextConstraintNum++}) ${clause}`)
    }
  }
  if (portraitIdx !== null) {
    const clause = renderPromptVars(tpl.faceVisibilityConstraint, {
      人像图: refTag(portraitIdx),
    })
    if (clause) constraintItems.push(`${nextConstraintNum++}) ${clause}`)
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

  const builtinPortraitNegative =
    portraitIdx !== null ? renderPromptVars(tpl.portraitBuiltinNegative, {}) : ''
  const effectiveNegative = mergeNegativePrompts(
    mergeNegativePrompts(
      promptOverrides?.negativePrompt,
      promptOverrides?.styleNegativePrompt ?? resolvedStyle.negativePrompt
    ),
    builtinPortraitNegative
  )

  const headerTags = Array.from({ length: totalRefs }, (_, i) => refTag(i)).join('、')
  const headerRefDesc = totalRefs === 1 ? headerTags : `依次为${headerTags}`
  const introLine = renderPromptVars(tpl.intro, {
    总数: String(totalRefs),
    参考图序: headerRefDesc,
    媒介: subjectMedia,
  })

  const lines: string[] = [
    ...(promptOverrides?.prefix?.trim() ? [promptOverrides.prefix.trim()] : []),
    ...(introLine ? [introLine] : []),
    ...bullets,
    ...(effectiveNegative ? [`避免：${effectiveNegative}`] : []),
    ...(promptOverrides?.suffix?.trim() ? [promptOverrides.suffix.trim()] : []),
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
  defaultSafeMode: boolean
  allowUserNsfwUnlock: boolean
  defaultStylePreset: string
  defaultPromptPrefix: string
  defaultPromptSuffix: string
  defaultNegativePrompt: string
  promptTemplate?: PromptTemplateConfig
  styleCategories: StyleCategoryItem[]
  styleSubcategories: StyleSubcategoryItem[]
  stylePresets: StylePresetItem[]
  stylePromptOverrides?: Record<string, string>
  imagePassMode: ImagePassMode
  sendStitchedSheet: boolean
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  registerBonusCredits: 50,
  allowRegistration: true,
  defaultSafeMode: true,
  allowUserNsfwUnlock: true,
  defaultStylePreset: 'none',
  defaultPromptPrefix: '',
  defaultPromptSuffix: '',
  defaultNegativePrompt: '',
  promptTemplate: { ...DEFAULT_PROMPT_TEMPLATE },
  styleCategories: [
    { id: 'acg', label: 'ACG' },
  ],
  styleSubcategories: [
    { id: 'acg_2d_anime', categoryId: 'acg', label: '2D动漫' },
    { id: 'acg_3d_anime', categoryId: 'acg', label: '3D动漫' },
    { id: 'acg_game', categoryId: 'acg', label: '游戏' },
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
        '吉卜力式日本手绘动画风格，自然圆润的面部轮廓，简洁而富有表现力的眼睛，含蓄简化的鼻子与嘴巴，自然协调的人物比例，细腻流畅的手绘线条，传统赛璐璐平涂，柔和水彩与水粉质感，温暖朴素的自然色彩，轻柔细腻的明暗过渡，充满生命力与手工温度的经典日本动画美学。',
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
  ],
  stylePromptOverrides: {},
  imagePassMode: 'url',
  sendStitchedSheet: false,
}

export interface PublicUser {
  id: string
  username: string
  email: string | null
  displayName: string
  role: UserRole
  creditBalance: number
  status: UserStatus
  createdAt: number
  lastLoginAt: number | null
}

export interface ProviderPublicInfo {
  providerId: ImageProviderId
  enabled: boolean
  configured: boolean
  creditCost: number
  sortOrder: number
  artist: StudioArtistPersona
}

export interface BootstrapPayload {
  user: PublicUser | null
  platform: PlatformConfig
  providers: ProviderPublicInfo[]
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
  createdAt: number
  updatedAt: number
}

export interface ProviderChannelDTO {
  id: string
  providerId: ImageProviderId
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

export interface AdminProviderSlotDTO {
  providerId: ImageProviderId
  enabled: boolean
  creditCost: number
  sortOrder: number
  updatedAt: number
  channels: ProviderChannelDTO[]
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
  aspectRatio: StudioAspectRatio
  sceneNote?: string
  provider: ImageProviderId
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
  channelsTotal: number
  r2AssetsTotal: number
  r2TotalBytes: number
  encryptionConfigured: boolean
}
