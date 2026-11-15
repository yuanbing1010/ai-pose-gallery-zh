import type { GenerationHistoryItem } from '@/types/gallery'
import { poseImagePath, referenceImageUrl } from './recipeImages'

export interface ComparisonReference {
  id: string
  label: string
  url: string
}

/** Only the submitted record supplies references; never consult the current editor. */
export function comparisonReferences(result: GenerationHistoryItem): ComparisonReference[] {
  const snapshot = result.snapshot
  if (!snapshot?.recipe) return []
  const { recipe } = snapshot
  const refs: ComparisonReference[] = []
  const add = (id: string, label: string, url?: string) => {
    if (url) refs.push({ id, label, url: referenceImageUrl(url) })
  }
  if (recipe.portrait) {
    add('portrait', `人像 · ${recipe.portrait.标题}`, recipe.portrait.原图 || recipe.portrait.缩略图)
  }
  if (recipe.costume) {
    add(
      'costume',
      `服装 · ${recipe.costume.服装名称}`,
      recipe.costume.原图 || recipe.costume.预览图 || recipe.costume.缩略图
    )
  }
  if (recipe.pose) {
    add(
      'pose',
      `姿势 · ${recipe.pose.姿势名称}${recipe.pose.useDepth ? '（深度图）' : ''}`,
      poseImagePath(recipe.pose)
    )
  }
  recipe.extraImages?.forEach((image, i) => add(`extra:${i}`, `附加参考 · ${image.name}`, image.url))
  return refs
}
