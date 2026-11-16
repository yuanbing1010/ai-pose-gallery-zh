import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, DicesIcon, SparklesIcon, Volume2Icon, VolumeXIcon, XIcon } from 'lucide-react'
import { toast } from '@/lib/notifications'
import { poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import type { CostumeItem, PortraitItem, PoseItem } from '@/types/gallery'

export interface DrawnPack {
  portrait: PortraitItem
  costume: CostumeItem
  pose: PoseItem
}

export interface PackStageProps {
  drawn: DrawnPack
  packSeed: number
  muted: boolean
  onToggleMute: () => void
  onRedraw: () => void
  onSynthesize: (pack: DrawnPack) => void
  onSynthesizeSlot?: (slot: 'portrait' | 'costume' | 'pose', pack: DrawnPack) => void
  onClose?: () => void
  variant?: 'inline' | 'modal'
  className?: string
}

function seededShuffle<T>(items: T[], seedStr: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    const j = (h >>> 0) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const PACK_SKINS = [
  ['Cobalt', '#2b3ff0'],
  ['Vermilion', '#d9381e'],
  ['Jade', '#0e9c79'],
  ['Grape', '#7a42f0'],
] as const

const BANDS = ['#ff3d6e', '#ff8a3d', '#ffd34d', '#4fd9a0', '#4fb2ff', '#8b6cff', '#ff5cc8']
const N_JAG = 84
const K_PLIES = 10
const ORBIT_DUR = 1.05

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1)
  return k * k * (3 - 2 * k)
}

class Spring {
  x: number
  to: number
  v = 0
  k = 0
  c = 0
  constructor(x: number, response = 0.5, bounce = 0) {
    this.x = x
    this.to = x
    this.set(response, bounce)
  }
  set(response: number, bounce = 0) {
    this.k = ((2 * Math.PI) / response) ** 2
    this.c = (4 * Math.PI * (1 - bounce)) / response
    return this
  }
  step(h: number) {
    this.v += (this.k * (this.to - this.x) - this.c * this.v) * h
    this.x += this.v * h
  }
}

function createVoices() {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    const ctx = new AC({ latencyHint: 'interactive' })
    const sr = ctx.sampleRate
    const now = () => ctx.currentTime
    const master = ctx.createGain()
    const limit = ctx.createDynamicsCompressor()
    master.gain.value = 0.72
    master.connect(limit).connect(ctx.destination)

    const sheet = (seconds: number, fill: (d: Float32Array) => void) => {
      const b = ctx.createBuffer(1, (seconds * sr) | 0, sr)
      fill(b.getChannelData(0))
      return b
    }
    const hiss = sheet(1.5, (d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    })
    const foil = sheet(1.6, (d) => {
      for (let n = 0; n < 720; n++) {
        const start = (Math.random() * (d.length - 360)) | 0
        const amp = Math.random() ** 3 * (Math.random() < 0.5 ? -1 : 1)
        const len = (30 + Math.random() * 220) | 0
        for (let i = 0; i < len; i++) {
          d[start + i] += amp * (Math.random() * 2 - 1) * Math.exp((-i / len) * 5)
        }
      }
    })

    const env = (param: AudioParam, at: number, peak: number, attack: number, dur: number) => {
      param.setValueAtTime(0.0001, at)
      param.exponentialRampToValueAtTime(peak, at + attack)
      param.exponentialRampToValueAtTime(0.0001, at + dur)
    }

    const air = (opts: {
      at?: number
      buffer?: AudioBuffer
      from: number
      to: number
      Q?: number
      gain: number
      attack?: number
      dur: number
    }) => {
      const at = opts.at ?? now()
      const s = ctx.createBufferSource()
      const f = ctx.createBiquadFilter()
      const g = ctx.createGain()
      s.buffer = opts.buffer ?? hiss
      s.loop = true
      f.type = 'bandpass'
      f.Q.value = opts.Q ?? 1
      f.frequency.setValueAtTime(opts.from, at)
      f.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur)
      env(g.gain, at, opts.gain, opts.attack ?? 0.004, opts.dur)
      s.connect(f).connect(g).connect(master)
      s.start(at, Math.random() * 1.2)
      s.stop(at + opts.dur + 0.02)
    }

    const coo = (freq: number, shape: Array<[number, number]>, gainVal = 0.05, at = now()) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const dur = shape[shape.length - 1][0] + 0.05
      o.type = 'triangle'
      for (const [s, m] of shape) {
        if (s) o.frequency.exponentialRampToValueAtTime(freq * m, at + s)
        else o.frequency.setValueAtTime(freq * m, at)
      }
      env(g.gain, at, gainVal, 0.008, dur)
      o.connect(g).connect(master)
      o.start(at)
      o.stop(at + dur + 0.02)
    }

    const ripBody = ctx.createBufferSource()
    const ripShape = ctx.createBiquadFilter()
    const ripGain = ctx.createGain()
    ripBody.buffer = foil
    ripBody.loop = true
    ripShape.type = 'bandpass'
    ripShape.Q.value = 0.6
    ripGain.gain.value = 0
    ripBody.connect(ripShape).connect(ripGain).connect(master)
    ripBody.start()
    let level = 0

    return {
      ctx,
      mute(off: boolean) {
        master.gain.setTargetAtTime(off ? 0 : 0.72, now(), 0.015)
      },
      rip(v: number) {
        v = clamp(v, 0, 1)
        if (Math.abs(v - level) < 0.01 && (v || !level)) return
        const rising = v > level
        level = v
        const t = now()
        ripGain.gain.setTargetAtTime(v ** 0.8 * 0.14, t, rising ? 0.008 : 0.05)
        ripShape.frequency.setTargetAtTime(1800 + 2000 * v, t, 0.02)
        ripBody.playbackRate.setTargetAtTime(0.7 + 0.8 * v, t, 0.02)
      },
      grab() {
        air({ buffer: foil, from: 3000, to: 2200, Q: 0.7, gain: 0.25, attack: 0.003, dur: 0.08 })
      },
      eep() {
        coo(1200, [[0, 0.82], [0.05, 1.25], [0.13, 1.02]], 0.04)
      },
      phew() {
        coo(900, [[0, 1.1], [0.24, 0.6]], 0.04)
      },
      pop() {
        const at = now()
        air({ at, from: 5000, to: 1800, Q: 0.9, gain: 0.13, attack: 0.002, dur: 0.1 })
        coo(300, [[0, 0.8], [0.05, 3.4]], 0.24, at)
        const notes = [523.25, 659.25, 783.99, 1046.5]
        notes.forEach((f, idx) => {
          coo(f, [[0, 0.95], [0.08, 1]], 0.04, at + 0.1 + idx * 0.05)
        })
      },
      swirl(len: number) {
        air({ from: 700, to: 1800, Q: 0.9, gain: 0.09, attack: len * 0.4, dur: len })
      },
      land(slotIdx?: number) {
        const at = now()
        air({ at, from: 2600, to: 1200, Q: 0.65, gain: 0.08, attack: 0.002, dur: 0.06 })
        if (slotIdx !== undefined) {
          coo(155, [[0, 1.25], [0.065, 0.52]], 0.16, at)
          const notes = [523.25, 659.25, 783.99]
          const f = notes[slotIdx % notes.length]
          coo(f, [[0, 0.96], [0.09, 1]], 0.055, at + 0.01)
        }
      },
      dockFull() {
        const at = now()
        coo(1046.5, [[0, 0.98], [0.16, 1]], 0.06, at)
        coo(1318.51, [[0, 0.98], [0.18, 1]], 0.05, at + 0.045)
      },
      dispose() {
        try {
          ripBody.stop()
          void ctx.close()
        } catch {
          // ignore
        }
      },
    }
  } catch {
    return null
  }
}

interface FlyingCardClone {
  key: string
  slotKey: 'portrait' | 'costume' | 'pose'
  img: string
  alt: string
  from: { left: number; top: number; width: number; height: number }
  to: { left: number; top: number; width: number; height: number }
  duration: number
  apexLift: number
  swayX: number
}

export function PackStage({
  drawn,
  packSeed,
  muted,
  onToggleMute,
  onRedraw,
  onSynthesize,
  onSynthesizeSlot,
  onClose,
  variant = 'inline',
  className,
}: PackStageProps) {
  const [phase, setPhase] = useState<'sealed' | 'opened' | 'flying'>('sealed')
  const [flyingClones, setFlyingClones] = useState<FlyingCardClone[]>([])
  const [lockedSlots, setLockedSlots] = useState<Partial<Record<'portrait' | 'costume' | 'pose', boolean>>>({})

  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const packRef = useRef<HTMLDivElement>(null)
  const groundRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const raysRef = useRef<SVGSVGElement>(null)
  const flapRef = useRef<HTMLDivElement>(null)
  const hitRef = useRef<HTMLButtonElement>(null)
  const frontSkinRef = useRef<HTMLDivElement>(null)
  const backSkinRef = useRef<HTMLDivElement>(null)
  const bodyLipRef = useRef<HTMLDivElement>(null)
  const fxCanvasRef = useRef<HTMLCanvasElement>(null)
  const flyLayerRef = useRef<HTMLDivElement>(null)

  const mutedRef = useRef(muted)
  const sfxRef = useRef<ReturnType<typeof createVoices>>(null)
  const flyTimersRef = useRef<number[]>([])
  const pendingPackRef = useRef<{ pack: DrawnPack; written: Set<'portrait' | 'costume' | 'pose'> } | null>(null)
  const onSynthesizeRef = useRef(onSynthesize)
  const onSynthesizeSlotRef = useRef(onSynthesizeSlot)
  const onRedrawRef = useRef(onRedraw)
  const drawnRef = useRef(drawn)
  useEffect(() => {
    onSynthesizeRef.current = onSynthesize
    onSynthesizeSlotRef.current = onSynthesizeSlot
    onRedrawRef.current = onRedraw
    drawnRef.current = drawn
  }, [onSynthesize, onSynthesizeSlot, onRedraw, drawn])

  useEffect(() => {
    mutedRef.current = muted
    sfxRef.current?.mute(muted)
  }, [muted])

  useEffect(() => {
    const timers = flyTimersRef.current
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      if (pendingPackRef.current && pendingPackRef.current.written.size < 3) {
        onSynthesizeRef.current(pendingPackRef.current.pack)
        pendingPackRef.current = null
      }
      sfxRef.current?.dispose()
      sfxRef.current = null
    }
  }, [])

  // 每次抽卡均随机打乱 3 张卡在舞台上的展示顺序，并生成随机错落起飞次序
  const cardSpecs = useMemo(() => {
    const base = [
      {
        slotKey: 'portrait' as const,
        kindLabel: '人像',
        dotColor: '#E5A918',
        title: drawn.portrait.发型名称,
        img: referenceImageUrl(drawn.portrait.缩略图),
      },
      {
        slotKey: 'costume' as const,
        kindLabel: '服装',
        dotColor: '#19857B',
        title: drawn.costume.服装名称,
        img: referenceImageUrl(drawn.costume.缩略图),
      },
      {
        slotKey: 'pose' as const,
        kindLabel: '姿势',
        dotColor: '#D9381E',
        title: drawn.pose.姿势名称,
        img: referenceImageUrl(poseThumbPath(drawn.pose)),
      },
    ]
    return seededShuffle(
      base,
      `${packSeed}:${drawn.portrait.id}:${drawn.costume.id}:${drawn.pose.id}`
    )
  }, [drawn, packSeed])

  // 执行：三张卡保留原槽位已有卡，按随机错落顺序蓄力跳起，落地一瞬间逐个撞换并触发底座抖动
  const handleSynthesizeClick = () => {
    if (phase !== 'opened') return
    const scene = sceneRef.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!scene || reduce || variant !== 'inline') {
      onSynthesize(drawn)
      window.dispatchEvent(
        new CustomEvent('recipe-dock-impact', { detail: { slot: 'pose', index: 2, isFinal: true } })
      )
      return
    }

    const cardEls = [...scene.querySelectorAll<HTMLDivElement>('.hp-card')]
    const fromRects = cardEls.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    })

    if (fromRects.length < 3) {
      onSynthesize(drawn)
      return
    }

    setPhase('flying')
    pendingPackRef.current = { pack: drawn, written: new Set() }

    requestAnimationFrame(() => {
      const landingOrder = seededShuffle(
        [0, 1, 2],
        `launch:${packSeed}:${drawn.portrait.id}:${drawn.pose.id}`
      )
      const flightProfiles = [
        { duration: 420, apexLift: 36, swayX: -24 },
        { duration: 630, apexLift: 86, swayX: 22 },
        { duration: 840, apexLift: 140, swayX: 48 },
      ]
      const clones: FlyingCardClone[] = []

      landingOrder.forEach((cardIdx, rank) => {
        const spec = cardSpecs[cardIdx]
        const profile = flightProfiles[rank] ?? flightProfiles[2]
        const targetEl = document.querySelector<HTMLElement>(`[data-dock-slot="${spec.slotKey}"]`)
        const from = fromRects[cardIdx]
        if (!targetEl || !from || from.width < 10) return
        const tr = targetEl.getBoundingClientRect()
        clones.push({
          key: `${spec.slotKey}-${packSeed}-${cardIdx}`,
          slotKey: spec.slotKey,
          img: spec.img,
          alt: spec.title,
          from,
          to: { left: tr.left, top: tr.top, width: tr.width, height: tr.height },
          ...profile,
        })
      })

      if (!clones.length) {
        pendingPackRef.current = null
        onSynthesize(drawn)
        setPhase('opened')
        return
      }

      // 3 张卡一起同时起飞，舞台静止卡同步交棒给飞行克隆层
      cardEls.forEach((el) => {
        el.style.opacity = '0'
      })

      setFlyingClones(clones)
    })
  }

  // 与显示器帧率完全同步的 rAF 抛物线引擎：卡牌在槽位落座的同一帧立即触发写入与底座撞击抖动
  useEffect(() => {
    const layer = flyLayerRef.current
    if (!layer || !flyingClones.length) return
    const items = [...layer.querySelectorAll<HTMLElement>('[data-fly-idx]')]
    const landed = new Set<number>()
    const packSnapshot = drawnRef.current
    const startAt = performance.now()
    let raf = 0

    const step = (now: number) => {
      const elapsed = now - startAt
      let pendingCount = 0

      items.forEach((el) => {
        const idx = Number(el.dataset.flyIdx)
        const c = flyingClones[idx]
        if (!c || landed.has(idx)) return

        const u = Math.min(1, elapsed / c.duration)
        if (u >= 1) {
          landed.add(idx)
          el.style.opacity = '0'
          const isFinal = idx === flyingClones.length - 1

          if (pendingPackRef.current) {
            pendingPackRef.current.written.add(c.slotKey)
          }
          if (onSynthesizeSlotRef.current) {
            onSynthesizeSlotRef.current(c.slotKey, packSnapshot)
          } else if (isFinal) {
            onSynthesizeRef.current(packSnapshot)
          }

          window.dispatchEvent(
            new CustomEvent('recipe-dock-impact', {
              detail: { slot: c.slotKey, index: idx, isFinal },
            })
          )
          sfxRef.current?.land(idx)

          if (isFinal) {
            pendingPackRef.current = null
            const fullChime = window.setTimeout(() => sfxRef.current?.dockFull(), 80)
            const doneAt = window.setTimeout(() => {
              setFlyingClones([])
              onRedrawRef.current()
            }, 380)
            flyTimersRef.current.push(fullChime, doneAt)
          }
          return
        }

        pendingCount += 1
        const fromCx = c.from.left + c.from.width / 2
        const fromCy = c.from.top + c.from.height / 2
        const toCx = c.to.left + c.to.width / 2
        const toCy = c.to.top + c.to.height / 2
        const dx = toCx - fromCx
        const dy = toCy - fromCy
        const endScale = Math.max(0.18, Math.min(c.to.width, c.to.height) / Math.max(1, c.from.width))
        const bank = (idx - 1) * 16

        // 水平平滑推进，垂直先跃起再加速砸入槽位，在 u=1 落座瞬间保持俯冲速度
        const easeX = 1 - (1 - u) * (1 - u)
        const easeY = u * u * (1.28 - 0.28 * u)
        const arcLift = Math.sin(Math.PI * u) * c.apexLift
        const sway = Math.sin(Math.PI * u) * c.swayX
        const tx = dx * easeX + sway
        const ty = dy * easeY - arcLift
        const rot = Math.sin(Math.PI * u) * bank
        const sc = 1 + (endScale - 1) * (u * u)

        el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotateZ(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`
        el.style.opacity = u > 0.92 ? (1 - ((u - 0.92) / 0.08) * 0.25).toFixed(2) : '1'
      })

      if (pendingCount > 0) {
        raf = requestAnimationFrame(step)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [flyingClones])

  // 核心 60fps 物理引擎：可任意位置停住的手撕物理 + 彩虹光线喷涌 + 连续一体的 3D 卡牌飞出与悬浮检视
  useEffect(() => {
    const stage = stageRef.current
    const scene = sceneRef.current
    const pack = packRef.current
    const ground = groundRef.current
    const flow = flowRef.current
    const rays = raysRef.current
    const flap = flapRef.current
    const hit = hitRef.current
    const frontSkin = frontSkinRef.current
    const backSkin = backSkinRef.current
    const bodyLip = bodyLipRef.current
    const fx = fxCanvasRef.current
    if (
      !stage ||
      !scene ||
      !pack ||
      !ground ||
      !flow ||
      !rays ||
      !flap ||
      !hit ||
      !frontSkin ||
      !backSkin ||
      !bodyLip ||
      !fx
    ) {
      return
    }

    const fxc = fx.getContext('2d')
    if (!fxc) return

    setPhase('sealed')
    setLockedSlots({})

    const skin = PACK_SKINS[packSeed % PACK_SKINS.length]
    pack.style.setProperty('--pack', skin[1])
    const seriesEl = pack.querySelector<HTMLElement>('.hp-series')
    if (seriesEl) seriesEl.textContent = skin[0]

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const motion = reduce ? 0 : 1

    const P = {
      x: new Spring(0, 0.7, 0.28),
      y: new Spring(0, 0.7, 0.28),
      rx: new Spring(0, 0.7, 0.28),
      ry: new Spring(0, 0.7, 0.28),
      rz: new Spring(0, 0.7, 0.28),
    }
    const tear = {
      p: new Spring(0, 0.1),
      th: new Spring(0, 0.28, 0.35),
      ph: new Spring(0, 0.3, 0.2),
      dir: 1,
      last: 0,
      roll: rand(0.75, 1.3),
    }
    const squeeze = new Spring(0, 0.3, 0.45)
    const glow = new Spring(0, 0.5)

    // 生成不规则锯齿撕裂路径
    const Y_MIN = 8.2
    const Y_MAX = 19.2
    const TEAR_Y = 10.8
    const slope = rand(-6.5, 6.5)
    const bow = rand(-2.5, 2.5)
    const freq = rand(1.5, 3.2)
    const ph0 = rand(0, 6.28)
    const wob = rand(0.3, 1.0)
    const y0 = rand(10.5, 13.8)
    let walk = 0
    const jag = Array.from({ length: N_JAG + 1 }, (_, i) => {
      const x = (i / N_JAG) * 100
      const s = x / 50 - 1
      walk = clamp(walk + rand(-0.22, 0.22) + (Math.random() < 0.05 ? rand(-1.2, 1.2) : 0), -2.0, 2.0)
      const base =
        y0 + slope * s + bow * (1 - s * s) + wob * Math.sin(s * freq * Math.PI + ph0) + walk
      const tooth = rand(-0.4, 0.4) + (Math.random() < 0.14 ? rand(-1.0, 1.0) : 0)
      const metal = Math.random() < 0.12 ? rand(1.2, 2.0) : rand(0.4, 1.0)
      return [i && i < N_JAG ? x + rand(-0.25, 0.25) : x, clamp(base, Y_MIN, Y_MAX) + tooth, base, tooth, metal, 0]
    })

    const placeJag = (q: number[], bend: number) => {
      q[5] = bend
      q[1] = clamp(q[2] + bend, Y_MIN, Y_MAX) + q[3]
    }
    const steer = (k: number) => {
      const d = tear.dir
      const i0 = clamp(Math.round((d > 0 ? tear.p.x : 1 - tear.p.x) * N_JAG), 0, N_JAG)
      for (let i = i0 + d; i >= 0 && i <= N_JAG; i += d) {
        placeJag(jag[i], jag[i0][5] + (k * Math.abs(i - i0) * 100) / N_JAG)
      }
    }
    const yAt = (x: number) => {
      const f = (clamp(x, 0, 100) / 100) * N_JAG
      const i = Math.min(N_JAG - 1, f | 0)
      return jag[i][1] + (jag[i + 1][1] - jag[i][1]) * (f - i)
    }
    const poly = (a: number[][]) => `polygon(${a.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`
    const mirror = (a: number[][]) => a.map(([x, y]) => [100 - x, y])
    const band = (a: number[][], sign: number) => [
      ...a,
      ...a
        .slice()
        .reverse()
        .map((q) => [q[0], q[1] + sign * q[4]]),
    ]

    // 构建 10 段顶部卷曲铝箔条 DOM
    flap.innerHTML = ''
    const plies = Array.from({ length: K_PLIES }, () => {
      const el = document.createElement('div')
      el.className = 'hp-ply'
      el.hidden = true
      el.innerHTML = `<div class="hp-ply-front"><span class="hp-tear-tag">TEAR HERE ⟶</span><i class="hp-lip"></i><i class="hp-tone"></i></div><div class="hp-ply-foil"><i class="hp-tone"></i></div>`
      flap.append(el)
      const front = el.children[0] as HTMLElement
      const foil = el.children[1] as HTMLElement
      return {
        el,
        front,
        foil,
        lip: front.querySelector('.hp-lip') as HTMLElement,
        shade: front.querySelector('.hp-tone') as HTMLElement,
        under: foil.querySelector('.hp-tone') as HTMLElement,
        done: false,
      }
    })

    // 构建从撕裂口喷涌的 SVG 彩虹光线束
    let PW = pack.offsetWidth || 248
    let PH = pack.offsetHeight || 360
    const u0 = PW / 100
    const Y0 = 62.5 + ((Y_MAX - TEAR_Y) / 100) * (PH / u0)
    const R0 = 45
    const CY = Y0 + R0
    const NR = 28
    const STEP = 3.0
    const SPAN = 1200
    const TIP = 32
    const k0 = (Math.random() * 7) | 0
    const lines = Array.from({ length: NR + 1 }, (_, j) => {
      const ox = 3 + (94 * j) / NR
      const x = 50 + ((ox - 50) * R0) / 45
      const a = Math.atan2(x - 50, R0) + rand(-0.01, 0.01)
      return { ox, x, ux: Math.sin(a), uy: -Math.cos(a), ph: j * 0.35, r: Math.hypot(x - 50, R0) }
    })
    const ribbons = Array.from({ length: NR }, (_, j) => ({
      mx: (lines[j].ox + lines[j + 1].ox) / 2,
      gx: (lines[j].x + lines[j + 1].x) / 2,
      r: (lines[j].r + lines[j + 1].r) / 2,
      L: 0,
      c: BANDS[(j + k0) % 7],
      on: false,
      len: 0,
      g: new Spring(0, 0.4, reduce ? 0 : 0.3),
    }))
    const tint = (hex: string, k: number) =>
      '#' +
      [1, 3, 5]
        .map((i) =>
          Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')

    rays.innerHTML = `<defs>
      ${ribbons
        .map((b, j) => {
          const ux = (lines[j].ux + lines[j + 1].ux) / 2
          const uy = (lines[j].uy + lines[j + 1].uy) / 2
          const hot = 24 + Y0 - 62.5
          return `<linearGradient id="hpb${j}" gradientUnits="userSpaceOnUse" x1="${b.gx.toFixed(1)}" y1="${Y0.toFixed(1)}" x2="${(b.gx + ux * hot).toFixed(1)}" y2="${(Y0 + uy * hot).toFixed(1)}"><stop stop-color="${tint(b.c, 0.72)}"/><stop offset="1" stop-color="${b.c}"/></linearGradient>`
        })
        .join('')}
      <radialGradient id="hpfade-g" gradientUnits="userSpaceOnUse" cx="50" cy="${CY.toFixed(1)}" r="${SPAN}">
        <stop stop-color="#fff" stop-opacity="0"/><stop stop-color="#fff"/><stop stop-color="#fff"/><stop stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <mask id="hpfade" maskUnits="userSpaceOnUse"><rect fill="url(#hpfade-g)"/></mask>
    </defs>
    <g mask="url(#hpfade)">${ribbons.map((_, j) => `<path class="hp-band" fill="url(#hpb${j})"/>`).join('')}</g>`
    const bandEls = [...rays.querySelectorAll<SVGPathElement>('.hp-band')]
    const stops = [...rays.querySelectorAll<SVGStopElement>('#hpfade-g stop')]

    let reach = 260
    const fit = () => {
      const sw = stage.clientWidth || 860
      const sh = stage.clientHeight || 580
      PW = pack.offsetWidth || 248
      PH = pack.offsetHeight || 360
      const d = Math.min(2, window.devicePixelRatio || 1)
      fx.width = Math.round(sw * d)
      fx.height = Math.round(sh * d)
      const u = PW / 100
      const room = 2.5 + (sh / 2 - PH * (0.5 - TEAR_Y / 100)) / u
      const w = Math.min(sw / 2 / u, room * 1.2 + 60) + 20
      reach = reduce ? 45 + room * 0.6 : (45 + room) * 1.45 + TIP + 20
      for (const b of ribbons) b.L = reach - b.r
      const box = { x: 50 - w, y: 32.5 - room, width: 2 * w, height: room + 60 }
      for (const el of rays.querySelectorAll('#hpfade,#hpfade rect')) {
        for (const [k, v] of Object.entries(box)) el.setAttribute(k, v.toFixed(1))
      }
    }
    fit()

    const clips = (p: number) => {
      const d = tear.dir
      const xt = d > 0 ? p * 100 : 100 - p * 100
      const yt = yAt(xt)
      const tip = [xt, yt, 0, 0, 0]
      const torn = jag.filter(([x]) => (d > 0 ? x < xt : x > xt))
      const rest =
        d > 0
          ? [[xt, 0], [100, 0], [100, 100], [0, 100], ...torn, [xt, yt]]
          : [[0, 0], [xt, 0], [xt, yt], ...torn, [100, 100], [0, 100]]
      frontSkin.style.clipPath = poly(rest)
      backSkin.style.clipPath = poly(mirror(rest))
      bodyLip.style.clipPath = poly(band(d > 0 ? [...torn, tip] : [tip, ...torn], 1))
      flap.style.transformOrigin = `${xt}% ${yt}%`

      const w = 100 / K_PLIES
      const lap = 0.25
      plies.forEach((s, k) => {
        const lo = d > 0 ? k * w : Math.max(k * w, xt)
        const hi = d > 0 ? Math.min((k + 1) * w, xt) : (k + 1) * w
        if (hi <= lo) {
          s.el.hidden = true
          return
        }
        s.el.hidden = false
        if (s.done) return
        const L = d < 0 && lo === xt ? lo : Math.max(0, lo - lap)
        const R = d > 0 && hi === xt ? hi : Math.min(100, hi + lap)
        const span = [[L, yAt(L), 0, 0, 0.8], ...jag.filter((q) => q[0] > L && q[0] < R), [R, yAt(R), 0, 0, 0.8]]
        const piece = [[L, 0], [R, 0], ...span.slice().reverse()]
        s.front.style.clipPath = poly(piece)
        s.foil.style.clipPath = poly(mirror(piece))
        s.lip.style.clipPath = poly(band(span, -1))
        s.done = d > 0 ? hi < xt || xt >= 100 : lo > xt || xt <= 0
      })

      const k0Ply = clamp(Math.floor((d > 0 ? xt - 1e-6 : xt) / w), 0, K_PLIES - 1)
      const bend = (2.6 + 2.6 * p) * tear.roll
      const jit = Math.min(1, Math.abs(tear.p.v) * 0.4) * 1.5
      let m = ''
      let sum = 0
      for (let n = 0, k = k0Ply; k >= 0 && k < K_PLIES; n++, k -= d) {
        const x = (((n ? (d > 0 ? k + 1 : k) * w : xt) / 100) * PW).toFixed(2)
        const a = d * (bend * (0.4 + 0.3 * n) + Math.sin(t * 16 + n * 0.9) * jit)
        const s = plies[k]
        sum += a
        m += `translateX(${x}px) rotateY(${a.toFixed(2)}deg) rotateZ(${((d * 0.9 * n) / 4).toFixed(2)}deg) translateX(-${x}px) `
        s.el.style.transform = m
        s.shade.style.opacity = Math.min(0.5, Math.abs(sum) / 200).toFixed(2)
        s.under.style.opacity = Math.max(0, 0.34 - Math.abs(sum) / 420).toFixed(2)
      }
    }

    // 重置初始元素状态
    frontSkin.style.clipPath = ''
    backSkin.style.clipPath = ''
    bodyLip.style.clipPath = ''
    flap.className = 'hp-flap'
    flap.style.transform = ''
    rays.style.opacity = '0'
    pack.style.visibility = ''
    flow.style.visibility = ''
    scene.classList.remove('hp-flat')
    pack.classList.remove('hp-held', 'hp-hurt', 'hp-tug')
    hit.disabled = false
    scene.querySelectorAll('.hp-card').forEach((n) => n.remove())

    // 入场动效：从右侧飞入旋转到位
    let state: 'enter' | 'idle' | 'open' | 'spread' = 'enter'
    if (!reduce) {
      P.x.x = (stage.clientWidth || 860) * 0.42
      P.y.x = -36
      P.ry.x = -180
      P.rz.x = 14
    }
    const settleTimer = window.setTimeout(() => {
      if (state === 'enter') state = 'idle'
    }, reduce ? 0 : 750)

    const pointer = { x: stage.clientWidth / 2, y: stage.clientHeight / 2, in: false, touch: false }
    let drag: {
      id: number
      x0: number
      y0: number
      p0: number
      moved: boolean
      dy: number
      k: number
    } | null = null
    let wasDrag = false
    let wasDragResetTimer = 0
    let openedAt = 0
    let spreadAt = 0
    let t = 0
    let last = performance.now()
    let fall: { y: number; v: number } | null = null
    let fly: { x: number; y: number; vx: number; vy: number; th: number; vth: number; ph: number; vph: number } | null = null
    let anchor = { y: 0, rz: 0, rx: 0, ry: 0, sq: 0 }
    let drained = false

    interface CardObj {
      el: HTMLDivElement
      slot: number
      i: number
      phase: 'in' | 'shot' | 'orbit' | 'spread'
      hover: boolean
      hx: number
      hy: number
      from: number
      landAt: number
      x0: number
      y0: number
      vy: number
      rz0: number
      even: number
      end: number
      f: { x: number; y: number; z: number; rz: number; s: number }
      p: { x: Spring; y: Spring; z: Spring; rx: Spring; ry: Spring; rz: Spring; s: Spring }
    }
    let cards: CardObj[] = []

    const BIT = [
      new Path2D(),
      new Path2D(),
      new Path2D('M0-6 1.3-1.3 6 0 1.3 1.3 0 6-1.3 1.3-6 0-1.3-1.3Z'),
    ]
    BIT[0].arc(0, 0, 4.5, 0, 7)
    BIT[1].roundRect(-3.5, -6, 7, 12, 2)
    interface Bit {
      kind: number
      fill: string
      inside?: boolean
      lx?: number
      ly?: number
      lz?: number
      up?: number
      a?: number
      sp?: number
      r?: number
      r0?: number
      spin?: number
      c?: number
      slip?: number
      glide?: number
      sc?: number
      ph?: number
      age?: number
      x?: number
      y?: number
      z?: number
      vx?: number
      vy?: number
      vz?: number
    }
    let bits: Bit[] = Array.from({ length: 180 }, (_, i) => ({
      kind: i % 3,
      fill: [...BANDS, '#ffffff'][i % 8],
    }))
    let fxUsed = false

    const ensureAudio = () => {
      if (!sfxRef.current) {
        sfxRef.current = createVoices()
      }
      sfxRef.current?.mute(mutedRef.current)
      if (sfxRef.current?.ctx.state === 'suspended') {
        void sfxRef.current.ctx.resume()
      }
      return sfxRef.current
    }

    const fan = (slot: number) => {
      const sw = stage.clientWidth || 860
      const sh = stage.clientHeight || 580
      const m = slot - 1
      const cw = Math.min(256, Math.max(122, sw * 0.245))
      const tight = sw < 560
      const gap = tight ? Math.min(cw * 0.96, (sw - 32) / 3) : Math.min(cw * 1.18, (sw - 96) / 3)
      const s = cw / (PW * 0.84 || 232)
      return {
        x: m * gap,
        y: Math.min(8, sh * 0.01) + m * m * (tight ? 7 : 5) - 6,
        z: tight ? m * 24 : 0,
        rz: m * (tight ? 5 : 3.2),
        s: clamp(s, 0.62, 1.12),
      }
    }

    const spawnCards = () => {
      cards = cardSpecs.map((spec, i) => {
        const slot = i
        const el = document.createElement('div')
        el.className = 'hp-card'
        el.innerHTML = `
          <i class="hp-bevel"></i>
          <div class="hp-face">
            <div class="hp-win">
              <img src="${spec.img}" alt="${spec.title}" draggable="false" />
            </div>
            <i class="hp-holo"></i>
          </div>
        `
        el.style.zIndex = String(3 - i)
        scene.append(el)
        const f = fan(slot)
        const startY = P.y.x + PH * ((Math.max(...jag.map((q) => q[1])) + 39) / 100 - 0.5)
        return {
          el,
          slot,
          i,
          phase: reduce ? 'spread' : 'in',
          hover: false,
          hx: 0.5,
          hy: 0.5,
          from: 0,
          landAt: 0,
          x0: 0,
          y0: startY,
          vy: 0,
          rz0: 0,
          even: (-slot * 2 * Math.PI) / 3,
          end: Math.PI / 2 - (slot - 1) * 0.55,
          f,
          p: {
            x: new Spring(reduce ? f.x : P.x.x, 0.55, 0.22),
            y: new Spring(reduce ? f.y : startY, 0.55, 0.22),
            z: new Spring(reduce ? f.z : 3.5 - i * 1.75, 0.55, 0.22),
            rx: new Spring(0, 0.55, 0.22),
            ry: new Spring(0, 0.55, 0.22),
            rz: new Spring(reduce ? f.rz : P.rz.x, 0.55, 0.22),
            s: new Spring(reduce ? f.s : 0.94, 0.55, 0.22),
          },
        }
      })
      if (reduce) {
        scene.classList.add('hp-flat')
        setPhase('opened')
      }
    }

    const burstConfetti = () => {
      bits.forEach((b, i) => {
        if (b.age !== undefined) return
        const lx = rand(8, 92)
        const vt = 240 + 380 * Math.random() ** 1.5
        Object.assign(b, {
          inside: true,
          lx,
          ly: yAt(lx) + rand(1, 14),
          lz: rand(4, 7),
          up: rand(850, 2200),
          a: ((lx - 50) / 50 + rand(-0.45, 0.45)) * 0.85,
          sp: rand(460, 1900),
          r: rand(0, 360),
          spin: rand(-680, 680),
          c: 2400 / vt / vt,
          slip: rand(800, 2200),
          glide: Math.sign(lx - 50) * rand(-180, 750),
          sc: rand(0.9, 1.75),
          ph: rand(0, 6.28),
          age: i < 45 ? 0 : -rand(0, 0.22),
          x: 0,
          y: 0,
          z: 0,
        })
      })
    }

    const onStagePos = (lx: number, ly: number, lz: number): [number, number, number] => {
      const R = Math.PI / 180
      const cx = Math.cos(P.rx.x * R), sx = Math.sin(P.rx.x * R)
      const cy = Math.cos(P.ry.x * R), sy = Math.sin(P.ry.x * R)
      const cz = Math.cos(P.rz.x * R), sz = Math.sin(P.rz.x * R)
      const x0 = ((lx - 50) / 100) * PW
      const y0 = ((ly - 50) / 100) * PH
      const x1 = x0 * cz - y0 * sz
      const y1 = x0 * sz + y0 * cz
      const x2 = x1 * cy + lz * sy
      const z2 = -x1 * sy + lz * cy
      return [x2 + P.x.x, y1 * cx - z2 * sx + P.y.x + (fall ? fall.y : 0), y1 * sx + z2 * cx]
    }

    const pourRays = () => {
      const ft = reduce ? 0 : t
      const xt = tear.dir > 0 ? tear.p.x * 100 : 100 - tear.p.x * 100
      const sway = Math.sin(ft * 0.9) * 1.5
      const go = !reduce && (state === 'open' || state === 'spread')
      const s = t - openedAt
      const u = PW / 100
      const a = (anchor.rz * Math.PI) / 180
      const sh = stage.clientHeight || 580
      const roof = 60 + ((-sh / 2 - anchor.y) / Math.cos(a) + PH * (0.5 - TEAR_Y / 100)) / u
      const full = ((Y0 + R0 - roof) * ribbons[0].r) / R0 + TIP + 20
      const far = go ? reach + (full - reach) * (1 - (1 - Math.min(1, s / 0.5)) ** 2) : reach
      const tail = R0 - 5 + (go ? (full + 21 - R0) * clamp((s - 0.35) / 0.55, 0, 1) ** 2 : 0)
      const carry = go ? (45 * s * s) / (s + 0.25) : 0

      for (const b of ribbons) {
        if (state === 'idle' && tear.p.x > 0 && (tear.dir > 0 ? b.mx < xt : b.mx > xt)) b.on = true
        b.g.to = b.on ? 1 : 0
        b.len = b.L * Math.max(0, b.g.x) + far - reach
      }
      ;[tail - 16, tail, far - TIP, far].forEach((o, i) => {
        stops[i]?.setAttribute('offset', clamp(Math.min(o, far) / SPAN, 0, 1).toFixed(4))
      })

      const at = (j: number, d: number): [number, number] => {
        const e = lines[j]
        const k = Math.min(1, d / 90)
        const w = (0.4 + 2 * k) * Math.sin(((d - carry) / 22 - ft * 1.4) * 2 * Math.PI + e.ph) + sway * k
        return [e.x + e.ux * d - e.uy * w, Y0 + e.uy * d + e.ux * w]
      }
      const sw = stage.clientWidth || 860
      const side = sw / 2 / u + 14
      const fix = (v: number) => Math.round(v * 20) / 20
      const edges = lines.map((e, j) => {
        const stop = Math.min((Y0 - roof) / -e.uy, (side - Math.abs(e.x - 50)) / Math.abs(e.ux)) + 24
        const len = Math.min(Math.max(ribbons[j - 1]?.len || 0, ribbons[j]?.len || 0), stop)
        const i0 = Math.max(0, Math.floor((tail - 20 - e.r) / STEP))
        const pts: string[] = []
        if (len > i0 * STEP) {
          for (let i = i0; ; i++) {
            const d = Math.min(i * STEP, len)
            const [x, y] = at(j, d)
            pts.push(`${fix(x)} ${fix(y)}`)
            if (d >= len) break
          }
        }
        return { i0, pts }
      })
      const upto = (e: { i0: number; pts: string[] }, len: number) =>
        e.pts.slice(0, Math.max(0, Math.ceil(len / STEP) - e.i0 + 1))

      ribbons.forEach((b, j) => {
        const A = upto(edges[j], b.len)
        const B = upto(edges[j + 1], b.len)
        bandEls[j]?.setAttribute(
          'd',
          A.length > 1 && B.length > 1 ? `M${A.join('L')}L${B.slice().reverse().join('L')}Z` : ''
        )
      })
      drained = go && s > 0.9
    }

    const startTear = () => {
      if (!pack.classList.contains('hp-hurt')) ensureAudio()?.eep()
      flap.classList.add('hp-on')
      pack.classList.remove('hp-tug')
      pack.classList.add('hp-held', 'hp-hurt')
    }

    const finishTear = (response: number, target = 1) => {
      tear.p.set(response)
      tear.p.to = target
      if (target >= 1) {
        tear.th.to = rand(14, 30)
        tear.ph.to = -rand(20, 44)
      } else {
        tear.th.to = rand(8, 15)
        tear.ph.to = -rand(10, 18)
      }
    }

    const triggerOpen = () => {
      if (state === 'open' || state === 'spread') return
      try {
        if (drag && hit.hasPointerCapture(drag.id)) hit.releasePointerCapture(drag.id)
      } catch {
        // ignore synthetic pointer capture
      }
      state = 'open'
      openedAt = t
      drag = null
      tear.p.x = tear.p.to = 1
      clips(1)
      hit.disabled = true
      P.rx.set(0.3)
      P.ry.set(0.3)
      P.rx.to = P.ry.to = 0

      if (reduce) {
        pack.style.visibility = flow.style.visibility = 'hidden'
        flap.className = 'hp-flap'
      } else {
        fly = {
          x: 0,
          y: 0,
          vx: tear.dir * 240,
          vy: -1750,
          th: tear.th.x,
          vth: 500,
          ph: tear.ph.x,
          vph: -300,
        }
        P.y.v += 300
        P.rz.v -= tear.dir * 40
        burstConfetti()
      }
      spawnCards()
      const sfx = ensureAudio()
      sfx?.rip(0)
      sfx?.pop()
    }

    const unwind = () => {
      spreadAt = t
      scene.classList.add('hp-flat')
      ensureAudio()?.swirl(ORBIT_DUR)
      for (const c of cards) {
        const p = c.p
        c.f = fan(c.slot)
        c.phase = 'orbit'
        c.from = t + c.i * 0.035
        c.x0 = p.x.x
        c.y0 = p.y.x
        c.vy = p.y.v
        c.rz0 = p.rz.x
        c.landAt = c.from + ORBIT_DUR
        p.s.to = c.f.s
        p.x.k = p.x.c = p.x.v = 0
        p.y.k = p.y.c = p.y.v = 0
        p.z.k = p.z.c = p.z.v = 0
        p.rx.k = p.rx.c = p.rx.v = 0
        p.ry.k = p.ry.c = p.ry.v = 0
        p.rz.k = p.rz.c = p.rz.v = 0
      }
    }

    const orbit = (c: CardObj) => {
      const p = c.p
      const f = c.f
      const u = clamp((t - c.from) / ORBIT_DUR, 0, 1)
      const turn = 1 - (1 - u) ** 2
      const out = smoothstep(0.52, 1, u)
      const ring = Math.sin((Math.min(1, u / 0.42) * Math.PI) / 2) * (1 - out)
      const a = c.end + (1 - turn) * (c.even - c.end + Math.PI * 2.35)
      const sin = Math.sin(a)
      const cos = Math.cos(a)
      const W = Math.min((stage.clientWidth || 860) * 0.34, 340)
      const dtFrom = Math.max(0, t - c.from)
      const mid = c.y0 + (c.vy / 9) * (1 - Math.exp(-9 * dtFrom))
      const sh = stage.clientHeight || 580
      const cy = mid + (-sh * 0.03 - mid) * smoothstep(0, 0.42, u)
      p.x.x = c.x0 * (1 - out) + f.x * out + cos * W * ring
      p.y.x = cy * (1 - out) + f.y * out + sin * W * 0.2 * ring
      p.z.x = f.z * out + sin * 240 * ring
      p.rz.x = c.rz0 * (1 - out) + f.rz * out - cos * 8 * ring
      p.ry.x = -cos * 24 * ring
      p.rx.x = 7 * ring
      if (u === 1) {
        c.phase = 'spread'
        for (const s of Object.values(p)) s.set(0.5, 0.22)
        ensureAudio()?.land()
      }
    }

    const aimed = (): CardObj | null => {
      const sw = stage.clientWidth || 860
      const sh = stage.clientHeight || 580
      let best: CardObj | null = null
      for (const c of cards) {
        if (c.phase !== 'spread') continue
        const f = c.f
        const near = 1400 / (1400 - f.z)
        const a = (f.rz * Math.PI) / 180
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const w = PW * 0.84 * f.s * near
        const h = w * 1.4
        const rect = stage.getBoundingClientRect()
        const px = pointer.x - rect.left
        const py = pointer.y - rect.top
        const dx = px - (sw / 2 + f.x * near)
        const dy = py - (sh / 2 + f.y * near)
        const hx = (dx * cos + dy * sin) / w + 0.5
        const hy = (dy * cos - dx * sin) / h + 0.5
        if (hx >= 0 && hx <= 1 && hy >= 0 && hy <= 1 && (!best || f.z >= best.f.z)) {
          best = c
          c.hx = hx
          c.hy = hy
        }
      }
      return best
    }

    const letGo = (e: PointerEvent | Event) => {
      const pid = (e as PointerEvent).pointerId
      if (!drag || (pid !== undefined && pid !== drag.id)) return
      wasDrag = drag.moved
      if (wasDrag) {
        window.clearTimeout(wasDragResetTimer)
        wasDragResetTimer = window.setTimeout(() => {
          wasDrag = false
        }, 60)
      }
      drag = null
      if (!wasDrag || state !== 'idle') return
      if (tear.p.to > 0.58) {
        finishTear(0.18)
        return
      }
      const sfx = ensureAudio()
      if (pack.classList.contains('hp-hurt')) sfx?.phew()
      sfx?.rip(0)
      pack.classList.remove('hp-held', 'hp-hurt', 'hp-tug')
      tear.th.to = 3 + tear.p.to * 10
      tear.ph.to = -tear.p.to * 14
    }

    const onHitDown = (e: PointerEvent) => {
      if (e.button || drag) return
      wasDrag = false
      if (state === 'enter') {
        window.clearTimeout(settleTimer)
        state = 'idle'
        squeeze.v -= 6
        for (const s of Object.values(P)) s.set(0.28, 0.25)
      }
      if (state !== 'idle') return
      try {
        hit.setPointerCapture(e.pointerId)
      } catch {
        // ignore synthetic pointer capture
      }
      ensureAudio()?.grab()
      drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        p0: tear.p.to,
        moved: false,
        dy: 0,
        k: 0,
      }
    }

    const onHitMove = (e: PointerEvent) => {
      if (e.pointerId !== drag?.id || state !== 'idle') return
      if (e.pointerType === 'mouse' && !e.buttons) {
        letGo(e)
        return
      }
      const dx = e.clientX - drag.x0
      let dy = e.clientY - drag.y0
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 6) return
        drag.moved = true
        tear.p.set(0.1)
        pack.classList.add('hp-tug')
      }
      if (tear.p.to === 0) {
        drag.dy = dy
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 0.5) return
        tear.dir = dx < 0 ? -1 : 1
        drag.y0 = e.clientY
        dy = 0
      }
      startTear()
      tear.p.to = clamp(drag.p0 + (drag.p0 ? Math.abs(dx) : dx * tear.dir) / (PW * 0.85), tear.p.to, 1)
      tear.th.to = 6 + tear.p.to * 14 + clamp(-dy * 0.16, -6, 22)
      tear.ph.to = -(8 + tear.p.to * 22) - clamp(-dy * 0.2, 0, 24)
      drag.k += (clamp(dy / Math.max(60, Math.abs(dx)), -0.7, 0.7) * (PW / PH) - drag.k) * 0.3
      steer(drag.k)
    }

    const onHitClick = (e: MouseEvent) => {
      if (wasDrag && e.detail) {
        wasDrag = false
        return
      }
      wasDrag = false
      if (state === 'enter') {
        window.clearTimeout(settleTimer)
        state = 'idle'
      }
      if (state !== 'idle') return
      if (!tear.p.to) tear.dir = Math.random() < 0.5 ? -1 : 1
      startTear()
      // 首次轻点撕开一半露出一缕彩虹光；再次点击彻底撕开拆封
      if (tear.p.to < 0.45) {
        finishTear(0.28, 0.52)
        const relax = window.setTimeout(() => pack.classList.remove('hp-held', 'hp-tug'), 220)
        flyTimersRef.current.push(relax)
      } else {
        finishTear(0.2, 1)
      }
    }

    const onStagePointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.in = true
      pointer.touch = e.pointerType !== 'mouse'
    }
    const onStagePointerLeave = () => {
      pointer.in = false
    }
    const onStageClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button, a')) return
      if (state !== 'spread') return
      pointer.x = e.clientX
      pointer.y = e.clientY
      const target = aimed()
      if (!target) return
      const spec = cardSpecs[target.i]
      if (!spec) return
      onSynthesizeSlotRef.current?.(spec.slotKey, drawnRef.current)
      setLockedSlots((prev) => ({ ...prev, [spec.slotKey]: true }))
      target.p.s.v += 1.4
      target.p.z.v += 280
      window.dispatchEvent(
        new CustomEvent('recipe-dock-impact', {
          detail: { slot: spec.slotKey, index: 0, isFinal: false },
        })
      )
      sfxRef.current?.land(0)
      toast.success(`已单独锁入${spec.kindLabel}：${spec.title}`)
    }

    hit.addEventListener('pointerdown', onHitDown)
    hit.addEventListener('pointermove', onHitMove)
    hit.addEventListener('pointerup', letGo)
    hit.addEventListener('pointercancel', letGo)
    hit.addEventListener('lostpointercapture', letGo)
    hit.addEventListener('click', onHitClick)
    stage.addEventListener('pointermove', onStagePointerMove)
    stage.addEventListener('pointerleave', onStagePointerLeave)
    stage.addEventListener('click', onStageClick)
    const ro = new ResizeObserver(fit)
    ro.observe(stage)

    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt

      const held = pack.classList.contains('hp-held')
      const tug =
        motion && drag?.moved && !tear.p.to
          ? Math.sign(drag.dy) * 140 * (1 - 1 / (1 + Math.abs(drag.dy) / 140))
          : 0
      squeeze.to = tug ? -Math.abs(tug) / 90 : held && state === 'idle' ? motion : 0

      if (state === 'enter' || state === 'idle') {
        const rect = stage.getBoundingClientRect()
        const hold = drag?.moved ? 0.25 : 1
        const nx = pointer.in ? clamp(((pointer.x - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1) : 0
        const ny = pointer.in ? clamp(((pointer.y - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1, 1) : 0
        P.y.to = Math.sin(t * 1.4) * 7 * motion + tug
        P.ry.to = nx * 20 * hold * motion
        P.rx.to = -ny * 14 * hold * motion - squeeze.x * 6
        P.rz.to = Math.sin(t * 0.9) * 1.6 * motion - (held && tear.p.x > 0 ? tear.dir * tear.p.x * 3 : 0)
      }

      const springs = [
        ...Object.values(P),
        tear.p,
        tear.th,
        tear.ph,
        squeeze,
        glow,
        ...ribbons.map((b) => b.g),
        ...cards.flatMap((c) => Object.values(c.p)),
      ]
      const steps = Math.ceil(dt * 240)
      const h = dt / steps
      for (let i = 0; i < steps; i++) {
        for (const s of springs) s.step(h)
      }

      if (state === 'idle' && tear.p.x > 0) {
        const p = Math.min(1, tear.p.x)
        const dp = p - tear.last
        tear.last = p
        sfxRef.current?.rip(dp > 0 ? (dp / Math.max(dt, 0.004) / 4) ** 0.6 : 0)
        if (dp > 0 && motion) {
          P.rz.v += rand(-1, 1) * Math.min(dp, 0.02) * 850
          P.y.v += dp * 380
          tear.th.v += dp * 280
          squeeze.v += dp * 18
          for (const b of ribbons) if (b.on) b.g.v += dp * 6
        }
        if (dp > 0 || Math.abs(tear.p.v) > 0.001) clips(p)
        const draft = drag ? 0 : motion * (Math.sin(t * 5.3) + Math.sin(t * 8.7) * 0.5)
        flap.style.transform = `rotateZ(${(tear.th.x + draft) * tear.dir}deg) rotateX(${tear.ph.x + draft * 1.5}deg)`
        if (p > 0.985 && tear.p.to >= 1) triggerOpen()
      }

      glow.to =
        (state === 'idle' && tear.p.x > 0) ||
        ((state === 'open' || state === 'spread') && !reduce && !drained)
          ? 1
          : 0
      if (glow.x > 0.003 || glow.to) {
        rays.style.opacity = glow.x.toFixed(3)
        pourRays()
      }

      if (fly) {
        fly.vy += 2600 * dt
        fly.x += fly.vx * dt
        fly.y += fly.vy * dt
        fly.th += fly.vth * dt
        fly.ph += fly.vph * dt
        flap.style.transform = `translate3d(${fly.x}px,${fly.y}px,0) rotateZ(${fly.th * tear.dir}deg) rotateX(${fly.ph}deg)`
        if (t - openedAt > 1.5) {
          fly = null
          flap.className = 'hp-flap'
        }
      }

      if (state === 'open' && !fall && !reduce && t - openedAt > 0.02) {
        fall = { y: 0, v: (1500 * PH) / 420 }
      }
      if (fall && fall.y < (stage.clientHeight || 600)) {
        fall.v += 2800 * dt
        fall.y += fall.v * dt
        P.rz.to = tear.dir * 9
      }

      if (pack.style.visibility !== 'hidden') {
        const fy = fall ? fall.y : 0
        pack.style.transform = `translate3d(${P.x.x}px,${P.y.x + fy}px,0) rotateX(${P.rx.x}deg) rotateY(${P.ry.x}deg) rotateZ(${P.rz.x}deg) scale3d(${1 + 0.03 * squeeze.x},${1 - 0.06 * squeeze.x},1)`
        if (!fall) {
          pack.style.setProperty('--gx', clamp(-P.ry.x * 0.12, -1.5, 3).toFixed(2))
          pack.style.setProperty('--sh', clamp(P.ry.x * 1.2 + P.rx.x * 0.8, -22, 22).toFixed(1))
        }
        if (fy > (stage.clientHeight || 600)) pack.style.visibility = 'hidden'
      }

      if (!fall) {
        anchor = { y: P.y.x, rz: P.rz.x, rx: P.rx.x, ry: P.ry.x, sq: squeeze.x }
        flow.style.transform = pack.style.transform
      } else if (Math.abs(anchor.rz) + Math.abs(anchor.rx) + Math.abs(anchor.sq) > 0.01) {
        const k = Math.exp(-dt / 0.05)
        anchor.rz *= k
        anchor.rx *= k
        anchor.ry *= k
        anchor.sq *= k
        flow.style.transform = `translate3d(${P.x.x}px,${anchor.y}px,0) rotateX(${anchor.rx}deg) rotateY(${anchor.ry}deg) rotateZ(${anchor.rz}deg) scale3d(${1 + 0.03 * anchor.sq},${1 - 0.06 * anchor.sq},1)`
      }

      ground.style.transform = `translate3d(${P.x.x}px,${PH / 2 + 24}px,0) scale(${1 - P.y.x / 300})`
      ground.style.opacity = String(
        state === 'enter' || state === 'idle'
          ? clamp(1 - Math.abs(P.x.x) / 300, 0, 1)
          : fall
            ? clamp(1 - fall.y / 160, 0, 1)
            : 0
      )

      if (state === 'open' && !spreadAt && !reduce && cards.every((c) => c.phase === 'shot')) {
        const mouth = P.y.x + (fall ? fall.y : 0) + PH * (Math.max(...jag.map((q) => q[1])) / 100 - 0.5)
        const ch = PW * 1.176
        if (cards.every((c) => c.p.y.x + ch * 0.36 < mouth)) unwind()
      }

      for (const c of cards) if (c.phase === 'orbit') orbit(c)
      const hot = pointer.in ? aimed() : null
      stage.style.cursor = hot ? 'pointer' : ''
      for (const c of cards) {
        const p = c.p
        const since = t - openedAt
        if (c.phase === 'in' && !reduce && since > c.i * 0.03) {
          c.phase = 'shot'
          p.s.to = 1
          p.y.k = 0
          p.y.c = 1.2
          p.y.v = (-rand(1200, 1380) * PH) / 420
        }
        if (c.phase === 'spread') {
          c.hover = c === hot
          const f = c.f
          const w = t * 0.8 + c.i * 1.9
          const on = c.hover
          p.x.to = f.x
          p.s.to = f.s
          p.y.to = f.y + (on ? -16 : Math.sin(w * 1.2) * 5 * motion)
          p.z.to = f.z + (on ? 105 : 0)
          p.rz.to = on ? f.rz * 0.3 : f.rz
          p.rx.to = on ? (0.5 - c.hy) * 30 : Math.cos(w * 0.9) * 3.5 * motion
          p.ry.to = on ? (c.hx - 0.5) * 34 : Math.sin(w) * 7 * motion
        }
        const loose = c.phase === 'spread' || c.phase === 'orbit'
        const rx = loose ? p.rx.x - clamp(p.y.v * 0.006, -8, 8) : P.rx.x
        const ry = loose ? p.ry.x + clamp(p.x.v * 0.008, -12, 12) : P.ry.x
        c.el.style.transform = `translate3d(${p.x.x}px,${p.y.x}px,${p.z.x}px) rotateZ(${p.rz.x}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${p.s.x})`
        c.el.style.zIndex = c.hover ? '10' : String(c.phase === 'orbit' ? Math.round(p.z.x + 50) : 3 - c.i)
        if (c.phase === 'spread') {
          const a = reduce ? 1 : clamp((t - c.landAt - 0.15) / 0.45, 0, 1)
          const nx = clamp(ry / 24, -1, 1) * a
          const ny = clamp(rx / 24, -1, 1) * a
          c.el.style.setProperty('--px', (50 + nx * 50).toFixed(1))
          c.el.style.setProperty('--py', (50 - ny * 50).toFixed(1))
          c.el.style.setProperty('--hyp', Math.min(1, Math.hypot(nx, ny)).toFixed(3))
        }
      }

      if (state === 'open' && spreadAt && t > spreadAt + (reduce ? 0.1 : ORBIT_DUR + 0.12)) {
        state = 'spread'
        setPhase('opened')
      }

      // Canvas 2D 空气阻力彩屑粒子
      if (fxUsed) {
        fxc.setTransform(1, 0, 0, 1, 0, 0)
        fxc.clearRect(0, 0, fx.width, fx.height)
        fxUsed = false
      }
      const sw = stage.clientWidth || 860
      const sh = stage.clientHeight || 580
      const D = fx.width / sw
      const ox = sw / 2
      const oy = sh * 0.5
      const R = Math.PI / 180
      bits = bits.filter((b) => {
        if (b.age === undefined) return true
        b.age += dt
        if (b.age < 0) return true
        if (b.inside) {
          b.ly = (b.ly ?? 0) - ((b.up ?? 1200) * dt * 100) / PH
          b.r = (b.r ?? 0) + (b.spin ?? 0) * dt
          if (b.ly > yAt(b.lx ?? 50)) return true
          const [sx, sy, sz] = onStagePos(b.lx ?? 50, b.ly, b.lz ?? 5)
          b.x = sx
          b.y = sy
          b.z = sz
          b.inside = false
          b.age = 0
          b.r0 = b.r
          b.vx = Math.sin(b.a ?? 0) * (b.sp ?? 900)
          b.vy = -Math.cos(b.a ?? 0) * (b.sp ?? 900)
          b.vz = rand(0, 140)
        }
        b.z = (b.z ?? 0) + (b.vz ?? 0) * dt
        b.vy = (b.vy ?? 0) + 2400 * dt
        b.vx = (b.vx ?? 0) + (Math.sin(b.ph ?? 0) * (b.slip ?? 900) + (b.glide ?? 0)) * dt
        const v = Math.hypot(b.vx, b.vy)
        const f = 1 / (1 + (b.c ?? 0.01) * Math.min(1, 0.06 + b.age / 0.45) * v * dt)
        const turn = 0.35 + v / 800
        b.vx *= f
        b.vy *= f
        b.x = (b.x ?? 0) + b.vx * dt
        b.y = (b.y ?? 0) + b.vy * dt
        b.r = (b.r ?? 0) + (b.spin ?? 0) * turn * dt
        b.ph = (b.ph ?? 0) + 7 * turn * dt
        if (b.y >= sh / 2 + 40) return false
        const p = 1400 / (1400 - b.z)
        const k = D * p * (b.sc ?? 1)
        const cr = Math.cos(b.r * R)
        const sr = Math.sin(b.r * R)
        const cq = Math.cos((b.r - (b.r0 ?? 0)) * 0.7 * R)
        fxc.setTransform(k * cr, k * sr, -k * sr * cq, k * cr * cq, (ox + b.x * p) * D, (oy + b.y * p) * D)
        fxc.fillStyle = b.fill
        fxc.fill(BIT[b.kind])
        fxUsed = true
        return true
      })
    }

    raf = requestAnimationFrame(frame)

    return () => {
      stage.style.cursor = ''
      window.clearTimeout(settleTimer)
      window.clearTimeout(wasDragResetTimer)
      cancelAnimationFrame(raf)
      ro.disconnect()
      hit.removeEventListener('pointerdown', onHitDown)
      hit.removeEventListener('pointermove', onHitMove)
      hit.removeEventListener('pointerup', letGo)
      hit.removeEventListener('pointercancel', letGo)
      hit.removeEventListener('lostpointercapture', letGo)
      hit.removeEventListener('click', onHitClick)
      stage.removeEventListener('pointermove', onStagePointerMove)
      stage.removeEventListener('pointerleave', onStagePointerLeave)
      stage.removeEventListener('click', onStageClick)
      sfxRef.current?.rip(0)
      scene.querySelectorAll('.hp-card').forEach((n) => n.remove())
    }
  }, [drawn, packSeed, cardSpecs])

  return (
    <div
      ref={stageRef}
      data-phase={phase}
      className={cn(
        'hp-stage relative flex w-full flex-col items-center justify-between overflow-hidden px-4 py-4 sm:px-6 sm:py-5',
        variant === 'inline'
          ? 'min-h-0 flex-1 text-[#141414] dark:text-white'
          : 'min-h-[560px] text-[#141414] dark:text-white sm:min-h-[600px]',
        className
      )}
    >
      {/* 舞台中心聚光灯与精密表盘刻度圆环装饰 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="size-[min(76vw,540px)] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.68)_0%,rgba(255,255,255,0)_72%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_72%)]" />
        <div className="absolute size-[min(64vw,430px)] rounded-full border border-dashed border-black/[0.08] dark:border-white/[0.08]" />
        <div className="absolute size-[min(78vw,530px)] rounded-full border border-black/[0.04] dark:border-white/[0.04]" />
      </div>

      {/* 顶部导视与实时抽卡结果标签（开包前后动态切换） */}
      <div className="pointer-events-none relative z-20 flex w-full flex-col items-center gap-1.5 px-11 pt-1 text-center sm:px-14">
        <AnimatePresence mode="wait">
          {phase === 'sealed' ? (
            <motion.div
              key="sealed-header"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/75 px-3 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap text-foreground/85 backdrop-blur-md sm:text-xs dark:border-white/15 dark:bg-white/10">
                <span className="size-1.5 shrink-0 rounded-full bg-[#D9381E]" />
                <span className="sm:hidden">3-IN-1 配方盲盒 · 6,162+ 参考卡</span>
                <span className="hidden sm:inline">3-IN-1 角色配方盲盒 · 6,162+ 中文参考卡</span>
              </span>
              <p className="text-xs text-muted-foreground sm:text-sm">
                沿顶部铝箔横向划开，或轻点两次直接拆封今日角色配方
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="opened-header"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto flex flex-col items-center gap-1.5"
            >
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {cardSpecs.map((spec, idx) => {
                  const isLocked = Boolean(lockedSlots[spec.slotKey])
                  return (
                    <motion.button
                      key={spec.slotKey}
                      type="button"
                      title={`点击单独锁入${spec.kindLabel}：${spec.title}`}
                      initial={{ opacity: 0, scale: 0.9, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                      onClick={() => {
                        onSynthesizeSlotRef.current?.(spec.slotKey, drawnRef.current)
                        setLockedSlots((prev) => ({ ...prev, [spec.slotKey]: true }))
                        window.dispatchEvent(
                          new CustomEvent('recipe-dock-impact', {
                            detail: { slot: spec.slotKey, index: 0, isFinal: false },
                          })
                        )
                        sfxRef.current?.land(idx)
                        toast.success(`已单独锁入${spec.kindLabel}：${spec.title}`)
                      }}
                      className={cn(
                        'inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-2xs backdrop-blur-md transition-colors active:scale-95',
                        isLocked
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-black/10 bg-white/85 text-foreground hover:bg-white dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/20'
                      )}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: spec.dotColor }} />
                      <span className={cn('shrink-0 font-mono', isLocked ? 'opacity-80' : 'text-muted-foreground')}>
                        {spec.kindLabel}
                      </span>
                      <span className="truncate font-semibold">{spec.title}</span>
                      {isLocked && <CheckIcon className="size-3 shrink-0" />}
                    </motion.button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                轻点单张卡牌或上方标签可单独锁入槽位 · 点击「立即合成」整包入坞
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 右上角静音与关闭按钮 */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 sm:right-6">
        <button
          type="button"
          aria-label={muted ? '开启音效' : '静音'}
          aria-pressed={muted}
          onClick={onToggleMute}
          className="flex size-9 items-center justify-center rounded-full border border-black/10 bg-white/75 text-[#141414] backdrop-blur-md transition-all hover:bg-white active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
        >
          {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </button>
        {variant === 'modal' && onClose && (
          <button
            type="button"
            aria-label="关闭抽卡舞台"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full border border-black/10 bg-white/75 text-[#141414] backdrop-blur-md transition-colors hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* 物理盲盒与连续一体的 3D 出卡舞台 */}
      <div ref={groundRef} className="hp-ground" aria-hidden="true" />

      <div ref={sceneRef} className="hp-scene">
        <div ref={flowRef} className="hp-flow" aria-hidden="true">
          <svg ref={raysRef} className="hp-rays" viewBox="0 0 100 76" />
        </div>

        <div ref={packRef} className="hp-pack">
          <div ref={frontSkinRef} className="hp-skin hp-front" aria-hidden="true">
            <span className="hp-tear-tag">TEAR HERE ⟶</span>
            <span className="hp-lips">
              <i ref={bodyLipRef} className="hp-lip" />
            </span>
            <b className="hp-mark">CAST</b>
            <span className="hp-series">Cobalt</span>
            <div className="hp-orb">
              <div className="hp-orb-core">
                <span className="hp-orb-rest">
                  <b>✦</b>
                  <small>3-IN-1</small>
                </span>
                <span className="hp-orb-ouch">
                  <b>&gt; &lt;</b>
                  <small>〰</small>
                </span>
              </div>
            </div>
            <span className="hp-foot hp-l">角色配方盲盒</span>
            <span className="hp-foot hp-r">3 cards</span>
          </div>

          <div ref={backSkinRef} className="hp-skin hp-back" aria-hidden="true">
            <i className="hp-fin" />
            <b className="hp-mark hp-sm">CASTDECK</b>
            <p className="hp-blurb">
              姿势 × 服装 × 人像参考工作台
              <br />
              3-IN-1 角色配方卡包
            </p>
          </div>

          <div ref={flapRef} className="hp-flap" aria-hidden="true" />
          <button
            ref={hitRef}
            type="button"
            className="hp-hit"
            aria-label="沿顶部横向拖动撕开卡包，或直接点击开包"
          />
        </div>
      </div>

      <canvas ref={fxCanvasRef} className="hp-fx" aria-hidden="true" />

      {/* 底部操作栏：未开包占位防跳动，开包后提供「再抽一包」与「立即合成」 */}
      <div className="relative z-30 flex min-h-11 flex-wrap items-center justify-center gap-3 pb-1">
        <AnimatePresence>
          {phase === 'opened' && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.94 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <button
                type="button"
                onClick={onRedraw}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-5 text-xs font-semibold text-[#141414] shadow-sm transition-all hover:bg-zinc-100 active:scale-[0.97] dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              >
                <DicesIcon className="size-3.5" />
                <span>再抽一包</span>
              </button>

              <button
                type="button"
                onClick={handleSynthesizeClick}
                className="ks-keycap inline-flex h-10 items-center gap-2 rounded-full bg-[#D9381E] px-6 text-xs font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#C23018] active:scale-[0.97]"
              >
                <SparklesIcon className="size-3.5" />
                <span>立即合成</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 飞入底部 RecipeDock 槽位的跨层飞行克隆层 */}
      {flyingClones.length > 0 &&
        createPortal(
          <div ref={flyLayerRef} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
            {flyingClones.map((c, idx) => (
              <div
                key={c.key}
                data-fly-idx={idx}
                style={{
                  position: 'fixed',
                  left: c.from.left,
                  top: c.from.top,
                  width: c.from.width,
                  height: c.from.height,
                  borderRadius: `${Math.round(c.from.width * 0.072)}px`,
                  overflow: 'hidden',
                  boxShadow: '0 20px 38px -12px rgba(15, 15, 25, 0.45)',
                  willChange: 'transform, opacity',
                }}
              >
                <img
                  src={c.img}
                  alt={c.alt}
                  className="block size-full object-cover"
                  style={{ objectPosition: '50% 15%' }}
                />
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
