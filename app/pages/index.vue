<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Heart,
  Map as MapIcon,
  Radio,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X
} from '@lucide/vue'
import type { ExploreFacets, ExploreListResponse } from '#shared/explore'
import { EXPLORE_SORTS } from '#shared/explore'

definePageMeta({ name: 'explore' })

useHead({ title: 'Explore' })

const filters = useExploreFilters()
const { state, commit, apiQuery, activeCount } = filters
const favorites = useFavorites()
const summary = useCatalogSummary()
const route = useRoute()

const searchInput = ref(state.value.q)
const showFilters = ref(false)
const dialogId = ref<string | null>(typeof route.query.cam === 'string' ? route.query.cam : null)

watch(() => state.value.q, (value) => { searchInput.value = value })

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    commit({ q: searchInput.value.trim(), page: 1 }, { replace: true })
  }, 320)
}

function submitSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  commit({ q: searchInput.value.trim(), page: 1 })
}

const { data: list, status: listStatus } = await useFetch<ExploreListResponse>('/api/explore/cams', {
  query: apiQuery,
  default: () => ({ items: [], total: 0, page: 1, pageSize: 24, generatedAt: Date.now() })
})

// Dropdowns only need the filter-independent facet universe; filtering the
// facets themselves can wait until a filter is actually applied.
const { data: facets, status: facetsStatus } = await useFetch<ExploreFacets>('/api/explore/facets', {
  default: (): ExploreFacets => ({
    countries: [], cities: [], vendors: [], sources: [], kinds: [], statuses: []
  })
})

const loading = computed(() => listStatus.value === 'pending')
const total = computed(() => list.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / (list.value?.pageSize ?? 24))))
const items = computed(() => list.value?.items ?? [])

function setPage(page: number) {
  if (page < 1 || page > pageCount.value) return
  commit({ page })
  if (import.meta.client) window.scrollTo({ top: 220, behavior: 'smooth' })
}

function openCam(id: string) {
  dialogId.value = id
  if (import.meta.client && window.history) {
    const url = new URL(window.location.href)
    url.searchParams.set('cam', id)
    window.history.replaceState({}, '', url)
  }
}

function closeCam() {
  dialogId.value = null
  if (import.meta.client && window.history) {
    const url = new URL(window.location.href)
    url.searchParams.delete('cam')
    window.history.replaceState({}, '', url)
  }
}

function stepCam(direction: 1 | -1) {
  const current = dialogId.value
  if (!current) return
  const index = items.value.findIndex(card => card.id === current)
  if (index === -1) return
  const next = index + direction
  if (next >= 0 && next < items.value.length) {
    openCam(items.value[next]!.id)
  } else if (direction === 1 && state.value.page < pageCount.value) {
    setPage(state.value.page + 1)
  } else if (direction === -1 && state.value.page > 1) {
    setPage(state.value.page - 1)
  }
}

const heroStats = computed(() => [
  { label: 'Indexed', value: formatNumber(summary.counts.value.total), tone: 'signal' },
  { label: 'Live now', value: formatNumber(summary.counts.value.live), tone: 'live' },
  { label: 'Countries', value: formatNumber(summary.counts.value.countries), tone: 'neutral' },
  { label: 'Sources', value: formatNumber(summary.counts.value.sources), tone: 'neutral' }
])

const hasQuery = computed(() => activeCount.value > 0)

const sortLabels: Record<string, string> = {
  recent: 'Recently verified',
  favorites: 'Most favorited',
  discovered: 'Newly discovered',
  name: 'A → Z'
}

function toggleFavOnly() {
  commit({ fav: !state.value.favOnly ? '1' : undefined, page: 1 })
}

onMounted(() => {
  if (route.hash === '#filters') showFilters.value = true
})

const randomCam = async () => {
  try {
    const response = await $fetch<{ channel: { id: string } | null }>('/api/fun/cam')
    if (response.channel) openCam(response.channel.id)
  } catch {
    useToasts().push('Could not reach the catalogue.', 'error')
  }
}
</script>

<template>
  <div class="explore">
    <!-- ── Hero ─────────────────────────────────────────────────────── -->
    <section class="hero">
      <div class="page hero__inner">
        <div class="hero__copy">
          <p class="hero__eyebrow mono">
            <span class="dot dot-live" />
            MULTI-SOURCE · KEYLESS · OPEN
          </p>
          <h1 class="hero__title display">
            Open camera<br>
            <span class="text-gradient">intelligence.</span>
          </h1>
          <p class="hero__lede">
            A living catalogue of publicly documented cameras — municipal,
            transport, weather and community feeds — indexed from free and open
            sources. Explore by place, network, vendor or provider.
            <template v-if="summary.demoMode.value">
              <span class="hero__demo">
                Currently running on the bundled seed dataset while upstream
                sources are unreachable from this environment.
              </span>
            </template>
          </p>

          <div class="hero__search">
            <label class="hero__search-box">
              <Search :size="16" class="hero__search-icon" />
              <input
                v-model="searchInput"
                type="search"
                class="hero__search-input"
                placeholder="Search a city, operator, vendor or feed type…"
                aria-label="Search cameras"
                @input="onSearchInput"
                @keydown.enter.prevent="submitSearch"
              >
              <button
                v-if="searchInput"
                type="button"
                class="hero__search-clear"
                aria-label="Clear search"
                @click="searchInput = ''; commit({ q: '', page: 1 })"
              >
                <X :size="13" />
              </button>
            </label>
            <button type="button" class="btn btn-primary hero__search-btn" @click="submitSearch">
              Search
            </button>
          </div>

          <div class="hero__quick">
            <button
              type="button"
              class="quick"
              :class="{ 'quick--on': state.status === 'live' }"
              @click="commit({ status: state.status === 'live' ? 'any' : 'live', page: 1 })"
            >
              <Radio :size="12" />
              Live only
            </button>
            <button
              type="button"
              class="quick"
              :class="{ 'quick--on': state.favOnly }"
              @click="toggleFavOnly"
            >
              <Heart :size="12" :fill="state.favOnly ? 'currentColor' : 'none'" />
              Favorites
              <span v-if="favorites.count.value" class="quick__n">{{ favorites.count.value }}</span>
            </button>
            <button type="button" class="quick" @click="randomCam">
              <Shuffle :size="12" />
              Surprise me
            </button>
            <NuxtLink to="/map" class="quick">
              <MapIcon :size="12" />
              Atlas
            </NuxtLink>
          </div>
        </div>

        <div class="hero__stats panel">
          <div v-for="stat in heroStats" :key="stat.label" class="hero__stat">
            <p class="hero__stat-value mono" :class="`hero__stat-value--${stat.tone}`">{{ stat.value }}</p>
            <p class="hero__stat-label">{{ stat.label }}</p>
          </div>
          <div class="hero__stat hero__stat--wide">
            <p class="eyebrow">Coverage</p>
            <p class="hero__stat-note">
              Sourced from <strong>OpenStreetMap</strong>, <strong>TfL</strong>,
              <strong>Fintraffic</strong> and the bundled open index — with optional
              Windy and keyless InternetDB enrichment. No paywalled API required.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Toolbar ──────────────────────────────────────────────────── -->
    <div class="toolbar-wrap">
      <div class="page toolbar">
        <div class="toolbar__left">
          <button
            type="button"
            class="btn btn-sm toolbar__filter"
            :aria-expanded="showFilters"
            @click="showFilters = !showFilters"
          >
            <SlidersHorizontal :size="12" />
            Filters
            <span v-if="activeCount" class="toolbar__badge">{{ activeCount }}</span>
          </button>
          <p class="toolbar__result mono">
            <template v-if="loading">SCANNING…</template>
            <template v-else>{{ total.toLocaleString() }} {{ total === 1 ? 'CAMERA' : 'CAMERAS' }}</template>
          </p>
          <button
            v-if="hasQuery"
            type="button"
            class="toolbar__clear"
            @click="filters.clearAll()"
          >
            <X :size="11" />
            Clear
          </button>
        </div>

        <div class="toolbar__right">
          <label class="sort">
            <span class="sort__label mono">SORT</span>
            <select
              class="select sort__select"
              :value="state.sort"
              @change="commit({ sort: ($event.target as HTMLSelectElement).value, page: 1 })"
            >
              <option v-for="option in EXPLORE_SORTS" :key="option" :value="option">
                {{ sortLabels[option] }}
              </option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <!-- ── Body ─────────────────────────────────────────────────────── -->
    <div class="page layout">
      <FilterPanel
        v-if="showFilters"
        class="layout__filters layout__filters--mobile"
        :facets="facets"
        :loading="facetsStatus === 'pending'"
      />
      <FilterPanel
        class="layout__filters layout__filters--desktop"
        :facets="facets"
        :loading="facetsStatus === 'pending'"
      />

      <div class="layout__main">
        <div v-if="loading && !items.length" class="grid" aria-busy="true">
          <div v-for="n in 8" :key="n" class="grid__skeleton">
            <div class="skeleton grid__skeleton-media" />
            <div class="skeleton grid__skeleton-line" />
          </div>
        </div>

        <div v-else-if="!items.length" class="empty panel">
          <Sparkles :size="22" class="empty__icon" />
          <h2 class="empty__title">Nothing matches these filters</h2>
          <p class="empty__text">
            Try widening the status or source filter, or clearing the search.
            The catalogue currently spans {{ summary.counts.value.total }} cameras
            across {{ summary.counts.value.countries }} countries.
          </p>
          <button type="button" class="btn btn-sm" @click="filters.clearAll()">Reset filters</button>
        </div>

        <template v-else>
          <div class="grid" :class="{ 'grid--loading': loading }">
            <CamCard
              v-for="(card, index) in items"
              :key="card.id"
              :card="card"
              :index="index"
              :eager="index < 4"
              @select="(c) => openCam(c.id)"
            />
          </div>

          <nav v-if="pageCount > 1" class="pager" aria-label="Pagination">
            <button
              type="button"
              class="pager__btn"
              :disabled="state.page <= 1"
              aria-label="Previous page"
              @click="setPage(state.page - 1)"
            >
              <ChevronLeft :size="15" />
            </button>
            <span class="pager__status mono">
              PAGE {{ state.page }} / {{ pageCount }}
            </span>
            <button
              type="button"
              class="pager__btn"
              :disabled="state.page >= pageCount"
              aria-label="Next page"
              @click="setPage(state.page + 1)"
            >
              <ChevronRight :size="15" />
            </button>
          </nav>
        </template>

        <aside class="mission">
          <div class="mission__mark">
            <AppLogo :size="22" :glow="false" />
          </div>
          <div class="mission__copy">
            <p class="mission__title">Every entry points to documentation, not to a scan.</p>
            <p class="mission__text">
              IPCrawl Open never probes address ranges and never publishes raw
              stream hosts. It indexes cameras that operators, municipalities or
              communities already publish. If you see your own camera here,
              read <NuxtLink to="/about" class="mission__link">about the mission</NuxtLink>
              and close the feed.
            </p>
          </div>
          <NuxtLink to="/sources" class="mission__cta mono">
            SOURCES
            <ArrowRight :size="12" />
          </NuxtLink>
        </aside>
      </div>
    </div>

    <CamDialog
      :cam-id="dialogId"
      @close="closeCam"
      @step="stepCam"
    />
  </div>
</template>

<style scoped>
.explore {
  padding-bottom: 20px;
}

/* Hero */
.hero {
  position: relative;
  padding: 34px 0 26px;
  overflow: hidden;
}

.hero__inner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 26px;
  align-items: end;
}

@media (min-width: 1024px) {
  .hero__inner {
    grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
    gap: 44px;
  }
}

.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 16px;
  color: var(--text-dim);
  font-size: 9px;
  letter-spacing: 0.22em;
}

.hero__title {
  margin: 0;
  font-size: clamp(38px, 6.2vw, 70px);
  color: #f7faff;
}

.hero__lede {
  max-width: 620px;
  margin: 18px 0 0;
  color: var(--text-dim);
  font-size: 13.5px;
  line-height: 1.65;
}

.hero__demo {
  display: block;
  margin-top: 8px;
  color: var(--amber);
  font-size: 12px;
}

.hero__search {
  display: flex;
  gap: 8px;
  margin-top: 22px;
  max-width: 620px;
}

.hero__search-box {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 9px;
  height: 46px;
  padding: 0 12px 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: 11px;
  background: rgba(6, 10, 16, 0.78);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.hero__search-box:focus-within {
  border-color: rgb(var(--signal-rgb) / 0.55);
  box-shadow: 0 0 0 3px rgb(var(--signal-rgb) / 0.09);
}

.hero__search-icon {
  color: var(--text-mute);
  flex: none;
}

.hero__search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font-size: 13.5px;
  color: var(--text);
}

.hero__search-input::-webkit-search-cancel-button {
  display: none;
}

.hero__search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-dim);
  cursor: pointer;
}

.hero__search-btn {
  height: 46px;
  padding: 0 20px;
  border-radius: 11px;
}

.hero__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}

.quick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
  font-size: 11.5px;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}

.quick:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.quick--on {
  color: var(--signal-bright);
  border-color: rgb(var(--signal-rgb) / 0.42);
  background: rgb(var(--signal-rgb) / 0.1);
}

.quick__n {
  padding: 0 5px;
  border-radius: 999px;
  background: rgb(var(--signal-rgb) / 0.2);
  font-size: 9px;
  line-height: 15px;
}

.hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
}

@media (min-width: 640px) {
  .hero__stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.hero__stat {
  padding: 15px 16px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.hero__stat:nth-child(2n) {
  border-right: 0;
}

@media (min-width: 640px) and (max-width: 1023px) {
  .hero__stat {
    border-right: 1px solid var(--line);
  }
  .hero__stat:last-of-type {
    border-right: 0;
  }
}

.hero__stat-value {
  margin: 0;
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.03em;
  color: var(--text);
}

.hero__stat-value--live {
  color: var(--live);
}

.hero__stat-value--signal {
  color: var(--signal-bright);
}

.hero__stat-label {
  margin: 3px 0 0;
  color: var(--text-mute);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hero__stat--wide {
  grid-column: 1 / -1;
  border-right: 0;
  border-bottom: 0;
  background: rgba(255, 255, 255, 0.012);
}

.hero__stat-note {
  margin: 7px 0 0;
  color: var(--text-dim);
  font-size: 11px;
  line-height: 1.6;
}

.hero__stat-note strong {
  color: var(--text);
  font-weight: 500;
}

/* Toolbar */
.toolbar-wrap {
  position: sticky;
  top: var(--header-h);
  z-index: 30;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: rgba(5, 8, 12, 0.86);
  backdrop-filter: blur(16px);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 52px;
}

.toolbar__left,
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar__filter {
  position: relative;
}

.toolbar__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--signal);
  color: var(--signal-ink);
  font-size: 8.5px;
  font-weight: 700;
}

.toolbar__result {
  margin: 0;
  color: var(--text-dim);
  font-size: 9.5px;
  letter-spacing: 0.12em;
}

.toolbar__clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-mute);
  font-size: 10.5px;
  cursor: pointer;
}

.toolbar__clear:hover {
  color: var(--text);
}

.sort {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.sort__label {
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.14em;
}

.sort__select {
  height: 32px;
  font-size: 11.5px;
  padding-left: 10px;
}

/* Layout */
.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  padding-top: 20px;
  align-items: start;
}

@media (min-width: 1024px) {
  .layout {
    grid-template-columns: 246px minmax(0, 1fr);
    gap: 24px;
  }
}

.layout__filters--mobile {
  display: block;
}

.layout__filters--desktop {
  display: none;
}

@media (min-width: 1024px) {
  .layout__filters--mobile {
    display: none;
  }
  .layout__filters--desktop {
    display: flex;
  }
}

.layout__main {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 14px;
  transition: opacity 180ms ease;
}

@media (max-width: 620px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
    gap: 10px;
  }
}

.grid--loading {
  opacity: 0.55;
}

.grid__skeleton {
  border: 1px solid var(--line);
  border-radius: 13px;
  overflow: hidden;
  background: rgba(9, 13, 20, 0.5);
}

.grid__skeleton-media {
  aspect-ratio: 16 / 10;
}

.grid__skeleton-line {
  height: 34px;
  border-top: 1px solid var(--line);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 42px 34px;
}

.empty__icon {
  color: var(--signal);
}

.empty__title {
  margin: 0;
  font-size: 19px;
  font-weight: 560;
  letter-spacing: -0.02em;
}

.empty__text {
  max-width: 480px;
  margin: 0 0 6px;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.6;
}

/* Pager */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 10px 0;
}

.pager__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
  cursor: pointer;
}

.pager__btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-strong);
}

.pager__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pager__status {
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.14em;
}

/* Mission strip */
.mission {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: linear-gradient(100deg, rgba(18, 26, 42, 0.6), rgba(7, 11, 17, 0.4));
}

.mission__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--signal);
}

.mission__copy {
  flex: 1;
  min-width: 0;
}

.mission__title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text);
}

.mission__text {
  margin: 4px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.55;
}

.mission__link {
  color: var(--signal-bright);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.mission__cta {
  display: none;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 8.5px;
  letter-spacing: 0.14em;
}

.mission__cta:hover {
  color: var(--signal-bright);
  border-color: rgb(var(--signal-rgb) / 0.4);
}

@media (min-width: 760px) {
  .mission__cta {
    display: inline-flex;
  }
}
</style>
