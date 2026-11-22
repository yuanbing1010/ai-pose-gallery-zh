const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')

let expression
if (process.argv[2] === '--file') {
  const fs = await import('node:fs/promises')
  expression = await fs.readFile(process.argv[3], 'utf8')
} else {
  expression = process.argv[2]
}
if (!expression) {
  console.error('usage: node cdp_eval.mjs "<js expression>" | node cdp_eval.mjs --file <path.js>')
  process.exit(1)
}

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
await cdp.send('Runtime.enable', {}, sessionId)

const res = await cdp.send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true,
}, sessionId)

if (res.exceptionDetails) {
  console.error('EXCEPTION:', res.exceptionDetails.exception?.description || res.exceptionDetails.text)
  process.exit(3)
}
console.log(JSON.stringify(res.result.value, null, 2))
process.exit(0)
