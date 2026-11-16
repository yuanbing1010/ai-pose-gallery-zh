import { Hono } from 'hono'
import { claimRedeemCode, getUserWithOAuthById, mapLedgerRow, mapUserRow } from '../db'
import { requireAuth } from '../middleware'
import type { AppEnv } from '../types'

export const accountRoutes = new Hono<AppEnv>()

accountRoutes.use('*', requireAuth)

accountRoutes.get('/ledger', async (c) => {
  const user = c.get('user')!
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const [ledgerRes, userRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, user_id, delta, balance_after, type, ref_id, note, operator_id, created_at
       FROM credit_ledger
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(user.id, limit)
      .all<any>(),
    c.env.DB.prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(user.id)
      .first<{ credit_balance: number }>(),
  ])

  c.header('Cache-Control', 'no-store')
  return c.json({
    items: (ledgerRes.results || []).map(mapLedgerRow),
    creditBalance: userRow?.credit_balance ?? user.creditBalance,
  })
})

accountRoutes.post('/redeem', async (c) => {
  const user = c.get('user')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体格式错误' } }, 400)
  }

  const code = typeof body.code === 'string' ? body.code : ''
  try {
    const result = await claimRedeemCode(c.env.DB, { code, userId: user.id })
    c.header('Cache-Control', 'no-store')
    return c.json(result)
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '兑换失败' } },
      400
    )
  }
})

accountRoutes.post('/wechat/unbind', async (c) => {
  const user = c.get('user')!
  const row = await c.env.DB.prepare(`SELECT id, password_hash FROM users WHERE id = ?`)
    .bind(user.id)
    .first<{ id: string; password_hash: string }>()
  if (!row) {
    return c.json({ error: { message: '账号不存在' } }, 404)
  }

  const bound = await c.env.DB.prepare(
    `SELECT id FROM oauth_accounts WHERE user_id = ? AND provider = 'wechat_open' LIMIT 1`
  )
    .bind(user.id)
    .first<{ id: string }>()

  if (bound && !row.password_hash) {
    return c.json(
      {
        error: {
          message: '当前账号尚未设置登录密码，请先设置登录密码后再解绑微信，以免无法登录',
        },
      },
      400
    )
  }

  await c.env.DB.prepare(
    `DELETE FROM oauth_accounts WHERE user_id = ? AND provider = 'wechat_open'`
  )
    .bind(user.id)
    .run()

  const fresh = await getUserWithOAuthById(c.env.DB, user.id)
  c.header('Cache-Control', 'no-store')
  return c.json({
    ok: true,
    user: fresh ? mapUserRow(fresh) : null,
  })
})
