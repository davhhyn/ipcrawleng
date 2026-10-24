import type { ExploreCamDetail } from '#shared/explore'
import { rowToDetail } from '~~/server/utils/camRow'
import { findCamRow } from '~~/server/utils/camStore'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { looksLikeCamId, parseImageIdParam } from '~~/server/utils/imageParams'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

export default defineEventHandler((event): ExploreCamDetail => {
  assertRateLimit(event, 'cam-detail', RATE_LIMITS.explore.limit, RATE_LIMITS.explore.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const id = parseImageIdParam(getRouterParam(event, 'id'))
  if (!looksLikeCamId(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid camera id' })
  }

  const row = findCamRow(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Camera not found' })

  return rowToDetail(row)
})
