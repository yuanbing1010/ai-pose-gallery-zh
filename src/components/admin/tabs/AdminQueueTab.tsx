import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ActivityIcon,
  BanIcon,
  CheckIcon,
  ClockIcon,
  CpuIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  cancelAdminQueueJobApi,
  fetchAdminQueueApi,
  reconcileAdminQueueApi,
  updateAdminSettingsApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  AdminQueueSnapshotDTO,
  GenerationQueueConfig,
  GenerationQueueWaitReason,
} from '@/types/gallery'
import {
  PROVIDER_META,
  createDefaultGenerationQueueConfig,
  mergeGenerationQueueConfig,
} from '../../../../shared/studio'
import {
  AdminBadge,
  AdminField,
  AdminMetricGrid,
  AdminPageHeader,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_INPUT_CLS,
  formatAdminDateTime,
  type AdminConfirmAction,
} from '../auditHelpers'

interface AdminQueueTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onDirtyChange?: (dirty: boolean) => void
  onRefreshBootstrap: () => Promise<void>
}

const WAIT_REASON_META: Record<
  GenerationQueueWaitReason,
  { label: string; tone: 'warning' | 'info' | 'danger' }
> = {
  model_busy: { label: '画笔并发满', tone: 'warning' },
  user_busy: { label: '个人并发满', tone: 'info' },
  global_busy: { label: '全站并发满', tone: 'danger' },
}

function formatWaitDuration(startMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return `${min}m ${rem}s`
}

export function AdminQueueTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onDirtyChange,
  onRefreshBootstrap,
}: AdminQueueTabProps) {
  const [snapshot, setSnapshot] = useState<AdminQueueSnapshotDTO | null>(null)
  const [draftConfig, setDraftConfig] = useState<GenerationQueueConfig>(() =>
    createDefaultGenerationQueueConfig()
  )
  const [savedConfigJson, setSavedConfigJson] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [clockTick, setClockTick] = useState(() => Date.now())

  const loadSnapshot = useCallback(
    async (opts?: { syncConfig?: boolean; silent?: boolean }) => {
      if (!opts?.silent) onLoadingChange(true)
      try {
        const data = await fetchAdminQueueApi()
        setSnapshot(data)
        setClockTick(Date.now())
        if (opts?.syncConfig) {
          const normalized = mergeGenerationQueueConfig(data.config)
          setDraftConfig(normalized)
          setSavedConfigJson(JSON.stringify(normalized))
        }
      } catch (err) {
        if (!opts?.silent) {
          toast.error(err instanceof Error ? err.message : '加载任务队列与并发状态失败')
        }
      } finally {
        if (!opts?.silent) onLoadingChange(false)
      }
    },
    [onLoadingChange]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSnapshot({ syncConfig: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSnapshot, reloadTick])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => {
      void loadSnapshot({ syncConfig: false, silent: true })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, loadSnapshot])

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const normalizedDraftJson = JSON.stringify(mergeGenerationQueueConfig(draftConfig))
  const isDirty = Boolean(savedConfigJson && normalizedDraftJson !== savedConfigJson)

  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  const handleReconcile = async () => {
    setReconciling(true)
    try {
      const res = await reconcileAdminQueueApi()
      await loadSnapshot({ syncConfig: false })
      toast.success(
        `巡检完成：回收超时执行 ${res.reapedProcessing}、超时排队 ${res.reapedQueued}、新晋升启动 ${res.promotedCount} 个任务`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '手动巡检失败')
    } finally {
      setReconciling(false)
    }
  }

  const handleCancelQueued = (jobId: string, username: string, cost: number) => {
    onConfirm({
      title: '确认取消该排队任务？',
      description: `即将取消用户 @${username} 的排队任务（${jobId.slice(0, 8)}），系统将立即全额退还 ${cost} 积分并自动唤醒下一个排队任务。`,
      confirmLabel: '取消排队并退积分',
      destructive: true,
      run: async () => {
        await cancelAdminQueueJobApi(jobId)
        toast.success(`已取消排队任务并全额退还 ${cost} 积分`)
        await loadSnapshot({ syncConfig: false })
      },
    })
  }

  const handleForceAbortProcessing = (jobId: string, username: string, cost: number) => {
    onConfirm({
      title: '确认强制中止正在绘制的任务？',
      description: `强制中止 @${username} 的绘制任务（${jobId.slice(0, 8)}）后，任务将标记为失败并立即退还 ${cost} 积分，同时释放并发槽位给后续排队任务。仅建议在疑似卡死时使用。`,
      confirmLabel: '强制中止并退积分',
      destructive: true,
      run: async () => {
        await cancelAdminQueueJobApi(jobId, { forceProcessing: true })
        toast.success(`已强制中止任务并全额退还 ${cost} 积分`)
        await loadSnapshot({ syncConfig: false })
      },
    })
  }

  const updateNumericField = (
    key: Exclude<keyof GenerationQueueConfig, 'profileConcurrencyOverrides'>,
    rawVal: string
  ) => {
    const parsed = Number(rawVal)
    setDraftConfig((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? Math.round(parsed) : prev[key],
    }))
  }

  const updateProfileOverride = (profileId: string, rawVal: string) => {
    setDraftConfig((prev) => {
      const nextOverrides = { ...prev.profileConcurrencyOverrides }
      const trimmed = rawVal.trim()
      if (!trimmed) {
        delete nextOverrides[profileId]
      } else {
        const num = Number(trimmed)
        if (Number.isFinite(num) && num >= 1) {
          nextOverrides[profileId] = Math.min(20, Math.max(1, Math.round(num)))
        }
      }
      return {
        ...prev,
        profileConcurrencyOverrides: nextOverrides,
      }
    })
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const sanitized = mergeGenerationQueueConfig(draftConfig)
      const res = await updateAdminSettingsApi({ queueConfig: sanitized })
      const saved = mergeGenerationQueueConfig(res.platform.queueConfig)
      setDraftConfig(saved)
      setSavedConfigJson(JSON.stringify(saved))
      await Promise.all([loadSnapshot({ syncConfig: false }), onRefreshBootstrap()])
      toast.success('并发与队列配置已保存并立即生效（若有新增槽位将自动唤醒排队任务）')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存并发配置失败')
    } finally {
      setSavingConfig(false)
    }
  }

  const summary = snapshot?.summary
  const runningJobs = snapshot?.runningJobs ?? []
  const queuedJobs = snapshot?.queuedJobs ?? []
  const modelStats = snapshot?.modelStats ?? []

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="任务队列与并发调度"
        description="实时监控全站正在执行的绘制任务、FIFO 等待队列及各画笔档位占用；支持动态调整全站/单模型/单用户并发度与超时规则。"
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_CLS}
              onClick={() => setAutoRefresh((v) => !v)}
            >
              {autoRefresh ? (
                <>
                  <PauseIcon className="size-3.5 text-emerald-600" />
                  <span>自动刷新 5s</span>
                </>
              ) : (
                <>
                  <PlayIcon className="size-3.5 text-zinc-500" />
                  <span>已暂停自动刷新</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reconciling}
              className={ADMIN_BTN_CLS}
              onClick={() => void handleReconcile()}
            >
              {reconciling ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              <span>手动巡检与晋升</span>
            </Button>
          </>
        }
      />

      <AdminMetricGrid
        items={[
          {
            code: '01.',
            label: '全站执行中 / 上限',
            value: summary
              ? `${summary.globalRunning} / ${summary.maxGlobalConcurrency}`
              : '—',
            hint: '达到上限后新请求将按 FIFO 排队',
            tone:
              summary && summary.globalRunning >= summary.maxGlobalConcurrency
                ? 'warning'
                : 'default',
          },
          {
            code: '02.',
            label: '排队等待数 / 容量',
            value: summary
              ? `${summary.globalQueued} / ${summary.maxQueueSize}`
              : '—',
            hint: '按全局队列 FIFO 与画笔空闲智能补位',
            tone: summary && summary.globalQueued > 0 ? 'warning' : 'success',
          },
          {
            code: '03.',
            label: '当前活跃用户数',
            value: summary?.activeUsers ?? '—',
            hint: '含绘制中或排队中的独立用户',
          },
          {
            code: '04.',
            label: '默认并发策略',
            value: `${draftConfig.maxModelConcurrency} / ${draftConfig.maxUserConcurrency}+${draftConfig.maxUserQueuedJobs}`,
            hint: `单画笔默认 ${draftConfig.maxModelConcurrency} · 单用户 ${draftConfig.maxUserConcurrency} 并发 + ${draftConfig.maxUserQueuedJobs} 排队`,
          },
        ]}
      />

      {/* 排队等待队列 */}
      <AdminPanel
        title={`排队等待队列 (${queuedJobs.length})`}
        subtitle="入队时已预扣积分，超时或取消将全额原路退还；前置槽位释放后按 FIFO 自动唤醒。"
        icon={<ClockIcon className="size-3.5" />}
        padded={false}
        headerRight={
          <span className="font-mono text-xs text-zinc-500">
            超时上限 {draftConfig.queueWaitTimeoutSec}s
          </span>
        }
      >
        {queuedJobs.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            当前暂无排队等待任务，所有新提交均可直通执行。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-3.5 py-2.5">队位</th>
                  <th className="px-3.5 py-2.5">用户 / 入队时间</th>
                  <th className="px-3.5 py-2.5">画师 / 画笔档位</th>
                  <th className="px-3.5 py-2.5">等待原因</th>
                  <th className="px-3.5 py-2.5">已等待</th>
                  <th className="px-3.5 py-2.5">积分</th>
                  <th className="px-3.5 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {queuedJobs.map((job) => {
                  const reason = job.queueInfo?.reason ?? 'global_busy'
                  const reasonMeta = WAIT_REASON_META[reason]
                  return (
                    <tr key={job.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40">
                      <td className="px-3.5 py-2.5 font-bold">
                        #{job.queueInfo?.position ?? '—'}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-bold">@{job.username}</div>
                        <div className="text-xs text-zinc-500">
                          {formatAdminDateTime(job.createdAt)}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-1 font-bold uppercase">
                          <span>{PROVIDER_META[job.provider]?.shortName || job.provider}</span>
                          {job.profileName && (
                            <span className="border border-zinc-300 px-1 font-sans text-xs font-semibold normal-case text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                              {job.profileName}
                            </span>
                          )}
                          {job.resolution && (
                            <span className="border border-zinc-300 px-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                              {job.resolution}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 max-w-[200px] truncate font-sans text-xs text-zinc-500">
                          {job.recipeSummary}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <AdminBadge tone={reasonMeta.tone}>{reasonMeta.label}</AdminBadge>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {formatWaitDuration(job.createdAt, clockTick)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">-{job.creditsCost}</td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`${ADMIN_BTN_SM_CLS} border-red-600/40 text-red-700 hover:bg-red-500/10 dark:text-red-400`}
                          onClick={() =>
                            handleCancelQueued(job.id, job.username, job.creditsCost)
                          }
                        >
                          <BanIcon className="size-3" />
                          <span>取消排队并退积分</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {/* 正在执行的生图任务 */}
      <AdminPanel
        title={`正在执行的生图任务 (${runningJobs.length})`}
        subtitle="当前已拿到并发槽位正在云端执行的任务；超时未完成将由 DO Alarm 自动回收并退还积分。"
        icon={<ActivityIcon className="size-3.5" />}
        padded={false}
        headerRight={
          <span className="font-mono text-xs text-zinc-500">
            执行超时 {draftConfig.processingTimeoutSec}s
          </span>
        }
      >
        {runningJobs.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            当前暂无正在执行的生图任务。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-3.5 py-2.5">用户 / 启动时间</th>
                  <th className="px-3.5 py-2.5">画师 / 画笔档位</th>
                  <th className="px-3.5 py-2.5">当前执行阶段</th>
                  <th className="px-3.5 py-2.5">执行耗时</th>
                  <th className="px-3.5 py-2.5">积分</th>
                  <th className="px-3.5 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {runningJobs.map((job) => {
                  const activeStart = job.startedAt ?? job.createdAt
                  return (
                    <tr key={job.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40">
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-bold">@{job.username}</div>
                        <div className="text-xs text-zinc-500">
                          {formatAdminDateTime(activeStart)}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-1 font-bold uppercase">
                          <span>{PROVIDER_META[job.provider]?.shortName || job.provider}</span>
                          {job.profileName && (
                            <span className="border border-zinc-300 px-1 font-sans text-xs font-semibold normal-case text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                              {job.profileName}
                            </span>
                          )}
                          {job.resolution && (
                            <span className="border border-zinc-300 px-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                              {job.resolution}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 max-w-[200px] truncate font-sans text-xs text-zinc-500">
                          {job.recipeSummary}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 font-sans">
                        <AdminBadge tone="warning">
                          {job.liveMessage || job.liveStage || '执行中'}
                        </AdminBadge>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {formatWaitDuration(activeStart, clockTick)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">-{job.creditsCost}</td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            to="/admin/jobs/$jobId"
                            params={{ jobId: job.id }}
                            className="inline-flex h-7 items-center gap-1 border border-zinc-300 px-2 text-xs font-semibold hover:border-zinc-950 dark:border-zinc-700 dark:hover:border-zinc-200"
                          >
                            <ActivityIcon className="size-3" />
                            <span>全链路</span>
                          </Link>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={`${ADMIN_BTN_SM_CLS} border-red-600/40 text-red-700 hover:bg-red-500/10 dark:text-red-400`}
                            onClick={() =>
                              handleForceAbortProcessing(job.id, job.username, job.creditsCost)
                            }
                          >
                            <span>强制中止</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {/* 并发参数配置与各画笔档位限流 */}
      <AdminPanel
        title="并发限制与超时参数配置"
        subtitle="推荐默认值已在全站稳定性与多任务流畅度之间取得平衡（全站 8 / 单画笔 3 / 单用户 2 并发 + 4 排队）；保存后立即触发队列重算调度。"
        icon={<CpuIcon className="size-3.5" />}
        headerRight={
          <div className="flex items-center gap-2">
            {isDirty && <AdminBadge tone="warning">有未保存修改</AdminBadge>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_SM_CLS}
              onClick={() => setDraftConfig(createDefaultGenerationQueueConfig())}
            >
              <RotateCcwIcon className="size-3" />
              <span>填入推荐默认</span>
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={savingConfig}
              className={ADMIN_BTN_CLS}
              onClick={() => void handleSaveConfig()}
            >
              {savingConfig ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              <span>保存并立即生效</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminField
              label="全站总并发上限"
              htmlFor="q-max-global"
              hint="同时运行的生图任务总数（1~50，建议 6~10）"
            >
              <Input
                id="q-max-global"
                type="number"
                min={1}
                max={50}
                value={draftConfig.maxGlobalConcurrency}
                onChange={(e) => updateNumericField('maxGlobalConcurrency', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label="单画笔默认并发上限"
              htmlFor="q-max-model"
              hint="每个模型档位的默认最大并发（1~20，建议 3）"
            >
              <Input
                id="q-max-model"
                type="number"
                min={1}
                max={20}
                value={draftConfig.maxModelConcurrency}
                onChange={(e) => updateNumericField('maxModelConcurrency', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label="单用户最大同时执行"
              htmlFor="q-max-user-run"
              hint="单个账号同一时刻最多直出绘制几张（1~10，建议 2）"
            >
              <Input
                id="q-max-user-run"
                type="number"
                min={1}
                max={10}
                value={draftConfig.maxUserConcurrency}
                onChange={(e) => updateNumericField('maxUserConcurrency', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label="单用户最多排队数"
              htmlFor="q-max-user-queue"
              hint="单个账号最多允许多少个任务排队等待（0~20，建议 4）"
            >
              <Input
                id="q-max-user-queue"
                type="number"
                min={0}
                max={20}
                value={draftConfig.maxUserQueuedJobs}
                onChange={(e) => updateNumericField('maxUserQueuedJobs', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label="全站排队队列上限"
              htmlFor="q-max-queue-size"
              hint="超过此总排队数量将拒绝新排队请求（1~500，建议 50）"
            >
              <Input
                id="q-max-queue-size"
                type="number"
                min={1}
                max={500}
                value={draftConfig.maxQueueSize}
                onChange={(e) => updateNumericField('maxQueueSize', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label="排队等待超时（秒）"
              htmlFor="q-wait-timeout"
              hint="排队超过该时间未执行则自动取消并退积分（60~3600，建议 600）"
            >
              <Input
                id="q-wait-timeout"
                type="number"
                min={60}
                max={3600}
                value={draftConfig.queueWaitTimeoutSec}
                onChange={(e) => updateNumericField('queueWaitTimeoutSec', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label="绘制执行超时（秒）"
              htmlFor="q-proc-timeout"
              hint="开始执行后超过该时间未完成则自动回收并退积分（30~900，建议 150）"
            >
              <Input
                id="q-proc-timeout"
                type="number"
                min={30}
                max={900}
                value={draftConfig.processingTimeoutSec}
                onChange={(e) => updateNumericField('processingTimeoutSec', e.target.value)}
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>
          </div>

          <div className="space-y-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold">各画笔档位实时负载与独立并发上限（可选覆写）</div>
              <div className="text-xs text-zinc-500">
                留空表示继承「单画笔默认并发上限 ({draftConfig.maxModelConcurrency})」
              </div>
            </div>

            {modelStats.length === 0 ? (
              <div className="border border-zinc-200 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
                暂无画笔档位信息
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3.5 py-2">画师</th>
                      <th className="px-3.5 py-2">画笔档位</th>
                      <th className="px-3.5 py-2">执行中 / 排队</th>
                      <th className="px-3.5 py-2">当前生效上限</th>
                      <th className="px-3.5 py-2">独立上限覆写 (1~20)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {modelStats.map((m) => {
                      const overrideVal =
                        m.profileId &&
                        typeof draftConfig.profileConcurrencyOverrides[m.profileId] === 'number'
                          ? String(draftConfig.profileConcurrencyOverrides[m.profileId])
                          : ''
                      return (
                        <tr key={m.key}>
                          <td className="px-3.5 py-2 font-bold uppercase">
                            {PROVIDER_META[m.provider]?.shortName || m.provider}
                          </td>
                          <td className="px-3.5 py-2 font-sans">
                            <span className="font-semibold">{m.profileName}</span>
                            {!m.enabled && (
                              <span className="ml-1.5 border border-zinc-300 px-1 text-xs text-zinc-500 dark:border-zinc-700">
                                已停用
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2">
                            <span className={m.runningCount > 0 ? 'font-bold text-amber-600' : ''}>
                              {m.runningCount} 执行
                            </span>
                            <span className="mx-1.5 text-zinc-400">·</span>
                            <span className={m.queuedCount > 0 ? 'font-bold text-sky-600' : 'text-zinc-500'}>
                              {m.queuedCount} 排队
                            </span>
                          </td>
                          <td className="px-3.5 py-2 font-bold">
                            {overrideVal ? Number(overrideVal) : draftConfig.maxModelConcurrency}
                            {overrideVal ? (
                              <span className="ml-1.5 font-sans text-xs font-normal text-amber-700 dark:text-amber-300">
                                (已覆写)
                              </span>
                            ) : (
                              <span className="ml-1.5 font-sans text-xs font-normal text-zinc-500">
                                (默认)
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2">
                            {m.profileId ? (
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                placeholder={`默认 ${draftConfig.maxModelConcurrency}`}
                                value={overrideVal}
                                onChange={(e) =>
                                  updateProfileOverride(m.profileId!, e.target.value)
                                }
                                className="h-7 w-28 rounded-none font-mono text-xs"
                              />
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </AdminPanel>
    </div>
  )
}
