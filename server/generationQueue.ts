import { DurableObject } from 'cloudflare:workers'
import {
  PROVIDER_ORDER,
  getStudioArtist,
  mergeGenerationQueueConfig,
  normalizeStudioResolution,
  resolveProfileConcurrencyLimit,
  type AdminQueueJobItem,
  type AdminQueueModelStat,
  type AdminQueueSnapshotDTO,
  type GenerationAuditTrace,
  type GenerationHistoryItem,
  type GenerationQueueInfo,
  type GenerationStatus,
  type ImageProviderId,
  type GenerationAspectRatio,
  type StudioResolution,
} from '../shared/studio'
import {
  cancelQueuedJob,
  computeQueuePositions,
  deductCreditsAndCreateJob,
  forceCancelProcessingJob,
  getAllModelProfiles,
  getPlatformConfig,
  listActiveQueueRows,
  mapJobRow,
  promoteQueuedJobToProcessing,
  reapStaleProcessingJobs,
  refundFailedJob,
  type JobRow,
} from './db'
import { executeQueuedJobById } from './generationExecutor'
import { logError } from './logger'
import { refreshSupplierOAuthKeyDirect } from './supplierOAuth'
import type { Env } from './types'

const RUNNER_POOL_SIZE = 16
const SWEEP_MIN_INTERVAL_MS = 5_000
const ALARM_INTERVAL_MS = 15_000

export interface AdmitJobInput {
  jobId: string
  userId: string
  idempotencyKey: string
  provider: ImageProviderId
  profileId: string | null
  profileName: string | null
  resolution: StudioResolution | null
  model: string
  channelId: string | null
  channelName: string | null
  supplierId: string | null
  supplierName: string | null
  creditsCost: number
  prompt: string
  recipeSummary: string
  aspectRatio: GenerationAspectRatio
  stylePreset: string
  snapshotJson: string
  traceJson: string
  queuePayloadJson: string
}

export type AdmitJobOutcome =
  | { kind: 'existing'; existing: JobRow; creditBalance: number }
  | { kind: 'admitted'; jobId: string; creditBalance: number }
  | {
      kind: 'queued'
      jobId: string
      creditBalance: number
      job: GenerationHistoryItem
      queueInfo: GenerationQueueInfo
    }
  | { kind: 'error'; status: 402 | 403 | 429; code: string; message: string }

type InternalAdmitOutcome = AdmitJobOutcome & { promotedIds?: string[] }

function hashToRunnerIndex(jobId: string): number {
  let h = 2166136261
  for (let i = 0; i < jobId.length; i++) {
    h ^= jobId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % RUNNER_POOL_SIZE
}

function parseLiveStateFromTrace(
  traceJson?: string | null
): { stage: AdminQueueJobItem['liveStage']; message: string | null } {
  if (!traceJson) return { stage: null, message: null }
  try {
    const parsed = JSON.parse(traceJson) as GenerationAuditTrace
    return {
      stage: parsed.liveState?.stage ?? null,
      message: parsed.liveState?.message ?? null,
    }
  } catch {
    return { stage: null, message: null }
  }
}

async function promoteEligibleQueuedJobs(db: D1Database): Promise<{
  promotedIds: string[]
  hasAnyActive: boolean
}> {
  const [platform, activeRows] = await Promise.all([
    getPlatformConfig(db),
    listActiveQueueRows(db),
  ])
  const queueConfig = mergeGenerationQueueConfig(platform.queueConfig)

  let globalRunning = 0
  const modelRunning = new Map<string, number>()
  const userRunning = new Map<string, number>()
  const queuedRows: JobRow[] = []

  for (const row of activeRows) {
    if (row.status === 'processing') {
      globalRunning += 1
      const mKey = row.profile_id || row.provider
      modelRunning.set(mKey, (modelRunning.get(mKey) ?? 0) + 1)
      userRunning.set(row.user_id, (userRunning.get(row.user_id) ?? 0) + 1)
    } else if (row.status === 'queued') {
      queuedRows.push(row)
    }
  }

  queuedRows.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))

  const promotedIds: string[] = []
  for (const row of queuedRows) {
    if (globalRunning >= queueConfig.maxGlobalConcurrency) {
      break
    }
    const mKey = row.profile_id || row.provider
    const modelLimit = resolveProfileConcurrencyLimit(queueConfig, row.profile_id)
    if ((modelRunning.get(mKey) ?? 0) >= modelLimit) {
      continue
    }
    if ((userRunning.get(row.user_id) ?? 0) >= queueConfig.maxUserConcurrency) {
      continue
    }

    const ok = await promoteQueuedJobToProcessing(db, row.id, Date.now())
    if (ok) {
      globalRunning += 1
      modelRunning.set(mKey, (modelRunning.get(mKey) ?? 0) + 1)
      userRunning.set(row.user_id, (userRunning.get(row.user_id) ?? 0) + 1)
      promotedIds.push(row.id)
    }
  }

  const remainingQueued = queuedRows.length - promotedIds.length
  return {
    promotedIds,
    hasAnyActive: globalRunning > 0 || remainingQueued > 0,
  }
}

async function performAdmitOrEnqueue(
  db: D1Database,
  input: AdmitJobInput
): Promise<{ outcome: AdmitJobOutcome; promotedIds: string[]; hasAnyActive: boolean }> {
  const existing = await db
    .prepare(`SELECT * FROM generation_jobs WHERE user_id = ? AND idempotency_key = ?`)
    .bind(input.userId, input.idempotencyKey)
    .first<JobRow>()
  if (existing) {
    const userRow = await db
      .prepare(`SELECT credit_balance FROM users WHERE id = ?`)
      .bind(input.userId)
      .first<{ credit_balance: number }>()
    return {
      outcome: { existing, kind: 'existing', creditBalance: userRow?.credit_balance ?? 0 },
      promotedIds: [],
      hasAnyActive: false,
    }
  }

  const promoted = await promoteEligibleQueuedJobs(db)

  const [platform, activeRows] = await Promise.all([
    getPlatformConfig(db),
    listActiveQueueRows(db),
  ])
  const queueConfig = mergeGenerationQueueConfig(platform.queueConfig)

  let globalRunning = 0
  let globalQueued = 0
  let userQueued = 0
  const modelRunning = new Map<string, number>()
  const userRunning = new Map<string, number>()

  for (const row of activeRows) {
    if (row.status === 'processing') {
      globalRunning += 1
      const mKey = row.profile_id || row.provider
      modelRunning.set(mKey, (modelRunning.get(mKey) ?? 0) + 1)
      userRunning.set(row.user_id, (userRunning.get(row.user_id) ?? 0) + 1)
    } else if (row.status === 'queued') {
      globalQueued += 1
      if (row.user_id === input.userId) {
        userQueued += 1
      }
    }
  }

  const mKey = input.profileId || input.provider
  const modelLimit = resolveProfileConcurrencyLimit(queueConfig, input.profileId)
  const userRunCount = userRunning.get(input.userId) ?? 0
  const modelRunCount = modelRunning.get(mKey) ?? 0

  const canRunNow =
    globalRunning < queueConfig.maxGlobalConcurrency &&
    userRunCount < queueConfig.maxUserConcurrency &&
    modelRunCount < modelLimit

  if (!canRunNow) {
    if (queueConfig.maxUserQueuedJobs <= 0) {
      return {
        outcome: {
          kind: 'error',
          status: 429,
          code: 'QUEUE_DISABLED',
          message: '当前绘制并发已满，请等待已有任务完成后再试',
        },
        promotedIds: promoted.promotedIds,
        hasAnyActive: true,
      }
    }
    if (userQueued >= queueConfig.maxUserQueuedJobs) {
      return {
        outcome: {
          kind: 'error',
          status: 429,
          code: 'USER_QUEUE_LIMIT',
          message: `您当前已有 ${userRunCount} 个任务绘制中、${userQueued} 个任务排队中（单用户最多排队 ${queueConfig.maxUserQueuedJobs} 个），请稍候再发起新任务`,
        },
        promotedIds: promoted.promotedIds,
        hasAnyActive: true,
      }
    }
    if (globalQueued >= queueConfig.maxQueueSize) {
      return {
        outcome: {
          kind: 'error',
          status: 429,
          code: 'GLOBAL_QUEUE_FULL',
          message: `当前全站排队人数较多（队列上限 ${queueConfig.maxQueueSize}），请稍候再试`,
        },
        promotedIds: promoted.promotedIds,
        hasAnyActive: true,
      }
    }
  }

  let deductRes: { existing?: JobRow; creditBalance: number }
  try {
    deductRes = await deductCreditsAndCreateJob(db, {
      jobId: input.jobId,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      provider: input.provider,
      profileId: input.profileId,
      profileName: input.profileName,
      resolution: input.resolution,
      model: input.model,
      channelId: input.channelId,
      channelName: input.channelName,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      creditsCost: input.creditsCost,
      prompt: input.prompt,
      recipeSummary: input.recipeSummary,
      aspectRatio: input.aspectRatio,
      stylePreset: input.stylePreset,
      snapshotJson: input.snapshotJson,
      traceJson: input.traceJson,
      initialStatus: canRunNow ? 'processing' : 'queued',
      startedAt: canRunNow ? Date.now() : null,
      queuePayloadJson: input.queuePayloadJson,
    })
  } catch {
    const freshUser = await db
      .prepare(`SELECT credit_balance, status FROM users WHERE id = ?`)
      .bind(input.userId)
      .first<{ credit_balance: number; status: string }>()
    if (!freshUser || freshUser.status !== 'active') {
      return {
        outcome: {
          kind: 'error',
          status: 403,
          code: 'ACCOUNT_DISABLED',
          message: '账号状态异常',
        },
        promotedIds: promoted.promotedIds,
        hasAnyActive: promoted.hasAnyActive,
      }
    }
    return {
      outcome: {
        kind: 'error',
        status: 402,
        code: 'INSUFFICIENT_CREDITS',
        message: `积分不足：本次需要 ${input.creditsCost} 积分，当前剩余 ${freshUser.credit_balance} 积分`,
      },
      promotedIds: promoted.promotedIds,
      hasAnyActive: promoted.hasAnyActive,
    }
  }

  if (deductRes.existing) {
    return {
      outcome: {
        kind: 'existing',
        existing: deductRes.existing,
        creditBalance: deductRes.creditBalance,
      },
      promotedIds: promoted.promotedIds,
      hasAnyActive: promoted.hasAnyActive,
    }
  }

  if (canRunNow) {
    return {
      outcome: {
        kind: 'admitted',
        jobId: input.jobId,
        creditBalance: deductRes.creditBalance,
      },
      promotedIds: promoted.promotedIds,
      hasAnyActive: true,
    }
  }

  const refreshedActive = await listActiveQueueRows(db)
  const queueMap = computeQueuePositions(refreshedActive, queueConfig)
  const insertedRow = refreshedActive.find((r) => r.id === input.jobId)
  const fallbackQueueInfo: GenerationQueueInfo = {
    position: globalQueued + 1,
    aheadCount: globalQueued,
    totalQueued: globalQueued + 1,
    modelPosition: 1,
    modelAheadCount: 0,
    reason:
      userRunCount >= queueConfig.maxUserConcurrency
        ? 'user_busy'
        : modelRunCount >= modelLimit
          ? 'model_busy'
          : 'global_busy',
    queuedAt: insertedRow?.created_at ?? Date.now(),
  }
  const queueInfo = queueMap.get(input.jobId) ?? fallbackQueueInfo
  const job = insertedRow
    ? mapJobRow(insertedRow, { queueInfo })
    : {
        id: input.jobId,
        userId: input.userId,
        createdAt: queueInfo.queuedAt,
        startedAt: null,
        finishedAt: null,
        status: 'queued' as const,
        creditsCost: input.creditsCost,
        creditsRefunded: 0,
        provider: input.provider,
        profileId: input.profileId,
        profileName: input.profileName,
        resolution: input.resolution,
        model: input.profileName || '默认画笔',
        prompt: '',
        aspectRatio: input.aspectRatio,
        stylePreset: input.stylePreset,
        imageUrl: '',
        recipeSummary: input.recipeSummary,
        queueInfo,
        liveProgress: {
          stage: 'queued' as const,
          message: `排队第 ${queueInfo.position} 位（前面还有 ${queueInfo.aheadCount} 个）`,
          attempt: 0,
          totalAttempts: 1,
          startedAt: queueInfo.queuedAt,
          stageStartedAt: queueInfo.queuedAt,
          percent: 8,
        },
      }

  return {
    outcome: {
      kind: 'queued',
      jobId: input.jobId,
      creditBalance: deductRes.creditBalance,
      job,
      queueInfo,
    },
    promotedIds: promoted.promotedIds,
    hasAnyActive: true,
  }
}

export async function buildAdminQueueSnapshotDirect(
  db: D1Database
): Promise<AdminQueueSnapshotDTO> {
  const [platform, activeRows, profiles] = await Promise.all([
    getPlatformConfig(db),
    listActiveQueueRows(db),
    getAllModelProfiles(db),
  ])
  const config = mergeGenerationQueueConfig(platform.queueConfig)
  const queueMap = computeQueuePositions(activeRows, config)
  const now = Date.now()

  const runningJobs: AdminQueueJobItem[] = []
  const queuedJobs: AdminQueueJobItem[] = []
  const activeUsersSet = new Set<string>()
  const modelRunningMap = new Map<string, number>()
  const modelQueuedMap = new Map<string, number>()
  const fallbackModelMeta = new Map<
    string,
    { provider: ImageProviderId; profileId: string | null; profileName: string }
  >()

  for (const row of activeRows) {
    activeUsersSet.add(row.user_id)
    const mKey = row.profile_id || row.provider
    if (!fallbackModelMeta.has(mKey)) {
      fallbackModelMeta.set(mKey, {
        provider: row.provider,
        profileId: row.profile_id ?? null,
        profileName:
          row.profile_name || `${getStudioArtist(row.provider).name}（默认）`,
      })
    }

    const res: StudioResolution | null = normalizeStudioResolution(row.resolution)
    const live = parseLiveStateFromTrace(row.trace_json)
    const item: AdminQueueJobItem = {
      id: row.id,
      userId: row.user_id,
      username: row.username || row.user_id.slice(0, 8),
      provider: row.provider,
      profileId: row.profile_id ?? null,
      profileName: row.profile_name ?? null,
      resolution: res,
      model: row.model,
      status: row.status === 'queued' ? 'queued' : 'processing',
      creditsCost: row.credits_cost,
      recipeSummary: row.recipe_summary,
      createdAt: row.created_at,
      startedAt: row.started_at ?? null,
      queueInfo: row.status === 'queued' ? queueMap.get(row.id) ?? null : null,
      liveStage: live.stage,
      liveMessage: live.message,
    }

    if (row.status === 'processing') {
      runningJobs.push(item)
      modelRunningMap.set(mKey, (modelRunningMap.get(mKey) ?? 0) + 1)
    } else if (row.status === 'queued') {
      queuedJobs.push(item)
      modelQueuedMap.set(mKey, (modelQueuedMap.get(mKey) ?? 0) + 1)
    }
  }

  queuedJobs.sort(
    (a, b) =>
      (a.queueInfo?.position ?? 999999) - (b.queueInfo?.position ?? 999999) ||
      a.createdAt - b.createdAt
  )
  runningJobs.sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt))

  const seenKeys = new Set<string>()
  const modelStats: AdminQueueModelStat[] = []
  const sortedProfiles = [...profiles].sort((a, b) => {
    const pDiff = PROVIDER_ORDER.indexOf(a.provider_id) - PROVIDER_ORDER.indexOf(b.provider_id)
    if (pDiff !== 0) return pDiff
    return a.sort_order - b.sort_order || a.created_at - b.created_at
  })

  for (const prof of sortedProfiles) {
    seenKeys.add(prof.id)
    modelStats.push({
      key: prof.id,
      provider: prof.provider_id,
      profileId: prof.id,
      profileName: prof.display_name,
      runningCount: modelRunningMap.get(prof.id) ?? 0,
      queuedCount: modelQueuedMap.get(prof.id) ?? 0,
      concurrencyLimit: resolveProfileConcurrencyLimit(config, prof.id),
      hasOverride: typeof config.profileConcurrencyOverrides[prof.id] === 'number',
      enabled: prof.enabled === 1,
    })
  }

  for (const [mKey, meta] of fallbackModelMeta.entries()) {
    if (seenKeys.has(mKey)) continue
    modelStats.push({
      key: mKey,
      provider: meta.provider,
      profileId: meta.profileId,
      profileName: meta.profileName,
      runningCount: modelRunningMap.get(mKey) ?? 0,
      queuedCount: modelQueuedMap.get(mKey) ?? 0,
      concurrencyLimit: resolveProfileConcurrencyLimit(config, meta.profileId),
      hasOverride: Boolean(
        meta.profileId && typeof config.profileConcurrencyOverrides[meta.profileId] === 'number'
      ),
      enabled: true,
    })
  }

  return {
    now,
    config,
    summary: {
      globalRunning: runningJobs.length,
      globalQueued: queuedJobs.length,
      maxGlobalConcurrency: config.maxGlobalConcurrency,
      maxQueueSize: config.maxQueueSize,
      activeUsers: activeUsersSet.size,
    },
    runningJobs,
    queuedJobs,
    modelStats,
  }
}

export class GenerationQueueCoordinator extends DurableObject<Env> {
  private mutex: Promise<void> = Promise.resolve()
  private lastSweepAt = 0

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutex.then(fn, fn)
    this.mutex = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async sweepIfNeededLocked(force = false) {
    const now = Date.now()
    if (!force && now - this.lastSweepAt < SWEEP_MIN_INTERVAL_MS) {
      return { reapedProcessing: 0, reapedQueued: 0 }
    }
    const res = await reapStaleProcessingJobs(this.env.DB)
    this.lastSweepAt = Date.now()
    return res
  }

  private async updateAlarmLocked(hasAnyActive: boolean) {
    try {
      if (hasAnyActive) {
        const nextAlarm = Date.now() + ALARM_INTERVAL_MS
        const existing = await this.ctx.storage.getAlarm()
        if (!existing || existing > nextAlarm + 5_000) {
          await this.ctx.storage.setAlarm(nextAlarm)
        }
      } else {
        await this.ctx.storage.deleteAlarm()
      }
        } catch (err) {
      logError('do.queue.update_alarm_failed', { hasAnyActive }, err)
    }
  }

  private async dispatchRunnerJobs(jobIds: string[], depth = 0) {
    for (const jobId of jobIds) {
      try {
        if (this.env.GENERATION_RUNNER) {
          const idx = hashToRunnerIndex(jobId)
          const stub = this.env.GENERATION_RUNNER.getByName(`runner-${idx}`)
          const res = await stub.fetch('https://runner.internal/execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jobId }),
          })
          if (!res.ok) {
            throw new Error(`Runner dispatch HTTP ${res.status}`)
          }
        } else {
          await executeQueuedJobById(this.env, jobId)
          await notifyJobFinished(this.env, jobId)
        }
      } catch (err) {
        logError('do.queue.dispatch_runner_failed', { jobId, depth }, err)
        await refundFailedJob(this.env.DB, jobId, '后台排队任务派发失败，系统已自动退还积分')
        if (depth < 3) {
          this.ctx.waitUntil(
            this.runSerialized(async () => {
              const promoted = await promoteEligibleQueuedJobs(this.env.DB)
              await this.updateAlarmLocked(promoted.hasAnyActive)
              return promoted.promotedIds
            }).then((more) => this.dispatchRunnerJobs(more, depth + 1))
          )
        }
      }
    }
  }

  async alarm(): Promise<void> {
    const { promotedIds } = await this.runSerialized(async () => {
      await this.sweepIfNeededLocked(true)
      const promoted = await promoteEligibleQueuedJobs(this.env.DB)
      await this.updateAlarmLocked(promoted.hasAnyActive)
      return promoted
    })
    if (promotedIds.length > 0) {
      await this.dispatchRunnerJobs(promotedIds)
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (request.method === 'POST' && url.pathname === '/admit') {
        const input = (await request.json()) as AdmitJobInput
        const res = await this.runSerialized(async () => {
          await this.sweepIfNeededLocked(false)
          const admitRes = await performAdmitOrEnqueue(this.env.DB, input)
          await this.updateAlarmLocked(admitRes.hasAnyActive)
          return admitRes
        })
        if (res.promotedIds.length > 0) {
          this.ctx.waitUntil(this.dispatchRunnerJobs(res.promotedIds))
        }
        return Response.json(res.outcome)
      }

      if (request.method === 'POST' && url.pathname === '/finish') {
        const { promotedIds } = await this.runSerialized(async () => {
          await this.sweepIfNeededLocked(false)
          const promoted = await promoteEligibleQueuedJobs(this.env.DB)
          await this.updateAlarmLocked(promoted.hasAnyActive)
          return promoted
        })
        if (promotedIds.length > 0) {
          this.ctx.waitUntil(this.dispatchRunnerJobs(promotedIds))
        }
        return Response.json({ ok: true, promotedCount: promotedIds.length })
      }

      if (request.method === 'POST' && url.pathname === '/cancel') {
        const payload = (await request.json()) as {
          jobId: string
          expectedUserId?: string
          reason?: string
          ledgerNote?: string
        }
        const { cancelRes, promotedIds } = await this.runSerialized(async () => {
          const res = await cancelQueuedJob(
            this.env.DB,
            payload.jobId,
            payload.reason || '用户已取消排队，积分已全额退还',
            {
              expectedUserId: payload.expectedUserId,
              ledgerNote: payload.ledgerNote,
            }
          )
          const promoted = await promoteEligibleQueuedJobs(this.env.DB)
          await this.updateAlarmLocked(promoted.hasAnyActive)
          return { cancelRes: res, promotedIds: promoted.promotedIds }
        })
        if (promotedIds.length > 0) {
          this.ctx.waitUntil(this.dispatchRunnerJobs(promotedIds))
        }
        return Response.json(cancelRes)
      }

      if (request.method === 'POST' && url.pathname === '/force-cancel-processing') {
        const payload = (await request.json()) as { jobId: string; reason?: string }
        const { refundRes, promotedIds } = await this.runSerialized(async () => {
          const res = await forceCancelProcessingJob(
            this.env.DB,
            payload.jobId,
            payload.reason || '管理员强制中止绘制任务并全额退还积分'
          )
          const promoted = await promoteEligibleQueuedJobs(this.env.DB)
          await this.updateAlarmLocked(promoted.hasAnyActive)
          return { refundRes: res, promotedIds: promoted.promotedIds }
        })
        if (promotedIds.length > 0) {
          this.ctx.waitUntil(this.dispatchRunnerJobs(promotedIds))
        }
        return Response.json(refundRes)
      }

      if (request.method === 'POST' && url.pathname === '/reconcile') {
        const { reaped, promoted } = await this.runSerialized(async () => {
          const reapRes = await this.sweepIfNeededLocked(true)
          const promoRes = await promoteEligibleQueuedJobs(this.env.DB)
          await this.updateAlarmLocked(promoRes.hasAnyActive)
          return { reaped: reapRes, promoted: promoRes }
        })
        if (promoted.promotedIds.length > 0) {
          this.ctx.waitUntil(this.dispatchRunnerJobs(promoted.promotedIds))
        }
        return Response.json({
          ok: true,
          reapedProcessing: reaped.reapedProcessing,
          reapedQueued: reaped.reapedQueued,
          promotedCount: promoted.promotedIds.length,
        })
      }

      if (request.method === 'GET' && url.pathname === '/snapshot') {
        const { snapshot, promotedIds } = await this.runSerialized(async () => {
          await this.sweepIfNeededLocked(false)
          const promoRes = await promoteEligibleQueuedJobs(this.env.DB)
          await this.updateAlarmLocked(promoRes.hasAnyActive)
          const snap = await buildAdminQueueSnapshotDirect(this.env.DB)
          return { snapshot: snap, promotedIds: promoRes.promotedIds }
        })
        if (promotedIds.length > 0) {
          this.ctx.waitUntil(this.dispatchRunnerJobs(promotedIds))
        }
        return Response.json(snapshot)
      }

      if (request.method === 'POST' && url.pathname === '/oauth-refresh') {
        const payload = (await request.json().catch(() => ({}))) as {
          keyId?: string
          forceRefresh?: boolean
        }
        const keyId = typeof payload.keyId === 'string' ? payload.keyId.trim() : ''
        if (!keyId) {
          return Response.json({ ok: false, error: 'Missing keyId' }, { status: 400 })
        }
        const result = await this.runSerialized(() =>
          refreshSupplierOAuthKeyDirect(this.env, keyId, { force: payload.forceRefresh === true })
        )
        return Response.json({ ok: true, result })
      }

      return Response.json({ error: { message: 'Not found' } }, { status: 404 })
    } catch (err) {
      logError('do.queue.fetch_error', { method: request.method, path: url.pathname }, err)
      return Response.json(
        {
          ok: false,
          error: { message: err instanceof Error ? err.message : '队列协调服务异常，请稍后重试' },
        },
        { status: 500 }
      )
    }
  }
}

export class GenerationJobRunner extends DurableObject<Env> {
  private activeJobs = new Set<string>()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (request.method === 'POST' && url.pathname === '/execute') {
        const { jobId } = (await request.json()) as { jobId: string }
        if (!jobId) {
          return Response.json({ error: { message: 'Missing jobId' } }, { status: 400 })
        }
        if (this.activeJobs.has(jobId)) {
          return Response.json({ accepted: true, duplicate: true, jobId }, { status: 202 })
        }
        this.activeJobs.add(jobId)
        this.ctx.waitUntil(
          this.runJob(jobId).finally(() => {
            this.activeJobs.delete(jobId)
          })
        )
        return Response.json({ accepted: true, jobId }, { status: 202 })
      }
      return Response.json({ error: { message: 'Not found' } }, { status: 404 })
    } catch (err) {
      logError('do.runner.fetch_error', { method: request.method, path: url.pathname }, err)
      return Response.json(
        { error: { message: err instanceof Error ? err.message : '后台任务执行器异常' } },
        { status: 500 }
      )
    }
  }

  private async runJob(jobId: string): Promise<void> {
    try {
      await executeQueuedJobById(this.env, jobId)
    } catch (err) {
      logError('do.runner.unhandled_job_error', { jobId }, err)
      try {
        await refundFailedJob(
          this.env.DB,
          jobId,
          '后台生成任务异常中断，系统已自动退还积分'
        )
      } catch (refundErr) {
        logError('do.runner.refund_failed', { jobId }, refundErr)
      }
    } finally {
      await notifyJobFinished(this.env, jobId)
    }
  }
}

function getCoordinatorStub(env: Env): DurableObjectStub | null {
  if (!env.GENERATION_QUEUE) return null
  return env.GENERATION_QUEUE.getByName('global-queue')
}

export async function dispatchJobToRunner(env: Env, jobId: string): Promise<boolean> {
  if (!env.GENERATION_RUNNER) return false
  const idx = hashToRunnerIndex(jobId)
  const stub = env.GENERATION_RUNNER.getByName(`runner-${idx}`)
  const res = await stub.fetch('https://runner.internal/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Runner dispatch HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`
    )
  }
  return true
}

async function readCoordinatorJson<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`队列协调器 ${action} 失败（HTTP ${res.status}）${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  return (await res.json()) as T
}

export async function admitOrEnqueueViaCoordinator(
  env: Env,
  input: AdmitJobInput
): Promise<AdmitJobOutcome> {
  const stub = getCoordinatorStub(env)
  if (stub) {
    const res = await stub.fetch('https://do.internal/admit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return readCoordinatorJson<InternalAdmitOutcome>(res, 'admit')
  }

  await reapStaleProcessingJobs(env.DB)
  const direct = await performAdmitOrEnqueue(env.DB, input)
  for (const jobId of direct.promotedIds) {
    await executeQueuedJobById(env, jobId)
  }
  return direct.outcome
}

export async function notifyJobFinished(env: Env, _jobId: string): Promise<void> {
  const stub = getCoordinatorStub(env)
  if (stub) {
    try {
      await stub.fetch('https://do.internal/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: _jobId }),
      })
    } catch {
      // alarm will sweep if coordinator call fails
    }
    return
  }

  const promoted = await promoteEligibleQueuedJobs(env.DB)
  for (const id of promoted.promotedIds) {
    try {
      await executeQueuedJobById(env, id)
    } catch {
      // already refunded in executor
    }
  }
}

export async function cancelQueuedJobViaCoordinator(
  env: Env,
  payload: {
    jobId: string
    expectedUserId?: string
    reason?: string
    ledgerNote?: string
  }
): Promise<{
  cancelled: boolean
  notFound?: boolean
  forbidden?: boolean
  alreadyStatus?: GenerationStatus
  refunded: number
  creditBalance?: number
  job?: JobRow
}> {
  const stub = getCoordinatorStub(env)
  if (stub) {
    const res = await stub.fetch('https://do.internal/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readCoordinatorJson(res, 'cancel')
  }
  const res = await cancelQueuedJob(
    env.DB,
    payload.jobId,
    payload.reason || '用户已取消排队，积分已全额退还',
    {
      expectedUserId: payload.expectedUserId,
      ledgerNote: payload.ledgerNote,
    }
  )
  await notifyJobFinished(env, payload.jobId)
  return res
}

export async function forceCancelProcessingJobViaCoordinator(
  env: Env,
  payload: { jobId: string; reason?: string }
): Promise<{ creditBalance?: number; refunded: boolean }> {
  const stub = getCoordinatorStub(env)
  if (stub) {
    const res = await stub.fetch('https://do.internal/force-cancel-processing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readCoordinatorJson(res, 'force-cancel-processing')
  }
  const res = await forceCancelProcessingJob(env.DB, payload.jobId, payload.reason)
  await notifyJobFinished(env, payload.jobId)
  return res
}

export async function reconcileQueueViaCoordinator(env: Env): Promise<{
  ok: boolean
  reapedProcessing: number
  reapedQueued: number
  promotedCount: number
}> {
  const stub = getCoordinatorStub(env)
  if (stub) {
    const res = await stub.fetch('https://do.internal/reconcile', { method: 'POST' })
    return readCoordinatorJson(res, 'reconcile')
  }
  const reaped = await reapStaleProcessingJobs(env.DB)
  const promoted = await promoteEligibleQueuedJobs(env.DB)
  for (const id of promoted.promotedIds) {
    await executeQueuedJobById(env, id)
  }
  return {
    ok: true,
    reapedProcessing: reaped.reapedProcessing,
    reapedQueued: reaped.reapedQueued,
    promotedCount: promoted.promotedIds.length,
  }
}

export async function fetchQueueSnapshotViaCoordinator(
  env: Env
): Promise<AdminQueueSnapshotDTO> {
  const stub = getCoordinatorStub(env)
  if (stub) {
    const res = await stub.fetch('https://do.internal/snapshot', { method: 'GET' })
    return readCoordinatorJson(res, 'snapshot')
  }
  return buildAdminQueueSnapshotDirect(env.DB)
}
