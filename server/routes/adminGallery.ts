import { Hono } from 'hono'
import type {
  AdminGalleryStatsSummary,
  GalleryCommentDTO,
  GalleryItemStatus,
} from '../../shared/studio'
import {
  cleanTweetTextToPrompt,
  downloadExternalImageToGalleryR2,
  fetchXTweetPreview,
  inferAspectRatioFromDims,
  mapGalleryItemRow,
  mapXSyncSourceRow,
  normalizeGalleryAspectRatio,
  normalizeGalleryCategory,
  normalizeGalleryTags,
  parseXTweetUrl,
  type GalleryItemRow,
  type XSyncSourceRow,
} from '../galleryService'
import type { AppEnv } from '../types'

export const adminGalleryRoutes = new Hono<AppEnv>()

const VALID_STATUSES = new Set<GalleryItemStatus>(['pending', 'published', 'rejected', 'hidden'])

adminGalleryRoutes.get('/', async (c) => {
  const status = (c.req.query('status') || 'all').trim()
  const source = (c.req.query('source') || 'all').trim()
  const q = (c.req.query('q') || '').trim()
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '50') || 50))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const where: string[] = []
  const binds: unknown[] = []

  if (VALID_STATUSES.has(status as GalleryItemStatus)) {
    where.push(`status = ?`)
    binds.push(status)
  }
  if (source === 'x_sync' || source === 'user_t2i' || source === 'user_recipe') {
    where.push(`source_type = ?`)
    binds.push(source)
  }
  if (q) {
    const like = `%${q}%`
    where.push(
      `(title LIKE ? OR prompt_text LIKE ? OR prompt_zh LIKE ? OR author_name LIKE ? OR x_author_handle LIKE ? OR tags_json LIKE ?)`
    )
    binds.push(like, like, like, like, like, like)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql =
    status === 'pending'
      ? `ORDER BY created_at ASC`
      : `ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC`

  const [listRes, countRes, statsRes] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM gallery_items ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<GalleryItemRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM gallery_items ${whereSql}`)
      .bind(...binds)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
        SUM(CASE WHEN source_type = 'x_sync' THEN 1 ELSE 0 END) AS x_sync,
        SUM(CASE WHEN source_type = 'user_t2i' THEN 1 ELSE 0 END) AS user_t2i,
        SUM(CASE WHEN source_type = 'user_recipe' THEN 1 ELSE 0 END) AS user_recipe
      FROM gallery_items`
    ).first<{
      total: number
      pending: number | null
      published: number | null
      rejected: number | null
      hidden: number | null
      x_sync: number | null
      user_t2i: number | null
      user_recipe: number | null
    }>(),
  ])

  const stats: AdminGalleryStatsSummary = {
    total: Number(statsRes?.total ?? 0),
    pending: Number(statsRes?.pending ?? 0),
    published: Number(statsRes?.published ?? 0),
    rejected: Number(statsRes?.rejected ?? 0),
    hidden: Number(statsRes?.hidden ?? 0),
    xSync: Number(statsRes?.x_sync ?? 0),
    userT2i: Number(statsRes?.user_t2i ?? 0),
    userRecipe: Number(statsRes?.user_recipe ?? 0),
  }

  return c.json({
    items: (listRes.results || []).map((row) => mapGalleryItemRow(row, { isAdmin: true })),
    total: countRes?.total ?? 0,
    stats,
    ingestKeyConfigured: Boolean((c.env.GALLERY_INGEST_KEY || '').trim()),
  })
})

adminGalleryRoutes.patch('/:id', async (c) => {
  const admin = c.get('adminUser') || c.get('user')!
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()
  if (!existing) {
    return c.json({ error: { message: '画廊作品不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const now = Date.now()
  const nextStatus: GalleryItemStatus =
    typeof body.status === 'string' && VALID_STATUSES.has(body.status as GalleryItemStatus)
      ? (body.status as GalleryItemStatus)
      : existing.status

  const nextTitle =
    typeof body.title === 'string' ? body.title.trim().slice(0, 80) : existing.title
  const nextPromptText =
    typeof body.promptText === 'string' && existing.source_type !== 'user_recipe'
      ? body.promptText.trim().slice(0, 3000)
      : existing.prompt_text
  const nextPromptZh =
    typeof body.promptZh === 'string' && existing.source_type !== 'user_recipe'
      ? body.promptZh.trim().slice(0, 3000)
      : existing.prompt_zh
  const nextPromptPublic =
    typeof body.promptPublic === 'boolean' && existing.source_type !== 'user_recipe'
      ? body.promptPublic
        ? 1
        : 0
      : existing.prompt_public
  const nextCategory =
    typeof body.category === 'string'
      ? normalizeGalleryCategory(body.category)
      : existing.category
  const nextTagsJson =
    body.tags !== undefined
      ? JSON.stringify(normalizeGalleryTags(body.tags))
      : existing.tags_json
  const nextAspectRatio =
    typeof body.aspectRatio === 'string'
      ? normalizeGalleryAspectRatio(body.aspectRatio)
      : existing.aspect_ratio
  const nextFeatured =
    typeof body.isFeatured === 'boolean' ? (body.isFeatured ? 1 : 0) : existing.is_featured
  const nextReviewNote =
    typeof body.reviewNote === 'string'
      ? body.reviewNote.trim().slice(0, 300)
      : existing.review_note

  const statusChanged = nextStatus !== existing.status
  const nextPublishedAt =
    nextStatus === 'published'
      ? existing.published_at || now
      : existing.published_at
  const nextReviewedBy = statusChanged ? admin.id : existing.reviewed_by
  const nextReviewedAt = statusChanged ? now : existing.reviewed_at

  await c.env.DB.prepare(
    `UPDATE gallery_items SET
      status = ?,
      title = ?,
      prompt_text = ?,
      prompt_zh = ?,
      prompt_public = ?,
      category = ?,
      tags_json = ?,
      aspect_ratio = ?,
      is_featured = ?,
      review_note = ?,
      reviewed_by = ?,
      reviewed_at = ?,
      published_at = ?,
      updated_at = ?
    WHERE id = ?`
  )
    .bind(
      nextStatus,
      nextTitle,
      nextPromptText,
      nextPromptZh,
      nextPromptPublic,
      nextCategory,
      nextTagsJson,
      nextAspectRatio,
      nextFeatured,
      nextReviewNote,
      nextReviewedBy,
      nextReviewedAt,
      nextPublishedAt,
      now,
      id
    )
    .run()

  const updated = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()

  return c.json({
    ok: true,
    item: updated ? mapGalleryItemRow(updated, { isAdmin: true }) : null,
  })
})

adminGalleryRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()
  if (!existing) {
    return c.json({ error: { message: '画廊作品不存在' } }, 404)
  }

  if (existing.image_r2_key) {
    await c.env.BUCKET.delete(existing.image_r2_key).catch(() => {})
  }
  if (existing.thumb_r2_key && existing.thumb_r2_key !== existing.image_r2_key) {
    await c.env.BUCKET.delete(existing.thumb_r2_key).catch(() => {})
  }
  await c.env.DB.prepare(`DELETE FROM gallery_items WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

/** 预览解析 X 推文（返回文本与图片列表供管理员确认、挑图、润色） */
adminGalleryRoutes.post('/parse-x', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) {
    return c.json({ error: { message: '请粘贴 X / Twitter 推文链接' } }, 400)
  }

  try {
    const preview = await fetchXTweetPreview(url, c.env)
    return c.json({ preview })
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '解析推文失败' } },
      400
    )
  }
})

/** 管理员确认后一键导入 X 推文作品到公共画廊（自动下载图片转存 R2） */
adminGalleryRoutes.post('/import-x', async (c) => {
  const admin = c.get('adminUser') || c.get('user')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const rawTweetUrl = typeof body.tweetUrl === 'string' ? body.tweetUrl.trim() : ''
  const parsedTweet = parseXTweetUrl(rawTweetUrl)
  const tweetId =
    (typeof body.tweetId === 'string' && body.tweetId.trim()) ||
    parsedTweet?.tweetId ||
    `manual_${crypto.randomUUID().slice(0, 12)}`

  if (parsedTweet?.tweetId || (typeof body.tweetId === 'string' && body.tweetId.trim())) {
    const dup = await c.env.DB.prepare(
      `SELECT id FROM gallery_items WHERE x_tweet_id = ? LIMIT 1`
    )
      .bind(tweetId)
      .first<{ id: string }>()
    if (dup) {
      return c.json({ error: { message: '该条推文已在画廊中，请勿重复导入' } }, 409)
    }
  }

  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  if (!imageUrl) {
    return c.json({ error: { message: '请选择或填写有效的作品图片 HTTPS 地址' } }, 400)
  }

  const promptText = cleanTweetTextToPrompt(
    typeof body.promptText === 'string' ? body.promptText : ''
  ).slice(0, 3000)
  if (!promptText) {
    return c.json({ error: { message: '请填写作品提示词' } }, 400)
  }

  const promptZh = typeof body.promptZh === 'string' ? body.promptZh.trim().slice(0, 3000) : ''
  const authorHandle = (
    typeof body.authorHandle === 'string' && body.authorHandle.trim()
      ? body.authorHandle.trim()
      : parsedTweet?.handle || ''
  )
    .replace(/^@+/, '')
    .slice(0, 60)
  const authorName = (
    typeof body.authorName === 'string' && body.authorName.trim()
      ? body.authorName.trim()
      : authorHandle
        ? `@${authorHandle}`
        : 'X 提示词博主'
  ).slice(0, 80)
  const authorAvatar =
    typeof body.authorAvatar === 'string' && body.authorAvatar.trim().startsWith('https://')
      ? body.authorAvatar.trim().slice(0, 400)
      : null
  const tweetUrl =
    parsedTweet?.canonicalUrl ||
    (rawTweetUrl.startsWith('https://') ? rawTweetUrl.slice(0, 400) : null)

  const title = (
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : promptZh.split('\n')[0]?.trim() || promptText.split('\n')[0]?.trim() || `${authorName} 提示词作品`
  ).slice(0, 80)

  const width =
    typeof body.width === 'number' && Number.isFinite(body.width) && body.width > 0
      ? Math.trunc(body.width)
      : null
  const height =
    typeof body.height === 'number' && Number.isFinite(body.height) && body.height > 0
      ? Math.trunc(body.height)
      : null
  const aspectRatio =
    typeof body.aspectRatio === 'string' && body.aspectRatio.trim()
      ? normalizeGalleryAspectRatio(body.aspectRatio)
      : inferAspectRatioFromDims(width ?? undefined, height ?? undefined)

  const category = normalizeGalleryCategory(
    typeof body.category === 'string' ? body.category : ''
  )
  const tags = normalizeGalleryTags(body.tags)
  const publishNow = body.publishNow !== false
  const isFeatured = body.isFeatured === true

  const itemId = crypto.randomUUID()
  let stored: { r2Key: string; mime: string; bytes: number }
  try {
    stored = await downloadExternalImageToGalleryR2(imageUrl, itemId, c.env)
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '下载并转存图片失败' } },
      400
    )
  }

  const now = Date.now()
  const status: GalleryItemStatus = publishNow ? 'published' : 'pending'

  await c.env.DB.prepare(
    `INSERT INTO gallery_items (
      id, source_type, status, author_name,
      x_tweet_id, x_author_handle, x_author_name, x_author_avatar, x_tweet_url,
      title, prompt_text, prompt_zh, prompt_public,
      aspect_ratio, width, height,
      image_r2_key, thumb_r2_key, image_mime, image_bytes,
      tags_json, category, is_featured,
      reviewed_by, reviewed_at, created_at, updated_at, published_at
    ) VALUES (?, 'x_sync', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      itemId,
      status,
      authorName,
      tweetId,
      authorHandle || null,
      authorName,
      authorAvatar,
      tweetUrl,
      title,
      promptText,
      promptZh,
      aspectRatio,
      width,
      height,
      stored.r2Key,
      stored.r2Key,
      stored.mime,
      stored.bytes,
      JSON.stringify(tags),
      category,
      isFeatured ? 1 : 0,
      publishNow ? admin.id : null,
      publishNow ? now : null,
      now,
      now,
      publishNow ? now : null
    )
    .run()

  const created = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(itemId)
    .first<GalleryItemRow>()

  return c.json(
    {
      ok: true,
      item: created ? mapGalleryItemRow(created, { isAdmin: true }) : null,
    },
    201
  )
})

/** X 博主白名单管理（为 GCP VPS + Grok Bot 定时同步做数据配置） */
adminGalleryRoutes.get('/x-sources', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT * FROM x_sync_sources ORDER BY enabled DESC, created_at DESC`
  ).all<XSyncSourceRow>()
  return c.json({
    items: (res.results || []).map(mapXSyncSourceRow),
  })
})

adminGalleryRoutes.post('/x-sources', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const rawHandle = typeof body.handle === 'string' ? body.handle.trim() : ''
  const handle = rawHandle
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    ?.trim()
    .toLowerCase()

  if (!handle || !/^[a-z0-9_]{1,40}$/i.test(handle)) {
    return c.json({ error: { message: '请输入有效的 X 博主用户名（如 @handle）' } }, 400)
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM x_sync_sources WHERE LOWER(handle) = LOWER(?) LIMIT 1`
  )
    .bind(handle)
    .first<{ id: string }>()
  if (existing) {
    return c.json({ error: { message: `博主 @${handle} 已在同步白名单中` } }, 409)
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 60)
      : `@${handle}`
  const autoPublish = body.autoPublish === true ? 1 : 0
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : ''

  await c.env.DB.prepare(
    `INSERT INTO x_sync_sources (
      id, handle, display_name, auto_publish, enabled, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  )
    .bind(id, handle, displayName, autoPublish, note, now, now)
    .run()

  const created = await c.env.DB.prepare(`SELECT * FROM x_sync_sources WHERE id = ?`)
    .bind(id)
    .first<XSyncSourceRow>()

  return c.json({ ok: true, source: created ? mapXSyncSourceRow(created) : null }, 201)
})

adminGalleryRoutes.patch('/x-sources/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(`SELECT * FROM x_sync_sources WHERE id = ?`)
    .bind(id)
    .first<XSyncSourceRow>()
  if (!existing) {
    return c.json({ error: { message: '博主记录不存在' } }, 404)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 60)
      : existing.display_name
  const autoPublish =
    typeof body.autoPublish === 'boolean' ? (body.autoPublish ? 1 : 0) : existing.auto_publish
  const enabled = typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : existing.note

  await c.env.DB.prepare(
    `UPDATE x_sync_sources SET display_name = ?, auto_publish = ?, enabled = ?, note = ?, updated_at = ? WHERE id = ?`
  )
    .bind(displayName, autoPublish, enabled, note, Date.now(), id)
    .run()

  const updated = await c.env.DB.prepare(`SELECT * FROM x_sync_sources WHERE id = ?`)
    .bind(id)
    .first<XSyncSourceRow>()

  return c.json({ ok: true, source: updated ? mapXSyncSourceRow(updated) : null })
})

adminGalleryRoutes.delete('/x-sources/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare(`DELETE FROM x_sync_sources WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

/** 管理端评论列表与删评治理 */
adminGalleryRoutes.get('/comments', async (c) => {
  const q = (c.req.query('q') || '').trim()
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '60') || 60))
  const where = [`gc.status = 'visible'`]
  const binds: unknown[] = []
  if (q) {
    const like = `%${q}%`
    where.push(`(gc.content LIKE ? OR u.display_name LIKE ? OR u.username LIKE ? OR gi.title LIKE ?)`)
    binds.push(like, like, like, like)
  }

  const res = await c.env.DB.prepare(
    `SELECT
      gc.id,
      gc.item_id,
      gc.user_id,
      gc.reply_to_id,
      gc.content,
      gc.created_at,
      gi.title AS item_title,
      u.display_name AS author_display_name,
      u.username AS author_username,
      oa.avatar_url AS author_avatar
    FROM gallery_comments gc
    LEFT JOIN gallery_items gi ON gi.id = gc.item_id
    LEFT JOIN users u ON u.id = gc.user_id
    LEFT JOIN oauth_accounts oa ON oa.user_id = gc.user_id AND oa.provider = 'wechat_open'
    WHERE ${where.join(' AND ')}
    ORDER BY gc.created_at DESC
    LIMIT ?`
  )
    .bind(...binds, limit)
    .all<{
      id: string
      item_id: string
      user_id: string
      reply_to_id: string | null
      content: string
      created_at: number
      item_title: string | null
      author_display_name: string | null
      author_username: string | null
      author_avatar: string | null
    }>()

  const items: GalleryCommentDTO[] = (res.results || []).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemTitle: row.item_title || '已删除作品',
    userId: row.user_id,
    authorName: (row.author_display_name || row.author_username || '用户').trim(),
    authorAvatar: row.author_avatar || null,
    replyToId: row.reply_to_id,
    content: row.content,
    createdAt: row.created_at,
    canDelete: true,
  }))

  return c.json({ items })
})

adminGalleryRoutes.delete('/comments/:id', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(
    `SELECT id, item_id FROM gallery_comments WHERE id = ?`
  )
    .bind(id)
    .first<{ id: string; item_id: string }>()
  if (!row) {
    return c.json({ error: { message: '评论不存在' } }, 404)
  }
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE gallery_comments SET status = 'hidden' WHERE id = ?`).bind(id),
    c.env.DB.prepare(
      `UPDATE gallery_items SET comment_count = (SELECT COUNT(*) FROM gallery_comments WHERE item_id = ? AND status = 'visible'), updated_at = ? WHERE id = ?`
    ).bind(row.item_id, now, row.item_id),
  ])
  return c.json({ ok: true })
})
