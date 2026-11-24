import { Hono } from 'hono'
import { requireAuth } from '../middleware'
import type { AppEnv } from '../types'

const MAX_PROJECTS_PER_USER = 30
const MAX_PAYLOAD_BYTES = 512 * 1024
const ALLOWED_BG_PATTERNS = new Set(['dots', 'grid', 'blank'])
const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/

interface CanvasProjectRow {
  id: string
  user_id: string
  name: string
  bg_pattern: string
  pan_x: number
  pan_y: number
  zoom: number
  payload_json: string
  node_count: number
  edge_count: number
  created_at: number
  updated_at: number
}

function mapCanvasProjectRow(row: CanvasProjectRow) {
  let nodes: unknown[] = []
  let edges: unknown[] = []
  try {
    const parsed = JSON.parse(row.payload_json) as { nodes?: unknown; edges?: unknown }
    if (Array.isArray(parsed.nodes)) nodes = parsed.nodes
    if (Array.isArray(parsed.edges)) edges = parsed.edges
  } catch {
    // 损坏 JSON 自动降级为空画布，不阻塞加载
  }

  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    bgPattern: ALLOWED_BG_PATTERNS.has(row.bg_pattern) ? row.bg_pattern : 'dots',
    pan: {
      x: Number.isFinite(row.pan_x) ? row.pan_x : 80,
      y: Number.isFinite(row.pan_y) ? row.pan_y : 60,
    },
    zoom: Number.isFinite(row.zoom) ? Math.min(2, Math.max(0.25, row.zoom)) : 0.92,
    nodes,
    edges,
  }
}

export const canvasRoutes = new Hono<AppEnv>()

canvasRoutes.use('*', requireAuth)

canvasRoutes.get('/projects', async (c) => {
  const user = c.get('user')!
  const res = await c.env.DB.prepare(
    `SELECT id, user_id, name, bg_pattern, pan_x, pan_y, zoom, payload_json,
            node_count, edge_count, created_at, updated_at
     FROM canvas_projects
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`
  )
    .bind(user.id, MAX_PROJECTS_PER_USER)
    .all<CanvasProjectRow>()

  c.header('Cache-Control', 'no-store')
  return c.json({
    projects: (res.results || []).map(mapCanvasProjectRow),
  })
})

canvasRoutes.put('/projects/:id', async (c) => {
  const user = c.get('user')!
  const projectId = (c.req.param('id') || '').trim()
  if (!PROJECT_ID_RE.test(projectId)) {
    return c.json({ error: { message: '画布项目 ID 格式非法' } }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式错误' } }, 400)
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  const name = (rawName || '未命名画布').slice(0, 80)
  const rawBg = typeof body.bgPattern === 'string' ? body.bgPattern : 'dots'
  const bgPattern = ALLOWED_BG_PATTERNS.has(rawBg) ? rawBg : 'dots'

  const panObj =
    body.pan && typeof body.pan === 'object' ? (body.pan as Record<string, unknown>) : {}
  const panX = Number.isFinite(Number(panObj.x)) ? Number(panObj.x) : 80
  const panY = Number.isFinite(Number(panObj.y)) ? Number(panObj.y) : 60
  const zoomRaw = Number(body.zoom)
  const zoom = Number.isFinite(zoomRaw) ? Math.min(2, Math.max(0.25, zoomRaw)) : 0.92

  const nodes = Array.isArray(body.nodes) ? body.nodes : []
  const edges = Array.isArray(body.edges) ? body.edges : []
  if (nodes.length > 200 || edges.length > 500) {
    return c.json({ error: { message: '单个画布最多支持 200 个节点与 500 条连线' } }, 400)
  }

  const payloadJson = JSON.stringify({ nodes, edges })
  if (new TextEncoder().encode(payloadJson).byteLength > MAX_PAYLOAD_BYTES) {
    return c.json({ error: { message: '画布数据体积超出 512KB 上限，请精简后再同步' } }, 413)
  }

  const existing = await c.env.DB.prepare(
    `SELECT created_at FROM canvas_projects WHERE user_id = ? AND id = ?`
  )
    .bind(user.id, projectId)
    .first<{ created_at: number }>()

  if (!existing) {
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM canvas_projects WHERE user_id = ?`
    )
      .bind(user.id)
      .first<{ cnt: number }>()
    if ((countRow?.cnt ?? 0) >= MAX_PROJECTS_PER_USER) {
      return c.json(
        { error: { message: `云端最多保存 ${MAX_PROJECTS_PER_USER} 个画布项目，请先清理旧项目` } },
        400
      )
    }
  }

  const now = Date.now()
  const rawUpdatedAt = Number(body.updatedAt)
  const updatedAt =
    Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0 && rawUpdatedAt <= now + 60_000
      ? Math.trunc(rawUpdatedAt)
      : now
  const createdAt = existing?.created_at ?? now

  await c.env.DB.prepare(
    `INSERT INTO canvas_projects (
      id, user_id, name, bg_pattern, pan_x, pan_y, zoom, payload_json,
      node_count, edge_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, id) DO UPDATE SET
      name = excluded.name,
      bg_pattern = excluded.bg_pattern,
      pan_x = excluded.pan_x,
      pan_y = excluded.pan_y,
      zoom = excluded.zoom,
      payload_json = excluded.payload_json,
      node_count = excluded.node_count,
      edge_count = excluded.edge_count,
      updated_at = excluded.updated_at`
  )
    .bind(
      projectId,
      user.id,
      name,
      bgPattern,
      panX,
      panY,
      zoom,
      payloadJson,
      nodes.length,
      edges.length,
      createdAt,
      updatedAt
    )
    .run()

  c.header('Cache-Control', 'no-store')
  return c.json({
    ok: true,
    project: {
      id: projectId,
      name,
      updatedAt,
      bgPattern,
      pan: { x: panX, y: panY },
      zoom,
      nodes,
      edges,
    },
  })
})

canvasRoutes.delete('/projects/:id', async (c) => {
  const user = c.get('user')!
  const projectId = (c.req.param('id') || '').trim()
  if (!PROJECT_ID_RE.test(projectId)) {
    return c.json({ error: { message: '画布项目 ID 格式非法' } }, 400)
  }

  await c.env.DB.prepare(`DELETE FROM canvas_projects WHERE user_id = ? AND id = ?`)
    .bind(user.id, projectId)
    .run()

  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true })
})
