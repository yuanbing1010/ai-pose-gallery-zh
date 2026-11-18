import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  ensurePlatformSeeded,
  resolveSessionUser,
} from './db'
import type { AppEnv } from './types'

export const WECHAT_STATE_COOKIE_NAME = 'pose_atlas_wx_state'
const WECHAT_STATE_TTL_SEC = 10 * 60

export function isSecureRequest(c: Context<AppEnv>): boolean {
  const proto = c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol.replace(':', '')
  return proto.split(',')[0].trim().toLowerCase() === 'https'
}

export function getRequestOrigin(c: Context<AppEnv>): string {
  const proto = isSecureRequest(c) ? 'https' : 'http'
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim()
  const hostHeader = c.req.header('host')?.trim()
  const rawHost = forwardedHost || hostHeader || new URL(c.req.url).host
  const safeHost = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)
    ? rawHost
    : new URL(c.req.url).host
  return `${proto}://${safeHost}`
}

export function setWechatStateCookie(c: Context<AppEnv>, rawToken: string): void {
  setCookie(c, WECHAT_STATE_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(c),
    maxAge: WECHAT_STATE_TTL_SEC,
  })
}

export function clearWechatStateCookie(c: Context<AppEnv>): void {
  deleteCookie(c, WECHAT_STATE_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(c),
  })
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

export function setAdminSessionCookie(c: Context<AppEnv>, rawToken: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(c),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearAdminSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(c),
  })
}

export const withSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  await ensurePlatformSeeded(c.env)
  const token = getCookie(c, SESSION_COOKIE_NAME)
  const adminToken = getCookie(c, ADMIN_SESSION_COOKIE_NAME)
  const [resolved, resolvedAdmin] = await Promise.all([
    resolveSessionUser(c.env.DB, token),
    adminToken
      ? adminToken === token
        ? Promise.resolve(null)
        : resolveSessionUser(c.env.DB, adminToken)
      : Promise.resolve(null),
  ])
  const effectiveAdmin =
    adminToken && adminToken === token
      ? resolved
      : resolvedAdmin
  c.set('user', resolved?.user ?? null)
  c.set('sessionId', resolved?.sessionId ?? null)
  c.set('adminUser', effectiveAdmin?.user?.role === 'admin' ? effectiveAdmin.user : null)
  c.set('adminSessionId', effectiveAdmin?.user?.role === 'admin' ? effectiveAdmin.sessionId : null)
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
  const adminUser = c.get('adminUser')
  if (!adminUser) {
    return c.json({ error: { message: '请先登录管理员账号' } }, 401)
  }
  if (adminUser.role !== 'admin') {
    return c.json({ error: { message: '需要管理员权限' } }, 403)
  }
  await next()
}
