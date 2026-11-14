import { type PointerEvent, type ReactNode, useEffect, useState } from 'react'
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * 舞台环境底层（遵循 Impeccable 规范：纯净纸感/暗房底色，无廉价霓虹光斑）
 */
export function ShowcaseBackdrop() {
  return null
}

/**
 * 3D 视差悬浮画廊海报卡（遵循 Impeccable 规范：真实物理中性阴影 + 3D 倾斜，无彩色霓虹光晕）
 */
export function TiltCard({
  children,
  className,
  picked = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  picked?: boolean
  onClick?: () => void
}) {
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)

  const smoothX = useSpring(mx, { stiffness: 280, damping: 24 })
  const smoothY = useSpring(my, { stiffness: 280, damping: 24 })

  const rotateX = useTransform(smoothY, [0, 1], [5, -5])
  const rotateY = useTransform(smoothX, [0, 1], [-5, 5])
  const glareX = useTransform(smoothX, [0, 1], [0, 100])
  const glareY = useTransform(smoothY, [0, 1], [0, 100])
  const glareBg = useMotionTemplate`radial-gradient(260px circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.18), transparent 75%)`

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    mx.set((e.clientX - rect.left) / rect.width)
    my.set((e.clientY - rect.top) / rect.height)
  }

  const handlePointerLeave = () => {
    mx.set(0.5)
    my.set(0.5)
  }

  return (
    <motion.div
      onClick={onClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 950,
      }}
      whileHover={{ y: -5, scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        'ks-elevation group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors',
        picked
          ? 'border-[#D9381E] ring-2 ring-[#D9381E]'
          : 'border-border hover:border-foreground/40',
        className
      )}
    >
      <motion.div
        aria-hidden="true"
        style={{ background: glareBg }}
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      {children}
    </motion.div>
  )
}

/**
 * 扑克牌扇形展开预览组件（Fan-out Card Stack）
 */
export function FanOutStack({
  images,
  hovered,
}: {
  images: Array<{ key: string; src: string; alt: string }>
  hovered: boolean
}) {
  const restTransforms = [
    { rotate: -5, x: 6, y: 4, scale: 0.96 },
    { rotate: -1.5, x: 2, y: 1, scale: 0.98 },
    { rotate: 1.5, x: -2, y: 1, scale: 0.98 },
    { rotate: 5, x: -6, y: 4, scale: 0.96 },
  ]
  const hoverTransforms = [
    { rotate: -11, x: -6, y: -6, scale: 1.06 },
    { rotate: -3.5, x: -2, y: -12, scale: 1.09 },
    { rotate: 3.5, x: 2, y: -12, scale: 1.09 },
    { rotate: 11, x: 6, y: -6, scale: 1.06 },
  ]

  return (
    <div className="mt-5 grid grid-cols-4 gap-2 pt-2 pb-1" data-impeccable-ignore="nested-cards">
      {images.slice(0, 4).map((img, i) => {
        const target = hovered ? hoverTransforms[i] : restTransforms[i]
        return (
          <motion.div
            key={img.key}
            animate={target}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1], delay: i * 0.02 }}
            style={{ zIndex: hovered ? 10 + i : i }}
            className="overflow-hidden rounded-xl bg-zinc-800"
          >
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              className="aspect-3/4 w-full object-cover"
            />
          </motion.div>
        )
      })}
    </div>
  )
}

/**
 * 动态数字跳字计数器
 */
export function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(value)
  useEffect(() => {
    let frame = 0
    const totalFrames = 22
    const timer = window.setInterval(() => {
      frame += 1
      const progress = 1 - Math.pow(1 - frame / totalFrames, 3)
      setDisplay(Math.round(value * progress))
      if (frame >= totalFrames) window.clearInterval(timer)
    }, 16)
    return () => window.clearInterval(timer)
  }, [value])

  return (
    <span>
      {display.toLocaleString('zh-CN')}
      {suffix}
    </span>
  )
}
