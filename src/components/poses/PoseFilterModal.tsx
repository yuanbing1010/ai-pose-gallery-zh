import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  EyeIcon,
  GlobeIcon,
  LayersIcon,
  PersonStandingIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
} from 'lucide-react'
import { ANGLES } from '@/api/gallery'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type PoseSourceFilter = 'all' | 'gia' | 'mio'

type SectionKey = 'all' | 'line' | 'source' | 'category' | 'angle' | 'depth'

export interface PoseFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: string
  onSelectLine: (line: string) => void
  sourceFilter: PoseSourceFilter
  onSelectSource: (src: PoseSourceFilter) => void
  sourceOptions: Array<{ id: PoseSourceFilter; label: string; count: number }>
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
  { id: 'source', label: '素材来源', icon: GlobeIcon },
  { id: 'category', label: '动作分类', icon: TagIcon },
  { id: 'angle', label: '拍摄视角', icon: EyeIcon },
  { id: 'depth', label: '参考底图', icon: LayersIcon },
]

export function PoseFilterModal({
  open,
  onOpenChange,
  line,
  onSelectLine,
  sourceFilter,
  onSelectSource,
  sourceOptions,
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

  const filteredSources = useMemo(
    () => (q ? sourceOptions.filter((s) => s.label.toLowerCase().includes(q)) : sourceOptions),
    [sourceOptions, q]
  )

  const filteredCategories = useMemo(
    () => (q ? categoryOptions.filter((c) => c.label.toLowerCase().includes(q)) : categoryOptions),
    [categoryOptions, q]
  )

  const filteredAngles = useMemo(
    () =>
      ANGLES.filter((a) => ((angleCounts[a] || 0) > 0 || angle === a) && (!q || a.toLowerCase().includes(q))),
    [angleCounts, angle, q]
  )

  const showLine = (section === 'all' || section === 'line') && (filteredLines.length > 0 || !q)
  const showSource = (section === 'all' || section === 'source') && filteredSources.length > 0
  const showCategory = (section === 'all' || section === 'category') && filteredCategories.length > 0
  const showAngle = (section === 'all' || section === 'angle') && filteredAngles.length > 0
  const showDepth =
    (section === 'all' || section === 'depth') &&
    (!q || '素体白模深度图depth'.includes(q))

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setFilterSearch(''); onOpenChange(next) }}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] max-w-[680px] gap-0 overflow-hidden rounded-[22px] border border-border bg-popover p-0 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.22)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.7)] sm:max-w-[680px]"
      >
        <DialogTitle className="sr-only">筛选姿势参考库</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="搜索姿势体系、素材来源、动作分类或视角…"
            className="h-6 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground transition-[transform,color] duration-150 ease-[var(--ease-out)] hover:text-foreground active:scale-[0.96]"
          >
            esc
          </button>
        </div>

        <div className="grid max-h-[68dvh] min-h-[320px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] sm:max-h-[60dvh] sm:grid-cols-[176px_minmax(0,1fr)] sm:grid-rows-1">
          <aside className="no-scrollbar flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-border p-2.5 sm:flex-col sm:border-r sm:border-b-0">
            {RAIL_ITEMS.map((item) => {
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors',
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

          <div className="overscroll-contain overflow-y-auto p-3.5 space-y-5">
            {showLine && (
              <section className="space-y-1.5">
                <div className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  姿势体系
                </div>
                <div className="space-y-0.5" role="radiogroup" aria-label="姿势体系">
                  {!q && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={line === ''}
                      onClick={() => onSelectLine('')}
                      className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-4 items-center justify-center rounded-full border transition-colors',
                            line === ''
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-transparent'
                          )}
                        >
                          {line === '' && <span className="size-1.5 rounded-full bg-current" />}
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
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onSelectLine(checked ? '' : l.label)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <span className="size-1.5 rounded-full bg-current" />}
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

            {showSource && (
              <section className="space-y-1.5">
                <div className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  素材来源
                </div>
                <div className="space-y-0.5" role="radiogroup" aria-label="素材来源">
                  {filteredSources.map((s) => {
                    const checked = sourceFilter === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onSelectSource(checked && s.id !== 'all' ? 'all' : s.id)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <span className="size-1.5 rounded-full bg-current" />}
                          </span>
                          <span className={checked ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {s.label}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {s.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showCategory && (
              <section className="space-y-1.5">
                <div className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  动作分类
                </div>
                <div className="space-y-0.5" role="radiogroup" aria-label="动作分类">
                  {!q && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={category === 'all'}
                      onClick={() => onSelectCategory('all')}
                      className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-4 items-center justify-center rounded-full border transition-colors',
                            category === 'all'
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-transparent'
                          )}
                        >
                          {category === 'all' && <span className="size-1.5 rounded-full bg-current" />}
                        </span>
                        <span className={category === 'all' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                          全部分类
                        </span>
                      </span>
                    </button>
                  )}
                  {filteredCategories.map((c) => {
                    const checked = category === c.label
                    return (
                      <button
                        key={c.label}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onSelectCategory(checked ? 'all' : c.label)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <span className="size-1.5 rounded-full bg-current" />}
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
                <div className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  拍摄视角
                </div>
                <div className="space-y-0.5" role="radiogroup" aria-label="拍摄视角">
                  {!q && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={angle === ''}
                      onClick={() => onSelectAngle('')}
                      className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-4 items-center justify-center rounded-full border transition-colors',
                            angle === ''
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-transparent'
                          )}
                        >
                          {angle === '' && <span className="size-1.5 rounded-full bg-current" />}
                        </span>
                        <span className={angle === '' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                          全部视角
                        </span>
                      </span>
                    </button>
                  )}
                  {filteredAngles.map((a) => {
                    const checked = angle === a
                    return (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onSelectAngle(checked ? '' : a)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <span className="size-1.5 rounded-full bg-current" />}
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
                <div className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  参考底图类型
                </div>
                <div className="space-y-0.5" role="radiogroup" aria-label="参考底图类型">
                  {[
                    { id: false, label: '3D 素体白模' },
                    { id: true, label: '深度图' },
                  ].map((opt) => {
                    const checked = poseDepthMode === opt.id
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onSetDepthMode(opt.id)}
                        className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 items-center justify-center rounded-full border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-transparent'
                            )}
                          >
                            {checked && <span className="size-1.5 rounded-full bg-current" />}
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

            {!showLine && !showSource && !showCategory && !showAngle && !showDepth && (
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
            className="h-9 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-muted active:scale-[0.97]"
          >
            重置
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97]"
          >
            显示 {resultCount.toLocaleString('zh-CN')} 组
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
