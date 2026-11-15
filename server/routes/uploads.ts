import { Hono } from 'hono'
import { detectImageFormat } from '../crypto'
import { requireAuth } from '../middleware'
import type { AppEnv } from '../types'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_PURPOSES = new Set(['portrait', 'costume', 'pose', 'extra', 'stitched'])

export const uploadRoutes = new Hono<AppEnv>()

uploadRoutes.post('/uploads', requireAuth, async (c) => {
  const user = c.get('user')!
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ error: { message: '请使用 multipart/form-data 上传图片' } }, 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: { message: '缺少 file 字段' } }, 400)
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: { message: '图片大小需在 1B ~ 10MB 之间' } }, 400)
  }

  const rawPurpose = String(form.get('purpose') || 'extra')
  const purpose = ALLOWED_PURPOSES.has(rawPurpose) ? rawPurpose : 'extra'
  const widthVal = Number(form.get('width') || 0)
  const heightVal = Number(form.get('height') || 0)
  const width = Number.isFinite(widthVal) && widthVal > 0 ? Math.trunc(widthVal) : null
  const height = Number.isFinite(heightVal) && heightVal > 0 ? Math.trunc(heightVal) : null

  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = detectImageFormat(bytes)
  if (!detected) {
    return c.json({ error: { message: '仅支持 PNG、JPEG、WebP 或 GIF 格式图片' } }, 400)
  }

  const assetId = crypto.randomUUID()
  const r2Key = `uploads/${user.id}/${assetId}.${detected.ext}`

  await c.env.BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: detected.mime },
    customMetadata: { userId: user.id, purpose },
  })

  await c.env.DB.prepare(
    `INSERT INTO uploaded_assets (
      id, user_id, r2_key, purpose, mime_type, bytes, width, height, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(assetId, user.id, r2Key, purpose, detected.mime, bytes.byteLength, width, height, Date.now())
    .run()

  return c.json(
    {
      id: assetId,
      r2Key,
      url: `/api/files/${r2Key}`,
      mimeType: detected.mime,
      bytes: bytes.byteLength,
    },
    201
  )
})

uploadRoutes.get('/files/*', requireAuth, async (c) => {
  const user = c.get('user')!
  const rawKey = c.req.path.replace(/^\/api\/files\//, '')
  let key: string
  try {
    key = decodeURIComponent(rawKey).replace(/^\/+/, '')
  } catch {
    return c.json({ error: { message: '非法的图片路径' } }, 400)
  }

  if (!key || key.includes('..') || key.includes('\\')) {
    return c.json({ error: { message: '非法的图片路径' } }, 400)
  }

  const isOwner =
    key.startsWith(`uploads/${user.id}/`) || key.startsWith(`generations/${user.id}/`)
  if (!isOwner && user.role !== 'admin') {
    return c.json({ error: { message: '无权访问该图片' } }, 403)
  }

  const obj = await c.env.BUCKET.get(key)
  if (!obj) {
    return c.json({ error: { message: '图片不存在' } }, 404)
  }

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'image/png')
  }
  headers.set('ETag', obj.httpEtag)
  headers.set('Cache-Control', 'private, max-age=31536000, immutable')
  headers.set('X-Content-Type-Options', 'nosniff')

  return new Response(obj.body, { headers })
})

uploadRoutes.get('/style-assets/:filename', async (c) => {
  const filename = c.req.param('filename') || ''
  if (!/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif)$/i.test(filename)) {
    return c.json({ error: { message: '非法的画风示意图路径' } }, 400)
  }

  const obj = await c.env.BUCKET.get(`styles/${filename}`)
  if (!obj) {
    return c.json({ error: { message: '示意图不存在' } }, 404)
  }

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'image/png')
  }
  headers.set('ETag', obj.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('X-Content-Type-Options', 'nosniff')

  return new Response(obj.body, { headers })
})
