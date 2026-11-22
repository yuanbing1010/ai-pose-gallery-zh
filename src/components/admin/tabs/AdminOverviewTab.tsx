import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TicketIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { invalidateMioGalleryCache } from '@/api/gallery'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  fetchAdminMioSyncStatusApi,
  fetchAdminOverviewApi,
  fetchAdminR2CleanupApi,
  runAdminMioSyncApi,
  runAdminR2CleanupApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type { AdminOverviewPayload, AdminR2CleanupReport, MioSyncStatus } from '@/types/gallery'
import { PROVIDER_META } from '../../../../shared/studio'
import {
  AdminBadge,
  AdminMetricGrid,
  AdminPageHeader,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  formatAdminBytes,
  formatAdminDateTime,
  type AdminConfirmAction,
  type AdminTab,
} from '../auditHelpers'

interface AdminOverviewTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onSelectTab: (tab: AdminTab) => void
  onQuickCreateUser: () => void
}

const TREND_CHART_CONFIG = {
  jobsSucceeded: {
    label: '成功出图',
    color: '#059669',
  },
  jobsFailed: {
    label: '失败任务',
    color: '#dc2626',
  },
} satisfies ChartConfig

export function AdminOverviewTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onSelectTab,
  onQuickCreateUser,
}: AdminOverviewTabProps) {
  const queryClient = useQueryClient()
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [r2Report, setR2Report] = useState<AdminR2CleanupReport | null>(null)
  const [mioSync, setMioSync] = useState<MioSyncStatus | null>(null)
  const [loadingCleanup, setLoadingCleanup] = useState(false)
  const [runningCleanup, setRunningCleanup] = useState(false)
  const [syncingMio, setSyncingMio] = useState(false)

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const [ov, r2, mio] = await Promise.all([
        fetchAdminOverviewApi(),
        fetchAdminR2CleanupApi().catch(() => null),
        fetchAdminMioSyncStatusApi().catch(() => null),
      ])
      setOverview(ov)
      if (r2) setR2Report(r2)
      if (mio) setMioSync(mio)
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

  const handleScanR2 = async () => {
    setLoadingCleanup(true)
    try {
      const report = await fetchAdminR2CleanupApi()
      setR2Report(report)
      toast.success('已完成存储空间扫描')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '扫描 R2 失败')
    } finally {
      setLoadingCleanup(false)
    }
  }

  const executeRunCleanup = async () => {
    setRunningCleanup(true)
    try {
      const res = await runAdminR2CleanupApi()
      toast.success(
        `已清理 ${res.deletedStylesCount} 张孤儿画风图与 ${res.deletedStitchedCount} 张过期拼图（释放 ${formatAdminBytes(res.freedBytes)}）`
      )
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清理失败')
    } finally {
      setRunningCleanup(false)
    }
  }

  const handleRunCleanup = () => {
    const count = (r2Report?.orphanStyleKeysCount ?? 0) + (r2Report?.expiredStitchedCount ?? 0)
    if (!r2Report || count === 0) return
    const freableBytes = (r2Report.orphanStyleBytes ?? 0) + (r2Report.expiredStitchedBytes ?? 0)
    onConfirm({
      title: '确认清理 R2 冗余对象？',
      description: `即将永久删除 ${r2Report.orphanStyleKeysCount} 张孤儿画风图与 ${r2Report.expiredStitchedCount} 张超过 24 小时的临时拼图（预计释放 ${formatAdminBytes(freableBytes)}）。操作不可恢复，不会影响用户参考原图与已生成历史作品。`,
      confirmLabel: `确认清理 (${count})`,
      destructive: true,
      run: executeRunCleanup,
    })
  }

  const handleSyncMio = async () => {
    setSyncingMio(true)
    try {
      const res = await runAdminMioSyncApi()
      setMioSync(res)
      invalidateMioGalleryCache()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery', 'poses'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery', 'costumes'] }),
      ])
      toast.success(
        `同步完成：姿势 ${res.poseCount} 项、服装 ${res.costumeCount} 套（原站更新于 ${res.generated || '未知'}）`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步霧島澪档案失败')
    } finally {
      setSyncingMio(false)
    }
  }

  const registrationClosed = overview?.allowRegistration === false
  const trend7d = overview?.trend7d ?? []
  const recentFailures = overview?.recentFailures ?? []
  const staleCount = overview?.staleProcessingCount ?? 0
  const cleanableCount =
    (r2Report?.orphanStyleKeysCount ?? 0) + (r2Report?.expiredStitchedCount ?? 0)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="系统运营与资源总览"
        description="成员准入控制、积分账本、近 7 日生成趋势、画笔路由与 R2 存储运维总览。"
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
              onClick={() => onSelectTab('access')}
            >
              <SlidersHorizontalIcon className="size-3.5" />
              准入与生图链路
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

      {staleCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <span>
              检测到 <span className="font-mono font-bold">{staleCount}</span> 笔生图任务处于处理中已超过 2 分钟（超时任务超过 5 分钟将由后台自动回收并全额退还积分）。
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('jobs')}
            className="inline-flex items-center gap-1 font-mono text-xs font-bold underline underline-offset-2"
          >
            前往审计日志
            <ArrowRightIcon className="size-3" />
          </button>
        </div>
      )}

      {overview && ((overview.jobsProcessing ?? 0) > 0 || (overview.jobsQueued ?? 0) > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-sky-600/40 bg-sky-500/10 px-4 py-3 text-xs text-sky-900 dark:text-sky-200">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-bold">实时任务队列：</span>
            <span>
              执行中 <span className="font-mono font-bold">{overview.jobsProcessing}</span> · 排队等待{' '}
              <span className="font-mono font-bold">{overview.jobsQueued ?? 0}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('queue')}
            className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-bold underline underline-offset-2"
          >
            <span>查看队列与并发</span>
            <ArrowRightIcon className="size-3" />
          </button>
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
            onClick={() => onSelectTab('access')}
            className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-zinc-800 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white"
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
            hint: '管理画笔档位、分辨率定价与容灾路由',
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

      {/* 近 7 日趋势与异常告警 */}
      <div className="grid gap-6 lg:grid-cols-12">
        <AdminPanel
          title="近 7 日生成任务趋势（北京时间）"
          subtitle="统计每日成功出图与失败重试任务量。"
          className="lg:col-span-7"
          headerRight={
            <span className="font-mono text-xs text-zinc-500">
              7日总计 {trend7d.reduce((acc, d) => acc + d.jobsTotal, 0)} 次 · 消耗{' '}
              {trend7d.reduce((acc, d) => acc + d.creditsConsumed, 0)} 积分
            </span>
          }
        >
          {trend7d.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">暂无趋势数据</div>
          ) : (
            <ChartContainer config={TREND_CHART_CONFIG} className="h-[240px] w-full">
              <AreaChart data={trend7d} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize={12}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  dataKey="jobsSucceeded"
                  type="monotone"
                  fill="var(--color-jobsSucceeded)"
                  fillOpacity={0.18}
                  stroke="var(--color-jobsSucceeded)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="jobsFailed"
                  type="monotone"
                  fill="var(--color-jobsFailed)"
                  fillOpacity={0.15}
                  stroke="var(--color-jobsFailed)"
                  strokeWidth={1.75}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </AdminPanel>

        <AdminPanel
          title={`最近失败任务告警 (${recentFailures.length})`}
          subtitle="近期失败且已自动退还积分的任务，点击可直达全链路排障页。"
          className="lg:col-span-5"
          padded={false}
          headerRight={
            <button
              type="button"
              onClick={() => onSelectTab('jobs')}
              className="font-mono text-xs font-semibold text-zinc-600 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
            >
              全部日志
            </button>
          }
        >
          {recentFailures.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              近期无失败生成任务，各供应商链路运行稳定。
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentFailures.map((f) => (
                <Link
                  key={f.id}
                  to="/admin/jobs/$jobId"
                  params={{ jobId: f.id }}
                  className="block px-4 py-3 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold">
                      @{f.username || f.id.slice(0, 8)} ·{' '}
                      {PROVIDER_META[f.provider]?.shortName || f.provider}
                      {f.profileName ? ` (${f.profileName})` : ''}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-500">
                      {formatAdminDateTime(f.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs text-red-600 dark:text-red-400">
                    {f.errorMessage || '上游请求失败'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </AdminPanel>
      </div>

      {/* R2 存储维护 */}
      <AdminPanel
        title="R2 对象存储巡检与冗余清理"
        subtitle="清理画风预设编辑留下的孤儿示意图（styles/），以及超过 24 小时的临时拼图（stitched）；不会触碰用户原图与生成作品。"
        icon={<HardDriveIcon className="size-3.5" />}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_SM_CLS}
              disabled={loadingCleanup || runningCleanup}
              onClick={() => void handleScanR2()}
            >
              {loadingCleanup ? <LoaderCircleIcon className="size-3 animate-spin" /> : null}
              重新扫描
            </Button>
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_SM_CLS}
              disabled={runningCleanup || cleanableCount === 0}
              onClick={() => void handleRunCleanup()}
            >
              {runningCleanup ? (
                <LoaderCircleIcon className="size-3 animate-spin" />
              ) : (
                <Trash2Icon className="size-3" />
              )}
              清理冗余对象 ({cleanableCount})
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">孤儿画风示意图 (styles/)</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {r2Report ? `${r2Report.orphanStyleKeysCount} 个` : '—'}
              {r2Report ? (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  ({formatAdminBytes(r2Report.orphanStyleBytes)})
                </span>
              ) : null}
            </div>
          </div>
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">过期合成拼图 (&gt; 24 小时)</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {r2Report ? `${r2Report.expiredStitchedCount} 个` : '—'}
              {r2Report ? (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  ({formatAdminBytes(r2Report.expiredStitchedBytes)})
                </span>
              ) : null}
            </div>
          </div>
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">累计临时拼图总量</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {r2Report ? `${r2Report.totalStitchedCount} 个` : '—'}
              {r2Report ? (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  ({formatAdminBytes(r2Report.totalStitchedBytes)})
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </AdminPanel>

      {/* 外部图库定期同步（霧島澪 · 设计档案） */}
      <AdminPanel
        title="外部参考档案定期同步（霧島澪 · 设计档案）"
        subtitle="每日 20:30 (Asia/Shanghai) 由 Worker Cron 自动拉取 sleepyzone.online/mio-design-archive/ 最新姿势与服装元数据至 R2；图片由原站在线加载，版权归原网站及 霧島澪（@Mio_2am）所有。"
        icon={<RefreshCwIcon className="size-3.5" />}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            {mioSync?.synced ? (
              <AdminBadge tone="success">已同步云端增量</AdminBadge>
            ) : (
              <AdminBadge tone="neutral">使用随包静态快照</AdminBadge>
            )}
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_SM_CLS}
              disabled={syncingMio}
              onClick={() => void handleSyncMio()}
            >
              {syncingMio ? (
                <LoaderCircleIcon className="size-3 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3" />
              )}
              立即同步
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-xs sm:grid-cols-4">
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">原站生成日期</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {mioSync?.generated || '—'}
            </div>
          </div>
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">同步姿势 / 服装</div>
            <div className="mt-1 font-mono text-sm font-bold">
              {mioSync?.synced ? `${mioSync.poseCount} / ${mioSync.costumeCount}` : '—'}
            </div>
          </div>
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">上次成功同步</div>
            <div className="mt-1 font-mono text-xs font-semibold">
              {mioSync?.syncedAt ? formatAdminDateTime(mioSync.syncedAt) : '尚未触发'}
            </div>
          </div>
          <div className="border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-zinc-500">最近检查状态</div>
            <div className="mt-1 font-mono text-xs font-semibold">
              {mioSync?.lastError
                ? `异常：${mioSync.lastError}`
                : mioSync?.checkedAt
                  ? `正常 · ${formatAdminDateTime(mioSync.checkedAt)}`
                  : '等待 Cron 或手动触发'}
            </div>
          </div>
        </div>
      </AdminPanel>

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
              <div className="mt-0.5 text-xs text-zinc-500">
                配置初始密码、内部备注与初始积分并复制登录凭证
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('users')}
            className="flex items-start gap-3 border border-zinc-200 p-3.5 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900/50"
          >
            <UsersIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">成员备注与账本流水</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                按备注搜人、调积分、重置密码或检索积分账本
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
              <div className="mt-0.5 text-xs text-zinc-500">
                批量发放充值卡密，成员前端自助核销
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('api')}
            className="flex items-start gap-3 border border-zinc-200 p-3.5 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900/50"
          >
            <SparklesIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">画笔档位与路由调度</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                查看并调整画师档位定价与多渠道容灾
              </div>
            </div>
          </button>
        </div>
      </AdminPanel>
    </div>
  )
}
