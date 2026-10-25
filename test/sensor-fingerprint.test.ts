import { describe, expect, it } from 'vitest'
import {
  buildTitle,
  classifyResponse,
  detectionUrl,
  evidenceTags,
  extractRealm,
  extractTitle,
  isHttpPort,
  isHttpsPort,
  isRtspPort,
  looksCameraish,
  probePaths,
  summarizeEvidence,
  normalizeHeaderMap,
  vendorHints,
  type HttpObservation
} from '../sensor/fingerprint.ts'
import { parseCsv, parseDataset } from '../sensor/import.ts'
import { DEFAULT_PORTS, parsePortList } from '../sensor/ports.ts'

const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const PNG = [0x89, 0x50, 0x4e, 0x47]

function observation(patch: Partial<HttpObservation> = {}): HttpObservation {
  return {
    port: 80,
    scheme: 'http',
    path: '/',
    status: 200,
    headers: {},
    body: '',
    latencyMs: 12,
    ...patch
  }
}

describe('extractTitle', () => {
  it('pulls and decodes the title', () => {
    expect(extractTitle('<html><head><title>IP Camera</title></head></html>')).toBe('IP Camera')
    expect(extractTitle('<title>Cam &amp; Co</title>')).toBe('Cam & Co')
    expect(extractTitle('<title> spaced   out </title>')).toBe('spaced out')
  })

  it('returns null when there is none', () => {
    expect(extractTitle('<html></html>')).toBeNull()
    expect(extractTitle('')).toBeNull()
  })
})

describe('extractRealm', () => {
  it('reads the realm from a Basic challenge', () => {
    expect(extractRealm('Basic realm="IP Camera"')).toBe('IP Camera')
    expect(extractRealm('Basic realm=AxisCam')).toBe('AxisCam')
  })

  it('returns null otherwise', () => {
    expect(extractRealm('Bearer')).toBeNull()
    expect(extractRealm(null)).toBeNull()
  })
})

describe('classifyResponse', () => {
  it('recognises streams and stills by content type', () => {
    expect(classifyResponse(observation({ headers: { 'content-type': 'multipart/x-mixed-replace; boundary=--myboundary' } }), [])).toBe('mjpeg')
    expect(classifyResponse(observation({ headers: { 'content-type': 'image/jpeg' } }), JPEG)).toBe('snapshot')
    expect(classifyResponse(observation({ headers: { 'content-type': 'video/mp4' } }), [])).toBe('video')
    expect(classifyResponse(observation({ headers: { 'content-type': 'application/vnd.apple.mpegurl' } }), [])).toBe('hls')
  })

  it('falls back to magic bytes when the type lies', () => {
    expect(classifyResponse(observation({ headers: { 'content-type': 'application/octet-stream' } }), JPEG)).toBe('snapshot')
    expect(classifyResponse(observation({ headers: { 'content-type': 'application/octet-stream' } }), PNG)).toBe('snapshot')
  })

  it('treats an HTML root as a page', () => {
    expect(classifyResponse(observation({
      headers: { 'content-type': 'text/html' },
      body: '<html><title>Router</title></html>'
    }), [])).toBe('page')
  })

  it('does not guess a kind for auth challenges', () => {
    expect(classifyResponse(observation({ status: 401, headers: { 'www-authenticate': 'Basic realm="Cam"' } }), [])).toBe('unknown')
  })
})

describe('normalizeHeaderMap', () => {
  it('handles the plain object Node gives http.request', () => {
    // Regression: IncomingHttpHeaders has no forEach, which used to crash the
    // whole scan the first time a camera answered.
    expect(normalizeHeaderMap({ 'Content-Type': 'image/jpeg', server: 'Boa' }))
      .toEqual({ 'content-type': 'image/jpeg', server: 'Boa' })
  })

  it('joins repeated headers and drops empty ones', () => {
    expect(normalizeHeaderMap({ 'set-cookie': ['a=1', 'b=2'], 'x-empty': undefined }))
      .toEqual({ 'set-cookie': 'a=1, b=2' })
  })

  it('handles a Headers instance and a missing value', () => {
    const headers = new Headers({ 'X-Test': 'yes' })
    expect(normalizeHeaderMap(headers)).toEqual({ 'x-test': 'yes' })
    expect(normalizeHeaderMap(undefined)).toEqual({})
    expect(normalizeHeaderMap(null)).toEqual({})
  })
})

describe('looksCameraish', () => {
  it('accepts frames immediately', () => {
    expect(looksCameraish(observation(), 'snapshot')).toBe(true)
    expect(looksCameraish(observation(), 'mjpeg')).toBe(true)
  })

  it('accepts auth challenges — cameras usually gate their frames', () => {
    expect(looksCameraish(observation({ status: 401 }), 'unknown')).toBe(true)
  })

  it('uses page text as a hint', () => {
    expect(looksCameraish(observation({ body: '<title>DVR Login</title>' }), 'page')).toBe(true)
    expect(looksCameraish(observation({ body: '<title>Print server</title>' }), 'page')).toBe(false)
  })
})

describe('vendorHints', () => {
  it('collects known brands from headers and body', () => {
    const hints = vendorHints(observation({
      headers: { server: 'Hikvision-Webs' },
      body: '<title>Dahua NVR</title>'
    }))
    expect(hints).toContain('hikvision')
    expect(hints).toContain('dahua')
  })

  it('keeps the raw server string', () => {
    const hints = vendorHints(observation({ headers: { server: 'Boa/0.94.14rc21' } }))
    expect(hints.some(hint => hint.includes('Boa/0.94'))).toBe(true)
  })
})

describe('summarizeEvidence', () => {
  it('prefers a frame over a page regardless of probe order', () => {
    const page = observation({ path: '/', status: 200, headers: { 'content-type': 'text/html' }, body: '<title>Cam</title>' })
    const frame = observation({ port: 8080, scheme: 'http', path: '/snapshot.jpg', headers: { 'content-type': 'image/jpeg' } })
    const { best, kind, evidence } = summarizeEvidence([page, frame], null, [80, 8080])
    expect(best?.path).toBe('/snapshot.jpg')
    expect(kind).toBe('snapshot')
    expect(evidence.openPorts).toEqual([80, 8080])
  })

  it('takes the frame as best while the page supplies title and server', () => {
    const page = observation({
      path: '/',
      headers: { server: 'Boa/0.94', 'content-type': 'text/html' },
      body: '<title>ACME IP Camera</title>'
    })
    const frame = observation({ path: '/snapshot.jpg', headers: { 'content-type': 'image/jpeg' } })

    const { best, kind, evidence } = summarizeEvidence([page, frame], null, [8080])
    expect(best?.path).toBe('/snapshot.jpg')
    expect(kind).toBe('snapshot')
    expect(evidence.title).toBe('ACME IP Camera')
    expect(evidence.server).toBe('Boa/0.94')
    expect(evidence.sourcePath).toBe('/snapshot.jpg')
  })

  it('records an auth challenge as evidence without inventing a frame', () => {
    const challenge = observation({ status: 401, headers: { 'www-authenticate': 'Basic realm="IP Camera"' } })
    const { kind, evidence } = summarizeEvidence([challenge], null, [80])
    expect(kind).toBe('unknown')
    expect(evidence.authRequired).toBe(true)
    expect(evidence.realm).toBe('IP Camera')
  })

  it('describes an RTSP service', () => {
    const { evidence } = summarizeEvidence([], {
      port: 554, ok: true, methods: ['OPTIONS', 'DESCRIBE', 'PLAY', 'SETUP'], statusCode: 200, latencyMs: 8
    }, [554])
    expect(evidence.rtspMethods).toContain('DESCRIBE')
    expect(evidence.protocol).toBe('rtsp')
  })
})

describe('buildTitle', () => {
  it('prefers a real title, then realm, then server', () => {
    expect(buildTitle('10.0.0.5', 80, {
      openPorts: [80], protocol: 'http', httpStatus: 200, server: 'Boa', realm: 'Cam',
      title: 'Front Door', rtspMethods: null, authRequired: false, sourcePath: '/'
    })).toBe('Front Door')

    expect(buildTitle('10.0.0.5', 80, {
      openPorts: [80], protocol: 'http', httpStatus: 401, server: 'Boa', realm: 'IP Camera',
      title: null, rtspMethods: null, authRequired: true, sourcePath: '/'
    })).toBe('IP Camera')

    expect(buildTitle('10.0.0.5', 80, {
      openPorts: [80], protocol: null, httpStatus: null, server: null, realm: null,
      title: null, rtspMethods: null, authRequired: false, sourcePath: null
    })).toBe('Camera at 10.0.0.5:80')
  })
})

describe('detectionUrl', () => {
  it('omits default ports and keeps explicit ones', () => {
    expect(detectionUrl(observation({ path: '/snapshot.jpg' }), 'http', '10.0.0.5', 80))
      .toBe('http://10.0.0.5/snapshot.jpg')
    expect(detectionUrl(observation({ path: '/snapshot.jpg' }), 'http', '10.0.0.5', 8080))
      .toBe('http://10.0.0.5:8080/snapshot.jpg')
    expect(detectionUrl(observation({ scheme: 'https', path: '/' }), 'https', '10.0.0.5', 443))
      .toBe('https://10.0.0.5/')
  })

  it('builds an RTSP url', () => {
    expect(detectionUrl(null, 'rtsp', '10.0.0.5', 554)).toBe('rtsp://10.0.0.5:554/')
  })
})

describe('evidenceTags', () => {
  it('publishes factual evidence only', () => {
    const tags = evidenceTags({
      openPorts: [80, 554], protocol: 'http', httpStatus: 401, server: 'Boa',
      realm: 'IP Camera', title: 'Cam', rtspMethods: null, authRequired: true, sourcePath: '/'
    }, 'unknown', 80, 'scan')

    expect(tags).toContain('local-sensor')
    expect(tags).toContain('auth-required')
    expect(tags).toContain('port:80')
    expect(tags).toContain('realm:ip camera')
    // Tags are capped so a chatty banner can't bloat the row.
    expect(tags.length).toBeLessThanOrEqual(12)
  })

  it('marks imports distinctly', () => {
    expect(evidenceTags({
      openPorts: [80], protocol: 'http', httpStatus: 200, server: null,
      realm: null, title: null, rtspMethods: null, authRequired: false, sourcePath: null
    }, 'page', 80, 'import')).toContain('imported-dataset')
  })
})

describe('port helpers', () => {
  it('classifies well-known camera ports', () => {
    expect(isHttpPort(80)).toBe(true)
    expect(isHttpPort(8080)).toBe(true)
    expect(isHttpsPort(443)).toBe(true)
    expect(isRtspPort(554)).toBe(true)
    expect(isRtspPort(8554)).toBe(true)
    expect(isHttpPort(554)).toBe(false)
  })

  it('validates and caps port lists', () => {
    expect(parsePortList('554,80')).toEqual([80, 554])
    expect(parsePortList('80 80 443')).toEqual([80, 443])
    expect(() => parsePortList('0')).toThrow()
    expect(() => parsePortList('70000')).toThrow()
    expect(() => parsePortList('abc')).toThrow()
    expect(() => parsePortList(Array.from({ length: 40 }, (_, i) => 1000 + i).join(','))).toThrow(/limit/)
  })

  it('ships a small default list', () => {
    expect(DEFAULT_PORTS.length).toBeLessThanOrEqual(12)
    expect(DEFAULT_PORTS).toContain(554)
    expect(DEFAULT_PORTS).toContain(80)
  })

  it('probes the root first, then camera paths', () => {
    const paths = probePaths(5)
    expect(paths).toHaveLength(5)
    expect(paths[0]?.path).toBe('/')
  })
})

describe('parseCsv', () => {
  it('handles quotes and embedded commas', () => {
    const rows = parseCsv('ip,port,title\n10.0.0.1,80,"Front, Door"\n10.0.0.2,554,Cam\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ ip: '10.0.0.1', port: '80', title: 'Front, Door' })
  })

  it('handles escaped quotes', () => {
    const rows = parseCsv('ip,title\n10.0.0.1,"He said ""hi"""\n')
    expect(rows[0]?.title).toBe('He said "hi"')
  })
})

describe('parseDataset', () => {
  it('reads JSONL with Shodan-style field names', () => {
    const input = [
      JSON.stringify({ ip_str: '203.0.113.9', port: 554, product: 'Hikvision RTSP', location: { country_name: 'Italy', city: 'Turin', latitude: 45.07, longitude: 7.68 } }),
      JSON.stringify({ ip_str: '203.0.113.10', port: 80, http: { title: 'IP Camera', server: 'Boa' } })
    ].join('\n')

    const summary = parseDataset(input, 'jsonl')
    expect(summary.format).toBe('jsonl')
    expect(summary.kept).toBe(2)
    expect(summary.detections[0]).toMatchObject({ host: '203.0.113.9', port: 554, kind: 'unknown' })
    expect(summary.detections[1]?.kind).toBe('page')
    expect(summary.detections[0]?.context).toMatchObject({ country: 'Italy', city: 'Turin', lat: 45.07 })
  })

  it('reads a JSON array and an object with a results key', () => {
    const array = parseDataset(JSON.stringify([{ ip: '10.0.0.1', port: 80 }]))
    expect(array.kept).toBe(1)

    const wrapped = parseDataset(JSON.stringify({ results: [{ host: '10.0.0.2', ports: [554] }] }))
    expect(wrapped.kept).toBe(1)
    expect(wrapped.detections[0]?.port).toBe(554)
  })

  it('reads CSV', () => {
    const summary = parseDataset('ip,port,title\n10.0.0.7,8080,"Driveway"\n', 'auto')
    expect(summary.format).toBe('csv')
    expect(summary.kept).toBe(1)
    expect(summary.detections[0]).toMatchObject({ host: '10.0.0.7', port: 8080, title: 'Driveway' })
  })

  it('skips records it cannot trust, with reasons', () => {
    const input = [
      JSON.stringify({ port: 80 }),                       // no host
      JSON.stringify({ ip: 'example.com', port: 80 }),    // not an IP
      JSON.stringify({ ip: '10.0.0.1', port: 99999 }),    // bad port
      JSON.stringify({ ip: '10.0.0.2', port: 80 })        // good
    ].join('\n')

    const summary = parseDataset(input, 'jsonl')
    expect(summary.kept).toBe(1)
    expect(summary.skipped).toBe(3)
    expect(summary.reasons['not an IPv4 address']).toBe(1)
  })

  it('dedupes host:port pairs', () => {
    const input = [
      JSON.stringify({ ip: '10.0.0.1', port: 80 }),
      JSON.stringify({ ip: '10.0.0.1', port: 80, title: 'dupe' })
    ].join('\n')
    const summary = parseDataset(input, 'jsonl')
    expect(summary.kept).toBe(1)
    expect(summary.reasons.duplicate).toBe(1)
  })

  it('reports unparseable input instead of throwing raw', () => {
    expect(() => parseDataset('{not json', 'json')).toThrow(/could not parse/i)
  })

  it('caps how much it will ingest', () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify({ ip: `10.0.0.${i + 10}`, port: 80 })).join('\n')
    const summary = parseDataset(input, 'jsonl', 5)
    expect(summary.kept).toBe(5)
    expect(summary.skipped).toBe(15)
  })
})
