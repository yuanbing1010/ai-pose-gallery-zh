/**
 * 悬停探测：把真实鼠标移到结果图上，等浮层渲染后列出按钮。
 * 用途：定位「下载」「编辑/图生图」等只在 hover 时出现的控件。
 *
 *   node scripts/dreamina-bridge/hover-probe.mjs
 */

const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')

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

const evalJs = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

const rect = await evalJs(`(() => {
  const imgs = [...document.querySelectorAll('img')].filter(e => /dreamina-sign/.test(e.currentSrc || e.src || '') && e.naturalWidth >= 300);
  const img = imgs[0];
  if (!img) return null;
  const r = img.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, nw: img.naturalWidth, nh: img.naturalHeight };
})()`)

if (!rect) { console.error('no result image'); process.exit(3) }
console.log('image rect:', rect)

// 先把鼠标移开，再移到图中心，确保触发 enter 而不是一直停在上面
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', buttons: 0 }, sessionId)
await new Promise((r) => setTimeout(r, 250))
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(rect.x), y: Math.round(rect.y), button: 'none', buttons: 0 }, sessionId)
await new Promise((r) => setTimeout(r, 1200))

const controls = await evalJs(`(() => {
  const imgs = [...document.querySelectorAll('img')].filter(e => /dreamina-sign/.test(e.currentSrc || e.src || '') && e.naturalWidth >= 300);
  const img = imgs[0];
  if (!img) return { error: 'gone' };
  // 找到承载这条消息的较大容器（向上 8 层），列出其中所有可见控件
  let box = img;
  for (let i = 0; i < 8 && box.parentElement; i++) box = box.parentElement;
  const btns = [...box.querySelectorAll('button,[role="button"],a')]
    .filter(b => b.getClientRects().length > 0)
    .map(b => ({
      aria: b.getAttribute('aria-label') || '',
      title: b.title || '',
      txt: (b.innerText || '').trim().slice(0, 20),
      tid: b.getAttribute('data-testid') || '',
      href: b.getAttribute('href') || '',
    }));
  const fileInputs = [...document.querySelectorAll('input[type=file]')].map(i => ({ accept: i.accept, multiple: i.multiple }));
  return { boxText: (box.innerText || '').replace(/\\s+/g, ' ').slice(0, 200), btns: btns.slice(0, 25), fileInputs };
})()`)

console.log(JSON.stringify(controls, null, 2))
process.exit(0)
