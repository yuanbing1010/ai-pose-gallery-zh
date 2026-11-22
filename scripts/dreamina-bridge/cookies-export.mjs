/**
 * 导出当前桥浏览器的 Dreamina / CapCut 登录 Cookie（明文）。
 *
 *   node scripts/dreamina-bridge/cookies-export.mjs [输出文件]
 *
 * ⚠️ 输出文件等于账号登录凭证，不要提交到仓库、不要发到聊天里。
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')
const out = process.argv[2] || path.join(os.tmpdir(), 'dreamina-cookies.json')

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

const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json()
const cdp = await new CDP(ver.webSocketDebuggerUrl).open()
const { targetInfos } = await cdp.send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page' && /dreamina/.test(t.url || ''))
if (!page) { console.error('no dreamina tab'); process.exit(2) }
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await cdp.send('Network.enable', {}, sessionId)

const { cookies } = await cdp.send('Network.getAllCookies', {}, sessionId)
const keep = cookies.filter((c) => /capcut|dreamina/i.test(c.domain))
const slim = keep.map((c) => ({
  name: c.name,
  value: c.value,
  domain: c.domain,
  path: c.path || '/',
  expires: c.expires,
  secure: c.secure,
  httpOnly: c.httpOnly,
  sameSite: c.sameSite,
}))

await fs.writeFile(out, JSON.stringify({ exportedAt: new Date().toISOString(), cookies: slim }, null, 2), { mode: 0o600 })
console.log(`exported ${slim.length} cookies -> ${out}`)
console.log('names:', slim.map((c) => c.name).sort().join(', '))
const auth = slim.filter((c) => /^(sessionid|sessionid_ss|sid_tt|sid_guard)$/.test(c.name))
console.log(`auth cookies present: ${auth.length ? auth.map((c) => c.name).join(', ') : 'NONE'}`)
process.exit(0)
