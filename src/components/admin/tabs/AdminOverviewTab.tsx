import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIcon,
  ArrowRightIcon,
  LockIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TicketIcon,
  UserPlusIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchAdminOverviewApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type { AdminOverviewPayload } from '@/types/gallery'
import {
  AdminBadge,
  AdminMetricGrid,
  AdminPageHeader,
  AdminPanel,
} from '../AdminPrimitives'
import { ADMIN_BTN_CLS, formatAdminBytes, type AdminTab } from '../auditHelpers'

interface AdminOverviewTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onSelectTab: (tab: AdminTab) => void
  onQuickCreateUser: () => void
}

export function AdminOverviewTab({
  reloadTick,
  onLoadingChange,
  onSelectTab,
  onQuickCreateUser,
}: AdminOverviewTabProps) {
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      setOverview(await fetchAdminOverviewApi())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载总览数据失败')
    } finally {
      onLoadingChange(false)
    }
  }, [onLoadingChange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData, reloadTick])

  const registrationClosed = overview?.allowRegistration === false

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="系统运营与资源总览"
        description="成员准入控制、积分账本、模型路由渠道与云端对象存储实时统计。"
        actions={
          <>
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_CLS}
              onClick={onQuickCreateUser}
            >
              <UserPlusIcon className="size-3.5" />
              新建成员账号
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_CLS}
              onClick={() => onSelectTab('safety')}
            >
              <ShieldCheckIcon className="size-3.5" />
              准入与安全策略
            </Button>
          </>
        }
      />

      {overview && !overview.encryptionConfigured && (
        <div className="flex items-center gap-3 border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlertIcon className="size-4 shrink-0" />
          <span>
            未检测到环境变量 <code className="font-mono">APP_ENCRYPTION_KEY</code>
            （当前使用开发降级密钥）。生产部署前请务必运行{' '}
            <code className="font-mono">npx wrangler secret put APP_ENCRYPTION_KEY</code>。
          </span>
        </div>
      )}

      {overview && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-center gap-2.5">
            <LockIcon className="size-3.5 shrink-0 text-zinc-700 dark:text-zinc-300" />
            <span className="font-bold">当前站点准入策略：</span>
            {registrationClosed ? (
              <AdminBadge tone="dark">仅限管理员后台建号</AdminBadge>
            ) : (
              <AdminBadge tone="warning">已开放访客自助注册</AdminBadge>
            )}
            <span className="text-zinc-600 dark:text-zinc-400">
              {registrationClosed
                ? '已关闭访客自助注册，新账号需由管理员在「01. 成员与积分」创建并分发凭证。'
                : '访客可在前端登录弹窗自行注册新账号。'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('safety')}
            className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold text-zinc-800 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white"
          >
            <span>调整策略</span>
            <ArrowRightIcon className="size-3" />
          </button>
        </div>
      )}

      <AdminMetricGrid
        items={[
          {
            code: '01.',
            label: '成员账号总数',
            value: overview?.usersTotal ?? '—',
            hint: `正常活跃：${overview?.activeUsersTotal ?? 0}`,
            onClick: () => onSelectTab('users'),
          },
          {
            code: '02.',
            label: '积分累计消耗',
            value: overview?.creditsConsumedTotal ?? '—',
            hint: `累计发放：${overview?.creditsIssuedTotal ?? 0} · 卡密 ${overview?.redeemCodesTotal ?? 0}`,
            onClick: () => onSelectTab('redeem'),
          },
          {
            code: '03.',
            label: '供应商 / 档位 / 渠道',
            value: overview
              ? `${overview.suppliersTotal} / ${overview.profilesTotal ?? 0} / ${overview.channelsTotal}`
              : '—',
            hint: '管理模型档位、分辨率定价与容灾路由',
            onClick: () => onSelectTab('api'),
          },
          {
            code: '04.',
            label: '云端存储 / 生图审计',
            value: overview ? formatAdminBytes(overview.r2TotalBytes) : '—',
            hint: `成功 ${overview?.jobsSucceeded ?? 0} · 失败 ${overview?.jobsFailed ?? 0} · ${overview?.r2AssetsTotal ?? 0} 对象`,
            onClick: () => onSelectTab('jobs'),
          },
        ]}
      />

      <AdminPanel title="快捷操作入口" subtitle="常用运维动作一键直达。">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={onQuickCreateUser}
            className="flex items-start gap-3 border border-zinc-200 p-3.5 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900/50"
          >
            <UserPlusIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">新建成员账号</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                配置初始密码、内部备注与初始积分并复制登录凭证
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('users')}
            className="flex items-start gap-3 border border-zinc-200 p-3.5 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900/50"
          >
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">查看成员备注与积分</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                按备注搜人、调积分、重置密码或停用账号
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('redeem')}
            className="flex items-start gap-3 border border-zinc-200 p-3.5 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900/50"
          >
            <TicketIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">生成积分兑换码</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                批量发放充值卡密，成员前端自助核销
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('jobs')}
            className="flex items-start gap-3 border border-zinc-200 p-3.5 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900/50"
          >
            <ActivityIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">生图全链路审计</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                查看近期生成任务、渠道切换与报错追踪
              </div>
            </div>
          </button>
        </div>
      </AdminPanel>
    </div>
  )
}
