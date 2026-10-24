import type { FunCamResponse } from '#shared/fun'
import { SOURCE_BY_ID } from '#shared/sources'
import { CAM_SELECT, type CamRow } from '~~/server/utils/camRow'
import { all, isDatabaseAvailable, one } from '~~/server/utils/db'
import { rowToFunChannel } from '~~/server/utils/funPayload'
import { looksLikeCamId } from '~~/server/utils/imageParams'
import { assertRateLimit, RATE_LIMITS } from '~~/server/utils/rateLimit'
import { hasRealSync } from '~~/server/utils/syncStore'

/** Random channel for Fun mode, with optional live-only and source filters. */
export default defineEventHandler((event): FunCamResponse => {
  assertRateLimit(event, 'fun', RATE_LIMITS.random.limit, RATE_LIMITS.random.windowMs)

  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }

  const query = getQuery(event)
  const clauses = ['active = 1']
  const params: unknown[] = []

  if (query.live === '1' || query.live === 'true') clauses.push("status = 'live'")

  if (typeof query.source === 'string' && SOURCE_BY_ID[query.source]) {
    clauses.push('source = ?')
    params.push(query.source)
  }

  const exclude = (typeof query.exclude === 'string' ? query.exclude.split(',') : [])
    .map(value => value.trim())
    .filter(value => looksLikeCamId(value))
    .slice(0, 30)
  if (exclude.length) {
    clauses.push(`id NOT IN (${exclude.map(() => '?').join(',')})`)
    params.push(...exclude)
  }

  const where = clauses.join(' AND ')
  const total = one<{ n: number }>(`SELECT COUNT(*) AS n FROM cams WHERE ${where}`, params)?.n ?? 0
  const row = all<CamRow>(
    `SELECT ${CAM_SELECT} FROM cams WHERE ${where} ORDER BY RANDOM() LIMIT 1`,
    params
  )[0] ?? null

  return {
    channel: row ? rowToFunChannel(row, total) : null,
    total,
    demoMode: !hasRealSync()
  }
})
