import type { CostumeItem, CostumeView } from './studio'

export const OUTFIT_DB_ORIGIN = 'https://sleepyzone.online/outfit-db-cn/'
export const OUTFIT_DB_DATA_URL = 'https://sleepyzone.online/outfit-db-cn/data.js'
export const OUTFIT_DB_REPO_URL = 'https://github.com/sleepy-zone/outfit-db-cn'
export const OUTFIT_DB_AUTHOR_NAME = 'ChiHAL'
export const OUTFIT_DB_AUTHOR_HANDLE = '@chihal_ai0509'
export const OUTFIT_DB_AUTHOR_URL = 'https://x.com/chihal_ai0509'
export const OUTFIT_DB_SOURCE_LABEL = 'ChiHAL · 服装档案'
export const OUTFIT_DB_COPYRIGHT_NOTICE =
  '设计与图片版权归原作者 ChiHAL（@chihal_ai0509）所有，中文检索整理源自 sleepyzone.online/outfit-db-cn；缩略图与预览图由原站在线加载，原图请前往原作者 X 主页或原站点获取，仅限学习与艺术创作参考，请勿二次分发图片本体或用于商业再发布。'

export interface RawOutfitDbColor {
  n?: string
  hex?: string
}

export interface RawOutfitDbSection {
  k?: string
  t?: string
}

export interface RawOutfitDbItem {
  id?: string
  num?: string | number
  name?: string
  nameZh?: string
  date?: string
  formula?: string
  formulaZh?: string
  family?: string
  styles?: string[]
  colors?: RawOutfitDbColor[]
  pieces?: string[]
  items?: string
  note?: string
  use?: string
  board?: string
  preview?: string
  looks?: string[]
  looksPreview?: string[]
  sections?: RawOutfitDbSection[]
  chars?: number
  post?: string
}

export interface RawOutfitDb {
  title?: string
  updated?: string
  source?: {
    name?: string
    handle?: string
    url?: string
  }
  families?: Array<{ k?: string; n?: number }>
  items?: RawOutfitDbItem[]
}

export interface TransformedOutfitDb {
  updated: string
  familyCount: number
  costumes: CostumeItem[]
}

const FAMILY_CATEGORY_MAP: Record<string, string> = {
  高定裁缝: '通勤与职场',
  暗黑朋克: '哥特与暗黑',
  学院运动: '运动',
  夜场华丽: '礼服与派对',
}

export function resolveOutfitDbAssetUrl(relPath: unknown): string | null {
  if (typeof relPath !== 'string') return null
  const clean = relPath.trim().replace(/^\/+/, '').split('?')[0].split('#')[0]
  if (!clean || clean.includes('..') || clean.includes('\\')) return null
  if (!/^[a-zA-Z0-9_./-]+$/.test(clean)) return null
  return `${OUTFIT_DB_ORIGIN}${clean}`
}

export function resolveOutfitDbPostUrl(rawUrl: unknown, num: string): string {
  if (typeof rawUrl === 'string') {
    const trimmed = rawUrl.trim()
    try {
      const parsed = new URL(trimmed)
      if (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'x.com' ||
          parsed.hostname === 'twitter.com' ||
          parsed.hostname === 'sleepyzone.online')
      ) {
        return parsed.toString()
      }
    } catch {
      // fallback below
    }
  }
  return num ? `${OUTFIT_DB_ORIGIN}#${num}` : OUTFIT_DB_ORIGIN
}

export function parseOutfitDbScript(rawText: string): RawOutfitDb {
  const trimmed = rawText.trim()
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as RawOutfitDb
  }
  const markerIdx = trimmed.indexOf('OUTFIT_DB')
  const searchFrom = markerIdx >= 0 ? markerIdx : 0
  const start = trimmed.indexOf('{', searchFrom)
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('上游 data.js 格式异常：未找到 OUTFIT_DB JSON 对象')
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as RawOutfitDb
}

export function classifyOutfitDbCategory(family: unknown): string {
  const clean = typeof family === 'string' ? family.trim() : ''
  if (!clean) return '创意穿搭'
  return FAMILY_CATEGORY_MAP[clean] || clean
}

function buildOutfitDbViews(item: RawOutfitDbItem): CostumeView[] {
  const views: CostumeView[] = []
  const boardThumb = resolveOutfitDbAssetUrl(item.board)
  const boardPreview = resolveOutfitDbAssetUrl(item.preview) || boardThumb
  if (boardThumb && boardPreview) {
    views.push({
      id: 'front',
      label: '规格板',
      缩略图: boardThumb,
      预览图: boardPreview,
      原图: boardPreview,
    })
  }

  const looks = Array.isArray(item.looks) ? item.looks : []
  const looksPreview = Array.isArray(item.looksPreview) ? item.looksPreview : []
  const lookCount = Math.max(looks.length, looksPreview.length)
  for (let i = 0; i < lookCount; i += 1) {
    const thumb = resolveOutfitDbAssetUrl(looks[i]) || resolveOutfitDbAssetUrl(looksPreview[i])
    const prev = resolveOutfitDbAssetUrl(looksPreview[i]) || thumb
    if (!thumb || !prev) continue
    views.push({
      id: views.length === 0 ? 'front' : `look-${i + 1}`,
      label: `试穿 ${i + 1}`,
      缩略图: thumb,
      预览图: prev,
      原图: prev,
    })
  }
  return views
}

function dedupeTrimmed(values: Array<unknown>, maxCount: number): string[] {
  const out: string[] = []
  for (const val of values) {
    if (typeof val !== 'string') continue
    const clean = val.trim()
    if (clean && !out.includes(clean)) {
      out.push(clean)
      if (out.length >= maxCount) break
    }
  }
  return out
}

export function transformOutfitDbPayload(raw: RawOutfitDb): TransformedOutfitDb {
  const rawItems = Array.isArray(raw?.items) ? raw.items : []
  const costumes: CostumeItem[] = []
  const families = new Set<string>()
  let maxDate = typeof raw?.updated === 'string' ? raw.updated.trim() : ''

  for (const item of rawItems) {
    const views = buildOutfitDbViews(item)
    if (views.length === 0) continue

    const itemDate = typeof item.date === 'string' ? item.date.trim() : ''
    if (itemDate && itemDate > maxDate) {
      maxDate = itemDate
    }

    const numRaw = String(item.num ?? '').trim()
    const rawId = String(item.id || (numRaw ? `CH${numRaw}` : '')).trim()
    if (!rawId) continue
    const num = numRaw || rawId.replace(/^CH/i, '')
    const fullId = `outfit-db-${rawId}`

    const family = typeof item.family === 'string' ? item.family.trim() : ''
    if (family) families.add(family)
    const category = classifyOutfitDbCategory(family)

    const nameZh = typeof item.nameZh === 'string' ? item.nameZh.trim() : ''
    const nameEn = typeof item.name === 'string' ? item.name.trim() : ''
    const title = nameZh || nameEn || (num ? `ChiHAL #${num}` : fullId)

    const styles = Array.isArray(item.styles) ? item.styles : []
    const pieces = Array.isArray(item.pieces) ? item.pieces : []
    const colorNames = (Array.isArray(item.colors) ? item.colors : []).map((c) => c?.n || '')
    const tags = dedupeTrimmed([category, family, ...styles, ...pieces, ...colorNames], 14)

    const formula = typeof item.formula === 'string' ? item.formula.trim() : ''
    const formulaZh = typeof item.formulaZh === 'string' ? item.formulaZh.trim() : ''
    const summaryItems = typeof item.items === 'string' ? item.items.trim() : ''
    const note = typeof item.note === 'string' ? item.note.trim() : ''
    const use = typeof item.use === 'string' ? item.use.trim() : ''
    const sectionText = (Array.isArray(item.sections) ? item.sections : [])
      .map((s) => `${s?.k || ''} ${s?.t || ''}`.trim())
      .filter(Boolean)
      .join(' ')

    const keywords = [formula, nameEn, summaryItems, ...pieces]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ')

    const desc = [formulaZh, summaryItems, note].filter(Boolean).join('；')
    const primary = views[0]

    const searchParts = [
      fullId,
      rawId,
      num ? `No.${num}` : '',
      num,
      title,
      nameEn,
      category,
      family,
      formulaZh,
      formula,
      ...tags,
      summaryItems,
      note,
      use,
      sectionText,
      OUTFIT_DB_AUTHOR_NAME,
      OUTFIT_DB_AUTHOR_HANDLE,
      OUTFIT_DB_SOURCE_LABEL,
    ].filter(Boolean)

    costumes.push({
      id: fullId,
      source: 'outfit-db',
      一级分类: '现实',
      分类: category,
      服装名称: title,
      标签: tags,
      关键词: keywords || title,
      缩略图: primary.缩略图,
      预览图: primary.预览图,
      原图: primary.原图,
      selectedView: primary.id,
      views,
      来源: OUTFIT_DB_SOURCE_LABEL,
      来源地址: num ? `${OUTFIT_DB_ORIGIN}#${num}` : OUTFIT_DB_ORIGIN,
      原帖地址: resolveOutfitDbPostUrl(item.post, num),
      ...(desc ? { 描述: desc } : {}),
      检索: searchParts.join(' '),
    })
  }

  return {
    updated: maxDate,
    familyCount: families.size,
    costumes,
  }
}
