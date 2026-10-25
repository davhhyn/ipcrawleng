/**
 * Pure fingerprinting: turn raw probe observations into a detection.
 *
 * Kept free of I/O so every heuristic is unit-testable without a network.
 * These are the same signals Shodan surfaces for a host — status, headers,
 * title, auth realm — just collected one host at a time.
 */

import type { DetectionEvidence, DetectionKind, DetectionProtocol } from './types.ts'

export interface HttpObservation {
  port: number
  scheme: 'http' | 'https'
  path: string
  status: number
  headers: Record<string, string>
  body: string
  latencyMs: number
}

export interface RtspObservation {
  port: number
  ok: boolean
  methods: string[]
  statusCode: number | null
  latencyMs: number
}

/** Paths cameras commonly serve anonymously. Ordered by signal strength. */
export const CAMERA_PATHS: { path: string, kind: DetectionKind }[] = [
  // Stills first: one response each, and a still is what gives us a thumbnail.
  { path: '/snapshot.jpg', kind: 'snapshot' },
  { path: '/image.jpg', kind: 'snapshot' },
  { path: '/axis-cgi/jpg/image.cgi', kind: 'snapshot' },
  { path: '/snapshot.cgi', kind: 'snapshot' },
  { path: '/tmpfs/auto.jpg', kind: 'snapshot' },
  { path: '/ISAPI/Streaming/channels/101/picture', kind: 'snapshot' },
  // Then the stream endpoints, which stay open until we cut them off.
  { path: '/mjpg/video.mjpg', kind: 'mjpeg' },
  { path: '/video.mjpg', kind: 'mjpeg' },
  { path: '/cgi-bin/mjpg/video.cgi', kind: 'mjpeg' },
  { path: '/axis-cgi/mjpg/video.cgi', kind: 'mjpeg' },
  { path: '/stream', kind: 'mjpeg' }
]

/** Ordered probe list for a host: the root page first, then camera paths. */
export function probePaths(max = 6): { path: string, kind: DetectionKind }[] {
  return [{ path: '/', kind: 'page' }, ...CAMERA_PATHS.slice(0, Math.max(0, max - 1))]
}

const TITLE_RE = /<title[^>]*>([\s\S]{1,200}?)<\/title>/i

export function extractTitle(body: string): string | null {
  const match = TITLE_RE.exec(body)
  if (!match) return null
  const cleaned = match[1]!
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.slice(0, 80) : null
}

/** `Basic realm="IP Camera"` → `IP Camera`. */
export function extractRealm(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /realm\s*=\s*"?([^",]{1,60})"?/i.exec(header)
  const value = (match?.[1] ?? '').trim()
  return value || null
}

/**
 * Lower-case a header set.
 *
 * Accepts both a web `Headers` (used in tests and by fetch-style callers) and
 * Node's plain `IncomingHttpHeaders` object, because `http.request` hands us the
 * latter and it has no `forEach`.
 */
export type HeaderInput =
  | Headers
  | Record<string, string | string[] | undefined>
  | null
  | undefined

export function normalizeHeaderMap(headers: HeaderInput): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out

  if (typeof (headers as Headers).forEach === 'function') {
    ;(headers as Headers).forEach((value, key) => {
      out[key.toLowerCase()] = value
    })
    return out
  }

  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (value === undefined || value === null) continue
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

/** Multi-word product strings that are worth keeping as vendor hints. */
const VENDOR_MARKERS = [
  'hikvision', 'dahua', 'axis', 'amcrest', 'reolink', 'foscam', 'vivotek',
  'mobotix', 'panasonic', 'bosch', 'hanwha', 'wisenet', 'uniview', 'd-link',
  'dlink', 'tp-link', 'tapo', 'ezviz', 'annke', 'swann', 'lorex', 'geovision',
  'avtech', 'yoosee', 'unifi', 'ubiquiti', 'goahead', 'boa', 'lighttpd',
  'camera', 'ipcam', 'netcam'
]

export function vendorHints(observation: HttpObservation): string[] {
  const haystack = [
    observation.headers.server ?? '',
    observation.headers['www-authenticate'] ?? '',
    observation.body.slice(0, 2000)
  ].join(' ').toLowerCase()

  const hints = new Set<string>()
  for (const marker of VENDOR_MARKERS) {
    if (haystack.includes(marker)) hints.add(marker)
  }
  const server = observation.headers.server
  if (server) hints.add(server.slice(0, 60))
  return [...hints].slice(0, 6)
}

const IMAGE_SIGNATURES: { test: (bytes: number[]) => boolean, kind: DetectionKind }[] = [
  { test: bytes => bytes[0] === 0xff && bytes[1] === 0xd8, kind: 'snapshot' },
  { test: bytes => bytes[0] === 0x89 && bytes[1] === 0x50, kind: 'snapshot' },
  { test: bytes => bytes[0] === 0x47 && bytes[1] === 0x49, kind: 'snapshot' },
  { test: bytes => bytes[0] === 0x42 && bytes[1] === 0x4d, kind: 'snapshot' }
]

const MJPEG_SIG = [0x2d, 0x2d] // multipart boundary "--"

/** What is this response, really? Order matters. */
export function classifyResponse(observation: HttpObservation, sniff: number[]): DetectionKind {
  const type = (observation.headers['content-type'] ?? '').toLowerCase()

  if (type.startsWith('multipart/')) return 'mjpeg'
  if (type.startsWith('application/vnd.apple.mpegurl')) return 'hls'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('image/')) return 'snapshot'

  for (const signature of IMAGE_SIGNATURES) {
    if (signature.test(sniff)) return signature.kind
  }
  if (sniff[0] === MJPEG_SIG[0] && sniff[1] === MJPEG_SIG[1]) return 'mjpeg'

  if (observation.status === 401 || observation.status === 403) return 'unknown'

  const isHtml = type.startsWith('text/html') || observation.body.trimStart().startsWith('<')
  if (isHtml) {
    // A root page that only embeds a player is still just a page.
    return 'page'
  }
  if (type.startsWith('application/json')) return 'page'
  return 'unknown'
}

export function isHttpPort(port: number): boolean {
  return port === 80 || port === 8080 || port === 8081 || port === 8000 || port === 8888
}

export function isHttpsPort(port: number): boolean {
  return port === 443 || port === 8443
}

export function isRtspPort(port: number): boolean {
  return port === 554 || port === 8554
}

/** Camera-ish by path, port or response — used to decide whether to keep probing. */
export function looksCameraish(observation: HttpObservation, kind: DetectionKind): boolean {
  if (kind === 'snapshot' || kind === 'mjpeg' || kind === 'hls' || kind === 'video') return true
  if (observation.status === 401 || observation.status === 403) return true
  const text = `${observation.body.slice(0, 4000)} ${JSON.stringify(observation.headers)}`.toLowerCase()
  return /camera|webcam|ipcam|netcam|rtsp|mjpeg|onvif|surveillance|nvr|dvr|video/.test(text)
}

export function buildTitle(host: string, port: number, evidence: DetectionEvidence): string {
  const candidates = [
    evidence.title,
    evidence.realm,
    evidence.server,
    evidence.rtspMethods?.length ? 'RTSP camera' : null
  ]
  const label = candidates.find(value => value && value.trim().length > 1)
  if (label) return label.trim().slice(0, 120)
  return `Camera at ${host}:${port}`
}

/** Best URL to hand to the catalogue, if any. */
export function detectionUrl(
  observation: HttpObservation | null,
  protocol: DetectionProtocol,
  host: string,
  port: number
): string | null {
  if (protocol === 'rtsp') {
    return `rtsp://${host}:${port}/`
  }
  if (!observation) return null
  const defaultPort = (observation.scheme === 'https' && port === 443) || (observation.scheme === 'http' && port === 80)
  const authority = defaultPort ? host : `${host}:${port}`
  return `${observation.scheme}://${authority}${observation.path === '/' ? '/' : observation.path}`
}

export function summarizeEvidence(
  observations: HttpObservation[],
  rtsp: RtspObservation | null,
  openPorts: number[]
): { evidence: DetectionEvidence, best: HttpObservation | null, kind: DetectionKind, metadata: HttpObservation | null } {
  // Prefer an actual frame over a page, then the shallowest path.
  const ranked = [...observations].sort((a, b) => {
    const rank = (observation: HttpObservation) => {
      const kind = classifyResponse(observation, [])
      if (kind === 'mjpeg') return 0
      if (kind === 'snapshot') return 1
      if (kind === 'hls' || kind === 'video') return 2
      if (observation.status === 200) return 3
      return 4
    }
    return rank(a) - rank(b) || a.path.length - b.path.length
  })

  const best = ranked[0] ?? null
  const kind = best ? classifyResponse(best, []) : 'unknown'
  const authRequired = observations.some(observation => observation.status === 401 || observation.status === 403)

  // `best` is whichever response we would show (a frame beats a page), but the
  // identifying metadata almost always sits on the root page instead. Read each
  // field from the first observation that actually carries it.
  const metadata = observations.find(observation =>
    Boolean(observation.headers.server)
    || Boolean(observation.headers['www-authenticate'])
    || Boolean(extractTitle(observation.body))
  ) ?? best

  const evidence: DetectionEvidence = {
    openPorts,
    protocol: best ? best.scheme : (rtsp ? 'rtsp' : null),
    httpStatus: best?.status ?? null,
    server: metadata?.headers.server?.slice(0, 60) ?? null,
    realm: extractRealm(metadata?.headers['www-authenticate']),
    title: metadata ? extractTitle(metadata.body) : null,
    rtspMethods: rtsp?.methods.length ? rtsp.methods.slice(0, 8) : null,
    authRequired,
    sourcePath: best?.path ?? null
  }

  return { evidence, best, kind, metadata: metadata ?? null }
}

/** Tags published with the row. Deliberately factual, never credential-like. */
export function evidenceTags(
  evidence: DetectionEvidence,
  kind: DetectionKind,
  port: number,
  origin: 'scan' | 'import'
): string[] {
  const tags = new Set<string>()
  tags.add(origin === 'scan' ? 'local-sensor' : 'imported-dataset')
  tags.add(`port:${port}`)
  if (evidence.protocol) tags.add(evidence.protocol)
  if (kind !== 'unknown') tags.add(kind)
  if (evidence.authRequired) tags.add('auth-required')
  if (evidence.httpStatus && evidence.httpStatus !== 200) tags.add(`http:${evidence.httpStatus}`)
  if (evidence.server) tags.add(`server:${evidence.server.toLowerCase().slice(0, 40)}`)
  if (evidence.realm) tags.add(`realm:${evidence.realm.toLowerCase().slice(0, 40)}`)
  return [...tags].slice(0, 12)
}
