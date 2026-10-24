import { isDatabaseAvailable } from '~~/server/utils/db'
import { allowPrivateHosts, configuredSourceIds, probeEnabled } from '~~/server/utils/config'

/** Liveness + effective runtime flags. Useful when debugging a deployment. */
export default defineEventHandler(() => ({
  ok: true,
  database: isDatabaseAvailable() ? 'available' : 'unavailable',
  engine: 'node:sqlite',
  sources: configuredSourceIds(),
  liveProbe: probeEnabled(),
  allowPrivateHosts: allowPrivateHosts(),
  uptimeSec: Math.round(process.uptime()),
  now: new Date().toISOString()
}))
