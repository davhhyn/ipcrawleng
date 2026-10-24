<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Heart,
  Info,
  MapPin,
  RefreshCw,
  Tag,
  Tv
} from '@lucide/vue'
import type { ExploreCamCard, ExploreCamDetail, ExploreListResponse } from '#shared/explore'
import { KIND_LABELS, STATUS_LABELS } from '#shared/labels'
import { API_EXPLORE_CAMS, apiExploreCamPath, camPagePath, funChannelPath } from '#shared/routes'
import { countryFlag } from '#shared/countries'
import { formatCoord } from '#shared/geo'
import { relativeTime } from '~/utils/format'

const route = useRoute()
const camId = computed(() => String(route.params.id ?? ''))

const { data: cam, error } = await useFetch<ExploreCamDetail>(
  () => apiExploreCamPath(camId.value),
  { watch: [camId] }
)

if (error.value || !cam.value) {
  // A malformed id (400 from the API) is just a page that doesn't exist here:
  // surfacing a 400 for a URL a human typed is noise.
  const upstream = error.value?.statusCode ?? 500
  const notFound = upstream === 404 || upstream === 400
  throw createError({
    statusCode: notFound ? 404 : upstream,
    statusMessage: notFound ? 'Camera not found' : 'Camera unavailable',
    fatal: true
  })
}

const favorites = useFavorites()
const toast = useToasts()

// Register the server count so local toggles stay consistent with the API.
favorites.register(cam.value.id, cam.value.favCount)

const favorited = computed(() => (cam.value ? favorites.isFavorite(cam.value.id) : false))
const favoriteCount = computed(() => (
  cam.value ? favorites.countOf(cam.value.id, cam.value.favCount) : 0
))
const flag = computed(() => countryFlag(cam.value?.countryCode))

async function toggleFavorite() {
  if (!cam.value) return
  const wasFavorite = favorites.isFavorite(cam.value.id)
  await favorites.toggle(cam.value.id, cam.value.favCount)
  toast.push(wasFavorite ? 'Removed from favorites' : 'Added to favorites', wasFavorite ? 'info' : 'success')
}

/* ── Frame ─────────────────────────────────────────────────────────────── */

const frameKey = ref(0)
const frameLoading = ref(true)
const frameFailed = ref(false)
const frameSrc = computed(() => `${cam.value?.frame ?? ''}${cam.value?.frame.includes('?') ? '&' : '?'}t=${frameKey.value}`)

function refreshFrame() {
  frameLoading.value = true
  frameFailed.value = false
  frameKey.value += 1
}

/* ── Link actions ──────────────────────────────────────────────────────── */

const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
    toast.push('Link copied', 'success')
  } catch {
    toast.push('Copy failed — select the address bar instead.', 'warn')
  }
}

/* ── Metadata ──────────────────────────────────────────────────────────── */

const coordinates = computed(() => {
  const cam = camRef()
  if (!cam || typeof cam.lat !== 'number' || typeof cam.lon !== 'number') return null
  return `${formatCoord(cam.lat, 'lat')} ${formatCoord(cam.lon, 'lon')}`
})

function camRef(): ExploreCamDetail | null {
  return cam.value ?? null
}

const metaRows = computed(() => {
  const c = camRef()
  if (!c) return []
  const rows: { label: string, value: string, mono?: boolean }[] = [
    { label: 'Status', value: c.isDemo ? 'Seed entry' : STATUS_LABELS[c.status] },
    { label: 'Feed type', value: KIND_LABELS[c.kind] },
    { label: 'Source', value: c.sourceLabel },
    { label: 'Protocol', value: c.protocol ?? 'Not documented', mono: true },
    { label: 'Host port', value: c.port ? String(c.port) : '—', mono: true },
    { label: 'Coordinates', value: coordinates.value ?? 'Not geolocated', mono: true },
    { label: 'City', value: c.city ?? '—' },
    { label: 'Region', value: c.region ?? '—' },
    { label: 'Country', value: c.country ? `${countryFlag(c.countryCode)} ${c.country}`.trim() : '—' },
    { label: 'Vendor', value: c.vendor ?? 'Unknown' },
    { label: 'First seen', value: c.firstSeenAt ? relativeTime(c.firstSeenAt) : '—' },
    { label: 'Last seen', value: c.lastSeenAt ? relativeTime(c.lastSeenAt) : '—' }
  ]
  return rows.filter(row => row.value)
})

const probeRows = computed(() => {
  const c = camRef()
  if (!c) return []
  const rows: { label: string, value: string }[] = []
  if (c.probe.checkedAt) rows.push({ label: 'Last probe', value: relativeTime(c.probe.checkedAt) })
  if (c.probe.httpStatus) rows.push({ label: 'HTTP status', value: String(c.probe.httpStatus) })
  if (c.probe.error) rows.push({ label: 'Result', value: c.probe.error })
  if (!c.probe.checkedAt) rows.push({ label: 'Probing', value: c.liveProbeActive ? 'Scheduled' : 'Disabled' })
  return rows
})

/* ── Related cameras (same country, keyless) ───────────────────────────── */

const relatedQuery = computed(() => {
  const params = new URLSearchParams({ pageSize: '7', sort: 'favorites' })
  if (cam.value?.country) params.set('country', cam.value.country)
  return `${API_EXPLORE_CAMS}?${params.toString()}`
})

const { data: relatedData } = await useFetch<ExploreListResponse>(
  () => relatedQuery.value,
  { key: `related:${camId.value}`, watch: [camId] }
)

const related = computed<ExploreCamCard[]>(() =>
  (relatedData.value?.items ?? []).filter(item => item.id !== camId.value).slice(0, 6)
)

/* ── Metadata / structured data ────────────────────────────────────────── */

const title = computed(() => (cam.value ? `${cam.value.title}${cam.value.city ? ` · ${cam.value.city}` : ''}` : 'Camera'))

const description = computed(() => {
  const c = cam.value
  if (!c) return 'Public camera listing.'
  const where = [c.city, c.region, c.country].filter(Boolean).join(', ')
  return `${c.title}${where ? ` in ${where}` : ''} — ${KIND_LABELS[c.kind].toLowerCase()} from ${c.sourceLabel}. ${c.isDemo ? 'Seed catalogue entry.' : 'Publicly documented camera.'}`
})

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogType: 'article',
  twitterCard: 'summary_large_image',
  robots: () => (cam.value?.isDemo ? 'index,follow' : 'index,follow')
})

const requestUrl = useRequestURL()

useHead(() => {
  const c = cam.value
  if (!c) return {}
  const origin = requestUrl.origin
  const canonical = `${origin}${camPagePath(c.id)}`
  return {
    link: [{ rel: 'canonical' as const, href: canonical }],
    meta: [
      { property: 'og:image', content: `${origin}${c.thumb}` },
      { property: 'og:url', content: canonical }
    ],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title.value,
          description: description.value,
          url: canonical,
          mainEntity: {
            '@type': 'Place',
            name: c.title,
            address: {
              '@type': 'PostalAddress',
              addressLocality: c.city ?? undefined,
              addressRegion: c.region ?? undefined,
              addressCountry: c.countryCode ?? undefined
            },
            geo: typeof c.lat === 'number' && typeof c.lon === 'number'
              ? { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lon }
              : undefined
          }
        })
      }
    ]
  }
})
</script>

<template>
  <article v-if="cam" class="cam">
    <nav class="cam__crumbs" aria-label="Breadcrumb">
      <NuxtLink to="/" class="cam__back">
        <ArrowLeft :size="14" aria-hidden="true" />
        Back to explore
      </NuxtLink>
      <span class="cam__crumb-sep" aria-hidden="true">/</span>
      <span class="eyebrow">{{ cam.country ?? 'Unknown country' }}</span>
    </nav>

    <header class="cam__head">
      <div class="cam__head-main">
        <div class="cam__badges">
          <StatusPill :status="cam.status" :demo="cam.isDemo" size="md" />
          <SourceBadge :source="cam.source" :label="cam.sourceLabel" />
          <span class="chip">{{ KIND_LABELS[cam.kind] }}</span>
        </div>
        <h1 class="cam__title">
          <span v-if="flag" aria-hidden="true">{{ flag }}</span>
          {{ cam.title }}
        </h1>
        <p class="cam__where">
          <MapPin :size="14" aria-hidden="true" />
          <span v-if="cam.location">{{ cam.location }}</span>
          <span v-else>Location not documented</span>
          <template v-if="coordinates">
            <span class="cam__dot" aria-hidden="true">·</span>
            <span class="mono">{{ coordinates }}</span>
          </template>
        </p>
      </div>

      <div class="cam__actions">
        <button
          class="btn"
          type="button"
          :aria-pressed="favorited"
          :aria-label="favorited ? 'Remove from favorites' : 'Add to favorites'"
          @click="toggleFavorite"
        >
          <Heart :size="15" :fill="favorited ? 'currentColor' : 'none'" aria-hidden="true" />
          <span>{{ favorited ? 'Saved' : 'Save' }}</span>
          <span v-if="favoriteCount" class="mono cam__fav-count">{{ favoriteCount }}</span>
        </button>
        <button class="btn" type="button" @click="copyLink">
          <component :is="copied ? Check : Copy" :size="15" aria-hidden="true" />
          <span>{{ copied ? 'Copied' : 'Copy link' }}</span>
        </button>
        <NuxtLink :to="funChannelPath(cam.id)" class="btn btn-ghost">
          <Tv :size="15" aria-hidden="true" />
          <span>Fun mode</span>
        </NuxtLink>
      </div>
    </header>

    <div class="cam__body">
      <section class="cam__main" aria-labelledby="frame-heading">
        <h2 id="frame-heading" class="sr-only">Camera frame</h2>

        <figure class="cam__frame">
          <div class="cam__frame-media" :class="{ 'is-loading': frameLoading, 'is-failed': frameFailed }">
            <img
              :key="frameKey"
              :src="frameSrc"
              :alt="`${cam.title} — ${KIND_LABELS[cam.kind]} frame`"
              decoding="async"
              @load="frameLoading = false"
              @error="frameLoading = false; frameFailed = true"
            >
            <div v-if="frameLoading" class="cam__frame-hint mono">loading frame…</div>
            <div v-else-if="frameFailed" class="cam__frame-hint mono">frame unavailable</div>
            <span class="cam__frame-tag mono">{{ cam.isDemo ? 'SEED' : STATUS_LABELS[cam.status] }}</span>
          </div>
          <figcaption class="cam__caption">
            <Info :size="13" aria-hidden="true" />
            <span v-if="cam.kind === 'page'">
              This source publishes a documentation page, not a single frame. The preview is generated and labelled.
            </span>
            <span v-else>
              Frames are proxied from the documented upstream and never cached for longer than a few minutes.
              Offline cameras fall back to a clearly labelled illustration.
            </span>
          </figcaption>
        </figure>

        <div class="cam__prose">
          <p>{{ description }}</p>
          <p v-if="cam.tags.length" class="cam__tags">
            <Tag :size="13" aria-hidden="true" />
            <span v-for="tag in cam.tags" :key="tag" class="chip chip-sm">{{ tag }}</span>
          </p>
        </div>

        <div v-if="related.length" class="cam__related">
          <div class="cam__section-head">
            <h2 class="eyebrow">Nearby in the index</h2>
            <NuxtLink
              v-if="cam.country"
              :to="{ path: '/', query: { country: cam.country } }"
              class="cam__more"
            >
              Browse all
              <ArrowUpRight :size="13" aria-hidden="true" />
            </NuxtLink>
          </div>
          <ul class="cam__related-list">
            <li v-for="item in related" :key="item.id">
              <NuxtLink :to="camPagePath(item.id)" class="related">
                <img :src="item.thumb" :alt="''" loading="lazy" width="120" height="68">
                <span class="related__body">
                  <span class="related__title">{{ item.title }}</span>
                  <span class="related__meta mono">
                    {{ item.location ?? 'Unknown location' }} · {{ KIND_LABELS[item.kind] }}
                  </span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </section>

      <aside class="cam__side" aria-label="Camera details">
        <section class="panel cam__panel">
          <h2 class="eyebrow">Location</h2>
          <MiniMap :lat="cam.lat" :lon="cam.lon" :label="cam.title" :height="170" />
          <div class="cam__coords mono">
            {{ coordinates ?? 'Not geolocated' }}
          </div>
          <NuxtLink
            v-if="cam.lat !== null && cam.lon !== null"
            :to="{ path: '/map', query: { cam: cam.id } }"
            class="cam__maplink"
          >
            Open in Atlas
            <ArrowUpRight :size="13" aria-hidden="true" />
          </NuxtLink>
        </section>

        <section class="panel cam__panel">
          <div class="cam__panel-head">
            <h2 class="eyebrow">Details</h2>
            <button class="cam__refresh" type="button" title="Refresh frame" @click="refreshFrame">
              <RefreshCw :size="13" aria-hidden="true" />
              <span class="sr-only">Refresh frame</span>
            </button>
          </div>
          <dl class="meta">
            <div v-for="row in metaRows" :key="row.label" class="meta__row">
              <dt>{{ row.label }}</dt>
              <dd :class="{ mono: row.mono }">{{ row.value }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="probeRows.length" class="panel cam__panel">
          <h2 class="eyebrow">Liveness</h2>
          <dl class="meta">
            <div v-for="row in probeRows" :key="row.label" class="meta__row">
              <dt>{{ row.label }}</dt>
              <dd :class="{ 'mono': true, 'is-warn': row.label === 'Result' }">{{ row.value }}</dd>
            </div>
          </dl>
          <p class="cam__note">
            <Clock :size="12" aria-hidden="true" />
            Probes are rate-limited and skipped entirely when live probing is disabled.
          </p>
        </section>

        <section v-if="cam.sourceUrl || cam.attribution || cam.license" class="panel cam__panel">
          <h2 class="eyebrow">Provenance</h2>
          <p v-if="cam.attribution" class="cam__attr">{{ cam.attribution }}</p>
          <p v-if="cam.license" class="cam__license mono">{{ cam.license }}</p>
          <a
            v-if="cam.sourceUrl"
            :href="cam.sourceUrl"
            class="cam__ext"
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            Documented source
            <ArrowUpRight :size="13" aria-hidden="true" />
          </a>
        </section>
      </aside>
    </div>
  </article>
</template>

<style scoped>
.cam {
  width: min(1180px, 100% - 32px);
  margin: 0 auto;
  padding: 28px 0 72px;
}

.cam__crumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 12px;
}

.cam__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  transition: color 140ms ease;
}

.cam__back:hover {
  color: var(--text);
}

.cam__crumb-sep {
  color: var(--text-mute);
}

.cam__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.cam__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cam__title {
  margin: 0 0 10px;
  font-size: clamp(26px, 4vw, 40px);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.1;
}

.cam__where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-dim);
  font-size: 13px;
}

.cam__dot {
  color: var(--text-mute);
}

.cam__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cam__fav-count {
  font-size: 11px;
  color: var(--text-mute);
}

.cam__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 28px;
  margin-top: 26px;
}

.cam__frame {
  margin: 0;
}

.cam__frame-media {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: #04060a;
  aspect-ratio: 16 / 9;
}

.cam__frame-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
  transition: opacity 240ms ease;
}

.cam__frame-media.is-loading img {
  opacity: 0.35;
}

.cam__frame-hint {
  position: absolute;
  inset: auto 0 12px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-mute);
}

.cam__frame-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: rgb(5 7 10 / 0.72);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  backdrop-filter: blur(6px);
}

.cam__caption {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  color: var(--text-mute);
  font-size: 11.5px;
  line-height: 1.5;
}

.cam__prose {
  margin-top: 22px;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.65;
}

.cam__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
}

.cam__related {
  margin-top: 34px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}

.cam__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.cam__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--signal);
}

.cam__related-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.related {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: rgb(255 255 255 / 0.015);
  transition: border-color 150ms ease, background 150ms ease;
}

.related:hover {
  border-color: var(--line-strong);
  background: rgb(255 255 255 / 0.04);
}

.related img {
  flex: none;
  width: 84px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  background: #04060a;
}

.related__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.related__title {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.related__meta {
  overflow: hidden;
  font-size: 10px;
  color: var(--text-mute);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cam__side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cam__panel {
  padding: 16px;
}

.cam__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cam__panel h2 {
  margin: 0 0 12px;
}

.cam__coords {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-dim);
}

.cam__maplink {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--signal);
}

.cam__refresh {
  display: inline-flex;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-mute);
  cursor: pointer;
}

.cam__refresh:hover {
  border-color: var(--line);
  color: var(--text);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.meta__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.meta__row dt {
  color: var(--text-mute);
}

.meta__row dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  overflow-wrap: anywhere;
}

.meta__row dd.is-warn {
  color: var(--amber);
}

.cam__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  color: var(--text-mute);
  font-size: 10.5px;
  line-height: 1.4;
}

.cam__attr {
  margin: 0;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.cam__license {
  margin: 6px 0 0;
  color: var(--text-mute);
  font-size: 10.5px;
}

.cam__ext {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--signal);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 940px) {
  .cam__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .cam__side {
    order: 2;
  }
}
</style>
