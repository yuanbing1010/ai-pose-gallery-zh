import type { LinkProps } from '@tanstack/react-router'
import {
  DicesIcon,
  ImagesIcon,
  LayoutGridIcon,
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
  { code: '01', title: '动作姿势', to: '/poses', icon: PersonStandingIcon },
  { code: '02', title: '服装穿搭', to: '/costumes', icon: ShirtIcon },
  { code: '03', title: '人像颜值', to: '/portraits', icon: UserRoundIcon },
  { code: '04', title: '配方创作台', to: '/studio', icon: SparklesIcon },
  { code: '05', title: '灵感画廊', to: '/gallery', icon: ImagesIcon },
  { code: '06', title: '盲盒抽卡', to: '/blindbox', icon: DicesIcon },
  { code: '07', title: '无限画布', to: '/canvas', icon: LayoutGridIcon },
]

export function activeNavTo(pathname: string): string | undefined {
  let best: string | undefined
  for (const { to } of NAV_ITEMS) {
    const hit = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
    if (hit && (!best || to.length > best.length)) best = to
  }
  return best
}

export const COMMAND_PALETTE_OPEN_EVENT = 'castdeck:open-command-palette'

export function openGlobalCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT))
}
