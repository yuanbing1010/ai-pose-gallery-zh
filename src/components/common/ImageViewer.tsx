import { useRef, type ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { DownloadIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadFileName } from '@/lib/recipeImages'
import { ZoomViewport, type ZoomViewportProps } from './ZoomViewport'

interface ImageViewerProps extends ZoomViewportProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  downloadName?: string
  children?: ReactNode
}

export function ImageViewer({ open, onOpenChange, title = '图片大图预览', downloadName, ...viewportProps }: ImageViewerProps) {
  const returnFocus = useRef<HTMLElement | null>(null)
  const resolvedDownloadName =
    downloadName || downloadFileName(title, viewportProps.imageUrl || '')
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-frosted-surface="true"
        className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-[8px] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content data-slot="dialog-content" aria-describedby={undefined}
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={(event) => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus() } }}
        onEscapeKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); onOpenChange(false) }}
        className="fixed top-1/2 left-1/2 z-[101] flex h-[92dvh] w-[96vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden overscroll-contain rounded-[24px] border border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none duration-180 ease-[var(--ease-out)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-130 sm:p-5">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DialogPrimitive.Title className="mr-auto text-lg font-semibold">{title}</DialogPrimitive.Title>
          {viewportProps.imageUrl && !viewportProps.children && <Button asChild variant="outline" className="min-h-11"><a href={viewportProps.imageUrl} download={resolvedDownloadName}><DownloadIcon className="size-4" />下载原图</a></Button>}
          <DialogPrimitive.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭图片预览"><XIcon className="size-4" /></Button></DialogPrimitive.Close>
        </div>
        <ZoomViewport {...viewportProps} className="min-h-0 flex-1" />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
