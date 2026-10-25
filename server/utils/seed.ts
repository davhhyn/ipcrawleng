import { SOURCE_BY_ID } from '#shared/sources'
import { one, setMeta } from './db'
import { upsertCams } from './camStore'
import { createSyncRun, finishSyncRun, recordSourceRun, writeCountSnapshot } from './syncStore'
import { countSnapshotCount } from './syncStore'
import { dedupeCams, normalizeCam } from './ingest/normalize'
import { getProvider } from './ingest/registry'

const curated = SOURCE_BY_ID.curated!

function activeCount(): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM cams WHERE active = 1')?.n ?? 0
}

function seedDemoHistory(total: number, now: number): void {
  if (countSnapshotCount() > 0) return

  const today = new Date(now)
  for (let monthsAgo = 11; monthsAgo >= 1; monthsAgo--) {
    const date = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - monthsAgo,
      1
    ))
    const progress = (12 - monthsAgo) / 12
    const value = Math.max(1, Math.round(total * (0.3 + 0.7 * progress)))
    writeCountSnapshot(value, 0, true, date.getTime())
  }
  writeCountSnapshot(total, 0, true, now)
}

/**
 * Seed the bundled, clearly-labelled demo catalogue on an empty database.
 * No network calls, no probing — boot stays fast and the UI is fully populated.
 */
export async function seedDemoCatalog(): Promise<{ seeded: boolean, count: number }> {
  const existing = activeCount()
  if (existing > 0) return { seeded: false, count: existing }

  const provider = getProvider('curated')
  if (!provider) throw new Error('Curated provider is missing')

  const startedAt = Date.now()
  const runId = createSyncRun('seed', true, startedAt)
  const raws = await provider.discover({
    fetch: globalThis.fetch,
    timeoutMs: 5000,
    limit: 500,
    log: message => console.log(`[ipcrawl:seed] ${message}`)
  })

  const normalized = raws
    .map(raw => normalizeCam(raw, curated).cam)
    .filter((cam): cam is NonNullable<typeof cam> => Boolean(cam))
  const { cams } = dedupeCams(normalized)
  const stats = upsertCams(cams, startedAt, 0)

  const total = activeCount()
  seedDemoHistory(total, startedAt)
  writeCountSnapshot(total, 0, true, startedAt)
  setMeta('seeded_at', new Date(startedAt).toISOString())

  const sourceSummary = {
    id: 'curated',
    label: curated.label,
    ok: true,
    fetched: raws.length,
    inserted: stats.inserted,
    updated: stats.updated,
    skipped: raws.length - cams.length,
    probed: 0,
    live: 0,
    durationMs: Date.now() - startedAt,
    error: null
  }

  recordSourceRun(runId, sourceSummary)

  finishSyncRun(runId, {
    id: runId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    status: 'ok',
    trigger: 'seed',
    durationMs: Date.now() - startedAt,
    seen: raws.length,
    added: stats.inserted,
    updated: stats.updated,
    probed: 0,
    live: 0,
    sources: [sourceSummary],
    errors: []
  }, true)

  console.log(`[ipcrawl:seed] inserted ${stats.inserted} seed cameras`)

  return { seeded: true, count: total }
}
