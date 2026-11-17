import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ActivityIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchAdminGenerationsApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type { GenerationHistoryItem } from '@/types/gallery'
import { PROVIDER_META, PROVIDER_ORDER } from '../../../../shared/studio'
import { AdminMetricGrid, AdminPageHeader } from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_SELECT_CLS,
  AUDIT_STATUS_META,
  formatAdminDateTime,
  formatAdminShortDuration,
} from '../auditHelpers'

interface AdminJobsTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
}

export function AdminJobsTab({ reloadTick, onLoadingChange }: AdminJobsTabProps) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<GenerationHistoryItem[]>([])
  const [jobStatusFilter, setJobStatusFilter] = useState('all')
  const [jobProviderFilter, setJobProviderFilter] = useState('all')
  const [jobQuery, setJobQuery] = useState('')
  const [appliedJobQuery, setAppliedJobQuery] = useState('')

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminGenerationsApi({
        status: jobStatusFilter === 'all' ? undefined : jobStatusFilter,
        provider: jobProviderFilter === 'all' ? undefined : jobProviderFilter,
        q: appliedJobQuery.trim() || undefined,
        limit: 60,
      })
      setJobs(res.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载生图记录失败')
    } finally {
      onLoadingChange(false)
    }
  }, [appliedJobQuery, jobProviderFilter, jobStatusFilter, onLoadingChange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedJobQuery(jobQuery)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [jobQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData, reloadTick])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="全站生图任务与全链路调度审计"
        description="监控提示词、供应商/渠道调度队列、重试与降级链路及成图结果；点击「全链路」或任意行进入独立审计页。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (appliedJobQuery === jobQuery) {
                  void loadData()
                } else {
                  setAppliedJobQuery(jobQuery)
                }
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={jobQuery}
                  onChange={(e) => setJobQuery(e.target.value)}
                  placeholder="搜索用户 / 提示词 / 模型 / 渠道…"
                  className="h-8 w-56 rounded-none pl-8 font-mono text-xs sm:w-64"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" className={ADMIN_BTN_CLS}>
                查询
              </Button>
            </form>
            <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
              <SelectTrigger className={`w-28 font-mono ${ADMIN_SELECT_CLS}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="succeeded">成功</SelectItem>
                <SelectItem value="processing">进行中</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
            <Select value={jobProviderFilter} onValueChange={setJobProviderFilter}>
              <SelectTrigger className={`w-32 font-mono ${ADMIN_SELECT_CLS}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部厂商</SelectItem>
                {PROVIDER_ORDER.map((pid) => (
                  <SelectItem key={pid} value={pid}>
                    {PROVIDER_META[pid].shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <AdminMetricGrid
        items={[
          { label: '当前匹配任务', value: jobs.length },
          {
            label: '成功',
            value: jobs.filter((j) => j.status === 'succeeded').length,
            tone: 'success',
          },
          {
            label: '失败',
            value: jobs.filter((j) => j.status === 'failed').length,
            tone: 'danger',
          },
          {
            label: '发生切换或重试',
            value: jobs.filter((j) => (j.auditTrace?.attempts?.length ?? 0) > 1).length,
            tone: 'warning',
          },
        ]}
      />

      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left font-mono text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3.5 py-2.5">用户 / 时间</th>
              <th className="px-3.5 py-2.5">厂商 / 最终模型</th>
              <th className="px-3.5 py-2.5">供应商 / 渠道</th>
              <th className="px-3.5 py-2.5">提交提示词与配方</th>
              <th className="px-3.5 py-2.5">调度链路</th>
              <th className="px-3.5 py-2.5">积分</th>
              <th className="px-3.5 py-2.5">状态 / 报错摘要</th>
              <th className="px-3.5 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center font-sans text-zinc-500">
                  暂无符合筛选条件的生图审计记录。
                </td>
              </tr>
            ) : (
              jobs.map((j) => {
                const trace = j.auditTrace ?? null
                const attempts = trace?.attempts ?? []
                const attemptCount = attempts.length
                const durationMs =
                  trace?.totalDurationMs ??
                  (j.finishedAt ? Math.max(0, j.finishedAt - j.createdAt) : null)
                const uniqueChannels = new Set(attempts.map((a) => a.channelId)).size
                const hasDowngrade = attempts.some((a) => a.triggerType === 'compat_downgrade')
                const hasFailover =
                  attempts.some(
                    (a) =>
                      a.triggerType === 'failover_switch' || a.triggerType === 'fallback_retry'
                  ) || uniqueChannels > 1
                const hasRetry = attempts.some(
                  (a) =>
                    a.triggerType === 'transient_retry' || a.triggerType === 'fallback_retry'
                )
                const submittedPrompt =
                  trace?.promptBreakdown?.finalPrompt || j.prompt || j.recipeSummary

                return (
                  <tr
                    key={j.id}
                    onClick={() =>
                      void navigate({ to: '/admin/jobs/$jobId', params: { jobId: j.id } })
                    }
                    className="cursor-pointer transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                  >
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      <div className="font-bold">@{j.username || j.userId?.slice(0, 8)}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {formatAdminDateTime(j.createdAt)}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1 font-bold uppercase">
                        <span>{PROVIDER_META[j.provider]?.shortName || j.provider}</span>
                        {j.profileName && (
                          <span className="border border-zinc-300 px-1 font-sans text-[10px] font-semibold normal-case text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                            {j.profileName}
                          </span>
                        )}
                        {j.resolution && (
                          <span className="border border-zinc-300 px-1 text-[10px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                            {j.resolution}
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-0.5 max-w-[150px] truncate text-[11px] text-zinc-500"
                        title={j.model}
                      >
                        {j.model}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 font-sans">
                      <div className="max-w-[140px] truncate font-semibold">
                        {j.supplierName || '—'}
                      </div>
                      <div
                        className="mt-0.5 max-w-[140px] truncate text-[11px] text-zinc-500"
                        title={j.channelName || undefined}
                      >
                        {j.channelName || '—'}
                      </div>
                    </td>
                    <td className="max-w-[280px] px-3.5 py-3 font-sans">
                      <div
                        className="line-clamp-2 text-xs leading-snug text-zinc-800 dark:text-zinc-200"
                        title={submittedPrompt}
                      >
                        {submittedPrompt || '—'}
                      </div>
                      {j.recipeSummary && (
                        <div
                          className="mt-1 truncate text-[11px] text-zinc-500"
                          title={j.recipeSummary}
                        >
                          {j.recipeSummary}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      {!trace ? (
                        <div className="space-y-1">
                          <span className="inline-block border border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700">
                            历史记录
                          </span>
                          <div className="text-[11px] text-zinc-500">
                            {formatAdminShortDuration(durationMs)}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {attemptCount === 0 ? (
                              <span className="border border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                                {j.status === 'processing' ? '调度中' : '0次调用'}
                              </span>
                            ) : attemptCount === 1 ? (
                              <span
                                className={`border px-1.5 py-0.5 text-[11px] font-bold ${
                                  j.status === 'succeeded'
                                    ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : j.status === 'failed'
                                      ? 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-400'
                                      : 'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                }`}
                              >
                                {j.status === 'succeeded'
                                  ? '1次直出'
                                  : j.status === 'failed'
                                    ? '1次失败'
                                    : '1次调度'}
                              </span>
                            ) : (
                              <>
                                {hasFailover ? (
                                  <span className="border border-amber-600/45 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                    切换{uniqueChannels}渠道
                                  </span>
                                ) : hasRetry ? (
                                  <span className="border border-sky-600/45 bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-bold text-sky-800 dark:text-sky-300">
                                    重试{attemptCount}次
                                  </span>
                                ) : null}
                                {hasDowngrade && (
                                  <span className="border border-purple-600/45 bg-purple-500/10 px-1.5 py-0.5 text-[11px] font-bold text-purple-800 dark:text-purple-300">
                                    降级重试
                                  </span>
                                )}
                                {!hasFailover && !hasRetry && !hasDowngrade && (
                                  <span className="border border-zinc-400/50 px-1.5 py-0.5 text-[11px] font-bold">
                                    {attemptCount}次调用
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {attemptCount}次 · {formatAdminShortDuration(durationMs)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      <div>-{j.creditsCost}</div>
                      {j.creditsRefunded > 0 && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          +{j.creditsRefunded} 退
                        </div>
                      )}
                    </td>
                    <td className="max-w-[200px] px-3.5 py-3">
                      <span
                        className={
                          j.status === 'succeeded'
                            ? 'font-bold text-emerald-600 dark:text-emerald-400'
                            : j.status === 'failed'
                              ? 'font-bold text-red-500'
                              : 'font-bold text-amber-600'
                        }
                      >
                        {AUDIT_STATUS_META[j.status]?.label ?? j.status}
                      </span>
                      {j.errorMessage && (
                        <div
                          className="mt-0.5 truncate font-sans text-[11px] text-zinc-500"
                          title={j.errorMessage}
                        >
                          {j.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-right whitespace-nowrap">
                      <Link
                        to="/admin/jobs/$jobId"
                        params={{ jobId: j.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 border border-zinc-950 bg-zinc-950 px-2.5 py-1 text-[11px] font-bold text-white transition-opacity hover:opacity-85 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-950"
                      >
                        <ActivityIcon className="size-3" />
                        全链路
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
