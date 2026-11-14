import type { LucideIcon } from 'lucide-react'
import { InboxIcon } from 'lucide-react'

export function EmptyState({ icon: Icon = InboxIcon, title, description }: { icon?: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border border-indigo-500/20 bg-card/85 px-6 py-12 text-center shadow-sm backdrop-blur-md">
      <div className="holo-gradient flex size-12 items-center justify-center rounded-2xl text-white shadow-md">
        <Icon className="size-5" />
      </div>
      <div className="text-base font-extrabold">{title}</div>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    </div>
  )
}
