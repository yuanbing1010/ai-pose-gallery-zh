import { createFileRoute } from '@tanstack/react-router'
import { InfiniteCanvasWorkbench } from '@/components/canvas/InfiniteCanvasWorkbench'

export const Route = createFileRoute('/canvas')({
  staticData: { title: '无限画布' },
  component: CanvasPage,
})

function CanvasPage() {
  return <InfiniteCanvasWorkbench />
}
