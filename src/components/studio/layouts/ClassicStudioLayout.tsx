import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  DicesIcon,
  DownloadIcon,
  EyeIcon,
  ImagePlusIcon,
  ImagesIcon,
  InfoIcon,
  LayersIcon,
  LayoutGridIcon,
  LoaderCircleIcon,
  LogInIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
  WandSparklesIcon,
  WrenchIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { ArtistStageSelector } from '@/components/studio/ArtistSprite3D'
import { StylePresetSelector } from '@/components/studio/StylePresetSelector'
import {
  DarkroomExposureReveal,
  InteractiveRecipeFan,
} from '@/components/motion/TactileMotion'
import {
  KineticRollText,
  TactileHoldButton,
} from '@/components/motion/SignatureBlocks'
import {
  MechanicalCameraShutter,
  MechanicalRockerSwitch,
} from '@/components/motion/SkeuomorphicInstruments'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Textarea } from '@/components/ui/textarea'
import { STUDIO_ARTISTS } from '@/lib/artists'
import { MOTION_EASE_OUT } from '@/lib/motionTokens'
import { toast } from '@/lib/notifications'
import { downloadFileName } from '@/lib/recipeImages'
import {
  STUDIO_PROMPT_CHIP_GROUPS,
  rollAnalogInspirationPrompt,
  toggleSceneNoteChip,
} from '@/lib/studioPromptChips'
import { playBrassDialTick } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import {
  StudioAspectResolutionControls,
  StudioExtraRefsStrip,
  StudioGeneratePrimaryButton,
  StudioGeneratingAndFailedOverlay,
  StudioRecipeSlotsGrid,
  StudioSceneNoteEditor,
  StudioTextFallbackSwitch,
} from './StudioSharedParts'
import type { StudioLayoutProps } from './types'

function ClassicSplitLayout({
  isMobile,
  left,
  right,
}: {
  isMobile: boolean
  left: ReactNode
  right: ReactNode
}) {
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {left}
        {right}
      </div>
    )
  }
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 w-full flex-1 gap-0">
      <ResizablePanel defaultSize="45%" minSize="34%" className="flex h-full min-h-0 min-w-0 flex-col pr-2.5">
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="55%" minSize="34%" className="flex h-full min-h-0 min-w-0 flex-col pl-2.5">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export function ClassicStudioLayout({ s }: { s: StudioLayoutProps }) {
  const monitorRef = useRef<HTMLElement | null>(null)
  const prevGeneratingRef = useRef(false)
  const lastInspirationIndicesRef = useRef<[number, number, number] | undefined>(undefined)
  const inspirationSpinTimerRef = useRef<number | null>(null)
  const [inspirationSpinning, setInspirationSpinning] = useState(false)

  useEffect(() => {
    return () => {
      if (inspirationSpinTimerRef.current !== null) {
        window.clearTimeout(inspirationSpinTimerRef.current)
      }
    }
  }, [])

  const handleRollInspiration = () => {
    const previousPrompt = s.userPrompt
    const previousRemix = s.remixGallerySource
    const rolled = rollAnalogInspirationPrompt(lastInspirationIndicesRef.current)
    lastInspirationIndicesRef.current = rolled.indices

    playBrassDialTick()
    setInspirationSpinning(true)
    if (inspirationSpinTimerRef.current !== null) {
      window.clearTimeout(inspirationSpinTimerRef.current)
    }
    inspirationSpinTimerRef.current = window.setTimeout(() => {
      setInspirationSpinning(false)
      inspirationSpinTimerRef.current = null
    }, 360)

    s.setUserPrompt(rolled.prompt)
    s.setRemixGallerySource(null)

    if (previousPrompt.trim().length > 0) {
      toast.info(`已填入随机灵感：${rolled.summary}`, {
        duration: 4200,
        action: {
          label: '撤销',
          onClick: () => {
            s.setUserPrompt(previousPrompt)
            s.setRemixGallerySource(previousRemix)
          },
        },
      })
    } else {
      toast.info(`已填入随机灵感：${rolled.summary}`)
    }
  }

  // 移动端点击吸底生成按钮开始绘制时，自动平滑滚至暗房监视器，确保实时看到排队位次、进度条与小画家状态
  useEffect(() => {
    const isNowActive = s.showGeneratingState || s.showForegroundQueued
    if (s.isMobile && isNowActive && !prevGeneratingRef.current) {
      monitorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    prevGeneratingRef.current = isNowActive
  }, [s.isMobile, s.showGeneratingState, s.showForegroundQueued])

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-2 px-3 py-2 sm:px-6 md:min-h-0 md:overflow-hidden lg:px-8">
      {/* 顶部编辑部仪器顶栏（简洁中文工坊标题 + 实体双模式拨动开关） */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="hidden size-1.5 rounded-full bg-[#D9381E] sm:inline-block" />
            <h1 className="sr-only text-xs font-bold tracking-tight text-foreground sm:not-sr-only">
              合成工坊
            </h1>
          </div>

          <MechanicalRockerSwitch
            ariaLabel="切换创作模式"
            layoutId="classic-studio-mode-rocker"
            value={s.studioMode}
            onChange={(next) => s.setStudioMode(next)}
            options={[
              {
                id: 'prompt',
                label: '自由文生图',
                icon: <WandSparklesIcon className="size-3.5" />,
                ledColor: '#D9381E',
              },
              {
                id: 'recipe',
                label: '配方合图',
                icon: <LayersIcon className="size-3.5" />,
                ledColor: '#2DD4BF',
              },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!s.user && s.bootstrapLoaded && s.platform.allowRegistration && s.platform.registerBonusCredits > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => s.openAuthModal('register')}
              className="h-8 rounded-full border-border/90 bg-card/90 px-3 text-xs font-semibold"
            >
              <LogInIcon className="size-3.5 text-[#D9381E]" />
              <span>注册赠 {s.platform.registerBonusCredits} 积分</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={s.openLocalToolsModal}
            className="h-8 rounded-full border-border/90 bg-card/90 px-3 text-xs font-medium"
          >
            <WrenchIcon className="size-3.5 text-[#116E65] dark:text-[#4FD1C5]" />
            <span className="hidden sm:inline">本地图片工具</span>
          </Button>
          {(s.history.length > 0 || s.activeJobsCount > 0) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={s.openGalleryModal}
              className={cn(
                'h-8 rounded-full px-3 text-xs font-medium transition-colors',
                s.activeJobsCount > 0
                  ? 'border-[#E5A918]/70 bg-[#E5A918]/12 text-[#7A5200] hover:bg-[#E5A918]/18 dark:text-[#E5A918]'
                  : 'border-border/90 bg-card/90'
              )}
            >
              {s.activeJobsCount > 0 ? (
                <LoaderCircleIcon className="size-3.5 animate-spin text-[#B88300] dark:text-[#E5A918]" />
              ) : (
                <ImagesIcon className="size-3.5 text-[#E5A918]" />
              )}
              <span>作品集</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {s.history.length}
              </span>
              {s.activeBadgeLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E5A918]/20 px-1.5 py-0.5 text-xs font-bold leading-none text-[#7A5200] dark:text-[#F5C443]">
                  <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-[#D9381E] motion-reduce:animate-none" />
                  <span>{s.activeBadgeLabel}</span>
                </span>
              )}
            </Button>
          )}
          <button
            type="button"
            aria-label={s.studioMuted ? '开启工作台交互音效' : '静音工作台交互音效'}
            onClick={s.toggleStudioMute}
            className="relative flex size-8 cursor-pointer items-center justify-center rounded-full border border-border/90 bg-card/90 text-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] before:absolute before:-inset-1.5 before:content-[''] hover:border-foreground/35 active:scale-95"
          >
            {s.studioMuted ? <VolumeXIcon className="size-3.5 text-muted-foreground" /> : <Volume2Icon className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* 上区：文生图编辑部提示词稿纸 OR 三合一角色标本槽位 */}
      {s.studioMode === 'prompt' ? (
        <section className="shrink-0 space-y-2.5 rounded-[18px] border border-border/90 bg-card p-3 sm:p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold tracking-tight text-foreground">文生图稿纸</span>
              <Link
                to="/gallery"
                className="group inline-flex h-7 items-center gap-1 rounded-full border border-border/90 bg-secondary/50 px-3 text-xs font-semibold text-foreground transition-colors hover:border-foreground/35 hover:bg-secondary"
              >
                <ImagesIcon className="size-3.5 text-[#D9381E]" />
                <span>去灵感画廊挑提示词</span>
                <ArrowUpRightIcon className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <button
                type="button"
                onClick={handleRollInspiration}
                title="随机填入一条文生图灵感（覆盖已有内容时支持撤销）"
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-border/90 bg-secondary/50 px-3 text-xs font-semibold text-foreground transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-foreground/35 hover:bg-secondary active:scale-95"
              >
                <DicesIcon
                  className={cn(
                    'size-3.5 text-[#B88300] dark:text-[#E5A918]',
                    inspirationSpinning && 'animate-spin motion-reduce:animate-none'
                  )}
                />
                <span>随机灵感</span>
              </button>
              {s.userPrompt.trim().length > 0 && (
                <TactileHoldButton
                  label="长按清空"
                  holdingLabel="松开取消…"
                  icon={<Trash2Icon className="size-3.5" />}
                  onConfirm={() => {
                    s.setUserPrompt('')
                    s.setRemixGallerySource(null)
                  }}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {s.remixGallerySource && (
                <span className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-[#19857B]/35 bg-[#19857B]/10 px-2.5 py-0.5 text-xs font-semibold text-[#116E65] dark:text-[#4FD1C5]">
                  <SparklesIcon className="size-3 shrink-0" />
                  <span className="truncate">同款灵感：{s.remixGallerySource.title}</span>
                  <button
                    type="button"
                    aria-label="清除同款来源标记"
                    onClick={() => s.setRemixGallerySource(null)}
                    className="cursor-pointer rounded-full p-0.5 hover:bg-foreground/10"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              )}
              <span className="font-mono tabular-nums">{s.userPrompt.length}/3000</span>
              <span className="hidden font-mono sm:inline">⌘/Ctrl+Enter</span>
            </div>
          </div>

          <Textarea
            id="studio-t2i-prompt"
            aria-label="文生图提示词"
            rows={3}
            maxLength={3000}
            value={s.userPrompt}
            onChange={(e) => s.setUserPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                (e.metaKey || e.ctrlKey) &&
                e.key === 'Enter' &&
                s.hydrated &&
                !s.showGeneratingState &&
                !s.userQueueFull &&
                s.uploadingSlot === null
              ) {
                e.preventDefault()
                s.handleGenerate()
              }
            }}
            placeholder="输入中/英文画面描述（支持直接粘贴灵感画廊或 X 博主分享的提示词）…"
            className="min-h-[88px] max-h-[168px] resize-y rounded-xl border-border/80 bg-secondary/40 text-xs leading-relaxed sm:text-sm"
          />

          <div className="ed-fade-mask-x no-scrollbar flex items-center gap-1.5 overflow-x-auto pr-8">
            <span className="shrink-0 font-mono text-xs text-muted-foreground">点缀</span>
            {STUDIO_PROMPT_CHIP_GROUPS.filter((g) => g.id !== 'refine')
              .flatMap((g) => g.chips.slice(0, 2))
              .map((chip) => {
              const active = s.userPrompt.includes(chip.text)
              return (
                <button
                  key={`classic-t2i-${chip.label}`}
                  type="button"
                  onClick={() => s.setUserPrompt((prev) => toggleSceneNoteChip(prev, chip.text).next)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'border-[#D9381E]/55 bg-[#D9381E]/10 text-[#D9381E]'
                      : 'border-border/80 bg-secondary/45 text-foreground hover:border-foreground/35'
                  )}
                >
                  + {chip.label}
                </button>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="shrink-0 border-b border-border/80 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-extrabold tracking-tight text-foreground">角色配方</span>
              <button
                type="button"
                disabled={s.randomizingAll}
                onClick={() => void s.handleRandom()}
                className="group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border/90 bg-secondary/50 px-2.5 text-xs font-semibold text-foreground transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/35 hover:bg-secondary active:scale-[0.97] disabled:opacity-50"
              >
                <motion.span
                  key={s.allDiceSpin}
                  animate={{ rotate: s.allDiceSpin ? 360 : 0 }}
                  transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
                  className="inline-flex items-center"
                >
                  <DicesIcon className={cn('size-3.5 text-[#D9381E]', s.randomizingAll && 'animate-spin')} />
                </motion.span>
                <KineticRollText text="全随机盲抽" />
              </button>
              {s.hasAnyRef && (
                <>
                  <button
                    type="button"
                    onClick={s.handleOpenStitchModal}
                    className="group inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-border/80 bg-card px-2.5 text-xs font-medium text-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-foreground/35 active:scale-[0.97]"
                  >
                    <LayoutGridIcon className="size-3.5" />
                    <KineticRollText text="拼图" />
                  </button>
                  <TactileHoldButton
                    label="长按清空"
                    holdingLabel="清空中…"
                    icon={<Trash2Icon className="size-3.5" />}
                    onConfirm={s.clearRecipe}
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums">
              <span>配方槽位</span>
              <span className="font-bold text-foreground">{s.coreCount}/3</span>
              {s.extraImages.length > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span>+{s.extraImages.length} 附图</span>
                </>
              )}
            </div>
          </div>

          <StudioRecipeSlotsGrid s={s} cardVariant="default" />
          <StudioExtraRefsStrip s={s} className="mt-1.5" />
        </section>
      )}

      {/* 下区：左建筑细线控制台 + 右博物馆装裱取景器 */}
      <ClassicSplitLayout
        isMobile={s.isMobile}
        left={
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <section className="@container/controls flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-border/90 bg-card">
              <div className="relative min-h-0 flex-1 divide-y divide-border/75 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-1.5">
                {/* 01 · AI小画家与实体画笔 */}
                <div className="space-y-1.5 py-1.5 first:pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">
                      AI小画家
                    </span>
                    <span className="text-xs text-muted-foreground">点选精灵与画笔</span>
                  </div>
                  <ArtistStageSelector
                    artists={STUDIO_ARTISTS}
                    providers={s.providers}
                    providersLoaded={s.providersLoaded}
                    selectedProvider={s.selectedProvider}
                    selectedProfileId={s.activeProfile?.profileId ?? null}
                    selectedProfileByProvider={s.selectedProfileByProvider}
                    activeBrushColorHex={s.activeBrushPalette?.hex}
                    activeBrushGlowHex={s.activeBrushPalette?.glowHex}
                    brushReactionTick={s.artistReturnTick}
                    generatingProviderId={s.showGeneratingState ? s.runningArtistId : null}
                    awayProviderIds={s.awayProviderIds}
                    frustratedAwayProviderId={s.frustratedAwayProviderId}
                    onSelectProvider={(providerId) => s.setSelectedProvider(providerId)}
                    onSelectProfile={(providerId, profileId) =>
                      s.setSelectedProfileForProvider(providerId, profileId)
                    }
                  />
                </div>

                {/* 02 · 成图画风 */}
                <div className="py-1.5">
                  <StylePresetSelector
                    value={s.stylePreset}
                    allowFaceStyleShift={s.allowFaceStyleShift}
                    allowPoseStyleShift={s.allowPoseStyleShift}
                    onChange={s.setStylePreset}
                    onAllowFaceStyleShiftChange={s.setAllowFaceStyleShift}
                    onAllowPoseStyleShiftChange={s.setAllowPoseStyleShift}
                    onOpenBrowser={s.openStylePicker}
                    collapsible={s.studioMode === 'prompt'}
                    enabled={s.studioMode === 'prompt' ? s.promptStyleEnabled : true}
                    onEnabledChange={s.studioMode === 'prompt' ? s.setPromptStyleEnabled : undefined}
                    showReferenceLocks={s.studioMode === 'recipe'}
                  />
                </div>

                {/* 03 · 画幅比例（配物理形变取景框）与清晰度 */}
                <div className="py-1.5">
                  <StudioAspectResolutionControls
                    s={s}
                    showMorphPreview
                    compactMorph
                    layoutIdPrefix="classic"
                  />
                </div>

                {/* 04 · 画面细节（仅配方模式） */}
                {s.studioMode === 'recipe' && (
                  <div className="py-1.5">
                    <StudioSceneNoteEditor s={s} rows={2} />
                  </div>
                )}

                {/* 桌面端左栏底部柔光滚屏渐隐提示 */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none sticky inset-x-0 -bottom-1.5 z-10 hidden h-5 bg-gradient-to-t from-card via-card/75 to-transparent md:block"
                />
              </div>

              {/* 桌面端吸底生成发射区（唯一显示积分的位置） */}
              {!s.isMobile && (
                <div className="shrink-0 space-y-1.5 border-t border-border/80 bg-card/95 px-3 py-2">
                  <StudioTextFallbackSwitch s={s} layoutIdPrefix="classic" />
                  <StudioGeneratePrimaryButton s={s} className="ks-keycap" />
                </div>
              )}
            </section>
          </div>
        }
        right={
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <section
              ref={monitorRef}
              className="dark ks-obsidian-stage relative flex min-h-[380px] flex-1 scroll-mt-16 flex-col overflow-hidden rounded-[20px] p-3 text-[#F5F1E8] md:min-h-0"
            >
              {/* 顶部金箔高光细线 */}
              <span aria-hidden="true" className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1.5px]" />

              {/* 极简黑金光学顶栏 */}
              <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold tracking-tight text-[#F5C443]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      s.showGeneratingState
                        ? 'animate-pulse bg-[#E5A918] motion-reduce:animate-none'
                        : s.previewUrl
                          ? 'bg-[#2DD4BF]'
                          : 'bg-[#D9381E]'
                    )}
                  />
                  <span>暗房监视器</span>
                  <span className="hidden font-mono text-xs font-medium text-[#9C9486] sm:inline">VIEWFINDER</span>
                </div>

                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums',
                    s.showGeneratingState
                      ? 'border-[#E5A918]/45 bg-[#E5A918]/15 text-[#F5C443]'
                      : s.generationError
                        ? 'border-destructive/50 bg-destructive/20 text-[#FF8A80]'
                        : s.previewUrl
                          ? 'border-[#2DD4BF]/40 bg-[#19857B]/20 text-[#5EEAD4]'
                          : 'border-white/15 bg-white/[0.06] text-[#C8C0B2]'
                  )}
                >
                  {s.showForegroundQueued
                    ? `QUEUE #${s.foregroundJob?.queueInfo?.position ?? 1}`
                    : s.showGeneratingState
                      ? `RENDERING · ${s.elapsedSeconds}s`
                      : s.generationError
                        ? 'FAILED'
                        : s.previewUrl
                          ? `${s.previewResult?.resolution ? `${s.previewResult.resolution} · ` : ''}READY`
                          : 'STANDBY'}
                </span>
              </div>

              {/* 黑曜石光学主取景视窗（纯内陷暗房光池 + 徕卡四角取景标线，无嵌套卡片边框与网格平铺） */}
              <div
                data-impeccable-ignore="nested-cards"
                className="relative flex h-[350px] items-center justify-center overflow-hidden rounded-[14px] bg-[#0B0A09] p-3 shadow-[inset_0_2px_22px_rgba(0,0,0,0.85)] sm:h-[400px] md:h-auto md:min-h-0 md:flex-1"
                style={{
                  backgroundImage:
                    'radial-gradient(78% 62% at 50% 42%, rgba(229,169,24,0.11) 0%, rgba(217,56,30,0.04) 46%, transparent 74%)',
                }}
              >
                {/* 8 叶片徕卡金属快门光圈（按下生成即刻机械开合） */}
                <MechanicalCameraShutter triggerTick={s.shutterTick} />

                {/* 金箔光学四角取景标线与极细光学准星 */}
                <span aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-4 border-t-2 border-l-2 border-[#E5A918]/55" />
                <span aria-hidden="true" className="pointer-events-none absolute top-3 right-3 size-4 border-t-2 border-r-2 border-[#E5A918]/55" />
                <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 size-4 border-b-2 border-l-2 border-[#E5A918]/55" />
                <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 size-4 border-r-2 border-b-2 border-[#E5A918]/55" />
                <span aria-hidden="true" className="pointer-events-none absolute top-3 left-1/2 h-2 w-px -translate-x-1/2 bg-[#E5A918]/30" />
                <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 h-2 w-px -translate-x-1/2 bg-[#E5A918]/30" />

                <StudioGeneratingAndFailedOverlay s={s} surface="darkroom" />

                {!s.showGeneratingState && !s.showFailedStage && s.previewUrl ? (
                  <>
                    <div className="absolute inset-3 bottom-14">
                      <DarkroomExposureReveal
                        previewUrl={s.previewUrl}
                        hiddenForDelivery={s.showDeliveryScene}
                        skipIntro={s.skipResultIntro}
                        onImageReady={() => s.setResultImgLoadedUrl(s.previewUrl)}
                        onZoom={() => s.setZoomImageUrl(s.previewUrl)}
                        variant="darkroom"
                      />
                    </div>

                    {/* 黑金悬浮磨砂操作胶囊 */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: MOTION_EASE_OUT }}
                      className="absolute bottom-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-1 rounded-full border border-white/15 bg-[#171614]/88 px-2 py-1 text-[#F5F1E8] shadow-[0_14px_34px_rgba(0,0,0,0.65)] backdrop-blur-xl"
                    >
                      {s.previewResult && (
                        <>
                          <button
                            type="button"
                            onClick={() => s.setShareGalleryJob(s.previewResult!)}
                            className="group skin-accent-btn inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold transition"
                          >
                            <Share2Icon className="size-3.5" />
                            <KineticRollText text="分享画廊" />
                          </button>
                          <button
                            type="button"
                            onClick={() => s.setDetailWorkItem(s.previewResult!)}
                            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[#EAE4D7] transition-colors hover:bg-white/12 hover:text-white"
                          >
                            <InfoIcon className="size-3.5" />
                            <span>详情</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => s.handleUseImageAsExtraRef(s.previewResult!)}
                            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[#EAE4D7] transition-colors hover:bg-white/12 hover:text-white"
                          >
                            <ImagePlusIcon className="size-3.5 text-[#4FD1C5]" />
                            <span className="hidden sm:inline">设为附图</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => s.setComparisonResult(s.previewResult!)}
                            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[#EAE4D7] transition-colors hover:bg-white/12 hover:text-white"
                          >
                            <EyeIcon className="size-3.5" />
                            <span>对比</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => s.setZoomImageUrl(s.previewUrl)}
                        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[#EAE4D7] transition-colors hover:bg-white/12 hover:text-white"
                      >
                        <ZoomInIcon className="size-3.5" />
                        <span>大图</span>
                      </button>
                      <a
                        href={s.previewUrl}
                        download={downloadFileName('character', s.previewUrl)}
                        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[#EAE4D7] transition-colors hover:bg-white/12 hover:text-white"
                      >
                        <DownloadIcon className="size-3.5" />
                        <span>下载</span>
                      </a>
                    </motion.div>
                  </>
                ) : !s.showGeneratingState && !s.showFailedStage ? (
                  s.studioMode === 'prompt' ? (
                    /* 文生图专属暗房镜头待命舞台（告别配方卡占位，真正把文生图当头等公民） */
                    <div className="relative flex w-full max-w-md flex-col items-center gap-4 text-center">
                      <div className="relative flex items-center justify-center gap-4">
                        <div className="relative flex size-28 items-center justify-center rounded-full border border-[#E5A918]/45 bg-gradient-to-br from-[#23201B] via-[#12110F] to-[#0B0A09] shadow-[inset_0_2px_14px_rgba(0,0,0,0.85),0_14px_34px_rgba(0,0,0,0.6)]">
                          <span aria-hidden="true" className="size-20 rounded-full border border-dashed border-[#E5A918]/35" />
                          <span aria-hidden="true" className="absolute size-11 rounded-full border border-white/15 bg-gradient-to-tr from-[#D9381E]/25 via-transparent to-[#E5A918]/30" />
                          <WandSparklesIcon className="absolute size-6 text-[#F5C443]" />
                        </div>

                        <div aria-hidden="true" className="relative flex w-8 shrink-0 items-center justify-center">
                          <div className="h-[1px] w-full border-t border-dashed border-[#E5A918]/45" />
                          <motion.span
                            animate={{ x: [-14, 14], opacity: [0, 1, 0] }}
                            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute size-2 rounded-full bg-[#E5A918] shadow-[0_0_10px_#E5A918]"
                          />
                          <ArrowRightIcon className="relative z-10 size-3.5 rounded-full bg-[#0D0C0B] text-[#E5A918]" />
                        </div>

                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.05, y: -4 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                          onClick={() => s.openStylePicker('all')}
                          aria-label={
                            s.promptStyleEnabled
                              ? `更换风格（当前：${s.viewfinderStyleLabel}）`
                              : '风格未启用，点击打开画风图鉴选用风格'
                          }
                          className={cn(
                            'group relative flex h-[126px] w-[96px] shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl transition-colors',
                            s.promptStyleEnabled
                              ? 'border-2 border-[#E5A918]/75 bg-[#1C1A17] shadow-[0_18px_40px_rgba(0,0,0,0.65)]'
                              : 'border border-dashed border-white/25 bg-white/[0.03] hover:border-[#E5A918]/55'
                          )}
                        >
                          {s.promptStyleEnabled && s.styleVisual.preview ? (
                            <>
                              <img
                                src={s.styleVisual.preview}
                                alt={s.viewfinderStyleLabel}
                                className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                              />
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2 pt-5 pb-1.5 text-center">
                                <span className="block truncate text-xs font-bold text-[#F5C443]">
                                  {s.styleVisual.shortLabel}
                                </span>
                              </div>
                            </>
                          ) : s.promptStyleEnabled ? (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.04] p-2 text-center">
                              <WandSparklesIcon className="size-5 text-[#E5A918]" />
                              <span className="text-xs font-bold text-[#F5F1E8]">
                                {s.styleVisual.shortLabel}
                              </span>
                            </div>
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center">
                              <LayersIcon className="size-5 text-[#B5ADA0] transition-colors group-hover:text-[#E5A918]" />
                              <span className="text-xs font-semibold text-[#C8C0B2]">
                                风格未启用
                              </span>
                              <span className="text-xs text-[#8E877B]">点击选用</span>
                            </div>
                          )}
                        </motion.button>
                      </div>

                      <div className="w-full space-y-1.5 px-2">
                        <div className="font-mono text-xs font-bold text-[#F5F1E8] sm:text-sm">
                          <span className="text-[#F5C443]">文生图光学暗房</span>
                          <span className="mx-1.5 text-white/30">·</span>
                          <span>{s.promptAspectRatioEnabled ? s.aspectRatio : '自动画幅'}</span>
                          {s.activeResolution ? ` · ${s.activeResolution}` : ''}
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-[#B5ADA0]">
                          {s.userPrompt.trim()
                            ? `「${s.userPrompt.trim()}」`
                            : '在上方输入画面描述，或点击「随机灵感」/ 去灵感画廊挑词，按下快门即刻显影'}
                        </p>
                      </div>
                    </div>
                  ) : (
                  /* 配方合图待命舞台：暗房聚光下的 3D 扇形卡组 + 动态金红脉冲光轨 + 金箔画风卡 */
                  <div className="relative flex w-full max-w-md flex-col items-center gap-4 text-center">
                    <div className="relative flex max-w-full items-center justify-center gap-3 sm:gap-5">
                      <InteractiveRecipeFan
                        cards={s.recipeFanCards.map((c) => ({
                          ...c,
                          onClick: () => {
                            if (c.imageUrl) s.setZoomImageUrl(c.imageUrl)
                          },
                        }))}
                        shuffleTick={s.allDiceSpin}
                        variant="darkroom"
                        size="md"
                      />

                      {/* 动态脉冲金红光轨连接器 */}
                      <div aria-hidden="true" className="relative flex w-8 shrink-0 items-center justify-center sm:w-12">
                        <div className="h-[1px] w-full border-t border-dashed border-[#E5A918]/45" />
                        <motion.span
                          animate={{ x: [-16, 16], opacity: [0, 1, 0] }}
                          transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute size-2 rounded-full bg-[#E5A918] shadow-[0_0_10px_#E5A918]"
                        />
                        <ArrowRightIcon className="relative z-10 size-3.5 rounded-full bg-[#0D0C0B] text-[#E5A918]" />
                      </div>

                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05, y: -4 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                        onClick={() => s.openStylePicker('all')}
                        aria-label={`更换风格（当前：${s.viewfinderStyleLabel}）`}
                        className="group relative flex h-[130px] w-[98px] shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-[#E5A918]/75 bg-[#1C1A17] shadow-[0_18px_40px_rgba(0,0,0,0.65)]"
                      >
                        {s.styleVisual.preview ? (
                          <>
                            <img
                              src={s.styleVisual.preview}
                              alt={s.viewfinderStyleLabel}
                              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2 pt-5 pb-1.5 text-center">
                              <span className="block truncate text-xs font-bold text-[#F5C443]">
                                {s.styleVisual.shortLabel}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.04] p-2 text-center">
                            <WandSparklesIcon className="size-5 text-[#E5A918]" />
                            <span className="text-xs font-bold text-[#F5F1E8]">
                              {s.styleVisual.shortLabel}
                            </span>
                          </div>
                        )}
                      </motion.button>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-[#F5F1E8] sm:text-sm">
                        <span className="text-[#F5C443]">{s.styleVisual.shortLabel}</span>
                        <span className="mx-1.5 text-white/30">·</span>
                        <span>{s.aspectRatio}</span>
                        {s.activeResolution ? ` · ${s.activeResolution}` : ''}
                      </div>
                      {s.styleVisual.tagline && (
                        <p className="text-xs text-[#B5ADA0]">{s.styleVisual.tagline}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                      {[
                        {
                          label: s.recipe.pose
                            ? `姿势(${s.recipe.pose.角度 ? `${s.recipe.pose.角度}·` : ''}${s.recipe.pose.useDepth ? '深度' : '白模'})`
                            : '姿势',
                          to: '/poses' as const,
                          ok: Boolean(s.recipe.pose),
                        },
                        { label: '服装', to: '/costumes' as const, ok: Boolean(s.recipe.costume) },
                        { label: '人像', to: '/portraits' as const, ok: Boolean(s.recipe.portrait) },
                      ].map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors',
                            item.ok
                              ? 'border-[#2DD4BF]/40 bg-[#19857B]/20 text-[#5EEAD4]'
                              : 'border-white/15 bg-white/[0.05] text-[#B5ADA0] hover:border-white/35 hover:text-white'
                          )}
                        >
                          {item.ok && <CheckCircle2Icon className="size-3" />}
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  )
                ) : null}
              </div>

              {/* FinalLap 式黑金编号底片胶片条（01 02 03…） */}
              {s.recentHistory.length > 0 && (
                <div className="mt-2.5 flex shrink-0 items-center gap-2 border-t border-white/10 pt-2.5">
                  <div className="ed-fade-mask-x no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-6">
                    {s.recentHistory.map((h, idx) => {
                      const active = h.imageUrl === s.previewUrl
                      return (
                        <motion.button
                          key={h.id}
                          type="button"
                          whileHover={{ y: -3, scale: 1.04 }}
                          whileTap={{ scale: 0.95 }}
                          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                          aria-label={`切换到成图：${h.recipeSummary}`}
                          onClick={() => s.selectHistoryPreview(h)}
                          className={cn(
                            'group relative h-14 w-11 shrink-0 cursor-pointer overflow-hidden rounded-[8px] border transition-colors',
                            active
                              ? 'border-[#E5A918] ring-2 ring-[#E5A918]/50'
                              : 'border-white/15 opacity-70 hover:opacity-100'
                          )}
                        >
                          <img src={h.imageUrl} alt={h.recipeSummary} className="h-full w-full object-cover" />
                          <span
                            className={cn(
                              'pointer-events-none absolute top-0.5 left-0.5 rounded px-1 font-mono text-xs font-bold leading-none',
                              active ? 'bg-[#D9381E] text-white' : 'bg-black/70 text-[#E5A918]'
                            )}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={s.openGalleryModal}
                    className="group inline-flex h-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-[10px] border border-white/15 bg-white/[0.06] px-3 text-xs font-semibold text-[#F5F1E8] transition-colors hover:border-[#E5A918]/50 hover:bg-white/[0.12]"
                  >
                    <span className="font-mono text-xs font-bold tabular-nums text-[#F5C443]">
                      {s.history.length}
                    </span>
                    <span className="text-xs text-[#C8C0B2]">全部</span>
                  </button>
                </div>
              )}
            </section>
          </div>
        }
      />

      {/* 移动端吸底主生成发射区（单手拇指随时可达，带安全区底部留白，z-40 确保永不被卡片轮盘遮挡） */}
      {s.isMobile && (
        <div className="sticky bottom-0 z-40 -mx-3 mt-1 space-y-1.5 border-t border-border/90 bg-card/95 px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-lg">
          <StudioTextFallbackSwitch s={s} layoutIdPrefix="classic-mobile" />
          <StudioGeneratePrimaryButton s={s} className="ks-keycap" />
        </div>
      )}
    </div>
  )
}
