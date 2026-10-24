<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Crosshair, Layers, ListFilter, MapPin, Radio, Search, X } from '@lucide/vue'
import type { MapPoint, MapPointsResponse } from '#shared/map'
import { SOURCES, sourceAccent } from '#shared/sources'
import { countryFlag } from '#shared/countries'
import { camPagePath } from '#shared/routes'

definePageMeta({ name: 'atlas' })

useHead({
  title: 'Atlas',
  meta: [
    {
      name: 'description',
      content: 'A spatial view of every camera in the catalogue, clustered by region and filterable by source and liveness.'
    }
  ]
})

const route = useRoute()
const router = useRouter()

const { data, status } = await useFetch<MapPointsResponse>('/api/map/points', {
  default: () => ({ points: [], total: 0, truncated: false, generatedAt: Date.now() })
})

const search = ref('')
const liveOnly = ref(false)
const activeSources = ref<string[]>([])
const selectedId = ref<string | null>(typeof route.query.cam === 'string' ? route.query.cam : null)
const dialogId = ref<string | null>(null)
const showList = ref(true)

const mapRef = ref<{ focus: (point: MapPoint) => void, reset: () => void } | null>(null)

const points = computed(() => data.value?.points ?? [])

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return points.value.filter((point) => {
    if (liveOnly.value && !point.isLive) return false
    if (activeSources.value.length && !activeSources.value.includes(point.source)) return false
    if (term) {
      const haystack = `${point.title} ${point.city ?? ''} ${point.country ?? ''} ${point.sourceLabel}`.toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })
})

const selected = computed(() => filtered.value.find(point => point.id === selectedId.value) ?? null)

const stats = computed(() => ({
  plotted: filtered.value.length,
  total: data.value?.total ?? 0,
  countries: new Set(filtered.value.map(point => point.countryCode || point.country).filter(Boolean)).size,
  live: filtered.value.filter(point => point.isLive).length
}))

const sourcesPresent = computed(() => {
  const counts = new Map<string, number>()
  for (const point of points.value) counts.set(point.source, (counts.get(point.source) ?? 0) + 1)
  return SOURCES
    .filter(source => counts.has(source.id))
    .map(source => ({ ...source, count: counts.get(source.id) ?? 0 }))
})

function toggleSource(id: string) {
  activeSources.value = activeSources.value.includes(id)
    ? activeSources.value.filter(value => value !== id)
    : [...activeSources.value, id]
}

function select(point: MapPoint) {
  selectedId.value = point.id
  router.replace({ query: { ...route.query, cam: point.id } })
}

function clearSelection() {
  selectedId.value = null
  const query = { ...route.query }
  delete query.cam
  router.replace({ query })
}

watch(() => route.query.cam, (value) => {
  selectedId.value = typeof value === 'string' ? value : null
})

function openDetail() {
  if (selected.value) dialogId.value = selected.value.id
}

const listPoints = computed(() => filtered.value.slice(0, 220))
</script>

<template>
  <div class="atlas">
    <section class="page atlas__head">
      <div class="atlas__intro">
        <p class="eyebrow">Atlas · spatial view</p>
        <h1 class="atlas__title display">
          Every camera,<br><span class="text-gradient">plotted.</span>
        </h1>
        <p class="atlas__lede">
          Pan, zoom and cluster the catalogue by geography. Only cameras whose
          operators publish coordinates are shown — locations come from open
          data, never from scanning.
        </p>
      </div>

      <div class="atlas__stats">
        <div class="atlas__stat">
          <p class="atlas__stat-value mono">{{ stats.plotted.toLocaleString() }}</p>
          <p class="atlas__stat-label">Plotted</p>
        </div>
        <div class="atlas__stat">
          <p class="atlas__stat-value mono atlas__stat-value--live">{{ stats.live.toLocaleString() }}</p>
          <p class="atlas__stat-label">Live</p>
        </div>
        <div class="atlas__stat">
          <p class="atlas__stat-value mono">{{ stats.countries.toLocaleString() }}</p>
          <p class="atlas__stat-label">Countries</p>
        </div>
        <div class="atlas__stat">
          <p class="atlas__stat-value mono">{{ stats.total.toLocaleString() }}</p>
          <p class="atlas__stat-label">In catalogue</p>
        </div>
      </div>
    </section>

    <div class="page atlas__layout">
      <div class="atlas__canvas-wrap">
        <div class="atlas__toolbar">
          <label class="atlas__search">
            <Search :size="13" />
            <input
              v-model="search"
              type="search"
              placeholder="Filter plotted cameras…"
              aria-label="Filter plotted cameras"
            >
            <button v-if="search" type="button" class="atlas__search-clear" aria-label="Clear" @click="search = ''">
              <X :size="11" />
            </button>
          </label>

          <button
            type="button"
            class="atlas__toggle"
            :class="{ 'atlas__toggle--on': liveOnly }"
            @click="liveOnly = !liveOnly"
          >
            <Radio :size="12" />
            Live only
          </button>

          <button type="button" class="atlas__toggle atlas__toggle--icon" aria-label="Toggle list" @click="showList = !showList">
            <ListFilter :size="13" />
          </button>
        </div>

        <div class="atlas__sources">
          <button
            v-for="source in sourcesPresent"
            :key="source.id"
            type="button"
            class="atlas__source"
            :class="{ 'atlas__source--on': activeSources.includes(source.id) }"
            :style="{ '--accent': source.accent }"
            @click="toggleSource(source.id)"
          >
            <span class="atlas__source-dot" />
            {{ source.short }}
            <span class="atlas__source-n mono">{{ source.count }}</span>
          </button>
        </div>

        <WorldCanvas
          ref="mapRef"
          class="atlas__canvas"
          :points="filtered"
          :selected-id="selectedId"
          :min-height="560"
          @select="select"
        />

        <div v-if="status === 'pending'" class="atlas__loading mono">PLOTTING CAMERAS…</div>

        <Transition name="slide">
          <div v-if="selected" class="atlas__selected">
            <img :src="selected.thumb" :alt="selected.title" class="atlas__selected-img">
            <div class="atlas__selected-body">
              <p class="atlas__selected-title">{{ selected.title }}</p>
              <p class="atlas__selected-meta">
                <span v-if="countryFlag(selected.countryCode)">{{ countryFlag(selected.countryCode) }}</span>
                {{ selected.city || selected.country || 'Location unlisted' }}
              </p>
              <p class="atlas__selected-src mono">
                <span class="dot" :style="{ background: sourceAccent(selected.source) }" />
                {{ selected.sourceLabel }}
              </p>
            </div>
            <div class="atlas__selected-actions">
              <button type="button" class="btn btn-sm btn-primary" @click="openDetail">
                <Crosshair :size="12" />
                Open
              </button>
              <NuxtLink :to="`/?cam=${selected.id}`" class="btn btn-sm">Catalogue</NuxtLink>
              <NuxtLink :to="camPagePath(selected.id)" class="btn btn-sm">Camera page</NuxtLink>
              <button type="button" class="icon-btn" aria-label="Clear selection" @click="clearSelection">
                <X :size="13" />
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <aside v-if="showList" class="atlas__list panel">
        <header class="atlas__list-head">
          <p class="eyebrow"><Layers :size="10" /> Plotted</p>
          <p class="mono atlas__list-count">{{ filtered.length.toLocaleString() }}</p>
        </header>

        <div class="atlas__list-scroll">
          <button
            v-for="point in listPoints"
            :key="point.id"
            type="button"
            class="atlas__row"
            :class="{ 'atlas__row--on': point.id === selectedId }"
            @click="select(point)"
          >
            <img :src="point.thumb" :alt="point.title" class="atlas__row-img" loading="lazy">
            <span class="atlas__row-body">
              <span class="atlas__row-title">{{ point.title }}</span>
              <span class="atlas__row-loc">
                <MapPin :size="9" />
                {{ point.city || point.country || '—' }}
              </span>
            </span>
            <span class="atlas__row-dot" :style="{ background: sourceAccent(point.source) }" />
          </button>

          <p v-if="!listPoints.length" class="atlas__list-empty mono">
            NO CAMERAS MATCH THIS VIEW
          </p>
          <p v-if="filtered.length > listPoints.length" class="atlas__list-more mono">
            +{{ (filtered.length - listPoints.length).toLocaleString() }} more on the map
          </p>
        </div>
      </aside>
    </div>

    <CamDialog :cam-id="dialogId" @close="dialogId = null" @step="() => {}" />
  </div>
</template>

<style scoped>
.atlas {
  padding-bottom: 10px;
}

.atlas__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-top: 34px;
  padding-bottom: 22px;
}

.atlas__title {
  margin: 10px 0 0;
  font-size: clamp(30px, 4.4vw, 48px);
  color: #f7faff;
}

.atlas__lede {
  max-width: 520px;
  margin: 12px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.6;
}

.atlas__stats {
  display: flex;
  gap: 26px;
  padding-bottom: 4px;
}

.atlas__stat-value {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.02em;
  color: var(--text);
}

.atlas__stat-value--live {
  color: var(--live);
}

.atlas__stat-label {
  margin: 2px 0 0;
  color: var(--text-mute);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.atlas__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (min-width: 1080px) {
  .atlas__layout {
    grid-template-columns: minmax(0, 1fr) 296px;
  }
}

.atlas__canvas-wrap {
  position: relative;
  min-width: 0;
}

.atlas__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.atlas__search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(4, 7, 11, 0.6);
  color: var(--text-mute);
}

.atlas__search:focus-within {
  border-color: rgb(var(--signal-rgb) / 0.45);
}

.atlas__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font-size: 12px;
  color: var(--text);
}

.atlas__search input::-webkit-search-cancel-button {
  display: none;
}

.atlas__search-clear {
  display: inline-flex;
  border: 0;
  background: none;
  color: var(--text-mute);
  cursor: pointer;
}

.atlas__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
}

.atlas__toggle--on {
  color: var(--live);
  border-color: rgb(var(--live-rgb) / 0.4);
  background: rgb(var(--live-rgb) / 0.08);
}

.atlas__toggle--icon {
  padding: 0;
  width: 34px;
  justify-content: center;
}

.atlas__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.atlas__source {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-mute);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.atlas__source-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}

.atlas__source--on {
  color: var(--text);
  border-color: color-mix(in oklab, var(--accent), transparent 55%);
  background: color-mix(in oklab, var(--accent), transparent 88%);
}

.atlas__source-n {
  opacity: 0.55;
  font-size: 8px;
}

.atlas__canvas {
  height: min(66vh, 700px);
}

.atlas__loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: 0.2em;
}

.atlas__selected {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgba(6, 10, 16, 0.94);
  backdrop-filter: blur(14px);
}

@media (min-width: 640px) {
  .atlas__selected {
    left: auto;
    width: 430px;
  }
}

.atlas__selected-img {
  width: 92px;
  height: 60px;
  flex: none;
  border-radius: 7px;
  object-fit: cover;
  background: #080d14;
}

.atlas__selected-body {
  flex: 1;
  min-width: 0;
}

.atlas__selected-title {
  margin: 0;
  font-size: 12px;
  font-weight: 560;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.atlas__selected-meta {
  margin: 3px 0 0;
  color: var(--text-dim);
  font-size: 10px;
}

.atlas__selected-src {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 3px 0 0;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.06em;
}

.atlas__selected-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.atlas__list {
  display: flex;
  flex-direction: column;
  max-height: min(70vh, 760px);
  padding: 12px;
}

@media (max-width: 1079px) {
  .atlas__list {
    max-height: 380px;
  }
}

.atlas__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--line);
}

.atlas__list-head .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.atlas__list-count {
  color: var(--text-dim);
  font-size: 10px;
}

.atlas__list-scroll {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 7px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.atlas__row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 5px;
  border: 0;
  border-radius: 7px;
  background: none;
  text-align: left;
  cursor: pointer;
}

.atlas__row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.atlas__row--on {
  background: rgb(var(--signal-rgb) / 0.1);
}

.atlas__row-img {
  width: 46px;
  height: 30px;
  flex: none;
  border-radius: 4px;
  object-fit: cover;
  background: #080d14;
}

.atlas__row-body {
  flex: 1;
  min-width: 0;
}

.atlas__row-title {
  display: block;
  font-size: 11px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atlas__row-loc {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  color: var(--text-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.atlas__row-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 999px;
}

.atlas__list-empty,
.atlas__list-more {
  margin: 12px 0;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.12em;
  text-align: center;
  line-height: 1.6;
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 180ms ease, transform 200ms ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
