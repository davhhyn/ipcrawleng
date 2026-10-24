/** Shared route builders — one source of truth for client + server URLs. */

export const API_STATUS = '/api/status'
export const API_HEALTH = '/api/health'
export const API_IP = '/api/ip'
export const API_STATS = '/api/stats'
export const API_STATS_HISTORY = '/api/stats/history'
export const API_SOURCES = '/api/sources'
export const API_SOURCES_SYNC = '/api/sources/sync'
export const API_EXPLORE_CAMS = '/api/explore/cams'
export const API_EXPLORE_FACETS = '/api/explore/facets'
export const API_EXPLORE_THUMB = '/api/explore/thumb'
export const API_EXPLORE_FRAME = '/api/explore/frame'
export const API_EXPLORE_FAVORITE = '/api/explore/favorite'
export const API_MAP_POINTS = '/api/map/points'
export const API_FUN_CAM = '/api/fun/cam'
export const API_IMCE_CHECK = '/api/imce/check'
export const FUN_CHANNEL_PREFIX = '/fun/c'

export function apiExploreCamPath(id: string): string {
  return `${API_EXPLORE_CAMS}/${encodeURIComponent(id)}`
}

export function apiExploreThumbPath(id: string): string {
  return `${API_EXPLORE_THUMB}/${encodeURIComponent(id)}`
}

export function apiExploreFramePath(id: string, bust = false): string {
  const base = `${API_EXPLORE_FRAME}/${encodeURIComponent(id)}`
  return bust ? `${base}?t=${Date.now()}` : base
}

export function apiExploreFavoritePath(id: string): string {
  return `${API_EXPLORE_FAVORITE}/${encodeURIComponent(id)}`
}

export function funChannelPath(id: string): string {
  return `${FUN_CHANNEL_PREFIX}/${encodeURIComponent(id)}`
}

/** Human-facing camera page (canonical, crawlable, shareable). */
export const CAM_PAGE_PREFIX = '/cam'

export function camPagePath(id: string): string {
  return `${CAM_PAGE_PREFIX}/${encodeURIComponent(id)}`
}

export const PAGE_SITEMAP = '/sitemap.xml'
export const PAGE_ROBOTS = '/robots.txt'
