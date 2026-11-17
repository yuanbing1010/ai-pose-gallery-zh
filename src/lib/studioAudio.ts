import type { ImageProviderId } from '../../shared/studio'

const STUDIO_MUTE_KEY = 'pose_atlas_studio_muted_v1'

interface StudioAudioEngine {
  ctx: AudioContext
  playTone: (opts: {
    freqFrom: number
    freqTo?: number
    type?: OscillatorType
    gain: number
    attack?: number
    dur: number
    delay?: number
  }) => void
  playNoiseTick: (opts: {
    freqFrom: number
    freqTo: number
    q?: number
    gain: number
    dur: number
    delay?: number
  }) => void
}

let engine: StudioAudioEngine | null = null
let cachedMuted: boolean | null = null

export function getStudioMuted(): boolean {
  if (cachedMuted !== null) return cachedMuted
  try {
    cachedMuted = localStorage.getItem(STUDIO_MUTE_KEY) === '1'
  } catch {
    cachedMuted = false
  }
  return cachedMuted
}

export function setStudioMuted(muted: boolean): void {
  cachedMuted = muted
  try {
    localStorage.setItem(STUDIO_MUTE_KEY, muted ? '1' : '0')
  } catch {
    // ignore storage errors
  }
}

function getOrCreateEngine(): StudioAudioEngine | null {
  if (typeof window === 'undefined') return null
  if (engine) return engine
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null

  try {
    const ctx = new AC({ latencyHint: 'interactive' })
    const master = ctx.createGain()
    const limiter = ctx.createDynamicsCompressor()
    master.gain.value = 0.65
    master.connect(limiter).connect(ctx.destination)

    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate)
    const ch = noiseBuffer.getChannelData(0)
    for (let i = 0; i < ch.length; i++) {
      ch[i] = Math.random() * 2 - 1
    }

    engine = {
      ctx,
      playTone({ freqFrom, freqTo, type = 'triangle', gain, attack = 0.006, dur, delay = 0 }) {
        const at = ctx.currentTime + delay
        const osc = ctx.createOscillator()
        const env = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freqFrom, at)
        if (freqTo && freqTo !== freqFrom) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), at + dur * 0.85)
        }
        env.gain.setValueAtTime(0.0001, at)
        env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack)
        env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(env).connect(master)
        osc.start(at)
        osc.stop(at + dur + 0.02)
      },
      playNoiseTick({ freqFrom, freqTo, q = 1.6, gain, dur, delay = 0 }) {
        const at = ctx.currentTime + delay
        const src = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        const env = ctx.createGain()
        src.buffer = noiseBuffer
        filter.type = 'bandpass'
        filter.Q.value = q
        filter.frequency.setValueAtTime(freqFrom, at)
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, freqTo), at + dur)
        env.gain.setValueAtTime(0.0001, at)
        env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.003)
        env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        src.connect(filter).connect(env).connect(master)
        src.start(at, Math.random() * 0.12)
        src.stop(at + dur + 0.02)
      },
    }
    return engine
  } catch {
    return null
  }
}

function ensureRunning(fromGesture: boolean): StudioAudioEngine | null {
  if (getStudioMuted()) return null
  const eng = getOrCreateEngine()
  if (!eng) return null
  if (eng.ctx.state === 'suspended') {
    if (!fromGesture) return null
    void eng.ctx.resume().catch(() => {})
  }
  return eng.ctx.state === 'running' || fromGesture ? eng : null
}

export function unlockStudioAudio(): void {
  if (getStudioMuted()) return
  const eng = getOrCreateEngine()
  if (eng && eng.ctx.state === 'suspended') {
    void eng.ctx.resume().catch(() => {})
  }
}

export function playSpriteHover(providerId: ImageProviderId): void {
  const eng = ensureRunning(false)
  if (!eng) return
  if (providerId === 'gpt') {
    eng.playNoiseTick({ freqFrom: 2800, freqTo: 3600, q: 2.2, gain: 0.022, dur: 0.032 })
    return
  }
  if (providerId === 'grok') {
    eng.playTone({ freqFrom: 660, freqTo: 880, type: 'sine', gain: 0.018, dur: 0.055 })
    return
  }
  eng.playTone({ freqFrom: 987.77, freqTo: 1174.66, type: 'triangle', gain: 0.02, dur: 0.065 })
}

export function playSpriteSelect(providerId: ImageProviderId): void {
  const eng = ensureRunning(true)
  if (!eng) return
  if (providerId === 'gpt') {
    // 精密白匣双段咔哒 + 清透琴音
    eng.playNoiseTick({ freqFrom: 2400, freqTo: 1200, q: 1.8, gain: 0.05, dur: 0.045 })
    eng.playTone({ freqFrom: 659.25, freqTo: 659.25, type: 'triangle', gain: 0.045, dur: 0.11 })
    eng.playTone({ freqFrom: 987.77, freqTo: 987.77, type: 'sine', gain: 0.04, dur: 0.14, delay: 0.045 })
    return
  }
  if (providerId === 'grok') {
    // 星舰跃迁清脆扫频
    eng.playTone({ freqFrom: 440, freqTo: 880, type: 'triangle', gain: 0.045, dur: 0.11 })
    eng.playTone({ freqFrom: 1108.73, freqTo: 1318.51, type: 'sine', gain: 0.035, dur: 0.13, delay: 0.04 })
    return
  }
  // 蕉糖幻想家：三连星芒铃音
  eng.playTone({ freqFrom: 783.99, type: 'triangle', gain: 0.04, dur: 0.09 })
  eng.playTone({ freqFrom: 987.77, type: 'triangle', gain: 0.04, dur: 0.1, delay: 0.04 })
  eng.playTone({ freqFrom: 1318.51, type: 'sine', gain: 0.038, dur: 0.14, delay: 0.08 })
}

export function playSpritePoke(providerId: ImageProviderId, combo: number): void {
  const eng = ensureRunning(true)
  if (!eng) return
  const step = Math.min(6, Math.max(0, combo - 1))
  const pitchScale = 1 + step * 0.065
  if (providerId === 'gpt') {
    eng.playTone({
      freqFrom: 760 * pitchScale,
      freqTo: 1120 * pitchScale,
      type: 'triangle',
      gain: 0.045,
      dur: 0.09,
    })
    return
  }
  if (providerId === 'grok') {
    eng.playTone({
      freqFrom: 540 * pitchScale,
      freqTo: 960 * pitchScale,
      type: 'sine',
      gain: 0.048,
      dur: 0.1,
    })
    return
  }
  eng.playTone({
    freqFrom: 920 * pitchScale,
    freqTo: 1380 * pitchScale,
    type: 'triangle',
    gain: 0.045,
    dur: 0.11,
  })
}

export function playBrushHover(): void {
  const eng = ensureRunning(false)
  if (!eng) return
  eng.playNoiseTick({ freqFrom: 3200, freqTo: 2100, q: 2.5, gain: 0.016, dur: 0.028 })
}

const BRUSH_SCALE_FREQS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]

export function playBrushSelect(index: number): void {
  const eng = ensureRunning(true)
  if (!eng) return
  const freq = BRUSH_SCALE_FREQS[Math.abs(index) % BRUSH_SCALE_FREQS.length]
  eng.playNoiseTick({ freqFrom: 3600, freqTo: 1400, q: 1.5, gain: 0.055, dur: 0.04 })
  eng.playTone({ freqFrom: freq * 0.96, freqTo: freq, type: 'triangle', gain: 0.045, dur: 0.11 })
}

export function playMonitorReveal(): void {
  const eng = ensureRunning(false)
  if (!eng) return
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, idx) => {
    eng.playTone({ freqFrom: f * 0.98, freqTo: f, type: 'triangle', gain: 0.036, dur: 0.18, delay: idx * 0.045 })
  })
}

export function playSpriteTravel(providerId: ImageProviderId, direction: 'to_canvas' | 'to_home'): void {
  const eng = ensureRunning(direction === 'to_canvas')
  if (!eng) return
  if (providerId === 'gpt') {
    // 三连轻快蹦跳音效
    const hops = direction === 'to_canvas' ? [480, 580, 700] : [660, 560, 480]
    hops.forEach((f, idx) => {
      eng.playTone({
        freqFrom: f,
        freqTo: f * 1.24,
        type: 'triangle',
        gain: 0.038,
        dur: 0.095,
        delay: idx * 0.14,
      })
    })
    return
  }
  if (providerId === 'grok') {
    // 黑洞球体顺滑翻滚扫频
    eng.playNoiseTick({ freqFrom: 900, freqTo: 2400, q: 1.2, gain: 0.036, dur: 0.24 })
    eng.playTone({
      freqFrom: direction === 'to_canvas' ? 320 : 620,
      freqTo: direction === 'to_canvas' ? 680 : 340,
      type: 'sine',
      gain: 0.04,
      dur: 0.28,
    })
    return
  }
  // 蕉糖星光瞬移闪现竖琴音阶
  const notes = direction === 'to_canvas' ? [659.25, 987.77, 1318.51] : [1318.51, 987.77, 659.25]
  notes.forEach((f, idx) => {
    eng.playTone({
      freqFrom: f,
      freqTo: f * 1.05,
      type: 'sine',
      gain: 0.035,
      dur: 0.12,
      delay: idx * 0.06,
    })
  })
}

export function playHomeworkThrow(): void {
  const eng = ensureRunning(false)
  if (!eng) return
  // 欢呼小音符 + 甩纸破风声
  eng.playTone({ freqFrom: 659.25, freqTo: 783.99, type: 'triangle', gain: 0.042, dur: 0.1 })
  eng.playTone({ freqFrom: 987.77, freqTo: 1174.66, type: 'triangle', gain: 0.042, dur: 0.12, delay: 0.07 })
  eng.playNoiseTick({ freqFrom: 1400, freqTo: 3400, q: 0.9, gain: 0.055, dur: 0.16, delay: 0.28 })
}

export function playPencilCaseToggle(opening: boolean): void {
  const eng = ensureRunning(true)
  if (!eng) return
  if (opening) {
    // 金属卡扣轻响弹开 + 翻盖液压升起
    eng.playNoiseTick({ freqFrom: 2600, freqTo: 4200, q: 2.2, gain: 0.045, dur: 0.036 })
    eng.playTone({ freqFrom: 340, freqTo: 660, type: 'triangle', gain: 0.036, dur: 0.12, delay: 0.02 })
    return
  }
  // 合盖落锁磁吸咔哒声
  eng.playTone({ freqFrom: 420, freqTo: 190, type: 'triangle', gain: 0.032, dur: 0.09 })
  eng.playNoiseTick({ freqFrom: 2800, freqTo: 1400, q: 2.6, gain: 0.05, dur: 0.04, delay: 0.075 })
}
