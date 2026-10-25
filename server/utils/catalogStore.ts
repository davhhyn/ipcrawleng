import type { CatalogStatus, SourceHealth, SourcesResponse } from '#shared/status'
import type { StatsFacet, StatsHistoryResponse, StatsResponse } from '#shared/stats'
import { SOURCES, SOURCE_BY_ID } from '#shared/sources'
import { KIND_LABELS, STATUS_LABELS } from '#shared/labels'
import type { CamKind, CamStatus } from '#shared/explore'
import { findCountry, countryCodeOf, countryNameOf } from '#shared/countries'
import { all, getMeta, isDatabaseAvailable, one } from './db'
import { countByColumn } from './exploreStore'
import { favoritesTotal } from './camStore'
import {
  hasRealSync,
  latestRunBySource,
  latestSyncRun,
  listCountSnapshots
} from './syncStore'
import { configuredSourceIds, missingSourceKey } from './config'
import { isLocalSource } from '#shared/sources'

interface CountsRow {
  total: number
  live: number
  countries: number
  sources: number
  vendors: number
  page_only: number
  offline: number
  unverified: number
  with_coords: number
  with_city: number
  with_vendor: number
}

const COUNTS_SQL = `SELECT
  COUNT(*) AS total,
  COALESCE(SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END), 0) AS live,
  COUNT(DISTINCT CASE WHEN country IS NOT NULL AND country != '' THEN country END) AS countries,
  COUNT(DISTINCT source) AS sources,
  COUNT(DISTINCT CASE WHEN vendor IS NOT NULL AND vendor != '' THEN vendor END) AS vendors,
  COALESCE(SUM(CASE WHEN status = 'page' THEN 1 ELSE 0 END), 0) AS page_only,
  COALESCE(SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END), 0) AS offline,
  COALESCE(SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END), 0) AS unverified,
  COALESCE(SUM(CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN 1 ELSE 0 END), 0) AS with_coords,
  COALESCE(SUM(CASE WHEN city IS NOT NULL AND city != '' THEN 1 ELSE 0 END), 0) AS with_city,
  COALESCE(SUM(CASE WHEN vendor IS NOT NULL AND vendor != '' THEN 1 ELSE 0 END), 0) AS with_vendor
FROM cams
WHERE active = 1`

function readCounts(): CountsRow {
  return one<CountsRow>(COUNTS_SQL) ?? {
    total: 0,
    live: 0,
    countries: 0,
    sources: 0,
    vendors: 0,
    page_only: 0,
    offline: 0,
    unverified: 0,
    with_coords: 0,
    with_city: 0,
    with_vendor: 0
  }
}

function isSeeded(): boolean {
  if (getMeta('seeded_at')) return true
  return Boolean(
    one<{ id: string }>("SELECT id FROM cams WHERE source = 'curated' AND active = 1 LIMIT 1")
  )
}

export function readCatalogStatus(): CatalogStatus {
  const config = useRuntimeConfig()
  const available = isDatabaseAvailable()
  const version = String(config.public.version || '1.0.0')

  if (!available) {
    return {
      ok: false,
      version,
      demoMode: true,
      seeded: false,
      counts: { total: 0, live: 0, countries: 0, sources: 0, vendors: 0 },
      lastSync: null,
      database: { available: false, engine: 'unavailable' },
      generatedAt: Date.now(),
      uptimeSec: Math.round(process.uptime())
    }
  }

  const counts = readCounts()
  const last = latestSyncRun()

  return {
    ok: true,
    version,
    demoMode: !hasRealSync(),
    seeded: isSeeded(),
    counts: {
      total: counts.total,
      live: counts.live,
      countries: counts.countries,
      sources: counts.sources,
      vendors: counts.vendors
    },
    lastSync: last
      ? {
          id: last.id,
          startedAt: last.startedAt,
          finishedAt: last.finishedAt,
          status: last.status,
          trigger: last.trigger
        }
      : null,
    database: { available: true, engine: 'node:sqlite' },
    generatedAt: Date.now(),
    uptimeSec: Math.round(process.uptime())
  }
}

export function readSources(syncEnabled: boolean): SourcesResponse {
  const enabledIds = configuredSourceIds()
  const counts = all<{ source: string, n: number }>(
    'SELECT source, COUNT(*) AS n FROM cams WHERE active = 1 GROUP BY source'
  )
  const countBySource = Object.fromEntries(counts.map(row => [row.source, row.n]))
  const latest = latestRunBySource()

  const sources: SourceHealth[] = SOURCES.map((definition) => {
    const lastRun = latest[definition.id]
      ? { ...latest[definition.id]!, label: definition.label }
      : null
    return {
      id: definition.id,
      label: definition.label,
      short: definition.short,
      kind: definition.kind,
      description: definition.description,
      homepage: definition.homepage,
      license: definition.license,
      licenseUrl: definition.licenseUrl,
      keyless: definition.keyless,
      requiresEnv: definition.requiresEnv,
      accent: definition.accent,
      coverage: definition.coverage,
      // Local sources have no scheduler: they are "available" whenever an
      // operator runs the sensor, never "enabled by config".
      enabled: definition.id === 'curated' || isLocalSource(definition.id)
        ? true
        : enabledIds.includes(definition.id),
      awaitingKey: missingSourceKey(definition.id),
      cams: countBySource[definition.id] ?? 0,
      lastRun,
      healthy: lastRun?.ok === true
        || (definition.id === 'curated' && (countBySource.curated ?? 0) > 0)
        || (isLocalSource(definition.id) && (countBySource[definition.id] ?? 0) > 0)
    }
  })

  return {
    sources,
    lastSync: latestSyncRun(),
    syncEnabled,
    generatedAt: Date.now()
  }
}

export function readStats(): StatsResponse {
  const counts = readCounts()
  const total = counts.total || 0

  const topCountries: StatsFacet[] = countByColumn('country', 12).map(row => ({
    value: row.value,
    label: row.value,
    count: row.count
  }))

  const topVendors: StatsFacet[] = countByColumn('vendor', 10).map(row => ({
    value: row.value,
    label: row.value,
    count: row.count
  }))

  const bySource: StatsFacet[] = countByColumn('source', 20)
    .map(row => ({
      value: row.value,
      label: SOURCE_BY_ID[row.value]?.label ?? row.value,
      accent: SOURCE_BY_ID[row.value]?.accent,
      count: row.count
    }))
    .sort((a, b) => b.count - a.count)

  const byKind: StatsFacet[] = countByColumn('kind', 20).map(row => ({
    value: row.value,
    label: KIND_LABELS[row.value as CamKind] ?? row.value,
    count: row.count
  }))

  const statusCounts = Object.fromEntries(
    all<{ status: string, n: number }>(
      'SELECT status, COUNT(*) AS n FROM cams WHERE active = 1 GROUP BY status'
    ).map(row => [row.status, row.n])
  )
  const byStatus: StatsFacet[] = (['live', 'unknown', 'offline', 'page'] as CamStatus[]).map(status => ({
    value: status,
    label: STATUS_LABELS[status],
    count: statusCounts[status] ?? 0
  }))

  const regionCounts = new Map<string, number>()
  for (const row of countByColumn('country', 300)) {
    const region = findCountry(row.value)?.region || 'Other'
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + row.count)
  }
  const byRegion: StatsFacet[] = [...regionCounts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count)

  return {
    counts: {
      total,
      active: total,
      live: counts.live,
      countries: counts.countries,
      sources: counts.sources,
      vendors: counts.vendors,
      pageOnly: counts.page_only,
      offline: counts.offline,
      unverified: counts.unverified,
      favorites: favoritesTotal()
    },
    coverage: {
      withCoords: counts.with_coords,
      withCity: counts.with_city,
      withVendor: counts.with_vendor,
      liveRate: total > 0 ? Math.round((counts.live / total) * 1000) / 10 : 0
    },
    topCountries,
    topVendors,
    bySource,
    byKind,
    byStatus,
    byRegion,
    generatedAt: Date.now(),
    demoMode: !hasRealSync()
  }
}

export function readHistory(): StatsHistoryResponse {
  const points = listCountSnapshots().map((row) => ({
    ts: row.ts,
    total: row.total,
    live: row.live,
    demo: row.demo === 1
  }))
  return {
    points,
    demo: points.length > 0 && points.every(point => point.demo),
    generatedAt: Date.now()
  }
}

/**
 * Normalize country naming for stats consumers that need an ISO code too.
 * Exposed mainly for tests and future facets.
 */
export function countryMeta(value: string | null): { code: string | null, name: string | null } {
  return {
    code: countryCodeOf(value),
    name: countryNameOf(value)
  }
}
