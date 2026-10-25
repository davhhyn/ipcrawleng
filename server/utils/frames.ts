import { createHash } from 'node:crypto'
import type { CamRow } from './camRow'
import { fetchFrame } from './probe'
import { probeEnabled } from './config'
import {
  renderSyntheticFrame,
  syntheticFrameEtag,
  type SyntheticFrameOptions
} from './syntheticFrame'

const THUMB_TTL_MS = 5 * 60 * 1000
const OFFLINE_RETRY_MS = 10 * 60 * 1000

interface CachedFrameMeta {
  contentType: string
  fetchedAt: number
  bytes: number
}

export interface ResolvedFrame {
  bytes: Uint8Array
  contentType: string
  etag: string
  source: 'upstream' | 'cache' | 'generated'
  reason: string | null
  fetchedAt: number
}

function cacheKey(row: CamRow): string {
  return createHash('sha1')
    .update(`${row.image_url || ''}|${row.stream_url || ''}|${row.kind}`)
    .digest('hex')
    .slice(0, 24)
}

async function readCached(requestedKey: string): Promise<{ bytes: Uint8Array, meta: CachedFrameMeta } | null> {
  try {
    const storage = useStorage('thumbs')
    const meta = await storage.getItem<CachedFrameMeta>(`frames/${requestedKey}.json`)
    const raw = await storage.getItemRaw<Uint8Array | ArrayBuffer | Buffer>(`frames/${requestedKey}.bin`)
    if (!meta || !raw) return null
    const bytes = raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : new Uint8Array(raw as ArrayBufferLike)
    if (!bytes.length) return null
    return { bytes, meta }
  } catch {
    return null
  }
}

async function writeCached(
  requestedKey: string,
  bytes: Uint8Array,
  contentType: string
): Promise<CachedFrameMeta> {
  const meta: CachedFrameMeta = { contentType, fetchedAt: Date.now(), bytes: bytes.length }
  try {
    const storage = useStorage('thumbs')
    await storage.setItemRaw(`frames/${requestedKey}.bin`, bytes)
    await storage.setItem(`frames/${requestedKey}.json`, meta)
  } catch (error) {
    console.warn('[ipcrawl] frame cache write failed:', error)
  }
  return meta
}

function generated(row: CamRow, reason: NonNullable<SyntheticFrameOptions['reason']>): ResolvedFrame {
  const options: SyntheticFrameOptions = {
    id: row.id,
    title: row.title,
    city: row.city,
    country: row.country,
    countryCode: row.country_code,
    region: row.region,
    source: row.source,
    kind: row.kind,
    lat: row.lat,
    lon: row.lon,
    isDemo: row.is_demo === 1,
    reason
  }
  const svg = renderSyntheticFrame(options)
  return {
    bytes: new TextEncoder().encode(svg),
    contentType: 'image/svg+xml; charset=utf-8',
    etag: syntheticFrameEtag(options),
    source: 'generated',
    reason,
    fetchedAt: 0
  }
}

function generatedReason(row: CamRow): NonNullable<SyntheticFrameOptions['reason']> {
  if (row.is_demo === 1) return 'seed'
  if (row.kind === 'page' || row.kind === 'iframe') return 'page'
  if (row.status === 'offline') return 'offline'
  return 'unavailable'
}

function isCacheableKind(row: CamRow): boolean {
  return row.kind === 'snapshot' || row.kind === 'mjpeg'
}

/**
 * Resolve a camera's frame.
 *
 * - thumbnails (`fresh: false`) prefer a recent cached byte stream, then try
 *   upstream once, then fall back to any stale cache
 * - the dialog/live view (`fresh: true`) always tries upstream first
 * - page-only / HLS / offline-recent cameras never trigger an upstream fetch
 *
 * Every fallback is served as a generated, explicitly-labelled SVG.
 */
export async function getFrame(
  row: CamRow,
  opts: { fresh?: boolean } = {}
): Promise<ResolvedFrame> {
  if (!row.image_url && !row.stream_url) return generated(row, generatedReason(row))
  if (!isCacheableKind(row)) return generated(row, generatedReason(row))

  const key = cacheKey(row)
  const cached = await readCached(key)
  const now = Date.now()

  if (!opts.fresh && cached && now - cached.meta.fetchedAt < THUMB_TTL_MS) {
    return {
      bytes: cached.bytes,
      contentType: cached.meta.contentType,
      etag: `"${key}-${cached.meta.fetchedAt}"`,
      source: 'cache',
      reason: null,
      fetchedAt: cached.meta.fetchedAt
    }
  }

  // A camera we recently found offline shouldn't cost an upstream round trip on
  // every grid render. The 10-minute window keeps recovery reasonably quick.
  const recentlyOffline = row.status === 'offline'
    && typeof row.last_probe_at === 'number'
    && now - row.last_probe_at < OFFLINE_RETRY_MS

  if (probeEnabled() && !recentlyOffline) {
    const fetched = await fetchFrame(row)
    if (fetched) {
      const meta = await writeCached(key, fetched.bytes, fetched.contentType)
      return {
        bytes: fetched.bytes,
        contentType: fetched.contentType,
        etag: `"${key}-${meta.fetchedAt}"`,
        source: 'upstream',
        reason: null,
        fetchedAt: meta.fetchedAt
      }
    }
  }

  if (cached) {
    return {
      bytes: cached.bytes,
      contentType: cached.meta.contentType,
      etag: `"${key}-${cached.meta.fetchedAt}"`,
      source: 'cache',
      reason: 'stale',
      fetchedAt: cached.meta.fetchedAt
    }
  }

  return generated(row, generatedReason(row))
}
