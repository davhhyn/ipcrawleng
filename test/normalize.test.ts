import { describe, expect, it } from 'vitest'
import {
  dedupeCams,
  inferKind,
  normalizeCam,
  normalizeVendor,
  secureImageUrl,
  stableExternalId,
  type NormalizedCam
} from '~~/server/utils/ingest/normalize'
import type { RawCam } from '~~/server/utils/ingest/types'
import { SOURCE_BY_ID } from '#shared/sources'

const osmSource = SOURCE_BY_ID.osm!
const curatedSource = SOURCE_BY_ID.curated!

function raw(patch: Partial<RawCam> = {}): RawCam {
  return {
    source: 'osm',
    externalId: 'node/1',
    title: 'Test camera',
    imageUrl: 'https://example.com/cam.jpg',
    ...patch
  }
}

function setConfig(patch: Record<string, unknown>) {
  globalThis.__testConfig = { ...globalThis.__testConfig, ...patch }
}

describe('inferKind', () => {
  it.each([
    ['https://example.com/a.m3u8', 'hls'],
    ['https://example.com/live/playlist.m3u8?token=1', 'hls'],
    ['https://example.com/stream/index.m3u8', 'hls'],
    ['https://example.com/clip.mp4', 'video'],
    ['https://example.com/clip.webm', 'video'],
    ['https://example.com/cam.mjpg', 'mjpeg'],
    ['https://example.com/video.cgi', 'mjpeg'],
    ['https://example.com/snapshot.jpg', 'snapshot'],
    ['https://example.com/a/b/camera.jpeg?w=800', 'snapshot'],
    ['https://example.com/embed/player?id=3', 'iframe']
  ] as const)('maps %s → %s', (url, expected) => {
    expect(inferKind(null, url, null, null)).toBe(expected)
  })

  it('treats an HTML page as a page, not a frame', () => {
    expect(inferKind(null, null, null, 'https://example.com/city/webcam')).toBe('page')
  })

  it('prefers an explicit provider-declared kind', () => {
    expect(inferKind('mjpeg', 'https://example.com/look.jpg', null, null)).toBe('mjpeg')
  })

  it('ignores the unusable "unknown" declaration', () => {
    expect(inferKind('unknown', 'https://example.com/cam.jpg', null, null)).toBe('snapshot')
  })
})

describe('normalizeVendor', () => {
  it('canonicalises known camera brands regardless of casing', () => {
    expect(normalizeVendor('HIKVISION DS-2CD')).toBe('Hikvision')
    expect(normalizeVendor(null, 'Dahua Technology')).toBe('Dahua')
    expect(normalizeVendor('', 'TP-Link Tapo C200')).toBe('TP-Link')
    expect(normalizeVendor('vendor: Axis Communications')).toBe('Axis')
  })

  it('falls back to the trimmed provider value', () => {
    expect(normalizeVendor('  Some Local Authority  ')).toBe('Some Local Authority')
  })

  it('returns null when nothing is known', () => {
    expect(normalizeVendor(null, undefined, '   ')).toBeNull()
  })
})

describe('secureImageUrl', () => {
  it('upgrades plain http by default', () => {
    setConfig({ upgradeInsecureImages: 'true' })
    expect(secureImageUrl('http://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })

  it('leaves URLs alone when an operator has disabled the upgrade', () => {
    setConfig({ upgradeInsecureImages: 'false' })
    expect(secureImageUrl('http://127.0.0.1:8080/a.jpg')).toBe('http://127.0.0.1:8080/a.jpg')
  })

  it('never touches https or null', () => {
    expect(secureImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
    expect(secureImageUrl(null)).toBeNull()
  })
})

describe('normalizeCam', () => {
  it('builds the canonical catalogue row', () => {
    const { cam, skipped } = normalizeCam(raw({
      title: '  Piazza   Duomo\nLive  ',
      city: 'Milan',
      country: 'Italy',
      lat: 45.4642,
      lon: 9.19,
      tags: ['webcam', 'webcam', '  piazza ', ''],
      vendor: 'Hikvision'
    }), osmSource)

    expect(skipped).toBeNull()
    expect(cam).not.toBeNull()
    expect(cam!.title).toBe('Piazza Duomo Live')
    expect(cam!.countryCode).toBe('IT')
    expect(cam!.country).toBe('Italy')
    expect(cam!.kind).toBe('snapshot')
    expect(cam!.host).toBe('example.com')
    expect(cam!.port).toBe(443)
    expect(cam!.scheme).toBe('https')
    expect(cam!.tags).toEqual(['webcam', 'piazza'])
    expect(cam!.vendor).toBe('Hikvision')
    expect(cam!.license).toBe(osmSource.license)
  })

  it('rejects records with no usable URL', () => {
    expect(normalizeCam(raw({ imageUrl: null }), osmSource).skipped).toBe('missing-url')
  })

  it('rejects private hosts', () => {
    expect(normalizeCam(raw({ imageUrl: 'http://192.168.1.5/snap.jpg' }), osmSource).skipped).toBe('private-or-blocked-host')
    expect(normalizeCam(raw({ imageUrl: 'http://localhost:8080/snap.jpg' }), osmSource).skipped).toBe('private-or-blocked-host')
    expect(normalizeCam(raw({ imageUrl: 'http://169.254.169.254/latest/meta-data/' }), osmSource).skipped).toBe('private-or-blocked-host')
  })

  it('discards non-http schemes rather than passing them through', () => {
    expect(normalizeCam(raw({ imageUrl: 'ftp://example.com/snap.jpg' }), osmSource).skipped).toBe('missing-url')
    expect(normalizeCam(raw({ imageUrl: 'javascript:alert(1)' }), osmSource).skipped).toBe('missing-url')
    expect(normalizeCam(raw({ imageUrl: 'https://user:pass@example.com/snap.jpg' }), osmSource).skipped).toBe('missing-url')
  })

  it('never swallows coordinates it cannot place on the map', () => {
    const { cam } = normalizeCam(raw({ lat: 200, lon: 400 }), osmSource)
    expect(cam!.lat).toBeNull()
    expect(cam!.lon).toBeNull()
  })

  it('truncates untrusted text fields', () => {
    const { cam } = normalizeCam(raw({
      title: 'x'.repeat(500),
      tags: Array.from({ length: 40 }, (_, i) => `tag${i}`)
    }), osmSource)
    expect(cam!.title.length).toBe(140)
    expect(cam!.tags.length).toBe(12)
  })

  it('keeps demo rows even without a URL, always flagged', () => {
    const { cam } = normalizeCam(raw({ imageUrl: null, isDemo: true, source: 'curated' }), curatedSource)
    expect(cam).not.toBeNull()
    expect(cam!.isDemo).toBe(true)
  })

  it('respects the source blocklist', () => {
    setConfig({ blockedHosts: 'source:osm' })
    expect(normalizeCam(raw(), osmSource).skipped).toBe('source-blocked')
  })

  it('produces stable ids for the same source + external id', () => {
    const a = normalizeCam(raw(), osmSource).cam!.id
    const b = normalizeCam(raw(), osmSource).cam!.id
    const other = normalizeCam(raw({ externalId: 'node/2' }), osmSource).cam!.id
    expect(a).toBe(b)
    expect(a).not.toBe(other)
  })
})

describe('dedupeCams', () => {
  function make(source: string, key: string): NormalizedCam {
    return {
      id: `${source}-${key}`,
      dedupeKey: key,
      source
    } as unknown as NormalizedCam
  }

  it('keeps the most authoritative source for the same stream', () => {
    const { cams, dropped } = dedupeCams([
      make('osm', 'same'),
      make('tfl', 'same'),
      make('curated', 'same')
    ])
    expect(dropped).toBe(2)
    expect(cams).toHaveLength(1)
    expect(cams[0]!.source).toBe('curated')
  })

  it('keeps distinct streams apart', () => {
    const { cams, dropped } = dedupeCams([make('osm', 'a'), make('osm', 'b')])
    expect(cams).toHaveLength(2)
    expect(dropped).toBe(0)
  })
})

describe('stableExternalId', () => {
  it('is deterministic and bounded in length', () => {
    const id = stableExternalId('tfl', 'Camera One', 51.5, -0.12)
    expect(id).toHaveLength(24)
    expect(stableExternalId('tfl', 'Camera One', 51.5, -0.12)).toBe(id)
    expect(stableExternalId('tfl', 'Camera Two', 51.5, -0.12)).not.toBe(id)
  })
})
