import poseBoundsRaw from '@/data/poseBounds.json'

export const POSE_THUMB_WIDTH = 300
export const POSE_THUMB_HEIGHT = 400

const POSE_BOUNDS = poseBoundsRaw as Record<string, number[]>

export interface PoseFrameBounds {
  y1: number
  y2: number
  cropH: number
}

/**
 * 根据姿势缩略图的实际人体边界，计算不截断任何肢体的紧凑展示窗口。
 * 站姿自然呈现修长比例，坐姿呈现中等比例，卧姿呈现紧凑横向比例。
 */
export function getPoseFrameBounds(poseId: string, minSpan = 160, pad = 16): PoseFrameBounds {
  const raw = POSE_BOUNDS[poseId]
  if (!raw || raw.length < 2) {
    return { y1: 0, y2: POSE_THUMB_HEIGHT, cropH: POSE_THUMB_HEIGHT }
  }
  const [minY, maxY] = raw
  let y1 = Math.max(0, minY - pad)
  let y2 = Math.min(POSE_THUMB_HEIGHT, maxY + pad)

  if (y2 - y1 < minSpan) {
    const center = (minY + maxY) / 2
    y1 = Math.max(0, Math.round(center - minSpan / 2))
    y2 = Math.min(POSE_THUMB_HEIGHT, y1 + minSpan)
    if (y2 - y1 < minSpan) {
      y1 = Math.max(0, y2 - minSpan)
    }
  }

  return { y1, y2, cropH: Math.max(1, y2 - y1) }
}
