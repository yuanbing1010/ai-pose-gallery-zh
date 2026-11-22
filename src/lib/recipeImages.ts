import type { CostumeItem, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'
export { hasPoseDepthMap, poseImagePath, poseThumbPath, referenceImageUrl } from '../../shared/studio'

export function uploadedReferences(
  name: string,
  url: string,
  width: number,
  height: number,
  bytes: number,
  r2Key?: string
) {
  const base = {
    id: crypto.randomUUID(),
    source: 'upload' as const,
    r2Key,
    原图: url,
    缩略图: url,
    检索: name,
  }
  const portrait: PortraitItem = {
    ...base,
    分区: '上传',
    发长: '',
    发型名称: name,
    标题: name,
    宽: width,
    高: height,
    字节数: bytes,
    精选: false,
    热门: false,
  }
  const costume: CostumeItem = {
    ...base,
    分类: '上传',
    服装名称: name,
    标签: [],
    关键词: '',
    预览图: url,
  }
  const pose: PoseItem = {
    ...base,
    体系: '上传',
    姿势编号: '',
    分类: '上传',
    姿势名称: name,
    角度: '',
  }
  return { portrait, costume, pose }
}

export function downloadFileName(baseName: string, url: string, fallbackExt = 'png'): string {
  const safeBase =
    baseName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .slice(0, 80) || 'image'
  let ext = fallbackExt
  if (/^data:image\/([a-z0-9+.-]+);/i.test(url)) {
    const raw = RegExp.$1.toLowerCase()
    ext = raw === 'jpeg' ? 'jpg' : raw
  } else if (url) {
    const cleanPath = url.split('?')[0].split('#')[0]
    const match = cleanPath.match(/\.([a-z0-9]{2,5})$/i)
    if (match) {
      const candidate = match[1].toLowerCase()
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(candidate)) {
        ext = candidate === 'jpeg' ? 'jpg' : candidate
      }
    }
  }
  return `${safeBase}.${ext}`
}

export function recipeBackup(recipe: RecipeState): RecipeState {
  return {
    portrait: recipe.portrait?.source === 'upload' && !recipe.portrait.r2Key ? null : recipe.portrait,
    costume: recipe.costume?.source === 'upload' && !recipe.costume.r2Key ? null : recipe.costume,
    pose: recipe.pose?.source === 'upload' && !recipe.pose.r2Key ? null : recipe.pose,
    extraImages: (recipe.extraImages || []).filter((img) => !img.url.startsWith('data:')),
  }
}
