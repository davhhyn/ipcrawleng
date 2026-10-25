import { sensorFetchLocal, sensorIngestEnabled } from '~~/server/utils/config'
import { isDatabaseAvailable } from '~~/server/utils/db'
import { readSensorStatus } from '~~/server/utils/sensorStore'

/**
 * Read-only view of local-sensor state. Deliberately exposes no way to start a
 * scan: that stays on the operator's machine (see docs/LOCAL-SENSOR.md).
 */
export default defineEventHandler(() => {
  const empty = {
    ingestEnabled: sensorIngestEnabled(),
    fetchLocalFrames: sensorFetchLocal(),
    counts: { local: 0, localLive: 0, imported: 0 },
    lastRun: null
  }

  if (!isDatabaseAvailable()) return empty

  const status = readSensorStatus()
  return {
    ...status,
    ingestEnabled: sensorIngestEnabled(),
    fetchLocalFrames: sensorFetchLocal()
  }
})
