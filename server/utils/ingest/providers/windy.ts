import { ProviderError, type CameraProvider, type RawCam } from '../types'
import { windyApiKey } from '../../config'

function endpoint(): string {
  const config = useRuntimeConfig()
  return String(config.windyEndpoint || 'https://api.windy.com/webcams/api/v3/webcams')
}

interface WindyWebcam {
  webcamId?: number | string
  title?: string
  status?: string
  location?: {
    city?: string
    region?: string
    country?: string
    country_code?: string
    latitude?: number
    longitude?: number
  }
  images?: {
    current?: { preview?: string, thumbnail?: string }
    daylight?: { preview?: string, thumbnail?: string }
  }
  urls?: {
    detail?: string
    provider?: string
  }
}

export const windyProvider: CameraProvider = {
  id: 'windy',
  async discover(context): Promise<RawCam[]> {
    const apiKey = windyApiKey()
    if (!apiKey) throw new ProviderError('Windy API key is not configured', false)

    const cams: RawCam[] = []
    let offset = 0
    const pageSize = 50

    while (cams.length < context.limit && offset < 400) {
      const url = new URL(endpoint())
      url.searchParams.set('limit', String(Math.min(pageSize, context.limit - cams.length)))
      url.searchParams.set('offset', String(offset))
      url.searchParams.set('include', 'location,images,urls')
      url.searchParams.set('lang', 'en')

      const response = await context.fetch(url.toString(), {
        headers: {
          'x-windy-api-key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'IPCrawlOpen/1.0'
        },
        signal: AbortSignal.timeout(context.timeoutMs)
      }).catch((error) => {
        throw new ProviderError(`Windy request failed: ${(error as Error).message}`)
      })

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError('Windy rejected the API key', false)
      }
      if (!response.ok) throw new ProviderError(`Windy responded ${response.status}`)

      const payload = await response.json() as { webcams?: WindyWebcam[], total?: number }
      const batch = payload.webcams ?? []
      if (batch.length === 0) break

      for (const webcam of batch) {
        if (cams.length >= context.limit) break
        const id = webcam.webcamId
        if (!id) continue
        const location = webcam.location ?? {}
        const imageUrl = webcam.images?.current?.preview
          || webcam.images?.current?.thumbnail
          || webcam.images?.daylight?.preview
          || null

        cams.push({
          source: 'windy',
          externalId: String(id),
          title: webcam.title || `Windy webcam ${id}`,
          imageUrl: secureImageUrl(imageUrl),
          pageUrl: webcam.urls?.detail || 'https://www.windy.com/webcams',
          kind: 'snapshot',
          country: location.country || location.country_code || null,
          region: location.region || null,
          city: location.city || null,
          lat: typeof location.latitude === 'number' ? location.latitude : null,
          lon: typeof location.longitude === 'number' ? location.longitude : null,
          org: 'Windy community',
          vendor: null,
          tags: ['windy', webcam.status ? `status: ${webcam.status}` : 'webcam'].filter(Boolean),
          attribution: 'Windy.com community webcams',
          license: 'Windy API terms'
        })
      }

      offset += batch.length
      if (payload.total && offset >= payload.total) break
    }

    context.log(`Windy: ${cams.length} webcams`)
    return cams
  }
}
