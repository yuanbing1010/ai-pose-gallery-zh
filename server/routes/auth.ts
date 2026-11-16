import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import {
  SESSION_COOKIE_NAME,
  createSession,
  createUserWithBonus,
  createWechatUserWithBonus,
  deleteSession,
  findWechatOAuthBinding,
  getPlatformConfig,
  getPublicProviders,
  getPublicWechatLoginInfo,
  getUserWithOAuthById,
  mapUserRow,
  reapStaleProcessingJobs,
  resolveRuntimeWechatConfig,
  type UserRow,
} from '../db'
import { hashPassword, randomTokenHex, sha256Hex, verifyPassword } from '../crypto'
import {
  WECHAT_STATE_COOKIE_NAME,
  clearSessionCookie,
  clearWechatStateCookie,
  getRequestOrigin,
  requireAuth,
  setSessionCookie,
  setWechatStateCookie,
} from '../middleware'
import type { AppEnv } from '../types'
import {
  sanitizeReturnToPath,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../validation'
import {
  buildWechatAuthorizeUrl,
  buildWechatCallbackRedirect,
  buildWechatIframeUrl,
  buildWechatRedirectUri,
  exchangeWechatCode,
  fetchWechatUserInfo,
} from '../wechatOAuth'

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/bootstrap', async (c) => {
  const user = c.get('user')
  if (user) {
    await reapStaleProcessingJobs(c.env.DB, user.id)
  }
  const [freshRow, platform, providers, wechatLogin] = await Promise.all([
    user ? getUserWithOAuthById(c.env.DB, user.id) : Promise.resolve(null),
    getPlatformConfig(c.env.DB),
    getPublicProviders(c.env),
    getPublicWechatLoginInfo(c.env),
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
    wechatLogin,
  })
})

authRoutes.get('/auth/me', async (c) => {
  const user = c.get('user')
  c.header('Cache-Control', 'no-store')
  if (!user) return c.json({ user: null })
  await reapStaleProcessingJobs(c.env.DB, user.id)
  const fresh = await getUserWithOAuthById(c.env.DB, user.id)
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

  const account =
    typeof body.account === 'string'
      ? body.account.trim()
      : typeof body.username === 'string'
        ? body.username.trim()
        : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const requireAdminFlag = Boolean(body.requireAdmin)

  if (!account || !password) {
    return c.json({ error: { message: '请输入账号和密码' } }, 400)
  }

  const lower = account.toLowerCase()
  const row = await c.env.DB.prepare(
    `SELECT u.*,
            oa.openid AS wechat_openid,
            oa.nickname AS wechat_nickname,
            oa.avatar_url AS wechat_avatar_url
     FROM users u
     LEFT JOIN oauth_accounts oa ON oa.user_id = u.id AND oa.provider = 'wechat_open'
     WHERE u.username_lower = ? OR u.email_lower = ?
     LIMIT 1`
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

  const newPassword = validatePassword(body.newPassword)
  if (!newPassword) {
    return c.json({ error: { message: '请填写 6~128 位新密码' } }, 400)
  }

  const row = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(user.id)
    .first<UserRow>()
  if (!row) {
    return c.json({ error: { message: '账号不存在' } }, 404)
  }

  if (row.password_hash) {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    if (!currentPassword) {
      return c.json({ error: { message: '请填写当前密码' } }, 400)
    }
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      return c.json({ error: { message: '当前密码不正确' } }, 401)
    }
  }

  const nextHash = await hashPassword(newPassword)
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(nextHash, Date.now(), user.id)
    .run()

  return c.json({ ok: true, hasPassword: true })
})

// ---------------------------------------------------------------------------
// 微信开放平台扫码登录 / 注册 / 绑定
// ---------------------------------------------------------------------------

authRoutes.post('/auth/wechat/start', async (c) => {
  let body: Record<string, unknown> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const intent = body.intent === 'bind' ? 'bind' : 'login'
  const currentUser = c.get('user')
  if (intent === 'bind') {
    if (!currentUser) {
      return c.json({ error: { message: '请先登录账号后再绑定微信' } }, 401)
    }
    const alreadyBound = await c.env.DB.prepare(
      `SELECT id FROM oauth_accounts WHERE user_id = ? AND provider = 'wechat_open' LIMIT 1`
    )
      .bind(currentUser.id)
      .first<{ id: string }>()
    if (alreadyBound) {
      return c.json({ error: { message: '当前账号已绑定微信，如需更换请先解绑' } }, 409)
    }
  }

  const wechatCfg = await resolveRuntimeWechatConfig(c.env)
  if (!wechatCfg.enabled || !wechatCfg.appId || !wechatCfg.appSecret) {
    return c.json({ error: { message: '微信扫码登录暂未开启或尚未完成配置' } }, 400)
  }

  const returnTo = sanitizeReturnToPath(body.returnTo)
  const now = Date.now()
  const expiresAt = now + 10 * 60 * 1000
  const state = randomTokenHex(24)
  const browserToken = randomTokenHex(24)
  const cookieHash = await sha256Hex(browserToken)

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM oauth_states WHERE expires_at <= ?`).bind(now),
    c.env.DB.prepare(
      `INSERT INTO oauth_states (state, intent, user_id, return_to, cookie_hash, expires_at, created_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
    ).bind(
      state,
      intent,
      intent === 'bind' && currentUser ? currentUser.id : null,
      returnTo,
      cookieHash,
      expiresAt,
      now
    ),
  ])

  setWechatStateCookie(c, browserToken)
  const origin = getRequestOrigin(c)
  const redirectUri = buildWechatRedirectUri(origin, wechatCfg.callbackBaseUrl)
  const authorizeUrl = buildWechatAuthorizeUrl(wechatCfg.appId, redirectUri, state)
  const iframeUrl = buildWechatIframeUrl(wechatCfg.appId, redirectUri, state)

  c.header('Cache-Control', 'no-store')
  return c.json({ authorizeUrl, iframeUrl, expiresAt })
})

interface OAuthStateRow {
  state: string
  intent: 'login' | 'bind'
  user_id: string | null
  return_to: string
  cookie_hash: string
  expires_at: number
  used_at: number | null
}

authRoutes.get('/auth/wechat/callback', async (c) => {
  const origin = getRequestOrigin(c)
  const code = (c.req.query('code') || '').trim()
  const state = (c.req.query('state') || '').trim()
  const browserToken = getCookie(c, WECHAT_STATE_COOKIE_NAME)
  clearWechatStateCookie(c)

  if (!state) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, '/', {
        status: 'error',
        message: '微信登录回调缺少 state 参数，请重试',
      }),
      302
    )
  }

  const stateRow = await c.env.DB.prepare(`SELECT * FROM oauth_states WHERE state = ? LIMIT 1`)
    .bind(state)
    .first<OAuthStateRow>()

  if (!stateRow) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, '/', {
        status: 'error',
        message: '微信登录二维码已失效，请重新获取二维码',
      }),
      302
    )
  }

  const returnTo = sanitizeReturnToPath(stateRow.return_to)
  const now = Date.now()
  if (stateRow.used_at !== null || stateRow.expires_at <= now) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'error',
        message: '微信登录二维码已过期或已被使用，请刷新重试',
      }),
      302
    )
  }

  if (!browserToken || (await sha256Hex(browserToken)) !== stateRow.cookie_hash) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'error',
        message: '浏览器安全校验未通过，请在同一浏览器窗口重新扫码',
      }),
      302
    )
  }

  const consumeRes = await c.env.DB.prepare(
    `UPDATE oauth_states SET used_at = ? WHERE state = ? AND used_at IS NULL AND expires_at > ?`
  )
    .bind(now, state, now)
    .run()

  if (!consumeRes.meta.changes) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'error',
        message: '该扫码会话已被处理，请重新扫码',
      }),
      302
    )
  }

  if (!code) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'cancelled',
        message: '已取消微信授权',
      }),
      302
    )
  }

  const wechatCfg = await resolveRuntimeWechatConfig(c.env)
  if (!wechatCfg.enabled || !wechatCfg.appId || !wechatCfg.appSecret) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'error',
        message: '微信登录当前已关闭或配置不完整',
      }),
      302
    )
  }

  try {
    const tokenRes = await exchangeWechatCode(wechatCfg.appId, wechatCfg.appSecret, code)
    const profile = await fetchWechatUserInfo(tokenRes.accessToken, tokenRes.openid)
    const unionid = tokenRes.unionid || profile.unionid

    if (stateRow.intent === 'bind') {
      const currentUser = c.get('user')
      if (!currentUser || !stateRow.user_id || currentUser.id !== stateRow.user_id) {
        return c.redirect(
          buildWechatCallbackRedirect(origin, returnTo, {
            status: 'error',
            message: '当前登录状态已失效，请重新登录后再绑定微信',
          }),
          302
        )
      }

      const existingWechat = await findWechatOAuthBinding(c.env.DB, tokenRes.openid, unionid)
      if (existingWechat && existingWechat.user_id !== currentUser.id) {
        return c.redirect(
          buildWechatCallbackRedirect(origin, returnTo, {
            status: 'error',
            message: '该微信号已绑定其他账号，请先在原账号解绑后再试',
          }),
          302
        )
      }

      const existingForUser = await c.env.DB.prepare(
        `SELECT * FROM oauth_accounts WHERE user_id = ? AND provider = 'wechat_open' LIMIT 1`
      )
        .bind(currentUser.id)
        .first<{ id: string; openid: string; unionid: string | null }>()

      if (existingForUser && existingForUser.openid !== tokenRes.openid) {
        return c.redirect(
          buildWechatCallbackRedirect(origin, returnTo, {
            status: 'error',
            message: '当前账号已绑定其他微信，请先解绑后再更换',
          }),
          302
        )
      }

      if (existingForUser) {
        await c.env.DB.prepare(
          `UPDATE oauth_accounts
           SET unionid = COALESCE(?, unionid), nickname = ?, avatar_url = ?, updated_at = ?
           WHERE id = ?`
        )
          .bind(unionid, profile.nickname, profile.avatarUrl, now, existingForUser.id)
          .run()
      } else {
        await c.env.DB.prepare(
          `INSERT INTO oauth_accounts (
            id, user_id, provider, openid, unionid, nickname, avatar_url, created_at, updated_at
          ) VALUES (?, ?, 'wechat_open', ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            currentUser.id,
            tokenRes.openid,
            unionid,
            profile.nickname,
            profile.avatarUrl,
            now,
            now
          )
          .run()
      }

      return c.redirect(
        buildWechatCallbackRedirect(origin, returnTo, {
          status: 'bound',
        }),
        302
      )
    }

    // intent === 'login'
    const existingBinding = await findWechatOAuthBinding(c.env.DB, tokenRes.openid, unionid)
    if (existingBinding) {
      const userRow = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(existingBinding.user_id)
        .first<UserRow>()
      if (!userRow || userRow.status !== 'active') {
        return c.redirect(
          buildWechatCallbackRedirect(origin, returnTo, {
            status: 'error',
            message: '该账号已被停用，请联系管理员',
          }),
          302
        )
      }

      await c.env.DB.prepare(
        `UPDATE oauth_accounts
         SET unionid = COALESCE(?, unionid), nickname = ?, avatar_url = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(unionid, profile.nickname, profile.avatarUrl, now, existingBinding.id)
        .run()

      const { rawToken } = await createSession(
        c.env.DB,
        userRow.id,
        c.req.header('user-agent')
      )
      setSessionCookie(c, rawToken)
      return c.redirect(
        buildWechatCallbackRedirect(origin, returnTo, {
          status: 'login',
        }),
        302
      )
    }

    // 首次微信登录 -> 自动注册新账号并赠送注册积分
    const platform = await getPlatformConfig(c.env.DB)
    if (!platform.allowRegistration) {
      return c.redirect(
        buildWechatCallbackRedirect(origin, returnTo, {
          status: 'error',
          message: '当前暂未开放新用户自助注册，请联系管理员',
        }),
        302
      )
    }

    let createdUserId: string | null = null
    let grantedCredits = 0
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidateUsername = `wx_${randomTokenHex(5)}`
      const userId = crypto.randomUUID()
      try {
        const created = await createWechatUserWithBonus(c.env.DB, {
          userId,
          username: candidateUsername,
          displayName: profile.nickname || '微信用户',
          initialCredits: platform.registerBonusCredits,
          bonusNote: `微信新用户注册赠送 ${platform.registerBonusCredits} 积分`,
          openid: tokenRes.openid,
          unionid,
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl,
        })
        createdUserId = created.id
        grantedCredits = created.creditBalance
        break
      } catch {
        const raced = await findWechatOAuthBinding(c.env.DB, tokenRes.openid, unionid)
        if (raced) {
          const racedUser = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
            .bind(raced.user_id)
            .first<UserRow>()
          if (racedUser && racedUser.status === 'active') {
            const { rawToken } = await createSession(
              c.env.DB,
              racedUser.id,
              c.req.header('user-agent')
            )
            setSessionCookie(c, rawToken)
            return c.redirect(
              buildWechatCallbackRedirect(origin, returnTo, {
                status: 'login',
              }),
              302
            )
          }
        }
      }
    }

    if (!createdUserId) {
      return c.redirect(
        buildWechatCallbackRedirect(origin, returnTo, {
          status: 'error',
          message: '创建微信账号失败，请稍后重试',
        }),
        302
      )
    }

    const { rawToken } = await createSession(
      c.env.DB,
      createdUserId,
      c.req.header('user-agent')
    )
    setSessionCookie(c, rawToken)
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'registered',
        credits: grantedCredits,
      }),
      302
    )
  } catch (err) {
    return c.redirect(
      buildWechatCallbackRedirect(origin, returnTo, {
        status: 'error',
        message: err instanceof Error ? err.message : '微信登录失败，请稍后重试',
      }),
      302
    )
  }
})
