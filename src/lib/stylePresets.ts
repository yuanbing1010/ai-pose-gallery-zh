import {
  NONE_STYLE_PRESET,
  getEffectiveStyleCatalog,
  getEffectiveStyleCategories,
  getEffectiveStyleSubcategories,
  type PlatformConfig,
  type StyleCategoryItem,
  type StylePresetItem,
  type StyleSubcategoryItem,
} from '../../shared/studio'

export interface StyleVisualMeta {
  shortLabel: string
  tagline: string
  preview?: string
}

const NONE_STYLE_VISUAL_META: StyleVisualMeta = {
  shortLabel: '跟随原图',
  tagline: '不叠加预设画风，忠实跟随参考图原本质感',
}

export function getStyleVisualMeta(
  key: string,
  styleItem?: StylePresetItem | null
): StyleVisualMeta {
  if (key === 'none') {
    return NONE_STYLE_VISUAL_META
  }

  return {
    shortLabel: styleItem?.shortLabel?.trim() || styleItem?.label || key,
    tagline: styleItem?.tagline?.trim() || styleItem?.prompt || '',
    preview: styleItem?.previewUrl?.trim() || undefined,
  }
}

export interface VisualStyleItem {
  key: string
  categoryId: string
  categoryLabel: string
  subcategoryId: string
  subcategoryLabel: string
  label: string
  shortLabel: string
  tagline: string
  prompt: string
  negativePrompt?: string
  preview?: string
}

export interface StyleTaxonomySubcategoryNode extends StyleSubcategoryItem {
  count: number
}

export interface StyleTaxonomyCategoryNode extends StyleCategoryItem {
  count: number
  subcategories: StyleTaxonomySubcategoryNode[]
}

export function getVisualStylePresets(
  platform?: Partial<PlatformConfig> | null
): VisualStyleItem[] {
  const categories = getEffectiveStyleCategories(platform)
  const subcategories = getEffectiveStyleSubcategories(platform)
  const catLabelMap = new Map(categories.map((c) => [c.id, c.label]))
  const subLabelMap = new Map(subcategories.map((s) => [s.id, s.label]))
  const items = getEffectiveStyleCatalog(platform)
  return items.map((item) => {
    const meta = getStyleVisualMeta(item.id, item)
    return {
      key: item.id,
      categoryId: item.categoryId,
      categoryLabel: catLabelMap.get(item.categoryId) || '未分类',
      subcategoryId: item.subcategoryId,
      subcategoryLabel: subLabelMap.get(item.subcategoryId) || '未细分',
      label: item.label,
      shortLabel: meta.shortLabel,
      tagline: meta.tagline,
      prompt: item.prompt.trim(),
      negativePrompt: item.negativePrompt?.trim() || undefined,
      preview: meta.preview,
    }
  })
}

export function getNoneStyleLabel(): string {
  return NONE_STYLE_PRESET.label
}

export function getStyleTaxonomyTree(
  platform?: Partial<PlatformConfig> | null
): StyleTaxonomyCategoryNode[] {
  const categories = getEffectiveStyleCategories(platform)
  const subcategories = getEffectiveStyleSubcategories(platform)
  const styles = getEffectiveStyleCatalog(platform)

  const catCounts = new Map<string, number>()
  const subCounts = new Map<string, number>()
  for (const s of styles) {
    catCounts.set(s.categoryId, (catCounts.get(s.categoryId) ?? 0) + 1)
    subCounts.set(s.subcategoryId, (subCounts.get(s.subcategoryId) ?? 0) + 1)
  }

  return categories.map((cat) => ({
    ...cat,
    count: catCounts.get(cat.id) ?? 0,
    subcategories: subcategories
      .filter((sub) => sub.categoryId === cat.id)
      .map((sub) => ({
        ...sub,
        count: subCounts.get(sub.id) ?? 0,
      })),
  }))
}
