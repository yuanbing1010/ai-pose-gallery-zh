import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  EraserIcon,
  LoaderCircleIcon,
  Paintbrush2Icon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { uploadReferenceFileApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { playCameraShutter, playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import type { CanvasImageNode } from './types'

interface StrokePath {
  mode: 'brush' | 'erase'
  size: number
  points: Array<{ x: number; y: number }>
}

export interface InpaintSubmission {
  sourceNode: CanvasImageNode
  instruction: string
  maskAssetUrl?: string
  maskR2Key?: string
  autoRun: boolean
}

export function CanvasInpaintDialog({
  node,
  open,
  isAuthenticated,
  onRequireAuth,
  onOpenChange,
  onSubmit,
}: {
  node: CanvasImageNode | null
  open: boolean
  isAuthenticated: boolean
  onRequireAuth: () => void
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: InpaintSubmission) => void
}) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeStrokeRef = useRef<StrokePath | null>(null)

  const [tool, setTool] = useState<'brush' | 'erase'>('brush')
  const [brushSize, setBrushSize] = useState(38)
  const [strokes, setStrokes] = useState<StrokePath[]>([])
  const [instruction, setInstruction] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 768, h: 1024 })
  const [prevKey, setPrevKey] = useState(`${open}-${node?.id ?? ''}`)

  const currentKey = `${open}-${node?.id ?? ''}`
  if (currentKey !== prevKey) {
    setPrevKey(currentKey)
    setStrokes([])
    setInstruction('')
    setTool('brush')
    setSubmitting(false)
  }

  // 重新绘制所有蒙版笔触到透明交互画布上
  const redrawMask = (nextStrokes: StrokePath[]) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of nextStrokes) {
      if (s.points.length === 0) continue
      ctx.save()
      ctx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = 'rgba(217, 56, 30, 0.52)'
      ctx.fillStyle = 'rgba(217, 56, 30, 0.52)'
      ctx.lineWidth = s.size

      if (s.points.length === 1) {
        ctx.beginPath()
        ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.moveTo(s.points[0].x, s.points[0].y)
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y)
        }
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  useEffect(() => {
    redrawMask(strokes)
  }, [strokes, imgSize.w, imgSize.h])

  const getCanvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / Math.max(1, rect.width)
    const scaleY = canvas.height / Math.max(1, rect.height)
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = getCanvasPoint(e)
    const scaleFactor = Math.max(0.6, imgSize.w / 640)
    const stroke: StrokePath = {
      mode: tool,
      size: Math.round(brushSize * scaleFactor),
      points: [pt],
    }
    activeStrokeRef.current = stroke
    redrawMask([...strokes, stroke])
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = activeStrokeRef.current
    if (!current) return
    current.points.push(getCanvasPoint(e))
    redrawMask([...strokes, current])
  }

  const handlePointerUp = () => {
    const finished = activeStrokeRef.current
    if (!finished) return
    activeStrokeRef.current = null
    setStrokes((prev) => [...prev, finished])
  }

  const buildCompositeMaskBlob = async (): Promise<Blob | null> => {
    const imgEl = imageRef.current
    const maskEl = overlayCanvasRef.current
    if (!imgEl || !maskEl || strokes.length === 0) return null

    const maxEdge = 1280
    const ratio = Math.min(1, maxEdge / Math.max(imgSize.w, imgSize.h))
    const outW = Math.max(64, Math.round(imgSize.w * ratio))
    const outH = Math.max(64, Math.round(imgSize.h * ratio))

    const offscreen = document.createElement('canvas')
    offscreen.width = outW
    offscreen.height = outH
    const ctx = offscreen.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(imgEl, 0, 0, outW, outH)
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.drawImage(maskEl, 0, 0, outW, outH)
    ctx.restore()

    // 在角标叠加清晰语义提示，帮助多模态模型严格识别朱红涂抹区
    ctx.fillStyle = 'rgba(217, 56, 30, 0.92)'
    ctx.fillRect(14, 14, 184, 28)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('RED MASK = EDIT REGION', 22, 32)

    return new Promise((resolve) => {
      offscreen.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  const handleConfirm = async (autoRun: boolean) => {
    if (!node) return
    const cleaned = instruction.trim()
    if (!cleaned) {
      toast.error('请输入局部重绘的修改指令')
      return
    }
    if (strokes.length === 0) {
      toast.error('请先在图上涂抹需要局部修改的区域')
      return
    }
    if (!isAuthenticated) {
      onRequireAuth()
      return
    }

    setSubmitting(true)
    try {
      let maskAssetUrl: string | undefined
      let maskR2Key: string | undefined

      const blob = await buildCompositeMaskBlob()
      if (blob) {
        const uploaded = await uploadReferenceFileApi({
          file: blob,
          filename: `inpaint-mask-${Date.now()}.png`,
          purpose: 'extra',
          width: imgSize.w,
          height: imgSize.h,
        })
        maskAssetUrl = uploaded.url
        maskR2Key = uploaded.r2Key
      }

      playCameraShutter()
      onSubmit({
        sourceNode: node,
        instruction: cleaned,
        maskAssetUrl,
        maskR2Key,
        autoRun,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '蒙版上传失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
            <Paintbrush2Icon className="size-4 text-[#D9381E]" />
            <span>局部涂抹蒙版重绘</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            用朱砂画笔涂抹需要修改的局部区域，系统将把原图与红色区域标注图一同连线至新出图节点，精准重绘局部并保持其余画面一致。
          </DialogDescription>
        </DialogHeader>

        {node?.resultUrl && (
          <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-[1.25fr_0.9fr]">
            {/* 左侧：底图 + 交互式蒙版画布 */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/45 px-2.5 py-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      playMechanicalSwitch(1.05)
                      setTool('brush')
                    }}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition',
                      tool === 'brush'
                        ? 'bg-[#D9381E] text-white'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Paintbrush2Icon className="size-3.5" />
                    <span>涂抹</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playMechanicalSwitch(0.95)
                      setTool('erase')
                    }}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition',
                      tool === 'erase'
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <EraserIcon className="size-3.5" />
                    <span>橡皮</span>
                  </button>
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">笔刷 {brushSize}px</span>
                  <input
                    type="range"
                    min={12}
                    max={96}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-20 accent-[#D9381E]"
                  />
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={strokes.length === 0}
                    onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                    title="撤销上一笔"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                  >
                    <RotateCcwIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={strokes.length === 0}
                    onClick={() => setStrokes([])}
                    title="清空涂抹"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative flex max-h-[52dvh] items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#121110] p-2">
                <div className="relative inline-block max-h-[48dvh] max-w-full">
                  <img
                    ref={imageRef}
                    src={node.resultUrl}
                    alt={node.title}
                    crossOrigin="anonymous"
                    onLoad={(e) => {
                      const el = e.currentTarget
                      if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                        setImgSize({ w: el.naturalWidth, h: el.naturalHeight })
                      }
                    }}
                    className="block max-h-[48dvh] w-auto rounded-xl object-contain select-none"
                    draggable={false}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    width={imgSize.w}
                    height={imgSize.h}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute inset-0 size-full cursor-crosshair touch-none rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* 右侧：局部修改说明与快捷模板 */}
            <div className="flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="inpaint-instruction" className="text-xs font-bold text-foreground">
                    局部重绘指令
                  </label>
                  <Textarea
                    id="inpaint-instruction"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={5}
                    placeholder="例如：将涂抹区域的外套改为米白色羊绒长风衣，保留人物五官、发型与原始背景光影不变…"
                    className="rounded-xl text-xs leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="font-mono text-xs text-muted-foreground">常用局部微调示例</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '更换涂抹区域的服装材质为深墨黑丝绸暗纹',
                      '为涂抹区域添加精致细金饰品与柔和反光',
                      '将涂抹区域背景替换为黄昏暖金散景灯光',
                      '优化涂抹区域的手部细节与自然光影过渡',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setInstruction(preset)}
                        className="cursor-pointer rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-left text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <div className="font-semibold text-foreground">工作原理</div>
                <p className="mt-1">
                  画布会自动在原图右侧生成「红色区域标注图 + 局部重绘节点」，同时将原图与标注图连线注入，便于在画布里直观对比前后版本。
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleConfirm(false)}
            className="h-9 rounded-full px-4 text-xs font-semibold"
          >
            仅创建重绘分支
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => handleConfirm(true)}
            className="skin-accent-btn h-9 rounded-full border-0 px-5 text-xs font-bold"
          >
            {submitting ? (
              <>
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                <span>上传蒙版中…</span>
              </>
            ) : (
              <>
                <SparklesIcon className="size-3.5" />
                <span>创建并立即重绘</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
