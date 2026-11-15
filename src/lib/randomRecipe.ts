import type { CostumeItem, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'

export type ReferenceSlot = 'portrait' | 'costume' | 'pose'
export type RandomScope = 'similar' | 'other'
export interface ReferencePools { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }

/** Pools are already filtered by the current safety setting. */
export function randomSlot(
  recipe: RecipeState,
  slot: ReferenceSlot,
  scope: RandomScope,
  pools: ReferencePools,
  useDepth: boolean,
  poseFrontOnly = false
): RecipeState | null {
  const current = recipe[slot]
  if (scope === 'similar' && current?.source === 'upload') return null
  let candidates: Array<PortraitItem | CostumeItem | PoseItem>
  if (slot === 'portrait') {
    const selected = recipe.portrait
    const allCandidates = (pools.portraits || []).filter(
      (item) => item.source !== 'upload' && item.id !== current?.id
    )
    const isSameGroup = (item: PortraitItem) =>
      !selected || (item.分区 === selected.分区 && item.发长 === selected.发长)
    if (scope === 'similar') {
      candidates = allCandidates.filter(isSameGroup)
    } else {
      const otherCandidates = selected
        ? allCandidates.filter((item) => !isSameGroup(item))
        : allCandidates
      candidates = otherCandidates.length > 0 ? otherCandidates : allCandidates
    }
  } else if (slot === 'costume') {
    const selected = recipe.costume
    const allCandidates = (pools.costumes || []).filter(
      (item) => item.source !== 'upload' && item.id !== current?.id
    )
    const isSameGroup = (item: CostumeItem) =>
      !selected ||
      (item.source === selected.source &&
        (item.一级分类 || '现实') === (selected.一级分类 || '现实') &&
        item.分类 === selected.分类)
    if (scope === 'similar') {
      candidates = allCandidates.filter(isSameGroup)
    } else {
      const otherCandidates = selected
        ? allCandidates.filter((item) => !isSameGroup(item))
        : allCandidates
      candidates = otherCandidates.length > 0 ? otherCandidates : allCandidates
    }
  } else {
    const selected = recipe.pose
    const allCandidates = (pools.poses || []).filter(
      (item) =>
        item.source !== 'upload' &&
        item.id !== current?.id &&
        (!poseFrontOnly || item.角度 === '正面')
    )
    const isSameGroup = (item: PoseItem) =>
      !selected || (item.体系 === selected.体系 && item.分类 === selected.分类)
    if (scope === 'similar') {
      const baseSimilar = allCandidates.filter(isSameGroup)
      const distinctPose = selected
        ? baseSimilar.filter((item) => item.姿势编号 !== selected.姿势编号 || item.体系 !== selected.体系)
        : baseSimilar
      candidates = distinctPose.length > 0 ? distinctPose : baseSimilar
    } else {
      const otherCandidates = selected
        ? allCandidates.filter((item) => !isSameGroup(item))
        : allCandidates
      const pool = otherCandidates.length > 0 ? otherCandidates : allCandidates
      const distinctPose = selected
        ? pool.filter((item) => item.姿势编号 !== selected.姿势编号 || item.体系 !== selected.体系)
        : pool
      candidates = distinctPose.length > 0 ? distinctPose : pool
    }
  }
  if (!candidates.length) return null
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  return { ...recipe, [slot]: slot === 'pose' ? { ...picked, useDepth } : picked }
}
