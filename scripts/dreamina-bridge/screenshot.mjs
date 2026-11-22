/**
 * 截屏：把当前 Dreamina 标签页的画面存成 PNG，用于确认页面实际渲染状态。
 *
 *   node scripts/dreamina-bridge/screenshot.mjs [输出路径]
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')
const out = process.argv[2] || path.join(os.tmpdir(), `dreamina-${Date.now()}.png`)

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

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
await fs.writeFile(out, Buffer.from(shot.data, 'base64'))
console.log(out)
process.exit(0)
