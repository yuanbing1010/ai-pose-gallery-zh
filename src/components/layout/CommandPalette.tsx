import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CheckIcon,
  CoinsIcon,
  CornerDownLeftIcon,
  DicesIcon,
  LayersIcon,
  LogInIcon,
  MoonIcon,
  PersonStandingIcon,
  PlusIcon,
  SearchIcon,
  ShirtIcon,
  SparklesIcon,
  SunIcon,
  TerminalSquareIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { useTheme } from '@/components/theme/ThemeProvider'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { isContainCostumeSource } from '@/lib/costumeSources'
import { toast } from '@/lib/notifications'
import { hasPoseDepthMap, poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { playMechanicalSwitch, playTypewriterKey } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { useStudioActions, useStudioShallow } from '@/store/studioStore'
import type { CostumeItem, PortraitItem, PoseGroup } from '@/types/gallery'
import { COMMAND_PALETTE_OPEN_EVENT, NAV_ITEMS } from './nav'

interface PaletteCommand {
  id: string
  group: 'nav' | 'action' | 'pose' | 'costume' | 'portrait'
  label: string
  subtitle?: string
  keywords: string
  code?: string
  thumbUrl?: string
  thumbContain?: boolean
  badge?: string
  picked?: boolean
  icon?: ReactNode
  onSelect: () => void
}

const GROUP_LABELS: Record<PaletteCommand['group'], string> = {
  nav: '页面导航',
  action: '快捷指令',
  pose: '动作姿势库匹配',
  costume: '服装穿搭库匹配',
  portrait: '人像颜值库匹配',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [catalogLoaded, setCatalogLoaded] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()
  const pathname = useLocation({ select: (l) => l.pathname })
  const qc = useQueryClient()
  const { resolvedTheme, setTheme } = useTheme()

  const { user, recipe, poseDepthMode } = useStudioShallow((s) => ({
    user: s.user,
    recipe: s.recipe,
    poseDepthMode: s.poseDepthMode,
  }))
  const {
    openAuthModal,
    openAccountModal,
    clearRecipe,
    randomizeRecipe,
    setPoseDepthMode,
    togglePose,
    toggleCostume,
    togglePortrait,
  } = useStudioActions()

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [])

  // 监听全局快捷键 Cmd/Ctrl + K 与自定义打开事件
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => {
          const next = !prev
          if (next) {
            setQuery('')
            setActiveIndex(0)
          }
          return next
        })
      }
    }
    const onOpen = () => {
      setQuery('')
      setActiveIndex(0)
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
    }
  }, [])

  // 打开时聚焦并预热三库数据以支持跨库瞬搜
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    void Promise.all([
      qc.ensureQueryData(posesQuery),
      qc.ensureQueryData(costumesQuery),
      qc.ensureQueryData(portraitsQuery),
    ])
      .then(() => setCatalogLoaded((n) => n + 1))
      .catch(() => {})
    return () => cancelAnimationFrame(raf)
  }, [open, qc])

  const closeAndRun = useCallback((fn: () => void) => {
    playMechanicalSwitch(1.06)
    setOpen(false)
    fn()
  }, [])

  const handleRandomRecipe = useCallback(async () => {
    setOpen(false)
    try {
      const [posesRes, costumes, portraits] = await Promise.all([
        qc.ensureQueryData(posesQuery),
        qc.ensureQueryData(costumesQuery),
        qc.ensureQueryData(portraitsQuery),
      ])
      randomizeRecipe({ poses: posesRes.items, costumes, portraits })
      toast.success('已随机装配一套三合一角色配方')
    } catch {
      toast.error('素材库加载失败，请稍后重试')
    }
  }, [qc, randomizeRecipe])

  const hasAnyRecipe = Boolean(
    recipe.pose || recipe.costume || recipe.portrait || (recipe.extraImages?.length ?? 0) > 0
  )

  const commands = useMemo<PaletteCommand[]>(() => {
    void catalogLoaded
    const q = query.trim().toLowerCase()
    const list: PaletteCommand[] = []

    // 1. 页面导航
    for (const item of NAV_ITEMS) {
      const isCurrent = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
      list.push({
        id: `nav:${item.to}`,
        group: 'nav',
        code: item.code,
        label: item.title,
        subtitle: isCurrent ? '当前所在页面' : `前往 ${item.to}`,
        keywords: `${item.code} ${item.title} ${item.to} 导航 页面`,
        icon: <item.icon className="size-4" />,
        badge: isCurrent ? '当前' : undefined,
        onSelect: () => closeAndRun(() => void navigate({ to: item.to })),
      })
    }

    if (user?.role === 'admin') {
      list.push({
        id: 'nav:/admin',
        group: 'nav',
        code: 'AD',
        label: '管理控制台',
        subtitle: '进入独立瑞士极简管理后台',
        keywords: 'admin 管理后台 控制台 运维',
        icon: <TerminalSquareIcon className="size-4" />,
        onSelect: () => closeAndRun(() => void navigate({ to: '/admin' })),
      })
    }

    // 2. 快捷指令
    list.push({
      id: 'action:random-recipe',
      group: 'action',
      label: '随机抽一套角色配方',
      subtitle: '从姿势、服装与人像库各随机挑选 1 张参考卡',
      keywords: 'random 随机 抽卡 盲盒 配方',
      icon: <DicesIcon className="size-4 text-[#E5A918]" />,
      onSelect: () => void handleRandomRecipe(),
    })

    if (hasAnyRecipe) {
      list.push({
        id: 'action:clear-recipe',
        group: 'action',
        label: '清空当前角色配方',
        subtitle: '移除已选的姿势、穿搭、人像与附图槽位',
        keywords: 'clear 清空 重置 配方',
        icon: <Trash2Icon className="size-4 text-destructive" />,
        onSelect: () =>
          closeAndRun(() => {
            clearRecipe()
            toast.info('已清空当前配方')
          }),
      })
    }

    list.push({
      id: 'action:toggle-depth',
      group: 'action',
      label: poseDepthMode ? '切换姿势默认底图为「素体白模」' : '切换姿势默认底图为「深度图」',
      subtitle: `当前默认底图：${poseDepthMode ? '深度图' : '素体白模'}`,
      keywords: 'depth white 深度图 素体 白模 姿势',
      icon: <LayersIcon className="size-4 text-[#D9381E]" />,
      onSelect: () =>
        closeAndRun(() => {
          setPoseDepthMode(!poseDepthMode)
          toast.success(`已切换为${!poseDepthMode ? '深度图' : '素体白模'}模式`)
        }),
    })

    list.push({
      id: 'action:toggle-theme',
      group: 'action',
      label: resolvedTheme === 'dark' ? '切换至日间和纸画廊模式' : '切换至暗房黑曜石模式',
      subtitle: '支持原生圆形视图过渡切换明暗视觉',
      keywords: 'theme dark light 主题 日间 暗房 浅色 深色',
      icon:
        resolvedTheme === 'dark' ? (
          <SunIcon className="size-4 text-[#E5A918]" />
        ) : (
          <MoonIcon className="size-4" />
        ),
      onSelect: () =>
        closeAndRun(() => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
        }),
    })

    if (user) {
      list.push({
        id: 'action:account',
        group: 'action',
        label: '打开个人账户与积分流水',
        subtitle: `${user.displayName} · 当前余额 ${user.creditBalance} 积分`,
        keywords: 'account profile user 账户 积分 流水 密码',
        icon: <UserRoundIcon className="size-4" />,
        badge: `${user.creditBalance} 积分`,
        onSelect: () => closeAndRun(() => openAccountModal('overview')),
      })
      list.push({
        id: 'action:redeem',
        group: 'action',
        label: '兑换积分卡密',
        subtitle: '输入兑换码为当前账号充值创作积分',
        keywords: 'redeem code credits 卡密 兑换 充值 积分',
        icon: <CoinsIcon className="size-4 text-[#E5A918]" />,
        onSelect: () => closeAndRun(() => openAccountModal('redeem')),
      })
    } else {
      list.push({
        id: 'action:login',
        group: 'action',
        label: '登录 / 注册创作账号',
        subtitle: '登录后解锁云端 AI 合成与跨设备作品存档',
        keywords: 'login register auth 登录 注册 账号',
        icon: <LogInIcon className="size-4" />,
        onSelect: () => closeAndRun(() => openAuthModal('login')),
      })
    }

    const baseFiltered = q
      ? list.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(q) ||
            (cmd.subtitle?.toLowerCase().includes(q) ?? false) ||
            cmd.keywords.toLowerCase().includes(q)
        )
      : list

    // 3. 当用户输入关键词时，实时跨库检索姿势、服装与人像
    if (q.length >= 1) {
      const posesData = qc.getQueryData(posesQuery.queryKey) as
        | { groups: PoseGroup[] }
        | undefined
      const costumesData = qc.getQueryData(costumesQuery.queryKey) as CostumeItem[] | undefined
      const portraitsData = qc.getQueryData(portraitsQuery.queryKey) as PortraitItem[] | undefined

      if (posesData?.groups) {
        const poseMatches: PoseGroup[] = []
        for (const g of posesData.groups) {
          const item = g.order[0]
          if (!item) continue
          const hay = (item.检索 || `${g.name} ${g.category} ${g.system} ${item.id}`).toLowerCase()
          if (hay.includes(q)) {
            poseMatches.push(g)
            if (poseMatches.length >= 4) break
          }
        }
        for (const g of poseMatches) {
          const item = g.order[0]
          const useDepth = hasPoseDepthMap(item) ? poseDepthMode : false
          const picked = recipe.pose?.id === item.id
          baseFiltered.push({
            id: `pose:${g.key}`,
            group: 'pose',
            label: g.name,
            subtitle: `${g.category} · ${item.角度 || g.system}`,
            keywords: g.name,
            thumbUrl: referenceImageUrl(poseThumbPath(item, useDepth)),
            thumbContain: true,
            picked,
            badge: picked ? '已锁入' : '锁入姿势',
            icon: <PersonStandingIcon className="size-4 text-[#D9381E]" />,
            onSelect: () => {
              togglePose({ ...item, useDepth })
              toast.success(picked ? `已移出姿势：${g.name}` : `已锁入姿势：${g.name}`)
              setOpen(false)
            },
          })
        }
      }

      if (costumesData) {
        const costumeMatches: CostumeItem[] = []
        for (const c of costumesData) {
          const hay = (c.检索 || `${c.服装名称} ${c.分类} ${c.一级分类} ${(c.标签 || []).join(' ')}`).toLowerCase()
          if (hay.includes(q)) {
            costumeMatches.push(c)
            if (costumeMatches.length >= 4) break
          }
        }
        for (const c of costumeMatches) {
          const picked = recipe.costume?.id === c.id
          baseFiltered.push({
            id: `costume:${c.id}`,
            group: 'costume',
            label: c.服装名称,
            subtitle: `${c.一级分类} · ${c.分类}`,
            keywords: c.服装名称,
            thumbUrl: referenceImageUrl(c.缩略图),
            thumbContain: isContainCostumeSource(c.source),
            picked,
            badge: picked ? '已锁入' : '锁入穿搭',
            icon: <ShirtIcon className="size-4 text-[#19857B]" />,
            onSelect: () => {
              toggleCostume(c)
              toast.success(picked ? `已移出穿搭：${c.服装名称}` : `已锁入穿搭：${c.服装名称}`)
              setOpen(false)
            },
          })
        }
      }

      if (portraitsData) {
        const portraitMatches: PortraitItem[] = []
        for (const p of portraitsData) {
          const hay = (p.检索 || `${p.发型名称} ${p.标题} ${p.分区} ${p.发长}`).toLowerCase()
          if (hay.includes(q)) {
            portraitMatches.push(p)
            if (portraitMatches.length >= 4) break
          }
        }
        for (const p of portraitMatches) {
          const picked = recipe.portrait?.id === p.id
          baseFiltered.push({
            id: `portrait:${p.id}`,
            group: 'portrait',
            label: p.标题 || p.发型名称,
            subtitle: `${p.分区} · ${p.发长}`,
            keywords: p.标题 || p.发型名称,
            thumbUrl: referenceImageUrl(p.缩略图),
            picked,
            badge: picked ? '已锁入' : '锁入人像',
            icon: <UserRoundIcon className="size-4 text-[#E5A918]" />,
            onSelect: () => {
              togglePortrait(p)
              toast.success(picked ? `已移出人像：${p.发型名称}` : `已锁入人像：${p.发型名称}`)
              setOpen(false)
            },
          })
        }
      }
    }

    return baseFiltered
  }, [
    catalogLoaded,
    clearRecipe,
    closeAndRun,
    handleRandomRecipe,
    hasAnyRecipe,
    navigate,
    openAccountModal,
    openAuthModal,
    pathname,
    poseDepthMode,
    qc,
    query,
    recipe.costume?.id,
    recipe.pose?.id,
    recipe.portrait?.id,
    resolvedTheme,
    setPoseDepthMode,
    setTheme,
    toggleCostume,
    togglePortrait,
    togglePose,
    user,
  ])

  const safeActiveIndex = commands.length > 0 ? Math.min(activeIndex, commands.length - 1) : 0

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const activeEl = container.querySelector<HTMLElement>(`[data-cmd-idx="${safeActiveIndex}"]`)
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [safeActiveIndex])

  const grouped = useMemo(() => {
    const groups: Array<{ group: PaletteCommand['group']; items: Array<{ cmd: PaletteCommand; index: number }> }> = []
    const map = new Map<PaletteCommand['group'], Array<{ cmd: PaletteCommand; index: number }>>()
    commands.forEach((cmd, index) => {
      let arr = map.get(cmd.group)
      if (!arr) {
        arr = []
        map.set(cmd.group, arr)
        groups.push({ group: cmd.group, items: arr })
      }
      arr.push({ cmd, index })
    })
    return groups
  }, [commands])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="duration-0 data-open:animate-none data-closed:animate-none bg-black/45 supports-backdrop-filter:backdrop-blur-none"
        className="ks-obsidian-stage dark top-[13%] max-w-[620px] translate-y-0 gap-0 overflow-hidden rounded-[22px] border border-[#E5A918]/32 p-0 text-[#F5F1E8] shadow-[0_32px_90px_rgba(0,0,0,0.68)] duration-0 data-open:animate-none data-closed:animate-none"
      >
        <span
          aria-hidden="true"
          className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1px]"
        />
        <DialogTitle className="sr-only">全局快捷指令与跨库检索面板</DialogTitle>

        {/* 顶部黑曜石检索输入槽 */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <SearchIcon className="size-4 shrink-0 text-[#E5A918]" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="检索页面、指令或姿势/穿搭/人像参考"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="global-command-listbox"
            aria-activedescendant={commands.length > 0 ? `cmd-opt-${safeActiveIndex}` : undefined}
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (commands.length > 0) {
                  playTypewriterKey()
                  setActiveIndex((prev) => (prev + 1) % commands.length)
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (commands.length > 0) {
                  playTypewriterKey()
                  setActiveIndex((prev) => (prev - 1 + commands.length) % commands.length)
                }
              } else if (e.key === 'Enter') {
                e.preventDefault()
                commands[safeActiveIndex]?.onSelect()
              }
            }}
            placeholder="输入页面、指令，或直接检索姿势 / 穿搭 / 人像（如 站姿、和服、短发）…"
            className="w-full bg-transparent text-sm text-white placeholder:text-[#9C9486] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="清空输入"
              onClick={() => {
                playMechanicalSwitch(0.92)
                setQuery('')
                setActiveIndex(0)
                inputRef.current?.focus()
              }}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/12 text-[#D8D0C2] hover:bg-white/20 hover:text-white"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
          <kbd className="hidden shrink-0 rounded-md border border-white/15 bg-gradient-to-b from-[#2A2824] to-[#171614] px-2 py-0.5 font-mono text-xs text-[#D6CEC0] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_0_rgba(0,0,0,0.6)] sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* 指令与跨库匹配列表 */}
        <div
          id="global-command-listbox"
          role="listbox"
          aria-label="指令与跨库检索结果"
          ref={listRef}
          className="max-h-[min(62dvh,460px)] overscroll-contain overflow-y-auto p-2"
        >
          {commands.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <SparklesIcon className="size-5 text-[#E5A918]/75" />
              <div className="text-xs font-medium text-white">未找到与「{query}」匹配的页面或参考图</div>
              <div className="text-xs text-[#A9A192]">试试换个动作、服装品类或发型关键词</div>
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map((section) => (
                <div key={section.group}>
                  <div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-xs font-semibold text-[#A9A192]">
                    <span>[ {GROUP_LABELS[section.group]} ]</span>
                    {section.group !== 'nav' && section.group !== 'action' && (
                      <button
                        type="button"
                        onClick={() =>
                          closeAndRun(() => {
                            const to =
                              section.group === 'pose'
                                ? '/poses'
                                : section.group === 'costume'
                                  ? '/costumes'
                                  : '/portraits'
                            void navigate({ to, search: { q: query.trim() } })
                          })
                        }
                        className="inline-flex cursor-pointer items-center gap-0.5 font-mono text-xs text-[#F5C443] hover:underline"
                      >
                        <span>在图库查看全部</span>
                        <ArrowRightIcon className="size-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map(({ cmd, index }) => {
                      const active = index === safeActiveIndex
                      return (
                        <button
                          key={cmd.id}
                          id={`cmd-opt-${index}`}
                          role="option"
                          aria-selected={active}
                          type="button"
                          data-cmd-idx={index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={cmd.onSelect}
                          className={cn(
                            'relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left',
                            active ? 'text-white' : 'text-[#D8D0C2] hover:text-white'
                          )}
                        >
                          {active && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 rounded-xl border border-[#E5A918]/35 bg-white/[0.08]"
                            />
                          )}

                          <div className="relative z-10 flex shrink-0 items-center justify-center">
                            {cmd.thumbUrl ? (
                              <img
                                src={cmd.thumbUrl}
                                alt={cmd.label}
                                className={cn(
                                  'h-10 w-8 rounded-lg border border-white/15 bg-[#1B1916]',
                                  cmd.thumbContain ? 'bg-white object-contain p-0.5' : 'object-cover object-top'
                                )}
                              />
                            ) : (
                              <div className={cn(
                                'flex size-8 items-center justify-center rounded-lg border',
                                active
                                  ? 'border-[#E5A918]/45 bg-[#E5A918]/15 text-[#F5C443]'
                                  : 'border-white/12 bg-white/[0.04] text-[#C8C0B2]'
                              )}>
                                {cmd.icon}
                              </div>
                            )}
                          </div>

                          <div className="relative z-10 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {cmd.code && (
                                <span className="font-mono text-xs font-semibold text-[#E5A918]/85">
                                  {cmd.code}
                                </span>
                              )}
                              <span className="truncate text-xs font-semibold sm:text-sm">
                                {cmd.label}
                              </span>
                            </div>
                            {cmd.subtitle && (
                              <div className="truncate text-xs text-[#A9A192]">
                                {cmd.subtitle}
                              </div>
                            )}
                          </div>

                          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                            {cmd.badge && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs font-medium',
                                  cmd.picked
                                    ? 'border-[#2DD4BF]/45 bg-[#19857B]/25 text-[#5EEAD4]'
                                    : 'border-white/15 bg-white/[0.06] text-[#D8D0C2]'
                                )}
                              >
                                {cmd.thumbUrl &&
                                  (cmd.picked ? (
                                    <CheckIcon className="size-3" />
                                  ) : (
                                    <PlusIcon className="size-3" />
                                  ))}
                                <span>{cmd.badge}</span>
                              </span>
                            )}
                            {active && (
                              <CornerDownLeftIcon className="size-3.5 text-[#E5A918]" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部机械键帽操作图例（集中暴露全站常用快捷键） */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/40 px-4 py-2.5 font-mono text-xs text-[#B5AEA2]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-white/15 bg-gradient-to-b from-[#2A2824] to-[#171614] px-1.5 py-0.5 text-xs text-[#F5F1E8] shadow-[0_1.5px_0_rgba(0,0,0,0.7)]">↑↓</kbd>
              <span>选择</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-white/15 bg-gradient-to-b from-[#2A2824] to-[#171614] px-1.5 py-0.5 text-xs text-[#F5F1E8] shadow-[0_1.5px_0_rgba(0,0,0,0.7)]">↵</kbd>
              <span>执行 / 锁卡</span>
            </span>
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <kbd className="rounded border border-white/15 bg-gradient-to-b from-[#2A2824] to-[#171614] px-1.5 py-0.5 text-xs text-[#F5F1E8] shadow-[0_1.5px_0_rgba(0,0,0,0.7)]">/</kbd>
              <span>搜图</span>
            </span>
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <kbd className="rounded border border-white/15 bg-gradient-to-b from-[#2A2824] to-[#171614] px-1.5 py-0.5 text-xs text-[#F5F1E8] shadow-[0_1.5px_0_rgba(0,0,0,0.7)]">F</kbd>
              <span>筛选</span>
            </span>
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <kbd className="rounded border border-white/15 bg-gradient-to-b from-[#2A2824] to-[#171614] px-1.5 py-0.5 text-xs text-[#F5F1E8] shadow-[0_1.5px_0_rgba(0,0,0,0.7)]">⌘↵</kbd>
              <span>工作台生图</span>
            </span>
          </div>
          <span className="text-[#F5C443]">CASTDECK · ⌘K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
