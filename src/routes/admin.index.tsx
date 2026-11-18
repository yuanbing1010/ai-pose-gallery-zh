import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
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
import { AdminOverviewTab } from '@/components/admin/tabs/AdminOverviewTab'
import { fetchAdminMeApi } from '@/lib/apiClient'
import { useStudio } from '@/store/studioStore'
import type { ImageProviderId, PublicUser } from '@/types/gallery'

const AdminUsersTab = lazy(() =>
  import('@/components/admin/tabs/AdminUsersTab').then((m) => ({ default: m.AdminUsersTab }))
)
const AdminRedeemTab = lazy(() =>
  import('@/components/admin/tabs/AdminRedeemTab').then((m) => ({ default: m.AdminRedeemTab }))
)
const AdminSuppliersTab = lazy(() =>
  import('@/components/admin/tabs/AdminSuppliersTab').then((m) => ({
    default: m.AdminSuppliersTab,
  }))
)
const AdminProvidersTab = lazy(() =>
  import('@/components/admin/tabs/AdminProvidersTab').then((m) => ({
    default: m.AdminProvidersTab,
  }))
)
const AdminJobsTab = lazy(() =>
  import('@/components/admin/tabs/AdminJobsTab').then((m) => ({ default: m.AdminJobsTab }))
)
const AdminStylesTab = lazy(() =>
  import('@/components/admin/tabs/AdminStylesTab').then((m) => ({ default: m.AdminStylesTab }))
)
const AdminAccessTab = lazy(() =>
  import('@/components/admin/tabs/AdminAccessTab').then((m) => ({ default: m.AdminAccessTab }))
)
const AdminPromptsTab = lazy(() =>
  import('@/components/admin/tabs/AdminPromptsTab').then((m) => ({ default: m.AdminPromptsTab }))
)
const AdminSanitizeTab = lazy(() =>
  import('@/components/admin/tabs/AdminSanitizeTab').then((m) => ({
    default: m.AdminSanitizeTab,
  }))
)

export const Route = createFileRoute('/admin/')({
  staticData: { title: '管理端控制台' },
  validateSearch: (search: Record<string, unknown>): { tab?: AdminTab } => {
    const raw = typeof search.tab === 'string' ? search.tab : ''
    if (raw === 'safety') {
      return { tab: 'access' }
    }
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
  const { refreshBootstrap } = useStudio()

  const [sessionChecking, setSessionChecking] = useState(true)
  const [adminUser, setAdminUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [autoOpenCreateUser, setAutoOpenCreateUser] = useState(false)
  const [apiFocusProvider, setApiFocusProvider] = useState<ImageProviderId | null>(null)
  const [tabDirty, setTabDirty] = useState(false)
  const [confirmAction, setConfirmAction] = useState<AdminConfirmAction | null>(null)

  useEffect(() => {
    let active = true
    const verifySession = async () => {
      try {
        const res = await fetchAdminMeApi()
        if (!active) return
        if (!res.user || res.user.role !== 'admin') {
          void navigate({ to: '/admin/login', replace: true })
          return
        }
        setAdminUser(res.user)
      } catch {
        if (!active) return
        void navigate({ to: '/admin/login', replace: true })
      } finally {
        if (active) setSessionChecking(false)
      }
    }
    void verifySession()
    return () => {
      active = false
    }
  }, [navigate])

  useEffect(() => {
    if (!tabDirty) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [tabDirty])

  const commitSwitchTab = useCallback(
    (nextTab: AdminTab) => {
      if (nextTab !== 'users') {
        setAutoOpenCreateUser(false)
      }
      if (nextTab !== 'api') {
        setApiFocusProvider(null)
      }
      setTabDirty(false)
      setTab(nextTab)
    },
    [setTab]
  )

  const handleBeforeLeave = useCallback(
    (proceed: () => void) => {
      if (!tabDirty) {
        proceed()
        return
      }
      setConfirmAction({
        title: '离开当前未保存页面？',
        description: '当前配置页存在尚未保存的更改，离开后这些更改将丢失。确认放弃并离开？',
        confirmLabel: '放弃更改并离开',
        destructive: true,
        run: async () => {
          setTabDirty(false)
          proceed()
        },
      })
    },
    [tabDirty]
  )

  const handleSelectTab = useCallback(
    (nextTab: AdminTab) => {
      if (nextTab === tab) return
      handleBeforeLeave(() => commitSwitchTab(nextTab))
    },
    [tab, handleBeforeLeave, commitSwitchTab]
  )

  if (sessionChecking || !adminUser || adminUser.role !== 'admin') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-xs text-zinc-500 dark:bg-zinc-950">
        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
        正在校验独立管理端会话…
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
    commitSwitchTab('users')
  }

  const handleOpenProviderChannel = (providerId: ImageProviderId) => {
    setApiFocusProvider(providerId)
    commitSwitchTab('api')
  }

  const tabFallback = (
    <div className="flex min-h-[260px] items-center justify-center border border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
      <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
      正在加载管理模块…
    </div>
  )

  return (
    <AdminShell
      activeTab={tab}
      directoryLabel={directoryLabel}
      adminUser={adminUser}
      loading={loading}
      onRefresh={() => setReloadTick((n) => n + 1)}
      onSelectTab={handleSelectTab}
      onBeforeLeave={handleBeforeLeave}
    >
      {tab === 'overview' && (
        <AdminOverviewTab
          reloadTick={reloadTick}
          onLoadingChange={setLoading}
          onConfirm={setConfirmAction}
          onSelectTab={handleSelectTab}
          onQuickCreateUser={handleQuickCreateUser}
        />
      )}

      {tab !== 'overview' && (
        <Suspense fallback={tabFallback}>
          {tab === 'users' && (
            <AdminUsersTab
              currentUser={adminUser}
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
              onOpenProvider={handleOpenProviderChannel}
            />
          )}

          {tab === 'api' && (
            <AdminProvidersTab
              reloadTick={reloadTick}
              initialProvider={apiFocusProvider}
              onLoadingChange={setLoading}
              onConfirm={setConfirmAction}
              onSelectTab={handleSelectTab}
              onRefreshBootstrap={refreshBootstrap}
            />
          )}

          {tab === 'jobs' && (
            <AdminJobsTab reloadTick={reloadTick} onLoadingChange={setLoading} />
          )}

          {tab === 'styles' && (
            <AdminStylesTab
              reloadTick={reloadTick}
              onLoadingChange={setLoading}
              onConfirm={setConfirmAction}
              onRefreshBootstrap={refreshBootstrap}
            />
          )}

          {tab === 'access' && (
            <AdminAccessTab
              reloadTick={reloadTick}
              onLoadingChange={setLoading}
              onRefreshBootstrap={refreshBootstrap}
              onDirtyChange={setTabDirty}
            />
          )}

          {tab === 'prompts' && (
            <AdminPromptsTab
              reloadTick={reloadTick}
              onLoadingChange={setLoading}
              onRefreshBootstrap={refreshBootstrap}
              onDirtyChange={setTabDirty}
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
        </Suspense>
      )}

      <AdminConfirmDialog
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
      />
    </AdminShell>
  )
}
