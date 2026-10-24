import type { RawCam, CameraProvider } from '../types'
import curatedData from '../../../../data/curated-cams.json'

interface CuratedEntry {
  id: string
  title: string
  city?: string
  region?: string
  country?: string
  lat: number
  lon: number
  kind?: string
  operator?: string
  tags?: string[]
  attribution?: string
  license?: string
}

/**
 * The bundled, CC0 seed catalogue. These are illustrative landmark entries
 * covering every continent; they are always labelled as seed data in the UI
 * and are never presented as verified live feeds. Real coverage comes from the
 * keyless discovery providers.
 */
export const curatedProvider: CameraProvider = {
  id: 'curated',
  async discover(context): Promise<RawCam[]> {
    const entries = curatedData as CuratedEntry[]
    const cams: RawCam[] = entries.slice(0, context.limit).map(entry => ({
      source: 'curated',
      externalId: entry.id,
      title: entry.title,
      pageUrl: null,
      kind: 'page',
      country: entry.country || null,
      region: entry.region || null,
      city: entry.city || null,
      lat: entry.lat,
      lon: entry.lon,
      org: entry.operator || 'Landmark seed',
      vendor: null,
      tags: entry.tags ?? [],
      attribution: entry.attribution || 'Bundled seed · illustrative landmark location',
      license: entry.license || 'CC0',
      isDemo: true
    }))
    context.log(`Seed catalogue: ${cams.length} entries`)
    return cams
  }
}
