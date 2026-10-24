import type { CamKind } from '#shared/explore'
import { inferKind } from '../normalize'
import { ProviderError, type CameraProvider, type RawCam } from '../types'
import { overpassUrl } from '../../config'

const QUERY = `[out:json][timeout:40][maxsize:67108864];
(
  nwr["tourism"="webcam"];
  nwr["contact:webcam"];
  nwr["camera:type"="webcam"];
);
out center tags 1200;`

interface OverpassElement {
  type?: string
  id?: number
  lat?: number
  lon?: number
  center?: { lat?: number, lon?: number }
  tags?: Record<string, string>
}

const URL_KEYS = [
  'contact:webcam',
  'webcam',
  'camera:url',
  'url',
  'website',
  'contact:website',
  'stream',
  'video'
]

const INTERESTING_TAGS = [
  'tourism',
  'operator',
  'network',
  'brand',
  'manufacturer',
  'camera:type',
  'surveillance:type',
  'surveillance',
  'website',
  'contact:webcam'
]

function firstUrl(tags: Record<string, string>): string | null {
  for (const key of URL_KEYS) {
    const value = tags[key]?.split(';')[0]?.trim()
    if (value && /^https?:\/\//i.test(value)) return value
  }
  return null
}

function classify(url: string | null, tags: Record<string, string>): {
  imageUrl: string | null
  streamUrl: string | null
  pageUrl: string | null
  kind: CamKind
} {
  if (!url) return { imageUrl: null, streamUrl: null, pageUrl: null, kind: 'page' }

  const lower = url.toLowerCase()
  if (/\.m3u8(\?|$)/.test(lower)) {
    return { imageUrl: null, streamUrl: url, pageUrl: null, kind: 'hls' }
  }
  if (/\.mp4(\?|$)|\.webm(\?|$)/.test(lower)) {
    return { imageUrl: null, streamUrl: url, pageUrl: null, kind: 'video' }
  }
  const kind = inferKind(null, /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(lower) ? url : null, null, url)
  if (kind === 'snapshot' || kind === 'mjpeg') {
    return { imageUrl: url, streamUrl: null, pageUrl: null, kind }
  }
  if (tags['contact:webcam'] === url && /\.(html?|php)(\?|$)/i.test(lower)) {
    return { imageUrl: null, streamUrl: null, pageUrl: url, kind: 'page' }
  }
  if (/youtube\.com|youtu\.be|vimeo\.com|twitch\.tv/.test(lower)) {
    return { imageUrl: null, streamUrl: null, pageUrl: url, kind: 'iframe' }
  }
  return { imageUrl: null, streamUrl: null, pageUrl: url, kind: 'page' }
}

export const osmProvider: CameraProvider = {
  id: 'osm',
  async discover(context): Promise<RawCam[]> {
    const response = await context.fetch(overpassUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'IPCrawlOpen/1.0 (public camera catalogue)'
      },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: AbortSignal.timeout(context.timeoutMs)
    }).catch((error) => {
      throw new ProviderError(`Overpass request failed: ${(error as Error).message}`)
    })

    if (!response.ok) {
      throw new ProviderError(`Overpass responded ${response.status}${response.status === 429 ? ' (rate limited — try again later)' : ''}`)
    }

    const payload = await response.json() as { elements?: OverpassElement[], remark?: string }
    if (payload.remark && /error|timed out|out of memory/i.test(payload.remark)) {
      throw new ProviderError(`Overpass: ${payload.remark.slice(0, 200)}`)
    }
    if (!Array.isArray(payload.elements)) throw new ProviderError('Overpass returned an unexpected shape')

    const seen = new Set<string>()
    const cams: RawCam[] = []

    for (const element of payload.elements) {
      if (cams.length >= context.limit) break
      if (!element.id || !element.type) continue
      const key = `${element.type}/${element.id}`
      if (seen.has(key)) continue
      seen.add(key)

      const tags = element.tags ?? {}
      const lat = element.lat ?? element.center?.lat
      const lon = element.lon ?? element.center?.lon
      const url = firstUrl(tags)
      // Nodes without a camera URL aren't cameras — they're map annotations.
      // Keep the OSM object as attribution instead of inventing a page URL.
      if (!url) continue
      const classified = classify(url, tags)

      const region = tags['addr:state'] || tags['addr:province'] || tags['is_in:state'] || null
      const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:place'] || null
      const country = tags['addr:country'] || tags['is_in:country'] || null
      const operator = tags.operator || tags.network || tags.owner || null
      const title = tags.name
        || (operator ? `${operator} camera` : null)
        || (city ? `Webcam in ${city}` : `OpenStreetMap webcam ${element.id}`)

      const tagList = INTERESTING_TAGS
        .filter(tagKey => tags[tagKey] && tagKey !== 'contact:webcam')
        .map(tagKey => `${tagKey}: ${tags[tagKey]}`.slice(0, 60))

      cams.push({
        source: 'osm',
        externalId: key,
        title,
        imageUrl: classified.imageUrl,
        streamUrl: classified.streamUrl,
        pageUrl: classified.pageUrl,
        kind: classified.kind,
        country,
        region,
        city,
        lat: typeof lat === 'number' ? lat : null,
        lon: typeof lon === 'number' ? lon : null,
        org: operator,
        vendor: tags.brand || tags.manufacturer || tags['camera:make'] || null,
        tags: ['openstreetmap', ...tagList],
        attribution: `© OpenStreetMap contributors · ${element.type}/${element.id}`,
        license: 'ODbL 1.0'
      })
    }

    context.log(`OpenStreetMap: ${cams.length} webcam nodes`)
    return cams
  }
}
