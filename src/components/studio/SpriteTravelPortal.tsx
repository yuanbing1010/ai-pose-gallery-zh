import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Mat3, SpritePoseTarget } from '@/components/studio/ArtistMesh3D'
import { ArtistPaintbrush } from '@/components/studio/ArtistPaintbrush'
import { ArtistSprite3D } from '@/components/studio/ArtistSprite3D'
import type { ImageProviderId } from '../../../shared/studio'

export interface SpriteTravelTask {
  id: number
  providerId: ImageProviderId
  direction: 'to_canvas' | 'to_home'
  brushColorHex: string
  brushGlowHex: string
  frustrated?: boolean
  fromRect: { left: number; top: number; width: number; height: number }
  toRect: { left: number; top: number; width: number; height: number }
}

export interface HomeworkThrowTask {
  id: number
  imageUrl: string
  fromRect: { left: number; top: number; width: number; height: number }
  toRect: { left: number; top: number; width: number; height: number }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function SpriteTravelPortal({
  spriteTasks,
  homeworkTask,
  onSpriteArrive,
  onHomeworkLand,
}: {
  spriteTasks: SpriteTravelTask[]
  homeworkTask: HomeworkThrowTask | null
  onSpriteArrive: (taskId: number) => void
  onHomeworkLand: (taskId: number) => void
}) {
  const paperNodeRef = useRef<HTMLDivElement | null>(null)
  const onHomeworkLandRef = useRef(onHomeworkLand)

  useEffect(() => {
    onHomeworkLandRef.current = onHomeworkLand
  }, [onHomeworkLand])

  // 交作业 3D 卡牌飞投动画：双面 3D 卡牌急速翻滚冲向镜头，放大过冲后再丝滑落框贴合屏幕
  const cardInnerRef = useRef<HTMLDivElement | null>(null)
  const glareRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!homeworkTask) return
    const outer = paperNodeRef.current
    const card = cardInnerRef.current
    if (!outer || !card) return

    const duration = 740
    const start = performance.now()
    const { fromRect, toRect } = homeworkTask
    const fromCx = fromRect.left + fromRect.width * 0.5
    const fromCy = fromRect.top + fromRect.height * 0.5
    const toCx = toRect.left + toRect.width * 0.5
    const toCy = toRect.top + toRect.height * 0.5

    let rafId = 0
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      // 快速趋近 + 末段丝滑制动
      const easeOutExpo = t === 1 ? 1 : 1 - Math.pow(2, -9 * t)
      const easeOutCubic = 1 - Math.pow(1 - t, 3)

      // 抛物线先抛起冲向镜头（Scale 在 0.72 附近冲过 1.13 形成砸向镜头的纵深扑面感），再精准回落贴合 1.000
      const arc = Math.sin(t * Math.PI)
      const cameraLunge = t < 0.76
        ? Math.sin((t / 0.76) * (Math.PI * 0.5)) * 0.14
        : 0.14 * Math.pow(1 - (t - 0.76) / 0.24, 1.8)
      const popScale = 1 + cameraLunge

      const curW = lerp(fromRect.width, toRect.width, easeOutCubic)
      const curH = lerp(fromRect.height, toRect.height, easeOutCubic)
      const curCx = lerp(fromCx, toCx, easeOutExpo)
      const curCy = lerp(fromCy, toCy, easeOutExpo) - arc * 52

      // 360° 翻转一圈闪现炫彩卡背后再正面砸向屏幕
      const rotY = 360 * (t < 0.88 ? 1 - Math.pow(1 - t / 0.88, 2.2) : 1)
      const rotX = t < 0.5
        ? lerp(26, -14, t / 0.5)
        : lerp(-14, 0, Math.pow((t - 0.5) / 0.5, 1.5))
      const rotZ = -11 * (1 - easeOutCubic) + Math.sin(t * Math.PI * 1.4) * 7 * (1 - t)

      outer.style.left = `${(curCx - curW * 0.5).toFixed(1)}px`
      outer.style.top = `${(curCy - curH * 0.5).toFixed(1)}px`
      outer.style.width = `${curW.toFixed(1)}px`
      outer.style.height = `${curH.toFixed(1)}px`
      outer.style.transform = `perspective(1100px) scale(${popScale.toFixed(4)}) rotateZ(${rotZ.toFixed(2)}deg)`
      card.style.transform = `rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg)`

      const shadowBlur = 18 + arc * 40 + cameraLunge * 120
      const shadowY = 12 + arc * 26 + cameraLunge * 80
      card.style.boxShadow = `0 ${shadowY.toFixed(0)}px ${shadowBlur.toFixed(0)}px -10px rgba(15, 15, 25, ${(0.24 + arc * 0.28).toFixed(2)})`

      if (glareRef.current) {
        const sweep = t > 0.58 ? Math.sin(((t - 0.58) / 0.42) * Math.PI) : 0
        glareRef.current.style.opacity = (sweep * 0.65).toFixed(2)
        glareRef.current.style.transform = `translateX(${(-110 + Math.max(0, t - 0.5) * 440).toFixed(0)}%) skewX(-18deg)`
      }

      if (t < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        onHomeworkLandRef.current(homeworkTask.id)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [homeworkTask])

  if (spriteTasks.length === 0 && !homeworkTask) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {homeworkTask && (
        <div
          key={`hw-${homeworkTask.id}`}
          ref={paperNodeRef}
          style={{
            position: 'fixed',
            left: homeworkTask.fromRect.left,
            top: homeworkTask.fromRect.top,
            width: homeworkTask.fromRect.width,
            height: homeworkTask.fromRect.height,
            transformStyle: 'preserve-3d',
            willChange: 'left, top, width, height, transform',
          }}
        >
          <div
            ref={cardInnerRef}
            data-homework-card
            className="relative size-full rounded-xl"
            style={{
              transformStyle: 'preserve-3d',
              willChange: 'transform, box-shadow',
            }}
          >
            {/* 3D 卡牌正面：成图作品 + 扫光高光 */}
            <div
              className="absolute inset-0 overflow-hidden rounded-xl border border-border/80 bg-[#FFFDF8] p-1 dark:bg-[#1E2028]"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <img
                src={homeworkTask.imageUrl}
                alt=""
                className="size-full rounded-[8px] object-cover object-center"
              />
              <div
                ref={glareRef}
                className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/75 to-transparent"
                style={{ opacity: 0 }}
              />
            </div>

            {/* 3D 卡牌背面：旋转翻面时一闪而过的极简收藏箔金卡背 */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-[#E5A918]/70 bg-gradient-to-br from-[#17181E] via-[#232532] to-[#0E0F14] p-3 text-center text-[#FAF8F4]"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="flex size-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#E5A918]/45">
                <span className="font-mono text-xs font-black tracking-[0.2em] text-[#E5A918]">
                  CAST · DECK
                </span>
                <span className="h-px w-10 bg-white/25" />
                <span className="text-xs font-bold tracking-widest text-white/85">
                  AI 作品卡
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {spriteTasks.map((task) => (
        <SpriteTravelActor key={`sp-${task.id}`} task={task} onArrive={onSpriteArrive} />
      ))}
    </div>,
    document.body
  )
}

const MUSE_TRAIL_NOTES = [
  { lag: 0.08, dy: -18, dx: -10, rot: -14, fill: '#0082FB', double: false },
  { lag: 0.17, dy: -28, dx: 8, rot: 12, fill: '#38BDF8', double: true },
  { lag: 0.26, dy: -16, dx: -14, rot: -10, fill: '#F48C82', double: false },
] as const

function SpriteTravelActor({
  task,
  onArrive,
}: {
  task: SpriteTravelTask
  onArrive: (taskId: number) => void
}) {
  const spriteNodeRef = useRef<HTMLDivElement | null>(null)
  const museBrushRef = useRef<HTMLDivElement | null>(null)
  const noteNodeRefs = useRef<Array<SVGSVGElement | null>>([])
  const overridePoseRef = useRef<SpritePoseTarget | null>(null)
  const onArriveRef = useRef(onArrive)

  useEffect(() => {
    onArriveRef.current = onArrive
  }, [onArrive])

  // 画师小精灵跨栏移动动画（GPT 蹦跳 / Grok 黑洞滚动 / Gemini 闪现 / Muse 就地躺下利用胶囊圆柱面 3D 翻滚）
  useEffect(() => {
    const node = spriteNodeRef.current
    if (!node) return

    const fromCx = task.fromRect.left + task.fromRect.width * 0.5
    const fromCy = task.fromRect.top + task.fromRect.height * 0.5
    let toCx = task.toRect.left + task.toRect.width * 0.5
    let toCy = task.toRect.top + task.toRect.height * 0.5
    let dx = toCx - fromCx
    let dy = toCy - fromCy
    const travelDistInit = Math.hypot(dx, dy)
    // 建立“原卡片 <-> 绘画台”之间的真实 3D 平坦路面坐标系：
    // 相机俯角 alpha = 32°，屏幕 +x 右、+y 下、+z 朝向观众
    // 路面向上法线 N_floor = (0, -cosα, sinα)；沿路直行方向 R 在路面上且投影严格重合屏幕直线 (dx, dy)
    const ROAD_ALPHA = (32 * Math.PI) / 180
    const cosA = Math.cos(ROAD_ALPHA)
    const sinA = Math.sin(ROAD_ALPHA)
    const tanA = sinA / cosA
    const nFloor = { x: 0, y: -cosA, z: sinA }
    const normVec = (v: { x: number; y: number; z: number }) => {
      const len = Math.hypot(v.x, v.y, v.z) || 1
      return { x: v.x / len, y: v.y / len, z: v.z / len }
    }
    const crossVec = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number }
    ) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    })

    let roadDir = { x: 1, y: 0, z: 0 }
    let cylAxis = { x: 0, y: 1, z: 0 }
    let throwSpin = 334
    let toHandX = toCx
    let toHandY = toCy
    let plantedBrushX = toCx
    let plantedBrushY = toCy
    let throwPeak = 90

    const baseScale = task.direction === 'to_canvas' ? 84 / 112 : 1
    const targetScale = task.direction === 'to_canvas' ? 1 : 84 / 112
    const dirSign = task.direction === 'to_canvas' ? 1 : -1

    const syncTargetCoords = (nextToCx: number, nextToCy: number) => {
      toCx = nextToCx
      toCy = nextToCy
      dx = toCx - fromCx
      dy = toCy - fromCy
      const dist = Math.hypot(dx, dy)
      roadDir =
        dist >= 1
          ? normVec({ x: dx, y: dy, z: dy / tanA })
          : { x: 1, y: 0, z: 0 }
      // 胶囊圆柱轴线 C 严格垂直于行驶方向 R 且躺平在路面上（保持头偏上/左、不倒立）
      cylAxis = normVec(crossVec(nFloor, roadDir))
      if (cylAxis.y < -1e-4 || (Math.abs(cylAxis.y) <= 1e-4 && cylAxis.x < 0)) {
        cylAxis = { x: -cylAxis.x, y: -cylAxis.y, z: -cylAxis.z }
      }
      throwSpin = dx >= 0 ? 334 : -386
      toHandX = toCx + 44 * targetScale
      toHandY = toCy + 40 * targetScale
      plantedBrushX = toCx
      plantedBrushY = toCy + 10 * targetScale
      throwPeak = Math.min(132, 66 + dist * 0.16)
    }

    syncTargetCoords(toCx, toCy)

    const targetSelector =
      task.direction === 'to_canvas'
        ? '[data-monitor-sprite-slot]'
        : `[data-artist-sprite-target="${task.providerId}"]`
    let cachedTargetEl: HTMLElement | null = document.querySelector<HTMLElement>(targetSelector)

    const extractEulerDeg = (m: Mat3) => {
      const pitch = Math.asin(Math.max(-1, Math.min(1, m[7]))) * (180 / Math.PI)
      const yaw = Math.atan2(-m[6], m[8]) * (180 / Math.PI)
      const roll = Math.atan2(-m[1], m[4]) * (180 / Math.PI)
      return { yawDeg: yaw, pitchDeg: pitch, rollDeg: roll }
    }

    const makeBasisFromYZ = (
      yRaw: { x: number; y: number; z: number },
      zRaw: { x: number; y: number; z: number }
    ): Mat3 => {
      const y = normVec(yRaw)
      const x = normVec(crossVec(y, zRaw))
      const z = normVec(crossVec(x, y))
      return [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z]
    }

    const sampleRollMatrix = (phiRad: number): Mat3 => {
      const c = Math.cos(phiRad)
      const s = Math.sin(phiRad)
      // phi=0 时正面朝上（+N_floor），随着滚动向前倒向 +R、贴向路面 -N_floor，形成严格无打滑直滚
      const faceDir = {
        x: c * nFloor.x + s * roadDir.x,
        y: c * nFloor.y + s * roadDir.y,
        z: c * nFloor.z + s * roadDir.z,
      }
      return makeBasisFromYZ(cylAxis, faceDir)
    }

    const museTurns = travelDistInit >= 340 ? 2 : 1
    const museTotalPhi = Math.PI * 2 * museTurns

    const duration =
      task.providerId === 'gemini'
        ? 540
        : task.providerId === 'muse'
          ? museTurns === 2
            ? 1760
            : 1480
          : task.providerId === 'seedream'
            ? 620
            : 600
    const start = performance.now()

    const standY = { x: 0, y: 1, z: 0 }
    const standZ = { x: 0, y: 0, z: 1 }

    // Muse 独立飞投画笔轨迹：先把笔甩到终点插立待命，确认空手后才躺平贴地滚过去，滚抵起身后再接回手里
    const fromHandX = fromCx + 44 * baseScale
    const fromHandY = fromCy + (task.frustrated ? 46 : 40) * baseScale
    const startBrushRot = task.frustrated ? 12 : -24

    const sampleMuseBrush = (kRaw: number) => {
      const k = Math.min(1, Math.max(0, kRaw))
      if (k < 0.06) {
        // 原地向后拧身蓄力
        const u = k / 0.06
        const wind = Math.sin(u * Math.PI * 0.5)
        return {
          x: fromHandX - 10 * wind * baseScale,
          y: fromHandY - 5 * wind * baseScale,
          rotDeg: lerp(startBrushRot, -46, wind),
          scale: baseScale,
        }
      }
      if (k < 0.34) {
        // 高弧线甩向终点，空中翻滚 1 周后笔尖朝下斜插到终点
        const u = (k - 0.06) / 0.28
        const easeOut = 1 - Math.pow(1 - u, 1.55)
        const arc = Math.sin(u * Math.PI)
        const windStartX = fromHandX - 10 * baseScale
        const windStartY = fromHandY - 5 * baseScale
        return {
          x: lerp(windStartX, plantedBrushX, easeOut),
          y: lerp(windStartY, plantedBrushY, easeOut) - arc * throwPeak,
          rotDeg: -46 + throwSpin * easeOut,
          scale: lerp(baseScale, targetScale, easeOut) * (1 + 0.12 * arc),
        }
      }
      if (k < 0.87) {
        // 斜插在终点地面轻颤两下后安静待命，不碍着胶囊在地上滚
        const u = (k - 0.34) / 0.53
        const wobble = Math.exp(-u * 9.5) * Math.sin(u * Math.PI * 6) * 14
        const impactBounce = Math.exp(-u * 12) * Math.sin(u * Math.PI * 2) * 3
        return {
          x: plantedBrushX,
          y: plantedBrushY + impactBounce,
          rotDeg: -72 + wobble,
          scale: targetScale,
        }
      }
      // Muse 滚抵终点起身，把插在地上的画笔挑起来接回手里
      const u = (k - 0.87) / 0.13
      const catchEase = 1 - Math.pow(1 - u, 2.2)
      return {
        x: lerp(plantedBrushX, toHandX, catchEase),
        y: lerp(plantedBrushY, toHandY, catchEase) - Math.sin(u * Math.PI) * 14 * targetScale,
        rotDeg: lerp(-72, -24, catchEase),
        scale: targetScale,
      }
    }

    const sampleMuseRoll = (uRaw: number) => {
      const k = Math.min(1, Math.max(0, uRaw))
      const sc = lerp(baseScale, targetScale, k)
      const lieLiftY = 10
      if (k < 0.14) {
        // 第1段：站在原地蓄力挥腕把画笔扔向终点
        const u = k / 0.14
        let yawDeg = 0
        let pitchDeg = 0
        let rollDeg = 0
        let stretch = 0
        if (u < 0.43) {
          const p = Math.sin((u / 0.43) * Math.PI * 0.5)
          yawDeg = -18 * p
          pitchDeg = 9 * p
          rollDeg = -10 * p
          stretch = -0.04 * p
        } else {
          const p = (u - 0.43) / 0.57
          const flick = Math.sin(p * Math.PI)
          const settle = Math.cos(Math.min(1, p * 1.45) * Math.PI * 0.5)
          yawDeg = -18 * settle + 16 * flick * dirSign
          pitchDeg = 9 * settle - 11 * flick
          rollDeg = -10 * settle + 12 * flick
          stretch = 0.05 * flick
        }
        return {
          x: fromCx,
          y: fromCy,
          matrix: undefined,
          yawDeg,
          pitchDeg,
          rollDeg,
          liftY: 0,
          sx: sc * (1 - stretch * 0.65),
          sy: sc * (1 + stretch),
        }
      }
      if (k < 0.28) {
        // 第2段：画笔已飞出，确认空手后就地平稳倒伏到 3D 平坦路面上，零弹跳
        const u = (k - 0.14) / 0.14
        const tipEase = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
        const thud = u > 0.72 ? Math.sin(((u - 0.72) / 0.28) * Math.PI) : 0
        const mat = makeBasisFromYZ(
          {
            x: lerp(standY.x, cylAxis.x, tipEase),
            y: lerp(standY.y, cylAxis.y, tipEase),
            z: lerp(standY.z, cylAxis.z, tipEase),
          },
          {
            x: lerp(standZ.x, nFloor.x, tipEase),
            y: lerp(standZ.y, nFloor.y, tipEase),
            z: lerp(standZ.z, nFloor.z, tipEase),
          }
        )
        const euler = extractEulerDeg(mat)
        return {
          x: fromCx,
          y: fromCy,
          matrix: mat,
          ...euler,
          liftY: lieLiftY * tipEase,
          sx: sc * (1 + 0.05 * thud),
          sy: sc * (1 - 0.05 * thud),
        }
      }
      if (k < 0.87) {
        // 第3段：无笔轻装、圆柱面完全贴合平坦路面，沿唯一直线轨迹平稳慢速滚转过去
        const u = (k - 0.28) / 0.59
        const rollEase = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
        const mat = sampleRollMatrix(museTotalPhi * rollEase)
        const euler = extractEulerDeg(mat)
        return {
          x: lerp(fromCx, toCx, rollEase),
          y: lerp(fromCy, toCy, rollEase),
          matrix: mat,
          ...euler,
          liftY: lieLiftY,
          sx: sc,
          sy: sc,
        }
      }
      // 第4段：滚抵终点后从路面平稳站直并接回画笔
      const u = (k - 0.87) / 0.13
      const standEase = 1 - Math.pow(1 - u, 2.2)
      const pop = Math.sin(u * Math.PI)
      const mat = makeBasisFromYZ(
        {
          x: lerp(cylAxis.x, standY.x, standEase),
          y: lerp(cylAxis.y, standY.y, standEase),
          z: lerp(cylAxis.z, standY.z, standEase),
        },
        {
          x: lerp(nFloor.x, standZ.x, standEase),
          y: lerp(nFloor.y, standZ.y, standEase),
          z: lerp(nFloor.z, standZ.z, standEase),
        }
      )
      const euler = extractEulerDeg(mat)
      return {
        x: toCx,
        y: toCy,
        matrix: mat,
        ...euler,
        liftY: lieLiftY * (1 - standEase),
        sx: sc * (1 - 0.04 * pop),
        sy: sc * (1 + 0.06 * pop),
      }
    }

    let rafId = 0
    const step = (now: number) => {
      // 实时追踪终点槽位坐标（避免排队横幅展开、失败态切换或窗口细微排布变化导致到达瞬间移位）
      if (!cachedTargetEl || !cachedTargetEl.isConnected) {
        cachedTargetEl = document.querySelector<HTMLElement>(targetSelector)
      }
      if (cachedTargetEl) {
        const liveRect = cachedTargetEl.getBoundingClientRect()
        if (liveRect.width > 0 && liveRect.height > 0) {
          syncTargetCoords(
            liveRect.left + liveRect.width * 0.5,
            liveRect.top + liveRect.height * 0.5
          )
        }
      }

      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const baseSizeScale = lerp(baseScale, targetScale, t)

      let curX = fromCx
      let curY = fromCy
      let rotDeg = 0
      let sx = baseSizeScale
      let sy = baseSizeScale
      let opacity = 1

      if (task.providerId === 'gpt') {
        // 白匣造物主：轻快三连蹦跳跑过来
        const ease = 1 - Math.pow(1 - t, 1.8)
        const hopPhase = t * Math.PI * 3
        const hopLift = Math.abs(Math.sin(hopPhase))
        curX = lerp(fromCx, toCx, ease)
        curY = lerp(fromCy, toCy, ease) - hopLift * 36
        const squash = 1 + (1 - hopLift) * 0.14
        sx = baseSizeScale * squash
        sy = baseSizeScale / squash
        rotDeg = Math.sin(hopPhase * 2) * 10
      } else if (task.providerId === 'grok') {
        // 星舰造像师：圆形黑洞滚过来
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const arc = Math.sin(t * Math.PI)
        curX = lerp(fromCx, toCx, ease)
        curY = lerp(fromCy, toCy, ease) - arc * 22
        rotDeg = dirSign * 720 * ease
        sx = baseSizeScale * (1 + 0.08 * arc)
        sy = sx
      } else if (task.providerId === 'muse') {
        const pose = sampleMuseRoll(t)
        curX = pose.x
        curY = pose.y
        sx = pose.sx
        sy = pose.sy
        overridePoseRef.current = {
          yawDeg: pose.yawDeg,
          pitchDeg: pose.pitchDeg,
          rollDeg: pose.rollDeg,
          lookX: 0,
          lookY: 0,
          liftY: pose.liftY,
          matrix: pose.matrix,
        }

        const brushEl = museBrushRef.current
        if (brushEl) {
          const bp = sampleMuseBrush(t)
          brushEl.style.transform = `translate3d(${bp.x.toFixed(1)}px, ${bp.y.toFixed(1)}px, 0) rotate(${bp.rotDeg.toFixed(1)}deg) scale(${bp.scale.toFixed(3)})`
        }

        MUSE_TRAIL_NOTES.forEach((spec, idx) => {
          const noteEl = noteNodeRefs.current[idx]
          if (!noteEl) return
          const tRoll = t - 0.28
          const tNote = tRoll - spec.lag
          if (tNote <= 0 || t >= 0.96) {
            noteEl.style.opacity = '0'
            return
          }
          const pNote = sampleMuseRoll(0.28 + tNote)
          const life = Math.sin(Math.min(1, tNote / 0.85) * Math.PI)
          const fadeOut = t > 0.82 ? Math.max(0, (0.96 - t) / 0.14) : 1
          const nx = pNote.x + spec.dx * dirSign
          const ny = pNote.y + spec.dy - (t - tNote) * 28
          const nScale = (0.7 + 0.35 * life) * pNote.sx
          noteEl.style.opacity = (life * fadeOut * 0.92).toFixed(2)
          noteEl.style.transform = `translate3d(${nx.toFixed(1)}px, ${ny.toFixed(1)}px, 0) rotate(${(spec.rot + Math.sin(t * 14 + idx) * 8).toFixed(1)}deg) scale(${nScale.toFixed(2)})`
        })
      } else if (task.providerId === 'seedream') {
        // 旋梦造境师：四连节拍轻跃滑翔（像跳动的音符一样轻盈弧线弹跃落位）
        const ease = 1 - Math.pow(1 - t, 1.9)
        const beatHop = Math.abs(Math.sin(t * Math.PI * 4))
        curX = lerp(fromCx, toCx, ease)
        curY = lerp(fromCy, toCy, ease) - beatHop * 24
        const squash = 1 + (1 - beatHop) * 0.1
        sx = baseSizeScale * squash
        sy = baseSizeScale / squash
        rotDeg = Math.sin(t * Math.PI * 4) * 6 * dirSign
      } else {
        // 蕉糖幻想家：原地蓄力闪烁 -> 流星闪现 -> 落地绽放
        if (t < 0.3) {
          const u = t / 0.3
          curX = fromCx
          curY = fromCy - u * 10
          const shrink = 1 - u * 0.78
          sx = baseSizeScale * shrink
          sy = sx
          rotDeg = u * 160
          opacity = 1 - u * 0.35
        } else if (t < 0.68) {
          const u = (t - 0.3) / 0.38
          const ease = 1 - Math.pow(1 - u, 2)
          curX = lerp(fromCx, toCx, ease)
          curY = lerp(fromCy, toCy, ease) - Math.sin(u * Math.PI) * 28
          sx = baseSizeScale * 0.52
          sy = baseSizeScale * 0.28
          rotDeg = 160 + u * 140
          opacity = 0.85
        } else {
          const u = (t - 0.68) / 0.32
          const bloom = u < 0.55 ? lerp(0.25, 1.2, u / 0.55) : lerp(1.2, 1, (u - 0.55) / 0.45)
          curX = toCx
          curY = toCy
          sx = baseSizeScale * bloom
          sy = sx
          rotDeg = 300 + u * 60
          opacity = 1
        }
      }

      node.style.transform = `translate3d(${(curX - fromCx).toFixed(1)}px, ${(curY - fromCy).toFixed(1)}px, 0) rotate(${rotDeg.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
      node.style.opacity = opacity.toFixed(2)

      if (t < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        onArriveRef.current(task.id)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [task])

  return (
    <>
      {task.providerId === 'muse' &&
        MUSE_TRAIL_NOTES.map((n, idx) => (
          <svg
            key={idx}
            ref={(el) => {
              noteNodeRefs.current[idx] = el
            }}
            viewBox={n.double ? '0 0 22 20' : '0 0 18 20'}
            fill="none"
            style={{
              position: 'fixed',
              left: -8,
              top: -8,
              width: n.double ? 18 : 15,
              height: 16,
              opacity: 0,
              willChange: 'transform, opacity',
            }}
          >
            {n.double ? (
              <g fill={n.fill} stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
                <path d="M7.6 14.8 V5.0 L17.6 3.2 V13.2" fill="none" stroke="#FFFFFF" strokeWidth="3.2" />
                <path d="M7.6 14.8 V5.0 L17.6 3.2 V13.2" fill="none" stroke={n.fill} strokeWidth="2.1" />
                <path d="M7.0 5.1 L18.2 3.1" stroke={n.fill} strokeWidth="3.1" />
                <ellipse cx="5.1" cy="15.0" rx="3.3" ry="2.4" transform="rotate(-20 5.1 15.0)" />
                <ellipse cx="15.1" cy="13.4" rx="3.3" ry="2.4" transform="rotate(-20 15.1 13.4)" />
              </g>
            ) : (
              <g fill={n.fill} stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
                <path d="M8.6 14.5 V3.6 C11.4 3.8 14.8 5.6 14.6 9.2" fill="none" stroke="#FFFFFF" strokeWidth="3.3" />
                <path d="M8.6 14.5 V3.6 C11.4 3.8 14.8 5.6 14.6 9.2" fill="none" stroke={n.fill} strokeWidth="2.2" />
                <ellipse cx="5.9" cy="14.6" rx="3.4" ry="2.5" transform="rotate(-20 5.9 14.6)" />
              </g>
            )}
          </svg>
        ))}

      <div
        ref={spriteNodeRef}
        style={{
          position: 'fixed',
          left: task.fromRect.left + task.fromRect.width * 0.5 - 56,
          top: task.fromRect.top + task.fromRect.height * 0.5 - 56,
          width: 112,
          height: 112,
          transform: `translate3d(0, 0, 0) scale(${(task.direction === 'to_canvas' ? 84 / 112 : 1).toFixed(3)})`,
          willChange: 'transform, opacity',
        }}
        className="flex items-center justify-center"
      >
        <ArtistSprite3D
          providerId={task.providerId}
          selected
          holdingBrush={task.providerId !== 'muse'}
          hideHeldBrush={task.providerId === 'muse'}
          traveling
          frustrated={task.frustrated}
          overridePoseRef={task.providerId === 'muse' ? overridePoseRef : undefined}
          brushColorHex={task.brushColorHex}
          brushGlowHex={task.brushGlowHex}
          size="lg"
        />
      </div>

      {/* Muse 专属先抛后滚的独立飞投画笔（避免滚地时画笔磕绊） */}
      {task.providerId === 'muse' && (
        <div
          ref={museBrushRef}
          style={{
            position: 'fixed',
            left: -44,
            top: -14,
            width: 88,
            height: 28,
            transformOrigin: 'center center',
            transform: `translate3d(${(
              task.fromRect.left +
              task.fromRect.width * 0.5 +
              44 * (task.direction === 'to_canvas' ? 84 / 112 : 1)
            ).toFixed(1)}px, ${(
              task.fromRect.top +
              task.fromRect.height * 0.5 +
              (task.frustrated ? 46 : 40) * (task.direction === 'to_canvas' ? 84 / 112 : 1)
            ).toFixed(1)}px, 0) rotate(${task.frustrated ? 12 : -24}deg) scale(${(
              task.direction === 'to_canvas' ? 84 / 112 : 1
            ).toFixed(3)})`,
            willChange: 'transform',
          }}
        >
          <ArtistPaintbrush
            variant="chunky"
            colorHex={task.brushColorHex}
            glowHex={task.brushGlowHex}
            active={!task.frustrated}
            style={{ width: 96, aspectRatio: '224 / 48' }}
          />
        </div>
      )}
    </>
  )
}
