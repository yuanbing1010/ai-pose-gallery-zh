import {
  JOB_HEARTBEAT_INTERVAL_MS,
  buildRecipePrompt,
  buildTextToImagePrompt,
  formatUserFacingGenerationError,
  isChannelStitchedSingleMode,
  isNativeArtistChannel,
  mergeGenerationQueueConfig,
  mergeNegativePrompts,
  mergeVisionFallbackConfig,
  normalizeStudioResolution,
  resolveEffectiveProcessingTimeoutSec,
  resolveStyleInfo,
  type GenerationAttemptTrace,
  type GenerationAttemptTriggerType,
  type GenerationAuditTrace,
  type GenerationAspectRatio,
  type GenerationHistoryItem,
  type GenerationLiveStage,
  type GenerationLiveState,
  type GenerationSnapshot,
  type ImageProviderId,
  type PlatformConfig,
  type RecipeState,
  type StudioGenerationMode,
  type StudioResolution,
} from '../shared/studio'
import {
  UpstreamError,
  extractRecipeSources,
  resolveOrTranscribeReferenceDescription,
  runServerGeneration,
  type ResolvedSource,
} from './aiProviders'
import {
  getPlatformConfig,
  mapJobRow,
  markJobSucceeded,
  markSupplierKeyCooldown,
  markSupplierKeyDispatched,
  markSupplierKeySuccess,
  refundFailedJob,
  resolveProfileForGeneration,
  resolveVisionFallbackTargets,
  selectOrderedRunnableChannels,
  updateJobTrace,
  type JobRow,
  type ModelProfileRow,
  type ProviderRow,
  type RunnableChannel,
} from './db'
import type { Env } from './types'

const DEFAULT_RETRY_COUNT = 1

export interface QueuedJobPayload {
  requestOrigin: string
  stitchedR2Key?: string
  textFallbackOnly?: boolean
  generationMode?: StudioGenerationMode
  userPrompt?: string
  remixGalleryItemId?: string
}

export interface PlannedGenerationStep {
  channel: RunnableChannel
  delayMs: number
  triggerType: GenerationAttemptTriggerType
}

const MAX_KEYS_PER_CHANNEL_IN_PLAN = 3
const MAX_EXECUTION_STEPS = 6

function formatChannelKeyTag(ch: RunnableChannel): string {
  if (!ch.supplierKeyLabel && !ch.supplierKeyHint) return ''
  if (ch.supplierKeyLabel && ch.supplierKeyHint) {
    return `${ch.supplierKeyLabel} (${ch.supplierKeyHint})`
  }
  return ch.supplierKeyLabel || ch.supplierKeyHint || ''
}

function getChannelKeyToken(ch: RunnableChannel): string {
  return `${ch.channelId}::${ch.supplierKeyId || ''}`
}

/**
 * 为所有画师构建统一的执行队列：默认至少 1 次首试 + 1 次重试（共 2 次尝试）。
 * 单渠道单密钥时在同渠道自动重试；多渠道 / 多密钥池时优先覆盖各不同渠道，每条渠道最多选取前 3 个健康密钥。
 */
export function buildExecutionPlan(channels: RunnableChannel[]): PlannedGenerationStep[] {
  if (channels.length === 1) {
    const retryDelays = [1500, 3000]
    const steps: PlannedGenerationStep[] = [
      { channel: channels[0], delayMs: 0, triggerType: 'initial' },
    ]
    for (let i = 0; i < DEFAULT_RETRY_COUNT; i++) {
      steps.push({
        channel: channels[0],
        delayMs: retryDelays[i] ?? 3000,
        triggerType: 'transient_retry',
      })
    }
    return steps
  }

  // 先保底每条不同渠道至少入队 1 个首选密钥，再补充同渠道的备用密钥，总步骤上限 6 步
  const perChannelCount = new Map<string, number>()
  const primaryPerChannel: RunnableChannel[] = []
  const extraKeys: RunnableChannel[] = []
  for (const ch of channels) {
    const count = perChannelCount.get(ch.channelId) || 0
    if (count === 0) {
      primaryPerChannel.push(ch)
    } else if (count < MAX_KEYS_PER_CHANNEL_IN_PLAN) {
      extraKeys.push(ch)
    }
    perChannelCount.set(ch.channelId, count + 1)
  }

  // 按渠道顺序重排：保持同一渠道的多个密钥相邻，避免跨供应商来回抖动，同时不让单渠道吃满全部配额
  const selectedTokens = new Set<string>()
  for (const ch of primaryPerChannel.slice(0, MAX_EXECUTION_STEPS)) {
    selectedTokens.add(getChannelKeyToken(ch))
  }
  for (const ch of extraKeys) {
    if (selectedTokens.size >= MAX_EXECUTION_STEPS) break
    selectedTokens.add(getChannelKeyToken(ch))
  }

  const orderedSelected = channels.filter((ch) => selectedTokens.has(getChannelKeyToken(ch)))
  const steps: PlannedGenerationStep[] = orderedSelected.map((ch, idx) => ({
    channel: ch,
    delayMs: 0,
    triggerType: idx === 0 ? 'initial' : 'failover_switch',
  }))
  const fallbackDelays = [1500, 3000]
  let extraIdx = 0
  while (steps.length < 1 + DEFAULT_RETRY_COUNT) {
    steps.push({
      channel: orderedSelected[0],
      delayMs: fallbackDelays[extraIdx] ?? 3000,
      triggerType: 'fallback_retry',
    })
    extraIdx += 1
  }
  return steps
}

export function isLocalPreflightError(err: unknown): boolean {
  if (!(err instanceof UpstreamError)) return true
  return err.status === undefined && !err.retryable && !err.safetyBlocked
}

export function isChannelConfigError(err: unknown): boolean {
  return (
    isLocalPreflightError(err) ||
    (err instanceof UpstreamError && err.status === 404)
  )
}

export function classifyKeyLevelError(err: unknown): { isKeyError: boolean; cooldownMs: number } {
  if (err instanceof UpstreamError) {
    if (err.status === 429) {
      return { isKeyError: true, cooldownMs: 60_000 }
    }
    if (err.status === 401 || err.status === 402 || err.status === 403) {
      return { isKeyError: true, cooldownMs: 10 * 60_000 }
    }
  }
  const msg = err instanceof Error ? err.message : ''
  if (/quota|insufficient|rate.?limit|invalid.?api.?key|exceeded/i.test(msg)) {
    return { isKeyError: true, cooldownMs: 120_000 }
  }
  return { isKeyError: false, cooldownMs: 0 }
}

export function buildGenerationPromptVariants(params: {
  platform: PlatformConfig
  recipe: RecipeState
  stylePreset: string
  sceneNote: string
  allowFaceStyleShift: boolean
  allowPoseStyleShift: boolean
  primaryUsesStitchedSingle: boolean
  hasStitchedSheet: boolean
  refCount: number
}) {
  const promptBuildOptions = {
    prefix: params.platform.defaultPromptPrefix,
    suffix: params.platform.defaultPromptSuffix,
    negativePrompt: params.platform.defaultNegativePrompt,
    promptTemplate: params.platform.promptTemplate,
    poseSanitize: params.platform.poseSanitize,
    sceneNote: params.sceneNote,
    allowFaceStyleShift: params.allowFaceStyleShift,
    allowPoseStyleShift: params.allowPoseStyleShift,
    stylePresets: params.platform.stylePresets,
    styleCategories: params.platform.styleCategories,
    styleSubcategories: params.platform.styleSubcategories,
  }
  const finalPrompt = buildRecipePrompt(params.recipe, params.stylePreset, {
    ...promptBuildOptions,
    singleStitchedSheet: params.primaryUsesStitchedSingle,
  })
  const multiPrompt = params.primaryUsesStitchedSingle
    ? buildRecipePrompt(params.recipe, params.stylePreset, {
        ...promptBuildOptions,
        singleStitchedSheet: false,
      })
    : finalPrompt
  const stitchedSinglePrompt = params.primaryUsesStitchedSingle
    ? finalPrompt
    : params.hasStitchedSheet && params.refCount >= 2
      ? buildRecipePrompt(params.recipe, params.stylePreset, {
          ...promptBuildOptions,
          singleStitchedSheet: true,
        })
      : finalPrompt

  return {
    promptBuildOptions,
    finalPrompt,
    multiPrompt,
    stitchedSinglePrompt,
  }
}

export interface ExecuteGenerationJobParams {
  env: Env
  jobId: string
  userId: string
  provider: ImageProviderId
  profileRow: ModelProfileRow
  selectedResolution: StudioResolution | null
  effectiveCreditCost: number
  creditBalanceAfterDeduct: number
  channels: RunnableChannel[]
  executionPlan: PlannedGenerationStep[]
  textFallbackOnly: boolean
  generationMode?: StudioGenerationMode
  remixGalleryItemId?: string
  recipe: RecipeState
  extractedSources: { refs: ResolvedSource[]; stitched?: ResolvedSource }
  stylePreset: string
  aspectRatio: GenerationAspectRatio
  stitchedR2Key?: string
  requestOrigin: string
  platform: PlatformConfig
  promptBuildOptions: ReturnType<typeof buildGenerationPromptVariants>['promptBuildOptions']
  multiPrompt: string
  stitchedSinglePrompt: string
  auditTrace: GenerationAuditTrace
  startedAt: number
  onEvent?: (event: 'progress' | 'done' | 'error', data: unknown) => void
}

export async function executeGenerationJob(
  params: ExecuteGenerationJobParams
): Promise<{
  status: 'succeeded' | 'failed'
  job?: GenerationHistoryItem
  errorMessage?: string
}> {
  const {
    env,
    jobId,
    userId,
    provider,
    profileRow,
    selectedResolution,
    effectiveCreditCost,
    creditBalanceAfterDeduct,
    channels,
    executionPlan,
    textFallbackOnly,
    generationMode = 'recipe',
    remixGalleryItemId,
    recipe,
    extractedSources,
    stylePreset,
    aspectRatio,
    stitchedR2Key,
    requestOrigin,
    platform,
    promptBuildOptions,
    multiPrompt,
    stitchedSinglePrompt,
    auditTrace,
    startedAt,
    onEvent,
  } = params

  const visionCfg = mergeVisionFallbackConfig(platform.visionFallback)
  const queueCfg = mergeGenerationQueueConfig(platform.queueConfig)
  const primaryChannel = channels[0]
  let primaryEndpointMode: string | null = null
  try {
    const parsedParams = JSON.parse(primaryChannel.paramsJson) as { endpointMode?: unknown }
    if (typeof parsedParams?.endpointMode === 'string' && parsedParams.endpointMode.trim()) {
      primaryEndpointMode = parsedParams.endpointMode.trim()
    }
  } catch {
    primaryEndpointMode = null
  }
  const effectiveTimeoutSec = resolveEffectiveProcessingTimeoutSec(
    queueCfg,
    provider,
    primaryEndpointMode
  )
  const retryCutoffMs = Math.max(30_000, effectiveTimeoutSec * 1000 - 50_000)
  auditTrace.startedAt = startedAt
  let lastAttemptedChannel: RunnableChannel = primaryChannel
  const totalPlanned = executionPlan.length

  const upsertAttemptTrace = (attempt: GenerationAttemptTrace) => {
    const existingIdx = auditTrace.attempts.findIndex(
      (item) => item.attemptIndex === attempt.attemptIndex
    )
    if (existingIdx >= 0) {
      auditTrace.attempts[existingIdx] = attempt
    } else {
      auditTrace.attempts.push(attempt)
    }
  }

  let jobFinished = false
  let heartbeatInFlight = false
  const heartbeatTimer = setInterval(() => {
    if (jobFinished || heartbeatInFlight || !auditTrace.liveState) return
    heartbeatInFlight = true
    auditTrace.liveState = {
      ...auditTrace.liveState,
      heartbeatAt: Date.now(),
    }
    void updateJobTrace(env.DB, jobId, JSON.stringify(auditTrace)).finally(() => {
      heartbeatInFlight = false
    })
  }, JOB_HEARTBEAT_INTERVAL_MS)

  const publishProgress = async (
    stage: GenerationLiveStage,
    message: string,
    percent: number,
    opts?: {
      attempt?: number
      totalAttempts?: number
      creditBalance?: number
      persist?: boolean
    }
  ) => {
    const now = Date.now()
    const nextLive: GenerationLiveState = {
      stage,
      message,
      attempt: opts?.attempt ?? auditTrace.liveState?.attempt ?? 1,
      totalAttempts: opts?.totalAttempts ?? totalPlanned,
      startedAt,
      stageStartedAt: now,
      heartbeatAt: now,
      percent,
    }
    auditTrace.liveState = nextLive
    onEvent?.('progress', {
      ...nextLive,
      jobId,
      ...(typeof opts?.creditBalance === 'number'
        ? { creditBalance: opts.creditBalance }
        : {}),
    })
    if (opts?.persist || !onEvent) {
      await updateJobTrace(env.DB, jobId, JSON.stringify(auditTrace))
    }
  }

  try {
    await publishProgress('deducted', '准备中…', 14, {
      attempt: 0,
      totalAttempts: totalPlanned,
      creditBalance: creditBalanceAfterDeduct,
      persist: !onEvent,
    })

    let output: { bytes: Uint8Array; mime: string; ext: string } | null = null
    let winningChannel: RunnableChannel | null = null
    const attemptLogs: string[] = []
    const channelConfigFailed = new Set<string>()
    const siteFailedChannels = new Set<string>()
    const failedKeyTokens = new Set<string>()
    const distinctChannelCount = new Set(channels.map((c) => c.channelId)).size
    let lastErr: unknown = null
    let prevChannel: RunnableChannel | null = null

    const describeFailoverReason = (
      idx: number,
      step: PlannedGenerationStep,
      targetChannel: RunnableChannel,
      textDescSources?: string[]
    ): string => {
      const targetKeyTag = formatChannelKeyTag(targetChannel)
      const prevKeyTag = prevChannel ? formatChannelKeyTag(prevChannel) : ''
      if (idx === 0) {
        if (textDescSources) {
          return `用户选择图转文纯文生图（${textDescSources.join('、')}）`
        }
        return channels.length > 1
          ? `首次调度（共 ${channels.length} 个可用调度目标，按优先级选中「${targetChannel.channelName}」${targetKeyTag ? ` · 密钥 ${targetKeyTag}` : ''}）`
          : `首次调度（单渠道「${targetChannel.channelName}」${targetKeyTag ? ` · 密钥 ${targetKeyTag}` : ''}）`
      }
      if (step.triggerType === 'failover_switch') {
        const sameChannelKeyRotate =
          prevChannel &&
          prevChannel.channelId === targetChannel.channelId &&
          prevChannel.supplierKeyId !== targetChannel.supplierKeyId
        if (sameChannelKeyRotate) {
          return `上一密钥「${prevKeyTag || '默认密钥'}」调用失败，自动切换同渠道「${targetChannel.channelName}」下一个密钥「${targetKeyTag}」重试`
        }
        return `上一渠道「${prevChannel?.channelName || ''} (${prevChannel?.model || ''})」调用失败，自动切换至备用渠道「${targetChannel.channelName}」${targetKeyTag ? `（密钥 ${targetKeyTag}）` : ''}`
      }
      if (step.triggerType === 'fallback_retry') {
        return `全部候选渠道均调用失败，延迟 ${(step.delayMs / 1000).toFixed(1)}s 后回切渠道「${targetChannel.channelName}」进行第 ${idx + 1} 次自动重试`
      }
      return `第 ${idx} 次请求失败，延迟 ${(step.delayMs / 1000).toFixed(1)}s 后进行第 ${idx + 1} 次自动重试`
    }

    const recordStepFailure = async (err: unknown, targetChannel: RunnableChannel) => {
      const msg = err instanceof Error ? err.message : '未知错误'
      const { isKeyError, cooldownMs } = classifyKeyLevelError(err)
      if (isKeyError && targetChannel.supplierKeyId) {
        failedKeyTokens.add(getChannelKeyToken(targetChannel))
        await markSupplierKeyCooldown(env.DB, targetChannel.supplierKeyId, cooldownMs, msg).catch(
          () => {}
        )
        return { shouldBreak: distinctChannelCount === 1 && channels.length === 1 }
      }
      if (isLocalPreflightError(err)) {
        return { shouldBreak: true }
      }
      if (isChannelConfigError(err)) {
        channelConfigFailed.add(targetChannel.channelId)
        return { shouldBreak: distinctChannelCount === 1 }
      }
      if (err instanceof UpstreamError && !err.retryable) {
        // 明确不可重试错误（含安全审核拦截 moderation_blocked / 4xx 参数或权限错误）直接跳过当前渠道，
        // 避免同渠道换 Key 重复撞墙白耗 25~60 秒；若配置了其他备用供应商渠道仍会自动故障转移。
        channelConfigFailed.add(targetChannel.channelId)
        return { shouldBreak: distinctChannelCount === 1 }
      }
      if (distinctChannelCount > 1) {
        // 多不同供应商渠道存在时，站点级 5xx/超时 直接跳至下一家供应商，避免连撞同一站点其余密钥
        siteFailedChannels.add(targetChannel.channelId)
      }
      return { shouldBreak: false }
    }

    if (textFallbackOnly) {
      await publishProgress('transcribing_refs', '正在将参考图转为文字描述…', 24, {
        attempt: 1,
        totalAttempts: totalPlanned,
        persist: true,
      })

      let preparedTextGen: {
        fallbackRecipe: RecipeState
        fallbackPrompt: string
        descSources: string[]
      } | null = null

      try {
        const visionTargets = await resolveVisionFallbackTargets(env, visionCfg)
        const poseSource = extractedSources.refs.find((r) => r.slot === 'pose') || null
        const costumeSource = extractedSources.refs.find((r) => r.slot === 'costume') || null
        const portraitSource = extractedSources.refs.find((r) => r.slot === 'portrait') || null
        const extraSources = extractedSources.refs.filter((r) => r.slot === 'extra')

        const [poseDescRes, costumeDescRes, portraitDescRes, extraDescResults] =
          await Promise.all([
            poseSource
              ? resolveOrTranscribeReferenceDescription({
                  env,
                  kind: 'pose',
                  source: poseSource,
                  visionConfig: visionCfg,
                  targets: visionTargets,
                })
              : Promise.resolve(null),
            costumeSource
              ? resolveOrTranscribeReferenceDescription({
                  env,
                  kind: 'costume',
                  source: costumeSource,
                  visionConfig: visionCfg,
                  targets: visionTargets,
                })
              : Promise.resolve(null),
            portraitSource
              ? resolveOrTranscribeReferenceDescription({
                  env,
                  kind: 'portrait',
                  source: portraitSource,
                  visionConfig: visionCfg,
                  targets: visionTargets,
                })
              : Promise.resolve(null),
            Promise.all(
              extraSources.map((extraSrc) =>
                resolveOrTranscribeReferenceDescription({
                  env,
                  kind: 'extra',
                  source: extraSrc,
                  visionConfig: visionCfg,
                  targets: visionTargets,
                })
              )
            ),
          ])

        const poseDesc = poseDescRes?.description?.trim() || ''
        const costumeDesc = costumeDescRes?.description?.trim() || ''
        const portraitDesc = portraitDescRes?.description?.trim() || ''
        const extraDescItems = extraDescResults
          .map((res, i) => ({
            name: extraSources[i]?.label || '',
            description: res.description.trim(),
            cacheHit: res.cacheHit,
            visionModel: res.visionModel,
            visionSupplierName: res.visionSupplierName,
          }))
          .filter((item) => Boolean(item.description))

        if (!poseDesc && !costumeDesc && !portraitDesc && extraDescItems.length === 0) {
          throw new Error('参考图转文字未能提取有效描述，请调整参考图或换位小画家重试')
        }

        const firstVisionModel =
          poseDescRes?.visionModel ||
          costumeDescRes?.visionModel ||
          portraitDescRes?.visionModel ||
          extraDescItems.find((x) => x.visionModel)?.visionModel ||
          visionCfg.model
        const firstSupplierName =
          poseDescRes?.visionSupplierName ||
          costumeDescRes?.visionSupplierName ||
          portraitDescRes?.visionSupplierName ||
          extraDescItems.find((x) => x.visionSupplierName)?.visionSupplierName

        const fallbackRecipe: RecipeState = {
          ...recipe,
          pose: null,
          costume: null,
          portrait: null,
          extraImages: [],
        }
        const fallbackPrompt = buildRecipePrompt(fallbackRecipe, stylePreset, {
          ...promptBuildOptions,
          singleStitchedSheet: false,
          textDescriptions: {
            pose: poseDesc || undefined,
            costume: costumeDesc || undefined,
            portrait: portraitDesc || undefined,
            extras: extraDescItems.length > 0 ? extraDescItems : undefined,
          },
        })

        auditTrace.textFallbackInfo = {
          triggered: true,
          poseCacheHit: poseDescRes?.cacheHit,
          costumeCacheHit: costumeDescRes?.cacheHit,
          portraitCacheHit: portraitDescRes?.cacheHit,
          extraCacheHits:
            extraDescItems.length > 0
              ? extraDescItems.map((item) => item.cacheHit)
              : undefined,
          poseDescription: poseDesc || undefined,
          costumeDescription: costumeDesc || undefined,
          portraitDescription: portraitDesc || undefined,
          extraDescriptions:
            extraDescItems.length > 0
              ? extraDescItems.map((item) =>
                  item.name ? `[${item.name}] ${item.description}` : item.description
                )
              : undefined,
          visionModel: firstVisionModel,
          visionSupplierName: firstSupplierName,
        }
        auditTrace.promptBreakdown.finalPrompt = fallbackPrompt
        await updateJobTrace(env.DB, jobId, JSON.stringify(auditTrace))

        const usedModelLabel = auditTrace.textFallbackInfo.visionModel || visionCfg.model
        const descSources: string[] = []
        if (poseDesc) {
          descSources.push(
            `姿势图(${poseDescRes?.cacheHit ? '命中库缓存' : `即时转译:${usedModelLabel}`})`
          )
        }
        if (costumeDesc) {
          descSources.push(
            `服装图(${costumeDescRes?.cacheHit ? '命中库缓存' : `即时转译:${usedModelLabel}`})`
          )
        }
        if (portraitDesc) {
          descSources.push(
            `人像图(${portraitDescRes?.cacheHit ? '命中库缓存' : `即时转译:${usedModelLabel}`})`
          )
        }
        if (extraDescItems.length > 0) {
          const cacheHits = extraDescItems.filter((x) => x.cacheHit).length
          descSources.push(
            `附加图x${extraDescItems.length}(${cacheHits === extraDescItems.length ? '全部命中缓存' : `即时转译:${usedModelLabel}`})`
          )
        }

        preparedTextGen = { fallbackRecipe, fallbackPrompt, descSources }
      } catch (transcribeErr) {
        lastErr = transcribeErr
        const tMsg =
          transcribeErr instanceof Error ? transcribeErr.message : '参考图转文字失败'
        attemptLogs.push(`[参考图转文字] ${tMsg}`)
        auditTrace.textFallbackInfo = {
          ...(auditTrace.textFallbackInfo || { triggered: true }),
          triggered: true,
          error: tMsg,
        }
        await updateJobTrace(env.DB, jobId, JSON.stringify(auditTrace))
      }

      if (preparedTextGen) {
        for (let idx = 0; idx < executionPlan.length; idx++) {
          const step = executionPlan[idx]
          const targetChannel =
            step.triggerType === 'fallback_retry'
              ? channels.find(
                  (ch) =>
                    !channelConfigFailed.has(ch.channelId) &&
                    !failedKeyTokens.has(getChannelKeyToken(ch))
                ) ?? null
              : step.channel
          if (!targetChannel) break
          if (
            step.triggerType !== 'fallback_retry' &&
            (channelConfigFailed.has(targetChannel.channelId) ||
              siteFailedChannels.has(targetChannel.channelId) ||
              failedKeyTokens.has(getChannelKeyToken(targetChannel)))
          ) {
            continue
          }

          lastAttemptedChannel = targetChannel
          if (idx > 0) {
            if (Date.now() - startedAt > retryCutoffMs) break
            await publishProgress(
              'retrying',
              '正在根据文字描述重试绘制…',
              Math.min(74, 52 + idx * 10),
              { attempt: idx + 1, totalAttempts: totalPlanned, persist: true }
            )
            if (step.delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, step.delayMs))
            }
          } else {
            await publishProgress('text_generating', '正在根据文字描述绘制中…', 52, {
              attempt: 1,
              totalAttempts: totalPlanned,
              persist: true,
            })
          }

          const prevErrMsg =
            lastErr instanceof Error ? lastErr.message : lastErr ? String(lastErr) : null
          const triggerReason = describeFailoverReason(
            idx,
            step,
            targetChannel,
            preparedTextGen.descSources
          )

          try {
            if (targetChannel.supplierKeyId) {
              await markSupplierKeyDispatched(env.DB, targetChannel.supplierKeyId).catch(() => {})
            }
            output = await runServerGeneration({
              env,
              channel: targetChannel,
              prompt: preparedTextGen.fallbackPrompt,
              recipe: preparedTextGen.fallbackRecipe,
              userId,
              aspectRatio,
              resolution: selectedResolution,
              imagePassMode: platform.imagePassMode,
              requestOrigin,
              includeStitchedWithMulti: false,
              allowZeroImages: true,
              traceContext: {
                nextAttemptIndex: () => auditTrace.attempts.length + 1,
                triggerType: idx === 0 ? 'text_fallback' : step.triggerType,
                triggerReason,
                previousError: prevErrMsg,
                delayMs: step.delayMs,
                onStage: async (phase, phaseMsg) => {
                  if (phase === 'generating') {
                    await publishProgress(
                      idx === 0 ? 'text_generating' : 'retrying',
                      '正在根据文字描述绘制中…',
                      idx === 0 ? 58 : Math.min(76, 56 + idx * 10),
                      { attempt: idx + 1, totalAttempts: totalPlanned, persist: true }
                    )
                  } else if (phase === 'downloading_output') {
                    await publishProgress('downloading_output', phaseMsg, 86, {
                      attempt: idx + 1,
                      totalAttempts: totalPlanned,
                      persist: true,
                    })
                  }
                },
                onAttempt: (attempt) => {
                  upsertAttemptTrace(attempt)
                },
              },
            })
            winningChannel = targetChannel
            if (auditTrace.textFallbackInfo) {
              delete auditTrace.textFallbackInfo.error
            }
            break
          } catch (fallbackErr) {
            lastErr = fallbackErr
            prevChannel = targetChannel
            const fMsg =
              fallbackErr instanceof Error ? fallbackErr.message : '图转文纯文生图失败'
            attemptLogs.push(`[图转文纯文生图(${targetChannel.channelName})] ${fMsg}`)
            auditTrace.textFallbackInfo = {
              ...(auditTrace.textFallbackInfo || { triggered: true }),
              triggered: true,
              error: fMsg,
            }
            await updateJobTrace(env.DB, jobId, JSON.stringify(auditTrace))

            const { shouldBreak } = await recordStepFailure(fallbackErr, targetChannel)
            if (shouldBreak) break
          }
        }
      }
    } else {
      for (let idx = 0; idx < executionPlan.length; idx++) {
        const step = executionPlan[idx]
        const targetChannel =
          step.triggerType === 'fallback_retry'
            ? channels.find(
                (ch) =>
                  !channelConfigFailed.has(ch.channelId) &&
                  !failedKeyTokens.has(getChannelKeyToken(ch))
              ) ?? null
            : step.channel
        if (!targetChannel) break
        if (
          step.triggerType !== 'fallback_retry' &&
          (channelConfigFailed.has(targetChannel.channelId) ||
            siteFailedChannels.has(targetChannel.channelId) ||
            failedKeyTokens.has(getChannelKeyToken(targetChannel)))
        ) {
          continue
        }

        lastAttemptedChannel = targetChannel
        if (idx > 0) {
          if (Date.now() - startedAt > retryCutoffMs) break
          await publishProgress(
            'retrying',
            '正在绘制中…',
            Math.min(74, 42 + idx * 10),
            { attempt: idx + 1, persist: true }
          )
          if (step.delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, step.delayMs))
          }
        }

        const prevErrMsg =
          lastErr instanceof Error ? lastErr.message : lastErr ? String(lastErr) : null
        const triggerReason = describeFailoverReason(idx, step, targetChannel)

        try {
          const allowZeroImages =
            generationMode === 'prompt' && extractedSources.refs.length === 0
          if (idx === 0) {
            await publishProgress(
              'resolving_refs',
              allowZeroImages ? '正在准备提示词与画布…' : '正在准备参考素材…',
              24,
              { attempt: 1 }
            )
          }

          const targetUsesStitchedSingle =
            !allowZeroImages &&
            isChannelStitchedSingleMode(targetChannel, extractedSources.refs.length)
          const attemptPrompt = targetUsesStitchedSingle ? stitchedSinglePrompt : multiPrompt

          if (targetChannel.supplierKeyId) {
            await markSupplierKeyDispatched(env.DB, targetChannel.supplierKeyId).catch(() => {})
          }

          output = await runServerGeneration({
            env,
            channel: targetChannel,
            prompt: attemptPrompt,
            recipe,
            userId,
            aspectRatio,
            resolution: selectedResolution,
            imagePassMode: platform.imagePassMode,
            requestOrigin,
            stitchedR2Key:
              !allowZeroImages && (platform.sendStitchedSheet || targetUsesStitchedSingle)
                ? stitchedR2Key
                : undefined,
            includeStitchedWithMulti: !allowZeroImages && platform.sendStitchedSheet,
            allowZeroImages,
            traceContext: {
              nextAttemptIndex: () => auditTrace.attempts.length + 1,
              triggerType: step.triggerType,
              triggerReason,
              previousError: prevErrMsg,
              delayMs: step.delayMs,
              onReferencesResolved: (resolvedRefs) => {
                auditTrace.references = resolvedRefs
              },
              onStage: async (phase, phaseMsg) => {
                if (phase === 'resolving_refs') {
                  if (idx === 0) {
                    await publishProgress('resolving_refs', phaseMsg, 28, { attempt: idx + 1 })
                  }
                } else if (phase === 'generating') {
                  await publishProgress(
                    idx === 0 ? 'generating' : 'retrying',
                    '正在绘制中…',
                    idx === 0 ? 45 : Math.min(76, 48 + idx * 10),
                    { attempt: idx + 1, persist: true }
                  )
                } else if (phase === 'downloading_output') {
                  await publishProgress('downloading_output', phaseMsg, 82, {
                    attempt: idx + 1,
                    persist: true,
                  })
                }
              },
              onAttempt: (attempt) => {
                upsertAttemptTrace(attempt)
              },
            },
          })
          winningChannel = targetChannel
          break
        } catch (err) {
          lastErr = err
          prevChannel = targetChannel
          const msg = err instanceof Error ? err.message : '未知错误'
          attemptLogs.push(
            `[${targetChannel.channelName}(${targetChannel.supplierName}/${targetChannel.model})] ${msg}`
          )
          await updateJobTrace(env.DB, jobId, JSON.stringify(auditTrace))

          const { shouldBreak } = await recordStepFailure(err, targetChannel)
          if (shouldBreak) break
        }
      }
    }

    if (!output || !winningChannel) {
      const combinedRaw =
        attemptLogs.join(' | ') || (lastErr instanceof Error ? lastErr.message : '生成失败')
      throw new Error(combinedRaw)
    }

    if (winningChannel.supplierKeyId) {
      await markSupplierKeySuccess(env.DB, winningChannel.supplierKeyId).catch(() => {})
    }

    await publishProgress('saving', '正在保存成图…', 92, { persist: true })

    const r2Key = `generations/${userId}/${jobId}.${output.ext}`
    await env.BUCKET.put(r2Key, output.bytes, {
      httpMetadata: { contentType: output.mime },
      customMetadata: {
        userId,
        jobId,
        provider,
        profileId: profileRow.id,
        channelId: winningChannel.channelId,
      },
    })

    const finishedAt = Date.now()
    const winningAttempt = auditTrace.attempts[auditTrace.attempts.length - 1]
    const winningModel = winningAttempt?.model || winningChannel.model
    auditTrace.finishedAt = finishedAt
    auditTrace.totalDurationMs = Math.max(0, finishedAt - startedAt)
    auditTrace.finalError = null
    auditTrace.liveState = null
    auditTrace.result = {
      r2Key,
      mime: output.mime,
      bytes: output.bytes.byteLength,
      winningAttemptIndex: winningAttempt?.attemptIndex ?? 1,
      winningChannelId: winningChannel.channelId,
      winningChannelName: winningChannel.channelName,
      winningSupplierName: winningChannel.supplierName,
      ...(winningChannel.supplierKeyHint ? { winningSupplierKeyHint: winningChannel.supplierKeyHint } : {}),
      ...(winningChannel.supplierKeyLabel ? { winningSupplierKeyLabel: winningChannel.supplierKeyLabel } : {}),
      winningModel,
    }

    const updatedRow = await markJobSucceeded(env.DB, {
      jobId,
      resultR2Key: r2Key,
      resultMime: output.mime,
      resultBytes: output.bytes.byteLength,
      model: winningModel,
      channelId: winningChannel.channelId,
      channelName: winningChannel.channelName,
      supplierId: winningChannel.supplierId,
      supplierName: winningChannel.supplierName,
      traceJson: JSON.stringify(auditTrace),
    })

    if (!updatedRow) {
      await env.BUCKET.delete(r2Key).catch(() => {})
      throw new Error('任务超时或已被取消，系统已自动退还积分，请重新发起生成')
    }

    if (remixGalleryItemId) {
      await env.DB.prepare(
        `UPDATE gallery_items SET remix_count = remix_count + 1, updated_at = ? WHERE id = ? AND status = 'published'`
      )
        .bind(Date.now(), remixGalleryItemId)
        .run()
        .catch(() => {})
    }

    const mapped = mapJobRow(updatedRow)
    onEvent?.('done', {
      job: mapped,
      creditBalance: creditBalanceAfterDeduct,
    })
    return { status: 'succeeded', job: mapped }
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : '生成失败，请稍后重试'
    const finishedAt = Date.now()
    auditTrace.finishedAt = finishedAt
    auditTrace.totalDurationMs = Math.max(0, finishedAt - startedAt)
    auditTrace.creditsRefunded = effectiveCreditCost
    auditTrace.finalError = rawMessage
    auditTrace.liveState = null
    const refundRes = await refundFailedJob(env.DB, jobId, rawMessage, {
      traceJson: JSON.stringify(auditTrace),
      model: lastAttemptedChannel.model,
      channelId: lastAttemptedChannel.channelId,
      channelName: lastAttemptedChannel.channelName,
      supplierId: lastAttemptedChannel.supplierId,
      supplierName: lastAttemptedChannel.supplierName,
    })
    onEvent?.('error', {
      message: formatUserFacingGenerationError(
        rawMessage,
        provider,
        profileRow.display_name
      ),
      refunded: refundRes.refunded,
      creditBalance: refundRes.creditBalance ?? creditBalanceAfterDeduct,
      jobId,
    })
    return { status: 'failed', errorMessage: rawMessage }
  } finally {
    jobFinished = true
    clearInterval(heartbeatTimer)
  }
}

export async function executeQueuedJobById(env: Env, jobId: string): Promise<void> {
  const job = await env.DB.prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .bind(jobId)
    .first<JobRow>()
  if (!job || job.status !== 'processing') {
    return
  }

  let snapshot: GenerationSnapshot
  try {
    snapshot = JSON.parse(job.snapshot_json) as GenerationSnapshot
  } catch {
    await refundFailedJob(env.DB, jobId, '排队任务快照损坏，系统已自动退还积分')
    return
  }

  let queuePayload: QueuedJobPayload = { requestOrigin: '' }
  if (job.queue_payload_json) {
    try {
      queuePayload = JSON.parse(job.queue_payload_json) as QueuedJobPayload
    } catch {
      queuePayload = { requestOrigin: '' }
    }
  }

  const platform = await getPlatformConfig(env.DB)
  const providerRow = await env.DB.prepare(
    `SELECT * FROM provider_configs WHERE provider_id = ?`
  )
    .bind(job.provider)
    .first<ProviderRow>()
  if (!providerRow || providerRow.enabled !== 1) {
    await refundFailedJob(env.DB, jobId, '所选 AI 小画家已停用，系统已自动退还积分')
    return
  }

  const profileRow = await resolveProfileForGeneration(
    env.DB,
    job.provider,
    job.profile_id || snapshot.profileId || null
  )
  if (!profileRow || profileRow.enabled !== 1) {
    await refundFailedJob(env.DB, jobId, '所选画笔档位已停用或不存在，系统已自动退还积分')
    return
  }

  const channels = await selectOrderedRunnableChannels(env, job.provider, profileRow.id)
  if (channels.length === 0) {
    await refundFailedJob(env.DB, jobId, '当前画笔暂无可用上游渠道，系统已自动退还积分')
    return
  }

  const generationMode: StudioGenerationMode =
    queuePayload.generationMode === 'prompt' || snapshot.generationMode === 'prompt'
      ? 'prompt'
      : 'recipe'
  const userPrompt = (queuePayload.userPrompt ?? snapshot.userPrompt ?? '').trim()
  const remixGalleryItemId = queuePayload.remixGalleryItemId ?? snapshot.remixGalleryItemId

  let extractedSources: { refs: ResolvedSource[]; stitched?: ResolvedSource }
  try {
    extractedSources = extractRecipeSources(
      snapshot.recipe,
      job.user_id,
      queuePayload.stitchedR2Key
    )
    if (generationMode === 'recipe' && extractedSources.refs.length === 0) {
      throw new Error('缺少参考图')
    }
    if (generationMode === 'prompt' && !userPrompt) {
      throw new Error('缺少文生图提示词')
    }
  } catch (err) {
    await refundFailedJob(
      env.DB,
      jobId,
      err instanceof Error ? err.message : '排队任务参考图已失效，积分已自动退还'
    )
    return
  }

  const textFallbackOnly =
    generationMode === 'recipe' &&
    (queuePayload.textFallbackOnly === true || snapshot.textFallbackOnly === true)
  let effectiveChannels = channels
  if (textFallbackOnly) {
    const visionCfg = mergeVisionFallbackConfig(platform.visionFallback)
    if (!visionCfg.enabled) {
      await refundFailedJob(env.DB, jobId, '图转文纯文生图功能已关闭，系统已自动退还积分')
      return
    }
    const nativeChannels = channels.filter((ch) => isNativeArtistChannel(ch))
    if (nativeChannels.length === 0) {
      await refundFailedJob(env.DB, jobId, '当前画笔暂无可用图转文纯文生图渠道，系统已自动退还积分')
      return
    }
    effectiveChannels = nativeChannels
  }

  const executionPlan = buildExecutionPlan(effectiveChannels)
  const primaryChannel = effectiveChannels[0]
  const primaryUsesStitchedSingle =
    !textFallbackOnly &&
    Boolean(extractedSources.stitched) &&
    isChannelStitchedSingleMode(primaryChannel, extractedSources.refs.length)
  const resolvedStyleInfo = resolveStyleInfo(job.style_preset, platform)
  const allowFaceStyleShift = Boolean(snapshot.allowFaceStyleShift)
  const allowPoseStyleShift =
    typeof snapshot.allowPoseStyleShift === 'boolean'
      ? snapshot.allowPoseStyleShift
      : resolvedStyleInfo.poseMode === 'adaptive'
  const sceneNote = snapshot.sceneNote || ''

  const promptVariants =
    generationMode === 'prompt'
      ? (() => {
          const t2iPrompt = buildTextToImagePrompt(userPrompt, job.style_preset, {
            stylePresets: platform.stylePresets,
            styleCategories: platform.styleCategories,
            styleSubcategories: platform.styleSubcategories,
            hasReferenceImages: extractedSources.refs.length > 0,
          })
          return {
            promptBuildOptions: {
              prefix: '',
              suffix: '',
              negativePrompt: '',
              promptTemplate: platform.promptTemplate,
              poseSanitize: platform.poseSanitize,
              sceneNote: '',
              allowFaceStyleShift: false,
              allowPoseStyleShift: false,
              stylePresets: platform.stylePresets,
              styleCategories: platform.styleCategories,
              styleSubcategories: platform.styleSubcategories,
            },
            multiPrompt: t2iPrompt,
            stitchedSinglePrompt: t2iPrompt,
          }
        })()
      : buildGenerationPromptVariants({
          platform,
          recipe: snapshot.recipe,
          stylePreset: job.style_preset,
          sceneNote,
          allowFaceStyleShift,
          allowPoseStyleShift,
          primaryUsesStitchedSingle,
          hasStitchedSheet: Boolean(extractedSources.stitched),
          refCount: extractedSources.refs.length,
        })
  const { promptBuildOptions, multiPrompt, stitchedSinglePrompt } = promptVariants

  const startedAt = job.started_at ?? Date.now()
  let auditTrace: GenerationAuditTrace | null = null
  if (job.trace_json) {
    try {
      auditTrace = JSON.parse(job.trace_json) as GenerationAuditTrace
    } catch {
      auditTrace = null
    }
  }
  if (!auditTrace) {
    auditTrace = {
      version: 1,
      startedAt,
      finishedAt: null,
      totalDurationMs: null,
      creditsCost: job.credits_cost,
      creditsRefunded: 0,
      profileId: profileRow.id,
      profileName: profileRow.display_name,
      requestedResolution: (job.resolution as StudioResolution | null) ?? null,
      imagePassMode: platform.imagePassMode,
      sendStitchedSheet: Boolean(platform.sendStitchedSheet || primaryUsesStitchedSingle),
      promptBreakdown: {
        prefix: platform.defaultPromptPrefix,
        suffix: platform.defaultPromptSuffix,
        negativePrompt: mergeNegativePrompts(
          platform.defaultNegativePrompt,
          resolvedStyleInfo.negativePrompt
        ),
        sceneNote,
        stylePreset: job.style_preset,
        styleLabel: resolvedStyleInfo.label || job.style_preset,
        allowFaceStyleShift,
        allowPoseStyleShift,
        finalPrompt: job.prompt,
      },
      references: extractedSources.refs.map((src, idx) => ({
        index: idx + 1,
        slot: src.slot,
        label: src.label,
        sourceKind: src.kind,
        rawPath: src.rawPath,
      })),
      candidateChannels: effectiveChannels.map((ch, idx) => ({
        order: idx + 1,
        channelId: ch.channelId,
        channelName: ch.channelName,
        supplierName: ch.supplierName,
        ...(ch.supplierKeyHint ? { supplierKeyHint: ch.supplierKeyHint } : {}),
        ...(ch.supplierKeyLabel ? { supplierKeyLabel: ch.supplierKeyLabel } : {}),
        model: ch.model,
        priority: ch.priority,
      })),
      attempts: [],
      result: null,
      finalError: null,
    }
  }

  const userRow = await env.DB.prepare(`SELECT credit_balance FROM users WHERE id = ?`)
    .bind(job.user_id)
    .first<{ credit_balance: number }>()

  const selectedResolution: StudioResolution | null = normalizeStudioResolution(job.resolution)

  await executeGenerationJob({
    env,
    jobId,
    userId: job.user_id,
    provider: job.provider,
    profileRow,
    selectedResolution,
    effectiveCreditCost: job.credits_cost,
    creditBalanceAfterDeduct: userRow?.credit_balance ?? 0,
    channels: effectiveChannels,
    executionPlan,
    textFallbackOnly,
    generationMode,
    remixGalleryItemId,
    recipe: snapshot.recipe,
    extractedSources,
    stylePreset: job.style_preset,
    aspectRatio: (job.aspect_ratio as GenerationAspectRatio) || (generationMode === 'prompt' ? 'auto' : '3:4'),
    stitchedR2Key: queuePayload.stitchedR2Key,
    requestOrigin: queuePayload.requestOrigin || '',
    platform,
    promptBuildOptions,
    multiPrompt,
    stitchedSinglePrompt,
    auditTrace,
    startedAt,
  })
}
