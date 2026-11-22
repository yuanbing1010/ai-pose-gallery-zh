/**
 * 下载流程分步调试：滚动 / 坐标 / 悬停 / 按钮 每一步都打印状态。
 *
 *   node scripts/dreamina-bridge/download-debug.mjs <图片URL>
 */

const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')
const imgUrl = process.argv[2]
if (!imgUrl) { console.error('usage: node download-debug.mjs <imgUrl>'); process.exit(1) }

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json()
const cdp = await new CDP(ver.webSocketDebuggerUrl).open()
const { targetInfos } = await cdp.send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page' && /dreamina/.test(t.url || ''))
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await cdp.send('Runtime.enable', {}, sessionId)

const ev = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sessionId)
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || r.exceptionDetails.text }
  return r.result.value
}

const hash = (imgUrl.match(/([0-9a-f]{32})~/i) || [])[1] || ''
const pick = `(() => {
  const h = ${JSON.stringify(hash)};
  const list = [...document.querySelectorAll('img')].filter(e => /dreamina-sign/.test(e.currentSrc || e.src || ''));
  const src = (e) => (e.currentSrc || e.src || '');
  const area = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.width * r.height); };
  const same = list.filter(e => h ? src(e).includes(h) : src(e) === ${JSON.stringify(imgUrl)});
  const visible = same.filter(e => area(e) > 20000).sort((a, b) => area(b) - area(a));
  return visible[0] || same.sort((a, b) => area(b) - area(a))[0] || null;
})()`

console.log('1) visibility:', await ev('document.visibilityState'))
console.log('2) before scroll:', JSON.stringify(await ev(`(() => { const el = ${pick}; if (!el) return { found: false }; const r = el.getBoundingClientRect(); return { found: true, w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }; })()`)))

console.log('3) scroll:', JSON.stringify(await ev(`(() => { const el = ${pick}; if (!el) return { ok: false }; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return { ok: true }; })()`)))
await sleep(700)

const rect = await ev(`(() => { const el = ${pick}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), y0: Math.round(r.y) }; })()`)
console.log('4) after scroll rect:', JSON.stringify(rect))
if (!rect) process.exit(2)

await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', buttons: 0 }, sessionId)
await sleep(200)
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', buttons: 0 }, sessionId)
await sleep(1200)

console.log('5) after hover:', JSON.stringify(await ev(`(() => {
  const dl = [...document.querySelectorAll('[aria-label="Download"]')];
  const allAria = [...document.querySelectorAll('[aria-label]')]
    .filter(e => e.getClientRects().length > 0)
    .map(e => e.getAttribute('aria-label'))
    .filter(a => /download|save|export|upscale|edit|remix|more/i.test(a));
  return { downloadCount: dl.length, dlRects: dl.map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }), relevantAria: [...new Set(allAria)].slice(0, 15) };
})()`)))

console.log('6) element at hover point:', JSON.stringify(await ev(`(() => {
  const el = document.elementFromPoint(${rect.x}, ${rect.y});
  if (!el) return null;
  return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), aria: el.getAttribute('aria-label') || '' };
})()`)))

process.exit(0)
