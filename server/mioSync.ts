import {
  MIO_ARCHIVE_ORIGIN,
  MIO_AUTHOR_HANDLE,
  MIO_AUTHOR_NAME,
  MIO_AUTHOR_URL,
  MIO_DATA_URL,
  transformMioArchivePayload,
  type RawMioArchive,
} from '../shared/mioArchive'
import type { MioGalleryPayload, MioSyncStatus } from '../shared/studio'
import { devProxyAwareFetch } from './aiProviders'
import type { Env } from './types'

const MIO_R2_KEY = 'sync/mio-archive.json'
const MAX_MIO_JSON_BYTES = 5 * 1024 * 1024

interface StoredMioArchiveRecord extends MioGalleryPayload {
  version: 1
}

function emptySyncStatus(overrides?: Partial<MioSyncStatus>): MioSyncStatus {
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

export function stripMioPayloadToStatus(record: MioSyncStatus | null): MioSyncStatus {
  if (!record) return emptySyncStatus()
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

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function readSyncedMioArchive(bucket: R2Bucket): Promise<MioGalleryPayload | null> {
  try {
    const obj = await bucket.get(MIO_R2_KEY)
    if (!obj) return null
    const text = await obj.text()
    const parsed = JSON.parse(text) as Partial<StoredMioArchiveRecord>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      ...stripMioPayloadToStatus(parsed as MioSyncStatus),
      poses: Array.isArray(parsed.poses) ? parsed.poses : [],
      costumes: Array.isArray(parsed.costumes) ? parsed.costumes : [],
    }
  } catch {
    return null
  }
}

export async function getMioSyncStatus(bucket: R2Bucket): Promise<MioSyncStatus> {
  const existing = await readSyncedMioArchive(bucket)
  return stripMioPayloadToStatus(existing)
}

export async function syncMioArchive(
  env: Env,
  options?: { throwOnError?: boolean }
): Promise<MioSyncStatus> {
  const now = Date.now()
  const existing = await readSyncedMioArchive(env.BUCKET)

  try {
    const res = await devProxyAwareFetch(
      MIO_DATA_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
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

    const contentLen = Number(res.headers.get('content-length') || '0')
    if (Number.isFinite(contentLen) && contentLen > MAX_MIO_JSON_BYTES) {
      throw new Error('上游 data.json 体积超过 5 MiB 限制')
    }

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MIO_JSON_BYTES) {
      throw new Error('上游 data.json 大小异常或超过限制')
    }

    const sourceSha256 = await sha256HexBytes(bytes)
    const rawText = new TextDecoder().decode(bytes)
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

    const record: StoredMioArchiveRecord = {
      version: 1,
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

    await env.BUCKET.put(MIO_R2_KEY, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: {
        generated: transformed.generated,
        poseCount: String(transformed.poses.length),
        costumeCount: String(transformed.costumes.length),
      },
    })

    return stripMioPayloadToStatus(record)
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步上游档案失败'
    const fallbackRecord: StoredMioArchiveRecord = existing
      ? {
          version: 1,
          ...stripMioPayloadToStatus(existing),
          checkedAt: now,
          lastError: message,
          poses: existing.poses,
          costumes: existing.costumes,
        }
      : {
          version: 1,
          ...emptySyncStatus({ checkedAt: now, lastError: message }),
          poses: [],
          costumes: [],
        }

    try {
      await env.BUCKET.put(MIO_R2_KEY, JSON.stringify(fallbackRecord), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      })
    } catch {
      // ignore R2 write failure during error recording
    }

    if (options?.throwOnError) {
      throw new Error(message)
    }
    return stripMioPayloadToStatus(fallbackRecord)
  }
}
