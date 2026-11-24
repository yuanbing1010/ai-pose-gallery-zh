/**
 * 拟物机械微音效合成引擎（纯 Web Audio API，零外部音频依赖）
 * 所有音效严格遵循工作台静音状态 `getStudioMuted()`。
 */
import { getStudioMuted } from '@/lib/studioAudio'

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || getStudioMuted()) return null
  try {
    if (!sharedCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      sharedCtx = new AC({ latencyHint: 'interactive' })
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume()
    }
    return sharedCtx
  } catch {
    return null
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buf
}

/** 金属机械拨杆/按键短促清脆「咔哒」声 */
export function playMechanicalSwitch(pitch = 1): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  // 低频机械腔体敲击
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(220 * pitch, now)
  osc.frequency.exponentialRampToValueAtTime(68 * pitch, now + 0.036)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.042)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.05)

  // 高频弹簧金属触点瞬态
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 0.03)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 3400 * pitch
  filter.Q.value = 2.4
  const nGain = ctx.createGain()
  nGain.gain.setValueAtTime(0.0001, now)
  nGain.gain.exponentialRampToValueAtTime(0.12, now + 0.002)
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
  noise.connect(filter).connect(nGain).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.03)
}

/** 徕卡金属叶片快门「咔嚓 KA-CHAK」两段声 */
export function playCameraShutter(): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  const triggerBlade = (offset: number, freq: number, gainPeak: number) => {
    const t = now + offset
    const noise = ctx.createBufferSource()
    noise.buffer = createNoiseBuffer(ctx, 0.06)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(freq, t)
    bp.frequency.exponentialRampToValueAtTime(freq * 0.45, t + 0.05)
    bp.Q.value = 1.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
    noise.connect(bp).connect(g).connect(ctx.destination)
    noise.start(t)
    noise.stop(t + 0.06)

    const thump = ctx.createOscillator()
    const tg = ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(160, t)
    thump.frequency.exponentialRampToValueAtTime(48, t + 0.045)
    tg.gain.setValueAtTime(0.0001, t)
    tg.gain.exponentialRampToValueAtTime(gainPeak * 0.85, t + 0.004)
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    thump.connect(tg).connect(ctx.destination)
    thump.start(t)
    thump.stop(t + 0.055)
  }

  // 快门闭合 + 快门复位
  triggerBlade(0, 3200, 0.22)
  triggerBlade(0.09, 2400, 0.17)
}

/** 黄铜滚轮拉杆转动 + 逐格卡位 + 落定清脆铜铃 */
export function playDrumRollAndChime(): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  // 7 次逐减速的棘轮滴答声
  const tickOffsets = [0, 0.045, 0.095, 0.155, 0.225, 0.31, 0.41]
  tickOffsets.forEach((off, idx) => {
    const t = now + off
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(620 + idx * 45, t)
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.022)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.024)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.028)
  })

  // 落定清亮双音黄铜铃
  const notes = [880, 1174.66]
  notes.forEach((freq, i) => {
    const t = now + 0.48 + i * 0.065
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.075, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.3)
  })
}

/** 拍立得金属吐片马达「滋——咔」声 */
export function playPolaroidEject(): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  // 柔和微型电机嗡鸣
  const motor = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const g = ctx.createGain()
  motor.type = 'sawtooth'
  motor.frequency.setValueAtTime(92, now)
  motor.frequency.linearRampToValueAtTime(118, now + 0.28)
  motor.frequency.linearRampToValueAtTime(84, now + 0.44)
  filter.type = 'bandpass'
  filter.frequency.value = 340
  filter.Q.value = 1.8
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.045, now + 0.04)
  g.gain.setValueAtTime(0.04, now + 0.36)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.46)
  motor.connect(filter).connect(g).connect(ctx.destination)
  motor.start(now)
  motor.stop(now + 0.48)

  // 相纸弹出瞬间的纸面摩擦气流声
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 0.45)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.frequency.setValueAtTime(1600, now)
  nf.frequency.exponentialRampToValueAtTime(900, now + 0.42)
  nf.Q.value = 1.2
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.0001, now)
  ng.gain.exponentialRampToValueAtTime(0.055, now + 0.05)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.44)
  noise.connect(nf).connect(ng).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.45)
}

/** 朱砂印章落印 / 卡片锁槽「咚哒」温润触感声 */
export function playInkStamp(): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  // 温润木质印章落纸低频冲击
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(195, now)
  osc.frequency.exponentialRampToValueAtTime(62, now + 0.055)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.22, now + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
  osc.connect(g).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.075)

  // 尾段轻盈金箔高音回响
  const chime = ctx.createOscillator()
  const cg = ctx.createGain()
  chime.type = 'triangle'
  chime.frequency.setValueAtTime(1046.5, now + 0.015)
  cg.gain.setValueAtTime(0.0001, now + 0.015)
  cg.gain.exponentialRampToValueAtTime(0.045, now + 0.022)
  cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
  chime.connect(cg).connect(ctx.destination)
  chime.start(now + 0.015)
  chime.stop(now + 0.15)
}

/** 徕卡光圈刻度环阻尼「嗒」细微卡位声 */
export function playBrassDialTick(): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(1180, now)
  osc.frequency.exponentialRampToValueAtTime(340, now + 0.018)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.07, now + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
  osc.connect(g).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.024)
}

/** 实体机械键帽按压清脆敲击声 */
export function playTypewriterKey(variation = 0): void {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime
  const shift = 1 + (variation % 5) * 0.03

  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 0.025)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2600 * shift
  bp.Q.value = 2.0
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.0001, now)
  ng.gain.exponentialRampToValueAtTime(0.11, now + 0.002)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.022)
  noise.connect(bp).connect(ng).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.026)
}
