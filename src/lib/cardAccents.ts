export interface CardAccent {
  tilt: string
  ring: string
  beam: string
  jewel: string
  dot: string
  pill: string
  glow: string
}

export const CARD_ACCENT_PALETTES = {
  gold: {
    ring: 'border-[#E5A918]/40',
    beam: 'via-[#E5A918]/80',
    jewel: 'bg-[#E5A918] shadow-[0_0_10px_rgba(229,169,24,0.85)]',
    dot: 'bg-[#E5A918]',
    pill: 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#E5A918] ring-[#E5A918]/35',
    glow: 'from-[#E5A918]/18',
  },
  cyan: {
    ring: 'border-[#4FD1C5]/40',
    beam: 'via-[#4FD1C5]/80',
    jewel: 'bg-[#4FD1C5] shadow-[0_0_10px_rgba(79,209,197,0.85)]',
    dot: 'bg-[#4FD1C5]',
    pill: 'bg-[#4FD1C5]/15 text-[#116E65] dark:text-[#4FD1C5] ring-[#4FD1C5]/35',
    glow: 'from-[#4FD1C5]/18',
  },
  violet: {
    ring: 'border-[#9B4D5B]/40',
    beam: 'via-[#9B4D5B]/80',
    jewel: 'bg-[#9B4D5B] shadow-[0_0_10px_rgba(155,77,91,0.75)]',
    dot: 'bg-[#9B4D5B]',
    pill: 'bg-[#9B4D5B]/12 text-[#7A3442] dark:bg-[#C47380]/18 dark:text-[#E8A3AE] ring-[#9B4D5B]/35',
    glow: 'from-[#9B4D5B]/16',
  },
  amber: {
    ring: 'border-amber-400/40',
    beam: 'via-amber-400/80',
    jewel: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]',
    dot: 'bg-amber-400',
    pill: 'bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300 ring-amber-400/35',
    glow: 'from-amber-400/18',
  },
  crimson: {
    ring: 'border-[#D9381E]/45',
    beam: 'via-[#D9381E]/85',
    jewel: 'bg-[#D9381E] shadow-[0_0_10px_rgba(217,56,30,0.85)]',
    dot: 'bg-[#D9381E]',
    pill: 'bg-[#D9381E]/12 text-[#B82914] dark:text-[#FF7A59] ring-[#D9381E]/35',
    glow: 'from-[#D9381E]/20',
  },
} as const

type PaletteKey = keyof typeof CARD_ACCENT_PALETTES

function withTilt(key: PaletteKey, _tiltSeed = 0): CardAccent {
  return {
    ...CARD_ACCENT_PALETTES[key],
    tilt: '',
  }
}

/**
 * 按姿势动作分类映射灯条颜色：
 * 站姿鎏金 · 坐蹲跪霓虹青 · 卧姿极光紫 · 特写琥珀 · 双人互动朱红
 */
export function getPoseAccent(category: string, system = '', tiltSeed = 0): CardAccent {
  let key: PaletteKey = 'gold'
  if (system.includes('双人缠绵') || /传教士|后入|骑乘|贴身/.test(category)) {
    key = 'crimson'
  } else if (/卧|特殊|芭蕾/.test(category)) {
    key = 'violet'
  } else if (/坐|跪|蹲|瑜伽/.test(category)) {
    key = 'cyan'
  } else if (/可爱|挤胸|贴脸|性感|舞蹈|运动|双人合影/.test(category)) {
    key = 'amber'
  }
  return withTilt(key, tiltSeed)
}

/**
 * 按服装风格/季节分类映射灯条颜色：
 * 春夏运动泳装霓虹青 · 秋冬国风和服鎏金 · 礼服舞台洛丽塔哥特极光紫 · 校园通勤奇幻科幻琥珀 · 贴身性感朱红
 */
export function getCostumeAccent(category: string, _kind = '', tiltSeed = 0): CardAccent {
  let key: PaletteKey = 'gold'
  if (/性感|内衣/.test(category)) {
    key = 'crimson'
  } else if (/礼服|派对|偶像|洛丽塔|地雷|哥特|暗黑|Y2K|辣妹/.test(category)) {
    key = 'violet'
  } else if (/春|夏|泳装|运动|芭蕾/.test(category)) {
    key = 'cyan'
  } else if (/制服|通勤|居家|职业|奇幻|军事|军装|机能|科幻|未来|创意|户外/.test(category)) {
    key = 'amber'
  }
  return withTilt(key, tiltSeed)
}

/**
 * 按人像分区与发长映射灯条颜色：
 * Top 10 热门鎏金 · 正脸参考霓虹青 · 造型氛围极光紫
 */
export function getPortraitAccent(section: string, _hair = '', hot = false, tiltSeed = 0): CardAccent {
  let key: PaletteKey = 'cyan'
  if (hot) {
    key = 'gold'
  } else if (section === '造型氛围') {
    key = 'violet'
  }
  return withTilt(key, tiltSeed)
}
