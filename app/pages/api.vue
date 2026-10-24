<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, Radio, Shield, Terminal } from '@lucide/vue'

useHead({
  title: 'API',
  meta: [{ name: 'description', content: 'Read-only, CORS-open HTTP API for the IPCrawl Open camera catalogue.' }]
})

interface Endpoint {
  id: string
  method: string
  path: string
  title: string
  summary: string
  params?: { name: string, type: string, detail: string }[]
  example: string
  response: string
  notes?: string[]
}

const endpoints: Endpoint[] = [
  {
    id: 'cams',
    method: 'GET',
    path: '/api/explore/cams',
    title: 'List cameras',
    summary: 'Paginated, filtered catalogue feed. This is the same endpoint the Explore page uses.',
    params: [
      { name: 'page', type: 'int', detail: '1-based page number (default 1).' },
      { name: 'pageSize', type: 'int', detail: 'Rows per page, 1–60 (default 24).' },
      { name: 'q', type: 'string', detail: 'Free-text search across title, city, region, country, vendor, operator and tags.' },
      { name: 'sort', type: 'enum', detail: 'recent · favorites · discovered · name' },
      { name: 'country / country[]', type: 'string', detail: 'Repeatable country filter (full country name).' },
      { name: 'city / city[]', type: 'string', detail: 'Repeatable city filter.' },
      { name: 'vendor / vendor[]', type: 'string', detail: 'Repeatable vendor filter.' },
      { name: 'source / source[]', type: 'string', detail: 'curated · osm · tfl · digitraffic · windy' },
      { name: 'kind / kind[]', type: 'string', detail: 'snapshot · mjpeg · hls · video · iframe · page' },
      { name: 'status', type: 'enum', detail: 'live · offline · unknown · page · any' }
    ],
    example: "curl 'https://your-host/api/explore/cams?country=Italy&status=live&pageSize=2'",
    response: `{
  "items": [
    {
      "id": "716127c636f1d407",
      "title": "Rialto Bridge — Grand Canal",
      "country": "Italy",
      "countryCode": "IT",
      "city": "Venice",
      "location": "Venice, Veneto, Italy",
      "lat": 45.438,
      "lon": 12.3358,
      "vendor": null,
      "source": "curated",
      "sourceLabel": "Open Camera Index",
      "kind": "page",
      "status": "page",
      "isLive": false,
      "thumb": "/api/explore/thumb/716127c636f1d407",
      "favCount": 0,
      "isDemo": true
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 2,
  "generatedAt": 1792877885032
}`,
    notes: [
      'Raw stream hosts and IP addresses are intentionally never returned.',
      'Cached for 30 seconds (stale-while-revalidate) at the edge.'
    ]
  },
  {
    id: 'cam',
    method: 'GET',
    path: '/api/explore/cams/{id}',
    title: 'One camera',
    summary: 'Full detail for a single camera, including probe outcome, tags, licence and attribution.',
    params: [{ name: 'id', type: 'path', detail: '16-hex camera id from the list or detail endpoints.' }],
    example: 'curl https://your-host/api/explore/cams/716127c636f1d407',
    response: `{
  "id": "716127c636f1d407",
  "title": "Rialto Bridge — Grand Canal",
  "kind": "page",
  "status": "page",
  "port": 443,
  "protocol": "Documented page",
  "tags": ["tourism", "canal", "heritage"],
  "attribution": "Bundled seed · illustrative landmark location",
  "license": "IPCrawl Open seed dataset (CC0)",
  "probe": { "checkedAt": null, "httpStatus": null, "error": null },
  "frame": "/api/explore/frame/716127c636f1d407"
}`,
    notes: ['`frame` always resolves — to a live frame when the camera answers, otherwise to a labelled generated preview.']
  },
  {
    id: 'facets',
    method: 'GET',
    path: '/api/explore/facets',
    title: 'Facet counts',
    summary: 'Cross-filtered counts for country, city, vendor, source, kind and status. Accepts the same filters as the list endpoint.',
    example: 'curl https://your-host/api/explore/facets',
    response: `{
  "countries": [{ "value": "United States", "count": 8 }],
  "cities": [{ "value": "New York", "count": 2 }],
  "vendors": [],
  "sources": [{ "value": "curated", "label": "Open Camera Index", "accent": "#a78bfa", "count": 85 }],
  "kinds": [{ "value": "page", "label": "Documented page", "count": 85 }],
  "statuses": [{ "value": "page", "label": "Page only", "count": 85 }]
}`,
    notes: ['Cached for 5 minutes.']
  },
  {
    id: 'thumb',
    method: 'GET',
    path: '/api/explore/thumb/{id}',
    title: 'Thumbnail / frame',
    summary: 'A cached still for the camera. Never triggers an expensive probe for cameras recently found offline.',
    example: 'curl -o frame.jpg https://your-host/api/explore/thumb/716127c636f1d407',
    response: `HTTP/1.1 200 OK
content-type: image/jpeg
x-frame-source: upstream | cache | generated
x-frame-reason: seed | page | offline
etag: "gen-1c15fef8"`,
    notes: [
      'Responses may be JPEG, PNG or SVG. Generated previews are always SVG and clearly labelled inside the image.',
      'Honours `if-none-match` (ETag) so browsers and CDNs can revalidate cheaply.'
    ]
  },
  {
    id: 'frame',
    method: 'GET',
    path: '/api/explore/frame/{id}',
    title: 'Fresh frame',
    summary: 'The uncached variant used by the camera dialog and Fun mode. Always attempts an upstream fetch first.',
    example: 'curl -o live.jpg https://your-host/api/explore/frame/716127c636f1d407',
    response: `HTTP/1.1 200 OK
content-type: image/jpeg
cache-control: no-store
x-frame-source: upstream`,
    notes: ['Rate limited per IP; use the thumbnail endpoint for grids and galleries.']
  },
  {
    id: 'map',
    method: 'GET',
    path: '/api/map/points',
    title: 'Atlas points',
    summary: 'Every camera with coordinates, ready to plot. Capped at 20,000 points per response.',
    example: 'curl https://your-host/api/map/points',
    response: `{
  "points": [
    {
      "id": "716127c636f1d407",
      "title": "Rialto Bridge — Grand Canal",
      "lat": 45.438,
      "lon": 12.3358,
      "city": "Venice",
      "country": "Italy",
      "status": "page",
      "source": "curated",
      "thumb": "/api/explore/thumb/716127c636f1d407"
    }
  ],
  "total": 85,
  "truncated": false
}`
  },
  {
    id: 'stats',
    method: 'GET',
    path: '/api/stats',
    title: 'Aggregate stats',
    summary: 'Counts, coverage and ranked facets (countries, vendors, sources, kinds, statuses, regions).',
    example: 'curl https://your-host/api/stats',
    response: `{
  "counts": { "total": 85, "live": 0, "countries": 56, "sources": 1, "favorites": 0 },
  "coverage": { "withCoords": 85, "withCity": 85, "liveRate": 0 },
  "bySource": [{ "value": "curated", "label": "Open Camera Index", "count": 85 }]
}`,
    notes: ['Cached for 5 minutes.']
  },
  {
    id: 'sources',
    method: 'GET',
    path: '/api/sources',
    title: 'Source health',
    summary: 'Configured providers, their licences, camera counts and the most recent per-source ingestion result.',
    example: 'curl https://your-host/api/sources',
    response: `{
  "sources": [
    {
      "id": "tfl",
      "label": "TfL JamCams",
      "enabled": true,
      "keyless": true,
      "cams": 912,
      "healthy": true,
      "license": "Open Government Licence v3"
    }
  ],
  "lastSync": { "status": "ok", "seen": 1402, "added": 0, "updated": 912 }
}`
  },
  {
    id: 'fun',
    method: 'GET',
    path: '/api/fun/cam',
    title: 'Random channel',
    summary: 'One random camera, used by Fun mode and the “surprise me” button.',
    params: [
      { name: 'live', type: 'flag', detail: '`1` restricts to cameras verified live.' },
      { name: 'source', type: 'string', detail: 'Restrict to one provider id.' },
      { name: 'exclude', type: 'string', detail: 'Comma-separated ids to avoid (recent channels).' }
    ],
    example: "curl 'https://your-host/api/fun/cam?live=1'",
    response: `{
  "channel": {
    "id": "b735049bd60cd9ab",
    "title": "Oia — Caldera",
    "location": "Santorini, South Aegean, Greece",
    "isLive": false,
    "total": 85
  },
  "total": 85,
  "demoMode": true
}`
  },
  {
    id: 'ip',
    method: 'GET',
    path: '/api/ip',
    title: 'Exposure check',
    summary: 'Checks whether the requesting address appears as a documented camera host in the catalogue. CORS-open; no scanning.',
    example: 'curl https://your-host/api/ip',
    response: `{
  "ip": "203.0.113.7",
  "indexed": false,
  "matchedCam": null,
  "generatedAt": 1792877885032
}`,
    notes: [
      'The address is compared against documented hosts only and is never stored.',
      'Browser-cached for 5 minutes.'
    ]
  }
]

const active = ref(endpoints[0]!.id)
const current = computed(() => endpoints.find(endpoint => endpoint.id === active.value) ?? endpoints[0]!)

const rateLimits = [
  { endpoint: 'List / detail', limit: '240 req / min / IP' },
  { endpoint: 'Facets', limit: '120 req / min / IP' },
  { endpoint: 'Thumbnails', limit: '600 req / min / IP' },
  { endpoint: 'Fresh frames', limit: '180 req / min / IP' },
  { endpoint: 'Exposure check', limit: '30 req / min / IP' }
]
</script>

<template>
  <div class="page api">
    <header class="api__head">
      <div>
        <p class="eyebrow"><Terminal :size="10" /> Public API · v1</p>
        <h1 class="api__title display">
          Read-only.<br><span class="text-gradient">CORS-open.</span>
        </h1>
        <p class="api__lede">
          The catalogue is public data. Every read endpoint below is open to
          cross-origin browser requests, needs no key, and returns attribution
          metadata so you can credit the underlying provider.
        </p>
      </div>

      <div class="api__badges">
        <span class="chip chip-live"><Radio :size="10" /> NO AUTH</span>
        <span class="chip"><Shield :size="10" /> RATE LIMITED</span>
        <span class="chip">JSON + IMAGE</span>
      </div>
    </header>

    <div class="api__layout">
      <nav class="api__nav" aria-label="Endpoints">
        <p class="eyebrow">Endpoints</p>
        <button
          v-for="endpoint in endpoints"
          :key="endpoint.id"
          type="button"
          class="api__nav-item"
          :class="{ 'api__nav-item--on': endpoint.id === active }"
          @click="active = endpoint.id"
        >
          <span class="api__method">{{ endpoint.method }}</span>
          <span class="api__nav-path mono">{{ endpoint.path }}</span>
        </button>
      </nav>

      <div class="api__content">
        <article :key="current.id" class="endpoint panel">
          <header class="endpoint__head">
            <div class="endpoint__title-row">
              <span class="api__method api__method--lg">{{ current.method }}</span>
              <h2 class="endpoint__path mono">{{ current.path }}</h2>
            </div>
            <h3 class="endpoint__name">{{ current.title }}</h3>
            <p class="endpoint__summary">{{ current.summary }}</p>
          </header>

          <section v-if="current.params?.length" class="endpoint__section">
            <p class="eyebrow">Parameters</p>
            <div class="params">
              <div v-for="param in current.params" :key="param.name" class="param">
                <code class="param__name mono">{{ param.name }}</code>
                <span class="param__type mono">{{ param.type }}</span>
                <span class="param__detail">{{ param.detail }}</span>
              </div>
            </div>
          </section>

          <section class="endpoint__section">
            <p class="eyebrow">Request</p>
            <CodeBlock :code="current.example" language="bash" label="curl" />
          </section>

          <section class="endpoint__section">
            <p class="eyebrow">Response</p>
            <CodeBlock :code="current.response" :language="current.response.startsWith('HTTP') ? 'http' : 'json'" />
          </section>

          <ul v-if="current.notes?.length" class="endpoint__notes">
            <li v-for="note in current.notes" :key="note">{{ note }}</li>
          </ul>

          <footer class="endpoint__foot">
            <a
              :href="current.path.replace('{id}', '716127c636f1d407')"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-sm"
            >
              Try it live
              <ArrowUpRight :size="11" />
            </a>
            <span class="mono endpoint__shape">cache-control · swr · gzip</span>
          </footer>
        </article>

        <div class="api__side">
          <section class="panel api__block">
            <p class="eyebrow">Rate limits</p>
            <div class="limits">
              <div v-for="row in rateLimits" :key="row.endpoint" class="limits__row">
                <span class="limits__name">{{ row.endpoint }}</span>
                <span class="limits__val mono">{{ row.limit }}</span>
              </div>
            </div>
            <p class="api__fine">
              Exceeding a limit returns <code>429</code> with a short message.
              Cached responses do not count against your budget twice.
            </p>
          </section>

          <section class="panel api__block">
            <p class="eyebrow">Attribution</p>
            <p class="api__text">
              Each camera carries <code>source</code>, <code>sourceLabel</code> and,
              on the detail endpoint, <code>attribution</code> and <code>license</code>.
              Display them. Required notices:
            </p>
            <ul class="api__list">
              <li>OpenStreetMap — © OpenStreetMap contributors (ODbL 1.0)</li>
              <li>TfL — Open Government Licence v3</li>
              <li>Fintraffic — CC BY 4.0</li>
              <li>Windy — Windy API terms</li>
            </ul>
          </section>

          <section class="panel api__block">
            <p class="eyebrow">Crawlable surfaces</p>
            <p class="api__text">
              Every camera also has a server-rendered page. Use it for links and
              deep links instead of re-hosting frames:
            </p>
            <div class="limits">
              <div class="limits__row">
                <span class="mono">/cam/:id</span>
                <span class="limits__val mono">HTML + JSON-LD</span>
              </div>
              <div class="limits__row">
                <span class="mono">/sitemap.xml</span>
                <span class="limits__val mono">all indexed cams</span>
              </div>
              <div class="limits__row">
                <span class="mono">/robots.txt</span>
                <span class="limits__val mono">crawl policy</span>
              </div>
            </div>
            <p class="api__fine">
              <code>/robots.txt</code> disallows the frame proxy and the sync
              endpoint — please respect it.
            </p>
          </section>

          <section class="panel api__block">
            <p class="eyebrow">Fair use</p>
            <p class="api__text">
              This API exists so the catalogue's mission can be extended — not so
              stream endpoints can be harvested. Do not use it to build a scanner,
              to bypass a provider's terms, or to re-publish raw camera hosts.
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api {
  padding-top: 34px;
  padding-bottom: 20px;
}

.api__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.api__title {
  margin: 10px 0 0;
  font-size: clamp(30px, 4.4vw, 50px);
  color: #f7faff;
}

.api__lede {
  max-width: 600px;
  margin: 13px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.65;
}

.api__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.api__layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  align-items: start;
}

@media (min-width: 1024px) {
  .api__layout {
    grid-template-columns: 248px minmax(0, 1fr);
    gap: 22px;
  }
}

.api__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: calc(var(--header-h) + 16px);
  max-height: calc(100dvh - 120px);
  overflow-y: auto;
}

.api__nav .eyebrow {
  margin-bottom: 8px;
}

.api__nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: none;
  text-align: left;
  cursor: pointer;
}

.api__nav-item:hover {
  background: rgba(255, 255, 255, 0.035);
}

.api__nav-item--on {
  border-color: rgb(var(--signal-rgb) / 0.3);
  background: rgb(var(--signal-rgb) / 0.08);
}

.api__nav-path {
  font-size: 10px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api__nav-item--on .api__nav-path {
  color: var(--signal-bright);
}

.api__method {
  flex: none;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgb(var(--live-rgb) / 0.12);
  color: var(--live);
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.api__method--lg {
  font-size: 9px;
  padding: 3px 7px;
}

.api__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 1280px) {
  .api__content {
    grid-template-columns: minmax(0, 1fr) 296px;
  }
}

.endpoint {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  min-width: 0;
}

.endpoint__title-row {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.endpoint__path {
  margin: 0;
  font-size: 14px;
  color: #eaf1fb;
  overflow-wrap: anywhere;
}

.endpoint__name {
  margin: 10px 0 0;
  font-size: 17px;
  font-weight: 560;
  letter-spacing: -0.015em;
}

.endpoint__summary {
  margin: 6px 0 0;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.6;
}

.endpoint__section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.params {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 9px;
  overflow: hidden;
}

.param {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) 60px minmax(0, 2fr);
  gap: 10px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  align-items: baseline;
}

.param:last-child {
  border-bottom: 0;
}

.param__name {
  font-size: 10.5px;
  color: var(--signal-bright);
  overflow-wrap: anywhere;
}

.param__type {
  font-size: 8.5px;
  color: var(--text-mute);
  letter-spacing: 0.06em;
}

.param__detail {
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}

.endpoint__notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 16px;
  color: var(--text-mute);
  font-size: 11px;
  line-height: 1.6;
}

.endpoint__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.endpoint__shape {
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.api__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api__block {
  padding: 14px 15px;
}

.limits {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 9px;
}

.limits__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
  font-size: 10.5px;
}

.limits__row:last-child {
  border-bottom: 0;
}

.limits__name {
  color: var(--text-dim);
}

.limits__val {
  color: var(--text);
  font-size: 9px;
  white-space: nowrap;
}

.api__fine,
.api__text {
  margin: 9px 0 0;
  color: var(--text-mute);
  font-size: 10.5px;
  line-height: 1.6;
}

.api__text code,
.api__fine code {
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--signal-bright);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.api__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 9px 0 0;
  padding-left: 15px;
  color: var(--text-dim);
  font-size: 10.5px;
  line-height: 1.55;
}
</style>
