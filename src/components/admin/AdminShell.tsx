import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CpuIcon,
  LayoutGridIcon,
  LogOutIcon,
  MenuIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldCheckIcon,
  TicketIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useStudio } from '@/store/studioStore'
import { getAdminNavGroups, getAdminNavItems, type AdminTab } from './auditHelpers'

const TAB_ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutGridIcon,
  users: UsersIcon,
  redeem: TicketIcon,
  suppliers: ServerIcon,
  api: CpuIcon,
  jobs: ActivityIcon,
  safety: ShieldCheckIcon,
}

interface AdminShellProps {
  activeTab: AdminTab
  directoryLabel: string
  headerLeftExtra?: ReactNode
  loading?: boolean
  onRefresh?: () => void
  onSelectTab?: (tab: AdminTab) => void
  children: ReactNode
}

export function AdminShell({
  activeTab,
  directoryLabel,
  headerLeftExtra,
  loading = false,
  onRefresh,
  onSelectTab,
  children,
}: AdminShellProps) {
  const navigate = useNavigate()
  const { user, logout } = useStudio()
  const navGroups = getAdminNavGroups()
  const navItems = getAdminNavItems()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleNavClick = (tabId: AdminTab) => {
    setMobileMenuOpen(false)
    if (onSelectTab) {
      onSelectTab(tabId)
      return
    }
    void navigate({
      to: '/admin',
      search: tabId === 'overview' ? {} : { tab: tabId },
    })
  }

  const handleLogout = async () => {
    setMobileMenuOpen(false)
    await logout()
    void navigate({ to: '/admin/login' })
  }

  const renderSidebarNav = () => (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <Link
          to="/admin"
          search={{}}
          onClick={() => setMobileMenuOpen(false)}
          className="block border-b border-zinc-950 pb-3.5 transition-opacity hover:opacity-80 dark:border-zinc-100"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold tracking-tight">CASTDECK · 管理台</span>
            <span className="border border-zinc-950 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950">
              ADMIN
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            成员准入 · 账本 · 模型路由
          </div>
        </Link>

        <nav aria-label="管理端菜单" className="mt-4 space-y-4 text-xs">
          {navGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <div className="px-1 font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                {group.label}
              </div>
              <div className="divide-y divide-zinc-200/70 border-t border-b border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
                {group.items.map((item) => {
                  const active = activeTab === item.id
                  const Icon = TAB_ICONS[item.id]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`flex w-full items-center justify-between px-2 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-l-2 border-l-zinc-950 bg-zinc-100 font-bold text-zinc-950 dark:border-l-zinc-100 dark:bg-zinc-900 dark:text-white'
                          : 'border-l-2 border-l-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-white'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="size-3.5 shrink-0 opacity-75" />
                        <span className="truncate">
                          <span className="mr-1 font-mono text-[11px] opacity-65">{item.code}.</span>
                          <span>{item.label}</span>
                        </span>
                      </span>
                      {active && (
                        <span className="size-1.5 shrink-0 bg-zinc-950 dark:bg-zinc-100" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-4 space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
        {user && (
          <div className="flex items-center justify-between border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="truncate font-mono text-[11px] font-semibold">@{user.username}</span>
            <span className="font-mono text-[10px] text-zinc-500">管理员</span>
          </div>
        )}
        <Link
          to="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex w-full items-center justify-between border border-zinc-300 px-2.5 py-2 text-zinc-800 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100"
        >
          <span>返回用户前端</span>
          <ArrowLeftIcon className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center justify-between border border-zinc-300 px-2.5 py-2 text-zinc-800 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100"
        >
          <span>退出登录</span>
          <LogOutIcon className="size-3.5" />
        </button>
      </div>
    </>
  )

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-white text-zinc-950 md:grid-cols-[248px_minmax(0,1fr)] dark:bg-zinc-950 dark:text-zinc-50">
      {/* 桌面端瑞士极简侧边栏 */}
      <aside className="hidden flex-col justify-between border-r border-zinc-200 p-4 md:sticky md:top-0 md:flex md:h-dvh dark:border-zinc-800">
        {renderSidebarNav()}
      </aside>

      {/* 右侧工作区 */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 text-xs backdrop-blur-xs sm:px-6 lg:px-8 dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="打开管理菜单"
                  className="inline-flex size-8 shrink-0 items-center justify-center border border-zinc-300 text-zinc-900 hover:border-zinc-950 md:hidden dark:border-zinc-700 dark:text-zinc-100"
                >
                  <MenuIcon className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col justify-between rounded-none border-r border-zinc-200 bg-white p-4 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>管理控制台导航</SheetTitle>
                </SheetHeader>
                {renderSidebarNav()}
              </SheetContent>
            </Sheet>
            {headerLeftExtra}
            <span className="truncate font-mono font-medium text-zinc-700 dark:text-zinc-300">
              {directoryLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex h-8 items-center gap-1.5 border border-zinc-300 px-2.5 transition-colors hover:border-zinc-950 disabled:opacity-60 dark:border-zinc-700 dark:hover:border-zinc-200"
              >
                <RefreshCwIcon className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* 移动端快捷切页胶囊带 */}
        <nav
          aria-label="移动端管理端快捷导航"
          className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-zinc-200 bg-zinc-50/70 px-4 py-2 text-xs md:hidden dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`shrink-0 border px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'
                }`}
              >
                <span className="mr-1 font-mono opacity-75">{item.code}.</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
