import { timingSafeEqual } from 'node:crypto'
import { sensorIngestEnabled } from '~~/server/utils/config'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { assertRateLimit, RATE_LIMITS, requestIp } from '~~/server/utils/rateLimit'
import { ingestDetections, type IncomingDetection, type SensorOrigin } from '~~/server/utils/sensorStore'

/**
 * Receive findings from the local sensor CLI.
 *
 * This endpoint stores data; it never starts a scan. Turning a web request into
 * a network scan would turn any exposed instance into an open scanner, so the
 * scanning half lives exclusively in `scripts/sensor.mjs` on the operator's
 * machine.
 *
 * Guards, in order:
 *   - disabled entirely with NUXT_SENSOR_INGEST=false
 *   - a NUXT_SYNC_TOKEN must be configured; there is no dev bypass
 *   - the bearer token must match (constant-time compare)
 *   - the caller must be on loopback unless NUXT_SENSOR_ALLOW_REMOTE_INGEST=true
 *   - rate limited per IP
 */

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.')
}

export default defineEventHandler(async (event) => {
  if (!sensorIngestEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'The local sensor ingest endpoint is disabled.' })
  }

  const config = useRuntimeConfig()
  const expected = String(config.syncToken || '').trim()
  if (!expected) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Set NUXT_SYNC_TOKEN to enable local sensor ingest.'
    })
  }

  const provided = (getRequestHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!provided || !tokensMatch(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'A valid sync token is required.' })
  }

  const allowRemote = String(config.sensorAllowRemoteIngest || 'false') === 'true'
  if (!allowRemote && !isLoopback(requestIp(event))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Sensor ingest is limited to loopback. Set NUXT_SENSOR_ALLOW_REMOTE_INGEST=true to change that.'
    })
  }

  assertRateLimit(event, 'sensor', RATE_LIMITS.sensor.limit, RATE_LIMITS.sensor.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const body = await readBody<{
    origin?: string
    detections?: IncomingDetection[]
    hosts?: number
    openPorts?: number
    durationMs?: number
    trigger?: string
    complete?: boolean
  }>(event).catch(() => null)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Expected a JSON body.' })
  }

  const origin: SensorOrigin = body.origin === 'import' ? 'import' : 'sensor'
  const detections = Array.isArray(body.detections) ? body.detections : null
  if (!detections) {
    throw createError({ statusCode: 400, statusMessage: '`detections` must be an array.' })
  }

  try {
    const result = ingestDetections(detections, origin, {
      hosts: typeof body.hosts === 'number' ? body.hosts : undefined,
      openPorts: typeof body.openPorts === 'number' ? body.openPorts : undefined,
      durationMs: typeof body.durationMs === 'number' ? body.durationMs : undefined,
      trigger: typeof body.trigger === 'string' ? body.trigger.slice(0, 40) : undefined,
      // Retirement is opt-in: only a scan that covered its whole scope says so.
      complete: body.complete === true
    })
    return { ok: true, origin, ...result }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Could not store detections.'
    })
  }
})
