import { PAGE_SITEMAP } from '#shared/routes'

/**
 * Crawl policy.
 *
 * The catalogue and camera pages are public by design. The write/expensive
 * surfaces are not: sync triggers, the IP lookup, and the frame proxy should
 * never be walked by a crawler (frames are megabytes of bandwidth per hit).
 */
export default defineEventHandler((event) => {
  const configured = String(useRuntimeConfig().public.siteUrl || '').replace(/\/+$/, '')
  const origin = configured || getRequestURL(event).origin

  const body = [
    'User-agent: *',
    'Allow: /$',
    'Allow: /cam/',
    'Allow: /map',
    'Allow: /stats',
    'Allow: /sources',
    'Allow: /about',
    'Allow: /api$',
    '',
    'Disallow: /api/',
    'Disallow: /fun/',
    'Disallow: /imce',
    'Disallow: /sitemap.xml',
    '',
    `Sitemap: ${origin}${PAGE_SITEMAP}`,
    ''
  ].join('\n')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=86400')
  return body
})
