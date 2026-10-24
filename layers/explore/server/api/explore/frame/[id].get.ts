import { findCamRow } from '~~/server/utils/camStore'
import { getFrame } from '~~/server/utils/frames'
import { looksLikeCamId, parseImageIdParam } from '~~/server/utils/imageParams'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

/**
 * Fresh frame used by the camera dialog and Fun mode. Always attempts an
 * upstream fetch (unless probing is disabled), then degrades to the last cached
 * still or a generated frame.
 */
export default defineEventHandler(async (event) => {
  assertRateLimit(event, 'frame', RATE_LIMITS.frame.limit, RATE_LIMITS.frame.windowMs)

  const id = parseImageIdParam(getRouterParam(event, 'id'))
  if (!looksLikeCamId(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid camera id' })

  const row = findCamRow(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Camera not found' })

  const frame = await getFrame(row, { fresh: true })

  const inm = getRequestHeader(event, 'if-none-match')
  if (inm && inm === frame.etag) {
    setResponseStatus(event, 304)
    return null
  }

  setHeader(event, 'content-type', frame.contentType)
  setHeader(event, 'etag', frame.etag)
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'x-frame-source', frame.source)
  if (frame.reason) setHeader(event, 'x-frame-reason', frame.reason)
  setHeader(event, 'x-frame-cam', row.id)
  if (frame.contentType.startsWith('image/svg')) {
    setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
  }

  return frame.bytes
})
