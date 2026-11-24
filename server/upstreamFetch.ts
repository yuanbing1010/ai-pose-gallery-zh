import type { Env } from './types'
import { readResponseTextWithLimit, validateExternalImageUrl } from './validation'

const GEO_RESTRICTED_HOSTS = new Set([
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  'api.x.ai',
  'auth.openai.com',
  'chatgpt.com',
  'auth.x.ai',
  'cli-chat-proxy.grok.com',
])

export function shouldRouteViaUsRelay(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    return GEO_RESTRICTED_HOSTS.has(host) || host.endsWith('-aiplatform.googleapis.com')
  } catch {
    return false
  }
}

export function isGeoBlockedMessage(text: string): boolean {
  return /country, region, or territory not supported|unsupported_country_region_territory|user location is not supported/i.test(
    text
  )
}

async function sendViaUsRelay(
  relayNamespace: DurableObjectNamespace,
  targetUrl: string,
  method: string,
  sourceHeaders: Headers,
  body: BodyInit | null | undefined,
  signal?: AbortSignal | null,
  timeoutMs?: number
): Promise<Response> {
  const relayHeaders = new Headers()
  sourceHeaders.forEach((val, key) => {
    const lower = key.toLowerCase()
    if (lower !== 'host' && lower !== 'content-length') {
      relayHeaders.set(key, val)
    }
  })
  relayHeaders.set('x-relay-target-url', targetUrl)
  relayHeaders.set('x-relay-method', method)
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    relayHeaders.set('x-relay-timeout-ms', String(Math.round(timeoutMs)))
  }

  const shard = Math.floor(Math.random() * 8)
  const stub = relayNamespace.jurisdiction('us').getByName(`us-egress-${shard}`)
  return stub.fetch('https://us-relay.internal/proxy', {
    method: 'POST',
    headers: relayHeaders,
    body,
    signal,
  })
}

export async function devProxyAwareFetch(
  url: string,
  init: RequestInit,
  env?: Env,
  timeoutMs?: number
): Promise<Response> {
  const req = new Request(url, init)
  const method = (req.method || 'POST').toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD' && req.body !== null

  // 直走 US_RELAY 且非本地开发代理时直接流式转发 req.body，避免大图片请求体二次 arrayBuffer() 内存放大
  if (!env?.DEV_ASSETS_ORIGIN && env?.US_RELAY && shouldRouteViaUsRelay(url)) {
    return sendViaUsRelay(
      env.US_RELAY,
      url,
      method,
      req.headers,
      hasBody ? req.body : undefined,
      init.signal,
      timeoutMs
    )
  }

  const bodyBuf = hasBody ? await req.arrayBuffer() : undefined

  if (env?.DEV_ASSETS_ORIGIN) {
    const headers = new Headers()
    const directKeys = new Set(['content-type', 'authorization', 'x-goog-api-key'])
    const extraHeaders: Record<string, string> = {}
    req.headers.forEach((val, key) => {
      const lower = key.toLowerCase()
      if (directKeys.has(lower)) {
        headers.set(lower, val)
      } else if (
        !['host', 'connection', 'content-length', 'transfer-encoding'].includes(lower) &&
        !lower.startsWith('x-dev-')
      ) {
        extraHeaders[key] = val
      }
    })
    if (Object.keys(extraHeaders).length > 0) {
      headers.set('x-dev-extra-headers', JSON.stringify(extraHeaders))
    }
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      headers.set('x-dev-timeout-ms', String(Math.round(timeoutMs)))
    }
    headers.set('x-dev-target-url', url)
    headers.set('x-dev-method', method)

    const devOrigins = Array.from(
      new Set([
        env.DEV_ASSETS_ORIGIN.replace(/\/+$/, ''),
        env.DEV_ASSETS_ORIGIN.replace('127.0.0.1', 'localhost').replace(/\/+$/, ''),
        env.DEV_ASSETS_ORIGIN.replace('localhost', '127.0.0.1').replace(/\/+$/, ''),
      ])
    )

    let lastErr: unknown
    for (const origin of devOrigins) {
      if (init.signal?.aborted) break
      try {
        return await fetch(`${origin}/__dev_upstream_fetch`, {
          method: 'POST',
          headers,
          body: bodyBuf,
          signal: init.signal,
        })
      } catch (err) {
        lastErr = err
        if (init.signal?.aborted) break
      }
    }
    throw lastErr ?? new Error('本地开发代理连接失败')
  }

  if (env?.US_RELAY && shouldRouteViaUsRelay(url)) {
    return sendViaUsRelay(env.US_RELAY, url, method, req.headers, bodyBuf, init.signal, timeoutMs)
  }

  const directRes = await fetch(url, {
    method,
    headers: req.headers,
    body: bodyBuf,
    redirect: init.redirect,
    signal: init.signal,
  })

  if (env?.US_RELAY && (directRes.status === 403 || directRes.status === 400)) {
    const errText = await readResponseTextWithLimit(directRes.clone(), 8_192).catch(() => '')
    if (isGeoBlockedMessage(errText)) {
      await directRes.body?.cancel().catch(() => {})
      return sendViaUsRelay(env.US_RELAY, url, method, req.headers, bodyBuf, init.signal, timeoutMs)
    }
  }

  return directRes
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * 防 SSRF 安全外部抓取：校验初始 URL 并在每一跳 3xx 重定向时手动重验 Location 目标地址，
 * 杜绝公网 HTTPS 302 跳转内网/元数据服务的绕过。
 */
export async function safeExternalFetch(
  rawUrl: string,
  init: RequestInit,
  env?: Env,
  timeoutMs?: number,
  maxRedirects = 3
): Promise<Response> {
  let currentUrl = validateExternalImageUrl(rawUrl)
  if (!currentUrl) {
    throw new Error('目标链接无效，仅允许公网 HTTPS 地址')
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await devProxyAwareFetch(
      currentUrl.toString(),
      { ...init, redirect: 'manual' },
      env,
      timeoutMs
    )
    if (!REDIRECT_STATUSES.has(res.status)) {
      return res
    }
    const location = res.headers.get('location')
    await res.body?.cancel().catch(() => {})
    if (!location) {
      return res
    }
    let nextRaw: string
    try {
      nextRaw = new URL(location, currentUrl).toString()
    } catch {
      throw new Error('外部重定向地址格式无效')
    }
    const validatedNext = validateExternalImageUrl(nextRaw)
    if (!validatedNext) {
      throw new Error('外部重定向目标不安全，已拦截')
    }
    currentUrl = validatedNext
  }

  throw new Error('外部链接重定向次数过多')
}
