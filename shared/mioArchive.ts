import type { CostumeItem, PoseItem } from './studio'

export const MIO_ARCHIVE_ORIGIN = 'https://sleepyzone.online/mio-design-archive/'
export const MIO_DATA_URL = 'https://sleepyzone.online/mio-design-archive/data.json'
export const MIO_AUTHOR_NAME = '霧島澪'
export const MIO_AUTHOR_HANDLE = '@Mio_2am'
export const MIO_AUTHOR_URL = 'https://x.com/Mio_2am'
export const MIO_SOURCE_LABEL = '霧島澪 · 设计档案'
export const MIO_POSE_SYSTEM = '霧島澪 · 设计档案'
export const MIO_COPYRIGHT_NOTICE =
  '设计与图片版权归原网站（sleepyzone.online/mio-design-archive）及原作者 霧島澪（@Mio_2am）所有；图片由原站在线加载，仅限学习与艺术创作参考，请勿二次分发图片本体或用于商业再发布。'

export interface RawMioItem {
  no?: number
  id?: string
  name?: string
  tags?: string[]
  tile?: string
  zh?: string
  prompt?: string
  prompt_zh?: string
}

export interface RawMioVolume {
  slug?: string
  series?: string
  vol?: number
  date?: string
  url?: string
  theme_zh?: string
  theme_en?: string
  tags?: string[]
  title?: string
  sheet?: string
  count?: number
  note?: string
  items?: RawMioItem[]
}

export interface RawMioArchive {
  generated?: string
  source?: string
  volumes?: RawMioVolume[]
}

export interface TransformedMioArchive {
  generated: string
  source: string
  poseVolumeCount: number
  costumeVolumeCount: number
  poses: PoseItem[]
  costumes: CostumeItem[]
}

const POSE_NAME_ZH_MAP: Record<string, string> = {
  'tree pose': '树式',
  'triangle pose': '三角式',
  'warrior ii': '战士二式',
  'cobra pose': '眼镜蛇式',
  'camel pose': '骆驼式',
  'bridge pose': '桥式',
  'chair pose': '幻椅式',
  'dancer pose': '舞王式',
  'pigeon pose': '鸽子式',
  'bow pose': '弓式',
  'wheel pose': '轮式',
  'boat pose': '船式',
  'plank pose': '平板支撑',
  'child pose': '婴儿式',
  "child's pose": '婴儿式',
  'lotus pose': '莲花坐',
  'split leap': '劈叉跳',
  'arabesque': '阿拉贝斯克舞姿',
  'attitude': '鹤立舞姿',
  'passé': '单腿立（Passé）',
  'passe': '单腿立（Passé）',
  'pirouette': '单脚旋转',
  'grand jeté': '大跳（Grand Jeté）',
  'grand jete': '大跳（Grand Jeté）',
  'walking together': '并肩行走',
  'selfie pose': '并肩自拍',
  'heart pose': '双人比心',
  'back to back': '背靠背站姿',
  'v sign': '双人比 V 合影',
  'squat pose': '双人并排蹲姿',
  'sitting together': '双人背靠坐',
  'arm around': '双人揽肩合影',
  'relax recline': '双人并排斜倚',
  'sitting chat': '长椅对坐交谈',
  'photo pose': '并肩比 V 合影',
  'stroll side by side': '并肩漫步',
  'relax together': '并排仰靠坐',
  'ready stance': '接球准备姿',
  'ready receive': '接球准备姿',
  'dribble low': '低位运球',
  'hip pop': '顶胯舞姿',
  'side recline': '侧卧撑头',
  'stomach lift': '俯卧撑肘抬腿',
  'prone stretch': '俯卧伸展',
  'reclining arch': '仰卧反弓',
  'knee hug': '坐地抱膝',
  'heel sit': '跪坐脚跟',
  'half kneel': '单膝跪地',
  'kneel reach': '双膝跪地斜伸',
  'fan sit': '分腿展坐',
}

const COSTUME_PROMPT_TAG_RULES: Array<[RegExp, string]> = [
  [/\bblack\b/i, '黑色'],
  [/\bwhite\b|\bivory\b|\bcream\b/i, '白色'],
  [/\bred\b|\bburgundy\b|\bcrimson\b|\bmaroon\b/i, '红色'],
  [/\bpink\b/i, '粉色'],
  [/\bblue\b|\bnavy\b|\bdenim\b/i, '蓝色'],
  [/\bgreen\b|\bmint\b|\bolive\b/i, '绿色'],
  [/\borange\b|\brust\b/i, '橙色'],
  [/\bbrown\b|\btan\b|\bbeige\b|\bcamel\b/i, '棕色'],
  [/\b(?:grey|gray|charcoal)\b/i, '灰色'],
  [/\bgold\b|\bgolden\b/i, '金色'],
  [/\blace\b/i, '蕾丝'],
  [/\bleather\b|\bvinyl\b|\bpatent\b/i, '皮革'],
  [/\bcorset\b/i, '束腰'],
  [/\bmini skirt\b|\bpleated skirt\b|\bskirt\b/i, '半身裙'],
  [/\bdress\b|\bgown\b/i, '连衣裙'],
  [/\bblazer\b|\bsuit\b/i, '西装'],
  [/\bcoat\b|\btrench\b|\bjacket\b/i, '外套'],
  [/\bknit\b|\bsweater\b|\bcardigan\b|\bturtleneck\b/i, '针织'],
  [/\bscarf\b|\bshawl\b/i, '围巾'],
  [/\bboots?\b|\bthigh high boots\b/i, '长靴'],
  [/\bhigh heels\b|\bpumps\b|\bheels\b/i, '高跟鞋'],
  [/\bsneakers?\b/i, '运动鞋'],
  [/\bstockings\b|\btights\b|\bpantyhose\b|\bgarter\b/i, '丝袜'],
  [/\bshorts\b/i, '短裤'],
  [/\bjeans\b|\bpants\b|\btrousers\b|\bsweatpants\b/i, '长裤'],
  [/\bshirt\b|\bblouse\b/i, '衬衫'],
  [/\bt-?shirt\b|\btee\b|\bcrop top\b/i, 'T恤'],
  [/\bjersey\b|\bsports bra\b|\bathleisure\b/i, '运动风'],
  [/\bbodysuit\b|\bcatsuit\b/i, '连体衣'],
  [/\bembroider/i, '刺绣'],
  [/\bplaid\b|\bpinstripe\b/i, '格纹条纹'],
]

export function resolveMioAssetUrl(relPath: unknown): string | null {
  if (typeof relPath !== 'string') return null
  const clean = relPath.trim().replace(/^\/+/, '').split('?')[0].split('#')[0]
  if (!clean || clean.includes('..') || clean.includes('\\')) return null
  if (!/^[a-zA-Z0-9_./-]+$/.test(clean)) return null
  return `${MIO_ARCHIVE_ORIGIN}${clean}`
}

export function resolveMioPostUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return MIO_ARCHIVE_ORIGIN
  const trimmed = rawUrl.trim()
  try {
    const parsed = new URL(trimmed)
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'x.com' ||
        parsed.hostname === 'twitter.com' ||
        parsed.hostname === 'sleepyzone.online')
    ) {
      return parsed.toString()
    }
  } catch {
    // fallback below
  }
  return MIO_ARCHIVE_ORIGIN
}

function splitZhClauses(zh: string): string[] {
  return zh
    .replace(/[。！？；]+$/g, '')
    .split(/[，,；;。]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function joinConciseClauses(clauses: string[], maxLen: number): string {
  const picked: string[] = []
  let len = 0
  for (const part of clauses) {
    const nextLen = len === 0 ? part.length : len + 1 + part.length
    if (picked.length > 0 && nextLen > maxLen) break
    picked.push(part)
    len = nextLen
    if (picked.length >= 2 && len >= 12) break
  }
  return picked.join(' · ')
}

export function buildMioCostumeTitle(vol: RawMioVolume, item: RawMioItem): string {
  const zh = (item.zh || '').trim()
  if (zh) {
    const clauses = splitZhClauses(zh).filter((c, idx) => {
      if (idx === 0 && /^[红黑白灰粉蓝绿紫棕米橙黄银金藏青酒红奶白]+主色$/.test(c)) {
        return false
      }
      return true
    })
    const concise = joinConciseClauses(clauses.length ? clauses : splitZhClauses(zh), 28)
    if (concise) return concise
  }
  const theme = (vol.theme_zh || vol.theme_en || vol.slug || '設計穿搭').trim()
  const name = (item.name || '').trim()
  if (name && !/^Look\s*\d+$/i.test(name)) {
    return `${theme} · ${name}`
  }
  const no = String(item.no ?? 0).padStart(2, '0')
  return `${theme} #${no}`
}

export function buildMioPoseTitle(vol: RawMioVolume, item: RawMioItem): string {
  const rawName = (item.name || '').trim()
  if (rawName && /[\u4e00-\u9fff]/.test(rawName)) {
    return rawName
  }
  if (rawName) {
    const mapped = POSE_NAME_ZH_MAP[rawName.toLowerCase()]
    if (mapped) return mapped
  }
  const zh = (item.zh || '').trim()
  if (zh) {
    const clauses = splitZhClauses(zh)
    const concise = joinConciseClauses(clauses, 22)
    if (concise) return concise
  }
  if (rawName && !/^Pose\s+\d+-\d+$/i.test(rawName)) {
    return rawName
  }
  const theme = (vol.theme_zh || vol.theme_en || vol.slug || '动态参考').trim()
  const no = String(item.no ?? 0).padStart(2, '0')
  return `${theme} #${no}`
}

export function classifyMioCostumeCategory(vol: RawMioVolume, item: RawMioItem): string {
  const themeText = `${vol.theme_zh || ''} ${vol.theme_en || ''} ${(vol.tags || []).join(' ')}`
  const volText = `${themeText} ${vol.note || ''}`
  const itemText = `${item.zh || ''} ${item.prompt || ''}`
  const combined = `${volText} ${itemText}`

  if (/万圣节|哥特|洛丽塔|暗黑|机能|gothic|halloween|techwear|lolita/i.test(themeText)) {
    return '哥特与暗黑'
  }
  if (/礼服|婚纱|晚礼|gown|evening dress/i.test(themeText)) return '礼服与派对'
  if (/通勤|西装|职场|office|blazer/i.test(themeText)) return '通勤与职场'
  if (/排球|网球|篮球|高尔夫|运动|健身|athleisure|sport|volleyball/i.test(themeText)) return '运动'
  if (/泳装|比基尼|swimsuit|bikini/i.test(combined)) return '泳装'
  if (/睡衣|居家|内衣|pajamas|lingerie/i.test(themeText)) return '居家与睡衣'
  if (/和服|浴衣|kimono|yukata/i.test(combined)) return '和服'
  if (/秋装|冬装|秋冬|针织|大衣|围巾|长靴|连体衣|autumn|winter|knit|catsuit/i.test(themeText)) {
    return '秋冬穿搭'
  }
  if (/春装|夏装|春夏|露肩|休闲|波西米亚|bohemian|summer|spring/i.test(themeText)) {
    return '春夏穿搭'
  }
  if (/礼服|礼裙/i.test(volText)) return '礼服与派对'
  if (/通勤|西装|职场/i.test(volText)) return '通勤与职场'
  return '创意穿搭'
}

export function classifyMioPoseCategory(vol: RawMioVolume, item: RawMioItem): string {
  const itemText = `${item.name || ''} ${item.zh || ''} ${item.prompt || ''} ${(item.tags || []).join(' ')}`
  const volText = `${vol.theme_zh || ''} ${vol.theme_en || ''} ${(vol.tags || []).join(' ')}`

  if (/\b2girls\b|\b2boys\b|\bduo\b|双人|两人/i.test(itemText) || /双人/.test(volText)) {
    return '双人合影'
  }
  if (/芭蕾|\bballet\b|arabesque|pirouette|grand jet[eé]/i.test(`${volText} ${itemText}`)) {
    return '芭蕾'
  }
  if (/瑜伽|\byoga\b|tree pose|triangle pose|warrior|cobra pose|camel pose|bridge pose/i.test(`${volText} ${itemText}`)) {
    return '瑜伽'
  }
  if (/舞蹈|\bdance\b|hip pop/i.test(volText) || /\bdance\b|舞姿/i.test(itemText)) {
    return '舞蹈'
  }
  if (/排球|网球|篮球|高尔夫|健身|运动|volleyball|tennis|basketball|golf|workout/i.test(volText)) {
    return '运动'
  }
  if (/俯卧|仰卧|侧卧|平躺|侧躺|趴地|躺姿|\blying\b|\bprone\b|\bsupine\b|side recline/i.test(itemText)) {
    return '卧姿'
  }
  if (/蹲|跪|\bsquat|\bcrouch|\bkneel/i.test(itemText)) {
    return '蹲跪'
  }
  if (/站立|站姿|\bstanding\b|\bwalking\b/i.test(itemText)) {
    return '站姿'
  }
  if (/坐|盘腿|\bsit\b|\bsitting\b|\bseated\b/i.test(itemText)) {
    return '坐姿'
  }
  if (/站|行走|迈步/i.test(itemText)) {
    return '站姿'
  }
  if (/坐|椅|凳/.test(volText)) return '坐姿'
  if (/蹲|跪/.test(volText)) return '蹲跪'
  if (/卧|躺/.test(volText)) return '卧姿'
  if (/站/.test(volText)) return '站姿'
  return '人体动态'
}

export function extractMioPoseAngle(item: RawMioItem): string {
  const prompt = (item.prompt || '').toLowerCase()
  const zh = item.zh || ''
  if (/\b(?:back view|from behind|back to camera|rear view)\b/.test(prompt) || /背对镜头|背向镜头/.test(zh)) {
    return '背面'
  }
  if (/\b(?:from above|high angle|overhead|top-down)\b/.test(prompt) || /俯拍|俯视/.test(zh)) {
    return '俯视'
  }
  if (/\b(?:from below|low angle)\b/.test(prompt) || /仰拍|仰视/.test(zh)) {
    return '仰视'
  }
  if (/\b(?:three[- ]quarter|3\/4 view|diagonal)\b/.test(prompt) || /斜侧/.test(zh)) {
    return '斜侧'
  }
  if (/\b(?:side view|profile)\b/.test(prompt) || /侧视角|侧面/.test(zh)) {
    return '侧面'
  }
  return '正面'
}

function extractMioCostumeTags(vol: RawMioVolume, item: RawMioItem, category: string): string[] {
  const tags: string[] = [category]
  for (const t of vol.tags || []) {
    const clean = t.trim()
    if (clean && !tags.includes(clean)) tags.push(clean)
  }
  const prompt = item.prompt || ''
  for (const [pattern, label] of COSTUME_PROMPT_TAG_RULES) {
    if (pattern.test(prompt) && !tags.includes(label)) {
      tags.push(label)
    }
  }
  return tags.slice(0, 12)
}

function extractMioPoseTags(vol: RawMioVolume, item: RawMioItem, category: string): string[] {
  const tags: string[] = [category]
  for (const t of [...(vol.tags || []), ...(item.tags || [])]) {
    const clean = t.trim()
    if (clean && !tags.includes(clean)) tags.push(clean)
  }
  return tags.slice(0, 10)
}

export function transformMioArchivePayload(raw: RawMioArchive): TransformedMioArchive {
  const volumes = Array.isArray(raw?.volumes) ? raw.volumes : []
  const generated =
    typeof raw?.generated === 'string' && raw.generated.trim()
      ? raw.generated.trim()
      : new Date().toISOString().slice(0, 10)
  const source =
    typeof raw?.source === 'string' && raw.source.trim()
      ? raw.source.trim()
      : MIO_AUTHOR_URL

  const poses: PoseItem[] = []
  const costumes: CostumeItem[] = []
  const seenPoseIds = new Set<string>()
  const seenCostumeIds = new Set<string>()
  let poseVolumeCount = 0
  let costumeVolumeCount = 0

  for (const vol of volumes) {
    const series = (vol?.series || '').trim()
    if (series !== 'pose' && series !== 'cloth') continue
    const items = Array.isArray(vol.items) ? vol.items : []
    const postUrl = resolveMioPostUrl(vol.url)

    if (series === 'pose') {
      poseVolumeCount += 1
      for (const item of items) {
        const rawId = (item.id || '').trim()
        const tileUrl = resolveMioAssetUrl(item.tile)
        if (!rawId || !tileUrl) continue
        const fullId = `mio-${rawId}`
        if (seenPoseIds.has(fullId)) continue
        seenPoseIds.add(fullId)

        const category = classifyMioPoseCategory(vol, item)
        const title = buildMioPoseTitle(vol, item)
        const angle = extractMioPoseAngle(item)
        const tags = extractMioPoseTags(vol, item, category)
        const desc = (item.zh || '').trim() || (vol.note || '').trim()
        const prompt = (item.prompt || '').trim()
        const promptZh = (item.prompt_zh || '').trim()
        const searchParts = [
          fullId,
          rawId,
          MIO_POSE_SYSTEM,
          category,
          title,
          item.name || '',
          vol.theme_zh || '',
          vol.theme_en || '',
          desc,
          prompt,
          promptZh,
          tags.join(' '),
          'mio',
          '霧島澪',
          '雾岛澪',
          'sleepyzone',
        ]

        poses.push({
          id: fullId,
          source: 'mio',
          体系: MIO_POSE_SYSTEM,
          姿势编号: rawId,
          分类: category,
          姿势名称: title,
          角度: angle,
          缩略图: tileUrl,
          原图: tileUrl,
          来源: MIO_SOURCE_LABEL,
          来源地址: MIO_ARCHIVE_ORIGIN,
          原帖地址: postUrl,
          ...(desc ? { 描述: desc } : {}),
          ...(tags.length ? { 标签: tags } : {}),
          ...(prompt ? { 关键词: prompt } : {}),
          检索: searchParts.filter(Boolean).join(' '),
        })
      }
    } else if (series === 'cloth') {
      costumeVolumeCount += 1
      for (const item of items) {
        const rawId = (item.id || '').trim()
        const tileUrl = resolveMioAssetUrl(item.tile)
        if (!rawId || !tileUrl) continue
        const fullId = `mio-${rawId}`
        if (seenCostumeIds.has(fullId)) continue
        seenCostumeIds.add(fullId)

        const category = classifyMioCostumeCategory(vol, item)
        const title = buildMioCostumeTitle(vol, item)
        const tags = extractMioCostumeTags(vol, item, category)
        const desc = (item.zh || '').trim() || (vol.note || '').trim()
        const prompt = (item.prompt || '').trim()
        const promptZh = (item.prompt_zh || '').trim()
        const sensitive = /lingerie|bikini|underwear|see-through|cleavage|内衣|睡衣|泳装|比基尼/i.test(
          `${vol.theme_zh || ''} ${prompt}`
        )
        const searchParts = [
          fullId,
          rawId,
          category,
          title,
          item.name || '',
          vol.theme_zh || '',
          vol.theme_en || '',
          desc,
          prompt,
          promptZh,
          tags.join(' '),
          'mio',
          '霧島澪',
          '雾岛澪',
          'sleepyzone',
        ]

        costumes.push({
          id: fullId,
          source: 'mio',
          一级分类: '现实',
          分类: category,
          服装名称: title,
          标签: tags,
          关键词: prompt,
          缩略图: tileUrl,
          预览图: tileUrl,
          原图: tileUrl,
          来源: MIO_SOURCE_LABEL,
          来源地址: MIO_ARCHIVE_ORIGIN,
          原帖地址: postUrl,
          ...(desc ? { 描述: desc } : {}),
          ...(sensitive ? { 敏感: true } : {}),
          检索: searchParts.filter(Boolean).join(' '),
        })
      }
    }
  }

  return {
    generated,
    source,
    poseVolumeCount,
    costumeVolumeCount,
    poses,
    costumes,
  }
}
