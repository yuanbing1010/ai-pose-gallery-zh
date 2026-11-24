/**
 * 全站统一物理动效与缓动曲线契约（对齐 DESIGN.md & src/index.css）
 * - EASE_OUT: 常规 UI 进出场与反馈（与 CSS --ease-out 一致）
 * - EASE_IN_OUT: 屏内位移动效（与 CSS --ease-in-out 一致）
 * - EASE_DRAWER: 抽屉/面板滑入曲线（与 CSS --ease-drawer 一致）
 */
export const MOTION_EASE_OUT = [0.23, 1, 0.32, 1] as const
export const MOTION_EASE_IN_OUT = [0.77, 0, 0.175, 1] as const
export const MOTION_EASE_DRAWER = [0.32, 0.72, 0, 1] as const

export const MOTION_SPRING_CRISP = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 34,
}

export const MOTION_SPRING_TACTILE = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 26,
  mass: 0.85,
}

let cachedReducedMotionMql: MediaQueryList | null = null

/**
 * 复用单例 MediaQueryList 读取系统减动偏好，避免在 60–120fps pointermove 中重复构造 matchMedia。
 */
export function prefersReducedMotionNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  if (!cachedReducedMotionMql) {
    cachedReducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)')
  }
  return cachedReducedMotionMql.matches
}
