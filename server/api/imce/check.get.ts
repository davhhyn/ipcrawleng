import type { IpResponse } from '#shared/status'
import { one } from '~~/server/utils/db'
import { assertRateLimit, RATE_LIMITS, requestIp } from '~~/server/utils/rateLimit'

/**
 * "Is My Camera Exposed?" check. Same privacy contract as /api/ip: the
 * caller's address is matched against documented camera hosts and then
 * discarded — no scanning, no port probing, no storage.
 */
export default defineEventHandler((event): IpResponse & { totalCams: number } => {
  assertRateLimit(event, 'imce', RATE_LIMITS.ip.limit, RATE_LIMITS.ip.windowMs)

  const ip = requestIp(event)
  let matchedCam: IpResponse['matchedCam'] = null
  let totalCams = 0

  try {
    totalCams = one<{ n: number }>('SELECT COUNT(*) AS n FROM cams WHERE active = 1')?.n ?? 0
    if (ip && ip !== 'unknown') {
      matchedCam = one<{ id: string, title: string, country: string | null }>(
        `SELECT id, title, country FROM cams
         WHERE host = ? AND active = 1
         LIMIT 1`,
        [ip]
      )
    }
  } catch {
    totalCams = 0
  }

  setHeader(event, 'cache-control', 'private, max-age=300')
  return {
    ip: ip === 'unknown' ? null : ip,
    indexed: Boolean(matchedCam),
    matchedCam,
    totalCams,
    generatedAt: Date.now()
  }
})
