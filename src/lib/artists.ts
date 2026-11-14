import type {
  ApiConfig,
  DoubaoParams,
  GeminiParams,
  GptParams,
  ImageProviderId,
  QwenParams,
} from '@/types/gallery'

export interface StudioArtistPersona {
  id: ImageProviderId
  /** 天马行空的画师代号，不直接暴露真实模型/厂商名 */
  name: string
  /** 极简 4 字特长标签 */
  specialty: string
  /** 详细气质描述 */
  bio: string
  /** 标识点色值 */
  accent: string
  /** 是否需要在管理端配置密钥（本地工作流无需云端 Key） */
  requiresKey: boolean
}

export const STUDIO_ARTISTS: StudioArtistPersona[] = [
  {
    id: 'gemini',
    name: '蕉糖幻想家',
    specialty: '多图极稳',
    bio: '跨次元融合极稳，人像五官还原与柔光材质层次细腻',
    accent: '#E5A918',
    requiresKey: true,
  },
  {
    id: 'gpt',
    name: '白匣造物主',
    specialty: '听话鬼才',
    bio: '领悟力天花板，复杂服饰层叠与细节补充指令丝毫不差',
    accent: '#19857B',
    requiresKey: true,
  },
  {
    id: 'qwen',
    name: '千墨丹青师',
    specialty: '东方气韵',
    bio: '深谙东方审美骨相与汉服剪裁，日常街拍与古风表现自然',
    accent: '#D9381E',
    requiresKey: true,
  },
  {
    id: 'doubao',
    name: '星梦追光师',
    specialty: '电影逆光',
    bio: '天生自带银幕级氛围滤镜，擅长发丝逆光与通透肤质大片',
    accent: '#6366F1',
    requiresKey: true,
  },
]

export function getStudioArtist(id: ImageProviderId): StudioArtistPersona {
  return STUDIO_ARTISTS.find((a) => a.id === id) ?? STUDIO_ARTISTS[0]
}

export type StudioAspectRatio = '3:4' | '1:1' | '4:3' | '9:16' | '16:9'

export interface AspectRatioOption {
  id: StudioAspectRatio
  label: string
  hint: string
  gptSize: GptParams['size']
  qwenSize: QwenParams['size']
  doubaoSize: DoubaoParams['size']
}

export const STUDIO_ASPECT_RATIOS: AspectRatioOption[] = [
  {
    id: '3:4',
    label: '3:4',
    hint: '立绘竖版',
    gptSize: '1024x1536',
    qwenSize: '1024*1536',
    doubaoSize: '1728x2304',
  },
  {
    id: '1:1',
    label: '1:1',
    hint: '方形头像',
    gptSize: '1024x1024',
    qwenSize: '1328*1328',
    doubaoSize: '2048x2048',
  },
  {
    id: '4:3',
    label: '4:3',
    hint: '画报横版',
    gptSize: '1536x1024',
    qwenSize: '1664*928',
    doubaoSize: '2560x1440',
  },
  {
    id: '9:16',
    label: '9:16',
    hint: '竖屏壁纸',
    gptSize: '1024x1536',
    qwenSize: '928*1664',
    doubaoSize: '1440x2560',
  },
  {
    id: '16:9',
    label: '16:9',
    hint: '宽屏剧照',
    gptSize: '1536x1024',
    qwenSize: '1664*928',
    doubaoSize: '2560x1440',
  },
]

export function readCurrentAspectRatio(cfg: ApiConfig): StudioAspectRatio {
  if (cfg.activeProvider === 'gemini') {
    return cfg.geminiParams.aspectRatio
  }
  if (cfg.activeProvider === 'gpt') {
    if (cfg.gptParams.size === '1024x1024') return '1:1'
    if (cfg.gptParams.size === '1536x1024') return '4:3'
    return '3:4'
  }
  if (cfg.activeProvider === 'qwen') {
    if (cfg.qwenParams.size === '1328*1328') return '1:1'
    if (cfg.qwenParams.size === '928*1664') return '9:16'
    if (cfg.qwenParams.size === '1664*928') return '16:9'
    return '3:4'
  }
  if (cfg.activeProvider === 'doubao') {
    if (cfg.doubaoParams.size === '2048x2048') return '1:1'
    if (cfg.doubaoParams.size === '1440x2560') return '9:16'
    if (cfg.doubaoParams.size === '2560x1440') return '16:9'
    return '3:4'
  }
  return cfg.geminiParams.aspectRatio
}

export function buildAspectRatioPatches(ratio: StudioAspectRatio): {
  gemini: Partial<GeminiParams>
  gpt: Partial<GptParams>
  qwen: Partial<QwenParams>
  doubao: Partial<DoubaoParams>
} {
  const opt = STUDIO_ASPECT_RATIOS.find((r) => r.id === ratio) ?? STUDIO_ASPECT_RATIOS[0]
  return {
    gemini: { aspectRatio: opt.id },
    gpt: { size: opt.gptSize },
    qwen: { size: opt.qwenSize },
    doubao: { size: opt.doubaoSize },
  }
}
