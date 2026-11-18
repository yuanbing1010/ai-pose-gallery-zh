import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, WandSparklesIcon } from 'lucide-react'
import { toast } from '@/lib/notifications'
import { getVisualStylePresets } from '@/lib/stylePresets'
import { useStudio } from '@/store/studioStore'

const STEP_DEG = 19
const WHEEL_RADIUS = 360

function wrapDelta(deg: number, total: number): number {
  if (total <= 0) return 0
  return ((((deg + total / 2) % total) + total) % total) - total / 2
}

export function StyleWheelDeck() {
  const { platform, setStylePreset } = useStudio()
  const styles = useMemo(() => getVisualStylePresets(platform), [platform])
  const count = styles.length
  const totalSpan = Math.max(STEP_DEG, count * STEP_DEG)
  const navigate = useNavigate()

  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const ensureAnimRef = useRef<(() => void) | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [draggingUi, setDraggingUi] = useState(false)

  const stateRef = useRef({
    angle: 0,
    vel: 0,
    snapTarget: null as number | null,
    dragging: false,
    activeIdx: 0,
  })
  const dragRef = useRef<{
    id: number
    startX: number
    lastX: number
    lastTime: number
    moved: boolean
    captured: boolean
    downCardIdx: number | null
    samples: Array<{ dx: number; dt: number }>
  } | null>(null)

  const applyAndGo = (idx: number) => {
    const item = styles[idx]
    if (!item) return
    setStylePreset(item.key)
    toast.success(`已选定画风：${item.shortLabel}`)
    void navigate({ to: '/studio' })
  }

  const spinToRelativeIndex = (targetIdx: number) => {
    if (!count) return
    const st = stateRef.current
    const currentStep = Math.round(st.angle / STEP_DEG)
    const currentMod = ((currentStep % count) + count) % count
    let diff = targetIdx - currentMod
    if (diff > count / 2) diff -= count
    if (diff < -count / 2) diff += count
    st.vel = 0
    st.snapTarget = (currentStep + diff) * STEP_DEG
    ensureAnimRef.current?.()
  }

  const stepWheel = (dir: 1 | -1) => {
    const st = stateRef.current
    const base =
      st.snapTarget !== null
        ? Math.round(st.snapTarget / STEP_DEG)
        : Math.round(st.angle / STEP_DEG)
    st.vel = 0
    st.snapTarget = (base + dir) * STEP_DEG
    ensureAnimRef.current?.()
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !count) {
      ensureAnimRef.current = null
      return
    }

    let raf = 0
    let last = performance.now()
    let visible = true

    const stopRaf = () => {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }

    const renderCards = () => {
      const st = stateRef.current
      for (let i = 0; i < count; i++) {
        const el = cardRefs.current[i]
        if (!el) continue
        const theta = wrapDelta(i * STEP_DEG - st.angle, totalSpan)
        const abs = Math.abs(theta)

        if (abs > 68) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          continue
        }

        const rad = (theta * Math.PI) / 180
        const x = Math.sin(rad) * WHEEL_RADIUS
        const y = (1 - Math.cos(rad)) * WHEEL_RADIUS * 0.65
        const rotZ = theta * 0.72
        const focus = Math.max(0, 1 - abs / 36)
        const scale = 0.78 + focus * 0.28
        const opacity = abs > 48 ? Math.max(0, 1 - (abs - 48) / 20) : 1
        const z = Math.round(500 - abs * 4)

        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(4)})`
        el.style.opacity = opacity.toFixed(3)
        el.style.zIndex = String(z)
        el.style.pointerEvents = opacity > 0.15 ? 'auto' : 'none'
        el.toggleAttribute('data-center', i === st.activeIdx && abs < STEP_DEG * 0.48)
      }
    }

    const tick = (now: number) => {
      raf = 0
      if (!visible || document.visibilityState === 'hidden') return
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const st = stateRef.current
      let needsMore = st.dragging

      if (!st.dragging) {
        if (st.snapTarget !== null) {
          const diff = st.snapTarget - st.angle
          const follow = 1 - Math.exp(-10.5 * dt)
          st.angle += diff * follow
          if (Math.abs(diff) < 0.08) {
            st.angle = st.snapTarget
            st.snapTarget = null
          } else {
            needsMore = true
          }
        } else if (Math.abs(st.vel) > 16) {
          st.angle += st.vel * dt
          st.vel *= Math.exp(-3.6 * dt)
          if (Math.abs(st.vel) <= 16) {
            st.vel = 0
            st.snapTarget = Math.round(st.angle / STEP_DEG) * STEP_DEG
          }
          needsMore = true
        }
      }

      const rawIdx = Math.round(st.angle / STEP_DEG)
      const nextIdx = ((rawIdx % count) + count) % count
      if (nextIdx !== st.activeIdx) {
        st.activeIdx = nextIdx
        setActiveIndex(nextIdx)
      }

      renderCards()
      if (needsMore) {
        raf = requestAnimationFrame(tick)
      }
    }

    const ensureAnimating = () => {
      if (!visible || document.visibilityState === 'hidden') return
      const st = stateRef.current
      const rawIdx = Math.round(st.angle / STEP_DEG)
      const nextIdx = ((rawIdx % count) + count) % count
      if (nextIdx !== st.activeIdx) {
        st.activeIdx = nextIdx
        setActiveIndex(nextIdx)
      }
      renderCards()
      if (!raf && (st.dragging || st.snapTarget !== null || Math.abs(st.vel) > 16)) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    ensureAnimRef.current = ensureAnimating

    const obs = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting)
      if (!visible) stopRaf()
      else ensureAnimating()
    })
    obs.observe(stage)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopRaf()
      else ensureAnimating()
    }
    document.addEventListener('visibilitychange', onVisibility)

    renderCards()

    return () => {
      ensureAnimRef.current = null
      stopRaf()
      obs.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [count, totalSpan])

  const activeStyle = styles[activeIndex] ?? styles[0]

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-wheel-control]')) return
    const cardEl = target.closest<HTMLElement>('[data-wheel-card-idx]')
    const downCardIdx = cardEl ? Number(cardEl.dataset.wheelCardIdx) : null
    const st = stateRef.current
    st.dragging = true
    st.vel = 0
    st.snapTarget = null
    setDraggingUi(true)
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      lastTime: performance.now(),
      moved: false,
      captured: false,
      downCardIdx: downCardIdx !== null && !Number.isNaN(downCardIdx) ? downCardIdx : null,
      samples: [],
    }
    ensureAnimRef.current?.()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.id) return
    const now = performance.now()
    const totalDx = e.clientX - drag.startX
    if (!drag.moved && Math.abs(totalDx) > 5) {
      drag.moved = true
      if (!drag.captured) {
        drag.captured = true
        try {
          e.currentTarget.setPointerCapture(drag.id)
        } catch {
          // ignore synthetic capture errors
        }
      }
    }
    const dx = e.clientX - drag.lastX
    const dt = Math.max(0.004, (now - drag.lastTime) / 1000)
    drag.lastX = e.clientX
    drag.lastTime = now

    if (drag.moved) {
      const dAngle = -dx * 0.25
      stateRef.current.angle += dAngle
      drag.samples.push({ dx: dAngle, dt })
      if (drag.samples.length > 6) drag.samples.shift()
      ensureAnimRef.current?.()
    }
  }

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.id) return
    dragRef.current = null
    const st = stateRef.current
    st.dragging = false
    setDraggingUi(false)
    if (drag.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(drag.id)) {
          e.currentTarget.releasePointerCapture(drag.id)
        }
      } catch {
        // ignore
      }
    }

    if (drag.moved) {
      const sumAngle = drag.samples.reduce((acc, s) => acc + s.dx, 0)
      const sumTime = drag.samples.reduce((acc, s) => acc + s.dt, 0)
      const velocity = sumTime > 0 ? sumAngle / sumTime : 0
      if (Math.abs(velocity) > 30) {
        st.vel = Math.max(-420, Math.min(420, velocity))
      } else {
        st.snapTarget = Math.round(st.angle / STEP_DEG) * STEP_DEG
      }
      ensureAnimRef.current?.()
      return
    }

    if (drag.downCardIdx !== null) {
      if (drag.downCardIdx === st.activeIdx) {
        applyAndGo(drag.downCardIdx)
      } else {
        spinToRelativeIndex(drag.downCardIdx)
      }
    }
  }

  if (count === 0) {
    return (
      <div className="relative flex min-h-[300px] flex-col items-center justify-between overflow-hidden border-t border-border bg-muted/40 px-5 py-4 lg:border-t-0 lg:border-l dark:bg-[#121215]">
        <span aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3.5 size-3 border-t border-l border-foreground/20" />
        <span aria-hidden="true" className="pointer-events-none absolute top-3.5 right-3.5 size-3 border-t border-r border-foreground/20" />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-3.5 left-3.5 size-3 border-b border-l border-foreground/20" />
        <span aria-hidden="true" className="pointer-events-none absolute right-3.5 bottom-3.5 size-3 border-r border-b border-foreground/20" />

        <div className="relative z-20 flex w-full items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground" />
            STYLE WHEEL // 0 种画风
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">00 / 00</span>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2.5 px-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-[#E5A918]">
            <WandSparklesIcon className="size-5" />
          </div>
          <div className="text-xs font-bold text-foreground">暂无预设画风</div>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            当前暂未配置画风预设，可直接前往合成台以无预设画风出图。
          </p>
        </div>

        <div className="relative z-20 flex w-full justify-center pb-1">
          <button
            type="button"
            onClick={() => void navigate({ to: '/studio' })}
            className="inline-flex items-center gap-1 rounded-full bg-[#D9381E] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#C23018]"
          >
            <span>前往合成台</span>
            <ArrowRightIcon className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={stageRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          stepWheel(-1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          stepWheel(1)
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onWheel={(e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 4) {
          e.preventDefault()
          stepWheel(e.deltaX > 0 ? 1 : -1)
        }
      }}
      className={`relative flex min-h-[300px] flex-col items-center justify-between overflow-hidden border-t border-border bg-muted/40 px-5 py-4 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring lg:border-t-0 lg:border-l dark:bg-[#121215] ${
        draggingUi ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* 取景器四角刻度 */}
      <span aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3.5 size-3 border-t border-l border-foreground/20" />
      <span aria-hidden="true" className="pointer-events-none absolute top-3.5 right-3.5 size-3 border-t border-r border-foreground/20" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-3.5 left-3.5 size-3 border-b border-l border-foreground/20" />
      <span aria-hidden="true" className="pointer-events-none absolute right-3.5 bottom-3.5 size-3 border-r border-b border-foreground/20" />

      {/* 轮盘弧形虚线轨道与聚光 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(20,20,20,0.06)_0%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.085)_0%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        style={{ width: WHEEL_RADIUS * 2, height: WHEEL_RADIUS * 2 }}
        className="pointer-events-none absolute top-[148px] left-1/2 -translate-x-1/2 rounded-full border border-dashed border-foreground/12 dark:border-white/[0.1]"
      />

      {/* 顶部仪表栏 */}
      <div className="relative z-20 flex w-full items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-2.5 py-0.5 font-mono text-xs font-medium text-foreground">
          <span className="size-1.5 rounded-full bg-[#E5A918]" />
          STYLE WHEEL // {count} 种画风
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>

      {/* 轮盘弧形卡牌舞台 */}
      <div className="relative z-10 flex h-[182px] w-full items-start justify-center pt-3 sm:h-[196px]">
        {styles.map((card, idx) => (
          <div
            key={card.key}
            ref={(el) => {
              cardRefs.current[idx] = el
            }}
            data-wheel-card-idx={idx}
            className="group absolute top-2 aspect-[3/4] w-[108px] origin-bottom overflow-hidden rounded-2xl border border-border bg-card shadow-lg transition-[border-color,box-shadow] duration-200 will-change-transform data-[center]:border-foreground/75 data-[center]:ring-2 data-[center]:ring-[#D9381E]/75 sm:w-[118px] dark:border-white/20 dark:bg-zinc-900 dark:shadow-[0_18px_40px_rgba(0,0,0,0.72)] dark:data-[center]:border-white/75"
          >
            {card.preview ? (
              <img
                src={card.preview}
                alt={card.shortLabel}
                draggable={false}
                className="pointer-events-none size-full object-cover object-top"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted p-2 text-center text-foreground dark:bg-zinc-800 dark:text-zinc-200">
                <WandSparklesIcon className="size-5 text-[#E5A918]" />
                <span className="text-xs font-semibold">{card.shortLabel}</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-2 pt-5 pb-1.5 text-center">
              <span className="block truncate text-xs font-bold text-white">{card.shortLabel}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 底部实时聚焦读数 + 左右切牌控钮 */}
      <div className="relative z-20 flex w-full items-center justify-between gap-2 pt-1">
        <button
          type="button"
          data-wheel-control
          aria-label="上一张画风"
          onClick={() => stepWheel(-1)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/85 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95"
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <AnimatePresence mode="wait" initial={false}>
            {activeStyle && (
              <motion.div
                key={activeStyle.key}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.14 }}
                className="space-y-0.5"
              >
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded border border-border bg-background/75 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {activeStyle.categoryLabel} · {activeStyle.subcategoryLabel}
                  </span>
                  <span className="truncate text-xs font-bold text-foreground">{activeStyle.label}</span>
                  <button
                    type="button"
                    data-wheel-control
                    onClick={() => applyAndGo(activeIndex)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#D9381E] px-2.5 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-[#C23018]"
                  >
                    <span>试用</span>
                    <ArrowRightIcon className="size-3" />
                  </button>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {activeStyle.tagline || '左右拖动轮盘浏览全部画风 · 点击主卡直接试用'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          data-wheel-control
          aria-label="下一张画风"
          onClick={() => stepWheel(1)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/85 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
