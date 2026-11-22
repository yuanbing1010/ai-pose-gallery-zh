import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ImageProviderId } from '../../../shared/studio'

export type SpriteMood =
  | 'idle'
  | 'hover'
  | 'happy'
  | 'dizzy'
  | 'focus'
  | 'wipe'
  | 'cheer'
  | 'sleep'
  | 'frustrated'
export type SpriteTone = 'jade' | 'indigo' | 'amber' | 'muse' | 'crimson'

export interface SpritePoseTarget {
  yawDeg: number
  pitchDeg: number
  rollDeg: number
  lookX: number
  lookY: number
  liftY: number
  /** 可选直接旋转矩阵（用于 Muse 沿 3D 平坦路面的无万向锁贴地滚转） */
  matrix?: Mat3
}

export interface ArtistMesh3DProps {
  providerId: ImageProviderId
  mood: SpriteMood
  isBlinking: boolean
  selected: boolean
  hovered: boolean
  disabled: boolean
  generating: boolean
  isWiping: boolean
  cheering: boolean
  frustrated?: boolean
  reactionTick: number
  prefersReducedMotion: boolean
  sizePx: number
  /** 由父级或围观逻辑计算出的目标姿态读取函数（避免在高频 rAF 中触发 React 重渲染） */
  getTargetPose: () => SpritePoseTarget
  /** 穿梭/演出期间的即时姿态覆盖（跳过平滑插值，实现 60fps 精准同步翻滚） */
  overridePoseRef?: { current: SpritePoseTarget | null }
  /** 光泽高光读取（归一化 -1..1） */
  getGlareOffset?: () => { x: number; y: number }
  /** 同步 3D 姿态给外层握持画笔的回调函数（可选） */
  onPoseFrame?: (pose: {
    yawDeg: number
    pitchDeg: number
    rollDeg: number
    bobY: number
    scaleX: number
    scaleY: number
  }) => void
  className?: string
}

interface Vec3 {
  x: number
  y: number
  z: number
}

export type Mat3 = [number, number, number, number, number, number, number, number, number]

interface ProjectedPt {
  x: number
  y: number
  z: number
  f: number
}

const DEG_TO_RAD = Math.PI / 180
const CAM_DIST = 5.4

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 严格与 CSS rotateZ(roll) rotateX(pitch) rotateY(yaw) 对齐的正交旋转矩阵 */
function buildRotMatrix(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  const y = yawDeg * DEG_TO_RAD
  const p = pitchDeg * DEG_TO_RAD
  const r = rollDeg * DEG_TO_RAD
  const cosY = Math.cos(y)
  const sinY = Math.sin(y)
  const cosP = Math.cos(p)
  const sinP = Math.sin(p)
  const cosR = Math.cos(r)
  const sinR = Math.sin(r)

  return [
    cosR * cosY - sinR * sinP * sinY,
    -sinR * cosP,
    cosR * sinY + sinR * sinP * cosY,
    sinR * cosY + cosR * sinP * sinY,
    cosR * cosP,
    sinR * sinY - cosR * sinP * cosY,
    -cosP * sinY,
    sinP,
    cosP * cosY,
  ]
}

function xformVec(m: Mat3, x: number, y: number, z: number): Vec3 {
  return {
    x: m[0] * x + m[1] * y + m[2] * z,
    y: m[3] * x + m[4] * y + m[5] * z,
    z: m[6] * x + m[7] * y + m[8] * z,
  }
}

function projectPt(v: Vec3, cx: number, cy: number, scale: number): ProjectedPt {
  const f = CAM_DIST / Math.max(0.8, CAM_DIST - v.z)
  return {
    x: cx + v.x * scale * f,
    y: cy + v.y * scale * f,
    z: v.z,
    f,
  }
}

interface GptVectorTemplates {
  petal: Array<[number, number]>
  outerRail: Array<[number, number]>
  innerRail: Array<[number, number]>
}

/** 预构建官方高精度六瓣交织花结矢量轮廓（拆分开闭环描边与填充，彻底消除花瓣交接处断线/切口线） */
function buildGptVectorTemplates(): GptVectorTemplates {
  const svgToNorm = (x: number, y: number): [number, number] => [(x - 32) / 27.5, (y - 32) / 27.5]

  const outerArc = (steps: number): Array<[number, number]> => {
    const pts: Array<[number, number]> = []
    for (let i = 1; i < steps; i++) {
      const theta = Math.PI + (i / steps) * ((2 * Math.PI) / 3)
      pts.push(svgToNorm(25.8 + 13.6 * Math.cos(theta), 21.26 + 13.6 * Math.sin(theta)))
    }
    return pts
  }

  const innerArcRev = (steps: number): Array<[number, number]> => {
    const pts: Array<[number, number]> = []
    for (let i = 1; i < steps; i++) {
      const theta = (5 * Math.PI) / 3 - (i / steps) * ((2 * Math.PI) / 3)
      pts.push(svgToNorm(25.8 + 5.8 * Math.cos(theta), 21.26 + 5.8 * Math.sin(theta)))
    }
    return pts
  }

  const outerArcPts = outerArc(18)
  const innerArcPts = innerArcRev(12)

  // 完整填充环：右侧潜入端严格收在相邻花瓣底部的安全范围内（内边 x=31.2 < 下下瓣拐点 x=32.0），既无缝隙也绝不穿出到下下瓣内角
  const outerRail: Array<[number, number]> = [
    svgToNorm(12.2, 34.42),
    svgToNorm(12.2, 21.26),
    ...outerArcPts,
    svgToNorm(32.6, 9.48),
    svgToNorm(35.4, 11.1),
  ]
  const innerRail: Array<[number, number]> = [
    svgToNorm(31.2, 17.68),
    svgToNorm(28.7, 16.24),
    ...innerArcPts,
    svgToNorm(20.0, 21.26),
    svgToNorm(20.0, 38.93),
  ]
  const petal: Array<[number, number]> = [...outerRail, ...innerRail]

  return {
    petal,
    outerRail,
    innerRail,
  }
}

const GPT_VECTOR = buildGptVectorTemplates()

const GPT_DEPTH_SLICES = [
  { z: -0.125, fill: '#053B35' },
  { z: -0.098, fill: '#074C45' },
  { z: -0.071, fill: '#0A5C53' },
  { z: -0.044, fill: '#0C6B61' },
  { z: -0.017, fill: '#107B70' },
  { z: 0.008, fill: '#158A7D' },
] as const

const GPT_PETAL_PT_COUNT = GPT_VECTOR.petal.length
const GPT_SLICE_WX0 = new Float64Array(6 * GPT_PETAL_PT_COUNT)
const GPT_SLICE_WY0 = new Float64Array(6 * GPT_PETAL_PT_COUNT)
const GPT_SLICE_WZ0 = new Float64Array(6 * GPT_PETAL_PT_COUNT)
const GPT_WEAVE_PX = new Float64Array(GPT_PETAL_PT_COUNT)
const GPT_WEAVE_PY = new Float64Array(GPT_PETAL_PT_COUNT)

/** 预构建 Google Gemini 官方 4 尖角内凹四角星高精度 128 点矢量轮廓 */
function buildGeminiVectorOutline(): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  // 官方 Gemini 24×24 SVG 曲线比例：M12 0 C12 6.6274 6.6274 12 0 12 ...
  const tip = 0.98
  const c = tip * 0.448
  const p0: [number, number] = [0, -tip]
  const p1: [number, number] = [0, -c]
  const p2: [number, number] = [c, 0]
  const p3: [number, number] = [tip, 0]

  const perQuad = 32
  const quad: Array<[number, number]> = []
  for (let i = 0; i < perQuad; i++) {
    const t = i / perQuad
    const inv = 1 - t
    quad.push([
      inv * inv * inv * p0[0] +
        3 * inv * inv * t * p1[0] +
        3 * inv * t * t * p2[0] +
        t * t * t * p3[0],
      inv * inv * inv * p0[1] +
        3 * inv * inv * t * p1[1] +
        3 * inv * t * t * p2[1] +
        t * t * t * p3[1],
    ])
  }

  for (let q = 0; q < 4; q++) {
    const rot = (q * Math.PI) / 2
    const cr = Math.cos(rot)
    const sr = Math.sin(rot)
    for (const pt of quad) {
      pts.push([pt[0] * cr - pt[1] * sr, pt[0] * sr + pt[1] * cr])
    }
  }
  return pts
}

const GEMINI_OUTLINE = buildGeminiVectorOutline()
const GEMINI_OUTLINE_COMPACT = GEMINI_OUTLINE.filter((_, idx) => idx % 2 === 0)

/** 官方 Meta Muse 灵动波浪 "m" 标志路径采样（用作毛绒圆球头顶皇冠） */
const MUSE_SQUIGGLE_PATH_D =
  'M24.6257 16.1214C28.2365 16.1214 30.8187 18.9408 30.8187 23.3643C30.8185 27.7868 30.1055 31.7765 28.9225 40.2466C28.0743 46.1813 26.62 55.2418 26.0132 59.0088C27.1782 56.7815 29.9074 51.5757 30.3914 50.5982C36.1081 39.061 42.0657 28.7544 43.7826 26.0254C46.0594 22.382 48.062 20.9229 51.1597 20.9229C52.7685 20.923 54.6826 21.7357 55.6315 22.819C56.9178 24.2895 57.1859 26.6602 57.1411 29.244C57.0738 33.2073 56.5599 39.5264 55.8553 46.5698C55.5416 49.7057 54.9365 56.1066 54.5288 60.4004C58.1883 53.8532 64.9609 41.8109 67.6921 37.6058C70.0727 33.9402 72.466 31.5797 75.6836 31.5796C78.4595 31.5796 81.8809 33.5416 81.6772 38.7573C81.3774 46.4556 80.2673 63.2232 79.7607 70.7479C83.1662 65.7913 87.6377 58.4543 89.3148 55.6966C91.0104 52.908 92.75 50.6542 95.3898 50.5778C98.0987 50.4995 99.913 52.341 99.9959 55.1839C100.078 58.0277 98.3835 61.2256 96.1344 64.856C93.6937 68.7957 90.9621 73.0123 87.6383 76.9491C84.3148 80.8856 81.2604 83.8782 76.5991 83.8786C72.4243 83.8786 69.4869 81.1043 69.283 76.0254C69.1768 73.364 69.6804 67.6405 70.0602 63.1673C70.5 57.9875 71.0315 52.9861 71.403 49.6786C67.7337 56.3979 60.0101 70.4676 56.5348 75.9603C53.1343 81.3339 51.4774 83.2269 47.8882 83.2275C44.2977 83.2275 42.7226 80.6416 42.6717 76.7497C42.6142 72.5285 45.7852 47.1821 46.8587 38.737C45.1183 42.4616 40.839 51.6056 38.1551 57.0435C35.5587 62.3055 31.204 71.3978 28.0436 76.6357C25.7668 80.4094 23.2092 83.2273 19.4173 83.2275C15.6252 83.2275 13.4847 80.6784 13.4847 76.5788C13.4847 72.4794 14.6716 65.6492 15.9465 57.1777C16.5839 53.0781 17.3108 48.6133 18.1315 43.8761C18.7324 40.448 19.7764 34.4169 20.4183 30.7129C17.502 35.2539 12.2536 43.4278 10.6567 45.8903C8.88113 48.6291 7.28747 50.626 4.64681 50.6266C1.7329 50.6266 0.000532901 48.3522 0 45.7113C0 43.0703 1.34323 41.0344 3.52376 37.4512C6.32403 32.8465 11.3578 26.57 14.1154 23.2747C17.3656 19.3912 20.6139 16.1219 24.6257 16.1214Z'

function buildMuseVectorOutline(stepsPerSeg = 4): Array<[number, number]> {
  const nums = (MUSE_SQUIGGLE_PATH_D.match(/-?\d*\.?\d+/g) || []).map(Number)
  if (nums.length < 8) return []
  const norm = (x: number, y: number): [number, number] => [(x - 50) / 48, (y - 50) / 48]
  const pts: Array<[number, number]> = []
  let cx = nums[0]
  let cy = nums[1]
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const p0: [number, number] = [cx, cy]
    const p1: [number, number] = [nums[i], nums[i + 1]]
    const p2: [number, number] = [nums[i + 2], nums[i + 3]]
    const p3: [number, number] = [nums[i + 4], nums[i + 5]]
    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg
      const inv = 1 - t
      const vx =
        inv * inv * inv * p0[0] +
        3 * inv * inv * t * p1[0] +
        3 * inv * t * t * p2[0] +
        t * t * t * p3[0]
      const vy =
        inv * inv * inv * p0[1] +
        3 * inv * inv * t * p1[1] +
        3 * inv * t * t * p2[1] +
        t * t * t * p3[1]
      pts.push(norm(vx, vy))
    }
    cx = p3[0]
    cy = p3[1]
  }
  return pts
}

const MUSE_OUTLINE = buildMuseVectorOutline(4)
const MUSE_OUTLINE_COMPACT = MUSE_OUTLINE.filter((_, idx) => idx % 2 === 0)

interface GrokVectorTemplates {
  shapeA: Array<[number, number]>
  shapeB: Array<[number, number]>
  innerSpear: Array<[number, number]>
}

/** 预构建官方 xAI Grok 统一雕塑感双弧轮廓（左半弧无缝外延为左下长拖尾，右上长锋无缝旋入右下月牙环） */
function buildGrokVectorTemplates(): GrokVectorTemplates {
  const pushCubic = (
    out: Array<[number, number]>,
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    steps: number
  ) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const inv = 1 - t
      out.push([
        inv * inv * inv * p0[0] + 3 * inv * inv * t * p1[0] + 3 * inv * t * t * p2[0] + t * t * t * p3[0],
        inv * inv * inv * p0[1] + 3 * inv * inv * t * p1[1] + 3 * inv * t * t * p2[1] + t * t * t * p3[1],
      ])
    }
  }

  const pushArc = (
    out: Array<[number, number]>,
    r: number,
    aStartDeg: number,
    aEndDeg: number,
    steps: number,
    includeFirst = false
  ) => {
    for (let i = includeFirst ? 0 : 1; i <= steps; i++) {
      const a = lerp(aStartDeg, aEndDeg, i / steps) * DEG_TO_RAD
      out.push([Math.cos(a) * r, Math.sin(a) * r])
    }
  }

  const rOut = 0.77
  const rIn = 0.55

  // Shape A：上左新月弧 → 8 点钟外扩拐点 → 无缝拉出左下锋利长拖尾 → 收回内弧闭合
  const shapeA: Array<[number, number]> = []
  pushArc(shapeA, rOut, -49, -196, 26, true) // (+0.505,-0.581) 逆时针绕顶、左至 (-0.740,+0.212)
  pushCubic(
    shapeA,
    shapeA[shapeA.length - 1],
    [-0.695, 0.375],
    [-0.785, 0.695],
    [-1.12, 1.1],
    14
  )
  pushCubic(shapeA, [-1.12, 1.1], [-0.82, 0.72], [-0.56, 0.44], [-0.431, 0.341], 12)
  pushArc(shapeA, rIn, -218.4, -58, 22, false) // 回绕内圈至 (+0.291,-0.466)

  // Shape B：下右月牙环 → 2 点钟外扩拐点 → 无缝拉出右上长拖尾 → 沿对角线内收并绕内弯闭合
  const shapeB: Array<[number, number]> = []
  pushArc(shapeB, rOut, 131, -16, 26, true) // (-0.505,+0.581) 逆时针绕底、右至 (+0.740,-0.212)
  pushCubic(
    shapeB,
    shapeB[shapeB.length - 1],
    [0.695, -0.375],
    [0.785, -0.695],
    [1.14, -1.12],
    14
  )
  // 对角线内锋贴着中央黑洞外缘滑入并光滑拐回内圈 2 点钟内弯
  pushCubic(shapeB, [1.14, -1.12], [0.76, -0.74], [0.46, -0.44], [0.33, -0.32], 12)
  pushCubic(shapeB, [0.33, -0.32], [0.44, -0.25], [0.54, -0.14], [0.545, -0.075], 8)
  pushArc(shapeB, rIn, -7.8, 122, 22, false) // 回绕右/底部内圈至 (-0.291,+0.466)

  // Shape B 穿过黑洞事件视界背侧的内斜切尖（侧面转角旋转时展现完整穿过黑洞的官方长锋轮廓）
  const innerSpear: Array<[number, number]> = [
    [-0.22, 0.22],
    [0.37, -0.35],
    [0.46, -0.24],
    [-0.22, 0.22],
  ]

  return { shapeA, shapeB, innerSpear }
}

const GROK_VECTOR = buildGrokVectorTemplates()

/** 绘制表面贴合的矢量表情（投影到 3D 球冠/晶面切平面，支持全部表情 + 眨眼 + 任意视角自动遮挡） */
function drawSurfaceFace(
  ctx: CanvasRenderingContext2D,
  rot: Mat3,
  cx: number,
  cy: number,
  scale: number,
  mood: SpriteMood,
  tone: SpriteTone,
  isBlinking: boolean,
  lookX: number,
  lookY: number,
  domeCenterZ: number,
  domeRadius: number,
  spanRadX: number,
  spanRadY: number,
  domeCenterY = 0,
  timeSec = 0
) {
  const blinkAllowed =
    mood !== 'sleep' &&
    mood !== 'cheer' &&
    mood !== 'dizzy' &&
    mood !== 'wipe' &&
    mood !== 'happy' &&
    mood !== 'frustrated'
  const eyeScaleY = isBlinking && blinkAllowed ? 0.14 : 1

  const eyeColor =
    tone === 'indigo'
      ? '#E0E7FF'
      : tone === 'jade'
        ? '#0F5C54'
        : tone === 'muse'
          ? '#1A1412'
          : tone === 'crimson'
            ? '#0F172A'
            : '#18181B'
  const pillColor = tone === 'indigo' ? '#C7D2FE' : eyeColor

  // 将面部标准化坐标 (fx, fy) ∈ [-1, 1] 映射到 3D 球面点
  const spherePt = (fx: number, fy: number): { pt: Vec3; n: Vec3 } => {
    const ax = clamp(fx + lookX * 0.24, -1.35, 1.35) * spanRadX
    const ay = clamp(fy + lookY * 0.22, -1.25, 1.25) * spanRadY
    const cosAx = Math.cos(ax)
    const sinAx = Math.sin(ax)
    const cosAy = Math.cos(ay)
    const sinAy = Math.sin(ay)
    const nx = sinAx * cosAy
    const ny = sinAy
    const nz = cosAx * cosAy
    return {
      pt: {
        x: domeRadius * nx,
        y: domeCenterY + domeRadius * ny,
        z: domeCenterZ + domeRadius * nz,
      },
      n: { x: nx, y: ny, z: nz },
    }
  }

  const centerInfo = spherePt(0, 0)
  const worldCenterN = xformVec(rot, centerInfo.n.x, centerInfo.n.y, centerInfo.n.z)
  if (worldCenterN.z <= 0.04) return
  const faceAlpha = clamp((worldCenterN.z - 0.04) / 0.24, 0, 1)

  // 计算以 (fx0, fy0) 为原点、本地 SVG (28×14 空间) 映射到屏幕的局部仿射变换
  const applyLocalFrame = (fx0: number, fy0: number, fn: () => void) => {
    const s0 = spherePt(fx0, fy0)
    const wn = xformVec(rot, s0.n.x, s0.n.y, s0.n.z)
    if (wn.z <= 0.02) return
    const eps = 0.08
    const su = spherePt(fx0 + eps, fy0)
    const sv = spherePt(fx0, fy0 + eps)

    const p0 = projectPt(xformVec(rot, s0.pt.x, s0.pt.y, s0.pt.z), cx, cy, scale)
    const pu = projectPt(xformVec(rot, su.pt.x, su.pt.y, su.pt.z), cx, cy, scale)
    const pv = projectPt(xformVec(rot, sv.pt.x, sv.pt.y, sv.pt.z), cx, cy, scale)

    // 在 28×14 的面部基准坐标中：左右范围 [-14, 14] 对应 fx ∈ [-1, 1]；上下 [-7, 7] 对应 fy ∈ [-1, 1]
    const ux = (pu.x - p0.x) / (eps * 14)
    const uy = (pu.y - p0.y) / (eps * 14)
    const vx = ((pv.x - p0.x) / (eps * 7)) * eyeScaleY
    const vy = ((pv.y - p0.y) / (eps * 7)) * eyeScaleY

    const localAlpha = faceAlpha * clamp((wn.z - 0.02) / 0.22, 0, 1)
    ctx.save()
    ctx.globalAlpha *= localAlpha
    ctx.transform(ux, uy, vx, vy, p0.x, p0.y)
    fn()
    ctx.restore()
  }

  const eyeSpread = tone === 'muse' ? 0.76 : 0.43
  const blushSpread = tone === 'muse' ? 0.9 : 0.68

  const drawBlush = (side: -1 | 1, yOff: number, r: number, op: number) => {
    if (tone === 'crimson') return
    const fx = side * blushSpread
    applyLocalFrame(fx, yOff / 7, () => {
      if (tone === 'muse') {
        const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 2.15)
        g.addColorStop(0, 'rgba(244, 134, 122, 0.78)')
        g.addColorStop(0.55, 'rgba(244, 134, 122, 0.34)')
        g.addColorStop(1, 'rgba(244, 134, 122, 0)')
        ctx.fillStyle = g
        ctx.globalAlpha *= op
        ctx.beginPath()
        ctx.arc(0, 0, r * 2.15, 0, Math.PI * 2)
        ctx.fill()
        return
      }
      ctx.fillStyle = '#FB7185'
      ctx.globalAlpha *= op
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  if (mood === 'cheer') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * (tone === 'muse' ? eyeSpread : 0.45), -0.05, () => {
        ctx.strokeStyle = eyeColor
        ctx.lineWidth = 2.3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-2.6, 1.4)
        ctx.quadraticCurveTo(0, -2.9, 2.6, 1.4)
        ctx.stroke()
      })
      drawBlush(side, 3.2, 1.5, 0.82)
    }
    applyLocalFrame(0, 0.36, () => {
      ctx.strokeStyle = eyeColor
      ctx.lineWidth = 1.7
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-2.2, -0.5)
      ctx.quadraticCurveTo(0, 2.5, 2.2, -0.5)
      ctx.stroke()
    })
    return
  }

  if (mood === 'sleep') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * eyeSpread, 0, () => {
        ctx.strokeStyle = eyeColor
        ctx.globalAlpha *= 0.6
        ctx.lineWidth = 2.1
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-2.75, 0)
        ctx.lineTo(2.75, 0)
        ctx.stroke()
      })
    }
    return
  }

  if (mood === 'frustrated') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * eyeSpread, 0.02, () => {
        // 下垂委屈八字眉
        ctx.strokeStyle = eyeColor
        ctx.lineWidth = 1.65
        ctx.lineCap = 'round'
        ctx.beginPath()
        if (side < 0) {
          ctx.moveTo(1.7, -3.7)
          ctx.lineTo(-2.5, -2.0)
        } else {
          ctx.moveTo(-1.7, -3.7)
          ctx.lineTo(2.5, -2.0)
        }
        ctx.stroke()

        // 微瘪泛泪大眼
        ctx.fillStyle = pillColor
        ctx.beginPath()
        ctx.roundRect(-1.95, -1.35, 3.9, 4.1, 1.95)
        ctx.fill()

        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.beginPath()
        ctx.arc(-0.7, -0.35, 0.85, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = 'rgba(125,211,252,0.95)'
        ctx.beginPath()
        ctx.arc(side * 0.75, 1.55, 0.78, 0, Math.PI * 2)
        ctx.fill()
      })

      applyLocalFrame(side * blushSpread, 3.6 / 7, () => {
        ctx.fillStyle = '#60A5FA'
        ctx.globalAlpha *= 0.42
        ctx.beginPath()
        ctx.arc(0, 0, 1.25, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    // 委屈撇嘴
    applyLocalFrame(0, 0.5, () => {
      ctx.strokeStyle = eyeColor
      ctx.lineWidth = 1.55
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-2.3, 1.0)
      ctx.quadraticCurveTo(0, -1.65, 2.3, 1.0)
      ctx.stroke()
    })
    return
  }

  if (mood === 'dizzy' || mood === 'wipe') {
    if (mood === 'dizzy' && tone === 'crimson') {
      // 保持同款干净纯黑圆豆眼睛，眼珠带白高光各自逆向咕噜噜转圈（不加腮红、不变脸）
      const orbitA = timeSec * 12.5
      for (const side of [-1, 1] as const) {
        const ang = side < 0 ? orbitA : -orbitA + Math.PI
        const dx = Math.cos(ang) * 1.15
        const dy = Math.sin(ang) * 1.15
        applyLocalFrame(side * 0.42, -0.02, () => {
          ctx.fillStyle = pillColor
          ctx.beginPath()
          ctx.roundRect(dx - 1.95, dy - 2.35, 3.9, 4.7, 1.95)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.beginPath()
          ctx.arc(dx - 0.65, dy - 1.0, 0.9, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      return
    }
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * eyeSpread, 0, () => {
        ctx.strokeStyle = eyeColor
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 2.2
        ctx.beginPath()
        if (side < 0) {
          ctx.moveTo(-2.2, -2.8)
          ctx.lineTo(2.2, 0)
          ctx.lineTo(-2.2, 2.8)
        } else {
          ctx.moveTo(2.2, -2.8)
          ctx.lineTo(-2.2, 0)
          ctx.lineTo(2.2, 2.8)
        }
        ctx.stroke()
      })
      drawBlush(side, 3.4, 1.4, 0.78)
    }
    applyLocalFrame(0, 0.48, () => {
      ctx.strokeStyle = eyeColor
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (mood === 'wipe') {
        ctx.moveTo(-2.4, -0.4)
        ctx.quadraticCurveTo(0, 1.6, 2.4, -0.4)
      } else {
        ctx.moveTo(-2.0, -0.4)
        ctx.quadraticCurveTo(0, 1.3, 2.0, -0.4)
      }
      ctx.stroke()
    })
    return
  }

  if (mood === 'happy') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * eyeSpread, 0, () => {
        ctx.strokeStyle = eyeColor
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-2.6, 1.2)
        ctx.quadraticCurveTo(0, -2.6, 2.6, 1.2)
        ctx.stroke()
      })
      if (tone === 'amber' || tone === 'muse') {
        drawBlush(side, 3.0, 1.45, 0.78)
      }
    }
    if (tone === 'muse') {
      applyLocalFrame(0, 0.24, () => {
        ctx.strokeStyle = eyeColor
        ctx.lineWidth = 1.55
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-1.85, -0.4)
        ctx.quadraticCurveTo(0, 1.65, 1.85, -0.4)
        ctx.stroke()
      })
    }
    return
  }

  if (mood === 'hover' && tone === 'amber') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * 0.43, -0.04, () => {
        ctx.fillStyle = '#18181B'
        ctx.beginPath()
        ctx.moveTo(0, -4.0)
        ctx.lineTo(1.0, -1.0)
        ctx.lineTo(4.0, 0)
        ctx.lineTo(1.0, 1.0)
        ctx.lineTo(0, 4.0)
        ctx.lineTo(-1.0, 1.0)
        ctx.lineTo(-4.0, 0)
        ctx.lineTo(-1.0, -1.0)
        ctx.closePath()
        ctx.fill()
      })
      drawBlush(side, 3.8, 1.4, 0.78)
    }
    return
  }

  const pillGlintColor = 'rgba(255,255,255,0.92)'

  // focus（埋头绘画）：去掉突兀眉毛，保持与日常完全一致的眼型与眼距比例 + 微小专注表情嘴 + 淡腮红
  if (mood === 'focus') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * eyeSpread, -0.02, () => {
        ctx.fillStyle = pillColor
        ctx.beginPath()
        ctx.roundRect(-2.0, -2.65, 4.0, 5.3, 2.0)
        ctx.fill()
        ctx.fillStyle = pillGlintColor
        ctx.beginPath()
        ctx.arc(-0.75, -1.35, 0.92, 0, Math.PI * 2)
        ctx.fill()
      })
      drawBlush(side, 3.4, 1.35, 0.62)
    }
    applyLocalFrame(0, 0.42, () => {
      ctx.strokeStyle = eyeColor
      ctx.lineWidth = 1.35
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-1.9, 0.2)
      ctx.quadraticCurveTo(-0.95, -0.8, 0, 0.2)
      ctx.quadraticCurveTo(0.95, 1.2, 1.9, 0.2)
      ctx.stroke()
    })
    return
  }

  // idle / hover（jade / indigo / muse）
  if (tone === 'muse') {
    const beadH = mood === 'hover' ? 4.1 : 3.65
    const beadW = 3.8
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * eyeSpread, -0.03, () => {
        ctx.fillStyle = pillColor
        ctx.beginPath()
        ctx.roundRect(-beadW * 0.5, -beadH * 0.5, beadW, beadH, beadW * 0.5)
        ctx.fill()
        ctx.fillStyle = pillGlintColor
        ctx.beginPath()
        ctx.arc(-0.68, -beadH * 0.2, 0.88, 0, Math.PI * 2)
        ctx.fill()
      })
      drawBlush(side, 2.9, 1.45, 0.78)
    }
    applyLocalFrame(0, 0.2, () => {
      ctx.strokeStyle = eyeColor
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-1.85, -0.35)
      ctx.quadraticCurveTo(0, 1.7, 1.85, -0.35)
      ctx.stroke()
    })
    return
  }

  const pillH = mood === 'hover' ? 6.6 : 5.6
  for (const side of [-1, 1] as const) {
    applyLocalFrame(side * 0.42, -0.02, () => {
      ctx.fillStyle = pillColor
      ctx.beginPath()
      ctx.roundRect(-2.0, -pillH * 0.5, 4.0, pillH, 2.0)
      ctx.fill()
      ctx.fillStyle = pillGlintColor
      ctx.beginPath()
      ctx.arc(-0.75, -pillH * 0.5 + 1.35, 0.95, 0, Math.PI * 2)
      ctx.fill()
    })
    if (tone === 'amber') {
      drawBlush(side, 3.2, 1.35, 0.65)
    }
  }
}

/** 渲染 3D GPT（高精度六瓣交织陶瓷花结 + 3D 实心挤压侧壁 + 立体瓷球脸 + 双瓷手） */
function drawGpt3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  rot: Mat3,
  spinRad: number,
  mood: SpriteMood,
  isBlinking: boolean,
  selected: boolean,
  hovered: boolean,
  lookX: number,
  lookY: number,
  glare: { x: number; y: number }
) {
  const faceNz = rot[8]
  const facingFront = faceNz >= 0
  const hoverZoom = hovered ? 1.04 : 1
  const s = scale * hoverZoom

  // 中心瓷球位置
  const sphereLocal: Vec3 = { x: 0, y: 0, z: 0.065 }
  const sphereWorld = xformVec(rot, sphereLocal.x, sphereLocal.y, sphereLocal.z)
  const sphereProj = projectPt(sphereWorld, cx, cy, s)
  const sphereR = 0.425 * s * sphereProj.f

  const flowerCenterWorld = xformVec(rot, 0, 0, -0.04)

  // 两个 3D 悬浮小瓷手
  const handsLocal: Vec3[] = [
    { x: -0.78, y: 0.54, z: 0.34 },
    { x: 0.76, y: 0.5, z: 0.36 },
  ]
  const handsWorld = handsLocal.map((h) => {
    const w = xformVec(rot, h.x, h.y, h.z)
    const p = projectPt(w, cx, cy, s)
    return { w, p, r: 0.115 * s * p.f }
  })

  // 预投影开放曲线（右侧潜入端保持开放不封口，左侧叠压面精确对齐相邻花瓣接缝）
  const traceLoopAtZ = (
    pts: Array<[number, number]>,
    rotAngle: number,
    zLocal: number,
    close = true
  ) => {
    const ca = Math.cos(rotAngle)
    const sa = Math.sin(rotAngle)
    for (let i = 0; i < pts.length; i++) {
      const px = pts[i][0] * ca - pts[i][1] * sa
      const py = pts[i][0] * sa + pts[i][1] * ca
      const w = xformVec(rot, px, py, zLocal)
      const p = projectPt(w, cx, cy, s)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    if (close) ctx.closePath()
  }

  // 带 3D 编织高低起伏的曲线投影：左腿（上位叠压段）微抬，右臂（下位潜入段）沉入底层，消除“同一平面十字交叉”错觉
  const traceWeaveLoopAtZ = (
    pts: Array<[number, number]>,
    rotAngle: number,
    baseZ: number,
    close = true
  ) => {
    const ca = Math.cos(rotAngle)
    const sa = Math.sin(rotAngle)
    for (let i = 0; i < pts.length; i++) {
      const lx = pts[i][0]
      const ly = pts[i][1]
      const dz = clamp((-lx - 0.14) * 0.036, -0.02, 0.024)
      const px = lx * ca - ly * sa
      const py = lx * sa + ly * ca
      const w = xformVec(rot, px, py, baseZ + dz)
      const p = projectPt(w, cx, cy, s)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    if (close) ctx.closePath()
  }

  const drawFlowerBody = () => {
    // 1. 紧密堆积的 3D 实心挤压侧壁：先一次计算 z=0 的六瓣世界基坐标，6 层切片直接复用并偏移 Z 轴分量
    const ptCount = GPT_PETAL_PT_COUNT
    const petalPts = GPT_VECTOR.petal
    for (let p = 0; p < 6; p++) {
      const ang = spinRad + (p * Math.PI) / 3
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const baseOffset = p * ptCount
      for (let i = 0; i < ptCount; i++) {
        const px = petalPts[i][0] * ca - petalPts[i][1] * sa
        const py = petalPts[i][0] * sa + petalPts[i][1] * ca
        const idx = baseOffset + i
        GPT_SLICE_WX0[idx] = rot[0] * px + rot[1] * py
        GPT_SLICE_WY0[idx] = rot[3] * px + rot[4] * py
        GPT_SLICE_WZ0[idx] = rot[6] * px + rot[7] * py
      }
    }

    const sliceCount = GPT_DEPTH_SLICES.length
    const sliceLineW = Math.max(0.8, s * 0.024)
    ctx.lineJoin = 'round'
    ctx.lineWidth = sliceLineW
    for (let step = 0; step < sliceCount; step++) {
      const sl = GPT_DEPTH_SLICES[facingFront ? step : sliceCount - 1 - step]
      const zx = rot[2] * sl.z
      const zy = rot[5] * sl.z
      const zz = rot[8] * sl.z

      ctx.beginPath()
      for (let p = 0; p < 6; p++) {
        const baseOffset = p * ptCount
        for (let i = 0; i < ptCount; i++) {
          const idx = baseOffset + i
          const vz = GPT_SLICE_WZ0[idx] + zz
          const f = CAM_DIST / Math.max(0.8, CAM_DIST - vz)
          const sx = cx + (GPT_SLICE_WX0[idx] + zx) * s * f
          const sy = cy + (GPT_SLICE_WY0[idx] + zy) * s * f
          if (i === 0) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        }
        ctx.closePath()
      }
      ctx.fillStyle = sl.fill
      ctx.fill()
      ctx.strokeStyle = sl.fill
      ctx.stroke()
    }

    if (facingFront) {
      // 2. 正面：逐瓣独立明暗渐变（高位叠压端清亮白翠 → 潜入底层端深邃松石绿）+ 实景环境遮蔽投影，呈现真 3D 穿插层次
      const zFront = 0.026
      const sCenter = projectPt(xformVec(rot, -0.22, -0.28, zFront), cx, cy, s)
      const sheenGrad = ctx.createRadialGradient(
        sCenter.x,
        sCenter.y,
        s * 0.04,
        sphereProj.x,
        sphereProj.y,
        s * 1.15
      )
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.36)')
      sheenGrad.addColorStop(0.55, 'rgba(45, 212, 191, 0.06)')
      sheenGrad.addColorStop(1, 'rgba(13, 89, 82, 0.16)')

      const strokeW = Math.max(1.0, s * 0.036)
      const strokeCol = 'rgba(15, 92, 84, 0.68)'
      const specW = Math.max(0.65, s * 0.022)
      const specCol =
        selected || hovered ? 'rgba(255, 255, 255, 0.64)' : 'rgba(255, 255, 255, 0.42)'

      const paintPetalPiece = (
        fillPts: Array<[number, number]>,
        outerPts: Array<[number, number]>,
        innerPts: Array<[number, number]>,
        angle: number,
        zVal: number,
        castShadow: boolean
      ) => {
        const ca = Math.cos(angle)
        const sa = Math.sin(angle)
        const rotLocal = (lx: number, ly: number, lz: number) =>
          projectPt(xformVec(rot, lx * ca - ly * sa, lx * sa + ly * ca, lz), cx, cy, s)

        // 按花瓣自身穿插方向着色：左上叠压段更亮，右下穿插潜入段更深，制造天然上下层对比
        const gStart = rotLocal(-0.68, -0.45, zVal + 0.02)
        const gEnd = rotLocal(0.48, -0.18, zVal - 0.02)
        const petalGrad = ctx.createLinearGradient(gStart.x, gStart.y, gEnd.x, gEnd.y)
        petalGrad.addColorStop(0, '#F0FDFA')
        petalGrad.addColorStop(0.48, '#A7F3D0')
        petalGrad.addColorStop(0.82, '#5EEAD4')
        petalGrad.addColorStop(1, '#14B8A6')

        // 单次投影花瓣主轮廓，投影与填充直接复用屏幕坐标，避免重复矩阵计算与 ctx.save/restore
        const fillLen = fillPts.length
        for (let i = 0; i < fillLen; i++) {
          const lx = fillPts[i][0]
          const ly = fillPts[i][1]
          const dz = clamp((-lx - 0.14) * 0.036, -0.02, 0.024)
          const px = lx * ca - ly * sa
          const py = lx * sa + ly * ca
          const w = xformVec(rot, px, py, zVal + dz)
          const p = projectPt(w, cx, cy, s)
          GPT_WEAVE_PX[i] = p.x
          GPT_WEAVE_PY[i] = p.y
        }

        if (castShadow) {
          const shX = s * 0.016
          const shY = s * 0.026
          ctx.beginPath()
          for (let i = 0; i < fillLen; i++) {
            const x = GPT_WEAVE_PX[i] + shX
            const y = GPT_WEAVE_PY[i] + shY
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.fillStyle = 'rgba(4, 47, 46, 0.18)'
          ctx.fill()
        }

        ctx.beginPath()
        for (let i = 0; i < fillLen; i++) {
          if (i === 0) ctx.moveTo(GPT_WEAVE_PX[i], GPT_WEAVE_PY[i])
          else ctx.lineTo(GPT_WEAVE_PX[i], GPT_WEAVE_PY[i])
        }
        ctx.closePath()
        ctx.fillStyle = petalGrad
        ctx.fill()
        ctx.fillStyle = sheenGrad
        ctx.fill()

        // 仅描边外弧、内弧长边及高位左侧契合切边 [outer[0] -> inner[last]]（右侧潜入端永不封口）
        const overSeam: Array<[number, number]> = [outerPts[0], innerPts[innerPts.length - 1]]
        ctx.beginPath()
        traceWeaveLoopAtZ(outerPts, angle, zVal, false)
        traceWeaveLoopAtZ(innerPts, angle, zVal, false)
        traceWeaveLoopAtZ(overSeam, angle, zVal, false)
        ctx.lineWidth = strokeW
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = strokeCol
        ctx.stroke()

        // 外缘与叠压沿陶瓷亮釉高光
        ctx.beginPath()
        traceWeaveLoopAtZ(outerPts, angle, zVal + 0.004, false)
        ctx.lineWidth = specW
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = specCol
        ctx.stroke()

        ctx.beginPath()
        traceWeaveLoopAtZ(overSeam, angle, zVal + 0.004, false)
        ctx.lineWidth = specW * 0.85
        ctx.lineCap = 'round'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)'
        ctx.stroke()
      }

      for (let p = 0; p < 6; p++) {
        paintPetalPiece(
          GPT_VECTOR.petal,
          GPT_VECTOR.outerRail,
          GPT_VECTOR.innerRail,
          spinRad + (p * Math.PI) / 3,
          zFront,
          p > 0
        )
      }

      // 第 6→0 瓣完整交织盖帽：以 evenodd 严格裁除第 1 瓣所占空间，消除 1 点钟方向切口缺口并保留 10 点钟叠压层次
      ctx.save()
      ctx.beginPath()
      ctx.rect(-cx * 2, -cy * 2, cx * 6, cy * 6)
      traceWeaveLoopAtZ(GPT_VECTOR.petal, spinRad + Math.PI / 3, zFront, true)
      ctx.clip('evenodd')
      paintPetalPiece(
        GPT_VECTOR.petal,
        GPT_VECTOR.outerRail,
        GPT_VECTOR.innerRail,
        spinRad,
        zFront + 0.004,
        true
      )
      ctx.restore()

      // 仅补强第 1 瓣左侧叠压沿描边与白釉高光，让 1 点钟交织线丝滑衔接，避免右半段穿过第 2 瓣
      const p1Angle = spinRad + Math.PI / 3
      const p1LeftEdge: Array<[number, number]> = [
        GPT_VECTOR.outerRail[0],
        GPT_VECTOR.outerRail[1],
      ]
      const p1Seam: Array<[number, number]> = [
        GPT_VECTOR.outerRail[0],
        GPT_VECTOR.innerRail[GPT_VECTOR.innerRail.length - 1],
      ]
      ctx.beginPath()
      traceWeaveLoopAtZ(p1LeftEdge, p1Angle, zFront, false)
      traceWeaveLoopAtZ(p1Seam, p1Angle, zFront, false)
      ctx.lineWidth = strokeW
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = strokeCol
      ctx.stroke()
      ctx.beginPath()
      traceWeaveLoopAtZ(p1LeftEdge, p1Angle, zFront + 0.004, false)
      ctx.lineWidth = specW
      ctx.lineCap = 'round'
      ctx.strokeStyle = specCol
      ctx.stroke()
    } else {
      // 3. 背面（转体 > 90° 时显现）：雕花青玉背壳与中心翡翠圆徽
      const zBack = -0.132
      ctx.beginPath()
      for (let p = 0; p < 6; p++) {
        traceLoopAtZ(GPT_VECTOR.petal, spinRad + (p * Math.PI) / 3, zBack, true)
      }
      ctx.fillStyle = '#0D5952'
      ctx.fill()

      ctx.beginPath()
      for (let p = 0; p < 6; p++) {
        const ang = spinRad + (p * Math.PI) / 3
        traceLoopAtZ(GPT_VECTOR.outerRail, ang, zBack, false)
        traceLoopAtZ(GPT_VECTOR.innerRail, ang, zBack, false)
      }
      ctx.lineWidth = Math.max(0.85, s * 0.03)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.48)'
      ctx.stroke()

      const bCenter = projectPt(xformVec(rot, 0, 0, zBack - 0.01), cx, cy, s)
      const medR = 0.38 * s * bCenter.f
      ctx.beginPath()
      ctx.arc(bCenter.x, bCenter.y, medR, 0, Math.PI * 2)
      ctx.fillStyle = '#134E4A'
      ctx.fill()
      ctx.lineWidth = Math.max(1, s * 0.034)
      ctx.strokeStyle = '#5EEAD4'
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(bCenter.x, bCenter.y, medR * 0.44, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(45, 212, 191, 0.75)'
      ctx.fill()
    }
  }

  const drawHand = (h: { w: Vec3; p: ProjectedPt; r: number }) => {
    const grad = ctx.createRadialGradient(
      h.p.x - h.r * 0.32,
      h.p.y - h.r * 0.34,
      h.r * 0.1,
      h.p.x,
      h.p.y,
      h.r
    )
    grad.addColorStop(0, '#FFFFFF')
    grad.addColorStop(0.6, '#E6FFFA')
    grad.addColorStop(1, '#99F6E4')
    ctx.beginPath()
    ctx.arc(h.p.x, h.p.y, h.r, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.lineWidth = Math.max(0.8, s * 0.022)
    ctx.strokeStyle = 'rgba(15, 118, 110, 0.45)'
    ctx.stroke()
  }

  const drawCoreSphereAndFace = () => {
    const hlX = sphereProj.x + (-0.34 + glare.x * 0.16) * sphereR
    const hlY = sphereProj.y + (-0.36 + glare.y * 0.16) * sphereR
    const grad = ctx.createRadialGradient(hlX, hlY, sphereR * 0.08, sphereProj.x, sphereProj.y, sphereR)
    grad.addColorStop(0, '#FFFFFF')
    grad.addColorStop(0.58, '#F0FDFA')
    grad.addColorStop(0.88, '#CCFBF1')
    grad.addColorStop(1, '#5EEAD4')

    ctx.beginPath()
    ctx.arc(sphereProj.x, sphereProj.y, sphereR, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.lineWidth = Math.max(1, s * 0.026)
    ctx.strokeStyle = 'rgba(25, 133, 123, 0.55)'
    ctx.stroke()

    drawSurfaceFace(
      ctx,
      rot,
      cx,
      cy,
      s,
      mood,
      'jade',
      isBlinking,
      lookX,
      lookY,
      0.065,
      0.425,
      0.58,
      0.32
    )
  }

  const sphereInFrontOfFlower = sphereWorld.z >= flowerCenterWorld.z - 0.04

  // 1. 远端手
  for (const h of handsWorld) {
    if (h.w.z < flowerCenterWorld.z) drawHand(h)
  }
  // 2. 花结与中心瓷球按 3D 前后次序绘制
  if (sphereInFrontOfFlower) {
    drawFlowerBody()
    drawCoreSphereAndFace()
  } else {
    drawCoreSphereAndFace()
    drawFlowerBody()
  }
  // 3. 近端手
  for (const h of handsWorld) {
    if (h.w.z >= flowerCenterWorld.z) drawHand(h)
  }
}

interface QuadPrim {
  pts: [ProjectedPt, ProjectedPt, ProjectedPt, ProjectedPt]
  zAvg: number
  fill: string
  stroke?: string
  lineWidth?: number
  alpha?: number
}

function makeQuadPrim(
  wPts: [Vec3, Vec3, Vec3, Vec3],
  cx: number,
  cy: number,
  scale: number,
  fill: string,
  zBias = 0,
  stroke?: string,
  lineWidth = 0.6,
  alpha = 1
): QuadPrim {
  return {
    pts: [
      projectPt(wPts[0], cx, cy, scale),
      projectPt(wPts[1], cx, cy, scale),
      projectPt(wPts[2], cx, cy, scale),
      projectPt(wPts[3], cx, cy, scale),
    ],
    zAvg: (wPts[0].z + wPts[1].z + wPts[2].z + wPts[3].z) * 0.25 + zBias,
    fill,
    stroke,
    lineWidth,
    alpha,
  }
}

function paintQuadPrims(ctx: CanvasRenderingContext2D, quads: QuadPrim[]) {
  if (quads.length === 0) return
  const sorted = [...quads].sort((a, b) => a.zAvg - b.zAvg)
  ctx.save()
  ctx.lineJoin = 'round'
  const baseAlpha = ctx.globalAlpha
  let prevAlpha = 1
  for (const q of sorted) {
    const a = q.alpha !== undefined && q.alpha < 1 ? q.alpha : 1
    if (a !== prevAlpha) {
      prevAlpha = a
      ctx.globalAlpha = baseAlpha * a
    }
    ctx.beginPath()
    ctx.moveTo(q.pts[0].x, q.pts[0].y)
    ctx.lineTo(q.pts[1].x, q.pts[1].y)
    ctx.lineTo(q.pts[2].x, q.pts[2].y)
    ctx.lineTo(q.pts[3].x, q.pts[3].y)
    ctx.closePath()
    ctx.fillStyle = q.fill
    ctx.fill()
    // 细微同色描边消除多边形接缝处的抗锯齿细线（当显式传 lineWidth = 0 时跳过描边避免产生条纹感）
    const lw = q.lineWidth ?? 0.6
    if (lw > 0) {
      ctx.lineWidth = lw
      ctx.strokeStyle = q.stroke ?? q.fill
      ctx.stroke()
    }
  }
  ctx.restore()
}

function mixRgbColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
  mul = 1,
  whiteMix = 0
): string {
  const k = clamp(t, 0, 1)
  const w = clamp(whiteMix, 0, 1)
  const r = Math.round(lerp(lerp(a[0], b[0], k) * mul, 255, w))
  const g = Math.round(lerp(lerp(a[1], b[1], k) * mul, 255, w))
  const bl = Math.round(lerp(lerp(a[2], b[2], k) * mul, 255, w))
  return `rgb(${clamp(r, 0, 255)}, ${clamp(g, 0, 255)}, ${clamp(bl, 0, 255)})`
}

const GEMINI_COLOR_STOPS: Array<{ ang: number; rgb: [number, number, number] }> = [
  { ang: 0, rgb: [66, 133, 244] }, // Right: Google Blue #4285F4
  { ang: Math.PI * 0.5, rgb: [52, 168, 83] }, // Bottom: Google Green #34A853
  { ang: Math.PI, rgb: [251, 188, 4] }, // Left: Google Yellow #FBBC04
  { ang: Math.PI * 1.4, rgb: [234, 67, 53] }, // Top-Left: Google Red #EA4335
  { ang: Math.PI * 1.72, rgb: [66, 133, 244] }, // Top-Right: Google Blue #4285F4
  { ang: Math.PI * 2, rgb: [66, 133, 244] },
]

function sampleGeminiPerimeterRgb(x: number, y: number): [number, number, number] {
  let ang = Math.atan2(y, x)
  if (ang < 0) ang += Math.PI * 2
  for (let i = 0; i < GEMINI_COLOR_STOPS.length - 1; i++) {
    const s0 = GEMINI_COLOR_STOPS[i]
    const s1 = GEMINI_COLOR_STOPS[i + 1]
    if (ang <= s1.ang + 1e-6) {
      const span = Math.max(1e-5, s1.ang - s0.ang)
      const u = clamp((ang - s0.ang) / span, 0, 1)
      return [
        lerp(s0.rgb[0], s1.rgb[0], u),
        lerp(s0.rgb[1], s1.rgb[1], u),
        lerp(s0.rgb[2], s1.rgb[2], u),
      ]
    }
  }
  return GEMINI_COLOR_STOPS[0].rgb
}

/** 渲染 3D Grok（完全贴合官方 xAI Grok 一体化白银雕塑双弧拖尾 + 深邃事件视界黑洞内核） */
function drawGrok3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  rot: Mat3,
  accretionRad: number,
  moonletRad: number,
  gyroDeg: number,
  mood: SpriteMood,
  isBlinking: boolean,
  lookX: number,
  lookY: number,
  glare: { x: number; y: number }
) {
  const sphereR = 0.415
  const sphereCenter = xformVec(rot, 0, 0, 0)
  const sphereProj = projectPt(sphereCenter, cx, cy, scale)
  const screenR = sphereR * scale * sphereProj.f

  const tiltX = 22 * DEG_TO_RAD
  const tiltZ = -18 * DEG_TO_RAD
  const cTx = Math.cos(tiltX)
  const sTx = Math.sin(tiltX)
  const cTz = Math.cos(tiltZ)
  const sTz = Math.sin(tiltZ)

  const diskToWorld = (x: number, y: number): Vec3 => {
    const x1 = x * cTz - y * sTz
    const y1 = x * sTz + y * cTz
    return xformVec(rot, x1, y1 * cTx, y1 * sTx)
  }

  // 一体化官方双弧环 + 陀螺翻转支持
  const gRad = gyroDeg * DEG_TO_RAD
  const cg = Math.cos(gRad)
  const sg = Math.sin(gRad)
  const cRingToWorld = (lx: number, ly: number, lz: number): Vec3 => {
    const rx = lx * cg + lz * sg
    const rz = -lx * sg + lz * cg
    return xformVec(rot, rx, ly, rz)
  }

  const satWorld = diskToWorld(Math.cos(moonletRad) * 1.02, Math.sin(moonletRad) * 1.02)
  const satProj = projectPt(satWorld, cx, cy, scale)
  const drawSatellite = () => {
    const r = Math.max(1.8, scale * 0.04 * satProj.f)
    const glow = ctx.createRadialGradient(satProj.x, satProj.y, 0, satProj.x, satProj.y, r * 2.4)
    glow.addColorStop(0, '#FFFFFF')
    glow.addColorStop(0.45, 'rgba(129, 140, 248, 0.72)')
    glow.addColorStop(1, 'rgba(99, 102, 241, 0)')
    ctx.beginPath()
    ctx.arc(satProj.x, satProj.y, r * 2.4, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()
  }

  const faceNz = cRingToWorld(0, 0, 1).z - sphereCenter.z
  const facingFront = faceNz >= 0
  const zBack = -0.055
  const zFront = 0.075

  // 共用金属白银-蓝灰立体挤出绘制函数（让拖尾与环形完全一体、同材质高光与倒角，告别黑白割裂）
  const paintUnifiedSculptedShape = (pts: Array<[number, number]>, zOff = 0, sharpOutline = true) => {
    const n = pts.length
    if (n < 3) return
    const wallQuads: QuadPrim[] = []
    const frontPts: ProjectedPt[] = []
    const backPts: ProjectedPt[] = []
    const zB = zBack + zOff
    const zF = zFront + zOff

    for (let i = 0; i < n; i++) {
      const wf = cRingToWorld(pts[i][0], pts[i][1], zF)
      const wb = cRingToWorld(pts[i][0], pts[i][1], zB)
      frontPts.push(projectPt(wf, cx, cy, scale))
      backPts.push(projectPt(wb, cx, cy, scale))
    }

    const wallDark: [number, number, number] = [38, 43, 74]
    const wallBright: [number, number, number] = [148, 163, 198]
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const wB0 = cRingToWorld(pts[i][0], pts[i][1], zB)
      const wB1 = cRingToWorld(pts[j][0], pts[j][1], zB)
      const wF0 = cRingToWorld(pts[i][0], pts[i][1], zF)
      const wF1 = cRingToWorld(pts[j][0], pts[j][1], zF)
      const ex = pts[j][0] - pts[i][0]
      const ey = pts[j][1] - pts[i][1]
      const len = Math.hypot(ex, ey) || 1
      const wn = cRingToWorld(ey / len, -ex / len, 0)
      const lit = clamp(0.5 + 0.5 * (-0.5 * wn.x - 0.6 * wn.y + 0.45 * wn.z), 0.08, 0.96)
      wallQuads.push(
        makeQuadPrim([wB0, wB1, wF1, wF0], cx, cy, scale, mixRgbColor(wallDark, wallBright, lit), 0, undefined, 0.4)
      )
    }

    const traceCap = (cPts: ProjectedPt[]) => {
      ctx.beginPath()
      ctx.moveTo(cPts[0].x, cPts[0].y)
      for (let i = 1; i < cPts.length; i++) ctx.lineTo(cPts[i].x, cPts[i].y)
      ctx.closePath()
    }

    // 背面盖帽 -> 3D 挤压侧壁 -> 正面铂银渐变倒角盖帽
    const backCap = facingFront ? backPts : frontPts
    const frontCap = facingFront ? frontPts : backPts
    traceCap(backCap)
    ctx.fillStyle = '#334155'
    ctx.fill()

    paintQuadPrims(ctx, wallQuads)

    traceCap(frontCap)
    const gA = projectPt(cRingToWorld(-0.85, -0.85, facingFront ? zF : zB), cx, cy, scale)
    const gB = projectPt(cRingToWorld(0.85, 0.85, facingFront ? zF : zB), cx, cy, scale)
    const silverGrad = ctx.createLinearGradient(gA.x, gA.y, gB.x, gB.y)
    if (facingFront) {
      silverGrad.addColorStop(0, '#FFFFFF')
      silverGrad.addColorStop(0.32, '#EEF2FF')
      silverGrad.addColorStop(0.68, '#CBD5E1')
      silverGrad.addColorStop(1, '#94A3B8')
    } else {
      silverGrad.addColorStop(0, '#CBD5E1')
      silverGrad.addColorStop(0.55, '#94A3B8')
      silverGrad.addColorStop(1, '#64748B')
    }
    ctx.save()
    ctx.translate(0, scale * 0.018)
    ctx.fillStyle = 'rgba(30, 27, 75, 0.22)'
    ctx.fill()
    ctx.restore()
    traceCap(frontCap)
    ctx.fillStyle = silverGrad
    ctx.fill()

    // 柔和内倒角亮边 + 深岩靛微描边（令白银雕塑在浅米色背景卡面上轮廓利落分明）
    if (sharpOutline) {
      ctx.save()
      traceCap(frontCap)
      ctx.clip()
      ctx.lineWidth = Math.max(1.2, scale * 0.044)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = facingFront ? 'rgba(255, 255, 255, 0.82)' : 'rgba(226, 232, 240, 0.45)'
      ctx.stroke()
      ctx.restore()

      traceCap(frontCap)
      ctx.lineWidth = Math.max(0.75, scale * 0.021)
      ctx.lineJoin = 'miter'
      ctx.miterLimit = 6
      ctx.strokeStyle = 'rgba(49, 46, 129, 0.72)'
      ctx.stroke()
    }
  }

  // 内斜切尖（隐藏于黑洞球体背侧，侧面旋转或翻转时现出贯穿官方长锋）
  const innerSpearCenter = cRingToWorld(0.1, -0.06, -0.22)
  const centerShapeA = cRingToWorld(-0.34, -0.06, 0)
  const centerShapeB = cRingToWorld(0.34, 0.06, 0)

  // A. 黑洞底衬暗色深空柔晕，衬托前方一体成型的官方铂银双弧拖尾
  const auraR = screenR * (2.25 + 0.05 * Math.sin(accretionRad * 2))
  const auraGrad = ctx.createRadialGradient(sphereProj.x, sphereProj.y, screenR * 0.4, sphereProj.x, sphereProj.y, auraR)
  auraGrad.addColorStop(0, 'rgba(15, 16, 40, 0.48)')
  auraGrad.addColorStop(0.45, 'rgba(49, 46, 129, 0.22)')
  auraGrad.addColorStop(0.76, 'rgba(99, 102, 241, 0.08)')
  auraGrad.addColorStop(1, 'rgba(99, 102, 241, 0)')
  ctx.beginPath()
  ctx.arc(sphereProj.x, sphereProj.y, auraR, 0, Math.PI * 2)
  ctx.fillStyle = auraGrad
  ctx.fill()

  const orderedShapes = [
    { pts: GROK_VECTOR.innerSpear, zOff: -0.22, depth: innerSpearCenter.z, outline: false },
    { pts: GROK_VECTOR.shapeA, zOff: 0, depth: centerShapeA.z, outline: true },
    { pts: GROK_VECTOR.shapeB, zOff: 0, depth: centerShapeB.z, outline: true },
  ].sort((a, b) => a.depth - b.depth)

  for (const item of orderedShapes) {
    if (item.depth < sphereCenter.z) paintUnifiedSculptedShape(item.pts, item.zOff, item.outline)
  }
  if (satWorld.z < sphereCenter.z) drawSatellite()

  // B. 深邃纯粹的事件视界黑洞内核（中心极暗吞光 + 边缘蓝紫光子散射）
  const bodyGrad = ctx.createRadialGradient(
    sphereProj.x + glare.x * screenR * 0.08,
    sphereProj.y + glare.y * screenR * 0.08,
    screenR * 0.08,
    sphereProj.x,
    sphereProj.y,
    screenR * 1.04
  )
  bodyGrad.addColorStop(0, '#010104')
  bodyGrad.addColorStop(0.68, '#04040C')
  bodyGrad.addColorStop(0.9, '#17153B')
  bodyGrad.addColorStop(0.97, 'rgba(129, 140, 248, 0.45)')
  bodyGrad.addColorStop(1, 'rgba(129, 140, 248, 0)')

  ctx.beginPath()
  ctx.arc(sphereProj.x, sphereProj.y, screenR * 1.04, 0, Math.PI * 2)
  ctx.fillStyle = bodyGrad
  ctx.fill()

  const limbGrad = ctx.createRadialGradient(
    sphereProj.x + (-0.36 + glare.x * 0.4) * screenR,
    sphereProj.y + (-0.4 + glare.y * 0.4) * screenR,
    0,
    sphereProj.x,
    sphereProj.y,
    screenR
  )
  limbGrad.addColorStop(0, 'rgba(199, 210, 254, 0.16)')
  limbGrad.addColorStop(0.55, 'rgba(99, 102, 241, 0.03)')
  limbGrad.addColorStop(1, 'rgba(99, 102, 241, 0)')
  ctx.beginPath()
  ctx.arc(sphereProj.x, sphereProj.y, screenR, 0, Math.PI * 2)
  ctx.fillStyle = limbGrad
  ctx.fill()

  // C. 黑洞暗域中浮现的灵动表情
  drawSurfaceFace(
    ctx,
    rot,
    cx,
    cy,
    scale,
    mood,
    'indigo',
    isBlinking,
    lookX,
    lookY,
    0,
    sphereR + 0.015,
    0.48,
    0.26
  )

  // D. 前景侧的一体化官方双弧拖尾部件与卫星
  for (const item of orderedShapes) {
    if (item.depth >= sphereCenter.z) paintUnifiedSculptedShape(item.pts, item.zOff, item.outline)
  }
  if (satWorld.z >= sphereCenter.z) drawSatellite()
}

/** 渲染 3D Gemini（完全贴合官方 Google Gemini 4 色内凹四角星 + 连续倒角 3D 晶体侧壁） */
function drawGemini3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  rot: Mat3,
  breatheScale: number,
  mood: SpriteMood,
  isBlinking: boolean,
  selected: boolean,
  hovered: boolean,
  generating: boolean,
  lookX: number,
  lookY: number,
  timeSec: number
) {
  const s = scale * breatheScale * (hovered ? 1.04 : 1)
  const faceNz = rot[8]
  const facingFront = faceNz >= 0
  const outlinePts = scale < 42 ? GEMINI_OUTLINE_COMPACT : GEMINI_OUTLINE
  const nOutline = outlinePts.length

  const traceStarAtZ = (zLocal: number, scaleXY = 1) => {
    ctx.beginPath()
    for (let i = 0; i < nOutline; i++) {
      const w = xformVec(rot, outlinePts[i][0] * scaleXY, outlinePts[i][1] * scaleXY, zLocal)
      const p = projectPt(w, cx, cy, s)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
  }

  // 两个伴飞 3D 四角星（Google 蓝 & Google 珊瑚红）
  const miniStars = [
    { pos: { x: 0.76, y: -0.74, z: 0.34 }, fill: '#4285F4', r: 0.135, phase: 0 },
    { pos: { x: -0.74, y: 0.7, z: 0.34 }, fill: '#EA4335', r: 0.105, phase: 1.1 },
  ].map((ms) => {
    const w = xformVec(rot, ms.pos.x, ms.pos.y, ms.pos.z)
    const p = projectPt(w, cx, cy, s)
    const pulse = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(timeSec * 2.6 + ms.phase))
    return { ...ms, w, p, pulse }
  })

  const drawMiniStar = (ms: (typeof miniStars)[number]) => {
    const rad = ms.r * s * ms.p.f * ms.pulse
    const rotRad = 0.2 * Math.sin(timeSec * 2.6 + ms.phase)
    ctx.save()
    ctx.translate(ms.p.x, ms.p.y)
    ctx.rotate(rotRad)
    ctx.beginPath()
    ctx.moveTo(0, -rad)
    ctx.quadraticCurveTo(rad * 0.12, -rad * 0.12, rad, 0)
    ctx.quadraticCurveTo(rad * 0.12, rad * 0.12, 0, rad)
    ctx.quadraticCurveTo(-rad * 0.12, rad * 0.12, -rad, 0)
    ctx.quadraticCurveTo(-rad * 0.12, -rad * 0.12, 0, -rad)
    ctx.closePath()
    ctx.fillStyle = ms.fill
    ctx.fill()
    ctx.lineWidth = Math.max(0.8, s * 0.018)
    ctx.strokeStyle = '#FFFFFF'
    ctx.stroke()
    ctx.restore()
  }

  for (const ms of miniStars) {
    if (ms.w.z < 0) drawMiniStar(ms)
  }

  // 1. 背面表冠先画（仅当背面朝向或侧倾需要衬底时填充，避免星尖露边）
  const zBack = -0.09
  const zShoulderBack = -0.055
  const zShoulderFront = 0.025
  const zFront = 0.06
  const paintStarFourColorCap = (zCap: number, scaleXY: number, isBackFace: boolean) => {
    ctx.save()
    traceStarAtZ(zCap, scaleXY)
    ctx.fillStyle = isBackFace ? '#DCE8FA' : '#F6F9FF'
    ctx.fill()
    ctx.clip()

    const boost = generating || selected || hovered ? 1 : 0.92
    const blobs: Array<{ x: number; y: number; r: number; rgb: [number, number, number]; alpha: number }> = [
      { x: 0.52, y: -0.04, r: 0.96, rgb: [66, 133, 244], alpha: 0.94 * boost }, // 右翼 Google Blue
      { x: -0.26, y: -0.5, r: 0.72, rgb: [234, 67, 53], alpha: 0.9 * boost }, // 左上 Google Red
      { x: -0.56, y: 0.08, r: 0.76, rgb: [251, 188, 4], alpha: 0.94 * boost }, // 左翼 Google Yellow
      { x: 0.02, y: 0.58, r: 0.76, rgb: [52, 168, 83], alpha: 0.92 * boost }, // 下翼 Google Green
    ]
    for (const b of blobs) {
      const wPos = xformVec(rot, b.x * scaleXY, b.y * scaleXY, zCap)
      const pPos = projectPt(wPos, cx, cy, s)
      const rPx = s * b.r * pPos.f
      const grad = ctx.createRadialGradient(pPos.x, pPos.y, rPx * 0.06, pPos.x, pPos.y, rPx)
      grad.addColorStop(0, `rgba(${b.rgb[0]}, ${b.rgb[1]}, ${b.rgb[2]}, ${b.alpha})`)
      grad.addColorStop(0.55, `rgba(${b.rgb[0]}, ${b.rgb[1]}, ${b.rgb[2]}, ${b.alpha * 0.52})`)
      grad.addColorStop(1, `rgba(${b.rgb[0]}, ${b.rgb[1]}, ${b.rgb[2]}, 0)`)
      ctx.fillStyle = grad
      ctx.fillRect(cx - s * 1.35, cy - s * 1.35, s * 2.7, s * 2.7)
    }

    // 中心珍珠柔光 + 左上/右下晶体折光切面
    const domePt = projectPt(xformVec(rot, -0.14, -0.18, zCap), cx, cy, s)
    const domeR = s * 0.85 * domePt.f
    const centerGlow = ctx.createRadialGradient(domePt.x, domePt.y, s * 0.04, domePt.x, domePt.y, domeR)
    centerGlow.addColorStop(0, isBackFace ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.52)')
    centerGlow.addColorStop(0.65, 'rgba(255,255,255,0.06)')
    centerGlow.addColorStop(1, isBackFace ? 'rgba(15,23,42,0.28)' : 'rgba(15,23,42,0.06)')
    ctx.fillStyle = centerGlow
    ctx.fillRect(cx - s * 1.35, cy - s * 1.35, s * 2.7, s * 2.7)

    if (!isBackFace) {
      const pTop = projectPt(xformVec(rot, 0, -0.95, zCap + 0.003), cx, cy, s)
      const pLeft = projectPt(xformVec(rot, -0.95, 0, zCap + 0.003), cx, cy, s)
      const pMid = projectPt(xformVec(rot, 0, 0, zCap + 0.012), cx, cy, s)
      ctx.beginPath()
      ctx.moveTo(pTop.x, pTop.y)
      ctx.lineTo(pMid.x, pMid.y)
      ctx.lineTo(pLeft.x, pLeft.y)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
      ctx.fill()
    } else {
      // 背面深色折射釉质 + 十字晶脊
      ctx.fillStyle = 'rgba(15, 23, 42, 0.24)'
      ctx.fillRect(cx - s * 1.35, cy - s * 1.35, s * 2.7, s * 2.7)
      const bTop = projectPt(xformVec(rot, 0, -0.82, zCap - 0.004), cx, cy, s)
      const bBot = projectPt(xformVec(rot, 0, 0.82, zCap - 0.004), cx, cy, s)
      const bLeft = projectPt(xformVec(rot, -0.82, 0, zCap - 0.004), cx, cy, s)
      const bRight = projectPt(xformVec(rot, 0.82, 0, zCap - 0.004), cx, cy, s)
      ctx.beginPath()
      ctx.moveTo(bTop.x, bTop.y)
      ctx.lineTo(bBot.x, bBot.y)
      ctx.moveTo(bLeft.x, bLeft.y)
      ctx.lineTo(bRight.x, bRight.y)
      ctx.lineWidth = Math.max(0.85, s * 0.024)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.44)'
      ctx.stroke()
    }

    // 内部精细高光边缘（被裁剪在星形内以保留锋利四角星尖）
    traceStarAtZ(zCap, scaleXY)
    ctx.lineWidth = Math.max(1.1, s * 0.036)
    ctx.lineJoin = 'miter'
    ctx.miterLimit = 6
    ctx.strokeStyle = isBackFace ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.78)'
    ctx.stroke()
    ctx.restore()
  }

  if (!facingFront) {
    paintStarFourColorCap(zFront, 0.955, false)
  } else {
    paintStarFourColorCap(zBack, 0.945, true)
  }

  // 2. 连续无缝 3D 倒角 + 晶体侧壁（按段逐面 Z 深度排序，彻底告别斜视分层锯齿）
  const wallQuads: QuadPrim[] = []
  for (let i = 0; i < nOutline; i++) {
    const j = (i + 1) % nOutline
    const p0 = outlinePts[i]
    const p1 = outlinePts[j]
    const xm = (p0[0] + p1[0]) * 0.5
    const ym = (p0[1] + p1[1]) * 0.5
    const baseRgb = sampleGeminiPerimeterRgb(xm, ym)

    // 边外法线方向光影计算
    const ex = p1[0] - p0[0]
    const ey = p1[1] - p0[1]
    const len = Math.hypot(ex, ey) || 1
    // GEMINI_OUTLINE 顺时针环绕：(ey, -ex) 或 (-ey, ex) 取朝外的法线
    let enx = ey / len
    let eny = -ex / len
    if (enx * xm + eny * ym < 0) {
      enx = -enx
      eny = -eny
    }
    const wn = xformVec(rot, enx, eny, 0)
    const dirLight = clamp(-0.45 * wn.x - 0.55 * wn.y + 0.65 * wn.z, -1, 1)
    const mainMul = 0.78 + 0.18 * dirLight
    const backMul = 0.62 + 0.14 * dirLight
    const bevelLight = clamp(0.18 + 0.22 * dirLight, 0.04, 0.42)

    const wB0 = xformVec(rot, p0[0] * 0.945, p0[1] * 0.945, zBack)
    const wB1 = xformVec(rot, p1[0] * 0.945, p1[1] * 0.945, zBack)
    const wSB0 = xformVec(rot, p0[0], p0[1], zShoulderBack)
    const wSB1 = xformVec(rot, p1[0], p1[1], zShoulderBack)
    const wSF0 = xformVec(rot, p0[0], p0[1], zShoulderFront)
    const wSF1 = xformVec(rot, p1[0], p1[1], zShoulderFront)
    const wF0 = xformVec(rot, p0[0] * 0.955, p0[1] * 0.955, zFront)
    const wF1 = xformVec(rot, p1[0] * 0.955, p1[1] * 0.955, zFront)

    wallQuads.push(
      makeQuadPrim([wB0, wB1, wSB1, wSB0], cx, cy, s, mixRgbColor(baseRgb, baseRgb, 0, backMul), 0, undefined, 0.45),
      makeQuadPrim([wSB0, wSB1, wSF1, wSF0], cx, cy, s, mixRgbColor(baseRgb, baseRgb, 0, mainMul), 0, undefined, 0.45),
      makeQuadPrim(
        [wSF0, wSF1, wF1, wF0],
        cx,
        cy,
        s,
        mixRgbColor(baseRgb, baseRgb, 0, 0.98, bevelLight),
        0,
        undefined,
        0.45
      )
    )
  }
  paintQuadPrims(ctx, wallQuads)

  // 3. 朝向相机一侧的表冠盖面 + 表面表情
  if (facingFront) {
    paintStarFourColorCap(zFront, 0.955, false)
    drawSurfaceFace(
      ctx,
      rot,
      cx,
      cy,
      s,
      mood,
      'amber',
      isBlinking,
      lookX,
      lookY,
      -1.08,
      1.16,
      0.28,
      0.15
    )
  } else {
    paintStarFourColorCap(zBack, 0.945, true)
  }

  for (const ms of miniStars) {
    if (ms.w.z >= 0) drawMiniStar(ms)
  }
}

/** 渲染 3D Muse（加粗加高暖米白毛绒胶囊本体 + 小巧“m”波浪钴蓝皇冠 + 自然站立接地） */
function drawMuse3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  rot: Mat3,
  _orbitRad: number,
  breatheScale: number,
  mood: SpriteMood,
  isBlinking: boolean,
  selected: boolean,
  hovered: boolean,
  generating: boolean,
  lookX: number,
  lookY: number,
  _timeSec: number,
  glare: { x: number; y: number }
) {
  const s = scale * breatheScale * (hovered ? 1.04 : 1)
  const outlinePts = scale < 42 ? MUSE_OUTLINE_COMPACT : MUSE_OUTLINE
  const nOutline = outlinePts.length

  const headR = 0.58
  const torsoR = 0.65
  const topCenterLocal: Vec3 = { x: 0, y: -0.34, z: 0 }
  const botCenterLocal: Vec3 = { x: 0, y: 0.5, z: 0 }
  const headCenterLocal: Vec3 = { x: 0, y: 0.08, z: 0 }
  const crownCenterLocal: Vec3 = { x: 0, y: -1.03, z: 0.13 }

  const topWorld = xformVec(rot, topCenterLocal.x, topCenterLocal.y, topCenterLocal.z)
  const botWorld = xformVec(rot, botCenterLocal.x, botCenterLocal.y, botCenterLocal.z)
  const headWorld = xformVec(rot, headCenterLocal.x, headCenterLocal.y, headCenterLocal.z)
  const crownWorld = xformVec(rot, crownCenterLocal.x, crownCenterLocal.y, crownCenterLocal.z)

  const topProj = projectPt(topWorld, cx, cy, s)
  const botProj = projectPt(botWorld, cx, cy, s)
  const bodyProj = projectPt(headWorld, cx, cy, s)
  const rTop = headR * s * topProj.f
  const rBot = torsoR * s * botProj.f

  // 严格贴合官方 Muse 头部兜帽包裹比例：面部位于顶端圆头正中偏上，顶部兜帽厚度 ≈ 两侧兜帽厚度
  const faceCenterY = -0.45
  const faceDomeR = headR + 0.005
  const faceNormalWorld = xformVec(rot, 0, 0, 1)
  const facingFront = faceNormalWorld.z > 0.05
  const crownInFront = crownWorld.z >= headWorld.z - 0.04

  const traceCapsuleBody = (pad = 0) => {
    const rad0 = rTop + pad
    const rad1 = rBot + pad
    const dx = botProj.x - topProj.x
    const dy = botProj.y - topProj.y
    const dist = Math.hypot(dx, dy)
    ctx.beginPath()
    if (dist <= Math.abs(rad1 - rad0) + 0.5) {
      const mx = rad1 >= rad0 ? botProj.x : topProj.x
      const my = rad1 >= rad0 ? botProj.y : topProj.y
      ctx.arc(mx, my, Math.max(rad0, rad1), 0, Math.PI * 2)
      return
    }
    const baseAng = Math.atan2(dy, dx)
    const sinTheta = clamp((rad0 - rad1) / dist, -0.99, 0.99)
    const alpha = Math.acos(sinTheta)
    ctx.arc(topProj.x, topProj.y, rad0, baseAng + alpha, baseAng - alpha, false)
    ctx.arc(botProj.x, botProj.y, rad1, baseAng - alpha, baseAng + alpha, false)
    ctx.closePath()
  }

  // 1. 小巧立体“m”波浪钴蓝琉璃皇冠（戴在毛绒胶囊顶端）
  const drawMuseCrown = () => {
    if (nOutline < 3) return
    const scaleXY = 0.34
    const zDepth = 0.12
    const zHalf = zDepth * 0.5
    const tiltRad = -16 * DEG_TO_RAD
    const ct = Math.cos(tiltRad)
    const st = Math.sin(tiltRad)

    const toCrownLocal = (px: number, py: number, pz: number): Vec3 => {
      const sx = px * scaleXY
      const sy = py * scaleXY
      return {
        x: sx,
        y: sy * ct - pz * st + crownCenterLocal.y,
        z: sy * st + pz * ct + crownCenterLocal.z,
      }
    }

    const crownNormal = xformVec(rot, 0, -st, ct)
    const crownFacingFront = crownNormal.z >= 0

    const frontPts: ProjectedPt[] = []
    const backPts: ProjectedPt[] = []
    const wallQuads: QuadPrim[] = []
    const wallDark: [number, number, number] = [0, 42, 138]
    const wallBright: [number, number, number] = [56, 189, 248]

    for (let i = 0; i < nOutline; i++) {
      const wf = toCrownLocal(outlinePts[i][0], outlinePts[i][1], zHalf)
      const wb = toCrownLocal(outlinePts[i][0] * 0.98, outlinePts[i][1] * 0.98, -zHalf)
      frontPts.push(projectPt(xformVec(rot, wf.x, wf.y, wf.z), cx, cy, s))
      backPts.push(projectPt(xformVec(rot, wb.x, wb.y, wb.z), cx, cy, s))
    }

    for (let i = 0; i < nOutline; i++) {
      const j = (i + 1) % nOutline
      const p0 = outlinePts[i]
      const p1 = outlinePts[j]
      const ex = p1[0] - p0[0]
      const ey = p1[1] - p0[1]
      const len = Math.hypot(ex, ey) || 1
      const wn = xformVec(rot, ey / len, (-ex / len) * ct, (-ex / len) * st)
      const lit = clamp(0.46 + 0.54 * (-0.45 * wn.x - 0.58 * wn.y + 0.62 * wn.z), 0.1, 0.96)
      const lb0 = toCrownLocal(p0[0] * 0.98, p0[1] * 0.98, -zHalf)
      const lb1 = toCrownLocal(p1[0] * 0.98, p1[1] * 0.98, -zHalf)
      const lf0 = toCrownLocal(p0[0], p0[1], zHalf)
      const lf1 = toCrownLocal(p1[0], p1[1], zHalf)
      wallQuads.push(
        makeQuadPrim(
          [
            xformVec(rot, lb0.x, lb0.y, lb0.z),
            xformVec(rot, lb1.x, lb1.y, lb1.z),
            xformVec(rot, lf1.x, lf1.y, lf1.z),
            xformVec(rot, lf0.x, lf0.y, lf0.z),
          ],
          cx,
          cy,
          s,
          mixRgbColor(wallDark, wallBright, lit),
          0,
          undefined,
          0.4
        )
      )
    }

    const traceCap = (cPts: ProjectedPt[]) => {
      ctx.beginPath()
      ctx.moveTo(cPts[0].x, cPts[0].y)
      for (let i = 1; i < cPts.length; i++) ctx.lineTo(cPts[i].x, cPts[i].y)
      ctx.closePath()
    }

    const backCap = crownFacingFront ? backPts : frontPts
    const frontCap = crownFacingFront ? frontPts : backPts

    traceCap(backCap)
    ctx.fillStyle = '#003299'
    ctx.fill()

    paintQuadPrims(ctx, wallQuads)

    const gEnd = projectPt(
      xformVec(rot, 0.4 + glare.x * 0.08, crownCenterLocal.y + 0.26 + glare.y * 0.08, crownCenterLocal.z),
      cx,
      cy,
      s
    )
    const gStart = projectPt(
      xformVec(rot, -0.38, crownCenterLocal.y - 0.28, crownCenterLocal.z),
      cx,
      cy,
      s
    )
    const crownGrad = ctx.createLinearGradient(gStart.x, gStart.y, gEnd.x, gEnd.y)
    if (crownFacingFront) {
      crownGrad.addColorStop(0, selected || hovered || generating ? '#38BDF8' : '#1A96FF')
      crownGrad.addColorStop(0.45, '#0082FB')
      crownGrad.addColorStop(1, '#0040DC')
    } else {
      crownGrad.addColorStop(0, '#0082FB')
      crownGrad.addColorStop(0.55, '#0056C7')
      crownGrad.addColorStop(1, '#002B9E')
    }

    traceCap(frontCap)
    ctx.fillStyle = crownGrad
    ctx.fill()

    ctx.save()
    traceCap(frontCap)
    ctx.clip()
    const glossPt = projectPt(
      xformVec(rot, -0.1 + glare.x * 0.1, crownCenterLocal.y - 0.08 + glare.y * 0.1, crownCenterLocal.z + 0.06),
      cx,
      cy,
      s
    )
    const glossR = s * 0.46 * glossPt.f
    const gloss = ctx.createRadialGradient(glossPt.x, glossPt.y, s * 0.015, glossPt.x, glossPt.y, glossR)
    gloss.addColorStop(0, crownFacingFront ? 'rgba(255, 255, 255, 0.4)' : 'rgba(186, 230, 253, 0.2)')
    gloss.addColorStop(0.55, 'rgba(56, 189, 248, 0.08)')
    gloss.addColorStop(1, 'rgba(0, 40, 140, 0)')
    ctx.fillStyle = gloss
    ctx.fillRect(cx - s * 1.4, cy - s * 1.4, s * 2.8, s * 2.8)

    traceCap(frontCap)
    ctx.lineWidth = Math.max(0.85, s * 0.022)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = crownFacingFront ? 'rgba(224, 242, 254, 0.85)' : 'rgba(147, 197, 253, 0.45)'
    ctx.stroke()
    ctx.restore()

    traceCap(frontCap)
    ctx.lineWidth = Math.max(0.65, s * 0.015)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0, 46, 140, 0.5)'
    ctx.stroke()
  }

  // 2. 暖米白毛绒胶囊本体 + 底部自然站立接触阴影
  const drawPlushCapsule = () => {
    // 脚底/侧躺接地接触阴影（直立时在底端圆盘，斜躺滚转时严格贴合圆柱体下方轮廓）
    const rMid = (rTop + rBot) * 0.5
    const uprightness = Math.min(1, Math.max(0, Math.abs(rot[4])))
    const cylAxisX = botProj.x - topProj.x
    const cylAxisY = botProj.y - topProj.y
    const cylLenPx = Math.hypot(cylAxisX, cylAxisY)
    let cylAng = cylLenPx > 1e-3 ? Math.atan2(cylAxisY, cylAxisX) : 0
    if (cylAng > Math.PI * 0.5) cylAng -= Math.PI
    if (cylAng < -Math.PI * 0.5) cylAng += Math.PI
    const shadowAngle = cylAng * (1 - uprightness)
    const standGroundY = Math.max(topProj.y + rTop, botProj.y + rBot) - Math.min(rTop, rBot) * 0.06
    const rollGroundY = bodyProj.y + rMid * 0.94
    const shadowY = standGroundY * uprightness + rollGroundY * (1 - uprightness)
    const shadowX = bodyProj.x
    const groundRx = Math.max(rBot * 0.96, cylLenPx * 0.5 + rMid * 0.72)
    const groundRy = rMid * (0.22 * uprightness + 0.3 * (1 - uprightness))
    ctx.save()
    ctx.translate(shadowX, shadowY)
    ctx.rotate(shadowAngle)
    const groundGrad = ctx.createRadialGradient(0, 0, groundRx * 0.1, 0, 0, groundRx)
    groundGrad.addColorStop(0, 'rgba(116, 80, 44, 0.28)')
    groundGrad.addColorStop(0.6, 'rgba(116, 80, 44, 0.12)')
    groundGrad.addColorStop(1, 'rgba(116, 80, 44, 0)')
    ctx.beginPath()
    ctx.ellipse(0, 0, groundRx, groundRy, 0, 0, Math.PI * 2)
    ctx.fillStyle = groundGrad
    ctx.fill()
    ctx.restore()

    // 外围柔和绒毛光晕
    ctx.save()
    traceCapsuleBody(0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(3.6, s * 0.105)
    ctx.strokeStyle = 'rgba(232, 212, 184, 0.28)'
    ctx.stroke()
    ctx.lineWidth = Math.max(1.8, s * 0.052)
    ctx.strokeStyle = 'rgba(232, 212, 184, 0.42)'
    ctx.stroke()
    ctx.restore()

    // 世界空间左上顶光照（翻滚时绒毛受光始终自然朝上，面庞与皇冠在光影中转动）
    const hlX = bodyProj.x + (-0.28 + glare.x * 0.16) * s * bodyProj.f
    const hlY = bodyProj.y + (-0.34 + glare.y * 0.16) * s * bodyProj.f
    const bodyGrad = ctx.createRadialGradient(
      hlX,
      hlY,
      s * 0.08,
      bodyProj.x,
      bodyProj.y,
      s * 1.12 * bodyProj.f
    )
    bodyGrad.addColorStop(0, selected || hovered || generating ? '#FFF9F1' : '#FAF2E6')
    bodyGrad.addColorStop(0.52, '#EDE0CA')
    bodyGrad.addColorStop(0.84, '#DAC09C')
    bodyGrad.addColorStop(1, '#BC996E')

    traceCapsuleBody(0)
    ctx.fillStyle = bodyGrad
    ctx.fill()

    ctx.lineWidth = Math.max(1.0, s * 0.024)
    ctx.strokeStyle = 'rgba(154, 114, 70, 0.42)'
    ctx.stroke()

    // 小皇冠落在胶囊头顶的柔和接触阴影
    ctx.save()
    traceCapsuleBody(-Math.max(0.6, s * 0.012))
    ctx.clip()

    if (crownInFront) {
      const shPt = projectPt(xformVec(rot, 0, -0.8, 0.24), cx, cy, s)
      const shR = s * 0.24 * shPt.f
      const shGrad = ctx.createRadialGradient(shPt.x, shPt.y, shR * 0.12, shPt.x, shPt.y, shR)
      shGrad.addColorStop(0, 'rgba(116, 78, 42, 0.22)')
      shGrad.addColorStop(1, 'rgba(116, 78, 42, 0)')
      ctx.beginPath()
      ctx.ellipse(shPt.x, shPt.y, shR, shR * 0.42, 0, 0, Math.PI * 2)
      ctx.fillStyle = shGrad
      ctx.fill()
    }

    // 3. 正面内嵌暖桃方圆面庞 + 黑豆眼红晕甜笑
    if (facingFront) {
      const ovalSteps = 44
      const ovalPts: ProjectedPt[] = []
      for (let i = 0; i < ovalSteps; i++) {
        const a = (i / ovalSteps) * Math.PI * 2
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const squircleX = Math.sign(ca) * Math.pow(Math.abs(ca), 0.78)
        const squircleY = Math.sign(sa) * Math.pow(Math.abs(sa), 0.78)
        const ax = squircleX * 0.76
        const ay = squircleY * 0.5
        const nx = Math.sin(ax) * Math.cos(ay)
        const ny = Math.sin(ay)
        const nz = Math.cos(ax) * Math.cos(ay)
        const w = xformVec(rot, faceDomeR * nx, faceCenterY + faceDomeR * ny, faceDomeR * nz)
        ovalPts.push(projectPt(w, cx, cy, s))
      }

      const traceFaceWindow = () => {
        ctx.beginPath()
        for (let i = 0; i < ovalSteps; i++) {
          if (i === 0) ctx.moveTo(ovalPts[i].x, ovalPts[i].y)
          else ctx.lineTo(ovalPts[i].x, ovalPts[i].y)
        }
        ctx.closePath()
      }

      traceFaceWindow()
      ctx.lineWidth = Math.max(2.0, s * 0.064)
      ctx.strokeStyle = 'rgba(134, 96, 56, 0.28)'
      ctx.stroke()

      const fCenter = projectPt(xformVec(rot, 0, faceCenterY, faceDomeR), cx, cy, s)
      const fTop = projectPt(xformVec(rot, 0, faceCenterY - 0.28, faceDomeR), cx, cy, s)
      const fBot = projectPt(xformVec(rot, 0, faceCenterY + 0.28, faceDomeR), cx, cy, s)
      const faceGrad = ctx.createRadialGradient(
        fCenter.x - s * 0.06,
        fCenter.y - s * 0.06,
        s * 0.04,
        fCenter.x,
        fCenter.y,
        s * 0.46 * fCenter.f
      )
      faceGrad.addColorStop(0, '#FFFDF9')
      faceGrad.addColorStop(0.62, '#FCEEE0')
      faceGrad.addColorStop(1, '#F2D2B4')
      traceFaceWindow()
      ctx.fillStyle = faceGrad
      ctx.fill()

      ctx.save()
      traceFaceWindow()
      ctx.clip()
      const browShadow = ctx.createLinearGradient(fTop.x, fTop.y, fBot.x, fBot.y)
      browShadow.addColorStop(0, 'rgba(148, 106, 66, 0.22)')
      browShadow.addColorStop(0.36, 'rgba(148, 106, 66, 0.04)')
      browShadow.addColorStop(1, 'rgba(148, 106, 66, 0)')
      ctx.fillStyle = browShadow
      ctx.fillRect(cx - s, cy - s, s * 2, s * 2)
      ctx.restore()

      drawSurfaceFace(
        ctx,
        rot,
        cx,
        cy,
        s,
        mood,
        'muse',
        isBlinking,
        lookX,
        lookY,
        0,
        faceDomeR,
        0.48,
        0.25,
        faceCenterY
      )
    }

    ctx.restore()
  }

  if (crownInFront) {
    drawPlushCapsule()
    drawMuseCrown()
  } else {
    drawMuseCrown()
    drawPlushCapsule()
  }
}

function drawSeedream3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  rot: Mat3,
  waveClockSec: number,
  breatheScale: number,
  mood: SpriteMood,
  isBlinking: boolean,
  selected: boolean,
  hovered: boolean,
  generating: boolean,
  lookX: number,
  lookY: number,
  timeSec: number,
  glare: { x: number; y: number }
) {
  const s = scale * 1.06 * breatheScale * (hovered ? 1.04 : 1)

  // 字节跳动官方 4 根斜切音律柱配置（由左至右：深宝蓝 -> 电光蓝 -> 天青蓝 -> 薄荷青）
  // 左两柱顶向右下方斜切（\），右两柱镜像向右上斜切（/），排成微微向前拱起的 3D 半弧阵列
  const bars = [
    {
      x0: -0.84,
      x1: -0.54,
      yTopL: -0.66,
      yTopR: -0.52,
      yBotR: 0.52,
      yBotL: 0.66,
      z0: -0.15,
      z1: 0.11,
      cTop: [37, 99, 235] as [number, number, number],
      cBot: [24, 62, 184] as [number, number, number],
      cSide: [18, 48, 148] as [number, number, number],
      eyeSide: 0 as const,
      eyeY: 0,
    },
    {
      x0: -0.38,
      x1: -0.08,
      yTopL: -0.08,
      yTopR: 0.04,
      yBotR: 0.50,
      yBotL: 0.62,
      z0: -0.10,
      z1: 0.16,
      cTop: [64, 156, 255] as [number, number, number],
      cBot: [37, 116, 240] as [number, number, number],
      cSide: [29, 78, 216] as [number, number, number],
      eyeSide: -1 as const,
      eyeY: 0.28,
    },
    {
      x0: 0.08,
      x1: 0.38,
      yTopL: -0.18,
      yTopR: -0.30,
      yBotR: 0.46,
      yBotL: 0.34,
      z0: -0.10,
      z1: 0.16,
      cTop: [34, 211, 238] as [number, number, number],
      cBot: [14, 165, 233] as [number, number, number],
      cSide: [2, 132, 199] as [number, number, number],
      eyeSide: 1 as const,
      eyeY: 0.09,
    },
    {
      x0: 0.54,
      x1: 0.84,
      yTopL: -0.56,
      yTopR: -0.72,
      yBotR: 0.72,
      yBotL: 0.56,
      z0: -0.15,
      z1: 0.11,
      cTop: [103, 232, 249] as [number, number, number],
      cBot: [45, 212, 191] as [number, number, number],
      cSide: [13, 148, 136] as [number, number, number],
      eyeSide: 0 as const,
      eyeY: 0,
    },
  ]

  const lightBoost = generating || selected || hovered ? 1.06 : 1.0
  const blinkAllowed =
    mood !== 'sleep' &&
    mood !== 'cheer' &&
    mood !== 'dizzy' &&
    mood !== 'wipe' &&
    mood !== 'happy' &&
    mood !== 'frustrated'
  const eyeScaleY = isBlinking && blinkAllowed ? 0.14 : 1

  // 逐柱计算实时动态跳动偏移：平时每 2 秒四根柱子按序原地小幅度快速上浮并立刻降回原位，形成连续波浪律动
  const WAVE_STAGGER_SEC = 0.115
  const WAVE_PULSE_SEC = 0.28
  const WAVE_PEAK_U = 0.36
  const barStates = bars.map((b, idx) => {
    // 生图创作时化身欢快均衡器跳动
    const genJump = generating ? -Math.abs(Math.sin(timeSec * 5.6 - idx * 0.92)) * 0.14 : 0
    // 平时持续动效：每 2 秒触发一轮由左至右、带重叠间隔的原地小幅度快速上浮回落波浪
    let waveDy = 0
    if (!generating && waveClockSec >= 0) {
      const localT = waveClockSec - idx * WAVE_STAGGER_SEC
      if (localT > 0 && localT < WAVE_PULSE_SEC) {
        const u = localT / WAVE_PULSE_SEC
        const pulse =
          u <= WAVE_PEAK_U
            ? Math.sin((u / WAVE_PEAK_U) * Math.PI * 0.5)
            : 0.5 * (1 + Math.cos(((u - WAVE_PEAK_U) / (1 - WAVE_PEAK_U)) * Math.PI))
        waveDy = -0.12 * pulse
      }
    }
    const dy = genJump + waveDy

    const mapPt = (lx: number, ly: number, lz: number): Vec3 => xformVec(rot, lx, ly + dy, lz)

    // 8 个局部角点：0..3 前面 (z1) 顺时针 (左上, 右上, 右下, 左下); 4..7 背面 (z0)
    const cornersW: Vec3[] = [
      mapPt(b.x0, b.yTopL, b.z1),
      mapPt(b.x1, b.yTopR, b.z1),
      mapPt(b.x1, b.yBotR, b.z1),
      mapPt(b.x0, b.yBotL, b.z1),
      mapPt(b.x0, b.yTopL, b.z0),
      mapPt(b.x1, b.yTopR, b.z0),
      mapPt(b.x1, b.yBotR, b.z0),
      mapPt(b.x0, b.yBotL, b.z0),
    ]
    const zCenter = cornersW.reduce((acc, p) => acc + p.z, 0) / 8
    return { bar: b, idx, dy, cornersW, zCenter }
  })

  // 按每根柱子的真实 3D 重心深度由远到近绘制，保证左右转头时的真实前后遮挡
  const sortedBars = [...barStates].sort((a, b) => a.zCenter - b.zCenter)
  const frontNormal = xformVec(rot, 0, 0, 1)
  const backNormal = xformVec(rot, 0, 0, -1)
  const leftNormal = xformVec(rot, -1, 0, 0)
  const rightNormal = xformVec(rot, 1, 0, 0)

  const shadeFace = (rgb: [number, number, number], n: Vec3, bonus = 0): string => {
    const lit = clamp(0.68 + n.x * -0.16 + n.y * -0.24 + n.z * 0.28 + bonus, 0.36, 1.18) * lightBoost
    return `rgb(${Math.round(clamp(rgb[0] * lit, 0, 255))},${Math.round(clamp(rgb[1] * lit, 0, 255))},${Math.round(clamp(rgb[2] * lit, 0, 255))})`
  }

  for (const bs of sortedBars) {
    const { bar, cornersW, dy } = bs
    const sideQuads: QuadPrim[] = []

    // 背面
    if (backNormal.z > -0.1) {
      sideQuads.push(
        makeQuadPrim(
          [cornersW[4], cornersW[5], cornersW[6], cornersW[7]],
          cx,
          cy,
          s,
          shadeFace(bar.cSide, backNormal, -0.12),
          0,
          undefined,
          0.5
        )
      )
    }
    // 左侧面
    if (leftNormal.z > -0.12) {
      sideQuads.push(
        makeQuadPrim(
          [cornersW[4], cornersW[0], cornersW[3], cornersW[7]],
          cx,
          cy,
          s,
          shadeFace(bar.cSide, leftNormal, 0.04),
          0,
          undefined,
          0.5
        )
      )
    }
    // 右侧面
    if (rightNormal.z > -0.12) {
      sideQuads.push(
        makeQuadPrim(
          [cornersW[1], cornersW[5], cornersW[6], cornersW[2]],
          cx,
          cy,
          s,
          shadeFace(bar.cSide, rightNormal, 0.04),
          0,
          undefined,
          0.5
        )
      )
    }
    // 斜切顶面（高光提亮，凸显斜切棱角）
    const topSlopeN = xformVec(rot, (bar.yTopL - bar.yTopR) * 0.4, -1, 0)
    if (topSlopeN.z > -0.15) {
      sideQuads.push(
        makeQuadPrim(
          [cornersW[4], cornersW[5], cornersW[1], cornersW[0]],
          cx,
          cy,
          s,
          shadeFace(bar.cTop, topSlopeN, 0.14),
          0,
          undefined,
          0.5
        )
      )
    }
    // 斜切底面
    const botSlopeN = xformVec(rot, (bar.yBotR - bar.yBotL) * 0.4, 1, 0)
    if (botSlopeN.z > -0.15) {
      sideQuads.push(
        makeQuadPrim(
          [cornersW[3], cornersW[2], cornersW[6], cornersW[7]],
          cx,
          cy,
          s,
          shadeFace(bar.cBot, botSlopeN, -0.15),
          0,
          undefined,
          0.5
        )
      )
    }

    paintQuadPrims(ctx, sideQuads)

    // 前正面（丝滑渐变琉璃柱面 + 镜面光泽 + 贴面眼睛）
    if (frontNormal.z > -0.08) {
      const fPts = [
        projectPt(cornersW[0], cx, cy, s),
        projectPt(cornersW[1], cx, cy, s),
        projectPt(cornersW[2], cx, cy, s),
        projectPt(cornersW[3], cx, cy, s),
      ]
      const gStart = fPts[0]
      const gEnd = fPts[2]
      const frontGrad = ctx.createLinearGradient(gStart.x, gStart.y, gEnd.x, gEnd.y)
      frontGrad.addColorStop(
        0,
        `rgb(${Math.round(clamp(bar.cTop[0] * lightBoost, 0, 255))},${Math.round(clamp(bar.cTop[1] * lightBoost, 0, 255))},${Math.round(clamp(bar.cTop[2] * lightBoost, 0, 255))})`
      )
      frontGrad.addColorStop(
        1,
        `rgb(${Math.round(clamp(bar.cBot[0] * lightBoost, 0, 255))},${Math.round(clamp(bar.cBot[1] * lightBoost, 0, 255))},${Math.round(clamp(bar.cBot[2] * lightBoost, 0, 255))})`
      )

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(fPts[0].x, fPts[0].y)
      ctx.lineTo(fPts[1].x, fPts[1].y)
      ctx.lineTo(fPts[2].x, fPts[2].y)
      ctx.lineTo(fPts[3].x, fPts[3].y)
      ctx.closePath()
      ctx.fillStyle = frontGrad
      ctx.fill()
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(0.8, s * 0.016)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.stroke()
      ctx.clip()

      // 随指针流动的斜向琉璃反光扫光
      const midFx = (fPts[0].x + fPts[2].x) * 0.5 + glare.x * s * 0.14
      const midFy = (fPts[0].y + fPts[2].y) * 0.5 + glare.y * s * 0.14
      const sheen = ctx.createRadialGradient(midFx, midFy - s * 0.1, s * 0.02, midFx, midFy, s * 0.58)
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.28)')
      sheen.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = sheen
      ctx.fillRect(cx - s * 1.4, cy - s * 1.4, s * 2.8, s * 2.8)
      ctx.restore()

      // 在中间两根柱子（Bar 1 左眼、Bar 2 右眼）上绘制随各自柱子上下同步跳动的贴面灵动眼眸
      if (bar.eyeSide !== 0 && frontNormal.z > 0.08) {
        const eyeCx = (bar.x0 + bar.x1) * 0.5
        const eyeCy = bar.eyeY + dy
        const eyeCz = bar.z1 + 0.004
        const p0 = projectPt(xformVec(rot, eyeCx, eyeCy, eyeCz), cx, cy, s)
        const eps = 0.05
        const pu = projectPt(xformVec(rot, eyeCx + eps, eyeCy, eyeCz), cx, cy, s)
        const pv = projectPt(xformVec(rot, eyeCx, eyeCy + eps, eyeCz), cx, cy, s)
        const refScale = 1 / (eps * 16)
        const ux = (pu.x - p0.x) * refScale
        const uy = (pu.y - p0.y) * refScale
        const vx = ((pv.x - p0.x) * refScale) * eyeScaleY
        const vy = ((pv.y - p0.y) * refScale) * eyeScaleY

        const localAlpha = clamp((frontNormal.z - 0.08) / 0.24, 0, 1)
        const inkColor = '#0F172A'
        ctx.save()
        ctx.globalAlpha *= localAlpha
        ctx.transform(ux, uy, vx, vy, p0.x, p0.y)

        if (mood === 'sleep') {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)'
          ctx.lineWidth = 0.6
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(-0.78, 0)
          ctx.lineTo(0.78, 0)
          ctx.stroke()
        } else if (mood === 'happy' || mood === 'cheer') {
          ctx.strokeStyle = inkColor
          ctx.lineWidth = 0.65
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(-0.82, 0.32)
          ctx.quadraticCurveTo(0, -0.78, 0.82, 0.32)
          ctx.stroke()
        } else if (mood === 'dizzy' || mood === 'wipe') {
          ctx.strokeStyle = inkColor
          ctx.lineWidth = 0.62
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          if (bar.eyeSide < 0) {
            ctx.moveTo(-0.68, -0.78)
            ctx.lineTo(0.68, 0)
            ctx.lineTo(-0.68, 0.78)
          } else {
            ctx.moveTo(0.68, -0.78)
            ctx.lineTo(-0.68, 0)
            ctx.lineTo(0.68, 0.78)
          }
          ctx.stroke()
        } else if (mood === 'frustrated') {
          ctx.strokeStyle = inkColor
          ctx.lineWidth = 0.52
          ctx.lineCap = 'round'
          ctx.beginPath()
          if (bar.eyeSide < 0) {
            ctx.moveTo(0.55, -1.12)
            ctx.lineTo(-0.78, -0.58)
          } else {
            ctx.moveTo(-0.55, -1.12)
            ctx.lineTo(0.78, -0.58)
          }
          ctx.stroke()
          const fx = clamp(lookX * 0.24, -0.24, 0.24)
          const fy = 0.14 + clamp(lookY * 0.22, -0.22, 0.22)
          ctx.fillStyle = inkColor
          ctx.beginPath()
          ctx.roundRect(fx - 0.56, fy - 0.7, 1.12, 1.4, 0.56)
          ctx.fill()
          ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
          ctx.beginPath()
          ctx.arc(fx - 0.2, fy - 0.28, 0.24, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(186, 230, 253, 0.95)'
          ctx.beginPath()
          ctx.arc(fx + bar.eyeSide * 0.22, fy + 0.42, 0.22, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // 干净纯深色圆角豆豆眼（尺寸与其余 4 位画师对齐）
          const px = clamp(lookX * 0.28, -0.28, 0.28)
          const py = clamp(lookY * 0.26, -0.26, 0.26)
          const pillW = 1.15
          const pillH = mood === 'hover' ? 1.85 : 1.6
          ctx.fillStyle = inkColor
          ctx.beginPath()
          ctx.roundRect(px - pillW * 0.5, py - pillH * 0.5, pillW, pillH, pillW * 0.5)
          ctx.fill()

          if (!isBlinking || !blinkAllowed) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
            ctx.beginPath()
            ctx.arc(px - pillW * 0.18, py - pillH * 0.24, 0.25, 0, Math.PI * 2)
            ctx.fill()
          }
        }

        ctx.restore()
      }
    }
  }
}

export function ArtistMesh3D({
  providerId,
  mood,
  isBlinking,
  selected,
  hovered,
  disabled,
  generating,
  isWiping,
  cheering,
  frustrated = false,
  reactionTick,
  prefersReducedMotion,
  sizePx,
  getTargetPose,
  overridePoseRef,
  getGlareOffset,
  onPoseFrame,
  className,
}: ArtistMesh3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // 画布预留空间防止高角度旋转时边缘光环/小手/星芒及加高后的 Muse 皇冠被裁切
  const canvasCssSize = Math.round(sizePx * (providerId === 'muse' ? 1.52 : 1.38))

  const latestPropsRef = useRef({
    providerId,
    mood,
    isBlinking,
    selected,
    hovered,
    disabled,
    generating,
    isWiping,
    cheering,
    frustrated,
    prefersReducedMotion,
    sizePx,
    canvasCssSize,
    getTargetPose,
    overridePoseRef,
    getGlareOffset,
    onPoseFrame,
  })
  latestPropsRef.current = {
    providerId,
    mood,
    isBlinking,
    selected,
    hovered,
    disabled,
    generating,
    isWiping,
    cheering,
    frustrated,
    prefersReducedMotion,
    sizePx,
    canvasCssSize,
    getTargetPose,
    overridePoseRef,
    getGlareOffset,
    onPoseFrame,
  }

  const animRef = useRef({
    yaw: 0,
    pitch: 0,
    roll: 0,
    lookX: 0,
    lookY: 0,
    liftY: 0,
    spinRad: 0,
    accretionRad: 0,
    moonletRad: 0,
    waveClockSec: 1.55,
    gyroUntilMs: 0,
    gyroDurationMs: 560,
    gyroCycles: 1,
    squishUntilMs: 0,
    lastReactionTick: reactionTick,
    phaseOffset:
      providerId === 'gpt'
        ? 0
        : providerId === 'grok'
          ? 1.7
          : providerId === 'muse'
            ? 2.5
            : 3.2,
  })

  // 监测受击/换笔 reactionTick 触发 Q 弹与黑洞外环陀螺翻滚
  useEffect(() => {
    if (reactionTick > 0 && reactionTick !== animRef.current.lastReactionTick) {
      animRef.current.lastReactionTick = reactionTick
      const now = performance.now()
      animRef.current.squishUntilMs = now + 460
      if (providerId === 'grok') {
        animRef.current.gyroDurationMs = 560
        animRef.current.gyroCycles = 1
        animRef.current.gyroUntilMs = now + 560
      } else if (providerId === 'seedream' && animRef.current.waveClockSec >= 0.72) {
        animRef.current.waveClockSec = 0
      }
    }
  }, [reactionTick, providerId])

  const lastDrawMsRef = useRef<number | null>(null)
  const lastUiDrawMsRef = useRef(0)

  const drawSingleFrame = (nowMs: number, explicitDtSec?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const p = latestPropsRef.current
    const st = animRef.current
    const overridePose = p.overridePoseRef?.current ?? null
    const target = overridePose ?? p.getTargetPose()

    // 平静待机呼吸保持 30fps 节流，悬停/跟随/生图/受击/穿梭翻滚及 Seedream 波浪发射窗恢复 60fps 满帧渲染
    if (explicitDtSec === undefined) {
      const seedreamWaveBurst =
        p.providerId === 'seedream' &&
        !p.disabled &&
        !p.prefersReducedMotion &&
        !p.frustrated &&
        (st.waveClockSec >= 1.94 || st.waveClockSec <= 0.72)
      const isActiveMotion =
        Boolean(overridePose) ||
        p.hovered ||
        p.generating ||
        p.cheering ||
        p.isWiping ||
        p.frustrated ||
        seedreamWaveBurst ||
        nowMs < st.squishUntilMs ||
        nowMs < st.gyroUntilMs ||
        Math.abs(target.yawDeg - st.yaw) > 0.1 ||
        Math.abs(target.pitchDeg - st.pitch) > 0.1 ||
        Math.abs(target.lookX - st.lookX) > 0.005 ||
        Math.abs(target.lookY - st.lookY) > 0.005
      if (!isActiveMotion && nowMs - lastUiDrawMsRef.current < 33) {
        return
      }
    }
    lastUiDrawMsRef.current = nowMs

    const dtSec =
      explicitDtSec !== undefined
        ? explicitDtSec
        : lastDrawMsRef.current === null
          ? 0
          : clamp((nowMs - lastDrawMsRef.current) / 1000, 0.001, 0.05)
    lastDrawMsRef.current = nowMs

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    const targetW = Math.round(p.canvasCssSize * dpr)
    const targetH = Math.round(p.canvasCssSize * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (overridePose) {
      st.yaw = overridePose.yawDeg
      st.pitch = overridePose.pitchDeg
      st.roll = overridePose.rollDeg
      st.lookX = overridePose.lookX
      st.lookY = overridePose.lookY
      st.liftY = overridePose.liftY
    } else {
      const smoothRate = p.prefersReducedMotion
        ? 1
        : dtSec === 0
          ? 0
          : 1 - Math.exp(-(p.hovered ? 14 : 6.4) * dtSec)

      st.yaw = lerp(st.yaw, target.yawDeg, smoothRate)
      st.pitch = lerp(st.pitch, target.pitchDeg, smoothRate)
      st.roll = lerp(st.roll, target.rollDeg, smoothRate)
      st.lookX = lerp(st.lookX, target.lookX, smoothRate)
      st.lookY = lerp(st.lookY, target.lookY, smoothRate)
      st.liftY = lerp(st.liftY, target.liftY, smoothRate)
    }

    const timeSec = nowMs * 0.001 + st.phaseOffset
    let bobY = st.liftY
    let scaleX = 1
    let scaleY = 1
    let breatheScale = 1
    let renderYaw = st.yaw
    let renderRoll = st.roll

    if (!p.prefersReducedMotion && !p.disabled && !overridePose) {
      if (p.cheering) {
        const u = ((nowMs % 650) / 650) * Math.PI * 2
        bobY += -Math.abs(Math.sin(u)) * 12
        const stretch = Math.sin(u) * 0.08
        scaleX = 1 - stretch * 0.7
        scaleY = 1 + stretch
      } else if (p.generating && !p.isWiping) {
        const u = ((nowMs % 1250) / 1250) * Math.PI * 2
        if (p.providerId === 'muse') {
          // Muse 工位作画专属：稳稳站在桌面上踩着双拍左右轻摇起舞
          renderRoll += Math.sin(u) * 7.5
          renderYaw += Math.cos(u) * 8
          const squash = Math.sin(u * 2) * 0.032
          scaleX = 1 + squash
          scaleY = 1 - squash * 0.85
        } else {
          bobY += -Math.abs(Math.sin(u)) * 4.5
          const squash = Math.sin(u * 2) * 0.035
          scaleX = 1 + squash
          scaleY = 1 - squash
        }
      } else if (p.frustrated) {
        const u = ((nowMs % 2800) / 2800) * Math.PI * 2
        const sigh = Math.sin(u)
        bobY += 3.5 + sigh * 1.6
        const droop = (sigh + 1) * 0.5
        scaleX = 1 + droop * 0.03
        scaleY = 1 - droop * 0.035
      } else if (p.providerId !== 'muse') {
        bobY += Math.sin(timeSec * 1.75) * 3.2
      }

      if (p.providerId === 'gpt') {
        const spinSpeed = p.generating ? 1.85 : p.frustrated ? 0.12 : 0.39
        st.spinRad = (st.spinRad + spinSpeed * dtSec) % (Math.PI * 2)
      } else if (p.providerId === 'grok') {
        const accSpeed = p.generating ? 2.62 : p.frustrated ? 0.28 : 0.9
        st.accretionRad = (st.accretionRad + accSpeed * dtSec) % (Math.PI * 2)
        st.moonletRad = (st.moonletRad + 1.12 * dtSec) % (Math.PI * 2)
      } else if (p.providerId === 'muse') {
        const orbitSpeed = p.generating ? 2.15 : p.frustrated ? 0.25 : 0.72
        st.moonletRad = (st.moonletRad + orbitSpeed * dtSec) % (Math.PI * 2)
        const breath = Math.sin(timeSec * (p.frustrated ? 1.1 : 2.05)) * (p.frustrated ? 0.014 : 0.024)
        scaleX *= 1 - breath * 0.6
        scaleY *= 1 + breath
      } else if (p.providerId === 'seedream') {
        st.waveClockSec = (st.waveClockSec + dtSec) % 2.0
        breatheScale =
          1 + Math.sin(timeSec * (p.frustrated ? 1.1 : 2.16)) * (p.frustrated ? 0.016 : 0.028)
      } else {
        breatheScale =
          1 + Math.sin(timeSec * (p.frustrated ? 1.1 : 2.16)) * (p.frustrated ? 0.018 : 0.036)
      }

      // 受击 Q 弹缩放波
      if (nowMs < st.squishUntilMs) {
        const u = 1 - (st.squishUntilMs - nowMs) / 460
        if (u < 0.28) {
          const k = Math.sin((u / 0.28) * Math.PI * 0.5)
          scaleX *= 1 + 0.18 * k
          scaleY *= 1 - 0.18 * k
          bobY += 3 * k
        } else if (u < 0.65) {
          const k = Math.sin(((u - 0.28) / 0.37) * Math.PI)
          scaleX *= 1 - 0.08 * k
          scaleY *= 1 + 0.12 * k
          bobY -= 5 * k
        } else {
          const k = 1 - (u - 0.65) / 0.35
          scaleX *= 1 + 0.03 * k
          scaleY *= 1 - 0.03 * k
        }
      }
    }

    let gyroDeg = 0
    if (!p.prefersReducedMotion && nowMs < st.gyroUntilMs) {
      const dur = st.gyroDurationMs || 560
      const cycles = st.gyroCycles || 1
      const u = clamp(1 - (st.gyroUntilMs - nowMs) / dur, 0, 1)
      const ease = 1 - Math.pow(1 - u, 2.2)
      gyroDeg = ease * 360 * cycles
    }

    const seedreamWaveSec =
      !p.prefersReducedMotion && !p.disabled && !overridePose && !p.frustrated
        ? st.waveClockSec
        : -1

    p.onPoseFrame?.({
      yawDeg: renderYaw,
      pitchDeg: st.pitch,
      rollDeg: renderRoll,
      bobY,
      scaleX,
      scaleY,
    })

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, p.canvasCssSize, p.canvasCssSize)

    const cx = p.canvasCssSize * 0.5
    const cy = p.canvasCssSize * 0.5 + bobY
    const modelScale = p.sizePx * 0.435
    const pivotY = p.providerId === 'muse' && !overridePose ? cy + modelScale * 1.12 : cy

    ctx.save()
    ctx.translate(cx, pivotY)
    ctx.scale(scaleX, scaleY)
    ctx.translate(-cx, -pivotY)

    const rot = overridePose?.matrix ?? buildRotMatrix(renderYaw, st.pitch, renderRoll)
    const glare = p.getGlareOffset?.() ?? { x: -0.35, y: -0.45 }

    if (p.providerId === 'gpt') {
      drawGpt3D(
        ctx,
        cx,
        cy,
        modelScale,
        rot,
        st.spinRad,
        p.mood,
        p.isBlinking,
        p.selected,
        p.hovered,
        st.lookX,
        st.lookY,
        glare
      )
    } else if (p.providerId === 'grok') {
      drawGrok3D(
        ctx,
        cx,
        cy,
        modelScale,
        rot,
        st.accretionRad,
        st.moonletRad,
        gyroDeg,
        p.mood,
        p.isBlinking,
        st.lookX,
        st.lookY,
        glare
      )
    } else if (p.providerId === 'muse') {
      drawMuse3D(
        ctx,
        cx,
        cy,
        modelScale,
        rot,
        st.moonletRad,
        breatheScale,
        p.mood,
        p.isBlinking,
        p.selected,
        p.hovered,
        p.generating,
        st.lookX,
        st.lookY,
        timeSec,
        glare
      )
    } else if (p.providerId === 'seedream') {
      drawSeedream3D(
        ctx,
        cx,
        cy,
        modelScale,
        rot,
        seedreamWaveSec,
        breatheScale,
        p.mood,
        p.isBlinking,
        p.selected,
        p.hovered,
        p.generating,
        st.lookX,
        st.lookY,
        timeSec,
        glare
      )
    } else {
      drawGemini3D(
        ctx,
        cx,
        cy,
        modelScale,
        rot,
        breatheScale,
        p.mood,
        p.isBlinking,
        p.selected,
        p.hovered,
        p.generating,
        st.lookX,
        st.lookY,
        timeSec
      )
    }

    ctx.restore()
    ctx.restore()
  }

  // 仅在首次挂载或尺寸/厂商切换时同步绘制首帧；其余状态切换交给正在运行的 rAF 异步承接，避免阻塞 React commit
  useLayoutEffect(() => {
    drawSingleFrame(performance.now(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, sizePx])

  useEffect(() => {
    if (prefersReducedMotion || disabled) return
    let rafId = 0
    let inViewport = true

    const isActive = () =>
      inViewport && (typeof document === 'undefined' || document.visibilityState !== 'hidden')

    const loop = (now: number) => {
      if (!isActive()) {
        rafId = 0
        lastDrawMsRef.current = null
        return
      }
      drawSingleFrame(now)
      rafId = window.requestAnimationFrame(loop)
    }

    const syncLoop = () => {
      if (isActive()) {
        if (rafId === 0) {
          lastDrawMsRef.current = null
          rafId = window.requestAnimationFrame(loop)
        }
      } else if (rafId !== 0) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
        lastDrawMsRef.current = null
      }
    }

    const onVisibilityChange = () => syncLoop()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    let observer: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined' && canvasRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (!entry) return
          inViewport = entry.isIntersecting
          syncLoop()
        },
        { threshold: 0.01 }
      )
      observer.observe(canvasRef.current)
    }

    syncLoop()
    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      observer?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion, disabled])

  useEffect(() => {
    if (!prefersReducedMotion && !disabled) return
    drawSingleFrame(performance.now(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion, disabled, mood, isBlinking, selected, hovered, generating, isWiping, cheering, frustrated])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        width: canvasCssSize,
        height: canvasCssSize,
      }}
      className={className}
    />
  )
}
