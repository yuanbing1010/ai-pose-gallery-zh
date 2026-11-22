import { Hono } from 'hono'
import {
  MIO_ARCHIVE_ORIGIN,
  MIO_AUTHOR_HANDLE,
  MIO_AUTHOR_NAME,
  MIO_AUTHOR_URL,
  MIO_DATA_URL,
} from '../../shared/mioArchive'
import type { MioGalleryPayload } from '../../shared/studio'
import { readSyncedMioArchive } from '../mioSync'
import type { AppEnv } from '../types'

export const galleryRoutes = new Hono<AppEnv>()

galleryRoutes.get('/mio', async (c) => {
  c.header('X-Content-Type-Options', 'nosniff')
  const synced = await readSyncedMioArchive(c.env.BUCKET)
  if (!synced || !synced.synced) {
    const emptyPayload: MioGalleryPayload = {
      synced: false,
      generated: synced?.generated ?? null,
      syncedAt: synced?.syncedAt ?? null,
      checkedAt: synced?.checkedAt ?? null,
      poseCount: 0,
      costumeCount: 0,
      poseVolumeCount: 0,
      costumeVolumeCount: 0,
      sourceSha256: synced?.sourceSha256 ?? null,
      lastError: synced?.lastError ?? null,
      archiveUrl: MIO_ARCHIVE_ORIGIN,
      dataUrl: MIO_DATA_URL,
      authorName: MIO_AUTHOR_NAME,
      authorHandle: MIO_AUTHOR_HANDLE,
      authorUrl: MIO_AUTHOR_URL,
      poses: [],
      costumes: [],
    }
    c.header('Cache-Control', 'public, max-age=120')
    return c.json(emptyPayload)
  }

  c.header('Cache-Control', 'public, max-age=300')
  return c.json(synced)
})
