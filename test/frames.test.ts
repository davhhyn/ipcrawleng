import { describe, expect, it } from 'vitest'
import { looksLikeCamId, parseImageIdParam } from '~~/server/utils/imageParams'
import { renderSyntheticFrame, syntheticFrameEtag } from '~~/server/utils/syntheticFrame'

const base = {
  id: 'ab12cd34ef56',
  title: 'Rialto Bridge',
  city: 'Venice',
  country: 'Italy',
  countryCode: 'IT',
  region: 'Veneto',
  source: 'curated',
  kind: 'page',
  lat: 45.438,
  lon: 12.335,
  isDemo: true,
  reason: 'seed' as const
}

describe('image route params', () => {
  it('strips a cosmetic image extension', () => {
    expect(parseImageIdParam('ab12cd34ef56.jpg')).toBe('ab12cd34ef56')
    expect(parseImageIdParam('ab12cd34ef56.png')).toBe('ab12cd34ef56')
    expect(parseImageIdParam('ab12cd34ef56')).toBe('ab12cd34ef56')
  })

  it('takes the first value when the param repeats', () => {
    expect(parseImageIdParam(['aaa111', 'bbb222'])).toBe('aaa111')
  })

  it('copes with junk', () => {
    expect(parseImageIdParam(undefined)).toBe('')
    expect(parseImageIdParam(null)).toBe('')
    expect(parseImageIdParam(42)).toBe('')
  })

  it('recognises catalogue ids only', () => {
    expect(looksLikeCamId('ab12cd34ef56')).toBe(true)
    expect(looksLikeCamId('AB12CD34')).toBe(true)
    expect(looksLikeCamId('../../etc/passwd')).toBe(false)
    expect(looksLikeCamId('<script>')).toBe(false)
    expect(looksLikeCamId('')).toBe(false)
  })
})

describe('synthetic frames', () => {
  it('renders a self-contained SVG document', () => {
    const svg = renderSyntheticFrame(base)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('viewBox="0 0 1200 675"')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('is deterministic for the same camera', () => {
    expect(renderSyntheticFrame(base)).toBe(renderSyntheticFrame(base))
  })

  it('varies the scene between cameras', () => {
    const a = renderSyntheticFrame(base)
    const b = renderSyntheticFrame({ ...base, id: 'ff00ff00ff00', title: 'Shibuya Crossing', city: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.659, lon: 139.7 })
    expect(a).not.toBe(b)
  })

  it('always labels itself as generated, never as live', () => {
    const svg = renderSyntheticFrame(base)
    expect(svg).toContain('FRAME NOT LIVE')
    expect(svg).toContain('ILLUSTRATIVE')
  })

  it('labels seeded rows as SEED FEED', () => {
    expect(renderSyntheticFrame(base)).toContain('SEED FEED')
  })

  it('marks offline/failed cameras with their reason', () => {
    expect(renderSyntheticFrame({ ...base, isDemo: false, reason: 'offline' })).toContain('UPSTREAM OFFLINE')
    expect(renderSyntheticFrame({ ...base, isDemo: false, reason: 'unavailable' })).toContain('FEED UNAVAILABLE')
    expect(renderSyntheticFrame({ ...base, isDemo: false, reason: 'page' })).toContain('PAGE ONLY')
  })

  it('escapes untrusted titles and place names', () => {
    const svg = renderSyntheticFrame({
      ...base,
      title: '<script>alert("x")</script>',
      city: 'A & B <c>',
      country: '"><svg onload=alert(1)>'
    })
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('onload=alert')
    // Text is uppercased before escaping, so entities stay valid lowercase XML.
    expect(svg).toContain('&lt;SCRIPT&gt;')
    expect(svg).toContain('A &amp; B &lt;C&gt;')
    expect(svg).not.toContain('&AMP;')
  })

  it('tolerates a camera with no location at all', () => {
    const svg = renderSyntheticFrame({ ...base, city: null, country: null, countryCode: null, region: null, lat: null, lon: null })
    expect(svg).toContain('</svg>')
  })

  it('exposes a stable ETag that changes with the scene inputs', () => {
    const etag = syntheticFrameEtag(base)
    expect(etag).toBe(syntheticFrameEtag({ ...base }))
    expect(etag).not.toBe(syntheticFrameEtag({ ...base, title: 'Something else' }))
    expect(etag).toMatch(/^"[a-z0-9-]+"$/)
  })
})
