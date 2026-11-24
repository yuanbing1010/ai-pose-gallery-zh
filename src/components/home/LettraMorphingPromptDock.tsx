import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { CameraIcon, WandSparklesIcon, XIcon } from 'lucide-react'
import type { StudioAspectRatio } from '@/lib/artists'
import { playBrassDialTick, playCameraShutter } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'

const DOCK_RATIOS: StudioAspectRatio[] = ['3:4', '9:16', '1:1', '16:9']

export function LettraMorphingPromptDock({
  value,
  ratio,
  onChange,
  onRatioChange,
  onLaunch,
}: {
  value: string
  ratio: StudioAspectRatio
  onChange: (next: string) => void
  onRatioChange: (next: StudioAspectRatio) => void
  onLaunch: () => void
}) {
  const { scrollY } = useScroll()
  const [pastFold, setPastFold] = useState(false)
  const [suppressedBySection, setSuppressedBySection] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useMotionValueEvent(scrollY, 'change', (y) => {
    const shouldShow = y > 480
    setPastFold((prev) => (prev === shouldShow ? prev : shouldShow))
  })

  // 当滚动剧场（已有同类提示词输入框）或页脚品牌字标在视口内时自动避让，避免双输入框冲突与页脚遮挡
  // 注意：#portal-theater 为 Suspense 懒加载挂载，需在后续节点出现时补挂 IntersectionObserver
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const observed = new Set<Element>()
    const intersectingSet = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersectingSet.add(entry.target)
          } else {
            intersectingSet.delete(entry.target)
          }
        }
        setSuppressedBySection(intersectingSet.size > 0)
      },
      { threshold: 0.08 }
    )

    const attachTargets = () => {
      const theaterEl = document.getElementById('portal-theater')
      const footerEl = document.querySelector('footer')
      for (const el of [theaterEl, footerEl]) {
        if (el && !observed.has(el)) {
          observed.add(el)
          observer.observe(el)
        }
      }
      return Boolean(theaterEl && footerEl)
    }

    let mo: MutationObserver | null = null
    if (!attachTargets() && typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => {
        if (attachTargets()) {
          mo?.disconnect()
          mo = null
        }
      })
      mo.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      mo?.disconnect()
      observer.disconnect()
    }
  }, [])

  const visible = pastFold && (!suppressedBySection || focused)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    playCameraShutter()
    onLaunch()
  }

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ y: 32, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ y: 24, opacity: 0, scale: 0.96, transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] } }}
          className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-35 hidden justify-center px-4 md:flex"
        >
          <form
            onSubmit={handleSubmit}
            className={cn(
              'ks-obsidian-stage dark pointer-events-auto relative flex w-[480px] max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-4 text-[#F5F1E8] shadow-[0_24px_64px_rgba(0,0,0,0.58)] backdrop-blur-lg transition-[transform,border-color] duration-200 ease-[var(--ease-out)]',
              focused
                ? 'scale-[1.02] border-[#E5A918]/75'
                : 'border-[#E5A918]/32 hover:border-[#E5A918]/55'
            )}
          >
            <WandSparklesIcon className="size-4 shrink-0 text-[#E5A918]" />

            <input
              type="text"
              aria-label="输入灵感回车文生图"
              enterKeyHint="send"
              value={value}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => onChange(e.target.value)}
              placeholder="输入灵感，回车文生图…"
              className="h-8.5 min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-[#9C9486] focus:outline-none"
            />

            {focused && (
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/12 bg-black/45 p-0.5">
                {DOCK_RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      playBrassDialTick()
                      onRatioChange(r)
                    }}
                    className={cn(
                      'h-6 cursor-pointer rounded-full px-2 font-mono text-xs transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-95',
                      ratio === r
                        ? 'bg-[#E5A918] font-bold text-[#151412]'
                        : 'text-[#BDB5A6] hover:text-white'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}

            <button
              type="submit"
              aria-label="进入文生图"
              className="skin-accent-btn inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-bold"
            >
              <CameraIcon className="size-3.5" />
              <span>开拍</span>
            </button>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="收起快捷栏"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8E877A] transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] hover:bg-white/10 hover:text-white active:scale-95"
            >
              <XIcon className="size-3.5" />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
