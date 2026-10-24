import { readStats } from '~~/server/utils/catalogStore'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

export default defineEventHandler((event) => {
  assertRateLimit(event, 'stats', RATE_LIMITS.explore.limit, RATE_LIMITS.explore.windowMs)
  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }
  return readStats()
})
