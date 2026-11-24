import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { RecipeDock } from '@/components/layout/RecipeDock'
import { ShowcaseNavbar } from '@/components/layout/ShowcaseNavbar'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname })
  const isPortalFullBleed = pathname === '/' || pathname === '/gallery'
  const isStudio = pathname.startsWith('/studio')
  const isCanvas = pathname.startsWith('/canvas')
  const isHomeBlindbox = pathname === '/blindbox'

  return (
    <div
      className={cn(
        'sk-grid-bg relative flex flex-col bg-background text-foreground',
        isHomeBlindbox || isCanvas
          ? 'h-dvh overscroll-none overflow-hidden'
          : isStudio
            ? 'min-h-dvh md:h-dvh md:overscroll-none md:overflow-hidden'
            : 'min-h-dvh'
      )}
    >
      {/* 极细微暖和纸纹理层（仅视觉氛围，零交互阻断） */}
      <div
        aria-hidden="true"
        className="ks-paper-grain pointer-events-none fixed inset-0 z-0 opacity-[0.025] dark:opacity-[0.03]"
      />

      <ShowcaseNavbar />

      <main
        className={cn(
          '@container/main relative z-10 flex min-w-0 flex-1 flex-col',
          isHomeBlindbox || isCanvas
            ? 'min-h-0 overflow-hidden'
            : isStudio
              ? 'md:min-h-0 md:overflow-hidden'
              : ''
        )}
      >
        <div
          className={cn(
            'mx-auto flex w-full min-w-0 flex-1 flex-col',
            isCanvas
              ? 'min-h-0 w-full overflow-hidden'
              : isPortalFullBleed
                ? 'w-full'
                : isHomeBlindbox
                  ? 'max-w-[1440px] min-h-0 overflow-hidden'
                  : isStudio
                    ? 'max-w-[1440px] md:min-h-0 md:overflow-hidden'
                    : 'max-w-[1440px] gap-6 px-4 pt-6 pb-28 sm:px-6 lg:px-8'
          )}
        >
          {children}
        </div>
        <RecipeDock />
      </main>
    </div>
  )
}
