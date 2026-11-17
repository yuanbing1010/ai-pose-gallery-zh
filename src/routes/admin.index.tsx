import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LoaderCircleIcon } from 'lucide-react'
import { AdminConfirmDialog } from '@/components/admin/AdminPrimitives'
import { AdminShell } from '@/components/admin/AdminShell'
import {
  ADMIN_TABS,
  getAdminNavItems,
  type AdminConfirmAction,
  type AdminTab,
} from '@/components/admin/auditHelpers'
import { AdminJobsTab } from '@/components/admin/tabs/AdminJobsTab'
import { AdminOverviewTab } from '@/components/admin/tabs/AdminOverviewTab'
import { AdminProvidersTab } from '@/components/admin/tabs/AdminProvidersTab'
import { AdminRedeemTab } from '@/components/admin/tabs/AdminRedeemTab'
import { AdminSafetyTab } from '@/components/admin/tabs/AdminSafetyTab'
import { AdminSanitizeTab } from '@/components/admin/tabs/AdminSanitizeTab'
import { AdminSuppliersTab } from '@/components/admin/tabs/AdminSuppliersTab'
import { AdminUsersTab } from '@/components/admin/tabs/AdminUsersTab'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/admin/')({
  staticData: { title: '管理端控制台' },
  validateSearch: (search: Record<string, unknown>): { tab?: AdminTab } => {
    const raw = typeof search.tab === 'string' ? search.tab : ''
    if (ADMIN_TABS.includes(raw as AdminTab)) {
      return { tab: raw as AdminTab }
    }
    return {}
  },
  component: AdminHomePage,
})

function AdminHomePage() {
  const navigate = useNavigate()
  const { tab: searchTab } = Route.useSearch()
  const tab: AdminTab = searchTab ?? 'overview'
  const setTab = useCallback(
    (nextTab: AdminTab) => {
      void navigate({
        to: '/admin',
        search: nextTab === 'overview' ? {} : { tab: nextTab },
        replace: true,
      })
    },
    [navigate]
  )
  const { user, bootstrapLoaded, refreshBootstrap } = useStudio()

  const [loading, setLoading] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [autoOpenCreateUser, setAutoOpenCreateUser] = useState(false)
  const [confirmAction, setConfirmAction] = useState<AdminConfirmAction | null>(null)

  const handleSelectTab = useCallback(
    (nextTab: AdminTab) => {
      if (nextTab !== 'users') {
        setAutoOpenCreateUser(false)
      }
      setTab(nextTab)
    },
    [setTab]
  )

  useEffect(() => {
    if (!bootstrapLoaded) return
    if (!user || user.role !== 'admin') {
      void navigate({ to: '/admin/login' })
    }
  }, [bootstrapLoaded, navigate, user])

  if (!bootstrapLoaded || !user || user.role !== 'admin') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-xs text-zinc-500 dark:bg-zinc-950">
        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
        正在校验管理员会话…
      </div>
    )
  }

  const navItems = getAdminNavItems()
  const activeNavItem = navItems.find((i) => i.id === tab)
  const directoryLabel = activeNavItem
    ? `${activeNavItem.code}. ${activeNavItem.label}`
    : '00. 系统总览'

  const handleQuickCreateUser = () => {
    setAutoOpenCreateUser(true)
    setTab('users')
  }

  return (
    <AdminShell
      activeTab={tab}
      directoryLabel={directoryLabel}
      loading={loading}
      onRefresh={() => setReloadTick((n) => n + 1)}
      onSelectTab={handleSelectTab}
    >
      {tab === 'overview' && (
        <AdminOverviewTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onSelectTab={handleSelectTab}
          onQuickCreateUser={handleQuickCreateUser}
        />
      )}

      {tab === 'users' && (
        <AdminUsersTab
          currentUser={user}
          reloadTick={reloadTick}
          autoOpenCreate={autoOpenCreateUser}
          onAutoOpenConsumed={() => setAutoOpenCreateUser(false)}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
          onRefreshBootstrap={refreshBootstrap}
        />
      )}

      {tab === 'redeem' && (
        <AdminRedeemTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
        />
      )}

      {tab === 'suppliers' && (
        <AdminSuppliersTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
          onRefreshBootstrap={refreshBootstrap}
        />
      )}

      {tab === 'api' && (
        <AdminProvidersTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
          onSelectTab={setTab}
          onRefreshBootstrap={refreshBootstrap}
        />
      )}

      {tab === 'jobs' && (
        <AdminJobsTab reloadTick={reloadTick} onLoadingChange={setLoading} />
      )}

      {tab === 'safety' && (
        <AdminSafetyTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
          onRefreshBootstrap={refreshBootstrap}
        />
      )}

      {tab === 'sanitize' && (
        <AdminSanitizeTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
          onRefreshBootstrap={refreshBootstrap}
        />
      )}

      <AdminConfirmDialog
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
      />
    </AdminShell>
  )
}
