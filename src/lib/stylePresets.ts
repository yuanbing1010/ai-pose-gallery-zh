import animeImg from '@/assets/styles/anime.webp'
import anime90sImg from '@/assets/styles/anime_90s.webp'
import celAnimeImg from '@/assets/styles/cel_anime.webp'
import chibiBoxImg from '@/assets/styles/chibi_box.webp'
import claymationImg from '@/assets/styles/claymation.webp'
import disneyImg from '@/assets/styles/disney.webp'
import filmImg from '@/assets/styles/film.webp'
import ghibliImg from '@/assets/styles/ghibli.webp'
import mangaImg from '@/assets/styles/manga.webp'
import realisticImg from '@/assets/styles/realistic.webp'
import render3dImg from '@/assets/styles/render3d.webp'
import semiRealImg from '@/assets/styles/semi_real.webp'
import webtoonImg from '@/assets/styles/webtoon.webp'
import { STYLE_PRESETS } from '@/services/aiGenerator'

export interface StyleVisualMeta {
  shortLabel: string
  tagline: string
  preview?: string
}

export const STYLE_VISUAL_META: Record<string, StyleVisualMeta> = {
  none: {
    shortLabel: '跟随原图',
    tagline: '不叠加预设画风，忠实跟随参考图原本质感',
  },
  realistic: {
    shortLabel: '写实写真',
    tagline: '85mm 人像镜头 · 自然柔光与真实肌理',
    preview: realisticImg,
  },
  film: {
    shortLabel: '复古胶片',
    tagline: '35mm 富士胶片 · 暖调光晕与细腻颗粒',
    preview: filmImg,
  },
  semi_real: {
    shortLabel: '2.5D原画',
    tagline: '半写实厚涂 · 华丽戏剧光影与布料质感',
    preview: semiRealImg,
  },
  anime: {
    shortLabel: '二次元',
    tagline: '赛璐璐与厚涂结合 · 色彩通透干净',
    preview: animeImg,
  },
  cel_anime: {
    shortLabel: '新海诚风',
    tagline: '清澈天空 · 体积光与发丝高光',
    preview: celAnimeImg,
  },
  ghibli: {
    shortLabel: '吉卜力系',
    tagline: '手绘水彩背景 · 温暖日光与治愈色彩',
    preview: ghibliImg,
  },
  anime_90s: {
    shortLabel: '90日漫',
    tagline: '复古赛璐璐 · 暖调怀旧质感与线条',
    preview: anime90sImg,
  },
  webtoon: {
    shortLabel: '韩系网漫',
    tagline: '清透水光肌 · 唯美柔光与利落勾线',
    preview: webtoonImg,
  },
  manga: {
    shortLabel: '黑白漫画',
    tagline: 'G笔利落线稿 · 45° 网点纸高对比',
    preview: mangaImg,
  },
  disney: {
    shortLabel: '迪士尼',
    tagline: '3D 动画电影 · 灵动眼神与暖金逆光',
    preview: disneyImg,
  },
  render3d: {
    shortLabel: '3D渲染',
    tagline: 'UE5 / Octane · 次表面散射与电影布光',
    preview: render3dImg,
  },
  chibi_box: {
    shortLabel: '潮玩手办',
    tagline: 'PVC 涂装质感 · 柔光箱微距景深',
    preview: chibiBoxImg,
  },
  claymation: {
    shortLabel: '黏土定格',
    tagline: '手工黏土肌理 · 毛毡织物与移轴微距',
    preview: claymationImg,
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

export interface VisualStyleItem {
  key: string
  label: string
  shortLabel: string
  tagline: string
  preview?: string
}

export function getVisualStylePresets(): VisualStyleItem[] {
  return Object.entries(STYLE_PRESETS)
    .filter(([key]) => key !== 'none')
    .map(([key, info]) => {
      const meta = getStyleVisualMeta(key)
      return {
        key,
        label: info.label,
        shortLabel: meta.shortLabel,
        tagline: meta.tagline,
        preview: meta.preview,
      }
    })
}
