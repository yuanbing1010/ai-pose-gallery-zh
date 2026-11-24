import { motion, useScroll, useSpring } from 'motion/react'
import { playBrassDialTick } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'

// oxlint-disable-next-line react/only-export-components
export const PORTAL_NAV_TICKS = [
  { id: 'portal-hero', code: '00', label: '图鉴总览' },
  { id: 'portal-theater', code: '01', label: '暗房工坊' },
  { id: 'portal-process', code: '02', label: '创作链路' },
] as const

export function SantalScrollChrome({ activeChapter }: { activeChapter: string }) {
  // 顶部连续 2px 滚动进度细线（带柔和弹簧惯性）
  const { scrollYProgress } = useScroll()
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 26,
    mass: 0.25,
  })

  const scrollToSection = (id: string) => {
    playBrassDialTick()
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {/* 1. 全屏极细 1px 建筑纵向辅助参考线 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 mx-auto hidden max-w-[1440px] grid-cols-6 px-4 sm:px-6 lg:grid lg:px-10"
      >
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-full border-l border-foreground/[0.04] last:border-r dark:border-white/[0.04]"
          />
        ))}
      </div>

      {/* 2. 紧贴导航栏下方的章节刻度与进度细线（含安全区偏移与移动端舒适触控高度） */}
      <div
        data-frosted-surface
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 w-full border-b border-border/60 bg-background/90 backdrop-blur-md sm:top-[calc(3.75rem+env(safe-area-inset-top,0px))]"
      >
        <div className="relative mx-auto flex min-h-9 max-w-[1440px] items-center justify-between px-4 sm:h-8 sm:px-6 lg:px-10">
          <div className="no-scrollbar flex items-center gap-4 overflow-x-auto overscroll-x-contain sm:gap-7">
            {PORTAL_NAV_TICKS.map((tick) => {
              const active = activeChapter === tick.id
              return (
                <button
                  key={tick.id}
                  type="button"
                  onClick={() => scrollToSection(tick.id)}
                  className={cn(
                    'relative inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 font-mono text-xs transition-colors sm:min-h-8',
                    active
                      ? 'font-bold text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 rounded-full transition-colors',
                      active ? 'bg-[#C42F16]' : 'bg-border'
                    )}
                  />
                  <span className="tabular-nums">{tick.code}</span>
                  <span className="font-sans">{tick.label}</span>
                </button>
              )
            })}
          </div>
          <span className="hidden font-mono text-xs text-muted-foreground md:inline">
            CASTDECK · ARCHIVE &amp; STUDIO
          </span>
        </div>

        {/* 丝滑惯性推进的 2px 金箔朱砂进度细线 */}
        <motion.div
          aria-hidden="true"
          style={{ scaleX: smoothProgress, transformOrigin: '0% 50%' }}
          className="h-[2px] w-full bg-gradient-to-r from-[#C42F16] via-[#E5A918] to-[#F5C443]"
        />
      </div>
    </>
  )
}
