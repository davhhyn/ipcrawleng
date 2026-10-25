import { WORLD_HEIGHT, WORLD_WIDTH, projectLat, projectLon } from './worldGeo'

export { WORLD_HEIGHT, WORLD_WIDTH, projectLat, projectLon }

const EARTH_KM = 6371.0088

/** Great-circle distance in kilometres. */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLon = (bLon - aLon) * toRad
  const lat1 = aLat * toRad
  const lat2 = bLat * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  if (km < 1000) return `${Math.round(km)} km`
  return `${(km / 1000).toFixed(1)}k km`
}

/** Format decimal degrees as a compact DMS-ish coordinate. */
export function formatCoord(value: number, axis: 'lat' | 'lon'): string {
  const hemisphere = axis === 'lat'
    ? (value >= 0 ? 'N' : 'S')
    : (value >= 0 ? 'E' : 'W')
  const abs = Math.abs(value)
  const degrees = Math.floor(abs)
  const minutes = Math.floor((abs - degrees) * 60)
  return `${degrees}°${String(minutes).padStart(2, '0')}′${hemisphere}`
}

export function formatLatLon(lat: number | null, lon: number | null): string {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '—'
  return `${formatCoord(lat, 'lat')} ${formatCoord(lon, 'lon')}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isValidLatLon(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lon === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lon)
    && Math.abs(lat) <= 90
    && Math.abs(lon) <= 180
}

/** Deterministic 32-bit hash used for stable synthetic frames and grouping. */
export function hash32(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Mulberry32 PRNG seeded by a string — stable across renders and processes. */
export function seededRandom(seed: string): () => number {
  let a = hash32(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
