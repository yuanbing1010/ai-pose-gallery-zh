import {
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  buildAspectRatioPatches,
  isChannelStitchedSingleMode,
  poseImagePath,
  type DreaminaChannelOptions,
  type GeminiParams,
  type GenerationAspectRatio,
  type GenerationAttemptTrace,
  type GenerationAttemptTriggerType,
  type GenerationLiveStage,
  type GenerationTraceReference,
  type GptParams,
  type GrokParams,
  type ImagePassMode,
  type ImageProviderId,
  type MuseParams,
  type SeedreamParams,
  type RecipeState,
  type ReferenceDescriptionDTO,
  type ReferenceDescriptionKind,
  type StudioAspectRatio,
  type StudioResolution,
  type VisionFallbackConfig,
  type WaveSpeedChannelOptions,
} from '../shared/studio'
import { base64ToBytes, bytesToBase64, detectImageFormat } from './crypto'
import {
  findReferenceDescriptionByKey,
  updateReferenceDescriptionManual,
  upsertAutoReferenceDescription,
  type RunnableChannel,
  type VisionFallbackTarget,
} from './db'
import { buildCodexRequestHeaders, buildXaiOAuthRequestHeaders } from './supplierOAuth'
import type { Env } from './types'
import { devProxyAwareFetch, safeExternalFetch } from './upstreamFetch'
import {
  isPrivateOrLocalHostname,
  readResponseBodyWithLimit,
  readResponseTextWithLimit,
  sanitizeGalleryAssetPath,
  validateExternalImageUrl,
} from './validation'

export { devProxyAwareFetch }

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
  onStage?: (
    stage: Extract<GenerationLiveStage, 'resolving_refs' | 'generating' | 'downloading_output'>,
    message: string
  ) => void | Promise<void>
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
    if (!r2Key.startsWith(`uploads/${userId}/`) && !r2Key.startsWith(`generations/${userId}/`)) {
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
  const bytes = await readResponseBodyWithLimit(res, maxBytes)
  if (bytes.byteLength === 0) {
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
    if (obj.size === 0 || obj.size > MAX_REF_IMAGE_BYTES) {
      await obj.body?.cancel().catch(() => {})
      throw new Error('参考图大小异常')
    }
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

  const extRes = await safeExternalFetch(
    source.url,
    { method: 'GET', signal: AbortSignal.timeout(20_000) },
    env,
    20_000
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

function buildGeminiNativeAuthRequest(
  baseUrl: string,
  model: string,
  apiKey: string,
  authMode: 'auto' | 'bearer' | 'goog_key' | 'both' = 'auto'
): { url: string; headers: Record<string, string> } {
  const { endpointUrl, isOfficialGoogle } = buildGeminiNativeEndpoint(baseUrl, model)
  const isOAuthToken = /^ya29\./i.test(apiKey)

  // 始终优先通过 x-goog-api-key 请求头鉴权，避免 API Key 落入 URL 查询串与追踪日志
  const useQueryKey = authMode === 'goog_key' && !isOfficialGoogle
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
  return { url, headers }
}

function normalizeV1Base(baseUrl: string): string {
  const stripped = baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:images\/(?:edits|generations)|chat\/completions|responses)$/i, '')
    .replace(/\/v1beta$/i, '')
  return stripped.endsWith('/v1') ? stripped : `${stripped}/v1`
}

function readPartInlineImageUrl(part: any): string | null {
  if (part?.inlineData?.data) {
    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
  }
  if (part?.inline_data?.data) {
    return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`
  }
  return null
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

  // Gemini 思考模型会先在 thought: true 的 part 中输出中间草稿图，必须跳过并取最终非思考成图
  const parts = json?.candidates?.[0]?.content?.parts || []
  let finalGeminiImage: string | null = null
  for (const p of parts) {
    if (!p || p.thought === true) continue
    const img = readPartInlineImageUrl(p)
    if (img) finalGeminiImage = img
  }
  if (finalGeminiImage) return finalGeminiImage

  const msg = json?.choices?.[0]?.message
  if (Array.isArray(msg?.images)) {
    let finalMsgImage: string | null = null
    for (const img of msg.images) {
      if (img && img.thought !== true && img.image_url?.url) {
        finalMsgImage = img.image_url.url
      }
    }
    if (finalMsgImage) return finalMsgImage
  }
  if (Array.isArray(msg?.content)) {
    let finalContentImage: string | null = null
    for (const part of msg.content) {
      if (!part || part.thought === true || part.type === 'thinking' || part.type === 'reasoning') {
        continue
      }
      if (part.type === 'image_url' && part.image_url?.url) {
        finalContentImage = part.image_url.url
        continue
      }
      const img = readPartInlineImageUrl(part)
      if (img) finalContentImage = img
    }
    if (finalContentImage) return finalContentImage
  }

  const text = typeof msg?.content === 'string' ? msg.content : ''
  const mdMatch = text.match(/!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)/)
  if (mdMatch) return mdMatch[1]
  const urlMatch = text.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)[^\s"'<>]*)/i)
  if (urlMatch) return urlMatch[1]

  return null
}

const MAX_UPSTREAM_JSON_BYTES = 32 * 1024 * 1024

async function readUpstreamJson(res: Response): Promise<any> {
  const text = await readResponseTextWithLimit(res, MAX_UPSTREAM_JSON_BYTES)
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text.slice(0, 400) }
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/** 判断异常是否发生在建立连接 / TLS 握手阶段（请求未发出，不存在重复扣费风险） */
function isPreRequestTransportError(message: string): boolean {
  return /client network socket disconnected before secure tls connection was established|proxy connect\b|econnrefused|enotfound|eai_again|本地开发代理连接失败/i.test(
    message
  )
}

function isUnsupportedParamError(message: string): boolean {
  return /does not support|unsupported|unrecognized|unknown (?:parameter|field)|extra (?:inputs?|fields?) (?:are|is) not permitted|additional properties|unexpected keyword|invalid (?:parameter|field|value)|is not allowed/i.test(
    message
  )
}

function isSafetyOrPolicyError(message: string): boolean {
  if (isUnsupportedParamError(message)) return false
  return /safety|prohibited|content_policy|content_filter|moderation_blocked|moderation_details|content[-_\s]?moderat(?:ed|ion)|\bmoderation\b|moderated|blocked|nsfw|sexual|policy|cannot generate|unable to generate|can't generate|违规|敏感|审核|拦截|模型未生成媒体|没能生成|无法生成/i.test(
    message
  )
}

function buildCodexResponsesUrl(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '') || 'https://chatgpt.com/backend-api/codex'
  if (/\/responses$/i.test(clean)) return clean
  return `${clean}/responses`
}

async function readUpstreamResponsesSse(res: Response): Promise<any> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('text/event-stream')) {
    return readUpstreamJson(res)
  }

  let completedResponse: Record<string, unknown> | null = null
  let streamError: unknown = null
  const outputItemsById = new Map<string, Record<string, unknown>>()
  const orderedItemIds: string[] = []
  const imagePartialById = new Map<string, string>()
  const textDeltas: string[] = []
  let eventName = ''
  let dataLines: string[] = []

  const flushEvent = () => {
    if (dataLines.length === 0) {
      eventName = ''
      return
    }
    const payloadStr = dataLines.join('\n').trim()
    dataLines = []
    const currentEvent = eventName
    eventName = ''
    if (!payloadStr || payloadStr === '[DONE]') return
    try {
      const evt = JSON.parse(payloadStr) as Record<string, unknown>
      const evtType =
        (typeof evt.type === 'string' && evt.type) || currentEvent || ''

      if (evtType === 'response.completed' || evtType === 'response.done') {
        if (evt.response && typeof evt.response === 'object') {
          completedResponse = evt.response as Record<string, unknown>
        }
      } else if (evtType === 'response.failed') {
        const respErr = (evt.response as Record<string, unknown> | undefined)?.error
        streamError = respErr ?? evt.error ?? evt
      } else if (evtType === 'error') {
        streamError = evt.error ?? evt
      } else if (evtType === 'response.output_text.delta' && typeof evt.delta === 'string') {
        textDeltas.push(evt.delta)
      } else if (evtType === 'response.output_item.done' && evt.item && typeof evt.item === 'object') {
        const item = evt.item as Record<string, unknown>
        const itemId =
          typeof item.id === 'string' && item.id
            ? item.id
            : `item_${orderedItemIds.length}`
        if (!outputItemsById.has(itemId)) {
          orderedItemIds.push(itemId)
        }
        outputItemsById.set(itemId, item)
      } else if (
        evtType === 'response.image_generation_call.partial_image' &&
        typeof evt.partial_image_b64 === 'string'
      ) {
        const itemId = typeof evt.item_id === 'string' ? evt.item_id : 'img_0'
        imagePartialById.set(itemId, evt.partial_image_b64)
      } else if (
        evtType === 'response.image_generation_call.completed' &&
        typeof evt.result === 'string'
      ) {
        const itemId = typeof evt.item_id === 'string' ? evt.item_id : 'img_0'
        imagePartialById.set(itemId, evt.result)
      }
    } catch {
      // ignore malformed SSE event line
    }
  }

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') {
      flushEvent()
      return
    }
    if (line.startsWith(':')) return
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  let rawSnippet = ''
  const appendSnippet = (chunk: string) => {
    if (rawSnippet.length < 400) {
      rawSnippet += chunk.slice(0, 400 - rawSnippet.length)
    }
  }

  // 使用 ReadableStream 逐块按行流式解析，边消费边释放中间 partial_image 分片，防止多图 SSE 打爆 128MB 内存
  if (res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let totalBytes = 0
    const MAX_SSE_STREAM_BYTES = 64 * 1024 * 1024
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value || value.byteLength === 0) continue
        totalBytes += value.byteLength
        if (totalBytes > MAX_SSE_STREAM_BYTES) {
          await reader.cancel().catch(() => {})
          throw new Error('上游 SSE 响应流超过体积上限')
        }
        const decoded = decoder.decode(value, { stream: true })
        appendSnippet(decoded)
        pending += decoded
        let newlineIdx = pending.indexOf('\n')
        while (newlineIdx !== -1) {
          processLine(pending.slice(0, newlineIdx))
          pending = pending.slice(newlineIdx + 1)
          newlineIdx = pending.indexOf('\n')
        }
      }
      const tail = decoder.decode()
      appendSnippet(tail)
      pending += tail
      if (pending) {
        processLine(pending)
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    const rawText = await readResponseTextWithLimit(res, MAX_UPSTREAM_JSON_BYTES)
    appendSnippet(rawText)
    for (const line of rawText.split(/\r?\n/)) {
      processLine(line)
    }
  }
  flushEvent()

  const finalCompleted: Record<string, unknown> | null = completedResponse
  if (streamError && !finalCompleted) {
    return { error: streamError }
  }

  const baseObj: Record<string, unknown> = finalCompleted ? Object.assign({}, finalCompleted) : {}
  const existingOutput = Array.isArray(baseObj.output)
    ? ([...baseObj.output] as Array<Record<string, unknown>>)
    : orderedItemIds.map((id) => outputItemsById.get(id)!).filter(Boolean)

  for (const [itemId, b64] of imagePartialById.entries()) {
    const existing = existingOutput.find(
      (item) => item && item.id === itemId && item.type === 'image_generation_call'
    )
    if (existing) {
      if (!existing.result) existing.result = b64
    } else {
      existingOutput.push({
        id: itemId,
        type: 'image_generation_call',
        status: 'completed',
        result: b64,
      })
    }
  }

  if (existingOutput.length > 0) {
    baseObj.output = existingOutput
  }
  if (typeof baseObj.output_text !== 'string' && textDeltas.length > 0) {
    baseObj.output_text = textDeltas.join('')
  }
  if (Object.keys(baseObj).length === 0) {
    return { _raw: rawSnippet }
  }
  return baseObj
}

function extractTextFromResponsesOutput(json: any): string | null {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim()
  }
  const output = Array.isArray(json?.output) ? json.output : []
  const texts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (
          part &&
          (part.type === 'output_text' || part.type === 'text') &&
          typeof part.text === 'string' &&
          part.text.trim()
        ) {
          texts.push(part.text.trim())
        }
      }
    }
  }
  const merged = texts.join('\n').trim()
  return merged || null
}

async function fetchUpstream(
  url: string,
  init: RequestInit,
  env: Env,
  timeoutMs = 60_000,
  options?: { parseSse?: boolean }
): Promise<{ res: Response; json: any }> {
  const controller = new AbortController()
  const timeoutErr = new Error(`请求超过 ${Math.round(timeoutMs / 1000)} 秒未返回完整响应`)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try {
        controller.abort(timeoutErr)
      } catch {
        // ignore abort error
      }
      reject(timeoutErr)
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      (async () => {
        const res = await devProxyAwareFetch(
          url,
          { ...init, signal: controller.signal },
          env,
          timeoutMs
        )
        const json = options?.parseSse
          ? await readUpstreamResponsesSse(res)
          : await readUpstreamJson(res)
        return { res, json }
      })(),
      timeoutPromise,
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : '网络请求异常'
    throw new UpstreamError(`上游网络或超时异常：${msg}`, true)
  } finally {
    if (timer) clearTimeout(timer)
  }
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
    if ((keyName === 'b64_json' || keyName === 'data' || keyName === 'result' || keyName === 'outputs') && val.length > 200 && !/^https?:\/\//i.test(val)) {
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
  const topError =
    typeof json?.error === 'string' && json.error.trim()
      ? json.error.trim()
      : json?.error?.message
  return (
    json?.data?.error ||
    topError ||
    json?.message ||
    json?.code ||
    json?._raw ||
    `请求失败 (HTTP ${status})`
  )
}

interface WaveSpeedModelSpec {
  imageMode: 'none' | 'single' | 'array'
  maxImages: number
  sizeMode: 'aspect_resolution' | 'size' | 'aspect_only' | 'none'
  resolutions?: readonly string[]
  minDim?: number
  maxDim?: number
  outputFormats?: readonly ('png' | 'jpeg' | 'webp' | 'gif')[]
  supportsSeed?: boolean
  maxPromptChars?: number
}

const WAVESPEED_MODEL_SPECS: Record<string, WaveSpeedModelSpec> = {
  'bytedance/seedream-v5.5/edit': {
    imageMode: 'array',
    maxImages: 10,
    sizeMode: 'aspect_resolution',
    resolutions: ['1k', '1.5k', '2k'],
    outputFormats: ['jpeg', 'png'],
  },
  'bytedance/seedream-v5.5': {
    imageMode: 'none',
    maxImages: 0,
    sizeMode: 'aspect_resolution',
    resolutions: ['1k', '1.5k', '2k'],
    outputFormats: ['jpeg', 'png'],
  },
  'minimax/image-01/image-to-image': {
    imageMode: 'single',
    maxImages: 1,
    sizeMode: 'size',
    minDim: 512,
    maxDim: 2048,
    supportsSeed: true,
    maxPromptChars: 1500,
  },
  'minimax/image-01/text-to-image': {
    imageMode: 'none',
    maxImages: 0,
    sizeMode: 'size',
    minDim: 512,
    maxDim: 2048,
    supportsSeed: true,
    maxPromptChars: 1500,
  },
  'x-ai/grok-imagine-image/edit': {
    imageMode: 'single',
    maxImages: 1,
    sizeMode: 'none',
  },
  'x-ai/grok-imagine-image/text-to-image': {
    imageMode: 'none',
    maxImages: 0,
    sizeMode: 'aspect_only',
    outputFormats: ['jpeg', 'png'],
  },
}

/**
 * 规范化 WaveSpeed 模型 ID，按是否携带参考图双向匹配文生图 / 图生图端点：
 * - ByteDance Seedream 系列（v4/v4.5/v5.0-lite/v5.5 等）：文生图为裸模型 ID（无 /text-to-image），图生图为 /edit
 * - MiniMax Image-01：文生图为 /text-to-image，图生图为 /image-to-image
 * - 其他模型（如 x-ai/grok-imagine-image、google/nano-banana-*、openai/gpt-image-*）：文生图为 /text-to-image，图生图为 /edit
 */
function resolveWaveSpeedModelId(rawModel: string, hasReferenceImages = true): string {
  const cleaned = rawModel.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  const isSeedreamSeries = /^bytedance\/seedream-[^/]+(?:\/|$)/i.test(cleaned)

  if (!hasReferenceImages) {
    if (isSeedreamSeries) {
      return cleaned.replace(/\/(?:edit(?:-sequential)?|image-to-image|text-to-image)$/i, '')
    }
    if (/\/(?:edit|image-to-image)$/i.test(cleaned)) {
      return cleaned.replace(/\/(?:edit|image-to-image)$/i, '/text-to-image')
    }
    return cleaned
  }

  if (isSeedreamSeries) {
    if (/^bytedance\/seedream-[^/]+$/i.test(cleaned)) {
      return `${cleaned}/edit`
    }
    if (/\/text-to-image$/i.test(cleaned)) {
      return cleaned.replace(/\/text-to-image$/i, '/edit')
    }
    return cleaned
  }
  if (/^minimax\/image-01\/text-to-image$/i.test(cleaned)) {
    return cleaned.replace(/\/text-to-image$/i, '/image-to-image')
  }
  if (/\/text-to-image$/i.test(cleaned)) {
    return cleaned.replace(/\/text-to-image$/i, '/edit')
  }
  return cleaned
}

/** 根据 WaveSpeed 模型 ID 获取精确约束或推断自定义模型默认规格 */
function getWaveSpeedModelSpec(modelId: string): WaveSpeedModelSpec {
  const lower = modelId.toLowerCase()
  const exact = WAVESPEED_MODEL_SPECS[modelId] ?? WAVESPEED_MODEL_SPECS[lower]
  if (exact) return exact

  if (/^bytedance\/seedream-[^/]+$/.test(lower)) {
    return {
      imageMode: 'none',
      maxImages: 0,
      sizeMode: 'aspect_resolution',
      resolutions: ['1k', '1.5k', '2k'],
      outputFormats: ['jpeg', 'png'],
    }
  }
  if (/\/text-to-image$/.test(lower)) {
    return {
      imageMode: 'none',
      maxImages: 0,
      sizeMode: 'aspect_resolution',
      resolutions: ['1k', '2k', '4k'],
      outputFormats: ['png', 'jpeg', 'webp'],
    }
  }
  if (/kontext|image-to-image/.test(lower)) {
    return {
      imageMode: 'single',
      maxImages: 1,
      sizeMode: 'size',
      minDim: 512,
      maxDim: 2048,
      outputFormats: ['png', 'jpeg', 'webp'],
      supportsSeed: true,
    }
  }
  return {
    imageMode: 'array',
    maxImages: 10,
    sizeMode: 'aspect_resolution',
    resolutions: ['1k', '2k', '4k'],
    outputFormats: ['png', 'jpeg'],
  }
}

/** 从供应商 Base URL 提取 WaveSpeed /api/v3 根路径并构造提交、轮询与文件上传地址 */
function buildWaveSpeedEndpoints(baseUrl: string): {
  apiV3Root: string
  submitUrl: (modelId: string) => string
  pollUrl: (taskId: string) => string
  mediaUploadUrl: string
} {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  const match = trimmed.match(/^(.*?\/api\/v3)(?:\/.*)?$/i)
  const apiV3Root = match ? match[1] : `${trimmed}/api/v3`
  return {
    apiV3Root,
    submitUrl: (modelId: string) => `${apiV3Root}/${modelId.trim().replace(/^\/+/, '')}`,
    pollUrl: (taskId: string) => `${apiV3Root}/predictions/${encodeURIComponent(taskId)}/result`,
    mediaUploadUrl: `${apiV3Root}/media/uploads`,
  }
}

/** 按比例与目标分辨率计算符合 WaveSpeed 模型上下限的 "W*H" 像素字符串 */
function computeWaveSpeedPixelSize(
  aspectRatio: StudioAspectRatio,
  resolution: StudioResolution | null | undefined,
  minDim: number,
  maxDim: number
): string {
  const resTier = resolution || '1.5K'
  const round8 = (n: number) => Math.max(8, Math.round(n / 8) * 8)

  const presets1k: Record<StudioAspectRatio, [number, number]> = {
    '1:1': [1024, 1024],
    '3:4': [768, 1024],
    '4:3': [1024, 768],
    '9:16': [576, 1024],
    '16:9': [1024, 576],
  }
  const presets2kLarge: Record<StudioAspectRatio, [number, number]> = {
    '1:1': [2048, 2048],
    '3:4': [1728, 2304],
    '4:3': [2304, 1728],
    '9:16': [1440, 2560],
    '16:9': [2560, 1440],
  }
  const presets2kStd: Record<StudioAspectRatio, [number, number]> = {
    '1:1': [2048, 2048],
    '3:4': [1536, 2048],
    '4:3': [2048, 1536],
    '9:16': [1152, 2048],
    '16:9': [2048, 1152],
  }
  const presets1536: Record<StudioAspectRatio, [number, number]> = {
    '1:1': [1536, 1536],
    '3:4': [1152, 1536],
    '4:3': [1536, 1152],
    '9:16': [864, 1536],
    '16:9': [1536, 864],
  }
  let [w, h] =
    resTier === '1K'
      ? presets1k[aspectRatio]
      : resTier === '1.5K'
        ? presets1536[aspectRatio]
        : maxDim >= 2560
          ? presets2kLarge[aspectRatio]
          : maxDim >= 2048
            ? presets2kStd[aspectRatio]
            : presets1536[aspectRatio]

  const minSide = Math.min(w, h)
  if (minSide < minDim) {
    const scale = minDim / minSide
    w = round8(w * scale)
    h = round8(h * scale)
  }
  const maxSide = Math.max(w, h)
  if (maxSide > maxDim) {
    const scale = maxDim / maxSide
    w = round8(w * scale)
    h = round8(h * scale)
  }
  w = Math.max(minDim, Math.min(maxDim, w))
  h = Math.max(minDim, Math.min(maxDim, h))
  return `${w}*${h}`
}

/** 解析 WaveSpeed 允许的 resolution 枚举（自动向下或向上钳制到模型支持范围） */
function pickWaveSpeedResolution(
  allowed: readonly string[] | undefined,
  requested: StudioResolution | null | undefined
): string | undefined {
  if (!allowed || allowed.length === 0) return undefined
  const desired = (requested || '1.5K').toLowerCase()
  if (allowed.includes(desired)) return desired
  const order = ['0.5k', '1k', '1.5k', '2k', '4k', '8k']
  const desiredRank = order.indexOf(desired)
  let best = allowed[0]
  let bestDist = Infinity
  for (const cand of allowed) {
    const rank = order.indexOf(cand)
    const dist = rank >= 0 && desiredRank >= 0 ? Math.abs(rank - desiredRank) : 99
    if (dist < bestDist) {
      bestDist = dist
      best = cand
    }
  }
  return best
}

/** 适配单图拼合占位符及模型提示词长度上限（如 MiniMax Image-01 限制 1500 字符） */
function formatWaveSpeedPrompt(
  prompt: string,
  spec: WaveSpeedModelSpec,
  selectedCount: number,
  usedCollapsedStitched: boolean
): string {
  let formatted = prompt
  if (usedCollapsedStitched && selectedCount === 1) {
    formatted = formatted.replace(/<IMAGE_\d+>/gi, '<IMAGE_0>')
  }
  if (spec.maxPromptChars && formatted.length > spec.maxPromptChars) {
    formatted = formatted.slice(0, spec.maxPromptChars).trimEnd()
  }
  return formatted
}

/** 使用 WaveSpeed Presigned /api/v3/media/uploads 上传本地或 R2 参考图，失败时自动退回 Base64 Data URL */
async function uploadWaveSpeedMediaIfNeeded(
  item: { source: ResolvedSource; ref: string; loaded?: LoadedImage },
  mediaUploadUrl: string,
  apiKey: string,
  env: Env
): Promise<string> {
  if (!item.loaded) return item.ref
  const loaded = item.loaded
  try {
    const ext = loaded.ext || 'png'
    const filename = `ref-${item.source.slot}.${ext}`
    const metaRes = await devProxyAwareFetch(
      mediaUploadUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          filename,
          size: loaded.bytes.byteLength,
          content_type: loaded.mime,
        }),
        signal: AbortSignal.timeout(25_000),
      },
      env,
      25_000
    )
    if (!metaRes.ok) return item.ref
    const metaJson = await readUpstreamJson(metaRes)
    const uploadUrlRaw = metaJson?.data?.upload?.url || metaJson?.data?.upload_url
    const downloadUrlRaw = metaJson?.data?.download_url || metaJson?.data?.url
    const safeUploadUrl = typeof uploadUrlRaw === 'string' ? validateExternalImageUrl(uploadUrlRaw) : null
    const safeDownloadUrl = typeof downloadUrlRaw === 'string' ? validateExternalImageUrl(downloadUrlRaw) : null
    if (!safeUploadUrl || !safeDownloadUrl) return item.ref

    const putHeaders: Record<string, string> = {}
    const signedHeaders = metaJson?.data?.upload?.headers
    if (signedHeaders && typeof signedHeaders === 'object') {
      for (const [k, v] of Object.entries(signedHeaders as Record<string, unknown>)) {
        const lower = k.toLowerCase()
        if (
          typeof v === 'string' &&
          v &&
          lower !== 'authorization' &&
          lower !== 'host' &&
          lower !== 'content-length'
        ) {
          putHeaders[k] = v
        }
      }
    }
    if (!Object.keys(putHeaders).some((k) => k.toLowerCase() === 'content-type')) {
      putHeaders['Content-Type'] = loaded.mime
    }

    const putRes = await devProxyAwareFetch(
      safeUploadUrl.toString(),
      {
        method: 'PUT',
        headers: putHeaders,
        body: loaded.bytes,
        signal: AbortSignal.timeout(40_000),
      },
      env,
      40_000
    )
    if (!putRes.ok) return item.ref
    return safeDownloadUrl.toString()
  } catch {
    return item.ref
  }
}

/** 从 WaveSpeed 任务响应或输出数组中提取成图 URL 或标准 Data URL */
function extractWaveSpeedOutput(json: any): string | null {
  const dataObj = json?.data && !Array.isArray(json.data) ? json.data : json
  const outputs = Array.isArray(dataObj?.outputs) ? dataObj.outputs : []
  for (const entry of outputs) {
    if (typeof entry === 'string' && entry.trim()) {
      const s = entry.trim()
      if (/^(?:https?:\/\/|data:image\/)/i.test(s)) return s
      if (s.length > 64) return `data:image/png;base64,${s}`
    } else if (entry && typeof entry === 'object') {
      const candidate = entry.url || entry.image_url || entry.download_url
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
      if (typeof entry.b64_json === 'string' && entry.b64_json.trim()) {
        return `data:image/png;base64,${entry.b64_json.trim()}`
      }
    }
  }
  return extractUniversalImage(json)
}

/** 解析 HTTP Retry-After 响应头为毫秒数（限定在 1s~10s） */
function parseRetryAfterMs(res: Response, fallbackMs: number): number {
  const raw = res.headers.get('retry-after')
  if (!raw) return fallbackMs
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(10_000, Math.max(1_000, Math.round(seconds * 1000)))
  }
  return fallbackMs
}

/** 遇到未知/自定义 WaveSpeed 模型的 HTTP 400 参数校验失败时尝试就地兼容降级字段 */
function adaptWaveSpeedPayloadOn400(payload: Record<string, unknown>, message: string): boolean {
  if (!message) return false
  let changed = false

  if (/\bimage\b.*is a required|field required.*\bimage\b|missing.*\bimage\b/i.test(message) && Array.isArray(payload.images)) {
    const first = payload.images[0]
    delete payload.images
    if (first !== undefined) payload.image = first
    return true
  }
  if (/\bimages\b.*is a required|field required.*\bimages\b|missing.*\bimages\b/i.test(message) && typeof payload.image === 'string') {
    payload.images = [payload.image]
    delete payload.image
    return true
  }

  // 提取校验消息中指出的具体未允许字段名并剔除
  const fieldMatches = message.matchAll(/['"`]([a-z_][a-z0-9_]*)['"`]\s*(?:was unexpected|is not allowed|not permitted|unknown|unsupported|unexpected)/gi)
  for (const m of fieldMatches) {
    const field = m[1]
    if (field && field !== 'prompt' && field in payload) {
      delete payload[field]
      changed = true
    }
  }
  if (changed) return true

  // 针对未显式点名字段的额外属性错误按保守顺序剥离可选字段
  if (/additional properties|extra (?:inputs?|fields?)|unsupported|unknown/i.test(message)) {
    for (const optKey of [
      'complexity',
      'input_fidelity',
      'background',
      'strength',
      'seed',
      'output_format',
      'quality',
      'resolution',
      'size',
      'aspect_ratio',
    ]) {
      if (optKey in payload) {
        delete payload[optKey]
        return true
      }
    }
  }

  return false
}

/** 将 0 起始的 `<IMAGE_k>` 占位符转为 1 起始的 `图1`/`图2`（供 GPT Image、Grok Imagine、Dreamina 等按 1 起始顺序解析参考图的模型使用） */
function replaceImageTagsWithOneBased(prompt: string): string {
  return prompt
    .replace(/<IMAGE_(\d+)>/gi, (_match, numStr) => `图${Number(numStr) + 1}`)
    .trim()
}

/**
 * 为 Grok 准备参考图数组与提示词：
 * 1. Grok 最多支持 5 张参考图；
 * 2. `grok-imagine-image-2.0` 按 `images` 数组 1 起始自然顺序解析多图（`<IMAGE_0>` 为视频模型语法），
 *    因此将 `<IMAGE_k>` 转为 `图(k+1)`，并在仅使用旧版 `图1/图2/...` 时将姿势图置为 `图1`。
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
    return { refsLimited: rawRefs, grokPrompt: replaceImageTagsWithOneBased(prompt) }
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
  const origNumToNewNum = new Map<number, number>(
    orderedRefs.map((entry, newIdx) => [entry.origNum, newIdx + 1]),
  )

  const grokPrompt = prompt
    .replace(/(?<![\dA-Za-z])图([1-9]\d*)(?!\d)/g, (match, numStr) => {
      const mappedNum = origNumToNewNum.get(Number(numStr))
      return mappedNum !== undefined ? `图${mappedNum}` : match
    })
    .replace(/ {2,}/g, ' ')
    .trim()

  return { refsLimited, grokPrompt }
}

/**
 * 预处理 Muse 2 API 输入：
 * 1. 参考图上限 10 张；
 * 2. muse2api 通过 1 起始的 `[图N]` 识别提示词与附件索引映射，
 *    将主提示词中的 0 起始 `<IMAGE_k>` 转换为 `[图(k+1)]`，并将 `图1/图2/...` 统一转换为 `[图1]/[图2]/...`；
 * 3. 明确指示直接执行图像生成，避免 Muse 网页智能体只回文字建议。
 */
function prepareMuseInputs(
  prompt: string,
  resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
): {
  refsLimited: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  musePrompt: string
} {
  const refsLimited = resolvedAll.slice(0, 10)
  const converted = prompt
    .replace(/<IMAGE_(\d+)>/gi, (_match, numStr) => `[图${Number(numStr) + 1}]`)
    .replace(/\[(?:图|图片)([1-9]\d*)\]/g, '[图$1]')
    .replace(/(?<![[\dA-Za-z])图([1-9]\d*)(?!\d|\])/g, '[图$1]')
    .trim()
  const musePrompt = `${converted}\n• 输出指令：请直接调用图像生成能力绘制并输出唯一一张最终成图，不要回复纯文字方案、建议或询问。`
  return { refsLimited, musePrompt }
}

const GEMINI_LAYOUT_NEGATIVE_TERM_RE =
  /(分屏|拼图|拼贴|多宫格|宫格|多视图|多角度|对比图|前后对比|对比|三视图|设定表|重复人物|同人重复|双胞胎|分格|split[\s-]*screen|collage|multi[\s-]*(?:grid|view|panel)|comparison|duplicate|twins)/i

/** 为 Gemini 原生多图模态构造紧邻每张参考图的短标签，避免裸图序混淆 */
function buildGeminiRefPartLabel(source: ResolvedSource, num: number): string {
  switch (source.slot) {
    case 'pose':
      return `图${num}（姿势动作参考：仅提取人物动作骨架、四肢朝向与人数，忽略图中文字、编号及灰白模/深度图底色）：`
    case 'costume':
      return `图${num}（服装配饰参考：仅提取服装与配饰的款式、配色和材质细节，忽略原图姿态与背景）：`
    case 'portrait':
      return `图${num}（人像外貌参考：仅提取脸型五官、神态与发型发色，忽略原图构图与穿搭）：`
    case 'stitched':
      return `图${num}（分区拼合参考：仅提取各区要素，彻底去除边框、分隔线与标注文字，融合生成唯一单幅连续画面）：`
    default:
      return source.label
        ? `图${num}（补充参考：${source.label}）：`
        : `图${num}（补充参考）：`
  }
}

const GEMINI_RECLINING_POSE_RE = /侧卧|仰卧|俯卧|卧姿|卧在|躺|趴|匍匐|recline|lying|prone|supine/i

/** 为 Gemini 构造前置构图与机位指令，在模型读取参考图前先确立单帧空间与视角 */
function buildGeminiLeadInstruction(
  prompt: string,
  aspectRatio: GenerationAspectRatio,
): { leadInstruction: string; isVerticalReclining: boolean } {
  if (aspectRatio === 'auto') {
    return { isVerticalReclining: false, leadInstruction: '' }
  }
  const isVertical = aspectRatio === '3:4' || aspectRatio === '9:16'
  const orientationLabel = isVertical
    ? '竖构图'
    : aspectRatio === '4:3' || aspectRatio === '16:9'
      ? '横构图'
      : '方形构图'
  const isReclining = GEMINI_RECLINING_POSE_RE.test(prompt)
  const isVerticalReclining = isVertical && isReclining

  if (isVerticalReclining) {
    return {
      isVerticalReclining,
      leadInstruction: `【单张 ${aspectRatio} 竖构图实拍构图】只生成唯一一张无缝满画幅的 ${aspectRatio} 竖幅完整照片：采用约 45° 略高斜侧俯拍的纵深机位（不要用平视正侧面，避免主体横向压扁），让侧卧的人物沿着画面斜对角线由近及远自然舒展在中下区域；画面最底部是连续延伸的近景地面与地毯质感，画面上半部分必须展示高挑连续的真实环境纵深（例如落地窗纱、高大室内绿植、墙面与顶部柔和自然光）一直贯通延伸到画幅最上边缘，上下连为同一个连续统一空间。`,
    }
  }
  if (isVertical) {
    return {
      isVerticalReclining,
      leadInstruction: `【单张 ${aspectRatio} 竖构图实拍构图】只生成唯一一张无缝满画幅的 ${aspectRatio} 竖幅完整照片，使用单一连续镜头呈现从画幅最顶端贯通到最底端的统一真实场景，主体比例自然协调。`,
    }
  }
  return {
    isVerticalReclining,
    leadInstruction: `【单张 ${aspectRatio} ${orientationLabel}实拍构图】只生成唯一一张无缝满画幅的 ${aspectRatio} 完整照片，使用单一连续镜头与统一连贯的完整空间。`,
  }
}

/**
 * 预处理 Google Gemini 生图提示词：
 * 1. 将 `<IMAGE_k>` 转换为 1 起始的 `图1/图2/...`，与附件顺序严格对齐；
 * 2. 剔除易在 Gemini/Nano Banana 注意力中反向激活分格拼图的否定词（“避免：分屏，拼图，对比图...”），
 *    并将负向防分屏条款改写为具体摄影机位与连续空间描写；
 * 3. 在提示词最前端（及参考图之前）先确立目标画幅、斜向俯拍透视与上下连续背景，避免横卧姿势在 3:4 竖框中被叠成双格。
 */
function prepareGeminiInputs(
  prompt: string,
  resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>,
  aspectRatio: GenerationAspectRatio,
): { leadInstruction: string; geminiPrompt: string } {
  const { leadInstruction, isVerticalReclining } = buildGeminiLeadInstruction(prompt, aspectRatio)
  const poseIdx = resolvedAll.findIndex((item) => item.source.slot === 'pose')
  const poseTag = poseIdx >= 0 ? `图${poseIdx + 1}` : '姿势参考图'

  let normalized = replaceImageTagsWithOneBased(prompt)
    .replace(/拼合参考图图(\d+)/g, '拼合参考图$1')
    .replace(
      /[，,、；;]*\s*严禁分屏[、，,]*拼贴或同人重复出现/g,
      '，整张画面为单一镜头的连续完整实景',
    )

  if (isVerticalReclining) {
    const poseClauseRe = new RegExp(`严格按照${poseTag}(?:\\(([^)]+)\\))?摆姿势`)
    if (poseClauseRe.test(normalized)) {
      normalized = normalized.replace(
        poseClauseRe,
        (_m, title: string | undefined) =>
          `保持${poseTag}${title ? `（${title}）` : ''}的身体卧姿与四肢相对动作（镜头改用约 45° 斜侧俯拍纵深透视以自然充满 ${aspectRatio} 竖幅，不照搬${poseTag}的平视正侧面视角）`,
      )
    } else {
      normalized = normalized.replace(
        new RegExp(`严格按照${poseTag}`),
        `保持${poseTag}的身体卧姿与四肢相对动作（镜头改用约 45° 斜侧俯拍纵深透视以自然充满 ${aspectRatio} 竖幅，不照搬${poseTag}的平视正侧面视角）之`,
      )
    }
  }

  const filteredLines: string[] = []
  for (const line of normalized.split(/\r?\n/)) {
    const avoidMatch = line.match(/^避免[：:]\s*(.+)$/)
    if (!avoidMatch) {
      filteredLines.push(line)
      continue
    }
    const keptTerms = avoidMatch[1]
      .split(/[，,、；;]+/)
      .map((item) => item.trim())
      .filter((item) => item && !GEMINI_LAYOUT_NEGATIVE_TERM_RE.test(item))
    if (keptTerms.length > 0) {
      filteredLines.push(`避免：${keptTerms.join('，')}`)
    }
  }

  const bodyText = filteredLines.join('\n').trim()
  return {
    leadInstruction,
    geminiPrompt: leadInstruction ? `${leadInstruction}\n${bodyText}`.trim() : bodyText,
  }
}

/** 执行 Muse 2 API 异步生图任务 (/v1/images/tasks -> 轮询 /v1/images/tasks/{task_id})，彻底规避反代长连接超时 */
async function runMuseTaskGeneration(args: {
  env: Env
  v1BaseUrl: string
  apiKey: string
  model: string
  prompt: string
  aspectRatio: GenerationAspectRatio
  museCfg: MuseParams
  refsLimited: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  trackedFetch: (spec: TrackedFetchSpec) => Promise<{ res: Response; json: any }>
  attemptState: { current: GenerationAttemptTrace | null }
  emitPendingFailure: (errMsg: string, retryable: boolean | null, safetyBlocked: boolean | null) => void
  onStage?: GenerationTraceContext['onStage']
}): Promise<{ res: Response; json: any; outputRef: string | null }> {
  const {
    env,
    v1BaseUrl,
    apiKey,
    model,
    prompt,
    aspectRatio,
    museCfg,
    refsLimited,
    trackedFetch,
    attemptState,
    emitPendingFailure,
    onStage,
  } = args

  const effectiveMuseRatio =
    aspectRatio === 'auto'
      ? null
      : !museCfg.aspectRatio || museCfg.aspectRatio === 'auto'
        ? aspectRatio
        : museCfg.aspectRatio
  const payload: Record<string, unknown> = {
    model,
    prompt,
    ...(effectiveMuseRatio ? { aspect_ratio: effectiveMuseRatio } : {}),
    response_format: museCfg.responseFormat || 'b64_json',
  }
  if (refsLimited.length > 0) {
    payload.images = refsLimited.map((item) => item.ref)
  }

  const { res, json } = await trackedFetch({
    url: `${v1BaseUrl}/images/tasks`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    auditParams: payload,
    timeoutMs: 90_000,
  })

  if (!res.ok) {
    const errMsg = summarizeUpstreamError(json, res.status)
    const fullMsg = `[${PROVIDER_META.muse.shortName}] ${errMsg}`
    const safety = isSafetyOrPolicyError(errMsg)
    const retryable = isRetryableStatus(res.status) && !safety
    emitPendingFailure(fullMsg, retryable, safety)
    throw new UpstreamError(fullMsg, retryable, res.status, safety)
  }

  const taskId = String(json?.task_id || json?.id || json?.data?.task_id || json?.data?.id || '').trim()
  if (taskId && attemptState.current?.response && !attemptState.current.response.requestId) {
    attemptState.current.response.requestId = taskId
  }

  const immediateStatus = typeof json?.status === 'string' ? json.status.toLowerCase() : ''
  const immediateOut = extractUniversalImage(json)
  if ((immediateStatus === 'completed' || !immediateStatus) && immediateOut) {
    return { res, json, outputRef: immediateOut }
  }

  if (!taskId) {
    const errMsg = summarizeUpstreamError(json, res.status || 502)
    const fullMsg = `[${PROVIDER_META.muse.shortName}] 未返回异步任务 ID：${errMsg}`
    emitPendingFailure(fullMsg, false, false)
    throw new UpstreamError(fullMsg, false, res.status || 502, false)
  }

  const pollUrl = `${v1BaseUrl}/images/tasks/${encodeURIComponent(taskId)}`
  const pollStartedAt = Date.now()
  // 对齐 muse2api 上游默认超时（MUSE2API_IMAGE_TIMEOUT=240s），留 10s 余量避免 130~240s 正常出图被误判超时重跑
  const maxPollDurationMs = 250_000
  let consecutivePollErrors = 0
  let pollIdx = 0

  while (Date.now() - pollStartedAt < maxPollDurationMs) {
    const waitMs = pollIdx === 0 ? 5_000 : 4_000
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    pollIdx += 1

    await onStage?.('generating', '缪斯织梦绘制中…')

    let pollRes: Response
    let pollJson: any
    try {
      const fetched = await fetchUpstream(
        pollUrl,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        env,
        25_000
      )
      pollRes = fetched.res
      pollJson = fetched.json
    } catch (err) {
      consecutivePollErrors += 1
      if (consecutivePollErrors <= 4) {
        continue
      }
      const msg = err instanceof Error ? err.message : '轮询任务状态超时'
      const fullMsg = `[${PROVIDER_META.muse.shortName}] ${msg}`
      emitPendingFailure(fullMsg, false, false)
      throw new UpstreamError(fullMsg, false, 504, false)
    }

    if (!pollRes.ok) {
      const errMsg = summarizeUpstreamError(pollJson, pollRes.status)
      if (isRetryableStatus(pollRes.status) && consecutivePollErrors < 4) {
        consecutivePollErrors += 1
        continue
      }
      const safety = isSafetyOrPolicyError(errMsg)
      const fullMsg = `[${PROVIDER_META.muse.shortName}] ${errMsg}`
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: false,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      emitPendingFailure(fullMsg, false, safety)
      throw new UpstreamError(fullMsg, false, pollRes.status, safety)
    }

    consecutivePollErrors = 0
    const pollStatus = typeof pollJson?.status === 'string' ? pollJson.status.toLowerCase() : ''

    if (pollStatus === 'completed') {
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: true,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      return { res: pollRes, json: pollJson, outputRef: extractUniversalImage(pollJson) }
    }

    if (pollStatus === 'failed' || pollStatus === 'cancelled' || pollStatus === 'timeout') {
      const errMsg = summarizeUpstreamError(pollJson, 502)
      const safety = isSafetyOrPolicyError(errMsg)
      const retryable = !safety && /timeout|502|503|busy|overload|拥挤|繁忙|重绘|重试/i.test(errMsg)
      const fullMsg = `[${PROVIDER_META.muse.shortName}] ${errMsg}`
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: false,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      emitPendingFailure(fullMsg, retryable, safety)
      throw new UpstreamError(fullMsg, retryable, 502, safety)
    }
  }

  const timeoutMsg = `[${PROVIDER_META.muse.shortName}] 生成任务轮询超时 (task: ${taskId})`
  // 已完整等待 250s 仍无结果，再重跑一轮会超过全站 processingTimeoutSec(360s) 导致中途被回收
  emitPendingFailure(timeoutMsg, false, false)
  throw new UpstreamError(timeoutMsg, false, 504, false)
}

interface TrackedFetchSpec {
  url: string
  headers: Record<string, string>
  body: BodyInit
  auditParams: Record<string, unknown>
  modelOverride?: string
  timeoutMs?: number
  parseSse?: boolean
  triggerOverride?: {
    triggerType: GenerationAttemptTriggerType
    triggerReason: string
    previousError: string
  }
}

/** 将平台标准 `<IMAGE_k>` 占位符转为 Dreamina 易理解的 `图1`/`图2`（不附带任何 Muse 专用后缀） */
function formatDreaminaPrompt(prompt: string): string {
  return replaceImageTagsWithOneBased(prompt)
}

/** 统一执行 Dreamina 浏览器桥 (scripts/dreamina-bridge: /v1/images/generations -> 轮询 -> /v1/download 取原图) */
async function runDreaminaGeneration(args: {
  env: Env
  provider: ImageProviderId
  baseUrl: string
  apiKey: string
  rawModel: string
  prompt: string
  aspectRatio?: string | null
  resolution?: string | null
  resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  dreaminaOpts: DreaminaChannelOptions
  trackedFetch: (spec: TrackedFetchSpec) => Promise<{ res: Response; json: any }>
  attemptState: { current: GenerationAttemptTrace | null }
  emitPendingFailure: (errMsg: string, retryable: boolean | null, safetyBlocked: boolean | null) => void
  onStage?: GenerationTraceContext['onStage']
}): Promise<{ res: Response; json: any; outputRef: string | null }> {
  const {
    env,
    provider,
    baseUrl,
    apiKey,
    rawModel,
    prompt,
    aspectRatio,
    resolution,
    resolvedAll,
    dreaminaOpts,
    trackedFetch,
    attemptState,
    emitPendingFailure,
    onStage,
  } = args

  const v1 = normalizeV1Base(baseUrl)
  const origin = new URL(baseUrl).origin
  const model = rawModel.trim() || 'seedream-5.0-flash'
  const selectedRefs = resolvedAll.slice(0, 6)

  const payload: Record<string, unknown> = {
    model,
    prompt: formatDreaminaPrompt(prompt),
  }
  if (aspectRatio && aspectRatio.trim() && aspectRatio.trim() !== 'auto') {
    payload.aspect_ratio = aspectRatio.trim()
  }
  if (resolution && resolution.trim()) {
    payload.resolution = resolution.trim()
  }
  if (selectedRefs.length > 0) {
    payload.ref_images = selectedRefs.map((item) => item.ref)
  }

  const bridgeHeaders: Record<string, string> = {
    'x-bridge-token': apiKey,
    Authorization: `Bearer ${apiKey}`,
  }

  const { res, json } = await trackedFetch({
    url: `${v1}/images/generations`,
    headers: {
      'Content-Type': 'application/json',
      ...bridgeHeaders,
    },
    body: JSON.stringify(payload),
    auditParams: payload,
    timeoutMs: 90_000,
  })

  if (!res.ok) {
    const errMsg = summarizeUpstreamError(json, res.status)
    const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
    const safety = isSafetyOrPolicyError(errMsg)
    const nonRetryable = res.status === 401 || res.status === 403 || /invalid token/i.test(errMsg)
    const retryable = isRetryableStatus(res.status) && !safety && !nonRetryable
    emitPendingFailure(fullMsg, retryable, safety)
    throw new UpstreamError(fullMsg, retryable, res.status, safety)
  }

  const taskId = String(json?.id || json?.task_id || '').trim()
  if (taskId && attemptState.current?.response && !attemptState.current.response.requestId) {
    attemptState.current.response.requestId = taskId
  }

  if (!taskId) {
    const errMsg = summarizeUpstreamError(json, res.status || 502)
    const fullMsg = `[${PROVIDER_META[provider].shortName}] Dreamina 桥未返回任务 ID：${errMsg}`
    emitPendingFailure(fullMsg, false, false)
    throw new UpstreamError(fullMsg, false, res.status || 502, false)
  }

  const pollUrl = `${v1}/images/generations/${encodeURIComponent(taskId)}`
  const pollStartedAt = Date.now()
  const maxPollDurationMs = 335_000
  let consecutivePollErrors = 0
  let pollIdx = 0

  while (Date.now() - pollStartedAt < maxPollDurationMs) {
    const waitMs = Math.min(4_000, 2_500 + pollIdx * 500)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    pollIdx += 1

    let pollRes: Response
    let pollJson: any
    try {
      const fetched = await fetchUpstream(
        pollUrl,
        {
          method: 'GET',
          headers: bridgeHeaders,
        },
        env,
        35_000
      )
      pollRes = fetched.res
      pollJson = fetched.json
    } catch (err) {
      consecutivePollErrors += 1
      if (consecutivePollErrors <= 4) {
        continue
      }
      const msg = err instanceof Error ? err.message : 'Dreamina 桥轮询任务状态超时'
      const fullMsg = `[${PROVIDER_META[provider].shortName}] ${msg}`
      emitPendingFailure(fullMsg, false, false)
      throw new UpstreamError(fullMsg, false, 504, false)
    }

    if (!pollRes.ok) {
      const errMsg = summarizeUpstreamError(pollJson, pollRes.status)
      if (isRetryableStatus(pollRes.status) && consecutivePollErrors < 4) {
        consecutivePollErrors += 1
        continue
      }
      const safety = isSafetyOrPolicyError(errMsg)
      const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: false,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      emitPendingFailure(fullMsg, false, safety)
      throw new UpstreamError(fullMsg, false, pollRes.status, safety)
    }

    consecutivePollErrors = 0
    const pollStatus = typeof pollJson?.status === 'string' ? pollJson.status.toLowerCase() : ''
    const pollStage = typeof pollJson?.stage === 'string' && pollJson.stage.trim() ? pollJson.stage.trim() : '正在绘制中…'
    await onStage?.('generating', pollStage)

    if (pollStatus === 'succeeded' || pollStatus === 'completed') {
      const firstImg = Array.isArray(pollJson?.images) ? pollJson.images[0] : null
      const preferPreview = dreaminaOpts.dreaminaOutputQuality === 'preview'
      const relPath =
        firstImg && typeof firstImg === 'object'
          ? preferPreview
            ? firstImg.proxy || firstImg.download
            : firstImg.download || firstImg.proxy
          : null

      let outputRef: string | null = null
      if (typeof relPath === 'string' && relPath.trim()) {
        await onStage?.('downloading_output', preferPreview ? '正在获取生成结果…' : '正在直取高清原图…')
        const imgUrl = relPath.startsWith('http') ? relPath : `${origin}${relPath.startsWith('/') ? '' : '/'}${relPath}`
        const downloadUrl =
          typeof firstImg === 'object' && typeof firstImg?.download === 'string' && firstImg.download.trim()
            ? `${origin}${firstImg.download.startsWith('/') ? '' : '/'}${firstImg.download}`
            : null
        const proxyUrl =
          typeof firstImg === 'object' && typeof firstImg?.proxy === 'string' && firstImg.proxy.trim()
            ? `${origin}${firstImg.proxy.startsWith('/') ? '' : '/'}${firstImg.proxy}`
            : null

        let loadedOut: LoadedImage | null = null
        let lastDlErr: unknown = null
        const primaryUrl = preferPreview ? proxyUrl || imgUrl : downloadUrl || imgUrl
        const maxPrimaryAttempts = preferPreview ? 2 : 3
        const perAttemptTimeoutMs = preferPreview ? 30_000 : 22_000

        // 分多次短超时拉取（正常 1~3s 即完成），避免代理单条 TCP 假死白等 90s
        for (let dlAttempt = 0; dlAttempt < maxPrimaryAttempts; dlAttempt++) {
          try {
            const imgRes = await devProxyAwareFetch(
              primaryUrl,
              { method: 'GET', headers: bridgeHeaders, signal: AbortSignal.timeout(perAttemptTimeoutMs) },
              env,
              perAttemptTimeoutMs
            )
            loadedOut = await readResponseImage(imgRes, MAX_OUTPUT_IMAGE_BYTES)
            break
          } catch (dlErr) {
            lastDlErr = dlErr
            if (dlAttempt + 1 < maxPrimaryAttempts) {
              await new Promise((r) => setTimeout(r, 400))
            }
          }
        }

        if (loadedOut) {
          outputRef = `data:${loadedOut.mime};base64,${bytesToBase64(loadedOut.bytes)}`
        } else if (!preferPreview && proxyUrl && firstImg?.originalCaptured === true) {
          // 仅当 /v1/proxy 同样指向抓包到的无损原图时允许降级通道，绝不把 270×360 预览图冒充 2K 成图保存
          const proxyRes = await devProxyAwareFetch(
            proxyUrl,
            { method: 'GET', headers: bridgeHeaders, signal: AbortSignal.timeout(25_000) },
            env,
            25_000
          )
          const loadedProxy = await readResponseImage(proxyRes, MAX_OUTPUT_IMAGE_BYTES)
          outputRef = `data:${loadedProxy.mime};base64,${bytesToBase64(loadedProxy.bytes)}`
        } else {
          const msg = lastDlErr instanceof Error ? lastDlErr.message : '原图下载失败'
          const fullMsg = `[${PROVIDER_META[provider].shortName}] ${msg}`
          emitPendingFailure(fullMsg, false, false)
          throw new UpstreamError(fullMsg, false, 502, false)
        }
      } else if (typeof firstImg === 'string') {
        outputRef = firstImg
      } else if (typeof firstImg?.url === 'string') {
        outputRef = firstImg.url
      } else {
        outputRef = extractUniversalImage(pollJson)
      }

      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: true,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      return { res: pollRes, json: pollJson, outputRef }
    }

    if (pollStatus === 'failed' || pollStatus === 'cancelled' || pollStatus === 'timeout') {
      const errMsg =
        typeof pollJson?.error === 'string' && pollJson.error.trim()
          ? pollJson.error.trim()
          : summarizeUpstreamError(pollJson, 502)
      const safety = isSafetyOrPolicyError(errMsg)
      const authOrConfig = /未登录|登录|invalid token|CDP|连接失败|no-prompt-input|no-submit-button/i.test(errMsg)
      const retryable = !safety && !authOrConfig && /timeout|超时/i.test(errMsg)
      const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: false,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      emitPendingFailure(fullMsg, retryable, safety)
      throw new UpstreamError(fullMsg, retryable, 502, safety)
    }
  }

  const timeoutMsg = `[${PROVIDER_META[provider].shortName}] Dreamina 桥生成任务轮询超时 (task: ${taskId})`
  emitPendingFailure(timeoutMsg, false, false)
  throw new UpstreamError(timeoutMsg, false, 504, false)
}

/** 统一执行 WaveSpeed API v3 提交、同步等待与异步轮询流程（支持 GPT/Grok/Gemini 任意槽位与精选模型） */
async function runWaveSpeedGeneration(args: {
  env: Env
  provider: ImageProviderId
  baseUrl: string
  apiKey: string
  rawModel: string
  prompt: string
  aspectRatio: GenerationAspectRatio
  resolution?: StudioResolution | null
  resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  geminiCfg: GeminiParams
  grokCfg: GrokParams
  seedreamCfg: SeedreamParams
  wsOpts: WaveSpeedChannelOptions
  trackedFetch: (spec: TrackedFetchSpec) => Promise<{ res: Response; json: any }>
  attemptState: { current: GenerationAttemptTrace | null }
  emitPendingFailure: (errMsg: string, retryable: boolean | null, safetyBlocked: boolean | null) => void
  onStage?: GenerationTraceContext['onStage']
}): Promise<{ res: Response; json: any; outputRef: string | null }> {
  const {
    env,
    provider,
    baseUrl,
    apiKey,
    rawModel,
    prompt,
    aspectRatio,
    resolution,
    resolvedAll,
    geminiCfg,
    grokCfg,
    seedreamCfg,
    wsOpts,
    trackedFetch,
    attemptState,
    emitPendingFailure,
    onStage,
  } = args

  const effectiveModel = resolveWaveSpeedModelId(rawModel, resolvedAll.length > 0)
  const spec = getWaveSpeedModelSpec(effectiveModel)
  const endpoints = buildWaveSpeedEndpoints(baseUrl)

  const refsOnly = resolvedAll.filter((item) => item.source.slot !== 'stitched')
  const stitchedItem = resolvedAll.find((item) => item.source.slot === 'stitched')

  let selectedRefs: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }> = []
  let usedCollapsedStitched = false
  if (spec.imageMode === 'single') {
    if (refsOnly.length > 1 && stitchedItem) {
      selectedRefs = [stitchedItem]
      usedCollapsedStitched = true
    } else if (refsOnly[0] || resolvedAll[0]) {
      selectedRefs = [refsOnly[0] || resolvedAll[0]]
    }
  } else if (spec.imageMode === 'array') {
    if (resolvedAll.length <= spec.maxImages) {
      selectedRefs = resolvedAll
    } else {
      selectedRefs = refsOnly.slice(0, spec.maxImages)
    }
  }

  const uploadedUrls = await Promise.all(
    selectedRefs.map((item) =>
      uploadWaveSpeedMediaIfNeeded(item, endpoints.mediaUploadUrl, apiKey, env)
    )
  )

  const configuredWsRes = wsOpts.wavespeedResolution
  const fallbackAutoResolution: StudioResolution =
    resolution ??
    (provider === 'grok'
      ? (grokCfg.resolution.toUpperCase() as StudioResolution)
      : provider === 'gemini'
        ? geminiCfg.imageSize
        : provider === 'seedream'
          ? (seedreamCfg.resolution.toUpperCase() as StudioResolution)
          : '1.5K')
  const targetResolution: StudioResolution =
    configuredWsRes === '1k'
      ? '1K'
      : configuredWsRes === '1.5k'
        ? '1.5K'
        : configuredWsRes === '2k'
          ? '2K'
          : fallbackAutoResolution

  const payload: Record<string, unknown> = {
    prompt: formatWaveSpeedPrompt(prompt, spec, uploadedUrls.length, usedCollapsedStitched),
  }
  if (spec.imageMode === 'single' && uploadedUrls[0]) {
    payload.image = uploadedUrls[0]
  } else if (spec.imageMode === 'array' && uploadedUrls.length > 0) {
    payload.images = uploadedUrls
  }

  if (spec.sizeMode === 'aspect_resolution') {
    if (aspectRatio !== 'auto') payload.aspect_ratio = aspectRatio
    const pickedRes = pickWaveSpeedResolution(spec.resolutions, targetResolution)
    if (pickedRes) payload.resolution = pickedRes
  } else if (spec.sizeMode === 'aspect_only') {
    if (aspectRatio !== 'auto') payload.aspect_ratio = aspectRatio
  } else if (spec.sizeMode === 'size') {
    if (aspectRatio !== 'auto') {
      payload.size = computeWaveSpeedPixelSize(
        aspectRatio,
        targetResolution,
        spec.minDim ?? 256,
        spec.maxDim ?? 2048
      )
    }
  }

  if (
    spec.outputFormats &&
    spec.outputFormats.length > 0 &&
    wsOpts.wavespeedOutputFormat &&
    wsOpts.wavespeedOutputFormat !== 'auto' &&
    (spec.outputFormats as readonly string[]).includes(wsOpts.wavespeedOutputFormat)
  ) {
    payload.output_format = wsOpts.wavespeedOutputFormat
  }

  if (spec.supportsSeed && typeof wsOpts.wavespeedSeed === 'number' && Number.isFinite(wsOpts.wavespeedSeed) && wsOpts.wavespeedSeed >= 0) {
    payload.seed = Math.floor(wsOpts.wavespeedSeed)
  }

  const useSyncMode = wsOpts.wavespeedSyncMode === true
  if (useSyncMode) {
    payload.enable_sync_mode = true
  }
  payload.enable_base64_output = false

  const submitUrl = endpoints.submitUrl(effectiveModel)
  const jsonHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  let res!: Response
  let json: any
  let lastTriggerOverride: TrackedFetchSpec['triggerOverride'] | undefined

  // 允许对 429 限流、未建立 TLS/连接的预请求故障以及未知自定义模型的 HTTP 400 参数兼容做有限自动调整
  for (let submitTry = 0; submitTry < 3; submitTry++) {
    try {
      ;({ res, json } = await trackedFetch({
        url: submitUrl,
        headers: jsonHeaders,
        body: JSON.stringify(payload),
        auditParams: { ...payload },
        modelOverride: effectiveModel,
        timeoutMs: useSyncMode ? 90_000 : 45_000,
        triggerOverride: lastTriggerOverride,
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'WaveSpeed 提交请求超时或网络中断'
      const preRequestErr = isPreRequestTransportError(errMsg)
      if (preRequestErr && submitTry < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        lastTriggerOverride = {
          triggerType: 'transient_retry',
          triggerReason: '连接或 TLS 握手尚未完成即断开（请求未发出），安全重试提交',
          previousError: errMsg,
        }
        continue
      }
      // 按 WaveSpeed 官方规范，POST 发生不确定超时/网络中断时不自动重发以免重复扣费；
      // 若明确在 TLS/连接建立前失败（请求未发出），允许上层调度器继续重试或切换密钥
      if (err instanceof UpstreamError) {
        throw new UpstreamError(err.message, preRequestErr, err.status ?? 504, err.safetyBlocked)
      }
      throw new UpstreamError('WaveSpeed 提交请求超时或网络中断', preRequestErr, 504, false)
    }

    if (res.ok) break

    const errMsg = summarizeUpstreamError(json, res.status)
    const errCode = Number(json?.code || json?.data?.code || 0)
    const isPreRequestFailure =
      res.headers.get('x-dev-pre-request-error') === '1' || isPreRequestTransportError(errMsg)

    if (isPreRequestFailure && submitTry < 2) {
      emitPendingFailure(`[${PROVIDER_META[provider].shortName}] ${errMsg}`, true, false)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      lastTriggerOverride = {
        triggerType: 'transient_retry',
        triggerReason: '连接或 TLS 握手尚未完成即断开（请求未发出），安全重试提交',
        previousError: errMsg,
      }
      continue
    }

    if (res.status === 429 && submitTry < 2) {
      const waitMs = parseRetryAfterMs(res, 2500)
      emitPendingFailure(`[${PROVIDER_META[provider].shortName}] ${errMsg}`, true, false)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      lastTriggerOverride = {
        triggerType: 'transient_retry',
        triggerReason: `WaveSpeed 触发限流 (429)，等待 ${(waitMs / 1000).toFixed(1)}s 后重发`,
        previousError: errMsg,
      }
      continue
    }

    if (res.status === 400 && submitTry < 2 && adaptWaveSpeedPayloadOn400(payload, errMsg)) {
      emitPendingFailure(`[${PROVIDER_META[provider].shortName}] ${errMsg}`, true, false)
      lastTriggerOverride = {
        triggerType: 'compat_downgrade',
        triggerReason: `模型 ${effectiveModel} 拒绝部分参数（${errMsg.slice(0, 80)}），已自动精简不兼容字段并重新提交`,
        previousError: errMsg,
      }
      continue
    }

    const safety = errCode === 1200 || isSafetyOrPolicyError(errMsg)
    const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
    const retryable = isPreRequestFailure && !safety
    emitPendingFailure(fullMsg, retryable, safety)
    throw new UpstreamError(fullMsg, retryable, res.status, safety)
  }

  const dataObj = json?.data && !Array.isArray(json.data) ? json.data : json
  const submitCode = Number(json?.code || dataObj?.code || 200)
  const submitStatus = typeof dataObj?.status === 'string' ? dataObj.status.toLowerCase() : ''
  const taskId = typeof dataObj?.id === 'string' ? dataObj.id.trim() : ''
  if (taskId && attemptState.current?.response && !attemptState.current.response.requestId) {
    attemptState.current.response.requestId = taskId
  }

  if (submitStatus === 'failed' || submitStatus === 'cancelled' || submitStatus === 'timeout' || submitStatus === 'deleted') {
    const errMsg = summarizeUpstreamError(json, res.status || 400)
    const safety = submitCode === 1200 || isSafetyOrPolicyError(errMsg)
    const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
    emitPendingFailure(fullMsg, false, safety)
    throw new UpstreamError(fullMsg, false, res.status || 400, safety)
  }

  const immediateOutput = extractWaveSpeedOutput(json)
  if ((submitStatus === 'completed' || !submitStatus) && immediateOutput) {
    return { res, json, outputRef: immediateOutput }
  }

  if (!taskId) {
    const errMsg = summarizeUpstreamError(json, res.status || 502)
    const safety = submitCode === 1200 || isSafetyOrPolicyError(errMsg)
    const fullMsg = `[${PROVIDER_META[provider].shortName}] WaveSpeed 未返回任务 ID：${errMsg}`
    emitPendingFailure(fullMsg, false, safety)
    throw new UpstreamError(fullMsg, false, res.status || 502, safety)
  }

  const pollUrl = endpoints.pollUrl(taskId)
  const pollStartedAt = Date.now()
  const maxPollDurationMs = 110_000
  let consecutivePollErrors = 0
  let pollIdx = 0

  while (Date.now() - pollStartedAt < maxPollDurationMs) {
    const waitMs = Math.min(3500, 2000 + pollIdx * 500)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    pollIdx += 1

    await onStage?.('generating', '正在绘制中…')

    let pollRes: Response
    let pollJson: any
    try {
      const fetched = await fetchUpstream(
        pollUrl,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        env,
        25_000
      )
      pollRes = fetched.res
      pollJson = fetched.json
    } catch (err) {
      consecutivePollErrors += 1
      if (consecutivePollErrors <= 4) {
        continue
      }
      const msg = err instanceof Error ? err.message : '轮询任务状态超时'
      const fullMsg = `[${PROVIDER_META[provider].shortName}] ${msg}`
      emitPendingFailure(fullMsg, false, false)
      throw new UpstreamError(fullMsg, false, 504, false)
    }

    if (!pollRes.ok) {
      const errMsg = summarizeUpstreamError(pollJson, pollRes.status)
      if (isRetryableStatus(pollRes.status) && consecutivePollErrors < 4) {
        consecutivePollErrors += 1
        if (pollRes.status === 429) {
          const retryMs = parseRetryAfterMs(pollRes, 3000)
          await new Promise((resolve) => setTimeout(resolve, retryMs))
        }
        continue
      }
      const safety = Number(pollJson?.code || 0) === 1200 || isSafetyOrPolicyError(errMsg)
      const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: false,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      emitPendingFailure(fullMsg, false, safety)
      throw new UpstreamError(fullMsg, false, pollRes.status, safety)
    }

    consecutivePollErrors = 0
    const pollData = pollJson?.data && !Array.isArray(pollJson.data) ? pollJson.data : pollJson
    const pollStatus = typeof pollData?.status === 'string' ? pollData.status.toLowerCase() : ''
    const pollCode = Number(pollJson?.code || pollData?.code || 200)

    if (pollStatus === 'completed') {
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: true,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      return { res: pollRes, json: pollJson, outputRef: extractWaveSpeedOutput(pollJson) }
    }

    if (pollStatus === 'failed' || pollStatus === 'cancelled' || pollStatus === 'timeout' || pollStatus === 'deleted') {
      const errMsg = summarizeUpstreamError(pollJson, 400)
      const safety = pollCode === 1200 || isSafetyOrPolicyError(errMsg)
      const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
      if (attemptState.current) {
        attemptState.current.response = {
          status: pollRes.status,
          ok: false,
          requestId: taskId,
          body: sanitizeValueForAudit(pollJson),
          outputSummary: null,
        }
      }
      emitPendingFailure(fullMsg, false, safety)
      throw new UpstreamError(fullMsg, false, 400, safety)
    }
  }

  const timeoutMsg = `[${PROVIDER_META[provider].shortName}] WaveSpeed 生成任务轮询超时 (task: ${taskId})`
  emitPendingFailure(timeoutMsg, false, false)
  throw new UpstreamError(timeoutMsg, false, 504, false)
}

export async function runServerGeneration(params: {
  env: Env
  channel: RunnableChannel
  prompt: string
  recipe: RecipeState
  userId: string
  aspectRatio: GenerationAspectRatio
  resolution?: StudioResolution | null
  imagePassMode: ImagePassMode
  requestOrigin: string
  stitchedR2Key?: string
  /** 非单图拼合模式下是否也随多参考图额外附带三合一拼图（默认兼容开启，由平台 sendStitchedSheet 控制） */
  includeStitchedWithMulti?: boolean
  /** 失败兜底去图重试时允许零张参考图（全文字生图） */
  allowZeroImages?: boolean
  traceContext?: GenerationTraceContext
}): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  const {
    env,
    channel,
    prompt,
    recipe,
    userId,
    aspectRatio,
    resolution,
    imagePassMode,
    requestOrigin,
    stitchedR2Key,
    includeStitchedWithMulti = true,
    allowZeroImages = false,
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
  if (!allowZeroImages && refs.length === 0) {
    throw new UpstreamError('请至少选择或上传 1 张参考图', false)
  }

  const useStitchedSingle = isChannelStitchedSingleMode(
    { model, params: rawParams },
    refs.length
  )
  if (useStitchedSingle && refs.length >= 2 && !stitched) {
    throw new UpstreamError('当前渠道需发送左中右拼合参考图，请刷新生图工作台后重试', false)
  }

  const allSources =
    useStitchedSingle && stitched
      ? [stitched]
      : provider !== 'gemini' && stitched && includeStitchedWithMulti
        ? [...refs, stitched]
        : refs
  const canPassPublicUrls = imagePassMode === 'url' && isPublicHttpsOrigin(requestOrigin)

  const gptCfg: GptParams = { ...DEFAULT_PROVIDER_PARAMS.gpt, ...rawParams, ...ratioPatches.gpt }
  const geminiCfg: GeminiParams = { ...DEFAULT_PROVIDER_PARAMS.gemini, ...rawParams, ...ratioPatches.gemini }
  const grokCfg: GrokParams = { ...DEFAULT_PROVIDER_PARAMS.grok, ...rawParams, ...ratioPatches.grok }
  const museCfg: MuseParams = { ...DEFAULT_PROVIDER_PARAMS.muse, ...rawParams, ...ratioPatches.muse }
  const seedreamCfg: SeedreamParams = { ...DEFAULT_PROVIDER_PARAMS.seedream, ...rawParams, ...ratioPatches.seedream }

  if (resolution === '1K' || resolution === '2K') {
    geminiCfg.imageSize = resolution
    grokCfg.resolution = resolution.toLowerCase() as '1k' | '2k'
    seedreamCfg.resolution = resolution.toLowerCase() as '1k' | '1.5k' | '2k'
  } else if (resolution === '1.5K') {
    seedreamCfg.resolution = '1.5k'
  }

  const endpointMode =
    provider === 'gpt'
      ? gptCfg.endpointMode
      : provider === 'gemini'
        ? geminiCfg.endpointMode
        : provider === 'grok'
          ? grokCfg.endpointMode
          : provider === 'muse'
            ? museCfg.endpointMode
            : seedreamCfg.endpointMode

  const usesMultipart =
    (provider === 'gpt' && gptCfg.endpointMode === 'images_edits') ||
    (provider === 'gemini' && geminiCfg.endpointMode === 'openai_edits') ||
    (provider === 'grok' && grokCfg.endpointMode === 'openai_edits') ||
    (provider === 'muse' && museCfg.endpointMode === 'openai_edits') ||
    (provider === 'seedream' && seedreamCfg.endpointMode === 'openai_edits')

  const forceBytes =
    (provider === 'gemini' && (geminiCfg.endpointMode === 'native' || geminiCfg.endpointMode === 'openai_edits')) ||
    (provider === 'gpt' && gptCfg.endpointMode === 'images_edits') ||
    (provider === 'grok' && grokCfg.endpointMode === 'openai_edits') ||
    (provider === 'muse' && museCfg.endpointMode === 'openai_edits') ||
    (provider === 'seedream' && seedreamCfg.endpointMode === 'openai_edits')

  const resolveRefValue = async (
    src: ResolvedSource
  ): Promise<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }> => {
    if (!forceBytes && imagePassMode === 'url') {
      if (src.kind === 'https') return { source: src, ref: src.url }
      if (src.kind === 'gallery' && canPassPublicUrls) {
        return { source: src, ref: `${requestOrigin.replace(/\/+$/, '')}/${src.path}` }
      }
    }
    const loaded = await loadImageAsset(src, env)
    return { source: src, ref: loaded.dataUrl, loaded }
  }

  const preflightStartedAt = Date.now()
  let resolvedAll: Array<{ source: ResolvedSource; ref: string; loaded?: LoadedImage }>
  try {
    await traceContext?.onStage?.('resolving_refs', '正在准备参考素材…')
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
        ...(channel.supplierKeyId ? { supplierKeyId: channel.supplierKeyId } : {}),
        ...(channel.supplierKeyLabel ? { supplierKeyLabel: channel.supplierKeyLabel } : {}),
        ...(channel.supplierKeyHint ? { supplierKeyHint: channel.supplierKeyHint } : {}),
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

  const trackedFetch = async (spec: TrackedFetchSpec): Promise<{ res: Response; json: any }> => {
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
          finishedAt: null,
          durationMs: null,
          channelId: channel.channelId,
          channelName: channel.channelName,
          supplierId: channel.supplierId,
          supplierName: channel.supplierName,
          ...(channel.supplierKeyId ? { supplierKeyId: channel.supplierKeyId } : {}),
          ...(channel.supplierKeyLabel ? { supplierKeyLabel: channel.supplierKeyLabel } : {}),
          ...(channel.supplierKeyHint ? { supplierKeyHint: channel.supplierKeyHint } : {}),
          provider,
          model: spec.modelOverride || model,
          endpointMode,
          request: {
            method: 'POST',
            url: sanitizeUrlForAudit(spec.url),
            authSummary: describeAuthHeaders(spec.headers, spec.url),
            params: sanitizeValueForAudit(spec.auditParams) as Record<string, unknown>,
          },
          response: null,
          outcome: 'in_progress',
          error: null,
          retryable: null,
          safetyBlocked: null,
        }
      : null
    attemptState.current = attempt
    if (attempt) {
      traceContext?.onAttempt(attempt)
    }

    try {
      await traceContext?.onStage?.('generating', '正在绘制中…')
      const result = await fetchUpstream(
        spec.url,
        {
          method: 'POST',
          headers: spec.headers,
          body: spec.body,
        },
        env,
        spec.timeoutMs ?? 60_000,
        spec.parseSse ? { parseSse: true } : undefined
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
  let waveSpeedOutputRef: string | null = null

  // ===========================================================================
  // 0. WaveSpeed API v3 统一异步 / 同步通道（适配 GPT / Grok / Gemini 任一槽位）
  // ===========================================================================
  if (endpointMode === 'wavespeed') {
    const wsResult = await runWaveSpeedGeneration({
      env,
      provider,
      baseUrl,
      apiKey,
      rawModel: model,
      prompt,
      aspectRatio,
      resolution,
      resolvedAll,
      geminiCfg,
      grokCfg,
      seedreamCfg,
      wsOpts: rawParams as WaveSpeedChannelOptions,
      trackedFetch,
      attemptState,
      emitPendingFailure,
      onStage: traceContext?.onStage,
    })
    res = wsResult.res
    json = wsResult.json
    waveSpeedOutputRef = wsResult.outputRef
  }

  // ===========================================================================
  // 0b. Dreamina 浏览器桥异步通道（独立于 Muse，支持任一槽位，可与 WaveSpeed 混配）
  // ===========================================================================
  else if (endpointMode === 'dreamina') {
    const dreaminaRatio =
      aspectRatio === 'auto'
        ? null
        : provider === 'seedream' && seedreamCfg.aspectRatio && seedreamCfg.aspectRatio !== 'auto'
          ? seedreamCfg.aspectRatio
          : aspectRatio
    const dreaminaResolution =
      resolution || (provider === 'seedream' ? seedreamCfg.resolution : undefined)
    const dreaminaResult = await runDreaminaGeneration({
      env,
      provider,
      baseUrl,
      apiKey,
      rawModel: model,
      prompt,
      aspectRatio: dreaminaRatio,
      resolution: dreaminaResolution,
      resolvedAll,
      dreaminaOpts: rawParams as DreaminaChannelOptions,
      trackedFetch,
      attemptState,
      emitPendingFailure,
      onStage: traceContext?.onStage,
    })
    res = dreaminaResult.res
    json = dreaminaResult.json
    waveSpeedOutputRef = dreaminaResult.outputRef
  }

  // ===========================================================================
  // 1. OpenAI GPT Image（含 OpenAI Codex OAuth Responses SSE）
  // ===========================================================================
  else if (provider === 'gpt') {
    const gptTimeoutMs = 90_000
    const isCodexOAuth =
      channel.supplierAuthMode === 'oauth_openai_codex' ||
      /chatgpt\.com\/backend-api\/codex/i.test(baseUrl)
    const v1 = normalizeV1Base(baseUrl)
    const gptPrompt = replaceImageTagsWithOneBased(prompt)
    // OpenAI GPT-Image-2 / 2.5 / 2.6 / chatgpt-image-latest 默认高保真，禁止传 input_fidelity
    const supportsInputFidelity = /^gpt-image-1(?:\.5|-mini)?(?:$|[-_])/i.test(model)
    const supportsComplexity = /^gpt-image-2\.6/i.test(model)

    if (isCodexOAuth) {
      const codexUrl = buildCodexResponsesUrl(baseUrl)
      const codexHeaders = buildCodexRequestHeaders(apiKey, channel.oauthAccountId, {
        contentType: 'application/json',
      })
      const inputContent = [
        ...resolvedAll.map((item) => ({ type: 'input_image', image_url: item.ref })),
        { type: 'input_text', text: gptPrompt },
      ]
      const toolCfg: Record<string, unknown> = { type: 'image_generation' }
      if (gptCfg.size !== 'auto') toolCfg.size = gptCfg.size
      if (gptCfg.quality !== 'auto') toolCfg.quality = gptCfg.quality
      if (gptCfg.background !== 'auto') toolCfg.background = gptCfg.background
      if (resolvedAll.length > 0 && supportsInputFidelity && gptCfg.inputFidelity) {
        toolCfg.input_fidelity = gptCfg.inputFidelity
      }
      if (gptCfg.outputFormat) toolCfg.output_format = gptCfg.outputFormat

      const buildCodexPayload = (minimalTool = false) => ({
        model,
        instructions:
          'You are an expert AI image generation assistant. Follow the user prompt and visual references accurately and invoke the image_generation tool to produce the requested image.',
        input: [{ role: 'user', content: inputContent }],
        tools: [minimalTool ? { type: 'image_generation' } : toolCfg],
        store: false,
        stream: true,
      })

      const firstPayload = buildCodexPayload(false)
      ;({ res, json } = await trackedFetch({
        url: codexUrl,
        headers: codexHeaders,
        body: JSON.stringify(firstPayload),
        auditParams: firstPayload,
        timeoutMs: gptTimeoutMs,
        parseSse: true,
      }))

      if (res.status === 400 && Object.keys(toolCfg).length > 1) {
        const firstErr = summarizeUpstreamError(json, res.status)
        if (!isSafetyOrPolicyError(firstErr)) {
          emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
          const fallbackPayload = buildCodexPayload(true)
          ;({ res, json } = await trackedFetch({
            url: codexUrl,
            headers: codexHeaders,
            body: JSON.stringify(fallbackPayload),
            auditParams: fallbackPayload,
            timeoutMs: gptTimeoutMs,
            parseSse: true,
            triggerOverride: {
              triggerType: 'compat_downgrade',
              triggerReason: 'Codex Responses 返回 HTTP 400，精简 image_generation 工具参数后降级重试',
              previousError: firstErr,
            },
          }))
        }
      }
    } else if ((gptCfg.endpointMode === 'images_edits_json' || gptCfg.endpointMode === 'images_edits') && resolvedAll.length === 0) {
      const payload: Record<string, unknown> = { model, prompt: gptPrompt }
      if (gptCfg.size !== 'auto') payload.size = gptCfg.size
      if (gptCfg.quality !== 'auto') payload.quality = gptCfg.quality
      if (supportsComplexity && gptCfg.complexity && gptCfg.complexity !== 'auto') {
        payload.complexity = gptCfg.complexity
      }
      if (gptCfg.background !== 'auto') payload.background = gptCfg.background
      if (gptCfg.outputFormat) payload.output_format = gptCfg.outputFormat
      if (gptCfg.moderation !== 'auto') payload.moderation = gptCfg.moderation
      const genHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/generations`,
        headers: genHeaders,
        body: JSON.stringify(payload),
        auditParams: { ...payload },
        timeoutMs: gptTimeoutMs,
      }))
      if (res.status === 400) {
        const firstErr = summarizeUpstreamError(json, res.status)
        const rawJsonStr = JSON.stringify(json)
        if (!isSafetyOrPolicyError(firstErr) && !isSafetyOrPolicyError(rawJsonStr)) {
          const removed: string[] = []
          if (payload.complexity !== undefined && /complexity/i.test(rawJsonStr)) {
            delete payload.complexity
            removed.push('complexity')
          }
          if (payload.moderation !== undefined && /moderation/i.test(rawJsonStr)) {
            delete payload.moderation
            removed.push('moderation')
          }
          if (payload.output_format !== undefined && /output_format/i.test(rawJsonStr)) {
            delete payload.output_format
            removed.push('output_format')
          }
          if (removed.length > 0) {
            emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
            ;({ res, json } = await trackedFetch({
              url: `${v1}/images/generations`,
              headers: genHeaders,
              body: JSON.stringify(payload),
              auditParams: { ...payload },
              timeoutMs: gptTimeoutMs,
              triggerOverride: {
                triggerType: 'compat_downgrade',
                triggerReason: `文生图上游返回 HTTP 400 参数不兼容，自动剔除 [${removed.join(', ')}] 后同渠道降级重试`,
                previousError: firstErr,
              },
            }))
          }
        }
      }
    } else if (gptCfg.endpointMode === 'images_edits_json') {
      const payload: Record<string, unknown> = {
        model,
        prompt: gptPrompt,
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
        timeoutMs: gptTimeoutMs,
      }))
      if (res.status === 400) {
        const firstErr = summarizeUpstreamError(json, res.status)
        const rawJsonStr = JSON.stringify(json)
        if (!isSafetyOrPolicyError(firstErr) && !isSafetyOrPolicyError(rawJsonStr)) {
          const removed: string[] = []
          if (payload.input_fidelity !== undefined && /input_fidelity/i.test(rawJsonStr)) {
            delete payload.input_fidelity
            removed.push('input_fidelity')
          }
          if (payload.complexity !== undefined && /complexity/i.test(rawJsonStr)) {
            delete payload.complexity
            removed.push('complexity')
          }
          if (payload.moderation !== undefined && /moderation/i.test(rawJsonStr)) {
            delete payload.moderation
            removed.push('moderation')
          }
          if (removed.length > 0) {
            emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
            ;({ res, json } = await trackedFetch({
              url: `${v1}/images/edits`,
              headers,
              body: JSON.stringify(payload),
              auditParams: { ...payload },
              timeoutMs: gptTimeoutMs,
              triggerOverride: {
                triggerType: 'compat_downgrade',
                triggerReason: `上游返回 HTTP 400 参数不兼容，自动剔除 [${removed.join(', ')}] 后同渠道降级重试`,
                previousError: firstErr,
              },
            }))
          }
        }
      }
    } else if (gptCfg.endpointMode === 'images_edits') {
      const buildFd = (skipInputFidelity = false) => {
        const fd = new FormData()
        fd.append('model', model)
        fd.append('prompt', gptPrompt)
        const imgSummaries = appendMultipartImages(fd, resolvedAll, 'image[]')
        const summary: Record<string, unknown> = {
          model,
          prompt: gptPrompt,
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
        timeoutMs: gptTimeoutMs,
      }))
      if (
        res.status === 400 &&
        supportsInputFidelity &&
        gptCfg.inputFidelity &&
        /input_fidelity/i.test(JSON.stringify(json)) &&
        !isSafetyOrPolicyError(summarizeUpstreamError(json, res.status))
      ) {
        const firstErr = summarizeUpstreamError(json, res.status)
        emitPendingFailure(`[HTTP 400 参数兼容] ${firstErr}`, true, false)
        const second = buildFd(true)
        ;({ res, json } = await trackedFetch({
          url: `${v1}/images/edits`,
          headers: { Authorization: `Bearer ${apiKey}` },
          body: second.fd,
          auditParams: second.summary,
          timeoutMs: gptTimeoutMs,
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
        { type: 'input_text', text: gptPrompt },
      ]
      const toolCfg: Record<string, unknown> = { type: 'image_generation' }
      if (gptCfg.size !== 'auto') toolCfg.size = gptCfg.size
      if (gptCfg.quality !== 'auto') toolCfg.quality = gptCfg.quality
      if (gptCfg.background !== 'auto') toolCfg.background = gptCfg.background
      if (resolvedAll.length > 0 && supportsInputFidelity && gptCfg.inputFidelity) {
        toolCfg.input_fidelity = gptCfg.inputFidelity
      }
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
        timeoutMs: gptTimeoutMs,
      }))
    } else {
      const content = [
        { type: 'text', text: gptPrompt },
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
        timeoutMs: gptTimeoutMs,
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
          timeoutMs: gptTimeoutMs,
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
    const geminiTimeoutMs = 90_000
    const { leadInstruction, geminiPrompt } = prepareGeminiInputs(
      prompt,
      resolvedAll,
      geminiCfg.aspectRatio,
    )
    if (geminiCfg.endpointMode === 'native') {
      const authMode = geminiCfg.authMode || 'auto'
      const { url, headers } = buildGeminiNativeAuthRequest(baseUrl, model, apiKey, authMode)

      const parts = [
        ...(resolvedAll.length > 0 && leadInstruction ? [{ text: leadInstruction }] : []),
        ...resolvedAll.flatMap((item, idx) => [
          { text: buildGeminiRefPartLabel(item.source, idx + 1) },
          {
            inlineData: {
              mimeType: item.loaded?.mime || 'image/png',
              data: item.loaded?.base64 || item.ref.split(',')[1],
            },
          },
        ]),
        { text: geminiPrompt },
      ]
      const supportsImageSize = /gemini-3|nano-banana|banana/i.test(model) && !/^gemini-2\./i.test(model)
      const imageConfig: Record<string, string> = {}
      if (geminiCfg.aspectRatio && geminiCfg.aspectRatio !== 'auto') {
        imageConfig.aspectRatio = geminiCfg.aspectRatio
      }
      if (supportsImageSize && geminiCfg.imageSize) {
        imageConfig.imageSize = geminiCfg.imageSize
      }

      const payload = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
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
        timeoutMs: geminiTimeoutMs,
      }))
    } else if (geminiCfg.endpointMode === 'openai_chat') {
      const v1 = normalizeV1Base(baseUrl)
      const outputHints = [
        ...(geminiCfg.aspectRatio && geminiCfg.aspectRatio !== 'auto'
          ? [`aspect ratio: ${geminiCfg.aspectRatio}`]
          : []),
        ...(geminiCfg.imageSize ? [`resolution: ${geminiCfg.imageSize}`] : []),
      ]
      const content = [
        {
          type: 'text',
          text: outputHints.length > 0 ? `${geminiPrompt}\n(Output ${outputHints.join(', ')})` : geminiPrompt,
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
        timeoutMs: geminiTimeoutMs,
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
          timeoutMs: geminiTimeoutMs,
          triggerOverride: {
            triggerType: 'compat_downgrade',
            triggerReason: '上游返回 HTTP 400 不支持 modalities 字段，自动移除 [modalities] 后降级重试',
            previousError: firstErr,
          },
        }))
      }
    } else if (geminiCfg.endpointMode === 'openai_edits_json') {
      const v1 = normalizeV1Base(baseUrl)
      const payload: Record<string, unknown> = {
        model,
        prompt: geminiPrompt,
        ...(geminiCfg.aspectRatio && geminiCfg.aspectRatio !== 'auto'
          ? { aspect_ratio: geminiCfg.aspectRatio }
          : {}),
      }
      if (resolvedAll.length > 0) {
        payload.images = resolvedAll.map((item) => ({ image_url: item.ref }))
      }
      ;({ res, json } = await trackedFetch({
        url: resolvedAll.length === 0 ? `${v1}/images/generations` : `${v1}/images/edits`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
        timeoutMs: geminiTimeoutMs,
      }))
    } else if (resolvedAll.length === 0) {
      const v1 = normalizeV1Base(baseUrl)
      const payload: Record<string, unknown> = {
        model,
        prompt: geminiPrompt,
        ...(geminiCfg.aspectRatio && geminiCfg.aspectRatio !== 'auto'
          ? { aspect_ratio: geminiCfg.aspectRatio }
          : {}),
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/generations`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
        timeoutMs: geminiTimeoutMs,
      }))
    } else {
      const v1 = normalizeV1Base(baseUrl)
      const fd = new FormData()
      fd.append('model', model)
      fd.append('prompt', geminiPrompt)
      const imgSummaries = appendMultipartImages(fd, resolvedAll, 'image[]')
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        auditParams: {
          model,
          prompt: geminiPrompt,
          'image[]': imgSummaries,
        },
        timeoutMs: geminiTimeoutMs,
      }))
    }
  }

  // ===========================================================================
  // 3. xAI Grok Imagine (grok-imagine-image-2.0 · 兼容 xAI Grok OAuth)
  // ===========================================================================
  else if (provider === 'grok') {
    const v1 = normalizeV1Base(baseUrl)
    const isXaiOAuth =
      channel.supplierAuthMode === 'oauth_xai' || /cli-chat-proxy\.grok\.com/i.test(baseUrl)
    const grokHeaders = (contentType?: string): Record<string, string> =>
      isXaiOAuth
        ? buildXaiOAuthRequestHeaders(apiKey, contentType ? { contentType } : undefined)
        : {
            ...(contentType ? { 'Content-Type': contentType } : {}),
            Authorization: `Bearer ${apiKey}`,
          }
    const { refsLimited, grokPrompt } = prepareGrokInputs(prompt, resolvedAll)
    const effectiveGrokRatio =
      aspectRatio === 'auto'
        ? null
        : !grokCfg.aspectRatio || grokCfg.aspectRatio === 'auto'
          ? aspectRatio
          : grokCfg.aspectRatio

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
      if (effectiveGrokRatio) {
        payload.aspect_ratio = effectiveGrokRatio
      }
      payload.resolution = grokCfg.resolution || '2k'
      // 仅 grok-imagine-image-2.0 支持 quality 参数
      if (model.includes('2.0') && grokCfg.quality && grokCfg.quality !== 'auto') {
        payload.quality = grokCfg.quality
      }
      payload.response_format = grokCfg.responseFormat || 'b64_json'

      ;({ res, json } = await trackedFetch({
        url: refsLimited.length === 0 ? `${v1}/images/generations` : `${v1}/images/edits`,
        headers: grokHeaders('application/json'),
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    } else if (grokCfg.endpointMode === 'openai_edits_json') {
      const payload: Record<string, unknown> = {
        model,
        prompt: grokPrompt,
        ...(effectiveGrokRatio ? { aspect_ratio: effectiveGrokRatio } : {}),
        resolution: grokCfg.resolution || '2k',
        response_format: grokCfg.responseFormat || 'b64_json',
      }
      if (refsLimited.length > 0) {
        payload.images = refsLimited.map((item) => ({ image_url: item.ref }))
      }
      ;({ res, json } = await trackedFetch({
        url: refsLimited.length === 0 ? `${v1}/images/generations` : `${v1}/images/edits`,
        headers: grokHeaders('application/json'),
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    } else if (grokCfg.endpointMode === 'openai_edits' && refsLimited.length === 0) {
      const payload: Record<string, unknown> = {
        model,
        prompt: grokPrompt,
        ...(effectiveGrokRatio ? { aspect_ratio: effectiveGrokRatio } : {}),
        resolution: grokCfg.resolution || '2k',
        response_format: grokCfg.responseFormat || 'b64_json',
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/generations`,
        headers: grokHeaders('application/json'),
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
        headers: grokHeaders(),
        body: fd,
        auditParams: summary,
      }))
    } else {
      const grokOutputHints = [
        ...(effectiveGrokRatio ? [`aspect ratio: ${effectiveGrokRatio}`] : []),
        `resolution: ${grokCfg.resolution || '2k'}`,
      ]
      const content = [
        {
          type: 'text',
          text: `${grokPrompt}\n(Output ${grokOutputHints.join(', ')})`,
        },
        ...refsLimited.map((item) => ({ type: 'image_url', image_url: { url: item.ref } })),
      ]
      const payload = {
        model,
        messages: [{ role: 'user', content }],
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/chat/completions`,
        headers: grokHeaders('application/json'),
        body: JSON.stringify(payload),
        auditParams: payload,
      }))
    }
  }

  // ===========================================================================
  // 4. Muse Image (muse2api /v1/images/tasks & OpenAI 兼容端点)
  // ===========================================================================
  else if (provider === 'muse') {
    const v1 = normalizeV1Base(baseUrl)
    const { refsLimited, musePrompt } = prepareMuseInputs(prompt, resolvedAll)
    const ratio =
      aspectRatio === 'auto'
        ? null
        : !museCfg.aspectRatio || museCfg.aspectRatio === 'auto'
          ? aspectRatio
          : museCfg.aspectRatio
    const responseFormat = museCfg.responseFormat || 'b64_json'

    if (museCfg.endpointMode === 'muse_tasks') {
      const museRes = await runMuseTaskGeneration({
        env,
        v1BaseUrl: v1,
        apiKey,
        model,
        prompt: musePrompt,
        aspectRatio,
        museCfg,
        refsLimited,
        trackedFetch,
        attemptState,
        emitPendingFailure,
        onStage: traceContext?.onStage,
      })
      res = museRes.res
      json = museRes.json
      waveSpeedOutputRef = museRes.outputRef
    } else if (museCfg.endpointMode === 'openai_edits' && refsLimited.length > 0) {
      const fd = new FormData()
      fd.append('model', model)
      fd.append('prompt', musePrompt)
      if (ratio) fd.append('aspect_ratio', ratio)
      fd.append('response_format', responseFormat)
      const imgSummaries = appendMultipartImages(fd, refsLimited, 'image[]')
      const summary: Record<string, unknown> = {
        model,
        prompt: musePrompt,
        ...(ratio ? { aspect_ratio: ratio } : {}),
        response_format: responseFormat,
        'image[]': imgSummaries,
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        auditParams: summary,
        timeoutMs: 90_000,
      }))
    } else {
      const payload: Record<string, unknown> = {
        model,
        prompt: musePrompt,
        ...(ratio ? { aspect_ratio: ratio } : {}),
        response_format: responseFormat,
      }
      if (refsLimited.length > 0) {
        payload.images = refsLimited.map((item) => item.ref)
      }
      const targetUrl =
        museCfg.endpointMode === 'openai_edits_json' && refsLimited.length > 0
          ? `${v1}/images/edits`
          : `${v1}/images/generations`
      ;({ res, json } = await trackedFetch({
        url: targetUrl,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
        timeoutMs: 90_000,
      }))
    }
  }

  // ===========================================================================
  // 5. ByteDance Seedream (OpenAI 兼容中转兜底；主力走 0a WaveSpeed / 0b Dreamina)
  // ===========================================================================
  else {
    const v1 = normalizeV1Base(baseUrl)
    const seedreamPrompt = replaceImageTagsWithOneBased(prompt)
    const ratio =
      aspectRatio === 'auto'
        ? null
        : !seedreamCfg.aspectRatio || seedreamCfg.aspectRatio === 'auto'
          ? aspectRatio
          : seedreamCfg.aspectRatio
    const responseFormat = seedreamCfg.responseFormat || 'b64_json'

    if (seedreamCfg.endpointMode === 'openai_edits' && resolvedAll.length > 0) {
      const fd = new FormData()
      fd.append('model', model)
      fd.append('prompt', seedreamPrompt)
      if (ratio) fd.append('aspect_ratio', ratio)
      fd.append('response_format', responseFormat)
      const imgSummaries = appendMultipartImages(fd, resolvedAll, 'image[]')
      const summary: Record<string, unknown> = {
        model,
        prompt: seedreamPrompt,
        ...(ratio ? { aspect_ratio: ratio } : {}),
        response_format: responseFormat,
        'image[]': imgSummaries,
      }
      ;({ res, json } = await trackedFetch({
        url: `${v1}/images/edits`,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
        auditParams: summary,
        timeoutMs: 90_000,
      }))
    } else {
      const payload: Record<string, unknown> = {
        model,
        prompt: seedreamPrompt,
        ...(ratio ? { aspect_ratio: ratio } : {}),
        response_format: responseFormat,
      }
      if (resolvedAll.length > 0) {
        payload.images = resolvedAll.map((item) => item.ref)
      }
      const targetUrl =
        seedreamCfg.endpointMode === 'openai_edits_json' && resolvedAll.length > 0
          ? `${v1}/images/edits`
          : `${v1}/images/generations`
      ;({ res, json } = await trackedFetch({
        url: targetUrl,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        auditParams: payload,
        timeoutMs: 90_000,
      }))
    }
  }

  if (!res.ok) {
    const errMsg = summarizeUpstreamError(json, res.status)
    const errCode = String(json?.error?.code || json?.code || '')
    const fullMsg = `[${PROVIDER_META[provider].shortName}] ${errMsg}`
    const safety = errCode === '1200' || isSafetyOrPolicyError(errMsg) || isSafetyOrPolicyError(errCode)
    const retryable = isRetryableStatus(res.status) && !safety
    emitPendingFailure(fullMsg, retryable, safety)
    throw new UpstreamError(fullMsg, retryable, res.status, safety)
  }

  let outputRef = waveSpeedOutputRef || extractUniversalImage(json)
  if (outputRef && outputRef.startsWith('/')) {
    try {
      outputRef = new URL(outputRef, baseUrl).toString()
    } catch {
      // keep raw value for validation below
    }
  }
  if (!outputRef) {
    const geminiBlockReason = json?.promptFeedback?.blockReason
    const geminiFinishReason = json?.candidates?.[0]?.finishReason
    const openaiFinishReason = json?.choices?.[0]?.finish_reason
    const geminiParts: any[] = Array.isArray(json?.candidates?.[0]?.content?.parts)
      ? json.candidates[0].content.parts
      : []
    const geminiReplyText =
      geminiParts.find((p) => !p?.thought && typeof p?.text === 'string' && p.text.trim())?.text ||
      geminiParts.find((p) => typeof p?.text === 'string' && p.text.trim())?.text
    const fallbackText =
      (geminiBlockReason ? String(geminiBlockReason) : undefined) ||
      (openaiFinishReason === 'content_filter' ? String(openaiFinishReason) : undefined) ||
      json?.choices?.[0]?.message?.content ||
      (geminiFinishReason && geminiFinishReason !== 'STOP' ? geminiFinishReason : geminiReplyText) ||
      geminiFinishReason ||
      JSON.stringify(json).slice(0, 260)
    const safety =
      isSafetyOrPolicyError(String(fallbackText)) ||
      Boolean(geminiBlockReason && isSafetyOrPolicyError(String(geminiBlockReason))) ||
      Boolean(openaiFinishReason && isSafetyOrPolicyError(String(openaiFinishReason)))
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
    await traceContext?.onStage?.('downloading_output', '正在保存成图…')
    const outRes = await safeExternalFetch(
      outUrl.toString(),
      { method: 'GET', signal: AbortSignal.timeout(45_000) },
      env,
      45_000
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

// ===========================================================================
// 姿势图 / 服装图单次即时视觉转译与入库缓存辅助
// ===========================================================================

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const REFERENCE_DEFAULT_LABELS: Record<ReferenceDescriptionKind, string> = {
  pose: '姿势参考',
  costume: '服装参考',
  portrait: '人像参考',
  extra: '附加参考',
}

function getDescribePromptForKind(
  visionConfig: VisionFallbackConfig,
  kind: ReferenceDescriptionKind
): string {
  if (kind === 'pose') return visionConfig.poseDescribePrompt
  if (kind === 'costume') return visionConfig.costumeDescribePrompt
  if (kind === 'portrait') return visionConfig.portraitDescribePrompt
  return visionConfig.extraDescribePrompt
}

/** 按预览路径反解出可供 loadImageAsset 读取的 ResolvedSource（供后台“重新识图生成”使用） */
export function buildSourceFromPreviewPath(
  kind: ReferenceDescriptionKind,
  previewPath: string,
  label = ''
): ResolvedSource | null {
  const trimmed = previewPath.trim()
  if (!trimmed) return null
  const defaultLabel = REFERENCE_DEFAULT_LABELS[kind]
  if (/^https?:\/\//i.test(trimmed)) {
    const safe = validateExternalImageUrl(trimmed)
    if (!safe) return null
    return {
      kind: 'https',
      url: safe.toString(),
      slot: kind,
      label: label || defaultLabel,
      rawPath: trimmed,
    }
  }
  if (trimmed.startsWith('uploads/') || trimmed.startsWith('generations/')) {
    return {
      kind: 'r2',
      r2Key: trimmed,
      slot: kind,
      label: label || defaultLabel,
      rawPath: trimmed,
    }
  }
  const galleryPath = sanitizeGalleryAssetPath(trimmed)
  if (!galleryPath) return null
  return {
    kind: 'gallery',
    path: galleryPath,
    slot: kind,
    label: label || defaultLabel,
    rawPath: trimmed,
  }
}

/** 从 Gemini / OpenAI 对话接口返回体中提取纯文本描述（跳过思考片段） */
function extractVisionTextFromResponse(
  json: any,
  endpointMode: 'gemini_native' | 'openai_chat'
): string | null {
  if (endpointMode === 'gemini_native') {
    const parts = Array.isArray(json?.candidates?.[0]?.content?.parts)
      ? json.candidates[0].content.parts
      : []
    const texts: string[] = []
    for (const p of parts) {
      if (p && p.thought !== true && typeof p.text === 'string' && p.text.trim()) {
        texts.push(p.text.trim())
      }
    }
    const merged = texts.join('\n').trim()
    return merged || null
  }

  const content = json?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }
  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const part of content) {
      if (
        part &&
        part.thought !== true &&
        part.type !== 'thinking' &&
        part.type !== 'reasoning' &&
        typeof part.text === 'string' &&
        part.text.trim()
      ) {
        texts.push(part.text.trim())
      }
    }
    const merged = texts.join('\n').trim()
    return merged || null
  }
  return null
}

/**
 * 调用配置好的视觉识别模型（默认 gemini-4-hydrogen 复用现有供应商凭证）将参考图转为描述文本；
 * 支持多候选供应商顺序故障转移。
 */
export async function describeLoadedImageViaVision(args: {
  env: Env
  targets: VisionFallbackTarget[]
  loaded: LoadedImage
  describePrompt: string
}): Promise<{
  description: string
  visionModel: string
  visionSupplierId: string
  visionSupplierName: string
}> {
  const { env, targets, loaded, describePrompt } = args
  if (targets.length === 0) {
    throw new Error('未找到可用的视觉转译供应商（请先启用 Gemini 或配置“图转文视觉模型”）')
  }

  let lastErr: unknown = null
  for (const target of targets) {
    try {
      // 不显式传递 temperature，兼容仅支持默认温度的 GPT/推理模型与 Gemini 思考模型
      if (target.endpointMode === 'gemini_native') {
        const { url, headers } = buildGeminiNativeAuthRequest(
          target.baseUrl,
          target.model,
          target.apiKey,
          target.authMode
        )
        const parts = [
          {
            inlineData: {
              mimeType: loaded.mime || 'image/png',
              data: loaded.base64,
            },
          },
          { text: describePrompt },
        ]
        const { res, json } = await fetchUpstream(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
            }),
          },
          env,
          45_000
        )

        if (!res.ok) {
          throw new Error(summarizeUpstreamError(json, res.status))
        }
        const text = extractVisionTextFromResponse(json, 'gemini_native')
        if (!text) {
          throw new Error('视觉模型未返回有效的文字描述内容')
        }
        return {
          description: text.slice(0, 1200),
          visionModel: target.model,
          visionSupplierId: target.supplierId,
          visionSupplierName: target.supplierName,
        }
      }

      const isCodexOAuth =
        target.supplierAuthMode === 'oauth_openai_codex' ||
        /chatgpt\.com\/backend-api\/codex/i.test(target.baseUrl)
      if (isCodexOAuth) {
        const codexUrl = buildCodexResponsesUrl(target.baseUrl)
        const codexHeaders = buildCodexRequestHeaders(target.apiKey, target.oauthAccountId, {
          contentType: 'application/json',
        })
        const { res, json } = await fetchUpstream(
          codexUrl,
          {
            method: 'POST',
            headers: codexHeaders,
            body: JSON.stringify({
              model: target.model,
              instructions:
                'You are a visual reference analyst. Describe the provided image accurately and concisely.',
              input: [
                {
                  role: 'user',
                  content: [
                    { type: 'input_text', text: describePrompt },
                    { type: 'input_image', image_url: loaded.dataUrl },
                  ],
                },
              ],
              store: false,
              stream: true,
            }),
          },
          env,
          45_000,
          { parseSse: true }
        )
        if (!res.ok) {
          throw new Error(summarizeUpstreamError(json, res.status))
        }
        const text = extractTextFromResponsesOutput(json)
        if (!text) {
          throw new Error('Codex 视觉模型未返回有效的文字描述内容')
        }
        return {
          description: text.slice(0, 1200),
          visionModel: target.model,
          visionSupplierId: target.supplierId,
          visionSupplierName: target.supplierName,
        }
      }

      const isXaiOAuth =
        target.supplierAuthMode === 'oauth_xai' ||
        /cli-chat-proxy\.grok\.com/i.test(target.baseUrl)
      const v1 = normalizeV1Base(target.baseUrl)
      const chatHeaders = isXaiOAuth
        ? buildXaiOAuthRequestHeaders(target.apiKey, { contentType: 'application/json' })
        : {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${target.apiKey}`,
          }
      const { res, json } = await fetchUpstream(
        `${v1}/chat/completions`,
        {
          method: 'POST',
          headers: chatHeaders,
          body: JSON.stringify({
            model: target.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: describePrompt },
                  { type: 'image_url', image_url: { url: loaded.dataUrl } },
                ],
              },
            ],
          }),
        },
        env,
        45_000
      )
      if (!res.ok) {
        throw new Error(summarizeUpstreamError(json, res.status))
      }
      const text = extractVisionTextFromResponse(json, 'openai_chat')
      if (!text) {
        throw new Error('视觉模型未返回有效的文字描述内容')
      }
      return {
        description: text.slice(0, 1200),
        visionModel: target.model,
        visionSupplierId: target.supplierId,
        visionSupplierName: target.supplierName,
      }
    } catch (err) {
      lastErr = err
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('图转文视觉转译失败')
}

async function resolveSourceRefKeyAndPreview(
  env: Env,
  source: ResolvedSource
): Promise<{
  refKey: string
  previewPath: string
  preloaded: LoadedImage | null
}> {
  if (source.kind === 'gallery') {
    return {
      refKey: `gallery:${source.path}`,
      previewPath: source.path,
      preloaded: null,
    }
  }
  if (source.kind === 'https') {
    return {
      refKey: `https:${source.url}`,
      previewPath: source.url,
      preloaded: null,
    }
  }
  const preloaded = await loadImageAsset(source, env)
  const hex = await computeSha256Hex(preloaded.bytes)
  return {
    refKey: `sha256:${hex}`,
    previewPath: source.r2Key,
    preloaded,
  }
}

/**
 * 供后台手动预录入或覆盖一条参考图描述：统一按 gallery / https / sha256 计算去重键。
 */
export async function saveManualReferenceDescriptionFromSource(args: {
  env: Env
  kind: ReferenceDescriptionKind
  source: ResolvedSource
  description: string
}): Promise<ReferenceDescriptionDTO> {
  const { refKey, previewPath } = await resolveSourceRefKeyAndPreview(args.env, args.source)
  const cleanDescription = args.description.trim().slice(0, 2000)
  const existing = await upsertAutoReferenceDescription(args.env.DB, {
    kind: args.kind,
    refKey,
    sourceLabel: args.source.label,
    previewPath,
    description: cleanDescription,
    visionModel: 'manual',
    visionSupplierId: '',
  })
  const updated = await updateReferenceDescriptionManual(args.env.DB, existing.id, {
    description: cleanDescription,
    sourceLabel: args.source.label,
  })
  return updated || existing
}

/**
 * 保证同一张姿势图 / 服装图 / 人像图 / 附加图仅转译一次并入库：
 * 先查 D1 reference_descriptions 缓存，命中直接返回库内文本；未命中再读取图片调用视觉模型转译并幂等落库。
 */
export async function resolveOrTranscribeReferenceDescription(args: {
  env: Env
  kind: ReferenceDescriptionKind
  source: ResolvedSource
  visionConfig: VisionFallbackConfig
  targets: VisionFallbackTarget[]
}): Promise<{
  description: string
  cacheHit: boolean
  visionModel: string
  visionSupplierName?: string
  item: ReferenceDescriptionDTO
}> {
  const { env, kind, source, visionConfig, targets } = args
  const { refKey, previewPath, preloaded } = await resolveSourceRefKeyAndPreview(env, source)

  const existing = await findReferenceDescriptionByKey(env.DB, kind, refKey)
  if (existing && existing.description.trim()) {
    return {
      description: existing.description.trim(),
      cacheHit: true,
      visionModel: existing.visionModel || visionConfig.model,
      item: existing,
    }
  }

  const loaded = preloaded ?? (await loadImageAsset(source, env))
  const describePrompt = getDescribePromptForKind(visionConfig, kind)
  const transcribed = await describeLoadedImageViaVision({
    env,
    targets,
    loaded,
    describePrompt,
  })

  const saved = await upsertAutoReferenceDescription(env.DB, {
    kind,
    refKey,
    sourceLabel: source.label,
    previewPath,
    description: transcribed.description,
    visionModel: transcribed.visionModel,
    visionSupplierId: transcribed.visionSupplierId,
  })

  return {
    description: saved.description,
    cacheHit: false,
    visionModel: saved.visionModel || transcribed.visionModel,
    visionSupplierName: transcribed.visionSupplierName,
    item: saved,
  }
}

/** 供后台管理端对已入库记录重新识别并覆盖描述文本 */
export async function regenerateReferenceDescriptionFromPreview(args: {
  env: Env
  kind: ReferenceDescriptionKind
  previewPath: string
  label: string
  visionConfig: VisionFallbackConfig
  targets: VisionFallbackTarget[]
}): Promise<{
  description: string
  visionModel: string
  visionSupplierId: string
}> {
  const source = buildSourceFromPreviewPath(args.kind, args.previewPath, args.label)
  if (!source) {
    throw new Error('该条目缺少有效图片路径，无法重新识别')
  }
  const loaded = await loadImageAsset(source, args.env)
  const describePrompt = getDescribePromptForKind(args.visionConfig, args.kind)
  const result = await describeLoadedImageViaVision({
    env: args.env,
    targets: args.targets,
    loaded,
    describePrompt,
  })
  return {
    description: result.description,
    visionModel: result.visionModel,
    visionSupplierId: result.visionSupplierId,
  }
}
