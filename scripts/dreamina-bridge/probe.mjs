/**
 * 诊断脚本：直连 CDP，检查 dreamina 生成页的真实 DOM，并验证提示词写入是否生效。
 *
 *   node scripts/dreamina-bridge/probe.mjs
 *   set DREAMINA_CDP_URL=http://127.0.0.1:9222 && node scripts/dreamina-bridge/probe.mjs
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

const testText = process.env.PROBE_PROMPT || 'bridge probe: a red paper lantern on a stone bridge'
const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json()
const cdp = await new CDP(ver.webSocketDebuggerUrl).open()
const { targetInfos } = await cdp.send('Target.getTargets')
console.log('TARGETS:', targetInfos.filter((t) => t.type === 'page').map((t) => t.url))
const page = targetInfos.find((t) => t.type === 'page' && /dreamina/.test(t.url || '')) || targetInfos.find((t) => t.type === 'page')
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await cdp.send('Runtime.enable', {}, sessionId)

const run = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sessionId)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

console.log('DOM:', JSON.stringify(await run(`(() => {
  const vis = (el) => el.getClientRects().length > 0;
  const q = (sel) => Array.from(document.querySelectorAll(sel));
  return {
    href: location.href,
    textareas: q('textarea').map((e) => e.getAttribute('aria-label')),
    promptEditables: q('[contenteditable="true"]').filter(vis).map((e) => ({ aria: e.getAttribute('aria-label'), cls: (e.className || '').toString().slice(0, 40) })),
    submit: q('[data-testid="dreamina.generator.submit"]').map((e) => ({ vis: vis(e), disabled: e.disabled })),
    signIn: /sign in|log in/i.test((document.body.innerText || '').slice(0, 3000)),
  };
})()`), null, 2))

console.log('SET_PROMPT:', JSON.stringify(await run(`(() => {
  const text = ${JSON.stringify(testText)};
  const pick = (sel) => Array.from(document.querySelectorAll(sel)).filter((el) => el.getClientRects().length > 0);
  const pm = pick('[aria-label="Prompt"][contenteditable="true"]')[0] || pick('[contenteditable="true"]')[0];
  if (!pm) return { ok: false, reason: 'no-prompt-input' };
  pm.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(pm);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch {}
  if (!ok) { pm.textContent = text; pm.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })); }
  return { ok: true, execCommand: ok, len: (pm.innerText || pm.textContent || '').length, text: (pm.innerText || '').slice(0, 120) };
})()`), null, 2))

console.log('AFTER:', JSON.stringify(await run(`(() => {
  const b = Array.from(document.querySelectorAll('[data-testid="dreamina.generator.submit"]')).find((e) => e.getClientRects().length > 0);
  return { submitDisabled: b ? b.disabled : null, bodyText: (document.body.innerText || '').slice(0, 200) };
})()`), null, 2))

if (process.env.PROBE_CLICK === '1') {
  console.log('CLICK:', JSON.stringify(await run(`(() => {
    const b = Array.from(document.querySelectorAll('[data-testid="dreamina.generator.submit"]')).find((e) => e.getClientRects().length > 0);
    if (!b) return { ok: false, reason: 'no-button' };
    if (b.disabled) return { ok: false, reason: 'disabled' };
    b.click();
    return { ok: true };
  })()`), null, 2))
  await new Promise((r) => setTimeout(r, 4000))
  console.log('AFTER_CLICK:', JSON.stringify(await run(`(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="login"]'))
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => (e.innerText || '').replace(/\\s+/g, ' ').slice(0, 120));
    return { href: location.href, dialogs: dialogs.slice(0, 4), body: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 300) };
  })()`), null, 2))
}

process.exit(0)
