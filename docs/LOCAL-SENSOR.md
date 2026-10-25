# The local sensor

A Shodan-shaped discovery source that runs entirely on your own machine.

Shodan works by continuously sweeping the whole IPv4 internet and selling the
index. You cannot do that from a laptop, and you should not want to: it is slow,
it is legally fraught, and it would mean your machine spends its life talking to
strangers' routers. What you *can* do locally is the part that actually matters
for a camera catalog: **connect to hosts you are authorized to test, ask each
open port what it is, and keep the answer in your own database.**

This is that. It finds the same things a Shodan search for
`port:554 product:Hikvision` would find — open ports, service banners, page
titles, auth realms, RTSP capabilities — but only on networks you name, and the
results never leave your disk except into the app you are already running.

```
npm run sensor -- init                          # write sensor.allowlist.json
npm run sensor -- scan --cidr 192.168.1.0/24 --dry-run
npm run sensor -- scan --cidr 192.168.1.0/24
npm run sensor -- import --file shodan-export.jsonl
npm run sensor -- status
```

---

## Three rules, enforced in code

Everything below is not documentation of good intentions — it is what the code
refuses to do.

**1. Nothing is scanned unless you listed it.** Every target goes through
`assertAuthorizedTargets` (`sensor/cidr.ts`) before a socket is opened. A
missing or unparseable `sensor.allowlist.json` is a hard error, never an empty
allowlist. Blocks wider than `/16` are refused outright, the expanded set is
capped at 4096 addresses (raise with `--max-hosts`, deliberately), and a block
must be *fully* covered by an allowlist entry — a listed `/24` does not
authorize the `/23` that contains it.

**2. Public address space needs two independent opt-ins.** A public block must
be in the allowlist **and** `publicAllowed` must be true in the file **and** you
must pass `--allow-public` **and** then confirm with `--yes`. Any one missing
and the run stops. Private ranges need the allowlist but not the public
switches, because RFC1918 space is the network you are sitting on.

**3. It never tries to get in.** No default credentials, no login forms, no
password guessing, no brute force, no CVE checks, no write requests. A `401` or
`403` is recorded as evidence — *"this port is an auth-required camera-like
service"* — which is exactly what Shodan would tell you about that host, and
then the sensor moves on.

---

## What a "scan" actually is

For each authorized host, the sensor does the smallest thing that answers
"is there a camera here?":

| Step | Detail |
| --- | --- |
| TCP connect | `net.connect`, one connection per port, 1.2 s timeout by default, bounded concurrency |
| Ports | `80, 443, 554, 8554, 8080, 8081, 8000, 8443, 8888, 1935` (`--ports` to change) |
| HTTP(S) | one anonymous `GET /`, plus at most five documented camera paths, stills first (`/snapshot.jpg`, `/image.jpg`, …, then `/video.mjpg` and friends) |
| Headers | `Host`, `User-Agent: ipcrawl-sensor/<version>`, `Connection: close`, `Accept` |
| RTSP | a single `OPTIONS` on 554/8554, reading the `Public:` header to see if `DESCRIBE`/`PLAY` exist |
| Stop conditions | per-run wall clock (`--budget`, default 90 s), per-source caps, off-host redirects never followed, bodies capped |

A detection is kept only when the evidence is camera-like: a JPEG/PNG frame, an
MJPEG multipart stream, HLS/DASH manifest, an RTSP service with `DESCRIBE`, a
page whose text names a DVR/NVR/camera brand, or an HTTP auth challenge with a
camera-ish realm. A random web server on port 80 is ignored.

Every request is also capped, so a hostile or broken device cannot trap the
sensor: redirects are captured but not followed, bodies are truncated, and every
socket has a timeout.

> **Scanning is a network-visible act.** Even this small footprint can appear in
> a device's logs, and in some jurisdictions unauthorised reconnaissance is
> itself an offence (in Italy, art. 615-ter c.p.; elsewhere the CFAA, the UK
> Computer Misuse Act, and equivalents). The allowlist exists so you can show
> what you declared in advance. Use it only on networks you own or have written
> permission to test.

---

## The allowlist

`npm run sensor -- init` writes `sensor.allowlist.json`:

```json
{
  "allowed": ["192.168.1.0/24", "10.0.0.0/24"],
  "publicAllowed": false,
  "note": "List only networks you own or have written permission to test."
}
```

- It is **gitignored** on purpose: the file describes your private network
  topology, which is exactly the sort of thing that should not be committed.
- Edit `allowed` to your real subnets. Common ones: `192.168.0.0/24`,
  `192.168.1.0/24`, `10.0.0.0/24`, `172.16.0.0/24`.
- `publicAllowed: true` unlocks public ranges, but scans still need
  `--allow-public` **and** `--yes`. Leave it false unless you are certain.
- Network and broadcast addresses are skipped automatically (`/31` and `/32`
  have none, so they are kept whole). A `/24` therefore yields 254 probes, not
  256.
- `--allowlist <path>` points at a different file (useful for a throwaway scope
  such as `127.0.0.1/32` when testing against a local fixture).

---

## Where the results go

The CLI never touches SQLite directly. It POSTs to your running instance:

```
POST /api/sensor/ingest        Authorization: Bearer $NUXT_SYNC_TOKEN
{ "origin": "sensor" | "import", "detections": [ … ] }
```

Rows land in the same `cams` table as every other source, tagged
`source = sensor` (or `import`), so they are deduped, probed, blocklisted,
rendered and filtered by the existing pipeline. In the UI they show up under
**Sources → local sensor** and `/?source=sensor`.

The endpoint is deliberately dumb. It stores data; it cannot start a scan. That
matters: an endpoint that scanned on request would turn any exposed instance
into an open scanner. Guards, in order:

| Guard | Behaviour |
| --- | --- |
| `NUXT_SENSOR_INGEST=false` | 403 — endpoint off entirely |
| `NUXT_SYNC_TOKEN` unset | 403 — there is no development bypass |
| wrong/absent bearer token | 401, constant-time compare |
| caller not on loopback | 403 unless `NUXT_SENSOR_ALLOW_REMOTE_INGEST=true` |
| rate limit | 12 requests/minute per IP |
| body | 400 on malformed JSON or >5000 detections; per-row validation (IPv4 literal + valid port + not blocklisted); bad rows are counted as `rejected`, not stored |

### What a run keeps and what it retires

- A **completed scan** replaces the sensor's view: rows this source no longer
  sees are deactivated (`active = 0`). The CLI only sends `complete: true` when
  the scan covered its whole scope without hitting `--budget`.
- An **import** is additive. A file is a slice of the world, not a survey —
  importing `part-2.csv` never retires the cameras from `part-1.csv`.
- A **silent run** (no detections at all) touches nothing. The network may just
  be down or the camera powered off; guessing would delete your inventory.
- Ingest accepts **IPv4 literals only**. A hostname in a payload is rejected:
  the frame proxy would have to resolve it, and that is how a "local" row could
  end up pointing at an address you never authorized. `NUXT_BLOCKED_HOSTS`
  applies here too.
- The frame proxy reaches a sensor row only at an **RFC1918 or loopback**
  address. Link-local (`169.254.0.0/16` — where cloud metadata lives), CGNAT and
  multicast addresses are refused even when a row names them, so a crafted row
  cannot turn the proxy into an SSRF pivot.

`NUXT_SENSOR_FETCH_LOCAL` (default `true`) is what lets the *frame proxy* fetch
thumbnails from `192.168.x.x` — but only for rows whose `source` is `sensor`.
The global `NUXT_ALLOW_PRIVATE_HOSTS` remains false for everything else, so a
provider can never make your server probe your LAN.

### Writing without the app

`--no-write` parses and prints but stores nothing. `--json` emits the detections
on stdout, so the sensor composes with anything else you have:

```bash
npm run sensor -- scan --cidr 192.168.1.0/24 --no-write --json > findings.json
```

---

## Importing a dataset you already own

The second local source is for exports. If you have a Shodan JSON export, an
internal asset inventory, or a spreadsheet of cameras, index it without any
scanning at all:

```
npm run sensor -- import --file cameras.jsonl
npm run sensor -- import --file inventory.csv --format csv
```

Accepted shapes:

- **JSON lines** — one object per line (Shodan's `export` format, Censys-style
  JSON, anything similar).
- **JSON** — an array of records, or an object with a `results`/`data` array.
- **CSV** — a header row plus records.

Field mapping is forgiving and case-insensitive, because every exporter names
things differently:

| Concept | Accepted keys |
| --- | --- |
| host | `ip`, `ip_str`, `host`, `address`, `addr`, `ipv4`, `target` |
| port | `port`, `ports` (first value) |
| title | `http.title`, `title`, `html_title` |
| server | `http.server`, `server`, `headers.server` |
| auth | `http.www_authenticate`, `www_authenticate`, `auth` |
| body | `data`, `http.html`, `html`, `banner` |
| location | `location.country_name`, `country`, `location.city`, `city`, `location.latitude`, `latitude`, … |

Records are rejected with a reason rather than silently mangled (`no host field`,
`not an IPv4 address`, `port out of range`, `duplicate`), and the summary prints
the reasons. Titles and banners are truncated before storage, so a chatty banner
cannot bloat a row. Nothing in `import` makes a network request — it is pure
parsing plus one local POST.

> Import only data you are licensed to hold. A Shodan export is still Shodan's
> data; the point of this command is that *you* decide what enters your index,
> not that you get around a paywall.

**Import vs. the Shodan provider.** This path is for a file you already own and
never touches the network. If you'd rather query Shodan directly, there is an
optional `shodan` provider — it needs a paid API key and `shodan` in
`NUXT_SYNC_SOURCES`; see [the README](../README.md#already-paying-for-shodan-you-can-plug-it-in).
The difference that matters: `import` accepts RTSP rows, the API provider does
not, because the API path hands rows to an HTTP prober.

---

## Limits, honestly

- **Only reachable space.** A laptop sees its own LAN plus whatever it can route
  to. No global coverage — that is the trade for privacy and legality.
- **Only IPv4.** Deliberate; a home or office camera network is IPv4 in
  practice, and it keeps the authorization guard small enough to audit.
- **Only shallow fingerprints.** Ten ports, six paths, one RTSP verb. Enough to
  identify a camera; not enough to characterise every service on a host.
- **It is not a vulnerability scanner.** No exploits, no credential tests, no
  default-password checks. If you need those, this is the wrong tool.
- **Cameras behind auth may look like nothing.** Many devices return `401` for
  every path; you get an `auth-required` row with the realm, not a thumbnail.
  That is intentional — forcing a picture would mean logging in.

---

## Reference

`npm run sensor -- help` prints this, but for the record:

| Flag | Meaning |
| --- | --- |
| `--cidr a,b` | comma/space separated targets |
| `--ports <list>` | override the default port set (max 32) |
| `--allow-public` | permit public blocks that are also allowlisted |
| `--yes` | confirm the public-range warning |
| `--dry-run` | print scope, open no sockets |
| `--max-hosts N` | raise the 4096-address cap |
| `--timeout ms` | per-connection timeout (default 1200) |
| `--budget ms` | whole-run wall clock (default 90000) |
| `--concurrency N` | parallel host workers |
| `--allowlist path` | use a different allowlist file |
| `--no-write` | do not POST to the app |
| `--json` | detections on stdout |
| `--url`, `--token` | app URL / ingest token, else `NUXT_SENSOR_URL`, `NUXT_SYNC_TOKEN` |

Environment variables read by the app:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NUXT_SYNC_TOKEN` | *(empty)* | required for ingest; also gates the sync button |
| `NUXT_SENSOR_INGEST` | `true` | set `false` to disable the endpoint |
| `NUXT_SENSOR_FETCH_LOCAL` | `true` | allow the frame proxy to reach sensor rows on private IPs |
| `NUXT_SENSOR_ALLOW_REMOTE_INGEST` | `false` | allow non-loopback ingest (do not, unless you know why) |
| `NUXT_SENSOR_URL` | `http://localhost:3000` | where the CLI sends results |

---

## Troubleshooting

**"No allowlist at …"** — run `npm run sensor -- init`, then edit the file.

**"… is not in the allowlist"** — the block you passed is not fully covered by
an entry. Add the network, not just the address.

**"No ingest token"** — the app needs `NUXT_SYNC_TOKEN` set *and* the same value
passed to the CLI. Without it, use `--no-write`.

**Ingest 403 "limited to loopback"** — the app saw a non-loopback client IP.
You are probably running the app in Docker or behind a proxy; either POST to it
from inside the same network with `NUXT_SENSOR_ALLOW_REMOTE_INGEST=true` (and a
strong token), or run the CLI on the host.

**Scan finds nothing** — check the subnet (`ip addr`, `ip route`), remember that
many cameras only answer on one of the probed ports, and that a client-isolated
Wi-Fi network will block host-to-host traffic. Try one known host and `--json`
to see what it says.

**Rows exist but no thumbnails** — cameras on private IPs are fetched through the
proxy only for `source = sensor` when `NUXT_SENSOR_FETCH_LOCAL` is not false.
An `auth-required` row has no frame by design.
