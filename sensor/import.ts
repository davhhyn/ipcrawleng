/**
 * Import a scan dataset you already have.
 *
 * This is the honest way to get Shodan-like *coverage* without scanning the
 * internet: take an export you are licensed to hold (Shodan JSON export, a
 * Censys result set, Rapid7 Open Data, an internal asset inventory) and index
 * it locally. No network calls, no query leaves the machine.
 *
 * The parser is forgiving about field names because every dataset spells them
 * differently, and it never invents fields it did not see.
 */

import type { Detection, DetectionKind } from './types.ts'
import { classifyAddress, isIpv4 } from './cidr.ts'
import { buildTitle, evidenceTags, extractRealm } from './fingerprint.ts'

export type DatasetFormat = 'jsonl' | 'json' | 'csv' | 'auto'

export interface ImportSummary {
  parsed: number
  kept: number
  skipped: number
  reasons: Record<string, number>
  detections: Detection[]
  format: DatasetFormat
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key]
    const nested = key.split('.').reduce<unknown>((value, part) => (
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
    ), record)
    if (nested !== undefined && nested !== null && nested !== '') return nested
  }
  return undefined
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function kindFromRecord(record: Record<string, unknown>, port: number): DetectionKind {
  const declared = (asString(pick(record, ['kind', 'type', 'stream', 'service'])) ?? '').toLowerCase()
  if (declared.includes('mjpeg') || declared.includes('mjpg')) return 'mjpeg'
  if (declared.includes('snapshot') || declared.includes('jpg') || declared.includes('jpeg')) return 'snapshot'
  if (declared.includes('hls') || declared.includes('m3u8')) return 'hls'
  if (declared.includes('rtsp')) return 'unknown'
  if (declared.includes('video')) return 'video'
  if (port === 554 || port === 8554) return 'unknown'
  if (port === 80 || port === 443 || port === 8080) return 'page'
  return 'unknown'
}

/** Map one dataset record → detection, or explain why not. */
export function detectionFromRecord(record: Record<string, unknown>): {
  detection: Detection | null
  reason: string | null
} {
  const host = asString(pick(record, ['ip', 'ip_str', 'host', 'address', 'addr', 'ipv4', 'target']))
  if (!host) return { detection: null, reason: 'no host field' }
  if (!isIpv4(host)) return { detection: null, reason: 'not an IPv4 address' }

  const portValue = pick(record, ['port', 'ports'])
  const port = Array.isArray(portValue) ? asNumber(portValue[0]) : asNumber(portValue)
  if (port === null) return { detection: null, reason: 'no port field' }
  if (port < 1 || port > 65535) return { detection: null, reason: 'port out of range' }

  const server = asString(pick(record, ['http.server', 'server', 'headers.server']))
  const title = asString(pick(record, ['http.title', 'title', 'html_title']))
  const product = asString(pick(record, ['product', 'http.title', 'device', 'cpe']))
  const authHeader = asString(pick(record, ['http.www_authenticate', 'www_authenticate', 'auth']))
  const body = asString(pick(record, ['data', 'http.html', 'html', 'banner']))
  const country = asString(pick(record, ['location.country_name', 'country_name', 'country']))
  const city = asString(pick(record, ['location.city', 'city']))
  const org = asString(pick(record, ['org', 'isp', 'asn', 'organization']))
  const lat = asNumber(pick(record, ['location.latitude', 'latitude', 'lat']))
  const lon = asNumber(pick(record, ['location.longitude', 'longitude', 'lon', 'lng']))

  const evidence = {
    openPorts: [port],
    protocol: (port === 554 || port === 8554 ? 'rtsp' : 'http') as 'rtsp' | 'http',
    httpStatus: null,
    server: server ? server.slice(0, 60) : null,
    // Datasets store the raw `Basic realm="..."` challenge, not just the realm.
    realm: extractRealm(authHeader) ?? (authHeader ? authHeader.slice(0, 60) : null),
    title: title ? title.slice(0, 80) : null,
    rtspMethods: null,
    authRequired: Boolean(authHeader),
    sourcePath: null
  }

  const detection: Detection = {
    host,
    port,
    protocol: evidence.protocol,
    kind: kindFromRecord(record, port),
    url: null,
    title: buildTitle(host, port, evidence),
    vendorHints: [product, server].filter((value): value is string => Boolean(value)).slice(0, 4),
    evidence,
    latencyMs: 0
  }

  // Keep the extra context on the detection for the store to publish.
  ;(detection as Detection & {
    context?: { country: string | null, city: string | null, org: string | null, lat: number | null, lon: number | null, body: string | null }
  }).context = {
    country,
    city,
    org,
    lat,
    lon,
    body: body ? body.slice(0, 400) : null
  }
  ;(detection as Detection & { tags?: string[] }).tags = evidenceTags(evidence, detection.kind, port, 'import')

  return { detection, reason: null }
}

/** Minimal CSV reader: quoted fields, embedded commas, CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\r') continue
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += char
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  const [header, ...body] = rows
  if (!header) return []
  return body
    .filter(values => values.some(value => value.length))
    .map(values => Object.fromEntries(header.map((key, index) => [key.trim(), values[index] ?? ''])))
}

export function detectFormat(text: string): DatasetFormat {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    // A single-line '{' could be JSONL; look for a newline-delimited second object.
    if (trimmed.startsWith('{') && /\}\s*\n\s*\{/.test(trimmed)) return 'jsonl'
    return 'json'
  }
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (firstLine.includes(',') && /ip|host|port/i.test(firstLine)) return 'csv'
  return 'jsonl'
}

export function parseDataset(input: string, format: DatasetFormat = 'auto', limit = 5000): ImportSummary {
  const resolved = format === 'auto' ? detectFormat(input) : format
  let records: Record<string, unknown>[] = []

  try {
    if (resolved === 'json') {
      const parsed = JSON.parse(input) as unknown
      const array = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>).data ?? (parsed as Record<string, unknown>).matches ?? (parsed as Record<string, unknown>).results
            : null)
      records = Array.isArray(array) ? array as Record<string, unknown>[] : []
    } else if (resolved === 'csv') {
      records = parseCsv(input)
    } else {
      records = input
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith('{'))
        .map((line) => {
          try { return JSON.parse(line) as Record<string, unknown> } catch { return null }
        })
        .filter((record): record is Record<string, unknown> => record !== null)
    }
  } catch (error) {
    throw new Error(`Could not parse dataset as ${resolved}: ${(error as Error).message}`)
  }

  const reasons: Record<string, number> = {}
  const detections: Detection[] = []
  const seen = new Set<string>()
  let parsed = 0
  let skipped = 0

  for (const record of records) {
    if (parsed >= limit) { skipped += 1; continue }
    parsed += 1
    const { detection, reason } = detectionFromRecord(record)
    if (!detection) {
      skipped += 1
      reasons[reason ?? 'unknown'] = (reasons[reason ?? 'unknown'] ?? 0) + 1
      continue
    }
    const key = `${detection.host}:${detection.port}`
    if (seen.has(key)) { skipped += 1; reasons.duplicate = (reasons.duplicate ?? 0) + 1; continue }
    seen.add(key)
    detections.push(detection)
  }

  return { parsed, kept: detections.length, skipped, reasons, detections, format: resolved }
}

/** Convenience: how many imported addresses are public vs private. */
export function summarizeAddressSpace(detections: Detection[]): { public: number, private: number } {
  let publicCount = 0
  let privateCount = 0
  for (const detection of detections) {
    if (classifyAddress(detection.host) === 'public') publicCount += 1
    else privateCount += 1
  }
  return { public: publicCount, private: privateCount }
}
