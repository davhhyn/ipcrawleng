import { describe, expect, it } from 'vitest'
import {
  clamp,
  formatCoord,
  formatDistance,
  formatLatLon,
  haversineKm,
  isValidLatLon,
  projectLat,
  projectLon,
  seededRandom,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from '#shared/geo'
import { countryCodeOf, countryFlag, countryNameOf, findCountry, normalizeCountryKey } from '#shared/countries'

describe('isValidLatLon', () => {
  it('accepts real coordinates', () => {
    expect(isValidLatLon(45.4642, 9.19)).toBe(true)
    expect(isValidLatLon(-90, -180)).toBe(true)
    expect(isValidLatLon(90, 180)).toBe(true)
    expect(isValidLatLon(0, 0)).toBe(true)
  })

  it('rejects out-of-range, missing and non-finite values', () => {
    expect(isValidLatLon(91, 0)).toBe(false)
    expect(isValidLatLon(0, 181)).toBe(false)
    expect(isValidLatLon(null, 10)).toBe(false)
    expect(isValidLatLon(Number.NaN, 0)).toBe(false)
    expect(isValidLatLon('45', '9')).toBe(false)
    expect(isValidLatLon(undefined, undefined)).toBe(false)
  })
})

describe('projection', () => {
  it('maps the world to the SVG canvas', () => {
    expect(projectLon(-180)).toBe(0)
    expect(projectLon(180)).toBe(WORLD_WIDTH)
    expect(projectLon(0)).toBeCloseTo(WORLD_WIDTH / 2, 5)
    expect(projectLat(90)).toBe(0)
    expect(projectLat(-90)).toBe(WORLD_HEIGHT)
  })

  it('clamps runaway inputs to the canvas', () => {
    expect(projectLon(-999)).toBe(0)
    expect(projectLon(999)).toBe(WORLD_WIDTH)
    expect(projectLat(999)).toBe(0)
    expect(projectLat(-999)).toBe(WORLD_HEIGHT)
  })
})

describe('formatting', () => {
  it('renders signed coordinates as compact degrees/minutes', () => {
    expect(formatCoord(45.4642, 'lat')).toBe('45°27′N')
    expect(formatCoord(-0.1278, 'lat')).toBe('0°07′S')
    expect(formatCoord(9.19, 'lon')).toBe('9°11′E')
    expect(formatCoord(-74.006, 'lon')).toBe('74°00′W')
    expect(formatCoord(0, 'lat')).toBe('0°00′N')
  })

  it('handles missing coordinates', () => {
    expect(formatLatLon(null, 9.19)).toBe('—')
    expect(formatLatLon(45.4642, null)).toBe('—')
    expect(formatLatLon(45.4642, 9.19)).toBe('45°27′N 9°11′E')
  })

  it('formats distances at human scales', () => {
    expect(formatDistance(0.4)).toMatch(/m$/)
    expect(formatDistance(12.34)).toMatch(/km$/)
    expect(formatDistance(1234)).toMatch(/km$/)
  })

  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
  })
})

describe('haversineKm', () => {
  it('measures well-known distances', () => {
    // Milan → Rome ≈ 477 km
    expect(haversineKm(45.4642, 9.19, 41.9028, 12.4964)).toBeGreaterThan(470)
    expect(haversineKm(45.4642, 9.19, 41.9028, 12.4964)).toBeLessThan(485)
    // Milan → Tokyo ≈ 9,700 km
    expect(haversineKm(45.4642, 9.19, 35.6762, 139.6503)).toBeGreaterThan(9000)
  })

  it('is zero for the same point', () => {
    expect(haversineKm(10, 10, 10, 10)).toBeCloseTo(0, 6)
  })
})

describe('seededRandom', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = seededRandom('interlaken')
    const b = seededRandom('interlaken')
    const values = Array.from({ length: 20 }, () => a())
    expect(values).toEqual(Array.from({ length: 20 }, () => b()))
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('differs between seeds', () => {
    const a = seededRandom('a')()
    const b = seededRandom('b')()
    expect(a).not.toBe(b)
  })
})

describe('countries', () => {
  it('resolves names, codes and aliases', () => {
    expect(countryCodeOf('Italy')).toBe('IT')
    expect(countryCodeOf('italy')).toBe('IT')
    expect(countryCodeOf('IT')).toBe('IT')
    expect(countryCodeOf('United Kingdom')).toBe('GB')
    expect(countryCodeOf('UK')).toBe('GB')
    expect(countryCodeOf('Helsinki')).toBeNull()
    expect(countryCodeOf(null)).toBeNull()
  })

  it('returns canonical display names', () => {
    expect(countryNameOf('it')).toBe('Italy')
    expect(countryNameOf('United States')).toBe('United States')
    // Unknown provider strings are preserved verbatim rather than thrown away.
    expect(countryNameOf('  Narnia ')).toBe('Narnia')
    expect(countryNameOf('')).toBeNull()
  })

  it('finds metadata by name or code', () => {
    const italy = findCountry('Italy')
    expect(italy?.code).toBe('IT')
    expect(italy?.lat).toBeGreaterThan(0)
    expect(normalizeCountryKey('  United   Kingdom ')).toBe('united kingdom')
    expect(findCountry('zz')).toBeNull()
  })

  it('renders flag emoji from the ISO code', () => {
    expect(countryFlag('IT')).toBe('🇮🇹')
    expect(countryFlag('gb')).toBe('🇬🇧')
    expect(countryFlag(null)).toBe('')
    expect(countryFlag('x')).toBe('')
  })
})
