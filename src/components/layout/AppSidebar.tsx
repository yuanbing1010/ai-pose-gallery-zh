import { Link, useLocation } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { ExternalLinkIcon, LayersIcon, SparklesIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useStudio } from '@/store/studioStore'
import { activeNavTo, navGroups } from './nav'

export function AppSidebar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const active = activeNavTo(pathname)
  const { recipe } = useStudio()
  const count = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60 bg-sidebar/85 backdrop-blur-xl">
      <SidebarHeader className="px-3 pt-3 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="rounded-2xl">
              <Link to="/">
                <div className="holo-gradient flex aspect-square size-8 items-center justify-center rounded-xl text-white shadow-md shadow-indigo-500/25">
                  <LayersIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-extrabold tracking-tight">POSE &amp; CHARACTER</span>
                  <span className="truncate text-[11px] text-muted-foreground">AI 角色灵感与合成实验室</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-bold tracking-wider text-muted-foreground">
              {group.label.split('//')[1]?.trim() || group.label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              {group.items.map((item) => {
                const isActive = item.to === active
                return (
                  <SidebarMenuItem key={item.to} className="relative">
                    {isActive && (
                      <motion.div
                        layoutId="showcase-sidebar-active"
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 rounded-xl bg-accent ring-1 ring-border"
                      />
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className="relative z-10 rounded-xl data-[active=true]:bg-transparent data-[active=true]:text-indigo-700 dark:data-[active=true]:text-indigo-300"
                    >
                      <Link to={item.to}>
                        <item.icon className={isActive ? 'text-indigo-600 dark:text-indigo-400' : ''} />
                        <span className="flex-1 truncate">{item.title}</span>
                        {item.badge && item.badge !== '[ALL]' && item.badge !== '[CFG]' && item.badge !== '[DOC]' && (
                          <span
                            className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              item.to === '/studio'
                                ? 'holo-gradient text-white shadow-2xs'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {item.to === '/studio' ? 'PRO' : item.badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu className="gap-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="当前角色配方"
              className="rounded-2xl border border-border bg-muted/60 p-2.5 hover:border-foreground/40"
            >
              <Link to="/studio">
                <div className="holo-gradient flex aspect-square size-8 items-center justify-center rounded-xl text-white shadow-sm">
                  <SparklesIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-xs leading-tight">
                  <span className="truncate font-bold">角色配方舱 ({count}/3)</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {count === 0 ? '点击挑选人像·服装·姿势' : '液态配方就绪 · 去合成'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" asChild tooltip="访问 GitHub 仓库" className="rounded-xl">
              <a
                href="https://github.com/anhao/ai-pose-gallery-zh"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground"
              >
                <ExternalLinkIcon className="size-3.5" />
                <span>GitHub · @anhao_ai</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
