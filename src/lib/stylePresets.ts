import animeImg from '@/assets/styles/anime.webp'
import celAnimeImg from '@/assets/styles/cel_anime.webp'
import chibiBoxImg from '@/assets/styles/chibi_box.webp'
import filmImg from '@/assets/styles/film.webp'
import mangaImg from '@/assets/styles/manga.webp'
import realisticImg from '@/assets/styles/realistic.webp'
import render3dImg from '@/assets/styles/render3d.webp'
import semiRealImg from '@/assets/styles/semi_real.webp'
import { STYLE_PRESETS } from '@/services/aiGenerator'

export interface StyleVisualMeta {
  shortLabel: string
  tagline: string
  preview?: string
}

export const STYLE_VISUAL_META: Record<string, StyleVisualMeta> = {
  realistic: {
    shortLabel: '写实人像写真',
    tagline: '85mm 人像镜头 · 自然柔光与真实肌理',
    preview: realisticImg,
  },
  film: {
    shortLabel: '复古胶片写真',
    tagline: '35mm 富士胶片 · 暖调光晕与细腻颗粒',
    preview: filmImg,
  },
  semi_real: {
    shortLabel: '2.5D 游戏原画',
    tagline: '半写实厚涂 · 华丽戏剧光影与布料质感',
    preview: semiRealImg,
  },
  anime: {
    shortLabel: '日系二次元插画',
    tagline: '赛璐璐平涂与厚涂结合 · 色彩通透干净',
    preview: animeImg,
  },
  cel_anime: {
    shortLabel: '新海诚感动画电影',
    tagline: '新海诚感清澈天空 · 体积光与发丝高光',
    preview: celAnimeImg,
  },
  manga: {
    shortLabel: '日式黑白漫画网点',
    tagline: 'G笔利落线稿 · 45° 网点纸与高对比层次',
    preview: mangaImg,
  },
  render3d: {
    shortLabel: '3D 次世代渲染',
    tagline: 'UE5 / Octane 渲染 · 次表面散射与电影布光',
    preview: render3dImg,
  },
  chibi_box: {
    shortLabel: '3D 潮玩手办',
    tagline: 'PVC 涂装完成品 · 柔光箱微距景深',
    preview: chibiBoxImg,
  },
}

export function getStyleVisualMeta(key: string): StyleVisualMeta {
  return (
    STYLE_VISUAL_META[key] ?? {
      shortLabel: STYLE_PRESETS[key]?.label || key,
      tagline: STYLE_PRESETS[key]?.prompt || '',
    }
  )
}
