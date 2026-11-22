import { useState } from 'react'
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  ShieldAlertIcon,
} from 'lucide-react'
import { toast } from '@/lib/notifications'
import type { GenerationAttemptTrace } from '@/types/gallery'
import {
  TRIGGER_TYPE_META,
  formatJsonText,
  formatTimeMs,
  formatTraceBytes,
  formatTraceDuration,
} from './auditHelpers'

export function CopyActionButton({
  text,
  label,
  toastMessage,
  className = '',
}: {
  text: string
  label: string
  toastMessage: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(toastMessage)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('复制失败，请手动选中复制')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`inline-flex shrink-0 items-center gap-1 border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100 dark:hover:text-white ${className}`}
    >
      {copied ? (
        <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CopyIcon className="size-3" />
      )}
      <span>{copied ? '已复制' : label}</span>
    </button>
  )
}

function extractPromptFromParams(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null
  const rec = params as Record<string, unknown>
  if (typeof rec.prompt === 'string' && rec.prompt.trim()) return rec.prompt
  if (Array.isArray(rec.contents)) {
    for (const c of rec.contents) {
      if (c && typeof c === 'object' && Array.isArray((c as any).parts)) {
        for (const p of (c as any).parts) {
          if (p && typeof p === 'object' && typeof p.text === 'string' && p.text.trim()) {
            return p.text
          }
        }
      }
    }
  }
  if (Array.isArray(rec.messages)) {
    for (const m of rec.messages) {
      if (m && typeof m === 'object' && Array.isArray((m as any).content)) {
        for (const item of (m as any).content) {
          if (item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim()) {
            return item.text
          }
        }
      }
    }
  }
  if (Array.isArray(rec.input)) {
    for (const item of rec.input) {
      if (item && typeof item === 'object' && Array.isArray((item as any).content)) {
        for (const part of (item as any).content) {
          if (part && typeof part === 'object' && typeof part.text === 'string' && part.text.trim()) {
            return part.text
          }
        }
      }
    }
  }
  return null
}

export function TraceAttemptCard({
  attempt,
  defaultExpanded,
  expandOverride,
}: {
  attempt: GenerationAttemptTrace
  defaultExpanded: boolean
  expandOverride?: { version: number; expanded: boolean } | null
}) {
  const [reqToggle, setReqToggle] = useState<{ version: number; expanded: boolean }>({
    version: 0,
    expanded: defaultExpanded,
  })
  const [resToggle, setResToggle] = useState<{ version: number; expanded: boolean }>({
    version: 0,
    expanded: defaultExpanded,
  })

  const overrideVer = expandOverride?.version ?? 0
  const reqExpanded =
    expandOverride && overrideVer > reqToggle.version ? expandOverride.expanded : reqToggle.expanded
  const resExpanded =
    expandOverride && overrideVer > resToggle.version ? expandOverride.expanded : resToggle.expanded

  const triggerMeta = TRIGGER_TYPE_META[attempt.triggerType] ?? {
    label: attempt.triggerType,
    badgeClass: 'border-zinc-400 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  }
  const isSuccess = attempt.outcome === 'succeeded'
  const isInProgress = attempt.outcome === 'in_progress'
  const requestParamsText = formatJsonText(attempt.request.params)
  const sentPromptPreview = extractPromptFromParams(attempt.request.params)
  const responseBodyText = attempt.response ? formatJsonText(attempt.response.body) : ''

  return (
    <article
      className={`min-w-0 border bg-white dark:bg-zinc-950 ${
        isSuccess
          ? 'border-emerald-600/50 dark:border-emerald-500/40'
          : isInProgress
            ? 'border-amber-500/50 dark:border-amber-500/40'
            : 'border-red-500/45 dark:border-red-500/40'
      }`}
    >
      {/* 卡片顶部：序号、触发动作、状态、时间窗与耗时 */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${
          isSuccess
            ? 'border-emerald-600/30 bg-emerald-500/5 dark:border-emerald-500/30'
            : isInProgress
              ? 'border-amber-500/30 bg-amber-500/5 dark:border-amber-500/30'
              : 'border-red-500/30 bg-red-500/5 dark:border-red-500/30'
        }`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="border border-zinc-950 bg-zinc-950 px-1.5 py-0.5 font-mono font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950">
            第 {attempt.attemptIndex} 次
          </span>
          <span className={`border px-1.5 py-0.5 text-xs font-bold ${triggerMeta.badgeClass}`}>
            {triggerMeta.label}
          </span>
          <span
            className={`border px-1.5 py-0.5 text-xs font-bold ${
              isSuccess
                ? 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : isInProgress
                  ? 'border-amber-600/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  : 'border-red-600/40 bg-red-500/15 text-red-700 dark:text-red-400'
            }`}
          >
            {isSuccess ? '成功' : isInProgress ? '调用中' : '失败'}
          </span>
          {attempt.delayMs > 0 && (
            <span className="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300">
              等待延迟 {(attempt.delayMs / 1000).toFixed(1)} 秒
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3" />
            {formatTimeMs(attempt.startedAt)} →{' '}
            {isInProgress ? '进行中…' : formatTimeMs(attempt.finishedAt)}
          </span>
          <span className="font-sans font-bold text-zinc-950 dark:text-zinc-100">
            {isInProgress ? '耗时 进行中' : `耗时 ${formatTraceDuration(attempt.durationMs)}`}
          </span>
        </div>
      </div>

      {/* 调度目标、触发原因与上一跳报错 */}
      <div className="space-y-2.5 border-b border-zinc-200 px-4 py-3 text-xs dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-xs font-bold text-zinc-500">调度目标</span>
          <span className="font-bold text-zinc-950 dark:text-zinc-100">{attempt.supplierName}</span>
          <span className="text-zinc-400">/</span>
          <span className="font-semibold">{attempt.channelName}</span>
          {(attempt.supplierKeyLabel || attempt.supplierKeyHint) && (
            <span className="border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              密钥：{attempt.supplierKeyLabel ? `${attempt.supplierKeyLabel} ` : ''}
              {attempt.supplierKeyHint ? `(${attempt.supplierKeyHint})` : ''}
            </span>
          )}
          <span className="text-zinc-400">·</span>
          <span className="border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-bold dark:border-zinc-800 dark:bg-zinc-900">
            {attempt.model}
          </span>
          <span className="border border-zinc-300 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {attempt.endpointMode}
          </span>
        </div>

        <div className="text-xs leading-relaxed text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300">
          <span className="mr-2 text-xs font-bold text-zinc-500">触发原因</span>
          {attempt.triggerReason}
        </div>

        {attempt.previousError && (
          <div className="flex items-start gap-2 border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 font-mono [overflow-wrap:anywhere]">
              <span className="font-sans font-bold">上一跳错误：</span>
              <span>{attempt.previousError}</span>
            </div>
          </div>
        )}
      </div>

      {/* 请求入参 */}
      <div className="min-w-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-2 dark:bg-zinc-900/70">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs">
            <span className="shrink-0 font-bold text-zinc-950 dark:text-zinc-100">请求入参</span>
            <span className="shrink-0 border border-zinc-300 bg-white px-1.5 py-0.5 font-mono font-bold dark:border-zinc-700 dark:bg-zinc-950">
              {attempt.request.method}
            </span>
            <span className="min-w-0 font-mono break-all text-zinc-600 dark:text-zinc-400">
              {attempt.request.url}
            </span>
            {attempt.request.authSummary && (
              <span className="border border-zinc-300 px-1.5 py-0.5 font-mono text-xs text-zinc-600 [overflow-wrap:anywhere] dark:border-zinc-700 dark:text-zinc-400">
                鉴权：{attempt.request.authSummary}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <CopyActionButton
              text={requestParamsText}
              label="复制入参"
              toastMessage={`已复制第 ${attempt.attemptIndex} 次调用入参`}
            />
            <button
              type="button"
              onClick={() => setReqToggle({ version: overrideVer, expanded: !reqExpanded })}
              className="inline-flex items-center gap-1 border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100"
            >
              {reqExpanded ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
              <span>{reqExpanded ? '收起' : '展开'}</span>
            </button>
          </div>
        </div>
        {reqExpanded && (
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            {sentPromptPreview && (
              <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-1.5 text-xs font-bold text-zinc-500">
                  实际发送文本提示词（保留完整换行，下方 JSON 中 \n 仅为 JSON 转义展示）
                </div>
                <pre className="max-h-[240px] overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-zinc-900 dark:text-zinc-100">
                  {sentPromptPreview}
                </pre>
              </div>
            )}
            <pre className="max-h-[420px] w-full overflow-y-auto bg-zinc-50/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {requestParamsText}
            </pre>
          </div>
        )}
      </div>

      {/* 响应出参 */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-2 dark:bg-zinc-900/70">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-zinc-950 dark:text-zinc-100">响应出参</span>
            {attempt.response ? (
              <>
                <span
                  className={`border px-1.5 py-0.5 font-mono font-bold ${
                    attempt.response.ok
                      ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-400'
                  }`}
                >
                  状态码 {attempt.response.status ?? '—'}
                </span>
                {attempt.response.requestId && (
                  <span className="border border-zinc-300 px-1.5 py-0.5 font-mono text-xs text-zinc-600 [overflow-wrap:anywhere] dark:border-zinc-700 dark:text-zinc-400">
                    请求编号：{attempt.response.requestId}
                  </span>
                )}
              </>
            ) : (
              <span className="border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                {isInProgress ? '等待上游响应中…' : '无响应（前置阶段或网络中断）'}
              </span>
            )}
          </div>
          {attempt.response && (
            <div className="flex shrink-0 items-center gap-1.5">
              <CopyActionButton
                text={responseBodyText}
                label="复制出参"
                toastMessage={`已复制第 ${attempt.attemptIndex} 次调用出参`}
              />
              <button
                type="button"
                onClick={() => setResToggle({ version: overrideVer, expanded: !resExpanded })}
                className="inline-flex items-center gap-1 border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-100"
              >
                {resExpanded ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
                <span>{resExpanded ? '收起' : '展开'}</span>
              </button>
            </div>
          )}
        </div>

        {attempt.response?.outputSummary && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-emerald-500/5 px-4 py-2 text-xs dark:border-zinc-800">
            <span className="font-bold text-emerald-700 dark:text-emerald-400">输出摘要</span>
            <span className="border border-emerald-600/30 px-1.5 py-0.5 font-mono font-bold">
              {attempt.response.outputSummary.kind === 'b64_data' ? '内联图片数据' : '外部图片链接'}
            </span>
            <span className="font-mono">{attempt.response.outputSummary.mime}</span>
            <span>·</span>
            <span className="font-mono">
              {formatTraceBytes(attempt.response.outputSummary.bytes)}
            </span>
            {attempt.response.outputSummary.externalUrl && (
              <span className="font-mono break-all text-zinc-500">
                · {attempt.response.outputSummary.externalUrl}
              </span>
            )}
          </div>
        )}

        {(attempt.error ||
          (attempt.retryable !== null && attempt.retryable !== undefined) ||
          attempt.safetyBlocked) && (
          <div className="space-y-1.5 border-t border-zinc-200 bg-red-500/5 px-4 py-2.5 text-xs dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {attempt.retryable !== null && attempt.retryable !== undefined && (
                <span
                  className={`border px-1.5 py-0.5 font-bold ${
                    attempt.retryable
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                      : 'border-zinc-400/50 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {attempt.retryable ? '可重试' : '不可重试'}
                </span>
              )}
              {attempt.safetyBlocked && (
                <span className="inline-flex items-center gap-1 border border-red-600/50 bg-red-500/15 px-1.5 py-0.5 font-bold text-red-700 dark:text-red-400">
                  <ShieldAlertIcon className="size-3" />
                  合规拦截
                </span>
              )}
            </div>
            {attempt.error && (
              <div className="font-mono text-xs leading-relaxed [overflow-wrap:anywhere] text-red-700 dark:text-red-400">
                {attempt.error}
              </div>
            )}
          </div>
        )}

        {attempt.response && resExpanded && (
          <pre className="max-h-[420px] w-full overflow-y-auto border-t border-zinc-200 bg-zinc-50/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {responseBodyText}
          </pre>
        )}
      </div>
    </article>
  )
}
