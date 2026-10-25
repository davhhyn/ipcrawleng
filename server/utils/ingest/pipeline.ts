import type { SourceRunSummary, SyncRunSummary } from '#shared/status'
import { SOURCE_BY_ID } from '#shared/sources'
import type { CamRow } from '../camRow'
import { one } from '../db'
import {
  configuredSourceIds,
  isSourceEnabled,
  maxIngestPerSource,
  probeBudgetMs,
  probeEnabled
} from '../config'
import {
  deactivateSource,
  listCamRows,
  listProbeCandidates,
  pruneInactive,
  updateCamEnrichment,
  upsertCams
} from '../camStore'
import { probeBatch } from '../probe'
import {
  createSyncRun,
  finishSyncRun,
  recordSourceRun,
  writeCountSnapshot
} from '../syncStore'
import { dedupeCams, normalizeCam, type NormalizedCam } from './normalize'
import { ENRICHMENT_PROVIDER_IDS, getProvider } from './registry'
import type { ProviderContext, RawCam } from './types'

const PROVIDER_TIMEOUT_MS = 50_000
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000
let currentRun: Promise<SyncRunSummary> | null = null

interface DiscoveryResult {
  id: string
  ok: boolean
  raws: RawCam[]
  normalized: NormalizedCam[]
  skipped: number
  error: string | null
  durationMs: number
}

function readTotals(): { total: number, live: number } {
  const row = one<{ total: number, live: number | null }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END), 0) AS live
     FROM cams WHERE active = 1`
  )
  return { total: row?.total ?? 0, live: row?.live ?? 0 }
}

async function discover(id: string): Promise<DiscoveryResult> {
  const startedAt = Date.now()
  const definition = SOURCE_BY_ID[id]
  const provider = getProvider(id)
  if (!definition || !provider) {
    return {
      id,
      ok: false,
      raws: [],
      normalized: [],
      skipped: 0,
      error: 'provider not implemented',
      durationMs: 0
    }
  }

  const context: ProviderContext = {
    fetch: globalThis.fetch,
    timeoutMs: PROVIDER_TIMEOUT_MS,
    limit: maxIngestPerSource(),
    log: (message) => console.log(`[ipcrawl:${id}] ${message}`)
  }

  try {
    const raws = await provider.discover(context)
    const normalized: NormalizedCam[] = []
    let skipped = 0
    for (const raw of raws) {
      const result = normalizeCam(raw, definition)
      if (result.cam) normalized.push(result.cam)
      else skipped++
    }
    return {
      id,
      ok: true,
      raws,
      normalized,
      skipped,
      error: null,
      durationMs: Date.now() - startedAt
    }
  } catch (error) {
    return {
      id,
      ok: false,
      raws: [],
      normalized: [],
      skipped: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt
    }
  }
}

function emptySourceSummary(id: string): SourceRunSummary {
  return {
    id,
    label: SOURCE_BY_ID[id]?.label ?? id,
    ok: false,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    probed: 0,
    live: 0,
    durationMs: 0,
    error: null
  }
}

async function executeSync(trigger: string): Promise<SyncRunSummary> {
  const startedAt = Date.now()
  const runId = createSyncRun(trigger, false, startedAt)
  const enabled = configuredSourceIds().filter(id => isSourceEnabled(id))
  const discoveryIds = enabled.filter(id => !ENRICHMENT_PROVIDER_IDS.has(id))
  const enrichmentIds = enabled.filter(id => ENRICHMENT_PROVIDER_IDS.has(id))

  const summary: SyncRunSummary = {
    id: runId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    status: 'running',
    trigger,
    durationMs: 0,
    seen: 0,
    added: 0,
    updated: 0,
    probed: 0,
    live: 0,
    sources: [],
    errors: []
  }

  if (discoveryIds.length === 0) {
    summary.errors.push('No discovery sources are enabled (check NUXT_SYNC_SOURCES).')
  }

  // Discovery is network-bound and independent per provider; run concurrently
  // so one slow Overpass query doesn't serialize the fast traffic APIs.
  const discovered = await Promise.all(discoveryIds.map(id => discover(id)))
  const normalized = discovered.flatMap(result => result.normalized)
  const { cams: merged, dropped } = dedupeCams(normalized)

  const sourceSummaries: SourceRunSummary[] = []
  let discoverySuccesses = 0

  for (const result of discovered) {
    const sourceSummary = emptySourceSummary(result.id)
    sourceSummary.durationMs = result.durationMs
    sourceSummary.fetched = result.raws.length
    sourceSummary.skipped = result.skipped
    sourceSummary.error = result.error

    if (!result.ok) {
      summary.errors.push(`${result.id}: ${result.error}`)
      sourceSummaries.push(sourceSummary)
      continue
    }
    discoverySuccesses++

    const sourceCams = merged.filter(cam => cam.source === result.id)
    if (result.raws.length > 0) {
      // Only a provider that actually answered may replace its slice of the
      // catalogue. A failed provider never wipes its previous rows.
      deactivateSource(result.id)
      const stats = upsertCams(sourceCams, startedAt, 6 * 60 * 60 * 1000)
      sourceSummary.inserted = stats.inserted
      sourceSummary.updated = stats.updated
      sourceSummary.skipped = Math.max(result.skipped, result.raws.length - sourceCams.length)
      summary.added += stats.inserted
      summary.updated += stats.updated
    } else {
      sourceSummary.error = 'provider returned no cameras — existing rows left untouched'
    }

    if (result.id === 'curated' && sourceCams.length > 0) {
      sourceSummary.ok = true
    } else {
      sourceSummary.ok = true
    }

    sourceSummaries.push(sourceSummary)
  }

  // ── Liveness probes ───────────────────────────────────────────────────
  if (probeEnabled()) {
    const candidates = new Map<string, CamRow>()
    for (const id of discoveryIds) {
      const definition = SOURCE_BY_ID[id]
      if (!definition) continue
      for (const row of listProbeCandidates({
        staleBefore: Date.now() - 6 * 60 * 60 * 1000,
        limit: 60,
        source: id
      })) {
        candidates.set(row.id, row)
      }
    }

    const batch = await probeBatch([...candidates.values()].slice(0, 200), {
      concurrency: 6,
      budgetMs: probeBudgetMs()
    })
    summary.probed = batch.probed
    summary.live = batch.live
    for (const source of sourceSummaries) {
      const bucket = batch.bySource[source.id]
      if (bucket) {
        source.probed = bucket.probed
        source.live = bucket.live
      }
    }
  }

  // ── Enrichment (never discovers cameras on its own) ────────────────────
  for (const id of enrichmentIds) {
    const provider = getProvider(id)
    const definition = SOURCE_BY_ID[id]
    if (!provider?.enrich || !definition) continue
    const enrichStarted = Date.now()
    const enrichSummary = emptySourceSummary(id)
    enrichSummary.updated = 0
    try {
      const rows = listCamRows(4000)
      const updates = await provider.enrich(rows, {
        fetch: globalThis.fetch,
        timeoutMs: PROVIDER_TIMEOUT_MS,
        limit: maxIngestPerSource(),
        log: message => console.log(`[ipcrawl:${id}] ${message}`)
      })
      for (const update of updates) {
        updateCamEnrichment(update.id, update.tags, update.vendor)
      }
      enrichSummary.fetched = rows.length
      enrichSummary.updated = updates.length
      enrichSummary.ok = true
      enrichSummary.durationMs = Date.now() - enrichStarted
    } catch (error) {
      enrichSummary.error = error instanceof Error ? error.message : String(error)
      enrichSummary.durationMs = Date.now() - enrichStarted
      summary.errors.push(`${id}: ${enrichSummary.error}`)
    }
    sourceSummaries.push(enrichSummary)
  }

  // ── Finalize ──────────────────────────────────────────────────────────
  const totals = readTotals()
  writeCountSnapshot(totals.total, totals.live, false, Date.now())
  pruneInactive(Date.now() - RETENTION_MS)

  summary.sources = sourceSummaries
  summary.seen = discovered.reduce((sum, result) => sum + result.raws.length, 0)
  summary.status = discoverySuccesses === 0 ? 'failed' : (summary.errors.length ? 'partial' : 'ok')
  summary.finishedAt = new Date().toISOString()
  summary.durationMs = Date.now() - startedAt

  for (const source of sourceSummaries) {
    recordSourceRun(runId, source)
  }
  finishSyncRun(runId, summary, false)

  if (dropped > 0) {
    console.log(`[ipcrawl:sync] deduped ${dropped} cross-source duplicate(s)`)
  }
  console.log(
    `[ipcrawl:sync] ${summary.status}: ${summary.seen} seen, ${summary.added} added, `
    + `${summary.updated} updated, ${summary.probed} probed, ${summary.live} live `
    + `in ${summary.durationMs}ms`
  )

  return summary
}

export function isSyncRunning(): boolean {
  return currentRun !== null
}

/**
 * Run one ingestion pass. Concurrent callers share the in-flight run instead of
 * stampeding every provider.
 */
export function runSync(trigger = 'manual'): Promise<SyncRunSummary> {
  if (currentRun) return currentRun
  currentRun = executeSync(trigger).finally(() => {
    currentRun = null
  })
  return currentRun
}
