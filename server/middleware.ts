import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  ensurePlatformSeeded,
  resolveSessionUser,
} from './db'
import type { AppEnv } from './types'

export function isSecureRequest(c: Context<AppEnv>): boolean {
  const proto = c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol.replace(':', '')
  return proto === 'https'
}

export function setSessionCookie(c: Context<AppEnv>, rawToken: string): void {
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(c),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(c),
  })
}

export const withSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  await ensurePlatformSeeded(c.env)
  const token = getCookie(c, SESSION_COOKIE_NAME)
  const resolved = await resolveSessionUser(c.env.DB, token)
  c.set('user', resolved?.user ?? null)
  c.set('sessionId', resolved?.sessionId ?? null)
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: { message: '请先登录账号' } }, 401)
  }
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: { message: '请先登录管理员账号' } }, 401)
  }
  if (user.role !== 'admin') {
    return c.json({ error: { message: '需要管理员权限' } }, 403)
  }
  await next()
}
