import { Hono } from 'hono'
import { withSession } from './server/middleware'
import { accountRoutes } from './server/routes/account'
import { adminRoutes } from './server/routes/admin'
import { authRoutes } from './server/routes/auth'
import { generationRoutes } from './server/routes/generations'
import { uploadRoutes } from './server/routes/uploads'
import type { AppEnv } from './server/types'

const app = new Hono<AppEnv>()

app.use('/api/*', withSession)

app.get('/api/health', (c) => {
  return c.json({ ok: true, ts: Date.now() })
})

app.route('/api', authRoutes)
app.route('/api/account', accountRoutes)
app.route('/api', uploadRoutes)
app.route('/api/generations', generationRoutes)
app.route('/api/admin', adminRoutes)

app.all('/api/*', (c) => {
  return c.json({ error: { message: 'API route not found' } }, 404)
})

app.all('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
}
