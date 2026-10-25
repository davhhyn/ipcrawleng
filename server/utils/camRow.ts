import type {
  CamKind,
  CamStatus,
  ExploreCamCard,
  ExploreCamDetail
} from '#shared/explore'
import { CAM_KINDS, CAM_STATUSES } from '#shared/explore'
import { apiExploreFramePath, apiExploreThumbPath } from '#shared/routes'
import { countryCodeOf } from '#shared/countries'
import { SOURCE_BY_ID } from '#shared/sources'

/** Internal row shape. `host`, `image_url` and `stream_url` never leave the server. */
export interface CamRow {
  id: string
  source: string
  source_name: string
  external_id: string
  title: string
  host: string
  port: number | null
  scheme: string | null
  kind: string
  protocol: string | null
  country: string | null
  country_code: string | null
  region: string | null
  city: string | null
  lat: number | null
  lon: number | null
  org: string | null
  vendor: string | null
  tags_json: string | null
  image_url: string | null
  stream_url: string | null
  page_url: string | null
  attribution: string | null
  license: string | null
  status: string
  http_status: number | null
  probe_error: string | null
  last_probe_at: number | null
  first_seen_at: number
  last_seen_at: number
  fav_count: number
  active: number
  is_demo: number
}

export const CAM_SELECT = `id, source, source_name, external_id, title, host, port, scheme,
  kind, protocol, country, country_code, region, city, lat, lon, org, vendor,
  tags_json, image_url, stream_url, page_url, attribution, license, status,
  http_status, probe_error, last_probe_at, first_seen_at, last_seen_at,
  fav_count, active, is_demo`

export function asKind(value: string): CamKind {
  return (CAM_KINDS as readonly string[]).includes(value) ? value as CamKind : 'unknown'
}

export function asStatus(value: string): CamStatus {
  return (CAM_STATUSES as readonly string[]).includes(value) ? value as CamStatus : 'unknown'
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string').slice(0, 12)
      : []
  } catch {
    return []
  }
}

export function isProbeableKind(kind: string): boolean {
  return kind === 'snapshot' || kind === 'mjpeg' || kind === 'hls' || kind === 'video'
}

function locationLabel(city: string | null, country: string | null, region: string | null): string | null {
  const parts = [city, region && region !== city ? region : null, country]
    .filter((part): part is string => Boolean(part && part.trim()))
  return parts.length ? parts.join(', ') : null
}

export function rowToCard(row: CamRow): ExploreCamCard {
  const sourceDefinition = SOURCE_BY_ID[row.source]
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    countryCode: row.country_code || countryCodeOf(row.country),
    region: row.region,
    city: row.city,
    location: locationLabel(row.city, row.country, row.region),
    lat: typeof row.lat === 'number' ? row.lat : null,
    lon: typeof row.lon === 'number' ? row.lon : null,
    vendor: row.vendor,
    source: row.source,
    sourceLabel: row.source_name || sourceDefinition?.label || row.source,
    kind: asKind(row.kind),
    status: asStatus(row.status),
    isLive: row.status === 'live',
    liveVerified: typeof row.last_probe_at === 'number',
    thumb: apiExploreThumbPath(row.id),
    favCount: row.fav_count ?? 0,
    firstSeenAt: row.first_seen_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    isDemo: row.is_demo === 1
  }
}

export function rowToDetail(row: CamRow): ExploreCamDetail {
  const card = rowToCard(row)
  const config = useRuntimeConfig()
  return {
    ...card,
    port: row.port,
    protocol: row.protocol,
    tags: parseTags(row.tags_json),
    attribution: row.attribution,
    license: row.license,
    sourceUrl: row.page_url,
    probe: {
      checkedAt: row.last_probe_at,
      httpStatus: row.http_status,
      error: row.probe_error
    },
    liveProbeActive: Boolean(config.enableLiveProbe) && isProbeableKind(row.kind),
    frame: apiExploreFramePath(row.id)
  }
}
