/**
 * 网络捕获：钩住页面里的 fetch / XHR，重新加载会话，收集接口返回。
 * 目的：找到生成结果里的「原图 URL」（预览图是 aigc_resize_mark 变体，原图 URL 只能从接口数据里拿）。
 *
 *   node scripts/dreamina-bridge/net-capture.mjs [要筛选的资源哈希]
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')
const filterHash = process.argv[2] || ''
const outPath = path.join(os.tmpdir(), `dreamina-net-${Date.now()}.json`)

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

const HOOK = `(() => {
  if (window.__DMNET) return;
  const rec = [];
  Object.defineProperty(window, '__DMNET', { value: rec, writable: false });
  const push = (entry) => { if (rec.length < 400) rec.push(entry); };
  const isApi = (u) => typeof u === 'string' && u.indexOf('/api/') !== -1;

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const p = origFetch.apply(this, arguments);
    if (isApi(url)) {
      const body = init && init.body ? String(init.body).slice(0, 4000) : '';
      p.then((res) => {
        res.clone().text().then((text) => {
          push({ kind: 'fetch', url, reqBody: body, status: res.status, text: text.slice(0, 200000) });
        }).catch(() => {});
      }).catch(() => {});
    }
    return p;
  };

  const OrigXHR = window.XMLHttpRequest;
  const open = OrigXHR.prototype.open;
  const send = OrigXHR.prototype.send;
  OrigXHR.prototype.open = function (method, url) {
    this.__dmUrl = url;
    this.__dmMethod = method;
    return open.apply(this, arguments);
  };
  OrigXHR.prototype.send = function (body) {
    const self = this;
    if (isApi(self.__dmUrl)) {
      self.addEventListener('load', () => {
        let text = '';
        try { text = String(self.responseText || '').slice(0, 200000); } catch {}
        push({ kind: 'xhr', url: self.__dmUrl, reqBody: body ? String(body).slice(0, 4000) : '', status: self.status, text });
      });
    }
    return send.apply(this, arguments);
  };
})()`

const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json()
const cdp = await new CDP(ver.webSocketDebuggerUrl).open()
const { targetInfos } = await cdp.send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page' && /dreamina/.test(t.url || ''))
if (!page) { console.error('no dreamina tab'); process.exit(2) }
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await cdp.send('Page.enable', {}, sessionId)
await cdp.send('Runtime.enable', {}, sessionId)

// 注入到「下次文档加载」，然后刷新，确保钩子早于应用代码
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK }, sessionId)
console.log('hook installed, reloading...')
await cdp.send('Page.reload', { ignoreCache: false }, sessionId)
await sleep(15000)

const dump = await cdp.send('Runtime.evaluate', {
  expression: `JSON.stringify((window.__DMNET || []).map(e => ({ kind: e.kind, url: e.url, status: e.status, len: (e.text || '').length })))`,
  returnByValue: true,
}, sessionId)
const list = JSON.parse(dump.result.value || '[]')
console.log(`captured ${list.length} api calls`)
for (const e of list.slice(0, 30)) console.log(`  ${e.status} ${e.len.toString().padStart(7)}  ${e.url.slice(0, 110)}`)

// 取回完整记录并落盘，再按哈希筛 URL
const full = await cdp.send('Runtime.evaluate', {
  expression: `JSON.stringify(window.__DMNET || [])`,
  returnByValue: true,
}, sessionId)
await fs.writeFile(outPath, full.result.value || '[]')
console.log(`saved -> ${outPath}`)

const entries = JSON.parse(full.result.value || '[]')
const urls = new Set()
for (const e of entries) {
  const text = e.text || ''
  if (filterHash && !text.includes(filterHash)) continue
  for (const m of text.matchAll(/https?:\\?\/\\?\/[^"'\\\\\s]+/g)) {
    let u = m[0].replace(/\\\//g, '/')
    if (/dreamina-sign|capcutcdn|tiktokcdn/.test(u)) urls.add(u.slice(0, 300))
  }
}
console.log(`\nurls mentioning ${filterHash || '(all)'}: ${urls.size}`)
for (const u of [...urls].slice(0, 25)) {
  const kind = /aigc_resize_mark/.test(u) ? 'preview' : 'OTHER  '
  console.log(`  ${kind} ${u.slice(0, 160)}`)
}
process.exit(0)
