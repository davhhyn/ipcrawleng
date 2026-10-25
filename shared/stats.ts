import type { StatusCounts } from './status'

export interface StatsFacet {
  value: string
  label?: string
  count: number
  accent?: string
}

export interface StatsResponse {
  counts: StatusCounts & {
    active: number
    live: number
    pageOnly: number
    offline: number
    unverified: number
    favorites: number
  }
  coverage: {
    withCoords: number
    withCity: number
    withVendor: number
    liveRate: number
  }
  topCountries: StatsFacet[]
  topVendors: StatsFacet[]
  bySource: StatsFacet[]
  byKind: StatsFacet[]
  byStatus: StatsFacet[]
  byRegion: StatsFacet[]
  generatedAt: number
  demoMode: boolean
}

export interface StatsHistoryPoint {
  ts: number
  total: number
  live: number
  demo: boolean
}

export interface StatsHistoryResponse {
  points: StatsHistoryPoint[]
  /** The series includes seeded demo history rather than real syncs only. */
  demo: boolean
  generatedAt: number
}
