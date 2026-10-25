/**
 * Provider catalogue, shared by the ingestion engine and the UI.
 *
 * The default providers are free and keyless — the app is fully functional
 * with no accounts and no paywalled intelligence feed. Windy is an optional
 * free-tier key; `shodan` is an optional paid API for people who already have
 * one; InternetDB is a keyless enrichment source, never the sole basis for a
 * listing.
 */

export interface SourceDefinition {
  id: string
  label: string
  short: string
  /**
   * `local` sources never run on a schedule and never touch the network on
   * their own: they exist only because an operator ran the local sensor or
   * imported a dataset on their own machine.
   */
  kind: 'discovery' | 'enrichment' | 'seed' | 'local'
  description: string
  homepage: string
  license: string
  licenseUrl: string
  keyless: boolean
  requiresEnv?: string
  /** UI accent, kept in one place so badges/map/stats agree. */
  accent: string
  coverage: string
}

export const SOURCES: SourceDefinition[] = [
  {
    id: 'curated',
    label: 'Open Camera Index',
    short: 'INDEX',
    kind: 'seed',
    description:
      'A hand-curated set of publicly documented cameras — municipal, tourism, port and weather-authority feeds — bundled with the app so the catalogue works offline and on first boot.',
    homepage: 'https://github.com/davhhyn/ipcrawleng/blob/main/data/curated-cams.json',
    license: 'Mixed — per-camera attribution in the dataset',
    licenseUrl: 'https://github.com/davhhyn/ipcrawleng/blob/main/data/curated-cams.json',
    keyless: true,
    accent: '#a78bfa',
    coverage: 'Global · 85 documented feeds'
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    short: 'OSM',
    kind: 'discovery',
    description:
      'Volunteered webcam locations and operator links, queried live through the Overpass API (tourism=webcam and contact:webcam tags). No key, no quota account.',
    homepage: 'https://www.openstreetmap.org/',
    license: 'ODbL 1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    keyless: true,
    accent: '#6ff2c0',
    coverage: 'Global · community mapped'
  },
  {
    id: 'tfl',
    label: 'TfL JamCams',
    short: 'TFL',
    kind: 'discovery',
    description:
      'Transport for London traffic cameras with live JPEG snapshots and coordinates, published as open data through the TfL Unified API.',
    homepage: 'https://api.tfl.gov.uk/',
    license: 'Open Government Licence v3',
    licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    keyless: true,
    accent: '#ff7d90',
    coverage: 'London, UK · ~900 cameras'
  },
  {
    id: 'digitraffic',
    label: 'Fintraffic',
    short: 'DIGI',
    kind: 'discovery',
    description:
      'Finland’s national road-weather camera network, served by the Fintraffic Digitraffic open-data API with station coordinates and public JPEG frames.',
    homepage: 'https://www.digitraffic.fi/en/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://www.digitraffic.fi/en/road-traffic/',
    keyless: true,
    accent: '#7aa7ff',
    coverage: 'Finland · ~500 stations'
  },
  {
    id: 'windy',
    label: 'Windy Webcams',
    short: 'WINDY',
    kind: 'discovery',
    description:
      'The Windy community webcam network. Optional: enabled only when a free Windy Webcams API key is configured. Never required for the app to run.',
    homepage: 'https://www.windy.com/webcams',
    license: 'Windy terms · free tier',
    licenseUrl: 'https://api.windy.com/terms',
    keyless: false,
    requiresEnv: 'NUXT_WINDY_API_KEY',
    accent: '#ffc061',
    coverage: 'Global · partner network'
  },
  {
    id: 'shodan',
    label: 'Shodan API',
    short: 'SHODAN',
    kind: 'discovery',
    description:
      'Optional paid integration. If you already have a Shodan API plan, this queries its host index for camera-shaped services, then re-probes every host locally so liveness remains something we measured. Disabled unless a key is configured.',
    homepage: 'https://developer.shodan.io/api',
    license: 'Shodan API terms — a paid subscription is required',
    licenseUrl: 'https://www.shodan.io/terms',
    keyless: false,
    requiresEnv: 'NUXT_SHODAN_API_KEY',
    accent: '#ff9ecb',
    coverage: 'Global · whatever your plan allows'
  },
  {
    id: 'internetdb',
    label: 'Shodan InternetDB',
    short: 'IDB',
    kind: 'enrichment',
    description:
      'Keyless host enrichment: open ports, hostnames and product tags for hosts already discovered by the free sources above. It enriches listings — it is never the only way a camera enters the catalogue.',
    homepage: 'https://internetdb.shodan.io/',
    license: 'Shodan InternetDB terms',
    licenseUrl: 'https://internetdb.shodan.io/',
    keyless: true,
    accent: '#ffc061',
    coverage: 'Global · enrichment only'
  },
  {
    id: 'sensor',
    label: 'Local sensor',
    short: 'LOCAL',
    kind: 'local',
    description:
      'Cameras found by the local sensor on networks you explicitly allowlisted. The scan runs from your machine, results stay in your own database, and nothing is sent anywhere.',
    homepage: 'https://github.com/davhhyn/ipcrawleng/blob/main/docs/LOCAL-SENSOR.md',
    license: 'Your own network inventory',
    licenseUrl: 'https://github.com/davhhyn/ipcrawleng/blob/main/docs/LOCAL-SENSOR.md',
    keyless: true,
    accent: '#6ff2c0',
    coverage: 'Your networks · opt-in'
  },
  {
    id: 'import',
    label: 'Imported dataset',
    short: 'IMPORT',
    kind: 'local',
    description:
      'Records indexed from a scan export you already hold (Shodan JSON, Censys results, Rapid7 Open Data, or an asset inventory). Parsed locally — no query ever leaves the machine.',
    homepage: 'https://github.com/davhhyn/ipcrawleng/blob/main/docs/LOCAL-SENSOR.md',
    license: 'Depends on the source dataset — keep its notice',
    licenseUrl: 'https://github.com/davhhyn/ipcrawleng/blob/main/docs/LOCAL-SENSOR.md',
    keyless: true,
    accent: '#cbbcff',
    coverage: 'Whatever you import'
  }
]

export const SOURCE_BY_ID: Record<string, SourceDefinition> = Object.fromEntries(
  SOURCES.map(source => [source.id, source])
)

export function sourceLabel(id: string): string {
  return SOURCE_BY_ID[id]?.label ?? id
}

export function sourceShort(id: string): string {
  return SOURCE_BY_ID[id]?.short ?? id.toUpperCase().slice(0, 5)
}

export function sourceAccent(id: string): string {
  return SOURCE_BY_ID[id]?.accent ?? '#7aa7ff'
}

export const KEYLESS_SOURCES = SOURCES.filter(source => source.keyless && source.kind !== 'enrichment')

/** Local sources are operator-driven; the scheduler must never try them. */
export const LOCAL_SOURCE_IDS = new Set(
  SOURCES.filter(source => source.kind === 'local').map(source => source.id)
)

export function isLocalSource(id: string): boolean {
  return LOCAL_SOURCE_IDS.has(id)
}

/** Rows from these sources may legitimately live on private addresses. */
export function allowsPrivateHosts(id: string): boolean {
  return id === 'sensor'
}
