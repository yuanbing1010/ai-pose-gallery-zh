import { Hono, type Context } from 'hono'
import type {
  GalleryCommentDTO,
  GalleryItemDTO,
  GalleryItemSourceType,
  GallerySortOrder,
  GenerationSnapshot,
} from '../../shared/studio'
import { base64ToBytes, detectImageFormat, timingSafeEqualText } from '../crypto'
import type { JobRow } from '../db'
import {
  MIO_R2_KEY,
  OUTFIT_DB_R2_KEY,
  emptyMioGalleryPayload,
  emptyOutfitDbGalleryPayload,
} from '../externalSync'
import {
  buildSanitizedPublicRecipe,
  cleanTweetTextToPrompt,
  downloadExternalImageToGalleryR2,
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
import { requireAuth } from '../middleware'
import { formatRetryWait, inspectRateLimits, recordRateLimitHit } from '../rateLimit'
import type { AppEnv } from '../types'

/**
 * 无需会话查询的公共只读画廊资源路由（挂载于 withSession 之前，便于边缘缓存）
 */
export const galleryRoutes = new Hono<AppEnv>()

async function respondWithSyncedGalleryStream<T>(
  c: Context<AppEnv>,
  r2Key: string,
  buildEmpty: () => T
) {
  c.header('X-Content-Type-Options', 'nosniff')
  const obj = await c.env.BUCKET.get(r2Key)
  if (!obj || !obj.body) {
    c.header('Cache-Control', 'public, max-age=120')
    return c.json(buildEmpty())
  }
  const ifNoneMatch = c.req.header('if-none-match')
  if (ifNoneMatch && obj.httpEtag && ifNoneMatch === obj.httpEtag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: obj.httpEtag,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  // 直接流式透传 R2 JSON，消除每次请求的 JSON.parse + JSON.stringify CPU 与内存开销
  const headers = new Headers()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'public, max-age=300')
  headers.set('X-Content-Type-Options', 'nosniff')
  if (obj.httpEtag) {
    headers.set('ETag', obj.httpEtag)
  }
  return new Response(obj.body, { headers })
}

galleryRoutes.get('/mio', (c) =>
  respondWithSyncedGalleryStream(c, MIO_R2_KEY, () => emptyMioGalleryPayload(null))
)

galleryRoutes.get('/outfit-db', (c) =>
  respondWithSyncedGalleryStream(c, OUTFIT_DB_R2_KEY, () => emptyOutfitDbGalleryPayload(null))
)

galleryRoutes.get('/media/:filename', async (c) => {
  const filename = c.req.param('filename') || ''
  if (!/^[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(filename) || filename.includes('..')) {
    return c.json({ error: { message: '非法的画廊图片路径' } }, 400)
  }

  const obj = await c.env.BUCKET.get(`gallery/public/${filename}`)
  if (!obj) {
    return c.json({ error: { message: '画廊图片不存在' } }, 404)
  }

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'image/webp')
  }
  headers.set('ETag', obj.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(obj.body, { headers })
})

/**
 * 灵感画廊业务路由（挂载于 withSession 之后，支持登录态识别、个人投稿与外部采集入库）
 */
export const promptGalleryRoutes = new Hono<AppEnv>()

async function attachViewerInteractions(
  db: D1Database,
  items: GalleryItemDTO[],
  viewerUserId?: string | null
): Promise<GalleryItemDTO[]> {
  if (!viewerUserId || items.length === 0) return items
  const ids = items.map((i) => i.id)
  const placeholders = ids.map(() => '?').join(', ')
  const [likesRes, bookmarksRes] = await Promise.all([
    db
      .prepare(`SELECT item_id FROM gallery_likes WHERE user_id = ? AND item_id IN (${placeholders})`)
      .bind(viewerUserId, ...ids)
      .all<{ item_id: string }>(),
    db
      .prepare(
        `SELECT item_id FROM gallery_bookmarks WHERE user_id = ? AND item_id IN (${placeholders})`
      )
      .bind(viewerUserId, ...ids)
      .all<{ item_id: string }>(),
  ])
  const likedSet = new Set((likesRes.results || []).map((r) => r.item_id))
  const bookmarkedSet = new Set((bookmarksRes.results || []).map((r) => r.item_id))
  return items.map((item) => ({
    ...item,
    likedByMe: likedSet.has(item.id),
    bookmarkedByMe: bookmarkedSet.has(item.id),
  }))
}

async function isAuthorizedIngestRequest(c: Context<AppEnv>): Promise<boolean> {
  const adminUser = c.get('adminUser')
  const user = c.get('user')
  if (adminUser?.role === 'admin' || user?.role === 'admin') return true
  const configuredKey = (c.env.GALLERY_INGEST_KEY || '').trim()
  if (!configuredKey) return false
  const authHeader = c.req.header('authorization') || ''
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  const headerKey = (c.req.header('x-gallery-ingest-key') || '').trim()
  const suppliedKey = bearerToken || headerKey
  if (!suppliedKey) return false
  return timingSafeEqualText(suppliedKey, configuredKey)
}

promptGalleryRoutes.get('/items', async (c) => {
  const user = c.get('user')
  const adminUser = c.get('adminUser')
  const isAdmin = adminUser?.role === 'admin' || user?.role === 'admin'

  const sort = (c.req.query('sort') || 'featured') as GallerySortOrder
  const source = (c.req.query('source') || 'all').trim()
  const category = (c.req.query('category') || '').trim()
  const aspectRatio = (c.req.query('aspectRatio') || '').trim()
  const q = (c.req.query('q') || '').trim()
  const limit = Math.min(80, Math.max(1, Number(c.req.query('limit') || '36') || 36))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const where: string[] = [`status = 'published'`]
  const binds: unknown[] = []

  if (source === 'x_sync' || source === 'user_t2i' || source === 'user_recipe') {
    where.push(`source_type = ?`)
    binds.push(source)
  }
  if (category && category !== '全部') {
    where.push(`category = ?`)
    binds.push(category)
  }
  if (aspectRatio && ['3:4', '1:1', '4:3', '9:16', '16:9'].includes(aspectRatio)) {
    where.push(`aspect_ratio = ?`)
    binds.push(aspectRatio)
  }
  if (q) {
    const like = `%${q}%`
    where.push(
      `(title LIKE ? OR tags_json LIKE ? OR author_name LIKE ? OR x_author_handle LIKE ? OR ((source_type = 'x_sync' OR (source_type = 'user_t2i' AND prompt_public = 1)) AND (prompt_text LIKE ? OR prompt_zh LIKE ?)))`
    )
    binds.push(like, like, like, like, like, like)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`
  const orderSql =
    sort === 'latest'
      ? `ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC`
      : sort === 'remixes'
        ? `ORDER BY remix_count DESC, is_featured DESC, COALESCE(published_at, created_at) DESC`
        : sort === 'popular'
          ? `ORDER BY (like_count * 2 + bookmark_count * 2 + remix_count * 3) DESC, COALESCE(published_at, created_at) DESC`
          : `ORDER BY is_featured DESC, COALESCE(published_at, created_at) DESC, created_at DESC`

  const [listRes, countRes] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM gallery_items ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<GalleryItemRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM gallery_items ${whereSql}`)
      .bind(...binds)
      .first<{ total: number }>(),
  ])

  const rawItems = (listRes.results || []).map((row) =>
    mapGalleryItemRow(row, { viewerUserId: user?.id, isAdmin })
  )
  const items = await attachViewerInteractions(c.env.DB, rawItems, user?.id)

  c.header('Cache-Control', 'no-store')
  return c.json({
    items,
    total: countRes?.total ?? 0,
  })
})

promptGalleryRoutes.get('/items/:id', async (c) => {
  const user = c.get('user')
  const adminUser = c.get('adminUser')
  const isAdmin = adminUser?.role === 'admin' || user?.role === 'admin'
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()

  if (!row) {
    return c.json({ error: { message: '画廊作品不存在' } }, 404)
  }

  const isOwner = Boolean(user && row.author_user_id === user.id)
  if (row.status !== 'published' && !isOwner && !isAdmin) {
    return c.json({ error: { message: '该作品暂未公开展示' } }, 404)
  }

  const [enriched] = await attachViewerInteractions(
    c.env.DB,
    [mapGalleryItemRow(row, { viewerUserId: user?.id, isAdmin })],
    user?.id
  )

  c.header('Cache-Control', 'no-store')
  return c.json({
    item: enriched,
  })
})

/** 点赞 / 取消点赞（原子写入并校准计数） */
promptGalleryRoutes.post('/items/:id/like', requireAuth, async (c) => {
  const user = c.get('user')!
  const itemId = c.req.param('id')

  const target = await c.env.DB.prepare(
    `SELECT id, status FROM gallery_items WHERE id = ?`
  )
    .bind(itemId)
    .first<{ id: string; status: string }>()
  if (!target || target.status !== 'published') {
    return c.json({ error: { message: '画廊作品不存在或未公开' } }, 404)
  }

  const existing = await c.env.DB.prepare(
    `SELECT 1 AS hit FROM gallery_likes WHERE item_id = ? AND user_id = ?`
  )
    .bind(itemId, user.id)
    .first<{ hit: number }>()

  const now = Date.now()
  const liked = !existing
  if (liked) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO gallery_likes (item_id, user_id, created_at) VALUES (?, ?, ?)`
      ).bind(itemId, user.id, now),
      c.env.DB.prepare(
        `UPDATE gallery_items SET like_count = (SELECT COUNT(*) FROM gallery_likes WHERE item_id = ?), updated_at = ? WHERE id = ?`
      ).bind(itemId, now, itemId),
    ])
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM gallery_likes WHERE item_id = ? AND user_id = ?`).bind(
        itemId,
        user.id
      ),
      c.env.DB.prepare(
        `UPDATE gallery_items SET like_count = (SELECT COUNT(*) FROM gallery_likes WHERE item_id = ?), updated_at = ? WHERE id = ?`
      ).bind(itemId, now, itemId),
    ])
  }

  const countRow = await c.env.DB.prepare(`SELECT like_count FROM gallery_items WHERE id = ?`)
    .bind(itemId)
    .first<{ like_count: number }>()

  return c.json({
    ok: true,
    liked,
    likeCount: Number(countRow?.like_count ?? 0),
  })
})

/** 收藏 / 取消收藏（原子写入并校准计数） */
promptGalleryRoutes.post('/items/:id/bookmark', requireAuth, async (c) => {
  const user = c.get('user')!
  const itemId = c.req.param('id')

  const target = await c.env.DB.prepare(
    `SELECT id, status FROM gallery_items WHERE id = ?`
  )
    .bind(itemId)
    .first<{ id: string; status: string }>()
  if (!target || target.status !== 'published') {
    return c.json({ error: { message: '画廊作品不存在或未公开' } }, 404)
  }

  const existing = await c.env.DB.prepare(
    `SELECT 1 AS hit FROM gallery_bookmarks WHERE item_id = ? AND user_id = ?`
  )
    .bind(itemId, user.id)
    .first<{ hit: number }>()

  const now = Date.now()
  const bookmarked = !existing
  if (bookmarked) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO gallery_bookmarks (item_id, user_id, created_at) VALUES (?, ?, ?)`
      ).bind(itemId, user.id, now),
      c.env.DB.prepare(
        `UPDATE gallery_items SET bookmark_count = (SELECT COUNT(*) FROM gallery_bookmarks WHERE item_id = ?), updated_at = ? WHERE id = ?`
      ).bind(itemId, now, itemId),
    ])
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM gallery_bookmarks WHERE item_id = ? AND user_id = ?`).bind(
        itemId,
        user.id
      ),
      c.env.DB.prepare(
        `UPDATE gallery_items SET bookmark_count = (SELECT COUNT(*) FROM gallery_bookmarks WHERE item_id = ?), updated_at = ? WHERE id = ?`
      ).bind(itemId, now, itemId),
    ])
  }

  const countRow = await c.env.DB.prepare(`SELECT bookmark_count FROM gallery_items WHERE id = ?`)
    .bind(itemId)
    .first<{ bookmark_count: number }>()

  return c.json({
    ok: true,
    bookmarked,
    bookmarkCount: Number(countRow?.bookmark_count ?? 0),
  })
})

/** 我的收藏列表 */
promptGalleryRoutes.get('/bookmarks', requireAuth, async (c) => {
  const user = c.get('user')!
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '60') || 60))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const [listRes, countRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT gi.*
       FROM gallery_bookmarks gb
       JOIN gallery_items gi ON gi.id = gb.item_id
       WHERE gb.user_id = ? AND gi.status = 'published'
       ORDER BY gb.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(user.id, limit, offset)
      .all<GalleryItemRow>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total
       FROM gallery_bookmarks gb
       JOIN gallery_items gi ON gi.id = gb.item_id
       WHERE gb.user_id = ? AND gi.status = 'published'`
    )
      .bind(user.id)
      .first<{ total: number }>(),
  ])

  const mapped = (listRes.results || []).map((row) =>
    mapGalleryItemRow(row, { viewerUserId: user.id, isAdmin: user.role === 'admin' })
  )
  const items = await attachViewerInteractions(c.env.DB, mapped, user.id)

  c.header('Cache-Control', 'no-store')
  return c.json({
    items,
    total: countRes?.total ?? 0,
  })
})

interface CommentQueryRow {
  id: string
  item_id: string
  user_id: string
  reply_to_id: string | null
  content: string
  created_at: number
  author_display_name: string | null
  author_username: string | null
  author_avatar: string | null
  reply_author_display_name: string | null
  reply_author_username: string | null
}

/** 作品评论列表（二级回复） */
promptGalleryRoutes.get('/items/:id/comments', async (c) => {
  const user = c.get('user')
  const adminUser = c.get('adminUser')
  const isAdmin = adminUser?.role === 'admin' || user?.role === 'admin'
  const itemId = c.req.param('id')

  const res = await c.env.DB.prepare(
    `SELECT
      gc.id,
      gc.item_id,
      gc.user_id,
      gc.reply_to_id,
      gc.content,
      gc.created_at,
      u.display_name AS author_display_name,
      u.username AS author_username,
      oa.avatar_url AS author_avatar,
      pu.display_name AS reply_author_display_name,
      pu.username AS reply_author_username
    FROM gallery_comments gc
    LEFT JOIN users u ON u.id = gc.user_id
    LEFT JOIN oauth_accounts oa ON oa.user_id = gc.user_id AND oa.provider = 'wechat_open'
    LEFT JOIN gallery_comments pgc ON pgc.id = gc.reply_to_id
    LEFT JOIN users pu ON pu.id = pgc.user_id
    WHERE gc.item_id = ? AND gc.status = 'visible'
    ORDER BY gc.created_at ASC
    LIMIT 120`
  )
    .bind(itemId)
    .all<CommentQueryRow>()

  const comments: GalleryCommentDTO[] = (res.results || []).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    userId: row.user_id,
    authorName: (row.author_display_name || row.author_username || '创作者').trim(),
    authorAvatar: row.author_avatar || null,
    replyToId: row.reply_to_id || null,
    replyToAuthorName: row.reply_to_id
      ? (row.reply_author_display_name || row.reply_author_username || '创作者').trim()
      : null,
    content: row.content,
    createdAt: row.created_at,
    canDelete: Boolean(isAdmin || (user && user.id === row.user_id)),
  }))

  c.header('Cache-Control', 'no-store')
  return c.json({ items: comments })
})

/** 发表评论 / 回复（带频率限制） */
promptGalleryRoutes.post('/items/:id/comments', requireAuth, async (c) => {
  const user = c.get('user')!
  const itemId = c.req.param('id')

  const target = await c.env.DB.prepare(
    `SELECT id, status FROM gallery_items WHERE id = ?`
  )
    .bind(itemId)
    .first<{ id: string; status: string }>()
  if (!target || target.status !== 'published') {
    return c.json({ error: { message: '画廊作品不存在或暂未公开' } }, 404)
  }

  const rlDescriptors = [
    {
      scope: 'gallery_comment_user',
      identifier: user.id,
      maxAttempts: 6,
      windowMs: 60_000,
      lockMs: 60_000,
    },
  ]
  const rlCheck = await inspectRateLimits(c.env.DB, rlDescriptors)
  if (rlCheck.blocked) {
    return c.json(
      { error: { message: `发言太频繁了，请 ${formatRetryWait(rlCheck.retryAfterSec)}后再试` } },
      429
    )
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const content =
    typeof body.content === 'string'
      ? body.content.replace(/\r\n?/g, '\n').trim()
      : ''
  if (content.length < 1 || content.length > 300) {
    return c.json({ error: { message: '评论字数需在 1 ~ 300 字之间' } }, 400)
  }

  let replyToId: string | null = null
  let replyToAuthorName: string | null = null
  if (typeof body.replyToId === 'string' && body.replyToId.trim()) {
    const parent = await c.env.DB.prepare(
      `SELECT gc.id, u.display_name, u.username
       FROM gallery_comments gc
       LEFT JOIN users u ON u.id = gc.user_id
       WHERE gc.id = ? AND gc.item_id = ? AND gc.status = 'visible'`
    )
      .bind(body.replyToId.trim(), itemId)
      .first<{ id: string; display_name: string | null; username: string | null }>()
    if (parent) {
      replyToId = parent.id
      replyToAuthorName = (parent.display_name || parent.username || '创作者').trim()
    }
  }

  const commentId = crypto.randomUUID()
  const now = Date.now()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO gallery_comments (id, item_id, user_id, reply_to_id, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'visible', ?)`
    ).bind(commentId, itemId, user.id, replyToId, content, now),
    c.env.DB.prepare(
      `UPDATE gallery_items SET comment_count = (SELECT COUNT(*) FROM gallery_comments WHERE item_id = ? AND status = 'visible'), updated_at = ? WHERE id = ?`
    ).bind(itemId, now, itemId),
  ])

  await recordRateLimitHit(c.env.DB, rlDescriptors, rlCheck, now).catch(() => {})

  const countRow = await c.env.DB.prepare(`SELECT comment_count FROM gallery_items WHERE id = ?`)
    .bind(itemId)
    .first<{ comment_count: number }>()

  const comment: GalleryCommentDTO = {
    id: commentId,
    itemId,
    userId: user.id,
    authorName: (user.displayName || user.username || '创作者').trim(),
    authorAvatar: user.avatarUrl || null,
    replyToId,
    replyToAuthorName,
    content,
    createdAt: now,
    canDelete: true,
  }

  return c.json(
    {
      ok: true,
      comment,
      commentCount: Number(countRow?.comment_count ?? 1),
    },
    201
  )
})

/** 删除评论（本人或管理员可删） */
promptGalleryRoutes.delete('/comments/:commentId', requireAuth, async (c) => {
  const user = c.get('user')!
  const adminUser = c.get('adminUser')
  const isAdmin = adminUser?.role === 'admin' || user.role === 'admin'
  const commentId = c.req.param('commentId')

  const row = await c.env.DB.prepare(
    `SELECT id, item_id, user_id, status FROM gallery_comments WHERE id = ?`
  )
    .bind(commentId)
    .first<{ id: string; item_id: string; user_id: string; status: string }>()

  if (!row || row.status !== 'visible') {
    return c.json({ error: { message: '评论不存在或已删除' } }, 404)
  }
  if (row.user_id !== user.id && !isAdmin) {
    return c.json({ error: { message: '无权删除该评论' } }, 403)
  }

  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE gallery_comments SET status = 'deleted' WHERE id = ?`).bind(
      commentId
    ),
    c.env.DB.prepare(
      `UPDATE gallery_items SET comment_count = (SELECT COUNT(*) FROM gallery_comments WHERE item_id = ? AND status = 'visible'), updated_at = ? WHERE id = ?`
    ).bind(row.item_id, now, row.item_id),
  ])

  const countRow = await c.env.DB.prepare(`SELECT comment_count FROM gallery_items WHERE id = ?`)
    .bind(row.item_id)
    .first<{ comment_count: number }>()

  return c.json({
    ok: true,
    commentCount: Number(countRow?.comment_count ?? 0),
  })
})

/** 供 GCP VPS 同步服务拉取已启用的 X 博主白名单（使用 GALLERY_INGEST_KEY 鉴权） */
promptGalleryRoutes.get('/sync-sources', async (c) => {
  if (!(await isAuthorizedIngestRequest(c))) {
    return c.json({ error: { message: '未授权的同步源查询请求' } }, 401)
  }
  const res = await c.env.DB.prepare(
    `SELECT * FROM x_sync_sources WHERE enabled = 1 ORDER BY updated_at DESC`
  ).all<XSyncSourceRow>()
  return c.json({
    items: (res.results || []).map(mapXSyncSourceRow),
  })
})

promptGalleryRoutes.get('/mine', requireAuth, async (c) => {
  const user = c.get('user')!
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '60') || 60))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const [listRes, countRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM gallery_items WHERE author_user_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(user.id, limit, offset)
      .all<GalleryItemRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM gallery_items WHERE author_user_id = ?`)
      .bind(user.id)
      .first<{ total: number }>(),
  ])

  c.header('Cache-Control', 'no-store')
  return c.json({
    items: (listRes.results || []).map((row) =>
      mapGalleryItemRow(row, { viewerUserId: user.id, isAdmin: user.role === 'admin' })
    ),
    total: countRes?.total ?? 0,
  })
})

promptGalleryRoutes.post('/publish', requireAuth, async (c) => {
  const user = c.get('user')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : ''
  if (!jobId) {
    return c.json({ error: { message: '缺少要分享的作品任务 ID' } }, 400)
  }

  const job = await c.env.DB.prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .bind(jobId)
    .first<JobRow>()

  if (!job) {
    return c.json({ error: { message: '作品记录不存在' } }, 404)
  }
  if (job.user_id !== user.id) {
    return c.json({ error: { message: '只能分享自己创作的作品' } }, 403)
  }
  if (job.status !== 'succeeded' || !job.result_r2_key) {
    return c.json({ error: { message: '仅已成功生成的作品可分享到公共画廊' } }, 400)
  }

  let snapshot: GenerationSnapshot | null = null
  try {
    snapshot = JSON.parse(job.snapshot_json) as GenerationSnapshot
  } catch {
    snapshot = null
  }

  const isPromptMode = snapshot?.generationMode === 'prompt'
  const sourceType: GalleryItemSourceType = isPromptMode ? 'user_t2i' : 'user_recipe'
  const rawTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : ''
  const title =
    rawTitle ||
    (isPromptMode && snapshot?.userPrompt
      ? `${snapshot.userPrompt.replace(/\s+/g, ' ').slice(0, 32)}${snapshot.userPrompt.length > 32 ? '…' : ''}`
      : job.recipe_summary || 'AI 灵感作品')

  const category = normalizeGalleryCategory(
    typeof body.category === 'string' ? body.category : ''
  )
  const tags = normalizeGalleryTags(body.tags)
  const promptPublic = isPromptMode ? body.promptPublic !== false : false

  // 严格边界：仅 user_t2i 存入用户自己输入的提示词；user_recipe 绝不存入内部编译指令
  const promptText = isPromptMode ? (snapshot?.userPrompt || '').trim().slice(0, 3000) : ''
  const promptZh =
    isPromptMode && typeof body.promptZh === 'string'
      ? body.promptZh.trim().slice(0, 3000)
      : ''
  const recipePublicJson =
    !isPromptMode && snapshot
      ? JSON.stringify(buildSanitizedPublicRecipe(snapshot))
      : null

  const existing = await c.env.DB.prepare(
    `SELECT * FROM gallery_items WHERE source_job_id = ? LIMIT 1`
  )
    .bind(job.id)
    .first<GalleryItemRow>()

  if (existing && (existing.status === 'pending' || existing.status === 'published')) {
    return c.json(
      {
        error: {
          message:
            existing.status === 'published'
              ? '该作品已在公共画廊展示，无需重复提交'
              : '该作品正在审核中，请耐心等待管理员审核',
        },
      },
      409
    )
  }

  // 复制成图到公共画廊独立前缀 gallery/public/，与私有目录 generations/<userId>/ 彻底隔离
  const sourceObj = await c.env.BUCKET.get(job.result_r2_key)
  if (!sourceObj || !sourceObj.body) {
    return c.json({ error: { message: '云端原图不存在或已过期，无法分享' } }, 404)
  }
  const mime =
    sourceObj.httpMetadata?.contentType ||
    job.result_mime ||
    'image/png'
  const extFromMime =
    mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/webp'
        ? 'webp'
        : mime === 'image/gif'
          ? 'gif'
          : 'png'
  const keyExtMatch = job.result_r2_key.match(/\.(png|jpe?g|webp|gif)$/i)
  const ext = keyExtMatch ? keyExtMatch[1].toLowerCase().replace('jpeg', 'jpg') : extFromMime

  const now = Date.now()
  const itemId = existing?.id || crypto.randomUUID()
  const publicR2Key = `gallery/public/${itemId}.${ext}`

  // 直接流式复制 R2 对象，避免把整张 4K 成图全量缓冲进 128MB Worker 内存
  const imageBytes = sourceObj.size || 0
  await c.env.BUCKET.put(publicR2Key, sourceObj.body, {
    httpMetadata: { contentType: mime },
    customMetadata: {
      galleryItemId: itemId,
      authorUserId: user.id,
      sourceJobId: job.id,
    },
  })

  if (existing && existing.image_r2_key && existing.image_r2_key !== publicR2Key) {
    await c.env.BUCKET.delete(existing.image_r2_key).catch(() => {})
  }

  const authorName = (user.displayName || user.username || '站内创作者').trim().slice(0, 40)
  const aspectRatio = normalizeGalleryAspectRatio(job.aspect_ratio)

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE gallery_items SET
        status = 'pending',
        author_name = ?,
        title = ?,
        prompt_text = ?,
        prompt_zh = ?,
        prompt_public = ?,
        recipe_public_json = ?,
        aspect_ratio = ?,
        profile_name = ?,
        style_preset = ?,
        image_r2_key = ?,
        thumb_r2_key = ?,
        image_mime = ?,
        image_bytes = ?,
        tags_json = ?,
        category = ?,
        review_note = '',
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at = ?
      WHERE id = ?`
    )
      .bind(
        authorName,
        title,
        promptText,
        promptZh,
        promptPublic ? 1 : 0,
        recipePublicJson,
        aspectRatio,
        job.profile_name || null,
        job.style_preset || 'none',
        publicR2Key,
        publicR2Key,
        mime,
        imageBytes,
        JSON.stringify(tags),
        category,
        now,
        itemId
      )
      .run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO gallery_items (
        id, source_type, status, author_user_id, author_name, source_job_id,
        title, prompt_text, prompt_zh, prompt_public, recipe_public_json,
        aspect_ratio, profile_name, style_preset,
        image_r2_key, thumb_r2_key, image_mime, image_bytes,
        tags_json, category, created_at, updated_at
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        sourceType,
        user.id,
        authorName,
        job.id,
        title,
        promptText,
        promptZh,
        promptPublic ? 1 : 0,
        recipePublicJson,
        aspectRatio,
        job.profile_name || null,
        job.style_preset || 'none',
        publicR2Key,
        publicR2Key,
        mime,
        imageBytes,
        JSON.stringify(tags),
        category,
        now,
        now
      )
      .run()
  }

  const created = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(itemId)
    .first<GalleryItemRow>()

  return c.json(
    {
      ok: true,
      item: created
        ? mapGalleryItemRow(created, { viewerUserId: user.id, isAdmin: user.role === 'admin' })
        : null,
    },
    201
  )
})

promptGalleryRoutes.post('/mine/:id/withdraw', requireAuth, async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()

  if (!row) {
    return c.json({ error: { message: '画廊作品不存在' } }, 404)
  }
  if (row.author_user_id !== user.id) {
    return c.json({ error: { message: '无权操作该画廊作品' } }, 403)
  }

  const now = Date.now()
  await c.env.DB.prepare(
    `UPDATE gallery_items SET status = 'hidden', updated_at = ? WHERE id = ?`
  )
    .bind(now, id)
    .run()

  const updated = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()

  return c.json({
    ok: true,
    item: updated
      ? mapGalleryItemRow(updated, { viewerUserId: user.id, isAdmin: user.role === 'admin' })
      : null,
  })
})

promptGalleryRoutes.delete('/mine/:id', requireAuth, async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(`SELECT * FROM gallery_items WHERE id = ?`)
    .bind(id)
    .first<GalleryItemRow>()

  if (!row) {
    return c.json({ error: { message: '画廊作品不存在' } }, 404)
  }
  if (row.author_user_id !== user.id && user.role !== 'admin') {
    return c.json({ error: { message: '无权删除该画廊作品' } }, 403)
  }

  if (row.image_r2_key) {
    await c.env.BUCKET.delete(row.image_r2_key).catch(() => {})
  }
  if (row.thumb_r2_key && row.thumb_r2_key !== row.image_r2_key) {
    await c.env.BUCKET.delete(row.thumb_r2_key).catch(() => {})
  }
  await c.env.DB.prepare(`DELETE FROM gallery_items WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

/**
 * 供 GCP VPS（Grok Bot X 连接器 / 自建定时同步脚本）推送 X 提示词作品的自动化入库 Webhook。
 * 鉴权：支持管理员会话，或 Header `Authorization: Bearer <GALLERY_INGEST_KEY>` / `X-Gallery-Ingest-Key`。
 */
promptGalleryRoutes.post('/ingest', async (c) => {
  if (!(await isAuthorizedIngestRequest(c))) {
    return c.json({ error: { message: '未授权的画廊入库请求' } }, 401)
  }

  const contentLength = Number(c.req.header('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > 28 * 1024 * 1024) {
    return c.json({ error: { message: '批量入库请求体过大，请分批推送（单次不超过 28MB）' } }, 413)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const rawItems = Array.isArray(body.items) ? body.items : [body]
  if (rawItems.length === 0 || rawItems.length > 20) {
    return c.json({ error: { message: '单次批量入库需包含 1~20 条作品' } }, 400)
  }

  const results: Array<{
    tweetId?: string
    itemId?: string
    status: 'created' | 'skipped_duplicate' | 'failed'
    error?: string
  }> = []

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      results.push({ status: 'failed', error: '条目格式无效' })
      continue
    }
    const rec = raw as Record<string, unknown>
    try {
      const tweetUrlInput = typeof rec.tweetUrl === 'string' ? rec.tweetUrl.trim() : ''
      const tweetIdInput = typeof rec.tweetId === 'string' ? rec.tweetId.trim() : ''
      const parsedTweet = parseXTweetUrl(tweetUrlInput || tweetIdInput)
      const tweetId = parsedTweet?.tweetId || (tweetIdInput ? tweetIdInput.slice(0, 64) : '')
      if (!tweetId) {
        results.push({ status: 'failed', error: '缺少有效的 tweetId 或 tweetUrl' })
        continue
      }

      const dup = await c.env.DB.prepare(
        `SELECT id FROM gallery_items WHERE x_tweet_id = ? LIMIT 1`
      )
        .bind(tweetId)
        .first<{ id: string }>()
      if (dup) {
        results.push({ tweetId, itemId: dup.id, status: 'skipped_duplicate' })
        continue
      }

      const authorHandle = (
        typeof rec.authorHandle === 'string' && rec.authorHandle.trim()
          ? rec.authorHandle.trim()
          : parsedTweet?.handle || ''
      )
        .replace(/^@+/, '')
        .slice(0, 60)

      const authorName = (
        typeof rec.authorName === 'string' && rec.authorName.trim()
          ? rec.authorName.trim()
          : authorHandle
            ? `@${authorHandle}`
            : 'X 提示词博主'
      ).slice(0, 80)

      const authorAvatar =
        typeof rec.authorAvatar === 'string' && rec.authorAvatar.trim().startsWith('https://')
          ? rec.authorAvatar.trim().slice(0, 400)
          : null

      const tweetUrl =
        parsedTweet?.canonicalUrl ||
        (authorHandle
          ? `https://x.com/${authorHandle}/status/${tweetId}`
          : `https://x.com/i/status/${tweetId}`)

      const promptText = cleanTweetTextToPrompt(
        typeof rec.promptText === 'string' ? rec.promptText : ''
      ).slice(0, 3000)
      if (!promptText) {
        results.push({ tweetId, status: 'failed', error: '缺少 promptText' })
        continue
      }

      const promptZh =
        typeof rec.promptZh === 'string' ? rec.promptZh.trim().slice(0, 3000) : ''
      const title = (
        typeof rec.title === 'string' && rec.title.trim()
          ? rec.title.trim()
          : promptZh.split('\n')[0]?.trim() || promptText.split('\n')[0]?.trim() || `${authorName} 作品`
      ).slice(0, 80)

      const itemId = crypto.randomUUID()
      let stored: { r2Key: string; mime: string; bytes: number }

      if (typeof rec.imageBase64 === 'string' && rec.imageBase64.trim()) {
        const cleanB64 = rec.imageBase64.replace(/^data:[^;]+;base64,/, '').trim()
        const bytes = base64ToBytes(cleanB64)
        const detected = detectImageFormat(bytes)
        if (!detected || bytes.byteLength === 0 || bytes.byteLength > 18 * 1024 * 1024) {
          results.push({ tweetId, status: 'failed', error: 'imageBase64 格式无效或体积超限' })
          continue
        }
        const r2Key = `gallery/public/${itemId}.${detected.ext}`
        await c.env.BUCKET.put(r2Key, bytes, {
          httpMetadata: { contentType: detected.mime },
          customMetadata: { galleryItemId: itemId, source: 'x_ingest_base64', tweetId },
        })
        stored = { r2Key, mime: detected.mime, bytes: bytes.byteLength }
      } else if (typeof rec.imageUrl === 'string' && rec.imageUrl.trim()) {
        stored = await downloadExternalImageToGalleryR2(rec.imageUrl.trim(), itemId, c.env)
      } else {
        results.push({ tweetId, status: 'failed', error: '缺少 imageUrl 或 imageBase64' })
        continue
      }

      const width =
        typeof rec.width === 'number' && Number.isFinite(rec.width) && rec.width > 0
          ? Math.trunc(rec.width)
          : null
      const height =
        typeof rec.height === 'number' && Number.isFinite(rec.height) && rec.height > 0
          ? Math.trunc(rec.height)
          : null
      const aspectRatio =
        typeof rec.aspectRatio === 'string' && rec.aspectRatio.trim()
          ? normalizeGalleryAspectRatio(rec.aspectRatio)
          : inferAspectRatioFromDims(width ?? undefined, height ?? undefined)

      // 检查是否在 x_sync_sources 白名单中配置了 auto_publish
      let sourceAutoPublish = false
      if (authorHandle) {
        const sourceRow = await c.env.DB.prepare(
          `SELECT * FROM x_sync_sources WHERE LOWER(handle) = LOWER(?) LIMIT 1`
        )
          .bind(authorHandle)
          .first<XSyncSourceRow>()
        if (sourceRow && sourceRow.enabled === 1 && sourceRow.auto_publish === 1) {
          sourceAutoPublish = true
        }
      }

      const shouldPublish = rec.autoPublish === true || sourceAutoPublish
      const status = shouldPublish ? 'published' : 'pending'
      const now = Date.now()
      const category = normalizeGalleryCategory(
        typeof rec.category === 'string' ? rec.category : ''
      )
      const tags = normalizeGalleryTags(rec.tags)

      await c.env.DB.prepare(
        `INSERT INTO gallery_items (
          id, source_type, status, author_name,
          x_tweet_id, x_author_handle, x_author_name, x_author_avatar, x_tweet_url,
          title, prompt_text, prompt_zh, prompt_public,
          aspect_ratio, width, height,
          image_r2_key, thumb_r2_key, image_mime, image_bytes,
          tags_json, category, is_featured, created_at, updated_at, published_at
        ) VALUES (?, 'x_sync', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          rec.isFeatured === true ? 1 : 0,
          now,
          now,
          shouldPublish ? now : null
        )
        .run()

      if (authorHandle) {
        await c.env.DB.prepare(
          `UPDATE x_sync_sources SET last_tweet_id = ?, last_synced_at = ?, last_error = NULL, updated_at = ? WHERE LOWER(handle) = LOWER(?)`
        )
          .bind(tweetId, now, now, authorHandle)
          .run()
          .catch(() => {})
      }

      results.push({ tweetId, itemId, status: 'created' })
    } catch (err) {
      results.push({
        status: 'failed',
        error: err instanceof Error ? err.message : '入库失败',
      })
    }
  }

  return c.json({
    ok: true,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped_duplicate').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  })
})
