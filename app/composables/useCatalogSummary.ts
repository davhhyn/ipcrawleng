import { computed } from 'vue'

export interface CatalogStatus {
  ok: boolean
  version: string
  demoMode: boolean
  seeded: boolean
  counts: {
    total: number
    live: number
    countries: number
    sources: number
    vendors: number
  }
  lastSync: {
    startedAt: string
    finishedAt: string | null
    status: string
    sourceCount: number
  } | null
  database: {
    path: string
    available: boolean
  }
}

/**
 * One shared, deduped fetch of the catalogue status. The header and several
 * pages read this, but Nuxt caches by key so the server is hit once per render.
 */
export function useCatalogSummary() {
  const { data, status, refresh } = useFetch<CatalogStatus>('/api/status', {
    key: 'catalog-status',
    server: true
  })

  const counts = computed(() => data.value?.counts ?? {
    total: 0,
    live: 0,
    countries: 0,
    sources: 0,
    vendors: 0
  })

  return {
    status: data,
    pending: computed(() => status.value === 'pending'),
    counts,
    demoMode: computed(() => data.value?.demoMode ?? false),
    refresh
  }
}
