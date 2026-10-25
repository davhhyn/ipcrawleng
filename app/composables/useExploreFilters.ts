import { computed, ref, watch } from 'vue'
import type { CamKind, CamStatus, ExploreQuery, ExploreSort } from '#shared/explore'
import { EXPLORE_DEFAULT_PAGE_SIZE, toFilterValues } from '#shared/explore'

type FilterKey = 'q' | 'status' | 'sort' | 'page' | 'source' | 'country' | 'city' | 'vendor' | 'kind' | 'fav'

/**
 * URL-synced catalogue filter state. Every mutation goes through `commit`,
 * which pushes/replaces the route query so deep links, back/forward and SSR
 * all read the same source of truth.
 */
export function useExploreFilters() {
  const route = useRoute()
  const router = useRouter()

  const read = () => getQuery()

  function getQuery() {
    const q = route.query
    return {
      q: typeof q.q === 'string' ? q.q : '',
      status: (typeof q.status === 'string' ? q.status : 'any') as CamStatus | 'any',
      sort: (typeof q.sort === 'string' ? q.sort : 'recent') as ExploreSort,
      page: Math.max(1, Number.parseInt(String(q.page ?? '1'), 10) || 1),
      sources: toFilterValues(q.source, q['source[]']),
      countries: toFilterValues(q.country, q['country[]']),
      cities: toFilterValues(q.city, q['city[]']),
      vendors: toFilterValues(q.vendor, q['vendor[]']),
      kinds: toFilterValues(q.kind, q['kind[]']) as CamKind[],
      favOnly: q.fav === '1'
    }
  }

  const state = ref(read())

  watch(
    () => route.query,
    () => { state.value = read() },
    { deep: true }
  )

  function commit(patch: Partial<Record<FilterKey, unknown>>, opts: { replace?: boolean } = {}) {
    const next: Record<string, string | string[]> = {}

    const current = { ...state.value, ...patch } as ReturnType<typeof getQuery>

    if (current.q) next.q = current.q
    if (current.status && current.status !== 'any') next.status = current.status
    if (current.sort && current.sort !== 'recent') next.sort = current.sort
    if (current.page && current.page > 1) next.page = String(current.page)
    if (current.sources.length) next.source = current.sources
    if (current.countries.length) next.country = current.countries
    if (current.cities.length) next.city = current.cities
    if (current.vendors.length) next.vendor = current.vendors
    if (current.kinds.length) next.kind = current.kinds
    if (current.favOnly) next.fav = '1'

    state.value = current
    router[opts.replace ? 'replace' : 'push']({ query: next })
  }

  function toggleValue(key: 'sources' | 'countries' | 'cities' | 'vendors' | 'kinds', value: string) {
    if (key === 'kinds') {
      const currentKinds = state.value.kinds
      const cast = value as CamKind
      const nextKinds = currentKinds.includes(cast)
        ? currentKinds.filter(item => item !== cast)
        : [...currentKinds, cast]
      commit({ kind: nextKinds, page: 1 })
      return
    }
    const existing = state.value[key] as string[]
    const next = existing.includes(value)
      ? existing.filter(item => item !== value)
      : [...existing, value]
    commit({ [key]: next, page: 1 })
  }

  function clearAll() {
    router.push({ query: {} })
  }

  const favorites = useFavorites()

  /** Query object for /api/explore/cams (favorites are resolved client-side). */
  const apiQuery = computed<Record<string, unknown>>(() => {
    const query: Record<string, unknown> = {
      page: state.value.page,
      pageSize: EXPLORE_DEFAULT_PAGE_SIZE,
      sort: state.value.sort
    }
    if (state.value.q) query.q = state.value.q
    if (state.value.status !== 'any') query.status = state.value.status
    if (state.value.sources.length) query.source = state.value.sources
    if (state.value.countries.length) query.country = state.value.countries
    if (state.value.cities.length) query.city = state.value.cities
    if (state.value.vendors.length) query.vendor = state.value.vendors
    if (state.value.kinds.length) query.kind = state.value.kinds
    if (state.value.favOnly) {
      query.fav = '1'
      query.id = favorites.ids.value
    }
    return query
  })

  const serverQuery = computed<ExploreQuery>(() => ({
    page: state.value.page,
    pageSize: EXPLORE_DEFAULT_PAGE_SIZE,
    sort: state.value.sort,
    q: state.value.q,
    countries: state.value.countries,
    cities: state.value.cities,
    vendors: state.value.vendors,
    sources: state.value.sources,
    kinds: state.value.kinds as CamKind[],
    status: state.value.status,
    favoritesOnly: state.value.favOnly,
    ids: state.value.favOnly ? favorites.ids.value : []
  }))

  const activeCount = computed(() =>
    state.value.sources.length
    + state.value.countries.length
    + state.value.cities.length
    + state.value.vendors.length
    + state.value.kinds.length
    + (state.value.status !== 'any' ? 1 : 0)
    + (state.value.favOnly ? 1 : 0)
    + (state.value.q ? 1 : 0)
  )

  return {
    state,
    commit,
    toggleValue,
    clearAll,
    apiQuery,
    serverQuery,
    activeCount,
    pageSize: EXPLORE_DEFAULT_PAGE_SIZE
  }
}
