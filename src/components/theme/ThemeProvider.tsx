import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark' | 'system'

export interface ThemeTransitionOrigin {
  x: number
  y: number
}

const THEME_STORAGE_KEY = 'todaynew-admin:theme'
const THEME_COLOR_LIGHT = '#f7f6f2'
const THEME_COLOR_DARK = '#121110'

function syncDocumentTheme(resolved: 'light' | 'dark') {
  const isDark = resolved === 'dark'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = resolved
  const color = isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  if (metas.length > 0) {
    metas.forEach((meta) => {
      meta.setAttribute('content', color)
    })
  } else {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = color
    document.head.appendChild(meta)
  }
}

interface ThemeState {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: Theme, origin?: ThemeTransitionOrigin) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const v = localStorage.getItem(THEME_STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'light'
}

type DocWithViewTransition = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> }
}

function runWithViewTransition(
  applyDomAndState: () => void,
  origin?: ThemeTransitionOrigin
) {
  const doc = document as DocWithViewTransition
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!doc.startViewTransition || reducedMotion) {
    applyDomAndState()
    return
  }

  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? 28
  const maxRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )

  const transition = doc.startViewTransition(() => {
    flushSync(() => {
      applyDomAndState()
    })
  })

  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 380,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      )
    })
    .catch(() => {
      // Fallback silently if view transition is interrupted
    })
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemDark(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light'

  useEffect(() => {
    syncDocumentTheme(resolvedTheme)
    document.documentElement.removeAttribute('data-skin')
  }, [resolvedTheme])

  const setTheme = (t: Theme, origin?: ThemeTransitionOrigin) => {
    localStorage.setItem(THEME_STORAGE_KEY, t)
    const nextResolved: 'light' | 'dark' =
      t === 'dark' || (t === 'system' && systemDark) ? 'dark' : 'light'

    if (nextResolved === resolvedTheme) {
      setThemeState(t)
      return
    }

    runWithViewTransition(() => {
      setThemeState(t)
      syncDocumentTheme(nextResolved)
    }, origin)
  }

  return <ThemeContext value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext>
}

// oxlint-disable-next-line react/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
