# IPCrawl Open

A public-camera index you can actually run. It recreates the feature set of
[alectrocute/ipcrawl](https://github.com/alectrocute/ipcrawl) — Explore, Fun
Mode, Atlas, Stats, a documented public API, and an "Is my camera exposed?"
check — but replaces the single Shodan dependency with **free, keyless data
sources**. Clone it, run `npm install && npm run dev`, and you have a working
catalogue in about a minute, with no accounts and no paid tier.

The demo data ships with the repo, so the site is fully browsable offline.
Live sources light up as soon as the machine has outbound network access.

![stack](https://img.shields.io/badge/Nuxt-4-00DC82) ![runtime](https://img.shields.io/badge/Nitro-node--server-black) ![db](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57) ![keys](https://img.shields.io/badge/API%20keys-none%20required-brightgreen)

---

## What it does

| Surface | Route | What's there |
| --- | --- | --- |
| **Explore** | `/` | Faceted catalogue — search, status, source, country, city, vendor, kind, favorites. Pagination, per-card thumbnails, and a detail dialog with a map, probe history and copyable link. |
| **Camera page** | `/cam/:id` | A real, shareable, crawlable page per camera — canonical URL, Open Graph image, JSON-LD `Place` data, full provenance and liveness history. Server-rendered, so links unfurl properly. |
| **Atlas** | `/map` | SVG world map (bundled geometry, no tile server, no network) with clustered markers, zoom, drag, source filters and a synced side list. |
| **Fun Mode** | `/fun` | A CRT-styled channel hopper. Number keys, arrows, "guess where this is" mode, and channel IDs you can share. |
| **Stats** | `/stats` | Coverage by country, source, vendor and kind, plus a history chart backed by periodic snapshots. |
| **Sources** | `/sources` | Every provider, its licence, last run, and what it contributed. |
| **API** | `/api` | Interactive documentation for every endpoint with copy-paste examples. |
| **IMCE** | `/imce` | "Is my camera exposed?" — checks the caller's public address against the index and walks through remediation. |
| **About** | `/about` | Architecture, provenance, licences and the ground rules. |
| **SEO** | `/sitemap.xml` · `/robots.txt` | Generated sitemap covering every indexed camera, plus a crawl policy that keeps crawlers off the frame proxy and write endpoints. |

Key behaviours:

- **It never invents liveness.** Records are labelled `live`, `offline`,
  `unknown`, or `page`. A frame that cannot be fetched is rendered as a clearly
  stamped illustrative scene (`FRAME NOT LIVE · ILLUSTRATIVE`), never as a
  silent placeholder.
- **Demo/seed rows stay labelled.** The bundled dataset is marked `SEED` in the
  UI, in the API and on every generated frame.
- **Favorites are local-first.** Stored in `localStorage`, reconciled with
  server-side counts, capped at 50.
- **Every list filter is a URL.** Share a link and the recipient sees the same
  query.

---

## Does it actually ingest real cameras?

It depends on one thing only: **whether the machine can reach the providers.**

```bash
npm run check:sources
```

That hits each provider directly (no Nuxt, no database, nothing written) and
tells you what a sync would pull:

```
  osm           ✓  2 webcam nodes       47 ms     keyless
  tfl           ✓  2 cameras            16 ms     keyless
  digitraffic   ✓  3 camera presets     16 ms     keyless
  windy         –  no NUXT_WINDY_API_KEY set (optional)
  internetdb    ✓  2 reported ports     15 ms     keyless

  3 of 4 discovery sources reachable — a sync would ingest real cameras now.
```

If nothing is reachable it says so and exits cleanly (add `--strict` to make
that a failure, e.g. in a deploy preflight). The app never fabricates a listing
to cover the gap — it serves the bundled seed catalogue instead.

**What "ingest" means here, precisely:** the app queries *public listings* —
TfL's JamCam API, Fintraffic's road-weather stations, and OpenStreetMap's
`tourism=webcam` / `contact:webcam` tags — for camera **URLs that operators
already publish**, then fetches those URLs to check they answer and to proxy a
frame. It does **not** scan IP ranges, enumerate ports, or guess URLs, and it
will not discover cameras that nobody has documented. That is a deliberate
safety trade-off, and it is the opposite of how a Shodan-based crawler works:

| | Shodan-based ipcrawl | IPCrawl Open |
|---|---|---|
| Finding cameras | searches a pre-built host/port index of the whole internet | reads provider listings + OSM tags |
| Discovery unit | exposed service on an IP:port | a URL someone published |
| Keys | paid Shodan plan | none |
| Finds undocumented / router cams | yes | **no** |
| Can name the operator | sometimes | usually |

`internetdb` is the one Shodan-derived source here: it is free and keyless, it
only annotates hosts another source already found, and only when the host is a
literal public IP. It can never create a listing.

## Quick start

Requirements: **Node 22.5+** (uses the built-in `node:sqlite` module) and npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Or run it in a container (multi-stage build, non-root runtime, `/data` volume):

```bash
docker compose up --build      # http://localhost:3000
```

First boot creates `./.data/ipcrawl.sqlite`, applies the schema and seeds the
curated catalogue. Nothing leaves the machine during boot.

To pull live listings:

```bash
curl -X POST http://localhost:3000/api/sources/sync
```

In development the sync endpoint is open. In production it needs either a
`NUXT_SYNC_TOKEN` bearer token or `NUXT_ALLOW_PUBLIC_SYNC=true`, and the daily
Nitro task (`cams:refresh`, `0 0 * * *`) does it for you.

```bash
npm run build
node .output/server/index.mjs      # production
```

---

## Data sources — all free, none load-bearing

| Provider | Kind | Key | Licence | Coverage |
| --- | --- | --- | --- | --- |
| **Open Camera Index** (`curated`) | seed | — | per-camera attribution | Global, 85 documented feeds |
| **OpenStreetMap** (`osm`) | discovery | — | ODbL 1.0 | Global, community-mapped |
| **TfL JamCams** (`tfl`) | discovery | — | Open Government Licence v3 | London |
| **Fintraffic** (`digitraffic`) | discovery | — | CC BY 4.0 | Finland |
| **Windy Webcams** (`windy`) | discovery | optional free key | Windy ToS | Global, opt-in |
| **InternetDB** (`internetdb`) | enrichment | — | Shodan public data | Tags/vendor only |
| **Local sensor** (`sensor`) | discovery · local | — | your declared scope | Networks you allowlist, on demand |
| **Dataset import** (`import`) | discovery · local | — | your dataset | Whatever you point it at |

Design rules that follow from "no paywall":

1. **No provider is required.** Any source can fail, rate-limit or disappear and
   the catalogue keeps working; the sync reports per-source status instead of
   failing as a whole.
2. **Enrichment never creates listings.** `internetdb` can add a vendor or a
   tag to an existing camera; it is not allowed to be the origin of a record.
3. **Merge conflicts favour authority.** The same stream seen by several
   providers is deduped by canonical URL, preferring
   `curated → tfl → digitraffic → windy → osm`.
4. **Empty results never delete rows.** A provider returning nothing leaves the
   catalogue untouched. Only a successful non-empty run deactivates a source's
   stale rows.
5. **Local sources are opt-in and never scheduled.** `sensor` and `import` only
   change when you run `npm run sensor`; the daily task ignores them.

Windy is the only source that *can* use a key, and it is off by default. Nothing
in the app degrades if you never set one.

---

## Local sensor — your own Shodan, on your own LAN

Shodan is an index of the whole internet built by constantly sweeping it. You
cannot reproduce that from a laptop, and the sweep is the part you would not
want to reproduce anyway. What is genuinely useful — open ports, service
banners, page titles, auth realms, RTSP capabilities — can be collected locally
from networks you name:

```bash
npm run sensor -- init                              # writes sensor.allowlist.json (gitignored)
npm run sensor -- scan --cidr 192.168.1.0/24 --dry-run
npm run sensor -- scan --cidr 192.168.1.0/24        # needs NUXT_SYNC_TOKEN in the app
npm run sensor -- import --file shodan-export.jsonl # index a dataset you already own
npm run sensor -- status
```

- **Scope is a file.** Every target must be covered by `sensor.allowlist.json`;
  a missing file fails closed, blocks wider than `/16` are refused, and the run
  is capped at 4096 addresses. Public ranges need an allowlist entry *and*
  `publicAllowed` *and* `--allow-public` *and* `--yes`.
- **No credentials, ever.** One anonymous `GET` on a handful of documented
  camera paths and one RTSP `OPTIONS`; a `401` is recorded as evidence, not
  attacked.
- **Nothing leaves the machine.** Results POST to `/api/sensor/ingest` on your
  own app (loopback + token), land in the same SQLite database as every other
  source, and are tagged `source=sensor`. No telemetry, no upload, no
  third-party call.
- **The ingest endpoint cannot scan.** It only stores; scanning lives in the CLI,
  so an exposed instance does not become an open scanner.

Full walkthrough, limits and legal notes: **[docs/LOCAL-SENSOR.md](docs/LOCAL-SENSOR.md)**.

---

## Architecture

```
app/                    Vue 4 UI — pages, components, composables, CSS
  pages/                index (Explore), stats, sources, api, about
  components/           CamCard · CamDialog · FilterPanel · WorldCanvas · …
  composables/          useExploreFilters (URL state) · useFavorites · …
layers/
  explore/              /api/explore/*  + Explore-specific pieces
  map/                  /api/map/points + Atlas page
  fun/                  /api/fun/*      + Fun Mode pages
  imce/                 /api/imce/check
shared/                 Contracts used by both sides: routes, sources,
                        explore query parsing, country metadata, projection
server/
  api/                  status · health · stats · sources · ip
  utils/
    ingest/             providers, normalization, dedupe, pipeline
    db.ts               node:sqlite access (sync driver, WAL)
    camStore.ts         reads/writes for the cams table
    exploreStore.ts     list/facet/map queries
    probe.ts            SSRF-safe fetch + liveness probing
    frames.ts           upstream frame proxy, cache, synthetic fallback
    syntheticFrame.ts   deterministic SVG scene renderer
  plugins/seed.ts       idempotent boot seed (never network)
  tasks/cams/refresh.ts scheduled ingestion
data/curated-cams.json  the bundled seed catalogue
migrations/             documented schema (applied idempotently at runtime)
scripts/                geo generation · ingestion harness
test/                   unit tests
```

**Ingestion pipeline** (`server/utils/ingest/pipeline.ts`):

```
discover (providers, concurrent, capped)
   → normalize (URL/scheme/kind/vendor/country, private-host rejection)
   → dedupe (canonical URL, source priority)
   → upsert (batch, deactivate stale rows)
   → probe (bounded concurrency + wall-clock budget)
   → snapshot + prune (60-day retention)
```

It is single-flight: a second `POST /api/sources/sync` while one is running gets
a `409`, not two scrapers racing.

**Rendering** is SSR-first. Every page returns complete HTML; the interactive
bits (dialogs, map pan, filters) hydrate on top.

---

## API

Read-only, CORS-open, no key. Rate limited per IP.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | Catalogue health, counts, last sync |
| `GET` | `/api/health` | Liveness probe + effective runtime flags |
| `GET` | `/api/stats` | Aggregates by country/source/vendor/kind |
| `GET` | `/api/stats/history` | Snapshot time series |
| `GET` | `/api/sources` | Provider list, licences, last run |
| `POST` | `/api/sources/sync` | Trigger ingestion (`409` if already running) |
| `GET` | `/api/explore/cams` | Search + facet filters, paginated |
| `GET` | `/api/explore/cams/:id` | One camera with probe metadata |
| `GET` | `/api/explore/facets` | Facet counts for the current query |
| `GET` | `/api/explore/thumb/:id` | Cached thumbnail (SVG fallback) |
| `GET` | `/api/explore/frame/:id` | Full frame, `no-store` |
| `POST` | `/api/explore/favorite/:id` | Toggle a favorite (cookie/pepper hashed) |
| `GET` | `/api/map/points` | Markers for the atlas |
| `GET` | `/api/fun/cam` | Random channel |
| `GET` | `/api/fun/cam/:id` | Specific channel |
| `GET` | `/api/ip` · `/api/imce/check` | Address exposure check |

Query parameters accept both repeated (`?country=IT&country=JP`) and bracketed
(`?country[]=IT`) forms. Paging is clamped server-side: `pageSize` can never
exceed 60.

Full request/response reference lives at `/api` in the running app.

---

## Safety and ground rules

This project indexes **publicly documented** cameras. No provider scans address
ranges, guesses credentials, or bypasses authentication.

- **No LAN or loopback ingestion from providers.** `isDisallowedHost` rejects
  private, loopback, link-local, `.local`, `.internal` and `.home.arpa` hosts at
  normalization time, and again on every redirect hop at fetch time. DNS answers
  are re-checked to block rebinding. The only rows that may point into a private
  network are ones you collected yourself with `npm run sensor` (see
  [docs/LOCAL-SENSOR.md](docs/LOCAL-SENSOR.md)); the frame proxy reaches those
  only when `NUXT_SENSOR_FETCH_LOCAL` allows it, and never resolves a hostname.
- **Local scanning is opt-in and scoped.** `sensor.allowlist.json` is required
  (missing file = hard error), public ranges need two independent switches, and
  credentials are never sent. That file is gitignored: your LAN topology is not
  our business.
- **No credentials, no exotic schemes.** URLs with userinfo, or non-HTTP(S)
  schemes, are dropped.
- **Bounded fetching.** Timeouts, a byte cap, a redirect cap and a per-sync
  probe budget (default 45 s) mean a hostile upstream can't stall a run.
- **Takedowns are config.** `NUXT_BLOCKED_HOSTS` accepts host suffixes and
  `source:<id>` entries, applied before a record ever reaches SQLite.
- `NUXT_ALLOW_PRIVATE_HOSTS` exists **only** so the test harness can run against
  a loopback fixture; even when enabled it reopens loopback alone, never RFC1918
  or cloud-metadata addresses.

If you deploy this, you are responsible for the feeds you point it at. Respect
each provider's terms, keep the attribution, and honour takedown requests.

---

## Configuration

Copy `.env.example` and edit. The useful ones:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NUXT_DATA_DIR` | `./.data` | Build-time root for the DB, thumbnails and SWR cache |
| `NUXT_DB_PATH` | `$NUXT_DATA_DIR/ipcrawl.sqlite` | SQLite location |
| `NUXT_SYNC_SOURCES` | `curated,osm,tfl,digitraffic,internetdb` | Provider allow-list |
| `NUXT_SEED_DEMO` | `true` | Seed the bundled catalogue on first boot |
| `NUXT_SYNC_TOKEN` | — | Bearer token required by `POST /api/sources/sync` |
| `NUXT_ALLOW_PUBLIC_SYNC` | `false` | Allow unauthenticated sync outside dev |
| `NUXT_ENABLE_LIVE_PROBE` | `true` | Probe feeds for liveness |
| `NUXT_LIVE_PROBE_TIMEOUT_MS` / `_BUDGET_MS` | `4000` / `45000` | Probe limits |
| `NUXT_MAX_INGEST_PER_SOURCE` | `600` | Rows kept per source per run |
| `NUXT_WINDY_API_KEY` | — | Optional |
| `NUXT_OVERPASS_URL` | `overpass-api.de` | Overpass mirror or proxy |
| `NUXT_BLOCKED_HOSTS` | — | Host suffixes / `source:<id>` to never publish |
| `NUXT_VOTER_PEPPER` | — | Salt for hashed favorite voters |
| `NUXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URL for metadata |

---

## Development

```bash
npm run dev           # dev server
npm run typecheck     # vue-tsc, strict
npm run test:unit     # vitest — normalization, blocklist, geo, frames, query parsing
npm run test:ingest   # end-to-end ingestion against a local fixture server
npm run build         # production build
npm run verify        # typecheck + unit + ingestion + build, in that order
npm run generate:geo  # regenerate shared/worldGeo.ts + country metadata
npm run generate:brand # re-render public/og-cover.png + icons from SVG
npm run check:sources # probe each provider directly; --strict to fail when offline
```

`npm run verify` is the whole gate in one command; CI runs exactly the same
sequence (`.github/workflows/ci.yml`) plus a production-bundle smoke test and a
Docker build.

`npm run test:ingest` is the interesting one. It boots a fixture HTTP server
that mimics TfL, Fintraffic and Overpass, points the real pipeline at it via
endpoint overrides, then asserts what actually reached SQLite: dedupe priority,
private-host rejection, URL-less rows dropped, HLS detection, live/offline
probing, JPEG proxying, facet counts and map points. It exits non-zero on any
regression, so it is CI-friendly.

```
[test] catalogue size: 5
         · [tfl] Fixture Junction (A1) — London, England, United Kingdom (snapshot/live)
         · [digitraffic] Helsinki Fixture Station — Northbound — Helsinki, Uusimaa, Finland (snapshot/live)
         · [osm] Madrid Fixture Stream — (hls/live)
         · [osm] Piazza Duomo Live — Milan, Italy (snapshot/live)
[test] PASSED
```

It also asserts the things that are easy to regress without noticing:

- camera pages render server-side with a canonical link and JSON-LD
- unknown *and* malformed camera ids both return `404`, not `400`
- the sitemap lists ingested cameras and declares its namespace
- `robots.txt` advertises the sitemap and does **not** block `/cam/`
- two concurrent syncs return `200` + `409` (single-flight), and a third
  returns `429` (rate limit) — the 409 must not burn the caller's budget

The harness uses ephemeral ports and its own database, so it can run alongside a
dev server.

---

## Deployment

The production server is a plain Nitro node-server bundle with a self-contained
node_modules tree, so the runtime image needs neither a compiler nor `npm ci`:

```
.output/server/index.mjs      # PORT, HOST, NUXT_DATA_DIR, NUXT_PUBLIC_SITE_URL
```

`NUXT_DATA_DIR` is read at **build** time (it sets the thumbnail and SWR-cache
roots), so set it before `npm run build` if you're mounting a volume. The Docker
image already bakes in `/data`.

Set `NUXT_PUBLIC_SITE_URL` in any real deployment — it drives canonical links,
`og:image` URLs, the sitemap and `robots.txt`. Leave `NUXT_SYNC_TOKEN` unset and
let the scheduled `cams:refresh` task do the fetching; expose the sync endpoint
only if an operator needs to trigger a run by hand.

`GET /api/health` is the liveness probe: it touches neither the network nor the
rate limiter, and reports the effective source list and flags so a
misconfigured deployment is obvious from `curl` alone.

## Differences from upstream ipcrawl

Kept: layered structure, route/contract shape, Explore/Fun/Atlas/Stats/API/IMCE
surfaces, SQLite persistence, scheduled refresh, daily snapshots.

Changed deliberately:

- **No Shodan dependency.** Five free sources instead of one paid index; the
  app is useful with zero keys and zero network.
- **No external tile server.** The atlas uses bundled world geometry, so it
  works inside sandboxes and offline.
- **No CDN icons or fonts.** Everything is local; no runtime requests to
  third-party asset hosts.
- **Bundled seed catalogue** so first run is never an empty page.
- **Per-camera pages** (`/cam/:id`) with real SEO metadata, so the catalogue is
  linkable and indexable rather than a single client-rendered app shell.
- **Generated illustration frames** instead of a blank "no signal" box, always
  stamped as non-live.
- UI is hand-built CSS rather than Nuxt UI + Tailwind, to keep the dependency
  surface small.

## Credits

- Concept and original implementation: [alectrocute/ipcrawl](https://github.com/alectrocute/ipcrawl) (MIT).
- Map geometry: [Natural Earth](https://www.naturalearthdata.com/) via `world-atlas` (public domain);
  country metadata via `world-countries` (ODbL).
- Camera data: Transport for London, Fintraffic, OpenStreetMap contributors,
  Windy, and the individual operators listed per record in the catalogue.

If you use this project, keep the upstream credit and the per-source licences
intact.

MIT.
