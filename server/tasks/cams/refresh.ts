import { runSync } from '../../utils/ingest/pipeline'

/**
 * Daily catalogue refresh (Nitro scheduled task, see nuxt.config.ts).
 * Every provider is free/keyless except the optional Windy adapter.
 */
export default defineTask({
  meta: {
    name: 'cams:refresh',
    description: 'Discover, normalize, upsert and probe cameras from all enabled public sources'
  },
  async run() {
    const summary = await runSync('schedule')
    return {
      result: {
        status: summary.status,
        seen: summary.seen,
        added: summary.added,
        updated: summary.updated,
        live: summary.live,
        errors: summary.errors
      }
    }
  }
})
