import type { H3Event } from 'h3'

interface Bucket {
  count: number
  reset: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 20_000

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.reset < now) buckets.delete(key)
  }
}

/** Fixed-window rate limit. Returns false when the caller is over budget. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  bucket.count++
  return bucket.count <= limit
}

export function requestIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) || 'unknown'
}

export function assertRateLimit(
  event: H3Event,
  name: string,
  limit: number,
  windowMs: number
): void {
  const key = `${name}:${requestIp(event)}`
  if (!rateLimit(key, limit, windowMs)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests — slow down a little.'
    })
  }
}

export const RATE_LIMITS = {
  explore: { limit: 240, windowMs: 60_000 },
  facets: { limit: 120, windowMs: 60_000 },
  thumb: { limit: 600, windowMs: 60_000 },
  frame: { limit: 180, windowMs: 60_000 },
  favorite: { limit: 40, windowMs: 60_000 },
  sync: { limit: 1, windowMs: 30_000 },
  random: { limit: 120, windowMs: 60_000 },
  ip: { limit: 30, windowMs: 60_000 }
} as const
