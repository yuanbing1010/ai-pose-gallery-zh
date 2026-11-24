import { Suspense, lazy, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRightIcon,
  CameraIcon,
  LayersIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react'
import { homePreviewQuery } from '@/api/gallery'
import { LettraMorphingPromptDock } from '@/components/home/LettraMorphingPromptDock'
import { PORTAL_NAV_TICKS, SantalScrollChrome } from '@/components/home/SantalScrollChrome'
import { OpticalSplitCurtain } from '@/components/motion/SkeuomorphicInstruments'
import type { StudioAspectRatio } from '@/lib/artists'
import { isContainCostumeSource } from '@/lib/costumeSources'
import { hasPoseDepthMap, poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { getStudioMuted, setStudioMuted, unlockStudioAudio } from '@/lib/studioAudio'
import { playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { useStudioActions, useStudioShallow } from '@/store/studioStore'

const SantalScrollTheater = lazy(() =>
  import('@/components/home/SantalScrollTheater').then((m) => ({ default: m.SantalScrollTheater }))
)
const SantalProcessAccordion = lazy(() =>
  import('@/components/home/SantalProcessAccordion').then((m) => ({
    default: m.SantalProcessAccordion,
  }))
)
const AttributionDialog = lazy(() =>
  import('@/components/home/AttributionDialog').then((m) => ({ default: m.AttributionDialog }))
)

const CURRENT_YEAR = new Date().getFullYear()

export function CreativeHubExperience() {
  const navigate = useNavigate()
  const { recipe, userPrompt, aspectRatio } = useStudioShallow((s) => ({
    recipe: s.recipe,
    userPrompt: s.userPrompt,
    aspectRatio: s.aspectRatio,
  }))
  const {
    setPose,
    setCostume,
    setPortrait,
    setUserPrompt,
    setAspectRatio,
    setStudioMode,
    setRemixGallerySource,
  } = useStudioActions()

  const [draftPrompt, setDraftPrompt] = useState(userPrompt)
  const [draftRatio, setDraftRatio] = useState<StudioAspectRatio>(aspectRatio)
  const [depthScanIndex, setDepthScanIndex] = useState(0)
  const [muted, setMuted] = useState(() => getStudioMuted())
  const [activeChapter, setActiveChapter] = useState<string>('portal-hero')
  const [attributionOpen, setAttributionOpen] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const observed = new Set<HTMLElement>()
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target.id) {
          setActiveChapter(visible[0].target.id)
        }
      },
      { rootMargin: '-20% 0px -45% 0px', threshold: [0.1, 0.35, 0.6] }
    )

    const attachChapters = () => {
      let foundCount = 0
      for (const tick of PORTAL_NAV_TICKS) {
        const el = document.getElementById(tick.id)
        if (el) {
          foundCount++
          if (!observed.has(el)) {
            observed.add(el)
            observer.observe(el)
          }
        }
      }
      return foundCount === PORTAL_NAV_TICKS.length
    }

    let mo: MutationObserver | null = null
    if (!attachChapters() && typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => {
        if (attachChapters()) {
          mo?.disconnect()
          mo = null
        }
      })
      mo.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      mo?.disconnect()
      observer.disconnect()
    }
  }, [])

  const toggleHubMute = () => {
    const next = !muted
    setStudioMuted(next)
    setMuted(next)
    if (!next) {
      unlockStudioAudio()
      playMechanicalSwitch(1.08)
    }
  }

  const previewRes = useQuery(homePreviewQuery)

  const launchPromptStudio = (promptOverride?: string) => {
    const text = (promptOverride ?? draftPrompt).trim()
    setStudioMode('prompt')
    setAspectRatio(draftRatio)
    setRemixGallerySource(null)
    if (text) setUserPrompt(text)
    void navigate({ to: '/studio', search: { mode: 'prompt' } })
  }

  // 从轻量 home-preview.json（~5KB）中读取白模⇄深度图标本，零依赖 4.84MB 全量三库 JSON
  const depthCapablePoses = (previewRes.data?.depthPoses ?? []).filter(
    (p) => !p.source && hasPoseDepthMap(p)
  )

  const handleShuffleDepthScan = () => {
    if (depthCapablePoses.length <= 1) return
    setDepthScanIndex((prev) => {
      const step = 1 + Math.floor(Math.random() * (depthCapablePoses.length - 1))
      return (prev + step) % depthCapablePoses.length
    })
  }

  const depthScanPose =
    depthCapablePoses.length > 0
      ? depthCapablePoses[depthScanIndex % depthCapablePoses.length]
      : null
  const samplePose = recipe.pose ?? depthScanPose ?? null
  const sampleCostume = recipe.costume ?? previewRes.data?.sampleCostume ?? null
  const samplePortrait = recipe.portrait ?? previewRes.data?.samplePortrait ?? null

  const poseGroupsCount = previewRes.data?.counts.poseGroups ?? 556
  const posesCount = previewRes.data?.counts.poses ?? 1439
  const depthCapableCount = previewRes.data?.counts.depthCapablePoses ?? 1439
  const costumesCount = previewRes.data?.counts.costumes ?? 3391
  const portraitsCount = previewRes.data?.counts.portraits ?? 1499
  const totalRefCount = posesCount + costumesCount + portraitsCount

  const handleLaunchSampleRecipe = () => {
    playMechanicalSwitch(1.06)
    if (!recipe.pose && depthScanPose) setPose(depthScanPose)
    if (!recipe.costume && sampleCostume) setCostume(sampleCostume)
    if (!recipe.portrait && samplePortrait) setPortrait(samplePortrait)
    setStudioMode('recipe')
    void navigate({ to: '/studio', search: { mode: 'recipe' } })
  }

  const archiveEntries = [
    {
      code: '01',
      title: '动作姿势库',
      meta: `${poseGroupsCount} 组 · ${posesCount.toLocaleString('zh-CN')} 视角（含 ${depthCapableCount.toLocaleString('zh-CN')} 深度图）`,
      to: '/poses' as const,
      dot: 'bg-[#C42F16]',
    },
    {
      code: '02',
      title: '服装穿搭库',
      meta: `${costumesCount.toLocaleString('zh-CN')} 套写实、二次元与历代服饰`,
      to: '/costumes' as const,
      dot: 'bg-[#19857B]',
    },
    {
      code: '03',
      title: '人像颜值库',
      meta: `${portraitsCount.toLocaleString('zh-CN')} 张面部气质与发长参考`,
      to: '/portraits' as const,
      dot: 'bg-[#C78F00]',
    },
  ]

  return (
    <div className="relative flex w-full flex-col">
      {/* 顶部滚动进度轨 + 建筑纵线网格 + 平滑指针 */}
      <SantalScrollChrome activeChapter={activeChapter} />

      {/* 下滑后底部居中浮现的极简文生图快门胶囊 */}
      <LettraMorphingPromptDock
        value={draftPrompt}
        ratio={draftRatio}
        onChange={setDraftPrompt}
        onRatioChange={setDraftRatio}
        onLaunch={() => launchPromptStudio()}
      />

      {/* ====================================================================
       * CHAPTER 00 · 视觉参考图鉴优先首屏（左：三库直达 + 快捷文生图副入口；右：实时白模⇄深度光幕 + 服装/人像标本）
       * ==================================================================== */}
      <section
        id="portal-hero"
        className="relative flex w-full flex-col justify-start overflow-hidden pt-3 pb-8 sm:pt-5 sm:pb-12"
      >
        <div className="relative z-10 mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-4 sm:px-6 lg:px-10">
          {/* 紧凑单行编辑部统计与声效切换行（不重复顶栏品牌字标，桌面与移动端均占一行让首屏标题与光幕更早入眼） */}
          <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-2.5">
            <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#C42F16]" />
              <span className="truncate">
                {totalRefCount.toLocaleString('zh-CN')} 张实体角色参考标本
                <span className="hidden sm:inline"> · 暖纸暗房工作台</span>
              </span>
            </div>

            <button
              type="button"
              onClick={toggleHubMute}
              aria-label={muted ? '开启拟物交互音效' : '关闭拟物交互音效'}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/90 bg-card/90 px-3 font-mono text-xs text-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/35 active:scale-[0.97] sm:h-8"
            >
              {muted ? (
                <VolumeXIcon className="size-3.5 text-muted-foreground" />
              ) : (
                <Volume2Icon className="size-3.5 text-[#C42F16] dark:text-[#FF7A63]" />
              )}
              <span>{muted ? '静音' : '声效 ON'}</span>
            </button>
          </div>

          {/* 12 栏不对称首屏主体 */}
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:items-center lg:gap-10">
            {/* 左栏：产品主张 + 三库直达索引 + 快捷文生图副入口（首屏直接可见，避免 opacity:0 拖慢 LCP） */}
            <div className="flex flex-col gap-5 lg:col-span-5">
              <div className="space-y-2.5">
                <h1 className="ed-headline-tight text-3xl font-bold text-foreground sm:text-5xl lg:text-[48px] lg:leading-[1.08]">
                  <span>三轨角色图鉴，</span>
                  <br />
                  <span className="font-bold text-[#855B00] dark:text-[#E5A918]">
                    直达暗房显影。
                  </span>
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                  先挑 3D 白模与深度骨骼、全品类服饰穿搭和人像气质参考，再一键送入配方创作台或无限画布成图。
                </p>
              </div>

              {/* 三大核心参考库首屏一键直达 */}
              <div className="divide-y divide-border/80 border-y border-border/80">
                {archiveEntries.map((entry) => (
                  <Link
                    key={entry.to}
                    to={entry.to}
                    onClick={() => playMechanicalSwitch(1.02)}
                    className="group flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:text-[#C42F16] dark:hover:text-[#FF7A63]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('size-2 shrink-0 rounded-full', entry.dot)} />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {entry.code}
                          </span>
                          <span className="text-sm font-bold text-foreground transition-colors group-hover:text-[#C42F16] sm:text-base dark:group-hover:text-[#FF7A63]">
                            {entry.title}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{entry.meta}</div>
                      </div>
                    </div>
                    <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#C42F16] dark:group-hover:text-[#FF7A63]" />
                  </Link>
                ))}
              </div>

              {/* 副入口：紧凑型快捷文生图快门 */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  launchPromptStudio()
                }}
                className="ks-obsidian-stage dark relative overflow-hidden rounded-[18px] border border-[#E5A918]/30 p-2.5 text-[#F5F1E8]"
              >
                <div className="mb-1.5 flex items-center justify-between px-1.5 font-mono text-xs text-[#C8C0B2]">
                  <span className="font-semibold text-[#F5C443]">快捷文生图</span>
                  <span>回车直达自由文生图</span>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/14 bg-black/50 py-1 pr-1 pl-3.5">
                  <input
                    type="text"
                    aria-label="快捷文生图画面灵感"
                    enterKeyHint="send"
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.target.value)}
                    placeholder="也可直接输入画面灵感，回车即拍…"
                    className="h-9 min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-[#A6A199] focus:outline-none sm:text-sm"
                  />
                  <button
                    type="submit"
                    aria-label="快门发射进入文生图"
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F5C443] text-[#151412] transition-[transform,background-color] duration-150 hover:bg-[#FDE68A] active:scale-95 sm:size-9"
                  >
                    <CameraIcon className="size-4" />
                  </button>
                </div>
              </form>
            </div>

            {/* 右栏：首屏实时可交互标本展示（白模⇄深度光幕 + 服装 & 人像标本卡 + 一键入台合成） */}
            <div className="space-y-3 lg:col-span-7">
              {depthScanPose ? (
                <OpticalSplitCurtain
                  leftSrc={poseThumbPath(depthScanPose, true)}
                  rightSrc={poseThumbPath(depthScanPose, false)}
                  title={`${depthScanPose.姿势名称}（${depthScanPose.角度}）`}
                  countLabel={`${depthCapableCount.toLocaleString('zh-CN')} 原始白模深度`}
                  onShuffle={handleShuffleDepthScan}
                  viewportClassName="h-[240px] sm:h-[296px]"
                />
              ) : previewRes.isError ? (
                <div className="flex h-[240px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-border/80 bg-card/60 px-4 text-center sm:h-[296px]">
                  <span className="font-mono text-xs text-muted-foreground">
                    深度图标本加载失败
                  </span>
                  <button
                    type="button"
                    onClick={() => void previewRes.refetch()}
                    className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-muted active:scale-[0.97]"
                  >
                    重新加载
                  </button>
                </div>
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-2xl border border-border/80 bg-card/60 font-mono text-xs text-muted-foreground sm:h-[296px]">
                  正在载入原始深度图标本…
                </div>
              )}

              {/* 配对展示服装与人像真实标本 + 一键带入配方创作台 */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Link
                  to="/costumes"
                  onClick={() => playMechanicalSwitch(1.0)}
                  className="group flex items-center gap-2.5 rounded-2xl border border-border/85 bg-card p-2 transition-colors hover:border-[#19857B]/70"
                >
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted/40">
                    {sampleCostume?.缩略图 && (
                      <img
                        src={referenceImageUrl(sampleCostume.缩略图)}
                        alt={sampleCostume.服装名称}
                        decoding="async"
                        className={cn(
                          'size-full transition-transform duration-300 group-hover:scale-105',
                          isContainCostumeSource(sampleCostume.source)
                            ? 'bg-white object-contain p-0.5'
                            : 'object-cover object-top'
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-[#116E65] dark:text-[#4FD1C5]">
                      02 服装标本
                    </div>
                    <div className="mt-0.5 truncate text-xs font-bold text-foreground">
                      {sampleCostume?.服装名称 ?? '浏览服装穿搭'}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">进入服装库 ↗</div>
                  </div>
                </Link>

                <Link
                  to="/portraits"
                  onClick={() => playMechanicalSwitch(1.0)}
                  className="group flex items-center gap-2.5 rounded-2xl border border-border/85 bg-card p-2 transition-colors hover:border-[#E5A918]/75"
                >
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted/40">
                    {samplePortrait?.缩略图 && (
                      <img
                        src={referenceImageUrl(samplePortrait.缩略图)}
                        alt={samplePortrait.标题 || samplePortrait.发型名称}
                        decoding="async"
                        className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-[#855B00] dark:text-[#E5A918]">
                      03 人像标本
                    </div>
                    <div className="mt-0.5 truncate text-xs font-bold text-foreground">
                      {samplePortrait?.发型名称 || samplePortrait?.标题 || '浏览人像发型'}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">进入人像库 ↗</div>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={handleLaunchSampleRecipe}
                  className="skin-accent-btn group col-span-2 flex min-h-14 cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.98] sm:col-span-1 sm:flex-col sm:items-start sm:justify-between sm:p-3"
                >
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-white">
                    <LayersIcon className="size-3.5" />
                    <span>三轨合图</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white sm:text-sm">
                    <span>带这组去合成</span>
                    <ArrowUpRightIcon className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
       * CHAPTER 01 · 四幕吸顶滚动暗房舞台（静态外层 id 确保首屏挂载即被 IntersectionObserver 观测）
       * ==================================================================== */}
      <div id="portal-theater" className="w-full scroll-mt-24">
        <Suspense
          fallback={
            <div
              className="ks-obsidian-stage dark h-[620px] w-full border-t border-[#E5A918]/25"
              aria-hidden="true"
            />
          }
        >
          <SantalScrollTheater
            sampleCards={{
              pose: samplePose
                ? { thumb: poseThumbPath(samplePose, false), title: samplePose.姿势名称 }
                : undefined,
              costume: sampleCostume
                ? {
                    thumb: referenceImageUrl(sampleCostume.缩略图),
                    title: sampleCostume.服装名称,
                    contain: isContainCostumeSource(sampleCostume.source),
                  }
                : undefined,
              portrait: samplePortrait
                ? {
                    thumb: referenceImageUrl(samplePortrait.缩略图),
                    title: samplePortrait.标题 || samplePortrait.发型名称 || '人像参考',
                  }
                : undefined,
            }}
            draftPrompt={draftPrompt}
            onDraftPromptChange={setDraftPrompt}
            onLaunchTextToImage={launchPromptStudio}
            onOpenBlindbox={() => {
              playMechanicalSwitch(1.06)
              void navigate({ to: '/blindbox' })
            }}
            onOpenCanvas={() => {
              playMechanicalSwitch(1.04)
              void navigate({ to: '/canvas' })
            }}
            onOpenStudio={() => {
              playMechanicalSwitch(1.04)
              setStudioMode('recipe')
              void navigate({ to: '/studio', search: { mode: 'recipe' } })
            }}
          />
        </Suspense>
      </div>

      {/* ====================================================================
       * CHAPTER 02 · 创作链路手风琴（静态外层 id 确保首屏挂载即被观测）
       * ==================================================================== */}
      <div id="portal-process" className="w-full scroll-mt-24">
        <Suspense fallback={<div className="h-[460px] w-full" aria-hidden="true" />}>
          <SantalProcessAccordion />
        </Suspense>
      </div>

      {/* ====================================================================
       * 纯净字标页脚
       * ==================================================================== */}
      <footer className="w-full border-t border-border/80 bg-background py-14 sm:py-20">
        <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-10">
          <div className="font-mono text-[clamp(3rem,12vw,10rem)] leading-[0.84] font-bold tracking-[-0.045em] text-foreground select-none">
            CASTDECK<span className="text-[#C42F16]">.</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4 font-mono text-xs text-muted-foreground">
            <span>KINPAKU &amp; VERMILION STUDIO · ALL-IN-ONE AI VISUAL WORKBENCH</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setAttributionOpen(true)}
                className="cursor-pointer font-sans text-xs text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
              >
                使用规范与素材来源
              </button>
              <span>© {CURRENT_YEAR} CASTDECK</span>
            </div>
          </div>
        </div>
      </footer>

      {attributionOpen && (
        <Suspense fallback={null}>
          <AttributionDialog open={attributionOpen} onOpenChange={setAttributionOpen} />
        </Suspense>
      )}
    </div>
  )
}
