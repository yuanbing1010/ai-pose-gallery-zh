import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ImageProviderId } from '../../../shared/studio'

export type SpriteMood = 'idle' | 'hover' | 'happy' | 'dizzy' | 'focus' | 'wipe' | 'cheer' | 'sleep'
export type SpriteTone = 'jade' | 'indigo' | 'amber'

export interface SpritePoseTarget {
  yawDeg: number
  pitchDeg: number
  rollDeg: number
  lookX: number
  lookY: number
  liftY: number
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
  reactionTick: number
  prefersReducedMotion: boolean
  sizePx: number
  /** 由父级或围观逻辑计算出的目标姿态读取函数（避免在高频 rAF 中触发 React 重渲染） */
  getTargetPose: () => SpritePoseTarget
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

type Mat3 = [number, number, number, number, number, number, number, number, number]

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
  spanRadY: number
) {
  const blinkAllowed =
    mood !== 'sleep' && mood !== 'cheer' && mood !== 'dizzy' && mood !== 'wipe' && mood !== 'happy'
  const eyeScaleY = isBlinking && blinkAllowed ? 0.14 : 1

  const eyeColor =
    tone === 'indigo' ? '#E0E7FF' : tone === 'jade' ? '#0F5C54' : '#18181B'
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
        y: domeRadius * ny,
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

  const drawBlush = (side: -1 | 1, yOff: number, r: number, op: number) => {
    const fx = side * 0.68
    applyLocalFrame(fx, yOff / 7, () => {
      ctx.fillStyle = '#FB7185'
      ctx.globalAlpha *= op
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  if (mood === 'cheer') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * 0.45, -0.05, () => {
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
      applyLocalFrame(side * 0.44, 0, () => {
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

  if (mood === 'dizzy' || mood === 'wipe') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * 0.44, 0, () => {
        ctx.strokeStyle = eyeColor
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
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
      drawBlush(side, 3.4, 1.4, 0.72)
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
      applyLocalFrame(side * 0.44, 0, () => {
        ctx.strokeStyle = eyeColor
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-2.6, 1.2)
        ctx.quadraticCurveTo(0, -2.6, 2.6, 1.2)
        ctx.stroke()
      })
      if (tone === 'amber') {
        drawBlush(side, 3.4, 1.4, 0.7)
      }
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

  // focus（埋头绘画）：去掉突兀眉毛，保持与日常完全一致的眼型与眼距比例 + 微小专注表情嘴 + 淡腮红
  if (mood === 'focus') {
    for (const side of [-1, 1] as const) {
      applyLocalFrame(side * 0.42, -0.02, () => {
        ctx.fillStyle = pillColor
        ctx.beginPath()
        ctx.roundRect(-2.0, -2.65, 4.0, 5.3, 2.0)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.beginPath()
        ctx.arc(-0.75, -1.35, 0.92, 0, Math.PI * 2)
        ctx.fill()
      })
      drawBlush(side, 3.4, 1.35, 0.62)
    }
    applyLocalFrame(0, 0.48, () => {
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

  // idle / hover（jade & indigo）
  const pillH = mood === 'hover' ? 6.6 : 5.6
  for (const side of [-1, 1] as const) {
    applyLocalFrame(side * 0.42, -0.02, () => {
      ctx.fillStyle = pillColor
      ctx.beginPath()
      ctx.roundRect(-2.0, -pillH * 0.5, 4.0, pillH, 2.0)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
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
    // 1. 紧密堆积的 3D 实心挤压侧壁（Δz = 0.026，任意旋转角度无断层缝隙）
    const depthSlices = [
      { z: -0.125, fill: '#053B35' },
      { z: -0.098, fill: '#074C45' },
      { z: -0.071, fill: '#0A5C53' },
      { z: -0.044, fill: '#0C6B61' },
      { z: -0.017, fill: '#107B70' },
      { z: 0.008, fill: '#158A7D' },
    ]
    const orderedSlices = facingFront ? depthSlices : [...depthSlices].reverse()
    for (const sl of orderedSlices) {
      ctx.beginPath()
      for (let p = 0; p < 6; p++) {
        traceLoopAtZ(GPT_VECTOR.petal, spinRad + (p * Math.PI) / 3, sl.z, true)
      }
      ctx.fillStyle = sl.fill
      ctx.fill()
      ctx.lineWidth = Math.max(0.8, s * 0.024)
      ctx.lineJoin = 'round'
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

        // 先向下层花瓣投射柔和叠压阴影（上层花瓣真实压在下层花瓣上方）
        if (castShadow) {
          ctx.save()
          ctx.beginPath()
          traceWeaveLoopAtZ(fillPts, angle, zVal, true)
          ctx.shadowColor = 'rgba(4, 47, 46, 0.34)'
          ctx.shadowBlur = Math.max(2.5, s * 0.085)
          ctx.shadowOffsetX = s * 0.012
          ctx.shadowOffsetY = s * 0.02
          ctx.fillStyle = 'rgba(13, 89, 82, 0.25)'
          ctx.fill()
          ctx.restore()
        }

        ctx.beginPath()
        traceWeaveLoopAtZ(fillPts, angle, zVal, true)
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
  ctx.lineJoin = 'round'
  for (const q of sorted) {
    ctx.save()
    if (q.alpha !== undefined && q.alpha < 1) {
      ctx.globalAlpha *= q.alpha
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
    ctx.restore()
  }
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
    ctx.shadowColor = 'rgba(30, 27, 75, 0.34)'
    ctx.shadowBlur = scale * 0.075
    ctx.fillStyle = silverGrad
    ctx.fill()
    ctx.restore()

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
  const nOutline = GEMINI_OUTLINE.length

  const traceStarAtZ = (zLocal: number, scaleXY = 1) => {
    ctx.beginPath()
    for (let i = 0; i < nOutline; i++) {
      const w = xformVec(rot, GEMINI_OUTLINE[i][0] * scaleXY, GEMINI_OUTLINE[i][1] * scaleXY, zLocal)
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

  // 2. 128 段连续无缝 3D 倒角 + 晶体侧壁（按段逐面 Z 深度排序，彻底告别斜视分层锯齿）
  const wallQuads: QuadPrim[] = []
  for (let i = 0; i < nOutline; i++) {
    const j = (i + 1) % nOutline
    const p0 = GEMINI_OUTLINE[i]
    const p1 = GEMINI_OUTLINE[j]
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
  reactionTick,
  prefersReducedMotion,
  sizePx,
  getTargetPose,
  getGlareOffset,
  onPoseFrame,
  className,
}: ArtistMesh3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // 画布预留 1.38x 空间防止高角度旋转时边缘光环/小手/星芒被裁切
  const canvasCssSize = Math.round(sizePx * 1.38)

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
    prefersReducedMotion,
    sizePx,
    canvasCssSize,
    getTargetPose,
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
    prefersReducedMotion,
    sizePx,
    canvasCssSize,
    getTargetPose,
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
    gyroUntilMs: 0,
    squishUntilMs: 0,
    lastReactionTick: reactionTick,
    phaseOffset: providerId === 'gpt' ? 0 : providerId === 'grok' ? 1.7 : 3.2,
  })

  // 监测受击/换笔 reactionTick 触发 Q 弹与黑洞外环陀螺翻滚
  useEffect(() => {
    if (reactionTick > 0 && reactionTick !== animRef.current.lastReactionTick) {
      animRef.current.lastReactionTick = reactionTick
      const now = performance.now()
      animRef.current.squishUntilMs = now + 460
      if (providerId === 'grok') {
        animRef.current.gyroUntilMs = now + 560
      }
    }
  }, [reactionTick, providerId])

  const lastDrawMsRef = useRef<number | null>(null)

  const drawSingleFrame = (nowMs: number, explicitDtSec?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const p = latestPropsRef.current
    const dtSec =
      explicitDtSec !== undefined
        ? explicitDtSec
        : lastDrawMsRef.current === null
          ? 0
          : clamp((nowMs - lastDrawMsRef.current) / 1000, 0.001, 0.05)
    lastDrawMsRef.current = nowMs

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1
    const targetW = Math.round(p.canvasCssSize * dpr)
    const targetH = Math.round(p.canvasCssSize * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const st = animRef.current
    const target = p.getTargetPose()
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

    const timeSec = nowMs * 0.001 + st.phaseOffset
    let bobY = st.liftY
    let scaleX = 1
    let scaleY = 1
    let breatheScale = 1

    if (!p.prefersReducedMotion && !p.disabled) {
      if (p.cheering) {
        const u = ((nowMs % 650) / 650) * Math.PI * 2
        bobY += -Math.abs(Math.sin(u)) * 12
        const stretch = Math.sin(u) * 0.08
        scaleX = 1 - stretch * 0.7
        scaleY = 1 + stretch
      } else if (p.generating && !p.isWiping) {
        const u = ((nowMs % 1250) / 1250) * Math.PI * 2
        bobY += -Math.abs(Math.sin(u)) * 4.5
        const squash = Math.sin(u * 2) * 0.035
        scaleX = 1 + squash
        scaleY = 1 - squash
      } else {
        bobY += Math.sin(timeSec * 1.75) * 3.2
      }

      if (p.providerId === 'gpt') {
        const spinSpeed = p.generating ? 1.85 : 0.39
        st.spinRad = (st.spinRad + spinSpeed * dtSec) % (Math.PI * 2)
      } else if (p.providerId === 'grok') {
        const accSpeed = p.generating ? 2.62 : 0.9
        st.accretionRad = (st.accretionRad + accSpeed * dtSec) % (Math.PI * 2)
        st.moonletRad = (st.moonletRad + 1.12 * dtSec) % (Math.PI * 2)
      } else {
        breatheScale = 1 + Math.sin(timeSec * 2.16) * 0.036
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
      const u = 1 - (st.gyroUntilMs - nowMs) / 560
      const ease = 1 - Math.pow(1 - u, 2.2)
      gyroDeg = ease * 360
    }

    p.onPoseFrame?.({
      yawDeg: st.yaw,
      pitchDeg: st.pitch,
      rollDeg: st.roll,
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

    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scaleX, scaleY)
    ctx.translate(-cx, -cy)

    const rot = buildRotMatrix(st.yaw, st.pitch, st.roll)
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

  // 首帧与状态变更同步重绘（explicitDtSec = 0，彻底避免眨眼/悬停状态切换时花瓣与旋转角度跳变卡顿）
  useLayoutEffect(() => {
    drawSingleFrame(performance.now(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, sizePx, mood, isBlinking, selected, hovered, disabled, generating, isWiping, cheering, prefersReducedMotion])

  useEffect(() => {
    if (prefersReducedMotion) {
      drawSingleFrame(performance.now(), 0)
      return
    }
    let rafId = 0
    const loop = (now: number) => {
      drawSingleFrame(now)
      rafId = window.requestAnimationFrame(loop)
    }
    rafId = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion])

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
