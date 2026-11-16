import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import {
  SESSION_COOKIE_NAME,
  createSession,
  createUserWithBonus,
  deleteSession,
  getPlatformConfig,
  getPublicProviders,
  mapUserRow,
  reapStaleProcessingJobs,
  type UserRow,
} from '../db'
import { hashPassword, verifyPassword } from '../crypto'
import { clearSessionCookie, requireAuth, setSessionCookie } from '../middleware'
import type { AppEnv } from '../types'
import { validateEmail, validatePassword, validateUsername } from '../validation'

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/bootstrap', async (c) => {
  const user = c.get('user')
  if (user) {
    await reapStaleProcessingJobs(c.env.DB, user.id)
  }
  const [freshRow, platform, providers] = await Promise.all([
    user
      ? c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(user.id).first<UserRow>()
      : Promise.resolve(null),
    getPlatformConfig(c.env.DB),
    getPublicProviders(c.env),
  ])
  const sanitizedPlatform = {
    ...platform,
    defaultPromptPrefix: '',
    defaultPromptSuffix: '',
    defaultNegativePrompt: '',
    promptTemplate: undefined,
    stylePresets: platform.stylePresets.map((item) => ({
      ...item,
      prompt: '',
      negativePrompt: undefined,
    })),
  }
  c.header('Cache-Control', 'no-store')
  return c.json({
    user: freshRow && freshRow.status === 'active' ? mapUserRow(freshRow) : null,
    platform: sanitizedPlatform,
    providers,
  })
})

authRoutes.get('/auth/me', async (c) => {
  const user = c.get('user')
  c.header('Cache-Control', 'no-store')
  if (!user) return c.json({ user: null })
  await reapStaleProcessingJobs(c.env.DB, user.id)
  const fresh = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(user.id)
    .first<UserRow>()
  return c.json({ user: fresh && fresh.status === 'active' ? mapUserRow(fresh) : null })
})

authRoutes.post('/auth/register', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const platform = await getPlatformConfig(c.env.DB)
  if (!platform.allowRegistration) {
    return c.json({ error: { message: '当前暂未开放新用户自助注册，请联系管理员' } }, 403)
  }

  const username = validateUsername(body.username)
  if (!username) {
    return c.json({ error: { message: '用户名需为 3~32 位字母、数字、下划线或点/连字符' } }, 400)
  }

  const emailCheck = validateEmail(body.email)
  if (!emailCheck.valid) {
    return c.json({ error: { message: '邮箱格式不正确' } }, 400)
  }

  const password = validatePassword(body.password)
  if (!password) {
    return c.json({ error: { message: '密码长度需在 6~128 位之间' } }, 400)
  }

  const displayNameRaw = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const displayName = (displayNameRaw || username).slice(0, 40)

  const existingName = await c.env.DB.prepare(
    `SELECT id FROM users WHERE username_lower = ?`
  )
    .bind(username.toLowerCase())
    .first<{ id: string }>()
  if (existingName) {
    return c.json({ error: { message: '该用户名已被占用' } }, 409)
  }

  if (emailCheck.value) {
    const existingEmail = await c.env.DB.prepare(
      `SELECT id FROM users WHERE email_lower = ?`
    )
      .bind(emailCheck.value.toLowerCase())
      .first<{ id: string }>()
    if (existingEmail) {
      return c.json({ error: { message: '该邮箱已被注册' } }, 409)
    }
  }

  const passwordHash = await hashPassword(password)
  const user = await createUserWithBonus(c.env.DB, {
    id: crypto.randomUUID(),
    username,
    email: emailCheck.value,
    displayName,
    passwordHash,
    role: 'user',
    initialCredits: platform.registerBonusCredits,
    bonusNote: `新用户注册赠送 ${platform.registerBonusCredits} 积分`,
  })

  const { rawToken } = await createSession(c.env.DB, user.id, c.req.header('user-agent'))
  setSessionCookie(c, rawToken)
  c.header('Cache-Control', 'no-store')
  return c.json({ user }, 201)
})

authRoutes.post('/auth/login', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const account = typeof body.account === 'string' ? body.account.trim() : typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const requireAdminFlag = Boolean(body.requireAdmin)

  if (!account || !password) {
    return c.json({ error: { message: '请输入账号和密码' } }, 400)
  }

  const lower = account.toLowerCase()
  const row = await c.env.DB.prepare(
    `SELECT * FROM users WHERE username_lower = ? OR email_lower = ? LIMIT 1`
  )
    .bind(lower, lower)
    .first<UserRow>()

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: { message: '账号或密码错误' } }, 401)
  }

  if (row.status !== 'active') {
    return c.json({ error: { message: '该账号已被停用，请联系管理员' } }, 403)
  }

  if (requireAdminFlag && row.role !== 'admin') {
    return c.json({ error: { message: '该账号不具备管理员权限' } }, 403)
  }

  const { rawToken } = await createSession(c.env.DB, row.id, c.req.header('user-agent'))
  setSessionCookie(c, rawToken)
  c.header('Cache-Control', 'no-store')
  return c.json({ user: mapUserRow({ ...row, last_login_at: Date.now() }) })
})

authRoutes.post('/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME)
  await deleteSession(c.env.DB, token)
  clearSessionCookie(c)
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true })
})

authRoutes.post('/auth/change-password', requireAuth, async (c) => {
  const user = c.get('user')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = validatePassword(body.newPassword)
  if (!currentPassword || !newPassword) {
    return c.json({ error: { message: '请填写当前密码及 6~128 位新密码' } }, 400)
  }

  const row = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(user.id).first<UserRow>()
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return c.json({ error: { message: '当前密码不正确' } }, 401)
  }

  const nextHash = await hashPassword(newPassword)
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(nextHash, Date.now(), user.id)
    .run()

  return c.json({ ok: true })
})
