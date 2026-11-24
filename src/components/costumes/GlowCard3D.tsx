import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotionNow } from '@/lib/motionTokens'
import { cn } from '@/lib/utils'

export interface GlowCard3DProps {
  imageUrl: string
  alt: string
  direction?: 1 | -1
  shadowOpacity?: number
  className?: string
}

const CARD_HEIGHT = 1.92
const CARD_RADIUS = 0.092
const TRANSITION_DUR = 0.95

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const clamp01 = (v: number) => clamp(v, 0, 1)
const softClamp = (v: number, limit: number) => limit * Math.tanh(v / limit)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInCubic = (t: number) => t * t * t
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeSpringOut = (t: number) => 1 - Math.exp(-6 * t) * Math.cos(3 * Math.PI * t)

type Keyframe = [number, number, ((t: number) => number)?]
function evalKeys(t: number, keys: Keyframe[]): number {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, ease = easeInOutCubic] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (t <= t1) return lerp(v0, v1, ease((t - t0) / Math.max(1e-5, t1 - t0)))
  }
  return keys[keys.length - 1][1]
}

interface MeshBuffers {
  pos: Float32Array
  norm: Float32Array
  uv: Float32Array
  idx: Uint16Array
}

function buildPlaneMesh(w: number, h: number, segX = 1, segY = 1): MeshBuffers {
  const cols = segX + 1
  const rows = segY + 1
  const pos = new Float32Array(cols * rows * 3)
  const norm = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  const idx = new Uint16Array(segX * segY * 6)

  for (let iy = 0; iy < rows; iy++) {
    const v = iy / segY
    const y = (0.5 - v) * h
    for (let ix = 0; ix < cols; ix++) {
      const u = ix / segX
      const x = (u - 0.5) * w
      const k = iy * cols + ix
      pos[k * 3] = x
      pos[k * 3 + 1] = y
      pos[k * 3 + 2] = 0
      norm[k * 3] = 0
      norm[k * 3 + 1] = 0
      norm[k * 3 + 2] = 1
      uv[k * 2] = u
      uv[k * 2 + 1] = 1 - v
    }
  }

  let ptr = 0
  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * cols + ix
      const b = a + 1
      const c = a + cols
      const d = c + 1
      idx[ptr++] = a
      idx[ptr++] = c
      idx[ptr++] = b
      idx[ptr++] = b
      idx[ptr++] = c
      idx[ptr++] = d
    }
  }
  return { pos, norm, uv, idx }
}

/**
 * 构建轻薄实体集换卡网格（克制微倒角，保留纸卡轻薄质感与边缘全息流光）
 */
function buildBeveledCardMesh(
  worldW: number,
  worldH: number,
  radius: number,
  bevel = 0.018,
  extrudeZ = 0.012
): MeshBuffers {
  const segX = 56
  const segY = 84
  const m = buildPlaneMesh(worldW, worldH, segX, segY)
  const cols = segX + 1
  const rows = segY + 1
  const halfW = worldW * 0.5
  const halfH = worldH * 0.5

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const k = iy * cols + ix
      const x = m.pos[k * 3]
      const y = m.pos[k * 3 + 1]
      const qx = Math.abs(x) - (halfW - radius)
      const qy = Math.abs(y) - (halfH - radius)
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
      const inset = Math.max(0, -sd)
      const t = Math.min(1, inset / bevel)
      m.pos[k * 3 + 2] = extrudeZ * (1 - (1 - t) * (1 - t))
    }
  }

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const k = iy * cols + ix
      const xl = ix > 0 ? m.pos[(k - 1) * 3 + 2] : m.pos[k * 3 + 2]
      const xr = ix < segX ? m.pos[(k + 1) * 3 + 2] : m.pos[k * 3 + 2]
      const yt = iy > 0 ? m.pos[(k - cols) * 3 + 2] : m.pos[k * 3 + 2]
      const yb = iy < segY ? m.pos[(k + cols) * 3 + 2] : m.pos[k * 3 + 2]
      const dx = (2 * worldW) / segX
      const dy = (2 * worldH) / segY
      const nx = (xl - xr) / dx
      const ny = (yb - yt) / dy
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      m.norm[k * 3] = nx / len
      m.norm[k * 3 + 1] = ny / len
      m.norm[k * 3 + 2] = nz / len
    }
  }
  return m
}

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovRad / 2)
  const nf = 1 / (near - far)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ])
}

function mat4ModelView(
  tx: number,
  ty: number,
  tz: number,
  rx: number,
  ry: number,
  rz: number,
  scale: number,
  camZ: number
): Float32Array {
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)

  const m00 = cy * cz * scale
  const m01 = cy * sz * scale
  const m02 = -sy * scale

  const m10 = (sx * sy * cz - cx * sz) * scale
  const m11 = (sx * sy * sz + cx * cz) * scale
  const m12 = sx * cy * scale

  const m20 = (cx * sy * cz + sx * sz) * scale
  const m21 = (cx * sy * sz - sx * cz) * scale
  const m22 = cx * cy * scale

  return new Float32Array([
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    tx, ty, tz - camZ, 1,
  ])
}

function mat3NormalFromMat4(m: Float32Array): Float32Array {
  const s = Math.hypot(m[0], m[1], m[2]) || 1
  return new Float32Array([
    m[0] / s, m[1] / s, m[2] / s,
    m[4] / s, m[5] / s, m[6] / s,
    m[8] / s, m[9] / s, m[10] / s,
  ])
}

const COMMON_VERT = `#version 300 es
in vec3 aPos;
in vec3 aNorm;
in vec2 aUv;
uniform mat4 uProj;
uniform mat4 uMV;
uniform mat3 uNormMat;
out vec2 vUv;
out vec2 vP;
out vec3 vN;
out vec3 vV;
out float vTop;
void main() {
  vUv = aUv;
  vP = aPos.xy;
  vec4 mv = uMV * vec4(aPos, 1.0);
  vN = normalize(uNormMat * aNorm);
  vV = mv.xyz;
  vTop = aNorm.z;
  gl_Position = uProj * mv;
}
`

const SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 vP;
uniform vec2 uHalf;
uniform float uRadius;
uniform float uSoft;
uniform float uOpacity;
out vec4 outColor;
float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float d = sdRoundRect(vP, uHalf, uRadius);
  float a = (1.0 - smoothstep(-uSoft, uSoft, d)) * uOpacity;
  outColor = vec4(vec3(0.0, 0.0, 0.0) * a, a);
}
`

const CARD_FOIL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vP;
in vec3 vN;
in vec3 vV;
in float vTop;
uniform sampler2D uMap;
uniform vec2 uHalf;
uniform float uRadius;
uniform vec3 uLight;
uniform float uTime;
uniform float uOpacity;
out vec4 outColor;
float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 kinpakuFoil(float x) {
  float w = 0.5 + 0.5 * cos(6.2831853 * x);
  float w2 = 0.5 + 0.5 * sin(6.2831853 * x * 0.72 + 0.9);
  vec3 gold = vec3(0.96, 0.77, 0.26);
  vec3 bronze = vec3(0.76, 0.54, 0.16);
  vec3 ivory = vec3(0.98, 0.95, 0.87);
  vec3 lacquer = vec3(0.85, 0.28, 0.16);
  vec3 base = mix(bronze, gold, w);
  base = mix(base, ivory, pow(w2, 2.2) * 0.52);
  return mix(base, lacquer, smoothstep(0.78, 1.0, 1.0 - w) * 0.18);
}
void main() {
  float d = sdRoundRect(vP, uHalf, uRadius);
  float aa = max(fwidth(d), 1e-4);
  float cover = 1.0 - smoothstep(-aa, aa, d);
  if (cover <= 0.001) discard;

  vec4 c = texture(uMap, vUv);
  float alpha = c.a * cover * uOpacity;
  if (alpha < 0.01) discard;

  float top = smoothstep(0.45, 0.95, vTop);
  vec3 N = normalize(vN);
  vec3 V = normalize(-vV);
  vec3 R = reflect(-V, N);
  vec3 L = normalize(uLight);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(R, L), 0.0), 28.0);
  float sheenBand = pow(max(dot(R, L), 0.0), 4.5);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
  float bevelEdge = 1.0 - top;

  vec3 foil = kinpakuFoil(
    dot(R.xy, vec2(1.25, 0.85)) * 0.65 +
    dot(vP, vec2(0.5, 0.32)) +
    uTime * 0.045
  );

  vec3 col = c.rgb * (0.91 + 0.09 * diff);
  col += foil * (sheenBand * 0.1 + fresnel * 0.2 + bevelEdge * 0.36);
  col += vec3(1.0, 0.98, 0.92) * (spec * 0.26 * top);

  outColor = vec4(col * alpha, alpha);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s
  gl.deleteShader(s)
  return null
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc)
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }
  const p = gl.createProgram()
  if (!p) return null
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p
  gl.deleteProgram(p)
  return null
}

interface GlMesh {
  vao: WebGLVertexArrayObject
  posBuf: WebGLBuffer
  normBuf: WebGLBuffer
  uvBuf: WebGLBuffer
  idxBuf: WebGLBuffer
  count: number
}

function uploadMesh(gl: WebGL2RenderingContext, prog: WebGLProgram, m: MeshBuffers): GlMesh | null {
  const vao = gl.createVertexArray()
  const posBuf = gl.createBuffer()
  const normBuf = gl.createBuffer()
  const uvBuf = gl.createBuffer()
  const idxBuf = gl.createBuffer()
  if (!vao || !posBuf || !normBuf || !uvBuf || !idxBuf) return null

  gl.bindVertexArray(vao)

  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
  gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW)
  if (aPos >= 0) {
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0)
  }

  const aNorm = gl.getAttribLocation(prog, 'aNorm')
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
  gl.bufferData(gl.ARRAY_BUFFER, m.norm, gl.STATIC_DRAW)
  if (aNorm >= 0) {
    gl.enableVertexAttribArray(aNorm)
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0)
  }

  const aUv = gl.getAttribLocation(prog, 'aUv')
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
  gl.bufferData(gl.ARRAY_BUFFER, m.uv, gl.STATIC_DRAW)
  if (aUv >= 0) {
    gl.enableVertexAttribArray(aUv)
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0)
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW)
  gl.bindVertexArray(null)

  return { vao, posBuf, normBuf, uvBuf, idxBuf, count: m.idx.length }
}

function deleteMesh(gl: WebGL2RenderingContext, m: GlMesh | null) {
  if (!m) return
  gl.deleteVertexArray(m.vao)
  gl.deleteBuffer(m.posBuf)
  gl.deleteBuffer(m.normBuf)
  gl.deleteBuffer(m.uvBuf)
  gl.deleteBuffer(m.idxBuf)
}

interface CardInstance {
  url: string
  w: number
  h: number
  tex: WebGLTexture
  mesh: GlMesh
  seed: number
}

function createImageTexture(gl: WebGL2RenderingContext, img: HTMLImageElement): WebGLTexture | null {
  const tex = gl.createTexture()
  if (!tex) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.generateMipmap(gl.TEXTURE_2D)
  return tex
}

export function GlowCard3D({
  imageUrl,
  alt,
  direction = 1,
  shadowOpacity = 0.52,
  className,
}: GlowCard3DProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [fallbackTilt, setFallbackTilt] = useState({ rx: 0, ry: 0 })
  const showFallback = webglFailed || failedUrl === imageUrl
  const dirRef = useRef(direction)
  const shadowOpacityRef = useRef(shadowOpacity)

  useEffect(() => {
    dirRef.current = direction
  }, [direction])

  useEffect(() => {
    shadowOpacityRef.current = shadowOpacity
  }, [shadowOpacity])

  const loadImageRef = useRef<((src: string, dir: 1 | -1) => void) | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    })
    if (!gl) {
      setWebglFailed(true)
      return
    }

    const progShadow = linkProgram(gl, COMMON_VERT, SHADOW_FRAG)
    const progCard = linkProgram(gl, COMMON_VERT, CARD_FOIL_FRAG)
    if (!progShadow || !progCard) {
      setWebglFailed(true)
      return
    }

    const shadowMesh = uploadMesh(gl, progShadow, buildPlaneMesh(2.9, 3.3, 1, 1))
    if (!shadowMesh) {
      setWebglFailed(true)
      return
    }

    const uShadow = {
      uProj: gl.getUniformLocation(progShadow, 'uProj'),
      uMV: gl.getUniformLocation(progShadow, 'uMV'),
      uNormMat: gl.getUniformLocation(progShadow, 'uNormMat'),
      uHalf: gl.getUniformLocation(progShadow, 'uHalf'),
      uRadius: gl.getUniformLocation(progShadow, 'uRadius'),
      uSoft: gl.getUniformLocation(progShadow, 'uSoft'),
      uOpacity: gl.getUniformLocation(progShadow, 'uOpacity'),
    }

    const uCard = {
      uProj: gl.getUniformLocation(progCard, 'uProj'),
      uMV: gl.getUniformLocation(progCard, 'uMV'),
      uNormMat: gl.getUniformLocation(progCard, 'uNormMat'),
      uHalf: gl.getUniformLocation(progCard, 'uHalf'),
      uRadius: gl.getUniformLocation(progCard, 'uRadius'),
      uLight: gl.getUniformLocation(progCard, 'uLight'),
      uTime: gl.getUniformLocation(progCard, 'uTime'),
      uMap: gl.getUniformLocation(progCard, 'uMap'),
      uOpacity: gl.getUniformLocation(progCard, 'uOpacity'),
    }

    let disposed = false
    let loadSeq = 0
    let seedCounter = 0
    let clock = 0
    let currentCard: CardInstance | null = null
    let transition: {
      from: CardInstance
      to: CardInstance
      start: number
      dur: number
      dir: number
    } | null = null

    const disposeCard = (c: CardInstance | null) => {
      if (!c) return
      gl.deleteTexture(c.tex)
      deleteMesh(gl, c.mesh)
    }

    let projMat = mat4Perspective((30 * Math.PI) / 180, 1, 0.1, 30)
    let camZ = 4.15

    const updateCamZ = () => {
      const w = Math.max(1, stage.clientWidth)
      const h = Math.max(1, stage.clientHeight)
      const aspect = w / h
      const tanHalf = Math.tan((15 * Math.PI) / 180)
      const activeW = currentCard?.w ?? CARD_HEIGHT * (2 / 3)
      const fitZ = (0.5 * activeW * 1.48) / (tanHalf * aspect)
      const fitH = (0.5 * CARD_HEIGHT * 1.24) / tanHalf
      camZ = Math.max(fitH, fitZ)
    }

    const reduced = prefersReducedMotionNow()
    const motionAmp = reduced ? 0 : 1
    let raf = 0
    let lastNow = 0
    let scheduleFrame: () => void = () => {}

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, stage.clientWidth)
      const h = Math.max(1, stage.clientHeight)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const aspect = w / h
      projMat = mat4Perspective((30 * Math.PI) / 180, aspect, 0.1, 30)
      updateCamZ()
      scheduleFrame()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    resize()

    loadImageRef.current = (src: string, dir: 1 | -1) => {
      if (currentCard?.url === src && !transition) {
        setFailedUrl((prev) => (prev === src ? null : prev))
        return
      }
      const token = ++loadSeq
      void loadCrossOriginImage(src)
        .then((img) => {
          if (disposed || token !== loadSeq) return
          setFailedUrl(null)
          const natW = img.naturalWidth || 360
          const natH = img.naturalHeight || 540
          const cardH = CARD_HEIGHT
          const cardW = cardH * (natW / Math.max(1, natH))
          const tex = createImageTexture(gl, img)
          const mesh = uploadMesh(gl, progCard, buildBeveledCardMesh(cardW, cardH, CARD_RADIUS))
          if (!tex || !mesh) {
            if (tex) gl.deleteTexture(tex)
            deleteMesh(gl, mesh)
            return
          }

          seedCounter += 1.7
          const nextCard: CardInstance = {
            url: src,
            w: cardW,
            h: cardH,
            tex,
            mesh,
            seed: seedCounter,
          }

          if (reduced) {
            if (transition) {
              disposeCard(transition.from)
              disposeCard(transition.to)
              transition = null
            } else {
              disposeCard(currentCard)
            }
            currentCard = nextCard
          } else if (transition) {
            // 如果上一次转场尚未结束，立即释放更早的旧卡，衔接新一轮插入转场
            disposeCard(transition.from)
            const prevTo = transition.to
            transition = {
              from: prevTo,
              to: nextCard,
              start: clock,
              dur: TRANSITION_DUR,
              dir,
            }
            currentCard = nextCard
          } else if (currentCard) {
            transition = {
              from: currentCard,
              to: nextCard,
              start: clock,
              dur: TRANSITION_DUR,
              dir,
            }
            currentCard = nextCard
          } else {
            currentCard = nextCard
          }
          updateCamZ()
          scheduleFrame()
        })
        .catch(() => {
          if (!disposed && token === loadSeq) {
            setFailedUrl(src)
          }
        })
    }

    loadImageRef.current(imageUrl, dirRef.current)

    const pointer = { x: 0, y: 0, over: false }
    const smoothTilt = { x: 0, y: 0, z: 0 }
    const targetTilt = { x: 0, y: 0, z: 0 }
    const drag = {
      active: false,
      pointerId: null as number | null,
      lastX: 0,
      lastY: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 0,
      movedAt: 0,
    }

    const onMove = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
      pointer.y = 1 - ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2
      pointer.over = true
      if (drag.active && drag.pointerId === e.pointerId) {
        const dx = e.clientX - drag.lastX
        const dy = e.clientY - drag.lastY
        drag.lastX = e.clientX
        drag.lastY = e.clientY
        drag.y = clamp(drag.y + dx * 0.009, -0.62, 0.62)
        drag.x = clamp(drag.x - dy * 0.009, -0.4, 0.4)
        drag.fx = -dy * 0.009 * 55
        drag.fy = dx * 0.009 * 55
        drag.movedAt = performance.now()
      }
      scheduleFrame()
    }
    const onLeave = () => {
      pointer.over = false
      scheduleFrame()
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (drag.active) return
      drag.active = true
      drag.pointerId = e.pointerId
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      drag.fx = 0
      drag.fy = 0
      stage.setPointerCapture(e.pointerId)
      scheduleFrame()
    }
    const onUp = (e: PointerEvent) => {
      if (!drag.active || (drag.pointerId !== null && drag.pointerId !== e.pointerId)) return
      drag.active = false
      drag.pointerId = null
      const stale = performance.now() - drag.movedAt > 90
      drag.vx = stale ? 0 : drag.fx
      drag.vy = stale ? 0 : drag.fy
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
      scheduleFrame()
    }

    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerleave', onLeave)
    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    stage.addEventListener('lostpointercapture', onUp)

    const idlePose = (t: number, seed: number) => ({
      x: 0,
      y: 0.04 + 0.028 * Math.sin(1.15 * t + seed) * motionAmp,
      z: 0,
      rx: 0.06 * Math.sin(0.75 * t + 1.4 * seed) * motionAmp,
      ry: (0.15 * Math.sin(0.92 * t + seed) + 0.03 * Math.sin(2.3 * t + 3.1 * seed)) * motionAmp,
      rz: 0.018 * Math.sin(0.55 * t + 0.7 * seed) * motionAmp,
      s: 1,
      opacity: 1,
    })

    const drawCard = (card: CardInstance, pose: ReturnType<typeof idlePose>) => {
      const rx = softClamp(pose.rx + smoothTilt.x + drag.x, 0.5)
      const ry = softClamp(pose.ry + smoothTilt.y + drag.y, 0.7)
      const rz = pose.rz + smoothTilt.z

      // 1. 深邃立体悬空投射阴影（位置拉低且更柔和，营造强悬浮感）
      gl.useProgram(progShadow)
      gl.uniformMatrix4fv(uShadow.uProj, false, projMat)
      const shMV = mat4ModelView(
        pose.x + 0.14 - 0.34 * ry,
        pose.y - 0.18,
        pose.z - 0.68,
        rx * 0.38,
        ry * 0.38,
        rz * 0.38,
        pose.s * 1.04,
        camZ
      )
      gl.uniformMatrix4fv(uShadow.uMV, false, shMV)
      gl.uniformMatrix3fv(uShadow.uNormMat, false, mat3NormalFromMat4(shMV))
      gl.uniform2f(uShadow.uHalf, card.w * 0.5, card.h * 0.5)
      gl.uniform1f(uShadow.uRadius, CARD_RADIUS)
      gl.uniform1f(uShadow.uSoft, 0.24)
      gl.uniform1f(uShadow.uOpacity, shadowOpacityRef.current * pose.opacity)
      gl.bindVertexArray(shadowMesh.vao)
      gl.drawElements(gl.TRIANGLES, shadowMesh.count, gl.UNSIGNED_SHORT, 0)

      // 2. 整张服装 3D 倒角全息卡牌
      gl.useProgram(progCard)
      gl.uniformMatrix4fv(uCard.uProj, false, projMat)
      const cardMV = mat4ModelView(pose.x, pose.y, pose.z, rx, ry, rz, pose.s, camZ)
      gl.uniformMatrix4fv(uCard.uMV, false, cardMV)
      gl.uniformMatrix3fv(uCard.uNormMat, false, mat3NormalFromMat4(cardMV))
      gl.uniform2f(uCard.uHalf, card.w * 0.5, card.h * 0.5)
      gl.uniform1f(uCard.uRadius, CARD_RADIUS)
      gl.uniform3f(uCard.uLight, -0.45, 0.6, 0.66)
      gl.uniform1f(uCard.uTime, clock)
      gl.uniform1f(uCard.uOpacity, pose.opacity)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, card.tex)
      gl.uniform1i(uCard.uMap, 0)
      gl.bindVertexArray(card.mesh.vao)
      gl.drawElements(gl.TRIANGLES, card.mesh.count, gl.UNSIGNED_SHORT, 0)
    }

    const tick = (now: number) => {
      raf = 0
      const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 1 / 60
      lastNow = now
      if (!reduced) {
        clock += dt
      }

      const hovering = pointer.over && !drag.active
      const px = hovering ? pointer.x : 0
      const py = hovering ? pointer.y : 0

      targetTilt.y = motionAmp * (0.14 * Math.sin(0.55 * clock) + 0.06 * Math.sin(0.24 * clock + 1.1)) - 0.52 * px
      targetTilt.x = motionAmp * Math.sin(0.41 * clock + 0.6) * 0.08 + 0.32 * py
      targetTilt.z = motionAmp * Math.sin(0.31 * clock) * 0.025

      const follow = 1 - Math.exp(-4.5 * dt)
      smoothTilt.x += (targetTilt.x - smoothTilt.x) * follow
      smoothTilt.y += (targetTilt.y - smoothTilt.y) * follow
      smoothTilt.z += (targetTilt.z - smoothTilt.z) * follow

      if (!drag.active) {
        drag.vx += (-18 * drag.x - 5 * drag.vx) * dt
        drag.vy += (-18 * drag.y - 5 * drag.vy) * dt
        drag.x += drag.vx * dt
        drag.y += drag.vy * dt
      }

      if (transition && clock - transition.start >= transition.dur) {
        disposeCard(transition.from)
        transition = null
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

      if (transition) {
        const u = clamp01((clock - transition.start) / transition.dur)
        const dir = transition.dir

        // 旧卡后退缩回淡出
        const pf = idlePose(clock, transition.from.seed)
        pf.x += evalKeys(u, [[0, 0], [0.5, -0.62 * dir], [1, -0.18 * dir]])
        pf.y += evalKeys(u, [[0, 0], [0.45, -0.22], [1, -0.08]])
        pf.z += evalKeys(u, [[0, 0], [0.45, -0.55], [1, -0.95, easeInCubic]])
        pf.s *= evalKeys(u, [[0, 1], [1, 0.62, easeInCubic]])
        pf.rz += evalKeys(u, [[0, 0], [0.5, 0.2 * dir], [1, 0.08 * dir]])
        pf.ry += evalKeys(u, [[0, 0], [0.5, 0.32 * dir], [1, 0]])
        pf.opacity = evalKeys(u, [[0, 1], [0.55, 0.72], [1, 0, easeInCubic]])
        drawCard(transition.from, pf)

        // 新卡从另一侧弧线插入并带弹簧回弹
        const pt = idlePose(clock, transition.to.seed)
        pt.x += evalKeys(u, [[0, 0.18 * dir], [0.42, 0.68 * dir, easeOutCubic], [1, 0, easeInOutCubic]])
        pt.y += evalKeys(u, [[0, -0.08], [0.42, 0.12], [1, 0]])
        pt.z += evalKeys(u, [[0, -0.62], [0.25, -0.35, easeOutCubic], [0.52, 0.28], [1, 0]])
        pt.s *= evalKeys(u, [[0, 0.62], [0.42, 0.9, easeOutCubic], [1, 1, easeOutCubic]])
        pt.rz += evalKeys(u, [[0, -0.22 * dir], [0.42, 0.09 * dir], [1, 0, easeSpringOut]])
        pt.ry += evalKeys(u, [[0, -0.28 * dir], [0.42, 0.2 * dir], [1, 0, easeSpringOut]])
        pt.opacity = evalKeys(u, [[0, 0.2], [0.35, 1, easeOutCubic], [1, 1]])
        drawCard(transition.to, pt)
      } else if (currentCard) {
        drawCard(currentCard, idlePose(clock, currentCard.seed))
      }

      const needsMoreFrames =
        !reduced ||
        Boolean(transition) ||
        drag.active ||
        Math.abs(targetTilt.x - smoothTilt.x) > 0.001 ||
        Math.abs(targetTilt.y - smoothTilt.y) > 0.001 ||
        Math.abs(drag.x) > 0.001 ||
        Math.abs(drag.y) > 0.001 ||
        Math.abs(drag.vx) > 0.002 ||
        Math.abs(drag.vy) > 0.002

      if (!disposed && document.visibilityState !== 'hidden' && needsMoreFrames) {
        raf = requestAnimationFrame(tick)
      } else {
        lastNow = 0
      }
    }

    scheduleFrame = () => {
      if (!disposed && !raf && document.visibilityState !== 'hidden') {
        lastNow = 0
        raf = requestAnimationFrame(tick)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      } else {
        scheduleFrame()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    scheduleFrame()

    return () => {
      disposed = true
      loadImageRef.current = null
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      ro.disconnect()
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerleave', onLeave)
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('lostpointercapture', onUp)
      if (transition) {
        disposeCard(transition.from)
        disposeCard(transition.to)
      } else {
        disposeCard(currentCard)
      }
      deleteMesh(gl, shadowMesh)
      gl.deleteProgram(progShadow)
      gl.deleteProgram(progCard)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadImageRef.current?.(imageUrl, dirRef.current)
  }, [imageUrl])

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative h-[280px] w-full cursor-grab select-none active:cursor-grabbing sm:h-[460px] md:h-[520px]',
        className
      )}
      onPointerMove={(e) => {
        if (!showFallback) return
        const r = e.currentTarget.getBoundingClientRect()
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2
        setFallbackTilt({ rx: -ny * 14, ry: nx * 18 })
      }}
      onPointerLeave={() => {
        if (showFallback) setFallbackTilt({ rx: 0, ry: 0 })
      }}
    >
      {!webglFailed && (
        <canvas
          ref={canvasRef}
          aria-label={alt}
          className={cn('block size-full touch-none', showFallback && 'pointer-events-none opacity-0')}
        />
      )}
      {showFallback && (
        <div className="absolute inset-0 flex size-full items-center justify-center p-4">
          <div
            style={{
              transform: `perspective(950px) rotateX(${fallbackTilt.rx}deg) rotateY(${fallbackTilt.ry}deg)`,
            }}
            className="md-media-ring relative max-h-[260px] overflow-hidden rounded-[22px] shadow-[0_28px_54px_rgba(0,0,0,0.72)] transition-transform duration-150 ease-out sm:max-h-[460px]"
          >
            <img
              src={imageUrl}
              alt={alt}
              className="block max-h-[260px] w-auto max-w-full object-contain sm:max-h-[460px]"
            />
          </div>
        </div>
      )}
    </div>
  )
}
