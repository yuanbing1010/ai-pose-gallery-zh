const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize)
    chunks.push(String.fromCharCode(...sub))
  }
  return btoa(chunks.join(''))
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomTokenHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRedeemCode(prefix = 'POSE'): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  const cleanPrefix = prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'POSE'
  return `${cleanPrefix}-${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

const PBKDF2_ITERATIONS = 100_000

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const baseKey = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  )
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 500_000) return false
  try {
    const salt = base64ToBytes(parts[2])
    const expected = base64ToBytes(parts[3])
    const baseKey = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
      'deriveBits',
    ])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      expected.length * 8
    )
    return timingSafeEqual(new Uint8Array(bits), expected)
  } catch {
    return false
  }
}

const FALLBACK_DEV_SECRET = 'ai-pose-gallery-local-dev-only-secret-do-not-use-in-prod'

async function deriveAesKey(secret?: string): Promise<CryptoKey> {
  const material = (secret && secret.trim()) || FALLBACK_DEV_SECRET
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(material))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(plain: string, secret?: string): Promise<string> {
  const clean = plain.trim()
  if (!clean) return ''
  const key = await deriveAesKey(secret)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(clean))
  return `enc:v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`
}

export async function decryptSecret(stored: string, secret?: string): Promise<string> {
  if (!stored) return ''
  if (!stored.startsWith('enc:v1:')) return stored
  const parts = stored.split(':')
  if (parts.length !== 4) return ''
  try {
    const iv = base64ToBytes(parts[2])
    const cipher = base64ToBytes(parts[3])
    const key = await deriveAesKey(secret)
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return textDecoder.decode(plainBuf)
  } catch {
    return ''
  }
}

export function maskApiKey(plain: string): string {
  const s = plain.trim()
  if (!s) return ''
  if (s.length <= 8) return `${s.slice(0, 2)}***${s.slice(-2)}`
  return `${s.slice(0, 4)}***${s.slice(-4)}`
}

export function detectImageFormat(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 12) return null
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' }
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  // GIF: GIF87a / GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { mime: 'image/gif', ext: 'gif' }
  }
  return null
}
