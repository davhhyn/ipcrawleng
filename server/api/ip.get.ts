import type { IpResponse } from '#shared/status'
import { one } from '~~/server/utils/db'
import { assertRateLimit, RATE_LIMITS, requestIp } from '~~/server/utils/rateLimit'

/**
 * Public, CORS-open exposure check for the requesting IP.
 *
 * We only compare the caller's address against the *documented host* of
 * cameras already in the catalogue. We never scan the caller's network, never
 * probe ports, and never store the address.
 */
export default defineEventHandler((event): IpResponse => {
  assertRateLimit(event, 'ip', RATE_LIMITS.ip.limit, RATE_LIMITS.ip.windowMs)

  const ip = requestIp(event)
  let matchedCam: IpResponse['matchedCam'] = null

  if (ip && ip !== 'unknown') {
    try {
      matchedCam = one<{ id: string, title: string, country: string | null }>(
        `SELECT id, title, country FROM cams
         WHERE host = ? AND active = 1
         LIMIT 1`,
        [ip]
      )
    } catch {
      matchedCam = null
    }
  }

  setHeader(event, 'cache-control', 'private, max-age=300')
  return {
    ip: ip === 'unknown' ? null : ip,
    indexed: Boolean(matchedCam),
    matchedCam,
    generatedAt: Date.now()
  }
})
