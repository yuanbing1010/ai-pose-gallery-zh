import { Link, useLocation } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  BookOpenIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MoonIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  SunIcon,
  UserRoundIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '@/components/theme/ThemeProvider'
import { BrandMark } from '@/components/common/BrandMark'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { activeNavTo } from './nav'
import { useStudio } from '@/store/studioStore'

const SHOWCASE_NAV_ITEMS = [
  { title: '盲盒抽卡', to: '/' as const, icon: LayoutDashboardIcon },
  { title: '人像卡', to: '/portraits' as const, icon: UserRoundIcon, count: '1.5K' },
  { title: '服装卡', to: '/costumes' as const, icon: ShirtIcon, count: '3.2K' },
  { title: '姿势卡', to: '/poses' as const, icon: PersonStandingIcon, count: '1.4K' },
  { title: '指南', to: '/guide' as const, icon: BookOpenIcon },
]

export function ShowcaseNavbar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const active = activeNavTo(pathname)
  const { recipe } = useStudio()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const selectedCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length
  const isStudio = active === '/studio'
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/[0.06] bg-[#f5f2eb]/75 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#14141a]/75">
      <div className="mx-auto flex h-15 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* 左侧：品牌标识 + 桌面端主导航 */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="打开导航菜单"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted active:scale-95 lg:hidden"
                >
                  <MenuIcon className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-r border-border bg-background text-foreground">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2.5 text-left">
                    <BrandMark />
                    <span className="flex flex-col leading-none">
                      <span className="font-mono text-sm font-bold tracking-tight">CHARADECK</span>
                      <span className="text-[11px] font-medium text-muted-foreground">角色牌局</span>
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1 px-2">
                  {[...SHOWCASE_NAV_ITEMS, { title: '角色合成台', to: '/studio' as const, icon: SparklesIcon }].map((item) => {
                    const isActive = item.to === active
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <item.icon className="size-4" />
                          {item.title}
                        </span>
                        {'count' in item && item.count && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.count}
                          </span>
                        )}
                        {item.to === '/studio' && selectedCount > 0 && (
                          <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-xs font-semibold text-primary-foreground">
                            {selectedCount}/3
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <Link to="/" className="group flex items-center gap-2.5">
              <BrandMark className="transition-transform duration-200 group-hover:scale-105 group-active:scale-95" />
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-bold tracking-tight text-foreground">
                  CHARADECK
                </span>
                <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                  角色牌局
                </span>
              </span>
            </Link>
          </div>

          <nav aria-label="主导航" className="hidden items-center gap-1 lg:flex">
            {SHOWCASE_NAV_ITEMS.map((item) => {
              const isActive = item.to === active
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                    isActive
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="showcase-nav-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-muted"
                    />
                  )}
                  <span className="relative z-10">{item.title}</span>
                  {item.count && (
                    <span className="relative z-10 font-mono text-[11px] opacity-60">
                      {item.count}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* 右侧：日夜主题切换 + 高对比主 CTA */}
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            aria-label={isDark ? '切换到日间画廊模式' : '切换到暗房模式'}
            title={isDark ? '切换到日间画廊模式' : '切换到暗房模式'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'sun' : 'moon'}
                initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                transition={{ duration: 0.16 }}
                className="inline-flex items-center justify-center"
              >
                {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          <Link
            to="/studio"
            className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] ${
              isStudio ? 'ring-2 ring-ring' : ''
            }`}
          >
            <SparklesIcon className="size-3.5" />
            <span>{selectedCount > 0 ? `合成台 (${selectedCount}/3)` : '进入合成台'}</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
