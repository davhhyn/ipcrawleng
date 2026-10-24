import type { ExploreFacets } from '#shared/explore'
import { parseExploreQuery } from '#shared/explore'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { buildFacets } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

export default defineEventHandler((event): ExploreFacets => {
  assertRateLimit(event, 'facets', RATE_LIMITS.facets.limit, RATE_LIMITS.facets.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const query = parseExploreQuery(getQuery(event) as Record<string, unknown>)
  return buildFacets(query)
})
