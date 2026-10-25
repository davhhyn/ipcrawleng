/** Shared contract for the catalogue ("Explore") surface. */

export const CAM_STATUSES = ['live', 'offline', 'unknown', 'page'] as const
export type CamStatus = (typeof CAM_STATUSES)[number]

export const CAM_KINDS = ['snapshot', 'mjpeg', 'hls', 'video', 'iframe', 'page', 'unknown'] as const
export type CamKind = (typeof CAM_KINDS)[number]

export const EXPLORE_SORTS = ['recent', 'favorites', 'name', 'discovered'] as const
export type ExploreSort = (typeof EXPLORE_SORTS)[number]

export const EXPLORE_DEFAULT_PAGE_SIZE = 24
export const EXPLORE_MAX_PAGE_SIZE = 60
export const EXPLORE_MAX_FILTER_VALUES = 50
export const EXPLORE_MAX_FAVORITES = 50
export const EXPLORE_FACET_LIMIT = 200

export interface ExploreFacet {
  value: string
  label?: string
  count: number
  accent?: string
}

export interface ExploreFacets {
  countries: ExploreFacet[]
  cities: ExploreFacet[]
  vendors: ExploreFacet[]
  sources: ExploreFacet[]
  kinds: ExploreFacet[]
  statuses: ExploreFacet[]
}

export interface ExploreCamCard {
  id: string
  title: string
  country: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  /** "City, Country" (or whichever parts exist). */
  location: string | null
  lat: number | null
  lon: number | null
  vendor: string | null
  source: string
  sourceLabel: string
  kind: CamKind
  status: CamStatus
  isLive: boolean
  liveVerified: boolean
  /** Highly-cached still frame (never triggers a probe). */
  thumb: string
  favCount: number
  firstSeenAt: number | null
  lastSeenAt: number | null
  /** Row comes from the bundled dataset rather than a live provider sync. */
  isDemo: boolean
}

export interface ExploreCamDetail extends ExploreCamCard {
  port: number | null
  protocol: string | null
  tags: string[]
  attribution: string | null
  license: string | null
  /** Public documentation page for the camera (never the raw stream host). */
  sourceUrl: string | null
  probe: {
    checkedAt: number | null
    httpStatus: number | null
    error: string | null
  }
  liveProbeActive: boolean
  /** On-demand live-or-fallback frame used by the dialog. */
  frame: string
}

export interface ExploreListResponse {
  items: ExploreCamCard[]
  total: number
  page: number
  pageSize: number
  generatedAt: number
}

export interface ExploreFavoriteResponse {
  on: boolean
  count: number
}

export interface ExploreQuery {
  page: number
  pageSize: number
  sort: ExploreSort
  q: string
  countries: string[]
  cities: string[]
  vendors: string[]
  sources: string[]
  kinds: string[]
  status: CamStatus | 'any'
  /** Restrict to the explicit id allow-list (the viewer's local favorites). */
  favoritesOnly: boolean
  /** Explicit id allow-list, used by the local favorites filter. */
  ids: string[]
}

/** Normalize repeated (`country=US&country=CA`) or bracketed arrays. */
export function toFilterValues(...candidates: unknown[]): string[] {
  const out: string[] = []
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) if (typeof item === 'string' && item) out.push(item)
    } else if (typeof candidate === 'string' && candidate) {
      out.push(candidate)
    }
  }
  return [...new Set(out)].slice(0, EXPLORE_MAX_FILTER_VALUES)
}

export function toQueryInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string'
    ? Number.parseInt(value, 10)
    : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T[number]
    : fallback
}

/**
 * Parse + validate the explore query. Kept in shared/ so the client's
 * URL-synced state and the server's SQL filters can never drift.
 */
export function parseExploreQuery(raw: Record<string, unknown>): ExploreQuery {
  return {
    page: Math.max(1, toQueryInt(raw.page, 1)),
    pageSize: Math.min(
      EXPLORE_MAX_PAGE_SIZE,
      Math.max(1, toQueryInt(raw.pageSize, EXPLORE_DEFAULT_PAGE_SIZE))
    ),
    sort: oneOf(raw.sort, EXPLORE_SORTS, 'recent'),
    q: typeof raw.q === 'string' ? raw.q.trim().slice(0, 80) : '',
    countries: toFilterValues(raw.country, raw['country[]']),
    cities: toFilterValues(raw.city, raw['city[]']),
    vendors: toFilterValues(raw.vendor, raw['vendor[]']),
    sources: toFilterValues(raw.source, raw['source[]']),
    kinds: toFilterValues(raw.kind, raw['kind[]']),
    status: oneOf(raw.status, [...CAM_STATUSES, 'any'] as const, 'any'),
    favoritesOnly: raw.fav === '1' || raw.favorites === '1' || raw.fav === 'true',
    ids: toFilterValues(raw.id, raw['id[]'])
  }
}

export function isLiveStatus(status: string): boolean {
  return status === 'live'
}
