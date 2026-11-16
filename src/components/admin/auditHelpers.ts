import type {
  CreditLedgerType,
  GenerationAttemptTriggerType,
  GenerationHistoryItem,
  GenerationStatus,
  GenerationTraceReference,
} from '@/types/gallery'
import { referenceImageUrl } from '../../../shared/studio'

export type AdminTab =
  | 'overview'
  | 'suppliers'
  | 'api'
  | 'users'
  | 'redeem'
  | 'safety'
  | 'jobs'

export const ADMIN_TABS: readonly AdminTab[] = [
  'overview',
  'suppliers',
  'api',
  'users',
  'redeem',
  'safety',
  'jobs',
]

export interface AdminNavItemMeta {
  id: AdminTab
  code: string
  label: string
  group: 'operations' | 'models' | 'policy'
}

export interface AdminNavGroupMeta {
  id: 'operations' | 'models' | 'policy'
  label: string
  items: AdminNavItemMeta[]
}

export interface AdminConfirmAction {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  run: () => Promise<void>
}

export const ADMIN_INPUT_CLS = 'h-8 rounded-none font-mono text-xs'
export const ADMIN_TEXT_INPUT_CLS = 'h-8 rounded-none text-xs'
export const ADMIN_SELECT_CLS = 'h-8 rounded-none text-xs'
export const ADMIN_BTN_CLS = 'h-8 rounded-none text-xs'
export const ADMIN_BTN_SM_CLS = 'h-7 rounded-none text-xs'
export const ADMIN_DIALOG_CLS = 'rounded-none border-zinc-950 dark:border-zinc-200'

export function getAdminNavItems(): AdminNavItemMeta[] {
  return [
    { id: 'overview', code: '00', label: '系统总览', group: 'operations' },
    { id: 'users', code: '01', label: '成员与积分', group: 'operations' },
    { id: 'redeem', code: '02', label: '兑换码卡密', group: 'operations' },
    { id: 'suppliers', code: '03', label: '供应商凭证', group: 'models' },
    { id: 'api', code: '04', label: '模型渠道定价', group: 'models' },
    { id: 'jobs', code: '05', label: '生成记录审计', group: 'models' },
    { id: 'safety', code: '06', label: '准入、画风与模板', group: 'policy' },
  ]
}

export function getAdminNavGroups(): AdminNavGroupMeta[] {
  const items = getAdminNavItems()
  return [
    {
      id: 'operations',
      label: '运营与成员',
      items: items.filter((i) => i.group === 'operations'),
    },
    {
      id: 'models',
      label: '模型与链路',
      items: items.filter((i) => i.group === 'models'),
    },
    {
      id: 'policy',
      label: '安全与内容',
      items: items.filter((i) => i.group === 'policy'),
    },
  ]
}

export function formatAdminBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatAdminDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatAdminShortDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const safe = Math.max(0, Math.round(ms))
  if (safe < 1000) return `${safe}ms`
  return `${(safe / 1000).toFixed(1)}s`
}

export function generateRandomPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join('')
}

export const AUDIT_STATUS_META: Record<
  GenerationStatus,
  { label: string; badgeClass: string }
> = {
  succeeded: {
    label: '生成成功',
    badgeClass:
      'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400',
  },
  failed: {
    label: '生成失败',
    badgeClass:
      'border-red-600/40 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:text-red-400',
  },
  processing: {
    label: '处理中',
    badgeClass:
      'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:border-amber-500/40 dark:text-amber-300',
  },
}

export const TRIGGER_TYPE_META: Record<
  GenerationAttemptTriggerType,
  { label: string; badgeClass: string }
> = {
  initial: {
    label: '首次调度',
    badgeClass:
      'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950',
  },
  failover_switch: {
    label: '渠道故障切换',
    badgeClass:
      'border-amber-600/50 bg-amber-500/15 text-amber-800 dark:border-amber-500/40 dark:text-amber-300',
  },
  transient_retry: {
    label: '同渠道瞬态重试',
    badgeClass:
      'border-sky-600/50 bg-sky-500/15 text-sky-800 dark:border-sky-500/40 dark:text-sky-300',
  },
  compat_downgrade: {
    label: '协议参数降级重试',
    badgeClass:
      'border-purple-600/50 bg-purple-500/15 text-purple-800 dark:border-purple-500/40 dark:text-purple-300',
  },
  fallback_retry: {
    label: '首渠道兜底重试',
    badgeClass:
      'border-orange-600/50 bg-orange-500/15 text-orange-800 dark:border-orange-500/40 dark:text-orange-300',
  },
}

export const TRACE_SLOT_LABELS: Record<GenerationTraceReference['slot'], string> = {
  portrait: '人像',
  costume: '服装',
  pose: '姿势',
  extra: '附图',
  stitched: '拼图',
}

export const LEDGER_TYPE_LABELS: Record<CreditLedgerType, string> = {
  register_bonus: '注册赠送',
  redeem_code: '卡密兑换',
  admin_adjust: '后台调账',
  generate_deduct: '生图扣费',
  generate_refund: '失败退还',
}

export function formatTimestampMs(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts)) return '—'
  const d = new Date(ts)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export function formatTimeMs(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts)) return '—'
  const d = new Date(ts)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export function formatTraceDuration(ms?: number | null): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const safe = Math.max(0, Math.round(ms))
  if (safe < 1000) return `${safe} 毫秒`
  return `${(safe / 1000).toFixed(2)} 秒 (${safe} 毫秒)`
}

export function formatTraceShortDuration(ms?: number | null): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const safe = Math.max(0, Math.round(ms))
  if (safe < 1000) return `${safe} 毫秒`
  return `${(safe / 1000).toFixed(2)} 秒`
}

export function formatTraceBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatJsonText(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value || '""'
  try {
    return JSON.stringify(value, null, 2) ?? 'null'
  } catch {
    return String(value)
  }
}

export function buildFallbackReferences(job: GenerationHistoryItem): GenerationTraceReference[] {
  const recipe = job.snapshot?.recipe
  if (!recipe) return []
  const refs: GenerationTraceReference[] = []
  let idx = 1

  if (recipe.pose) {
    const raw = recipe.pose.r2Key || recipe.pose.原图 || recipe.pose.缩略图 || ''
    refs.push({
      index: idx++,
      slot: 'pose',
      label: recipe.pose.姿势名称 || '姿势参考',
      sourceKind: recipe.pose.r2Key || recipe.pose.source === 'upload' ? 'r2' : 'gallery',
      rawPath: raw,
    })
  }
  if (recipe.costume) {
    const raw =
      recipe.costume.r2Key ||
      recipe.costume.预览图 ||
      recipe.costume.原图 ||
      recipe.costume.缩略图 ||
      ''
    refs.push({
      index: idx++,
      slot: 'costume',
      label: recipe.costume.服装名称 || '服装参考',
      sourceKind:
        recipe.costume.r2Key || recipe.costume.source === 'upload'
          ? 'r2'
          : /^https?:\/\//i.test(raw)
            ? 'https'
            : 'gallery',
      rawPath: raw,
    })
  }
  if (recipe.portrait) {
    const raw = recipe.portrait.r2Key || recipe.portrait.原图 || recipe.portrait.缩略图 || ''
    refs.push({
      index: idx++,
      slot: 'portrait',
      label: recipe.portrait.发型名称 || recipe.portrait.标题 || '人像参考',
      sourceKind: recipe.portrait.r2Key || recipe.portrait.source === 'upload' ? 'r2' : 'gallery',
      rawPath: raw,
    })
  }
  for (const extra of recipe.extraImages || []) {
    const raw = extra.r2Key || extra.url || ''
    refs.push({
      index: idx++,
      slot: 'extra',
      label: extra.name || '附加参考',
      sourceKind: extra.r2Key ? 'r2' : /^https?:\/\//i.test(raw) ? 'https' : 'gallery',
      rawPath: raw,
    })
  }
  return refs
}

export function resolveRefPreviewUrl(ref: GenerationTraceReference): string | null {
  if (!ref.rawPath) return null
  if (ref.sourceKind === 'r2') {
    if (ref.rawPath.startsWith('/api/files/')) return ref.rawPath
    return `/api/files/${ref.rawPath.replace(/^\/+/, '')}`
  }
  if (ref.sourceKind === 'https') {
    return /^https:\/\//i.test(ref.rawPath) ? ref.rawPath : null
  }
  return referenceImageUrl(ref.rawPath)
}
