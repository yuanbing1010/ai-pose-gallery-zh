/**
 * 诊断：列出桥浏览器里 Dreamina 相关的实际 Cookie（名字与域名，值做掩码），
 * 用来判断「登录态是否真的迁移成功」。
 *
 *   node scripts/dreamina-bridge/cookies.mjs
 */

const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.nextId = 1; this.pending = new Map() }
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      this.ws = ws
      ws.addEventListener('open', () => resolve(this), { once: true })
      ws.addEventListener('error', () => reject(new Error('CDP websocket error')), { once: true })
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

const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json()
const cdp = await new CDP(ver.webSocketDebuggerUrl).open()
const { targetInfos } = await cdp.send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page' && /dreamina/.test(t.url || ''))
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await cdp.send('Network.enable', {}, sessionId)

const { cookies } = await cdp.send('Network.getAllCookies', {}, sessionId)
const hit = cookies.filter((c) => /capcut|dreamina/i.test(c.domain))
console.log(`capcut/dreamina cookies: ${hit.length}`)
const mask = (v) => (!v ? '' : v.length <= 8 ? '***' : `${v.slice(0, 4)}***${v.slice(-4)}`)
for (const c of hit.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))) {
  const key = /session|sid|uid|token|passport/i.test(c.name) ? ' *' : '  '
  console.log(`${key} ${c.domain.padEnd(34)} ${c.name.padEnd(28)} ${mask(c.value)}`)
}
const hasSession = hit.some((c) => c.name === 'sessionid' || c.name === 'sid_tt')
console.log(`\nSESSION PRESENT: ${hasSession}`)
process.exit(0)
