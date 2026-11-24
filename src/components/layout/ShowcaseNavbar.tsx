import { Link, useLocation } from '@tanstack/react-router'
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  CoinsIcon,
  DicesIcon,
  HelpCircleIcon,
  ImagesIcon,
  LayersIcon,
  LayoutGridIcon,
  LogInIcon,
  MenuIcon,
  MoonIcon,
  PersonStandingIcon,
  SearchIcon,
  ShirtIcon,
  SunIcon,
  TerminalSquareIcon,
  UserRoundIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useTheme } from '@/components/theme/ThemeProvider'
import { BrandMark } from '@/components/common/BrandMark'
import { KineticRollText } from '@/components/motion/SignatureBlocks'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { useStudioActions, useStudioShallow } from '@/store/studioStore'
import { openGlobalCommandPalette } from './nav'

const PRIMARY_LIBRARY_ITEMS = [
  { to: '/poses' as const, title: '动作姿势', desc: '1,400+ 多角度与深度骨骼参考', icon: PersonStandingIcon },
  { to: '/costumes' as const, title: '服装穿搭', desc: '写实、二次元与历代服饰图鉴', icon: ShirtIcon },
  { to: '/portraits' as const, title: '人像颜值', desc: '多风格发型与面部氛围参考', icon: UserRoundIcon },
]

const EXPLORE_ITEMS = [
  { to: '/gallery' as const, title: '灵感画廊', desc: '精选公开提示词与一键做同款', icon: ImagesIcon },
  { to: '/blindbox' as const, title: '盲盒抽卡', desc: '手撕烫金箔袋随机组合三轨配方', icon: DicesIcon },
  { to: '/canvas' as const, title: '无限画布', desc: '节点式拖线编排与原地 A/B 生图', icon: LayoutGridIcon },
]

export function ShowcaseNavbar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const { user, allowRegistration, selectedCount, hasRunningJob, studioMode } = useStudioShallow((s) => ({
    user: s.user,
    allowRegistration: s.platform.allowRegistration,
    studioMode: s.studioMode,
    selectedCount:
      (s.recipe.portrait ? 1 : 0) + (s.recipe.costume ? 1 : 0) + (s.recipe.pose ? 1 : 0),
    hasRunningJob:
      s.isSubmitting ||
      s.history.some((item) => item.status === 'processing' || item.status === 'queued'),
  }))
  const { openAuthModal, openAccountModal, setStudioMode } = useStudioActions()
  const { resolvedTheme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [avatarErrorUrl, setAvatarErrorUrl] = useState<string | null>(null)
  const showAvatar = Boolean(user?.avatarUrl && avatarErrorUrl !== user.avatarUrl)

  const isStudio = pathname.startsWith('/studio')
  // 页面本身已有主创作 CTA（首页三轨合图、三大图库配方坞、盲盒、画廊、画布）时，顶栏主按钮降级为次级轮廓胶囊，严守单屏唯一朱砂红铁律
  const hasPagePrimaryCta =
    pathname === '/' ||
    pathname.startsWith('/poses') ||
    pathname.startsWith('/costumes') ||
    pathname.startsWith('/portraits') ||
    pathname.startsWith('/gallery') ||
    pathname.startsWith('/blindbox') ||
    pathname.startsWith('/canvas')
  const isPromptStudio = isStudio && studioMode === 'prompt'
  const isRecipeStudio = isStudio && studioMode === 'recipe'
  const isDark = resolvedTheme === 'dark'
  const activeExplore = EXPLORE_ITEMS.find((item) => pathname.startsWith(item.to))
  const isExploreGroupActive = Boolean(activeExplore)

  const handleToggleTheme = (e: MouseEvent<HTMLButtonElement>) => {
    playMechanicalSwitch(isDark ? 1.08 : 0.92)
    const rect = e.currentTarget.getBoundingClientRect()
    setTheme(isDark ? 'light' : 'dark', {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  return (
    <header
      data-frosted-surface
      className="sticky top-0 z-40 w-full border-b border-black/[0.08] bg-[#f7f6f2]/92 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-white/[0.08] dark:bg-[#121110]/92"
    >
      <span aria-hidden="true" className="ks-foil-hairline pointer-events-none absolute inset-x-0 bottom-0 h-[1px] opacity-75" />
      <div className="mx-auto grid h-14 w-full max-w-[1440px] grid-cols-[auto_1fr] items-center gap-2 px-3 sm:h-15 sm:gap-3 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        {/* 左区：汉堡抽屉 + 品牌字标（<640px 仅留图标避免 390px 碰撞） */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="打开导航菜单"
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-black/[0.05] active:scale-[0.95] lg:hidden dark:hover:bg-white/[0.08]"
              >
                <MenuIcon className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col border-r border-border bg-background pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground">
              <SheetHeader className="shrink-0">
                <SheetTitle className="flex items-center gap-2.5 text-left">
                  <BrandMark />
                  <span className="flex flex-col gap-0.5 leading-none">
                    <span className="font-mono text-sm font-bold tracking-tight">
                      CASTDECK<span className="text-[#D9381E]">.</span>
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      姿势 × 服装 × 人像参考工作台
                    </span>
                  </span>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2">
                <Link
                  to="/"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                    pathname === '/' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  <WandSparklesIcon className="size-4" />
                  <span>图鉴首页</span>
                </Link>
                {PRIMARY_LIBRARY_ITEMS.map((item) => {
                  const Icon = item.icon
                  const isAct = pathname.startsWith(item.to)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                        isAct ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted/70'
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  )
                })}
                <div className="my-1.5 border-t border-border/80" />
                <Link
                  to="/studio"
                  search={{ mode: 'recipe' }}
                  onClick={() => {
                    setStudioMode('recipe')
                    setMobileOpen(false)
                  }}
                  className={cn(
                    'flex min-h-11 items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    isRecipeStudio ? 'bg-[#C42F16] text-white' : 'text-foreground hover:bg-muted/70'
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <LayersIcon className="size-4" />
                    <span>配方创作台</span>
                  </span>
                  {selectedCount > 0 && (
                    <span className="rounded-full bg-[#C42F16] px-2 py-0.5 font-mono text-xs font-semibold text-white">
                      {selectedCount}/3
                    </span>
                  )}
                </Link>
                <Link
                  to="/studio"
                  search={{ mode: 'prompt' }}
                  onClick={() => {
                    setStudioMode('prompt')
                    setMobileOpen(false)
                  }}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                    isPromptStudio ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  <WandSparklesIcon className="size-4" />
                  <span>自由文生图</span>
                </Link>
                {EXPLORE_ITEMS.map((item) => {
                  const Icon = item.icon
                  const isAct = pathname.startsWith(item.to)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                        isAct ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className="mt-4 shrink-0 space-y-2.5 border-t border-border px-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    setGuideOpen(true)
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-foreground transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-muted active:scale-[0.97]"
                >
                  <HelpCircleIcon className="size-4 text-muted-foreground" />
                  <span>使用指南与积分规则</span>
                </button>
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false)
                        openAccountModal('overview')
                      }}
                      className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-muted active:scale-[0.97]"
                    >
                      <span className="truncate">{user.displayName}</span>
                      <span className="font-mono tabular-nums text-[#7A5200] dark:text-[#E5A918]">
                        {user.creditBalance} 积分
                      </span>
                    </button>
                    {user.role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-foreground transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-muted active:scale-[0.97]"
                      >
                        <TerminalSquareIcon className="size-4" />
                        <span>管理控制台</span>
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
                    className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground transition-[transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
                  >
                    <LogInIcon className="size-3.5" />
                    <span>{allowRegistration ? '登录 / 注册' : '登录账号'}</span>
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to="/"
            aria-label="CASTDECK 首页"
            className="group flex size-11 shrink-0 items-center justify-center gap-2.5 rounded-full sm:h-9 sm:w-auto sm:justify-start"
          >
            <BrandMark className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-105 group-active:scale-95 motion-reduce:transform-none" />
            <span className="hidden items-baseline gap-0.5 font-mono text-sm font-bold tracking-[0.06em] whitespace-nowrap text-foreground sm:flex">
              <span>CASTDECK</span>
              <span aria-hidden="true" className="text-base leading-none text-[#D9381E]">
                .
              </span>
            </span>
          </Link>
        </div>

        {/* 中区：收敛至 5 项主导航——前置三库图鉴 + 配方创作台 + 探索下拉 */}
        <nav aria-label="主导航" className="hidden items-center justify-center gap-1 lg:flex">
          {PRIMARY_LIBRARY_ITEMS.map((item) => {
            const isAct = pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => playMechanicalSwitch(1.0)}
                className={cn(
                  'relative inline-flex h-9 items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors',
                  isAct ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'
                )}
              >
                {isAct && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-[#D9381E]"
                  />
                )}
                <span>{item.title}</span>
              </Link>
            )
          })}

          <Link
            to="/studio"
            search={{ mode: 'recipe' }}
            onClick={() => {
              playMechanicalSwitch(0.95)
              setStudioMode('recipe')
            }}
            className={cn(
              'relative inline-flex h-9 items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors',
              isStudio ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'
            )}
          >
            {isStudio && (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-[#D9381E]"
              />
            )}
            <span>配方创作台</span>
            {selectedCount > 0 && (
              <span className="font-mono text-xs font-bold text-[#C42F16] dark:text-[#FF7A63]">({selectedCount})</span>
            )}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'relative inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isExploreGroupActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'
                )}
              >
                {isExploreGroupActive && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-[#D9381E]"
                  />
                )}
                <span>{activeExplore ? activeExplore.title : '探索'}</span>
                <ChevronDownIcon className="size-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              sideOffset={8}
              className="w-60 rounded-2xl border border-border/90 bg-popover/96 p-1.5 shadow-xl backdrop-blur-xl"
            >
              {EXPLORE_ITEMS.map((item) => {
                const Icon = item.icon
                const isCurrent = pathname.startsWith(item.to)
                return (
                  <DropdownMenuItem key={item.to} asChild className="cursor-pointer rounded-xl p-0">
                    <Link
                      to={item.to}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors',
                        isCurrent ? 'bg-muted text-foreground' : 'text-foreground'
                      )}
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          isCurrent ? 'text-[#D9381E]' : 'text-muted-foreground'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.desc}</div>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0">
                <Link
                  to="/studio"
                  search={{ mode: 'prompt' }}
                  onClick={() => setStudioMode('prompt')}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors',
                    isPromptStudio ? 'bg-muted text-foreground' : 'text-foreground'
                  )}
                >
                  <WandSparklesIcon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      isPromptStudio ? 'text-[#D9381E]' : 'text-muted-foreground'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">自由文生图</div>
                    <div className="text-xs text-muted-foreground">输入灵感或随机抽词直出大片</div>
                  </div>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* 右区：快捷搜索 + 昼夜切换 + 账户 + 唯一主行动按钮（身处创作台时隐藏自我跳转） */}
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          <button
            type="button"
            onClick={openGlobalCommandPalette}
            aria-label="全局快捷搜索 (⌘K)"
            title="全局快捷搜索 (⌘K / Ctrl+K)"
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border/75 bg-card/75 text-xs text-foreground/80 transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/30 hover:text-foreground active:scale-[0.97] sm:h-9 sm:w-auto sm:px-2.5"
          >
            <SearchIcon className="size-4 sm:size-3.5" />
            <kbd className="hidden font-mono text-xs text-foreground/80 xl:inline">⌘K</kbd>
          </button>

          <button
            type="button"
            aria-label="使用指南与积分规则"
            title="使用指南与积分规则"
            onClick={() => setGuideOpen(true)}
            className="hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-border/75 hover:bg-card/75 hover:text-foreground active:scale-[0.97] sm:inline-flex"
          >
            <HelpCircleIcon className="size-4" />
          </button>

          <button
            type="button"
            aria-label={isDark ? '切换到和纸日间模式' : '切换到暖黑暗房模式'}
            title={isDark ? '切换到和纸日间模式' : '切换到暖黑暗房模式'}
            onClick={handleToggleTheme}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-border/75 hover:bg-card/75 hover:text-foreground active:scale-[0.97] sm:size-9"
          >
            {isDark ? <SunIcon className="size-4 text-[#E5A918]" /> : <MoonIcon className="size-4" />}
          </button>

          {user?.role === 'admin' && (
            <Link
              to="/admin"
              title="管理控制台"
              aria-label="管理控制台"
              className="hidden size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card/75 hover:text-foreground sm:inline-flex"
            >
              <TerminalSquareIcon className="size-4" />
            </Link>
          )}

          {user ? (
            <button
              type="button"
              onClick={() => openAccountModal('overview')}
              title="个人账户与积分"
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/80 bg-card/90 pr-2.5 pl-1.5 text-xs font-medium text-foreground transition-[transform,border-color] duration-150 ease-[var(--ease-out)] hover:border-foreground/30 active:scale-[0.97] sm:h-9 sm:gap-2 sm:pr-3"
            >
              {showAvatar && user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarErrorUrl(user.avatarUrl || null)}
                  className="size-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRoundIcon className="size-3.5" />
                </span>
              )}
              <span className="hidden max-w-[78px] truncate font-semibold md:inline">
                {user.displayName}
              </span>
              <span className="inline-flex items-center gap-1 font-mono font-bold tabular-nums text-[#7A5200] dark:text-[#E5A918]">
                <CoinsIcon className="size-3.5" />
                <span>{user.creditBalance}</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full border border-border/80 bg-card/90 px-3.5 text-xs font-semibold whitespace-nowrap text-foreground transition-[transform,border-color] duration-150 ease-[var(--ease-out)] hover:border-foreground/30 active:scale-[0.97] sm:h-9"
            >
              <span>登录</span>
            </button>
          )}

          {/* 主行动按钮：非创作台页面直达合成工作台；页面自身已有主行动按钮或悬浮 RecipeDock 时降级为次级轮廓，避免单屏双朱砂 CTA */}
          {!isStudio && (
            <Link
              to="/studio"
              search={{ mode: selectedCount > 0 ? 'recipe' : 'prompt' }}
              onClick={() => {
                playMechanicalSwitch(1.06)
                setStudioMode(selectedCount > 0 ? 'recipe' : 'prompt')
              }}
              className={cn(
                'group relative inline-flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-full py-1 pr-1.5 pl-3 text-xs font-semibold whitespace-nowrap select-none [-webkit-touch-callout:none] transition-[transform,opacity,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] sm:h-9 sm:gap-2 sm:pr-1 sm:pl-4',
                hasPagePrimaryCta && !hasRunningJob
                  ? 'border border-foreground/20 bg-card text-foreground hover:border-foreground/45 hover:bg-secondary/60'
                  : 'skin-accent-btn'
              )}
            >
              {(!hasPagePrimaryCta || hasRunningJob) && (
                <span
                  aria-hidden="true"
                  className="ks-cta-glint pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                />
              )}
              {hasRunningJob ? (
                <>
                  <span aria-hidden="true" className="relative z-10 size-1.5 shrink-0 animate-pulse rounded-full bg-[#FDE68A] motion-reduce:animate-none" />
                  <KineticRollText text="绘制中" className="relative z-10" />
                </>
              ) : (
                <>
                  <span className="relative z-10 sm:hidden">去创作</span>
                  <KineticRollText
                    text={selectedCount > 0 ? `去合成 (${selectedCount})` : '立即创作'}
                    className="relative z-10 hidden sm:inline-flex"
                  />
                </>
              )}
              <span
                className={cn(
                  'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none',
                  hasPagePrimaryCta && !hasRunningJob
                    ? 'bg-foreground text-background'
                    : 'bg-white/20 text-white'
                )}
              >
                <ArrowUpRightIcon className="size-3.5" />
              </span>
            </Link>
          )}
        </div>
      </div>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-lg rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <HelpCircleIcon className="size-4 text-[#C42F16] dark:text-[#FF7A63]" />
              <span>CASTDECK 快速使用指南</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              3 分钟上手三轨角色参考合成、深度图、画风锁定与积分保障机制。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65dvh] space-y-3 overflow-y-auto overscroll-contain pr-1 text-xs leading-relaxed">
            <div className="rounded-xl border border-border/80 bg-secondary/40 p-3">
              <div className="font-bold text-foreground">1. 三轨配方混搭（姿势 + 服装 + 人像）</div>
              <p className="mt-1 text-muted-foreground">
                在三大图库点击卡片右上角 <span className="font-mono font-semibold text-foreground">+</span> 即可锁入底部悬浮配方坞，也可上传本地图或去「盲盒抽卡」手撕随机组合。三槽不必全选，任选 1–3 项均可进入工作台生图。
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-secondary/40 p-3">
              <div className="font-bold text-foreground">2. 3D 白模 vs 深度图（Depth）</div>
              <p className="mt-1 text-muted-foreground">
                姿势卡片支持一键翻面切换「白模」与「深度骨骼图」：白模适合保留光影与体积轮廓，深度图能更严格锁定肢体透视与前后遮挡关系。
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-secondary/40 p-3">
              <div className="font-bold text-foreground">3. 画风锁定与「图转文」兜底</div>
              <p className="mt-1 text-muted-foreground">
                选择成图风格后，默认同时「锁定外貌」与「锁定姿势」以忠实还原参考图；解锁后允许长相/动作随新画风自由发挥。若某些敏感构图直传参考图被拦截，开启「图转文」可先将参考图转述为文字后再绘制。
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-secondary/40 p-3">
              <div className="font-bold text-foreground">4. 积分扣费与失败自动全额退还</div>
              <p className="mt-1 text-muted-foreground">
                单次生图消耗明确标注在主生成按钮上；排队中可随时点击「取消排队」退还积分，生成失败或超时系统会自动全额退回账户（可在右上角账户 → 积分流水中核查）。
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-secondary/40 p-3">
              <div className="font-bold text-foreground">5. 快捷键与无限画布</div>
              <p className="mt-1 text-muted-foreground">
                全站按 <kbd className="rounded border border-border bg-card px-1 font-mono">⌘K</kbd>（Windows 为 <kbd className="rounded border border-border bg-card px-1 font-mono">Ctrl+K</kbd>）随时跨库搜图锁槽；图库与画廊页按 <kbd className="rounded border border-border bg-card px-1 font-mono">/</kbd> 聚焦搜索、<kbd className="rounded border border-border bg-card px-1 font-mono">F</kbd> 打开筛选；工作台支持 <kbd className="rounded border border-border bg-card px-1 font-mono">Ctrl+V</kbd> 粘贴参考图。
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
