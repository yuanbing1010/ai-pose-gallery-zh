import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  CheckIcon,
  EyeIcon,
  LayersIcon,
  PersonStandingIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
} from 'lucide-react'
import { ANGLES } from '@/api/gallery'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type SectionKey = 'all' | 'line' | 'category' | 'angle' | 'depth'

export interface PoseFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: string
  onSelectLine: (line: string) => void
  category: string
  onSelectCategory: (cat: string) => void
  angle: string
  onSelectAngle: (angle: string) => void
  poseDepthMode: boolean
  onSetDepthMode: (depth: boolean) => void
  totalCount: number
  lineOptions: Array<{ label: string; count: number }>
  categoryOptions: Array<{ label: string; count: number }>
  angleCounts: Record<string, number>
  resultCount: number
  onReset: () => void
}

const RAIL_ITEMS: Array<{ id: SectionKey; label: string; icon: typeof LayersIcon }> = [
  { id: 'all', label: '全部维度', icon: SparklesIcon },
  { id: 'line', label: '姿势体系', icon: PersonStandingIcon },
  { id: 'category', label: '动作分类', icon: TagIcon },
  { id: 'angle', label: '拍摄视角', icon: EyeIcon },
  { id: 'depth', label: '参考底图', icon: LayersIcon },
]

export function PoseFilterModal({
  open,
  onOpenChange,
  line,
  onSelectLine,
  category,
  onSelectCategory,
  angle,
  onSelectAngle,
  poseDepthMode,
  onSetDepthMode,
  totalCount,
  lineOptions,
  categoryOptions,
  angleCounts,
  resultCount,
  onReset,
}: PoseFilterModalProps) {
  const [section, setSection] = useState<SectionKey>('all')
  const [filterSearch, setFilterSearch] = useState('')

  const q = filterSearch.trim().toLowerCase()

  const filteredLines = useMemo(
    () => (q ? lineOptions.filter((l) => l.label.toLowerCase().includes(q)) : lineOptions),
    [lineOptions, q]
  )

  const filteredCategories = useMemo(
    () => (q ? categoryOptions.filter((c) => c.label.toLowerCase().includes(q)) : categoryOptions),
    [categoryOptions, q]
  )

  const filteredAngles = useMemo(
    () => (q ? ANGLES.filter((a) => a.toLowerCase().includes(q)) : [...ANGLES]),
    [q]
  )

  const showLine = (section === 'all' || section === 'line') && (filteredLines.length > 0 || !q)
  const showCategory = (section === 'all' || section === 'category') && filteredCategories.length > 0
  const showAngle = (section === 'all' || section === 'angle') && filteredAngles.length > 0
  const showDepth =
    (section === 'all' || section === 'depth') &&
    (!q || '素体白模深度图depth'.includes(q))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] max-w-[680px] gap-0 overflow-hidden rounded-[22px] border border-border bg-popover p-0 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.22)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.7)] sm:max-w-[680px]"
      >
        <DialogTitle className="sr-only">筛选姿势参考库</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="搜索姿势体系、动作分类或视角…"
            className="h-6 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            esc
          </button>
        </div>

        <div className="grid max-h-[60dvh] min-h-[340px] sm:grid-cols-[176px_1fr]">
          <aside className="flex gap-1 overflow-x-auto border-b border-border p-2.5 sm:flex-col sm:border-r sm:border-b-0">
            {RAIL_ITEMS.map((item) => {
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors',
                    active
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="pose-filter-rail"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-[10px] bg-muted"
                    />
                  )}
                  <item.icon className="relative z-10 size-3.5 shrink-0 opacity-80" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              )
            })}
          </aside>

          <div className="overflow-y-auto p-3.5 space-y-5">
            {showLine && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  姿势体系
                </div>
                <div className="space-y-0.5">
                  {!q && (
                    <button
                      type="button"
                      onClick={() => onSelectLine('')}
                      className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                            line === ''
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-transparent'
                          )}
                        >
                          {line === '' && <CheckIcon className="size-3 stroke-[2.5]" />}
                        </span>
                        <span className={line === '' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                          全部姿势
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {totalCount}
                      </span>
                    </button>
                  )}
                  {filteredLines.map((l) => {
                    const checked = line === l.label
                    return (
                      <button
                        key={l.label}
                        type="button"
                        onClick={() => onSelectLine(checked ? '' : l.label)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <CheckIcon className="size-3 stroke-[2.5]" />}
                          </span>
                          <span className={checked ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {l.label}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {l.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showCategory && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  动作分类
                </div>
                <div className="space-y-0.5">
                  {filteredCategories.map((c) => {
                    const checked = category === c.label
                    return (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => onSelectCategory(checked ? 'all' : c.label)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <CheckIcon className="size-3 stroke-[2.5]" />}
                          </span>
                          <span className={checked ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {c.label}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {c.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showAngle && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  拍摄视角
                </div>
                <div className="space-y-0.5">
                  {filteredAngles.map((a) => {
                    const checked = angle === a
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => onSelectAngle(checked ? '' : a)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <CheckIcon className="size-3 stroke-[2.5]" />}
                          </span>
                          <span className={checked ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {a}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {angleCounts[a] || 0}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showDepth && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  参考底图类型
                </div>
                <div className="space-y-0.5">
                  {[
                    { id: false, label: '3D 素体白模' },
                    { id: true, label: '深度图' },
                  ].map((opt) => {
                    const checked = poseDepthMode === opt.id
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        onClick={() => onSetDepthMode(opt.id)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <CheckIcon className="size-3 stroke-[2.5]" />}
                          </span>
                          <span className={checked ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {opt.label}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {!showLine && !showCategory && !showAngle && !showDepth && (
              <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                没有匹配“{filterSearch}”的筛选项
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-border bg-muted/40 px-4 py-3">
          <button
            type="button"
            onClick={onReset}
            className="h-9 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.97]"
          >
            重置
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97]"
          >
            显示 {resultCount.toLocaleString('zh-CN')} 组
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
