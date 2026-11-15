import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router'
import { AccountModal } from '@/components/auth/AccountModal'
import { AuthModal } from '@/components/auth/AuthModal'
import { RecipeDock } from '@/components/layout/RecipeDock'
import { ShowcaseNavbar } from '@/components/layout/ShowcaseNavbar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
})

function RootLayout() {
  const pathname = useLocation({ select: (l) => l.pathname })

  // 管理端（/admin/login 与 /admin）是独立系统，拥有独立的瑞士极简布局
  if (pathname.startsWith('/admin')) {
    return (
      <TooltipProvider>
        <Outlet />
        <Toaster />
      </TooltipProvider>
    )
  }

  const isHome = pathname === '/'
  const isStudio = pathname.startsWith('/studio')

  return (
    <TooltipProvider>
      <div
        className={
          isHome
            ? 'sk-grid-bg relative flex h-dvh flex-col overflow-hidden bg-background text-foreground'
            : isStudio
              ? 'sk-grid-bg relative flex min-h-dvh flex-col bg-background text-foreground md:h-dvh md:overflow-hidden'
              : 'sk-grid-bg relative flex min-h-dvh flex-col bg-background text-foreground'
        }
      >
        <ShowcaseNavbar />
        <main
          className={
            isHome
              ? '@container/main relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : isStudio
                ? '@container/main relative z-10 flex min-w-0 flex-1 flex-col md:min-h-0 md:overflow-hidden'
                : '@container/main relative z-10 flex min-w-0 flex-1 flex-col'
          }
        >
          <div
            className={
              isHome
                ? 'mx-auto flex min-h-0 min-w-0 w-full max-w-[1440px] flex-1 flex-col'
                : isStudio
                  ? 'mx-auto flex min-w-0 w-full max-w-[1440px] flex-1 flex-col gap-2 px-4 pt-2 pb-2 sm:px-6 md:min-h-0 md:overflow-hidden'
                  : 'mx-auto flex min-w-0 w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 pt-6 pb-12 sm:px-6'
            }
          >
            <Outlet />
          </div>
          <RecipeDock />
        </main>
      </div>
      <AuthModal />
      <AccountModal />
      <Toaster />
    </TooltipProvider>
  )
}
