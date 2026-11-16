import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, DownloadIcon, ExternalLinkIcon, PlusIcon, XIcon, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CardAccent } from '@/lib/cardAccents'
import { cn } from '@/lib/utils'

export interface ShowcaseStageTabItem<T extends string = string> {
  id: T
  label: string
  icon: LucideIcon
}

export function ShowcaseStageTabs<T extends string>({
  items,
  value,
  onChange,
  layoutId = 'showcase-stage-tab-pill',
}: {
  items: ShowcaseStageTabItem<T>[]
  value: T
  onChange: (id: T) => void
  layoutId?: string
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-black/60 p-1 ring-1 ring-white/15 backdrop-blur-md">
      {items.map((item) => {
        const active = value === item.id
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-xs',
              active ? 'text-black' : 'text-zinc-300 hover:text-white'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className="absolute inset-0 rounded-full bg-white shadow-sm"
              />
            )}
            <Icon className="relative z-10 size-3.5" />
            <span className="relative z-10">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export interface ShowcaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accent: CardAccent
  categoryLabel: string
  secondaryTag?: string
  title: string
  subtitle?: string
  stageTopLeft?: ReactNode
  stageContent: ReactNode
  stageFooter?: ReactNode
  sidebarBody?: ReactNode
  picked: boolean
  pickLabel: string
  onTogglePick: () => void
  downloadHref: string
  downloadName?: string
  downloadLabel?: string
  downloadExternal?: boolean
  externalHref: string
  externalLabel?: string
}

export function ShowcaseDialog({
  open,
  onOpenChange,
  accent,
  categoryLabel,
  secondaryTag,
  title,
  subtitle,
  stageTopLeft,
  stageContent,
  stageFooter,
  sidebarBody,
  picked,
  pickLabel,
  onTogglePick,
  downloadHref,
  downloadName,
  downloadLabel = '下载高清图',
  downloadExternal = false,
  externalHref,
  externalLabel = '新窗口打开',
}: ShowcaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dark max-h-[92dvh] w-[95vw] max-w-[960px] overflow-y-auto rounded-[28px] border border-white/[0.08] bg-[#0B0B0D] p-0 text-white shadow-[0_32px_90px_rgba(0,0,0,0.85)] sm:max-w-[960px]"
      >
        <div className="relative grid md:grid-cols-[1.25fr_340px]">
          <DialogClose asChild>
            <button
              type="button"
              aria-label="关闭弹窗"
              className="absolute top-4 right-4 z-30 flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-zinc-300 transition-colors hover:bg-white/[0.16] hover:text-white"
            >
              <XIcon className="size-4" />
            </button>
          </DialogClose>

          {/* 左侧：纯净暗房展示舞台 */}
          <div className="relative flex min-h-[300px] flex-col items-center justify-between overflow-hidden bg-[#121215] px-4 pt-14 pb-4 sm:min-h-[520px] sm:px-6 sm:pt-16 sm:pb-6">
            {stageTopLeft && <div className="absolute top-3 left-3 z-20 pr-12 sm:top-4 sm:left-4 sm:pr-0">{stageTopLeft}</div>}

            <div className="relative z-10 flex w-full flex-1 items-center justify-center">{stageContent}</div>

            {stageFooter && <div className="relative z-20 flex flex-col items-center gap-2.5 pt-2">{stageFooter}</div>}
          </div>

          {/* 右侧：克制编排的信息与行动栏 */}
          <div className="flex flex-col justify-between gap-4 border-t border-white/[0.08] bg-[#0E0E11] p-4 sm:gap-6 sm:p-7 md:border-t-0 md:border-l">
            <div className="space-y-5">
              <DialogHeader className="space-y-3 pr-9 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1',
                      accent.pill
                    )}
                  >
                    <span className={cn('size-1.5 rounded-full', accent.dot)} />
                    {categoryLabel}
                  </span>
                  {secondaryTag && (
                    <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-medium text-zinc-200 ring-1 ring-white/[0.08]">
                      {secondaryTag}
                    </span>
                  )}
                </div>
                <DialogTitle className="text-lg leading-snug font-semibold tracking-tight text-white sm:text-xl">
                  {title}
                </DialogTitle>
                {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
              </DialogHeader>

              <div className="h-px bg-white/[0.08]" />

              {sidebarBody}
            </div>

            <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-2 border-t border-white/[0.08] bg-[#0E0E11]/95 px-4 pt-3 pb-4 backdrop-blur-md md:static md:mx-0 md:border-t-0 md:bg-transparent md:p-0 md:pt-2 md:backdrop-blur-none">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onTogglePick}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-colors',
                  picked
                    ? 'bg-[#19857B] text-white hover:bg-[#146f66]'
                    : 'bg-white text-black hover:bg-zinc-200'
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={picked ? 'picked' : 'unpicked'}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 }}
                    className="inline-flex items-center"
                  >
                    {picked ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
                  </motion.span>
                </AnimatePresence>
                <span>{pickLabel}</span>
              </motion.button>

              <Button
                variant="outline"
                size="icon"
                title={downloadLabel}
                aria-label={downloadLabel}
                className="size-11 shrink-0 rounded-full border-white/[0.1] bg-white/[0.06] text-zinc-200 hover:bg-white/[0.14] hover:text-white"
                asChild
              >
                <a
                  href={downloadHref}
                  download={downloadExternal ? undefined : downloadName}
                  target={downloadExternal ? '_blank' : undefined}
                  rel="noopener noreferrer"
                >
                  <DownloadIcon className="size-4" />
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                title={externalLabel}
                aria-label={externalLabel}
                className="size-11 shrink-0 rounded-full border-white/[0.1] bg-white/[0.06] text-zinc-200 hover:bg-white/[0.14] hover:text-white"
                asChild
              >
                <a href={externalHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
