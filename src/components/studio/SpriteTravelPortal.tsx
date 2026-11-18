import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArtistSprite3D } from '@/components/studio/ArtistSprite3D'
import type { ImageProviderId } from '../../../shared/studio'

export interface SpriteTravelTask {
  id: number
  providerId: ImageProviderId
  direction: 'to_canvas' | 'to_home'
  brushColorHex: string
  brushGlowHex: string
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
  spriteTask,
  homeworkTask,
  onSpriteArrive,
  onHomeworkLand,
}: {
  spriteTask: SpriteTravelTask | null
  homeworkTask: HomeworkThrowTask | null
  onSpriteArrive: (taskId: number) => void
  onHomeworkLand: (taskId: number) => void
}) {
  const spriteNodeRef = useRef<HTMLDivElement | null>(null)
  const paperNodeRef = useRef<HTMLDivElement | null>(null)
  const onSpriteArriveRef = useRef(onSpriteArrive)
  const onHomeworkLandRef = useRef(onHomeworkLand)

  useEffect(() => {
    onSpriteArriveRef.current = onSpriteArrive
  }, [onSpriteArrive])

  useEffect(() => {
    onHomeworkLandRef.current = onHomeworkLand
  }, [onHomeworkLand])

  // 画师小精灵跨栏移动动画（GPT 蹦蹦跳跳 / Grok 滚过来 / Gemini 星光闪现）
  useEffect(() => {
    if (!spriteTask) return
    const node = spriteNodeRef.current
    if (!node) return

    const duration = spriteTask.providerId === 'gemini' ? 540 : 600
    const start = performance.now()
    const fromCx = spriteTask.fromRect.left + spriteTask.fromRect.width * 0.5
    const fromCy = spriteTask.fromRect.top + spriteTask.fromRect.height * 0.5
    const toCx = spriteTask.toRect.left + spriteTask.toRect.width * 0.5
    const toCy = spriteTask.toRect.top + spriteTask.toRect.height * 0.5
    const baseScale = spriteTask.direction === 'to_canvas' ? 84 / 112 : 1
    const targetScale = spriteTask.direction === 'to_canvas' ? 1 : 84 / 112

    let rafId = 0
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const baseSizeScale = lerp(baseScale, targetScale, t)

      let curX = fromCx
      let curY = fromCy
      let rotDeg = 0
      let sx = baseSizeScale
      let sy = baseSizeScale
      let opacity = 1

      if (spriteTask.providerId === 'gpt') {
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
      } else if (spriteTask.providerId === 'grok') {
        // 星舰造像师：圆形黑洞滚过来
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const arc = Math.sin(t * Math.PI)
        curX = lerp(fromCx, toCx, ease)
        curY = lerp(fromCy, toCy, ease) - arc * 22
        const dirSign = spriteTask.direction === 'to_canvas' ? 1 : -1
        rotDeg = dirSign * 720 * ease
        sx = baseSizeScale * (1 + 0.08 * arc)
        sy = sx
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
        onSpriteArriveRef.current(spriteTask.id)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [spriteTask])

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

  if (!spriteTask && !homeworkTask) return null
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

      {spriteTask && (
        <div
          key={`sp-${spriteTask.id}`}
          ref={spriteNodeRef}
          style={{
            position: 'fixed',
            left:
              spriteTask.fromRect.left + spriteTask.fromRect.width * 0.5 - 56,
            top:
              spriteTask.fromRect.top + spriteTask.fromRect.height * 0.5 - 56,
            width: 112,
            height: 112,
            willChange: 'transform, opacity',
          }}
          className="flex items-center justify-center"
        >
          <ArtistSprite3D
            providerId={spriteTask.providerId}
            selected
            holdingBrush
            brushColorHex={spriteTask.brushColorHex}
            brushGlowHex={spriteTask.brushGlowHex}
            size="lg"
          />
        </div>
      )}
    </div>,
    document.body
  )
}
