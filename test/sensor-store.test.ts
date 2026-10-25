import { describe, expect, it } from 'vitest'
import { camId } from '~~/server/utils/camStore'
import { detectionToRow, hostAllowed, type IncomingDetection } from '~~/server/utils/sensorStore'
import { LOCAL_SOURCE_IDS, SOURCE_BY_ID, allowsPrivateHosts, isLocalSource } from '#shared/sources'

function detection(patch: Partial<IncomingDetection> = {}): IncomingDetection {
  return {
    host: '10.0.0.7',
    port: 8080,
    protocol: 'http',
    kind: 'snapshot',
    url: 'http://10.0.0.7:8080/snapshot.jpg',
    title: 'ACME IP Camera',
    vendorHints: ['boa'],
    evidence: {
      openPorts: [8080, 8554],
      protocol: 'http',
      httpStatus: 200,
      server: 'Boa/0.94',
      realm: null,
      title: 'ACME IP Camera',
      rtspMethods: ['OPTIONS', 'DESCRIBE'],
      authRequired: false,
      sourcePath: '/snapshot.jpg'
    },
    latencyMs: 12,
    tags: ['local-sensor', 'port:8080'],
    ...patch
  }
}

describe('source registry', () => {
  it('marks both local sources as local and nobody else', () => {
    expect([...LOCAL_SOURCE_IDS].sort()).toEqual(['import', 'sensor'])
    expect(isLocalSource('sensor')).toBe(true)
    expect(isLocalSource('import')).toBe(true)
    expect(isLocalSource('osm')).toBe(false)
    expect(isLocalSource('nope')).toBe(false)
  })

  it('only lets the sensor reach private addresses', () => {
    // The frame proxy's escape hatch must never apply to a public provider.
    expect(allowsPrivateHosts('sensor')).toBe(true)
    expect(allowsPrivateHosts('import')).toBe(false)
    expect(allowsPrivateHosts('osm')).toBe(false)
    expect(allowsPrivateHosts('curated')).toBe(false)
  })

  it('registers both local sources with a label and accent', () => {
    for (const id of LOCAL_SOURCE_IDS) {
      expect(SOURCE_BY_ID[id]).toMatchObject({ id, kind: 'local' })
      expect(SOURCE_BY_ID[id]!.label.length).toBeGreaterThan(0)
      expect(SOURCE_BY_ID[id]!.accent).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('hostAllowed', () => {
  it('accepts dotted quads, including private ones', () => {
    expect(hostAllowed('10.0.0.7')).toBe(true)
    expect(hostAllowed('192.168.1.20')).toBe(true)
    expect(hostAllowed('127.0.0.1')).toBe(true)
    expect(hostAllowed('203.0.113.9')).toBe(true)
  })

  it('refuses hostnames — they would be resolved by the frame proxy', () => {
    expect(hostAllowed('example.com')).toBe(false)
    expect(hostAllowed('localhost')).toBe(false)
    expect(hostAllowed('camera.local')).toBe(false)
    expect(hostAllowed('10.0.0')).toBe(false)
    expect(hostAllowed('10.0.0.1/24')).toBe(false)
    expect(hostAllowed('http://10.0.0.1')).toBe(false)
    expect(hostAllowed('::1')).toBe(false)
    expect(hostAllowed('')).toBe(false)
  })

  it('refuses the unspecified address', () => {
    expect(hostAllowed('0.0.0.0')).toBe(false)
  })

  it('never accepts a non-string', () => {
    expect(hostAllowed(42 as unknown as string)).toBe(false)
    expect(hostAllowed(undefined as unknown as string)).toBe(false)
  })
})

describe('detectionToRow', () => {
  it('builds a sensor row keyed the same way as the rest of the catalogue', () => {
    const row = detectionToRow(detection(), 'sensor')

    expect(row.id).toBe(camId('sensor', '10.0.0.7:8080'))
    expect(row).toMatchObject({
      source: 'sensor',
      externalId: '10.0.0.7:8080',
      host: '10.0.0.7',
      port: 8080,
      kind: 'snapshot',
      isDemo: false
    })
  })

  it('points image_url at the frame and page_url at page kinds only', () => {
    const frame = detectionToRow(detection(), 'sensor')
    expect(frame.imageUrl).toBe('http://10.0.0.7:8080/snapshot.jpg')
    expect(frame.pageUrl).toBeNull()

    const page = detectionToRow(detection({
      kind: 'page',
      url: 'http://10.0.0.7:8080/',
      evidence: { httpStatus: 200, authRequired: false }
    }), 'sensor')
    expect(page.imageUrl).toBeNull()
    expect(page.pageUrl).toBe('http://10.0.0.7:8080/')
  })

  it('keeps an rtsp stream as stream_url, not image_url', () => {
    const row = detectionToRow(detection({
      port: 554,
      protocol: 'rtsp',
      kind: 'unknown',
      url: 'rtsp://10.0.0.7:554/',
      evidence: { rtspMethods: ['DESCRIBE'], authRequired: false }
    }), 'sensor')
    expect(row.streamUrl).toBe('rtsp://10.0.0.7:554/')
    expect(row.imageUrl).toBeNull()
    expect(row.protocol).toBe('RTSP')
  })

  it('tags the origin and the port, capped at twelve', () => {
    const row = detectionToRow(detection({
      tags: Array.from({ length: 30 }, (_, i) => `tag:${i}`)
    }), 'sensor')
    expect(row.tags[0]).toBe('tag:0')
    expect(row.tags).toHaveLength(12)
  })

  it('adds the import tag for imported rows and no local-sensor tag', () => {
    const row = detectionToRow(detection({ tags: null }), 'import')
    expect(row.tags).toContain('imported-dataset')
    expect(row.tags).not.toContain('local-sensor')
    expect(row.source).toBe('import')
    expect(row.attribution).toMatch(/imported/i)
  })

  it('derives a vendor from the evidence when the hints are thin', () => {
    const row = detectionToRow(detection({
      vendorHints: [],
      evidence: { server: 'Hikvision-Webs', authRequired: false }
    }), 'sensor')
    expect(row.vendor).toBeTruthy()
  })

  it('drops unknown kinds and protocols instead of trusting them', () => {
    const row = detectionToRow(detection({ kind: '<script>', protocol: 'gopher' }), 'sensor')
    expect(row.kind).toBe('unknown')
    expect(row.scheme).toBe('http')
  })

  it('falls back to a generated title', () => {
    const row = detectionToRow(detection({ title: '' }), 'sensor')
    expect(row.title).toBe('Camera at 10.0.0.7:8080')
  })

  it('copies dataset context onto the row', () => {
    const row = detectionToRow(detection({
      context: { country: 'Italy', city: 'Turin', org: 'AS123', lat: 45.07, lon: 7.68 }
    }), 'import')
    expect(row).toMatchObject({ country: 'Italy', city: 'Turin', org: 'AS123', lat: 45.07, lon: 7.68 })
  })
})

describe('hostAllowed — non-unicast space', () => {
  it('refuses multicast, reserved and broadcast addresses', () => {
    // 169.254.169.254 is deliberately NOT listed here: it is unicast and the
    // frame proxy, not ingest, is the place that refuses to fetch it.
    expect(hostAllowed('224.0.0.1')).toBe(false)
    expect(hostAllowed('239.255.255.250')).toBe(false)
    expect(hostAllowed('240.0.0.1')).toBe(false)
    expect(hostAllowed('255.255.255.255')).toBe(false)
    expect(hostAllowed('0.0.0.0')).toBe(false)
    expect(hostAllowed('0.1.2.3')).toBe(false)
  })
})

describe('isSensorReachable', () => {
  it('admits the operator\'s own LAN and nothing else', async () => {
    const { isSensorReachable } = await import('~~/server/utils/probe')
    expect(isSensorReachable('192.168.1.42')).toBe(true)
    expect(isSensorReachable('10.0.0.7')).toBe(true)
    expect(isSensorReachable('172.16.0.9')).toBe(true)
    expect(isSensorReachable('172.15.0.9')).toBe(false)
    expect(isSensorReachable('127.0.0.1')).toBe(true)

    // Link-local is where cloud metadata lives; the frame proxy must not go there.
    expect(isSensorReachable('169.254.169.254')).toBe(false)
    expect(isSensorReachable('100.64.0.1')).toBe(false)
    expect(isSensorReachable('203.0.113.9')).toBe(false)
    expect(isSensorReachable('example.com')).toBe(false)
    expect(isSensorReachable('localhost')).toBe(false)
  })
})
