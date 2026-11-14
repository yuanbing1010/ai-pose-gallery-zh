import type { ReactNode } from 'react'

// 瑞士网格统计单元
export function StatCard({
  index,
  title,
  value,
  icon,
  desc,
}: {
  index?: string
  title: string
  value: ReactNode
  icon?: ReactNode
  desc?: string
}) {
  return (
    <div className="flex min-h-[96px] flex-col justify-between bg-background p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {index ? `${index} / ` : ''}
          {title}
        </div>
        {icon && <div className="text-muted-foreground/70 [&_svg]:size-3.5">{icon}</div>}
      </div>
      <div className="mt-2 truncate font-mono text-2xl leading-none font-bold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </div>
      <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{desc || '\u00a0'}</div>
    </div>
  )
}
