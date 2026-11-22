import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DicesIcon,
  ExternalLinkIcon,
  LayersIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { selectCostumeView } from '@/lib/costumeSources'
import { toast } from '@/lib/notifications'
import { hasPoseDepthMap, poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import { useStudioActions, useStudioShallow } from '@/store/studioStore'

type CoreSlot = 'portrait' | 'costume' | 'pose'

const SLOT_SPARK_ANGLES = [-55, -22, 12, 46, 130, 215]
const SLOT_SPARK_COLORS: Record<CoreSlot, string> = {
  portrait: '#E5A918',
  costume: '#19857B',
  pose: '#D9381E',
}

function SlotSparkBurst({ slot, burstKey }: { slot: CoreSlot; burstKey: number }) {
  if (!burstKey) return null
  const color = SLOT_SPARK_COLORS[slot]
  return (
    <span
      key={burstKey}
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 z-20 size-0"
    >
      {SLOT_SPARK_ANGLES.map((deg, idx) => (
        <span
          key={deg}
          className="hp-spark-dot absolute top-0 left-0 size-1.5 rounded-full"
          style={{
            backgroundColor: idx % 2 === 0 ? color : '#FFFFFF',
            boxShadow: `0 0 6px ${color}`,
            ['--spark-a' as string]: `${deg}deg`,
          }}
        />
      ))}
    </span>
  )
}

export function RecipeDock() {
  const { pathname } = useLocation()
  const { recipe, hasRunningJob } = useStudioShallow((s) => ({
    recipe: s.recipe,
    hasRunningJob:
      s.isSubmitting ||
      s.history.some((item) => item.status === 'processing' || item.status === 'queued'),
  }))
  const {
    setPortrait,
    setCostume,
    setPose,
    removeExtraImage,
    toggleRecipePoseDepth,
    clearRecipe,
    randomizeRecipe,
  } = useStudioActions()
  const qc = useQueryClient()

  const dockGlassRef = useRef<HTMLDivElement | null>(null)
  const ctaLinkRef = useRef<HTMLAnchorElement | null>(null)
  const impactTimerRef = useRef<number | null>(null)
  const prevReadyRef = useRef(false)

  const [sparkKeys, setSparkKeys] = useState<Record<CoreSlot, number>>({
    portrait: 0,
    costume: 0,
    pose: 0,
  })
  const [ctaIgniteKey, setCtaIgniteKey] = useState(0)
  const [diceSpin, setDiceSpin] = useState(0)
  const [randomizing, setRandomizing] = useState(false)
  const [minimized, setMinimized] = useState(false)

  const extraImages = recipe.extraImages || []
  const extraCount = extraImages.length
  const coreSlotsFilled = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length
  const hasAnyItem = coreSlotsFilled > 0 || extraCount > 0
  const isFullReady = coreSlotsFilled === 3
  const isHome = pathname === '/'

  useEffect(() => {
    const onImpact = (e: Event) => {
      const detail = (e as CustomEvent<{ slot?: CoreSlot; index?: number; isFinal?: boolean }>).detail
      const slot = detail?.slot
      if (!slot) return

      const slotEl = document.querySelector<HTMLElement>(`[data-dock-slot="${slot}"]`)
      if (slotEl) {
        slotEl.classList.remove('hp-slot-pop')
        void slotEl.offsetWidth
        slotEl.classList.add('hp-slot-pop')
        window.setTimeout(() => slotEl.classList.remove('hp-slot-pop'), 480)
      }
      setSparkKeys((prev) => ({ ...prev, [slot]: prev[slot] + 1 }))

      const glass = dockGlassRef.current
      if (glass) {
        const cls =
          slot === 'pose'
            ? 'dock-impact-left'
            : slot === 'costume'
              ? 'dock-impact-center'
              : 'dock-impact-right'
        glass.classList.remove('dock-impact-left', 'dock-impact-center', 'dock-impact-right')
        void glass.offsetWidth
        glass.classList.add(cls)
        if (impactTimerRef.current) window.clearTimeout(impactTimerRef.current)
        impactTimerRef.current = window.setTimeout(() => {
          glass.classList.remove('dock-impact-left', 'dock-impact-center', 'dock-impact-right')
        }, 300)
      }

      if (detail?.isFinal) {
        setCtaIgniteKey((k) => k + 1)
      }
    }

    window.addEventListener('recipe-dock-impact', onImpact)
    return () => {
      window.removeEventListener('recipe-dock-impact', onImpact)
      if (impactTimerRef.current) window.clearTimeout(impactTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (isFullReady && !prevReadyRef.current) {
      setCtaIgniteKey((k) => k + 1)
    }
    prevReadyRef.current = isFullReady
  }, [isFullReady])

  useEffect(() => {
    if (!ctaIgniteKey || !isFullReady) return
    const ctaEl = ctaLinkRef.current
    if (!ctaEl) return
    ctaEl.classList.remove('cta-ignite')
    void ctaEl.offsetWidth
    ctaEl.classList.add('cta-ignite')
    const tid = window.setTimeout(() => ctaEl.classList.remove('cta-ignite'), 600)
    return () => window.clearTimeout(tid)
  }, [ctaIgniteKey, isFullReady])

  if (
    pathname.startsWith('/studio') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/guide') ||
    pathname.startsWith('/admin')
  ) {
    return null
  }

  const handleRandom = async () => {
    if (randomizing) return
    setRandomizing(true)
    setDiceSpin((s) => s + 1)
    try {
      const [posesRes, costumes, portraits] = await Promise.all([
        qc.ensureQueryData(posesQuery),
        qc.ensureQueryData(costumesQuery),
        qc.ensureQueryData(portraitsQuery),
      ])
      randomizeRecipe({
        poses: posesRes.items,
        costumes,
        portraits,
      })
    } catch {
      toast.error('素材库加载失败，请稍后重试')
    } finally {
      setRandomizing(false)
    }
  }

  if (!isHome && minimized) {
    return (
      <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto mt-2 w-fit max-w-[calc(100vw-1rem)] px-2 sm:max-w-[calc(100vw-1.5rem)]">
        <div className="md-glass flex items-center gap-1.5 rounded-full px-2 py-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            aria-label="展开底部配方栏"
            title="展开底部配方栏"
            className="inline-flex h-8 items-center gap-2 rounded-full bg-muted/85 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className={cn('size-2 rounded-full', recipe.pose ? 'bg-[#D9381E]' : 'bg-black/20 dark:bg-white/25')} />
              <span className={cn('size-2 rounded-full', recipe.costume ? 'bg-[#19857B]' : 'bg-black/20 dark:bg-white/25')} />
              <span className={cn('size-2 rounded-full', recipe.portrait ? 'bg-[#E5A918]' : 'bg-black/20 dark:bg-white/25')} />
            </span>
            <span className="whitespace-nowrap">
              配方 {coreSlotsFilled}/3{extraCount > 0 ? ` +${extraCount}` : ''}
            </span>
            <ChevronUpIcon className="size-3.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            disabled={randomizing}
            onClick={handleRandom}
            aria-label="随机抽一套配方"
            title="随机抽一套配方"
            className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-50"
          >
            <DicesIcon className={cn('size-3.5 text-[#E5A918]', randomizing && 'animate-spin')} />
          </button>

          <Link
            to="/studio"
            data-dock-cta
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold whitespace-nowrap transition-colors',
              isFullReady ? 'bg-[#D9381E] text-white hover:bg-[#C23018]' : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
          >
            <span>{hasRunningJob ? '绘制中…' : '去合成'}</span>
            <ArrowRightIcon className="size-3" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={
        isHome
          ? 'z-30 mx-auto w-fit max-w-[calc(100vw-0.75rem)] shrink-0 px-1.5 pb-2.5 sm:max-w-[calc(100vw-1.5rem)] sm:px-2 sm:pb-3'
          : 'sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto mt-2 w-fit max-w-[calc(100vw-0.75rem)] px-1.5 sm:max-w-[calc(100vw-1.5rem)] sm:px-2 [@media(max-height:30rem)]:static'
      }
    >
      <div
        ref={dockGlassRef}
        data-impeccable-ignore="nested-cards"
        className={cn(
          'md-glass relative overflow-visible rounded-[24px] p-2 text-foreground transition-shadow duration-300 sm:rounded-[28px] sm:px-3.5 sm:py-3',
          isFullReady && 'ring-1 ring-[#D9381E]/25'
        )}
      >
        {!isHome && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="收起底部配方栏"
            title="收起底部配方栏"
            className="absolute -top-2.5 right-3 z-20 inline-flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
        )}

        {/* 底部极细充能进度条 */}
        <div className="pointer-events-none absolute inset-x-5 bottom-0 h-[2px] overflow-hidden rounded-b-[28px] bg-border/80">
          <motion.div
            animate={{ width: `${(coreSlotsFilled / 3) * 100}%` }}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              'h-full transition-colors duration-300',
              isFullReady ? 'bg-gradient-to-r from-[#E5A918] via-[#D9381E] to-[#D9381E]' : 'bg-foreground'
            )}
          />
        </div>

        <div className="flex flex-row items-center gap-2 sm:gap-3.5">
          {/* 三张纯图像配方卡槽 + 可选附加参考卡管理 */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-muted/75 p-1 sm:gap-2.5 sm:rounded-2xl sm:p-1.5">
            {/* Slot 1: Pose */}
            <div data-dock-slot="pose" className="group/slot relative shrink-0">
              <SlotSparkBurst slot="pose" burstKey={sparkKeys.pose} />
              {recipe.pose ? (
                <motion.div
                  key={`${recipe.pose.id}-${Boolean(recipe.pose.useDepth)}`}
                  initial={{ opacity: 0.5, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={`${recipe.pose.姿势名称}${recipe.pose.角度 ? ` · ${recipe.pose.角度}` : ''}（点击检查或调整）`}
                        aria-label={`检查姿势参考：${recipe.pose.姿势名称}`}
                        className={cn(
                          'block h-[58px] w-[44px] cursor-pointer overflow-hidden rounded-lg border border-[#D9381E]/55 shadow-xs ring-1 ring-[#D9381E]/30 transition-all hover:scale-[1.03] hover:ring-[#D9381E]/75 sm:h-[92px] sm:w-[70px] sm:rounded-xl',
                          recipe.pose.useDepth ? 'bg-[#2B2B32]' : 'bg-white'
                        )}
                      >
                        <img
                          src={referenceImageUrl(poseThumbPath(recipe.pose))}
                          alt={recipe.pose.姿势名称}
                          className="size-full object-contain"
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-64 rounded-2xl p-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={referenceImageUrl(poseThumbPath(recipe.pose))}
                          alt={recipe.pose.姿势名称}
                          className={cn(
                            'h-20 w-15 shrink-0 rounded-xl border border-border object-contain',
                            recipe.pose.useDepth ? 'bg-[#2B2B32]' : 'bg-white'
                          )}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-xs font-semibold text-[#D9381E]">动作姿势</div>
                          <div className="line-clamp-2 text-xs font-bold leading-snug">
                            {recipe.pose.姿势名称}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[recipe.pose.角度, recipe.pose.useDepth ? '深度图' : '素体白模']
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                      <DropdownMenuSeparator className="my-2.5" />
                      <div className="flex flex-col gap-1.5">
                        {hasPoseDepthMap(recipe.pose) && (
                          <button
                            type="button"
                            onClick={toggleRecipePoseDepth}
                            className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                          >
                            <span>底图模式：{recipe.pose.useDepth ? '深度图' : '素体白模'}</span>
                            <span className="font-mono text-xs text-[#D9381E]">切换</span>
                          </button>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Link
                            to="/poses"
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                          >
                            <ExternalLinkIcon className="size-3" />
                            <span>去图库换卡</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => setPose(null)}
                            className="inline-flex items-center justify-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2Icon className="size-3" />
                            <span>移除</span>
                          </button>
                        </div>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {hasPoseDepthMap(recipe.pose) && (
                    <button
                      type="button"
                      onClick={toggleRecipePoseDepth}
                      title="切换白模或深度图"
                      aria-label={`切换白模或深度图，当前为${recipe.pose.useDepth ? '深度图' : '白模'}`}
                      className={cn(
                        'absolute bottom-0.5 left-0.5 z-10 inline-flex h-5 items-center rounded-md px-1.5 font-mono text-xs font-bold leading-none shadow-xs backdrop-blur-xs transition-colors sm:bottom-1 sm:left-1',
                        recipe.pose.useDepth
                          ? 'bg-[#D9381E] text-white'
                          : 'border border-black/15 bg-white/90 text-zinc-900 hover:bg-white'
                      )}
                    >
                      {recipe.pose.useDepth ? '深' : '白'}
                    </button>
                  )}
                  <button
                    type="button"
                    title="清除姿势参考图"
                    aria-label="清除姿势参考图"
                    onClick={() => setPose(null)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </motion.div>
              ) : (
                <Link
                  to="/poses"
                  title="选择姿势参考图"
                  aria-label="选择姿势参考图"
                  className="flex h-[58px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/90 bg-card/45 text-muted-foreground transition-colors hover:border-[#D9381E]/65 hover:bg-card/85 hover:text-foreground sm:h-[92px] sm:w-[70px] sm:gap-1 sm:rounded-xl"
                >
                  <PersonStandingIcon className="size-4 text-[#D9381E] sm:size-5" />
                  <span className="text-xs font-medium leading-none">姿势</span>
                </Link>
              )}
            </div>

            {/* Slot 2: Costume */}
            <div data-dock-slot="costume" className="group/slot relative shrink-0">
              <SlotSparkBurst slot="costume" burstKey={sparkKeys.costume} />
              {recipe.costume ? (
                <motion.div
                  key={`${recipe.costume.id}-${recipe.costume.selectedView || 'front'}`}
                  initial={{ opacity: 0.5, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={`${recipe.costume.服装名称}（点击检查或切换视角）`}
                        aria-label={`检查服装参考：${recipe.costume.服装名称}`}
                        className="block h-[58px] w-[44px] cursor-pointer overflow-hidden rounded-lg border border-[#19857B]/55 bg-card shadow-xs ring-1 ring-[#19857B]/30 transition-all hover:scale-[1.03] hover:ring-[#19857B]/75 sm:h-[92px] sm:w-[70px] sm:rounded-xl"
                      >
                        <img
                          src={referenceImageUrl(recipe.costume.缩略图)}
                          alt={recipe.costume.服装名称}
                          className={cn(
                            'size-full',
                            recipe.costume.source === 'mio' || recipe.costume.source === 'shisei'
                              ? 'bg-[#DFDFE2] object-contain dark:bg-[#232328]'
                              : 'object-cover object-[50%_15%]'
                          )}
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-64 rounded-2xl p-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={referenceImageUrl(recipe.costume.缩略图)}
                          alt={recipe.costume.服装名称}
                          className={cn(
                            'h-20 w-15 shrink-0 rounded-xl border border-border bg-muted/30',
                            recipe.costume.source === 'mio' || recipe.costume.source === 'shisei'
                              ? 'object-contain'
                              : 'object-cover object-top'
                          )}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-xs font-semibold text-[#116E65] dark:text-[#4FD1C5]">服装穿搭</div>
                          <div className="line-clamp-2 text-xs font-bold leading-snug">
                            {recipe.costume.服装名称}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {recipe.costume.分类}
                            {recipe.costume.selectedView && recipe.costume.views?.length
                              ? ` · ${recipe.costume.views.find((v) => v.id === recipe.costume?.selectedView)?.label || recipe.costume.selectedView}`
                              : ''}
                          </div>
                        </div>
                      </div>
                      {recipe.costume.views && recipe.costume.views.length > 1 && (
                        <>
                          <DropdownMenuSeparator className="my-2.5" />
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <LayersIcon className="size-3" />
                              <span>切换服装视角</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              {recipe.costume.views.map((v) => {
                                const active = (recipe.costume?.selectedView || 'front') === v.id
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => {
                                      if (recipe.costume) {
                                        setCostume(selectCostumeView(recipe.costume, v.id))
                                      }
                                    }}
                                    className={cn(
                                      'rounded-lg py-1 text-xs font-medium transition-colors',
                                      active
                                        ? 'bg-[#19857B] text-white'
                                        : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                    )}
                                  >
                                    {v.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}
                      <DropdownMenuSeparator className="my-2.5" />
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/costumes"
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                        >
                          <ExternalLinkIcon className="size-3" />
                          <span>去图库换卡</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setCostume(null)}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2Icon className="size-3" />
                          <span>移除</span>
                        </button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    title="清除服装参考图"
                    aria-label="清除服装参考图"
                    onClick={() => setCostume(null)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </motion.div>
              ) : (
                <Link
                  to="/costumes"
                  title="选择穿搭参考图"
                  aria-label="选择穿搭参考图"
                  className="flex h-[58px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/90 bg-card/45 text-muted-foreground transition-colors hover:border-[#19857B]/65 hover:bg-card/85 hover:text-foreground sm:h-[92px] sm:w-[70px] sm:gap-1 sm:rounded-xl"
                >
                  <ShirtIcon className="size-4 text-[#19857B] sm:size-5" />
                  <span className="text-xs font-medium leading-none">穿搭</span>
                </Link>
              )}
            </div>

            {/* Slot 3: Portrait */}
            <div data-dock-slot="portrait" className="group/slot relative shrink-0">
              <SlotSparkBurst slot="portrait" burstKey={sparkKeys.portrait} />
              {recipe.portrait ? (
                <motion.div
                  key={recipe.portrait.id}
                  initial={{ opacity: 0.5, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={`${recipe.portrait.发型名称 || recipe.portrait.标题}（点击检查）`}
                        aria-label={`检查人像参考：${recipe.portrait.发型名称}`}
                        className="block h-[58px] w-[44px] cursor-pointer overflow-hidden rounded-lg border border-[#E5A918]/55 bg-card shadow-xs ring-1 ring-[#E5A918]/30 transition-all hover:scale-[1.03] hover:ring-[#E5A918]/75 sm:h-[92px] sm:w-[70px] sm:rounded-xl"
                      >
                        <img
                          src={referenceImageUrl(recipe.portrait.缩略图)}
                          alt={recipe.portrait.标题 || recipe.portrait.发型名称}
                          className="size-full object-cover object-top"
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-64 rounded-2xl p-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={referenceImageUrl(recipe.portrait.缩略图)}
                          alt={recipe.portrait.标题 || recipe.portrait.发型名称}
                          className="h-20 w-15 shrink-0 rounded-xl border border-border bg-muted/30 object-cover object-top"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-xs font-semibold text-[#7A5200] dark:text-[#E5A918]">人像颜模</div>
                          <div className="line-clamp-2 text-xs font-bold leading-snug">
                            {recipe.portrait.标题 || recipe.portrait.发型名称}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[recipe.portrait.分区, recipe.portrait.发长].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                      <DropdownMenuSeparator className="my-2.5" />
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/portraits"
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                        >
                          <ExternalLinkIcon className="size-3" />
                          <span>去图库换卡</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPortrait(null)}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2Icon className="size-3" />
                          <span>移除</span>
                        </button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    title="清除人像参考图"
                    aria-label="清除人像参考图"
                    onClick={() => setPortrait(null)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-white"
                  >
                    <XIcon className="size-3" />
                  </button>
                </motion.div>
              ) : (
                <Link
                  to="/portraits"
                  title="选择人像参考图"
                  aria-label="选择人像参考图"
                  className="flex h-[58px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/90 bg-card/45 text-muted-foreground transition-colors hover:border-[#E5A918]/65 hover:bg-card/85 hover:text-foreground sm:h-[92px] sm:w-[70px] sm:gap-1 sm:rounded-xl"
                >
                  <UserRoundIcon className="size-4 text-[#E5A918] sm:size-5" />
                  <span className="text-xs font-medium leading-none">人像</span>
                </Link>
              )}
            </div>

            {extraCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="查看或移除附加参考图"
                    className="flex h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card/85 px-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-card sm:h-[92px] sm:rounded-xl sm:px-2.5"
                  >
                    <PaperclipIcon className="size-3.5 text-muted-foreground" />
                    <span className="font-mono">+{extraCount}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-64 rounded-2xl p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold">附加参考图 ({extraCount})</span>
                    <Link to="/studio" className="text-xs text-muted-foreground underline hover:text-foreground">
                      合成台管理
                    </Link>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {extraImages.map((img) => (
                      <div
                        key={img.id}
                        className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-1.5"
                      >
                        <img
                          src={referenceImageUrl(img.url)}
                          alt={img.name}
                          className="size-10 shrink-0 rounded-lg border border-border object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{img.name}</span>
                        <button
                          type="button"
                          aria-label={`移除附图 ${img.name}`}
                          onClick={() => removeExtraImage(img.id)}
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* 右侧上下两行操作区：上排整理配方（随机 + 清空），下排主 CTA（立即合成） */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 sm:min-w-[216px] sm:gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={randomizing}
                onClick={handleRandom}
                className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold whitespace-nowrap text-foreground transition-colors hover:bg-muted active:scale-[0.97] disabled:cursor-wait disabled:opacity-50 sm:h-10 sm:gap-1.5 sm:px-3.5"
              >
                <motion.span
                  key={diceSpin}
                  animate={{ rotate: diceSpin ? 360 : 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex items-center"
                >
                  <DicesIcon className="size-3.5 text-[#E5A918]" />
                </motion.span>
                <span>随机</span>
              </button>

              {hasAnyItem && (
                <button
                  type="button"
                  title="清空全部参考图"
                  aria-label="清空全部参考图"
                  onClick={clearRecipe}
                  className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] sm:h-10 sm:px-3"
                >
                  <Trash2Icon className="size-3.5" />
                  <span>清空</span>
                </button>
              )}
            </div>

            {/* 满槽觉醒的「立即合成」主按钮 */}
            <div className="relative flex">
              {ctaIgniteKey > 0 && isFullReady && (
                <span
                  key={ctaIgniteKey}
                  aria-hidden="true"
                  className="cta-ripple-ring pointer-events-none absolute inset-0 rounded-full border-2 border-[#D9381E]"
                />
              )}
              <Link
                ref={ctaLinkRef}
                to="/studio"
                data-dock-cta
                className={cn(
                  'group relative inline-flex h-8 w-full items-center justify-center gap-1.5 overflow-hidden rounded-full px-3 text-xs font-bold whitespace-nowrap transition-all active:scale-[0.98] sm:h-11 sm:px-5 sm:text-[13px]',
                  isFullReady
                    ? 'ks-keycap bg-[#D9381E] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[#C23018]'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                )}
              >
                {isFullReady && !hasRunningJob && (
                  <span
                    aria-hidden="true"
                    className="cta-sheen-bar pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  />
                )}
                {hasRunningJob ? (
                  <>
                    <LoaderCircleIcon className="size-3.5 animate-spin sm:size-4" />
                    <span>绘制中…</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-3.5 shrink-0 sm:size-4" />
                    <span className="sm:hidden">
                      去合成 ({coreSlotsFilled}/3{extraCount > 0 ? `+${extraCount}` : ''})
                    </span>
                    <span className="hidden sm:inline">
                      立即合成 ({coreSlotsFilled}/3{extraCount > 0 ? ` +${extraCount}` : ''})
                    </span>
                    {isFullReady && <ArrowRightIcon className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />}
                  </>
                )}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
