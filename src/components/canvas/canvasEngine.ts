import { isContainCostumeSource } from '@/lib/costumeSources'
import { poseImagePath, poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import type { CostumeItem, ExtraReferenceImage, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'
import type {
  CanvasAssetNode,
  CanvasEdge,
  CanvasGroupNode,
  CanvasImageNode,
  CanvasNode,
  CanvasProject,
  CanvasTextNode,
} from './types'

export const CANVAS_PROJECTS_IDB_KEY = 'castdeck_infinite_canvas_projects_v2'

export const OPTICS_PRESETS = [
  {
    name: 'Portra 400 胶片',
    text: 'shot on Kodak Portra 400 medium format film, subtle organic grain, warm halation, 85mm f/1.4 shallow depth of field',
  },
  {
    name: '黄金逆光发丝',
    text: 'warm golden hour sunset rim lighting, glowing translucent hair edges, delicate floating dust motes, rich amber highlights',
  },
  {
    name: '徕卡暗房雕光',
    text: 'sculpted Leica studio key light, obsidian matte background, high-fashion editorial shadow contrast, tack sharp focus',
  },
  {
    name: '35mm 电影宽幅',
    text: 'cinematic 35mm anamorphic film still, atmospheric mist, subtle lens flare, theatrical color grading',
  },
  {
    name: '新海诚清透绘景',
    text: 'refined Japanese anime key visual, luminous painted clouds, crisp delicate linework, expressive sunlit reflections',
  },
] as const

export const ATMOS_PRESETS = [
  {
    name: '雨夜京都石巷',
    text: 'rain-slicked Kyoto stone alley at dusk, warm paper lantern reflections on wet pavement, quiet poetic mood',
  },
  {
    name: '巴黎午后画室',
    text: 'sun-drenched Parisian atelier with tall French windows, linen drapes, architectural shadow geometry',
  },
  {
    name: '东京微雾天台',
    text: 'misty Tokyo rooftop overlooking warm amber city skyline at blue hour, gentle breeze catching fabric',
  },
  {
    name: '新中式金箔厅堂',
    text: 'refined neo-Chinese architectural pavilion, subtle kinpaku gold leaf screen glow, tranquil editorial luxury',
  },
] as const

export function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function getNodeDimensions(node: CanvasNode): { width: number; height: number } {
  if (node.kind === 'group') {
    return { width: Math.max(280, node.width), height: Math.max(220, node.height) }
  }
  if (node.kind === 'text') {
    return { width: 276, height: 196 }
  }
  if (node.kind === 'asset') {
    return { width: 236, height: 276 }
  }
  // image / generator node
  return { width: 320, height: node.resultUrl ? 470 : 374 }
}

export function getPortCoords(
  node: CanvasNode,
  side: 'in' | 'out'
): { x: number; y: number } {
  const { width, height } = getNodeDimensions(node)
  return {
    x: side === 'in' ? node.x : node.x + width,
    y: node.y + Math.min(118, Math.round(height * 0.42)),
  }
}

export function buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(68, Math.abs(x2 - x1) * 0.48)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export function getBezierMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number } {
  const dx = Math.max(68, Math.abs(x2 - x1) * 0.48)
  const cx1 = x1 + dx
  const cx2 = x2 - dx
  // Cubic Bezier evaluated at t = 0.5
  return {
    x: 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2,
    y: 0.125 * y1 + 0.375 * y1 + 0.375 * y2 + 0.125 * y2,
  }
}

/** 防止自由连线形成循环（DAG 校验） */
export function wouldCreateCycle(
  edges: CanvasEdge[],
  fromId: string,
  toId: string
): boolean {
  if (fromId === toId) return true
  const visited = new Set<string>([toId])
  const queue = [toId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    for (const e of edges) {
      if (e.fromId !== curr) continue
      if (e.toId === fromId) return true
      if (!visited.has(e.toId)) {
        visited.add(e.toId)
        queue.push(e.toId)
      }
    }
  }
  return false
}

/** 判断节点中心点是否落在某个编组容器内 */
export function isNodeInsideGroup(node: CanvasNode, group: CanvasGroupNode): boolean {
  if (node.id === group.id || node.kind === 'group') return false
  const dims = getNodeDimensions(node)
  const cx = node.x + dims.width / 2
  const cy = node.y + dims.height / 2
  return (
    cx >= group.x &&
    cx <= group.x + group.width &&
    cy >= group.y &&
    cy <= group.y + group.height
  )
}

export function getGroupMemberIds(group: CanvasGroupNode, nodes: CanvasNode[]): string[] {
  return nodes.filter((n) => isNodeInsideGroup(n, group)).map((n) => n.id)
}

export interface UpstreamPreviewItem {
  nodeId: string
  kind: 'text' | 'image'
  label: string
  thumbUrl?: string
}

export interface ResolvedGenerationInputs {
  combinedPrompt: string
  recipe: RecipeState
  refCount: number
  previews: UpstreamPreviewItem[]
}

/**
 * 收集某个出图节点的全部直连上游节点（若上游为 Group，则自动展开该 Group 内的全部节点）。
 * - 文本节点 → 拼接为 userPrompt
 * - 参考素材节点（姿势/服装/人像/画廊/历史/本地上传）与已出图的图片节点 → 组装为 RecipeState（slot + extraImages）
 */
export function resolveUpstreamInputs(
  targetNode: CanvasImageNode,
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): ResolvedGenerationInputs {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const directSourceIds = edges.filter((e) => e.toId === targetNode.id).map((e) => e.fromId)

  const expandedNodes: CanvasNode[] = []
  const seen = new Set<string>()
  const pushNode = (n: CanvasNode | undefined) => {
    if (!n || n.muted || seen.has(n.id)) return
    seen.add(n.id)
    if (n.kind === 'group') {
      const members = nodes
        .filter((m) => isNodeInsideGroup(m, n) && !m.muted)
        .sort((a, b) => a.y - b.y || a.x - b.x)
      for (const m of members) pushNode(m)
      return
    }
    expandedNodes.push(n)
  }

  for (const sid of directSourceIds) {
    pushNode(nodeMap.get(sid))
  }

  // 按视觉从上到下排序，确保提示词顺序与画布阅读习惯一致
  expandedNodes.sort((a, b) => a.y - b.y || a.x - b.x)

  const promptParts: string[] = []
  const recipe: RecipeState = {
    portrait: null,
    costume: null,
    pose: null,
    extraImages: [],
  }
  const extraImages: ExtraReferenceImage[] = []
  const previews: UpstreamPreviewItem[] = []

  for (const n of expandedNodes) {
    if (n.kind === 'text') {
      const cleaned = n.text.trim()
      if (cleaned) {
        promptParts.push(cleaned)
        previews.push({ nodeId: n.id, kind: 'text', label: n.title })
      }
      continue
    }

    if (n.kind === 'asset') {
      if (n.sourceKind === 'pose' && n.poseItem && !recipe.pose) {
        const useDepth = Boolean(n.useDepth)
        recipe.pose = { ...n.poseItem, useDepth }
        previews.push({
          nodeId: n.id,
          kind: 'image',
          label: n.caption || n.title,
          thumbUrl: poseThumbPath(n.poseItem, useDepth),
        })
      } else if (n.sourceKind === 'costume' && n.costumeItem && !recipe.costume) {
        recipe.costume = n.costumeItem
        previews.push({
          nodeId: n.id,
          kind: 'image',
          label: n.caption || n.title,
          thumbUrl: referenceImageUrl(n.costumeItem.缩略图),
        })
      } else if (n.sourceKind === 'portrait' && n.portraitItem && !recipe.portrait) {
        recipe.portrait = n.portraitItem
        previews.push({
          nodeId: n.id,
          kind: 'image',
          label: n.caption || n.title,
          thumbUrl: referenceImageUrl(n.portraitItem.缩略图),
        })
      } else {
        const url =
          n.sourceKind === 'pose' && n.poseItem
            ? referenceImageUrl(poseImagePath(n.poseItem, Boolean(n.useDepth)))
            : n.fullUrl || n.thumbUrl
        if (url || n.r2Key) {
          extraImages.push({
            id: n.id,
            name: n.caption || n.title,
            url,
            ...(n.r2Key ? { r2Key: n.r2Key } : {}),
          })
          previews.push({
            nodeId: n.id,
            kind: 'image',
            label: n.caption || n.title,
            thumbUrl: n.thumbUrl || url,
          })
        }
      }
      continue
    }

    if (n.kind === 'image' && (n.resultUrl || n.resultR2Key)) {
      extraImages.push({
        id: n.id,
        name: n.title || '上游成图',
        url: n.resultUrl || '',
        ...(n.resultR2Key ? { r2Key: n.resultR2Key } : {}),
      })
      previews.push({
        nodeId: n.id,
        kind: 'image',
        label: n.title || '上游成图',
        thumbUrl: n.resultUrl,
      })
    }
  }

  if (targetNode.localPrompt.trim()) {
    promptParts.push(targetNode.localPrompt.trim())
  }

  recipe.extraImages = extraImages.slice(0, 6)
  const refCount =
    (recipe.pose ? 1 : 0) +
    (recipe.costume ? 1 : 0) +
    (recipe.portrait ? 1 : 0) +
    recipe.extraImages.length

  return {
    combinedPrompt: promptParts.join('，'),
    recipe,
    refCount,
    previews,
  }
}

export function createTextNode(
  x: number,
  y: number,
  role: CanvasTextNode['role'] = 'prompt',
  initialText?: string
): CanvasTextNode {
  if (role === 'optics') {
    const idx = Math.floor(Math.random() * OPTICS_PRESETS.length)
    return {
      id: makeId('txt'),
      kind: 'text',
      role: 'optics',
      title: `光学 · ${OPTICS_PRESETS[idx].name}`,
      text: initialText ?? OPTICS_PRESETS[idx].text,
      presetIndex: idx,
      x: Math.round(x),
      y: Math.round(y),
    }
  }
  if (role === 'atmos') {
    const idx = Math.floor(Math.random() * ATMOS_PRESETS.length)
    return {
      id: makeId('txt'),
      kind: 'text',
      role: 'atmos',
      title: `氛围 · ${ATMOS_PRESETS[idx].name}`,
      text: initialText ?? ATMOS_PRESETS[idx].text,
      presetIndex: idx,
      x: Math.round(x),
      y: Math.round(y),
    }
  }
  return {
    id: makeId('txt'),
    kind: 'text',
    role: 'prompt',
    title: '提示词 · PROMPT',
    text: initialText ?? '',
    x: Math.round(x),
    y: Math.round(y),
  }
}

export function createImageNode(
  x: number,
  y: number,
  overrides: Partial<CanvasImageNode> = {}
): CanvasImageNode {
  return {
    id: makeId('img'),
    kind: 'image',
    title: '出图节点 · RENDER',
    localPrompt: '',
    aspectRatio: '3:4',
    stylePreset: 'none',
    status: 'idle',
    x: Math.round(x),
    y: Math.round(y),
    ...overrides,
  }
}

export function createGroupNode(
  x: number,
  y: number,
  width = 360,
  height = 300,
  title = '素材编组 · GROUP'
): CanvasGroupNode {
  return {
    id: makeId('grp'),
    kind: 'group',
    title,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    accent: '#E5A918',
  }
}

export function createStarterProject(name = '主创作画布 #01'): CanvasProject {
  const subjectNode: CanvasTextNode = {
    id: 'starter-subject',
    kind: 'text',
    role: 'prompt',
    title: '主体 · SUBJECT',
    text: '一位身着炭黑哑光机能风衣与细金饰品的银发少女，微风轻扬发丝，沉静克制的高定杂志半身构图',
    x: 72,
    y: 72,
  }
  const opticsNode: CanvasTextNode = {
    id: 'starter-optics',
    kind: 'text',
    role: 'optics',
    title: `光学 · ${OPTICS_PRESETS[0].name}`,
    text: OPTICS_PRESETS[0].text,
    presetIndex: 0,
    x: 72,
    y: 304,
  }
  const renderA: CanvasImageNode = {
    id: 'starter-render-a',
    kind: 'image',
    title: '分支 A · 胶片质感',
    localPrompt: '',
    aspectRatio: '3:4',
    stylePreset: 'none',
    status: 'idle',
    x: 468,
    y: 120,
  }

  return {
    id: makeId('proj'),
    name,
    updatedAt: Date.now(),
    bgPattern: 'dots',
    pan: { x: 24, y: 16 },
    zoom: 0.96,
    nodes: [subjectNode, opticsNode, renderA],
    edges: [
      { id: 'edge-s1', fromId: subjectNode.id, toId: renderA.id },
      { id: 'edge-s2', fromId: opticsNode.id, toId: renderA.id },
    ],
  }
}

/** 序列化持久化前，清除临时运行时状态（如正在生成中的中断状态），避免重载后卡死 */
export function sanitizeProjectForStorage(project: CanvasProject): CanvasProject {
  return {
    ...project,
    nodes: project.nodes.map((node) => {
      if (node.kind !== 'image') return node
      if (node.status === 'generating') {
        return {
          ...node,
          status: node.resultUrl ? 'succeeded' : 'idle',
          progressPercent: undefined,
          progressMessage: undefined,
        }
      }
      return node
    }),
  }
}

export function createAssetNodeFromExternal(
  partial: Omit<CanvasAssetNode, 'id' | 'kind'>
): CanvasAssetNode {
  return {
    id: makeId('asset'),
    kind: 'asset',
    ...partial,
  }
}

/** 智能避让已有非编组节点，寻找无重叠的干净落点 */
export function findNonOverlappingPosition(
  preferredX: number,
  preferredY: number,
  width: number,
  height: number,
  existingNodes: CanvasNode[],
  gap = 28
): { x: number; y: number } {
  const obstacles = existingNodes.filter((n) => n.kind !== 'group')
  const collides = (cx: number, cy: number) =>
    obstacles.some((n) => {
      const d = getNodeDimensions(n)
      return (
        cx < n.x + d.width + gap &&
        cx + width + gap > n.x &&
        cy < n.y + d.height + gap &&
        cy + height + gap > n.y
      )
    })

  let x = Math.round(preferredX)
  let y = Math.round(preferredY)
  if (!collides(x, y)) return { x, y }

  // 优先沿列向下顺排，超出则向右换列
  for (let col = 0; col < 5; col++) {
    const testX = Math.round(preferredX + col * (width + gap + 24))
    for (let row = 0; row < 10; row++) {
      const testY = Math.round(preferredY + row * (Math.min(height, 260) + gap))
      if (!collides(testX, testY)) return { x: testX, y: testY }
    }
  }
  return { x: x + 48, y: y + 48 }
}

/**
 * DAG 分层智能自动排版（Auto Layout）：
 * 1. 按连线拓扑计算每个节点的层级（左 -> 右）
 * 2. 层内按父节点重心 Y 坐标排序，尽量减少贝塞尔连线交叉
 * 3. 各列垂直居中对齐，并自动重新包裹所有 Group 编组框
 */
export function autoLayoutCanvas(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): CanvasNode[] {
  const contentNodes = nodes.filter((n) => n.kind !== 'group')
  const groupNodes = nodes.filter((n): n is CanvasGroupNode => n.kind === 'group')
  if (contentNodes.length === 0) return nodes

  // 先记录每个编组当前包含的成员，排完后再自适应包裹
  const groupMemberMap = new Map<string, string[]>()
  for (const g of groupNodes) {
    groupMemberMap.set(g.id, getGroupMemberIds(g, nodes))
  }

  const contentSet = new Set(contentNodes.map((n) => n.id))
  const parents = new Map<string, Set<string>>()
  const children = new Map<string, Set<string>>()
  for (const n of contentNodes) {
    parents.set(n.id, new Set())
    children.set(n.id, new Set())
  }

  const expandEndpoint = (id: string): string[] => {
    if (contentSet.has(id)) return [id]
    const members = groupMemberMap.get(id)
    return members && members.length > 0 ? members.filter((m) => contentSet.has(m)) : []
  }

  for (const e of edges) {
    const froms = expandEndpoint(e.fromId)
    const tos = expandEndpoint(e.toId)
    for (const u of froms) {
      for (const v of tos) {
        if (u === v) continue
        children.get(u)?.add(v)
        parents.get(v)?.add(u)
      }
    }
  }

  // 最长路径拓扑分层
  const inDegree = new Map<string, number>()
  const layer = new Map<string, number>()
  for (const n of contentNodes) {
    inDegree.set(n.id, parents.get(n.id)?.size ?? 0)
    layer.set(n.id, 0)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  while (queue.length > 0) {
    const u = queue.shift()!
    const uLayer = layer.get(u) ?? 0
    for (const v of children.get(u) ?? []) {
      const nextLayer = uLayer + 1
      if (nextLayer > (layer.get(v) ?? 0)) {
        layer.set(v, nextLayer)
      }
      const nextDeg = (inDegree.get(v) ?? 1) - 1
      inDegree.set(v, nextDeg)
      if (nextDeg === 0) queue.push(v)
    }
  }

  // 孤立出图节点如果存在输入类节点，统一推到第 1 列以便对齐阅读流
  const hasInputsAtZero = contentNodes.some(
    (n) => (layer.get(n.id) ?? 0) === 0 && n.kind !== 'image'
  )
  if (hasInputsAtZero) {
    for (const n of contentNodes) {
      if (
        n.kind === 'image' &&
        (layer.get(n.id) ?? 0) === 0 &&
        (parents.get(n.id)?.size ?? 0) === 0
      ) {
        layer.set(n.id, 1)
      }
    }
  }

  const columns = new Map<number, CanvasNode[]>()
  for (const n of contentNodes) {
    const col = layer.get(n.id) ?? 0
    const list = columns.get(col) ?? []
    list.push(n)
    columns.set(col, list)
  }

  const sortedColIndices = Array.from(columns.keys()).sort((a, b) => a - b)
  const kindOrder: Record<CanvasNode['kind'], number> = {
    asset: 0,
    text: 1,
    image: 2,
    group: 3,
  }

  const colGap = 112
  const rowGap = 34
  const startX = 72
  const startY = 72

  const placedY = new Map<string, number>()
  const colWidths = new Map<number, number>()
  const colHeights = new Map<number, number>()

  for (const colIdx of sortedColIndices) {
    const colNodes = columns.get(colIdx) ?? []
    colNodes.sort((a, b) => {
      const aParents = Array.from(parents.get(a.id) ?? [])
        .map((pid) => placedY.get(pid))
        .filter((v): v is number => v !== undefined)
      const bParents = Array.from(parents.get(b.id) ?? [])
        .map((pid) => placedY.get(pid))
        .filter((v): v is number => v !== undefined)
      const aBary =
        aParents.length > 0 ? aParents.reduce((s, v) => s + v, 0) / aParents.length : a.y
      const bBary =
        bParents.length > 0 ? bParents.reduce((s, v) => s + v, 0) / bParents.length : b.y
      if (Math.abs(aBary - bBary) > 4) return aBary - bBary
      if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind]
      return a.y - b.y
    })

    let maxW = 0
    let totalH = 0
    for (let i = 0; i < colNodes.length; i++) {
      const d = getNodeDimensions(colNodes[i])
      maxW = Math.max(maxW, d.width)
      placedY.set(colNodes[i].id, totalH + d.height / 2)
      totalH += d.height + (i < colNodes.length - 1 ? rowGap : 0)
    }
    colWidths.set(colIdx, maxW)
    colHeights.set(colIdx, totalH)
  }

  const maxColHeight = Math.max(360, ...Array.from(colHeights.values()))
  const nextCoords = new Map<string, { x: number; y: number }>()
  let cursorX = startX

  for (const colIdx of sortedColIndices) {
    const colNodes = columns.get(colIdx) ?? []
    const colH = colHeights.get(colIdx) ?? 0
    let cursorY = startY + Math.round(Math.max(0, (maxColHeight - colH) / 2))

    for (const n of colNodes) {
      const d = getNodeDimensions(n)
      nextCoords.set(n.id, { x: Math.round(cursorX), y: Math.round(cursorY) })
      cursorY += d.height + rowGap
    }
    cursorX += (colWidths.get(colIdx) ?? 280) + colGap
  }

  const updatedContentMap = new Map<string, CanvasNode>()
  for (const n of contentNodes) {
    const pos = nextCoords.get(n.id)
    updatedContentMap.set(n.id, pos ? { ...n, x: pos.x, y: pos.y } : n)
  }

  const updatedGroups = groupNodes.map((g) => {
    const members = (groupMemberMap.get(g.id) ?? [])
      .map((id) => updatedContentMap.get(id))
      .filter((m): m is CanvasNode => Boolean(m))
    if (members.length === 0) return g

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of members) {
      const d = getNodeDimensions(m)
      minX = Math.min(minX, m.x)
      minY = Math.min(minY, m.y)
      maxX = Math.max(maxX, m.x + d.width)
      maxY = Math.max(maxY, m.y + d.height)
    }
    return {
      ...g,
      x: Math.round(minX - 32),
      y: Math.round(minY - 56),
      width: Math.round(maxX - minX + 64),
      height: Math.round(maxY - minY + 88),
    }
  })

  return [
    ...updatedGroups,
    ...contentNodes.map((n) => updatedContentMap.get(n.id) ?? n),
  ]
}

export type CanvasWorkflowTemplateId =
  | 'ab-style'
  | 'outfit-swap'
  | 'turnaround'
  | 'storyboard-4'

export interface CanvasWorkflowTemplateMeta {
  id: CanvasWorkflowTemplateId
  code: string
  title: string
  subtitle: string
  badge: string
}

export const CANVAS_WORKFLOW_TEMPLATES: CanvasWorkflowTemplateMeta[] = [
  {
    id: 'ab-style',
    code: 'T01',
    title: '双画风 A/B 并发对照',
    subtitle: '共享同一主体设定，左右两路独立挂载光学氛围并同时生图比对。',
    badge: '2 路并发',
  },
  {
    id: 'outfit-swap',
    code: 'T02',
    title: '同角多套换装试衣间',
    subtitle: '锁定同一人物颜模与动作姿势，分支挂载两套服饰资产一键对比换装。',
    badge: '换装对比',
  },
  {
    id: 'turnaround',
    code: 'T03',
    title: '角色三视角定妆设定',
    subtitle: '主造型设定拆分为正面全身、侧面轮廓与背面服饰三路并行出图。',
    badge: '三视图',
  },
  {
    id: 'storyboard-4',
    code: 'T04',
    title: '电影感分镜四连拍',
    subtitle: '统一世界观与 35mm 光学基调，四格景别递进生成完整短片分镜。',
    badge: '4 格分镜',
  },
]

export interface TemplateSamplePool {
  pose?: PoseItem | null
  costumes?: CostumeItem[]
  portrait?: PortraitItem | null
}

export function buildWorkflowTemplateProject(
  templateId: CanvasWorkflowTemplateId,
  samples: TemplateSamplePool = {}
): CanvasProject {
  const now = Date.now()
  if (templateId === 'outfit-swap') {
    const nodes: CanvasNode[] = []
    const edges: CanvasEdge[] = []

    const portraitAsset: CanvasAssetNode | null = samples.portrait
      ? {
          id: makeId('asset'),
          kind: 'asset',
          sourceKind: 'portrait',
          title: '固定颜模 · PORTRAIT',
          caption: samples.portrait.标题 || samples.portrait.发型名称 || '人像参考',
          thumbUrl: referenceImageUrl(samples.portrait.缩略图),
          fullUrl: referenceImageUrl(samples.portrait.原图),
          portraitItem: samples.portrait,
          x: 72,
          y: 72,
        }
      : null

    const poseAsset: CanvasAssetNode | null = samples.pose
      ? {
          id: makeId('asset'),
          kind: 'asset',
          sourceKind: 'pose',
          title: '固定动作 · POSE',
          caption: `${samples.pose.姿势名称}${samples.pose.角度 ? ` · ${samples.pose.角度}` : ''}`,
          thumbUrl: poseThumbPath(samples.pose, false),
          fullUrl: referenceImageUrl(poseImagePath(samples.pose, false)),
          contain: true,
          poseItem: samples.pose,
          useDepth: false,
          x: 72,
          y: 382,
        }
      : null

    const fallbackSubject: CanvasTextNode | null =
      !portraitAsset && !poseAsset
        ? {
            id: makeId('txt'),
            kind: 'text',
            role: 'prompt',
            title: '固定角色主体',
            text: '清冷气质黑长直东亚少女，全身站姿棚拍定妆，柔光质感肤色',
            x: 72,
            y: 220,
          }
        : null

    const baseAnchors: CanvasNode[] = []
    if (portraitAsset) baseAnchors.push(portraitAsset)
    if (poseAsset) baseAnchors.push(poseAsset)
    if (fallbackSubject) baseAnchors.push(fallbackSubject)
    nodes.push(...baseAnchors)

    const costumeA = samples.costumes?.[0]
    const costumeB = samples.costumes?.[1] ?? samples.costumes?.[0]

    const lookA: CanvasNode = costumeA
      ? {
          id: makeId('asset'),
          kind: 'asset',
          sourceKind: 'costume',
          title: '穿搭方案 A',
          caption: costumeA.服装名称,
          thumbUrl: referenceImageUrl(costumeA.缩略图),
          fullUrl: referenceImageUrl(costumeA.原图),
          contain: isContainCostumeSource(costumeA.source),
          costumeItem: costumeA,
          x: 420,
          y: 72,
        }
      : createTextNode(420, 72, 'prompt', '穿搭 A：米白羊绒长风衣配炭黑百褶裙与皮质短靴，利落通勤高定')

    const lookB: CanvasNode = costumeB
      ? {
          id: makeId('asset'),
          kind: 'asset',
          sourceKind: 'costume',
          title: '穿搭方案 B',
          caption: costumeB.服装名称,
          thumbUrl: referenceImageUrl(costumeB.缩略图),
          fullUrl: referenceImageUrl(costumeB.原图),
          contain: isContainCostumeSource(costumeB.source),
          costumeItem: costumeB,
          x: 420,
          y: 390,
        }
      : createTextNode(420, 390, 'prompt', '穿搭 B：新中式墨黑提花盘扣马甲配暗金丝绸阔腿裤，东方极简时装')

    const renderA = createImageNode(780, 60, {
      title: '换装成片 A',
      localPrompt: '完整全身画报构图，干净暖灰影棚背景，精准还原服饰剪裁与材质细节',
      aspectRatio: '3:4',
    })
    const renderB = createImageNode(780, 460, {
      title: '换装成片 B',
      localPrompt: '完整全身画报构图，干净暖灰影棚背景，精准还原服饰剪裁与材质细节',
      aspectRatio: '3:4',
    })

    nodes.push(lookA, lookB, renderA, renderB)
    for (const anchor of baseAnchors) {
      edges.push({ id: makeId('edge'), fromId: anchor.id, toId: renderA.id })
      edges.push({ id: makeId('edge'), fromId: anchor.id, toId: renderB.id })
    }
    edges.push({ id: makeId('edge'), fromId: lookA.id, toId: renderA.id })
    edges.push({ id: makeId('edge'), fromId: lookB.id, toId: renderB.id })

    return {
      id: makeId('proj'),
      name: '模板 · 多套换装试衣间',
      updatedAt: now,
      bgPattern: 'dots',
      pan: { x: 24, y: 16 },
      zoom: 0.78,
      nodes: autoLayoutCanvas(nodes, edges),
      edges,
    }
  }

  if (templateId === 'turnaround') {
    const core = createTextNode(
      72,
      200,
      'prompt',
      '角色定妆设定：身着深靛蓝暗纹织锦短外套、金属搭扣腰封与米白利落长裤的年轻东方旅人，配精致护腕与短靴，统一纯净浅暖白棚拍背景'
    )
    core.title = '核心角色设定'
    const optics = createTextNode(72, 430, 'optics', OPTICS_PRESETS[2].text)
    optics.title = `光学 · ${OPTICS_PRESETS[2].name}`

    const front = createImageNode(460, 40, {
      title: '视角 01 · 正面全身定妆',
      localPrompt: 'front full-body character turnaround sheet view, neutral standing pose, crisp garment structure',
      aspectRatio: '3:4',
    })
    const side = createImageNode(460, 440, {
      title: '视角 02 · 侧面轮廓剪影',
      localPrompt: 'side profile full-body character sheet view, clean silhouette, matching outfit and proportions',
      aspectRatio: '3:4',
    })
    const back = createImageNode(460, 840, {
      title: '视角 03 · 背面衣褶细节',
      localPrompt: 'back three-quarter full-body character sheet view, showing back embroidery, collar and drapery details',
      aspectRatio: '3:4',
    })

    const nodes: CanvasNode[] = [core, optics, front, side, back]
    const edges: CanvasEdge[] = [
      { id: makeId('edge'), fromId: core.id, toId: front.id },
      { id: makeId('edge'), fromId: core.id, toId: side.id },
      { id: makeId('edge'), fromId: core.id, toId: back.id },
      { id: makeId('edge'), fromId: optics.id, toId: front.id },
      { id: makeId('edge'), fromId: optics.id, toId: side.id },
      { id: makeId('edge'), fromId: optics.id, toId: back.id },
    ]
    return {
      id: makeId('proj'),
      name: '模板 · 角色三视角定妆',
      updatedAt: now,
      bgPattern: 'grid',
      pan: { x: 24, y: 16 },
      zoom: 0.72,
      nodes: autoLayoutCanvas(nodes, edges),
      edges,
    }
  }

  if (templateId === 'storyboard-4') {
    const world = createTextNode(
      72,
      140,
      'prompt',
      '雨夜旧东京霓虹天台，身穿长款炭黑风衣的银发侦探手持复古胶片机，青蓝冷调夜雨与暖金街灯交织'
    )
    world.title = '世界观与主角'
    const cinema = createTextNode(72, 380, 'optics', OPTICS_PRESETS[3].text)
    cinema.title = `光学 · ${OPTICS_PRESETS[3].name}`

    const shot1 = createImageNode(460, 40, {
      title: '分镜 01 · 远景入场',
      localPrompt: 'wide establishing shot, lone figure standing on rain-soaked rooftop overlooking amber city skyline',
      aspectRatio: '16:9',
    })
    const shot2 = createImageNode(460, 440, {
      title: '分镜 02 · 中景回眸',
      localPrompt: 'medium tracking shot, wind catching trench coat, turning toward camera under neon reflections',
      aspectRatio: '16:9',
    })
    const shot3 = createImageNode(880, 40, {
      title: '分镜 03 · 眼部特写',
      localPrompt: 'dramatic close-up portrait, raindrops on glass lens, golden bokeh reflecting in sharp eyes',
      aspectRatio: '16:9',
    })
    const shot4 = createImageNode(880, 440, {
      title: '分镜 04 · 逆光尾声',
      localPrompt: 'cinematic backlit silhouette walking into misty alley glow, poetic film ending frame',
      aspectRatio: '16:9',
    })

    const nodes: CanvasNode[] = [world, cinema, shot1, shot2, shot3, shot4]
    const edges: CanvasEdge[] = [
      { id: makeId('edge'), fromId: world.id, toId: shot1.id },
      { id: makeId('edge'), fromId: cinema.id, toId: shot1.id },
      { id: makeId('edge'), fromId: world.id, toId: shot2.id },
      { id: makeId('edge'), fromId: cinema.id, toId: shot2.id },
      { id: makeId('edge'), fromId: shot1.id, toId: shot3.id },
      { id: makeId('edge'), fromId: cinema.id, toId: shot3.id },
      { id: makeId('edge'), fromId: shot2.id, toId: shot4.id },
      { id: makeId('edge'), fromId: cinema.id, toId: shot4.id },
    ]
    return {
      id: makeId('proj'),
      name: '模板 · 电影分镜四连拍',
      updatedAt: now,
      bgPattern: 'dots',
      pan: { x: 24, y: 16 },
      zoom: 0.68,
      nodes: autoLayoutCanvas(nodes, edges),
      edges,
    }
  }

  // 默认：ab-style 双画风并发对照
  const subject = createTextNode(
    72,
    220,
    'prompt',
    '一位佩戴极细金属耳饰、身穿垂坠感亚麻风衣的东方青年，立于老建筑回廊下自然侧身，克制沉静的杂志人物肖像'
  )
  subject.title = '共享主体 · SUBJECT'

  const moodA = createTextNode(420, 60, 'optics', OPTICS_PRESETS[0].text)
  moodA.title = `分支 A 光学 · ${OPTICS_PRESETS[0].name}`

  const moodB = createTextNode(420, 340, 'atmos', ATMOS_PRESETS[3].text)
  moodB.title = `分支 B 氛围 · ${ATMOS_PRESETS[3].name}`

  const branchA = createImageNode(790, 40, {
    title: '分支 A · 胶片写实',
    localPrompt: '自然暖窗漫射光，细腻胶片颗粒',
    aspectRatio: '3:4',
  })
  const branchB = createImageNode(790, 450, {
    title: '分支 B · 金箔暗房',
    localPrompt: '高对比雕塑光影，博物馆级画册质感',
    aspectRatio: '3:4',
  })

  const nodes: CanvasNode[] = [subject, moodA, moodB, branchA, branchB]
  const edges: CanvasEdge[] = [
    { id: makeId('edge'), fromId: subject.id, toId: branchA.id },
    { id: makeId('edge'), fromId: moodA.id, toId: branchA.id },
    { id: makeId('edge'), fromId: subject.id, toId: branchB.id },
    { id: makeId('edge'), fromId: moodB.id, toId: branchB.id },
  ]
  return {
    id: makeId('proj'),
    name: '模板 · 双画风 A/B 对照',
    updatedAt: now,
    bgPattern: 'dots',
    pan: { x: 24, y: 16 },
    zoom: 0.78,
    nodes: autoLayoutCanvas(nodes, edges),
    edges,
  }
}
