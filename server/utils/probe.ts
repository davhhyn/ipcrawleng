import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { CamRow } from './camRow'
import { recordProbe } from './camStore'
import { isDisallowedHost, isLoopbackAddress, isPrivateAddress } from './blocklist'
import { allowPrivateHosts, probeTimeoutMs, sensorFetchLocal, userAgent } from './config'
import { allowsPrivateHosts } from '#shared/sources'

/**
 * Liveness probing and frame fetching.
 *
 * Every outbound camera request goes through `safeFetch`, which:
 *  - rejects non-HTTP(S) URLs and credential-bearing URLs
 *  - rejects private / loopback / link-local hosts and blocklisted suffixes
 *  - re-validates every redirect hop
 *  - resolves DNS and refuses private answers (SSRF / DNS-rebinding guard)
 *  - caps wall-clock time and response size
 *
 * We never scan address ranges. Probes only touch endpoints that a public
 * source already documented.
 */

const DNS_TTL_MS = 10 * 60 * 1000
const dnsCache = new Map<string, { at: number, publicHost: boolean }>()
const MAX_REDIRECTS = 4

/**
 * Addresses a local-sensor row may legitimately live at: RFC1918 plus loopback.
 *
 * Deliberately excludes link-local (169.254.0.0/16, i.e. cloud metadata and
 * APIPA), CGNAT and anything multicast/reserved. The sensor itself cannot scan
 * those, so a row claiming one is either a mistake or an attempt to turn the
 * frame proxy into an SSRF pivot.
 */
export function isSensorReachable(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false
  if (isLoopbackAddress(hostname)) return true
  const [a, b] = hostname.split('.').map(Number) as [number, number]
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

export async function isPublicHost(hostname: string, allowPrivate = false): Promise<boolean> {
  if (allowPrivate && isSensorReachable(hostname)) {
    // The relaxation is scoped to sensor rows on the operator's own network —
    // never to web-discovered rows, and never to metadata/link-local space.
    return true
  }
  if (isDisallowedHost(hostname)) return false
  if (isIP(hostname)) {
    if (!isPrivateAddress(hostname)) return true
    return allowPrivateHosts() && isLoopbackAddress(hostname)
  }
  if (allowPrivateHosts() && (hostname === 'localhost' || hostname.endsWith('.localhost'))) return true

  const cached = dnsCache.get(hostname)
  if (cached && Date.now() - cached.at < DNS_TTL_MS) return cached.publicHost

  let publicHost = false
  try {
    const records = await lookup(hostname, { all: true, verbatim: true })
    publicHost = records.length > 0 && records.every(record =>
      allowPrivateHosts() ? !isPrivateAddress(record.address) || isLoopbackAddress(record.address) : !isPrivateAddress(record.address)
    )
  } catch {
    publicHost = false
  }
  dnsCache.set(hostname, { at: Date.now(), publicHost })
  return publicHost
}

function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => controller.abort(external?.reason)
  external?.addEventListener('abort', onAbort, { once: true })
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer)
    external?.removeEventListener('abort', onAbort)
  }, { once: true })
  return controller.signal
}

async function safeFetch(
  rawUrl: string,
  opts: {
    timeoutMs: number
    headers?: Record<string, string>
    signal?: AbortSignal
    method?: string
    allowPrivateHost?: boolean
  }
): Promise<Response> {
  let current: URL
  try {
    current = new URL(rawUrl)
  } catch {
    throw new Error('invalid url')
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    if (current.username || current.password) throw new Error('credentials in url')
    if (!await isPublicHost(current.hostname, opts.allowPrivateHost ?? false)) throw new Error('blocked host')

    const response = await fetch(current.toString(), {
      method: opts.method ?? 'GET',
      redirect: 'manual',
      signal: combineSignals(opts.timeoutMs, opts.signal),
      headers: {
        'User-Agent': userAgent(),
        'Accept': 'image/*,video/*,application/vnd.apple.mpegurl,text/plain;q=0.8,*/*;q=0.5',
        ...opts.headers
      }
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) return response
      try {
        current = new URL(location, current)
      } catch {
        throw new Error('invalid redirect')
      }
      continue
    }

    return response
  }

  throw new Error('too many redirects')
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.slice(0, maxBytes)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const remaining = maxBytes - total
      const slice = value.length > remaining ? value.slice(0, remaining) : value
      chunks.push(slice)
      total += slice.length
      if (total >= maxBytes) break
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // The response may already be complete.
    }
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export interface FetchResult {
  status: number
  ok: boolean
  contentType: string
  bytes: Uint8Array
  finalUrl: string
}

export async function fetchBytes(
  url: string,
  opts: {
    timeoutMs?: number
    maxBytes?: number
    headers?: Record<string, string>
    signal?: AbortSignal
    allowPrivateHost?: boolean
  } = {}
): Promise<FetchResult> {
  const response = await safeFetch(url, {
    timeoutMs: opts.timeoutMs ?? probeTimeoutMs(),
    headers: opts.headers,
    signal: opts.signal,
    allowPrivateHost: opts.allowPrivateHost ?? false
  })
  const bytes = await readLimited(response, opts.maxBytes ?? 64 * 1024)
  return {
    status: response.status,
    ok: response.ok,
    contentType: (response.headers.get('content-type') || '').toLowerCase(),
    bytes,
    finalUrl: response.url || url
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = ''
  for (let i = start; i < Math.min(bytes.length, start + length); i++) {
    out += String.fromCharCode(bytes[i]!)
  }
  return out
}

export function looksLikeImage(bytes: Uint8Array, contentType: string): boolean {
  if (contentType.startsWith('image/svg')) return false
  if (/^image\/(jpeg|jpg|png|webp|gif|avif|bmp)/.test(contentType)) return true
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return true
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return true
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return true
  if (startsWith(bytes, [0x42, 0x4d])) return true
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return true
  if (ascii(bytes, 4, 4) === 'ftyp' && /avi[fs]/.test(ascii(bytes, 8, 4))) return true
  return false
}

export function looksLikeHls(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 2048).includes('#EXTM3U')
}

function imageContentType(bytes: Uint8Array, declared: string): string {
  if (/^image\/(jpeg|jpg|png|webp|gif|avif|bmp)/.test(declared) && !declared.startsWith('image/svg')) {
    return declared.split(';')[0]!.replace('image/jpg', 'image/jpeg')
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  return 'image/jpeg'
}

/** Trim a multipart MJPEG chunk down to its first complete JPEG. */
function firstJpeg(bytes: Uint8Array): Uint8Array {
  let start = -1
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      start = i
      break
    }
  }
  if (start === -1) return bytes
  for (let i = start + 2; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      return bytes.slice(start, i + 2)
    }
  }
  return bytes.slice(start)
}

export interface ProbeResult {
  status: 'live' | 'offline'
  httpStatus: number | null
  error: string | null
  checkedAt: number
}

export async function probeCam(row: CamRow, signal?: AbortSignal): Promise<ProbeResult | null> {
  if (row.kind === 'page' || row.kind === 'iframe' || row.kind === 'unknown') return null

  const url = row.kind === 'hls' || row.kind === 'video'
    ? (row.stream_url || row.image_url)
    : (row.image_url || row.stream_url)
  if (!url) return null

  const allowLocal = sensorFetchLocal() && allowsPrivateHosts(row.source)
  const checkedAt = Date.now()
  try {
    const result = await fetchBytes(url, {
      timeoutMs: probeTimeoutMs(),
      maxBytes: 96 * 1024,
      signal,
      allowPrivateHost: allowLocal,
      headers: { 'Range': 'bytes=0-98303' }
    })

    if (!result.ok) {
      const restricted = result.status === 401 || result.status === 403
      return {
        status: 'offline',
        httpStatus: result.status,
        error: restricted ? `http ${result.status} (restricted)` : `http ${result.status}`,
        checkedAt
      }
    }

    let live = false
    if (row.kind === 'hls') live = looksLikeHls(result.bytes)
    else if (row.kind === 'video') live = /^video\//.test(result.contentType) || result.bytes.length > 0
    else live = looksLikeImage(result.bytes, result.contentType)

    return {
      status: live ? 'live' : 'offline',
      httpStatus: result.status,
      error: live ? null : 'no decodable frame',
      checkedAt
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      status: 'offline',
      httpStatus: null,
      error: message === 'blocked host'
        ? 'blocked host'
        : message.includes('timeout') || message.includes('abort')
          ? 'timeout'
          : 'unreachable',
      checkedAt
    }
  }
}

export interface ProbeBatchResult {
  probed: number
  live: number
  offline: number
  skipped: number
  bySource: Record<string, { probed: number, live: number, offline: number }>
}

/**
 * Probe a set of cameras with bounded concurrency and a hard wall-clock budget,
 * writing each result back to SQLite as it lands.
 */
export async function probeBatch(
  rows: CamRow[],
  opts: { concurrency?: number, budgetMs?: number } = {}
): Promise<ProbeBatchResult> {
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  const deadline = Date.now() + (opts.budgetMs ?? 45_000)
  const result: ProbeBatchResult = {
    probed: 0,
    live: 0,
    offline: 0,
    skipped: 0,
    bySource: {}
  }
  let cursor = 0

  async function worker() {
    while (cursor < rows.length && Date.now() < deadline) {
      const index = cursor++
      const row = rows[index]!
      const probe = await probeCam(row)
      if (!probe) {
        result.skipped++
        continue
      }
      recordProbe(row.id, probe)
      result.probed++
      if (probe.status === 'live') result.live++
      else result.offline++

      const bucket = result.bySource[row.source] ?? { probed: 0, live: 0, offline: 0 }
      bucket.probed++
      if (probe.status === 'live') bucket.live++
      else bucket.offline++
      result.bySource[row.source] = bucket
    }
    if (cursor < rows.length) {
      result.skipped += Math.max(0, rows.length - cursor)
      cursor = rows.length
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()))
  return result
}

export interface FrameResult {
  bytes: Uint8Array
  contentType: string
  httpStatus: number
}

export async function fetchFrame(row: CamRow): Promise<FrameResult | null> {
  if (row.kind === 'page' || row.kind === 'iframe' || row.kind === 'hls' || row.kind === 'unknown') {
    return null
  }
  const url = row.image_url || (row.kind === 'video' ? null : row.stream_url)
  if (!url) return null

  try {
    const result = await fetchBytes(url, {
      timeoutMs: Math.max(probeTimeoutMs(), 5500),
      maxBytes: 6 * 1024 * 1024,
      allowPrivateHost: sensorFetchLocal() && allowsPrivateHosts(row.source)
    })
    if (!result.ok) {
      recordProbe(row.id, {
        status: 'offline',
        httpStatus: result.status,
        error: `http ${result.status}`,
        checkedAt: Date.now()
      })
      return null
    }
    if (!looksLikeImage(result.bytes, result.contentType)) {
      recordProbe(row.id, {
        status: 'offline',
        httpStatus: result.status,
        error: 'no decodable frame',
        checkedAt: Date.now()
      })
      return null
    }

    const bytes = row.kind === 'mjpeg' ? firstJpeg(result.bytes) : result.bytes
    recordProbe(row.id, {
      status: 'live',
      httpStatus: result.status,
      error: null,
      checkedAt: Date.now()
    })
    return {
      bytes,
      contentType: imageContentType(bytes, result.contentType),
      httpStatus: result.status
    }
  } catch {
    recordProbe(row.id, {
      status: 'offline',
      httpStatus: null,
      error: 'unreachable',
      checkedAt: Date.now()
    })
    return null
  }
}
