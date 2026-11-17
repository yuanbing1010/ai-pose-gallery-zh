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
    id: 'purple',
    colorName: '紫色',
    hex: '#6366F1',
    glowHex: '#A5B4FC',
    softBgClass: 'bg-[#6366F1]/12 dark:bg-[#818CF8]/20',
    ringClass: 'border-[#6366F1]/45 dark:border-[#818CF8]/45',
    textClass: 'text-[#4338CA] dark:text-[#A5B4FC]',
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
]

export function getBrushPalette(index: number): BrushPalette {
  const safe = ((index % BRUSH_PALETTES.length) + BRUSH_PALETTES.length) % BRUSH_PALETTES.length
  return BRUSH_PALETTES[safe]
}

export function formatBrushCode(index: number): string {
  const num = Math.max(1, index + 1)
  return `NO.${String(num).padStart(2, '0')}`
}
