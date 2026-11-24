#!/usr/bin/env node
/**
 * Dreamina 浏览器桥（零依赖）
 *
 * 用你本机「已登录 Dreamina 的 Chrome」当签名与执行环境，把网页能力包装成
 * 与现有厂商通道同构的「提交 -> 轮询 -> 取图」HTTP API，供 Cloudflare Worker 调用。
 *
 * 为什么不直接重放 HTTP：
 *   dreamina.capcut.com 的 /api 请求由页面内的 Argus/bdms SDK 现签（sign / a_bogus /
 *   device_time / web_id），签名与时间戳、设备指纹绑定，拷贝一次 URL 很快过期，且
 *   非浏览器 TLS 指纹会被风控。因此这里让请求始终发生在真实页面上下文里。
 *
 * 依赖：Node 20+（使用全局 WebSocket / fetch），无需 npm install。
 *
 * 启动：
 *   chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\dreamina-bridge-profile"
 *   （在该窗口登录 dreamina.capcut.com 一次，之后保持开着）
 *   set DREAMINA_BRIDGE_TOKEN=dev-secret && node scripts/dreamina-bridge/bridge.mjs
 */

import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.DREAMINA_BRIDGE_PORT || 8790)
const TOKEN = process.env.DREAMINA_BRIDGE_TOKEN || ''
const CDP_HTTP = (process.env.DREAMINA_CDP_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '')
const PAGE_URL = process.env.DREAMINA_PAGE_URL || 'https://dreamina.capcut.com/ai-tool/ai-image'
const JOB_TIMEOUT_MS = Number(process.env.DREAMINA_JOB_TIMEOUT_MS || 310000)
const IMAGE_TIMEOUT_MS = Number(process.env.DREAMINA_IMAGE_TIMEOUT_MS || 280000)
const MAX_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.DREAMINA_MAX_CONCURRENCY || 2)))
// 空闲超时后关闭多余标签并将主标签停泊到 about:blank，避免软件渲染空转吃满 CPU（0 表示禁用）
const IDLE_PARK_MS = Math.max(0, Number(process.env.DREAMINA_IDLE_PARK_MS ?? 120000))
// 优先通过 CDP/页面网络响应直取无损原图 URL（aigc_resize:0:0），仅在抓包未命中时回退到页面「下载」动作
const DOWNLOAD_DIR = process.env.DREAMINA_DOWNLOAD_DIR || path.join(os.tmpdir(), 'dreamina-bridge-downloads')

let chromeChild = null
const activeJobs = new Set()
const queuedJobIds = new Set()
let submitBusy = false
let submitOwnerJobId = null

/** @type {Map<string, { url: string, priority: number, ts: number }>} */
const capturedOriginals = new Map()
/** @type {Set<string>} */
const claimedAssetHashes = new Set()
/** @type {Map<string, Set<string>>} */
const assetRecordIds = new Map()

// ---------------------------------------------------------------- CDP client

class CDP {
  #ws
  #nextId = 1
  #pending = new Map()
  #listeners = new Map()

  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.alive = false
  }

  on(method, fn) {
    let set = this.#listeners.get(method)
    if (!set) {
      set = new Set()
      this.#listeners.set(method, set)
    }
    set.add(fn)
    return () => {
      set.delete(fn)
      if (set.size === 0) this.#listeners.delete(method)
    }
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      this.#ws = ws
      const fail = (e) => reject(new Error(`CDP 连接失败：${e?.message || 'unknown'}`))
      ws.addEventListener('open', () => {
        this.alive = true
        resolve(this)
      }, { once: true })
      ws.addEventListener('error', fail, { once: true })
      ws.addEventListener('close', () => {
        // Chrome 被关闭/重启后，旧连接必须作废，否则后续请求会挂在死 socket 上
        this.alive = false
        for (const { reject: no } of this.#pending.values()) no(new Error('CDP 连接已断开'))
        this.#pending.clear()
        this.#listeners.clear()
      })
      ws.addEventListener('message', (ev) => {
        let msg
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
        } catch {
          return
        }
        if (msg.id && this.#pending.has(msg.id)) {
          const { resolve: ok, reject: no } = this.#pending.get(msg.id)
          this.#pending.delete(msg.id)
          if (msg.error) no(new Error(`${msg.error.message || 'CDP error'}`))
          else ok(msg.result)
          return
        }
        if (msg.method) {
          const listeners = this.#listeners.get(msg.method)
          if (listeners) {
            for (const fn of listeners) {
              try {
                fn(msg.params || {}, msg.sessionId || null)
              } catch {}
            }
          }
        }
      })
    })
  }

  send(method, params = {}, sessionId) {
    if (!this.alive) return Promise.reject(new Error('CDP 连接不可用'))
    const id = this.#nextId++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      const timer = setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id)
          reject(new Error(`CDP 超时：${method}`))
        }
      }, 45000)
      timer.unref?.()
      this.#ws.send(JSON.stringify(payload))
    })
  }

  close() {
    try {
      this.#ws?.close()
    } catch {}
  }
}

/** 连接浏览器 WebSocket 端点（Chrome 有独立实例与共享实例两种，先试 /json/version） */
async function connectBrowser() {
  const res = await fetch(`${CDP_HTTP}/json/version`)
  if (!res.ok) throw new Error(`无法读取 ${CDP_HTTP}/json/version (HTTP ${res.status})`)
  const info = await res.json()
  const wsUrl = info.webSocketDebuggerUrl
  if (!wsUrl) {
    throw new Error(
      '未找到 webSocketDebuggerUrl：请用 --remote-debugging-port 启动 Chrome，并确认没有使用默认用户目录（Chrome 136+ 会禁用默认目录的调试端口）。'
    )
  }
  const cdp = await new CDP(wsUrl).open()
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch(() => {})
  // 让「下载」动作直接落到固定目录，桥自己去取文件（浏览器级命令，不需要 sessionId）
  await cdp
    .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR, eventsEnabled: true })
    .catch(() => {})
  return { cdp, version: info.Browser || '' }
}

async function snapshotDownloads() {
  try {
    return new Set(await fs.readdir(DOWNLOAD_DIR))
  } catch {
    return new Set()
  }
}

/** 等目录里出现新文件，并等它大小稳定（Chrome 先写 .crdownload 再改名） */
async function waitForNewDownload(before, timeout = 60000) {
  const started = Date.now()
  let prevSize = -1
  while (Date.now() - started < timeout) {
    await sleep(250)
    let names = []
    try {
      names = await fs.readdir(DOWNLOAD_DIR)
    } catch {
      continue
    }
    const fresh = names.filter((n) => !before.has(n) && !n.endsWith('.crdownload') && !n.endsWith('.tmp'))
    if (!fresh.length) continue
    const file = path.join(DOWNLOAD_DIR, fresh[0])
    const st = await fs.stat(file).catch(() => null)
    if (!st || st.size === 0) continue
    if (st.size === prevSize) return { file, size: st.size }
    prevSize = st.size
  }
  return null
}

function extractAssetHash(rawUrl) {
  const m = String(rawUrl || '').match(/([0-9a-f]{32})~/i)
  return m ? m[1].toLowerCase() : null
}

function classifyOriginalPriority(rawUrl) {
  const s = String(rawUrl || '')
  if (/aigc_resize:0:0\b/i.test(s)) return 4
  if (/aigc_resize:4096:4096\b/i.test(s)) return 3
  if (/aigc_resize:2400:2400\b/i.test(s)) return 2
  if (/aigc_resize:2048:2048\b/i.test(s)) return 1
  return 0
}

function recordCapturedOriginal(rawUrl, priorityHint = 0, tsHint = Date.now()) {
  const url = String(rawUrl || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  const hash = extractAssetHash(url)
  if (!hash) return null
  const prio = priorityHint || classifyOriginalPriority(url)
  if (prio <= 0) return null
  const prev = capturedOriginals.get(hash)
  if (!prev || prio >= prev.priority) {
    // 刷新 LRU 位置并保留最高清（0:0 优先于 4096/2400/2048）
    if (prev) capturedOriginals.delete(hash)
    capturedOriginals.set(hash, { url, priority: prio, ts: tsHint })
    if (capturedOriginals.size > 500) {
      const oldestKey = capturedOriginals.keys().next().value
      if (oldestKey) capturedOriginals.delete(oldestKey)
    }
  }
  return hash
}

function claimAssetHash(hash) {
  if (!hash) return
  claimedAssetHashes.add(hash)
  if (claimedAssetHashes.size > 1000) {
    const oldest = claimedAssetHashes.values().next().value
    if (oldest) claimedAssetHashes.delete(oldest)
  }
}

/** 从已解析 JSON 中递归采集原图 URL 与所属 record/submit id（避免正文转义 \u0026 截断） */
function extractOriginalsFromParsedJson(root, contextRecordIds = new Set(), depth = 0, outHashes = [], outRecordIds = new Set()) {
  if (!root || depth > 14) return { hashes: outHashes, recordIds: outRecordIds }
  if (typeof root === 'string') {
    if (root.includes('aigc_resize:') && /dreamina/i.test(root)) {
      const h = recordCapturedOriginal(root)
      if (h) {
        outHashes.push(h)
        if (contextRecordIds.size) {
          let set = assetRecordIds.get(h)
          if (!set) {
            set = new Set()
            assetRecordIds.set(h, set)
          }
          for (const rid of contextRecordIds) set.add(rid)
          if (assetRecordIds.size > 600) {
            const oldestKey = assetRecordIds.keys().next().value
            if (oldestKey) assetRecordIds.delete(oldestKey)
          }
        }
      }
    }
    return { hashes: outHashes, recordIds: outRecordIds }
  }
  if (Array.isArray(root)) {
    for (const item of root) {
      extractOriginalsFromParsedJson(item, contextRecordIds, depth + 1, outHashes, outRecordIds)
    }
    return { hashes: outHashes, recordIds: outRecordIds }
  }
  if (typeof root === 'object') {
    const localIds = new Set(contextRecordIds)
    for (const key of ['history_record_id', 'submit_id', 'record_id', 'history_id', 'task_id', 'aigc_history_id']) {
      const v = root[key]
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim()
        if (s.length >= 6 && s !== '0') {
          localIds.add(s)
          outRecordIds.add(s)
        }
      }
    }
    for (const v of Object.values(root)) {
      extractOriginalsFromParsedJson(v, localIds, depth + 1, outHashes, outRecordIds)
    }
  }
  return { hashes: outHashes, recordIds: outRecordIds }
}

const INPAGE_ORIG_HOOK = `(() => {
  if (window.__DM_ORIG_HOOK_INSTALLED__) return;
  window.__DM_ORIG_HOOK_INSTALLED__ = true;
  const store = (window.__DM_CAPTURED_ORIG = window.__DM_CAPTURED_ORIG || Object.create(null));
  const prioOf = (u) => {
    if (/aigc_resize:0:0\\b/i.test(u)) return 4;
    if (/aigc_resize:4096:4096\\b/i.test(u)) return 3;
    if (/aigc_resize:2400:2400\\b/i.test(u)) return 2;
    if (/aigc_resize:2048:2048\\b/i.test(u)) return 1;
    return 0;
  };
  const scan = (val, d) => {
    if (!val || d > 12) return;
    if (typeof val === 'string') {
      if (val.includes('aigc_resize:') && /dreamina/i.test(val)) {
        const m = val.match(/([0-9a-f]{32})~/i);
        const p = prioOf(val);
        if (m && p > 0) {
          const h = m[1].toLowerCase();
          const prev = store[h];
          if (!prev || p >= prev.p) store[h] = { url: val, p, ts: Date.now() };
        }
      }
      return;
    }
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) scan(val[i], d + 1);
      return;
    }
    if (typeof val === 'object') {
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) scan(val[k], d + 1);
      }
    }
  };
  const inspectText = (txt) => {
    if (!txt || txt.length > 4194304 || !txt.includes('aigc_resize:')) return;
    try { scan(JSON.parse(txt), 0); } catch {}
  };
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const ct = (res.headers && res.headers.get('content-type')) || '';
        if (/json/i.test(ct)) res.clone().text().then(inspectText).catch(() => {});
      } catch {}
      return res;
    };
  }
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        if ((!this.responseType || this.responseType === 'text') && typeof this.responseText === 'string') {
          inspectText(this.responseText);
        } else if (this.responseType === 'json' && this.response) {
          scan(this.response, 0);
        }
      } catch {}
    });
    return origSend.apply(this, args);
  };
})()`

function installCdpNetworkCapture(cdp, findTabBySessionId) {
  const pending = new Map()
  cdp.on('Network.responseReceived', (params, sessionId) => {
    if (!sessionId || !params?.requestId) return
    const type = params.type
    if (type !== 'XHR' && type !== 'Fetch') return
    const resp = params.response
    if (!resp || resp.status < 200 || resp.status >= 400) return
    if (!/json/i.test(resp.mimeType || '')) return
    if (!/dreamina|capcut/i.test(resp.url || '')) return
    const key = `${sessionId}:${params.requestId}`
    pending.set(key, { sessionId, requestId: params.requestId, reqUrl: resp.url || '' })
    if (pending.size > 400) {
      const oldest = pending.keys().next().value
      if (oldest) pending.delete(oldest)
    }
  })

  cdp.on('Network.loadingFinished', async (params, sessionId) => {
    if (!sessionId || !params?.requestId) return
    const key = `${sessionId}:${params.requestId}`
    const item = pending.get(key)
    if (!item) return
    pending.delete(key)
    const bodyRes = await cdp.send('Network.getResponseBody', { requestId: item.requestId }, sessionId).catch(() => null)
    if (!bodyRes?.body) return
    const text = bodyRes.base64Encoded
      ? Buffer.from(bodyRes.body, 'base64').toString('utf8')
      : String(bodyRes.body)
    if (!text || text.length > 4 * 1024 * 1024) return
    const isGenerateCall = /aigc_draft\/generate|generate_image|aigc\/generate/i.test(item.reqUrl)
    if (!isGenerateCall && !text.includes('aigc_resize:')) return
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }
    const extracted = extractOriginalsFromParsedJson(parsed)
    if (isGenerateCall && extracted.recordIds.size) {
      const slot = findTabBySessionId(sessionId)
      if (slot) {
        for (const rid of extracted.recordIds) slot.expectedRecordIds.add(rid)
      }
    }
  })
}

async function syncInPageOriginals(session) {
  const captured = await session.eval('window.__DM_CAPTURED_ORIG || null').catch(() => null)
  if (!captured || typeof captured !== 'object') return 0
  let count = 0
  for (const entry of Object.values(captured)) {
    if (entry && typeof entry.url === 'string') {
      if (recordCapturedOriginal(entry.url, Number(entry.p) || 0, Number(entry.ts) || Date.now())) {
        count += 1
      }
    }
  }
  return count
}

function detectImageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' }
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: '.png', mime: 'image/png' }
  }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' }
  }
  return null
}

async function tryFetchCapturedOriginal(hash) {
  const entry = capturedOriginals.get(hash)
  if (!entry?.url) return null
  let parsed
  try {
    parsed = new URL(entry.url)
  } catch {
    capturedOriginals.delete(hash)
    return null
  }
  if (!isAllowedDreaminaCdnHost(parsed.hostname) || isPrivateHost(parsed.hostname)) {
    capturedOriginals.delete(hash)
    return null
  }
  const t0 = Date.now()
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        referer: 'https://dreamina.capcut.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      console.warn(`[dreamina-bridge] direct-fetch missed hash=${hash} status=${res.status}, fallback to UI`)
      if (res.status === 403 || res.status === 404 || res.status === 410) {
        capturedOriginals.delete(hash)
      }
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const info = detectImageInfo(buf)
    if (!info) {
      console.warn(`[dreamina-bridge] direct-fetch invalid image bytes hash=${hash}, fallback to UI`)
      capturedOriginals.delete(hash)
      return null
    }
    console.log(
      `[dreamina-bridge] download direct hash=${hash} prio=${entry.priority} bytes=${buf.length} ms=${Date.now() - t0}`
    )
    return { buf, ext: info.ext, mime: info.mime, priority: entry.priority }
  } catch (err) {
    console.warn(`[dreamina-bridge] direct-fetch error hash=${hash}: ${err?.message || err}, fallback to UI`)
    return null
  }
}

/**
 * 兜底 UI 原图下载：当网络抓包未拿到 0:0 原图或 CDN URL 失效时，走页面悬停「下载」动作。
 * 下载按钮只在真实鼠标悬停后才渲染，所以必须派发 Input.dispatchMouseEvent。
 */
async function downloadOriginal(session, imgUrl) {
  const target = JSON.stringify(imgUrl)
  await ensureForeground(session)
  // 同一张图在页面上有多个副本，URL 的尺寸/签名参数不同，但资源哈希一致（.../tx/<32位hash>~tplv-...）。
  // 按哈希匹配才不会下错图。
  const hashMatch = String(imgUrl).match(/([0-9a-f]{32})~/i)
  const hash = JSON.stringify(hashMatch ? hashMatch[1] : '')
  const pick = `(() => {
    const list = [...document.querySelectorAll('img')].filter(e => /dreamina-sign/.test(e.currentSrc || e.src || ''));
    const area = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.width * r.height); };
    const src = (e) => (e.currentSrc || e.src || '');
    const h = ${hash};
    const sameAsset = (e) => h ? src(e).includes(h) : src(e) === ${target};
    const visible = list.filter(e => e.getClientRects().length > 0 && area(e) > 20000);
    const hit = visible.filter(sameAsset).sort((a, b) => area(b) - area(a))[0];
    if (hit) return hit;
    const hiddenHit = list.filter(sameAsset).sort((a, b) => area(b) - area(a))[0];
    if (hiddenHit) return hiddenHit;
    return visible.sort((a, b) => area(b) - area(a))[0] || list[list.length - 1] || null;
  })()`

  // 图片节点常被虚拟列表塌成 0x0，真正有尺寸的是它的卡片祖先。悬停/查找都基于卡片。
  const boxPick = `(() => {
    const el = ${pick};
    if (!el) return null;
    let box = el;
    for (let i = 0; i < 8 && box.parentElement; i++) {
      const r = box.getBoundingClientRect();
      if (r.width > 200 && r.height > 200) break;
      box = box.parentElement;
    }
    return box;
  })()`

  // 刚出图时结果容器常常还没渲染（节点 0x0），刷新一次就能正常显示。
  const visible = await session.eval(`(() => {
    const el = ${pick};
    if (!el) return { ok: false, reason: 'missing' };
    const r = el.getBoundingClientRect();
    return { ok: r.width > 80 && r.height > 80, w: Math.round(r.width), h: Math.round(r.height) };
  })()`)
  if (!visible?.ok) {
    await session.cdp.send('Page.reload', { ignoreCache: false }, session.sessionId)
    await sleep(5000)
    await waitFor(async () => {
      const st = await session
        .eval(`({ ready: document.readyState, hasBody: !!document.body })`)
        .catch(() => null)
      return st?.ready === 'complete' && st.hasBody ? st : null
    }, { timeout: 45000, interval: 1000, label: 'reload-after-generation' }).catch(() => {})
    await sleep(2500)
  }

  // 1) 滚动「图片本身」。滚外层容器没用——容器本来就在视口里，图却可能停在视口上方。
  const scrolled = await session.eval(`(() => {
    const el = ${pick};
    if (!el) return { ok: false };
    el.scrollIntoView({ block: 'center', behavior: 'instant', inline: 'nearest' });
    return { ok: true };
  })()`)
  if (!scrolled?.ok) throw new Error('页面上找不到该结果图')
  await sleep(300)

  // 2) 优先用图片自身坐标；节点被塌成 0x0 时退回到有尺寸的卡片祖先
  const rect = await session.eval(`(() => {
    const el = ${pick};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width > 80 && r.height > 80) {
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), via: 'img' };
    }
    let box = el;
    for (let i = 0; i < 8 && box.parentElement; i++) {
      const rr = box.getBoundingClientRect();
      if (rr.width > 200 && rr.height > 200) break;
      box = box.parentElement;
    }
    const br = box.getBoundingClientRect();
    return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2), w: Math.round(br.width), h: Math.round(br.height), via: 'box' };
  })()`)
  if (!rect) throw new Error('结果图不在视口内')
  if (rect.w < 80 || rect.h < 80) throw new Error(`结果卡片尺寸异常：${rect.w}x${rect.h}`)

  // 3) 真实鼠标悬停（按钮只在 hover 后渲染）
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', buttons: 0 }, session.sessionId)
  await sleep(100)
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', buttons: 0 }, session.sessionId)
  await sleep(450)

  // 4) 点下载：先在该图所属容器里找，找不到再全局找可见的那个
  const before = await snapshotDownloads()
  const clicked = await session.eval(`(() => {
    const box = ${boxPick};
    if (!box) return { ok: false, reason: 'image gone' };
    const visible = (b) => b.getClientRects().length > 0;
    // 下载控件不一定是 <button>，按 aria-label 找任意元素
    let btn = [...box.querySelectorAll('[aria-label="Download"]')].find(visible);
    if (!btn) btn = [...document.querySelectorAll('[aria-label="Download"]')].find(visible);
    if (!btn) return { ok: false, reason: 'no-download-button' };
    btn.click();
    return { ok: true, tag: btn.tagName };
  })()`)
  if (!clicked?.ok) throw new Error(`点击下载失败：${clicked?.reason || 'unknown'}`)

  // 首次下载会弹「Remove AI watermarks」偏好弹窗，点 Save preference 才会真正开始下载。
  // 偏好存过一次后不再出现，这里做成「有就点、没有就跳过」。
  await sleep(200)
  await session
    .eval(`(() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(e => e.getClientRects().length > 0);
      if (!dlg) return { ok: false, reason: 'no-dialog' };
      const btn = [...dlg.querySelectorAll('button')].find(b => /save preference/i.test(b.innerText || ''));
      if (!btn) return { ok: false, reason: 'no-save-button' };
      btn.click();
      return { ok: true };
    })()`)
    .catch(() => {})

  const got = await waitForNewDownload(before)
  if (!got) throw new Error('等待下载超时')
  return got
}

// ------------------------------------------------------------------ page glue

const COLLECT_IMAGES = `(() => {
  // 结果区是虚拟列表：图片滚出/滚入视口才会挂载或卸载。先判断尺寸差再读样式，避免全页 3000+ 节点强制重排。
  const scrolled = [];
  for (const el of document.querySelectorAll('div,section,main')) {
    if (el.scrollHeight <= el.clientHeight + 40) continue;
    const st = getComputedStyle(el);
    if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
      el.scrollTop = el.scrollHeight;
      scrolled.push(el.scrollHeight);
    }
  }
  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
  }

  const out = [];
  const seen = new Set();
  const push = (url, w, h) => {
    if (!url || seen.has(url)) return;
    if (!/^https?:/i.test(url)) return;
    // 只收「生成结果」：dreamina-sign 素材域，或路径带 aigc 标记。
    // tiktokcdn 上的 banner/推广图会混进来（实测抓到过 4080x459 的横幅），必须排除。
    if (!(/dreamina/i.test(url) || /aigc/i.test(url))) return;
    if (/\\.svg$/i.test(url)) return;
    if (/avatar|icon|logo|emoji|badge|sprite|login|qrcode|banner|promo/i.test(url)) return;
    // 极端长宽比基本是横幅/装饰条，不是出图
    if (w > 0 && h > 0 && (w / h > 3.5 || h / w > 3.5)) return;
    seen.add(url);
    out.push({ url, w: w || 0, h: h || 0 });
  };
  for (const el of document.querySelectorAll('img')) {
    if (el.closest('[aria-label="Prompt"], [contenteditable="true"], [class*="reference"], [class*="record-header"], [class*="workspace-list"]')) continue;
    const rect = el.getBoundingClientRect();
    if (Math.max(rect.width, rect.height) < 180 || Math.min(rect.width, rect.height) < 120) continue;
    const w = el.naturalWidth || rect.width || 0;
    const h = el.naturalHeight || rect.height || 0;
    // Dreamina 结果卡片对 3:4 / 9:16 会返回 aigc_resize:360:360.webp（如 270x360、202x360），不能用双边 >= 300 拦截
    if (Math.max(w, h) < 260 || Math.min(w, h) < 140) continue;
    push(el.currentSrc || el.src, w, h);
  }
  if (out.length === 0) {
    for (const el of document.querySelectorAll('div,section,a')) {
      if (el.clientWidth < 300 || el.clientHeight < 300) continue;
      const bg = getComputedStyle(el).backgroundImage || '';
      if (!bg || bg === 'none') continue;
      const m = bg.match(/url\\(["']?(https?:[^"')]+)/i);
      if (!m) continue;
      push(m[1], el.clientWidth, el.clientHeight);
    }
  }
  return out;
})()`

const SET_PROMPT = (text) => `(() => {
  const text = ${JSON.stringify(text)};
  const pick = (sel) => Array.from(document.querySelectorAll(sel)).filter((el) => el.getClientRects().length > 0);
  // 真实输入框是 tiptap / ProseMirror 的 contenteditable，不是 textarea
  const pm = pick('[aria-label="Prompt"][contenteditable="true"]')[0] || pick('[contenteditable="true"]')[0];
  if (pm) {
    pm.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(pm);
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch {}
    if (!ok) {
      pm.textContent = text;
      pm.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
    return { ok: true, kind: 'prosemirror', len: (pm.innerText || pm.textContent || '').length };
  }
  const el = pick('textarea[aria-label="Prompt"]')[0] || pick('textarea')[0] || pick('input[aria-label="Prompt"]')[0];
  if (!el) return { ok: false, reason: 'no-prompt-input' };
  el.focus();
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { ok: true, kind: 'form', tag: el.tagName, len: (el.value || '').length };
})()`

const SUBMIT_STATE = `(() => {
  const list = Array.from(document.querySelectorAll('[data-testid="dreamina.generator.submit"]'));
  const btn = list.find((b) => b.getClientRects().length > 0) || list[0];
  if (!btn) return { found: false };
  return {
    found: true,
    disabled: btn.disabled === true || btn.getAttribute('aria-disabled') === 'true',
    busy: btn.getAttribute('aria-busy') === 'true',
    label: btn.getAttribute('aria-label') || '',
  };
})()`

const CLICK_SUBMIT = `(() => {
  const list = Array.from(document.querySelectorAll('[data-testid="dreamina.generator.submit"]'));
  const btn = list.find((b) => b.getClientRects().length > 0) || list[0];
  if (!btn) return { ok: false, reason: 'no-submit-button' };
  if (btn.disabled) return { ok: false, reason: 'submit-disabled' };
  btn.click();
  return { ok: true };
})()`

/** 一次性向参考图槽位批量拖放参考图：按 DataTransfer 顺序并行上传、零重复胶囊，提速显著 */
const DROP_BATCH_REFS_B64 = (items) => `(() => {
  const items = ${JSON.stringify(items)};
  const target = document.querySelector('[class*="reference-group"]');
  if (!target) return { ok: false, reason: 'no-reference-group' };
  const dt = new DataTransfer();
  let added = 0;
  for (const it of items) {
    try {
      const bin = atob(it.b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      dt.items.add(new File([arr], it.name, { type: it.type }));
      added++;
    } catch {}
  }
  if (!added) return { ok: false, reason: 'no-file' };
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  return { ok: true, added };
})()`

/** 把参考图贴进提示词区域（仅作找不到参考图槽位时的兜底）。 */
const PASTE_IMAGES_B64 = (items) => `(async () => {
  const items = ${JSON.stringify(items)};
  const el = Array.from(document.querySelectorAll('[aria-label="Prompt"][contenteditable="true"], [contenteditable="true"]'))
    .find((n) => n.getClientRects().length > 0) || document.body;
  const dt = new DataTransfer();
  let added = 0;
  for (const it of items) {
    try {
      const bin = atob(it.b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      dt.items.add(new File([arr], it.name, { type: it.type }));
      added++;
    } catch {}
  }
  if (!added) return { ok: false, reason: 'no-file' };
  el.focus();
  if (el !== document.body) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // 必须 bubbles: false：Dreamina 在编辑器与外层容器都绑了 paste 监听，冒泡会让每张图被重复贴两次
  el.dispatchEvent(new ClipboardEvent('paste', { bubbles: false, cancelable: true, clipboardData: dt }));
  return { ok: true, added };
})()`

// ----------------------------------------------------------------- job runner

/** @type {Map<string, {id:string,status:string,createdAt:number,updatedAt:number,prompt:string,images:any[],error?:string,stage?:string,workspaceUrl?:string|null,tabId?:string|null}>} */
const jobs = new Map()

function createSemaphore(limit) {
  let running = 0
  const waiters = []
  return async function run(fn) {
    if (running < limit) {
      running += 1
    } else {
      await new Promise((resolve) => waiters.push(resolve))
    }
    try {
      return await fn()
    } finally {
      const next = waiters.shift()
      if (next) {
        // 直接交接名额，running 保持不变，防止微任务间隙被插队超限
        next()
      } else {
        running = Math.max(0, running - 1)
      }
    }
  }
}

const jobSemaphore = createSemaphore(MAX_CONCURRENCY)
const submitSemaphore = createSemaphore(1)

async function withSubmitLock(ownerId, fn) {
  return submitSemaphore(async () => {
    submitBusy = true
    submitOwnerJobId = ownerId || null
    try {
      return await fn()
    } finally {
      submitBusy = false
      submitOwnerJobId = null
    }
  })
}

class Session {
  constructor(cdp, sessionId, targetId = null) {
    this.cdp = cdp
    this.sessionId = sessionId
    this.targetId = targetId
  }

  async eval(expression) {
    const res = await this.cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      this.sessionId
    )
    if (res.exceptionDetails) {
      const msg = res.exceptionDetails.exception?.description || res.exceptionDetails.text || '页面脚本异常'
      throw new Error(msg.split('\n')[0])
    }
    return res.result?.value
  }

  async navigate(url) {
    await this.cdp.send('Page.navigate', { url }, this.sessionId)
  }

  /** 读取浏览器实际持有的 Cookie（HttpOnly 也能拿到），用于判断登录态 */
  async cookies() {
    await this.cdp.send('Network.enable', {}, this.sessionId)
    const { cookies } = await this.cdp.send('Network.getAllCookies', {}, this.sessionId)
    return cookies || []
  }

  /** 以 sessionid / sid_tt 是否存在作为登录判据，比匹配页面文案可靠 */
  async isLoggedIn() {
    const list = await this.cookies()
    return list.some(
      (c) => /capcut|dreamina/i.test(c.domain) && (c.name === 'sessionid' || c.name === 'sid_tt') && c.value
    )
  }
}

async function waitUntilDreaminaReady(session) {
  const href = await session.eval('location.href').catch(() => '')
  if (!/dreamina\.capcut\.com/.test(String(href || ''))) {
    await session.navigate(PAGE_URL)
  }
  // 等到 SPA 水合完 Prompt 与 Model 控件（不仅看 readyState === complete），避免随后 ensureCleanAiImagePage 重复二次导航
  await waitFor(async () => {
    const state = await session
      .eval(`({
        href: location.href,
        ready: document.readyState,
        hasBody: !!document.body,
        hasPrompt: !![...document.querySelectorAll('[contenteditable="true"]')].find(e => e.getAttribute('aria-label') === 'Prompt' && e.getClientRects().length > 0),
        hasModel: !![...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0),
      })`)
      .catch(() => null)
    if (!state?.href?.includes('dreamina.capcut.com') || state.ready !== 'complete' || !state.hasBody) return null
    if (state.href.includes('/ai-tool/ai-image') && (!state.hasPrompt || !state.hasModel)) return null
    return state
  }, { timeout: 60000, interval: 400, label: 'dreamina-page-ready' })
}

async function attachTargetAsSlot(cdp, targetId, slotIndex) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const session = new Session(cdp, sessionId, targetId)
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Network.enable', {}, sessionId)
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INPAGE_ORIG_HOOK }, sessionId).catch(() => {})
  await waitUntilDreaminaReady(session)
  await session.eval(INPAGE_ORIG_HOOK).catch(() => {})
  return {
    id: `tab-${slotIndex}`,
    targetId,
    sessionId,
    session,
    busy: false,
    parked: false,
    jobId: null,
    prewarmTimer: null,
    lastUsedAt: Date.now(),
    expectedRecordIds: new Set(),
  }
}

async function waitFor(fn, { timeout = 30000, interval = 700, label = 'condition' } = {}) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeout) {
    last = await fn()
    if (last) return last
    await sleep(interval)
  }
  throw new Error(`等待超时：${label}`)
}

/**
 * 把 Chrome 窗口拉到系统前台。
 * 只激活标签页（Page.bringToFront）不够：窗口被别的窗口压住时 CSS :hover 不生效，
 * 「下载」这类悬停浮层永远不渲染。这里用 user32 真正激活窗口。
 */
function focusChromeWindow() {
  if (process.platform !== 'win32') return Promise.resolve()
  const title = (process.env.DREAMINA_WINDOW_TITLE || 'Dreamina').replace(/'/g, "''")
  const ps = [
    "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h,int c);'",
    `$p = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*${title}*' } | Select-Object -First 1`,
    'if ($p) { [W.U]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [W.U]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }',
  ].join('; ')
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 15000 }, () => resolve())
  })
}

/** 关掉挡路的浮层。全新 profile 首次访问会弹 Seedream 宣传弹窗，不关掉后续全都会卡住。 */
const DISMISS_OVERLAYS = `(() => {
  let closed = 0;
  const click = (el) => {
    const target = (el.closest && el.closest('button')) || el;
    if (typeof target.click === 'function') target.click();
    else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  };
  const dialogs = document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="popup"],[class*="guide"]');
  for (const d of dialogs) {
    if (d.getClientRects().length === 0) continue;
    const btn = [...d.querySelectorAll('button,[role="button"],[aria-label]')].find((b) => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      const t = (b.innerText || '').trim();
      return a === 'close' || a === 'dismiss' || /^(×|✕|x|✗)$/i.test(t);
    });
    if (btn) {
      click(btn);
      closed++;
    }
  }
  return closed;
})()`

async function dismissOverlays(session) {
  const closed = await session.eval(DISMISS_OVERLAYS).catch(() => 0)
  if (closed) await sleep(600)
  return closed
}

/**
 * 把标签页提到前台。后台标签的 visibilityState 是 hidden，Chrome 不渲染 hover 浮层，
 * 「下载」这类只在悬停时出现的按钮就永远拿不到——必须先把页签激活。
 */
async function ensureForeground(session) {
  const wasVisible = await session.eval('document.visibilityState === "visible"').catch(() => false)
  if (!wasVisible) {
    if (session.targetId) {
      await session.cdp.send('Target.activateTarget', { targetId: session.targetId }).catch(() => {})
    }
    await session.cdp.send('Page.bringToFront', {}, session.sessionId).catch(() => {})
    await focusChromeWindow()
    await waitFor(
      async () => {
        const v = await session.eval('document.visibilityState').catch(() => null)
        return v === 'visible' ? v : null
      },
      { timeout: 15000, interval: 300, label: 'tab-visible' }
    ).catch(() => {})
    await sleep(200)
  }
  await dismissOverlays(session)
}

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) {
    return true
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [, a, b] = m.map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  return /^(fc|fd|fe8|fe9|fea|feb)/i.test(h)
}

function isAllowedDreaminaCdnHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return /(^|\.)(capcutcdn(?:-us)?|dreamina|bytedance|ibyteimg|byteimg|byteoversea)\.(com|net)$/i.test(h) || /capcutcdn|dreamina/i.test(h)
}

async function loadRefImageItem(rawUrl, idx) {
  const src = String(rawUrl || '').trim()
  if (!src) return null
  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/i)
    if (!match) return null
    const ct = match[1].toLowerCase()
    const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png'
    return { name: `图${idx + 1}.${ext}`, type: ct, b64: match[2].replace(/\s+/g, '') }
  }
  const parsed = new URL(src)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (process.env.DREAMINA_ALLOW_PRIVATE_REF !== '1' && isPrivateHost(parsed.hostname)) {
    return null
  }
  const r = await fetch(parsed.toString(), {
    headers: {
      referer: 'https://dreamina.capcut.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    },
    signal: AbortSignal.timeout(25000),
  })
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  const ct = (r.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase()
  const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png'
  return { name: `图${idx + 1}.${ext}`, type: ct, b64: buf.toString('base64') }
}

const COLLECT_PAGE_ERROR_TEXTS = `(() => {
  return [...document.querySelectorAll('[role="alert"], [role="status"], [class*="toast"], [class*="error"], [class*="modal"], [role="dialog"]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => (el.innerText || '').replace(/\\s+/g, ' ').trim())
    .filter((t) => /violat|prohibit|moderation|nsfw|couldn.?t generate|unusual activity|insufficient|credit|shark|failed to generate|try again later|违规|敏感|审核|积分不足|余额不足|请求频繁/i.test(t))
    .map((t) => t.slice(0, 220));
})()`

function mapDreaminaUiModelLabel(rawModel) {
  const m = String(rawModel || '').trim().toLowerCase()
  if (!m) return null
  if (m.includes('5.0-pro') || m.includes('5.0 pro') || m === 'seedream-5-0-pro') return 'Seedream 5.0 Pro'
  if (m.includes('5.0-flash') || m.includes('5.0 flash') || m === 'seedream-5-0-flash') return 'Seedream 5.0 Flash'
  if (m.includes('5.5')) return 'Seedream 5.5'
  if (m.includes('gpt-image-2.5-flare')) return 'GPT Image 2.5 Flare'
  if (m.includes('gpt-image-2.5-sunburst')) return 'GPT Image 2.5 Sunburst'
  if (m.includes('nano-banana-pro') || m.includes('nanobananapro')) return 'Nano Banana Pro'
  return null
}

async function ensureSingleImageCount(session) {
  await session
    .eval(`(async () => {
      const getBtn = () => [...document.querySelectorAll('button,[aria-label]')].find(e => (e.getAttribute('aria-label') || '').startsWith('Images to generate') && e.getClientRects().length > 0);
      const isPopoverOpen = () => [...document.querySelectorAll('.lv-popover-content')].some(e => e.getClientRects().length > 0);
      const b = getBtn();
      if (!b) return { ok: false, reason: 'no-btn' };
      const aria = b.getAttribute('aria-label') || '';
      if (aria !== 'Images to generate: 1') {
        if (!isPopoverOpen()) {
          b.click();
          await new Promise(r => setTimeout(r, 350));
        }
        const radio1 = [...document.querySelectorAll('.lv-popover-content label.lv-radio')].find(e => e.getClientRects().length > 0 && (e.innerText || '').trim() === '1');
        if (radio1) {
          radio1.click();
          const input = radio1.querySelector('input');
          if (input) input.click();
          await new Promise(r => setTimeout(r, 200));
        }
      }
      if (isPopoverOpen()) {
        b.click();
        await new Promise(r => setTimeout(r, 200));
      }
      return { ok: true, aria: getBtn()?.getAttribute('aria-label') || '' };
    })()`)
    .catch(() => null)
}

async function ensureModelSelected(session, rawModel) {
  const targetLabel = mapDreaminaUiModelLabel(rawModel)
  if (!targetLabel) return

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await session
      .eval(`(async () => {
        const target = ${JSON.stringify(targetLabel.toLowerCase())};
        // 先关闭可能残留的张数 popover，避免遮挡或吞掉点击
        const countBtn = [...document.querySelectorAll('button,[aria-label]')].find(e => (e.getAttribute('aria-label') || '').startsWith('Images to generate') && e.getClientRects().length > 0);
        if (countBtn && [...document.querySelectorAll('.lv-popover-content')].some(e => e.getClientRects().length > 0)) {
          countBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        const getModelBtn = () => [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0);
        const b = getModelBtn();
        if (!b) return { ok: false, reason: 'no-model-btn' };
        const cur = (b.innerText || '').replace(/\\s+/g, ' ').trim();
        if (cur.toLowerCase().startsWith(target)) {
          return { ok: true, cur, switched: false };
        }
        const isPopupOpen = () => [...document.querySelectorAll('li.lv-select-option, [role="option"]')].some(e => e.getClientRects().length > 0);
        if (!isPopupOpen()) {
          b.click();
          await new Promise(r => setTimeout(r, 400));
        }
        const opt = [...document.querySelectorAll('li.lv-select-option, [role="option"]')].find(e => {
          if (e.getClientRects().length === 0) return false;
          const t = (e.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          return t.startsWith(target);
        });
        if (!opt) {
          if (isPopupOpen()) b.click();
          return { ok: false, reason: 'option-not-found', cur };
        }
        opt.scrollIntoView({ block: 'nearest' });
        opt.click();
        await new Promise(r => setTimeout(r, 350));
        const after = (getModelBtn()?.innerText || '').replace(/\\s+/g, ' ').trim();
        return { ok: after.toLowerCase().startsWith(target), cur, after, switched: true };
      })()`)
      .catch(() => null)

    if (res?.ok) return
    if (res?.reason === 'option-not-found' && attempt === 2) {
      throw new Error(`Dreamina 页面暂不支持所选模型：${targetLabel}`)
    }
    await sleep(400)
  }
}

function normalizeDreaminaRatio(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s || s === 'auto') return 'Auto'
  if (/^(1:1|3:4|4:3|9:16|16:9|2:3|3:2|21:9)$/.test(s)) return s
  return null
}

function normalizeDreaminaResolution(raw, rawModel) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return null
  const isPro = /5\.0[-_\s]?pro/i.test(String(rawModel || ''))
  if (s === '1k') return isPro ? '1K' : '1.5K'
  if (s === '1.5k') return '1.5K'
  if (s === '2k') return '2K'
  if (s === '4k') return '4K'
  return null
}

async function ensureRatioAndResolution(session, rawRatio, rawResolution, rawModel) {
  const targetRatio = normalizeDreaminaRatio(rawRatio)
  const targetRes = normalizeDreaminaResolution(rawResolution, rawModel)
  if (!targetRatio && !targetRes) return

  await session
    .eval(`(async () => {
      const targetRatio = ${JSON.stringify(targetRatio)};
      const targetRes = ${JSON.stringify(targetRes)};
      const getBtn = () => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && /ratio|1:1|3:4|4:3|9:16|16:9|2:3|3:2|21:9|\\b(?:1|1\\.5|2|4)k\\b/i.test(b.innerText || ''));
      const btn = getBtn();
      if (!btn) return { ok: false, reason: 'no-ratio-btn' };
      const curText = (btn.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const ratioMatched = !targetRatio || (targetRatio === 'Auto' ? curText.includes('auto') : curText.includes(targetRatio.toLowerCase()));
      const resMatched = !targetRes || curText.includes(targetRes.toLowerCase());
      if (ratioMatched && resMatched) return { ok: true, skipped: true };

      const isOpen = () => [...document.querySelectorAll('.lv-popover-content')].some((e) => e.getClientRects().length > 0);
      if (!isOpen()) {
        btn.click();
        await new Promise((r) => setTimeout(r, 280));
      }
      const pop = [...document.querySelectorAll('.lv-popover-content')].find((e) => e.getClientRects().length > 0);
      if (!pop) return { ok: false, reason: 'no-popover' };
      const clickOpt = (txt) => {
        const span = [...pop.querySelectorAll('span, div, label, button')].find((e) => e.children.length === 0 && e.getClientRects().length > 0 && (e.innerText || '').trim().toLowerCase() === txt.toLowerCase());
        if (!span) return false;
        (span.closest('label, button, [role="radio"], [class*="option"]') || span).click();
        return true;
      };
      if (targetRatio && !ratioMatched) {
        clickOpt(targetRatio);
        await new Promise((r) => setTimeout(r, 120));
      }
      if (targetRes && !resMatched) {
        clickOpt(targetRes);
        await new Promise((r) => setTimeout(r, 120));
      }
      if (isOpen()) {
        btn.click();
        await new Promise((r) => setTimeout(r, 120));
      }
      return { ok: true, text: getBtn()?.innerText || '' };
    })()`)
    .catch(() => null)
}

async function ensureCleanAiImagePage(session) {
  const editorState = await session
    .eval(`(() => ({
      href: location.href,
      blobs: document.querySelectorAll('img[src^="blob:"]').length,
      refs: document.querySelectorAll('img[alt*="ref"], [class*="attach"] img, [class*="reference"] img').length,
      hasPrompt: !![...document.querySelectorAll('[contenteditable="true"]')].find(e => e.getAttribute('aria-label') === 'Prompt' && e.getClientRects().length > 0),
      hasModel: !![...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0),
    }))()`)
    .catch(() => null)
  const onAiImageWithoutAttachments =
    editorState &&
    String(editorState.href || '').includes('/ai-tool/ai-image') &&
    editorState.blobs === 0 &&
    editorState.refs === 0
  if (onAiImageWithoutAttachments && editorState.hasPrompt && editorState.hasModel) {
    return
  }
  if (onAiImageWithoutAttachments) {
    // 已经在干净 /ai-tool/ai-image 但 SPA 尚在水合时先等就绪，避免白白重刷丢掉前几秒加载进度
    const mounted = await waitFor(async () => {
      const ok = await session
        .eval(`!![...document.querySelectorAll('[contenteditable="true"]')].find(e => e.getAttribute('aria-label') === 'Prompt' && e.getClientRects().length > 0) && !![...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0)`)
        .catch(() => false)
      return ok ? true : null
    }, { timeout: 22000, interval: 400, label: 'ai-image-hydrate' }).catch(() => false)
    if (mounted) {
      await dismissOverlays(session)
      return
    }
  }
  await session.navigate(PAGE_URL)
  await sleep(500)
  await waitFor(async () => {
    const ok = await session
      .eval(`!![...document.querySelectorAll('[contenteditable="true"]')].find(e => e.getAttribute('aria-label') === 'Prompt' && e.getClientRects().length > 0) && !![...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0)`)
      .catch(() => false)
    return ok ? true : null
  }, { timeout: 45000, interval: 400, label: 'ai-image-page-ready' })
  await dismissOverlays(session)
}

function cancelTabPrewarm(tab) {
  if (tab?.prewarmTimer) {
    clearTimeout(tab.prewarmTimer)
    tab.prewarmTimer = null
  }
}

function cancelAllPrewarms() {
  for (const tab of tabPool) cancelTabPrewarm(tab)
}

function scheduleTabPrewarm(tab, delayMs = 500) {
  if (!tab) return
  cancelTabPrewarm(tab)
  tab.prewarmTimer = setTimeout(async () => {
    tab.prewarmTimer = null
    if (tab.busy || !tabPool.includes(tab) || !cachedBrowser?.cdp?.alive) return
    tab.busy = true
    tab.jobId = '__prewarm__'
    try {
      await ensureCleanAiImagePage(tab.session)
    } catch {
      // 预热失败不影响下次请求兜底导航
    } finally {
      tab.busy = false
      tab.jobId = null
      tab.lastUsedAt = Date.now()
      notifyTabWaiters()
    }
  }, delayMs)
  tab.prewarmTimer.unref?.()
}

function isOwnedByOtherActiveTab(hash, currentTab) {
  if (!hash || activeJobs.size <= 1) return false
  const rids = assetRecordIds.get(hash)
  if (!rids || !rids.size) return false
  for (const rid of rids) {
    if (currentTab.expectedRecordIds.has(rid)) return false
  }
  for (const other of tabPool) {
    if (other === currentTab || !other.busy) continue
    for (const rid of rids) {
      if (other.expectedRecordIds.has(rid)) return true
    }
  }
  return false
}

function filterFreshImages(imgs, baselineUrls, tab) {
  return (imgs || []).filter((img) => {
    if (!img?.url || baselineUrls.has(img.url)) return false
    const hash = extractAssetHash(img.url)
    if (hash && claimedAssetHashes.has(hash)) return false
    if (hash && isOwnedByOtherActiveTab(hash, tab)) return false
    return true
  })
}

async function finalizeJobImages(tab, job, fresh, { touch, stage, t0, tSubmit, timedOut = false }) {
  const hashes = fresh.map((img) => extractAssetHash(img.url)).filter(Boolean)
  await syncInPageOriginals(tab.session)
  // 若预览图 DOM 已挂出但大 JSON / aigc_resize:0:0 响应仍在收尾，最多等 1.2s 以免回退慢速 UI 下载
  for (let w = 0; w < 4; w++) {
    const missingOrig = hashes.some((h) => (capturedOriginals.get(h)?.priority || 0) < 3)
    if (!missingOrig) break
    await sleep(300)
    await syncInPageOriginals(tab.session)
  }

  const enriched = fresh.map((img) => {
    const hash = extractAssetHash(img.url)
    if (hash) claimAssetHash(hash)
    const orig = hash ? capturedOriginals.get(hash)?.url || null : null
    return { ...img, originalUrl: orig }
  })

  const workspaceUrl = await tab.session.eval('location.href').catch(() => null)
  const origCount = enriched.filter((x) => Boolean(x.originalUrl)).length
  const tDone = Date.now()
  console.log(
    `[dreamina-bridge] job=${job.id} ${timedOut ? 'succeeded(timeout-fallback)' : 'succeeded'} tab=${tab.id} genMs=${tDone - tSubmit} totalMs=${tDone - t0} images=${enriched.length} origCaptured=${origCount}/${enriched.length}`
  )
  touch({
    status: 'succeeded',
    stage,
    images: enriched,
    workspaceUrl,
    tabId: tab.id,
    finishedAt: tDone,
  })
  return { allOriginalsCaptured: origCount > 0 && origCount === enriched.length }
}

async function verifyAndFixToolbar(session, req) {
  const targetModel = mapDreaminaUiModelLabel(req.model)
  const targetRatio = normalizeDreaminaRatio(req.aspect_ratio)
  const targetRes = normalizeDreaminaResolution(req.resolution, req.model)
  const check = await session
    .eval(`(() => {
      const m = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0);
      const c = [...document.querySelectorAll('button,[aria-label]')].find(e => (e.getAttribute('aria-label') || '').startsWith('Images to generate') && e.getClientRects().length > 0);
      const r = [...document.querySelectorAll('button')].find(b => b.getClientRects().length > 0 && /ratio|1:1|3:4|4:3|9:16|16:9|2:3|3:2|21:9|\\b(?:1|1\\.5|2|4)k\\b/i.test(b.innerText || ''));
      return {
        model: m ? (m.innerText || '').replace(/\\s+/g, ' ').trim() : null,
        count: c ? c.getAttribute('aria-label') : null,
        ratioText: r ? (r.innerText || '').replace(/\\s+/g, ' ').trim() : null,
      };
    })()`)
    .catch(() => null)

  const modelOk = !targetModel || (check?.model || '').toLowerCase().startsWith(targetModel.toLowerCase())
  const countOk = check?.count === 'Images to generate: 1'
  const rt = (check?.ratioText || '').toLowerCase()
  const ratioOk = !targetRatio || (targetRatio === 'Auto' ? rt.includes('auto') : rt.includes(targetRatio.toLowerCase()))
  const resOk = !targetRes || rt.includes(targetRes.toLowerCase())

  if (!modelOk) await ensureModelSelected(session, req.model)
  if (!countOk) await ensureSingleImageCount(session)
  if (!ratioOk || !resOk) await ensureRatioAndResolution(session, req.aspect_ratio, req.resolution, req.model)

  if (modelOk && countOk && ratioOk && resOk) {
    return { model: check?.model || null, count: check?.count || null }
  }
  return session
    .eval(`(() => {
      const m = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === 'Model' && e.getClientRects().length > 0);
      const c = [...document.querySelectorAll('button,[aria-label]')].find(e => (e.getAttribute('aria-label') || '').startsWith('Images to generate') && e.getClientRects().length > 0);
      return {
        model: m ? (m.innerText || '').replace(/\\s+/g, ' ').trim() : null,
        count: c ? c.getAttribute('aria-label') : null,
      };
    })()`)
    .catch(() => null)
}

async function runJob(job, req) {
  const touch = (patch) => Object.assign(job, patch, { updatedAt: Date.now() })
  const t0 = Date.now()

  // 1) 参考图下载在提交锁与标签分配之外并发完成，避免慢链阻塞其他任务提交
  let preloadedRefs = []
  let pastedRefCount = 0
  if (Array.isArray(req.ref_images) && req.ref_images.length) {
    touch({ status: 'running', stage: '下载参考图', startedAt: t0 })
    const loadedItems = await Promise.all(
      req.ref_images.slice(0, 6).map((u, i) =>
        loadRefImageItem(u, i).catch(() => null)
      )
    )
    preloadedRefs = loadedItems.filter(Boolean)
    if (!preloadedRefs.length) throw new Error('参考图全部加载失败')
  }
  const tAfterRef = Date.now()

  // 2) 分配一个空闲标签页槽位（最多 MAX_CONCURRENCY 个标签并行等待出图）
  const tab = await acquireTabSlot(job.id)
  const tAfterTab = Date.now()
  activeJobs.add(job.id)
  const session = tab.session
  let tSubmit = Date.now()
  let baselineUrls = new Set()
  const baselineErrCounts = new Map()
  let allOriginalsCaptured = false
  let jobSucceeded = false
  let sawQueueBusy = false

  try {
    // 3) 短锁保护 UI 提交阶段（切前台、清页面、先投参考图并发上传、写词/选参同步推进、点击提交）
    await withSubmitLock(job.id, async () => {
      const tLockGot = Date.now()
      touch({ status: 'running', stage: '检查登录态', startedAt: job.startedAt || t0 })
      await ensureForeground(session)
      if (!(await session.isLoggedIn())) {
        throw new Error('Dreamina 未登录：请在桥窗口（--remote-debugging-port 那个）登录后重试')
      }

      // 每次生图都确保落在干净的 AI Image 页面（避开 /ai-tool/generate 的 AI Agent 对话模式与旧附件/旧报错残留）
      await ensureCleanAiImagePage(session)
      const tAfterClean = Date.now()

      // 先批量触发参考图并发上传，把填词与模型/比例设置重叠进上传耗时窗口内
      if (preloadedRefs.length) {
        touch({ stage: `上传参考图（${preloadedRefs.length} 张）` })
        const batchDrop = await session.eval(DROP_BATCH_REFS_B64(preloadedRefs))
        if (batchDrop?.ok) {
          pastedRefCount = batchDrop.added || preloadedRefs.length
        } else {
          // 找不到参考图槽位时退回贴入输入框
          const filledFirst = await session.eval(SET_PROMPT(req.prompt))
          if (!filledFirst?.ok) throw new Error(`无法写入提示词输入框：${filledFirst?.reason || 'unknown'}`)
          const pasted = await session.eval(PASTE_IMAGES_B64(preloadedRefs))
          if (!pasted?.ok) throw new Error(`参考图上传失败：${batchDrop?.reason || pasted?.reason || 'unknown'}`)
          pastedRefCount = pasted.added || preloadedRefs.length
        }
      }

      touch({ stage: '填写提示词与参数' })
      if (!preloadedRefs.length || pastedRefCount === preloadedRefs.length) {
        const filled = await session.eval(SET_PROMPT(req.prompt))
        if (!filled?.ok) throw new Error(`无法写入提示词输入框：${filled?.reason || 'unknown'}`)
      }

      await ensureModelSelected(session, req.model)
      await ensureSingleImageCount(session)
      await ensureRatioAndResolution(session, req.aspect_ratio, req.resolution, req.model)
      const tAfterFill = Date.now()

      // 采基线（图片与已有错误提示），防止把参考图或历史弹窗误判成本次结果
      const baseline = (await session.eval(COLLECT_IMAGES)) || []
      baselineUrls = new Set(baseline.map((i) => i.url))
      const baselineErrList = (await session.eval(COLLECT_PAGE_ERROR_TEXTS).catch(() => [])) || []
      for (const t of baselineErrList) {
        baselineErrCounts.set(t, (baselineErrCounts.get(t) || 0) + 1)
      }

      touch({ stage: '等待提交按钮可用' })
      await waitFor(async () => {
        const st = await session.eval(SUBMIT_STATE)
        return st?.found && !st.disabled ? st : null
      }, { timeout: 30000, interval: 150, label: 'submit-button-enabled' })

      // 仅在参数漂移时才弹下拉重选，否则单次轻量校验跳过冗余点击
      const uiToolbar = await verifyAndFixToolbar(session, req)
      tSubmit = Date.now()
      tab.expectedRecordIds.clear()
      console.log(
        `[dreamina-bridge] job=${job.id} tab=${tab.id} submit prepMs=${tSubmit - t0} (ref=${tAfterRef - t0} tab=${tAfterTab - tAfterRef} lock=${tLockGot - tAfterTab} clean=${tAfterClean - tLockGot} fill=${tAfterFill - tAfterClean} wait=${tSubmit - tAfterFill}) reqModel=${req.model || 'default'} uiModel="${uiToolbar?.model || ''}" uiCount="${uiToolbar?.count || ''}" refs=${pastedRefCount}`
      )

      touch({ stage: '提交生成' })
      const clicked = await session.eval(CLICK_SUBMIT)
      if (!clicked?.ok) throw new Error(`提交失败：${clicked?.reason || 'unknown'}`)
    })

    // 未登录时页面会弹「Sign in to start creating」，放在提交锁外检查以免阻塞后续任务提交
    await sleep(500)
    const wall = await session.eval(`(() => {
      const visibleDialog = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="login"]'))
        .some((el) => el.getClientRects().length > 0 && /sign in|log in|登录/i.test(el.innerText || ''));
      return { wall: visibleDialog || /sign in to start creating/i.test(document.body?.innerText || '') };
    })()`).catch(() => null)
    if (wall?.wall) {
      throw new Error('Dreamina 会话未登录：请在调试端口对应的 Chrome 窗口登录一次后重试')
    }

    // 4) 释放提交锁后，各标签独立轮询出图结果与页面报错（无须占用前台）
    touch({ stage: '等待出图' })
    let stable = 0
    let lastSig = ''
    const startedAt = job.startedAt || Date.now()
    const deadline = Math.min(startedAt + IMAGE_TIMEOUT_MS, startedAt + JOB_TIMEOUT_MS)
    while (Date.now() < deadline) {
      await sleep(900)
      const imgs = (await session.eval(COLLECT_IMAGES)) || []
      const fresh = filterFreshImages(imgs, baselineUrls, tab)
      if (!fresh.length) {
        const curErrList = (await session.eval(COLLECT_PAGE_ERROR_TEXTS).catch(() => [])) || []
        const curCounts = new Map()
        for (const t of curErrList) curCounts.set(t, (curCounts.get(t) || 0) + 1)
        let newErr = null
        for (const [t, cnt] of curCounts.entries()) {
          if (cnt > (baselineErrCounts.get(t) || 0)) {
            newErr = t
            break
          }
        }
        if (newErr) {
          throw new Error(`Dreamina 页面提示失败：${newErr}`)
        }
        const queueBusy = await session
          .eval(`/too many people are generating/i.test((document.body?.innerText || '').slice(0, 8000))`)
          .catch(() => false)
        if (queueBusy) {
          sawQueueBusy = true
        }
      }
      const sig = fresh.map((i) => i.url).sort().join('|')
      if (fresh.length && sig === lastSig) {
        stable += 1
        if (stable >= 1) {
          const fin = await finalizeJobImages(tab, job, fresh, { touch, stage: '完成', t0, tSubmit })
          allOriginalsCaptured = fin.allOriginalsCaptured
          jobSucceeded = true
          return
        }
      } else {
        stable = 0
        lastSig = sig
        touch({
          stage: !fresh.length && sawQueueBusy
            ? '即梦排队拥堵中（Too many people are generating）'
            : `出图中（已捕获 ${fresh.length} 张）`,
        })
      }
    }
    const imgs = (await session.eval(COLLECT_IMAGES)) || []
    const fresh = filterFreshImages(imgs, baselineUrls, tab)
    if (fresh.length) {
      const fin = await finalizeJobImages(tab, job, fresh, { touch, stage: '完成（超时兜底）', t0, tSubmit, timedOut: true })
      allOriginalsCaptured = fin.allOriginalsCaptured
      jobSucceeded = true
      return
    }
    if (sawQueueBusy) {
      throw new Error('即梦服务器拥堵排队超时（Too many people are generating），请稍后重试或切换 Seedream 5.0 Flash')
    }
    throw new Error('等待出图超时：页面未出现新的图片资源')
  } finally {
    activeJobs.delete(job.id)
    releaseTabSlot(tab)
    // 成功且抓包直取或任务失败时立即重置回干净生成页；仅成功但未抓到原图时保留 20s 现场给 UI 兜底下载
    scheduleTabPrewarm(tab, jobSucceeded && !allOriginalsCaptured ? 20000 : 500)
  }
}

/** 把一组 Cookie 注入当前浏览器（服务化部署靠它接管登录态） */
async function injectCookies(session, list) {
  await session.cdp.send('Network.enable', {}, session.sessionId)
  let injected = 0
  for (const c of list) {
    const host = String(c.domain || '').replace(/^\./, '')
    if (!host || !c.name) continue
    const params = {
      name: c.name,
      value: String(c.value ?? ''),
      // 必须带 domain：否则 .capcut.com 的 sessionid 会变成 capcut.com 的 host-only cookie，
      // 永远不会发给 dreamina.capcut.com，表现为「cookie 在、但没登录」。
      domain: c.domain,
      url: `${c.secure === false ? 'http' : 'https'}://${host}${c.path || '/'}`,
      path: c.path || '/',
      secure: c.secure !== false,
      httpOnly: Boolean(c.httpOnly),
      sameSite: c.sameSite || 'Lax',
    }
    if (c.expires && c.expires > 0) params.expires = c.expires
    const r = await session.cdp.send('Network.setCookie', params, session.sessionId).catch(() => null)
    if (r?.success) injected++
  }
  return injected
}

/**
 * 容器/服务器部署时由桥自己拉起 Chromium（本机开发时通常手动开、不开这个）。
 * 关掉后台节流是硬要求：否则页面不渲染，hover 浮层与出图都会失效。
 */
async function launchChromeIfNeeded() {
  if (!process.env.DREAMINA_LAUNCH_CHROME) return
  const bin =
    process.env.DREAMINA_CHROME_BIN ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'chromium')
  const profileDir = process.env.DREAMINA_PROFILE_DIR || path.join(os.tmpdir(), 'dreamina-profile')
  await fs.mkdir(profileDir, { recursive: true }).catch(() => {})
  // 清理异常退出留下的锁文件，避免重启时拒绝使用同一 profile
  for (const lockName of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    await fs.unlink(path.join(profileDir, lockName)).catch(() => {})
  }
  const port = new URL(CDP_HTTP).port || '9222'
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--window-size=1440,1080',
  ]
  if (process.env.DREAMINA_HEADLESS === '1') args.push('--headless=new', '--disable-gpu')
  args.push(PAGE_URL)

  const child = spawn(bin, args, { stdio: 'ignore' })
  chromeChild = child
  child.on('error', (err) => console.error(`[dreamina-bridge] 启动浏览器失败：${err.message}`))
  child.unref?.()

  for (let i = 0; i < 120; i++) {
    await sleep(500)
    try {
      const r = await fetch(`${CDP_HTTP}/json/version`)
      if (r.ok) {
        console.log(`[dreamina-bridge] 浏览器已就绪：${bin}`)
        return
      }
    } catch {}
  }
  throw new Error('浏览器启动后调试端口未就绪')
}

let cachedBrowser = null // { cdp, version, connectedAt }
/** @type {Array<{id:string,targetId:string,sessionId:string,session:Session,busy:boolean,parked:boolean,jobId:string|null,prewarmTimer:any,lastUsedAt:number,expectedRecordIds:Set<string>}>} */
const tabPool = []
const tabWaiters = []
let browserInitPromise = null
const poolOpLock = createSemaphore(1)

function notifyTabWaiters() {
  while (tabWaiters.length) {
    const next = tabWaiters.shift()
    if (next) next()
  }
}

function resetBrowserState() {
  cancelAllPrewarms()
  try { cachedBrowser?.cdp?.close() } catch {}
  cachedBrowser = null
  tabPool.length = 0
  notifyTabWaiters()
}

async function ensureBrowser(force = false) {
  if (!force && cachedBrowser?.cdp?.alive && tabPool.length > 0) {
    return cachedBrowser
  }
  if (!force && browserInitPromise) {
    return browserInitPromise
  }
  browserInitPromise = (async () => {
    if (force) resetBrowserState()
    if (!cachedBrowser?.cdp?.alive) {
      tabPool.length = 0
      const { cdp, version } = await connectBrowser()
      installCdpNetworkCapture(cdp, (sid) => tabPool.find((t) => t.sessionId === sid) || null)
      cachedBrowser = { cdp, version, connectedAt: Date.now() }
    }
    if (tabPool.length === 0) {
      const { targetInfos } = await cachedBrowser.cdp.send('Target.getTargets')
      const existing = targetInfos.filter((t) => t.type === 'page' && /dreamina\.capcut\.com/.test(t.url || ''))
      // 清理上次遗留的多余标签，保证池规模不超过 MAX_CONCURRENCY
      for (const extra of existing.slice(MAX_CONCURRENCY)) {
        await cachedBrowser.cdp.send('Target.closeTarget', { targetId: extra.targetId }).catch(() => {})
      }
      let firstTargetId = existing[0]?.targetId
      if (!firstTargetId) {
        const created = await cachedBrowser.cdp.send('Target.createTarget', { url: PAGE_URL })
        firstTargetId = created.targetId
        await sleep(1500)
      }
      const slot = await attachTargetAsSlot(cachedBrowser.cdp, firstTargetId, 0)
      tabPool.push(slot)
    }
    return cachedBrowser
  })().finally(() => {
    browserInitPromise = null
  })
  return browserInitPromise
}

async function acquireTabSlot(ownerId, preferredTabId = null) {
  for (;;) {
    const browser = await ensureBrowser()
    const acquired = await poolOpLock(async () => {
      const idleCandidates = tabPool.filter((t) => !t.busy)
      if (preferredTabId) {
        idleCandidates.sort((a, b) => (a.id === preferredTabId ? -1 : b.id === preferredTabId ? 1 : a.lastUsedAt - b.lastUsedAt))
      } else {
        idleCandidates.sort((a, b) => a.lastUsedAt - b.lastUsedAt)
      }
      for (const slot of idleCandidates) {
        const alive = await slot.session.eval('1').catch(() => null)
        if (alive === 1) {
          cancelTabPrewarm(slot)
          slot.busy = true
          slot.parked = false
          slot.jobId = ownerId || null
          return slot
        }
        const idx = tabPool.indexOf(slot)
        if (idx >= 0) tabPool.splice(idx, 1)
      }
      const hasPrewarming = tabPool.some((t) => t.busy && t.jobId === '__prewarm__')
      // 若只是现有标签正在收尾预热（通常仅剩几秒），等它完成直接复用，避免无意义冷开新标签页
      if (!hasPrewarming && tabPool.length < MAX_CONCURRENCY) {
        const { targetInfos } = await browser.cdp.send('Target.getTargets')
        const usedIds = new Set(tabPool.map((t) => t.targetId))
        let target = targetInfos.find(
          (t) => t.type === 'page' && /dreamina\.capcut\.com/.test(t.url || '') && !usedIds.has(t.targetId)
        )
        if (!target) {
          const created = await browser.cdp.send('Target.createTarget', { url: PAGE_URL })
          target = { targetId: created.targetId, url: PAGE_URL }
          await sleep(1200)
        }
        const usedNumbers = new Set(tabPool.map((t) => Number(t.id.replace('tab-', ''))))
        let slotNum = 0
        while (usedNumbers.has(slotNum)) slotNum += 1
        const slot = await attachTargetAsSlot(browser.cdp, target.targetId, slotNum)
        slot.busy = true
        slot.jobId = ownerId || null
        tabPool.push(slot)
        return slot
      }
      return null
    })
    if (acquired) return acquired
    await new Promise((resolve) => tabWaiters.push(resolve))
  }
}

function releaseTabSlot(tab) {
  if (!tab) return
  tab.busy = false
  tab.jobId = null
  tab.lastUsedAt = Date.now()
  notifyTabWaiters()
}

let idleParkInFlight = false
async function parkIdleTabs() {
  if (!IDLE_PARK_MS || idleParkInFlight) return
  if (activeJobs.size > 0 || queuedJobIds.size > 0 || submitBusy) return
  if (!cachedBrowser?.cdp?.alive || tabPool.length === 0) return
  idleParkInFlight = true
  try {
    await poolOpLock(async () => {
      if (activeJobs.size > 0 || queuedJobIds.size > 0 || submitBusy) return
      const now = Date.now()
      // 先关闭多余并发标签，避免突发并发后长期残留多个重型渲染进程
      for (let i = tabPool.length - 1; i >= 1; i--) {
        const slot = tabPool[i]
        if (slot.busy || now - slot.lastUsedAt < IDLE_PARK_MS) continue
        cancelTabPrewarm(slot)
        tabPool.splice(i, 1)
        await cachedBrowser?.cdp?.send('Target.closeTarget', { targetId: slot.targetId }).catch(() => {})
        console.log(`[dreamina-bridge] 空闲回收多余标签 ${slot.id}`)
      }
      const primary = tabPool[0]
      if (primary && !primary.busy && !primary.parked && now - primary.lastUsedAt >= IDLE_PARK_MS) {
        cancelTabPrewarm(primary)
        await primary.session.navigate('about:blank').catch(() => {})
        primary.parked = true
        console.log(`[dreamina-bridge] 主标签 ${primary.id} 空闲停泊到 about:blank`)
      }
    })
  } finally {
    idleParkInFlight = false
  }
}

if (IDLE_PARK_MS > 0) {
  const idleTimer = setInterval(() => {
    void parkIdleTabs().catch(() => {})
  }, 30_000)
  idleTimer.unref?.()
}

/** 在指定或空闲标签上执行维护操作（/v1/collect、/v1/session、兜底 /v1/download） */
async function withIdleTab(ownerId, preferredTabId, fn) {
  const tab = await acquireTabSlot(ownerId, preferredTabId)
  try {
    return await fn(tab)
  } finally {
    releaseTabSlot(tab)
  }
}

/** 启动时按文件注入 Cookie（容器里用 Secret 挂载） */
async function bootstrapCookies() {
  const file = process.env.DREAMINA_COOKIES_FILE
  if (!file) return
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'))
    const list = Array.isArray(raw) ? raw : raw.cookies
    if (!Array.isArray(list) || !list.length) {
      console.warn('[dreamina-bridge] Cookie 文件为空，跳过注入')
      return
    }
    await withIdleTab('__bootstrap__', null, async (tab) => {
      const injected = await injectCookies(tab.session, list)
      await sleep(3000)
      const loggedIn = await tab.session.isLoggedIn().catch(() => false)
      console.log(`[dreamina-bridge] 已注入 Cookie ${injected}/${list.length}，登录态=${loggedIn}`)
    })
  } catch (err) {
    console.error(`[dreamina-bridge] Cookie 引导失败：${err.message}`)
  }
}

// ----------------------------------------------------------------- http layer

function json(res, code, body) {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function authorized(req) {
  if (!TOKEN) return true
  const got = req.headers['x-bridge-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return got === TOKEN
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 50 * 1024 * 1024) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  try {
    if (url.pathname === '/health') {
      const runningCount = activeJobs.size
      const queuedCount = queuedJobIds.size
      const activeJobIds = [...activeJobs]
      const busy = runningCount > 0 || queuedCount > 0 || submitBusy
      let page = { ok: false }
      if (busy) {
        // 并发任务或提交执行期间不抢占 CDP/标签，只返回轻量状态
        page = {
          ok: Boolean(cachedBrowser?.cdp?.alive),
          busy: true,
          activeJobId: activeJobIds[0] || null,
          activeJobIds,
        }
      } else {
        try {
          await ensureBrowser()
          const idleTab = tabPool.find((t) => !t.busy) || tabPool[0]
          if (!idleTab) throw new Error('暂无可用标签页')
          if (idleTab.parked && url.searchParams.get('live') !== '1') {
            const href = await idleTab.session.eval('location.href').catch(() => 'about:blank')
            const loggedIn = await idleTab.session.isLoggedIn().catch(() => false)
            page = { ok: true, parked: true, url: href, loggedIn, loginCta: !loggedIn }
          } else {
            const probe = await idleTab.session.eval(`(() => ({
              title: document.title,
              url: location.href,
              hasPrompt: !!document.querySelector('[aria-label="Prompt"][contenteditable="true"], textarea[aria-label="Prompt"], input[aria-label="Prompt"]'),
              hasSubmit: !!document.querySelector('[data-testid="dreamina.generator.submit"]'),
              loginCta: /log in|sign in|登录/i.test((document.body?.innerText || '').slice(0, 4000)),
              modelHint: (document.body?.innerText || '').match(/Seedream\\s*\\d+(\\.\\d+)?(?:\\s*(?:Pro|Flash))?/i)?.[0] || null,
            }))()`)
            const loggedIn = await idleTab.session.isLoggedIn().catch(() => false)
            page = { ok: true, ...probe, loggedIn, loginCta: !loggedIn }
          }
        } catch (err) {
          page = { ok: false, error: err.message }
        }
      }
      return json(res, 200, {
        ok: true,
        bridge: 'dreamina',
        tokenRequired: Boolean(TOKEN),
        chrome: cachedBrowser?.version || null,
        page,
        jobs: jobs.size,
        queueBusy: runningCount >= MAX_CONCURRENCY || queuedCount > 0,
        activeJobId: activeJobIds[0] || null,
        activeJobIds,
        runningCount,
        queuedCount,
        maxConcurrency: MAX_CONCURRENCY,
        submitBusy,
        submitOwnerJobId,
        capturedOriginals: capturedOriginals.size,
        tabs: tabPool.map((t) => ({ id: t.id, busy: t.busy, jobId: t.jobId })),
      })
    }

    if (url.pathname === '/v1/models' && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'invalid token' })
      return json(res, 200, {
        object: 'list',
        data: [
          { id: 'seedream-5.0-flash', object: 'model', owned_by: 'dreamina-bridge' },
          { id: 'seedream-5.0-pro', object: 'model', owned_by: 'dreamina-bridge' },
          { id: 'seedream-5.5', object: 'model', owned_by: 'dreamina-bridge' },
        ],
      })
    }

    if (url.pathname === '/v1/proxy') {
      const target = url.searchParams.get('url')
      if (!target || !/^https?:\/\//i.test(target)) return json(res, 400, { error: 'bad url' })
      // 仅校验 hostname，避免 query/path 绕过成为开放代理
      let targetUrl
      try {
        targetUrl = new URL(target)
      } catch {
        return json(res, 400, { error: 'bad url' })
      }
      if (!isAllowedDreaminaCdnHost(targetUrl.hostname) || isPrivateHost(targetUrl.hostname)) {
        return json(res, 403, { error: 'host not allowed' })
      }
      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          referer: 'https://dreamina.capcut.com/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
        },
        signal: AbortSignal.timeout(30000),
      })
      if (!upstream.ok || !upstream.body) return json(res, 502, { error: `upstream ${upstream.status}` })
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.writeHead(200, {
        'content-type': upstream.headers.get('content-type') || 'image/png',
        'content-length': buf.length,
        'cache-control': 'no-store',
      })
      return res.end(buf)
    }

    if (url.pathname === '/v1/collect') {
      // 调试用：占用空闲标签跑一次「滚动 + 采集」并同步抓包原图，避免与生图抢页面
      if (!authorized(req)) return json(res, 401, { error: 'invalid token' })
      try {
        const images = await withIdleTab('__collect__', null, async (tab) => {
          await waitUntilDreaminaReady(tab.session)
          await syncInPageOriginals(tab.session)
          const raw = (await tab.session.eval(COLLECT_IMAGES)) || []
          await syncInPageOriginals(tab.session)
          return raw.map((img) => {
            const hash = extractAssetHash(img.url)
            return {
              ...img,
              originalUrl: hash ? capturedOriginals.get(hash)?.url || null : null,
            }
          })
        })
        return json(res, 200, { count: images.length, images })
      } catch (err) {
        return json(res, 500, { error: err?.message || 'collect failed' })
      }
    }

    if (url.pathname === '/v1/download') {
      // 取原图：优先用 CDP/页面网络响应直取无损原图（不切窗、不抢锁）；未命中时回退 UI 悬停下载
      if (!authorized(req)) return json(res, 401, { error: 'invalid token' })
      const target = url.searchParams.get('url')
      if (!target || !/^https?:\/\//i.test(target)) return json(res, 400, { error: 'bad url' })
      const hash = extractAssetHash(target)
      if (hash) {
        const direct = await tryFetchCapturedOriginal(hash)
        if (direct) {
          res.writeHead(200, {
            'content-type': direct.mime,
            'content-length': direct.buf.length,
            'cache-control': 'no-store',
            'x-dreamina-source': 'cdp-direct',
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(`dreamina-${hash}${direct.ext}`)}`,
          })
          return res.end(direct.buf)
        }
      }

      const matchedJob = hash
        ? [...jobs.values()].reverse().find((j) =>
            j.images?.some((img) => extractAssetHash(img.url) === hash)
          )
        : null

      try {
        const { buf, ext, filename } = await withIdleTab('__download__', matchedJob?.tabId || null, (tab) =>
          withSubmitLock('__download__', async () => {
            try {
              let got
              try {
                got = await downloadOriginal(tab.session, target)
              } catch (firstErr) {
                if (!/找不到该结果图/.test(firstErr?.message || '') || !matchedJob?.workspaceUrl) {
                  throw firstErr
                }
                const curHref = await tab.session.eval('location.href').catch(() => '')
                if (curHref === matchedJob.workspaceUrl) throw firstErr
                await tab.session.navigate(matchedJob.workspaceUrl)
                await sleep(3000)
                await waitUntilDreaminaReady(tab.session).catch(() => {})
                await sleep(1500)
                got = await downloadOriginal(tab.session, target)
              }
              try {
                const fileBuf = await fs.readFile(got.file)
                return {
                  buf: fileBuf,
                  ext: path.extname(got.file).toLowerCase() || '.bin',
                  filename: path.basename(got.file),
                }
              } finally {
                await fs.unlink(got.file).catch(() => {})
              }
            } finally {
              scheduleTabPrewarm(tab, 300)
            }
          })
        )
        const mime =
          ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'
        res.writeHead(200, {
          'content-type': mime,
          'content-length': buf.length,
          'cache-control': 'no-store',
          'x-dreamina-source': 'ui-download',
          // 即梦的下载文件名是中文，必须用 RFC 5987 编码，不能直接塞进头
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        })
        res.end(buf)
        return
      } catch (err) {
        return json(res, 502, { error: err?.message || 'download failed' })
      }
    }

    if (url.pathname === '/v1/session' && req.method === 'POST') {
      // 运行时注入登录 Cookie：占空闲标签 + 短锁，避免与活跃提交打架
      if (!authorized(req)) return json(res, 401, { error: 'invalid token' })
      const body = await readBody(req)
      const list = Array.isArray(body?.cookies) ? body.cookies : null
      if (!list) return json(res, 400, { error: 'cookies array required' })
      try {
        const result = await withIdleTab('__session__', null, (tab) =>
          withSubmitLock('__session__', async () => {
            const injected = await injectCookies(tab.session, list)
            await tab.session.cdp.send('Page.navigate', { url: PAGE_URL }, tab.session.sessionId).catch(() => {})
            await sleep(7000)
            const loggedIn = await tab.session.isLoggedIn().catch(() => false)
            return { injected, total: list.length, loggedIn }
          })
        )
        return json(res, 200, result)
      } catch (err) {
        return json(res, 500, { error: err?.message || 'inject failed' })
      }
    }

    if (url.pathname === '/v1/images/generations' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'invalid token' })
      const body = await readBody(req)
      const prompt = String(body.prompt || '').trim()
      if (!prompt) return json(res, 400, { error: 'prompt required' })
      const id = `dm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const job = {
        id,
        status: 'queued',
        stage: '排队中',
        prompt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        images: [],
        workspaceUrl: null,
        tabId: null,
      }
      jobs.set(id, job)
      if (jobs.size > 200) {
        const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
        if (oldest && oldest.status !== 'running' && oldest.status !== 'queued') jobs.delete(oldest.id)
      }
      queuedJobIds.add(id)
      jobSemaphore(async () => {
        queuedJobIds.delete(id)
        try {
          await runJob(job, body)
        } catch (err) {
          Object.assign(job, { status: 'failed', error: err.message, stage: '失败', updatedAt: Date.now() })
          if (/CDP|target|session|detached|Cannot find/i.test(err.message) && !cachedBrowser?.cdp?.alive) {
            resetBrowserState()
          }
        }
      })
      return json(res, 202, { id, status: job.status, poll: `/v1/images/generations/${id}` })
    }

    const jobMatch = url.pathname.match(/^\/v1\/images\/generations\/([A-Za-z0-9_-]+)$/)
    if (jobMatch && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'invalid token' })
      const job = jobs.get(jobMatch[1])
      if (!job) return json(res, 404, { error: 'job not found' })
      return json(res, 200, {
        id: job.id,
        status: job.status,
        stage: job.stage,
        error: job.error ?? null,
        images: job.images.map((i) => ({
          url: i.url,
          proxy: `/v1/proxy?url=${encodeURIComponent(i.originalUrl || i.url)}`,
          download: `/v1/download?url=${encodeURIComponent(i.url)}`,
          width: i.w,
          height: i.h,
          originalCaptured: Boolean(i.originalUrl),
        })),
      })
    }

    return json(res, 404, { error: 'not found' })
  } catch (err) {
    return json(res, 500, { error: err?.message || 'internal error' })
  }
})

async function main() {
  await launchChromeIfNeeded().catch((err) => {
    console.error(`[dreamina-bridge] 浏览器拉起失败：${err.message}`)
  })

  const host = process.env.DREAMINA_BRIDGE_HOST || '127.0.0.1'
  server.listen(PORT, host, () => {
    console.log(`[dreamina-bridge] listening on http://${host}:${PORT}`)
    console.log(`[dreamina-bridge] cdp=${CDP_HTTP} page=${PAGE_URL} token=${TOKEN ? 'on' : 'off'} maxConcurrency=${MAX_CONCURRENCY}`)
    if (!TOKEN) console.log('[dreamina-bridge] 警告：未设置 DREAMINA_BRIDGE_TOKEN，仅建议本机使用')
    if (host === '0.0.0.0' && !TOKEN) console.log('[dreamina-bridge] 危险：对 0.0.0.0 监听却没有 token，请立刻设置 DREAMINA_BRIDGE_TOKEN')
    ensureBrowser()
      .then(() => {
        console.log(`[dreamina-bridge] 浏览器已连接：${cachedBrowser?.version || 'ok'}（标签槽 ${tabPool.length}/${MAX_CONCURRENCY}）`)
      })
      .catch((err) => {
        console.error(`[dreamina-bridge] 浏览器未连接：${err.message}`)
        console.error('[dreamina-bridge] 本机开发请先执行：chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\\dreamina-bridge-profile"')
      })
  })

  const shutdown = () => {
    resetBrowserState()
    try { chromeChild?.kill('SIGTERM') } catch {}
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref?.()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  // Cookie 引导：容器里由 Secret 挂载文件，启动即接管登录态
  bootstrapCookies()
}

main()
