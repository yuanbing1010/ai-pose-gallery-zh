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
}

export const NAV_ITEMS: NavItem[] = [
  { code: '00', title: '盲盒抽卡', to: '/', icon: LayoutDashboardIcon },
  { code: '01', title: '动作姿势', to: '/poses', icon: PersonStandingIcon },
  { code: '02', title: '服装穿搭', to: '/costumes', icon: ShirtIcon },
  { code: '03', title: '人像颜值', to: '/portraits', icon: UserRoundIcon },
  { code: '04', title: '使用指南', to: '/guide', icon: BookOpenIcon },
  { code: '05', title: 'AI 合成台', to: '/studio', icon: SparklesIcon },
]

export function activeNavTo(pathname: string): string | undefined {
  let best: string | undefined
  for (const { to } of NAV_ITEMS) {
    const hit = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
    if (hit && (!best || to.length > best.length)) best = to
  }
  return best
}
