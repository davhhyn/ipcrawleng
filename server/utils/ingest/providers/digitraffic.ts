import { ProviderError, type CameraProvider, type RawCam } from '../types'
import { stableExternalId } from '../normalize'

function endpoint(): string {
  const config = useRuntimeConfig()
  return String(config.digitrafficEndpoint || 'https://tie.digitraffic.fi/api/weathercam/v1/stations')
}

interface DigitrafficPreset {
  id?: string
  presetName?: string
  presentationName?: string
}

interface DigitrafficFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    id?: string
    name?: string
    municipality?: string
    province?: string
    presets?: DigitrafficPreset[]
    roadAddress?: { roadName?: string, roadNumber?: number }
  }
}

export const digitrafficProvider: CameraProvider = {
  id: 'digitraffic',
  async discover(context): Promise<RawCam[]> {
    const response = await context.fetch(endpoint(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IPCrawlOpen/1.0'
      },
      signal: AbortSignal.timeout(context.timeoutMs)
    }).catch((error) => {
      throw new ProviderError(`Fintraffic request failed: ${(error as Error).message}`)
    })

    if (!response.ok) throw new ProviderError(`Fintraffic API responded ${response.status}`)

    const payload = await response.json() as { features?: DigitrafficFeature[] }
    if (!Array.isArray(payload.features)) {
      throw new ProviderError('Fintraffic API returned an unexpected shape')
    }

    const cams: RawCam[] = []
    for (const feature of payload.features) {
      if (cams.length >= context.limit) break
      const properties = feature.properties ?? {}
      const coordinates = feature.geometry?.coordinates
      if (!coordinates || coordinates.length !== 2) continue
      const [lon, lat] = coordinates
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

      const presets = Array.isArray(properties.presets) && properties.presets.length
        ? properties.presets
        : [{ id: properties.id }]

      for (const preset of presets) {
        if (cams.length >= context.limit) break
        const presetId = preset?.id
        if (!presetId) continue
        const imageBase = String(useRuntimeConfig().digitrafficImageBase || 'https://weathercam.digitraffic.fi')
        const imageUrl = `${imageBase}/${encodeURIComponent(presetId)}.jpg`
        const label = preset.presentationName || preset.presetName
        const title = [properties.name || presetId, label].filter(Boolean).join(' — ')
        const tags = ['road weather', 'traffic']
        if (properties.roadAddress?.roadName) tags.push(properties.roadAddress.roadName)
        if (properties.roadAddress?.roadNumber) tags.push(`road ${properties.roadAddress.roadNumber}`)

        cams.push({
          source: 'digitraffic',
          externalId: presetId || stableExternalId('digi', properties.id, lat, lon),
          title,
          imageUrl,
          pageUrl: 'https://www.digitraffic.fi/en/road-traffic/',
          kind: 'snapshot',
          country: 'Finland',
          region: properties.province || null,
          city: properties.municipality || null,
          lat,
          lon,
          org: 'Fintraffic',
          vendor: null,
          tags,
          attribution: 'Fintraffic Digitraffic · road weather cameras',
          license: 'CC BY 4.0'
        })
      }
    }

    context.log(`Fintraffic: ${cams.length} presets`)
    return cams
  }
}
