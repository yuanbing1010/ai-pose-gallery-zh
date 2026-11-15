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

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true
  }
  // IPv4 literal private/link-local ranges
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [, a, b] = ipv4.map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  // IPv6 unique local / link-local
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(h)) return true
  return false
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
