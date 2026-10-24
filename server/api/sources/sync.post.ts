import { publicSyncAllowed } from '~~/server/utils/config'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { isSyncRunning, runSync } from '~~/server/utils/ingest/pipeline'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'

/**
 * Trigger an ingestion run.
 *
 * Protected two ways:
 *  - if NUXT_SYNC_TOKEN is set, the request must carry it as a Bearer token
 *  - otherwise public triggering must be explicitly allowed
 *    (NUXT_ALLOW_PUBLIC_SYNC=true, or automatically in `nuxt dev`)
 *
 * The daily scheduled task is the intended production path; this endpoint
 * exists for operators and local development.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const configuredToken = String(config.syncToken || '').trim()
  const bearer = (getRequestHeader(event, 'authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  const headerToken = (getRequestHeader(event, 'x-sync-token') || '').trim()
  const provided = bearer || headerToken

  if (configuredToken) {
    if (provided !== configuredToken) {
      throw createError({ statusCode: 401, statusMessage: 'A valid sync token is required.' })
    }
  } else if (!publicSyncAllowed()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Manual syncs are disabled. Set NUXT_SYNC_TOKEN or NUXT_ALLOW_PUBLIC_SYNC=true.'
    })
  }

  // Single-flight first: "a run is already in progress" is a more useful answer
  // than "slow down", and it must not consume the caller's rate-limit budget.
  if (isSyncRunning()) {
    setHeader(event, 'retry-after', 5)
    throw createError({
      statusCode: 409,
      statusMessage: 'An ingestion run is already in progress.'
    })
  }

  assertRateLimit(event, 'sync', RATE_LIMITS.sync.limit, RATE_LIMITS.sync.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const summary = await runSync('manual')
  return { ok: summary.status !== 'failed', summary }
})
