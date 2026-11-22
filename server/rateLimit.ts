import type { Context } from 'hono'
import { sha256Hex } from './crypto'
import type { AppEnv } from './types'

export interface RateLimitDescriptor {
  scope: string
  identifier: string
  maxAttempts: number
  windowMs: number
  lockMs: number
}

interface RateBucket {
  count: number
  windowStart: number
  lockedUntil: number
}

export interface RateLimitInspection {
  blocked: boolean
  retryAfterSec: number
  keys: string[]
  buckets: RateBucket[]
}

export function getRequestClientIp(c: Context<AppEnv>): string {
  const cfIp = c.req.header('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp.slice(0, 64)
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded.slice(0, 64)
  return 'unknown'
}

export function formatRetryWait(retryAfterSec: number): string {
  if (retryAfterSec < 60) return `${retryAfterSec} 秒`
  const mins = Math.floor(retryAfterSec / 60)
  const secs = retryAfterSec % 60
  return secs > 0 ? `${mins} 分 ${secs} 秒` : `${mins} 分钟`
}

function parseBucket(raw: string | undefined, windowMs: number, now: number): RateBucket {
  if (!raw) return { count: 0, windowStart: now, lockedUntil: 0 }
  try {
    const parsed = JSON.parse(raw) as Partial<RateBucket>
    const count = Number(parsed.count) || 0
    const windowStart = Number(parsed.windowStart) || now
    const lockedUntil = Number(parsed.lockedUntil) || 0
    if (now - windowStart > windowMs && lockedUntil <= now) {
      return { count: 0, windowStart: now, lockedUntil: 0 }
    }
    return { count, windowStart, lockedUntil }
  } catch {
    return { count: 0, windowStart: now, lockedUntil: 0 }
  }
}

export async function inspectRateLimits(
  db: D1Database,
  descriptors: RateLimitDescriptor[],
  now = Date.now()
): Promise<RateLimitInspection> {
  const keys = await Promise.all(
    descriptors.map(async (d) => {
      const h = await sha256Hex(`${d.scope}:${d.identifier}`)
      return `rl_${d.scope}_${h.slice(0, 32)}`
    })
  )

  const placeholders = keys.map(() => '?').join(', ')
  const res =
    keys.length > 0
      ? await db
          .prepare(`SELECT key, value_json FROM system_settings WHERE key IN (${placeholders})`)
          .bind(...keys)
          .all<{ key: string; value_json: string }>()
      : { results: [] }

  const rawMap = new Map((res.results || []).map((r) => [r.key, r.value_json]))
  const buckets = descriptors.map((d, i) => parseBucket(rawMap.get(keys[i]), d.windowMs, now))
  const maxLockedUntil = Math.max(0, ...buckets.map((b) => b.lockedUntil))

  if (maxLockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((maxLockedUntil - now) / 1000)),
      keys,
      buckets,
    }
  }

  return { blocked: false, retryAfterSec: 0, keys, buckets }
}

export async function recordRateLimitHit(
  db: D1Database,
  descriptors: RateLimitDescriptor[],
  inspection: RateLimitInspection,
  now = Date.now()
): Promise<void> {
  if (descriptors.length === 0) return
  const stmts = descriptors.map((d, i) => {
    const prev = inspection.buckets[i]
    const nextCount = prev.count + 1
    const next: RateBucket = {
      count: nextCount,
      windowStart: prev.windowStart,
      lockedUntil: nextCount >= d.maxAttempts ? now + d.lockMs : 0,
    }
    return db
      .prepare(
        `INSERT INTO system_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .bind(inspection.keys[i], JSON.stringify(next), now)
  })
  await db.batch(stmts)
}

export async function clearRateLimits(db: D1Database, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const placeholders = keys.map(() => '?').join(', ')
  await db.prepare(`DELETE FROM system_settings WHERE key IN (${placeholders})`).bind(...keys).run()
}
