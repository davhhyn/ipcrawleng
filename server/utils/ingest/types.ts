import type { CamKind } from '#shared/explore'
import type { CamRow } from '../camRow'

export interface RawCam {
  source: string
  externalId: string
  title: string
  /** Primary public URL: image, stream or documentation page. */
  url?: string | null
  imageUrl?: string | null
  streamUrl?: string | null
  pageUrl?: string | null
  kind?: CamKind | null
  country?: string | null
  region?: string | null
  city?: string | null
  lat?: number | null
  lon?: number | null
  org?: string | null
  vendor?: string | null
  tags?: string[]
  attribution?: string | null
  license?: string | null
  isDemo?: boolean
}

export interface FetchOptions {
  timeoutMs: number
  maxBytes?: number
  headers?: Record<string, string>
  method?: 'GET' | 'POST' | 'HEAD'
  body?: string
}

export interface FetchedBody {
  status: number
  ok: boolean
  contentType: string
  bytes: Uint8Array
  finalUrl: string
  headers: Headers
}

export interface ProviderContext {
  fetch: typeof globalThis.fetch
  timeoutMs: number
  limit: number
  signal?: AbortSignal
  log: (message: string) => void
}

export interface EnrichmentUpdate {
  id: string
  tags: string[]
  vendor: string | null
  note: string
}

export interface CameraProvider {
  id: string
  discover(context: ProviderContext): Promise<RawCam[]>
  /** Optional post-discovery enrichment over already-stored rows. */
  enrich?(rows: CamRow[], context: ProviderContext): Promise<EnrichmentUpdate[]>
}

export class ProviderError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message)
    this.name = 'ProviderError'
  }
}
