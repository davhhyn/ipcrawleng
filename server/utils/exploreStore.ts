import type {
  ExploreFacet,
  ExploreFacets,
  ExploreListResponse,
  ExploreQuery
} from '#shared/explore'
import { EXPLORE_FACET_LIMIT } from '#shared/explore'
import { SOURCE_BY_ID } from '#shared/sources'
import type { MapPoint } from '#shared/map'
import { MAP_MAX_POINTS } from '#shared/map'
import { CAM_SELECT, rowToCard, type CamRow } from './camRow'
import { all, one } from './db'

type FacetField = 'country' | 'city' | 'vendor' | 'source' | 'kind' | 'status'

interface WhereClause {
  sql: string
  params: unknown[]
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const SEARCH_EXPRESSION = `lower(
  title || ' ' ||
  coalesce(city, '') || ' ' ||
  coalesce(region, '') || ' ' ||
  coalesce(country, '') || ' ' ||
  coalesce(vendor, '') || ' ' ||
  coalesce(org, '') || ' ' ||
  coalesce(tags_json, '')
)`

function buildWhere(query: ExploreQuery, skip?: FacetField): WhereClause {
  const clauses: string[] = ['active = 1']
  const params: unknown[] = []

  if (skip !== 'country' && query.countries.length) {
    clauses.push(`country IN (${query.countries.map(() => '?').join(',')})`)
    query.countries.forEach(value => params.push(value))
  }
  if (skip !== 'city' && query.cities.length) {
    clauses.push(`city IN (${query.cities.map(() => '?').join(',')})`)
    query.cities.forEach(value => params.push(value))
  }
  if (skip !== 'vendor' && query.vendors.length) {
    clauses.push(`vendor IN (${query.vendors.map(() => '?').join(',')})`)
    query.vendors.forEach(value => params.push(value))
  }
  if (skip !== 'source' && query.sources.length) {
    clauses.push(`source IN (${query.sources.map(() => '?').join(',')})`)
    query.sources.forEach(value => params.push(value))
  }
  if (skip !== 'kind' && query.kinds.length) {
    clauses.push(`kind IN (${query.kinds.map(() => '?').join(',')})`)
    query.kinds.forEach(value => params.push(value))
  }
  if (skip !== 'status' && query.status !== 'any') {
    clauses.push('status = ?')
    params.push(query.status)
  }

  if (query.favoritesOnly) {
    if (query.ids.length) {
      clauses.push(`id IN (${query.ids.map(() => '?').join(',')})`)
      query.ids.forEach(id => params.push(id))
    } else {
      clauses.push('0 = 1')
    }
  } else if (query.ids.length) {
    clauses.push(`id IN (${query.ids.map(() => '?').join(',')})`)
    query.ids.forEach(id => params.push(id))
  }

  if (query.q) {
    clauses.push(`${SEARCH_EXPRESSION} LIKE ? ESCAPE '\\'`)
    params.push(`%${escapeLike(query.q.toLowerCase())}%`)
  }

  return { sql: clauses.join(' AND '), params }
}

const ORDER_BY: Record<ExploreQuery['sort'], string> = {
  recent: 'COALESCE(last_probe_at, 0) DESC, last_seen_at DESC, first_seen_at DESC, title COLLATE NOCASE',
  favorites: 'fav_count DESC, COALESCE(last_probe_at, 0) DESC, last_seen_at DESC, title COLLATE NOCASE',
  name: 'title COLLATE NOCASE, country COLLATE NOCASE, id',
  discovered: 'first_seen_at DESC, id'
}

export function listCams(query: ExploreQuery): ExploreListResponse {
  const where = buildWhere(query)
  const total = one<{ n: number }>(`SELECT COUNT(*) AS n FROM cams WHERE ${where.sql}`, where.params)?.n ?? 0
  const offset = (query.page - 1) * query.pageSize

  const rows = all<CamRow>(
    `SELECT ${CAM_SELECT} FROM cams
     WHERE ${where.sql}
     ORDER BY ${ORDER_BY[query.sort] ?? ORDER_BY.recent}
     LIMIT ? OFFSET ?`,
    [...where.params, query.pageSize, offset]
  )

  return {
    items: rows.map(rowToCard),
    total,
    page: query.page,
    pageSize: query.pageSize,
    generatedAt: Date.now()
  }
}

function facetRows(query: ExploreQuery, field: FacetField, column: string): ExploreFacet[] {
  const where = buildWhere(query, field)
  const rows = all<{ value: string, count: number }>(
    `SELECT ${column} AS value, COUNT(*) AS count
     FROM cams
     WHERE ${where.sql} AND ${column} IS NOT NULL AND ${column} != ''
     GROUP BY ${column}
     ORDER BY count DESC, value COLLATE NOCASE
     LIMIT ${EXPLORE_FACET_LIMIT}`,
    where.params
  )
  return rows.map(row => ({ value: row.value, count: row.count }))
}

const KIND_LABELS: Record<string, string> = {
  snapshot: 'Snapshot',
  mjpeg: 'MJPEG stream',
  hls: 'HLS stream',
  video: 'Video',
  iframe: 'Embedded page',
  page: 'Documented page',
  unknown: 'Unknown'
}

const STATUS_LABELS: Record<string, string> = {
  live: 'Live / verified',
  offline: 'Offline',
  unknown: 'Unverified',
  page: 'Page only'
}

export function buildFacets(query: ExploreQuery): ExploreFacets {
  const sources = facetRows(query, 'source', 'source').map((facet) => {
    const definition = SOURCE_BY_ID[facet.value]
    return {
      ...facet,
      label: definition?.label ?? facet.value,
      accent: definition?.accent
    }
  })

  return {
    countries: facetRows(query, 'country', 'country'),
    cities: facetRows(query, 'city', 'city'),
    vendors: facetRows(query, 'vendor', 'vendor'),
    sources,
    kinds: facetRows(query, 'kind', 'kind').map(facet => ({
      ...facet,
      label: KIND_LABELS[facet.value] ?? facet.value
    })),
    statuses: facetRows(query, 'status', 'status').map(facet => ({
      ...facet,
      label: STATUS_LABELS[facet.value] ?? facet.value
    }))
  }
}

export function listMapPoints(): { points: MapPoint[], total: number, truncated: boolean } {
  const total = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cams
     WHERE active = 1 AND lat IS NOT NULL AND lon IS NOT NULL
       AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180`
  )?.n ?? 0

  const rows = all<CamRow>(
    `SELECT ${CAM_SELECT} FROM cams
     WHERE active = 1 AND lat IS NOT NULL AND lon IS NOT NULL
       AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
     ORDER BY (status = 'live') DESC, fav_count DESC, title COLLATE NOCASE
     LIMIT ?`,
    [MAP_MAX_POINTS]
  )

  const points: MapPoint[] = rows.map((row) => {
    const card = rowToCard(row)
    return {
      id: card.id,
      title: card.title,
      lat: row.lat as number,
      lon: row.lon as number,
      country: card.country,
      countryCode: card.countryCode,
      city: card.city,
      status: card.status,
      kind: card.kind,
      source: card.source,
      sourceLabel: card.sourceLabel,
      thumb: card.thumb,
      isLive: card.isLive,
      favCount: card.favCount
    }
  })

  return { points, total, truncated: total > points.length }
}

export function countByColumn(column: string, limit = 24): { value: string, count: number }[] {
  const allowed = new Set(['country', 'vendor', 'source', 'kind', 'status', 'country_code', 'region'])
  if (!allowed.has(column)) throw new Error(`Unsupported facet column: ${column}`)
  return all<{ value: string, count: number }>(
    `SELECT ${column} AS value, COUNT(*) AS count
     FROM cams
     WHERE active = 1 AND ${column} IS NOT NULL AND ${column} != ''
     GROUP BY ${column}
     ORDER BY count DESC, value COLLATE NOCASE
     LIMIT ?`,
    [limit]
  )
}
