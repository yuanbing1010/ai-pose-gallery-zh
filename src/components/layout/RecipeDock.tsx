import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  DicesIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { poseThumbPath, referenceImageUrl } from '@/lib/recipeImages'
import { workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { useStudio } from '@/store/studioStore'

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
  const extraCount = (recipe.extraImages || []).length
  const workflowImages =
    apiConfig.activeProvider === 'comfyui' &&
    recipe.workflowImagesIdentity === workflowIdentity(apiConfig.comfyuiParams.workflowJson)
      ? Object.values(recipe.workflowImages || {})
      : []
  const count =
    [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length +
    extraCount +
    workflowImages.length
  const coreSlotsFilled = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

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
        data-impeccable-ignore="nested-cards"
        className="md-glass relative overflow-hidden rounded-[22px] p-2 text-foreground sm:px-3 sm:py-2"
      >
        {/* 底部极细进度线 */}
        <div className="pointer-events-none absolute inset-x-6 bottom-0 h-[1.5px] overflow-hidden bg-border">
          <motion.div
            animate={{ width: `${(coreSlotsFilled / 3) * 100}%` }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="h-full bg-foreground"
          />
        </div>

        <div className="flex flex-col gap-2 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 rounded-2xl bg-muted/75 p-1 sm:gap-2">
            {/* Slot 1: Portrait */}
            <div
              data-dock-slot="portrait"
              className={`relative flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors ${
                recipe.portrait
                  ? 'border border-border bg-card shadow-xs'
                  : 'hover:bg-card/70'
              }`}
            >
              {recipe.portrait ? (
                <>
                  <img
                    src={referenceImageUrl(recipe.portrait.缩略图)}
                    alt={recipe.portrait.标题}
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border"
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
                recipe.costume
                  ? 'border border-border bg-card shadow-xs'
                  : 'hover:bg-card/70'
              }`}
            >
              {recipe.costume ? (
                <>
                  <img
                    src={referenceImageUrl(recipe.costume.缩略图)}
                    alt={recipe.costume.服装名称}
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border"
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
                recipe.pose
                  ? 'border border-border bg-card shadow-xs'
                  : 'hover:bg-card/70'
              }`}
            >
              {recipe.pose ? (
                <>
                  <img
                    src={referenceImageUrl(poseThumbPath(recipe.pose))}
                    alt={recipe.pose.姿势名称}
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground" title={recipe.pose.姿势名称}>
                      {recipe.pose.姿势名称}
                    </div>
                    {recipe.pose.source !== 'upload' && (
                      <button
                        type="button"
                        onClick={toggleRecipePoseDepth}
                        className="inline-flex items-center gap-1 text-[11px] leading-none text-muted-foreground hover:text-foreground"
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
            <Link
              to="/studio"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97]"
            >
              {isGenerating ? (
                <>
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                  <span>生成中…</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="size-3.5" />
                  <span>立即合成 ({count}/3)</span>
                </>
              )}
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
