import type { ProviderModelPublicInfo } from '../../shared/studio'

export type BrushNibStyle = 'round' | 'flat' | 'fine'

export const BRUSH_NIB_LABELS: Record<BrushNibStyle, string> = {
  flat: '宽平精绘锋',
  round: '圆润水彩锋',
  fine: '尖锋速绘笔',
}

export function resolveBrushNibStyle(
  modelOpt: Pick<ProviderModelPublicInfo, 'profileId' | 'displayName' | 'badge'> | null | undefined
): BrushNibStyle {
  if (!modelOpt) return 'round'
  const text = `${modelOpt.profileId} ${modelOpt.displayName} ${modelOpt.badge || ''}`.toLowerCase()
  if (/flash|flare|lite|mini|fast|速|快|草图/.test(text)) return 'fine'
  if (/pro|sunburst|quality|5\.5|5\.0-pro|max|2\.1|精|稳|旗舰/.test(text)) return 'flat'
  return 'round'
}

export interface BrushPalette {
  id: string
  colorName: string
  hex: string
  glowHex: string
  softBgClass: string
  ringClass: string
  textClass: string
}

export const BRUSH_PALETTES: BrushPalette[] = [
  {
    id: 'red',
    colorName: '红色',
    hex: '#D9381E',
    glowHex: '#FF7A59',
    softBgClass: 'bg-[#D9381E]/12 dark:bg-[#FF7A59]/18',
    ringClass: 'border-[#D9381E]/45 dark:border-[#FF7A59]/45',
    textClass: 'text-[#B82914] dark:text-[#FF8A6B]',
  },
  {
    id: 'teal',
    colorName: '青色',
    hex: '#19857B',
    glowHex: '#4FD1C5',
    softBgClass: 'bg-[#19857B]/12 dark:bg-[#4FD1C5]/18',
    ringClass: 'border-[#19857B]/45 dark:border-[#4FD1C5]/45',
    textClass: 'text-[#116E65] dark:text-[#4FD1C5]',
  },
  {
    id: 'amber',
    colorName: '琥珀',
    hex: '#B86B27',
    glowHex: '#E2A463',
    softBgClass: 'bg-[#B86B27]/12 dark:bg-[#E2A463]/20',
    ringClass: 'border-[#B86B27]/45 dark:border-[#E2A463]/45',
    textClass: 'text-[#9A571D] dark:text-[#E4B278]',
  },
  {
    id: 'gold',
    colorName: '金色',
    hex: '#D97706',
    glowHex: '#FBBF24',
    softBgClass: 'bg-[#E5A918]/14 dark:bg-[#FBBF24]/18',
    ringClass: 'border-[#E5A918]/50 dark:border-[#FBBF24]/45',
    textClass: 'text-[#925800] dark:text-[#FBBF24]',
  },
  {
    id: 'pink',
    colorName: '粉色',
    hex: '#DB2777',
    glowHex: '#F472B6',
    softBgClass: 'bg-[#DB2777]/12 dark:bg-[#F472B6]/18',
    ringClass: 'border-[#DB2777]/45 dark:border-[#F472B6]/45',
    textClass: 'text-[#BE185D] dark:text-[#F472B6]',
  },
  {
    id: 'blue',
    colorName: '蓝色',
    hex: '#2563EB',
    glowHex: '#60A5FA',
    softBgClass: 'bg-[#2563EB]/12 dark:bg-[#60A5FA]/18',
    ringClass: 'border-[#2563EB]/45 dark:border-[#60A5FA]/45',
    textClass: 'text-[#1D4ED8] dark:text-[#93C5FD]',
  },
  {
    id: 'violet',
    colorName: '藤紫',
    hex: '#7C3AED',
    glowHex: '#A78BFA',
    softBgClass: 'bg-[#7C3AED]/12 dark:bg-[#A78BFA]/18',
    ringClass: 'border-[#7C3AED]/45 dark:border-[#A78BFA]/45',
    textClass: 'text-[#6D28D9] dark:text-[#C4B5FD]',
  },
  {
    id: 'emerald',
    colorName: '竹绿',
    hex: '#059669',
    glowHex: '#34D399',
    softBgClass: 'bg-[#059669]/12 dark:bg-[#34D399]/18',
    ringClass: 'border-[#059669]/45 dark:border-[#34D399]/45',
    textClass: 'text-[#047857] dark:text-[#6EE7B7]',
  },
  {
    id: 'orange',
    colorName: '橙色',
    hex: '#EA580C',
    glowHex: '#FB923C',
    softBgClass: 'bg-[#EA580C]/12 dark:bg-[#FB923C]/18',
    ringClass: 'border-[#EA580C]/45 dark:border-[#FB923C]/45',
    textClass: 'text-[#C2410C] dark:text-[#FDBA74]',
  },
  {
    id: 'indigo',
    colorName: '靛青',
    hex: '#4338CA',
    glowHex: '#818CF8',
    softBgClass: 'bg-[#4338CA]/12 dark:bg-[#818CF8]/18',
    ringClass: 'border-[#4338CA]/45 dark:border-[#818CF8]/45',
    textClass: 'text-[#3730A3] dark:text-[#A5B4FC]',
  },
]

export function getBrushPalette(index: number): BrushPalette {
  const safe = ((index % BRUSH_PALETTES.length) + BRUSH_PALETTES.length) % BRUSH_PALETTES.length
  return BRUSH_PALETTES[safe]
}

export function formatBrushCode(index: number): string {
  const num = Math.max(1, index + 1)
  return `NO.${String(num).padStart(2, '0')}`
}
