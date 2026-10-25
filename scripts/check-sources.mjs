/**
 * Source reachability check.
 *
 * Answers one question in about five seconds: *will this deployment actually
 * pull real cameras, or will it fall back to the bundled seed data?*
 *
 * It performs the same discovery request each provider would make, directly —
 * no Nuxt, no database, nothing written. Safe to run anywhere.
 *
 *   node scripts/check-sources.mjs
 *   node scripts/check-sources.mjs --strict   # exit 1 if no live source works
 */
import { SOURCES } from '../shared/sources.ts'

const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS || 12_000)
const strict = process.argv.includes('--strict')

// Same override names the app itself honours, so this check can validate a
// mirror, a proxy, or the local fixture harness.
const OVERPASS_URL = process.env.NUXT_OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
const TFL_URL = process.env.NUXT_TFL_ENDPOINT || 'https://api.tfl.gov.uk/Place/Type/JamCam'
const DIGITRAFFIC_URL = process.env.NUXT_DIGITRAFFIC_ENDPOINT || 'https://tie.digitraffic.fi/api/weathercam/v1/stations'
const WINDY_URL = process.env.NUXT_WINDY_ENDPOINT || 'https://api.windy.com/webcams/api/v3/webcams'
const INTERNETDB_URL = process.env.NUXT_INTERNETDB_ENDPOINT || 'https://internetdb.shodan.io'
const SHODAN_URL = (process.env.NUXT_SHODAN_ENDPOINT || 'https://api.shodan.io').replace(/\/$/, '')
const SHODAN_KEY = (process.env.NUXT_SHODAN_API_KEY || '').trim()
const WINDY_KEY = (process.env.NUXT_WINDY_API_KEY || '').trim()

const OVERPASS_QUERY = `[out:json][timeout:25];
nwr["tourism"="webcam"];
out center tags 50;`

async function fetchWithTimeout(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'IPCrawlOpen/1.0 (+source-check)', ...(init.headers ?? {}) }
  })
  return response
}

/** Each check returns { status, count, unit, sample, note }. */
const checks = {
  async osm() {
    const response = await fetchWithTimeout(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const elements = Array.isArray(payload.elements) ? payload.elements : []
    const named = elements.find(element => element.tags?.name)
    return {
      count: elements.length,
      unit: 'webcam nodes',
      note: 'capped sample — the app asks for up to 1200',
      sample: named?.tags?.name ?? null
    }
  },

  async tfl() {
    const response = await fetchWithTimeout(`${TFL_URL}?serviceType=regular`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    if (!Array.isArray(payload)) throw new Error('unexpected payload shape')
    const withImage = payload.filter(place =>
      (place.additionalProperties ?? []).some(prop => prop.key?.toLowerCase() === 'imageurl' && prop.value)
    )
    return {
      count: withImage.length,
      unit: 'cameras',
      note: payload.length !== withImage.length ? `${payload.length} places, ${payload.length - withImage.length} without a frame URL` : null,
      sample: withImage[0]?.commonName ?? null
    }
  },

  async digitraffic() {
    const response = await fetchWithTimeout(DIGITRAFFIC_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const features = Array.isArray(payload.features) ? payload.features : []
    const presets = features.reduce((total, feature) =>
      total + (Array.isArray(feature.properties?.presets) ? feature.properties.presets.length : 0), 0)
    return {
      count: presets,
      unit: 'camera presets',
      note: `${features.length} stations`,
      sample: features[0]?.properties?.name ?? null
    }
  },

  async windy() {
    if (!WINDY_KEY) return { skip: 'no NUXT_WINDY_API_KEY set (optional)' }
    const response = await fetchWithTimeout(`${WINDY_URL}?limit=10`, {
      headers: { 'x-windy-api-key': WINDY_KEY }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const webcams = Array.isArray(payload.webcams) ? payload.webcams : []
    return { count: webcams.length, unit: 'webcams', sample: webcams[0]?.title ?? null }
  },

  /**
   * Uses /api-info, which reports the plan and remaining credits without
   * spending a query credit — a key check should never cost the operator money.
   */
  async shodan() {
    if (!SHODAN_KEY) return { skip: 'no NUXT_SHODAN_API_KEY set (optional, paid)' }
    const url = new URL('/api-info', SHODAN_URL)
    url.searchParams.set('key', SHODAN_KEY)
    const response = await fetchWithTimeout(url.toString())
    if (response.status === 401 || response.status === 403) throw new Error('rejected the API key')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.error) throw new Error(String(payload.error).slice(0, 40))
    const credits = Number(payload?.query_credits ?? 0)
    return {
      count: credits,
      unit: 'query credits',
      note: `${payload?.plan ?? 'unknown'} plan · optional paid source`,
      sample: null
    }
  },

  async internetdb() {
    const response = await fetchWithTimeout(`${INTERNETDB_URL}/8.8.8.8`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const ports = Array.isArray(payload.ports) ? payload.ports.length : 0
    return {
      count: ports,
      unit: 'reported ports',
      note: 'enrichment only — never discovers cameras',
      sample: null
    }
  }
}

const DISCOVERY = new Set(['osm', 'tfl', 'digitraffic', 'windy', 'shodan'])

// Local sources never make a request, so there is nothing to reach: they report
// what the operator has set up instead of pretending to be a network check.
const LOCAL_NOTES = {
  sensor: 'local — run `npm run sensor -- status`',
  import: 'local — run `npm run sensor -- import --file <dataset>`'
}

async function runCheck(id) {
  if (LOCAL_NOTES[id]) return { id, ok: true, skip: LOCAL_NOTES[id], ms: 0 }
  const started = Date.now()
  try {
    const result = await checks[id]()
    return { id, ok: true, ms: Date.now() - started, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const friendly = /abort|timeout/i.test(message)
      ? 'timed out'
      : /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(message)
        ? 'unreachable (DNS/network)'
        : message
    return { id, ok: false, ms: Date.now() - started, error: friendly }
  }
}

console.log('\nIPCrawl Open — source reachability\n')
console.log(`  Overpass: ${OVERPASS_URL}`)
console.log(`  Timeout:  ${TIMEOUT_MS} ms\n`)

const targets = SOURCES.filter(source => source.id !== 'curated')
const results = await Promise.all(targets.map(source => runCheck(source.id)))

const pad = (value, width) => String(value).padEnd(width)
let liveWorking = 0
let discoveryWorking = 0

for (const source of targets) {
  const result = results.find(entry => entry.id === source.id)
  const label = pad(source.id, 13)
  const key = source.keyless ? 'keyless' : 'key'

  if (!result.ok) {
    console.log(`  ${label} ✗  ${pad(result.error, 26)} ${key}`)
    continue
  }

  if (result.skip) {
    console.log(`  ${label} –  ${result.skip}`)
    continue
  }

  liveWorking += 1
  if (DISCOVERY.has(source.id)) discoveryWorking += 1

  const amount = `${result.count} ${result.unit}`
  const detail = [result.note, result.sample ? `“${String(result.sample).slice(0, 34)}”` : null]
    .filter(Boolean)
    .join(' · ')
  console.log(`  ${label} ✓  ${pad(amount, 20)} ${pad(`${result.ms} ms`, 9)} ${key}`)
  if (detail) console.log(`  ${' '.repeat(13)}   ${detail}`)
}

console.log(`\n  bundled seed:    85 landmark records (always available, always labelled SEED)`)

const noDiscovery = discoveryWorking === 0
console.log()
if (noDiscovery) {
  console.log('  No discovery source could be reached from this machine.')
  console.log('  The app still runs: it serves the bundled seed catalogue, renders generated')
  console.log('  previews labelled “FRAME NOT LIVE”, and never fabricates a listing.')
  console.log('  Ingested cameras appear once this host can reach the providers above')
  console.log('  (allowlist api.tfl.gov.uk, tie.digitraffic.fi, overpass-api.de).')
} else {
  console.log(`  ${discoveryWorking} of 4 discovery sources reachable — a sync would ingest real cameras now.`)
  console.log('  Trigger one with:  curl -X POST http://localhost:3000/api/sources/sync')
}

console.log()

if (strict && noDiscovery) {
  console.error('  --strict: no discovery source reachable.\n')
  process.exit(1)
}
