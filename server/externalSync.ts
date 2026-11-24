import {
  MIO_ARCHIVE_ORIGIN,
  MIO_AUTHOR_HANDLE,
  MIO_AUTHOR_NAME,
  MIO_AUTHOR_URL,
  MIO_DATA_URL,
  transformMioArchivePayload,
  type RawMioArchive,
} from '../shared/mioArchive'
import {
  OUTFIT_DB_AUTHOR_HANDLE,
  OUTFIT_DB_AUTHOR_NAME,
  OUTFIT_DB_AUTHOR_URL,
  OUTFIT_DB_DATA_URL,
  OUTFIT_DB_ORIGIN,
  parseOutfitDbScript,
  transformOutfitDbPayload,
} from '../shared/outfitDbArchive'
import type {
  MioGalleryPayload,
  MioSyncStatus,
  OutfitDbGalleryPayload,
  OutfitDbSyncStatus,
} from '../shared/studio'
import { devProxyAwareFetch } from './aiProviders'
import { logError } from './logger'
import type { Env } from './types'
import { readResponseBodyWithLimit } from './validation'

export const MIO_R2_KEY = 'sync/mio-archive.json'
export const OUTFIT_DB_R2_KEY = 'sync/outfit-db-archive.json'
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024

interface StoredArchiveRecord {
  version: 1
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function readR2Json<T>(bucket: R2Bucket, key: string): Promise<Partial<T> | null> {
  try {
    const obj = await bucket.get(key)
    if (!obj || obj.size > MAX_ARCHIVE_BYTES) return null
    const parsed = JSON.parse(await obj.text())
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : null
  } catch {
    return null
  }
}

interface ExternalSyncAdapter<TStatus, TPayload extends TStatus> {
  r2Key: string
  dataUrl: string
  accept: string
  emptyStatus: (overrides?: Partial<TStatus>) => TStatus
  stripStatus: (record: Partial<TStatus> | null) => TStatus
  normalizeRecord: (parsed: Partial<TPayload & StoredArchiveRecord> | null) => TPayload | null
  buildNextPayload: (params: {
    rawText: string
    sourceSha256: string
    existing: TPayload | null
    now: number
  }) => {
    payload: TPayload
    metadata: Record<string, string>
  }
  fallbackFromError: (existing: TPayload | null, now: number, message: string) => TPayload
}

async function runExternalSync<TStatus, TPayload extends TStatus>(
  adapter: ExternalSyncAdapter<TStatus, TPayload>,
  env: Env,
  options?: { throwOnError?: boolean }
): Promise<TStatus> {
  const now = Date.now()
  const existing = adapter.normalizeRecord(
    await readR2Json<TPayload & StoredArchiveRecord>(env.BUCKET, adapter.r2Key)
  )

  try {
    const res = await devProxyAwareFetch(
      adapter.dataUrl,
      {
        method: 'GET',
        headers: {
          Accept: adapter.accept,
          'User-Agent': 'ai-pose-gallery-zh/2.0',
        },
        signal: AbortSignal.timeout(25_000),
      },
      env,
      25_000
    )

    if (!res.ok) {
      throw new Error(`上游返回 HTTP ${res.status}`)
    }

    const bytes = await readResponseBodyWithLimit(res, MAX_ARCHIVE_BYTES)
    if (bytes.byteLength === 0) {
      throw new Error('上游数据大小异常或超过限制')
    }

    const sourceSha256 = await sha256HexBytes(bytes)
    const rawText = new TextDecoder().decode(bytes)
    const { payload, metadata } = adapter.buildNextPayload({
      rawText,
      sourceSha256,
      existing,
      now,
    })

    const stored: TPayload & StoredArchiveRecord = {
      version: 1,
      ...payload,
    }

    await env.BUCKET.put(adapter.r2Key, JSON.stringify(stored), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    })

    return adapter.stripStatus(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步上游档案失败'
    logError('external_sync.failed', { r2Key: adapter.r2Key, dataUrl: adapter.dataUrl }, err)
    const fallbackPayload = adapter.fallbackFromError(existing, now, message)
    const fallbackStored: TPayload & StoredArchiveRecord = {
      version: 1,
      ...fallbackPayload,
    }

    try {
      await env.BUCKET.put(adapter.r2Key, JSON.stringify(fallbackStored), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      })
    } catch {
      // ignore R2 write failure during error recording
    }

    if (options?.throwOnError) {
      throw new Error(message)
    }
    return adapter.stripStatus(fallbackPayload)
  }
}

// ---------------------------------------------------------------------------
// 霧島澪 · 设计档案 (mio-design-archive)
// ---------------------------------------------------------------------------

function emptyMioStatus(overrides?: Partial<MioSyncStatus>): MioSyncStatus {
  return {
    synced: false,
    generated: null,
    syncedAt: null,
    checkedAt: null,
    poseCount: 0,
    costumeCount: 0,
    poseVolumeCount: 0,
    costumeVolumeCount: 0,
    sourceSha256: null,
    lastError: null,
    archiveUrl: MIO_ARCHIVE_ORIGIN,
    dataUrl: MIO_DATA_URL,
    authorName: MIO_AUTHOR_NAME,
    authorHandle: MIO_AUTHOR_HANDLE,
    authorUrl: MIO_AUTHOR_URL,
    ...overrides,
  }
}

export function stripMioPayloadToStatus(record: Partial<MioSyncStatus> | null): MioSyncStatus {
  if (!record) return emptyMioStatus()
  return {
    synced: Boolean(record.synced),
    generated: record.generated ?? null,
    syncedAt: record.syncedAt ?? null,
    checkedAt: record.checkedAt ?? null,
    poseCount: Number(record.poseCount || 0),
    costumeCount: Number(record.costumeCount || 0),
    poseVolumeCount: Number(record.poseVolumeCount || 0),
    costumeVolumeCount: Number(record.costumeVolumeCount || 0),
    sourceSha256: record.sourceSha256 ?? null,
    lastError: record.lastError ?? null,
    archiveUrl: record.archiveUrl || MIO_ARCHIVE_ORIGIN,
    dataUrl: record.dataUrl || MIO_DATA_URL,
    authorName: record.authorName || MIO_AUTHOR_NAME,
    authorHandle: record.authorHandle || MIO_AUTHOR_HANDLE,
    authorUrl: record.authorUrl || MIO_AUTHOR_URL,
  }
}

export function emptyMioGalleryPayload(existing?: Partial<MioGalleryPayload> | null): MioGalleryPayload {
  return {
    ...emptyMioStatus({
      generated: existing?.generated ?? null,
      syncedAt: existing?.syncedAt ?? null,
      checkedAt: existing?.checkedAt ?? null,
      sourceSha256: existing?.sourceSha256 ?? null,
      lastError: existing?.lastError ?? null,
    }),
    poses: [],
    costumes: [],
  }
}

const MIO_ADAPTER: ExternalSyncAdapter<MioSyncStatus, MioGalleryPayload> = {
  r2Key: MIO_R2_KEY,
  dataUrl: MIO_DATA_URL,
  accept: 'application/json',
  emptyStatus: emptyMioStatus,
  stripStatus: stripMioPayloadToStatus,
  normalizeRecord: (parsed) => {
    if (!parsed) return null
    return {
      ...stripMioPayloadToStatus(parsed),
      poses: Array.isArray(parsed.poses) ? parsed.poses : [],
      costumes: Array.isArray(parsed.costumes) ? parsed.costumes : [],
    }
  },
  buildNextPayload: ({ rawText, sourceSha256, existing, now }) => {
    const rawJson = JSON.parse(rawText) as RawMioArchive
    const transformed = transformMioArchivePayload(rawJson)
    if (transformed.poses.length === 0 || transformed.costumes.length === 0) {
      throw new Error('上游数据为空，跳过覆盖写入')
    }
    const unchanged = Boolean(
      existing?.synced &&
        existing.sourceSha256 === sourceSha256 &&
        existing.poses.length === transformed.poses.length &&
        existing.costumes.length === transformed.costumes.length
    )
    const payload: MioGalleryPayload = {
      synced: true,
      generated: transformed.generated,
      syncedAt: unchanged && existing?.syncedAt ? existing.syncedAt : now,
      checkedAt: now,
      poseCount: transformed.poses.length,
      costumeCount: transformed.costumes.length,
      poseVolumeCount: transformed.poseVolumeCount,
      costumeVolumeCount: transformed.costumeVolumeCount,
      sourceSha256,
      lastError: null,
      archiveUrl: MIO_ARCHIVE_ORIGIN,
      dataUrl: MIO_DATA_URL,
      authorName: MIO_AUTHOR_NAME,
      authorHandle: MIO_AUTHOR_HANDLE,
      authorUrl: MIO_AUTHOR_URL,
      poses: transformed.poses,
      costumes: transformed.costumes,
    }
    return {
      payload,
      metadata: {
        generated: transformed.generated,
        poseCount: String(transformed.poses.length),
        costumeCount: String(transformed.costumes.length),
      },
    }
  },
  fallbackFromError: (existing, now, message) =>
    existing
      ? {
          ...stripMioPayloadToStatus(existing),
          checkedAt: now,
          lastError: message,
          poses: existing.poses,
          costumes: existing.costumes,
        }
      : {
          ...emptyMioStatus({ checkedAt: now, lastError: message }),
          poses: [],
          costumes: [],
        },
}

export async function readSyncedMioArchive(bucket: R2Bucket): Promise<MioGalleryPayload | null> {
  return MIO_ADAPTER.normalizeRecord(
    await readR2Json<MioGalleryPayload & StoredArchiveRecord>(bucket, MIO_R2_KEY)
  )
}

export async function getMioSyncStatus(bucket: R2Bucket): Promise<MioSyncStatus> {
  return stripMioPayloadToStatus(await readSyncedMioArchive(bucket))
}

export async function syncMioArchive(
  env: Env,
  options?: { throwOnError?: boolean }
): Promise<MioSyncStatus> {
  return runExternalSync(MIO_ADAPTER, env, options)
}

// ---------------------------------------------------------------------------
// ChiHAL · 服装档案 (outfit-db-cn)
// ---------------------------------------------------------------------------

function emptyOutfitDbStatus(overrides?: Partial<OutfitDbSyncStatus>): OutfitDbSyncStatus {
  return {
    synced: false,
    updated: null,
    syncedAt: null,
    checkedAt: null,
    costumeCount: 0,
    familyCount: 0,
    sourceSha256: null,
    lastError: null,
    archiveUrl: OUTFIT_DB_ORIGIN,
    dataUrl: OUTFIT_DB_DATA_URL,
    authorName: OUTFIT_DB_AUTHOR_NAME,
    authorHandle: OUTFIT_DB_AUTHOR_HANDLE,
    authorUrl: OUTFIT_DB_AUTHOR_URL,
    ...overrides,
  }
}

export function stripOutfitDbPayloadToStatus(
  record: Partial<OutfitDbSyncStatus> | null
): OutfitDbSyncStatus {
  if (!record) return emptyOutfitDbStatus()
  return {
    synced: Boolean(record.synced),
    updated: record.updated ?? null,
    syncedAt: record.syncedAt ?? null,
    checkedAt: record.checkedAt ?? null,
    costumeCount: Number(record.costumeCount || 0),
    familyCount: Number(record.familyCount || 0),
    sourceSha256: record.sourceSha256 ?? null,
    lastError: record.lastError ?? null,
    archiveUrl: record.archiveUrl || OUTFIT_DB_ORIGIN,
    dataUrl: record.dataUrl || OUTFIT_DB_DATA_URL,
    authorName: record.authorName || OUTFIT_DB_AUTHOR_NAME,
    authorHandle: record.authorHandle || OUTFIT_DB_AUTHOR_HANDLE,
    authorUrl: record.authorUrl || OUTFIT_DB_AUTHOR_URL,
  }
}

export function emptyOutfitDbGalleryPayload(
  existing?: Partial<OutfitDbGalleryPayload> | null
): OutfitDbGalleryPayload {
  return {
    ...emptyOutfitDbStatus({
      updated: existing?.updated ?? null,
      syncedAt: existing?.syncedAt ?? null,
      checkedAt: existing?.checkedAt ?? null,
      sourceSha256: existing?.sourceSha256 ?? null,
      lastError: existing?.lastError ?? null,
    }),
    costumes: [],
  }
}

const OUTFIT_DB_ADAPTER: ExternalSyncAdapter<OutfitDbSyncStatus, OutfitDbGalleryPayload> = {
  r2Key: OUTFIT_DB_R2_KEY,
  dataUrl: OUTFIT_DB_DATA_URL,
  accept: 'application/javascript, text/javascript, application/json',
  emptyStatus: emptyOutfitDbStatus,
  stripStatus: stripOutfitDbPayloadToStatus,
  normalizeRecord: (parsed) => {
    if (!parsed) return null
    return {
      ...stripOutfitDbPayloadToStatus(parsed),
      costumes: Array.isArray(parsed.costumes) ? parsed.costumes : [],
    }
  },
  buildNextPayload: ({ rawText, sourceSha256, existing, now }) => {
    const rawDb = parseOutfitDbScript(rawText)
    const transformed = transformOutfitDbPayload(rawDb)
    if (transformed.costumes.length === 0) {
      throw new Error('上游数据为空，跳过覆盖写入')
    }
    const unchanged = Boolean(
      existing?.synced &&
        existing.sourceSha256 === sourceSha256 &&
        existing.costumes.length === transformed.costumes.length
    )
    const payload: OutfitDbGalleryPayload = {
      synced: true,
      updated: transformed.updated || null,
      syncedAt: unchanged && existing?.syncedAt ? existing.syncedAt : now,
      checkedAt: now,
      costumeCount: transformed.costumes.length,
      familyCount: transformed.familyCount,
      sourceSha256,
      lastError: null,
      archiveUrl: OUTFIT_DB_ORIGIN,
      dataUrl: OUTFIT_DB_DATA_URL,
      authorName: OUTFIT_DB_AUTHOR_NAME,
      authorHandle: OUTFIT_DB_AUTHOR_HANDLE,
      authorUrl: OUTFIT_DB_AUTHOR_URL,
      costumes: transformed.costumes,
    }
    return {
      payload,
      metadata: {
        updated: transformed.updated,
        costumeCount: String(transformed.costumes.length),
        familyCount: String(transformed.familyCount),
      },
    }
  },
  fallbackFromError: (existing, now, message) =>
    existing
      ? {
          ...stripOutfitDbPayloadToStatus(existing),
          checkedAt: now,
          lastError: message,
          costumes: existing.costumes,
        }
      : {
          ...emptyOutfitDbStatus({ checkedAt: now, lastError: message }),
          costumes: [],
        },
}

export async function readSyncedOutfitDbArchive(
  bucket: R2Bucket
): Promise<OutfitDbGalleryPayload | null> {
  return OUTFIT_DB_ADAPTER.normalizeRecord(
    await readR2Json<OutfitDbGalleryPayload & StoredArchiveRecord>(bucket, OUTFIT_DB_R2_KEY)
  )
}

export async function getOutfitDbSyncStatus(bucket: R2Bucket): Promise<OutfitDbSyncStatus> {
  return stripOutfitDbPayloadToStatus(await readSyncedOutfitDbArchive(bucket))
}

export async function syncOutfitDbArchive(
  env: Env,
  options?: { throwOnError?: boolean }
): Promise<OutfitDbSyncStatus> {
  return runExternalSync(OUTFIT_DB_ADAPTER, env, options)
}
