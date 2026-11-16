import { Link, useLocation } from '@tanstack/react-router'
import {
  BookOpenIcon,
  CoinsIcon,
  LayoutDashboardIcon,
  LogInIcon,
  MenuIcon,
  MoonIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  SunIcon,
  TerminalSquareIcon,
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
  const {
    user,
    platform,
    recipe,
    isGenerating,
    history,
    openAuthModal,
    openAccountModal,
  } = useStudio()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [avatarErrorUrl, setAvatarErrorUrl] = useState<string | null>(null)
  const showAvatar = Boolean(user?.avatarUrl && avatarErrorUrl !== user.avatarUrl)

  const selectedCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length
  const hasRunningJob = isGenerating || history.some((item) => item.status === 'processing')
  const isStudio = active === '/studio'
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/[0.06] bg-[#f7f6f2]/82 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#14141a]/80">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:h-15 sm:gap-3 sm:px-6">
        {/* 左侧：品牌标识 + 桌面端纯文字导航 */}
        <div className="flex min-w-0 items-center gap-4 lg:gap-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="打开导航菜单"
                  className="inline-flex size-8.5 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted sm:size-9 lg:hidden"
                >
                  <MenuIcon className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-r border-border bg-background text-foreground">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2.5 text-left">
                    <BrandMark />
                    <span className="flex flex-col gap-0.5 leading-none">
                      <span className="font-mono text-sm font-bold tracking-tight">CASTDECK</span>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        姿势 × 服装 × 人像参考工作台
                      </span>
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1 px-2">
                  {[...SHOWCASE_NAV_ITEMS, { title: 'AI 合成台', to: '/studio' as const, icon: SparklesIcon }].map((item) => {
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

                <div className="mt-6 space-y-2.5 border-t border-border px-2 pt-4">
                  {user ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileOpen(false)
                          openAccountModal('overview')
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold"
                      >
                        <span className="truncate">{user.displayName}</span>
                        <span className="font-mono text-[#7A5200] dark:text-[#E5A918]">
                          {user.creditBalance} 积分
                        </span>
                      </button>
                      {user.role === 'admin' && (
                        <Link
                          to="/admin"
                          onClick={() => setMobileOpen(false)}
                          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-2">
                            <TerminalSquareIcon className="size-4" />
                            <span>管理控制台</span>
                          </span>
                        </Link>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false)
                        openAuthModal('login')
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground"
                    >
                      <LogInIcon className="size-3.5" />
                      <span>{platform.allowRegistration ? '登录 / 注册' : '登录账号'}</span>
                    </button>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/" className="group flex shrink-0 items-center gap-2 sm:gap-2.5">
              <BrandMark className="transition-transform duration-200 group-hover:scale-105 group-active:scale-95" />
              <span className="font-mono text-[13px] font-bold tracking-tight whitespace-nowrap text-foreground sm:text-sm">
                CAST.DECK
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
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>{item.title}</span>
                  {item.count && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {item.count}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* 右侧：日夜切换 + 用户积分/登录 + 管理员控制台 + 合成台 CTA */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            aria-label={isDark ? '切换到日间画廊模式' : '切换到暗房模式'}
            title={isDark ? '切换到日间画廊模式' : '切换到暗房模式'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:size-9"
          >
            {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </button>

          {user ? (
            <>
              <button
                type="button"
                onClick={() => openAccountModal('redeem')}
                title="查看或兑换积分"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#E5A918]/45 bg-[#E5A918]/12 px-2.5 font-mono text-xs font-bold whitespace-nowrap text-[#7A5200] transition-colors hover:bg-[#E5A918]/20 sm:h-9 sm:gap-1.5 sm:px-3 dark:text-[#E5A918]"
              >
                <CoinsIcon className="size-3.5 shrink-0" />
                <span>{user.creditBalance}</span>
                <span className="hidden sm:inline">积分</span>
              </button>

              <button
                type="button"
                onClick={() => openAccountModal('overview')}
                title="个人账户与流水"
                className="hidden h-9 max-w-[130px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:inline-flex"
              >
                {showAvatar && user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarErrorUrl(user.avatarUrl || null)}
                    className="size-4.5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{user.displayName}</span>
              </button>

              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  title="进入管理控制台"
                  aria-label="进入管理控制台"
                  className="hidden size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
                >
                  <TerminalSquareIcon className="size-4" />
                </Link>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold whitespace-nowrap text-foreground transition-colors hover:bg-muted sm:h-9 sm:gap-1.5 sm:px-3"
            >
              <LogInIcon className="hidden size-3.5 min-[380px]:inline" />
              <span>登录</span>
            </button>
          )}

          <Link
            to="/studio"
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 text-xs font-medium whitespace-nowrap text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] sm:h-9 sm:px-4 sm:text-[13px] ${
              isStudio ? 'ring-2 ring-ring' : ''
            }`}
          >
            {hasRunningJob && !isStudio ? (
              <>
                <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-[#E5A918]" />
                <span className="sm:hidden">绘制中…</span>
                <span className="hidden sm:inline">云端绘制中…</span>
              </>
            ) : (
              <>
                <SparklesIcon className="size-3.5 shrink-0" />
                <span className="sm:hidden">{selectedCount > 0 ? `合成 ${selectedCount}/3` : '合成台'}</span>
                <span className="hidden sm:inline">{selectedCount > 0 ? `合成台 (${selectedCount}/3)` : '进入合成台'}</span>
              </>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}
