import { queryOptions } from '@tanstack/react-query'
import { MIO_POSE_SYSTEM } from '../../shared/mioArchive'
import type { CostumeItem, MioGalleryPayload, PortraitItem, PoseGroup, PoseItem } from '@/types/gallery'

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

const GALLERY_DATA_VERSION = '20261119'

let mioOverlayPromise: Promise<MioGalleryPayload | null> | null = null
let mioOverlayFetchedAt = 0

export function invalidateMioGalleryCache(): void {
  mioOverlayPromise = null
  mioOverlayFetchedAt = 0
}

async function fetchStaticJson<T>(url: string, fallback?: T): Promise<T> {
  const res = await fetch(`${url}?v=${GALLERY_DATA_VERSION}`)
  if (!res.ok) {
    if (fallback !== undefined) return fallback
    throw new Error(`加载参考库数据失败: HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

async function fetchSyncedMioOverlay(): Promise<MioGalleryPayload | null> {
  const now = Date.now()
  if (!mioOverlayPromise || now - mioOverlayFetchedAt > 60_000) {
    mioOverlayFetchedAt = now
    mioOverlayPromise = (async () => {
      try {
        const res = await fetch('/api/gallery/mio', { signal: AbortSignal.timeout(4000) })
        if (!res.ok) return null
        const payload = (await res.json()) as Partial<MioGalleryPayload>
        if (!payload?.synced) return null
        return payload as MioGalleryPayload
      } catch {
        return null
      }
    })()
  }
  return mioOverlayPromise
}

function resolveEffectiveMioList<T extends { id: string }>(
  staticList: T[],
  staticGenerated: string | null,
  overlayList: T[] | undefined,
  overlayGenerated: string | null | undefined,
  overlaySynced: boolean | undefined
): T[] {
  if (!overlaySynced || !overlayList || overlayList.length === 0) {
    return staticList
  }
  const sGen = staticGenerated || ''
  const oGen = overlayGenerated || ''
  const preferOverlay = oGen > sGen || (oGen === sGen && overlayList.length >= staticList.length)
  if (preferOverlay) return overlayList
  const seen = new Set(staticList.map((item) => item.id))
  const extras = overlayList.filter((item) => !seen.has(item.id))
  return extras.length > 0 ? [...staticList, ...extras] : staticList
}

export const posesQuery = queryOptions({
  queryKey: ['gallery', 'poses', GALLERY_DATA_VERSION],
  staleTime: Infinity,
  queryFn: async () => {
    const [giaPoses, mioStaticPoses, mioSourceMeta, overlay] = await Promise.all([
      fetchStaticJson<PoseItem[]>('/data/pose-zh.json'),
      fetchStaticJson<PoseItem[]>('/data/pose-mio-zh.json', []),
      fetchStaticJson<{ generated?: string }>('/data/mio/source.json', {}),
      fetchSyncedMioOverlay(),
    ])
    const effectiveMio = resolveEffectiveMioList(
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
    const [giaReal, charadb, giaAnime, shisei, mioStaticCostumes, mioSourceMeta, overlay] = await Promise.all([
      fetchStaticJson<CostumeItem[]>('/data/costume-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-anime-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-gia-anime-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-shisei-zh.json'),
      fetchStaticJson<CostumeItem[]>('/data/costume-mio-zh.json', []),
      fetchStaticJson<{ generated?: string }>('/data/mio/source.json', {}),
      fetchSyncedMioOverlay(),
    ])
    const effectiveMio = resolveEffectiveMioList(
      mioStaticCostumes,
      mioSourceMeta.generated || null,
      overlay?.costumes,
      overlay?.generated,
      overlay?.synced
    )
    return [...giaReal, ...charadb, ...giaAnime, ...shisei, ...effectiveMio]
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
