<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Camera, Globe2, Heart, Layers, Radio } from '@lucide/vue'
import type { StatsHistoryResponse, StatsResponse } from '#shared/stats'

useHead({
  title: 'Stats',
  meta: [{ name: 'description', content: 'Aggregate metrics for the open camera catalogue: coverage, liveness, sources and growth.' }]
})

const { data: stats, status } = await useFetch<StatsResponse>('/api/stats', {
  default: (): StatsResponse => ({
    counts: {
      total: 0, active: 0, live: 0, countries: 0, sources: 0, vendors: 0,
      pageOnly: 0, offline: 0, unverified: 0, favorites: 0
    },
    coverage: { withCoords: 0, withCity: 0, withVendor: 0, liveRate: 0 },
    topCountries: [],
    topVendors: [],
    bySource: [],
    byKind: [],
    byStatus: [],
    byRegion: [],
    generatedAt: Date.now(),
    demoMode: true
  })
})

const { data: history } = await useFetch<StatsHistoryResponse>('/api/stats/history', {
  default: () => ({ points: [], demo: false, generatedAt: Date.now() })
})

const counts = computed(() => stats.value.counts)
const coverage = computed(() => stats.value.coverage)

const coverageRows = computed(() => {
  const total = counts.value.total || 1
  return [
    { label: 'Publish coordinates', value: coverage.value.withCoords, pct: (coverage.value.withCoords / total) * 100 },
    { label: 'Publish a city', value: coverage.value.withCity, pct: (coverage.value.withCity / total) * 100 },
    { label: 'Identify a vendor', value: coverage.value.withVendor, pct: (coverage.value.withVendor / total) * 100 },
    {
      label: 'Responded to the last probe',
      value: counts.value.live,
      pct: (counts.value.live / total) * 100
    }
  ]
})

const tiles = computed(() => [
  { label: 'Cameras indexed', value: counts.value.total, hint: `${counts.value.active} active documents`, tone: 'signal', icon: Camera },
  { label: 'Live now', value: counts.value.live, hint: `${coverage.value.liveRate}% of the catalogue`, tone: 'live', icon: Radio },
  { label: 'Countries', value: counts.value.countries, hint: `${stats.value.byRegion.length} world regions`, tone: 'neutral', icon: Globe2 },
  { label: 'Active sources', value: counts.value.sources, hint: 'Free & keyless by default', tone: 'neutral', icon: Layers },
  { label: 'Vendors recognised', value: counts.value.vendors, hint: 'Normalised brands & operators', tone: 'neutral', icon: Activity },
  { label: 'Favorites cast', value: counts.value.favorites, hint: 'Deduped per browser', tone: 'amber', icon: Heart }
])
</script>

<template>
  <div class="page stats">
    <header class="stats__head">
      <div>
        <p class="eyebrow">Telemetry</p>
        <h1 class="stats__title display">
          The catalogue,<br><span class="text-gradient">measured.</span>
        </h1>
        <p class="stats__lede">
          Aggregate coverage across every enabled source. Verification is
          best-effort: a camera marked <em>live</em> answered a request during the
          last probe round, nothing more.
        </p>
      </div>
      <div class="stats__meta">
        <span v-if="stats.demoMode" class="chip chip-amber">DEMO DATASET</span>
        <span class="chip">{{ status === 'pending' ? 'LOADING' : 'LIVE QUERY' }}</span>
        <span class="stats__updated mono">UPDATED {{ relativeTime(stats.generatedAt) }}</span>
      </div>
    </header>

    <section class="stats__tiles">
      <StatTile
        v-for="tile in tiles"
        :key="tile.label"
        :label="tile.label"
        :value="tile.value.toLocaleString()"
        :hint="tile.hint"
        :tone="tile.tone as 'signal' | 'live' | 'amber' | 'neutral'"
        :icon="tile.icon"
      />
    </section>

    <section class="stats__trend">
      <TrendChart :points="history.points" :demo="history.demo" />
    </section>

    <section class="stats__coverage panel">
      <header class="coverage__head">
        <p class="eyebrow">Data completeness</p>
        <p class="coverage__note">
          What share of indexed cameras carry the metadata the atlas and filters rely on.
        </p>
      </header>
      <div class="coverage__rows">
        <div v-for="row in coverageRows" :key="row.label" class="coverage__row">
          <div class="coverage__meta">
            <span class="coverage__label">{{ row.label }}</span>
            <span class="coverage__val mono">{{ row.value.toLocaleString() }} · {{ row.pct.toFixed(0) }}%</span>
          </div>
          <div class="coverage__track">
            <span class="coverage__fill" :style="{ width: `${Math.min(100, Math.max(1, row.pct))}%` }" />
          </div>
        </div>
      </div>
    </section>

    <section class="stats__grid">
      <BarList title="Top countries" :rows="stats.topCountries" :limit="10" />
      <BarList title="By source" :rows="stats.bySource" :limit="8" />
      <BarList title="By region" :rows="stats.byRegion" :limit="8" />
      <BarList title="Feed types" :rows="stats.byKind" :limit="8" />
      <BarList title="Status mix" :rows="stats.byStatus" :limit="6" />
      <BarList title="Top vendors" :rows="stats.topVendors" :limit="8" />
    </section>

    <aside class="stats__note panel">
      <p class="eyebrow">Reading these numbers</p>
      <p>
        “Page only” entries link to a documented public camera page without a
        published frame endpoint. “Unverified” cameras have not been probed yet.
        Nothing here is derived from port scanning — the catalogue only describes
        endpoints that a public source already documents.
      </p>
    </aside>
  </div>
</template>

<style scoped>
.stats {
  padding-top: 34px;
  padding-bottom: 20px;
}

.stats__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.stats__title {
  margin: 10px 0 0;
  font-size: clamp(30px, 4.4vw, 50px);
  color: #f7faff;
}

.stats__lede {
  max-width: 580px;
  margin: 13px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.65;
}

.stats__lede em {
  color: var(--live);
  font-style: normal;
}

.stats__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.stats__updated {
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.1em;
}

.stats__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
  gap: 12px;
}

.stats__trend {
  margin-top: 14px;
}

.stats__coverage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
  padding: 16px;
}

.coverage__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.coverage__note {
  margin: 0;
  color: var(--text-mute);
  font-size: 10.5px;
}

.coverage__rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.coverage__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.coverage__label {
  color: var(--text-dim);
  font-size: 11px;
}

.coverage__val {
  color: var(--text);
  font-size: 9.5px;
}

.coverage__track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.045);
  overflow: hidden;
}

.coverage__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--live-rgb) / 0.35), var(--live));
}

.stats__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(268px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.stats__note {
  margin-top: 16px;
  padding: 15px 17px;
}

.stats__note p:last-child {
  max-width: 820px;
  margin: 7px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.65;
}
</style>
