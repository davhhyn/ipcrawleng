import type { FunCamResponse } from '#shared/fun'
import { findCamRow } from '~~/server/utils/camStore'
import { isDatabaseAvailable, one } from '~~/server/utils/db'
import { rowToFunChannel } from '~~/server/utils/funPayload'
import { looksLikeCamId, parseImageIdParam } from '~~/server/utils/imageParams'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'
import { hasRealSync } from '~~/server/utils/syncStore'

/** Channel metadata for shareable /fun/c/[id] links. */
export default defineEventHandler((event): FunCamResponse => {
  assertRateLimit(event, 'fun-detail', RATE_LIMITS.random.limit, RATE_LIMITS.random.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const id = parseImageIdParam(getRouterParam(event, 'id'))
  if (!looksLikeCamId(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid camera id' })

  const row = findCamRow(id)
  if (!row || row.active !== 1) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  const total = one<{ n: number }>('SELECT COUNT(*) AS n FROM cams WHERE active = 1')?.n ?? 0
  return {
    channel: rowToFunChannel(row, total),
    total,
    demoMode: !hasRealSync()
  }
})
