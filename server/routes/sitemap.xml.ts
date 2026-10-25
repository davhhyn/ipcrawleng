import { all } from '~~/server/utils/db'
import { camPagePath } from '#shared/routes'

/**
 * XML sitemap: the static surfaces plus the camera pages that actually exist.
 *
 * Capped at 5,000 entries, which keeps the response well under the 50 MB
 * sitemap limit and matches the catalogue's practical size. Demo/seed rows are
 * included — they are real, indexed pages, just not live feeds.
 */

const MAX_ENTRIES = 5000

const STATIC_PATHS: { path: string, changefreq: string, priority: string }[] = [
  { path: '/', changefreq: 'hourly', priority: '1.0' },
  { path: '/map', changefreq: 'daily', priority: '0.8' },
  { path: '/stats', changefreq: 'daily', priority: '0.6' },
  { path: '/sources', changefreq: 'weekly', priority: '0.6' },
  { path: '/fun', changefreq: 'daily', priority: '0.5' },
  { path: '/imce', changefreq: 'monthly', priority: '0.5' },
  { path: '/api', changefreq: 'weekly', priority: '0.4' },
  { path: '/about', changefreq: 'monthly', priority: '0.3' }
]

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function siteOrigin(event: Parameters<typeof getRequestURL>[0]): string {
  const configured = String(useRuntimeConfig().public.siteUrl || '').replace(/\/+$/, '')
  if (configured) return configured
  return getRequestURL(event).origin
}

export default defineEventHandler((event) => {
  const origin = siteOrigin(event)
  const now = new Date().toISOString()

  let rows: { id: string, last_seen_at: number | null }[] = []
  try {
    rows = all<{ id: string, last_seen_at: number | null }>(
      `SELECT id, last_seen_at FROM cams
       WHERE active = 1
       ORDER BY COALESCE(last_seen_at, 0) DESC
       LIMIT ?`,
      [MAX_ENTRIES]
    )
  } catch {
    // The catalogue may not be initialised yet; the static routes are still valid.
    rows = []
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ]

  for (const entry of STATIC_PATHS) {
    lines.push(
      '  <url>',
      `    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`,
      `    <changefreq>${entry.changefreq}</changefreq>`,
      `    <priority>${entry.priority}</priority>`,
      '  </url>'
    )
  }

  for (const row of rows) {
    const lastmod = row.last_seen_at ? new Date(row.last_seen_at).toISOString() : now
    lines.push(
      '  <url>',
      `    <loc>${escapeXml(`${origin}${camPagePath(row.id)}`)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.5</priority>',
      '  </url>'
    )
  }

  lines.push('</urlset>', '')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
  return lines.join('\n')
})
