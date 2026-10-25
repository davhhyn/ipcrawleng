import { readSources } from '~~/server/utils/catalogStore'
import { publicSyncAllowed } from '~~/server/utils/config'
import { isDatabaseAvailable } from '~~/server/utils/db'

export default defineEventHandler(() => {
  if (!isDatabaseAvailable()) {
    throw createError({ statusCode: 503, statusMessage: 'Catalogue database unavailable' })
  }
  return readSources(publicSyncAllowed())
})
