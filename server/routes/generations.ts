import { Hono } from 'hono'
import {
  PROVIDER_ORDER,
  formatUserFacingGenerationError,
  getEffectiveProfileCreditCost,
  getEffectiveStyleCatalog,
  isChannelStitchedSingleMode,
  isNativeArtistChannel,
  mergeGenerationQueueConfig,
  mergeNegativePrompts,
  mergeVisionFallbackConfig,
  resolveStyleInfo,
  type GenerationAuditTrace,
  type GenerationSnapshot,
  type ImageProviderId,
  type RecipeState,
  type StudioAspectRatio,
  type StudioResolution,
} from '../../shared/studio'
import { extractRecipeSources, type ResolvedSource } from '../aiProviders'
import {
  computeQueuePositions,
  getPlatformConfig,
  listActiveQueueRows,
  mapJobRow,
  parseProfileRow,
  reapStaleProcessingJobs,
  resolveProfileForGeneration,
  selectOrderedRunnableChannels,
  type JobRow,
  type ProviderRow,
} from '../db'
import {
  buildExecutionPlan,
  buildGenerationPromptVariants,
  executeGenerationJob,
  type QueuedJobPayload,
} from '../generationExecutor'
import {
  admitOrEnqueueViaCoordinator,
  cancelQueuedJobViaCoordinator,
  notifyJobFinished,
  reconcileQueueViaCoordinator,
} from '../generationQueue'
import { requireAuth } from '../middleware'
import type { AppEnv } from '../types'

const VALID_RATIOS = new Set<StudioAspectRatio>(['3:4', '1:1', '4:3', '9:16', '16:9'])

export const generationRoutes = new Hono<AppEnv>()

generationRoutes.use('*', requireAuth)

generationRoutes.get('/', async (c) => {
  const user = c.get('user')!
  const reapRes = await reapStaleProcessingJobs(c.env.DB, user.id)
  if (reapRes.reapedProcessing > 0 || reapRes.reapedQueued > 0) {
    try {
      c.executionCtx.waitUntil(reconcileQueueViaCoordinator(c.env))
    } catch {
      // non-worker environment
    }
  }

  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '60') || 60))
  const offset = Math.max(0, Number(c.req.query('offset') || '0') || 0)

  const [listRes, countRes, userRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM generation_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(user.id, limit, offset)
      .all<JobRow>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM generation_jobs WHERE user_id = ?`)
      .bind(user.id)
      .first<{ total: number }>(),
    c.env.DB.prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(user.id)
      .first<{ credit_balance: number }>(),
  ])

  const rows = listRes.results || []
  const hasQueued = rows.some((r) => r.status === 'queued')
  let queueMap = new Map<string, ReturnType<typeof computeQueuePositions> extends Map<string, infer V> ? V : never>()
  if (hasQueued) {
    const [activeRows, platform] = await Promise.all([
      listActiveQueueRows(c.env.DB),
      getPlatformConfig(c.env.DB),
    ])
    queueMap = computeQueuePositions(activeRows, mergeGenerationQueueConfig(platform.queueConfig))
  }

  c.header('Cache-Control', 'no-store')
  return c.json({
    items: rows.map((row) =>
      mapJobRow(row, {
        queueInfo: row.status === 'queued' ? queueMap.get(row.id) ?? null : null,
      })
    ),
    total: countRes?.total ?? 0,
    creditBalance: userRes?.credit_balance ?? user.creditBalance,
  })
})

generationRoutes.get('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .bind(id)
    .first<JobRow>()
  if (!row) {
    return c.json({ error: { message: '生成记录不存在' } }, 404)
  }
  if (row.user_id !== user.id && user.role !== 'admin') {
    return c.json({ error: { message: '无权查看该记录' } }, 403)
  }

  let queueInfo = null
  if (row.status === 'queued') {
    const [activeRows, platform] = await Promise.all([
      listActiveQueueRows(c.env.DB),
      getPlatformConfig(c.env.DB),
    ])
    queueInfo =
      computeQueuePositions(activeRows, mergeGenerationQueueConfig(platform.queueConfig)).get(row.id) ??
      null
  }

  c.header('Cache-Control', 'no-store')
  return c.json({ job: mapJobRow(row, { queueInfo }) })
})

generationRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const res = await cancelQueuedJobViaCoordinator(c.env, {
    jobId: id,
    expectedUserId: user.role === 'admin' ? undefined : user.id,
    reason: '用户已取消排队，积分已全额退还',
    ledgerNote: '用户取消排队退还',
  })

  if (res.notFound) {
    return c.json({ error: { message: '生成记录不存在' } }, 404)
  }
  if (res.forbidden) {
    return c.json({ error: { message: '无权操作该排队任务' } }, 403)
  }
  if (!res.cancelled) {
    const message =
      res.alreadyStatus === 'processing'
        ? '该任务已轮到并开始绘制，无法取消排队'
        : res.alreadyStatus === 'cancelled'
          ? '该任务已经取消排队'
          : '该任务已完结，无法取消排队'
    return c.json({ error: { message } }, 409)
  }

  c.header('Cache-Control', 'no-store')
  return c.json({
    ok: true,
    job: res.job ? mapJobRow(res.job) : null,
    refunded: res.refunded,
    creditBalance: res.creditBalance ?? user.creditBalance,
  })
})

generationRoutes.delete('/:id', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(`SELECT * FROM generation_jobs WHERE id = ?`)
    .bind(id)
    .first<JobRow>()
  if (!row) {
    return c.json({ error: { message: '生成记录不存在' } }, 404)
  }
  if (row.user_id !== user.id && user.role !== 'admin') {
    return c.json({ error: { message: '无权删除该记录' } }, 403)
  }
  if (row.status === 'processing' || row.status === 'queued') {
    return c.json({ error: { message: '排队或绘制中的任务无法删除，请先取消排队或等待完成' } }, 409)
  }

  if (row.result_r2_key) {
    try {
      await c.env.BUCKET.delete(row.result_r2_key)
    } catch {
      // ignore R2 cleanup error
    }
  }
  await c.env.DB.prepare(`DELETE FROM generation_jobs WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

generationRoutes.post('/', async (c) => {
  const user = c.get('user')!
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { message: '请求体 JSON 格式无效' } }, 400)
  }

  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim().slice(0, 100)
      : crypto.randomUUID()
  const textFallbackOnly = body.textFallbackOnly === true

  const provider = body.provider as ImageProviderId
  if (!PROVIDER_ORDER.includes(provider)) {
    return c.json({ error: { message: '不支持的AI小画家' } }, 400)
  }

  const platform = await getPlatformConfig(c.env.DB)
  const visionCfg = mergeVisionFallbackConfig(platform.visionFallback)
  const styleCatalog = getEffectiveStyleCatalog(platform)
  const rawStyle = typeof body.stylePreset === 'string' ? body.stylePreset : platform.defaultStylePreset
  const stylePreset =
    rawStyle === 'none' || styleCatalog.some((s) => s.id === rawStyle) ? rawStyle : 'none'
  const resolvedStyleInfo = resolveStyleInfo(stylePreset, platform)
  const mergedNegativePrompt = mergeNegativePrompts(
    platform.defaultNegativePrompt,
    resolvedStyleInfo.negativePrompt
  )

  const rawRatio = typeof body.aspectRatio === 'string' ? (body.aspectRatio as StudioAspectRatio) : '3:4'
  const aspectRatio: StudioAspectRatio = VALID_RATIOS.has(rawRatio) ? rawRatio : '3:4'
  const sceneNote =
    typeof body.sceneNote === 'string'
      ? body.sceneNote.replace(/\r\n?/g, '\n').trim().slice(0, 500)
      : ''
  const allowFaceStyleShift = body.allowFaceStyleShift === true
  const allowPoseStyleShift =
    typeof body.allowPoseStyleShift === 'boolean'
      ? body.allowPoseStyleShift
      : resolvedStyleInfo.poseMode === 'adaptive'
  const stitchedR2Key = typeof body.stitchedR2Key === 'string' ? body.stitchedR2Key.trim() : undefined

  const recipe = (body.recipe || {}) as RecipeState
  if (!recipe || typeof recipe !== 'object') {
    return c.json({ error: { message: '缺少角色配方信息' } }, 400)
  }

  let extractedSources: { refs: ResolvedSource[]; stitched?: ResolvedSource }
  try {
    extractedSources = extractRecipeSources(recipe, user.id, stitchedR2Key)
    if (extractedSources.refs.length === 0) {
      return c.json({ error: { message: '请至少选择或上传 1 张参考图' } }, 400)
    }
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : '参考图配置无效' } },
      400
    )
  }

  const providerRow = await c.env.DB.prepare(
    `SELECT * FROM provider_configs WHERE provider_id = ?`
  )
    .bind(provider)
    .first<ProviderRow>()

  if (!providerRow || providerRow.enabled !== 1) {
    return c.json({ error: { message: '这位AI小画家外出采风啦，请换位AI小画家出马！' } }, 400)
  }

  const requestedProfileId =
    typeof body.modelProfileId === 'string' ? body.modelProfileId.trim() : ''
  const profileRow = await resolveProfileForGeneration(
    c.env.DB,
    provider,
    requestedProfileId || null
  )
  if (!profileRow) {
    return c.json({ error: { message: 'AI小画家口袋里暂时没带画笔，请换位试试！' } }, 400)
  }
  if (profileRow.enabled !== 1) {
    return c.json(
      { error: { message: '这支画笔正在闭关磨尖中，请切换其他画笔试试！' } },
      400
    )
  }

  const parsedProfile = parseProfileRow(profileRow)
  const enabledResolutions = parsedProfile.resolutions.filter((r) => r.enabled)
  const rawResolution =
    typeof body.resolution === 'string' ? body.resolution.trim().toUpperCase() : ''

  let selectedResolution: StudioResolution | null = null
  if (enabledResolutions.length > 0) {
    if (rawResolution) {
      const matched = enabledResolutions.find((r) => r.resolution === rawResolution)
      if (!matched) {
        return c.json(
          { error: { message: `当前画笔暂未开启 ${rawResolution} 分辨率，请换个清晰度` } },
          400
        )
      }
      selectedResolution = matched.resolution
    } else {
      selectedResolution = parsedProfile.defaultResolution ?? enabledResolutions[0].resolution
    }
  }

  const effectiveCreditCost = getEffectiveProfileCreditCost(
    { creditCost: profileRow.credit_cost, resolutions: parsedProfile.resolutions },
    selectedResolution
  )

  const channels = await selectOrderedRunnableChannels(c.env, provider, profileRow.id)
  if (channels.length === 0) {
    return c.json(
      { error: { message: 'AI小画家暂时开小差啦，换支画笔或换位AI小画家试试！' } },
      503
    )
  }

  let effectiveChannels = channels
  if (textFallbackOnly) {
    if (!visionCfg.enabled) {
      return c.json({ error: { message: '当前暂未开启图转文生图功能' } }, 400)
    }
    const nativeChannels = channels.filter((ch) => isNativeArtistChannel(ch))
    if (nativeChannels.length === 0) {
      return c.json(
        { error: { message: '当前画笔暂不支持图转文纯文生图模式，请换支画笔或换位AI小画家试试' } },
        400
      )
    }
    effectiveChannels = nativeChannels
  }

  const primaryChannel = effectiveChannels[0]
  const executionPlan = buildExecutionPlan(effectiveChannels)
  const primaryUsesStitchedSingle =
    !textFallbackOnly &&
    Boolean(extractedSources.stitched) &&
    isChannelStitchedSingleMode(primaryChannel, extractedSources.refs.length)

  const { promptBuildOptions, finalPrompt, multiPrompt, stitchedSinglePrompt } =
    buildGenerationPromptVariants({
      platform,
      recipe,
      stylePreset,
      sceneNote,
      allowFaceStyleShift,
      allowPoseStyleShift,
      primaryUsesStitchedSingle,
      hasStitchedSheet: Boolean(extractedSources.stitched),
      refCount: extractedSources.refs.length,
    })

  const recipeSummary =
    [
      recipe.pose?.姿势名称,
      recipe.costume?.服装名称,
      recipe.portrait?.发型名称,
    ]
      .filter(Boolean)
      .join(' + ') || '自定义合成'

  const snapshot: GenerationSnapshot = {
    recipe,
    prompt: finalPrompt,
    stylePreset,
    allowFaceStyleShift,
    allowPoseStyleShift,
    aspectRatio,
    ...(selectedResolution ? { resolution: selectedResolution } : {}),
    sceneNote: sceneNote || undefined,
    ...(textFallbackOnly ? { textFallbackOnly: true } : {}),
    provider,
    profileId: profileRow.id,
    profileName: profileRow.display_name,
    model: primaryChannel.model,
  }

  const initialSources = textFallbackOnly
    ? extractedSources.refs
    : primaryUsesStitchedSingle && extractedSources.stitched
      ? [extractedSources.stitched]
      : platform.sendStitchedSheet && extractedSources.stitched
        ? [...extractedSources.refs, extractedSources.stitched]
        : extractedSources.refs

  const createdAt = Date.now()
  const traceChannels = effectiveChannels
  const auditTrace: GenerationAuditTrace = {
    version: 1,
    startedAt: createdAt,
    finishedAt: null,
    totalDurationMs: null,
    creditsCost: effectiveCreditCost,
    creditsRefunded: 0,
    profileId: profileRow.id,
    profileName: profileRow.display_name,
    requestedResolution: selectedResolution,
    imagePassMode: platform.imagePassMode,
    sendStitchedSheet: textFallbackOnly
      ? false
      : platform.sendStitchedSheet || primaryUsesStitchedSingle,
    ...(textFallbackOnly
      ? {
          textFallbackInfo: {
            triggered: true,
          },
        }
      : {}),
    liveState: {
      stage: 'deducted',
      message: '准备中…',
      attempt: 0,
      totalAttempts: executionPlan.length,
      startedAt: createdAt,
      stageStartedAt: createdAt,
      percent: 12,
    },
    promptBreakdown: {
      prefix: platform.defaultPromptPrefix,
      suffix: platform.defaultPromptSuffix,
      negativePrompt: mergedNegativePrompt,
      sceneNote,
      stylePreset,
      styleLabel: resolvedStyleInfo.label || stylePreset,
      allowFaceStyleShift,
      allowPoseStyleShift,
      finalPrompt,
    },
    references: initialSources.map((src, idx) => ({
      index: idx + 1,
      slot: src.slot,
      label: src.label,
      sourceKind: src.kind,
      rawPath: src.rawPath,
    })),
    candidateChannels: traceChannels.map((ch, idx) => ({
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

  const jobId = crypto.randomUUID()
  const requestOrigin = new URL(c.req.url).origin
  const queuePayload: QueuedJobPayload = {
    requestOrigin,
    ...(stitchedR2Key ? { stitchedR2Key } : {}),
    ...(textFallbackOnly ? { textFallbackOnly: true } : {}),
  }

  const admitRes = await admitOrEnqueueViaCoordinator(c.env, {
    jobId,
    userId: user.id,
    idempotencyKey,
    provider,
    profileId: profileRow.id,
    profileName: profileRow.display_name,
    resolution: selectedResolution,
    model: primaryChannel.model,
    channelId: primaryChannel.channelId,
    channelName: primaryChannel.channelName,
    supplierId: primaryChannel.supplierId,
    supplierName: primaryChannel.supplierName,
    creditsCost: effectiveCreditCost,
    prompt: finalPrompt,
    recipeSummary,
    aspectRatio,
    stylePreset,
    snapshotJson: JSON.stringify(snapshot),
    traceJson: JSON.stringify(auditTrace),
    queuePayloadJson: JSON.stringify(queuePayload),
  })

  if (admitRes.kind === 'error') {
    return c.json(
      { error: { message: admitRes.message, code: admitRes.code } },
      admitRes.status
    )
  }

  if (admitRes.kind === 'existing') {
    const ex = admitRes.existing
    if (ex.status === 'queued') {
      return c.json({ error: { message: '相同请求已在排队队列中，请稍候查看作品集' } }, 409)
    }
    if (ex.status === 'processing') {
      return c.json({ error: { message: '相同请求正在生成中，请稍候查看作品集' } }, 409)
    }
    if (ex.status === 'failed' || ex.status === 'cancelled') {
      return c.json(
        {
          error: {
            message:
              ex.status === 'cancelled'
                ? ex.error_message || '该任务已取消排队'
                : formatUserFacingGenerationError(ex.error_message, ex.provider, ex.profile_name),
          },
        },
        409
      )
    }
    const job = mapJobRow(ex)
    const encoder = new TextEncoder()
    const quick = `event: done\ndata: ${JSON.stringify({ job, creditBalance: admitRes.creditBalance })}\n\n`
    return new Response(encoder.encode(quick), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }

  const encoder = new TextEncoder()

  if (admitRes.kind === 'queued') {
    const queuedEvent = `event: queued\ndata: ${JSON.stringify({
      job: admitRes.job,
      creditBalance: admitRes.creditBalance,
      queueInfo: admitRes.queueInfo,
    })}\n\n`
    return new Response(encoder.encode(queuedEvent), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }

  let streamClosed = false
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          streamClosed = true
        }
      }

      const sendComment = (text: string) => {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`))
        } catch {
          streamClosed = true
        }
      }

      const closeStream = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (!streamClosed) {
          streamClosed = true
          try {
            controller.close()
          } catch {
            // ignore already closed
          }
        }
      }

      heartbeatTimer = setInterval(() => sendComment('keepalive'), 4000)

      const workPromise = (async () => {
        try {
          await executeGenerationJob({
            env: c.env,
            jobId,
            userId: user.id,
            provider,
            profileRow,
            selectedResolution,
            effectiveCreditCost,
            creditBalanceAfterDeduct: admitRes.creditBalance,
            channels: effectiveChannels,
            executionPlan,
            textFallbackOnly,
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
            startedAt: Date.now(),
            onEvent: sendEvent,
          })
        } finally {
          try {
            await notifyJobFinished(c.env, jobId)
          } finally {
            closeStream()
          }
        }
      })()

      try {
        c.executionCtx.waitUntil(workPromise)
      } catch {
        // non-worker test environment
      }
    },
    cancel() {
      streamClosed = true
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
})
