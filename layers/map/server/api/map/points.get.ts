import type { MapPointsResponse } from '#shared/map'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { listMapPoints } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

export default defineEventHandler((event): MapPointsResponse => {
  assertRateLimit(event, 'map', RATE_LIMITS.explore.limit, RATE_LIMITS.explore.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const result = listMapPoints()
  return {
    points: result.points,
    total: result.total,
    truncated: result.truncated,
    generatedAt: Date.now()
  }
})
