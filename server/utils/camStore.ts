import { createHash } from 'node:crypto'
import type { CamKind } from '#shared/explore'
import type { CamRow } from './camRow'
import { all, one, run, transaction } from './db'

export interface CamUpsert {
  id: string
  source: string
  sourceName: string
  externalId: string
  title: string
  host: string
  port: number | null
  scheme: string | null
  kind: CamKind
  protocol: string | null
  country: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  lat: number | null
  lon: number | null
  org: string | null
  vendor: string | null
  tags: string[]
  imageUrl: string | null
  streamUrl: string | null
  pageUrl: string | null
  attribution: string | null
  license: string | null
  isDemo: boolean
}

export interface UpsertStats {
  inserted: number
  updated: number
}

/** Stable 16-hex camera id. Prefix is provider-specific so ids don't collide. */
export function camId(source: string, externalId: string): string {
  return createHash('sha1').update(`${source}:${externalId}`).digest('hex').slice(0, 16)
}

const UPSERT_SQL = `INSERT INTO cams (
  id, source, source_name, external_id, title, host, port, scheme, kind, protocol,
  country, country_code, region, city, lat, lon, org, vendor, tags_json,
  image_url, stream_url, page_url, attribution, license, status, http_status,
  probe_error, last_probe_at, first_seen_at, last_seen_at, fav_count, active, is_demo
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,0,1,?)
ON CONFLICT(id) DO UPDATE SET
  source = excluded.source,
  source_name = excluded.source_name,
  external_id = excluded.external_id,
  title = excluded.title,
  host = excluded.host,
  port = excluded.port,
  scheme = excluded.scheme,
  kind = excluded.kind,
  protocol = excluded.protocol,
  country = excluded.country,
  country_code = excluded.country_code,
  region = excluded.region,
  city = excluded.city,
  lat = excluded.lat,
  lon = excluded.lon,
  org = excluded.org,
  vendor = excluded.vendor,
  tags_json = excluded.tags_json,
  image_url = excluded.image_url,
  stream_url = excluded.stream_url,
  page_url = excluded.page_url,
  attribution = excluded.attribution,
  license = excluded.license,
  is_demo = excluded.is_demo,
  active = 1,
  last_seen_at = excluded.last_seen_at,
  status = CASE
    WHEN cams.image_url IS excluded.image_url
      AND cams.last_probe_at IS NOT NULL
      AND cams.last_probe_at > ?
    THEN cams.status
    ELSE excluded.status
  END,
  http_status = CASE
    WHEN cams.image_url IS excluded.image_url
      AND cams.last_probe_at IS NOT NULL
      AND cams.last_probe_at > ?
    THEN cams.http_status
    ELSE excluded.http_status
  END,
  probe_error = CASE
    WHEN cams.image_url IS excluded.image_url
      AND cams.last_probe_at IS NOT NULL
      AND cams.last_probe_at > ?
    THEN cams.probe_error
    ELSE excluded.probe_error
  END,
  last_probe_at = CASE
    WHEN cams.image_url IS excluded.image_url
      AND cams.last_probe_at IS NOT NULL
      AND cams.last_probe_at > ?
    THEN cams.last_probe_at
    ELSE excluded.last_probe_at
  END`

/**
 * Upsert a batch of normalized cameras. Existing rows keep first_seen_at and
 * favorite counts; a recent probe result is preserved when the stream URL is
 * unchanged. The whole batch is one transaction.
 */
export function upsertCams(cams: CamUpsert[], now: number, probeWindowMs = 6 * 60 * 60 * 1000): UpsertStats {
  if (cams.length === 0) return { inserted: 0, updated: 0 }
  const stats: UpsertStats = { inserted: 0, updated: 0 }

  transaction(() => {
    const existing = new Set(
      all<{ id: string }>(
        `SELECT id FROM cams WHERE id IN (${cams.map(() => '?').join(',')})`,
        cams.map(cam => cam.id)
      ).map(row => row.id)
    )

    for (const cam of cams) {
      const probeCutoff = now - probeWindowMs
      run(UPSERT_SQL, [
        cam.id,
        cam.source,
        cam.sourceName,
        cam.externalId,
        cam.title,
        cam.host,
        cam.port,
        cam.scheme,
        cam.kind,
        cam.protocol,
        cam.country,
        cam.countryCode,
        cam.region,
        cam.city,
        cam.lat,
        cam.lon,
        cam.org,
        cam.vendor,
        JSON.stringify(cam.tags.slice(0, 12)),
        cam.imageUrl,
        cam.streamUrl,
        cam.pageUrl,
        cam.attribution,
        cam.license,
        cam.kind === 'page' ? 'page' : 'unknown',
        now,
        now,
        cam.isDemo ? 1 : 0,
        probeCutoff,
        probeCutoff,
        probeCutoff,
        probeCutoff
      ])
      if (existing.has(cam.id)) stats.updated++
      else stats.inserted++
    }
  })

  return stats
}

/** Mark every row from a source inactive before a successful discovery upsert. */
export function deactivateSource(source: string): void {
  run('UPDATE cams SET active = 0 WHERE source = ?', [source])
}

export function findCamRow(id: string): CamRow | null {
  return one<CamRow>(`SELECT * FROM cams WHERE id = ? LIMIT 1`, [id])
}

export function camExists(id: string): boolean {
  return Boolean(one<{ id: string }>('SELECT id FROM cams WHERE id = ? AND active = 1 LIMIT 1', [id]))
}

export function listCamRows(limit = 5000): CamRow[] {
  return all<CamRow>(`SELECT * FROM cams WHERE active = 1 ORDER BY id LIMIT ?`, [limit])
}

export function listCamRowsBySource(source: string, limit = 5000): CamRow[] {
  return all<CamRow>(
    `SELECT * FROM cams WHERE active = 1 AND source = ? ORDER BY id LIMIT ?`,
    [source, limit]
  )
}

export function listProbeCandidates(opts: {
  staleBefore: number
  limit: number
  source?: string
}): CamRow[] {
  const params: unknown[] = [opts.staleBefore]
  let sourceClause = ''
  if (opts.source) {
    sourceClause = 'AND source = ?'
    params.push(opts.source)
  }
  params.push(opts.limit)
  return all<CamRow>(
    `SELECT * FROM cams
     WHERE active = 1
       AND kind IN ('snapshot', 'mjpeg', 'hls', 'video')
       AND (image_url IS NOT NULL OR stream_url IS NOT NULL)
       AND (last_probe_at IS NULL OR last_probe_at < ?)
       ${sourceClause}
     ORDER BY (last_probe_at IS NULL) DESC, fav_count DESC, last_seen_at DESC
     LIMIT ?`,
    params
  )
}

export interface ProbeRecord {
  status: 'live' | 'offline'
  httpStatus: number | null
  error: string | null
  checkedAt: number
}

export function recordProbe(id: string, probe: ProbeRecord): void {
  run(
    `UPDATE cams
     SET status = ?, http_status = ?, probe_error = ?, last_probe_at = ?
     WHERE id = ?`,
    [probe.status, probe.httpStatus, probe.error, probe.checkedAt, id]
  )
}

// ── Favorites ───────────────────────────────────────────────────────────

export function toggleFavorite(
  camIdValue: string,
  voterHash: string,
  desired?: boolean
): { on: boolean, count: number } | null {
  return transaction(() => {
    const exists = one<{ cam_id: string }>(
      'SELECT cam_id FROM cam_favorites WHERE cam_id = ? AND voter_hash = ?',
      [camIdValue, voterHash]
    )

    const turnOn = typeof desired === 'boolean' ? desired : !exists

    if (turnOn && !exists) {
      const voterTotal = one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM cam_favorites WHERE voter_hash = ?',
        [voterHash]
      )
      if ((voterTotal?.n ?? 0) >= 250) return null
      run(
        'INSERT OR IGNORE INTO cam_favorites (cam_id, voter_hash, created_at) VALUES (?, ?, ?)',
        [camIdValue, voterHash, Date.now()]
      )
    } else if (!turnOn && exists) {
      run(
        'DELETE FROM cam_favorites WHERE cam_id = ? AND voter_hash = ?',
        [camIdValue, voterHash]
      )
    }

    const countRow = one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM cam_favorites WHERE cam_id = ?',
      [camIdValue]
    )
    const count = countRow?.n ?? 0
    run('UPDATE cams SET fav_count = ? WHERE id = ?', [count, camIdValue])
    return { on: turnOn, count }
  })
}

/** Merge enrichment tags/vendor into an existing row (InternetDB adapter). */
export function updateCamEnrichment(id: string, tags: string[], vendor: string | null): void {
  run(
    `UPDATE cams
     SET tags_json = ?,
         vendor = COALESCE(?, vendor)
     WHERE id = ?`,
    [JSON.stringify(tags.slice(0, 12)), vendor, id]
  )
}

export function favoritesTotal(): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM cam_favorites')?.n ?? 0
}

// ── Retention ───────────────────────────────────────────────────────────

export function pruneInactive(beforeMs: number): number {
  return transaction(() => {
    const stale = all<{ id: string }>(
      'SELECT id FROM cams WHERE active = 0 AND last_seen_at < ?',
      [beforeMs]
    )
    if (stale.length === 0) return 0
    const ids = stale.map(row => row.id)
    for (let index = 0; index < ids.length; index += 90) {
      const slice = ids.slice(index, index + 90)
      const placeholders = slice.map(() => '?').join(',')
      run(`DELETE FROM cam_favorites WHERE cam_id IN (${placeholders})`, slice)
      run(`DELETE FROM cams WHERE id IN (${placeholders})`, slice)
    }
    return ids.length
  })
}
