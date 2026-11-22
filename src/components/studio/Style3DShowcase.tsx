import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useReducedMotion } from 'motion/react'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react'
import type { VisualStyleItem } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'

interface OrbitCarouselProps {
  items: VisualStyleItem[]
  value: string
  onSelect: (key: string) => void
  onHoverChange?: (key: string | null) => void
}

const TARGET_CENTER_PITCH_PX = 96
const MIN_WINDOWED_ARC_RAD = Math.PI * 1.04
const CYLINDER_CAMERA_RATIO = 3.25

function computeCylinderMetrics(stageWidth: number) {
  const radius = Math.max(128, Math.min(290, stageWidth * 0.42))
  const perspectivePx = radius * CYLINDER_CAMERA_RATIO
  // 真实正圆柱的透视地平线角 cos(θ_horizon) = R / P：该处切面与视线共线（成一条竖线），同时也是屏幕投影 X 最大外缘，任何外侧都不应再有卡牌
  const horizonAngle = Math.acos(1 / CYLINDER_CAMERA_RATIO)
  const frontFactor = CYLINDER_CAMERA_RATIO / (CYLINDER_CAMERA_RATIO - 1)
  const projectedHalfSpan =
    (radius * CYLINDER_CAMERA_RATIO) /
    Math.sqrt(CYLINDER_CAMERA_RATIO * CYLINDER_CAMERA_RATIO - 1)
  return { radius, perspectivePx, horizonAngle, frontFactor, projectedHalfSpan }
}

function wrapIndexDelta(delta: number, total: number): number {
  if (total <= 0) return 0
  return ((((delta + total / 2) % total) + total) % total) - total / 2
}

/**
 * 工作台左侧内嵌的单一无限 3D 圆柱转盘（方案 2 · 真圆正切透视版）：
 * 采用 rx = rz 真圆半径与 1:1 几何切线 rotateY，并锁定 cos(θ_horizon) = R / P 极限边界，
 * 确保两侧卡牌随旋转渐收至“垂直一线”边缘即止，竖线外侧绝不再溢出错位卡牌；
 * 底部铭牌实时显示居中或悬停画风完整全名。
 */
export function StyleOrbitCarousel({
  items,
  value,
  onSelect,
  onHoverChange,
}: OrbitCarouselProps) {
  const prefersReducedMotion = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const shadeRefs = useRef<Array<HTMLSpanElement | null>>([])
  const [stageWidth, setStageWidth] = useState(580)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loadedPreviews, setLoadedPreviews] = useState<Record<string, true>>({})

  const count = items.length
  const initialCenterIdx = Math.max(0, items.findIndex((it) => it.key === value))
  const [centerIdx, setCenterIdx] = useState(initialCenterIdx)
  const [prevValue, setPrevValue] = useState(value)
  const [snappingKey, setSnappingKey] = useState<string | null>(null)

  const scrollIdxRef = useRef(initialCenterIdx)
  const centerIdxRef = useRef(initialCenterIdx)
  const velocityRef = useRef(0)
  const snapTargetRef = useRef<number | null>(null)
  const isSnappingRef = useRef(false)
  const draggingRef = useRef(false)
  const dragMovedRef = useRef(false)
  const lastPointerXRef = useRef(0)
  const pointerDownXRef = useRef(0)
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null)
  const suppressHoverUntilMoveRef = useRef(false)
  const lastSnappedValueRef = useRef<string | null>(null)
  const hasInitializedRef = useRef(false)
  const ensureRafRef = useRef<(() => void) | null>(null)

  if (value !== prevValue) {
    setPrevValue(value)
    setHoveredKey(null)
    if (count > 0) {
      const nextIdx = items.findIndex((it) => it.key === value)
      if (nextIdx >= 0) {
        if (prefersReducedMotion) {
          if (nextIdx !== centerIdx) setCenterIdx(nextIdx)
          setSnappingKey(null)
        } else {
          setSnappingKey(value)
        }
      } else {
        setSnappingKey(null)
      }
    }
  }

  useEffect(() => {
    onHoverChange?.(hoveredKey)
    ensureRafRef.current?.()
  }, [hoveredKey, onHoverChange])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setStageWidth(w)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (count === 0) return
    const firstRun = !hasInitializedRef.current
    hasInitializedRef.current = true
    const idx = items.findIndex((it) => it.key === value)
    if (idx < 0) {
      lastSnappedValueRef.current = null
      return
    }
    if (lastSnappedValueRef.current === value) return

    lastSnappedValueRef.current = value
    velocityRef.current = 0

    if (firstRun || prefersReducedMotion) {
      scrollIdxRef.current = idx
      snapTargetRef.current = null
      isSnappingRef.current = false
    } else {
      const delta = wrapIndexDelta(idx - scrollIdxRef.current, count)
      snapTargetRef.current = scrollIdxRef.current + delta
      isSnappingRef.current = true
      suppressHoverUntilMoveRef.current = true
    }
    ensureRafRef.current?.()
  }, [value, items, count, prefersReducedMotion])

  const lastZMapRef = useRef<number[]>([])
  const lastVisibleMapRef = useRef<boolean[]>([])

  const projectCards = useCallback(() => {
    if (count === 0) return
    const { radius, horizonAngle, frontFactor } = computeCylinderMetrics(stageWidth)
    const baseStepRad = Math.asin(Math.min(0.48, TARGET_CENTER_PITCH_PX / (radius * frontFactor)))
    const spanRad = count * baseStepRad
    const windowed = spanRad >= MIN_WINDOWED_ARC_RAD
    const stepRad = windowed ? baseStepRad : (Math.PI * 2) / count
    const fadeEndAngle = windowed ? Math.min(horizonAngle, spanRad * 0.49) : horizonAngle
    const fadeStartAngle = Math.max(0.95, fadeEndAngle - 0.08)
    const basePos = scrollIdxRef.current
    const zCache = lastZMapRef.current
    const visCache = lastVisibleMapRef.current

    for (let i = 0; i < count; i++) {
      const card = cardRefs.current[i]
      if (!card) continue

      const deltaIdx = wrapIndexDelta(i - basePos, count)
      const angle = deltaIdx * stepRad
      const absAngle = Math.abs(angle)

      // 超过透视切线极限角（竖线位置之后）直接收隐，杜绝外侧多出或翻背卡牌
      let edgeFade = 1
      if (absAngle >= fadeEndAngle) {
        edgeFade = 0
      } else if (absAngle > fadeStartAngle) {
        edgeFade = Math.max(
          0,
          1 - (absAngle - fadeStartAngle) / Math.max(0.01, fadeEndAngle - fadeStartAngle)
        )
      }

      if (edgeFade <= 0.01) {
        if (visCache[i] !== false) {
          visCache[i] = false
          card.style.opacity = '0'
          card.style.pointerEvents = 'none'
          card.style.visibility = 'hidden'
        }
        continue
      }

      if (visCache[i] !== true) {
        visCache[i] = true
        card.style.pointerEvents = 'auto'
        card.style.visibility = 'visible'
      }

      const sinA = Math.sin(angle)
      const cosA = Math.cos(angle)
      const depth = Math.max(0, cosA)
      const isCardHovered = card.dataset.hovered === 'true'

      const x = sinA * radius
      const y = (1 - cosA) * -12 + 1
      const z = cosA * radius + (isCardHovered ? 10 : 0)
      const rotY = (angle * 180) / Math.PI
      const scale = 0.78 + depth * 0.06 + (isCardHovered ? 0.05 : 0)
      const opacity = (0.64 + Math.pow(depth, 0.85) * 0.36) * edgeFade
      const nextZ = 10 + Math.round(depth * 90) + (isCardHovered ? 35 : 0)

      card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(1)}deg) scale(${scale.toFixed(3)})`
      card.style.opacity = opacity.toFixed(2)
      if (zCache[i] !== nextZ) {
        zCache[i] = nextZ
        card.style.zIndex = String(nextZ)
      }

      // 越接近外侧竖线切缘，侧面受光衰减越明显
      const shadeEl = shadeRefs.current[i]
      if (shadeEl) {
        const sideShade = isCardHovered ? 0 : Math.min(0.56, (1 - depth) * 0.62)
        shadeEl.style.opacity = sideShade.toFixed(2)
      }
    }
  }, [count, stageWidth])

  useEffect(() => {
    if (count === 0) {
      ensureRafRef.current = null
      return
    }
    const stage = stageRef.current
    let rafId = 0
    let lastTime = performance.now()
    let inView = true

    const stopLoop = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const syncCenterIdx = () => {
      const raw = Math.round(scrollIdxRef.current)
      const next = ((raw % count) + count) % count
      if (centerIdxRef.current !== next) {
        centerIdxRef.current = next
        setCenterIdx(next)
      }
    }

    const tick = (now: number) => {
      rafId = 0
      if (!inView || document.visibilityState === 'hidden') return

      const dt = Math.min(48, now - lastTime)
      lastTime = now
      let needsMore = draggingRef.current

      if (!draggingRef.current) {
        if (snapTargetRef.current !== null) {
          const diff = snapTargetRef.current - scrollIdxRef.current
          if (Math.abs(diff) < 0.006) {
            scrollIdxRef.current = ((snapTargetRef.current % count) + count) % count
            snapTargetRef.current = null
            isSnappingRef.current = false
            setSnappingKey(null)
          } else {
            scrollIdxRef.current += diff * Math.min(1, dt * 0.012)
            needsMore = true
          }
        } else if (Math.abs(velocityRef.current) > 0.014) {
          scrollIdxRef.current += velocityRef.current * (dt / 16)
          velocityRef.current *= Math.pow(0.92, dt / 16)
          if (Math.abs(velocityRef.current) <= 0.014) {
            velocityRef.current = 0
            if (count > 1) {
              snapTargetRef.current = Math.round(scrollIdxRef.current)
              isSnappingRef.current = true
              needsMore = true
            }
          } else {
            needsMore = true
          }
        } else if (velocityRef.current !== 0) {
          velocityRef.current = 0
          if (count > 1) {
            snapTargetRef.current = Math.round(scrollIdxRef.current)
            isSnappingRef.current = true
            needsMore = true
          }
        }
      }

      syncCenterIdx()
      projectCards()
      if (needsMore) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    const ensureLoop = () => {
      if (!inView || document.visibilityState === 'hidden') return
      syncCenterIdx()
      projectCards()
      if (
        !rafId &&
        (draggingRef.current ||
          snapTargetRef.current !== null ||
          Math.abs(velocityRef.current) > 0.001)
      ) {
        lastTime = performance.now()
        rafId = window.requestAnimationFrame(tick)
      }
    }

    ensureRafRef.current = ensureLoop

    const obs =
      typeof IntersectionObserver !== 'undefined' && stage
        ? new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting)
            if (!inView) stopLoop()
            else ensureLoop()
          })
        : null
    if (obs && stage) obs.observe(stage)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopLoop()
      else ensureLoop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    lastVisibleMapRef.current = []
    lastZMapRef.current = []
    projectCards()

    return () => {
      ensureRafRef.current = null
      stopLoop()
      obs?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [count, projectCards])

  const stepOrbit = (dir: -1 | 1) => {
    if (count <= 1) return
    velocityRef.current = 0
    lastSnappedValueRef.current = null
    suppressHoverUntilMoveRef.current = true
    setHoveredKey(null)
    setSnappingKey(null)
    const anchor =
      snapTargetRef.current !== null
        ? Math.round(snapTargetRef.current)
        : Math.round(scrollIdxRef.current)
    const next = anchor + dir
    if (prefersReducedMotion) {
      const wrapped = ((next % count) + count) % count
      scrollIdxRef.current = wrapped
      centerIdxRef.current = wrapped
      setCenterIdx(wrapped)
      snapTargetRef.current = null
      isSnappingRef.current = false
    } else {
      snapTargetRef.current = next
      isSnappingRef.current = true
    }
    ensureRafRef.current?.()
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || count <= 1) return
    draggingRef.current = true
    dragMovedRef.current = false
    setIsDragging(true)
    snapTargetRef.current = null
    isSnappingRef.current = false
    setSnappingKey(null)
    velocityRef.current = 0
    pointerDownXRef.current = e.clientX
    lastPointerXRef.current = e.clientX
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY }
    suppressHoverUntilMoveRef.current = true
    setHoveredKey(null)
    ensureRafRef.current?.()
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) {
      lastSnappedValueRef.current = null
      const totalDx = Math.abs(e.clientX - pointerDownXRef.current)
      if (totalDx > 5) {
        dragMovedRef.current = true
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // ignore unsupported pointer capture
          }
        }
      }
      const dx = e.clientX - lastPointerXRef.current
      lastPointerXRef.current = e.clientX
      const deltaIdx = -dx / TARGET_CENTER_PITCH_PX
      scrollIdxRef.current += deltaIdx
      velocityRef.current = Math.max(-0.9, Math.min(0.9, deltaIdx * 0.9))
      ensureRafRef.current?.()
      return
    }

    if (isSnappingRef.current || Math.abs(velocityRef.current) > 0.014) {
      return
    }

    const lastPos = lastPointerPosRef.current
    if (!lastPos) {
      lastPointerPosRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    const dist = Math.hypot(e.clientX - lastPos.x, e.clientY - lastPos.y)
    if (dist <= 4) return

    lastPointerPosRef.current = { x: e.clientX, y: e.clientY }
    if (suppressHoverUntilMoveRef.current) {
      suppressHoverUntilMoveRef.current = false
      const cardEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-orbit-card="true"]')
      const key = cardEl?.dataset.styleKey
      if (key) {
        setHoveredKey(key)
      }
    }
  }

  const handlePointerUp = (e?: ReactPointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    if (Math.abs(velocityRef.current) <= 0.02 && count > 1) {
      velocityRef.current = 0
      snapTargetRef.current = Math.round(scrollIdxRef.current)
      isSnappingRef.current = true
    }
    ensureRafRef.current?.()
    window.setTimeout(() => {
      dragMovedRef.current = false
    }, 60)
  }

  useEffect(() => {
    const el = stageRef.current
    if (!el || count <= 1) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 3) {
        e.preventDefault()
        snapTargetRef.current = null
        isSnappingRef.current = false
        lastSnappedValueRef.current = null
        suppressHoverUntilMoveRef.current = true
        setHoveredKey(null)
        setSnappingKey(null)
        scrollIdxRef.current += e.deltaX / TARGET_CENTER_PITCH_PX
        velocityRef.current = Math.max(-0.6, Math.min(0.6, e.deltaX * 0.01))
        ensureRafRef.current?.()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [count])

  const hoveredItem = hoveredKey ? items.find((it) => it.key === hoveredKey) ?? null : null
  const snappingItem = snappingKey ? items.find((it) => it.key === snappingKey) ?? null : null
  const centeredItem = count > 0 ? items[((centerIdx % count) + count) % count] ?? items[0] : null
  const focalItem = hoveredItem ?? snappingItem ?? centeredItem
  const focalIsSelected = Boolean(focalItem && value === focalItem.key)
  const { perspectivePx, projectedHalfSpan } = computeCylinderMetrics(stageWidth)
  const outerTrackWidthPx = Math.round(projectedHalfSpan * 2)
  const innerTrackWidthPx = Math.round(projectedHalfSpan * 1.62)

  return (
    <div
      ref={stageRef}
      data-style-orbit-carousel="true"
      aria-label="3D 纯图画风轮盘（可左右连续拖拽或点击选风）"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      onPointerLeave={() => {
        lastPointerPosRef.current = null
        setHoveredKey(null)
      }}
      className={cn(
        'relative h-[128px] w-full touch-pan-y overflow-hidden rounded-xl border border-black/15 bg-gradient-to-b from-[#1A1815] via-[#141210] to-[#0B0A09] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] select-none dark:border-white/15',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
    >
      {/* 舞台空间暖金朱红地面聚光与精确贴合圆盘外径的倾斜透视轨道环 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(66% 62% at 50% 60%, rgba(217,56,30,0.22) 0%, rgba(229,169,24,0.11) 46%, transparent 80%)',
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[54%] left-1/2 z-0 h-[166px] rounded-full border border-white/14"
        style={{
          width: `${outerTrackWidthPx}px`,
          transform: `translate(-50%, -44%) perspective(${perspectivePx.toFixed(1)}px) rotateX(78deg)`,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[54%] left-1/2 z-0 h-[130px] rounded-full border border-dashed border-white/10"
        style={{
          width: `${innerTrackWidthPx}px`,
          transform: `translate(-50%, -42%) perspective(${perspectivePx.toFixed(1)}px) rotateX(78deg)`,
        }}
      />

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="向左转动画风轮盘"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => stepOrbit(-1)}
            className="absolute top-[44%] left-1.5 z-40 flex size-6.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition-colors hover:bg-white hover:text-black"
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="向右转动画风轮盘"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => stepOrbit(1)}
            className="absolute top-[44%] right-1.5 z-40 flex size-6.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition-colors hover:bg-white hover:text-black"
          >
            <ChevronRightIcon className="size-3.5" />
          </button>
        </>
      )}

      {/* 共享相机透视空间的宽幅真 3D 圆柱轮盘舞台 */}
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-400">
          <WandSparklesIcon className="size-4 text-[#D9381E]" />
          <span>暂无预设画风</span>
        </div>
      ) : (
        <div
          className="relative z-10 h-full w-full"
          style={{
            perspective: `${perspectivePx.toFixed(1)}px`,
            perspectiveOrigin: '50% 42%',
            transformStyle: 'preserve-3d',
          }}
        >
          {items.map((item, idx) => {
            const isSelected = value === item.key
            const isHovered = hoveredKey === item.key
            return (
              <button
                key={item.key}
                ref={(el) => {
                  cardRefs.current[idx] = el
                }}
                type="button"
                data-orbit-card="true"
                data-style-key={item.key}
                data-hovered={isHovered ? 'true' : 'false'}
                aria-label={`${item.label}（${item.categoryLabel}）`}
                aria-pressed={isSelected}
                onMouseEnter={() => {
                  if (suppressHoverUntilMoveRef.current || draggingRef.current || isSnappingRef.current) {
                    return
                  }
                  setHoveredKey(item.key)
                }}
                onMouseLeave={() => setHoveredKey((k) => (k === item.key ? null : k))}
                onFocus={() => setHoveredKey(item.key)}
                onBlur={() => setHoveredKey((k) => (k === item.key ? null : k))}
                onClick={() => {
                  if (dragMovedRef.current) return
                  suppressHoverUntilMoveRef.current = true
                  setHoveredKey(null)
                  if (prefersReducedMotion) {
                    scrollIdxRef.current = idx
                    centerIdxRef.current = idx
                    setCenterIdx(idx)
                    snapTargetRef.current = null
                    isSnappingRef.current = false
                    setSnappingKey(null)
                  } else {
                    const delta = wrapIndexDelta(idx - scrollIdxRef.current, count)
                    snapTargetRef.current = scrollIdxRef.current + delta
                    isSnappingRef.current = true
                    setSnappingKey(item.key)
                  }
                  lastSnappedValueRef.current = item.key
                  velocityRef.current = 0
                  ensureRafRef.current?.()
                  onSelect(item.key)
                }}
                style={{ backfaceVisibility: 'hidden' }}
                className={cn(
                  'group/ocard absolute top-[44%] left-1/2 -mt-[39px] -ml-[31px] h-[78px] w-[62px] cursor-pointer overflow-hidden rounded-xl border text-left will-change-transform focus-visible:outline-2 focus-visible:outline-ring',
                  isSelected
                    ? 'border-[#FF7A59] ring-2 ring-[#D9381E]/90 shadow-md'
                    : isHovered
                      ? 'border-white/85 shadow-[0_10px_22px_rgba(0,0,0,0.68)]'
                      : 'border-white/35 shadow-[0_8px_16px_rgba(0,0,0,0.58)]'
                )}
              >
                {item.preview ? (
                  <>
                    {!loadedPreviews[item.preview] && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800 via-zinc-700/70 to-zinc-800"
                      />
                    )}
                    <img
                      src={item.preview}
                      alt={item.label}
                      draggable={false}
                      loading={isSelected ? 'eager' : 'lazy'}
                      decoding="async"
                      onLoad={() => {
                        const url = item.preview
                        if (!url) return
                        setLoadedPreviews((prev) =>
                          prev[url] ? prev : { ...prev, [url]: true }
                        )
                      }}
                      onError={() => {
                        const url = item.preview
                        if (!url) return
                        setLoadedPreviews((prev) =>
                          prev[url] ? prev : { ...prev, [url]: true }
                        )
                      }}
                      className={cn(
                        'relative h-full w-full object-cover object-top transition-opacity duration-200',
                        loadedPreviews[item.preview] ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-800 px-1.5 text-center text-zinc-200">
                    <SparklesIcon className="size-4 text-[#E5A918]" />
                    <span className="line-clamp-2 text-xs font-semibold leading-tight">
                      {item.shortLabel}
                    </span>
                  </div>
                )}

                {/* 立体光泽与随偏转角度自动加深的侧面明暗阴影层 */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
                />
                <span
                  ref={(el) => {
                    shadeRefs.current[idx] = el
                  }}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-black"
                  style={{ opacity: 0 }}
                />

                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-[#D9381E] text-white shadow-xs"
                  >
                    <CheckIcon className="size-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 中央底部焦点铭牌：完整展示当前居中或悬停画风全名，永不截断 */}
      {focalItem && (
        <button
          type="button"
          data-style-focal-nameplate="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect(focalItem.key)}
          title={`${focalItem.label} · ${focalItem.categoryLabel}${focalIsSelected ? '（当前已启用）' : '（点击选用风格）'}`}
          className="absolute bottom-1.5 left-1/2 z-40 inline-flex h-6 max-w-[calc(100%-32px)] -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-[#141210]/90 px-3 text-xs font-bold whitespace-nowrap text-white shadow-[0_6px_16px_rgba(0,0,0,0.58)] backdrop-blur-sm transition-colors hover:border-[#E5A918]/75 hover:bg-[#1E1A16]"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              focalIsSelected ? 'bg-[#D9381E]' : 'bg-[#E5A918]'
            )}
          />
          <span>{focalItem.label}</span>
          {focalIsSelected ? (
            <CheckIcon className="size-3 shrink-0 text-[#FF7A59]" />
          ) : (
            <span className="text-xs font-medium text-white/65">点选</span>
          )}
        </button>
      )}
    </div>
  )
}
