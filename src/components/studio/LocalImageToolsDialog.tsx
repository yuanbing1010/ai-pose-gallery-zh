import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  DownloadIcon,
  ImagePlusIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
  WrenchIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/notifications'
import { cn } from '@/lib/utils'

type FitMode = 'cover' | 'contain' | 'original'
type OutputFormat = 'image/webp' | 'image/jpeg' | 'image/png'
type TargetSlot = 'pose' | 'costume' | 'portrait' | 'extra'

interface SizePreset {
  id: string
  label: string
  width: number | null
  height: number | null
}

const SIZE_PRESETS: SizePreset[] = [
  { id: 'original', label: '保持原尺寸', width: null, height: null },
  { id: 'portrait_3_4', label: '立绘 3:4', width: 1152, height: 1536 },
  { id: 'square_1_1', label: '头像 1:1', width: 1024, height: 1024 },
  { id: 'xhs_3_4', label: '小红书 3:4', width: 1080, height: 1440 },
  { id: 'wall_9_16', label: '竖屏 9:16', width: 1080, height: 1920 },
  { id: 'cinema_16_9', label: '剧照 16:9', width: 1536, height: 864 },
]

const BG_SWATCHES = [
  { id: 'white', label: '纯白', color: '#FFFFFF' },
  { id: 'paper', label: '暖纸', color: '#F7F6F2' },
  { id: 'obsidian', label: '暗黑', color: '#121210' },
] as const

const FORMAT_OPTIONS: Array<{ id: OutputFormat; label: string; ext: string }> = [
  { id: 'image/webp', label: 'WebP', ext: 'webp' },
  { id: 'image/jpeg', label: 'JPG', ext: 'jpg' },
  { id: 'image/png', label: 'PNG', ext: 'png' },
]

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export interface LocalImageToolsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentMonitorUrl?: string
  onApplyToSlot: (slot: TargetSlot, dataUrl: string, fileName: string) => void
}

export function LocalImageToolsDialog({
  open,
  onOpenChange,
  currentMonitorUrl,
  onApplyToSlot,
}: LocalImageToolsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [sourceName, setSourceName] = useState('reference')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceBytes, setSourceBytes] = useState<number>(0)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  const [presetId, setPresetId] = useState<string>('portrait_3_4')
  const [customWidth, setCustomWidth] = useState<number>(1152)
  const [customHeight, setCustomHeight] = useState<number>(1536)
  const [fitMode, setFitMode] = useState<FitMode>('cover')
  const [bgColor, setBgColor] = useState<string>('#FFFFFF')
  const [format, setFormat] = useState<OutputFormat>('image/webp')
  const [quality, setQuality] = useState<number>(90)
  const [dragging, setDragging] = useState(false)

  const [outputUrl, setOutputUrl] = useState<string>('')
  const [outputBytes, setOutputBytes] = useState<number>(0)
  const [processing, setProcessing] = useState(false)

  const loadImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件（PNG / JPG / WebP / GIF / AVIF）')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      setSourceName(file.name.replace(/\.[^.]+$/, '') || 'reference')
      setSourceBytes(file.size)
      setSourceUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleLoadCurrentMonitor = async () => {
    if (!currentMonitorUrl) return
    try {
      const res = await fetch(currentMonitorUrl)
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) return
        setSourceName('monitor-output')
        setSourceBytes(blob.size)
        setSourceUrl(dataUrl)
      }
      reader.readAsDataURL(blob)
    } catch {
      toast.error('加载当前监视器成图失败')
    }
  }

  const handleSelectPreset = (preset: SizePreset) => {
    setPresetId(preset.id)
    if (preset.id === 'original' && naturalSize) {
      setCustomWidth(naturalSize.w)
      setCustomHeight(naturalSize.h)
      setFitMode('original')
    } else if (preset.width && preset.height) {
      setCustomWidth(preset.width)
      setCustomHeight(preset.height)
      if (fitMode === 'original') setFitMode('cover')
    }
  }

  useEffect(() => {
    if (!sourceUrl) return

    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const nw = img.naturalWidth || 1024
      const nh = img.naturalHeight || 1024
      setNaturalSize({ w: nw, h: nh })

      const targetW =
        presetId === 'original' ? nw : Math.max(64, Math.min(4096, Math.round(customWidth || nw)))
      const targetH =
        presetId === 'original' ? nh : Math.max(64, Math.min(4096, Math.round(customHeight || nh)))

      setProcessing(true)
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setProcessing(false)
        return
      }

      if (format === 'image/jpeg' || fitMode === 'contain') {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, targetW, targetH)
      } else {
        ctx.clearRect(0, 0, targetW, targetH)
      }

      if (fitMode === 'original' || (targetW === nw && targetH === nh)) {
        ctx.drawImage(img, 0, 0, targetW, targetH)
      } else if (fitMode === 'cover') {
        const scale = Math.max(targetW / nw, targetH / nh)
        const dw = nw * scale
        const dh = nh * scale
        ctx.drawImage(img, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh)
      } else {
        const scale = Math.min(targetW / nw, targetH / nh)
        const dw = nw * scale
        const dh = nh * scale
        ctx.drawImage(img, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh)
      }

      const q = format === 'image/png' ? undefined : Math.max(0.4, Math.min(1, quality / 100))
      canvas.toBlob(
        (blob) => {
          if (cancelled) return
          if (!blob) {
            setProcessing(false)
            return
          }
          setOutputBytes(blob.size)
          const r = new FileReader()
          r.onload = () => {
            if (cancelled) return
            setOutputUrl(typeof r.result === 'string' ? r.result : '')
            setProcessing(false)
          }
          r.readAsDataURL(blob)
        },
        format,
        q
      )
    }
    img.src = sourceUrl

    return () => {
      cancelled = true
    }
  }, [sourceUrl, presetId, customWidth, customHeight, fitMode, bgColor, format, quality])

  const selectedFmt = FORMAT_OPTIONS.find((f) => f.id === format) ?? FORMAT_OPTIONS[0]
  const outFileName = `${sourceName}-${presetId === 'original' && naturalSize ? `${naturalSize.w}x${naturalSize.h}` : `${customWidth}x${customHeight}`}.${selectedFmt.ext}`

  const savingsPct = useMemo(() => {
    if (!sourceBytes || !outputBytes) return null
    return Math.round(((sourceBytes - outputBytes) / sourceBytes) * 100)
  }, [sourceBytes, outputBytes])

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void loadImageFile(file)
    e.target.value = ''
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadImageFile(file)
  }

  const applySlot = (slot: TargetSlot) => {
    if (!outputUrl) return
    onApplyToSlot(slot, outputUrl, outFileName)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[96vw] max-w-4xl flex-col gap-3 overflow-y-auto rounded-[24px] p-4 sm:max-w-4xl sm:p-5">
        <DialogHeader className="pr-8 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <WrenchIcon className="size-4 text-[#D9381E]" />
            <DialogTitle className="text-base font-extrabold tracking-tight sm:text-lg">
              本地图片预处理工坊
            </DialogTitle>
            <span className="rounded-full border border-[#116E65]/30 bg-[#116E65]/10 px-2.5 py-0.5 text-xs font-semibold text-[#116E65] dark:text-[#4FD1C5]">
              纯浏览器本地 · 不上传 · 0 积分
            </span>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            一键将参考图或成品裁切为常用比例、压缩转格式，处理后可直接填入角色配方槽位或下载保存。
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />

        <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[1.15fr_1fr]">
          {/* 左侧：拖拽上传与实时预览 */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'relative flex min-h-[280px] flex-col items-center justify-between overflow-hidden rounded-2xl border p-4 transition-colors sm:min-h-[380px]',
              dragging
                ? 'border-[#D9381E] bg-[#D9381E]/5'
                : 'border-border bg-[#FAF8F4] dark:bg-[#121210]'
            )}
          >
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 rounded-full bg-card px-3 text-xs"
              >
                <UploadIcon className="size-3.5" />
                <span>{sourceUrl ? '更换图片' : '选择本地图片'}</span>
              </Button>
              {currentMonitorUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleLoadCurrentMonitor()}
                  className="h-8 rounded-full bg-card px-3 text-xs"
                >
                  <SparklesIcon className="size-3.5 text-[#E5A918]" />
                  <span>载入当前成图</span>
                </Button>
              )}
            </div>

            {outputUrl ? (
              <div className="my-3 flex min-h-0 w-full flex-1 items-center justify-center">
                <img
                  src={outputUrl}
                  alt="处理后预览"
                  className="max-h-[270px] max-w-full rounded-xl border border-border/80 object-contain shadow-sm sm:max-h-[300px]"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="my-4 flex w-full flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 p-6 text-center transition hover:border-foreground/35"
              >
                <UploadIcon className="size-7 text-muted-foreground" />
                <div className="text-sm font-bold text-foreground">点击或拖拽图片到这里</div>
                <p className="text-xs text-muted-foreground">支持 PNG · JPG · WebP · GIF · AVIF</p>
              </button>
            )}

            <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-xs">
              <span className="font-mono text-muted-foreground tabular-nums">
                {naturalSize
                  ? `原图 ${naturalSize.w}×${naturalSize.h} (${formatBytes(sourceBytes)})`
                  : '等待载入图片'}
              </span>
              {outputBytes > 0 && (
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  输出 {formatBytes(outputBytes)}
                  {savingsPct !== null && savingsPct !== 0 && (
                    <span
                      className={cn(
                        'ml-1.5',
                        savingsPct > 0
                          ? 'text-[#116E65] dark:text-[#4FD1C5]'
                          : 'text-muted-foreground'
                      )}
                    >
                      ({savingsPct > 0 ? `-${savingsPct}%` : `+${Math.abs(savingsPct)}%`})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* 右侧：尺寸预设、裁切模式与导出槽位 */}
          <div className="flex flex-col justify-between gap-3.5">
            <div className="space-y-3.5">
              {/* 尺寸预设 */}
              <div className="space-y-1.5">
                <span className="text-xs font-extrabold text-foreground">目标尺寸预设</span>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {SIZE_PRESETS.map((preset) => {
                    const active = presetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={cn(
                          'rounded-xl border px-2.5 py-1.5 text-left text-xs transition',
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-card text-foreground hover:border-foreground/35'
                        )}
                      >
                        <div className="font-semibold">{preset.label}</div>
                        <div
                          className={cn(
                            'font-mono text-xs',
                            active ? 'text-background/75' : 'text-muted-foreground'
                          )}
                        >
                          {preset.width && preset.height
                            ? `${preset.width}×${preset.height}`
                            : '自适应'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 自定义宽高 */}
              {presetId !== 'original' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">宽度 (px)</span>
                    <Input
                      type="number"
                      min={64}
                      max={4096}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value) || 1024)}
                      className="h-8 rounded-xl font-mono text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">高度 (px)</span>
                    <Input
                      type="number"
                      min={64}
                      max={4096}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value) || 1024)}
                      className="h-8 rounded-xl font-mono text-xs"
                    />
                  </label>
                </div>
              )}

              {/* 适配模式 */}
              {presetId !== 'original' && (
                <div className="space-y-1.5">
                  <span className="text-xs font-extrabold text-foreground">适配与留白</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'cover', label: '铺满裁切' },
                        { id: 'contain', label: '等比留白' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFitMode(m.id)}
                        className={cn(
                          'h-8 rounded-xl border px-3 text-xs font-semibold transition',
                          fitMode === m.id
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-card text-foreground hover:border-foreground/35'
                        )}
                      >
                        {m.label}
                      </button>
                    ))}

                    {fitMode === 'contain' && (
                      <div className="ml-auto flex items-center gap-1">
                        {BG_SWATCHES.map((sw) => (
                          <button
                            key={sw.id}
                            type="button"
                            title={`留白底色：${sw.label}`}
                            onClick={() => setBgColor(sw.color)}
                            className={cn(
                              'size-6 rounded-full border transition',
                              bgColor === sw.color
                                ? 'border-[#D9381E] ring-2 ring-[#D9381E]/40'
                                : 'border-border'
                            )}
                            style={{ backgroundColor: sw.color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 导出格式与压缩质量 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-foreground">输出格式与质量</span>
                  {format !== 'image/png' && (
                    <span className="font-mono font-semibold text-muted-foreground">
                      质量 {quality}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormat(opt.id)}
                      className={cn(
                        'h-8 flex-1 rounded-xl border text-xs font-semibold transition',
                        format === opt.id
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-card text-foreground hover:border-foreground/35'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {format !== 'image/png' && (
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={quality}
                    aria-label="输出图片质量"
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-[#D9381E]"
                  />
                )}
              </div>
            </div>

            {/* 底部导出与直填合成台槽位 */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!outputUrl || processing}
                  onClick={() => applySlot('pose')}
                  className="h-8 rounded-xl text-xs"
                >
                  <PersonStandingIcon className="size-3.5 text-[#D9381E]" />
                  <span>设为姿势图</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!outputUrl || processing}
                  onClick={() => applySlot('costume')}
                  className="h-8 rounded-xl text-xs"
                >
                  <ShirtIcon className="size-3.5 text-[#116E65]" />
                  <span>设为服装图</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!outputUrl || processing}
                  onClick={() => applySlot('portrait')}
                  className="h-8 rounded-xl text-xs"
                >
                  <UserRoundIcon className="size-3.5 text-[#B88300]" />
                  <span>设为人像图</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!outputUrl || processing}
                  onClick={() => applySlot('extra')}
                  className="h-8 rounded-xl text-xs"
                >
                  <ImagePlusIcon className="size-3.5" />
                  <span>加为附图</span>
                </Button>
              </div>

              {outputUrl ? (
                <Button
                  asChild
                  className="ks-keycap h-9 w-full rounded-xl border-0 bg-[#D9381E] text-xs font-bold text-white hover:bg-[#C23018]"
                >
                  <a href={outputUrl} download={outFileName}>
                    <DownloadIcon className="size-3.5" />
                    <span>下载处理后图片 ({outFileName})</span>
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled
                  className="h-9 w-full rounded-xl text-xs font-bold"
                >
                  <DownloadIcon className="size-3.5" />
                  <span>请先载入图片</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
