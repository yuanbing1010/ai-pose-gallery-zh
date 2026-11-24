import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  HistoryIcon,
  ImagesIcon,
  PersonStandingIcon,
  PlusIcon,
  SearchIcon,
  ShirtIcon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { fetchPublicGalleryItemsApi } from '@/lib/apiClient'
import { isContainCostumeSource } from '@/lib/costumeSources'
import { hasPoseDepthMap, poseImagePath, poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import type {
  CostumeItem,
  GalleryItemDTO,
  GenerationHistoryItem,
  PortraitItem,
  PoseItem,
} from '@/types/gallery'
import type { CanvasAssetNode } from './types'

type DrawerTab = 'pose' | 'costume' | 'portrait' | 'gallery' | 'history'

export interface CanvasAssetInsertPayload {
  asset?: Omit<CanvasAssetNode, 'id' | 'kind' | 'x' | 'y'>
  promptText?: string
  promptTitle?: string
}

const DRAWER_TABS: Array<{ id: DrawerTab; label: string; icon: typeof PersonStandingIcon }> = [
  { id: 'pose', label: '姿势', icon: PersonStandingIcon },
  { id: 'costume', label: '服装', icon: ShirtIcon },
  { id: 'portrait', label: '人像', icon: UserRoundIcon },
  { id: 'gallery', label: '画廊', icon: ImagesIcon },
  { id: 'history', label: '作品', icon: HistoryIcon },
]

export function CanvasAssetDrawer({
  open,
  onClose,
  history,
  onInsert,
  onUploadLocalFiles,
}: {
  open: boolean
  onClose: () => void
  history: GenerationHistoryItem[]
  onInsert: (payload: CanvasAssetInsertPayload) => void
  onUploadLocalFiles: (files: FileList | File[]) => void
}) {
  const [tab, setTab] = useState<DrawerTab>('pose')
  const [search, setSearch] = useState('')
  const [poseDepthDefault, setPoseDepthDefault] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const posesRes = useQuery({ ...posesQuery, enabled: open && tab === 'pose' })
  const costumesRes = useQuery({ ...costumesQuery, enabled: open && tab === 'costume' })
  const portraitsRes = useQuery({ ...portraitsQuery, enabled: open && tab === 'portrait' })
  const galleryRes = useQuery({
    queryKey: ['canvas-drawer-gallery', search.trim()],
    queryFn: () =>
      fetchPublicGalleryItemsApi({
        source: 'all',
        category: '全部',
        sort: 'featured',
        aspectRatio: 'all',
        q: search.trim(),
        limit: 40,
        offset: 0,
      }),
    enabled: open && tab === 'gallery',
    staleTime: 30_000,
  })

  const q = search.trim().toLowerCase()

  const filteredPoses = useMemo<PoseItem[]>(() => {
    const list = posesRes.data?.items ?? []
    const scoped = poseDepthDefault
      ? list.filter((p) => !p.source && hasPoseDepthMap(p))
      : list
    if (!q) return scoped.slice(0, 48)
    return scoped
      .filter((p) =>
        `${p.姿势名称} ${p.分类} ${p.角度} ${p.体系} ${p.检索 || ''}`.toLowerCase().includes(q)
      )
      .slice(0, 48)
  }, [posesRes.data?.items, poseDepthDefault, q])

  const filteredCostumes = useMemo<CostumeItem[]>(() => {
    const list = costumesRes.data ?? []
    if (!q) return list.slice(0, 48)
    return list
      .filter((c) => `${c.服装名称} ${c.分类} ${c.关键词 || ''} ${c.检索 || ''}`.toLowerCase().includes(q))
      .slice(0, 48)
  }, [costumesRes.data, q])

  const filteredPortraits = useMemo<PortraitItem[]>(() => {
    const list = portraitsRes.data ?? []
    if (!q) return list.slice(0, 48)
    return list
      .filter((p) =>
        `${p.标题} ${p.发型名称} ${p.分区} ${p.检索 || ''}`.toLowerCase().includes(q)
      )
      .slice(0, 48)
  }, [portraitsRes.data, q])

  const succeededHistory = useMemo(() => {
    const list = history.filter((h) => h.status === 'succeeded' && h.imageUrl)
    if (!q) return list.slice(0, 40)
    return list
      .filter((h) => `${h.recipeSummary} ${h.snapshot?.sceneNote || ''}`.toLowerCase().includes(q))
      .slice(0, 40)
  }, [history, q])

  const galleryItems: GalleryItemDTO[] = galleryRes.data?.items ?? []

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          data-canvas-interactive="true"
          data-canvas-scrollable="true"
          onPointerDown={(e) => e.stopPropagation()}
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="ks-obsidian-stage dark absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex w-[328px] max-w-[calc(100vw-24px)] flex-col overflow-hidden overscroll-contain rounded-[22px] border border-[#E5A918]/30 text-[#F5F1E8] shadow-[0_24px_70px_rgba(0,0,0,0.68)]"
        >
          <span
            aria-hidden="true"
            className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1px]"
          />

          {/* 抽屉头 */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3.5">
            <div className="space-y-1">
              <div className="ed-eyebrow text-[#E5A918]">ASSET VAULT · 资产库</div>
              <div className="text-xs font-bold text-white">点击任意素材直接落入画布</div>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadLocalFiles(e.target.files)
                    e.target.value = ''
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="上传本地参考图"
                className="inline-flex h-7.5 cursor-pointer items-center gap-1 rounded-full border border-[#E5A918]/45 bg-[#E5A918]/15 px-2.5 text-xs font-semibold text-[#F5C443] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-[#E5A918]/25 active:scale-[0.96]"
              >
                <UploadIcon className="size-3.5" />
                <span>上传</span>
              </button>
              <button
                type="button"
                aria-label="关闭资产库"
                onClick={onClose}
                className="relative flex size-7.5 cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-[#C8C0B2] transition-[transform,color] duration-150 ease-[var(--ease-out)] before:absolute before:-inset-1.5 before:content-[''] hover:text-white active:scale-[0.96]"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          </div>

          {/* 5 路资产源切换 */}
          <div className="grid grid-cols-5 gap-1 border-b border-white/10 bg-black/35 p-1.5">
            {DRAWER_TABS.map((item) => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    playMechanicalSwitch(1.02)
                    setTab(item.id)
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-semibold transition',
                    active
                      ? 'bg-[#E5A918] text-[#151412]'
                      : 'text-[#BDB5A6] hover:bg-white/[0.06] hover:text-white'
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* 搜索框 + 姿势深度过滤 */}
          <div className="space-y-2 border-b border-white/10 px-3 py-2.5">
            <div className="relative flex items-center">
              <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-[#9C9486]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`检索${DRAWER_TABS.find((t) => t.id === tab)?.label}关键词…`}
                className="h-8.5 w-full rounded-full border border-white/14 bg-black/45 pr-3 pl-8.5 text-xs text-white placeholder:text-[#8E877A] focus:border-[#E5A918]/65 focus:outline-none"
              />
            </div>

            {tab === 'pose' && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A9A192]">插入模式</span>
                <button
                  type="button"
                  onClick={() => {
                    playMechanicalSwitch(poseDepthDefault ? 0.94 : 1.08)
                    setPoseDepthDefault((v) => !v)
                  }}
                  className={cn(
                    'inline-flex h-6.5 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs font-semibold transition',
                    poseDepthDefault
                      ? 'border-[#E5A918]/60 bg-[#E5A918]/18 text-[#F5C443]'
                      : 'border-white/14 bg-white/[0.05] text-[#C8C0B2]'
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      poseDepthDefault ? 'bg-[#E5A918]' : 'bg-[#8E877A]'
                    )}
                  />
                  <span>{poseDepthDefault ? '仅深度骨骼图' : '标准白模/参考'}</span>
                </button>
              </div>
            )}
          </div>

          {/* 素材网格列表 */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {tab === 'pose' && (
              <div className="grid grid-cols-2 gap-2">
                {filteredPoses.map((pose) => {
                  const useDepth = poseDepthDefault && hasPoseDepthMap(pose)
                  const thumb = poseThumbPath(pose, useDepth)
                  const full = referenceImageUrl(poseImagePath(pose, useDepth))
                  return (
                    <button
                      key={pose.id}
                      type="button"
                      onClick={() =>
                        onInsert({
                          asset: {
                            title: `动作姿势 · ${pose.角度 || pose.分类}`,
                            sourceKind: 'pose',
                            thumbUrl: thumb,
                            fullUrl: full,
                            caption: pose.姿势名称,
                            poseItem: pose,
                            useDepth,
                          },
                        })
                      }
                      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1A1815] text-left transition hover:border-[#E5A918]/65"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#100F0D]">
                        <img
                          src={thumb}
                          alt={pose.姿势名称}
                          loading="lazy"
                          className="size-full object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-[#D9381E] text-white opacity-0 shadow transition group-hover:opacity-100">
                          <PlusIcon className="size-3.5" />
                        </span>
                      </div>
                      <div className="truncate px-2 py-1.5 text-xs font-medium text-[#EAE4D7]">
                        {pose.姿势名称}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {tab === 'costume' && (
              <div className="grid grid-cols-2 gap-2">
                {filteredCostumes.map((costume) => {
                  const thumb = referenceImageUrl(costume.缩略图)
                  const full = referenceImageUrl(costume.原图 || costume.预览图 || costume.缩略图)
                  const contain = isContainCostumeSource(costume.source)
                  return (
                    <button
                      key={costume.id}
                      type="button"
                      onClick={() =>
                        onInsert({
                          asset: {
                            title: `服装参考 · ${costume.分类 || '穿搭'}`,
                            sourceKind: 'costume',
                            thumbUrl: thumb,
                            fullUrl: full,
                            contain,
                            caption: costume.服装名称,
                            costumeItem: costume,
                          },
                        })
                      }
                      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1A1815] text-left transition hover:border-[#2DD4BF]/65"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#100F0D]">
                        <img
                          src={thumb}
                          alt={costume.服装名称}
                          loading="lazy"
                          className={cn(
                            'size-full transition-transform duration-300 group-hover:scale-105',
                            contain ? 'bg-white object-contain p-1' : 'object-cover object-top'
                          )}
                        />
                        <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-[#19857B] text-white opacity-0 shadow transition group-hover:opacity-100">
                          <PlusIcon className="size-3.5" />
                        </span>
                      </div>
                      <div className="truncate px-2 py-1.5 text-xs font-medium text-[#EAE4D7]">
                        {costume.服装名称}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {tab === 'portrait' && (
              <div className="grid grid-cols-2 gap-2">
                {filteredPortraits.map((portrait) => {
                  const thumb = referenceImageUrl(portrait.缩略图)
                  const full = referenceImageUrl(portrait.原图 || portrait.缩略图)
                  const name = portrait.标题 || portrait.发型名称 || '人像参考'
                  return (
                    <button
                      key={portrait.id}
                      type="button"
                      onClick={() =>
                        onInsert({
                          asset: {
                            title: `人像参考 · ${portrait.分区 || '颜值'}`,
                            sourceKind: 'portrait',
                            thumbUrl: thumb,
                            fullUrl: full,
                            caption: name,
                            portraitItem: portrait,
                          },
                        })
                      }
                      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1A1815] text-left transition hover:border-[#E5A918]/65"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#100F0D]">
                        <img
                          src={thumb}
                          alt={name}
                          loading="lazy"
                          className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-[#E5A918] text-[#151412] opacity-0 shadow transition group-hover:opacity-100">
                          <PlusIcon className="size-3.5" />
                        </span>
                      </div>
                      <div className="truncate px-2 py-1.5 text-xs font-medium text-[#EAE4D7]">
                        {name}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {tab === 'gallery' && (
              galleryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-xs text-[#9C9486]">
                  <ImagesIcon className="size-6 opacity-60" />
                  <span>暂无画廊灵感记录</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {galleryItems.map((item) => {
                    const promptText = item.promptText || item.promptZh || ''
                    return (
                      <div
                        key={item.id}
                        className="flex gap-2.5 rounded-xl border border-white/10 bg-[#1A1815] p-2"
                      >
                        <img
                          src={item.thumbUrl || item.imageUrl}
                          alt={item.title}
                          loading="lazy"
                          className="h-20 w-16 shrink-0 rounded-lg object-cover"
                        />
                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <div className="line-clamp-2 text-xs font-semibold text-white">
                            {item.title || '画廊作品'}
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                onInsert({
                                  asset: {
                                    title: `画廊参考 · ${item.category || '灵感'}`,
                                    sourceKind: 'gallery',
                                    thumbUrl: item.thumbUrl || item.imageUrl,
                                    fullUrl: item.imageUrl,
                                    caption: item.title || '画廊参考图',
                                  },
                                })
                              }
                              className="inline-flex h-6.5 cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 text-xs text-[#EAE4D7] hover:border-[#E5A918]/60"
                            >
                              <PlusIcon className="size-3" />
                              <span>参考图</span>
                            </button>
                            {promptText && (
                              <button
                                type="button"
                                onClick={() =>
                                  onInsert({
                                    promptText,
                                    promptTitle: `画廊词 · ${item.title?.slice(0, 10) || '灵感'}`,
                                  })
                                }
                                className="inline-flex h-6.5 cursor-pointer items-center gap-1 rounded-full border border-[#E5A918]/45 bg-[#E5A918]/15 px-2 text-xs font-semibold text-[#F5C443] hover:bg-[#E5A918]/25"
                              >
                                <SparklesIcon className="size-3" />
                                <span>提示词</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {tab === 'history' && (
              succeededHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-xs text-[#9C9486]">
                  <HistoryIcon className="size-6 opacity-60" />
                  <span>登录后可把云端历史成图拖入画布继续衍生</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {succeededHistory.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        const r2Key = job.imageUrl.startsWith('/api/files/')
                          ? job.imageUrl.slice('/api/files/'.length)
                          : undefined
                        onInsert({
                          asset: {
                            title: '历史成图 · REUSE',
                            sourceKind: 'history',
                            thumbUrl: job.imageUrl,
                            fullUrl: job.imageUrl,
                            r2Key,
                            caption: job.recipeSummary || '云端作品',
                          },
                        })
                      }}
                      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1A1815] text-left transition hover:border-[#E5A918]/65"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#100F0D]">
                        <img
                          src={job.imageUrl}
                          alt={job.recipeSummary || '历史成图'}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-[#D9381E] text-white opacity-0 shadow transition group-hover:opacity-100">
                          <PlusIcon className="size-3.5" />
                        </span>
                      </div>
                      <div className="truncate px-2 py-1.5 text-xs font-medium text-[#EAE4D7]">
                        {job.recipeSummary || '云端作品'}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
