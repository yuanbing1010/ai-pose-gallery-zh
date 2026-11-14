import type { LinkProps } from '@tanstack/react-router'
import {
  BookOpenIcon,
  LayoutDashboardIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  code: string
  title: string
  to: NonNullable<LinkProps['to']>
  icon: LucideIcon
  badge?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'DIRECTORY // 核心索引',
    items: [
      { code: '00', title: '图库总览', to: '/', icon: LayoutDashboardIcon, badge: '[ALL]' },
      { code: '01', title: '动作姿势库', to: '/poses', icon: PersonStandingIcon, badge: '1439' },
      { code: '02', title: '服装穿搭库', to: '/costumes', icon: ShirtIcon, badge: '3224' },
      { code: '03', title: '人像颜值库', to: '/portraits', icon: UserRoundIcon, badge: '1499' },
      { code: '04', title: 'AI 角色合成台', to: '/studio', icon: SparklesIcon, badge: '->' },
    ],
  },
  {
    label: 'SYSTEM // 配置与说明',
    items: [
      { code: '05', title: '使用说明与免责声明', to: '/guide', icon: BookOpenIcon, badge: '[DOC]' },
    ],
  },
]

const allItems = navGroups.flatMap((g) => g.items)

export function activeNavTo(pathname: string): string | undefined {
  let best: string | undefined
  for (const { to } of allItems) {
    const hit = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
    if (hit && (!best || to.length > best.length)) best = to
  }
  return best
}
