import { DurableObject } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cleanupExpiredSessionsAndOauth, reapStaleProcessingJobs } from './server/db'
import {
  GenerationJobRunner,
  GenerationQueueCoordinator,
  reconcileQueueViaCoordinator,
} from './server/generationQueue'
import { withSession } from './server/middleware'
import { syncMioArchive, syncOutfitDbArchive } from './server/externalSync'
import { logError } from './server/logger'
import { accountRoutes } from './server/routes/account'
import { adminRoutes } from './server/routes/admin'
import { authRoutes } from './server/routes/auth'
import { canvasRoutes } from './server/routes/canvas'
import { galleryRoutes, promptGalleryRoutes } from './server/routes/gallery'
import { generationRoutes } from './server/routes/generations'
import { uploadRoutes } from './server/routes/uploads'
import type { AppEnv, Env } from './server/types'
import { validateExternalImageUrl } from './server/validation'

const RELAY_ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
const RELAY_SKIP_REQ_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'accept-encoding',
  'x-real-ip',
])
const RELAY_SKIP_RES_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
])

const RELAY_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * 美国管辖区 Durable Object 出站中继：
 * 当边缘节点（如 HKG）直连 OpenAI / Google / xAI 官方接口遭遇地区封锁时，
 * 由此对象在美国境内节点代为发起上游 fetch 请求。
 */
export class UsEgressRelay extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const rawTarget = request.headers.get('x-relay-target-url') || ''
    let currentUrl = validateExternalImageUrl(rawTarget)
    if (!currentUrl) {
      return Response.json({ error: { message: '非法的出站中继目标地址' } }, { status: 400 })
    }

    const method = (request.headers.get('x-relay-method') || 'POST').toUpperCase()
    if (!RELAY_ALLOWED_METHODS.has(method)) {
      return Response.json({ error: { message: '不支持的中继请求方法' } }, { status: 405 })
    }

    const rawTimeoutMs = Number(request.headers.get('x-relay-timeout-ms') || 0)
    const timeoutMs =
      Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0
        ? Math.min(180_000, Math.max(5_000, Math.round(rawTimeoutMs)))
        : 75_000

    const headers = new Headers()
    request.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (
        RELAY_SKIP_REQ_HEADERS.has(lower) ||
        lower.startsWith('cf-') ||
        lower.startsWith('x-forwarded-') ||
        lower.startsWith('x-relay-')
      ) {
        return
      }
      headers.set(key, value)
    })

    const hasBody = method !== 'GET' && method !== 'HEAD'
    // 直接流式转发 request.body，避免在 DO 侧二次 arrayBuffer() 拷贝放大 128MB 内存压力
    let upRes: Response
    try {
      upRes = await fetch(currentUrl.toString(), {
        method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })

      // 仅对 GET/HEAD 手动跟随并逐跳重检 SSRF 目标（最多 3 跳）
      if (!hasBody) {
        for (let hop = 0; hop < 3 && RELAY_REDIRECT_STATUSES.has(upRes.status); hop++) {
          const location = upRes.headers.get('location')
          if (!location) break
          await upRes.body?.cancel().catch(() => {})
          let nextRaw: string
          try {
            nextRaw = new URL(location, currentUrl).toString()
          } catch {
            return Response.json({ error: { message: '上游重定向地址格式无效' } }, { status: 502 })
          }
          const validatedNext = validateExternalImageUrl(nextRaw)
          if (!validatedNext) {
            return Response.json({ error: { message: '上游重定向目标不安全，已拦截' } }, { status: 403 })
          }
          // 跨源重定向时剥离敏感认证头，防止 API Key / Cookie 泄露给第三方跳转域
          if (validatedNext.origin !== currentUrl.origin) {
            headers.delete('authorization')
            headers.delete('x-goog-api-key')
            headers.delete('cookie')
          }
          currentUrl = validatedNext
          upRes = await fetch(currentUrl.toString(), {
            method,
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
          })
        }
      }
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      logError('us_relay.upstream_error', { host: currentUrl.hostname, method, isTimeout }, err)
      return Response.json(
        { error: { message: isTimeout ? '出站中继请求超时' : '出站中继连接上游失败' } },
        { status: isTimeout ? 504 : 502 }
      )
    }

    const resHeaders = new Headers()
    upRes.headers.forEach((value, key) => {
      if (!RELAY_SKIP_RES_HEADERS.has(key.toLowerCase())) {
        resHeaders.set(key, value)
      }
    })
    return new Response(upRes.body, {
      status: upRes.status,
      headers: resHeaders,
    })
  }
}

const app = new Hono<AppEnv>()

app.onError((err, c) => {
  logError(
    'http.unhandled_error',
    {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
    },
    err
  )
  return c.json({ error: { message: '服务内部异常，请稍后重试' } }, 500)
})

app.route('/api/gallery', galleryRoutes)

app.use('/api/*', withSession)

app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() })
})

app.route('/api', authRoutes)
app.route('/api/account', accountRoutes)
app.route('/api/canvas', canvasRoutes)
app.route('/api/gallery', promptGalleryRoutes)
app.route('/api', uploadRoutes)
app.route('/api/generations', generationRoutes)
app.route('/api/admin', adminRoutes)

app.all('/api/*', (c) => {
  return c.json({ error: { message: 'API route not found' } }, 404)
})

app.all('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export { GenerationJobRunner, GenerationQueueCoordinator }

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const taskNames = [
      'reapStaleProcessingJobs',
      'reconcileQueueViaCoordinator',
      'cleanupExpiredSessionsAndOauth',
      'syncMioArchive',
      'syncOutfitDbArchive',
    ] as const
    ctx.waitUntil(
      Promise.allSettled([
        reapStaleProcessingJobs(env.DB),
        reconcileQueueViaCoordinator(env),
        cleanupExpiredSessionsAndOauth(env.DB),
        syncMioArchive(env),
        syncOutfitDbArchive(env),
      ]).then((results) => {
        results.forEach((res, idx) => {
          if (res.status === 'rejected') {
            logError('cron.task_failed', { task: taskNames[idx] }, res.reason)
          }
        })
      })
    )
  },
} satisfies ExportedHandler<Env>
