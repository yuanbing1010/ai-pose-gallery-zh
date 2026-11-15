import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  ImageIcon,
  LayersIcon,
  LoaderCircleIcon,
  TerminalSquareIcon,
  ZoomInIcon,
} from 'lucide-react'
import { AdminShell } from '@/components/admin/AdminShell'
import { CopyActionButton, TraceAttemptCard } from '@/components/admin/TraceAttemptCard'
import {
  AUDIT_STATUS_META,
  TRACE_SLOT_LABELS,
  buildFallbackReferences,
  formatTimeMs,
  formatTimestampMs,
  formatTraceBytes,
  formatTraceDuration,
  formatTraceShortDuration,
  resolveRefPreviewUrl,
} from '@/components/admin/auditHelpers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchAdminGenerationByIdApi } from '@/lib/apiClient'
import { useStudio } from '@/store/studioStore'
import { PROVIDER_META, getStudioArtist, resolveStyleInfo } from '../../shared/studio'

export const Route = createFileRoute('/admin/jobs/$jobId')({
  staticData: { title: '全链路生图审计' },
  component: AdminJobDetailPage,
})

function AdminJobDetailPage() {
  const { jobId } = Route.useParams()
  const navigate = useNavigate()
  const { user, bootstrapLoaded, platform } = useStudio()

  const [previewImg, setPreviewImg] = useState<{ url: string; title: string } | null>(null)
  const [expandOverride, setExpandOverride] = useState<{
    version: number
    expanded: boolean
  } | null>(null)

  useEffect(() => {
    if (!bootstrapLoaded) return
    if (!user || user.role !== 'admin') {
      void navigate({ to: '/admin/login' })
    }
  }, [bootstrapLoaded, navigate, user])

  const detailQuery = useQuery({
    queryKey: ['admin', 'generation', jobId],
    queryFn: () => fetchAdminGenerationByIdApi(jobId),
    enabled: bootstrapLoaded && user?.role === 'admin',
    retry: false,
  })

  if (!bootstrapLoaded || !user || user.role !== 'admin') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-xs text-zinc-500 dark:bg-zinc-950">
        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
        正在校验管理员会话…
      </div>
    )
  }

  const backButton = (
    <Link
      to="/admin"
      search={{ tab: 'jobs' }}
      className="inline-flex shrink-0 items-center gap-1.5 border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100"
    >
      <ArrowLeftIcon className="size-3.5" />
      <span>返回审计列表</span>
    </Link>
  )

  const job = detailQuery.data?.job ?? null
  const loading = detailQuery.isFetching
  const loadError =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : detailQuery.error
        ? '加载任务审计详情失败'
        : ''

  if (detailQuery.isPending && !job) {
    return (
      <AdminShell
        activeTab="jobs"
        directoryLabel={`06. 生成记录审计 / 详情 ${jobId.slice(0, 8)}`}
        headerLeftExtra={backButton}
        loading={loading}
        onRefresh={() => void detailQuery.refetch()}
      >
        <div className="flex min-h-[50vh] items-center justify-center border border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
          <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
          正在加载全链路审计详情…
        </div>
      </AdminShell>
    )
  }

  if (loadError && !job) {
    return (
      <AdminShell
        activeTab="jobs"
        directoryLabel={`06. 生成记录审计 / 详情 ${jobId.slice(0, 8)}`}
        headerLeftExtra={backButton}
        loading={loading}
        onRefresh={() => void detailQuery.refetch()}
      >
        <div className="space-y-4 border border-red-500/50 bg-red-500/5 p-6 text-xs">
          <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-400">
            <AlertTriangleIcon className="size-4" />
            <span>无法加载任务审计详情</span>
          </div>
          <p className="text-zinc-700 dark:text-zinc-300">{loadError}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              onClick={() => void detailQuery.refetch()}
            >
              重试加载
            </Button>
            <Button size="sm" className="rounded-none" asChild>
              <Link to="/admin" search={{ tab: 'jobs' }}>
                返回生成记录审计
              </Link>
            </Button>
          </div>
        </div>
      </AdminShell>
    )
  }

  if (!job) return null

  const trace = job.auditTrace ?? null
  const statusMeta = AUDIT_STATUS_META[job.status]
  const artist = getStudioArtist(job.provider)
  const providerMeta = PROVIDER_META[job.provider]
  const finalPrompt = trace?.promptBreakdown?.finalPrompt ?? job.prompt
  const totalDurationMs =
    trace?.totalDurationMs ??
    (job.finishedAt ? Math.max(0, job.finishedAt - job.createdAt) : null)

  const winningModel = trace?.result?.winningModel || job.model || '—'
  const winningSupplier = trace?.result?.winningSupplierName || job.supplierName || '—'
  const winningChannel = trace?.result?.winningChannelName || job.channelName || '—'
  const finalError = trace?.finalError || job.errorMessage || null
  const creditsRefunded = trace?.creditsRefunded ?? job.creditsRefunded

  const references = trace?.references?.length
    ? trace.references
    : !trace
      ? buildFallbackReferences(job)
      : []

  const attempts = trace?.attempts ?? []
  const candidateChannels = trace?.candidateChannels ?? []
  const uniqueChannelsTried = new Set(attempts.map((a) => a.channelId)).size
  const failoverCount = attempts.filter(
    (a) => a.triggerType === 'failover_switch' || a.triggerType === 'fallback_retry'
  ).length
  const retryCount = attempts.filter(
    (a) =>
      a.triggerType === 'transient_retry' ||
      a.triggerType === 'compat_downgrade' ||
      a.triggerType === 'fallback_retry'
  ).length

  const stylePresetKey = trace?.promptBreakdown?.stylePreset ?? job.stylePreset
  const styleInfo = resolveStyleInfo(stylePresetKey, platform)
  const styleLabel =
    trace?.promptBreakdown?.styleLabel ||
    (styleInfo.categoryLabel && styleInfo.subcategoryLabel
      ? `${styleInfo.label}（${styleInfo.categoryLabel} · ${styleInfo.subcategoryLabel}）`
      : styleInfo.label) ||
    stylePresetKey ||
    '—'

  return (
    <AdminShell
      activeTab="jobs"
      directoryLabel={`06. 生成记录审计 / 详情 ${job.id.slice(0, 8)}`}
      headerLeftExtra={backButton}
      loading={loading}
      onRefresh={() => void detailQuery.refetch()}
    >
      {/* 顶部任务摘要头 & 核心指标栏 */}
      <section className="space-y-4 border-b border-zinc-950 pb-6 dark:border-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center gap-2">
            <span>全链路调用追踪</span>
            <span>·</span>
            <span className="font-mono font-bold text-zinc-950 dark:text-zinc-100">
              @{job.username || job.userId?.slice(0, 8) || '未知用户'}
            </span>
            <span>·</span>
            <span className="font-mono">{formatTimestampMs(trace?.startedAt ?? job.createdAt)}</span>
          </div>
          <span className="border border-zinc-300 px-2 py-0.5 text-[11px] dark:border-zinc-700">
            {trace ? '全链路埋点记录' : '历史记录（无全链路埋点）'}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {job.recipeSummary || '自定义角色合成'}
              </h1>
              <span className={`border px-2 py-0.5 text-xs font-bold ${statusMeta.badgeClass}`}>
                {statusMeta.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-mono">任务编号：{job.id}</span>
              <CopyActionButton text={job.id} label="复制编号" toastMessage="已复制任务编号" />
              <span className="text-zinc-400">·</span>
              <span>
                {artist.name}（{providerMeta?.name || job.provider}）
              </span>
            </div>
          </div>
        </div>

        {/* 4 列瑞士风格关键指标带 */}
        <div className="grid grid-cols-1 divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
          <div className="min-w-0 p-4">
            <div className="text-[11px] font-medium text-zinc-500">01. 命中模型与路由</div>
            <div className="mt-1.5 truncate font-mono text-sm font-bold" title={winningModel}>
              {winningModel}
            </div>
            <div className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
              {winningSupplier} · {winningChannel}
            </div>
          </div>

          <div className="min-w-0 p-4">
            <div className="text-[11px] font-medium text-zinc-500">02. 总耗时与调度次数</div>
            <div className="mt-1.5 text-sm font-bold">{formatTraceDuration(totalDurationMs)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span>{trace ? `共 ${attempts.length} 次调用` : '历史记录'}</span>
              {failoverCount > 0 && (
                <span className="border border-amber-500/40 bg-amber-500/10 px-1 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                  切换 {uniqueChannelsTried} 渠道
                </span>
              )}
              {retryCount > 0 && (
                <span className="border border-sky-500/40 bg-sky-500/10 px-1 text-[10px] font-bold text-sky-800 dark:text-sky-300">
                  重试 {retryCount} 次
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 p-4">
            <div className="text-[11px] font-medium text-zinc-500">03. 积分账本</div>
            <div className="mt-1.5 flex items-center gap-2 font-mono text-sm font-bold">
              <span>-{job.creditsCost} 积分</span>
              {creditsRefunded > 0 && (
                <span className="border border-emerald-600/40 bg-emerald-500/10 px-1.5 py-0.5 font-sans text-[11px] text-emerald-700 dark:text-emerald-400">
                  +{creditsRefunded} 已退还
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {creditsRefunded > 0
                ? '失败自动全额退还'
                : job.status === 'succeeded'
                  ? '已核销扣费'
                  : '处理中暂扣'}
            </div>
          </div>

          <div className="min-w-0 p-4">
            <div className="text-[11px] font-medium text-zinc-500">04. 执行时间窗</div>
            <div className="mt-1.5 font-mono text-sm font-bold">
              {formatTimeMs(trace?.startedAt ?? job.createdAt)} →{' '}
              {formatTimeMs(trace?.finishedAt ?? job.finishedAt)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {job.aspectRatio} · {styleLabel}
            </div>
          </div>
        </div>

        {finalError && (
          <div className="flex flex-wrap items-start justify-between gap-3 border border-red-500/60 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-300">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <div className="font-bold">最终报错</div>
                <div className="font-mono leading-relaxed [overflow-wrap:anywhere]">
                  {finalError}
                </div>
              </div>
            </div>
            <CopyActionButton text={finalError} label="复制报错" toastMessage="已复制报错信息" />
          </div>
        )}
      </section>

      {/* 双栏主体：左栏深挖提示词 + 路由队列 + 全链路时间线；右栏成图 + 可视化参考图 + 账本 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* 左栏（主视图） */}
        <div className="min-w-0 space-y-6">
          {/* 01. 提交提示词与生成参数 */}
          <section className="min-w-0 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-600 dark:text-zinc-400">
              <span>01. 提交提示词与生成参数</span>
              <span className="font-mono font-normal text-zinc-500">{finalPrompt.length} 字</span>
            </div>

            <div className="min-w-0 border border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-2 divide-x divide-y divide-zinc-200 border-b border-zinc-200 sm:grid-cols-4 sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
                <div className="min-w-0 p-3.5">
                  <div className="text-[11px] text-zinc-500">画风预设</div>
                  <div className="mt-1 truncate text-xs font-bold" title={styleLabel}>
                    {styleLabel}
                  </div>
                </div>
                <div className="min-w-0 p-3.5">
                  <div className="text-[11px] text-zinc-500">画幅比例</div>
                  <div className="mt-1 font-mono text-xs font-bold">{job.aspectRatio}</div>
                </div>
                <div className="min-w-0 p-3.5">
                  <div className="text-[11px] text-zinc-500">参考图传参</div>
                  <div className="mt-1 text-xs font-bold">
                    {trace
                      ? trace.imagePassMode === 'url'
                        ? '优先链接直传'
                        : '统一转码传输'
                      : '—'}
                  </div>
                </div>
                <div className="min-w-0 p-3.5">
                  <div className="text-[11px] text-zinc-500">三合一拼图</div>
                  <div className="mt-1 text-xs font-bold">
                    {trace ? (trace.sendStitchedSheet ? '已开启' : '未开启') : '—'}
                  </div>
                </div>
              </div>

              {(trace?.promptBreakdown || job.snapshot?.sceneNote) && (
                <div className="grid grid-cols-1 divide-y divide-zinc-200 border-b border-zinc-200 sm:grid-cols-2 lg:grid-cols-4 sm:divide-x lg:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
                  <div className="min-w-0 p-3.5">
                    <div className="text-[11px] text-zinc-500">画面补充</div>
                    <div className="mt-1 text-xs [overflow-wrap:anywhere] text-zinc-800 dark:text-zinc-200">
                      {(trace?.promptBreakdown?.sceneNote ?? job.snapshot?.sceneNote)?.trim() || (
                        <span className="text-zinc-400">（空）</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 p-3.5">
                    <div className="text-[11px] text-zinc-500">负面提示词</div>
                    <div className="mt-1 text-xs [overflow-wrap:anywhere] text-zinc-800 dark:text-zinc-200">
                      {trace?.promptBreakdown?.negativePrompt?.trim() || (
                        <span className="text-zinc-400">（空）</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 p-3.5">
                    <div className="text-[11px] text-zinc-500">默认前置</div>
                    <div className="mt-1 text-xs [overflow-wrap:anywhere] text-zinc-800 dark:text-zinc-200">
                      {trace?.promptBreakdown?.prefix?.trim() || (
                        <span className="text-zinc-400">（空）</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 p-3.5">
                    <div className="text-[11px] text-zinc-500">默认后置</div>
                    <div className="mt-1 text-xs [overflow-wrap:anywhere] text-zinc-800 dark:text-zinc-200">
                      {trace?.promptBreakdown?.suffix?.trim() || (
                        <span className="text-zinc-400">（空）</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <span className="text-xs font-bold">本次实际提交完整提示词</span>
                  <CopyActionButton
                    text={finalPrompt}
                    label="复制提示词"
                    toastMessage="已复制完整提示词"
                  />
                </div>
                <pre className="p-4 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere] text-zinc-900 dark:text-zinc-100">
                  {finalPrompt || '—'}
                </pre>
              </div>
            </div>
          </section>

          {/* 02. 候选调度路由队列 */}
          {candidateChannels.length > 0 && (
            <section className="min-w-0 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                <LayersIcon className="size-3.5" />
                <span>02. 候选调度路由队列 ({candidateChannels.length})</span>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <tr>
                      <th className="px-4 py-2.5">调度序</th>
                      <th className="px-4 py-2.5">渠道名称</th>
                      <th className="px-4 py-2.5">供应商</th>
                      <th className="px-4 py-2.5">模型</th>
                      <th className="px-4 py-2.5">优先级</th>
                      <th className="px-4 py-2.5 text-right">调度结果</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {candidateChannels.map((ch) => {
                      const isWinner =
                        job.status === 'succeeded' && trace?.result?.winningChannelId === ch.channelId
                      const channelAttempts = attempts.filter((a) => a.channelId === ch.channelId)
                      const hasFailed = channelAttempts.some((a) => a.outcome === 'failed')
                      const totalChannelMs = channelAttempts.reduce((acc, a) => acc + a.durationMs, 0)

                      return (
                        <tr
                          key={`${ch.order}-${ch.channelId}`}
                          className={isWinner ? 'bg-emerald-500/5' : ''}
                        >
                          <td className="px-4 py-2.5 font-mono font-bold">#{ch.order}</td>
                          <td className="px-4 py-2.5 font-bold">{ch.channelName}</td>
                          <td className="px-4 py-2.5">{ch.supplierName}</td>
                          <td className="px-4 py-2.5 font-mono">{ch.model}</td>
                          <td className="px-4 py-2.5 font-mono font-bold">{ch.priority}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            {isWinner ? (
                              <span className="border border-emerald-600/50 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                最终命中（第 {trace?.result?.winningAttemptIndex} 次 ·{' '}
                                {formatTraceShortDuration(totalChannelMs)}）
                              </span>
                            ) : hasFailed ? (
                              <span className="border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-400">
                                调用失败（{channelAttempts.length} 次 ·{' '}
                                {formatTraceShortDuration(totalChannelMs)}）
                              </span>
                            ) : job.status === 'processing' ? (
                              <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                                队列等待
                              </span>
                            ) : (
                              <span className="text-[11px] text-zinc-400">未触发（备用）</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 03. 全链路调度、重试与出入参时间线 */}
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                <ActivityIcon className="size-3.5" />
                <span>03. 全链路调度与重试时间线 ({attempts.length})</span>
              </div>

              {attempts.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandOverride((prev) => ({
                        version: (prev?.version ?? 0) + 1,
                        expanded: true,
                      }))
                    }
                    className="inline-flex items-center gap-1 border border-zinc-300 px-2 py-1 text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-100"
                  >
                    <ChevronsUpDownIcon className="size-3" />
                    <span>全部展开</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandOverride((prev) => ({
                        version: (prev?.version ?? 0) + 1,
                        expanded: false,
                      }))
                    }
                    className="inline-flex items-center gap-1 border border-zinc-300 px-2 py-1 text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-100"
                  >
                    <ChevronsDownUpIcon className="size-3" />
                    <span>全部收起</span>
                  </button>
                </div>
              )}
            </div>

            {!trace ? (
              <div className="space-y-3 border border-zinc-200 bg-zinc-50/70 p-5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-300">
                  <TerminalSquareIcon className="size-4" />
                  <span>历史记录：该任务生成于全链路审计上线前，暂无逐次调用入参/出参记录。</span>
                </div>
                {job.snapshot && (
                  <div className="grid gap-2 border-t border-zinc-200 pt-3 text-xs sm:grid-cols-3 dark:border-zinc-800">
                    <div>厂商：{job.snapshot.provider}</div>
                    <div>模型：{job.snapshot.model}</div>
                    <div>画幅：{job.snapshot.aspectRatio}</div>
                  </div>
                )}
              </div>
            ) : attempts.length === 0 ? (
              <div className="border border-zinc-200 bg-zinc-50/70 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                {job.status === 'processing'
                  ? '任务正在调度执行中，尚无已完成的上游调用节点（请稍后点击右上角刷新）'
                  : finalError || '未采集到上游调用记录（可能于预检阶段或超时回收中止）'}
              </div>
            ) : (
              <div className="relative space-y-5 pl-6 sm:pl-7">
                {/* 左侧极简 1px 时间轴导轨 */}
                <div
                  aria-hidden="true"
                  className="absolute top-3 bottom-3 left-2 w-px bg-zinc-300 dark:bg-zinc-800"
                />
                {attempts.map((attempt, idx) => {
                  const isOk = attempt.outcome === 'succeeded'
                  return (
                    <div key={`${job.id}-${attempt.attemptIndex}`} className="relative min-w-0">
                      <span
                        aria-hidden="true"
                        className={`absolute top-3 -left-6 flex size-4 items-center justify-center border font-mono text-[9px] font-bold sm:-left-7 ${
                          isOk
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-red-600 bg-red-600 text-white'
                        }`}
                      >
                        {attempt.attemptIndex}
                      </span>
                      <TraceAttemptCard
                        attempt={attempt}
                        defaultExpanded={attempts.length <= 2 || idx === attempts.length - 1}
                        expandOverride={expandOverride}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* 右栏（粘性视觉资产 & 参考图 & 账本） */}
        <aside className="min-w-0 space-y-6 xl:sticky xl:top-18 xl:self-start">
          {/* 04. 成图输出资产 */}
          <section className="min-w-0 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400">
              <ImageIcon className="size-3.5" />
              <span>04. 最终成图</span>
            </div>

            {job.imageUrl ? (
              <div className="border border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewImg({
                      url: job.imageUrl,
                      title: `成图预览 · ${winningModel}`,
                    })
                  }
                  className="group relative flex w-full cursor-zoom-in items-center justify-center bg-zinc-100 p-4 transition-colors hover:bg-zinc-200/70 dark:bg-zinc-900 dark:hover:bg-zinc-900/70"
                >
                  <img
                    src={job.imageUrl}
                    alt="生成结果"
                    className="max-h-[360px] w-auto max-w-full object-contain shadow-xs"
                  />
                </button>
                <div className="space-y-2.5 border-t border-zinc-200 p-3.5 dark:border-zinc-800">
                  {trace?.result && (
                    <div className="space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">图片格式与大小</span>
                        <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-100">
                          {trace.result.mime} · {formatTraceBytes(trace.result.bytes)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-zinc-500">命中调用</span>
                        <span>第 {trace.result.winningAttemptIndex} 次</span>
                      </div>
                      <div className="font-mono break-all text-[10px] text-zinc-500">
                        {trace.result.r2Key}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-none text-xs"
                      onClick={() =>
                        setPreviewImg({
                          url: job.imageUrl,
                          title: `成图预览 · ${winningModel}`,
                        })
                      }
                    >
                      <ZoomInIcon className="size-3.5" />
                      查看大图
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-none text-xs" asChild>
                      <a href={job.imageUrl} download={`generation-${job.id}.png`}>
                        <DownloadIcon className="size-3.5" />
                        下载原图
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30">
                {job.status === 'processing' ? '任务生成中，暂无成图输出' : '本次任务未产生输出图片'}
              </div>
            )}
          </section>

          {/* 05. 参考图输入清单 */}
          <section className="min-w-0 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-600 dark:text-zinc-400">
              <span>05. 参考图输入清单 ({references.length})</span>
            </div>

            <div className="divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {references.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">无参考图记录</div>
              ) : (
                references.map((ref) => {
                  const thumbUrl = resolveRefPreviewUrl(ref)
                  const sourceLabel =
                    ref.sourceKind === 'r2'
                      ? '用户上传'
                      : ref.sourceKind === 'https'
                        ? '外部链接'
                        : '图库素材'
                  const deliveryLabel =
                    ref.deliveryMode === 'url'
                      ? '链接直传'
                      : ref.deliveryMode === 'base64'
                        ? 'Base64 编码'
                        : ref.deliveryMode === 'multipart'
                          ? '表单上传'
                          : null

                  return (
                    <div
                      key={`${ref.index}-${ref.slot}-${ref.rawPath}`}
                      className="flex min-w-0 items-start gap-3 p-3"
                    >
                      {thumbUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewImg({
                              url: thumbUrl,
                              title: `参考图 #${ref.index} (${TRACE_SLOT_LABELS[ref.slot] ?? ref.slot}) · ${ref.label}`,
                            })
                          }
                          className="size-14 shrink-0 cursor-zoom-in overflow-hidden border border-zinc-200 bg-zinc-100 transition-colors hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-200"
                        >
                          <img
                            src={thumbUrl}
                            alt={ref.label}
                            className="h-full w-full object-cover object-top"
                          />
                        </button>
                      ) : (
                        <div className="flex size-14 shrink-0 items-center justify-center border border-dashed border-zinc-300 font-mono text-[10px] text-zinc-400 dark:border-zinc-700">
                          #{ref.index}
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-mono font-bold">#{ref.index}</span>
                          <span className="border border-zinc-300 px-1 py-0.2 text-[10px] dark:border-zinc-700">
                            {TRACE_SLOT_LABELS[ref.slot] ?? ref.slot}
                          </span>
                          <span className="bg-zinc-100 px-1 py-0.2 text-[10px] dark:bg-zinc-900">
                            {sourceLabel}
                          </span>
                          {deliveryLabel && (
                            <span className="border border-zinc-300 px-1 py-0.2 text-[10px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                              {deliveryLabel}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs font-semibold" title={ref.label}>
                          {ref.label}
                        </div>
                        {(ref.mime || ref.bytes) && (
                          <div className="font-mono text-[10px] text-zinc-500">
                            {ref.mime || '—'} · {formatTraceBytes(ref.bytes)}
                          </div>
                        )}
                        <div
                          className="font-mono text-[10px] [overflow-wrap:anywhere] text-zinc-400"
                          title={ref.rawPath}
                        >
                          {ref.rawPath || '—'}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* 06. 任务元数据 */}
          <section className="min-w-0 space-y-3">
            <div className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
              06. 任务元数据
            </div>
            <div className="divide-y divide-zinc-200 border border-zinc-200 text-[11px] dark:divide-zinc-800 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-zinc-500">触发用户</span>
                <span className="font-mono font-bold">@{job.username || '未知'}</span>
              </div>
              {job.userId && (
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="shrink-0 text-zinc-500">用户编号</span>
                  <span
                    className="truncate font-mono text-zinc-600 dark:text-zinc-400"
                    title={job.userId}
                  >
                    {job.userId}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-zinc-500">创建时间</span>
                <span className="font-mono">
                  {formatTimestampMs(trace?.startedAt ?? job.createdAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-zinc-500">完成时间</span>
                <span className="font-mono">
                  {formatTimestampMs(trace?.finishedAt ?? job.finishedAt)}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* 放大预览弹窗（成图与参考图通用） */}
      <Dialog open={Boolean(previewImg)} onOpenChange={(o) => !o && setPreviewImg(null)}>
        <DialogContent className="max-w-3xl rounded-none border-zinc-950 sm:max-w-3xl dark:border-zinc-200">
          <DialogHeader>
            <DialogTitle className="truncate pr-8 text-xs font-bold">
              {previewImg?.title || '图片预览'}
            </DialogTitle>
          </DialogHeader>
          {previewImg && (
            <div className="flex items-center justify-center bg-zinc-100 p-3 dark:bg-zinc-900">
              <img
                src={previewImg.url}
                alt={previewImg.title}
                className="max-h-[78dvh] w-auto max-w-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
