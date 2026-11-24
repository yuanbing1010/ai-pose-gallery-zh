export function validateUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const val = raw.trim()
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(val)) return null
  return val
}

export function validateEmail(raw: unknown): { valid: boolean; value: string | null } {
  if (raw === undefined || raw === null || raw === '') return { valid: true, value: null }
  if (typeof raw !== 'string') return { valid: false, value: null }
  const val = raw.trim()
  if (!val) return { valid: true, value: null }
  if (val.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return { valid: false, value: null }
  }
  return { valid: true, value: val }
}

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length < 6 || raw.length > 128) return null
  return raw
}

export function parseIntSafe(raw: unknown, min: number, max: number): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(num) || num < min || num > max) return null
  return num
}

function isPrivateIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  if (a > 255 || b > 255 || c > 255 || d > 255) return true
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::' ||
    h === '::0' ||
    h === '::1' ||
    /^0(:0){7}$/.test(h) ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true
  }
  // IPv4 literal private/link-local ranges
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [, a, b, c, d] = ipv4.map(Number)
    if (isPrivateIpv4Octets(a, b, c, d)) return true
  }
  // IPv4-mapped IPv6 dotted form: ::ffff:127.0.0.1
  const mappedDotted = h.match(/^(?:0{0,4}:){0,5}:ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i)
  if (mappedDotted) {
    const [, a, b, c, d] = mappedDotted.map(Number)
    if (isPrivateIpv4Octets(a, b, c, d)) return true
  }
  // IPv4-mapped IPv6 normalized hex form (what URL parser emits): ::ffff:7f00:1
  const mappedHex = h.match(/^(?:0{0,4}:){0,5}:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    const a = (hi >> 8) & 0xff
    const b = hi & 0xff
    const c = (lo >> 8) & 0xff
    const d = lo & 0xff
    if (isPrivateIpv4Octets(a, b, c, d)) return true
  }
  // IPv4-compatible IPv6 (::7f00:1) & NAT64 (64:ff9b::7f00:1)
  const compatOrNat64Hex = h.match(/^(?::|(?:0{0,4}:){0,5}:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (compatOrNat64Hex) {
    const hi = parseInt(compatOrNat64Hex[1], 16)
    const lo = parseInt(compatOrNat64Hex[2], 16)
    const a = (hi >> 8) & 0xff
    const b = hi & 0xff
    const c = (lo >> 8) & 0xff
    const d = lo & 0xff
    if (isPrivateIpv4Octets(a, b, c, d)) return true
  }
  // IPv6 unique local / link-local / multicast（必须包含冒号，严禁误杀 fc*/fd*/ff* 合法公网域名）
  if (h.includes(':') && /^(fc|fd|fe8|fe9|fea|feb|ff)/i.test(h)) return true
  return false
}

/** 带严格字节上限的流式读取，防止 Transfer-Encoding: chunked 绕过 Content-Length 导致 Worker 128MB OOM */
export async function readResponseBodyWithLimit(res: Response, maxBytes: number): Promise<Uint8Array> {
  const lenHeader = Number(res.headers.get('content-length') || '0')
  if (Number.isFinite(lenHeader) && lenHeader > maxBytes) {
    await res.body?.cancel().catch(() => {})
    throw new Error(`响应体超过大小限制（${Math.round(maxBytes / (1024 * 1024))}MB）`)
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > maxBytes) {
      throw new Error(`响应体超过大小限制（${Math.round(maxBytes / (1024 * 1024))}MB）`)
    }
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`响应体超过大小限制（${Math.round(maxBytes / (1024 * 1024))}MB）`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export async function readResponseTextWithLimit(res: Response, maxBytes: number): Promise<string> {
  const bytes = await readResponseBodyWithLimit(res, maxBytes)
  return new TextDecoder().decode(bytes)
}

export function validateExternalImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (isPrivateOrLocalHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

export function sanitizeGalleryAssetPath(raw: string): string | null {
  const clean = raw.replace(/^\/+/, '').split('?')[0]
  if (!clean || clean.includes('..') || clean.includes('\\')) return null
  for (let i = 0; i < clean.length; i++) {
    if (clean.charCodeAt(i) < 32) return null
  }
  if (!clean.startsWith('img/') && !clean.startsWith('thumbs/')) return null
  return clean
}

export function sanitizeReturnToPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/'
  }
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) < 32) return '/'
  }
  return trimmed.slice(0, 500) || '/'
}

export function sanitizeCallbackBaseUrl(raw: unknown): { valid: boolean; value: string } {
  if (raw === undefined || raw === null) return { valid: true, value: '' }
  if (typeof raw !== 'string') return { valid: false, value: '' }
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return { valid: true, value: '' }
  try {
    const url = new URL(trimmed)
    const isLocalHttp =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (url.protocol !== 'https:' && !isLocalHttp) {
      return { valid: false, value: '' }
    }
    if (url.username || url.password || url.search || url.hash) {
      return { valid: false, value: '' }
    }
    const cleanPath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
    return { valid: true, value: `${url.origin}${cleanPath}` }
  } catch {
    return { valid: false, value: '' }
  }
}
