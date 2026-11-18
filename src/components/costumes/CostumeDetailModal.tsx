import { useState } from 'react'
import {
  BoxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  ZoomInIcon,
} from 'lucide-react'
import Stack from '@/components/cards/Stack'
import { ShowcaseDialog, ShowcaseStageTabs, type ShowcaseStageTabItem } from '@/components/common/ShowcaseDialog'
import { ZoomViewport } from '@/components/common/ZoomViewport'
import { GlowCard3D } from '@/components/costumes/GlowCard3D'
import { getCostumeAccent } from '@/lib/cardAccents'
import { CHARADB_NOTICE_URL } from '@/lib/charadb'
import { SHISEI_SOURCE_URLS } from '@/lib/costumeSources'
import { referenceImageUrl } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import type { CostumeItem } from '@/types/gallery'

export interface CostumeDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: CostumeItem
  picked: boolean
  onTogglePick: () => void
  onSelectTag: (tag: string) => void
  selectedViewId: string
  onSelectView: (viewId: string) => void
  currentIndex: number
  totalCount: number
  direction?: 1 | -1
  onPrev: () => void
  onNext: () => void
}

const SOURCE_DISPLAY: Record<string, string> = {
  shisei: 'Shisei · 中国历代',
  charadb: 'たき AI · CharaDB',
  'gia-anime': 'ギア · 动漫服装',
  gia: 'ギア（@giaaibusi）· 写实',
}

export function CostumeDetailModal({
  open,
  onOpenChange,
  item,
  picked,
  onTogglePick,
  onSelectTag,
  selectedViewId,
  onSelectView,
  currentIndex,
  totalCount,
  direction = 1,
  onPrev,
  onNext,
}: CostumeDetailModalProps) {
  const [stageMode, setStageMode] = useState<'3d' | 'stack' | 'zoom'>('3d')
  const [viewDir, setViewDir] = useState<{ itemId: string; viewId: string; dir: 1 | -1 }>({
    itemId: '',
    viewId: selectedViewId,
    dir: 1,
  })

  const views = item.views || []
  const hasMultiViews = views.length > 1
  const effectiveStageMode = stageMode === 'stack' && !hasMultiViews ? '3d' : stageMode
  const stageTabItems: ShowcaseStageTabItem<'3d' | 'stack' | 'zoom'>[] = [
    { id: '3d', label: '3D 卡牌', icon: BoxIcon },
    ...(hasMultiViews ? [{ id: 'stack' as const, label: '叠牌视角', icon: LayersIcon }] : []),
    { id: 'zoom', label: '细节缩放', icon: ZoomInIcon },
  ]
  const activeViewIdx = hasMultiViews
    ? Math.max(0, views.findIndex((v) => v.id === (selectedViewId || 'front')))
    : 0
  const isHotlinkSource = ['charadb', 'gia-anime'].includes(item.source || '')
  const accent = getCostumeAccent(item.分类, item.一级分类)
  const sourceLabel = SOURCE_DISPLAY[item.source || 'gia'] || SOURCE_DISPLAY.gia

  const styleKind =
    item.source === 'shisei'
      ? '中国历代'
      : item.source === 'charadb' || item.source === 'gia-anime' || item.一级分类 === '二次元'
        ? '动漫次元'
        : '现实写真'

  const effectiveDir =
    viewDir.itemId === item.id && viewDir.viewId === selectedViewId ? viewDir.dir : direction

  const handleViewSwitch = (nextViewId: string) => {
    const prevIdx = views.findIndex((v) => v.id === (selectedViewId || 'front'))
    const nextIdx = views.findIndex((v) => v.id === nextViewId)
    const dir: 1 | -1 = prevIdx !== -1 && nextIdx !== -1 && nextIdx < prevIdx ? -1 : 1
    setViewDir({ itemId: item.id, viewId: nextViewId, dir })
    onSelectView(nextViewId)
  }

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) setStageMode('3d')
  }

  return (
    <ShowcaseDialog
      open={open}
      onOpenChange={handleOpenChange}
      accent={accent}
      categoryLabel={item.分类}
      secondaryTag={styleKind}
      title={item.服装名称}
      picked={picked}
      pickLabel={picked ? '已在配方中（点击移除）' : '锁入角色配方'}
      onTogglePick={onTogglePick}
      downloadHref={referenceImageUrl(item.原图)}
      downloadName={`${item.id}.webp`}
      downloadExternal={isHotlinkSource}
      downloadLabel={isHotlinkSource ? '前往来源原图' : '下载高清原图'}
      externalHref={
        item.source === 'shisei'
          ? referenceImageUrl(item.原图)
          : item.来源地址 || referenceImageUrl(item.原图)
      }
      externalLabel={isHotlinkSource ? '原作者站点' : '新窗口打开'}
      stageTopLeft={
        <ShowcaseStageTabs
          layoutId="costume-stage-tab"
          value={effectiveStageMode}
          onChange={setStageMode}
          items={stageTabItems}
        />
      }
      stageContent={
        effectiveStageMode === 'zoom' ? (
          <div className="w-full pt-2">
            <ZoomViewport
              imageUrl={referenceImageUrl(item.预览图 || item.原图)}
              alt={item.服装名称}
              className="min-h-0 h-[56dvh] rounded-2xl border border-border bg-card dark:border-white/12 dark:bg-[#161620] p-3"
            />
          </div>
        ) : effectiveStageMode === 'stack' && hasMultiViews ? (
          <div className="h-[360px] w-[270px] pl-3 pt-2 sm:h-[420px] sm:w-[315px]">
            <Stack
              key={item.id}
              layout="fan"
              visible={views.length}
              spread={0.44}
              depth={0.46}
              radius={22}
              frame={4}
              frameColor="#1E1E28"
              tilt={22}
              speed={1.08}
              sendToBackOnClick
              objectFit="contain"
              activeIndex={activeViewIdx}
              onChange={(nextIdx) => {
                const nextView = views[nextIdx]
                if (nextView && nextView.id !== (selectedViewId || 'front')) {
                  handleViewSwitch(nextView.id)
                }
              }}
              cards={views.map((v, vIdx) => (
                <div key={v.id} className="relative h-full w-full overflow-hidden rounded-[18px] bg-[#181822]">
                  <img
                    src={referenceImageUrl(v.预览图 || v.原图)}
                    alt={`${item.服装名称} · ${v.label}`}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                  <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center justify-between">
                    <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
                      {v.label}
                    </span>
                    <span className="rounded-full bg-black/60 px-2 py-0.5 font-mono text-xs text-foreground backdrop-blur-md">
                      {vIdx + 1}/{views.length}
                    </span>
                  </div>
                </div>
              ))}
            />
          </div>
        ) : (
          <div className="relative -mx-6 flex w-[calc(100%+3rem)] items-center justify-center">
            {/* 柔和舞台聚光，托起大尺寸 3D 浮空卡牌的悬浮空间感 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-10 top-1/2 h-72 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.065)_0%,transparent_70%)] blur-xl"
            />
            {totalCount > 1 && (
              <>
                <button
                  type="button"
                  aria-label="上一套服装"
                  onClick={onPrev}
                  className="absolute top-1/2 left-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="下一套服装"
                  onClick={onNext}
                  className="absolute top-1/2 right-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </>
            )}
            <GlowCard3D
              imageUrl={referenceImageUrl(item.预览图 || item.原图)}
              alt={item.服装名称}
              direction={effectiveDir}
            />
          </div>
        )
      }
      stageFooter={
        effectiveStageMode !== 'zoom' ? (
          <>
            {totalCount > 1 && (
              <span className="rounded-full border border-border bg-background/85 px-3 py-1 font-mono text-xs font-medium tabular-nums text-foreground backdrop-blur-md">
                {currentIndex + 1} / {totalCount}
              </span>
            )}
            <p className="text-xs text-muted-foreground">
              {effectiveStageMode === 'stack'
                ? '点击或拖拽牌面丝滑切换多视角'
                : '悬停倾斜 · 按住拖拽旋转 · 左右箭头切牌'}
            </p>
          </>
        ) : null
      }
      sidebarBody={
        <div className="space-y-5">
          {hasMultiViews && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium tracking-wide text-muted-foreground">服装视角</span>
                <span className="font-mono text-muted-foreground">{views.length} 视角</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5" aria-label="服装视角">
                {views.map((entry) => {
                  const active = (selectedViewId || 'front') === entry.id
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleViewSwitch(entry.id)}
                      className={cn(
                        'rounded-xl py-2 text-xs font-medium transition-all',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {entry.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {(item.标签 || []).length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium tracking-wide text-muted-foreground">单品与色彩标签</span>
                <span className="text-xs text-muted-foreground">点击筛选同款</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(item.标签 || []).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onSelectTag(t)
                      onOpenChange(false)
                    }}
                    className="rounded-full bg-muted/65 px-2.5 py-1 text-xs font-medium text-foreground border border-border transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="text-xs font-medium tracking-wide text-muted-foreground">服装档案</div>
            <dl className="grid grid-cols-[64px_1fr] gap-y-2 rounded-2xl bg-muted/45 p-3.5 text-xs border border-border">
              <dt className="text-muted-foreground">编号</dt>
              <dd className="font-mono text-foreground">{item.id}</dd>
              <dt className="text-muted-foreground">风格</dt>
              <dd className="text-foreground">{styleKind}</dd>
              <dt className="text-muted-foreground">分类</dt>
              <dd className="text-foreground">{item.分类}</dd>
              <dt className="text-muted-foreground">来源</dt>
              <dd className="truncate text-foreground">{sourceLabel}</dd>
            </dl>
          </div>

          {item.source === 'shisei' && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Shisei / wquguru · 历代服饰参考，并非专业历史复原。</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Shisei 来源与许可">
                <a className="underline hover:text-foreground" href={SHISEI_SOURCE_URLS.repository} target="_blank" rel="noopener noreferrer">
                  原仓库
                </a>
                <a className="underline hover:text-foreground" href={SHISEI_SOURCE_URLS.catalog} target="_blank" rel="noopener noreferrer">
                  条目目录
                </a>
                <a className="underline hover:text-foreground" href={SHISEI_SOURCE_URLS.license} target="_blank" rel="noopener noreferrer">
                  来源许可
                </a>
              </div>
            </div>
          )}
          {item.source === 'charadb' && (
            <a className="block text-xs text-muted-foreground underline hover:text-foreground" href={CHARADB_NOTICE_URL} target="_blank" rel="noopener noreferrer">
              图片仅作参考，禁止真人、未成年人及再分发；查看原作者条件
            </a>
          )}
        </div>
      }
    />
  )
}
