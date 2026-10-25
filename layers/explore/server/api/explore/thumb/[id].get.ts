import { findCamRow } from '~~/server/utils/camStore'
import { getFrame } from '~~/server/utils/frames'
import { looksLikeCamId, parseImageIdParam } from '~~/server/utils/imageParams'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

/**
 * Cached still for a camera card. Never triggers a probe for cameras that were
 * recently found offline; otherwise tries upstream once and falls back to a
 * generated, clearly-labelled frame.
 */
export default defineEventHandler(async (event) => {
  assertRateLimit(event, 'thumb', RATE_LIMITS.thumb.limit, RATE_LIMITS.thumb.windowMs)

  const id = parseImageIdParam(getRouterParam(event, 'id'))
  if (!looksLikeCamId(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid camera id' })

  const row = findCamRow(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Camera not found' })

  const frame = await getFrame(row, { fresh: false })

  const inm = getRequestHeader(event, 'if-none-match')
  if (inm && inm === frame.etag) {
    setResponseStatus(event, 304)
    return null
  }

  setHeader(event, 'content-type', frame.contentType)
  setHeader(event, 'etag', frame.etag)
  setHeader(event, 'cache-control', 'public, max-age=120, stale-while-revalidate=600')
  setHeader(event, 'x-frame-source', frame.source)
  if (frame.reason) setHeader(event, 'x-frame-reason', frame.reason)
  setHeader(event, 'x-frame-cam', row.id)
  if (frame.contentType.startsWith('image/svg')) {
    setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
  }

  return frame.bytes
})
