import costumeBoundsRaw from '@/data/costumeBounds.json'
import type { CostumeItem } from '@/types/gallery'

const COSTUME_BOUNDS = costumeBoundsRaw as Record<string, number[]>

export interface CostumeFrameBounds {
  y1: number
  y2: number
  cropH: number
  width: number
  height: number
}

/**
 * 根据服装图片的实际衣物/人体边界，计算不截断头部与鞋履脚部的展示窗口。
 * 严格对齐姿势库的截断逻辑：y1 对齐头颈/顶端，y2 覆盖鞋底/下缘，绝不切断脚部。
 */
export function getCostumeFrameBounds(item: CostumeItem, pad = 12): CostumeFrameBounds {
  let raw = COSTUME_BOUNDS[item.id]
  if (!raw && item.id.startsWith('gia-anime-')) {
    raw = COSTUME_BOUNDS[item.id.replace('gia-anime-', '')]
  }

  const origW = raw?.[2] || (item.source === 'charadb' ? 420 : item.source === 'shisei' ? 300 : 360)
  const origH = raw?.[3] || (item.source === 'charadb' ? 630 : item.source === 'shisei' ? 400 : 540)
  const minY = raw ? raw[0] : 16
  const maxY = raw ? raw[1] : origH - 6

  const y1 = Math.max(0, minY - pad)
  const y2 = Math.min(origH, maxY + pad)
  const cropH = Math.max(1, y2 - y1)

  return { y1, y2, cropH, width: origW, height: origH }
}
