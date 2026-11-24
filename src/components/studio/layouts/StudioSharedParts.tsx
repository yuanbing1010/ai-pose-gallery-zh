import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClockIcon,
  CoinsIcon,
  DicesIcon,
  FileTextIcon,
  GripVerticalIcon,
  HelpCircleIcon,
  ImageIcon,
  ImagePlusIcon,
  LinkIcon,
  LoaderCircleIcon,
  LockIcon,
  LockOpenIcon,
  LogInIcon,
  PersonStandingIcon,
  RotateCcwIcon,
  ShirtIcon,
  ShuffleIcon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
  WandSparklesIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import { GeneratingSpriteStage } from '@/components/studio/ArtistSprite3D'
import { AspectRatioLogo } from '@/components/studio/StudioEmblems'
import { VisualAspectMorphCard } from '@/components/motion/TactileMotion'
import { KineticRollText } from '@/components/motion/SignatureBlocks'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { STUDIO_ASPECT_RATIOS } from '@/lib/artists'
import { isContainCostumeSource, selectCostumeView } from '@/lib/costumeSources'
import { MOTION_EASE_OUT } from '@/lib/motionTokens'
import type { RandomScope, ReferenceSlot } from '@/lib/randomRecipe'
import { hasPoseDepthMap, poseImagePath, poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { STUDIO_PROMPT_CHIP_GROUPS, toggleSceneNoteChip } from '@/lib/studioPromptChips'
import { playBrassDialTick, playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { STUDIO_RESOLUTION_META } from '../../../../shared/studio'
import type { StudioLayoutProps } from './types'

/* ============================================================================
 * 1. 生成主按钮（全工作台唯一允许展示积分消耗的位置）
 * ============================================================================ */

export function StudioGeneratePrimaryButton({
  s,
  compact = false,
  className,
}: {
  s: StudioLayoutProps
  compact?: boolean
  className?: string
}) {
  const disabled =
    !s.hydrated ||
    s.showGeneratingState ||
    s.userQueueFull ||
    s.uploadingSlot !== null ||
    (Boolean(s.user) && !s.activeProviderReady)

  const actionVerb =
    s.studioMode === 'prompt'
      ? '文生图'
      : s.effectiveTextToImageMode
        ? '图转文生图'
        : '立即生成'

  return (
    <div className={compact ? 'shrink-0' : 'w-full'}>
      <Button
        type="button"
        onClick={() => s.handleGenerate()}
        disabled={disabled}
        className={cn(
          'group relative overflow-hidden border-0 font-bold tracking-tight transition-[transform,opacity] duration-150',
          compact
            ? 'h-10 rounded-full py-1 pr-1.5 pl-4 text-xs sm:text-sm'
            : 'h-11 w-full justify-between rounded-full py-1.5 pr-1.5 pl-5 text-sm',
          s.insufficientCredits
            ? 'bg-amber-600 text-white hover:bg-amber-700'
            : 'skin-accent-btn',
          className
        )}
      >
        {!disabled && !s.insufficientCredits && (
          <span
            aria-hidden="true"
            className="ks-cta-glint pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-transparent via-white/35 to-transparent"
          />
        )}
        <span className="relative z-10 flex min-w-0 items-center gap-2">
          {s.showForegroundQueued ? (
            <>
              <ClockIcon className="size-4 shrink-0" />
              <span className="truncate">排队中（第 {s.foregroundJob?.queueInfo?.position ?? 1} 位）…</span>
            </>
          ) : s.showGeneratingState ? (
            <>
              <LoaderCircleIcon className="size-4 shrink-0 animate-spin" />
              <span className="truncate">{compact ? '创作中…' : 'AI小画家正在创作中…'}</span>
            </>
          ) : s.userQueueFull ? (
            <>
              <ClockIcon className="size-4 shrink-0" />
              <span className="truncate">
                {compact
                  ? '队列已满'
                  : `并发队列已满（绘制 ${s.processingJobsCount} · 排队 ${s.queuedJobsCount}）`}
              </span>
            </>
          ) : !s.user ? (
            <>
              <LogInIcon className="size-4 shrink-0" />
              <span className="truncate">
                {s.providersLoaded && s.activeProviderReady
                  ? compact
                    ? `登录生成 · ${s.activeCost} 积分`
                    : `登录后${actionVerb} · 消耗 ${s.activeCost} 积分`
                  : `登录后${actionVerb}`}
              </span>
            </>
          ) : !s.activeProviderReady ? (
            <>
              <CircleAlertIcon className="size-4 shrink-0" />
              <span className="truncate">{compact ? '画笔暂休' : '这位AI小画家暂休中，换支画笔试试！'}</span>
            </>
          ) : s.insufficientCredits ? (
            <>
              <CoinsIcon className="size-4 shrink-0" />
              <span className="truncate">
                {compact
                  ? `积分不足（需 ${s.activeCost}）`
                  : `积分不足（需 ${s.activeCost} / 剩 ${s.user.creditBalance}）· 兑换积分`}
              </span>
            </>
          ) : s.studioMode === 'recipe' && s.effectiveTextToImageMode ? (
            <>
              <FileTextIcon className="size-4 shrink-0" />
              <KineticRollText
                text={compact ? `图转文 · ${s.activeCost} 积分` : `图转文生图 · 消耗 ${s.activeCost} 积分`}
                className="truncate"
              />
            </>
          ) : (
            <>
              <SparklesIcon className="size-4 shrink-0" />
              <KineticRollText
                text={
                  compact
                    ? `${actionVerb} · ${s.activeCost} 积分`
                    : s.studioMode === 'prompt'
                      ? `立即文生图 · 消耗 ${s.activeCost} 积分`
                      : `立即生成角色图 · 消耗 ${s.activeCost} 积分`
                }
                className="truncate"
              />
            </>
          )}
        </span>

        {/* Landingly / FinalLap 式内嵌圆形触发徽章 */}
        <span
          aria-hidden="true"
          className="ml-2 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        >
          {s.showGeneratingState ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <ArrowUpRightIcon className="size-4" />
          )}
        </span>
      </Button>
    </div>
  )
}

/* ============================================================================
 * 2. 生成中 / 排队中 / 失败 / 交付舞台（共用 3D 小画家舞台，跨主题无缝联动）
 * ============================================================================ */

export function StudioGeneratingAndFailedOverlay({
  s,
  surface = 'default',
}: {
  s: StudioLayoutProps
  surface?: 'default' | 'darkroom' | 'lookbook'
}) {
  const prefersReduced = useReducedMotion()
  if (!s.showGeneratingState && !s.showDeliveryScene && !s.showFailedStage) {
    return null
  }

  return (
    <div
      className={cn(
        'relative z-10 flex w-full flex-col items-center text-center',
        surface === 'darkroom' && 'dark text-[#F5F1E8]',
        s.showFailedStage
          ? 'max-h-full max-w-md gap-2 overflow-y-auto px-2 py-1'
          : 'max-w-sm gap-3'
      )}
    >
      <GeneratingSpriteStage
        providerId={
          s.deliveryState
            ? s.deliveryState.providerId
            : s.showFailedStage && s.failedStageArtist
              ? s.failedStageArtist.providerId
              : s.runningArtistId
        }
        brushColorHex={
          s.deliveryState
            ? s.deliveryState.brushHex
            : s.showFailedStage && s.failedStageArtist
              ? s.failedStageArtist.brushHex
              : s.runningBrushColorHex
        }
        brushGlowHex={
          s.deliveryState
            ? s.deliveryState.brushGlow
            : s.showFailedStage && s.failedStageArtist
              ? s.failedStageArtist.brushGlow
              : s.runningBrushGlowHex
        }
        stagePhase={
          s.deliveryState?.phase === 'cheering'
            ? 'cheering'
            : s.deliveryState?.phase === 'throwing'
              ? 'returning'
              : s.showFailedStage
                ? 'frustrated'
                : s.isEnteringMonitor
                  ? 'entering'
                  : s.showForegroundQueued
                    ? 'queued'
                    : 'working'
        }
        previewImageUrl={s.deliveryState?.imageUrl}
        reactionTick={s.stageResumeTick}
      />

      {s.showForegroundQueued && s.foregroundJob ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'w-full space-y-2.5 rounded-2xl border p-3.5 text-center',
            surface === 'darkroom'
              ? 'border-white/15 bg-zinc-900/90 backdrop-blur-xl'
              : 'border-[#E5A918]/45 bg-card/95 shadow-sm'
          )}
        >
          <div className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-foreground">
            <ClockIcon className="size-4 text-[#B88300] dark:text-[#E5A918]" />
            <span>排队等待中 · 第 {s.foregroundJob.queueInfo?.position ?? 1} 位</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {s.foregroundJob.queueInfo
              ? `前面还有 ${s.foregroundJob.queueInfo.aheadCount} 个任务 · ${
                  s.foregroundJob.queueInfo.reason === 'model_busy'
                    ? `当前画笔并发已满${
                        s.foregroundJob.queueInfo.modelAheadCount > 0
                          ? `（同画笔前有 ${s.foregroundJob.queueInfo.modelAheadCount} 个）`
                          : ''
                      }`
                    : s.foregroundJob.queueInfo.reason === 'user_busy'
                      ? '您同时绘制的任务数已达上限'
                      : '当前全站生图并发较高'
                }`
              : '正在等待空闲并发槽位，轮到后将自动开画…'}
          </p>
          <div className="relative h-1.5 overflow-hidden rounded-full border border-border bg-background">
            {!prefersReduced ? (
              <motion.div
                aria-hidden="true"
                animate={{ x: ['-40%', '220%'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                className="h-full w-1/3 rounded-full bg-[#E5A918]/75"
              />
            ) : (
              <div aria-hidden="true" className="h-full w-1/2 rounded-full bg-[#E5A918]/60" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
            <span className="font-mono text-muted-foreground">已等待 {s.elapsedSeconds}s</span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={s.isForegroundCancelling}
                onClick={() => void s.handleCancelForegroundQueued()}
                className="h-7 rounded-full border-destructive/40 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                {s.isForegroundCancelling
                  ? '取消中…'
                  : `取消排队（退 ${s.foregroundJob.creditsCost} 积分）`}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={s.handleMoveToBackground}
                title="先放进后台排队，按钮立即解锁可继续创作下一张"
                className="h-7 rounded-full px-2.5 text-xs font-semibold"
              >
                后台排队
              </Button>
            </div>
          </div>
        </div>
      ) : s.showGeneratingState ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'w-full space-y-2.5 rounded-2xl p-3',
            surface === 'darkroom' && 'border border-white/10 bg-zinc-900/75 backdrop-blur-xl',
            surface === 'lookbook' && 'bg-card/90 shadow-sm backdrop-blur-md'
          )}
        >
          <div className="text-sm font-bold text-foreground">AI小画家正在绘图中</div>
          <div className="space-y-1.5">
            <div className="relative h-2 overflow-hidden rounded-full border border-border bg-card">
              <div
                className="h-full w-full origin-left bg-[var(--skin-accent)] transition-transform duration-300 ease-[var(--ease-out)]"
                style={{ transform: `scaleX(${Math.max(0, Math.min(100, s.barWidth)) / 100})` }}
              />
              {s.isDrawingStage && !prefersReduced && (
                <motion.div
                  aria-hidden="true"
                  animate={{ x: ['-40%', '220%'] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                />
              )}
            </div>
            <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>
                {s.liveStage === 'transcribing_refs'
                  ? '正在将参考图转为文字…'
                  : s.liveStage === 'text_generating'
                    ? '纯文生图绘制中…'
                    : s.liveStage === 'downloading_output'
                      ? '获取原图中…'
                      : s.liveStageOrder === 0
                        ? '准备素材中…'
                        : s.liveStageOrder === 1
                          ? '绘制中…'
                          : '保存成图中…'}
              </span>
              <div className="flex items-center gap-2">
                <span>{s.elapsedSeconds}s</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={s.activeCloudJobId ? s.handleMoveToBackground : s.handleCancelBeforeJob}
                  title={
                    s.activeCloudJobId
                      ? '收起绘制界面转入后台继续画，可立即发起下一个任务，完成后自动通知入库'
                      : '取消本次上传与生成请求'
                  }
                  className="h-6 rounded-full px-2.5 font-sans text-xs"
                >
                  {s.activeCloudJobId ? '后台绘制' : '取消'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : s.showFailedStage ? (
        <div role="alert" className="w-full space-y-2.5 rounded-2xl border border-destructive/30 bg-card/95 p-3.5 text-center shadow-sm">
          <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-destructive">
            <CircleAlertIcon className="size-4 shrink-0" />
            <span>生成失败（已自动退还积分）</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{s.generationError}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
            <Button
              type="button"
              size="sm"
              disabled={s.showGeneratingState || s.userQueueFull || (Boolean(s.user) && !s.activeProviderReady)}
              className="skin-accent-btn rounded-full text-xs font-bold"
              onClick={() => s.handleGenerate()}
            >
              <RotateCcwIcon className="size-3.5" />
              重试生成
            </Button>
            {s.studioMode === 'recipe' &&
              s.textFallbackFeatureEnabled &&
              s.activeProfileSupportsTextFallback &&
              !s.effectiveTextToImageMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={s.showGeneratingState || s.userQueueFull || (Boolean(s.user) && !s.activeProviderReady)}
                  className="rounded-full border-[#E5A918]/55 text-xs font-semibold hover:bg-[#E5A918]/10"
                  onClick={() => {
                    s.setTextToImageMode(true)
                    s.handleGenerate({ textToImage: true })
                  }}
                >
                  <FileTextIcon className="size-3.5 text-[#B88300] dark:text-[#E5A918]" />
                  改用图转文生图
                </Button>
              )}
            {s.previewUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => s.setZoomImageUrl(s.previewUrl)}
              >
                查看上一张作品
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-xs text-muted-foreground hover:text-foreground"
              onClick={s.clearFailedAndPreview}
            >
              返回
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-xs font-bold text-muted-foreground">画好啦 · 作品飞向画框中…</div>
      )}
    </div>
  )
}

/* ============================================================================
 * 3. 画幅比例 + 物理形变视窗 + 分辨率选择器
 * ============================================================================ */

export function StudioAspectResolutionControls({
  s,
  showMorphPreview = true,
  compactMorph = false,
  layoutIdPrefix = 'studio',
}: {
  s: StudioLayoutProps
  showMorphPreview?: boolean
  compactMorph?: boolean
  layoutIdPrefix?: string
}) {
  const isAspectCollapsible = s.studioMode === 'prompt'
  const isAspectExpanded = !isAspectCollapsible || s.promptAspectRatioEnabled

  const handleToggleAspectEnabled = (next: boolean) => {
    playMechanicalSwitch(next ? 1.06 : 0.94)
    if (!next) s.setHoveredRatio(null)
    s.setPromptAspectRatioEnabled(next)
  }

  const ratioButtonsGrid = (
    <div
      role="group"
      aria-label="选择成图画幅比例"
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') s.setHoveredRatio(null)
      }}
      className="grid grid-cols-5 gap-1 rounded-xl border border-border/80 bg-secondary/50 p-1"
    >
      {STUDIO_ASPECT_RATIOS.map((opt) => {
        const selected = s.aspectRatio === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${opt.label} ${opt.hint}`}
            onClick={() => {
              playBrassDialTick()
              s.setAspectRatio(opt.id)
            }}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') s.setHoveredRatio(opt.id)
            }}
            onFocus={() => s.setHoveredRatio(opt.id)}
            onBlur={() => s.setHoveredRatio(null)}
            className={cn(
              'relative flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-lg px-1 transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
              selected
                ? 'bg-[#151412] text-white shadow-xs dark:bg-[#2A2722] dark:text-[#F5C443] dark:ring-1 dark:ring-[#E5A918]/45'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <AspectRatioLogo
              ratio={opt.id}
              selected={selected}
              className="relative z-10 size-3.5 shrink-0"
            />
            <span className="relative z-10 font-mono text-xs font-bold leading-none">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-2.5">
      {isAspectCollapsible ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs font-extrabold tracking-tight text-foreground sm:text-sm">
                画幅比例
              </span>
              <Switch
                size="sm"
                checked={isAspectExpanded}
                onCheckedChange={handleToggleAspectEnabled}
                aria-label={isAspectExpanded ? '关闭画幅比例并折叠' : '启用画幅比例并展开'}
              />
            </div>

            {!isAspectExpanded ? (
              <button
                type="button"
                aria-expanded={false}
                onClick={() => handleToggleAspectEnabled(true)}
                title="点击启用并展开画幅比例选择"
                className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-full border border-border/80 bg-secondary/45 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground dark:bg-muted/40"
              >
                <span className="truncate">未启用 · 自动画幅</span>
                <ChevronDownIcon className="size-3.5 shrink-0 opacity-75" />
              </button>
            ) : (
              <div className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-secondary/55 px-2.5 py-0.5 text-xs dark:bg-muted/50">
                <span className="shrink-0 font-mono font-semibold text-foreground">
                  {s.displayRatio.label}
                </span>
                <span className="shrink-0 text-muted-foreground/50">·</span>
                <span className="truncate text-muted-foreground">
                  {s.displayRatio.hint} · {s.displayRatioDims.label}
                </span>
              </div>
            )}
          </div>

          <div
            data-open={isAspectExpanded ? 'true' : 'false'}
            aria-hidden={!isAspectExpanded}
            className="ks-accordion-grid"
          >
            <div className="ks-accordion-inner">
              <div className="space-y-2 pt-0.5">
                {showMorphPreview && (
                  <VisualAspectMorphCard
                    ratio={s.displayRatio.id}
                    label={s.displayRatio.label}
                    hint={s.displayRatio.hint}
                    dimensionsLabel={s.displayRatioDims.label}
                    compact={compactMorph}
                  />
                )}
                {ratioButtonsGrid}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {showMorphPreview && (
            <VisualAspectMorphCard
              ratio={s.displayRatio.id}
              label={s.displayRatio.label}
              hint={s.displayRatio.hint}
              dimensionsLabel={s.displayRatioDims.label}
              compact={compactMorph}
            />
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground">画幅比例</span>
              {!showMorphPreview && (
                <span className="font-mono text-xs text-muted-foreground">
                  {s.displayRatio.label} · {s.displayRatioDims.label}
                </span>
              )}
            </div>
            {ratioButtonsGrid}
          </div>
        </>
      )}

      {s.activeProfile && s.activeProfileResolutions.length >= 2 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">输出清晰度</span>
          </div>
          <div
            role="radiogroup"
            aria-label="选择分辨率"
            className={cn(
              'grid gap-1 rounded-xl border border-border/80 bg-secondary/50 p-1',
              s.activeProfileResolutions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            )}
          >
            {s.activeProfileResolutions.map((resOpt) => {
              const selected = s.activeResolution === resOpt.resolution
              const resMeta = STUDIO_RESOLUTION_META[resOpt.resolution]
              return (
                <button
                  key={resOpt.resolution}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    playBrassDialTick()
                    s.setSelectedResolutionForProfile(s.activeProfile!.profileId, resOpt.resolution)
                  }}
                  className={cn(
                    'relative flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
                    selected
                      ? 'text-white dark:text-[#F5C443]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId={`${layoutIdPrefix}-res-pill`}
                      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                      className="pointer-events-none absolute inset-0 rounded-lg bg-[#151412] shadow-xs dark:bg-[#2A2722] dark:ring-1 dark:ring-[#E5A918]/45"
                    />
                  )}
                  <span className="relative z-10 font-mono text-xs font-bold leading-none">
                    {resOpt.resolution}
                  </span>
                  <span
                    className={cn(
                      'relative z-10 shrink-0 whitespace-nowrap text-xs font-medium leading-none',
                      selected ? 'text-white/80 dark:text-[#F5C443]/80' : 'text-muted-foreground'
                    )}
                  >
                    {resMeta.hint}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
 * 4. 生图模式切换（带图生图 / 图转文生图）
 * ============================================================================ */

export function StudioTextFallbackSwitch({
  s,
  layoutIdPrefix = 'studio',
}: {
  s: StudioLayoutProps
  layoutIdPrefix?: string
}) {
  if (s.studioMode !== 'recipe' || !s.textFallbackFeatureEnabled) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-foreground">参考传递</span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="查看参考传递模式与失败退分说明"
              className="relative inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-muted hover:text-foreground"
            >
              <HelpCircleIcon className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" sideOffset={8} className="w-72 rounded-2xl p-3 text-xs leading-relaxed">
            <div className="space-y-1.5">
              <div className="font-bold text-foreground">参考传递说明</div>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">带图生图</span>：直接传参考原图给模型，姿态与衣型还原度更高。
              </p>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">图转文</span>：先由视觉理解转成文本再纯文生图，适合部分敏感构图被拦截时降级重试。
              </p>
              <p className="border-t border-border/70 pt-1.5 font-medium text-[#116E65] dark:text-[#4FD1C5]">
                如生图异常或失败，系统会自动全额退还积分。
              </p>
            </div>
          </PopoverContent>
        </Popover>
        <div
          role="radiogroup"
          aria-label="选择生图模式"
          className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-secondary/50 p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!s.effectiveTextToImageMode}
            onClick={() => {
              playMechanicalSwitch(0.95)
              s.setTextToImageMode(false)
            }}
            className={cn(
              'relative inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors',
              !s.effectiveTextToImageMode ? 'text-white dark:text-[#F5C443]' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {!s.effectiveTextToImageMode && (
              <motion.span
                layoutId={`${layoutIdPrefix}-gen-mode`}
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="pointer-events-none absolute inset-0 rounded-md bg-[#151412] shadow-xs dark:bg-[#2A2722] dark:ring-1 dark:ring-[#E5A918]/45"
              />
            )}
            <ImageIcon className="relative z-10 size-3" />
            <span className="relative z-10">带图生图</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={s.effectiveTextToImageMode}
            disabled={!s.activeProfileSupportsTextFallback}
            title={
              !s.activeProfileSupportsTextFallback
                ? '当前画笔暂不支持图转文纯文生图模式'
                : '先将参考图转为文字描述，再进行纯文生图'
            }
            onClick={() => {
              playMechanicalSwitch(1.08)
              s.setTextToImageMode(true)
            }}
            className={cn(
              'relative inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors',
              !s.activeProfileSupportsTextFallback
                ? 'cursor-not-allowed text-muted-foreground/45'
                : s.effectiveTextToImageMode
                  ? 'cursor-pointer text-white dark:text-zinc-950'
                  : 'cursor-pointer text-muted-foreground hover:text-foreground'
            )}
          >
            {s.activeProfileSupportsTextFallback && s.effectiveTextToImageMode && (
              <motion.span
                layoutId={`${layoutIdPrefix}-gen-mode`}
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="pointer-events-none absolute inset-0 rounded-md bg-[#B88300] dark:bg-[#E5A918]"
              />
            )}
            <FileTextIcon className="relative z-10 size-3" />
            <span className="relative z-10">图转文</span>
          </button>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {!s.activeProfileSupportsTextFallback
          ? '当前画笔仅支持带图'
          : s.effectiveTextToImageMode
            ? '参考图转文字生成'
            : '直传参考原图'}
      </span>
    </div>
  )
}

/* ============================================================================
 * 5. 画面补充细节 + 灵感词条
 * ============================================================================ */

export function StudioSceneNoteEditor({
  s,
  rows = 2,
  placeholder = '补充服装材质、灯光氛围、镜头景别或背景环境（可选）…',
  className,
}: {
  s: StudioLayoutProps
  rows?: number
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-foreground">画面细节</span>
          <button
            type="button"
            aria-expanded={s.promptChipsOpen}
            onClick={() => s.setPromptChipsOpen((v) => !v)}
            className={cn(
              'inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
              s.promptChipsOpen
                ? 'border-foreground bg-foreground text-background'
                : 'border-border/80 bg-secondary/60 text-muted-foreground hover:text-foreground'
            )}
          >
            <WandSparklesIcon className="size-3" />
            <span>灵感词条</span>
          </button>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">Cmd/Ctrl+Enter 生成</span>
      </div>

      {s.promptChipsOpen && (
        <div className="space-y-1.5 rounded-2xl border border-border/80 bg-secondary/45 p-2.5">
          {STUDIO_PROMPT_CHIP_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-wrap items-center gap-1">
              <span className="w-14 shrink-0 text-xs font-semibold text-muted-foreground">
                {group.label}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {group.chips.map((chip) => {
                  const active = s.sceneNote.includes(chip.text)
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      aria-pressed={active}
                      title={chip.text}
                      onClick={() => s.setSceneNote((prev) => toggleSceneNoteChip(prev, chip.text).next)}
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-[var(--skin-accent)]/50 bg-[var(--skin-accent)]/12 text-[var(--skin-accent)]'
                          : 'border-border/80 bg-card text-foreground hover:border-foreground/35'
                      )}
                    >
                      {chip.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Textarea
          aria-label="补充画面细节"
          rows={rows}
          value={s.sceneNote}
          onChange={(e) => s.setSceneNote(e.target.value)}
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
          placeholder={placeholder}
          className="min-h-[54px] max-h-[110px] resize-none rounded-2xl bg-secondary/50 pr-8 text-xs leading-relaxed sm:text-sm"
        />
        {s.sceneNote && (
          <button
            type="button"
            aria-label="清空补充细节"
            onClick={() => s.setSceneNote('')}
            className="absolute top-2.5 right-2.5 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
 * 6. 可拖拽附图条 + 三槽位参考卡组（适配紧凑抽屉 / X 发帖附件 / 小红书画报 / 经典）
 * ============================================================================ */

function SortableExtraPill({
  img,
  idx,
  onUpdateName,
  onRemove,
  onPreview,
}: {
  img: { id: string; name: string; url: string }
  idx: number
  onUpdateName: (id: string, name: string) => void
  onRemove: (id: string) => void
  onPreview: (url: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-card pr-1.5 pl-1.5 transition-colors duration-150',
        isDragging ? 'border-[var(--skin-accent)] opacity-95 shadow-md' : 'border-border/80'
      )}
    >
      <button
        type="button"
        aria-label={`拖拽排序附图 ${idx + 1}`}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3" />
      </button>
      <button
        type="button"
        aria-label={`放大预览附图 ${idx + 1}`}
        onClick={(e) => {
          e.stopPropagation()
          onPreview(img.url)
        }}
        className="shrink-0 cursor-zoom-in overflow-hidden rounded-full border border-border transition-transform hover:scale-105"
      >
        <img src={img.url} alt={img.name} className="size-5 object-cover" />
      </button>
      <input
        type="text"
        value={img.name}
        onChange={(e) => onUpdateName(img.id, e.target.value)}
        placeholder={`附图#${idx + 1}`}
        aria-label={`附图 ${idx + 1} 备注`}
        className="w-16 truncate bg-transparent text-xs font-medium outline-none focus:w-24 focus:underline"
      />
      <button
        type="button"
        aria-label={`删除附图 ${idx + 1}`}
        onClick={() => onRemove(img.id)}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  )
}

function SlotQuickSwapBar({
  slot,
  libraryTo,
  diceColorClass,
  similarTitle,
  otherTitle,
  uploadLabel,
  disabled,
  randomizingAction,
  uploadingSlot,
  spinKey,
  onRandomSlot,
  onUploadClick,
  roundedPill = false,
}: {
  slot: ReferenceSlot
  libraryTo: '/poses' | '/costumes' | '/portraits'
  diceColorClass: string
  similarTitle: string
  otherTitle: string
  uploadLabel: string
  disabled: boolean
  randomizingAction: { slot: ReferenceSlot; scope: RandomScope } | null
  uploadingSlot: string | null
  spinKey: number
  onRandomSlot: (slot: ReferenceSlot, scope: RandomScope) => void
  onUploadClick: () => void
  roundedPill?: boolean
}) {
  const slotLabel = slot === 'portrait' ? '人像' : slot === 'costume' ? '服装' : '姿势'
  const rad = roundedPill ? 'rounded-full' : 'rounded-lg'
  const isBusy =
    (randomizingAction?.slot === slot) || uploadingSlot === slot

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${slotLabel}换卡菜单`}
            className={cn(
              'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap border border-border/80 bg-secondary/55 px-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground/35 hover:bg-muted disabled:opacity-50 md:h-6.5',
              rad
            )}
          >
            {isBusy ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
            ) : (
              <motion.span
                key={spinKey}
                animate={{ rotate: spinKey ? 360 : 0 }}
                transition={{ duration: 0.28, ease: MOTION_EASE_OUT }}
                className="inline-flex shrink-0 items-center"
              >
                <DicesIcon className={cn('size-3.5', diceColorClass)} />
              </motion.span>
            )}
            <span>换卡</span>
            <ChevronDownIcon className="size-3 opacity-65" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-40 rounded-xl p-1">
          <DropdownMenuItem
            onSelect={() => onRandomSlot(slot, 'similar')}
            title={similarTitle}
            className="cursor-pointer rounded-lg text-xs font-medium"
          >
            <DicesIcon className={cn('size-3.5', diceColorClass)} />
            <span>随机换同类</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onRandomSlot(slot, 'other')}
            title={otherTitle}
            className="cursor-pointer rounded-lg text-xs font-medium"
          >
            <ShuffleIcon className="size-3.5 text-muted-foreground" />
            <span>随机换其他</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onUploadClick}
            className="cursor-pointer rounded-lg text-xs font-medium md:hidden"
          >
            <UploadIcon className="size-3.5 text-muted-foreground" />
            <span>上传本地图</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer rounded-lg text-xs font-medium">
            <Link to={libraryTo} className="flex items-center gap-2">
              <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
              <span>去{slotLabel}库挑</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        disabled={disabled}
        onClick={onUploadClick}
        title={uploadLabel}
        aria-label={uploadLabel}
        className={cn(
          'hidden h-6.5 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap border border-border/80 bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/35 hover:bg-muted hover:text-foreground disabled:opacity-50 md:inline-flex',
          rad
        )}
      >
        {uploadingSlot === slot ? (
          <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
        ) : (
          <UploadIcon className="size-3 shrink-0" />
        )}
        <span>上传</span>
      </button>
    </div>
  )
}

export function StudioExtraRefsStrip({
  s,
  className,
}: {
  s: StudioLayoutProps
  className?: string
}) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  return (
    <div
      onClick={() => s.extraImages.length === 0 && s.triggerExtraFileUpload()}
      className={cn(
        'flex min-h-8 items-center justify-between gap-2 rounded-2xl border border-dashed px-3 py-1 transition-colors',
        s.isDragging
          ? 'border-[var(--skin-accent)] bg-muted text-foreground'
          : s.extraImages.length === 0
            ? 'cursor-pointer border-border bg-secondary/45 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            : 'border-border/80 bg-secondary/40',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {s.extraImages.length === 0 && (
          <span className="shrink-0 text-xs font-medium text-foreground">附加参考图</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            s.triggerExtraFileUpload()
          }}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ImagePlusIcon className="size-3" />
          <span>+ 图</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            s.openUrlModal()
          }}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <LinkIcon className="size-3" />
          <span>URL</span>
        </button>

        {s.extraImages.length > 0 && (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={s.handleExtraDragEnd}>
            <SortableContext items={s.extraImages.map((x) => x.id)} strategy={horizontalListSortingStrategy}>
              <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pl-1">
                {s.extraImages.map((img, idx) => (
                  <SortableExtraPill
                    key={img.id}
                    img={img}
                    idx={idx}
                    onUpdateName={s.updateExtraImageName}
                    onRemove={s.removeExtraImage}
                    onPreview={s.setZoomImageUrl}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <span className="shrink-0 truncate text-right text-xs text-muted-foreground">
        {s.extraImages.length > 0 ? (
          <>
            <span className="hidden sm:inline">已加 {s.extraImages.length} 张 · 可拖拽排序</span>
            <span className="font-mono sm:hidden">{s.extraImages.length} 张</span>
          </>
        ) : s.isDragging ? (
          '松开添加参考图'
        ) : (
          <span className="hidden sm:inline">支持点击、拖拽或 Ctrl+V 粘贴</span>
        )}
      </span>
    </div>
  )
}

export function StudioRecipeSlotsGrid({
  s,
  columnsClass = 'grid-cols-1 sm:grid-cols-3',
  cardVariant = 'default',
}: {
  s: StudioLayoutProps
  columnsClass?: string
  cardVariant?: 'default' | 'soft' | 'hairline' | 'darkroom'
}) {
  const cardSurface =
    cardVariant === 'soft'
      ? 'rounded-2xl border-0 bg-card p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] md:p-2 dark:bg-secondary/60'
      : cardVariant === 'hairline'
        ? 'rounded-2xl border border-border bg-background p-1.5 md:p-2'
        : cardVariant === 'darkroom'
          ? 'rounded-2xl border border-white/10 bg-zinc-900/80 p-1.5 md:p-2'
          : 'ks-paper-keycap rounded-xl border border-border/80 bg-card p-1.5 md:px-2 md:py-1.5'

  const roundedPill = cardVariant === 'soft' || cardVariant === 'hairline'

  return (
    <div className={cn('grid gap-1.5 md:gap-2', columnsClass)}>
      {/* 姿势槽位 */}
      <div
        className={cn(
          '@container/slot relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 overflow-hidden transition-colors',
          cardSurface,
          cardVariant === 'default' && s.recipe.pose && 'border-[#D9381E]/45'
        )}
      >
        <div className="relative shrink-0">
          {s.recipe.pose ? (
            <>
              <button
                type="button"
                aria-label="放大姿势参考图"
                onClick={() => {
                  const item = s.recipe.pose
                  if (item) s.setZoomImageUrl(referenceImageUrl(poseImagePath(item)))
                }}
                className={cn(
                  'group/img relative block h-[68px] w-[52px] cursor-zoom-in overflow-hidden rounded-xl border border-border/80',
                  s.recipe.pose.useDepth ? 'bg-[#2B2B32]' : 'bg-white dark:bg-zinc-900'
                )}
              >
                <img
                  src={referenceImageUrl(poseThumbPath(s.recipe.pose))}
                  alt={s.recipe.pose.姿势名称}
                  className="h-full w-full object-contain p-0.5 transition-transform duration-300 group-hover/img:scale-105"
                />
                <span className="pointer-events-none absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                  <ZoomInIcon className="size-3" />
                </span>
              </button>
              <button
                type="button"
                title="清除姿势"
                aria-label="清除姿势参考图"
                onClick={() => s.setPose(null)}
                className="absolute -top-1.5 -right-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm transition-colors before:absolute before:-inset-2 before:content-[''] hover:border-destructive/40 hover:bg-destructive hover:text-white md:size-5"
              >
                <XIcon className="size-3" />
              </button>
            </>
          ) : (
            <Link
              to="/poses"
              aria-label="前往姿势库选图"
              className="flex h-[68px] w-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/25 text-[#B82812] transition-colors hover:border-[var(--skin-accent)] hover:bg-muted/50 dark:text-[#FF8A75]"
            >
              <PersonStandingIcon className="size-4.5" />
              <span className="text-xs font-semibold">挑姿势</span>
            </Link>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="inline-flex shrink-0 items-center rounded-md bg-[var(--skin-accent)]/12 px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-[#B82812] dark:text-[#FF8A75]">
                姿势
              </span>
              <span className="min-w-0 truncate text-xs font-bold text-foreground">
                {s.recipe.pose ? s.recipe.pose.姿势名称 : '未选择'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={s.poseFrontOnly}
                    aria-label={s.poseFrontOnly ? '已开启仅抽正面姿势' : '切换随机换卡仅抽正面姿势'}
                    onClick={() => void s.handleTogglePoseFrontOnly()}
                    className={cn(
                      'inline-flex h-7.5 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs leading-none transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-95 md:h-5.5 md:px-1.5',
                      s.poseFrontOnly
                        ? 'border-[#151412] bg-[#151412] font-semibold text-white dark:border-[#E5A918]/50 dark:bg-[#2A2722] dark:text-[#F5C443]'
                        : 'border-border/80 bg-secondary/55 font-medium text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {s.poseFrontOnly ? <LockIcon className="size-2.5" /> : <LockOpenIcon className="size-2.5 opacity-70" />}
                    <span>仅正面</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  随机换卡时仅抽取正面视角姿势
                </TooltipContent>
              </Tooltip>
              {s.recipe.pose && hasPoseDepthMap(s.recipe.pose) && (
                <button
                  type="button"
                  onClick={s.toggleRecipePoseDepth}
                  className={cn(
                    'h-7.5 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 text-xs leading-none font-semibold transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-95 md:h-5.5 md:px-1.5',
                    s.recipe.pose.useDepth
                      ? 'bg-[#116E65] text-white'
                      : 'border border-border/80 bg-secondary/55 text-foreground hover:bg-muted'
                  )}
                >
                  {s.recipe.pose.useDepth ? '深度' : '白模'}
                </button>
              )}
              {s.recipe.pose && s.poseAngles.length > 1 && (
                <Select
                  value={s.recipe.pose.角度}
                  onValueChange={(angleVal) => {
                    const nextPose = s.poseAngles.find((p) => p.角度 === angleVal)
                    if (nextPose && s.recipe.pose) {
                      s.setPose({ ...nextPose, useDepth: Boolean(s.recipe.pose.useDepth) })
                    }
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="已选姿势视角"
                    className="h-6 w-full min-w-0 rounded-md border-border/80 bg-secondary/55 px-1.5 text-xs font-medium text-foreground shadow-none md:h-5.5 md:w-auto md:max-w-[4.75rem] md:shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {s.poseAngles.map((p) => (
                      <SelectItem key={p.id} value={p.角度} className="text-xs">
                        {p.角度}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <SlotQuickSwapBar
            slot="pose"
            libraryTo="/poses"
            diceColorClass="text-[var(--skin-accent)]"
            similarTitle="在相同体系与动作分类中换一个"
            otherTitle="从其他体系或动作分类中换一个"
            uploadLabel={s.recipe.pose ? '上传替换姿势参考图' : '上传姿势参考图'}
            disabled={s.uploadingSlot !== null || s.randomizingAction !== null}
            randomizingAction={s.randomizingAction}
            uploadingSlot={s.uploadingSlot}
            spinKey={s.slotActionSpin['pose:similar'] || 0}
            onRandomSlot={(slot, scope) => void s.handleRandomSlot(slot, scope)}
            onUploadClick={() => s.triggerSlotUpload('pose')}
            roundedPill={roundedPill}
          />
        </div>
      </div>

      {/* 服装槽位 */}
      <div
        className={cn(
          '@container/slot relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 overflow-hidden transition-colors',
          cardSurface,
          cardVariant === 'default' && s.recipe.costume && 'border-[#19857B]/45'
        )}
      >
        <div className="relative shrink-0">
          {s.recipe.costume ? (
            <>
              <button
                type="button"
                aria-label="放大服装参考图"
                onClick={() => {
                  const item = s.recipe.costume
                  if (item) s.setZoomImageUrl(referenceImageUrl(item.预览图 || item.原图 || item.缩略图))
                }}
                className="group/img relative block h-[68px] w-[52px] cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-muted/30"
              >
                <img
                  src={referenceImageUrl(s.recipe.costume.缩略图)}
                  alt={s.recipe.costume.服装名称}
                  className={cn(
                    'h-full w-full transition-transform duration-300 group-hover/img:scale-105',
                    isContainCostumeSource(s.recipe.costume.source)
                      ? s.recipe.costume.source === 'outfit-db'
                        ? 'bg-[#181715] object-contain p-0.5'
                        : 'bg-[#DFDFE2] object-contain p-0.5 dark:bg-[#232328]'
                      : 'object-cover object-[50%_15%]'
                  )}
                />
                <span className="pointer-events-none absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                  <ZoomInIcon className="size-3" />
                </span>
              </button>
              <button
                type="button"
                title="清除服装"
                aria-label="清除服装参考图"
                onClick={() => s.setCostume(null)}
                className="absolute -top-1.5 -right-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm transition-colors before:absolute before:-inset-2 before:content-[''] hover:border-destructive/40 hover:bg-destructive hover:text-white md:size-5"
              >
                <XIcon className="size-3" />
              </button>
            </>
          ) : (
            <Link
              to="/costumes"
              aria-label="前往服装库选图"
              className="flex h-[68px] w-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/25 text-[#116E65] transition-colors hover:border-[#19857B] hover:bg-muted/50 dark:text-[#4FD1C5]"
            >
              <ShirtIcon className="size-4.5" />
              <span className="text-xs font-semibold">挑服装</span>
            </Link>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="inline-flex shrink-0 items-center rounded-md bg-[#19857B]/12 px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-[#116E65] dark:bg-[#19857B]/20 dark:text-[#4FD1C5]">
                服装
              </span>
              <span className="min-w-0 truncate text-xs font-bold text-foreground">
                {s.recipe.costume ? s.recipe.costume.服装名称 : '未选择'}
              </span>
            </div>
            {s.recipe.costume && s.costumeViews.length > 0 && (
              <div className="flex w-full items-center gap-1 md:w-auto md:shrink-0">
                <Select
                  value={
                    s.costumeViews.find((view) => view.id === s.recipe.costume?.selectedView)?.id ||
                    s.costumeViews.find((view) => view.id === 'front')?.id ||
                    s.costumeViews[0].id
                  }
                  onValueChange={(viewId) => {
                    if (s.recipe.costume) s.setCostume(selectCostumeView(s.recipe.costume, viewId))
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="已选服装视角"
                    className="h-6 w-full min-w-0 rounded-md border-border/80 bg-secondary/55 px-1.5 text-xs font-medium text-foreground shadow-none md:h-5.5 md:w-auto md:max-w-[5.5rem]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {s.costumeViews.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <SlotQuickSwapBar
            slot="costume"
            libraryTo="/costumes"
            diceColorClass="text-[#19857B]"
            similarTitle="在相同来源与分类中换一套"
            otherTitle="从其他分类或来源中换一套"
            uploadLabel={s.recipe.costume ? '上传替换服装参考图' : '上传服装参考图'}
            disabled={s.uploadingSlot !== null || s.randomizingAction !== null}
            randomizingAction={s.randomizingAction}
            uploadingSlot={s.uploadingSlot}
            spinKey={s.slotActionSpin['costume:similar'] || 0}
            onRandomSlot={(slot, scope) => void s.handleRandomSlot(slot, scope)}
            onUploadClick={() => s.triggerSlotUpload('costume')}
            roundedPill={roundedPill}
          />
        </div>
      </div>

      {/* 人像槽位 */}
      <div
        className={cn(
          '@container/slot relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 overflow-hidden transition-colors',
          cardSurface,
          cardVariant === 'default' && s.recipe.portrait && 'border-[#E5A918]/50'
        )}
      >
        <div className="relative shrink-0">
          {s.recipe.portrait ? (
            <>
              <button
                type="button"
                aria-label="放大人像参考图"
                onClick={() => {
                  const item = s.recipe.portrait
                  if (item) s.setZoomImageUrl(referenceImageUrl(item.原图 || item.缩略图))
                }}
                className="group/img relative block h-[68px] w-[52px] cursor-zoom-in overflow-hidden rounded-xl border border-border/80 bg-muted/30"
              >
                <img
                  src={referenceImageUrl(s.recipe.portrait.缩略图)}
                  alt={s.recipe.portrait.标题}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover/img:scale-105"
                />
                <span className="pointer-events-none absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                  <ZoomInIcon className="size-3" />
                </span>
              </button>
              <button
                type="button"
                title="清除人像"
                aria-label="清除人像参考图"
                onClick={() => s.setPortrait(null)}
                className="absolute -top-1.5 -right-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm transition-colors before:absolute before:-inset-2 before:content-[''] hover:border-destructive/40 hover:bg-destructive hover:text-white md:size-5"
              >
                <XIcon className="size-3" />
              </button>
            </>
          ) : (
            <Link
              to="/portraits"
              aria-label="前往人像库选图"
              className="flex h-[68px] w-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/25 text-[#7A5200] transition-colors hover:border-[#E5A918] hover:bg-muted/50 dark:text-[#E5A918]"
            >
              <UserRoundIcon className="size-4.5" />
              <span className="text-xs font-semibold">挑人像</span>
            </Link>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="inline-flex shrink-0 items-center rounded-md bg-[#E5A918]/14 px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-[#7A5200] dark:bg-[#E5A918]/20 dark:text-[#F5C443]">
                人像
              </span>
              <span className="min-w-0 truncate text-xs font-bold text-foreground">
                {s.recipe.portrait ? s.recipe.portrait.发型名称 : '未选择'}
              </span>
            </div>
            {s.recipe.portrait && (
              <span className="hidden shrink-0 truncate text-right text-xs text-muted-foreground xl:inline">
                {s.recipe.portrait.发长}
              </span>
            )}
          </div>

          <SlotQuickSwapBar
            slot="portrait"
            libraryTo="/portraits"
            diceColorClass="text-[#E5A918]"
            similarTitle="在相同分区与发长中换一个"
            otherTitle="从其他分类中换一个"
            uploadLabel={s.recipe.portrait ? '上传替换人像参考图' : '上传人像参考图'}
            disabled={s.uploadingSlot !== null || s.randomizingAction !== null}
            randomizingAction={s.randomizingAction}
            uploadingSlot={s.uploadingSlot}
            spinKey={s.slotActionSpin['portrait:similar'] || 0}
            onRandomSlot={(slot, scope) => void s.handleRandomSlot(slot, scope)}
            onUploadClick={() => s.triggerSlotUpload('portrait')}
            roundedPill={roundedPill}
          />
        </div>
      </div>
    </div>
  )
}
