import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PackStage, type DrawnPack } from '@/components/home/PackStage'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export type { DrawnPack }

export interface PackOpeningModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  drawn: DrawnPack | null
  onRedraw: () => void
  onApplyToRecipe: (pack: DrawnPack) => void
}

export function PackOpeningModal({
  open,
  onOpenChange,
  drawn,
  onRedraw,
  onApplyToRecipe,
}: PackOpeningModalProps) {
  const navigate = useNavigate()
  const [packSeed, setPackSeed] = useState(0)
  const [muted, setMuted] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92dvh] w-[95vw] max-w-[940px] overflow-hidden rounded-[28px] border border-border bg-[radial-gradient(120%_95%_at_50%_38%,#f8f6f1,#eae6dc_62%,#dad5ca)] p-0 text-[#141414] shadow-[0_32px_90px_rgba(0,0,0,0.35)] dark:bg-[radial-gradient(120%_95%_at_50%_38%,#1d1d24,#0f0f13_62%,#070709)] dark:text-white sm:max-w-[940px]"
      >
        <DialogTitle className="sr-only">全息卡包抽取</DialogTitle>

        {open && drawn ? (
          <PackStage
            variant="modal"
            drawn={drawn}
            packSeed={packSeed}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onClose={() => onOpenChange(false)}
            onRedraw={() => {
              setPackSeed((s) => s + 1)
              onRedraw()
            }}
            onSynthesize={(pack) => {
              onApplyToRecipe(pack)
              onOpenChange(false)
              void navigate({ to: '/studio' })
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
