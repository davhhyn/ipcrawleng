/**
 * End-to-end ingestion harness.
 *
 * Boots a fixture server that mimics the three keyless providers (TfL,
 * Fintraffic, Overpass), points the real Nuxt/Nitro ingestion pipeline at it,
 * then asserts what actually landed in SQLite.
 *
 * Run with: npm run test:ingest
 */
import { spawn } from 'node:child_process'
import { createServer as createProbeServer } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)

/** Grab an ephemeral free port so parallel harness runs never collide. */
async function freePort() {
  return new Promise((done, fail) => {
    const probe = createProbeServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

const PORT = Number(process.env.FIXTURE_PORT || await freePort())
const APP_PORT = Number(process.env.APP_PORT || await freePort())

// Smallest valid JPEG (1x1, grey).
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAHwAAAQUBAQEB'
  + 'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh'
  + 'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ'
  + 'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG'
  + 'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=',
  'base64'
)

const tflFixture = [
  {
    id: 'JamCams_FixtureLive',
    commonName: 'Fixture Junction (A1)',
    lat: 51.5074,
    lon: -0.1278,
    additionalProperties: [
      { key: 'imageUrl', value: `http://127.0.0.1:${PORT}/img/live.jpg` },
      { key: 'view', value: 'Northbound' }
    ]
  },
  {
    id: 'JamCams_FixtureDead',
    commonName: 'Fixture Camera Offline (A2)',
    lat: 51.51,
    lon: -0.14,
    additionalProperties: [{ key: 'imageUrl', value: `http://127.0.0.1:${PORT}/img/missing.jpg` }]
  }
]

const digitrafficFixture = {
  features: [
    {
      geometry: { coordinates: [24.9384, 60.1699] },
      properties: {
        id: 'C01500',
        name: 'Helsinki Fixture Station',
        municipality: 'Helsinki',
        province: 'Uusimaa',
        presets: [{ id: 'C01500preset1', presentationName: 'Northbound' }],
        roadAddress: { roadName: 'Fixture Road', roadNumber: 7 }
      }
    }
  ]
}

const osmFixture = {
  elements: [
    {
      type: 'node',
      id: 1001,
      lat: 45.4642,
      lon: 9.19,
      tags: {
        tourism: 'webcam',
        name: 'Piazza Duomo Live',
        'addr:city': 'Milan',
        'addr:country': 'IT',
        operator: 'City of Milan',
        'contact:webcam': `http://127.0.0.1:${PORT}/img/milan.jpg`
      }
    },
    {
      type: 'node',
      id: 1002,
      lat: 52.52,
      lon: 13.405,
      tags: {
        tourism: 'webcam',
        name: 'Private Router Camera',
        'contact:webcam': 'http://192.168.1.10/snapshot.jpg'
      }
    },
    {
      type: 'node',
      id: 1003,
      lat: 40.4,
      lon: -3.7,
      tags: {
        tourism: 'webcam',
        name: 'Madrid Fixture Stream',
        'contact:webcam': `http://127.0.0.1:${PORT}/stream/live.m3u8`
      }
    },
    {
      type: 'node',
      id: 1004,
      lat: 48.85,
      lon: 2.35,
      tags: { tourism: 'webcam', name: 'No URL Camera' }
    }
  ]
}

const fixture = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`)

  if (url.pathname === '/tfl') {
    // A short delay makes overlapping sync attempts overlap in practice, which
    // is what the single-flight assertion needs.
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(tflFixture))
    }, 250)
    return
  }

  if (url.pathname === '/digitraffic') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(digitrafficFixture))
    return
  }

  if (url.pathname === '/digitraffic-img/preset.jpg' || url.pathname === '/digitraffic-img/C01500preset1.jpg') {
    response.writeHead(200, { 'content-type': 'image/jpeg' })
    response.end(JPEG)
    return
  }

  if (url.pathname === '/overpass' && request.method === 'POST') {
    request.resume()
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(osmFixture))
    })
    return
  }

  if (url.pathname === '/img/live.jpg' || url.pathname === '/img/milan.jpg') {
    response.writeHead(200, { 'content-type': 'image/jpeg' })
    response.end(JPEG)
    return
  }

  if (url.pathname === '/stream/live.m3u8') {
    response.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' })
    response.end('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nsegment1.ts\n#EXT-X-ENDLIST\n')
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain' })
  response.end('not found')
})

await new Promise((done) => fixture.listen(PORT, '127.0.0.1', done))
console.log(`[fixtures] listening on :${PORT}`)

const dataDir = mkdtempSync(join(tmpdir(), 'ipcrawl-ingest-'))

const child = spawn('npx', ['nuxt', 'dev', `--port`, String(APP_PORT), '--host', '127.0.0.1'], {
  cwd: root,
  env: {
    ...process.env,
    NUXT_DATA_DIR: dataDir,
    NUXT_DB_PATH: join(dataDir, 'test.sqlite'),
    NUXT_SEED_DEMO: 'false',
    // The fixture providers live on loopback; production keeps the guard on.
    NUXT_ALLOW_PRIVATE_HOSTS: 'true',
    NUXT_SYNC_SOURCES: 'tfl,digitraffic,osm',
    NUXT_OVERPASS_URL: `http://127.0.0.1:${PORT}/overpass`,
    NUXT_TFL_ENDPOINT: `http://127.0.0.1:${PORT}/tfl`,
    NUXT_DIGITRAFFIC_ENDPOINT: `http://127.0.0.1:${PORT}/digitraffic`,
    NUXT_DIGITRAFFIC_IMAGE_BASE: `http://127.0.0.1:${PORT}/digitraffic-img`,
    NUXT_ENABLE_LIVE_PROBE: 'true',
    NUXT_LIVE_PROBE_TIMEOUT_MS: '2500',
    NUXT_LIVE_PROBE_BUDGET_MS: '12000',
    NUXT_MAX_INGEST_PER_SOURCE: '50',
    NUXT_UPGRADE_INSECURE_IMAGES: 'false',
    // A dev server may already be running from the same checkout; the lock is
    // keyed by directory, not port, so bypass it for this isolated harness.
    NUXT_IGNORE_LOCK: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  // Own process group so the whole Nuxt/Nitro tree can be reaped reliably.
  detached: true
})

const logs = []
child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
child.stderr.on('data', (chunk) => logs.push(chunk.toString()))

const base = `http://127.0.0.1:${APP_PORT}`

async function waitForServer(timeoutMs = 150_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return true
    } catch {
      // Server not listening yet.
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
  return false
}

function stopApp() {
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch { /* already gone */ }
  }
}

function fail(reason) {
  console.error(`\n[test] FAILED — ${reason}`)
  console.error(logs.join('').slice(-6000))
  stopApp()
  fixture.close()
  rmSync(dataDir, { recursive: true, force: true })
  process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopApp()
    fixture.close()
    process.exit(130)
  })
}

if (!await waitForServer()) fail('the Nuxt dev server never became reachable')
const health = await (await fetch(`${base}/api/health`)).json()
console.log('[fixtures] app is up — flags:', JSON.stringify(health.sources), 'allowPrivateHosts=', health.allowPrivateHosts)
if (health.allowPrivateHosts !== true) fail('NUXT_ALLOW_PRIVATE_HOSTS did not reach the app')
console.log('[fixtures] running sync')

// Sync is single-flight: two concurrent triggers must not both run a crawl.
const triggers = await Promise.all([
  fetch(`${base}/api/sources/sync`, { method: 'POST' }),
  fetch(`${base}/api/sources/sync`, { method: 'POST' })
])
const triggerCodes = triggers.map(response => response.status).sort()
console.log(`[test] concurrent sync: ${triggerCodes.join(' + ')}`)
if (triggerCodes[0] !== 200 || triggerCodes[1] !== 409) {
  fail(`concurrent syncs returned ${triggerCodes.join(' + ')}, expected 200 + 409`)
}
const syncResponse = triggers.find(response => response.status === 200)
const syncBody = await syncResponse.json()
console.log(`[test] sync status: ${syncBody.summary?.status} (${syncBody.summary?.seen} seen, ${syncBody.summary?.added} added)`)

for (const source of syncBody.summary?.sources ?? []) {
  console.log(`         · ${source.id}: ok=${source.ok} fetched=${source.fetched} new=${source.inserted} ${source.error ?? ''}`)
}

const list = await (await fetch(`${base}/api/explore/cams?pageSize=50`)).json()
console.log(`[test] catalogue size: ${list.total}`)
for (const cam of list.items) {
  console.log(`         · [${cam.source}] ${cam.title} — ${cam.location ?? '—'} (${cam.kind}/${cam.status})`)
}

const bySource = (id) => list.items.filter((cam) => cam.source === id)
const failures = []

if (bySource('tfl').length !== 2) failures.push(`expected 2 TfL cameras, got ${bySource('tfl').length}`)
if (bySource('digitraffic').length !== 1) failures.push(`expected 1 Fintraffic camera, got ${bySource('digitraffic').length}`)
if (bySource('osm').length !== 2) failures.push(`expected 2 OSM cameras (2 rejected), got ${bySource('osm').length}`)
if (list.items.some((cam) => /Private Router/.test(cam.title))) failures.push('private/loopback host leaked into the catalogue')
if (list.items.some((cam) => /No URL/.test(cam.title))) failures.push('record without a URL was ingested')
if (!list.items.some((cam) => cam.kind === 'hls')) failures.push('HLS detection failed')
if (!list.items.some((cam) => cam.countryCode === 'FI')) failures.push('Finland country resolution failed')
if (!list.items.some((cam) => cam.countryCode === 'IT')) failures.push('Italy country resolution failed')

const liveCam = list.items.find((cam) => cam.source === 'tfl' && /Fixture Junction/.test(cam.title))
if (!liveCam) {
  failures.push('live TfL fixture missing from list')
} else if (liveCam.status !== 'live') {
  failures.push(`expected live TfL camera to be probed live, got "${liveCam.status}"`)
}

const deadCam = list.items.find((cam) => /Fixture Camera Offline/.test(cam.title))
if (deadCam && deadCam.status === 'live') failures.push('404 camera was incorrectly marked live')

if (liveCam) {
  const detail = await (await fetch(`${base}/api/explore/cams/${liveCam.id}`)).json()
  if (!detail.tags?.includes('traffic')) failures.push('TfL tags were not preserved')
  if (detail.probe.httpStatus !== 200) failures.push(`expected probe httpStatus 200, got ${detail.probe.httpStatus}`)

  const frame = await fetch(`${base}/api/explore/thumb/${liveCam.id}`)
  const contentType = frame.headers.get('content-type') ?? ''
  const frameSource = frame.headers.get('x-frame-source')
  console.log(`[test] live thumb: ${contentType} via ${frameSource}`)
  if (!contentType.startsWith('image/jpeg')) failures.push(`expected a proxied JPEG, got ${contentType}`)
  if (frameSource !== 'upstream') failures.push(`expected upstream frame, got ${frameSource}`)
  const bytes = new Uint8Array(await frame.arrayBuffer())
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) failures.push('proxied frame is not a JPEG')

  const params = new URLSearchParams({ country: 'Finland' })
  const filtered = await (await fetch(`${base}/api/explore/cams?${params}`)).json()
  if (filtered.total !== 1) failures.push(`country filter returned ${filtered.total} rows, expected 1`)

  const facets = await (await fetch(`${base}/api/explore/facets`)).json()
  if (!facets.sources.some((source) => source.value === 'tfl' && source.count === 2)) {
    failures.push('facet counts do not reflect the ingested catalogue')
  }
}

const stats = await (await fetch(`${base}/api/stats`)).json()
if (stats.counts.total !== 5) failures.push(`stats total ${stats.counts.total}, expected 5`)
if (stats.counts.live < 1) failures.push('stats report no live cameras')
if (!stats.bySource.some((row) => row.value === 'digitraffic')) failures.push('stats missing Fintraffic source')

const map = await (await fetch(`${base}/api/map/points`)).json()
if (map.points.length !== 5) failures.push(`map plotted ${map.points.length} points, expected 5`)

const random = await (await fetch(`${base}/api/fun/cam`)).json()
if (!random.channel?.id) failures.push('fun mode returned no channel')

// ── Human-facing pages ──────────────────────────────────────────────────
const html = { headers: { accept: 'text/html,application/xhtml+xml' } }

if (liveCam) {
  const page = await fetch(`${base}/cam/${liveCam.id}`, html)
  const body = await page.text()
  console.log(`[test] /cam/${liveCam.id}: ${page.status} (${body.length} bytes)`)
  if (page.status !== 200) failures.push(`camera page returned ${page.status}`)
  if (!body.includes(liveCam.title)) failures.push('camera page does not render the title server-side')
  if (!body.includes('rel="canonical"')) failures.push('camera page is missing a canonical link')
  if (!body.includes('application/ld+json')) failures.push('camera page is missing structured data')
}

const missing = await fetch(`${base}/cam/deadbeefdeadbeef`, html)
const missingBody = await missing.text()
console.log(`[test] missing camera page: ${missing.status}`)
if (missing.status !== 404) failures.push(`unknown camera returned ${missing.status}, expected 404`)
if (!missingBody.includes('no signal')) failures.push('unknown camera did not render the error page')

const malformed = await fetch(`${base}/cam/not-a-camera-id`, html)
console.log(`[test] malformed camera page: ${malformed.status}`)
if (malformed.status !== 404) failures.push(`malformed camera id returned ${malformed.status}, expected 404`)

const sitemap = await fetch(`${base}/sitemap.xml`)
const sitemapBody = await sitemap.text()
const sitemapUrls = (sitemapBody.match(/<loc>/g) ?? []).length
console.log(`[test] sitemap: ${sitemap.status}, ${sitemapUrls} urls`)
if (sitemap.status !== 200) failures.push(`sitemap returned ${sitemap.status}`)
if (!sitemapBody.includes('http://www.sitemaps.org/schemas/sitemap/0.9')) failures.push('sitemap is missing its namespace')
if (!sitemapBody.includes(`/cam/${liveCam?.id ?? 'none'}`)) failures.push('sitemap does not list the ingested camera')
if (sitemapUrls < 6) failures.push(`sitemap only listed ${sitemapUrls} urls`)

// The sync endpoint is rate limited per IP; a third immediate call is throttled.
const throttled = await fetch(`${base}/api/sources/sync`, { method: 'POST' })
console.log(`[test] immediate resync: ${throttled.status}`)
if (throttled.status !== 429) failures.push(`immediate resync returned ${throttled.status}, expected 429`)

const robots = await fetch(`${base}/robots.txt`)
const robotsBody = await robots.text()
console.log(`[test] robots: ${robots.status}`)
if (robots.status !== 200) failures.push(`robots.txt returned ${robots.status}`)
if (!robotsBody.includes('Sitemap: ')) failures.push('robots.txt does not advertise the sitemap')
if (robotsBody.includes('Disallow: /cam/')) failures.push('robots.txt blocks the camera pages')


const serverLogs = logs.join('')
if (process.env.INGEST_DEBUG) console.log(serverLogs.slice(-5000))

stopApp()
fixture.close()
rmSync(dataDir, { recursive: true, force: true })

if (failures.length) {
  console.error('\n[test] FAILED')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}

console.log('\n[test] PASSED — discovery, normalization, blocklist, dedupe, probe, frames, facets, stats and map all verified')
