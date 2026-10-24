import type { CameraProvider } from './types'
import { curatedProvider } from './providers/curated'
import { osmProvider } from './providers/osm'
import { tflProvider } from './providers/tfl'
import { digitrafficProvider } from './providers/digitraffic'
import { windyProvider } from './providers/windy'
import { internetDbProvider } from './providers/internetdb'

const PROVIDERS: Record<string, CameraProvider> = {
  curated: curatedProvider,
  osm: osmProvider,
  tfl: tflProvider,
  digitraffic: digitrafficProvider,
  windy: windyProvider,
  internetdb: internetDbProvider
}

export function getProvider(id: string): CameraProvider | null {
  return PROVIDERS[id] ?? null
}

export function allProviders(): CameraProvider[] {
  return Object.values(PROVIDERS)
}

export const ENRICHMENT_PROVIDER_IDS = new Set(['internetdb'])
