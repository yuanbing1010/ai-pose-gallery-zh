import type { LucideIcon } from 'lucide-react'
import { InboxIcon } from 'lucide-react'
import { motion } from 'motion/react'

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
}: {
  icon?: LucideIcon
  title: string
  description?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="ks-elevation flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card px-6 py-12 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted text-[#D9381E]">
        <Icon className="size-5" />
      </div>
      <div className="text-base font-extrabold tracking-tight text-foreground">{title}</div>
      {description && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
    </motion.div>
  )
}
