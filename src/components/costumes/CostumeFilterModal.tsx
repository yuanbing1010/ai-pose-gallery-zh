import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  CheckIcon,
  GlobeIcon,
  LayersIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { COSTUME_STYLE_TABS, type CostumeStyleTab } from '@/lib/costumeFrame'
import { cn } from '@/lib/utils'

export type CostumeSourceFilter = 'all' | 'gia' | 'gia-anime' | 'charadb' | 'shisei'

type SectionKey = 'all' | 'style' | 'category' | 'tag' | 'source'

export interface CostumeFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  styleTab: CostumeStyleTab
  onSelectStyle: (tab: CostumeStyleTab) => void
  sourceFilter: CostumeSourceFilter
  onSelectSource: (src: CostumeSourceFilter) => void
  category: string
  onSelectCategory: (cat: string) => void
  tag: string
  onSelectTag: (tag: string) => void
  styleCounts: Record<CostumeStyleTab, number>
  sourceOptions: Array<{ id: CostumeSourceFilter; label: string; count: number }>
  categoryOptions: Array<{ label: string; count: number }>
  tagOptions: Array<{ label: string; count: number }>
  resultCount: number
  onReset: () => void
}

const RAIL_ITEMS: Array<{ id: SectionKey; label: string; icon: typeof LayersIcon }> = [
  { id: 'all', label: '全部维度', icon: SparklesIcon },
  { id: 'style', label: '风格板块', icon: LayersIcon },
  { id: 'category', label: '穿搭分类', icon: TagIcon },
  { id: 'tag', label: '单品标签', icon: TagIcon },
  { id: 'source', label: '素材来源', icon: GlobeIcon },
]

export function CostumeFilterModal({
  open,
  onOpenChange,
  styleTab,
  onSelectStyle,
  sourceFilter,
  onSelectSource,
  category,
  onSelectCategory,
  tag,
  onSelectTag,
  styleCounts,
  sourceOptions,
  categoryOptions,
  tagOptions,
  resultCount,
  onReset,
}: CostumeFilterModalProps) {
  const [section, setSection] = useState<SectionKey>('all')
  const [filterSearch, setFilterSearch] = useState('')

  const q = filterSearch.trim().toLowerCase()

  const filteredCategories = useMemo(
    () => (q ? categoryOptions.filter((c) => c.label.toLowerCase().includes(q)) : categoryOptions),
    [categoryOptions, q]
  )

  const filteredTags = useMemo(() => {
    const list = q ? tagOptions.filter((t) => t.label.toLowerCase().includes(q)) : tagOptions
    return list.slice(0, q ? 80 : 48)
  }, [tagOptions, q])

  const filteredSources = useMemo(
    () => (q ? sourceOptions.filter((s) => s.label.toLowerCase().includes(q)) : sourceOptions),
    [sourceOptions, q]
  )

  const showStyle = (section === 'all' || section === 'style') && (!q || COSTUME_STYLE_TABS.some((t) => t.label.toLowerCase().includes(q)))
  const showCategory = (section === 'all' || section === 'category') && filteredCategories.length > 0
  const showSource = (section === 'all' || section === 'source') && filteredSources.length > 0
  const showTag = (section === 'all' || section === 'tag') && filteredTags.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] max-w-[680px] gap-0 overflow-hidden rounded-[22px] border border-border bg-popover p-0 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.22)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.7)] sm:max-w-[680px]"
      >
        <DialogTitle className="sr-only">筛选服装参考库</DialogTitle>

        {/* 顶部搜索输入栏 */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="搜索风格、穿搭分类、来源或单品标签…"
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

        {/* 双栏主体：左侧维度导航 + 右侧统计勾选列表 */}
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
                      layoutId="costume-filter-rail"
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
            {showStyle && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  风格板块
                </div>
                <div className="space-y-0.5">
                  {COSTUME_STYLE_TABS.filter((t) => !q || t.label.toLowerCase().includes(q)).map((t) => {
                    const checked = styleTab === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onSelectStyle(t.id)}
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
                            {t.label}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {styleCounts[t.id]}
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
                  穿搭分类
                </div>
                <div className="space-y-0.5">
                  {filteredCategories.map((c) => {
                    const checked = category === c.label
                    return (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => onSelectCategory(checked ? '' : c.label)}
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

            {showSource && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  素材来源
                </div>
                <div className="space-y-0.5">
                  {filteredSources.map((s) => {
                    const checked = sourceFilter === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelectSource(checked && s.id !== 'all' ? 'all' : s.id)}
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

            {showTag && (
              <section className="space-y-1.5">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    单品与色彩标签
                  </span>
                  {!q && tagOptions.length > 48 && (
                    <span className="text-[11px] text-muted-foreground">展示高频前 48 项，输入可搜全部</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {filteredTags.map((t) => {
                    const checked = tag === t.label
                    return (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => onSelectTag(checked ? 'all' : t.label)}
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
                            #{t.label}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {t.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {!showStyle && !showCategory && !showSource && !showTag && (
              <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                没有匹配“{filterSearch}”的筛选项
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
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
            显示 {resultCount.toLocaleString('zh-CN')} 套
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
