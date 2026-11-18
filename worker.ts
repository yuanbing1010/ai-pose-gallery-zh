import { DurableObject } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cleanupExpiredSessionsAndOauth, reapStaleProcessingJobs } from './server/db'
import { withSession } from './server/middleware'
import { accountRoutes } from './server/routes/account'
import { adminRoutes } from './server/routes/admin'
import { authRoutes } from './server/routes/auth'
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

/**
 * 美国管辖区 Durable Object 出站中继：
 * 当边缘节点（如 HKG）直连 OpenAI / Google / xAI 官方接口遭遇地区封锁时，
 * 由此对象在美国境内节点代为发起上游 fetch 请求。
 */
export class UsEgressRelay extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const rawTarget = request.headers.get('x-relay-target-url') || ''
    const validatedUrl = validateExternalImageUrl(rawTarget)
    if (!validatedUrl) {
      return Response.json({ error: { message: '非法的出站中继目标地址' } }, { status: 400 })
    }

    const method = (request.headers.get('x-relay-method') || 'POST').toUpperCase()
    if (!RELAY_ALLOWED_METHODS.has(method)) {
      return Response.json({ error: { message: '不支持的中继请求方法' } }, { status: 405 })
    }

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
    const bodyBuf = hasBody && request.body ? await request.arrayBuffer() : undefined
    const upRes = await fetch(validatedUrl.toString(), {
      method,
      headers,
      body: bodyBuf && bodyBuf.byteLength > 0 ? bodyBuf : undefined,
      signal: AbortSignal.timeout(75_000),
    })

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

app.use('/api/*', withSession)

app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() })
})

app.route('/api', authRoutes)
app.route('/api/account', accountRoutes)
app.route('/api', uploadRoutes)
app.route('/api/generations', generationRoutes)
app.route('/api/admin', adminRoutes)

app.all('/api/*', (c) => {
  return c.json({ error: { message: 'API route not found' } }, 404)
})

app.all('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.allSettled([
        reapStaleProcessingJobs(env.DB),
        cleanupExpiredSessionsAndOauth(env.DB),
      ])
    )
  },
}
