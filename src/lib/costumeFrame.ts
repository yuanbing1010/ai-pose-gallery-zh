import type { CostumeItem } from '@/types/gallery'

export type CostumeStyleTab = 'all' | 'realistic' | 'anime' | 'historical'

export const COSTUME_STYLE_TABS = [
  { id: 'all' as const, label: '全部穿搭', count: '3.2K' },
  { id: 'realistic' as const, label: '现实写真', count: '1.4K' },
  { id: 'anime' as const, label: '动漫次元', count: '1.8K' },
  { id: 'historical' as const, label: '中国历代', count: '57' },
] as const

/**
 * 判断服装所属的四大风格板块，避免来源与分类冲突混淆：
 * - 现实写真：Gia 现代时尚穿搭 + 霧島澪设计档案
 * - 动漫次元：Gia 动漫服装 + CharaDB
 * - 中国历代：Shisei 4 视角历代服饰
 */
export function matchCostumeStyle(item: CostumeItem, tab: CostumeStyleTab): boolean {
  if (tab === 'all') return true
  if (tab === 'historical') return item.source === 'shisei'
  if (tab === 'anime') {
    return item.source === 'charadb' || item.source === 'gia-anime' || item.一级分类 === '二次元'
  }
  if (tab === 'realistic') {
    return (!item.source || item.source === 'mio') && item.一级分类 !== '二次元'
  }
  return true
}
