export interface StudioPromptChipGroup {
  id: string
  label: string
  chips: Array<{ label: string; text: string }>
}

/** 结构化画面细节灵感词条（按构图、光影、材质与背景拆解，点击快速拼入画面细节） */
export const STUDIO_PROMPT_CHIP_GROUPS: StudioPromptChipGroup[] = [
  {
    id: 'framing',
    label: '构图景别',
    chips: [
      { label: '全身立绘', text: '全身完整出镜，头身比例修长舒展' },
      { label: '七分半身', text: '膝上七分半身构图，突出服饰层次与表情' },
      { label: '近景特写', text: '胸上近景人像特写，聚焦五官神态与发丝细节' },
      { label: '动态透视', text: '轻微仰拍广角透视，强化动作张力与空间纵深' },
    ],
  },
  {
    id: 'lighting',
    label: '光影氛围',
    chips: [
      { label: '棚拍柔光', text: '影棚级柔和漫反射主光，肤色通透自然' },
      { label: '电影逆光', text: '金色侧逆光勾勒发丝与肩部轮廓光' },
      { label: '阴天散射', text: '清冷阴天散射光，低饱和高级灰调与细腻暗部' },
      { label: '霓虹夜色', text: '冷暖双色霓虹环境光在衣料边缘形成高光反射' },
    ],
  },
  {
    id: 'material',
    label: '材质质感',
    chips: [
      { label: '丝绸褶皱', text: '轻盈垂坠丝绸与自然风动衣褶质感' },
      { label: '毛呢厚织', text: '细腻挺括毛呢纹理，清晰缝线与金属纽扣细节' },
      { label: '薄纱层次', text: '半透明轻纱叠穿，保留皮肤透光与叠层细节' },
      { label: '手绘笔触', text: '保留轻盈水彩纸纹与温润手绘笔触质感' },
    ],
  },
  {
    id: 'background',
    label: '背景环境',
    chips: [
      { label: '纯净白底', text: '干净纯粹浅暖白影棚背景，无杂物干扰' },
      { label: '浅灰渐变', text: '极简浅灰无缝影棚渐变背景，柔和地面投影' },
      { label: '街头街景', text: '虚化城市日系街头背景，保留自然景深光斑' },
      { label: '古建庭院', text: '中式园林木构回廊背景，虚化竹影与柔和日照' },
    ],
  },
  {
    id: 'refine',
    label: '微调修饰',
    chips: [
      { label: '锁定五官', text: '严格保持参考人像五官比例、眉眼特征与神态一致' },
      { label: '还原衣型', text: '忠实还原参考服装的剪裁版型、领口袖型与配饰结构' },
      { label: '统一色调', text: '全画面色温与冷暖光影统一协调，避免拼接割裂感' },
      { label: '强化细节', text: '精细刻画发丝走向、手指关节与面料边缘高光细节' },
    ],
  },
]

/** 将选中的灵感词条追加或从当前画面细节中移除（防重复拼接） */
export function toggleSceneNoteChip(current: string, chipText: string): { next: string; added: boolean } {
  const parts = current
    .split(/[，,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const existsIdx = parts.findIndex((part) => part === chipText)
  if (existsIdx >= 0) {
    parts.splice(existsIdx, 1)
    return { next: parts.join('，'), added: false }
  }
  return {
    next: parts.length > 0 ? `${parts.join('，')}，${chipText}` : chipText,
    added: true,
  }
}

/** 格式化单次任务耗时（mm:ss） */
export function formatJobDuration(
  startedAt: number | null | undefined,
  finishedAt: number | null | undefined
): string | null {
  if (!startedAt || !finishedAt || finishedAt < startedAt) return null
  const totalSec = Math.max(1, Math.round((finishedAt - startedAt) / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** 格式化简短时间（MM-DD HH:mm） */
export function formatShortTime(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}`
}

/** 格式化完整时间戳（YYYY/MM/DD HH:mm:ss） */
export function formatFullDateTime(ts: number): string {
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${sec}`
}
