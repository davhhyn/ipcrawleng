import { ProviderError, type CameraProvider, type RawCam } from '../types'
import { secureImageUrl, stableExternalId } from '../normalize'

function endpoint(): string {
  const config = useRuntimeConfig()
  return String(config.tflEndpoint || 'https://api.tfl.gov.uk/Place/Type/JamCam')
}

interface TflPlace {
  id?: string
  commonName?: string
  lat?: number | string
  lon?: number | string
  additionalProperties?: { key?: string, value?: string }[]
}

function propertyMap(place: TflPlace): Record<string, string> {
  const out: Record<string, string> = {}
  for (const property of place.additionalProperties ?? []) {
    if (property?.key && property.value) out[property.key.toLowerCase()] = property.value
  }
  return out
}

export const tflProvider: CameraProvider = {
  id: 'tfl',
  async discover(context): Promise<RawCam[]> {
    const response = await context.fetch(`${endpoint()}?serviceType=regular`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IPCrawlOpen/1.0'
      },
      signal: AbortSignal.timeout(context.timeoutMs)
    }).catch((error) => {
      throw new ProviderError(`TfL request failed: ${(error as Error).message}`)
    })

    if (!response.ok) throw new ProviderError(`TfL API responded ${response.status}`)

    const payload = await response.json() as TflPlace[]
    if (!Array.isArray(payload)) throw new ProviderError('TfL API returned an unexpected shape')

    const cams: RawCam[] = []
    for (const place of payload) {
      if (cams.length >= context.limit) break
      const properties = propertyMap(place)
      const imageUrl = secureImageUrl(properties.imageurl)
      if (!imageUrl) continue

      const lat = typeof place.lat === 'number' ? place.lat : Number.parseFloat(String(place.lat ?? ''))
      const lon = typeof place.lon === 'number' ? place.lon : Number.parseFloat(String(place.lon ?? ''))
      const title = (place.commonName || '').trim() || 'London traffic camera'
      const id = place.id || properties.cameraid || stableExternalId('tfl', title, lat, lon)

      cams.push({
        source: 'tfl',
        externalId: id,
        title,
        imageUrl,
        pageUrl: 'https://tfl.gov.uk/traffic/status/',
        kind: 'snapshot',
        country: 'United Kingdom',
        region: 'England',
        city: 'London',
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        org: 'Transport for London',
        vendor: null,
        tags: ['traffic', 'jamcam', properties.view ? `view: ${properties.view}` : 'london'].filter(Boolean),
        attribution: 'Transport for London · JamCams',
        license: 'Open Government Licence v3'
      })
    }

    context.log(`TfL: ${cams.length} cameras`)
    return cams
  }
}
