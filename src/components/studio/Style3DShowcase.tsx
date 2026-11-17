import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useReducedMotion } from 'motion/react'
import {
  CheckIcon,
  ChevronRightIcon,
  LayersIcon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react'
import type { VisualStyleItem } from '@/lib/stylePresets'
import { cn } from '@/lib/utils'

interface OrbitCarouselProps {
  items: VisualStyleItem[]
  value: string
  activeTitle: string
  activeBadge: string
  activePreview?: string
  isNone: boolean
  onSelect: (key: string) => void
  onOpenSphere: () => void
}

/**
 * 工作台左侧内嵌的 3D 透视卡牌轮盘：
 * 在空间透视弧面上持续循环转动；支持拖拽甩动惯性、悬浮减速放大与点击直接切换画风。
 * 采用直接操作 DOM transform + rAF 驱动，保持 60fps 顺滑且不触发 React 高频重渲染。
 */
export function StyleOrbitCarousel({
  items,
  value,
  activeTitle,
  activeBadge,
  activePreview,
  isNone,
  onSelect,
  onOpenSphere,
}: OrbitCarouselProps) {
  const prefersReducedMotion = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [stageWidth, setStageWidth] = useState(580)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // 运动物理状态全保存在 ref 中以维持零开销 60fps
  const phaseRef = useRef(0)
  const velocityRef = useRef(0)
  const snapTargetRef = useRef<number | null>(null)
  const hoveredRef = useRef(false)
  const draggingRef = useRef(false)
  const dragMovedRef = useRef(false)
  const lastPointerXRef = useRef(0)
  const pointerDownXRef = useRef(0)
  const lastSnappedValueRef = useRef<string | null>(null)

  useEffect(() => {
    hoveredRef.current = hoveredKey !== null
  }, [hoveredKey])

  const ringItems = useMemo(() => {
    if (items.length <= 18) return items
    const picked = items.slice(0, 17)
    const activeItem = items.find((it) => it.key === value)
    if (activeItem && !picked.some((it) => it.key === activeItem.key)) {
      picked[picked.length - 1] = activeItem
    }
    return picked
  }, [items, value])

  const count = ringItems.length

  // 响应容器宽度变化自适应椭圆轨道长轴
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

  // 仅在选中画风 Key 真正发生变化时，顺滑引导新选中的卡牌旋至前排焦点；避免父组件定时重渲染时反复回拉轮盘
  useEffect(() => {
    if (count === 0) return
    if (lastSnappedValueRef.current === value) return
    lastSnappedValueRef.current = value
    const idx = ringItems.findIndex((it) => it.key === value)
    if (idx < 0) return
    const itemAngle = (idx * Math.PI * 2) / count
    const rawTarget = -itemAngle
    const current = phaseRef.current
    const twoPi = Math.PI * 2
    const delta =
      ((((rawTarget - current) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI
    snapTargetRef.current = current + delta
  }, [value, ringItems, count])

  const lastZMapRef = useRef<number[]>([])

  // 核心 60fps 3D 透视坐标投影渲染循环
  useEffect(() => {
    if (count === 0) return
    let rafId = 0
    let lastTime = performance.now()
    const zCache = lastZMapRef.current

    const projectCards = () => {
      const rx = Math.max(122, Math.min(256, stageWidth * 0.415))
      const twoPi = Math.PI * 2
      const basePhase = phaseRef.current

      for (let i = 0; i < count; i++) {
        const card = cardRefs.current[i]
        if (!card) continue
        const angle = basePhase + (i * twoPi) / count
        const sinA = Math.sin(angle)
        const cosA = Math.cos(angle)
        const depth = (cosA + 1) * 0.5

        const x = sinA * rx
        const y = -cosA * 10 + 1
        const isCardHovered = card.dataset.hovered === 'true'
        const scale = 0.48 + depth * 0.56 + (isCardHovered ? 0.1 : 0)
        const rotY = -sinA * 46
        const opacity = 0.34 + Math.pow(depth, 1.35) * 0.66
        const nextZ = 10 + Math.round(depth * 80) + (isCardHovered ? 30 : 0)

        card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) perspective(660px) rotateY(${rotY.toFixed(1)}deg) scale(${scale.toFixed(3)})`
        card.style.opacity = opacity.toFixed(2)
        if (zCache[i] !== nextZ) {
          zCache[i] = nextZ
          card.style.zIndex = String(nextZ)
        }
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(48, now - lastTime)
      lastTime = now

      if (!draggingRef.current) {
        if (snapTargetRef.current !== null) {
          const diff = snapTargetRef.current - phaseRef.current
          if (Math.abs(diff) < 0.008) {
            phaseRef.current = snapTargetRef.current
            snapTargetRef.current = null
          } else {
            phaseRef.current += diff * Math.min(1, dt * 0.011)
          }
        } else if (Math.abs(velocityRef.current) > 0.00025) {
          phaseRef.current += velocityRef.current * (dt / 16)
          velocityRef.current *= Math.pow(0.93, dt / 16)
        } else if (!prefersReducedMotion) {
          const speed = hoveredRef.current ? 0.00065 : 0.0036
          phaseRef.current += speed * (dt / 16)
        }
      }

      projectCards()
      rafId = window.requestAnimationFrame(tick)
    }

    projectCards()
    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [count, stageWidth, prefersReducedMotion])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    draggingRef.current = true
    dragMovedRef.current = false
    setIsDragging(true)
    snapTargetRef.current = null
    velocityRef.current = 0
    pointerDownXRef.current = e.clientX
    lastPointerXRef.current = e.clientX
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const totalDx = Math.abs(e.clientX - pointerDownXRef.current)
    if (totalDx > 5) {
      dragMovedRef.current = true
    }
    const dx = e.clientX - lastPointerXRef.current
    lastPointerXRef.current = e.clientX
    const deltaAngle = dx * 0.0075
    phaseRef.current += deltaAngle
    velocityRef.current = deltaAngle * 0.85
  }

  const handlePointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    window.setTimeout(() => {
      dragMovedRef.current = false
    }, 60)
  }

  const hoveredItem = hoveredKey
    ? ringItems.find((it) => it.key === hoveredKey) ?? null
    : null

  return (
    <div
      ref={stageRef}
      data-style-orbit-carousel="true"
      aria-label="3D 画风卡牌轮盘（可左右拖拽或点击选风）"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        'relative h-[90px] w-full overflow-hidden rounded-xl border border-black/15 bg-gradient-to-b from-[#171A25] via-[#11131D] to-[#0A0C12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] select-none dark:border-white/15',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
    >
      {/* 舞台空间地面聚光与倾斜椭圆轨道参考环 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(62% 58% at 50% 62%, rgba(217,56,30,0.22) 0%, rgba(99,102,241,0.08) 45%, transparent 78%)',
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[54%] left-1/2 h-[140px] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12"
        style={{ transform: 'translate(-50%, -44%) perspective(520px) rotateX(77deg)' }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[54%] left-1/2 h-[112px] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10"
        style={{ transform: 'translate(-50%, -42%) perspective(520px) rotateX(77deg)' }}
      />

      {/* 3D 环绕画风卡牌轨道 */}
      {ringItems.length === 0 ? (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-400">
          <WandSparklesIcon className="size-4 text-[#D9381E]" />
          <span>暂无预设画风</span>
        </div>
      ) : (
        <div className="relative h-full w-full">
          {ringItems.map((item, idx) => {
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
                data-hovered={isHovered ? 'true' : 'false'}
                aria-label={`${item.label}（${item.categoryLabel}）`}
                aria-pressed={isSelected}
                onMouseEnter={() => setHoveredKey(item.key)}
                onMouseLeave={() => setHoveredKey((k) => (k === item.key ? null : k))}
                onFocus={() => setHoveredKey(item.key)}
                onBlur={() => setHoveredKey((k) => (k === item.key ? null : k))}
                onClick={() => {
                  if (dragMovedRef.current) return
                  onSelect(item.key)
                }}
                className={cn(
                  'group/ocard absolute top-1/2 left-1/2 -mt-[34px] -ml-[27px] h-[68px] w-[54px] cursor-pointer overflow-hidden rounded-lg border text-left will-change-transform [contain:layout_paint] focus-visible:outline-2 focus-visible:outline-ring',
                  isSelected
                    ? 'border-[#FF7A59] ring-2 ring-[#D9381E]/90 shadow-[0_0_16px_rgba(217,56,30,0.65)]'
                    : isHovered
                      ? 'border-white/75 shadow-[0_8px_18px_rgba(0,0,0,0.65)]'
                      : 'border-white/25 shadow-[0_6px_14px_rgba(0,0,0,0.55)]'
                )}
              >
                {item.preview ? (
                  <img
                    src={item.preview}
                    alt={item.label}
                    draggable={false}
                    decoding="async"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-300">
                    <SparklesIcon className="size-4" />
                  </div>
                )}

                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/22 via-transparent to-black/35"
                />

                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 via-black/65 to-transparent px-1 pt-2.5 pb-0.5 text-center text-[9px] font-bold leading-tight text-white">
                  {item.shortLabel}
                </span>

                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-[#D9381E] text-white shadow-xs"
                  >
                    <CheckIcon className="size-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 左下角：当前已选画风悬浮胶囊（无高频重采样的 backdrop-blur，提升 60fps 帧率） */}
      <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-[110] flex max-w-[54%] items-center gap-1.5 rounded-full border border-white/15 bg-[#101116]/88 py-0.5 pr-2 pl-1">
        <div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-zinc-900">
          {activePreview ? (
            <img src={activePreview} alt="" decoding="async" className="size-full object-cover object-top" />
          ) : (
            <WandSparklesIcon className="size-3 text-[#FF7A59]" />
          )}
        </div>
        <div className="min-w-0 leading-none">
          <div className="truncate text-[10.5px] font-extrabold text-white">
            {hoveredItem ? hoveredItem.label : activeTitle}
          </div>
          <div className="truncate text-[9px] font-medium text-zinc-300/85">
            {hoveredItem
              ? `点击选用 · ${hoveredItem.categoryLabel}`
              : isNone
                ? '默认直出 · 可拖拽转动'
                : activeBadge}
          </div>
        </div>
      </div>

      {/* 右下角：打开画风卡牌图鉴弹窗 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpenSphere()
        }}
        className="absolute right-1.5 bottom-1.5 z-[110] inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-[#1B1E28]/88 px-2 text-[10px] font-bold text-white transition hover:border-white/40 hover:bg-[#252A38] active:scale-95 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <LayersIcon className="size-3 text-amber-300" />
        <span>更换画风</span>
        <ChevronRightIcon className="size-3 opacity-80" />
      </button>
    </div>
  )
}
