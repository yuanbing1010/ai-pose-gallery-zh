import { useState, type ReactNode } from 'react'
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, LoaderCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { ADMIN_DIALOG_CLS, type AdminConfirmAction } from './auditHelpers'

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-950 pb-3.5 dark:border-zinc-100">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function AdminPanel({
  title,
  subtitle,
  icon,
  headerRight,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  headerRight?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  padded?: boolean
}) {
  const hasHeader = Boolean(title || subtitle || headerRight)
  return (
    <section className={cn('border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950', className)}>
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="min-w-0">
            {title && (
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-950 dark:text-zinc-100">
                {icon}
                <span>{title}</span>
              </div>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
            )}
          </div>
          {headerRight && <div className="flex flex-wrap items-center gap-2">{headerRight}</div>}
        </div>
      )}
      <div className={cn(padded ? 'p-4 sm:p-5' : undefined, bodyClassName)}>{children}</div>
    </section>
  )
}

export interface AdminMetricItem {
  code?: string
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'success' | 'danger' | 'warning'
  onClick?: () => void
}

const METRIC_TONE_CLS: Record<NonNullable<AdminMetricItem['tone']>, string> = {
  default: 'text-zinc-950 dark:text-zinc-50',
  success: 'text-emerald-600 dark:text-emerald-400',
  danger: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
}

export function AdminMetricGrid({ items }: { items: AdminMetricItem[] }) {
  const colsCls =
    items.length <= 1
      ? 'grid-cols-1 sm:divide-y-0'
      : items.length === 2
        ? 'grid-cols-2 sm:grid-cols-2 sm:divide-y-0'
        : items.length === 3
          ? 'grid-cols-2 sm:grid-cols-3 sm:divide-y-0'
          : items.length === 5
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0'
            : 'grid-cols-2 sm:grid-cols-4 lg:divide-y-0'
  return (
    <div
      className={cn(
        'grid divide-x divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800',
        colsCls
      )}
    >
      {items.map((item, idx) => {
        const inner = (
          <>
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span className="truncate">
                {item.code ? <span className="mr-1 font-mono">{item.code}</span> : null}
                {item.label}
              </span>
              {item.onClick && (
                <ArrowRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </div>
            <div className={cn('mt-1.5 font-mono text-xl font-bold sm:text-2xl', METRIC_TONE_CLS[item.tone ?? 'default'])}>
              {item.value}
            </div>
            {item.hint && (
              <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {item.hint}
              </div>
            )}
          </>
        )

        if (item.onClick) {
          return (
            <button
              key={idx}
              type="button"
              onClick={item.onClick}
              className="group p-4 text-left transition-colors hover:bg-zinc-50 sm:p-5 dark:hover:bg-zinc-900/60"
            >
              {inner}
            </button>
          )
        }
        return (
          <div key={idx} className="p-4 sm:p-5">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

export interface AdminFilterOption<T extends string> {
  id: T
  label: string
}

export function AdminFilterBar<T extends string>({
  options,
  value,
  onChange,
  rightSlot,
}: {
  options: ReadonlyArray<AdminFilterOption<T>>
  value: T
  onChange: (next: T) => void
  rightSlot?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {options.map((opt) => {
          const active = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                'border px-2.5 py-1 font-mono text-xs transition-colors',
                active
                  ? 'border-zinc-950 bg-zinc-950 font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100'
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {rightSlot && <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
    </div>
  )
}

export function AdminBadge({
  children,
  tone = 'neutral',
  title,
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'dark' | 'success' | 'warning' | 'danger' | 'info'
  title?: string
  className?: string
}) {
  const toneCls: Record<NonNullable<typeof tone>, string> = {
    neutral: 'border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
    dark: 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950',
    success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400',
    warning: 'border-amber-600/45 bg-amber-500/10 text-amber-800 dark:border-amber-500/40 dark:text-amber-300',
    danger: 'border-red-600/45 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:text-red-400',
    info: 'border-sky-600/45 bg-sky-500/10 text-sky-800 dark:border-sky-500/40 dark:text-sky-300',
  }
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-xs font-semibold',
        toneCls[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function AdminField({
  label,
  htmlFor,
  required,
  hint,
  rightSlot,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  rightSlot?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-xs font-bold text-zinc-900 dark:text-zinc-100">
            {label}
            {required ? <span className="ml-0.5 text-red-600">*</span> : null}
          </label>
        ) : (
          <div className="block text-xs font-bold text-zinc-900 dark:text-zinc-100">
            {label}
            {required ? <span className="ml-0.5 text-red-600">*</span> : null}
          </div>
        )}
        {rightSlot}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  )
}

export function AdminConfirmDialog({
  action,
  onClose,
}: {
  action: AdminConfirmAction | null
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog open={Boolean(action)} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent className={ADMIN_DIALOG_CLS}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm font-bold">{action?.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            {action?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="rounded-none text-xs">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={cn(
              'rounded-none text-xs',
              action?.destructive ? 'bg-red-600 text-white hover:bg-red-700' : undefined
            )}
            onClick={async (e) => {
              e.preventDefault()
              if (!action) return
              setBusy(true)
              try {
                await action.run()
                onClose()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : '操作失败')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
            <span>{action?.confirmLabel || '确认'}</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AdminPagination({
  offset,
  limit,
  total,
  loading = false,
  unitLabel = '条',
  alwaysShowSummary = false,
  onPageChange,
  className,
}: {
  offset: number
  limit: number
  total: number
  loading?: boolean
  unitLabel?: string
  alwaysShowSummary?: boolean
  onPageChange: (nextOffset: number) => void
  className?: string
}) {
  if (total <= 0) return null
  if (!alwaysShowSummary && total <= limit) return null

  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const startItem = Math.min(total, offset + 1)
  const endItem = Math.min(total, offset + limit)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border border-zinc-200 px-4 py-2.5 font-mono text-xs text-zinc-500 dark:border-zinc-800',
        className
      )}
    >
      <span>
        {alwaysShowSummary
          ? `第 ${startItem}–${endItem} ${unitLabel} · 共 ${total} ${unitLabel}`
          : `第 ${currentPage} / ${totalPages} 页 · 共 ${total} ${unitLabel}`}
      </span>
      {total > limit && (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-none text-xs"
            disabled={loading || offset <= 0}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            <ChevronLeftIcon className="size-3.5" />
            上一页
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-none text-xs"
            disabled={loading || offset + limit >= total}
            onClick={() => onPageChange(offset + limit)}
          >
            下一页
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
