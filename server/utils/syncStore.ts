import type { SourceRunSummary, SyncRunSummary } from '#shared/status'
import { all, one, run } from './db'

interface SyncRunRow {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  trigger: string
  summary_json: string | null
  demo: number
}

export function createSyncRun(trigger: string, demo = false, startedAt = Date.now()): number {
  const result = run(
    `INSERT INTO sync_runs (started_at, status, trigger, demo)
     VALUES (?, 'running', ?, ?)`,
    [new Date(startedAt).toISOString(), trigger, demo ? 1 : 0]
  )
  return result.lastInsertRowid
}

export function finishSyncRun(id: number, summary: SyncRunSummary, demo = false): void {
  run(
    `UPDATE sync_runs
     SET finished_at = ?, status = ?, summary_json = ?, demo = ?
     WHERE id = ?`,
    [
      summary.finishedAt ?? new Date().toISOString(),
      summary.status,
      JSON.stringify(summary),
      demo ? 1 : 0,
      id
    ]
  )
}

export function recordSourceRun(runId: number, summary: SourceRunSummary): void {
  run(
    `INSERT INTO source_runs (
       run_id, source, ok, fetched, inserted, updated, skipped, probed, live,
       duration_ms, error, at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      runId,
      summary.id,
      summary.ok ? 1 : 0,
      summary.fetched,
      summary.inserted,
      summary.updated,
      summary.skipped,
      summary.probed,
      summary.live,
      summary.durationMs,
      summary.error,
      new Date().toISOString()
    ]
  )
}

function parseSummary(row: SyncRunRow): SyncRunSummary {
  if (row.summary_json) {
    try {
      const parsed = JSON.parse(row.summary_json) as SyncRunSummary
      return {
        ...parsed,
        id: row.id,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status as SyncRunSummary['status'],
        trigger: row.trigger
      }
    } catch {
      // Fall through to a minimal reconstruction.
    }
  }
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as SyncRunSummary['status'],
    trigger: row.trigger,
    durationMs: 0,
    seen: 0,
    added: 0,
    updated: 0,
    probed: 0,
    live: 0,
    sources: [],
    errors: []
  }
}

export function latestSyncRun(): SyncRunSummary | null {
  const row = one<SyncRunRow>('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1')
  return row ? parseSummary(row) : null
}

export function latestRunBySource(): Record<string, SourceRunSummary> {
  const rows = all<{
    source: string
    ok: number
    fetched: number
    inserted: number
    updated: number
    skipped: number
    probed: number
    live: number
    duration_ms: number
    error: string | null
    at: string
  }>(
    `SELECT sr.* FROM source_runs sr
     WHERE sr.id = (SELECT MAX(id) FROM source_runs WHERE source = sr.source)`
  )

  const out: Record<string, SourceRunSummary> = {}
  for (const row of rows) {
    out[row.source] = {
      id: row.source,
      label: row.source,
      ok: row.ok === 1,
      fetched: row.fetched,
      inserted: row.inserted,
      updated: row.updated,
      skipped: row.skipped,
      probed: row.probed,
      live: row.live,
      durationMs: row.duration_ms,
      error: row.error
    }
  }
  return out
}

export function hasRealSync(): boolean {
  return Boolean(
    one<{ id: number }>(
      `SELECT id FROM sync_runs
       WHERE demo = 0 AND trigger != 'seed' AND status IN ('ok', 'partial')
       LIMIT 1`
    )
  )
}

export function hasAnyRun(): boolean {
  return Boolean(one<{ id: number }>('SELECT id FROM sync_runs LIMIT 1'))
}

export function latestSeedRun(): SyncRunSummary | null {
  const row = one<SyncRunRow>(
    `SELECT * FROM sync_runs WHERE trigger = 'seed' ORDER BY id DESC LIMIT 1`
  )
  return row ? parseSummary(row) : null
}

// ── Count history ───────────────────────────────────────────────────────

function dayStart(ts: number): number {
  const date = new Date(ts)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function writeCountSnapshot(total: number, live: number, demo: boolean, at = Date.now()): void {
  run(
    `INSERT INTO cam_count_snapshots (ts, total, live, demo)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ts) DO UPDATE SET
       total = excluded.total,
       live = excluded.live,
       demo = CASE WHEN excluded.demo = 0 THEN 0 ELSE cam_count_snapshots.demo END`,
    [dayStart(at), total, live, demo ? 1 : 0]
  )
}

export interface CountSnapshotRow {
  ts: number
  total: number
  live: number
  demo: number
}

export function listCountSnapshots(limit = 400): CountSnapshotRow[] {
  return all<CountSnapshotRow>(
    `SELECT ts, total, live, demo
     FROM cam_count_snapshots
     ORDER BY ts DESC
     LIMIT ?`,
    [limit]
  ).reverse()
}

export function countSnapshotCount(): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM cam_count_snapshots')?.n ?? 0
}
