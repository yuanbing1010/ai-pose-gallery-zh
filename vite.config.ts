import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import tls from 'node:tls'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function getProxyUrlForTarget(targetHost: string): URL | null {
  const noProxy = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const h = targetHost.toLowerCase()
  if (noProxy.some((entry) => h === entry || h.endsWith(`.${entry}`))) {
    return null
  }
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function createProxyAgent(proxyUrl: URL, targetHost: string, targetPort: number): https.Agent {
  const agent = new https.Agent({ keepAlive: false })
  ;(agent as any).createConnection = (_opts: unknown, cb: (err: Error | null, sock?: tls.TLSSocket) => void) => {
    let cbDone = false
    const done = (err: Error | null, sock?: tls.TLSSocket) => {
      if (cbDone) return
      cbDone = true
      cb(err, sock)
    }

    const proxyPort = Number(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80)
    const connectHeaders: Record<string, string> = {
      Host: `${targetHost}:${targetPort}`,
    }
    if (proxyUrl.username || proxyUrl.password) {
      const cred = Buffer.from(
        `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`
      ).toString('base64')
      connectHeaders['Proxy-Authorization'] = `Basic ${cred}`
    }
    const proxyReq = http.request({
      host: proxyUrl.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: connectHeaders,
      timeout: 15_000,
    })
    proxyReq.once('connect', (res, socket) => {
      proxyReq.removeAllListeners('timeout')
      proxyReq.removeAllListeners('error')
      if (res.statusCode !== 200) {
        socket.destroy()
        done(new Error(`Proxy CONNECT ${targetHost}:${targetPort} failed: HTTP ${res.statusCode}`))
        return
      }
      // 清除 CONNECT 阶段设置的 socket 超时，避免残留定时器在 TLS 握手期间误触发
      socket.setTimeout(0)
      const tlsSock = tls.connect({
        socket,
        servername: targetHost,
        ALPNProtocols: ['http/1.1'],
      })
      done(null, tlsSock)
    })
    proxyReq.once('timeout', () => {
      proxyReq.destroy(new Error('Proxy CONNECT timeout'))
    })
    proxyReq.once('error', (err) => done(err))
    proxyReq.end()
  }
  return agent
}

// 开发与预览时：
// 1. 直接挂载仓库根目录下的 data/、thumbs/、img/，避免拷贝 1.1 GB 素材
// 2. 仅在本地 dev 模式下提供 /__dev_upstream_fetch，解决 workerd 忽略系统 HTTPS_PROXY 环境变量的问题
function localAssetsPlugin(): Plugin {
  const rootDir = import.meta.dirname
  const prefixes = ['/data/', '/thumbs/', '/img/', '/og-cover.jpg', '/robots.txt', '/sitemap.xml']

  const handleDevUpstream = async (req: any, res: any) => {
    const remote = req.socket?.remoteAddress || ''
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: { message: 'Forbidden' } }))
      return
    }

    const targetRaw = req.headers['x-dev-target-url'] as string | undefined
    const method = ((req.headers['x-dev-method'] as string | undefined) || 'POST').toUpperCase()
    if (!targetRaw) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: { message: 'Missing x-dev-target-url' } }))
      return
    }

    let target: URL
    try {
      target = new URL(targetRaw)
      if (target.protocol !== 'https:') {
        throw new Error('Only https targets are allowed')
      }
    } catch (err) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Invalid URL' } }))
      return
    }

    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const rawBody = Buffer.concat(chunks)

      const forwardHeaders: Record<string, string> = {
        'Accept-Encoding': 'identity',
      }
      const extraHeadersRaw = req.headers['x-dev-extra-headers']
      if (typeof extraHeadersRaw === 'string' && extraHeadersRaw) {
        try {
          const parsed = JSON.parse(extraHeadersRaw) as Record<string, unknown>
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              const lower = k.toLowerCase()
              if (
                typeof v === 'string' &&
                v &&
                !['host', 'connection', 'content-length', 'transfer-encoding'].includes(lower) &&
                !lower.startsWith('x-dev-')
              ) {
                forwardHeaders[k] = v
              }
            }
          }
        } catch {
          // ignore malformed extra headers JSON
        }
      }
      for (const h of ['content-type', 'authorization', 'x-goog-api-key']) {
        const val = req.headers[h]
        if (typeof val === 'string' && val) {
          forwardHeaders[h] = val
        }
      }
      if (rawBody.length > 0 && method !== 'GET' && method !== 'HEAD') {
        forwardHeaders['content-length'] = String(rawBody.length)
      }

      const rawTimeoutMs = Number(req.headers['x-dev-timeout-ms'] || 0)
      const upstreamTimeoutMs =
        Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0
          ? Math.min(200_000, Math.max(5_000, Math.floor(rawTimeoutMs)))
          : 80_000

      const targetPort = Number(target.port) || 443
      const proxyUrl = getProxyUrlForTarget(target.hostname)
      const startedAt = Date.now()

      const sendOnce = (attemptTimeoutMs: number) =>
        new Promise<{ secureConnected: boolean; clientClosed: boolean }>((resolve, reject) => {
          let settled = false
          let secureConnected = false
          let clientClosed = false
          const agent = proxyUrl ? createProxyAgent(proxyUrl, target.hostname, targetPort) : undefined

          const finish = (err?: Error) => {
            if (settled) return
            settled = true
            clearTimeout(deadlineTimer)
            req.off('aborted', onClientAbort)
            res.off('close', onClientClose)
            if (err) {
              reject(Object.assign(err, { _secureConnected: secureConnected, _clientClosed: clientClosed }))
            } else {
              resolve({ secureConnected, clientClosed })
            }
          }

          const upReq = https.request(
            {
              hostname: target.hostname,
              port: targetPort,
              path: `${target.pathname}${target.search}`,
              method,
              headers: forwardHeaders,
              agent,
              timeout: attemptTimeoutMs,
            },
            (upRes) => {
              secureConnected = true
              res.statusCode = upRes.statusCode || 502
              const ct = upRes.headers['content-type']
              if (ct) res.setHeader('Content-Type', ct)
              const cl = upRes.headers['content-length']
              if (typeof cl === 'string' && /^\d+$/.test(cl)) {
                res.setHeader('Content-Length', cl)
              }
              const retryAfter = upRes.headers['retry-after']
              if (typeof retryAfter === 'string' && retryAfter) {
                res.setHeader('Retry-After', retryAfter)
              }
              upRes.pipe(res)
              upRes.once('end', () => finish())
              upRes.once('error', (err) => finish(err))
            }
          )

          upReq.once('socket', (sock) => {
            const tlsSock = sock as tls.TLSSocket
            if (tlsSock.encrypted && tlsSock.getCipher?.()) {
              secureConnected = true
            } else {
              sock.once('secureConnect', () => {
                secureConnected = true
              })
            }
          })

          const onClientAbort = () => {
            clientClosed = true
            const err = new Error('Client aborted upstream request')
            upReq.destroy(err)
            finish(err)
          }
          const onClientClose = () => {
            if (!res.writableEnded) {
              clientClosed = true
              const err = new Error('Client closed upstream request')
              upReq.destroy(err)
              finish(err)
            }
          }
          req.once('aborted', onClientAbort)
          res.once('close', onClientClose)

          const deadlineTimer = setTimeout(() => {
            const err = new Error('Upstream request deadline exceeded')
            upReq.destroy(err)
            finish(err)
          }, attemptTimeoutMs + 1_000)

          upReq.once('timeout', () => {
            upReq.destroy(new Error('Upstream request timeout'))
          })
          upReq.once('error', (err) => finish(err))
          if (rawBody.length > 0 && method !== 'GET') {
            upReq.write(rawBody)
          }
          upReq.end()
        })

      try {
        await sendOnce(upstreamTimeoutMs)
      } catch (firstErr: any) {
        const elapsedMs = Date.now() - startedAt
        const remainingMs = upstreamTimeoutMs - elapsedMs - 300
        const canRetryPreTls =
          !firstErr?._secureConnected && !firstErr?._clientClosed && !res.headersSent && remainingMs >= 5_000
        if (!canRetryPreTls) {
          throw firstErr
        }
        await new Promise((r) => setTimeout(r, 300))
        await sendOnce(remainingMs)
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (err && err._secureConnected === false && !err._clientClosed) {
          res.setHeader('X-Dev-Pre-Request-Error', '1')
        }
        res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Dev upstream proxy failed' } }))
      } else if (!res.destroyed) {
        res.destroy(err instanceof Error ? err : undefined)
      }
    }
  }

  const serve = (req: any, res: any, next: any, allowDevProxy: boolean) => {
    const rawUrl = (req.url || '').split('?')[0]
    if (allowDevProxy && rawUrl === '/__dev_upstream_fetch') {
      void handleDevUpstream(req, res)
      return
    }
    const decoded = decodeURIComponent(rawUrl)
    if (!prefixes.some((p) => decoded === p || decoded.startsWith(p))) {
      return next()
    }
    const filePath = path.join(rootDir, decoded)
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return next()
    }
    const ext = path.extname(filePath).toLowerCase()
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    res.setHeader(
      'Cache-Control',
      ext === '.json' || ext === '.csv' ? 'no-cache, must-revalidate' : 'public, max-age=3600'
    )
    fs.createReadStream(filePath).pipe(res)
  }

  return {
    name: 'local-assets-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => serve(req, res, next, true))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => serve(req, res, next, false))
    },
  }
}

// 将前端 /api/* 请求代理到本地 wrangler dev (D1 + R2)
const WORKER_API_URL = process.env.WORKER_API_URL || 'http://127.0.0.1:8787'
const apiProxy = {
  '/api': {
    target: WORKER_API_URL,
    changeOrigin: false,
  },
}

export default defineConfig({
  publicDir: false,
  plugins: [
    localAssetsPlugin(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'tanstack-vendor', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'motion-vendor', test: /node_modules[\\/](motion|framer-motion)[\\/]/ },
            { name: 'ui-vendor', test: /node_modules[\\/](radix-ui|@radix-ui|lucide-react|sonner)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
