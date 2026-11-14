import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  ArrowRightIcon,
  DicesIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'

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
      className="pointer-events-none absolute top-1/2 left-6 z-20 size-0"
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
  const {
    recipe,
    apiConfig,
    isGenerating,
    setPortrait,
    setCostume,
    setPose,
    toggleRecipePoseDepth,
    clearRecipe,
    randomizeRecipe,
  } = useStudio()
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

  const extraCount = (recipe.extraImages || []).length
  const workflowImages =
    apiConfig.activeProvider === 'comfyui' &&
    recipe.workflowImagesIdentity === workflowIdentity(apiConfig.comfyuiParams.workflowJson)
      ? Object.values(recipe.workflowImages || {})
      : []

  const coreSlotsFilled = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length
  const count = coreSlotsFilled + extraCount + workflowImages.length
  const isFullReady = coreSlotsFilled === 3

  // 监听单张卡落地撞击事件：不清空已有卡，每飞落一张即刻独立抖动 + 火花迸发
  useEffect(() => {
    const onImpact = (e: Event) => {
      const detail = (e as CustomEvent<{ slot?: CoreSlot; index?: number; isFinal?: boolean }>).detail
      const slot = detail?.slot
      if (!slot) return

      // 1. 触发对应槽位 Q 弹 + 星芒粒子迸发
      const slotEl = document.querySelector<HTMLElement>(`[data-dock-slot="${slot}"]`)
      if (slotEl) {
        slotEl.classList.remove('hp-slot-pop')
        void slotEl.offsetWidth
        slotEl.classList.add('hp-slot-pop')
        window.setTimeout(() => slotEl.classList.remove('hp-slot-pop'), 480)
      }
      setSparkKeys((prev) => ({ ...prev, [slot]: prev[slot] + 1 }))

      // 2. 触发整条悬浮块根据落点左/中/右微倾震颤一次
      const glass = dockGlassRef.current
      if (glass) {
        const cls =
          slot === 'portrait'
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

      // 3. 第 3 张（压轴最后一张）落地时，点燃「立即合成」按钮唤醒波纹
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

  // 当通过其他途径（如点击悬浮栏「随机」或在图库凑齐第 3 张）填满 3/3 时，也触发觉醒波纹
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
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={
        pathname === '/'
          ? 'z-30 mx-auto w-full max-w-4xl shrink-0 px-3 pb-3'
          : 'sticky bottom-[max(0.85rem,env(safe-area-inset-bottom))] z-30 mx-auto mt-2 w-full max-w-4xl px-3 [@media(max-height:30rem)]:static'
      }
    >
      <div
        ref={dockGlassRef}
        data-impeccable-ignore="nested-cards"
        className={cn(
          'md-glass relative overflow-visible rounded-[22px] p-2 text-foreground transition-shadow duration-300 sm:px-3 sm:py-2',
          isFullReady && 'ring-1 ring-[#D9381E]/25'
        )}
      >
        {/* 底部极细充能进度条 */}
        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-b-[22px] bg-border/80">
          <motion.div
            animate={{ width: `${(coreSlotsFilled / 3) * 100}%` }}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              'h-full transition-colors duration-300',
              isFullReady ? 'bg-gradient-to-r from-[#E5A918] via-[#D9381E] to-[#D9381E]' : 'bg-foreground'
            )}
          />
        </div>

        <div className="flex flex-col gap-2 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 rounded-2xl bg-muted/75 p-1 sm:gap-2">
            {/* Slot 1: Portrait */}
            <div
              data-dock-slot="portrait"
              className={`relative flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors ${
                recipe.portrait ? 'border border-border bg-card shadow-xs' : 'hover:bg-card/70'
              }`}
            >
              <SlotSparkBurst slot="portrait" burstKey={sparkKeys.portrait} />
              {recipe.portrait ? (
                <>
                  <img
                    src={referenceImageUrl(recipe.portrait.缩略图)}
                    alt={recipe.portrait.标题}
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-[#E5A918]/50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">{recipe.portrait.发型名称}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="清除人像参考图"
                    onClick={() => setPortrait(null)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </>
              ) : (
                <Link
                  to="/portraits"
                  className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-foreground ring-1 ring-border">
                    <UserRoundIcon className="size-3.5" />
                  </div>
                  <span className="truncate text-xs font-medium">1. 选人像</span>
                </Link>
              )}
            </div>

            {/* Slot 2: Costume */}
            <div
              data-dock-slot="costume"
              className={`relative flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors ${
                recipe.costume ? 'border border-border bg-card shadow-xs' : 'hover:bg-card/70'
              }`}
            >
              <SlotSparkBurst slot="costume" burstKey={sparkKeys.costume} />
              {recipe.costume ? (
                <>
                  <img
                    src={referenceImageUrl(recipe.costume.缩略图)}
                    alt={recipe.costume.服装名称}
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-[#19857B]/50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">{recipe.costume.服装名称}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="清除服装参考图"
                    onClick={() => setCostume(null)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </>
              ) : (
                <Link
                  to="/costumes"
                  className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-foreground ring-1 ring-border">
                    <ShirtIcon className="size-3.5" />
                  </div>
                  <span className="truncate text-xs font-medium">2. 选穿搭</span>
                </Link>
              )}
            </div>

            {/* Slot 3: Pose */}
            <div
              data-dock-slot="pose"
              className={`relative flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors ${
                recipe.pose ? 'border border-border bg-card shadow-xs' : 'hover:bg-card/70'
              }`}
            >
              <SlotSparkBurst slot="pose" burstKey={sparkKeys.pose} />
              {recipe.pose ? (
                <>
                  <img
                    src={referenceImageUrl(poseThumbPath(recipe.pose))}
                    alt={recipe.pose.姿势名称}
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-[#D9381E]/50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground" title={recipe.pose.姿势名称}>
                      {recipe.pose.姿势名称}
                    </div>
                    {recipe.pose.source !== 'upload' && (
                      <button
                        type="button"
                        onClick={toggleRecipePoseDepth}
                        className="inline-flex items-center gap-1 text-xs leading-none text-muted-foreground hover:text-foreground"
                      >
                        <span className={!recipe.pose.useDepth ? 'font-semibold text-foreground' : ''}>白模</span>
                        <span>/</span>
                        <span className={recipe.pose.useDepth ? 'font-semibold text-[#D9381E]' : ''}>深度</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="清除姿势参考图"
                    onClick={() => setPose(null)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </>
              ) : (
                <Link
                  to="/poses"
                  className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-foreground ring-1 ring-border">
                    <PersonStandingIcon className="size-3.5" />
                  </div>
                  <span className="truncate text-xs font-medium">3. 选姿势</span>
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={handleRandom}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.97]"
            >
              <DicesIcon className="size-3.5 text-muted-foreground" />
              <span>随机</span>
            </button>
            {count > 0 && (
              <button
                type="button"
                aria-label="清空参考图"
                onClick={clearRecipe}
                className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive active:scale-[0.97]"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            )}

            {/* 满槽觉醒的「立即合成」按钮 */}
            <div className="relative inline-flex">
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
                  'group relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full px-4 text-xs font-semibold transition-all active:scale-[0.97]',
                  isFullReady
                    ? 'ks-keycap bg-[#D9381E] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[#C23018]'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                )}
              >
                {isFullReady && !isGenerating && (
                  <span
                    aria-hidden="true"
                    className="cta-sheen-bar pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  />
                )}
                {isGenerating ? (
                  <>
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                    <span>生成中…</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className={cn('size-3.5', isFullReady && 'animate-pulse')} />
                    <span>立即合成 ({count}/3)</span>
                    {isFullReady && <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />}
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
