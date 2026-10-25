import { isIP } from 'node:net'
import { SOURCE_BY_ID } from '#shared/sources'
import { blockedHosts } from './config'
import { camId, recordProbe, setStatus, upsertCams, type CamUpsert } from './camStore'
import { all, one, run } from './db'
import { normalizeVendor } from './ingest/normalize'

/**
 * Persistence for the local sensor and dataset importer.
 *
 * The CLI does the probing (on the operator's machine, inside their network),
 * posts findings here, and this module decides what reaches the catalogue.
 * Nothing in this file opens a socket.
 */

export type SensorOrigin = 'sensor' | 'import'

export interface IncomingEvidence {
  openPorts?: number[]
  protocol?: string | null
  httpStatus?: number | null
  server?: string | null
  realm?: string | null
  title?: string | null
  rtspMethods?: string[] | null
  authRequired?: boolean
  sourcePath?: string | null
}

export interface IncomingDetection {
  host: string
  port: number
  protocol?: string
  kind?: string
  url?: string | null
  title?: string
  vendorHints?: string[]
  evidence?: IncomingEvidence | null
  latencyMs?: number
  tags?: string[] | null
  context?: {
    country?: string | null
    city?: string | null
    org?: string | null
    lat?: number | null
    lon?: number | null
  } | null
}

export interface IngestResult {
  stored: number
  inserted: number
  updated: number
  deactivated: number
  rejected: number
  runId: number
}

const MAX_BATCH = 5000
const KINDS = new Set(['snapshot', 'mjpeg', 'hls', 'video', 'iframe', 'page', 'unknown'])
const PROTOCOLS = new Set(['http', 'https', 'rtsp', 'tcp'])

function protocolLabel(kind: string, protocol: string): string {
  if (protocol === 'rtsp') return 'RTSP'
  switch (kind) {
    case 'snapshot': return 'HTTP snapshot'
    case 'mjpeg': return 'MJPEG over HTTP'
    case 'hls': return 'HLS'
    case 'video': return 'HTTP video'
    default: return 'HTTP'
  }
}

/**
 * Ingest accepts IPv4 literals only.
 *
 * Both producers (the scanner and the dataset importer) emit dotted quads. A
 * hostname would let a stray request create a row that the frame proxy later
 * resolves — potentially to a private address — so the door stays shut.
 * Operator blocklists apply here too: a host asked to disappear must not be
 * able to re-enter through the local sensor.
 */
export function hostAllowed(host: string): boolean {
  if (typeof host !== 'string' || isIP(host) !== 4) return false
  const first = Number(host.split('.')[0])
  // Unspecified, multicast, reserved and broadcast space can never be a camera,
  // and 0.0.0.0-style rows are how "reach the local host" tricks start.
  if (!Number.isInteger(first) || first === 0 || first >= 224) return false
  const normalized = host.toLowerCase()
  return !blockedHosts().some(entry =>
    Boolean(entry) && (normalized === entry || normalized.endsWith(`.${entry}`)))
}

/**
 * Map a detection to a catalogue row. Kept side-effect free so it can be
 * inspected and unit-tested.
 */
export function detectionToRow(detection: IncomingDetection, origin: SensorOrigin): CamUpsert {
  const source = SOURCE_BY_ID[origin]
  const kind = detection.kind && KINDS.has(detection.kind)
    ? detection.kind as CamUpsert['kind']
    : 'unknown'
  const protocol = detection.protocol && PROTOCOLS.has(detection.protocol)
    ? detection.protocol
    : 'http'
  const url = detection.url ?? null
  const evidence = detection.evidence ?? {}

  const vendorHints = [
    ...(detection.vendorHints ?? []),
    evidence.server ?? '',
    evidence.realm ?? '',
    evidence.title ?? ''
  ].filter(Boolean)

  const tags = [
    ...new Set([
      ...(detection.tags ?? []),
      origin === 'sensor' ? 'local-sensor' : 'imported-dataset',
      `port:${detection.port}`
    ])
  ].slice(0, 12)

  const isFrame = kind === 'snapshot' || kind === 'mjpeg'
  const isStream = protocol === 'rtsp' || kind === 'hls' || kind === 'video'

  return {
    id: camId(origin, `${detection.host}:${detection.port}`),
    source: origin,
    sourceName: source?.label ?? origin,
    externalId: `${detection.host}:${detection.port}`,
    title: (detection.title || '').slice(0, 140) || `Camera at ${detection.host}:${detection.port}`,
    host: detection.host,
    port: detection.port,
    scheme: protocol,
    kind,
    protocol: protocolLabel(kind, protocol),
    country: detection.context?.country ?? null,
    countryCode: null,
    region: null,
    city: detection.context?.city ?? null,
    lat: typeof detection.context?.lat === 'number' ? detection.context.lat : null,
    lon: typeof detection.context?.lon === 'number' ? detection.context.lon : null,
    org: detection.context?.org ?? null,
    vendor: normalizeVendor(...vendorHints),
    tags,
    imageUrl: isFrame ? url : null,
    streamUrl: isStream ? (protocol === 'rtsp' ? url : url) : null,
    pageUrl: kind === 'page' ? url : null,
    attribution: origin === 'sensor'
      ? 'Local sensor · your network'
      : 'Imported dataset · keep the original notice',
    license: origin === 'sensor'
      ? 'Your own network inventory'
      : 'Imported dataset — retain the source licence',
    isDemo: false
  }
}

/** Status a detection should carry *before* any verification probe. */
function initialStatus(kind: string, evidence: IncomingEvidence): 'live' | 'unknown' | 'page' {
  // Only claim "live" when bytes we can point at actually came back.
  if (kind === 'snapshot' || kind === 'mjpeg' || kind === 'hls' || kind === 'video') return 'live'
  if (kind === 'page' && !evidence.authRequired) return 'page'
  return 'unknown'
}

export interface IngestMeta {
  hosts?: number
  openPorts?: number
  durationMs?: number
  trigger?: string
  /**
   * Set by the CLI when a scan covered its whole scope without hitting the time
   * budget. Only then may unseen rows be retired: a partial batch (an import,
   * a truncated scan, a hand-made POST) must not delete the rest.
   */
  complete?: boolean
}

export function ingestDetections(
  detections: IncomingDetection[],
  origin: SensorOrigin,
  meta: IngestMeta = {}
): IngestResult {
  if (!Array.isArray(detections)) throw new Error('detections must be an array')
  if (detections.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} detections per request`)

  const startedAt = Date.now()
  const accepted: { detection: IncomingDetection, row: CamUpsert }[] = []
  let rejected = 0

  for (const detection of detections) {
    if (!detection || !hostAllowed(detection.host)) { rejected += 1; continue }
    if (typeof detection.port !== 'number' || !Number.isInteger(detection.port) || detection.port < 1 || detection.port > 65535) {
      rejected += 1
      continue
    }
    accepted.push({ detection, row: detectionToRow(detection, origin) })
  }

  const runId = startRun(origin, meta.trigger ?? 'manual', startedAt)

  if (!accepted.length) {
    finishRun(runId, { stored: 0, inserted: 0, updated: 0, deactivated: 0, rejected, durationMs: Date.now() - startedAt })
    return { stored: 0, inserted: 0, updated: 0, deactivated: 0, rejected, runId }
  }

  const stats = upsertCams(accepted.map(entry => entry.row), startedAt)

  for (const { detection, row } of accepted) {
    const evidence = detection.evidence ?? {}
    const httpStatus = typeof evidence.httpStatus === 'number' ? evidence.httpStatus : null
    const error = evidence.authRequired ? 'authentication required' : null
    const status = initialStatus(row.kind, evidence)

    if (status === 'live') {
      // A frame or manifest came back, so a real probe happened.
      recordProbe(row.id, { status: 'live', httpStatus, error, checkedAt: startedAt })
    } else {
      // Page-only or auth-gated: record the observation without claiming
      // that liveness was verified.
      setStatus(row.id, status, httpStatus, error)
    }
  }

  // Only a complete scan replaces the sensor's view of the network. Imports are
  // additive (a file is a slice, not a survey), truncated scans are partial, and
  // a silent run leaves everything alone — the network may just be down.
  const deactivated = origin === 'sensor' && meta.complete === true
    ? run(
      `UPDATE cams SET active = 0
       WHERE source = ? AND active = 1 AND last_seen_at < ?`,
      [origin, startedAt]
    ).changes
    : 0

  finishRun(runId, {
    stored: accepted.length,
    inserted: stats.inserted,
    updated: stats.updated,
    deactivated,
    rejected,
    durationMs: Date.now() - startedAt
  })

  return { stored: accepted.length, inserted: stats.inserted, updated: stats.updated, deactivated, rejected, runId }
}

/* ── Run bookkeeping ─────────────────────────────────────────────────────── */

function startRun(origin: SensorOrigin, trigger: string, startedAt: number): number {
  return run(
    `INSERT INTO sensor_runs (origin, trigger, started_at, status)
     VALUES (?, ?, ?, 'running')`,
    [origin, trigger, startedAt]
  ).lastInsertRowid
}

function finishRun(
  id: number,
  result: { stored: number, inserted: number, updated: number, deactivated: number, rejected: number, durationMs: number }
): void {
  run(
    `UPDATE sensor_runs
     SET finished_at = ?, status = 'ok', stored = ?, inserted = ?, updated = ?,
         deactivated = ?, rejected = ?, duration_ms = ?
     WHERE id = ?`,
    [Date.now(), result.stored, result.inserted, result.updated, result.deactivated, result.rejected, result.durationMs, id]
  )
}

export interface SensorStatus {
  ingestEnabled: boolean
  fetchLocalFrames: boolean
  counts: { local: number, localLive: number, imported: number }
  lastRun: {
    id: number
    origin: string
    trigger: string
    at: number
    stored: number
    inserted: number
    deactivated: number
    durationMs: number
  } | null
}

export function readSensorStatus(): SensorStatus {
  const counts = one<{ local: number, local_live: number, imported: number }>(
    `SELECT
       SUM(CASE WHEN source = 'sensor' AND active = 1 THEN 1 ELSE 0 END) AS local,
       SUM(CASE WHEN source = 'sensor' AND active = 1 AND status = 'live' THEN 1 ELSE 0 END) AS local_live,
       SUM(CASE WHEN source = 'import' AND active = 1 THEN 1 ELSE 0 END) AS imported
     FROM cams`
  )

  const lastRun = one<{
    id: number, origin: string, trigger: string, started_at: number,
    stored: number, inserted: number, deactivated: number, duration_ms: number
  }>(
    `SELECT id, origin, trigger, started_at, stored, inserted, deactivated, duration_ms
     FROM sensor_runs ORDER BY id DESC LIMIT 1`
  )

  return {
    ingestEnabled: true,
    fetchLocalFrames: true,
    counts: {
      local: counts?.local ?? 0,
      localLive: counts?.local_live ?? 0,
      imported: counts?.imported ?? 0
    },
    lastRun: lastRun
      ? {
          id: lastRun.id,
          origin: lastRun.origin,
          trigger: lastRun.trigger,
          at: lastRun.started_at,
          stored: lastRun.stored,
          inserted: lastRun.inserted,
          deactivated: lastRun.deactivated,
          durationMs: lastRun.duration_ms
        }
      : null
  }
}

/** Rows the sensor found that are worth showing in the app's "local" panel. */
export function listLocalRows(limit = 24): { id: string, host: string, port: number | null, title: string, status: string, source: string }[] {
  return all(
    `SELECT id, host, port, title, status, source
     FROM cams
     WHERE active = 1 AND source IN ('sensor', 'import')
     ORDER BY last_seen_at DESC
     LIMIT ?`,
    [limit]
  )
}
