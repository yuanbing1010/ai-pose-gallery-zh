import {
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  buildAspectRatioPatches,
  poseImagePath,
  type GeminiParams,
  type GenerationAttemptTrace,
  type GenerationAttemptTriggerType,
  type GenerationTraceReference,
  type GptParams,
  type GrokParams,
  type ImagePassMode,
  type RecipeState,
  type StudioAspectRatio,
} from '../shared/studio'
import { base64ToBytes, bytesToBase64, detectImageFormat } from './crypto'
import type { RunnableChannel } from './db'
import type { Env } from './types'
import { isPrivateOrLocalHostname, sanitizeGalleryAssetPath, validateExternalImageUrl } from './validation'

export class UpstreamError extends Error {
  retryable: boolean
  safetyBlocked: boolean
  status?: number

  constructor(message: string, retryable = false, status?: number, safetyBlocked = false) {
    super(message)
    this.name = 'UpstreamError'
    this.retryable = retryable
    this.status = status
    this.safetyBlocked = safetyBlocked
  }
}

export type ResolvedSource = (
  | { kind: 'r2'; r2Key: string }
  | { kind: 'gallery'; path: string }
  | { kind: 'https'; url: string }
) & {
  slot: 'portrait' | 'costume' | 'pose' | 'extra' | 'stitched'
  label: string
  rawPath: string
}

export interface GenerationTraceContext {
  nextAttemptIndex: () => number
  triggerType: GenerationAttemptTriggerType
  triggerReason: string
  previousError?: string | null
  delayMs: number
  onAttempt: (attempt: GenerationAttemptTrace) => void
  onReferencesResolved?: (refs: GenerationTraceReference[]) => void
}

interface LoadedImage {
  bytes: Uint8Array
  mime: string
  ext: string
  dataUrl: string
  base64: string
}

const MAX_REF_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_IMAGE_BYTES = 25 * 1024 * 1024

function toPublicGalleryCdnUrl(cleanPath: string): string {
  if (cleanPath.startsWith('img/portrait/')) {
    const filename = cleanPath.slice('img/portrait/'.length).replace(/\.webp$/i, '.png')
    return `https://ai-portrait-gallery.pages.dev/img/${filename}`
  }
  if (cleanPath.startsWith('thumbs/portrait/')) {
    return `https://ai-portrait-gallery.pages.dev/thumbs/${cleanPath.slice('thumbs/portrait/'.length)}`
  }
  if (cleanPath.startsWith('img/costume/') || cleanPath.startsWith('thumbs/costume/')) {
    return `https://ai-costume-gallery.pages.dev/${cleanPath}`
  }
  if (cleanPath.startsWith('img/depth/')) {
    const filename = cleanPath.slice('img/depth/'.length).replace(/\.webp$/i, '.png')
    return `https://ai-pose-depth-gallery.pages.dev/img/${filename}`
  }
  if (cleanPath.startsWith('thumbs/depth/')) {
    const filename = cleanPath.slice('thumbs/depth/'.length).replace(/\.webp$/i, '.jpg')
    return `https://ai-pose-depth-gallery.pages.dev/thumbs/${filename}`
  }
  return `https://ai-pose-gallery.pages.dev/${cleanPath}`
}

function classifySource(
  rawPath: string | undefined,
  r2Key: string | undefined,
  userId: string,
  meta: { slot: ResolvedSource['slot']; label: string }
): ResolvedSource | null {
  if (r2Key) {
    if (!r2Key.startsWith(`uploads/${userId}/`)) {
      throw new Error('无权引用其他用户上传的图片')
    }
    return { kind: 'r2', r2Key, slot: meta.slot, label: meta.label, rawPath: r2Key }
  }
  if (!rawPath) return null
  if (/^https:\/\//i.test(rawPath)) {
    const validated = validateExternalImageUrl(rawPath)
    if (!validated) throw new Error('外部参考图链接不合法或存在安全风险')
    const urlStr = validated.toString()
    return { kind: 'https', url: urlStr, slot: meta.slot, label: meta.label, rawPath: urlStr }
  }
  if (/^data:/i.test(rawPath)) {
    throw new Error('参考图未完成云端上传，请重试')
  }
  const clean = sanitizeGalleryAssetPath(rawPath)
  if (!clean) {
    throw new Error('非法的参考图路径')
  }
  return { kind: 'gallery', path: clean, slot: meta.slot, label: meta.label, rawPath: clean }
}

export function extractRecipeSources(
  recipe: RecipeState,
  userId: string,
  stitchedR2Key?: string
): { refs: ResolvedSource[]; stitched?: ResolvedSource } {
  const refs: ResolvedSource[] = []

  if (recipe.pose) {
    const src = classifySource(poseImagePath(recipe.pose), recipe.pose.r2Key, userId, {
      slot: 'pose',
      label: recipe.pose.姿势名称 || '姿势参考',
    })
    if (src) refs.push(src)
  }

  if (recipe.costume) {
    const src = classifySource(
      recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图,
      recipe.costume.r2Key,
      userId,
      { slot: 'costume', label: recipe.costume.服装名称 || '服装参考' }
    )
    if (src) refs.push(src)
  }

  if (recipe.portrait) {
    const src = classifySource(
      recipe.portrait.原图 || recipe.portrait.缩略图,
      recipe.portrait.r2Key,
      userId,
      { slot: 'portrait', label: recipe.portrait.发型名称 || recipe.portrait.标题 || '人像参考' }
    )
    if (src) refs.push(src)
  }

  for (const extra of recipe.extraImages || []) {
    const src = classifySource(extra.url, extra.r2Key, userId, {
      slot: 'extra',
      label: extra.name || '附加参考',
    })
    if (src) refs.push(src)
  }

  const stitched = stitchedR2Key
    ? classifySource(undefined, stitchedR2Key, userId, {
        slot: 'stitched',
        label: '三合一拼图卡片',
      }) || undefined
    : undefined
  return { refs, stitched }
}

async function readResponseImage(res: Response, maxBytes: number): Promise<LoadedImage> {
  if (!res.ok) {
    throw new UpstreamError(`读取图片失败 (HTTP ${res.status})`, res.status >= 500 || res.status === 429, res.status)
  }
  const lenHeader = Number(res.headers.get('content-length') || '0')
  if (Number.isFinite(lenHeader) && lenHeader > maxBytes) {
    throw new Error('图片体积超出限制')
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error('图片大小异常或超出限制')
  }
  const detected = detectImageFormat(bytes)
  if (!detected) {
    throw new Error('不支持的图片格式（仅支持 PNG/JPEG/WebP/GIF）')
  }
  const base64 = bytesToBase64(bytes)
  return {
    bytes,
    mime: detected.mime,
    ext: detected.ext,
    base64,
    dataUrl: `data:${detected.mime};base64,${base64}`,
  }
}

async function loadImageAsset(source: ResolvedSource, env: Env): Promise<LoadedImage> {
  if (source.kind === 'r2') {
    const obj = await env.BUCKET.get(source.r2Key)
    if (!obj) throw new Error('找不到已上传的参考图，请重新上传')
    const bytes = new Uint8Array(await obj.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_REF_IMAGE_BYTES) {
      throw new Error('参考图大小异常')
    }
    const detected = detectImageFormat(bytes)
    if (!detected) throw new Error('参考图格式无效')
    const base64 = bytesToBase64(bytes)
    return {
      bytes,
      mime: detected.mime,
      ext: detected.ext,
      base64,
      dataUrl: `data:${detected.mime};base64,${base64}`,
    }
  }

  if (source.kind === 'gallery') {
    try {
      const assetRes = await env.ASSETS.fetch(new Request(`https://assets.local/${source.path}`))
      const ct = (assetRes.headers.get('content-type') || '').toLowerCase()
      if (assetRes.ok && ct.startsWith('image/')) {
        return await readResponseImage(assetRes, MAX_REF_IMAGE_BYTES)
      }
    } catch {
      // ignore and fall through
    }

    if (env.DEV_ASSETS_ORIGIN) {
      const devOrigins = Array.from(
        new Set([
          env.DEV_ASSETS_ORIGIN.replace(/\/+$/, ''),
          env.DEV_ASSETS_ORIGIN.replace('127.0.0.1', 'localhost').replace(/\/+$/, ''),
          env.DEV_ASSETS_ORIGIN.replace('localhost', '127.0.0.1').replace(/\/+$/, ''),
        ])
      )
      for (const origin of devOrigins) {
        try {
          const devUrl = `${origin}/${source.path}`
          const devRes = await fetch(devUrl, { signal: AbortSignal.timeout(10_000) })
          const ct = (devRes.headers.get('content-type') || '').toLowerCase()
          if (devRes.ok && ct.startsWith('image/')) {
            return await readResponseImage(devRes, MAX_REF_IMAGE_BYTES)
          }
        } catch {
          // try next dev origin
        }
      }
    }

    const cdnUrl = toPublicGalleryCdnUrl(source.path)
    const cdnRes = await fetch(cdnUrl, { signal: AbortSignal.timeout(20_000) })
    const cdnCt = (cdnRes.headers.get('content-type') || '').toLowerCase()
    if (!cdnRes.ok || !cdnCt.startsWith('image/')) {
      throw new Error(`无法读取本地或 CDN 参考图（${source.path}），请确认开发服务器已启动`)
    }
    return await readResponseImage(cdnRes, MAX_REF_IMAGE_BYTES)
  }

  const extRes = await devProxyAwareFetch(
    source.url,
    { method: 'GET', signal: AbortSignal.timeout(20_000) },
    env
  )
  return await readResponseImage(extRes, MAX_REF_IMAGE_BYTES)
}

function isPublicHttpsOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && !isPrivateOrLocalHostname(u.hostname)
  } catch {
    return false
  }
}

export function buildGeminiNativeEndpoint(baseUrl: string, model: string): {
  endpointUrl: string
  isOfficialGoogle: boolean
  isVertexEndpoint: boolean
} {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  const parsed = new URL(clean)
  const host = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname.replace(/\/+$/, '')
  const baseNoQuery = `${parsed.origin}${pathname}`
  const search = parsed.search || ''

  const isGoogleAiStudio = host === 'generativelanguage.googleapis.com'
  const isGoogleVertexHost =
    host === 'aiplatform.googleapis.com' || host.endsWith('-aiplatform.googleapis.com')
  const isVertexEndpoint =
    isGoogleVertexHost ||
    /\/publishers\/[^/]+(?:\/|$)/i.test(pathname) ||
    /\/projects\/[^/]+\/locations\//i.test(pathname)
  const isOfficialGoogle = isGoogleAiStudio || isGoogleVertexHost
  const encodedModel = encodeURIComponent(model)

  // 1. 已完整填写 :generateContent / :streamGenerateContent
  if (/:(?:stream)?generateContent$/i.test(pathname)) {
    return { endpointUrl: `${baseNoQuery}${search}`, isOfficialGoogle, isVertexEndpoint }
  }
  // 2. 已写到 /models/<modelId>
  if (/\/models\/[^/]+$/i.test(pathname)) {
    return { endpointUrl: `${baseNoQuery}:generateContent${search}`, isOfficialGoogle, isVertexEndpoint }
  }
  // 3. 已写到 /models（如 .../v1/publishers/google/models 或 .../v1beta/models）
  if (/\/models$/i.test(pathname)) {
    return { endpointUrl: `${baseNoQuery}/${encodedModel}:generateContent${search}`, isOfficialGoogle, isVertexEndpoint }
  }
  // 4. Vertex 路径（如 https://aiplatform.googleapis.com/v1/publishers/google 或中转站 .../publishers/google）
  if (/\/publishers\/[^/]+$/i.test(pathname)) {
    return {
      endpointUrl: `${baseNoQuery}/models/${encodedModel}:generateContent${search}`,
      isOfficialGoogle,
      isVertexEndpoint: true,
    }
  }
  // 5. 官方 Vertex 域名但未写 /publishers/google（如 https://aiplatform.googleapis.com 或 https://aiplatform.googleapis.com/v1）
  if (isGoogleVertexHost) {
    if (/^\/(v1|v1beta1|v1beta|v1alpha)(?:\/.*)?$/i.test(pathname)) {
      return {
        endpointUrl: `${baseNoQuery}/publishers/google/models/${encodedModel}:generateContent${search}`,
        isOfficialGoogle,
        isVertexEndpoint: true,
      }
    }
    return {
      endpointUrl: `${baseNoQuery}/v1/publishers/google/models/${encodedModel}:generateContent${search}`,
      isOfficialGoogle,
      isVertexEndpoint: true,
    }
  }
  // 6. 路径中已明确包含 API 版本前缀（如 /v1、/v1beta、/v1beta1、/v1alpha），直接拼接 /models/...，绝不再追加 /v1beta
  if (/\/(v1|v1beta1|v1beta|v1alpha)(?:\/|$)/i.test(pathname)) {
    return {
      endpointUrl: `${baseNoQuery}/models/${encodedModel}:generateContent${search}`,
      isOfficialGoogle,
      isVertexEndpoint,
    }
  }
  // 7. 纯域名或无版本前缀中转路径：默认补全 /v1beta/models/...
  return {
    endpointUrl: `${baseNoQuery}/v1beta/models/${encodedModel}:generateContent${search}`,
    isOfficialGoogle,
    isVertexEndpoint,
  }
}

function normalizeV1Base(baseUrl: string): string {
  const stripped = baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:images\/(?:edits|generations)|chat\/completions|responses)$/i, '')
    .replace(/\/v1beta$/i, '')
  return stripped.endsWith('/v1') ? stripped : `${stripped}/v1`
}

function extractUniversalImage(json: any): string | null {
  if (json?.data?.[0]?.b64_json) return `data:image/png;base64,${json.data[0].b64_json}`
  if (json?.data?.[0]?.url) return json.data[0].url
  if (json?.data?.[0]?.image_url) return json.data[0].image_url

  if (Array.isArray(json?.output)) {
    for (const item of json.output) {
      if (item?.type === 'image_generation_call' && item?.result) {
        return `data:image/png;base64,${item.result}`
      }
    }
  }

  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    if (p.inlineData?.data) return `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`
    if (p.inline_data?.data) return `data:${p.inline_data.mime_type || 'image/png'};base64,${p.inline_data.data}`
  }

  const msg = json?.choices?.[0]?.message
  if (Array.isArray(msg?.images) && msg.images[0]?.image_url?.url) return msg.images[0].image_url.url
  if (Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part.type === 'image_url' && part.image_url?.url) return part.image_url.url
      if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
    }
  }

  const text = typeof msg?.content === 'string' ? msg.content : ''
  const mdMatch = text.match(/!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)/)
  if (mdMatch) return mdMatch[1]
  const urlMatch = text.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)[^\s"'<>]*)/i)
  if (urlMatch) return urlMatch[1]

  return null
}

async function readUpstreamJson(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text.slice(0, 400) }
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isSafetyOrPolicyError(message: string): boolean {
  return /safety|prohibited|content_policy|moderation|blocked|nsfw|sexual|policy/i.test(message)
}

async function devProxyAwareFetch(url: string, init: RequestInit, env?: Env): Promise<Response> {
  if (!env?.DEV_ASSETS_ORIGIN) {
    return fetch(url, init)
  }

  const req = new Request(url, init)
  const headers = new Headers()
  for (const key of ['content-type', 'authorization', 'x-goog-api-key']) {
    const val = req.headers.get(key)
    if (val) headers.set(key, val)
  }
  headers.set('x-dev-target-url', url)
  headers.set('x-dev-method', req.method || 'POST')
  const bodyBuf = req.body ? await req.arrayBuffer() : undefined

  const devOrigins = Array.from(
    new Set([
      env.DEV_ASSETS_ORIGIN.replace(/\/+$/, ''),
      env.DEV_ASSETS_ORIGIN.replace('127.0.0.1', 'localhost').replace(/\/+$/, ''),
      env.DEV_ASSETS_ORIGIN.replace('localhost', '127.0.0.1').replace(/\/+$/, ''),
    ])
  )

  let lastErr: unknown
  for (const origin of devOrigins) {
    try {
      return await fetch(`${origin}/__dev_upstream_fetch`, {
        method: 'POST',
        headers,
        body: bodyBuf,
        signal: init.signal,
      })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('本地开发代理连接失败')
}

async function fetchUpstream(url: string, init: RequestInit, env: Env): Promise<{ res: Response; json: any }> {
  let res: Response
  try {
    res = await devProxyAwareFetch(url, { ...init, signal: AbortSignal.timeout(75_000) }, env)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '网络请求异常'
    throw new UpstreamError(`上游网络或超时异常：${msg}`, true)
  }
  const json = await readUpstreamJson(res)
  return { res, json }
}

function appendMultipartImages(
  fd: FormData,
  refs: Array<{ ref: string; loaded?: LoadedImage }>,
  fieldName: 'image[]' | 'image'
): string[] {
  const summaries: string[] = []
  refs.forEach((item, i) => {
    const loaded = item.loaded!
    const copy = new Uint8Array(loaded.bytes.byteLength)
    copy.set(loaded.bytes)
    const filename = `ref_${i + 1}.${loaded.ext}`
    fd.append(fieldName, new Blob([copy], { type: loaded.mime }), filename)
    summaries.push(`[Multipart ${filename} · ${loaded.mime} · ${(loaded.bytes.byteLength / 1024).toFixed(1)} KB]`)
  })
  return summaries
}

function maskSecretShort(val: string): string {
  const s = val.trim()
  if (s.length <= 8) return '***'
  return `***${s.slice(-4)}`
}

function sanitizeUrlForAudit(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    if (u.searchParams.has('key')) {
      const val = u.searchParams.get('key') || ''
      u.searchParams.set('key', maskSecretShort(val))
    }
    return u.toString()
  } catch {
    return rawUrl.replace(/([?&]key=)([^&]+)/gi, '$1***')
  }
}

function describeAuthHeaders(headers: Record<string, string>, rawUrl: string): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase()
    if (lower === 'authorization') {
      const scheme = v.startsWith('Bearer ') ? 'Bearer ' : ''
      const raw = scheme ? v.slice(7) : v
      parts.push(`Authorization: ${scheme}${maskSecretShort(raw)}`)
    } else if (lower === 'x-goog-api-key') {
      parts.push(`x-goog-api-key: ${maskSecretShort(v)}`)
    }
  }
  try {
    const u = new URL(rawUrl)
    if (u.searchParams.has('key')) {
      parts.push(`?key=${maskSecretShort(u.searchParams.get('key') || '')}`)
    }
  } catch {
    // ignore
  }
  return parts.join(' + ') || 'none'
}

function sanitizeValueForAudit(val: unknown, keyName?: string, depth = 0): unknown {
  if (val === null || val === undefined || typeof val === 'number' || typeof val === 'boolean') {
    return val
  }
  if (typeof val === 'string') {
    if (/^data:image\//i.test(val)) {
      const idx = val.indexOf(';base64,')
      if (idx >= 0) {
        const prefix = val.slice(0, idx + 8)
        const b64Len = val.length - (idx + 8)
        const kb = ((b64Len * 3) / 4 / 1024).toFixed(1)
        return `${prefix}[省略 ${b64Len} 字符 (~${kb} KB)]`
      }
    }
    if ((keyName === 'b64_json' || keyName === 'data' || keyName === 'result') && val.length > 200) {
      const kb = ((val.length * 3) / 4 / 1024).toFixed(1)
      return `[Base64 · ${val.length} 字符 (~${kb} KB)]`
    }
    const maxLen = keyName === 'prompt' || keyName === 'text' ? 12_000 : 4_000
    if (val.length > maxLen) {
      return `${val.slice(0, maxLen)}... [已截断，总长 ${val.length} 字符]`
    }
    return val
  }
  if (depth > 8) {
    return '[Nesting Limit]'
  }
  if (Array.isArray(val)) {
    const sliced = val.length > 40 ? [...val.slice(0, 40), `... (省略剩余 ${val.length - 40} 项)`] : val
    return sliced.map((item) => sanitizeValueForAudit(item, keyName, depth + 1))
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = sanitizeValueForAudit(v, k, depth + 1)
    }
    return out
  }
  return String(val)
}

function summarizeUpstreamError(json: any, status: number): string {
  return (
    json?.error?.message ||
    json?.message ||
    json?.code ||
    json?._raw ||
    `请求失败 (HTTP ${status})`
  )
}

/**
 * 为 Grok 准备参考图数组与提示词：
 * 1. Grok 最多支持 5 张参考图；
 * 2. 若提示词已使用 <IMAGE_0>/<IMAGE_1>...（新标准模板或自定义占位符），直接保持原顺序与原中文提示词直出；
 * 3. 若提示词仍使用旧版 `图1/图2/...`，兼容将其转为 0 起始的 <IMAGE_k>（并在多图时将姿势图置于 <IMAGE_0>）。
 */
function prepareGrokInputs(
  prompt: string,
  resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>,
): {
  refsLimited: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  grokPrompt: string
} {
  const rawRefs = resolvedAll.slice(0, 5)
  const hasExplicitTags = /<IMAGE_\d+>/i.test(prompt)
  if (hasExplicitTags || rawRefs.length <= 1) {
    return { refsLimited: rawRefs, grokPrompt: prompt }
  }

  const poseIdxInRaw = rawRefs.findIndex((item) => item.source.slot === 'pose')
  const indexedRefs = rawRefs.map((item, idx) => ({ item, origNum: idx + 1 }))
  const orderedRefs =
    poseIdxInRaw > 0
      ? [
          indexedRefs[poseIdxInRaw],
          ...indexedRefs.slice(0, poseIdxInRaw),
          ...indexedRefs.slice(poseIdxInRaw + 1),
        ]
      : indexedRefs

  const refsLimited = orderedRefs.map((entry) => entry.item)
  const origNumToNewIdx = new Map<number, number>(
    orderedRefs.map((entry, newIdx) => [entry.origNum, newIdx]),
  )

  const grokPrompt = prompt
    .replace(/(?<![\dA-Za-z])图([1-9]\d*)(?!\d)/g, (match, numStr) => {
      const mappedIdx = origNumToNewIdx.get(Number(numStr))
      return mappedIdx !== undefined ? ` <IMAGE_${mappedIdx}> ` : match
    })
    .replace(/([（(【[：:])\s+(<IMAGE_\d+>)/g, '$1$2')
    .replace(/(<IMAGE_\d+>)\s+([（(）)】\]：:，,。；;、])/g, '$1$2')
    .replace(/ {2,}/g, ' ')

  return { refsLimited, grokPrompt }
}

export async function runServerGeneration(params: {
  env: Env
  channel: RunnableChannel
  prompt: string
  recipe: RecipeState
  userId: string
  aspectRatio: StudioAspectRatio
  imagePassMode: ImagePassMode
  requestOrigin: string
  stitchedR2Key?: string
  traceContext?: GenerationTraceContext
}): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  const {
    env,
    channel,
    prompt,
    recipe,
    userId,
    aspectRatio,
    imagePassMode,
    requestOrigin,
    stitchedR2Key,
    traceContext,
  } = params

  const provider = channel.providerId
  const apiKey = channel.apiKey
  const model = channel.model
  const baseUrl = (channel.baseUrl.trim() || PROVIDER_META[provider].defaultBaseUrl).replace(/\/+$/, '')

  let rawParams: Record<string, any> = {}
  try {
    rawParams = JSON.parse(channel.paramsJson)
  } catch {
    rawParams = {}
  }

  const ratioPatches = buildAspectRatioPatches(aspectRatio)
  const { refs, stitched } = extractRecipeSources(recipe, userId, stitchedR2Key)
  if (refs.length === 0) {
    throw new UpstreamError('请至少选择或上传 1 张参考图', false)
  }

  const allSources = stitched ? [...refs, stitched] : refs
  const canPassPublicUrls = imagePassMode === 'url' && isPublicHttpsOrigin(requestOrigin)

  const gptCfg: GptParams = { ...DEFAULT_PROVIDER_PARAMS.gpt, ...rawParams, ...ratioPatches.gpt }
  const geminiCfg: GeminiParams = { ...DEFAULT_PROVIDER_PARAMS.gemini, ...rawParams, ...ratioPatches.gemini }
  const grokCfg: GrokParams = { ...DEFAULT_PROVIDER_PARAMS.grok, ...rawParams, ...ratioPatches.grok }

  const endpointMode =
    provider === 'gpt'
      ? gptCfg.endpointMode
      : provider === 'gemini'
        ? geminiCfg.endpointMode
        : grokCfg.endpointMode

  const usesMultipart =
    (provider === 'gpt' && gptCfg.endpointMode === 'images_edits') ||
    (provider === 'gemini' && geminiCfg.endpointMode === 'openai_edits') ||
    (provider === 'grok' && grokCfg.endpointMode === 'openai_edits')

  const forceBytes =
    (provider === 'gemini' && (geminiCfg.endpointMode === 'native' || geminiCfg.endpointMode === 'openai_edits')) ||
    (provider === 'gpt' && gptCfg.endpointMode === 'images_edits') ||
    (provider === 'grok' && grokCfg.endpointMode === 'openai_edits')

  const resolveRefValue = async (
    src: ResolvedSource
  ): Promise<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }> => {
    if (!forceBytes && canPassPublicUrls) {
      if (src.kind === 'https') return { source: src, ref: src.url }
      if (src.kind === 'gallery') return { source: src, ref: `${requestOrigin.replace(/\/+$/, '')}/${src.path}` }
    }
    const loaded = await loadImageAsset(src, env)
    return { source: src, ref: loaded.dataUrl, loaded }
  }

  const preflightStartedAt = Date.now()
  let resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  try {
    resolvedAll = await Promise.all(allSources.map(resolveRefValue))
    if (traceContext?.onReferencesResolved) {
      traceContext.onReferencesResolved(
        resolvedAll.map((item, idx) => ({
          index: idx + 1,
          slot: item.source.slot,
          label: item.source.label,
          sourceKind: item.source.kind,
          rawPath: item.source.rawPath,
          deliveryMode: item.loaded ? (usesMultipart ? 'multipart' : 'base64') : 'url',
          mime: item.loaded?.mime,
          bytes: item.loaded?.bytes.byteLength,
        }))
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '参考图加载失败'
    if (traceContext) {
      const finishedAt = Date.now()
      traceContext.onAttempt({
        attemptIndex: traceContext.nextAttemptIndex(),
        triggerType: traceContext.triggerType,
        triggerReason: traceContext.triggerReason,
        previousError: traceContext.previousError ?? null,
        delayMs: traceContext.delayMs,
        startedAt: preflightStartedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - preflightStartedAt),
        channelId: channel.channelId,
        channelName: channel.channelName,
        supplierId: channel.supplierId,
        supplierName: channel.supplierName,
        provider,
        model,
        endpointMode,
        request: {
          method: 'PREFLIGHT',
          url: '(参考图加载阶段)',
          params: {
            stage: 'load_references',
            imagePassMode,
            aspectRatio,
            prompt,
          },
        },
        response: null,
        outcome: 'failed',
        error: msg,
        retryable: err instanceof UpstreamError ? err.retryable : false,
        safetyBlocked: false,
      })
    }
    throw err
  }

  const attemptState: { current: GenerationAttemptTrace | null } = { current: null }

  const emitPendingFailure = (errMsg: string, retryable: boolean | null, safetyBlocked: boolean | null) => {
    const attempt = attemptState.current
    if (!traceContext || !attempt) return
    const finishedAt = Date.now()
    attempt.finishedAt = finishedAt
    attempt.durationMs = Math.max(0, finishedAt - attempt.startedAt)
    attempt.outcome = 'failed'
    attempt.error = errMsg
    attempt.retryable = retryable
    attempt.safetyBlocked = safetyBlocked
    traceContext.onAttempt(attempt)
    attemptState.current = null
  }

  const trackedFetch = async (spec: {
    url: string
    headers: Record<string, string>
    body: BodyInit
    auditParams: Record<string, unknown>
    triggerOverride?: {
      triggerType: GenerationAttemptTriggerType
      triggerReason: string
      previousError: string
    }
  }): Promise<{ res: Response; json: any }> => {
    const startedAt = Date.now()
    const triggerType = spec.triggerOverride?.triggerType ?? traceContext?.triggerType ?? 'initial'
    const triggerReason = spec.triggerOverride?.triggerReason ?? traceContext?.triggerReason ?? '首次调度'
    const previousError =
      spec.triggerOverride?.previousError ?? (spec.triggerOverride ? null : traceContext?.previousError ?? null)
    const delayMs = spec.triggerOverride ? 0 : traceContext?.delayMs ?? 0

    const attempt: GenerationAttemptTrace | null = traceContext
      ? {
          attemptIndex: traceContext.nextAttemptIndex(),
          triggerType,
          triggerReason,
          previousError,
          delayMs,
          startedAt,
          finishedAt: startedAt,
          durationMs: 0,
          channelId: channel.channelId,
          channelName: channel.channelName,
          supplierId: channel.supplierId,
          supplierName: channel.supplierName,
          provider,
          model,
          endpointMode,
          request: {
            method: 'POST',
            url: sanitizeUrlForAudit(spec.url),
            authSummary: describeAuthHeaders(spec.headers, spec.url),
            params: sanitizeValueForAudit(spec.auditParams) as Record<string, unknown>,
          },
          response: null,
          outcome: 'failed',
          error: null,
          retryable: null,
          safetyBlocked: null,
        }
      : null
    attemptState.current = attempt

    try {
      const result = await fetchUpstream(
        spec.url,
        {
          method: 'POST',
          headers: spec.headers,
          body: spec.body,
        },
        env
      )
      if (attempt) {
        const requestId =
          result.res.headers.get('x-request-id') ||
          result.res.headers.get('cf-ray') ||
          result.res.headers.get('openai-processing-ms') ||
          null
        attempt.response = {
          status: result.res.status,
          ok: result.res.ok,
          requestId,
          body: sanitizeValueForAudit(result.json),
          outputSummary: null,
        }
      }
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '网络请求异常'
      const retryable = err instanceof UpstreamError ? err.retryable : true
      const safety = err instanceof UpstreamError ? err.safetyBlocked : false
      emitPendingFailure(msg, retryable, safety)
      throw err
    }
  }

  let res: Response
  let json: any

  // ===========================================================================
  // 1. OpenAI GPT Image
  // ===========================================================================
  if (provider === 'gpt') {
    const v1 = normalizeV1Base(baseUrl)
    // OpenAI GPT-Image-2 / 2.5 / 2.6 / chatgpt-image-latest 默认高保真，禁止传 input_fidelity
    const supportsInputFidelity = /^gpt-image-1(?:\.5|-mini)?(?:$|[-_])/i.test(model)
    const supportsComplexity = /^gpt-image-2\.6/i.test(model)

    if (gptCfg.endpointMode === 'images_edits_json') {
      const payload: Record<string, unknown> = {
        model,
        prompt,
        images: resolvedAll.map((item) => ({ image_url: item.ref })),
      }
      if (gptCfg.size !== 'auto') payload.size = gptCfg.size
      if (gptCfg.quality !== 'auto') payload.quality = gptCfg.quality
      if (supportsComplexity && gptCfg.complexity && gptCfg.complexity !== 'auto') {
        payload.complexity = gptCfg.complexity
      }
      if (supportsInputFidelity && gptCfg.inputFidelity) payload.input_fidelity = gptCfg.inputFidelity
      if (gptCfg.background !== 'auto') payload.background = gptCfg.background
      if (gptCfg.outputFormat) payload.output_format = gptCfg.outputFormat
      if (gptCfg.moderation !== 'auto') payload.moderation = gptCfg.moderation

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers,
        body: JSON.stringify(payload),
        auditParams: { ...payload },
      }))
      if (res.status === 400 && /input_fidelity|complexity|moderation/i.test(JSON.stringify(json))) {
        const msg = JSON.stringify(json)
        const removed: string[] = []
        if (/input_fidelity/i.test(msg)) {
          delete payload.input_fidelity
          removed.push('input_fidelity')
        }
        if (/complexity/i.test(msg)) {
          delete payload.complexity
          removed.push('complexity')
        }
        if (/moderation/i.test(msg)) {
          delete payload.moderation
          removed.push('moderation')
        }
        const firstErr = summarizeUpstreamError(json, res.status)
        emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
        ;({ res, json } = await trackedFetch({
          url: `${v1}/images/edits`,
          headers,
          body: JSON.stringify(payload),
          auditParams: { ...payload },
          triggerOverride: {
            triggerType: 'compat_downgrade',
            triggerReason: `上游返回 HTTP 400 参数不兼容，自动剔除 [${removed.join(', ')}] 后同渠道降级重试`,
            previousError: firstErr,
          },
        }))
      }
    } else if (gptCfg.endpointMode === 'images_edits') {
      const buildFd = (skipInputFidelity = false) => {
        const fd = new FormData()
        fd.append('model', model)
        fd.append('prompt', prompt)
        const imgSummaries = appendMultipartImages(fd, resolvedAll, 'image[]')
        const summary: Record<string, unknown> = {
          model,
          prompt,
          'image[]': imgSummaries,
        }
        if (gptCfg.size !== 'auto') {
          fd.append('size', gptCfg.size)
          summary.size = gptCfg.size
        }
        if (gptCfg.quality !== 'auto') {
          fd.append('quality', gptCfg.quality)
          summary.quality = gptCfg.quality
        }
        if (supportsComplexity && gptCfg.complexity && gptCfg.complexity !== 'auto') {
          fd.append('complexity', gptCfg.complexity)
          summary.complexity = gptCfg.complexity
        }
        if (!skipInputFidelity && supportsInputFidelity && gptCfg.inputFidelity) {
          fd.append('input_fidelity', gptCfg.inputFidelity)
          summary.input_fidelity = gptCfg.inputFidelity
        }
        if (gptCfg.background !== 'auto') {
          fd.append('background', gptCfg.background)
          summary.background = gptCfg.background
        }
        if (gptCfg.outputFormat) {
          fd.append('output_format', gptCfg.outputFormat)
          summary.output_format = gptCfg.outputFormat
        }
        if (gptCfg.moderation !== 'auto') {
          fd.append('moderation', gptCfg.moderation)
          summary.moderation = gptCfg.moderation
        }
        return { fd, summary }
      }

      const first = buildFd(false)
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: first.fd,
        auditParams: first.summary,
      }))
      if (res.status === 400 && /input_fidelity/i.test(JSON.stringify(json))) {
        const firstErr = summarizeUpstreamError(json, res.status)
        emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
        const second = buildFd(true)
        ;({ res, json } = await trackedFetch({
          url: `${v1}/images/edits`,
          headers: { Authorization: `Bearer ${apiKey}` },
          body: second.fd,
          auditParams: second.summary,
          triggerOverride: {
            triggerType: 'compat_downgrade',
            triggerReason: '上游返回 HTTP 400 参数不兼容，自动剔除 [input_fidelity] 后同渠道降级重试',
            previousError: firstErr,
          },
        }))
      }
    } else if (gptCfg.endpointMode === 'responses') {
      const inputContent = [
        ...resolvedAll.map((item) => ({ type: 'input_image', image_url: item.ref })),
        { type: 'input_text', text: prompt },
      ]
      const toolCfg: Record<string, unknown> = { type: 'image_generation' }
      if (gptCfg.size !== 'auto') toolCfg.size = gptCfg.size
      if (gptCfg.quality !== 'auto') toolCfg.quality = gptCfg.quality
      if (gptCfg.background !== 'auto') toolCfg.background = gptCfg.background
      if (supportsInputFidelity && gptCfg.inputFidelity) toolCfg.input_fidelity = gptCfg.inputFidelity
      if (gptCfg.outputFormat) toolCfg.output_format = gptCfg.outputFormat

      const payload = {
        model,
        input: [{ role: 'user', content: inputContent }],
        tools: [toolCfg],
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/responses`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    } else {
      const content = [
        { type: 'text', text: prompt },
        ...resolvedAll.map((item) => ({ type: 'image_url', image_url: { url: item.ref } })),
      ]
      const payloadWithModalities = {
        model,
        messages: [{ role: 'user', content }],
        modalities: ['text', 'image'],
      }
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/chat/completions`,
        headers,
        body: JSON.stringify(payloadWithModalities),
        auditParams: payloadWithModalities,
      }))
      if (res.status === 400 && /modalit/i.test(JSON.stringify(json))) {
        const firstErr = summarizeUpstreamError(json, res.status)
        emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
        const payloadFallback = {
          model,
          messages: [{ role: 'user', content }],
        }
        ;({ res, json } = await trackedFetch({
          url: `${v1}/chat/completions`,
          headers,
          body: JSON.stringify(payloadFallback),
          auditParams: payloadFallback,
          triggerOverride: {
            triggerType: 'compat_downgrade',
            triggerReason: '上游返回 HTTP 400 不支持 modalities 字段，自动移除 [modalities] 后降级重试',
            previousError: firstErr,
          },
        }))
      }
    }
  }

  // ===========================================================================
  // 2. Google Gemini（原生协议 + 中转站全协议兼容）
  // ===========================================================================
  else if (provider === 'gemini') {
    if (geminiCfg.endpointMode === 'native') {
      const { endpointUrl, isOfficialGoogle } = buildGeminiNativeEndpoint(baseUrl, model)
      const authMode = geminiCfg.authMode || 'auto'
      const isOAuthToken = /^ya29\./i.test(apiKey)

      const useQueryKey =
        authMode === 'goog_key' ||
        authMode === 'both' ||
        (authMode === 'auto' && isOfficialGoogle && !isOAuthToken)
      const useGoogHeader =
        authMode === 'goog_key' ||
        authMode === 'both' ||
        (authMode === 'auto' && !isOAuthToken)
      const useBearer =
        authMode === 'bearer' ||
        authMode === 'both' ||
        (authMode === 'auto' && (!isOfficialGoogle || isOAuthToken))

      const url = useQueryKey
        ? `${endpointUrl}${endpointUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`
        : endpointUrl

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (useGoogHeader) headers['x-goog-api-key'] = apiKey
      if (useBearer) headers.Authorization = `Bearer ${apiKey}`

      const parts = [
        ...resolvedAll.map((item) => ({
          inlineData: {
            mimeType: item.loaded?.mime || 'image/png',
            data: item.loaded?.base64 || item.ref.split(',')[1],
          },
        })),
        { text: prompt },
      ]
      const supportsImageSize = /gemini-3|nano-banana/i.test(model)
      const imageConfig: Record<string, string> = {
        aspectRatio: geminiCfg.aspectRatio,
      }
      if (supportsImageSize && geminiCfg.imageSize) {
        imageConfig.imageSize = geminiCfg.imageSize
      }

      const payload = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig,
        },
      }

      ;({ res, json } = await trackedFetch({
        url,
        headers,
        body: JSON.stringify(payload),
        auditParams: {
          model,
          authMode,
          ...payload,
        },
      }))
    } else if (geminiCfg.endpointMode === 'openai_chat') {
      const v1 = normalizeV1Base(baseUrl)
      const content = [
        {
          type: 'text',
          text: `${prompt}\n(Output aspect ratio: ${geminiCfg.aspectRatio}, resolution: ${geminiCfg.imageSize})`,
        },
        ...resolvedAll.map((item) => ({ type: 'image_url', image_url: { url: item.ref } })),
      ]
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
      const payloadWithModalities = {
        model,
        messages: [{ role: 'user', content }],
        modalities: ['text', 'image'],
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/chat/completions`,
        headers,
        body: JSON.stringify(payloadWithModalities),
        auditParams: payloadWithModalities,
      }))
      // 部分国内中转站不识别 OpenRouter 的 modalities 字段，自动降级重试一次
      if (res.status === 400 && /modalit/i.test(JSON.stringify(json))) {
        const firstErr = summarizeUpstreamError(json, res.status)
        emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
        const payloadFallback = {
          model,
          messages: [{ role: 'user', content }],
        }
        ;({ res, json } = await trackedFetch({
          url: `${v1}/chat/completions`,
          headers,
          body: JSON.stringify(payloadFallback),
          auditParams: payloadFallback,
          triggerOverride: {
            triggerType: 'compat_downgrade',
            triggerReason: '上游返回 HTTP 400 不支持 modalities 字段，自动移除 [modalities] 后降级重试',
            previousError: firstErr,
          },
        }))
      }
    } else if (geminiCfg.endpointMode === 'openai_edits_json') {
      const v1 = normalizeV1Base(baseUrl)
      const payload = {
        model,
        prompt,
        images: resolvedAll.map((item) => ({ image_url: item.ref })),
        aspect_ratio: geminiCfg.aspectRatio,
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    } else {
      const v1 = normalizeV1Base(baseUrl)
      const fd = new FormData()
      fd.append('model', model)
      fd.append('prompt', prompt)
      const imgSummaries = appendMultipartImages(fd, resolvedAll, 'image[]')
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        auditParams: {
          model,
          prompt,
          'image[]': imgSummaries,
        },
      }))
    }
  }

  // ===========================================================================
  // 3. xAI Grok Imagine (grok-imagine-image-2.0)
  // ===========================================================================
  else {
    const v1 = normalizeV1Base(baseUrl)
    const { refsLimited, grokPrompt } = prepareGrokInputs(prompt, resolvedAll)

    if (grokCfg.endpointMode === 'xai_edits') {
      const payload: Record<string, unknown> = {
        model,
        prompt: grokPrompt,
      }
      if (refsLimited.length === 1) {
        payload.image = { type: 'image_url', url: refsLimited[0].ref }
      } else if (refsLimited.length > 1) {
        payload.images = refsLimited.map((item) => ({ type: 'image_url', url: item.ref }))
      }
      payload.aspect_ratio =
        !grokCfg.aspectRatio || grokCfg.aspectRatio === 'auto' ? aspectRatio : grokCfg.aspectRatio
      payload.resolution = grokCfg.resolution || '2k'
      // 仅 grok-imagine-image-2.0 支持 quality 参数
      if (model.includes('2.0') && grokCfg.quality && grokCfg.quality !== 'auto') {
        payload.quality = grokCfg.quality
      }
      payload.response_format = grokCfg.responseFormat || 'b64_json'

      ;({ res, json } = await trackedFetch({
        url: refsLimited.length === 0 ? `${v1}/images/generations` : `${v1}/images/edits`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    } else if (grokCfg.endpointMode === 'openai_edits_json') {
      const payload = {
        model,
        prompt: grokPrompt,
        images: refsLimited.map((item) => ({ image_url: item.ref })),
        aspect_ratio: grokCfg.aspectRatio === 'auto' ? aspectRatio : grokCfg.aspectRatio,
        resolution: grokCfg.resolution || '2k',
        response_format: grokCfg.responseFormat || 'b64_json',
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    } else if (grokCfg.endpointMode === 'openai_edits') {
      const fd = new FormData()
      fd.append('model', model)
      fd.append('prompt', grokPrompt)
      const imgSummaries = appendMultipartImages(fd, refsLimited, 'image[]')
      const summary: Record<string, unknown> = {
        model,
        prompt: grokPrompt,
        'image[]': imgSummaries,
      }
      if (grokCfg.responseFormat) {
        fd.append('response_format', grokCfg.responseFormat)
        summary.response_format = grokCfg.responseFormat
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        auditParams: summary,
      }))
    } else {
      const content = [
        { type: 'text', text: `${grokPrompt}\n(Output aspect ratio: ${aspectRatio})` },
        ...refsLimited.map((item) => ({ type: 'image_url', image_url: { url: item.ref } })),
      ]
      const payload = {
        model,
        messages: [{ role: 'user', content }],
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    }
  }

  if (!res.ok) {
    const errMsg = summarizeUpstreamError(json, res.status)
    const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
    const safety = isSafetyOrPolicyError(errMsg)
    const retryable = isRetryableStatus(res.status) && !safety
    emitPendingFailure(fullMsg, retryable, safety)
    throw new UpstreamError(fullMsg, retryable, res.status, safety)
  }

  const outputRef = extractUniversalImage(json)
  if (!outputRef) {
    const fallbackText =
      json?.choices?.[0]?.message?.content ||
      json?.candidates?.[0]?.finishReason ||
      json?.candidates?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(json).slice(0, 260)
    const safety = isSafetyOrPolicyError(String(fallbackText))
    const msg = `接口已响应但未解析到图片输出：${fallbackText}`
    emitPendingFailure(msg, !safety, safety)
    throw new UpstreamError(msg, !safety, undefined, safety)
  }

  if (outputRef.startsWith('data:image/')) {
    const commaIdx = outputRef.indexOf(',')
    if (commaIdx < 0) {
      emitPendingFailure('模型返回的 Data URL 无效', true, false)
      throw new UpstreamError('模型返回的 Data URL 无效', true)
    }
    const bytes = base64ToBytes(outputRef.slice(commaIdx + 1))
    const detected = detectImageFormat(bytes)
    if (!detected) {
      emitPendingFailure('模型返回的图片二进制格式无效', true, false)
      throw new UpstreamError('模型返回的图片二进制格式无效', true)
    }
    if (traceContext && attemptState.current) {
      const attempt = attemptState.current
      const finishedAt = Date.now()
      attempt.finishedAt = finishedAt
      attempt.durationMs = Math.max(0, finishedAt - attempt.startedAt)
      attempt.outcome = 'succeeded'
      attempt.error = null
      if (attempt.response) {
        attempt.response.outputSummary = {
          kind: 'b64_data',
          mime: detected.mime,
          bytes: bytes.byteLength,
        }
      }
      traceContext.onAttempt(attempt)
      attemptState.current = null
    }
    return { bytes, mime: detected.mime, ext: detected.ext }
  }

  const outUrl = validateExternalImageUrl(outputRef)
  if (!outUrl) {
    if (attemptState.current?.response) {
      attemptState.current.response.outputSummary = {
        kind: 'external_url',
        externalUrl: outputRef.slice(0, 500),
        mime: 'unknown',
        bytes: 0,
      }
    }
    emitPendingFailure('模型返回的图片链接不合法', false, false)
    throw new UpstreamError('模型返回的图片链接不合法', false)
  }

  try {
    const outRes = await devProxyAwareFetch(
      outUrl.toString(),
      { method: 'GET', signal: AbortSignal.timeout(45_000) },
      env
    )
    const loadedOut = await readResponseImage(outRes, MAX_OUTPUT_IMAGE_BYTES)
    if (traceContext && attemptState.current) {
      const attempt = attemptState.current
      const finishedAt = Date.now()
      attempt.finishedAt = finishedAt
      attempt.durationMs = Math.max(0, finishedAt - attempt.startedAt)
      attempt.outcome = 'succeeded'
      attempt.error = null
      if (attempt.response) {
        attempt.response.outputSummary = {
          kind: 'external_url',
          externalUrl: outUrl.toString(),
          mime: loadedOut.mime,
          bytes: loadedOut.bytes.byteLength,
        }
      }
      traceContext.onAttempt(attempt)
      attemptState.current = null
    }
    return { bytes: loadedOut.bytes, mime: loadedOut.mime, ext: loadedOut.ext }
  } catch (err) {
    if (attemptState.current?.response) {
      attemptState.current.response.outputSummary = {
        kind: 'external_url',
        externalUrl: outUrl.toString(),
        mime: 'unknown',
        bytes: 0,
      }
    }
    const msg = err instanceof Error ? err.message : '拉取模型返回图片失败'
    const retryable = err instanceof UpstreamError ? err.retryable : true
    const safety = err instanceof UpstreamError ? err.safetyBlocked : false
    emitPendingFailure(msg, retryable, safety)
    throw err
  }
}
