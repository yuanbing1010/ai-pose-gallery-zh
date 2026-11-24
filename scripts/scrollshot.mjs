#!/usr/bin/env node
/**
 * scrollshot.mjs — 面向 CASTDECK 的零依赖多路由滚动视觉回归 & QA 脚本
 *
 * 借鉴 Scrolltide scrollshot 思路，使用 Node 原生 WebSocket + 本机 Chrome/Edge CDP 驱动，
 * 无需额外安装 Playwright / Puppeteer，按滚动百分比检查桌面端、移动端与减弱动态效果（reduced-motion）。
 *
 * 用法：
 *   node scripts/scrollshot.mjs [url | dist目录] [选项]
 *
 * 示例：
 *   node scripts/scrollshot.mjs http://127.0.0.1:5173
 *   node scripts/scrollshot.mjs http://127.0.0.1:5173 --routes /,/poses,/studio --reduced
 *   node scripts/scrollshot.mjs dist --stops 0,20,40,60,80,100 --dark
 *   pnpm run qa:scroll -- http://127.0.0.1:5173 --routes /,/poses --reduced
 *
 * 选项：
 *   --out <dir>              输出目录（默认 .scrollshot）
 *   --routes <a,b,c>         检查路由列表，逗号分隔（默认仅检查目标 URL 本身或 /）
 *   --stops <0,25,50,75,100> 滚动百分比检查点（默认 0,25,50,75,100）
 *   --wait <ms>              每个检查点滚动到位后的稳定等待毫秒数（默认 850）
 *   --settle <ms>            页面首屏载入后的稳定等待毫秒数（默认 1400）
 *   --only <desktop|mobile>  仅测单个视口
 *   --reduced                额外跑一遍 prefers-reduced-motion: reduce 检查
 *   --dark                   启用暗色模式（prefers-color-scheme: dark + 写入主题存储）
 *   --browser <path>         手动指定 Chrome / Edge / Chromium 可执行文件路径
 *
 * 退出码：
 *   0 = 无阻塞问题
 *   1 = 发现阻塞问题（JS 报错、控制台 error、同源请求失败、裂图、横向溢出、首屏字体未加载）
 *   2 = 参数或浏览器启动错误
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

/* ------------------------------------------------------------------ CLI */

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  printUsage()
  process.exit(0)
}

const SWITCHES = new Set(['--reduced', '--dark', '--help', '-h'])
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const positional = argv.filter(
  (a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !SWITCHES.has(argv[i - 1]))
)

const target = positional[0] || 'http://127.0.0.1:5173'
const outDir = resolve(flag('out', '.scrollshot'))
const stops = flag('stops', '0,25,50,75,100')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100)
const waitMs = Math.max(0, Number(flag('wait', '850')) || 850)
const settleMs = Math.max(0, Number(flag('settle', '1400')) || 1400)
const only = flag('only', '')
const reduced = argv.includes('--reduced')
const darkMode = argv.includes('--dark')
const browserOverride = flag('browser', '')
const routesArg = flag('routes', '')

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false, touch: false },
  { name: 'mobile', width: 390, height: 844, mobile: true, touch: true },
].filter((v) => !only || v.name === only)

if (VIEWS.length === 0) {
  console.error(`无效的 --only 参数：${only}（仅支持 desktop 或 mobile）`)
  process.exit(2)
}

function printUsage() {
  console.log(`用法：
  node scripts/scrollshot.mjs [url | dist目录] [选项]

选项：
  --out <dir>              输出目录（默认 .scrollshot）
  --routes <a,b,c>         检查多个路由，例如 /,/poses,/studio
  --stops <0,25,50,75,100> 滚动百分比检查点
  --wait <ms>              每个检查点等待时间（默认 850）
  --settle <ms>            首屏载入后稳定等待时间（默认 1400）
  --only <desktop|mobile>  仅测单个视口
  --reduced                追加 prefers-reduced-motion: reduce 检查
  --dark                   使用暗色主题检查
  --browser <path>         指定 Chrome/Edge 可执行路径`)
}

/* -------------------------------------------------------- static server */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function serveDir(root) {
  const base = resolve(root)
  const server = createServer((req, res) => {
    const reqPath = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname)
    let file = resolve(base, '.' + reqPath)
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, 'index.html')
    }
    // SPA 客户端路由回退到 index.html；静态资源缺失仍返回 404
    if (!existsSync(file) && !extname(reqPath)) {
      file = join(base, 'index.html')
    }
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    const size = statSync(file).size
    const type = MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size })
    createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

async function resolveBaseTarget(rawTarget) {
  if (/^https?:\/\//i.test(rawTarget)) {
    return { baseUrl: rawTarget.replace(/\/+$/, ''), defaultPath: new URL(rawTarget).pathname || '/', server: null }
  }
  const abs = resolve(rawTarget)
  if (!existsSync(abs)) {
    throw new Error(`找不到目标路径：${rawTarget}`)
  }
  const isDir = statSync(abs).isDirectory()
  const server = await serveDir(isDir ? abs : dirname(abs))
  const { port } = server.address()
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    defaultPath: isDir ? '/' : `/${encodeURIComponent(basename(abs))}`,
    server,
  }
}

/* -------------------------------------------------- browser + native CDP */

function findBrowserBinary() {
  if (browserOverride) {
    if (!existsSync(browserOverride)) throw new Error(`指定的浏览器不存在：${browserOverride}`)
    return browserOverride
  }
  const envPath = process.env.CHROME_PATH || process.env.EDGE_PATH
  if (envPath && existsSync(envPath)) return envPath

  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
          join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
          join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
          join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
          join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
          ]

  for (const bin of candidates) {
    if (bin && existsSync(bin)) return bin
  }
  throw new Error('未找到本机 Chrome / Edge / Chromium，请通过 --browser <路径> 或环境变量 CHROME_PATH 指定。')
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
  }

  open() {
    return new Promise((resolveOpen, rejectOpen) => {
      const ws = new WebSocket(this.wsUrl)
      this.ws = ws
      ws.addEventListener('open', () => resolveOpen(this), { once: true })
      ws.addEventListener('error', () => rejectOpen(new Error(`CDP WebSocket 连接失败：${this.wsUrl}`)), { once: true })
      ws.addEventListener('message', (ev) => {
        let msg
        try {
          msg = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { ok, err } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) err(new Error(msg.error.message || 'CDP error'))
          else ok(msg.result)
          return
        }
        if (msg.method) {
          const handlers = this.listeners.get(msg.method)
          if (handlers) {
            for (const fn of handlers) fn(msg.params, msg.sessionId)
          }
        }
      })
    })
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set())
    this.listeners.get(method).add(fn)
    return () => this.listeners.get(method)?.delete(fn)
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params }
    return new Promise((ok, err) => {
      this.pending.set(id, { ok, err })
      this.ws.send(JSON.stringify(payload))
    })
  }

  close() {
    try {
      this.ws?.close()
    } catch {}
  }
}

async function launchBrowser() {
  const bin = findBrowserBinary()
  const profileDir = mkdtempSync(join(tmpdir(), 'castdeck-scrollshot-'))
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      '--mute-audio',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )

  const wsUrl = await new Promise((resolveUrl, rejectUrl) => {
    let stderr = ''
    const timer = setTimeout(() => {
      rejectUrl(new Error(`启动无头浏览器超时（${basename(bin)}）\n${stderr.slice(-400)}`))
    }, 15000)

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (m) {
        clearTimeout(timer)
        resolveUrl(m[1])
      }
    })
    proc.once('exit', (code) => {
      clearTimeout(timer)
      rejectUrl(new Error(`无头浏览器提前退出（code=${code}）\n${stderr.slice(-400)}`))
    })
  })

  const cdp = await new CDPClient(wsUrl).open()
  const close = async () => {
    try {
      await cdp.send('Browser.close')
    } catch {}
    cdp.close()
    try {
      proc.kill()
    } catch {}
    await pause(200)
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {}
  }
  return { cdp, close, bin }
}

/* -------------------------------------------------------- in-page probes */

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const pad = (n) => String(n).padStart(3, '0')
const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')

async function evalInPage(cdp, sessionId, expression) {
  const res = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  )
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'evaluate error')
  }
  return res.result?.value
}

function buildScrollScript(targetY) {
  return `(async () => {
    const to = ${Math.round(targetY)};
    const from = window.scrollY;
    const steps = Math.max(1, Math.min(60, Math.ceil(Math.abs(to - from) / (window.innerHeight * 0.5))));
    for (let i = 1; i <= steps; i++) {
      window.scrollTo(0, from + ((to - from) * i) / steps);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    return window.scrollY;
  })()`
}

const PROBE_SIDEWAYS_EXPR = `(() => {
  const y = window.scrollY;
  window.scrollTo(99999, y);
  const canScrollX = window.scrollX > 0;
  window.scrollTo(0, y);
  if (!canScrollX) return { sideways: false, culprits: [] };
  const vw = document.documentElement.clientWidth;
  const clips = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o !== 'visible') return true;
    }
    return false;
  };
  const describe = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '');
  const culprits = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !clips(el);
    })
    .slice(0, 6)
    .map((el) => describe(el) + ' (right ' + Math.round(el.getBoundingClientRect().right) + 'px / vw ' + vw + 'px)');
  return { sideways: true, culprits };
})()`

const PROBE_PAGE_EXPR = `(() => {
  const cleanFamily = (f) => f.replace(/["']/g, '').trim();
  const loadedFonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => cleanFamily(f.family)))];
  const declaredFonts = new Set([...document.fonts].map((f) => cleanFamily(f.family)));
  const h1 = document.querySelector('h1');
  const h1Font = h1 ? cleanFamily(getComputedStyle(h1).fontFamily.split(',')[0]) : null;
  const generic = ['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy', 'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system', 'BlinkMacSystemFont'];
  return {
    title: document.title,
    screens: +(document.documentElement.scrollHeight / Math.max(1, window.innerHeight)).toFixed(1),
    ground: {
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    },
    loadedFonts,
    h1: h1
      ? {
          text: (h1.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
          font: h1Font,
          fontDeclared: declaredFonts.has(h1Font),
          fontLoaded: generic.includes(h1Font) || loadedFonts.includes(h1Font),
        }
      : null,
    brokenImages: [...document.images]
      .filter((img) => img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src))
      .map((img) => (img.currentSrc || img.src).slice(-120)),
    reducedMotionRules: [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((r) => r.media && /prefers-reduced-motion/.test(r.media.mediaText));
      } catch {
        return false;
      }
    }),
  };
})()`

/* -------------------------------------------------- single viewport run */

const IGNORED_THIRD_PARTY_HOSTS = new Set(['u.authbox.cn'])

function isFaviconUrl(url) {
  return /\/favicon\.ico(\?|$)/i.test(url || '')
}

function isIgnoredThirdParty(url) {
  try {
    return IGNORED_THIRD_PARTY_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

async function runViewport(cdp, url, routeOutDir, view, { stopsFor, motion, label }) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

  const pageOrigin = new URL(url).origin
  const reqMap = new Map()
  const log = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    thirdPartyWarnings: [],
    httpErrors: [],
  }

  const unsubs = [
    cdp.on('Runtime.consoleAPICalled', (p, sid) => {
      if (sid !== sessionId || p.type !== 'error') return
      const text = (p.args || [])
        .map((a) => a.value ?? a.description ?? '')
        .filter(Boolean)
        .join(' ')
        .slice(0, 300)
      if (!isFaviconUrl(text)) log.consoleErrors.push(text || 'console.error')
    }),
    cdp.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid !== sessionId) return
      const desc = p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'Uncaught exception'
      log.pageErrors.push(String(desc).slice(0, 300))
    }),
    cdp.on('Network.requestWillBeSent', (p, sid) => {
      if (sid !== sessionId) return
      reqMap.set(p.requestId, { url: p.request.url, type: p.type })
    }),
    cdp.on('Network.loadingFailed', (p, sid) => {
      if (sid !== sessionId || p.canceled) return
      const info = reqMap.get(p.requestId)
      const reqUrl = info?.url || ''
      if (isFaviconUrl(reqUrl)) return
      const entry = `${p.errorText || 'failed'} ${reqUrl.slice(0, 160)}`
      if (isIgnoredThirdParty(reqUrl) || (reqUrl && !reqUrl.startsWith(pageOrigin))) {
        log.thirdPartyWarnings.push(entry)
      } else {
        log.failedRequests.push(entry)
      }
    }),
    cdp.on('Network.responseReceived', (p, sid) => {
      if (sid !== sessionId) return
      const status = p.response?.status || 0
      const reqUrl = p.response?.url || ''
      if (status < 400 || isFaviconUrl(reqUrl)) return
      const entry = `${status} ${reqUrl.slice(0, 160)}`
      if (isIgnoredThirdParty(reqUrl) || (reqUrl && !reqUrl.startsWith(pageOrigin))) {
        log.thirdPartyWarnings.push(entry)
      } else {
        log.httpErrors.push(entry)
      }
    }),
  ]

  try {
    await Promise.all([
      cdp.send('Page.enable', {}, sessionId),
      cdp.send('Runtime.enable', {}, sessionId),
      cdp.send('Network.enable', {}, sessionId),
    ])

    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: view.width,
        height: view.height,
        deviceScaleFactor: 1,
        mobile: view.mobile,
      },
      sessionId
    )

    if (view.touch) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId)
    }

    const mediaFeatures = [{ name: 'prefers-reduced-motion', value: motion }]
    if (darkMode) {
      mediaFeatures.push({ name: 'prefers-color-scheme', value: 'dark' })
      await cdp.send(
        'Page.addScriptToEvaluateOnNewDocument',
        { source: `try { localStorage.setItem('todaynew-admin:theme', 'dark'); } catch {}` },
        sessionId
      )
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: mediaFeatures }, sessionId)

    let loaded = false
    const onLoad = new Promise((resolveLoad) => {
      const off = cdp.on('Page.loadEventFired', (_p, sid) => {
        if (sid !== sessionId) return
        loaded = true
        off()
        resolveLoad()
      })
      setTimeout(() => {
        off()
        resolveLoad()
      }, 25000)
    })

    await cdp.send('Page.navigate', { url }, sessionId)

    const shots = []
    if (view.name === 'desktop' && motion === 'no-preference') {
      await pause(350)
      const firstShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const file = join(routeOutDir, 'desktop-first-paint.png')
      writeFileSync(file, Buffer.from(firstShot.data, 'base64'))
      shots.push({ stop: 'first paint', file: basename(file) })
    }

    if (!loaded) await onLoad
    await evalInPage(cdp, sessionId, `document.fonts?.ready?.catch(() => {})`).catch(() => {})
    await pause(settleMs)

    const maxScroll = await evalInPage(
      cdp,
      sessionId,
      `Math.max(0, document.documentElement.scrollHeight - window.innerHeight)`
    )
    const checkpoints = maxScroll < 10 ? [0] : stopsFor
    let prevHash = null

    for (const stop of checkpoints) {
      const targetY = Math.round((maxScroll * stop) / 100)
      const actualY = await evalInPage(cdp, sessionId, buildScrollScript(targetY))
      await pause(waitMs)
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const buf = Buffer.from(shot.data, 'base64')
      const hash = sha1(buf)
      const file = join(routeOutDir, `${label}-${pad(stop)}.png`)
      writeFileSync(file, buf)
      shots.push({
        stop: `${stop}%`,
        file: basename(file),
        scrollY: Math.round(actualY),
        reached: Math.abs(actualY - targetY) <= Math.max(4, maxScroll * 0.015),
        sameAsPrevious: prevHash !== null && hash === prevHash,
      })
      prevHash = hash
    }

    const sideways = await evalInPage(cdp, sessionId, PROBE_SIDEWAYS_EXPR)
    const probe = await evalInPage(cdp, sessionId, PROBE_PAGE_EXPR)

    return {
      viewport: `${view.width}x${view.height}`,
      motion,
      darkMode,
      shots,
      sideways,
      ...probe,
      ...log,
    }
  } finally {
    for (const off of unsubs) off()
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

/* ----------------------------------------------------------------- main */

function routeSlug(routePath) {
  if (!routePath || routePath === '/') return 'home'
  return routePath.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'home'
}

const { baseUrl, defaultPath, server } = await resolveBaseTarget(target)
const routes = routesArg
  ? routesArg
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => (r.startsWith('/') ? r : `/${r}`))
  : [defaultPath]

mkdirSync(outDir, { recursive: true })
const browser = await launchBrowser()

const report = {
  target,
  baseUrl,
  browser: basename(browser.bin),
  at: new Date().toISOString(),
  stops,
  darkMode,
  routes: {},
}

try {
  for (const routePath of routes) {
    const slug = routeSlug(routePath)
    const routeOutDir = routes.length > 1 ? join(outDir, slug) : outDir
    mkdirSync(routeOutDir, { recursive: true })
    const routeUrl = `${baseUrl}${routePath}`
    const views = {}

    for (const view of VIEWS) {
      views[view.name] = await runViewport(browser.cdp, routeUrl, routeOutDir, view, {
        stopsFor: stops,
        motion: 'no-preference',
        label: view.name,
      })
    }
    if (reduced) {
      views.reduced = await runViewport(browser.cdp, routeUrl, routeOutDir, VIEWS[0], {
        stopsFor: [0, 50, 100],
        motion: 'reduce',
        label: 'reduced',
      })
    }
    report.routes[routePath] = { url: routeUrl, outDir: routeOutDir, views }
  }
} finally {
  await browser.close()
  server?.close()
}

const reportPath = join(outDir, 'report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))

/* -------------------------------------------------------------- summary */

const blocking = []
const notes = []

for (const [routePath, routeData] of Object.entries(report.routes)) {
  for (const [viewName, v] of Object.entries(routeData.views)) {
    const tag = `[${routePath} · ${viewName}]`
    if (v.pageErrors.length) blocking.push(`${tag} ${v.pageErrors.length} 条未捕获异常：${v.pageErrors[0]}`)
    if (v.consoleErrors.length) blocking.push(`${tag} ${v.consoleErrors.length} 条控制台错误：${v.consoleErrors[0]}`)
    if (v.failedRequests.length) blocking.push(`${tag} ${v.failedRequests.length} 条同源请求失败：${v.failedRequests[0]}`)
    if (v.httpErrors.length) blocking.push(`${tag} ${v.httpErrors.length} 条 HTTP 报错：${v.httpErrors[0]}`)
    if (v.brokenImages.length) blocking.push(`${tag} ${v.brokenImages.length} 张裂图：${v.brokenImages[0]}`)
    if (v.sideways?.sideways) {
      blocking.push(`${tag} 出现横向溢出：${v.sideways.culprits.join('; ') || '未知元素'}`)
    }
    if (v.h1 && !v.h1.fontLoaded && v.h1.fontDeclared) {
      blocking.push(`${tag} <h1> 声明字体 "${v.h1.font}" 未成功加载`)
    }
    if (!v.h1) notes.push(`${tag} 页面未检测到 <h1>`)
    const same = v.shots.filter((s) => s.sameAsPrevious).map((s) => s.stop)
    if (same.length) notes.push(`${tag} 检查点 ${same.join(', ')} 与上一帧完全相同（请核查吸顶舞台是否卡住或页尾无变化）`)
    const missed = v.shots.filter((s) => s.reached === false).map((s) => s.stop)
    if (missed.length) notes.push(`${tag} 未能滚动到达 ${missed.join(', ')}`)
    if (v.thirdPartyWarnings.length) {
      notes.push(`${tag} ${v.thirdPartyWarnings.length} 条第三方请求异常（非阻塞）：${v.thirdPartyWarnings[0]}`)
    }
    if (/rgba\(0, 0, 0, 0\)|transparent/.test(v.ground.html) && /rgba\(0, 0, 0, 0\)|transparent/.test(v.ground.body)) {
      notes.push(`${tag} html 与 body 均未设置背景色，首屏可能白屏闪烁`)
    }
    if (viewName !== 'reduced' && !v.reducedMotionRules) {
      notes.push(`${tag} 样式表未检测到 prefers-reduced-motion 规则`)
    }
  }
}

console.log(`\nCASTDECK scrollshot (${report.browser})  ${baseUrl}`)
for (const [routePath, routeData] of Object.entries(report.routes)) {
  const sample = routeData.views.desktop ?? routeData.views.mobile
  console.log(
    `\n  ${routePath}  ·  ${sample?.screens ?? '?'} 屏高  ·  h1 "${sample?.h1?.text ?? '-'}" (${sample?.h1?.font ?? '-'})`
  )
  for (const [viewName, v] of Object.entries(routeData.views)) {
    console.log(`    ${viewName.padEnd(8)} ${v.shots.map((s) => s.file).join('  ')}`)
  }
}
console.log(blocking.length ? `\nBLOCKING (${blocking.length})\n  ${blocking.join('\n  ')}` : '\nPASS · 无阻塞问题')
if (notes.length) console.log(`\n提示 (${notes.length})\n  ${notes.join('\n  ')}`)
console.log(`\n完整报告：${reportPath}`)
process.exit(blocking.length ? 1 : 0)
