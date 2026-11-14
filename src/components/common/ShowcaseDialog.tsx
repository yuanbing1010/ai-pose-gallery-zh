import type { ReactNode } from 'react'
import { CheckIcon, DownloadIcon, ExternalLinkIcon, PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CardAccent } from '@/lib/cardAccents'
import { cn } from '@/lib/utils'

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
          <div className="relative flex min-h-[440px] flex-col items-center justify-between overflow-hidden bg-[#121215] px-6 pt-16 pb-6 sm:min-h-[560px]">
            {stageTopLeft && <div className="absolute top-4 left-4 z-20">{stageTopLeft}</div>}

            <div className="relative z-10 flex w-full flex-1 items-center justify-center">{stageContent}</div>

            {stageFooter && <div className="relative z-20 flex flex-col items-center gap-2.5 pt-2">{stageFooter}</div>}
          </div>

          {/* 右侧：克制编排的信息与行动栏 */}
          <div className="flex flex-col justify-between gap-6 border-t border-white/[0.08] bg-[#0E0E11] p-6 sm:p-7 md:border-t-0 md:border-l">
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

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onTogglePick}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-all active:scale-[0.98]',
                  picked
                    ? 'bg-[#19857B] text-white hover:bg-[#146f66]'
                    : 'bg-white text-black hover:bg-zinc-200'
                )}
              >
                {picked ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
                {pickLabel}
              </button>

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
