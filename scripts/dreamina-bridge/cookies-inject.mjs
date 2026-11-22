/**
 * 把导出的 Cookie 注入到一个「干净的」浏览器实例，验证「用 cookie 接管登录态」是否可行。
 * 这是把桥做成独立服务的关键：服务端不需要人工登录，只要喂 Cookie。
 *
 *   node scripts/dreamina-bridge/cookies-inject.mjs <cookies.json> [目标 CDP 地址]
 *
 * 例：先把干净实例跑在 9333，再注入
 *   node scripts/dreamina-bridge/cookies-inject.mjs %TEMP%\dreamina-cookies.json http://127.0.0.1:9333
 */

import fs from 'node:fs/promises'

const file = process.argv[2]
const CDP_HTTP = (process.argv[3] || process.env.DREAMINA_TARGET_CDP || 'http://127.0.0.1:9222').replace(/\/+$/, '')
if (!file) { console.error('usage: node cookies-inject.mjs <cookies.json> [cdpUrl]'); process.exit(1) }

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.nextId = 1; this.pending = new Map() }
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      this.ws = ws
      ws.addEventListener('open', () => resolve(this), { once: true })
      ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
      ws.addEventListener('message', (ev) => {
        let m
        try { m = JSON.parse(ev.data) } catch { return }
        if (m.id && this.pending.has(m.id)) {
          const p = this.pending.get(m.id)
          this.pending.delete(m.id)
          if (m.error) p.reject(new Error(m.error.message))
          else p.resolve(m.result)
        }
      })
    })
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(payload))
    })
  }
}

const data = JSON.parse(await fs.readFile(file, 'utf8'))
const cookies = Array.isArray(data) ? data : data.cookies
if (!cookies || !cookies.length) { console.error('no cookies in file'); process.exit(2) }

const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json()
const cdp = await new CDP(ver.webSocketDebuggerUrl).open()
const { targetInfos } = await cdp.send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page')
if (!page) { console.error('no page target'); process.exit(3) }
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await cdp.send('Network.enable', {}, sessionId)

let ok = 0
const failed = []
for (const c of cookies) {
  const host = c.domain.replace(/^\./, '')
  const url = `${c.secure === false ? 'http' : 'https'}://${host}${c.path || '/'}`
  const params = {
    name: c.name,
    value: c.value,
    url,
    path: c.path || '/',
    secure: c.secure !== false,
    httpOnly: Boolean(c.httpOnly),
    sameSite: c.sameSite || 'Lax',
  }
  if (c.expires && c.expires > 0) params.expires = c.expires
  try {
    const r = await cdp.send('Network.setCookie', params, sessionId)
    if (r.success) ok++
    else failed.push(`${c.name}@${c.domain}`)
  } catch (e) {
    failed.push(`${c.name}@${c.domain} (${e.message})`)
  }
}
console.log(`injected ${ok}/${cookies.length} cookies into ${CDP_HTTP}`)
if (failed.length) console.log('failed:', failed.slice(0, 8).join(', '))

// 验证：导航到生成页，用 Cookie 判断登录态（页面文案会误判：侧栏空态里也有 "Sign in to start creating"）
await cdp.send('Page.navigate', { url: 'https://dreamina.capcut.com/ai-tool/generate' }, sessionId)
await new Promise((r) => setTimeout(r, 12000))
const { cookies: after } = await cdp.send('Network.getAllCookies', {}, sessionId)
const loggedIn = after.some(
  (c) => /capcut|dreamina/i.test(c.domain) && (c.name === 'sessionid' || c.name === 'sid_tt') && c.value
)
const probe = await cdp.send('Runtime.evaluate', {
  expression: `(() => ({
    href: location.href,
    hasPrompt: !!document.querySelector('[aria-label="Prompt"][contenteditable="true"], textarea[aria-label="Prompt"]'),
    hasSubmit: !!document.querySelector('[data-testid="dreamina.generator.submit"]'),
    signInButton: [...document.querySelectorAll('button,a')].filter(e => e.getClientRects().length > 0 && /^(sign in|log in)$/i.test((e.innerText||'').trim())).length,
  }))()`,
  returnByValue: true,
}, sessionId)
console.log('probe:', JSON.stringify({ ...probe.result.value, loggedIn }))
process.exit(0)
