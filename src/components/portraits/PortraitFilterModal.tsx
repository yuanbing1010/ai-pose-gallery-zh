import { useMemo, useState } from 'react'
import {
  CheckIcon,
  FlameIcon,
  LayersIcon,
  ScissorsIcon,
  SearchIcon,
  SparklesIcon,
  UserRoundIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type SectionKey = 'all' | 'section' | 'hair' | 'style' | 'hot'

export interface PortraitFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: '' | '正脸参考' | '造型氛围'
  onSelectSection: (s: '' | '正脸参考' | '造型氛围') => void
  hair: string
  onSelectHair: (h: string) => void
  styleName: string
  onSelectStyleName: (s: string) => void
  onlyHot: boolean
  onSetOnlyHot: (v: boolean) => void
  totalCount: number
  sectionCounts: Record<'正脸参考' | '造型氛围', number>
  hairOptions: Array<{ label: string; count: number }>
  styleOptions: Array<{ label: string; count: number }>
  hotCount: number
  resultCount: number
  onReset: () => void
}

const RAIL_ITEMS: Array<{ id: SectionKey; label: string; icon: typeof LayersIcon }> = [
  { id: 'all', label: '全部维度', icon: SparklesIcon },
  { id: 'section', label: '画面分区', icon: UserRoundIcon },
  { id: 'hair', label: '头发长度', icon: ScissorsIcon },
  { id: 'style', label: '细分发型', icon: LayersIcon },
  { id: 'hot', label: '人气榜单', icon: FlameIcon },
]

export function PortraitFilterModal({
  open,
  onOpenChange,
  section,
  onSelectSection,
  hair,
  onSelectHair,
  styleName,
  onSelectStyleName,
  onlyHot,
  onSetOnlyHot,
  totalCount,
  sectionCounts,
  hairOptions,
  styleOptions,
  hotCount,
  resultCount,
  onReset,
}: PortraitFilterModalProps) {
  const [activeTab, setActiveTab] = useState<SectionKey>('all')
  const [filterSearch, setFilterSearch] = useState('')

  const q = filterSearch.trim().toLowerCase()

  const filteredHairs = useMemo(
    () => (q ? hairOptions.filter((h) => h.label.toLowerCase().includes(q)) : hairOptions),
    [hairOptions, q]
  )

  const filteredStyles = useMemo(
    () => (q ? styleOptions.filter((s) => s.label.toLowerCase().includes(q)) : styleOptions),
    [styleOptions, q]
  )

  const showSection =
    (activeTab === 'all' || activeTab === 'section') &&
    (!q || '全部正脸参考造型氛围'.includes(q))
  const showHair = (activeTab === 'all' || activeTab === 'hair') && filteredHairs.length > 0
  const showStyle = (activeTab === 'all' || activeTab === 'style') && filteredStyles.length > 0
  const showHot =
    (activeTab === 'all' || activeTab === 'hot') &&
    (!q || 'top 10人气缪斯热门'.includes(q))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] max-w-[680px] gap-0 overflow-hidden rounded-[22px] border border-border bg-popover p-0 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.22)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.7)] sm:max-w-[680px]"
      >
        <DialogTitle className="sr-only">筛选人像参考库</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="搜索分区、发长或 51 款日系发型名称…"
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
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <item.icon className="size-3.5 shrink-0 opacity-80" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </aside>

          <div className="overflow-y-auto p-3.5 space-y-5">
            {showSection && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  画面分区
                </div>
                <div className="space-y-0.5">
                  {!q && (
                    <button
                      type="button"
                      onClick={() => onSelectSection('')}
                      className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                            section === ''
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-transparent'
                          )}
                        >
                          {section === '' && <CheckIcon className="size-3 stroke-[2.5]" />}
                        </span>
                        <span className={section === '' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                          全部人像
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {totalCount}
                      </span>
                    </button>
                  )}
                  {(['正脸参考', '造型氛围'] as const).map((sec) => {
                    const checked = section === sec
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onSelectSection(checked ? '' : sec)}
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
                            {sec}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {sectionCounts[sec]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showHair && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  头发长度
                </div>
                <div className="space-y-0.5">
                  {filteredHairs.map((h) => {
                    const checked = hair === h.label
                    return (
                      <button
                        key={h.label}
                        type="button"
                        onClick={() => onSelectHair(checked ? '' : h.label)}
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
                            {h.label}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {h.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showHot && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  人气榜单
                </div>
                <button
                  type="button"
                  onClick={() => onSetOnlyHot(!onlyHot)}
                  className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/70"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded-[5px] border transition-colors',
                        onlyHot
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-transparent'
                      )}
                    >
                      {onlyHot && <CheckIcon className="size-3 stroke-[2.5]" />}
                    </span>
                    <span className={onlyHot ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                      仅看 Top 10 人气缪斯
                    </span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {hotCount}
                  </span>
                </button>
              </section>
            )}

            {showStyle && (
              <section className="space-y-1.5">
                <div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  细分发型（{filteredStyles.length} 款）
                </div>
                <div className="space-y-0.5">
                  {filteredStyles.map((s) => {
                    const checked = styleName === s.label
                    return (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => onSelectStyleName(checked ? 'all' : s.label)}
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

            {!showSection && !showHair && !showHot && !showStyle && (
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
            显示 {resultCount.toLocaleString('zh-CN')} 张
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
