/** Catalogue status + sync/source-health contracts. */

export interface StatusCounts {
  total: number
  live: number
  countries: number
  sources: number
  vendors: number
}

export interface LastSyncSummary {
  id: number
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'ok' | 'partial' | 'failed'
  trigger: string
}

export interface CatalogStatus {
  ok: boolean
  version: string
  /** No successful upstream sync yet — the bundled dataset is doing the work. */
  demoMode: boolean
  seeded: boolean
  counts: StatusCounts
  lastSync: LastSyncSummary | null
  database: {
    available: boolean
    engine: 'node:sqlite' | 'unavailable'
  }
  generatedAt: number
  uptimeSec: number
}

export interface SourceRunSummary {
  id: string
  label: string
  ok: boolean
  fetched: number
  inserted: number
  updated: number
  skipped: number
  probed: number
  live: number
  durationMs: number
  error: string | null
}

export interface SyncRunSummary {
  id: number
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'ok' | 'partial' | 'failed'
  trigger: string
  durationMs: number
  seen: number
  added: number
  updated: number
  probed: number
  live: number
  sources: SourceRunSummary[]
  errors: string[]
}

export interface SourceHealth {
  id: string
  label: string
  short: string
  kind: 'discovery' | 'enrichment' | 'seed'
  description: string
  homepage: string
  license: string
  licenseUrl: string
  keyless: boolean
  requiresEnv?: string
  accent: string
  coverage: string
  /** Included in the configured sync set and ready to run. */
  enabled: boolean
  /** Configured but missing a required key. */
  awaitingKey: boolean
  cams: number
  lastRun: SourceRunSummary | null
  healthy: boolean
}

export interface SourcesResponse {
  sources: SourceHealth[]
  lastSync: SyncRunSummary | null
  syncEnabled: boolean
  generatedAt: number
}

export interface IpResponse {
  ip: string | null
  indexed: boolean
  matchedCam: { id: string; title: string; country: string | null } | null
  generatedAt: number
}
