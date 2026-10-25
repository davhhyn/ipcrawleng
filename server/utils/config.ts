import { isLocalSource, SOURCE_BY_ID, SOURCES } from '#shared/sources'

export function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export function parseNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function configuredSourceIds(): string[] {
  const config = useRuntimeConfig()
  const raw = String(config.syncSources || '')
  const ids = raw
    .split(',')
    .map(value => value.trim().toLowerCase())
    // Local sources are never scheduled — they only run when an operator does.
    .filter(value => Boolean(SOURCE_BY_ID[value]) && !isLocalSource(value))
  return [...new Set(ids)]
}

export function isSourceConfigured(id: string): boolean {
  const config = useRuntimeConfig()
  if (id === 'windy') return Boolean(String(config.windyApiKey || '').trim())
  return true
}

export function isSourceEnabled(id: string): boolean {
  return configuredSourceIds().includes(id) && isSourceConfigured(id)
}

export function missingSourceKey(id: string): boolean {
  return configuredSourceIds().includes(id) && !isSourceConfigured(id)
}

export function probeEnabled(): boolean {
  return parseBoolean(useRuntimeConfig().enableLiveProbe, true)
}

export function probeTimeoutMs(): number {
  return parseNumber(useRuntimeConfig().liveProbeTimeoutMs, 4000)
}

export function probeBudgetMs(): number {
  return parseNumber(useRuntimeConfig().liveProbeBudgetMs, 45_000)
}

export function maxIngestPerSource(): number {
  return Math.min(5000, parseNumber(useRuntimeConfig().maxIngestPerSource, 600))
}

export function seedDemo(): boolean {
  return parseBoolean(useRuntimeConfig().seedDemo, true)
}

export function publicSyncAllowed(): boolean {
  if (import.meta.dev) return true
  return parseBoolean(process.env.NUXT_ALLOW_PUBLIC_SYNC, false)
}

export function blockedHosts(): string[] {
  const raw = String(useRuntimeConfig().blockedHosts || '')
  return raw
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

/** Allow the frame proxy to reach cameras on private addresses (sensor rows). */
export function sensorFetchLocal(): boolean {
  return parseBoolean(useRuntimeConfig().sensorFetchLocal, true)
}

/** Allow the local sensor CLI to POST findings into the catalogue. */
export function sensorIngestEnabled(): boolean {
  return parseBoolean(useRuntimeConfig().sensorIngest, true)
}

/** Test-only: relaxes the private-host guard (fixture server, local mirrors). */
export function allowPrivateHosts(): boolean {
  return parseBoolean(useRuntimeConfig().allowPrivateHosts, false)
}

/** Providers whose CDN is HTTPS-only get their URLs upgraded. */
export function upgradeInsecureImages(): boolean {
  return parseBoolean(useRuntimeConfig().upgradeInsecureImages, true)
}

export function voterPepper(): string {
  return String(useRuntimeConfig().voterPepper || '')
}

export function userAgent(): string {
  return 'IPCrawlOpen/1.0 (+https://github.com/davhhyn/ipcrawleng; public camera catalogue)'
}

export function overpassUrl(): string {
  return String(useRuntimeConfig().overpassUrl || 'https://overpass-api.de/api/interpreter')
}

export function windyApiKey(): string {
  return String(useRuntimeConfig().windyApiKey || '').trim()
}

export function allSourceIds(): string[] {
  return SOURCES.map(source => source.id)
}
