import type { CamKind, CamStatus } from './explore'

export interface FunChannel {
  id: string
  title: string
  frame: string
  thumb: string
  location: string | null
  country: string | null
  countryCode: string | null
  city: string | null
  region: string | null
  lat: number | null
  lon: number | null
  vendor: string | null
  source: string
  sourceLabel: string
  kind: CamKind
  status: CamStatus
  isLive: boolean
  favCount: number
  /** 1-based position in the shuffled queue, for the channel HUD. */
  total: number
}

export interface FunCamResponse {
  channel: FunChannel | null
  total: number
  demoMode: boolean
}

export interface FunQuery {
  live: boolean
  exclude: string[]
  source: string | null
}
