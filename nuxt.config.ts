import tailwindcss from '@tailwindcss/vite'

const dataDir = process.env.NUXT_DATA_DIR || './.data'

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@lucide/vue']
    }
  },

  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      featuredCamId: process.env.NUXT_PUBLIC_FEATURED_CAM_ID || '',
      version: '1.0.0'
    },
    dbPath: process.env.NUXT_DB_PATH || `${dataDir}/ipcrawl.sqlite`,
    seedDemo: process.env.NUXT_SEED_DEMO || 'true',
    syncSources: process.env.NUXT_SYNC_SOURCES || 'curated,osm,tfl,digitraffic,internetdb',
    syncToken: process.env.NUXT_SYNC_TOKEN || '',
    windyApiKey: process.env.NUXT_WINDY_API_KEY || '',
    overpassUrl: process.env.NUXT_OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
    // Endpoint overrides exist for tests, mirrors and self-hosted proxies.
    tflEndpoint: process.env.NUXT_TFL_ENDPOINT || '',
    digitrafficEndpoint: process.env.NUXT_DIGITRAFFIC_ENDPOINT || '',
    digitrafficImageBase: process.env.NUXT_DIGITRAFFIC_IMAGE_BASE || '',
    windyEndpoint: process.env.NUXT_WINDY_ENDPOINT || '',
    maxIngestPerSource: process.env.NUXT_MAX_INGEST_PER_SOURCE || '600',
    enableLiveProbe: process.env.NUXT_ENABLE_LIVE_PROBE || 'true',
    liveProbeTimeoutMs: process.env.NUXT_LIVE_PROBE_TIMEOUT_MS || '4000',
    liveProbeBudgetMs: process.env.NUXT_LIVE_PROBE_BUDGET_MS || '45000',
    blockedHosts: process.env.NUXT_BLOCKED_HOSTS || '',
    // Test-only escape hatch: allows loopback hosts in the fixture harness.
    // Never enable this in production.
    allowPrivateHosts: process.env.NUXT_ALLOW_PRIVATE_HOSTS || 'false',
    // TfL/Windy publish frames over HTTPS only; plain-http mirrors opt out.
    upgradeInsecureImages: process.env.NUXT_UPGRADE_INSECURE_IMAGES || 'true',
    voterPepper: process.env.NUXT_VOTER_PEPPER || ''
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en', class: 'dark' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#05070a' },
        { name: 'color-scheme', content: 'dark' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  },

  nitro: {
    preset: 'node-server',

    experimental: {
      tasks: true
    },

    scheduledTasks: {
      // Daily catalogue refresh. Every provider is free/keyless except the
      // optional Windy adapter, and a failed provider never wipes existing rows.
      '15 3 * * *': ['cams:refresh']
    },

    // Dev must use the same storage roots as production: Nitro's default dev
    // cache lives in .nuxt/cache, which every dev server on this checkout
    // shares — including a separate test harness process.
    devStorage: {
      thumbs: {
        driver: 'fs',
        base: `${dataDir}/thumbs`
      },
      cache: {
        driver: 'fs',
        base: `${dataDir}/cache`
      }
    },

    storage: {
      thumbs: {
        driver: 'fs',
        base: `${dataDir}/thumbs`
      },
      // Keep the SWR cache next to the database instead of inside .nuxt, so a
      // second dev server (or a test harness) can't be served another
      // process's cached API responses.
      cache: {
        driver: 'fs',
        base: `${dataDir}/cache`
      }
    }
  },

  routeRules: {
    '/api/explore/cams': { swr: 30 },
    '/api/explore/cams/**': { swr: 120 },
    '/api/explore/facets': { swr: 300 },
    '/api/map/points': { swr: 60 },
    '/api/stats': { swr: 300 },
    '/api/stats/history': { swr: 600 },
    '/api/sources': { swr: 60 },
    '/api/status': { swr: 15 },
    '/api/health': { headers: { 'cache-control': 'no-store' } },
    '/api/fun/**': { headers: { 'cache-control': 'no-store' } },
    '/api/explore/thumb/**': {
      headers: { 'cache-control': 'public, max-age=120, stale-while-revalidate=600' }
    },
    '/api/explore/frame/**': { headers: { 'cache-control': 'no-store' } },
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' }
    }
  },

  experimental: {
    viewTransition: true
  }
})
