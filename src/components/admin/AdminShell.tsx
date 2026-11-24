import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CpuIcon,
  FileTextIcon,
  ImagesIcon,
  LayoutGridIcon,
  ListOrderedIcon,
  LogOutIcon,
  MenuIcon,
  PaletteIcon,
  RefreshCwIcon,
  ScanTextIcon,
  SearchIcon,
  ServerIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  TicketIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { adminLogoutApi } from '@/lib/apiClient'
import type { PublicUser } from '@/types/gallery'
import { AdminCommandPalette } from './AdminCommandPalette'
import { getAdminNavGroups, type AdminTab } from './auditHelpers'

const TAB_ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutGridIcon,
  users: UsersIcon,
  redeem: TicketIcon,
  gallery: ImagesIcon,
  suppliers: ServerIcon,
  api: CpuIcon,
  jobs: ActivityIcon,
  queue: ListOrderedIcon,
  styles: PaletteIcon,
  access: SlidersHorizontalIcon,
  prompts: FileTextIcon,
  sanitize: ShieldAlertIcon,
  descriptions: ScanTextIcon,
}

interface AdminShellProps {
  activeTab: AdminTab
  directoryLabel: string
  adminUser?: PublicUser | null
  headerLeftExtra?: ReactNode
  loading?: boolean
  dirty?: boolean
  onRefresh?: () => void
  onSelectTab?: (tab: AdminTab) => void
  onQuickCreateUser?: () => void
  onBeforeLeave?: (proceed: () => void) => void
  children: ReactNode
}

export function AdminShell({
  activeTab,
  directoryLabel,
  adminUser,
  headerLeftExtra,
  loading = false,
  dirty = false,
  onRefresh,
  onSelectTab,
  onQuickCreateUser,
  onBeforeLeave,
  children,
}: AdminShellProps) {
  const navigate = useNavigate()
  const navGroups = getAdminNavGroups()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)

  // 全局管理端键盘快捷键：⌘K / Ctrl+K 打开指令面板，R 刷新当前数据
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((prev) => !prev)
        return
      }
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (e.key === 'r' || e.key === 'R') &&
        onRefresh &&
        !loading &&
        !cmdOpen
      ) {
        e.preventDefault()
        onRefresh()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onRefresh, loading, cmdOpen])

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

  const executeLogout = async () => {
    setMobileMenuOpen(false)
    try {
      await adminLogoutApi()
    } catch {
      // Ignore logout network error and still redirect
    }
    void navigate({ to: '/admin/login' })
  }

  const handleLogout = () => {
    setMobileMenuOpen(false)
    if (onBeforeLeave) {
      onBeforeLeave(() => void executeLogout())
      return
    }
    void executeLogout()
  }

  const handleGoFrontend = () => {
    setMobileMenuOpen(false)
    if (onBeforeLeave) {
      onBeforeLeave(() => void navigate({ to: '/' }))
      return
    }
    void navigate({ to: '/' })
  }

  const renderSidebarNav = () => (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <Link
          to="/admin"
          search={{}}
          onClick={(e) => {
            setMobileMenuOpen(false)
            if (onSelectTab) {
              e.preventDefault()
              onSelectTab('overview')
            }
          }}
          className="block border-b-2 border-zinc-950 pb-3.5 transition-opacity hover:opacity-80 dark:border-zinc-100"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-extrabold tracking-tight">CASTDECK</span>
            <span className="border border-zinc-950 bg-zinc-950 px-1.5 py-0.5 font-mono text-xs font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950">
              CONSOLE
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            成员准入 · 账本 · 画笔路由
          </div>
        </Link>

        {/* 侧栏快捷指令入口 */}
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false)
            setCmdOpen(true)
          }}
          className="mt-3 flex h-8.5 w-full items-center justify-between border border-zinc-300 bg-zinc-50 px-2.5 font-mono text-xs text-zinc-500 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-100"
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <SearchIcon className="size-3.5 shrink-0" />
            <span>快速跳转…</span>
          </span>
          <kbd className="border border-zinc-300 bg-white px-1 py-0.5 text-xs leading-none dark:border-zinc-700 dark:bg-zinc-950">
            ⌘K
          </kbd>
        </button>

        <nav aria-label="管理端菜单" className="mt-4 space-y-4 text-xs">
          {navGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <div className="flex items-center justify-between px-1 font-mono text-xs font-bold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                <span>{group.label}</span>
                <span className="opacity-55">{group.items.length}</span>
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
                      className={`relative flex w-full items-center justify-between px-2.5 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-zinc-100/90 font-bold text-zinc-950 dark:bg-zinc-900 dark:text-white'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-white'
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-zinc-950 dark:bg-zinc-100"
                        />
                      )}
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="size-3.5 shrink-0 opacity-75" />
                        <span className="truncate">
                          <span className="mr-1 font-mono text-xs opacity-60">{item.code}.</span>
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
        {adminUser && (
          <div className="flex items-center justify-between border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="size-1.5 shrink-0 bg-emerald-500" aria-hidden="true" />
              <span className="truncate font-mono text-xs font-semibold">@{adminUser.username}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-zinc-500">ONLINE</span>
          </div>
        )}
        <Link
          to="/"
          onClick={(e) => {
            setMobileMenuOpen(false)
            if (onBeforeLeave) {
              e.preventDefault()
              onBeforeLeave(() => void navigate({ to: '/' }))
            }
          }}
          className="flex w-full items-center justify-between border border-zinc-300 px-2.5 py-2 text-zinc-800 transition-colors hover:border-zinc-950 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100 dark:hover:bg-zinc-900"
        >
          <span>返回用户前端</span>
          <ArrowLeftIcon className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center justify-between border border-zinc-300 px-2.5 py-2 text-zinc-800 transition-colors hover:border-zinc-950 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100 dark:hover:bg-zinc-900"
        >
          <span>退出管理登录</span>
          <LogOutIcon className="size-3.5" />
        </button>
      </div>
    </>
  )

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-white text-zinc-950 md:grid-cols-[252px_minmax(0,1fr)] dark:bg-zinc-950 dark:text-zinc-50">
      {/* 桌面端瑞士极简侧边栏 */}
      <aside className="hidden flex-col justify-between border-r border-zinc-200 bg-white p-4 md:sticky md:top-0 md:flex md:h-dvh dark:border-zinc-800 dark:bg-zinc-950">
        {renderSidebarNav()}
      </aside>

      {/* 右侧工作区 */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] text-xs backdrop-blur-md sm:px-6 lg:px-8 dark:border-zinc-800 dark:bg-zinc-950/95">
          {/* 顶部线性加载扫描进度条 */}
          {loading && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-zinc-200/70 dark:bg-zinc-800">
              <div className="admin-scanline h-full w-1/3 bg-zinc-950 dark:bg-zinc-100" />
            </div>
          )}

          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="打开管理菜单"
                  className="inline-flex size-9 shrink-0 items-center justify-center border border-zinc-300 text-zinc-900 transition-[transform,border-color] hover:border-zinc-950 active:scale-95 md:hidden dark:border-zinc-700 dark:text-zinc-100"
                >
                  <MenuIcon className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col justify-between rounded-none border-r border-zinc-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>管理控制台导航</SheetTitle>
                </SheetHeader>
                {renderSidebarNav()}
              </SheetContent>
            </Sheet>
            {headerLeftExtra}
            <div className="flex min-w-0 items-center gap-2 font-mono">
              <span className="hidden text-zinc-400 sm:inline dark:text-zinc-500">ADMIN /</span>
              <span className="truncate font-bold text-zinc-900 dark:text-zinc-100">
                {directoryLabel}
              </span>
            </div>
            {dirty && (
              <span className="inline-flex shrink-0 items-center gap-1.5 border border-amber-600/50 bg-amber-500/12 px-2 py-0.5 font-mono text-xs font-bold text-amber-800 dark:text-amber-300">
                <span className="size-1.5 animate-pulse bg-amber-500" />
                <span>未保存</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              title="打开快捷指令面板 (⌘K / Ctrl+K)"
              className="hidden h-8 items-center gap-2 border border-zinc-300 px-2.5 font-mono text-xs text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950 sm:inline-flex dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-100"
            >
              <SearchIcon className="size-3" />
              <span>指令</span>
              <kbd className="border border-zinc-300 bg-zinc-50 px-1 text-xs leading-none dark:border-zinc-700 dark:bg-zinc-900">
                ⌘K
              </kbd>
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                title="刷新当前模块 (快捷键 R)"
                className="inline-flex h-8 items-center gap-1.5 border border-zinc-300 px-2.5 font-mono transition-colors hover:border-zinc-950 disabled:opacity-60 dark:border-zinc-700 dark:hover:border-zinc-200"
              >
                <RefreshCwIcon className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                <span>刷新</span>
                <kbd className="hidden border border-zinc-200 bg-zinc-50 px-1 text-xs leading-none text-zinc-500 lg:inline-block dark:border-zinc-800 dark:bg-zinc-900">
                  R
                </kbd>
              </button>
            )}
            <ThemeToggle square />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <AdminCommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        activeTab={activeTab}
        onSelectTab={handleNavClick}
        onRefresh={onRefresh}
        onQuickCreateUser={onQuickCreateUser}
        onGoFrontend={handleGoFrontend}
        onLogout={() => void handleLogout()}
      />
    </div>
  )
}
