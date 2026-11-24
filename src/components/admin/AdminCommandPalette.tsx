import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CornerDownLeftIcon,
  CpuIcon,
  FileTextIcon,
  ImagesIcon,
  LayoutGridIcon,
  ListOrderedIcon,
  LogOutIcon,
  MoonIcon,
  PaletteIcon,
  RefreshCwIcon,
  ScanTextIcon,
  SearchIcon,
  ServerIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TicketIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useTheme } from '@/components/theme/ThemeProvider'
import { cn } from '@/lib/utils'
import { getAdminNavItems, type AdminTab } from './auditHelpers'

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

const TAB_KEYWORDS: Record<AdminTab, string> = {
  overview: 'overview dashboard telemetry stats 概览 总览 统计 趋势 r2 mio outfit-db chihal',
  users: 'users members credits ledger 成员 用户 账号 积分 流水 备注',
  redeem: 'redeem codes cards voucher 兑换码 卡密 充值',
  gallery: 'gallery review moderate x twitter import prompt 画廊 审核 推文 导入 提示词 博主',
  suppliers: 'suppliers keys oauth api 供应商 凭证 密钥 中转',
  api: 'providers profiles brushes channels routing 画笔 档位 路由 模型 定价',
  styles: 'styles presets gallery 画风 图鉴 风格 预设',
  access: 'access settings registration security 准入 全局 配置 注册 微信',
  prompts: 'prompts templates system 提示词 模板 指令',
  sanitize: 'sanitize filter words 敏感词 屏蔽 过滤',
  descriptions: 'descriptions captions text 图转文 描述库 缓存',
  jobs: 'jobs audit logs trace 生成 记录 审计 日志 排障',
  queue: 'queue concurrency limit 队列 并发 排队 限流',
}

interface AdminCommand {
  id: string
  group: 'modules' | 'actions'
  code?: string
  label: string
  hint?: string
  keywords: string
  active?: boolean
  icon: ReactNode
  onSelect: () => void
}

interface AdminCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeTab: AdminTab
  onSelectTab: (tab: AdminTab) => void
  onRefresh?: () => void
  onQuickCreateUser?: () => void
  onGoFrontend: () => void
  onLogout: () => void
}

export function AdminCommandPalette({
  open,
  onOpenChange,
  activeTab,
  onSelectTab,
  onRefresh,
  onQuickCreateUser,
  onGoFrontend,
  onLogout,
}: AdminCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme, setTheme } = useTheme()

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery('')
      setSelectedIndex(0)
    }
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  const commands = useMemo<AdminCommand[]>(() => {
    const q = query.trim().toLowerCase()
    const navItems = getAdminNavItems()

    const list: AdminCommand[] = navItems.map((item) => {
      const Icon = TAB_ICONS[item.id]
      return {
        id: `tab:${item.id}`,
        group: 'modules',
        code: item.code,
        label: item.label,
        hint: activeTab === item.id ? '当前所在分区' : `跳转至 ${item.code}. ${item.label}`,
        keywords: `${item.code} ${item.label} ${item.id} ${TAB_KEYWORDS[item.id]}`,
        active: activeTab === item.id,
        icon: <Icon className="size-3.5" />,
        onSelect: () => {
          onOpenChange(false)
          onSelectTab(item.id)
        },
      }
    })

    if (onQuickCreateUser) {
      list.push({
        id: 'act:create-user',
        group: 'actions',
        code: 'A1',
        label: '新建成员账号',
        hint: '直接打开成员建号与初始凭证分发弹窗',
        keywords: 'create user new member 新建 成员 创建 账号',
        icon: <UserPlusIcon className="size-3.5" />,
        onSelect: () => {
          onOpenChange(false)
          onQuickCreateUser()
        },
      })
    }

    if (onRefresh) {
      list.push({
        id: 'act:refresh',
        group: 'actions',
        code: 'A2',
        label: '刷新当前模块数据',
        hint: '快捷键 R · 重新拉取最新服务端状态',
        keywords: 'refresh reload sync 刷新 重载 同步',
        icon: <RefreshCwIcon className="size-3.5" />,
        onSelect: () => {
          onOpenChange(false)
          onRefresh()
        },
      })
    }

    list.push({
      id: 'act:theme',
      group: 'actions',
      code: 'A3',
      label: resolvedTheme === 'dark' ? '切换至浅色瑞士画廊主题' : '切换至深色高对比暗房主题',
      hint: '支持原生 View Transitions 平滑切换',
      keywords: 'theme dark light 主题 浅色 深色 暗色',
      icon: resolvedTheme === 'dark' ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />,
      onSelect: () => {
        onOpenChange(false)
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
      },
    })

    list.push({
      id: 'act:frontend',
      group: 'actions',
      code: 'A4',
      label: '返回用户前端',
      hint: '前往 CASTDECK 面向用户的参考图库与合成台',
      keywords: 'home frontend user 返回 前端 首页',
      icon: <ArrowLeftIcon className="size-3.5" />,
      onSelect: () => {
        onOpenChange(false)
        onGoFrontend()
      },
    })

    list.push({
      id: 'act:logout',
      group: 'actions',
      code: 'A5',
      label: '退出管理登录',
      hint: '仅注销独立管理端会话，不影响前台登录状态',
      keywords: 'logout exit signout 退出 注销 登录',
      icon: <LogOutIcon className="size-3.5" />,
      onSelect: () => {
        onOpenChange(false)
        onLogout()
      },
    })

    if (!q) return list
    return list.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        (cmd.hint?.toLowerCase().includes(q) ?? false) ||
        cmd.keywords.toLowerCase().includes(q)
    )
  }, [
    activeTab,
    onGoFrontend,
    onLogout,
    onOpenChange,
    onQuickCreateUser,
    onRefresh,
    onSelectTab,
    query,
    resolvedTheme,
    setTheme,
  ])

  const safeIdx = commands.length > 0 ? Math.min(selectedIndex, commands.length - 1) : 0

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-admin-cmd="${safeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [safeIdx])

  const modulesList = commands
    .map((cmd, idx) => ({ cmd, idx }))
    .filter((x) => x.cmd.group === 'modules')
  const actionsList = commands
    .map((cmd, idx) => ({ cmd, idx }))
    .filter((x) => x.cmd.group === 'actions')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="duration-0 data-open:animate-none data-closed:animate-none bg-black/45 supports-backdrop-filter:backdrop-blur-none"
        className="top-[14%] max-w-[560px] translate-y-0 gap-0 overflow-hidden rounded-none border-2 border-zinc-950 bg-white p-0 text-zinc-950 shadow-2xl duration-0 data-open:animate-none data-closed:animate-none dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-50"
      >
        <DialogTitle className="sr-only">管理控制台快捷指令面板</DialogTitle>

        {/* 顶部搜索框 */}
        <div className="flex items-center gap-3 border-b border-zinc-950 px-4 py-3 dark:border-zinc-200">
          <SearchIcon className="size-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            aria-label="检索管理模块或运维指令"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (commands.length > 0) setSelectedIndex((prev) => (prev + 1) % commands.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (commands.length > 0) {
                  setSelectedIndex((prev) => (prev - 1 + commands.length) % commands.length)
                }
              } else if (e.key === 'Enter') {
                e.preventDefault()
                commands[safeIdx]?.onSelect()
              }
            }}
            placeholder="输入模块编号 (00–11)、名称或运维指令…"
            className="w-full bg-transparent font-mono text-xs text-zinc-950 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-50"
          />
          {query && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => {
                setQuery('')
                setSelectedIndex(0)
                inputRef.current?.focus()
              }}
              className="p-0.5 text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
          <kbd className="border border-zinc-300 px-1.5 py-0.5 font-mono text-xs text-zinc-500 dark:border-zinc-700">
            ESC
          </kbd>
        </div>

        {/* 列表 */}
        <div ref={listRef} className="max-h-[min(60dvh,420px)] overscroll-contain overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
          {commands.length === 0 ? (
            <div className="py-12 text-center font-mono text-xs text-zinc-500">
              NO MATCH // 未找到匹配模块或运维指令
            </div>
          ) : (
            <>
              {modulesList.length > 0 && (
                <div>
                  <div className="bg-zinc-50 px-4 py-1.5 font-mono text-xs font-bold tracking-wider text-zinc-500 uppercase dark:bg-zinc-900/70">
                    MODULES // 管理分区 ({modulesList.length})
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {modulesList.map(({ cmd, idx }) => {
                      const focused = idx === safeIdx
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          data-admin-cmd={idx}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onClick={cmd.onSelect}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left',
                            focused
                              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                              : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 opacity-80">{cmd.icon}</span>
                            {cmd.code && (
                              <span className="font-mono text-xs font-bold opacity-65">
                                {cmd.code}.
                              </span>
                            )}
                            <span className="truncate text-xs font-bold">{cmd.label}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {cmd.active && (
                              <span
                                className={cn(
                                  'border px-1.5 py-0.5 font-mono text-xs font-bold',
                                  focused
                                    ? 'border-white/40 text-white dark:border-zinc-950/40 dark:text-zinc-950'
                                    : 'border-zinc-300 text-zinc-500 dark:border-zinc-700'
                                )}
                              >
                                ACTIVE
                              </span>
                            )}
                            {focused && <CornerDownLeftIcon className="size-3.5" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {actionsList.length > 0 && (
                <div>
                  <div className="bg-zinc-50 px-4 py-1.5 font-mono text-xs font-bold tracking-wider text-zinc-500 uppercase dark:bg-zinc-900/70">
                    ACTIONS // 快捷运维
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {actionsList.map(({ cmd, idx }) => {
                      const focused = idx === safeIdx
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          data-admin-cmd={idx}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onClick={cmd.onSelect}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left',
                            focused
                              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                              : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 opacity-80">{cmd.icon}</span>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold">{cmd.label}</div>
                              {cmd.hint && (
                                <div
                                  className={cn(
                                    'truncate text-xs',
                                    focused ? 'opacity-75' : 'text-zinc-500'
                                  )}
                                >
                                  {cmd.hint}
                                </div>
                              )}
                            </div>
                          </div>
                          {focused && <CornerDownLeftIcon className="size-3.5 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部坐标状态栏 */}
        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">
          <span>↑↓ 选择 · ↵ 执行 · R 刷新</span>
          <span>CASTDECK // ADMIN ⌘K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
