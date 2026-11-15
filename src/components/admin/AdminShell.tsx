import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, LogOutIcon, RefreshCwIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useStudio } from '@/store/studioStore'
import { getAdminNavItems, type AdminTab } from './auditHelpers'

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
  const navItems = getAdminNavItems()

  const handleNavClick = (tabId: AdminTab) => {
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
    await logout()
    void navigate({ to: '/admin/login' })
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-white text-zinc-950 md:grid-cols-[240px_minmax(0,1fr)] dark:bg-zinc-950 dark:text-zinc-50">
      {/* 瑞士极简侧边栏 */}
      <aside className="flex flex-col justify-between border-b border-zinc-200 p-4 md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0 dark:border-zinc-800">
        <div>
          <Link
            to="/admin"
            search={{}}
            className="block border-b border-zinc-950 pb-3.5 transition-opacity hover:opacity-80 dark:border-zinc-100"
          >
            <div className="text-sm font-bold tracking-tight">CASTDECK · 管理控制台</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              数据账本与云端存储运维
            </div>
          </Link>

          <nav aria-label="管理端菜单" className="mt-4 text-xs">
            {navItems.map((item) => {
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex w-full items-center justify-between border-b border-zinc-200 py-2.5 text-left transition-colors dark:border-zinc-800 ${
                    active
                      ? 'font-bold text-zinc-950 dark:text-white'
                      : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  <span>
                    <span className="mr-1.5 font-mono text-zinc-400">{item.code}.</span>
                    <span>{item.label}</span>
                  </span>
                  {active && (
                    <span className="bg-zinc-950 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
                      当前
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
          <Link
            to="/"
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
      </aside>

      {/* 右侧工作区 */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-5 text-xs backdrop-blur-xs sm:px-6 lg:px-8 dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex min-w-0 items-center gap-3">
            {headerLeftExtra}
            <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
              {directoryLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1 border border-zinc-300 px-2.5 py-1 transition-colors hover:border-zinc-950 dark:border-zinc-700 dark:hover:border-zinc-200"
              >
                <RefreshCwIcon className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>
            )}
            {user && (
              <span className="hidden font-mono text-zinc-600 sm:inline dark:text-zinc-400">
                @{user.username}
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 space-y-6 p-5 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
