/**
 * Bounded active probing for networks you control.
 *
 * What this does:
 *   - TCP connect (no SYN scanning, no raw sockets) to a short, fixed port list
 *   - one anonymous HTTP GET on the root, then a handful of well-known camera
 *     paths — the same public paths every camera manual documents
 *   - one anonymous RTSP `OPTIONS` on RTSP ports
 *
 * What this never does:
 *   - attempt credentials, default passwords or basic-auth guessing
 *   - follow redirects off-host
 *   - scan beyond the authorized target list, or keep going after the budget
 */

import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { isScannable } from './cidr.ts'
import type { Detection, ScanOptions, ScanSummary } from './types.ts'
import {
  buildTitle,
  classifyResponse,
  detectionUrl,
  evidenceTags,
  extractRealm,
  isHttpsPort,
  isHttpPort,
  isRtspPort,
  looksCameraish,
  normalizeHeaderMap,
  probePaths,
  summarizeEvidence,
  vendorHints,
  type HttpObservation,
  type RtspObservation
} from './fingerprint.ts'

const DEFAULT_TIMEOUT_MS = 1200
const DEFAULT_CONCURRENCY = 24
const DEFAULT_BUDGET_MS = 90_000
/** Root page + five documented camera paths, per open HTTP port. */
const DEFAULT_PATH_BUDGET = 6
const MAX_SNIFF_BYTES = 24 * 1024
const USER_AGENT = 'IPCrawlOpen-Sensor/1.0 (local network inventory; authorized use only)'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      () => { clearTimeout(timer); resolve(null) }
    )
  })
}

export async function tcpConnect(host: string, port: number, timeoutMs: number): Promise<number | null> {
  return withTimeout(new Promise<number | null>((resolve) => {
    const started = Date.now()
    const socket = net.connect({ host, port })
    const finish = (latency: number | null) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(latency)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(Date.now() - started))
    socket.once('timeout', () => finish(null))
    socket.once('error', () => finish(null))
  }), timeoutMs + 250)
}

interface RawHttpResult {
  status: number
  headers: Record<string, string>
  body: string
  sniff: number[]
  latencyMs: number
}

export function httpProbe(
  host: string,
  port: number,
  path: string,
  options: { scheme: 'http' | 'https', timeoutMs: number, maxBytes?: number }
): Promise<RawHttpResult | null> {
  const { scheme, timeoutMs } = options
  const maxBytes = options.maxBytes ?? MAX_SNIFF_BYTES
  const transport = scheme === 'https' ? https : http
  const defaultPort = (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80)
  const started = Date.now()

  return withTimeout(new Promise<RawHttpResult | null>((resolve) => {
    let settled = false
    const done = (value: RawHttpResult | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const request = transport.request({
      host,
      port,
      path,
      method: 'GET',
      agent: false,
      // Cameras overwhelmingly use self-signed certificates; we only read
      // public pages from them and never send data that matters.
      rejectUnauthorized: false,
      headers: {
        Host: defaultPort ? host : `${host}:${port}`,
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        Connection: 'close'
      },
      timeout: timeoutMs
    }, (response) => {
      const headers = normalizeHeaderMap(response.headers)
      const chunks: Buffer[] = []
      const sniff: number[] = []
      let size = 0

      const finish = () => {
        const buffer = Buffer.concat(chunks)
        done({
          status: response.statusCode ?? 0,
          headers,
          body: buffer.toString('utf8'),
          sniff,
          latencyMs: Date.now() - started
        })
        response.destroy()
      }

      response.on('data', (chunk: Buffer) => {
        if (size < maxBytes) {
          chunks.push(chunk)
          size += chunk.length
          for (const byte of chunk.subarray(0, Math.max(0, 16 - sniff.length))) sniff.push(byte)
        }
        // A streaming MJPEG body never ends; header + signature is enough.
        if (headers['content-type']?.startsWith('multipart/') || size >= maxBytes) finish()
      })
      response.once('end', finish)
      response.once('error', () => done(null))
    })

    request.once('timeout', () => {
      request.destroy()
      done(null)
    })
    request.once('error', () => done(null))
    request.end()
  }), timeoutMs + 500)
}

const RTSP_OPTIONS = (host: string, port: number) =>
  `OPTIONS rtsp://${host}:${port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: ${USER_AGENT}\r\n\r\n`

export async function rtspProbe(host: string, port: number, timeoutMs: number): Promise<RtspObservation | null> {
  return withTimeout(new Promise<RtspObservation | null>((resolve) => {
    const started = Date.now()
    const socket = net.connect({ host, port })
    let buffer = ''
    let settled = false

    const done = (value: RtspObservation | null) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => socket.write(RTSP_OPTIONS(host, port)))
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1')
      // Some devices answer OPTIONS with a ~80-byte reply; the header terminator
      // is the only signal we need. Cap the buffer so a chatty peer can't grow it.
      if (buffer.length > 8192) return done(null)
      if (!buffer.includes('\r\n\r\n')) return
      const statusLine = buffer.split('\r\n')[0] ?? ''
      const statusCode = Number(statusLine.split(' ')[1] ?? 0) || null
      const methodsLine = buffer.split(/\r\n/).find(line => /^public:/i.test(line))
      const methods = methodsLine
        ? methodsLine.replace(/^public:\s*/i, '').split(',').map(method => method.trim()).filter(Boolean)
        : []
      done({
        port,
        ok: /^RTSP\/1\.[0-9]\s+\d{3}/i.test(statusLine),
        methods,
        statusCode,
        latencyMs: Date.now() - started
      })
    })
    socket.once('timeout', () => done(null))
    socket.once('error', () => done(null))
  }), timeoutMs + 500)
}

async function probeHttpPort(
  host: string,
  port: number,
  scheme: 'http' | 'https',
  timeoutMs: number,
  pathBudget: number
): Promise<{ detection: Detection | null, cameraish: boolean }> {
  const observations: HttpObservation[] = []

  for (const candidate of probePaths(pathBudget)) {
    const raw = await httpProbe(host, port, candidate.path, { scheme, timeoutMs })
    if (!raw) continue

    const observation: HttpObservation = {
      port,
      scheme,
      path: candidate.path,
      status: raw.status,
      headers: raw.headers,
      body: raw.body.slice(0, 4096),
      latencyMs: raw.latencyMs
    }
    observations.push(observation)

    const kind = classifyResponse(observation, raw.sniff)
    if (kind === 'snapshot' || kind === 'mjpeg' || kind === 'hls' || kind === 'video') break

    // A 401/403 at the root is still useful evidence; keep it and stop.
    if ((raw.status === 401 || raw.status === 403) && candidate.path === '/') break
  }

  if (!observations.length) return { detection: null, cameraish: false }

  const { evidence, best, kind, metadata } = summarizeEvidence(observations, null, [port])
  if (!best) return { detection: null, cameraish: false }

  const resolvedKind = best.headers['content-type']?.startsWith('multipart/') ? 'mjpeg' : kind
  const cameraish = looksCameraish(best, resolvedKind)

  const detection: Detection = {
    host,
    port,
    protocol: scheme,
    kind: resolvedKind,
    url: detectionUrl(best, scheme, host, port),
    title: buildTitle(host, port, evidence),
    // Brand hints can come from the page even when the frame is what we store.
    vendorHints: vendorHints(metadata ?? best),
    evidence: {
      ...evidence,
      realm: evidence.realm ?? extractRealm(best.headers['www-authenticate'])
    },
    latencyMs: best.latencyMs
  }

  return { detection, cameraish }
}

export async function scanHost(
  host: string,
  ports: number[],
  options: { timeoutMs: number, pathBudget: number, includeUnknown: boolean }
): Promise<{ detections: Detection[], openPorts: number[] }> {
  const openPorts: number[] = []
  const detections: Detection[] = []

  // Connect first — cheap, and tells us where to spend HTTP requests.
  const connectResults = await Promise.all(
    ports.map(async port => ({ port, latency: await tcpConnect(host, port, options.timeoutMs) }))
  )

  for (const result of connectResults) {
    if (result.latency === null) continue
    openPorts.push(result.port)
  }

  const httpCandidates = openPorts
    .map(port => ({
      port,
      scheme: isHttpsPort(port) ? 'https' as const : isHttpPort(port) ? 'http' as const : null
    }))
    .filter((candidate): candidate is { port: number, scheme: 'http' | 'https' } => candidate.scheme !== null)

  for (const candidate of httpCandidates) {
    const { detection, cameraish } = await probeHttpPort(
      host,
      candidate.port,
      candidate.scheme,
      options.timeoutMs,
      options.pathBudget
    )
    if (!detection) continue
    if (cameraish || options.includeUnknown) detections.push(detection)
  }

  for (const port of openPorts.filter(isRtspPort)) {
    const rtsp = await rtspProbe(host, port, options.timeoutMs)
    if (!rtsp?.ok) continue

    const evidence = {
      openPorts,
      protocol: 'rtsp' as const,
      httpStatus: rtsp.statusCode,
      server: null,
      realm: null,
      title: null,
      rtspMethods: rtsp.methods.slice(0, 8),
      authRequired: rtsp.statusCode === 401,
      sourcePath: '/'
    }

    detections.push({
      host,
      port,
      protocol: 'rtsp',
      kind: 'unknown',
      url: detectionUrl(null, 'rtsp', host, port),
      title: `RTSP service at ${host}:${port}`,
      vendorHints: [],
      evidence,
      latencyMs: rtsp.latencyMs
    })
  }

  // Evidence tags are computed once, where we know every open port.
  for (const detection of detections) {
    detection.evidence.openPorts = [...openPorts]
    ;(detection as Detection & { tags?: string[] }).tags = evidenceTags(
      detection.evidence,
      detection.kind,
      detection.port,
      'scan'
    )
  }

  return { detections, openPorts }
}

/**
 * Run a scan over an already-authorized host list. Never expands targets here —
 * `assertAuthorizedTargets` must have run first.
 */
export async function scan(options: ScanOptions): Promise<ScanSummary> {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const concurrency = Math.max(1, Math.min(64, options.concurrency ?? DEFAULT_CONCURRENCY))
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
  // Defence in depth: the authorization gate returns whole blocks, including
  // network and broadcast addresses that can never host a camera.
  const hosts = options.targets.filter(isScannable)
  const ports = [...new Set(options.ports)].sort((a, b) => a - b)

  const detections: Detection[] = []
  let openPorts = 0
  let done = 0
  let cursor = 0
  let truncated = false

  async function worker() {
    while (cursor < hosts.length) {
      if (Date.now() > startedAt + budgetMs || options.signal?.aborted) {
        truncated = true
        return
      }
      const host = hosts[cursor++]!
      const result = await scanHost(host, ports, { timeoutMs, pathBudget: DEFAULT_PATH_BUDGET, includeUnknown: false })
      openPorts += result.openPorts.length
      for (const detection of result.detections) {
        detections.push(detection)
        options.onDetection?.(detection)
      }
      done += 1
      options.onProgress?.(done, hosts.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, () => worker()))

  return {
    hosts: hosts.length,
    ports: ports.length,
    attempts: done * ports.length,
    openPorts,
    detections: dedupeDetections(detections),
    durationMs: Date.now() - startedAt,
    truncated: truncated || done < hosts.length
  }
}

/** One detection per host:port, keeping the richest evidence. */
export function dedupeDetections(detections: Detection[]): Detection[] {
  const keep = new Map<string, Detection>()
  for (const detection of detections) {
    const key = `${detection.host}:${detection.port}`
    const existing = keep.get(key)
    if (!existing || score(detection) > score(existing)) keep.set(key, detection)
  }
  return [...keep.values()].sort((a, b) => a.host.localeCompare(b.host) || a.port - b.port)
}

function score(detection: Detection): number {
  if (detection.kind === 'mjpeg') return 5
  if (detection.kind === 'snapshot') return 4
  if (detection.kind === 'hls' || detection.kind === 'video') return 3
  if (detection.kind === 'page') return 2
  return 1
}
