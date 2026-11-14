import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// 创意前端分组卡片
export function Section({
  title,
  desc,
  actions,
  children,
  className,
  outerClassName,
}: {
  title: string
  desc?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  outerClassName?: string
}) {
  const cleanTitle = title
    .replace(/^\d+\s*\/\/\s*[A-Z_\s&]+·\s*/, '')
    .replace(/^[A-Z_]+\s*\/\/\s*/, '')

  return (
    <section
      data-impeccable-ignore="nested-cards"
      className={cn(
        '@container/section ks-elevation min-w-0 rounded-3xl border border-border bg-card p-4 sm:p-6',
        outerClassName
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h2 className="text-base font-extrabold tracking-tight">{cleanTitle}</h2>
          {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-1.5 [&>div]:flex-wrap">{actions}</div>}
      </div>
      <div className={cn('mt-4 grid min-w-0 grid-cols-1 gap-4 @lg/section:grid-cols-2 [&>*]:min-w-0', className)}>
        {children}
      </div>
    </section>
  )
}

// 表单项：标签 + 输入框 + 提示
export function Field({
  label,
  htmlFor,
  hint,
  badge,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <div className="flex min-h-5 flex-wrap items-center gap-2">
        <label
          htmlFor={htmlFor}
          className="text-sm leading-snug font-semibold select-none [overflow-wrap:anywhere]"
        >
          {label}
        </label>
        {badge}
      </div>
      <div className="min-w-0 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]]:bg-background [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:overflow-hidden [&_input]:bg-background">
        {children}
      </div>
      {hint && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>}
    </div>
  )
}
