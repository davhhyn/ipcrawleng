import { readHistory } from '~~/server/utils/catalogStore'
import { isDatabaseAvailable } from '~~/server/utils/db'

export default defineEventHandler(() => {
  if (!isDatabaseAvailable()) {
    return { points: [], demo: false, generatedAt: Date.now() }
  }
  return readHistory()
})
