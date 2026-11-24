import { useState } from 'react'
import { LoaderCircleIcon, SendIcon, ShieldCheckIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { publishToGalleryApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { formatAspectRatioLabel, GALLERY_CATEGORIES } from '../../../shared/studio'
import type { GalleryItemDTO, GenerationHistoryItem } from '@/types/gallery'

export interface PublishToGalleryDialogProps {
  job: GenerationHistoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished?: (item: GalleryItemDTO) => void
}

function PublishFormContent({
  job,
  onOpenChange,
  onPublished,
}: {
  job: GenerationHistoryItem
  onOpenChange: (open: boolean) => void
  onPublished?: (item: GalleryItemDTO) => void
}) {
  const isPromptMode = job.snapshot?.generationMode === 'prompt'
  const userPrompt = (job.snapshot?.userPrompt || '').trim()
  const defaultTitle = isPromptMode
    ? userPrompt.replace(/\s+/g, ' ').slice(0, 32)
    : (job.recipeSummary || '灵感作品').slice(0, 32)

  const [title, setTitle] = useState(defaultTitle)
  const [category, setCategory] = useState<string>('写实人像')
  const [tagsInput, setTagsInput] = useState('')
  const [promptPublic, setPromptPublic] = useState(true)
  const [promptZh, setPromptZh] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await publishToGalleryApi({
        jobId: job.id,
        title: title.trim() || undefined,
        category,
        tags: tagsInput,
        promptPublic: isPromptMode ? promptPublic : false,
        promptZh: isPromptMode ? promptZh.trim() : undefined,
      })
      toast.success('已提交至公共画廊审核队列，管理员审核通过后即可公开展示')
      if (res.item) {
        onPublished?.(res.item)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交画廊失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-secondary/50 p-3">
          <img
            src={job.imageUrl}
            alt={job.recipeSummary}
            className="h-24 w-20 shrink-0 rounded-xl border border-border object-cover"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-semibold text-foreground">
                {isPromptMode ? '文生图作品' : '配方合图作品'}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{formatAspectRatioLabel(job.aspectRatio)}</span>
              {job.profileName && (
                <span className="truncate text-xs text-muted-foreground">{job.profileName}</span>
              )}
            </div>
            <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {isPromptMode ? userPrompt || job.recipeSummary : job.recipeSummary}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gallery-pub-title" className="text-xs font-semibold">
            作品标题
          </Label>
          <Input
            id="gallery-pub-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="给作品起一个简洁直观的名字…"
            className="h-9 rounded-xl text-xs"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">画廊分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-full rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-xs">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-pub-tags" className="text-xs font-semibold">
              标签（逗号分隔，最多 8 个）
            </Label>
            <Input
              id="gallery-pub-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：胶片感, 逆光, 少女"
              className="h-9 rounded-xl text-xs"
            />
          </div>
        </div>

        {isPromptMode ? (
          <div className="space-y-3 rounded-2xl border border-border/80 bg-secondary/50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground">公开我的提示词</div>
                <div className="text-xs text-muted-foreground">
                  开启后，其他用户可查看你的提示词并一键「做同款」
                </div>
              </div>
              <Switch checked={promptPublic} onCheckedChange={setPromptPublic} />
            </div>
            {promptPublic && (
              <div className="space-y-1.5">
                <Label htmlFor="gallery-pub-zh" className="text-xs font-semibold">
                  中文说明 / 译文（可选）
                </Label>
                <Textarea
                  id="gallery-pub-zh"
                  value={promptZh}
                  onChange={(e) => setPromptZh(e.target.value)}
                  rows={2}
                  maxLength={800}
                  placeholder="若原提示词为英文，可补充一句中文说明方便大家理解…"
                  className="min-h-[64px] rounded-xl text-xs"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-2xl border border-border/80 bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-[#19857B]" />
            <span>
              配方合图仅公开展示成图与所选的本站公开图库配方（姿势/服装/人像及画风），您自行上传的私人参考图不会对外公开。
            </span>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
          className="h-9 rounded-xl text-xs"
        >
          取消
        </Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="ks-keycap h-9 rounded-xl border-0 skin-accent-btn text-xs font-bold"
        >
          {submitting ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <SendIcon className="size-3.5" />
          )}
          <span>提交审核</span>
        </Button>
      </DialogFooter>
    </>
  )
}

export function PublishToGalleryDialog({
  job,
  open,
  onOpenChange,
  onPublished,
}: PublishToGalleryDialogProps) {
  if (!job) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[94vw] max-w-[540px] overflow-y-auto rounded-[20px] border border-border bg-card p-5 text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <SparklesIcon className="size-4 text-[var(--skin-accent)]" />
            <span>分享作品到公共画廊</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            为保证社区内容安全，投稿将先进入管理员审核队列，审核通过后会在公共画廊公开展示并开放「做同款」。
          </DialogDescription>
        </DialogHeader>
        <PublishFormContent
          key={`${job.id}-${open ? 'open' : 'closed'}`}
          job={job}
          onOpenChange={onOpenChange}
          onPublished={onPublished}
        />
      </DialogContent>
    </Dialog>
  )
}
