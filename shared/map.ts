import type { CamKind, CamStatus } from './explore'

export interface MapPoint {
  id: string
  title: string
  lat: number
  lon: number
  country: string | null
  countryCode: string | null
  city: string | null
  status: CamStatus
  kind: CamKind
  source: string
  sourceLabel: string
  thumb: string
  isLive: boolean
  favCount: number
}

export interface MapPointsResponse {
  points: MapPoint[]
  total: number
  truncated: boolean
  generatedAt: number
}

/** Points beyond this are dropped from the map payload; the atlas is a view. */
export const MAP_MAX_POINTS = 20000
