import { createHash, randomBytes } from 'node:crypto'
import type { ExploreFavoriteResponse } from '#shared/explore'
import { camExists, toggleFavorite } from '~~/server/utils/camStore'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { looksLikeCamId, parseImageIdParam } from '~~/server/utils/imageParams'
import { voterPepper } from '~~/server/utils/config'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

const COOKIE = 'ipcw_voter'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

function voterHash(value: string): string {
  return createHash('sha256').update(`${voterPepper()}:${value}`).digest('hex')
}

/**
 * Per-browser, cookie-identified favorite vote. The cookie holds a random
 * opaque id; only a peppered SHA-256 of it is persisted, so the tally can be
 * deduped without storing anything identifying.
 */
export default defineEventHandler(async (event): Promise<ExploreFavoriteResponse> => {
  assertRateLimit(event, 'favorite', RATE_LIMITS.favorite.limit, RATE_LIMITS.favorite.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const id = parseImageIdParam(getRouterParam(event, 'id'))
  if (!looksLikeCamId(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid camera id' })
  if (!camExists(id)) throw createError({ statusCode: 404, statusMessage: 'Camera not found' })

  let voter = getCookie(event, COOKIE)
  if (!voter || !/^[A-Za-z0-9_-]{16,64}$/.test(voter)) {
    voter = randomBytes(18).toString('base64url')
  }
  setCookie(event, COOKIE, voter, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  })

  const body = await readBody<{ on?: unknown }>(event).catch(() => null)
  const desired = body && typeof body.on === 'boolean' ? body.on : undefined

  const result = toggleFavorite(id, voterHash(voter), desired)
  if (!result) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Favorite limit reached for this browser.'
    })
  }

  return result
})
