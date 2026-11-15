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
      if (res.statusCode !== 200) {
        socket.destroy()
        cb(new Error(`Proxy CONNECT ${targetHost}:${targetPort} failed: HTTP ${res.statusCode}`))
        return
      }
      const tlsSock = tls.connect({
        socket,
        servername: targetHost,
      })
      cb(null, tlsSock)
    })
    proxyReq.once('timeout', () => {
      proxyReq.destroy(new Error('Proxy CONNECT timeout'))
    })
    proxyReq.once('error', (err) => cb(err))
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
      for (const h of ['content-type', 'authorization', 'x-goog-api-key']) {
        const val = req.headers[h]
        if (typeof val === 'string' && val) {
          forwardHeaders[h] = val
        }
      }
      if (rawBody.length > 0 && method !== 'GET') {
        forwardHeaders['content-length'] = String(rawBody.length)
      }

      const targetPort = Number(target.port) || 443
      const proxyUrl = getProxyUrlForTarget(target.hostname)
      const agent = proxyUrl ? createProxyAgent(proxyUrl, target.hostname, targetPort) : undefined

      await new Promise<void>((resolve, reject) => {
        const upReq = https.request(
          {
            hostname: target.hostname,
            port: targetPort,
            path: `${target.pathname}${target.search}`,
            method,
            headers: forwardHeaders,
            agent,
            timeout: 80_000,
          },
          (upRes) => {
            res.statusCode = upRes.statusCode || 502
            const ct = upRes.headers['content-type']
            if (ct) res.setHeader('Content-Type', ct)
            upRes.pipe(res)
            upRes.once('end', () => resolve())
            upRes.once('error', (err) => reject(err))
          }
        )
        upReq.once('timeout', () => {
          upReq.destroy(new Error('Upstream request timeout'))
        })
        upReq.once('error', (err) => reject(err))
        if (rawBody.length > 0 && method !== 'GET') {
          upReq.write(rawBody)
        }
        upReq.end()
      })
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Dev upstream proxy failed' } }))
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
