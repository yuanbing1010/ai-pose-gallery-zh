import { Hono } from 'hono'
import {
  PROVIDER_ORDER,
  buildRecipePrompt,
  formatUserFacingGenerationError,
  getEffectiveProfileCreditCost,
  getEffectiveStyleCatalog,
  mergeNegativePrompts,
  resolveStyleInfo,
  type GenerationAttemptTriggerType,
  type GenerationAuditTrace,
  type GenerationLiveStage,
  type GenerationLiveState,
  type GenerationSnapshot,
  type ImageProviderId,
  type RecipeState,
  type StudioAspectRatio,
  type StudioResolution,
} from '../../shared/studio'
import { UpstreamError, extractRecipeSources, runServerGeneration, type ResolvedSource } from '../aiProviders'
import {
  deductCreditsAndCreateJob,
  getPlatformConfig,
  mapJobRow,
  markJobSucceeded,
  parseProfileRow,
  reapStaleProcessingJobs,
  refundFailedJob,
  resolveProfileForGeneration,
  selectOrderedRunnableChannels,
  updateJobTrace,
  type JobRow,
  type ProviderRow,
  type RunnableChannel,
} from '../db'
import { requireAuth } from '../middleware'
import type { AppEnv } from '../types'

const VALID_RATIOS = new Set<StudioAspectRatio>(['3:4', '1:1', '4:3', '9:16', '16:9'])

export const generationRoutes = new Hono<AppEnv>()

generationRoutes.use('*', requireAuth)

generationRoutes.get('/', async (c) => {
  const user = c.get('user')!
  await reapStaleProcessingJobs(c.env.DB, user.id)

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

  c.header('Cache-Control', 'no-store')
  return c.json({
    items: (listRes.results || []).map((row) => mapJobRow(row)),
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
  c.header('Cache-Control', 'no-store')
  return c.json({ job: mapJobRow(row) })
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
  if (row.status === 'processing') {
    return c.json({ error: { message: '进行中的任务无法删除' } }, 409)
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

  const provider = body.provider as ImageProviderId
  if (!PROVIDER_ORDER.includes(provider)) {
    return c.json({ error: { message: '不支持的AI小画家' } }, 400)
  }

  const platform = await getPlatformConfig(c.env.DB)
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

  const primaryChannel = channels[0]
  const finalPrompt = buildRecipePrompt(recipe, stylePreset, {
    prefix: platform.defaultPromptPrefix,
    suffix: platform.defaultPromptSuffix,
    negativePrompt: platform.defaultNegativePrompt,
    promptTemplate: platform.promptTemplate,
    poseSanitize: platform.poseSanitize,
    sceneNote,
    allowFaceStyleShift,
    stylePresets: platform.stylePresets,
    styleCategories: platform.styleCategories,
    styleSubcategories: platform.styleSubcategories,
    stylePromptOverrides: platform.stylePromptOverrides,
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
    aspectRatio,
    ...(selectedResolution ? { resolution: selectedResolution } : {}),
    sceneNote: sceneNote || undefined,
    provider,
    profileId: profileRow.id,
    profileName: profileRow.display_name,
    model: primaryChannel.model,
  }

  const initialSources =
    platform.sendStitchedSheet && extractedSources.stitched
      ? [...extractedSources.refs, extractedSources.stitched]
      : extractedSources.refs

  const createdAt = Date.now()
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
    sendStitchedSheet: platform.sendStitchedSheet,
    liveState: {
      stage: 'deducted',
      message: '准备中…',
      attempt: 0,
      totalAttempts: channels.length === 1 ? 3 : channels.length,
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
      finalPrompt,
    },
    references: initialSources.map((src, idx) => ({
      index: idx + 1,
      slot: src.slot,
      label: src.label,
      sourceKind: src.kind,
      rawPath: src.rawPath,
    })),
    candidateChannels: channels.map((ch, idx) => ({
      order: idx + 1,
      channelId: ch.channelId,
      channelName: ch.channelName,
      supplierName: ch.supplierName,
      model: ch.model,
      priority: ch.priority,
    })),
    attempts: [],
    result: null,
    finalError: null,
  }

  const jobId = crypto.randomUUID()
  let deductRes: { existing?: JobRow; creditBalance: number }
  try {
    deductRes = await deductCreditsAndCreateJob(c.env.DB, {
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
    })
  } catch {
    const freshUser = await c.env.DB.prepare(`SELECT credit_balance, status FROM users WHERE id = ?`)
      .bind(user.id)
      .first<{ credit_balance: number; status: string }>()
    if (!freshUser || freshUser.status !== 'active') {
      return c.json({ error: { message: '账号状态异常' } }, 403)
    }
    return c.json(
      {
        error: {
          message: `积分不足：本次需要 ${effectiveCreditCost} 积分，当前剩余 ${freshUser.credit_balance} 积分`,
          code: 'INSUFFICIENT_CREDITS',
        },
      },
      402
    )
  }

  if (deductRes.existing) {
    const ex = deductRes.existing
    if (ex.status === 'processing') {
      return c.json({ error: { message: '相同请求正在生成中，请稍候查看作品集' } }, 409)
    }
    if (ex.status === 'failed') {
      return c.json(
        {
          error: {
            message: formatUserFacingGenerationError(ex.error_message, ex.provider, ex.profile_name),
          },
        },
        409
      )
    }
    const job = mapJobRow(ex)
    const encoder = new TextEncoder()
    const quick = `event: done\ndata: ${JSON.stringify({ job, creditBalance: deductRes.creditBalance })}\n\n`
    return new Response(encoder.encode(quick), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }

  const requestOrigin = new URL(c.req.url).origin
  const encoder = new TextEncoder()

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
        const startedAt = createdAt
        auditTrace.startedAt = startedAt
        let lastAttemptedChannel: RunnableChannel = primaryChannel
        const totalPlanned = channels.length === 1 ? 3 : channels.length

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
          const nextLive: GenerationLiveState = {
            stage,
            message,
            attempt: opts?.attempt ?? auditTrace.liveState?.attempt ?? 1,
            totalAttempts: opts?.totalAttempts ?? totalPlanned,
            startedAt,
            stageStartedAt: Date.now(),
            percent,
          }
          auditTrace.liveState = nextLive
          sendEvent('progress', {
            ...nextLive,
            jobId,
            ...(typeof opts?.creditBalance === 'number'
              ? { creditBalance: opts.creditBalance }
              : {}),
          })
          if (opts?.persist) {
            await updateJobTrace(c.env.DB, jobId, JSON.stringify(auditTrace))
          }
        }

        try {
          await publishProgress(
            'deducted',
            '准备中…',
            14,
            { attempt: 0, creditBalance: deductRes.creditBalance }
          )

          // 构建执行队列：多渠道优先故障转移；单渠道允许瞬态重试最多 3 次
          const executionPlan: Array<{
            channel: RunnableChannel
            delayMs: number
            triggerType: GenerationAttemptTriggerType
          }> =
            channels.length === 1
              ? [
                  { channel: channels[0], delayMs: 0, triggerType: 'initial' },
                  { channel: channels[0], delayMs: 1500, triggerType: 'transient_retry' },
                  { channel: channels[0], delayMs: 3000, triggerType: 'transient_retry' },
                ]
              : channels.map((ch, idx) => ({
                  channel: ch,
                  delayMs: 0,
                  triggerType: idx === 0 ? 'initial' : 'failover_switch',
                }))

          let output: { bytes: Uint8Array; mime: string; ext: string } | null = null
          let winningChannel: RunnableChannel | null = null
          const attemptLogs: string[] = []
          let lastErr: unknown = null

          for (let idx = 0; idx < executionPlan.length; idx++) {
            const step = executionPlan[idx]
            lastAttemptedChannel = step.channel
            if (idx > 0) {
              if (Date.now() - startedAt > 140_000) break
              if (step.delayMs > 0) {
                await publishProgress(
                  'retrying',
                  '正在绘制中…',
                  Math.min(72, 42 + idx * 10),
                  { attempt: idx + 1, persist: true }
                )
                await new Promise((resolve) => setTimeout(resolve, step.delayMs))
              }
            }

            const prevErrMsg = lastErr instanceof Error ? lastErr.message : lastErr ? String(lastErr) : null
            const prevChannel = idx > 0 ? executionPlan[idx - 1].channel : null
            const triggerReason =
              idx === 0
                ? channels.length > 1
                  ? `首次调度（共 ${channels.length} 条可用渠道，按优先级选中「${step.channel.channelName}」）`
                  : `首次调度（单渠道「${step.channel.channelName}」）`
                : step.triggerType === 'failover_switch'
                  ? `上一渠道「${prevChannel?.channelName || ''} (${prevChannel?.model || ''})」调用失败，自动切换至备用渠道「${step.channel.channelName}」`
                  : `第 ${idx} 次请求出现可重试异常，等待 ${(step.delayMs / 1000).toFixed(1)}s 后进行第 ${idx + 1} 次自动重试`

            try {
              const attemptMsg = idx === 0 ? '正在准备参考素材…' : '正在绘制中…'

              await publishProgress(
                idx === 0 ? 'resolving_refs' : 'retrying',
                attemptMsg,
                idx === 0 ? 24 : Math.min(72, 42 + idx * 10),
                { attempt: idx + 1, persist: idx > 0 }
              )

              output = await runServerGeneration({
                env: c.env,
                channel: step.channel,
                prompt: finalPrompt,
                recipe,
                userId: user.id,
                aspectRatio,
                resolution: selectedResolution,
                imagePassMode: platform.imagePassMode,
                requestOrigin,
                stitchedR2Key: platform.sendStitchedSheet ? stitchedR2Key : undefined,
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
                        idx === 0 ? 45 : Math.min(74, 48 + idx * 10),
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
                    auditTrace.attempts.push(attempt)
                  },
                },
              })
              winningChannel = step.channel
              break
            } catch (err) {
              lastErr = err
              const msg = err instanceof Error ? err.message : '未知错误'
              attemptLogs.push(`[${step.channel.channelName}(${step.channel.supplierName}/${step.channel.model})] ${msg}`)
              await updateJobTrace(c.env.DB, jobId, JSON.stringify(auditTrace))
              if (err instanceof UpstreamError && err.safetyBlocked) {
                // 内容合规拦截不跨渠道重试
                break
              }
              if (channels.length === 1 && err instanceof UpstreamError && !err.retryable) {
                // 单渠道遇到明确的不可重试参数/鉴权错误不盲目重复
                break
              }
            }
          }

          // 若多渠道全部失败且至少有瞬态错误且时间宽裕，对首条渠道再兜底重试一次
          if (
            !output &&
            channels.length > 1 &&
            Date.now() - startedAt < 110_000 &&
            lastErr instanceof UpstreamError &&
            !lastErr.safetyBlocked &&
            lastErr.retryable
          ) {
            lastAttemptedChannel = channels[0]
            const prevErrMsg = lastErr instanceof Error ? lastErr.message : '未知错误'
            await publishProgress(
              'retrying',
              '正在绘制中…',
              76,
              { attempt: executionPlan.length + 1, persist: true }
            )
            await new Promise((resolve) => setTimeout(resolve, 1500))
            try {
              output = await runServerGeneration({
                env: c.env,
                channel: channels[0],
                prompt: finalPrompt,
                recipe,
                userId: user.id,
                aspectRatio,
                resolution: selectedResolution,
                imagePassMode: platform.imagePassMode,
                requestOrigin,
                stitchedR2Key: platform.sendStitchedSheet ? stitchedR2Key : undefined,
                traceContext: {
                  nextAttemptIndex: () => auditTrace.attempts.length + 1,
                  triggerType: 'fallback_retry',
                  triggerReason: `全部 ${channels.length} 条候选渠道均调用失败，延迟 1.5s 后回切首条渠道「${channels[0].channelName}」进行兜底重试`,
                  previousError: prevErrMsg,
                  delayMs: 1500,
                  onReferencesResolved: (resolvedRefs) => {
                    auditTrace.references = resolvedRefs
                  },
                  onStage: async (phase, phaseMsg) => {
                    if (phase === 'downloading_output') {
                      await publishProgress('downloading_output', phaseMsg, 84, {
                        attempt: executionPlan.length + 1,
                        persist: true,
                      })
                    }
                  },
                  onAttempt: (attempt) => {
                    auditTrace.attempts.push(attempt)
                  },
                },
              })
              winningChannel = channels[0]
            } catch (err) {
              lastErr = err
              const msg = err instanceof Error ? err.message : '未知错误'
              attemptLogs.push(`[兜底重试 ${channels[0].channelName}] ${msg}`)
              await updateJobTrace(c.env.DB, jobId, JSON.stringify(auditTrace))
            }
          }

          if (!output || !winningChannel) {
            const combinedRaw = attemptLogs.join(' | ') || (lastErr instanceof Error ? lastErr.message : '生成失败')
            throw new Error(combinedRaw)
          }

          await publishProgress('saving', '正在保存成图…', 92, { persist: true })

          const r2Key = `generations/${user.id}/${jobId}.${output.ext}`
          await c.env.BUCKET.put(r2Key, output.bytes, {
            httpMetadata: { contentType: output.mime },
            customMetadata: {
              userId: user.id,
              jobId,
              provider,
              profileId: profileRow.id,
              channelId: winningChannel.channelId,
            },
          })

          const finishedAt = Date.now()
          auditTrace.finishedAt = finishedAt
          auditTrace.totalDurationMs = Math.max(0, finishedAt - startedAt)
          auditTrace.finalError = null
          auditTrace.liveState = null
          auditTrace.result = {
            r2Key,
            mime: output.mime,
            bytes: output.bytes.byteLength,
            winningAttemptIndex: auditTrace.attempts[auditTrace.attempts.length - 1]?.attemptIndex ?? 1,
            winningChannelId: winningChannel.channelId,
            winningChannelName: winningChannel.channelName,
            winningSupplierName: winningChannel.supplierName,
            winningModel: winningChannel.model,
          }

          const updatedRow = await markJobSucceeded(c.env.DB, {
            jobId,
            resultR2Key: r2Key,
            resultMime: output.mime,
            resultBytes: output.bytes.byteLength,
            model: winningChannel.model,
            channelId: winningChannel.channelId,
            channelName: winningChannel.channelName,
            supplierId: winningChannel.supplierId,
            supplierName: winningChannel.supplierName,
            traceJson: JSON.stringify(auditTrace),
          })

          if (!updatedRow) {
            throw new Error('任务状态写入失败')
          }

          sendEvent('done', {
            job: mapJobRow(updatedRow),
            creditBalance: deductRes.creditBalance,
          })
        } catch (err) {
          const rawMessage = err instanceof Error ? err.message : '生成失败，请稍后重试'
          const finishedAt = Date.now()
          auditTrace.finishedAt = finishedAt
          auditTrace.totalDurationMs = Math.max(0, finishedAt - startedAt)
          auditTrace.creditsRefunded = effectiveCreditCost
          auditTrace.finalError = rawMessage
          auditTrace.liveState = null
          const refundRes = await refundFailedJob(c.env.DB, jobId, rawMessage, {
            traceJson: JSON.stringify(auditTrace),
            model: lastAttemptedChannel.model,
            channelId: lastAttemptedChannel.channelId,
            channelName: lastAttemptedChannel.channelName,
            supplierId: lastAttemptedChannel.supplierId,
            supplierName: lastAttemptedChannel.supplierName,
          })
          sendEvent('error', {
            message: formatUserFacingGenerationError(
              rawMessage,
              provider,
              profileRow.display_name
            ),
            refunded: refundRes.refunded,
            creditBalance: refundRes.creditBalance ?? deductRes.creditBalance,
            jobId,
          })
        } finally {
          closeStream()
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
      'X-Accel-Buffering': 'no',
    },
  })
})
