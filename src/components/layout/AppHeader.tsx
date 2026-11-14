import { Link, useMatches } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { DicesIcon, ShieldCheckIcon, SparklesIcon, TerminalSquareIcon } from 'lucide-react'
import { Fragment } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useStudio } from '@/store/studioStore'

export function AppHeader() {
  const { recipe, randomizeRecipe, safeMode, toggleSafeMode } = useStudio()
  const qc = useQueryClient()
  const crumbs = useMatches({
    select: (matches) =>
      matches.filter((m) => m.staticData.title).map((m) => ({ title: m.staticData.title!, path: m.pathname })),
  })

  const selectedCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  const handleRandom = async () => {
    const [posesRes, costumes, portraits] = await Promise.all([
      qc.ensureQueryData(posesQuery),
      qc.ensureQueryData(costumesQuery),
      qc.ensureQueryData(portraitsQuery),
    ])
    randomizeRecipe({
      poses: posesRes.items,
      costumes,
      portraits,
    })
  }

  return (
    <header className="@container/header sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/75 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger className="-ml-1 rounded-xl" />
      <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => (
            <Fragment key={c.path}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage className="truncate font-bold tracking-tight">{c.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={c.path}>{c.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 @lg/header:gap-2">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          type="button"
          onClick={toggleSafeMode}
          title={safeMode ? '当前已开启安全模式（已隐藏 18+ 敏感内容），点击可解锁完整图库' : '当前已显示 18+ 完整图库，点击可切回安全模式'}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
            safeMode
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300'
          }`}
        >
          <ShieldCheckIcon className="size-3.5" />
          <span className="hidden @3xl/header:inline">{safeMode ? '安全模式 (SFW)' : '18+ 完整模式'}</span>
          <span className="@3xl/header:hidden">{safeMode ? 'SFW' : '18+'}</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.92, rotate: -6 }}
          type="button"
          onClick={handleRandom}
          className="hidden h-8 items-center gap-1.5 rounded-full border border-indigo-500/25 bg-card/90 px-3 text-xs font-semibold shadow-2xs transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/8 @3xl/header:inline-flex"
        >
          <DicesIcon className="size-3.5 text-indigo-500" />
          <span>随机捏人</span>
        </motion.button>

        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}>
          <Link
            to="/studio"
            aria-label={`AI 合成台，已选 ${selectedCount} 项参考图`}
            className="holo-gradient inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25"
          >
            <SparklesIcon className="size-3.5" />
            <span className="hidden @xl/header:inline">AI 合成台</span>
            <span className="rounded-full bg-white/25 px-1.5 py-0.2 font-mono text-[11px] font-bold backdrop-blur-xs">
              {selectedCount}/3
            </span>
          </Link>
        </motion.div>

        <ThemeToggle />

        {/* 右上角独立管理端入口：点击进入管理端登录页 (/admin/login) */}
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}>
          <Link
            to="/admin/login"
            title="进入管理端系统"
            aria-label="进入管理端系统"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 text-xs font-semibold text-muted-foreground shadow-2xs transition-colors hover:border-foreground/50 hover:text-foreground"
          >
            <TerminalSquareIcon className="size-3.5" />
            <span className="hidden @2xl/header:inline">管理端</span>
          </Link>
        </motion.div>
      </div>
    </header>
  )
}
