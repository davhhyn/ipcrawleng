const CORS_PREFIXES = [
  '/api/explore/cams',
  '/api/explore/facets',
  '/api/explore/thumb',
  '/api/explore/frame',
  '/api/map/points',
  '/api/stats',
  '/api/sources',
  '/api/status',
  '/api/fun/cam',
  '/api/ip',
  '/api/imce/check'
]

function isOpenPath(path: string): boolean {
  return CORS_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * The read-only API is CORS-open by design: the catalogue is public data and
 * the API docs invite third-party use. Mutating endpoints (favorites, sync)
 * are deliberately not in this list.
 */
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0] || ''
  if (!isOpenPath(path)) return

  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'access-control-allow-methods', 'GET, OPTIONS')
  setHeader(event, 'access-control-max-age', '86400')
  setHeader(event, 'access-control-expose-headers', 'etag, x-frame-source, x-frame-reason')

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
