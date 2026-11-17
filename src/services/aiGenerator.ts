import type { PoseSanitizeConfig, RecipeState } from '@/types/gallery'
import { poseImagePath, referenceImageUrl } from '@/lib/recipeImages'
import {
  sanitizeCloudTextSegment,
  sanitizePoseTitleForCloud,
} from '../../shared/studio'
export {
  NONE_STYLE_PRESET,
  PROVIDER_META,
  buildRecipePrompt,
  mergeSceneNote,
  sanitizeCloudTextSegment,
  sanitizePoseTitleForCloud,
} from '../../shared/studio'

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxSide = 1024
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * scale)
        c.height = Math.round(img.height * scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('解析图片失败'))
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] || 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`加载图片失败: ${src}`))
    img.src = referenceImageUrl(src)
  })
}

export async function stitchRecipeCanvas(
  recipe: RecipeState,
  options?: { sanitizeForCloud?: boolean; poseSanitize?: Partial<PoseSanitizeConfig> | null }
): Promise<string> {
  const sanitizeForCloud = Boolean(options?.sanitizeForCloud)
  const poseSanitize = options?.poseSanitize
  const list: Array<{ tag: string; sub: string; src: string }> = []
  let idx = 1

  if (recipe.pose) {
    const poseName = sanitizeForCloud
      ? sanitizePoseTitleForCloud(recipe.pose, poseSanitize) || '姿势参考'
      : recipe.pose.姿势名称
    list.push({
      tag: `图${idx++} · 姿势`,
      sub: `${poseName}（${recipe.pose.角度}${recipe.pose.useDepth ? ' · 深度图' : ''}）`,
      src: poseImagePath(recipe.pose),
    })
  }
  if (recipe.costume) {
    const cat = sanitizeForCloud
      ? sanitizeCloudTextSegment(recipe.costume.分类, poseSanitize)
      : recipe.costume.分类
    const name = sanitizeForCloud
      ? sanitizeCloudTextSegment(recipe.costume.服装名称, poseSanitize) || '服装参考'
      : recipe.costume.服装名称
    list.push({
      tag: `图${idx++} · 服装`,
      sub: cat ? `${cat} · ${name}` : name,
      src: recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图,
    })
  }
  if (recipe.portrait) {
    const title = sanitizeForCloud
      ? sanitizeCloudTextSegment(recipe.portrait.标题, poseSanitize) || '人像参考'
      : recipe.portrait.标题
    list.push({
      tag: `图${idx++} · 人像`,
      sub: title,
      src: recipe.portrait.原图 || recipe.portrait.缩略图,
    })
  }
  for (const extra of recipe.extraImages || []) {
    const extraName = sanitizeForCloud
      ? sanitizeCloudTextSegment(extra.name, poseSanitize) || '附加参考图'
      : extra.name || '自定义参考图'
    list.push({
      tag: `图${idx++} · 附加`,
      sub: extraName,
      src: extra.url,
    })
  }

  if (!list.length) {
    throw new Error('请至少选择或上传 1 张参考图')
  }

  const imgs = await Promise.all(list.map((x) => loadImage(x.src)))
  const cardW = 480
  const cardH = 640
  const pad = 20
  const headH = 62
  const canvas = document.createElement('canvas')
  canvas.width = list.length * cardW + (list.length + 1) * pad
  canvas.height = cardH + headH + pad * 2
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#111318'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  imgs.forEach((img, i) => {
    const x = pad + i * (cardW + pad)
    const y = pad
    ctx.fillStyle = '#1e222b'
    ctx.fillRect(x, y, cardW, cardH + headH)
    ctx.fillStyle = '#f4f5f7'
    ctx.fillRect(x, y + headH, cardW, cardH)

    const scale = Math.min(cardW / img.width, cardH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, x + (cardW - dw) / 2, y + headH + (cardH - dh) / 2, dw, dh)

    ctx.fillStyle = '#a1a1aa'
    ctx.font = '600 12px Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillText(list[i].tag, x + 14, y + 23)

    ctx.fillStyle = '#ffffff'
    ctx.font = '700 15px Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillText(list[i].sub.slice(0, 26), x + 14, y + 46)
  })

  return canvas.toDataURL('image/jpeg', 0.92)
}
