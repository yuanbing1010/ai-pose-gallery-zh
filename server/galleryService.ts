import {
  GALLERY_CATEGORIES,
  type GalleryItemDTO,
  type GalleryItemSourceType,
  type GalleryItemStatus,
  type GalleryPublicRecipeRef,
  type GenerationSnapshot,
  type ParsedXTweetPreview,
  type StudioAspectRatio,
  type XSyncSourceDTO,
} from '../shared/studio'
import { detectImageFormat } from './crypto'
import type { Env } from './types'
import { devProxyAwareFetch, safeExternalFetch } from './upstreamFetch'
import { readResponseBodyWithLimit, readResponseTextWithLimit, validateExternalImageUrl } from './validation'

export interface GalleryItemRow {
  id: string
  source_type: GalleryItemSourceType
  status: GalleryItemStatus
  author_user_id: string | null
  author_name: string
  source_job_id: string | null
  x_tweet_id: string | null
  x_author_handle: string | null
  x_author_name: string | null
  x_author_avatar: string | null
  x_tweet_url: string | null
  title: string
  prompt_text: string
  prompt_zh: string
  prompt_public: number
  recipe_public_json: string | null
  aspect_ratio: string
  width: number | null
  height: number | null
  profile_name: string | null
  style_preset: string
  image_r2_key: string
  thumb_r2_key: string | null
  image_mime: string
  image_bytes: number
  tags_json: string
  category: string
  like_count: number
  bookmark_count: number
  comment_count: number
  remix_count: number
  is_featured: number
  review_note: string
  reviewed_by: string | null
  reviewed_at: number | null
  created_at: number
  updated_at: number
  published_at: number | null
}

export interface XSyncSourceRow {
  id: string
  handle: string
  display_name: string
  auto_publish: number
  enabled: number
  note: string
  last_tweet_id: string | null
  last_synced_at: number | null
  last_error: string | null
  created_at: number
  updated_at: number
}

const VALID_RATIOS = new Set<StudioAspectRatio>(['3:4', '1:1', '4:3', '9:16', '16:9'])
const VALID_CATEGORIES = new Set<string>(GALLERY_CATEGORIES)
const MAX_INGEST_IMAGE_BYTES = 18 * 1024 * 1024

export function normalizeGalleryAspectRatio(raw?: string | null): StudioAspectRatio {
  if (raw && VALID_RATIOS.has(raw as StudioAspectRatio)) {
    return raw as StudioAspectRatio
  }
  return '3:4'
}

export function inferAspectRatioFromDims(width?: number, height?: number): StudioAspectRatio {
  if (!width || !height || width <= 0 || height <= 0) return '3:4'
  const r = width / height
  const candidates: Array<{ ratio: StudioAspectRatio; val: number }> = [
    { ratio: '1:1', val: 1 },
    { ratio: '3:4', val: 3 / 4 },
    { ratio: '4:3', val: 4 / 3 },
    { ratio: '9:16', val: 9 / 16 },
    { ratio: '16:9', val: 16 / 9 },
  ]
  let best = candidates[0]
  let bestDiff = Math.abs(r - best.val)
  for (const c of candidates.slice(1)) {
    const diff = Math.abs(r - c.val)
    if (diff < bestDiff) {
      best = c
      bestDiff = diff
    }
  }
  return best.ratio
}

export function normalizeGalleryCategory(raw?: string | null): string {
  const clean = (raw || '').trim()
  if (clean && VALID_CATEGORIES.has(clean)) return clean
  return '其他'
}

export function normalizeGalleryTags(raw: unknown): string[] {
  let list: string[] = []
  if (Array.isArray(raw)) {
    list = raw.map((x) => String(x || '').trim())
  } else if (typeof raw === 'string') {
    list = raw
      .split(/[,，#、\n]+/)
      .map((x) => x.trim())
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const clean = item.replace(/^#+/, '').trim().slice(0, 24)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length >= 8) break
  }
  return out
}

export function toGalleryMediaUrl(r2Key: string | null | undefined): string {
  if (!r2Key) return ''
  const filename = r2Key.replace(/^gallery\/public\//, '')
  return `/api/gallery/media/${encodeURIComponent(filename)}`
}

export function mapGalleryItemRow(
  row: GalleryItemRow,
  options: { viewerUserId?: string | null; isAdmin?: boolean } = {}
): GalleryItemDTO {
  const isOwner = Boolean(options.viewerUserId && row.author_user_id === options.viewerUserId)
  const isAdmin = Boolean(options.isAdmin)
  const promptPublic = row.prompt_public === 1

  // 严格遵守安全边界：user_recipe 绝不暴露内部编译指令；user_t2i 仅在公开或本人/管理员可见时返回
  const canExposePrompt =
    row.source_type === 'x_sync' ||
    (row.source_type === 'user_t2i' && (promptPublic || isOwner || isAdmin))

  let tags: string[] = []
  try {
    const parsed = JSON.parse(row.tags_json || '[]')
    if (Array.isArray(parsed)) {
      tags = parsed.map((x) => String(x || '')).filter(Boolean)
    }
  } catch {
    tags = []
  }

  let recipePublic: GalleryPublicRecipeRef | null = null
  if (row.recipe_public_json) {
    try {
      recipePublic = JSON.parse(row.recipe_public_json) as GalleryPublicRecipeRef
    } catch {
      recipePublic = null
    }
  }

  return {
    id: row.id,
    sourceType: row.source_type,
    status: row.status,
    authorUserId: isAdmin || isOwner ? row.author_user_id : undefined,
    authorName:
      row.source_type === 'x_sync'
        ? row.x_author_name || (row.x_author_handle ? `@${row.x_author_handle}` : 'X 精选')
        : row.author_name || '站内创作者',
    sourceJobId: isAdmin || isOwner ? row.source_job_id : undefined,
    xTweetId: row.x_tweet_id,
    xAuthorHandle: row.x_author_handle,
    xAuthorName: row.x_author_name,
    xAuthorAvatar: row.x_author_avatar,
    xTweetUrl: row.x_tweet_url,
    title: row.title || '',
    promptText: canExposePrompt ? row.prompt_text || '' : '',
    promptZh: canExposePrompt ? row.prompt_zh || '' : '',
    promptPublic,
    recipePublic,
    aspectRatio: normalizeGalleryAspectRatio(row.aspect_ratio),
    width: row.width,
    height: row.height,
    profileName: row.profile_name || null,
    stylePreset: row.style_preset || 'none',
    imageUrl: toGalleryMediaUrl(row.image_r2_key),
    thumbUrl: toGalleryMediaUrl(row.thumb_r2_key || row.image_r2_key),
    imageMime: row.image_mime || 'image/webp',
    imageBytes: Number(row.image_bytes || 0),
    tags,
    category: row.category || '其他',
    likeCount: Number(row.like_count || 0),
    bookmarkCount: Number(row.bookmark_count || 0),
    commentCount: Number(row.comment_count || 0),
    remixCount: Number(row.remix_count || 0),
    isFeatured: row.is_featured === 1,
    ...(isAdmin || isOwner
      ? {
          reviewNote: row.review_note || '',
          reviewedAt: row.reviewed_at ?? null,
        }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? null,
  }
}

export function mapXSyncSourceRow(row: XSyncSourceRow): XSyncSourceDTO {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name || `@${row.handle}`,
    autoPublish: row.auto_publish === 1,
    enabled: row.enabled === 1,
    note: row.note || '',
    lastTweetId: row.last_tweet_id,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 将用户的配方快照脱敏为可安全公开到画廊的配方引用：
 * - 绝不包含系统编译后的 prompt
 * - 绝不包含用户私有上传图片（source === 'upload' 或含 r2Key）
 */
export function buildSanitizedPublicRecipe(snapshot: GenerationSnapshot): GalleryPublicRecipeRef {
  const recipe = snapshot.recipe || { portrait: null, costume: null, pose: null }
  let hasPrivateUploads = false

  const isPrivateItem = (item: { source?: string; r2Key?: string } | null | undefined) =>
    Boolean(item && (item.source === 'upload' || item.r2Key))

  const pose =
    recipe.pose && !isPrivateItem(recipe.pose)
      ? {
          id: recipe.pose.id,
          name: recipe.pose.姿势名称 || recipe.pose.分类 || '动作姿势',
          thumb: recipe.pose.缩略图 || recipe.pose.原图 || '',
          item: recipe.pose,
        }
      : null
  if (isPrivateItem(recipe.pose)) hasPrivateUploads = true

  const costume =
    recipe.costume && !isPrivateItem(recipe.costume)
      ? {
          id: recipe.costume.id,
          name: recipe.costume.服装名称 || recipe.costume.分类 || '服装穿搭',
          thumb: recipe.costume.缩略图 || recipe.costume.原图 || '',
          item: recipe.costume,
        }
      : null
  if (isPrivateItem(recipe.costume)) hasPrivateUploads = true

  const portrait =
    recipe.portrait && !isPrivateItem(recipe.portrait)
      ? {
          id: recipe.portrait.id,
          name: recipe.portrait.发型名称 || recipe.portrait.标题 || '人像参考',
          thumb: recipe.portrait.缩略图 || recipe.portrait.原图 || '',
          item: recipe.portrait,
        }
      : null
  if (isPrivateItem(recipe.portrait)) hasPrivateUploads = true

  if (Array.isArray(recipe.extraImages) && recipe.extraImages.length > 0) {
    hasPrivateUploads = true
  }

  return {
    pose,
    costume,
    portrait,
    stylePreset: snapshot.stylePreset || 'none',
    sceneNote: (snapshot.sceneNote || '').trim() || undefined,
    hasPrivateUploads,
  }
}

/** 从 X/Twitter 链接中提取 tweetId 与可选 handle */
export function parseXTweetUrl(rawUrl: string): {
  tweetId: string
  handle: string | null
  canonicalUrl: string
} | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null
  if (/^\d{10,25}$/.test(trimmed)) {
    return {
      tweetId: trimmed,
      handle: null,
      canonicalUrl: `https://x.com/i/status/${trimmed}`,
    }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (
    host !== 'x.com' &&
    host !== 'twitter.com' &&
    host !== 'mobile.twitter.com' &&
    host !== 'mobile.x.com' &&
    host !== 'fxtwitter.com' &&
    host !== 'vxtwitter.com'
  ) {
    return null
  }
  const match = parsed.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d{10,25})/i)
  if (!match) return null
  const rawHandle = match[1]
  const handle = rawHandle && rawHandle.toLowerCase() !== 'i' ? rawHandle : null
  const tweetId = match[2]
  return {
    tweetId,
    handle,
    canonicalUrl: handle
      ? `https://x.com/${handle}/status/${tweetId}`
      : `https://x.com/i/status/${tweetId}`,
  }
}

/** 轻量清洗推文文本：去除 t.co 短链与末尾纯 hashtag 串 */
export function cleanTweetTextToPrompt(rawText: string): string {
  return rawText
    .replace(/https?:\/\/t\.co\/\S+/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 通过 fxtwitter 公共只读接口抓取单条 X 推文元信息与配图列表（用于管理员一键导入） */
export async function fetchXTweetPreview(
  rawUrl: string,
  env: Env
): Promise<ParsedXTweetPreview> {
  const parsed = parseXTweetUrl(rawUrl)
  if (!parsed) {
    throw new Error('请输入有效的 X / Twitter 推文链接（例如 https://x.com/user/status/123456...）')
  }

  const endpoint = parsed.handle
    ? `https://api.fxtwitter.com/${encodeURIComponent(parsed.handle)}/status/${parsed.tweetId}`
    : `https://api.fxtwitter.com/status/${parsed.tweetId}`

  const res = await devProxyAwareFetch(
    endpoint,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ai-pose-gallery-zh/2.0',
      },
      signal: AbortSignal.timeout(18_000),
    },
    env,
    18_000
  )

  if (!res.ok) {
    throw new Error(`抓取 X 推文失败（HTTP ${res.status}），可稍后重试或手动填写提示词与图片链接`)
  }

  const rawJsonText = await readResponseTextWithLimit(res, 1_048_576)
  const data = JSON.parse(rawJsonText) as {
    code?: number
    message?: string
    tweet?: {
      id?: string
      url?: string
      text?: string
      author?: {
        name?: string
        screen_name?: string
        avatar_url?: string
      }
      media?: {
        photos?: Array<{ url?: string; width?: number; height?: number }>
        all?: Array<{ type?: string; url?: string; width?: number; height?: number }>
      }
    }
  }

  const tweet = data?.tweet
  if (!tweet) {
    throw new Error(data?.message || '未解析到该推文内容，请确认推文为公开状态')
  }

  const photosRaw =
    Array.isArray(tweet.media?.photos) && tweet.media!.photos.length > 0
      ? tweet.media!.photos
      : Array.isArray(tweet.media?.all)
        ? tweet.media!.all.filter((m) => m.type === 'photo' && m.url)
        : []

  const images = photosRaw
    .filter((p): p is { url: string; width?: number; height?: number } => Boolean(p?.url))
    .map((p) => ({
      url: p.url,
      width: typeof p.width === 'number' ? p.width : undefined,
      height: typeof p.height === 'number' ? p.height : undefined,
    }))

  const authorHandle = (tweet.author?.screen_name || parsed.handle || '').replace(/^@+/, '')
  const authorName = tweet.author?.name || (authorHandle ? `@${authorHandle}` : 'X 博主')
  const rawText = (tweet.text || '').trim()
  const suggestedPrompt = cleanTweetTextToPrompt(rawText)
  const firstLine = suggestedPrompt.split('\n')[0]?.trim() || ''
  const suggestedTitle = firstLine
    ? `${firstLine.slice(0, 36)}${firstLine.length > 36 ? '…' : ''}`
    : `${authorName} 提示词作品`
  const firstImg = images[0]
  const suggestedAspectRatio = inferAspectRatioFromDims(firstImg?.width, firstImg?.height)

  const existing = await env.DB.prepare(
    `SELECT id FROM gallery_items WHERE x_tweet_id = ? LIMIT 1`
  )
    .bind(parsed.tweetId)
    .first<{ id: string }>()

  return {
    tweetId: parsed.tweetId,
    tweetUrl: authorHandle
      ? `https://x.com/${authorHandle}/status/${parsed.tweetId}`
      : parsed.canonicalUrl,
    authorHandle,
    authorName,
    authorAvatar: tweet.author?.avatar_url || null,
    rawText,
    suggestedPrompt,
    suggestedTitle,
    images,
    suggestedAspectRatio,
    alreadyExists: Boolean(existing),
  }
}

/** 下载公网安全 HTTPS 图片（防 SSRF + 魔数校验）并存入 R2 公共画廊前缀 */
export async function downloadExternalImageToGalleryR2(
  imageUrl: string,
  itemId: string,
  env: Env
): Promise<{ r2Key: string; mime: string; bytes: number }> {
  const validUrl = validateExternalImageUrl(imageUrl)
  if (!validUrl) {
    throw new Error('图片地址无效，仅允许公网 HTTPS 图片链接')
  }

  const res = await safeExternalFetch(
    validUrl.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'ai-pose-gallery-zh/2.0',
      },
      signal: AbortSignal.timeout(25_000),
    },
    env,
    25_000
  )

  if (!res.ok) {
    throw new Error(`下载外部图片失败（HTTP ${res.status}）`)
  }

  const bytes = await readResponseBodyWithLimit(res, MAX_INGEST_IMAGE_BYTES)
  if (bytes.byteLength === 0) {
    throw new Error('外部图片体积为空或超过 18MB 限制')
  }

  const detected = detectImageFormat(bytes)
  if (!detected) {
    throw new Error('下载的文件不是有效的 PNG / JPEG / WebP / GIF 图片')
  }

  const r2Key = `gallery/public/${itemId}.${detected.ext}`
  await env.BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: detected.mime },
    customMetadata: { galleryItemId: itemId, source: 'external_ingest' },
  })

  return {
    r2Key,
    mime: detected.mime,
    bytes: bytes.byteLength,
  }
}
