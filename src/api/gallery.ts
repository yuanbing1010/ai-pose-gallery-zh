import { queryOptions } from '@tanstack/react-query'
import { MIO_POSE_SYSTEM } from '../../shared/mioArchive'
import type {
  CostumeItem,
  MioGalleryPayload,
  OutfitDbGalleryPayload,
  PortraitItem,
  PoseGroup,
  PoseItem,
} from '@/types/gallery'

export const ANGLES = ['正面', '俯视', '仰视', '侧面', '斜侧', '背面'] as const

export const PREFERRED_POSE_LINE_ORDER = [
  '全身单人・标准系',
  '上半身单人',
  '全身单人・性感系',
  '双人缠绵',
  MIO_POSE_SYSTEM,
] as const

export function buildPoseGroups(items: PoseItem[]): { items: PoseItem[]; groups: PoseGroup[]; lines: string[] } {
  const rawLines = [...new Set(items.map((x) => x.体系))]
  const lines = rawLines.sort((a, b) => {
    const ia = PREFERRED_POSE_LINE_ORDER.indexOf(a as (typeof PREFERRED_POSE_LINE_ORDER)[number])
    const ib = PREFERRED_POSE_LINE_ORDER.indexOf(b as (typeof PREFERRED_POSE_LINE_ORDER)[number])
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  const groupMap = new Map<string, PoseGroup>()
  const groups: PoseGroup[] = []

  for (const item of items) {
    const key = `${item.体系}|${item.姿势编号 || item.id}`
    let group = groupMap.get(key)
    if (!group) {
      group = {
        key,
        system: item.体系,
        number: item.姿势编号,
        name: item.姿势名称,
        category: item.分类,
        items: [],
        angles: {},
        order: [],
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
    if (item.角度 && !group.angles[item.角度]) {
      group.angles[item.角度] = item
    }
  }

  groups.sort((a, b) => lines.indexOf(a.system) - lines.indexOf(b.system) || String(a.number).localeCompare(String(b.number)))
  for (const group of groups) {
    group.order = ANGLES.map((a) => group.angles[a]).filter(Boolean)
    for (const item of group.items) {
      if (!group.order.includes(item)) group.order.push(item)
    }
  }

  return { items, groups, lines }
}

const GALLERY_DATA_VERSION = '20261123'

interface CachedOverlayLoader<T extends { synced?: boolean }> {
  fetch: () => Promise<T | null>
  invalidate: () => void
}

function createOverlayLoader<T extends { synced?: boolean }>(endpoint: string): CachedOverlayLoader<T> {
  let promise: Promise<T | null> | null = null
  let fetchedAt = 0
  return {
    fetch: async () => {
      const now = Date.now()
      if (!promise || now - fetchedAt > 60_000) {
        fetchedAt = now
        promise = (async () => {
          try {
            const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) })
            if (!res.ok) return null
            const payload = (await res.json()) as Partial<T>
            if (!payload?.synced) return null
            return payload as T
          } catch {
            return null
          }
        })()
      }
      return promise
    },
    invalidate: () => {
      promise = null
      fetchedAt = 0
    },
  }
}

const mioOverlay = createOverlayLoader<MioGalleryPayload>('/api/gallery/mio')
const outfitDbOverlay = createOverlayLoader<OutfitDbGalleryPayload>('/api/gallery/outfit-db')

export function invalidateMioGalleryCache(): void {
  mioOverlay.invalidate()
}

export function invalidateOutfitDbGalleryCache(): void {
  outfitDbOverlay.invalidate()
}

export function invalidateExternalGalleryCaches(): void {
  mioOverlay.invalidate()
  outfitDbOverlay.invalidate()
}

async function fetchStaticJson<T>(url: string, fallback?: T): Promise<T> {
  const res = await fetch(`${url}?v=${GALLERY_DATA_VERSION}`)
  if (!res.ok) {
    if (fallback !== undefined) return fallback
    throw new Error(`加载参考库数据失败: HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

function resolveEffectiveExternalList<T extends { id: string }>(
  staticList: T[],
  staticStamp: string | null,
  overlayList: T[] | undefined,
  overlayStamp: string | null | undefined,
  overlaySynced: boolean | undefined
): T[] {
  if (!overlaySynced || !overlayList || overlayList.length === 0) {
    return staticList
  }
  const sStamp = staticStamp || ''
  const oStamp = overlayStamp || ''
  const preferOverlay =
    oStamp > sStamp || (oStamp === sStamp && overlayList.length >= staticList.length)
  if (preferOverlay) return overlayList
  const seen = new Set(staticList.map((item) => item.id))
  const extras = overlayList.filter((item) => !seen.has(item.id))
  return extras.length > 0 ? [...staticList, ...extras] : staticList
}

export interface HomePreviewData {
  generatedAt: string
  counts: {
    poseGroups: number
    poses: number
    depthCapablePoses: number
    costumes: number
    portraits: number
  }
  depthPoses: PoseItem[]
  sampleCostume: CostumeItem | null
  samplePortrait: PortraitItem | null
}

/** 首页轻量预览数据包（~5KB），避免首页首屏拉取 4.84MB 全量三库 JSON 阻塞 LCP */
export const homePreviewQuery = queryOptions({
  queryKey: ['gallery', 'home-preview', GALLERY_DATA_VERSION],
  staleTime: Infinity,
  queryFn: async () => {
    return fetchStaticJson<HomePreviewData>('/data/home-preview.json')
  },
})

export const posesQuery = queryOptions({
  queryKey: ['gallery', 'poses', GALLERY_DATA_VERSION],
  staleTime: Infinity,
  queryFn: async () => {
    const [giaPoses, mioStaticPoses, mioSourceMeta, overlay] = await Promise.all([
      fetchStaticJson<PoseItem[]>('/data/pose-zh.json'),
      fetchStaticJson<PoseItem[]>('/data/pose-mio-zh.json', []),
      fetchStaticJson<{ generated?: string }>('/data/mio/source.json', {}),
      mioOverlay.fetch(),
    ])
    const effectiveMio = resolveEffectiveExternalList(
      mioStaticPoses,
      mioSourceMeta.generated || null,
      overlay?.poses,
      overlay?.generated,
      overlay?.synced
    )
    return buildPoseGroups([...giaPoses, ...effectiveMio])
  },
})

export const costumesQuery = queryOptions({
  queryKey: ['gallery', 'costumes', GALLERY_DATA_VERSION],
  staleTime: Infinity,
  queryFn: async () => {
    const [
      giaReal,
      charadb,
      giaAnime,
      shisei,
      mioStaticCostumes,
      mioSourceMeta,
      mioSyncOverlay,
      outfitDbStaticCostumes,
      outfitDbSourceMeta,
      outfitDbSyncOverlay,
    ] = await Promise.all([
      fetchStaticJson<CostumeItem[]>('/data/costume-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-anime-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-gia-anime-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-shisei-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-mio-zh.json', []),
      fetchStaticJson<{ generated?: string }>('/data/mio/source.json', {}),
      mioOverlay.fetch(),
      fetchStaticJson<CostumeItem[]>('/data/costume-outfit-db-zh.json', []),
      fetchStaticJson<{ updated?: string }>('/data/outfit-db/source.json', {}),
      outfitDbOverlay.fetch(),
    ])
    const effectiveMio = resolveEffectiveExternalList(
      mioStaticCostumes,
      mioSourceMeta.generated || null,
      mioSyncOverlay?.costumes,
      mioSyncOverlay?.generated,
      mioSyncOverlay?.synced
    )
    const effectiveOutfitDb = resolveEffectiveExternalList(
      outfitDbStaticCostumes,
      outfitDbSourceMeta.updated || null,
      outfitDbSyncOverlay?.costumes,
      outfitDbSyncOverlay?.updated,
      outfitDbSyncOverlay?.synced
    )
    return [...giaReal, ...charadb, ...giaAnime, ...shisei, ...effectiveMio, ...effectiveOutfitDb]
  },
})

export const portraitsQuery = queryOptions({
  queryKey: ['gallery', 'portraits', GALLERY_DATA_VERSION],
  staleTime: Infinity,
  queryFn: async () => {
    const res = await fetch(`/data/portrait-zh.json?v=${GALLERY_DATA_VERSION}`)
    if (!res.ok) throw new Error(`加载人像数据失败: HTTP ${res.status}`)
    return (await res.json()) as PortraitItem[]
  },
})
