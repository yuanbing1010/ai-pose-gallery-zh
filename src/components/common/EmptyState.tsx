import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { InboxIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { MOTION_EASE_OUT } from '@/lib/motionTokens'

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: MOTION_EASE_OUT }}
      className="ed-mat flex min-h-[260px] flex-col items-center justify-center gap-3.5 rounded-[20px] px-6 py-12 text-center"
    >
      <div className="inline-flex items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#D9381E]" />
        <span>ARCHIVE · EMPTY</span>
      </div>
      <div className="flex items-center justify-center gap-2 text-base font-extrabold tracking-tight text-foreground">
        <Icon className="size-4.5 shrink-0 text-[var(--skin-accent)]" />
        <span>{title}</span>
      </div>
      {description && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </motion.div>
  )
}
