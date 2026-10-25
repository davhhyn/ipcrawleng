import { isIP } from 'node:net'
import { ProviderError, type CameraProvider, type RawCam } from '../types'
import {
  shodanApiKey,
  shodanEndpoint,
  shodanMinIntervalMs,
  shodanPages,
  shodanQuery
} from '../../config'

/**
 * Optional Shodan API provider.
 *
 * This is for operators who already pay for a Shodan plan. It is off unless
 * BOTH conditions hold:
 *
 *   1. `NUXT_SHODAN_API_KEY` is set, and
 *   2. `shodan` appears in `NUXT_SYNC_SOURCES`.
 *
 * The default source list never includes it, so a checkout with no keys never
 * talks to Shodan at all.
 *
 * Two deliberate constraints shape what this adapter does with the results:
 *
 *  - **A match is a candidate, not a fact.** Shodan's index is a snapshot that
 *    may be weeks old. Every row this provider emits goes through the normal
 *    pipeline, which re-probes the host and records its own verdict. Shodan's
 *    `http.status` is used for the title/kind hint at most, never to claim a
 *    camera is live.
 *  - **Web services only.** Shodan is full of `554/tcp` RTSP endpoints, which
 *    this pipeline cannot represent (it stores and probes HTTP(S) URLs). Those
 *    matches are skipped here; use `npm run sensor -- import` for an export
 *    that contains them, which does support RTSP rows.
 */

/** Ports Shodan commonly reports a camera's web UI on. */
export const SHODAN_WEB_PORTS = new Set([80, 443, 8000, 8001, 8080, 8081, 8082, 8443, 8888, 9000])

/** Ports that speak TLS by convention. */
const TLS_PORTS = new Set([443, 8443])

/**
 * A reasonable default: hosts where Shodan captured a screenshot and a web
 * server answered on a camera-typical port. Override with NUXT_SHODAN_QUERY —
 * for example `product:"Hikvision"`, `http.title:"DVR"` or
 * `http.favicon.hash:-1813555657`.
 */
export const SHODAN_DEFAULT_QUERY = 'has_screenshot:true port:80,443,8080,8000,8081,8443,8888'

export interface ShodanHttp {
  title?: string | null
  server?: string | null
  status?: number | null
  host?: string | null
}

export interface ShodanMatch {
  ip_str?: string
  port?: number
  hostnames?: string[]
  domains?: string[]
  product?: string | null
  org?: string | null
  isp?: string | null
  http?: ShodanHttp | null
  location?: {
    country_name?: string | null
    country_code?: string | null
    city?: string | null
    region_code?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
  cpe?: string[] | null
  _shodan?: { module?: string | null } | null
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, max) : null
}

/**
 * Map one Shodan match to a catalogue candidate, or explain why it cannot be
 * one. Pure, so every rule below is testable without a network.
 */
export function shodanMatchToRaw(match: ShodanMatch | null | undefined): RawCam | null {
  if (!match) return null

  const ip = typeof match.ip_str === 'string' ? match.ip_str.trim() : ''
  // IPv4 literal only: hostnames would be resolved later by the probe, and a
  // Shodan record must never become a way to point the server at a new name.
  if (isIP(ip) !== 4) return null

  const port = match.port
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null

  const http = match.http ?? null
  // Accept anything Shodan identified as HTTP; otherwise require a known web port.
  if (!http && !SHODAN_WEB_PORTS.has(port)) return null

  const scheme = TLS_PORTS.has(port) ? 'https' : 'http'
  const defaultPort = (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80)
  const url = `${scheme}://${ip}${defaultPort ? '' : `:${port}`}/`

  const title = clip(http?.title, 140)
  const product = clip(match.product, 60)
  const server = clip(http?.server, 60)
  const location = match.location ?? {}

  const tags = [
    'shodan',
    `port:${port}`,
    server ? `server:${server}` : null,
    match._shodan?.module ? `module:${match._shodan.module}` : null
  ].filter((tag): tag is string => Boolean(tag))

  return {
    source: 'shodan',
    externalId: `${ip}:${port}`,
    title: title || product || `Camera at ${ip}:${port}`,
    // The only URL we can honestly build is the service root. What lives there
    // is decided by our own probe, not by Shodan's cached verdict.
    pageUrl: url,
    kind: http ? 'page' : null,
    country: clip(location.country_name, 80),
    region: clip(location.region_code, 40),
    city: clip(location.city, 80),
    lat: typeof location.latitude === 'number' ? location.latitude : null,
    lon: typeof location.longitude === 'number' ? location.longitude : null,
    org: clip(match.org, 100) ?? clip(match.isp, 100),
    vendor: product ?? server,
    tags,
    attribution: 'Shodan API',
    license: 'Shodan API terms'
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface SearchPayload {
  matches?: ShodanMatch[]
  total?: number
  error?: string
}

export const shodanProvider: CameraProvider = {
  id: 'shodan',
  async discover(context): Promise<RawCam[]> {
    const key = shodanApiKey()
    if (!key) throw new ProviderError('Shodan API key is not configured', false)

    const query = shodanQuery() || SHODAN_DEFAULT_QUERY
    const pages = shodanPages()
    const endpoint = shodanEndpoint()
    const minIntervalMs = shodanMinIntervalMs()

    const raws: RawCam[] = []
    const seen = new Set<string>()
    let skipped = 0

    for (let page = 1; page <= pages; page++) {
      if (raws.length >= context.limit) break
      // Shodan throttles searches to roughly one per second; space the pages.
      if (page > 1 && minIntervalMs > 0) await sleep(minIntervalMs)

      const url = new URL('/shodan/host/search', endpoint)
      url.searchParams.set('key', key)
      url.searchParams.set('query', query)
      url.searchParams.set('page', String(page))

      const response = await context.fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'User-Agent': 'IPCrawlOpen/1.0' },
        signal: AbortSignal.timeout(context.timeoutMs)
      }).catch((error) => {
        // Never surface the request URL: it carries the API key.
        throw new ProviderError(`Shodan request failed: ${(error as Error).message}`)
      })

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError('Shodan rejected the API key', false)
      }
      if (response.status === 429) {
        throw new ProviderError('Shodan rate limit hit (about one search per second)', true)
      }
      if (!response.ok) {
        const detail = await readError(response)
        throw new ProviderError(`Shodan responded ${response.status}${detail ? `: ${detail}` : ''}`,
          response.status >= 500)
      }

      const payload = await response.json().catch(() => null) as SearchPayload | null
      // Shodan answers 200 with { error } for things like "no query credits".
      if (!payload || payload.error) {
        const detail = clip(payload?.error, 200) ?? 'unreadable response'
        throw new ProviderError(`Shodan: ${detail}`, false)
      }

      const batch = Array.isArray(payload.matches) ? payload.matches : []
      if (batch.length === 0) break

      for (const match of batch) {
        if (raws.length >= context.limit) break
        const raw = shodanMatchToRaw(match)
        if (!raw) {
          skipped += 1
          continue
        }
        if (seen.has(raw.externalId)) continue
        seen.add(raw.externalId)
        raws.push(raw)
      }

      const total = typeof payload.total === 'number' ? payload.total : null
      if (total !== null && page * 100 >= total) break
    }

    context.log(
      `Shodan: ${raws.length} candidates` +
      (skipped ? `, ${skipped} skipped (non-web or non-IPv4)` : '')
    )
    return raws
  }
}

async function readError(response: Response): Promise<string | null> {
  try {
    const payload = await response.json() as { error?: string }
    return clip(payload?.error, 200)
  } catch {
    return null
  }
}
