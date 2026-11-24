import { Suspense, lazy } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useStudioShallow } from '@/store/studioStore'

const CommandPalette = lazy(() =>
  import('@/components/layout/CommandPalette').then((m) => ({ default: m.CommandPalette }))
)
const AuthModal = lazy(() =>
  import('@/components/auth/AuthModal').then((m) => ({ default: m.AuthModal }))
)
const AccountModal = lazy(() =>
  import('@/components/auth/AccountModal').then((m) => ({ default: m.AccountModal }))
)

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
})

function RootLayout() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const isAdmin = pathname.startsWith('/admin')
  const { authModalOpen, accountModalOpen } = useStudioShallow((s) => ({
    authModalOpen: s.authModalOpen,
    accountModalOpen: s.accountModalOpen,
  }))

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300} skipDelayDuration={300}>
        {isAdmin ? (
          <Outlet />
        ) : (
          <>
            <AppShell>
              <Outlet />
            </AppShell>
            <Suspense fallback={null}>
              <CommandPalette />
              {authModalOpen && <AuthModal />}
              {accountModalOpen && <AccountModal />}
            </Suspense>
          </>
        )}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  )
}
