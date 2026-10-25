import type { ExploreListResponse } from '#shared/explore'
import { parseExploreQuery } from '#shared/explore'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { listCams } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

/**
 * Paginated, filtered catalogue feed. The route rule adds a short SWR cache
 * keyed by the full query string, so the rate limit only meters cache misses.
 */
export default defineEventHandler((event): ExploreListResponse => {
  assertRateLimit(event, 'explore', RATE_LIMITS.explore.limit, RATE_LIMITS.explore.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const query = parseExploreQuery(getQuery(event) as Record<string, unknown>)
  return listCams(query)
})
