import { createHash } from 'node:crypto'
import type { CamKind } from '#shared/explore'
import { CAM_KINDS } from '#shared/explore'
import { countryCodeOf, countryNameOf } from '#shared/countries'
import { isValidLatLon } from '#shared/geo'
import type { SourceDefinition } from '#shared/sources'
import type { CamUpsert } from '../camStore'
import { camId } from '../camStore'
import { isBlockedSource, isDisallowedHost } from '../blocklist'
import { upgradeInsecureImages } from '../config'
import type { RawCam } from './types'

export interface NormalizedCam extends CamUpsert {
  dedupeKey: string
}

const KIND_SET = new Set<string>(CAM_KINDS)

const VENDOR_PATTERNS: [RegExp, string][] = [
  [/hikvision/i, 'Hikvision'],
  [/dahua/i, 'Dahua'],
  [/amcrest/i, 'Amcrest'],
  [/\baxis\b/i, 'Axis'],
  [/vivotek/i, 'Vivotek'],
  [/mobotix/i, 'Mobotix'],
  [/foscam/i, 'Foscam'],
  [/d-?link/i, 'D-Link'],
  [/tp-?link|tapo/i, 'TP-Link'],
  [/reolink/i, 'Reolink'],
  [/ubiquiti|unifi/i, 'Ubiquiti'],
  [/panasonic/i, 'Panasonic'],
  [/\bbosch\b/i, 'Bosch'],
  [/hanwha|wisenet|samsung techwin/i, 'Hanwha'],
  [/avtech/i, 'AVTECH'],
  [/geovision/i, 'GeoVision'],
  [/honeywell/i, 'Honeywell'],
  [/lorex/i, 'Lorex'],
  [/uniview/i, 'Uniview'],
  [/yoosee/i, 'Yoosee'],
  [/wyze/i, 'Wyze'],
  [/\bsony\b/i, 'Sony'],
  [/xiaomi|mi home/i, 'Xiaomi'],
  [/ezviz/i, 'EZVIZ'],
  [/annke/i, 'Annke'],
  [/swann/i, 'Swann']
]

export function normalizeVendor(...values: (string | null | undefined)[]): string | null {
  const joined = values.filter(Boolean).join(' ')
  if (!joined.trim()) return null
  for (const [pattern, brand] of VENDOR_PATTERNS) {
    if (pattern.test(joined)) return brand
  }
  const first = values.find(value => value && value.trim())
  return first ? first.trim().slice(0, 60) : null
}

function cleanTitle(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 140)
}

function sanitizeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const candidate = value.trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (!url.hostname) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Some providers (TfL, Windy) publish frames exclusively over HTTPS and their
 * plain-HTTP hostnames either redirect or hang. Upgrade those URLs, unless an
 * operator has pointed the provider at an HTTP mirror.
 */
export function secureImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (!upgradeInsecureImages()) return value
  return value.replace(/^http:\/\//i, 'https://')
}

export function inferKind(
  declared: CamKind | null | undefined,
  imageUrl: string | null,
  streamUrl: string | null,
  pageUrl: string | null
): CamKind {
  if (declared && KIND_SET.has(declared) && declared !== 'unknown') return declared

  const primary = (imageUrl || streamUrl || pageUrl || '').toLowerCase()
  if (!primary) return 'page'
  if (/\.m3u8(\?|$)/.test(primary) || /format=m3u8|hls/.test(primary)) return 'hls'
  if (/\.mp4(\?|$)|\.webm(\?|$)/.test(primary)) return 'video'
  if (/\.mjpe?g(\?|$)|mjpg|action=stream|video\.cgi|stream\.cgi|\/video(\?|$)/.test(primary)) return 'mjpeg'
  if (/\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/.test(primary)) return 'snapshot'
  if (/axis-cgi\/jpg|snapshot\.cgi|\/snapshot|\/current|image\.cgi/.test(primary)) return 'snapshot'
  if (/embed|iframe|player/.test(primary)) return 'iframe'
  return imageUrl ? 'snapshot' : 'page'
}

function protocolForKind(kind: CamKind): string {
  switch (kind) {
    case 'snapshot': return 'HTTP snapshot'
    case 'mjpeg': return 'MJPEG over HTTP'
    case 'hls': return 'HLS'
    case 'video': return 'HTTP video'
    case 'iframe': return 'Embedded player'
    case 'page': return 'Documented page'
    default: return 'Unknown'
  }
}

function canonicalForDedupe(...urls: (string | null)[]): string {
  for (const value of urls) {
    if (!value) continue
    try {
      const url = new URL(value)
      const params = new URLSearchParams()
      for (const [key, param] of url.searchParams.entries()) {
        if (/^(utm_|fbclid|gclid|ref|source)/i.test(key)) continue
        params.append(key, param)
      }
      const query = params.toString()
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}${query ? `?${query}` : ''}`
    } catch {
      // Ignore malformed candidate and try the next.
    }
  }
  return ''
}

export function stableExternalId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  return createHash('sha1')
    .update(`${prefix}:${parts.map(part => String(part ?? '')).join('|')}`)
    .digest('hex')
    .slice(0, 24)
}

export interface NormalizeResult {
  cam: NormalizedCam | null
  skipped: string | null
}

/**
 * Turn a provider-specific record into the catalogue's canonical shape.
 * Everything that can be shared across providers (kind inference, vendor
 * normalization, URL validation, country resolution) happens here exactly once.
 */
export function normalizeCam(raw: RawCam, source: SourceDefinition): NormalizeResult {
  if (isBlockedSource(source.id)) return { cam: null, skipped: 'source-blocked' }
  if (!raw.externalId) return { cam: null, skipped: 'missing-external-id' }

  const imageUrl = sanitizeUrl(raw.imageUrl)
  const streamUrl = sanitizeUrl(raw.streamUrl)
  const pageUrl = sanitizeUrl(raw.pageUrl || raw.url)
  const primaryUrl = imageUrl || streamUrl || pageUrl

  if (!primaryUrl && !raw.isDemo) {
    return { cam: null, skipped: 'missing-url' }
  }

  let host = ''
  let port: number | null = null
  let scheme: string | null = null
  if (primaryUrl) {
    try {
      const parsed = new URL(primaryUrl)
      host = parsed.hostname
      scheme = parsed.protocol.replace(':', '')
      port = parsed.port
        ? Number.parseInt(parsed.port, 10)
        : (scheme === 'https' ? 443 : 80)
      if (isDisallowedHost(host)) {
        return { cam: null, skipped: 'private-or-blocked-host' }
      }
    } catch {
      return { cam: null, skipped: 'invalid-url' }
    }
  }

  const kind = inferKind(raw.kind, imageUrl, streamUrl, pageUrl)
  const countryCode = countryCodeOf(raw.country)
  const country = countryNameOf(raw.country)
  const lat = typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : null
  const lon = typeof raw.lon === 'number' && Number.isFinite(raw.lon) ? raw.lon : null
  const coordsValid = isValidLatLon(lat, lon)

  const tags = [...new Set(
    (raw.tags ?? [])
      .map(tag => tag.trim().replace(/\s+/g, ' ').slice(0, 48))
      .filter(Boolean)
  )].slice(0, 12)

  const externalId = String(raw.externalId)
  const id = camId(source.id, externalId)
  const title = cleanTitle(
    raw.title,
    [raw.city, raw.country].filter(Boolean).join(', ') || `Camera ${externalId.slice(0, 8)}`
  )

  const dedupeKey = canonicalForDedupe(imageUrl, streamUrl, pageUrl)
    || createHash('sha1').update(`${title}|${country}|${lat}|${lon}`).digest('hex').slice(0, 24)

  return {
    cam: {
      id,
      source: source.id,
      sourceName: source.label,
      externalId,
      title,
      host,
      port,
      scheme,
      kind,
      protocol: protocolForKind(kind),
      country,
      countryCode,
      region: raw.region?.trim().slice(0, 80) || null,
      city: raw.city?.trim().slice(0, 80) || null,
      lat: coordsValid ? lat : null,
      lon: coordsValid ? lon : null,
      org: raw.org?.trim().slice(0, 100) || null,
      vendor: normalizeVendor(raw.vendor, ...tags.filter(tag => /^(brand|manufacturer|vendor)[=:]/i.test(tag))),
      tags,
      imageUrl,
      streamUrl,
      pageUrl: pageUrl && pageUrl !== imageUrl && pageUrl !== streamUrl ? pageUrl : null,
      attribution: raw.attribution?.slice(0, 160) || null,
      license: raw.license?.slice(0, 120) || source.license,
      isDemo: Boolean(raw.isDemo),
      dedupeKey
    },
    skipped: null
  }
}

const SOURCE_PRIORITY: Record<string, number> = {
  curated: 0,
  tfl: 1,
  digitraffic: 2,
  windy: 3,
  osm: 4,
  shodan: 5
}

/**
 * Dedupe the merged provider output. When two providers surface the same
 * underlying stream/page, the more authoritative/live source wins (TfL over a
 * stale OSM node, curated over everything).
 */
export function dedupeCams(cams: NormalizedCam[]): { cams: NormalizedCam[], dropped: number } {
  const keep = new Map<string, NormalizedCam>()
  for (const cam of cams) {
    const existing = keep.get(cam.dedupeKey)
    if (!existing) {
      keep.set(cam.dedupeKey, cam)
      continue
    }
    const existingPriority = SOURCE_PRIORITY[existing.source] ?? 9
    const candidatePriority = SOURCE_PRIORITY[cam.source] ?? 9
    if (candidatePriority < existingPriority) keep.set(cam.dedupeKey, cam)
  }
  return { cams: [...keep.values()], dropped: cams.length - keep.size }
}
