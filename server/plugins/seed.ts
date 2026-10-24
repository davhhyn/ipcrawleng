import { seedDemo } from '../utils/config'
import { isDatabaseAvailable } from '../utils/db'
import { seedDemoCatalog } from '../utils/seed'

/**
 * On boot, make sure the catalogue has something to render. Seeding only runs
 * on an empty database and never touches the network; a failure is logged but
 * must not stop the server from starting.
 */
export default defineNitroPlugin(() => {
  if (!seedDemo()) return
  if (!isDatabaseAvailable()) {
    console.warn('[ipcrawl] database unavailable; skipping seed')
    return
  }

  seedDemoCatalog()
    .then((result) => {
      if (result.seeded) console.log(`[ipcrawl] demo catalogue seeded (${result.count} rows)`)
    })
    .catch((error) => {
      console.error('[ipcrawl] seed failed:', error)
    })
})
