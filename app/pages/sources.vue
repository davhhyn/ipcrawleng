<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  CloudDownload,
  Database,
  KeyRound,
  Lock,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert
} from '@lucide/vue'
import type { SourcesResponse } from '#shared/status'

useHead({
  title: 'Sources',
  meta: [{ name: 'description', content: 'Every provider behind the catalogue, its licence, health and the latest ingestion run.' }]
})

const { data, status, refresh } = await useFetch<SourcesResponse>('/api/sources', {
  default: (): SourcesResponse => ({ sources: [], lastSync: null, syncEnabled: false, generatedAt: Date.now() })
})

const syncing = ref(false)
const token = ref('')
const showToken = ref(false)
const toast = useToasts()

const sources = computed(() => data.value.sources)
const lastSync = computed(() => data.value.lastSync)

const syncTone = computed(() => {
  const value = lastSync.value?.status
  if (value === 'ok') return 'live'
  if (value === 'partial') return 'amber'
  if (value === 'failed') return 'rose'
  return 'neutral'
})

const totals = computed(() => ({
  cams: sources.value.reduce((sum, source) => sum + source.cams, 0),
  enabled: sources.value.filter(source => source.enabled).length,
  keyless: sources.value.filter(source => source.keyless).length,
  healthy: sources.value.filter(source => source.healthy).length
}))

async function runSync() {
  if (syncing.value) return
  syncing.value = true
  try {
    const headers: Record<string, string> = {}
    if (token.value.trim()) headers.authorization = `Bearer ${token.value.trim()}`
    const result = await $fetch<{ ok: boolean, summary: { status: string, seen: number, added: number, updated: number } }>(
      '/api/sources/sync',
      { method: 'POST', headers }
    )
    const summary = result.summary
    toast.push(
      `Sync ${summary.status}: ${summary.seen} seen, ${summary.added} added, ${summary.updated} updated.`,
      result.ok ? 'success' : 'warn'
    )
    await refresh()
  } catch (error) {
    const message = (error as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (error as Error).message
    if (message?.includes('token')) showToken.value = true
    toast.push(message || 'Sync failed.', 'error')
  } finally {
    syncing.value = false
  }
}

function kindLabel(kind: string) {
  if (kind === 'discovery') return 'DISCOVERY'
  if (kind === 'enrichment') return 'ENRICHMENT'
  return 'SEED'
}
</script>

<template>
  <div class="page sources">
    <header class="sources__head">
      <div>
        <p class="eyebrow">Provenance</p>
        <h1 class="sources__title display">
          Free sources,<br><span class="text-gradient">no paywalls.</span>
        </h1>
        <p class="sources__lede">
          The catalogue is assembled from openly licensed, mostly keyless APIs.
          Every provider is optional, attributable and independently rate-limited;
          one failing source can never erase another's rows.
        </p>
      </div>

      <div class="sources__summary panel">
        <div class="sources__summary-row">
          <div>
            <p class="eyebrow">Last ingestion</p>
            <p class="sources__sync-status mono" :class="`sources__sync-status--${syncTone}`">
              {{ lastSync ? lastSync.status.toUpperCase() : 'NEVER' }}
            </p>
            <p class="sources__sync-meta">
              <template v-if="lastSync">
                {{ relativeTime(lastSync.startedAt) }} · {{ formatDuration(lastSync.durationMs) }}
                · {{ lastSync.seen }} seen · {{ lastSync.added }} added
              </template>
              <template v-else>No sync has run yet.</template>
            </p>
          </div>
          <button type="button" class="btn btn-sm" :disabled="syncing" @click="runSync">
            <RefreshCw :size="12" :class="{ 'spin': syncing }" />
            {{ syncing ? 'Syncing…' : 'Sync now' }}
          </button>
        </div>

        <div v-if="showToken" class="sources__token">
          <label class="sources__token-label" for="sync-token">
            <KeyRound :size="11" />
            Sync token
          </label>
          <input
            id="sync-token"
            v-model="token"
            type="password"
            class="input"
            placeholder="NUXT_SYNC_TOKEN value"
            autocomplete="off"
          >
          <p class="sources__token-hint">
            Manual syncs are protected. In production, the daily Nitro task runs
            this for you.
          </p>
        </div>

        <div class="sources__summary-facts">
          <span><Database :size="11" /> {{ totals.cams.toLocaleString() }} indexed</span>
          <span><PlayCircle :size="11" /> {{ totals.enabled }} enabled</span>
          <span><ShieldCheck :size="11" /> {{ totals.keyless }} keyless</span>
          <span><CheckCircle2 :size="11" /> {{ totals.healthy }} healthy</span>
        </div>
      </div>
    </header>

    <section class="sources__grid" :aria-busy="status === 'pending'">
      <article
        v-for="source in sources"
        :key="source.id"
        class="source panel"
        :class="{ 'source--off': !source.enabled }"
        :style="{ '--accent': source.accent }"
      >
        <header class="source__head">
          <div class="source__ident">
            <span class="source__mark mono">{{ source.short }}</span>
            <div>
              <h2 class="source__title">{{ source.label }}</h2>
              <p class="source__kind mono">{{ kindLabel(source.kind) }}</p>
            </div>
          </div>
          <span
            class="source__state"
            :class="source.enabled ? (source.healthy ? 'source__state--ok' : 'source__state--idle') : 'source__state--off'"
          >
            <span class="dot" />
            {{ !source.enabled ? 'DISABLED' : source.awaitingKey ? 'NO KEY' : source.healthy ? 'HEALTHY' : 'READY' }}
          </span>
        </header>

        <p class="source__desc">{{ source.description }}</p>

        <dl class="source__facts">
          <div>
            <dt>Coverage</dt>
            <dd>{{ source.coverage }}</dd>
          </div>
          <div>
            <dt>Cameras</dt>
            <dd class="mono">{{ source.cams.toLocaleString() }}</dd>
          </div>
          <div>
            <dt>Auth</dt>
            <dd>
              <span v-if="source.keyless" class="source__auth source__auth--open">
                <ShieldCheck :size="10" /> Keyless
              </span>
              <span v-else class="source__auth source__auth--locked">
                <Lock :size="10" /> {{ source.requiresEnv }}
              </span>
            </dd>
          </div>
          <div>
            <dt>Licence</dt>
            <dd>
              <a :href="source.licenseUrl" target="_blank" rel="noopener noreferrer" class="source__link">
                {{ source.license }}
                <ArrowUpRight :size="10" />
              </a>
            </dd>
          </div>
        </dl>

        <div v-if="source.lastRun" class="source__run">
          <div class="source__run-head mono">
            <span :class="source.lastRun.ok ? 'source__run-ok' : 'source__run-fail'">
              {{ source.lastRun.ok ? 'LAST RUN OK' : 'LAST RUN FAILED' }}
            </span>
            <span>{{ formatDuration(source.lastRun.durationMs) }}</span>
          </div>
          <div class="source__run-metrics mono">
            <span>{{ source.lastRun.fetched }} fetched</span>
            <span>{{ source.lastRun.inserted }} new</span>
            <span>{{ source.lastRun.updated }} updated</span>
            <span v-if="source.lastRun.probed">{{ source.lastRun.live }}/{{ source.lastRun.probed }} live</span>
          </div>
          <p v-if="source.lastRun.error" class="source__run-error">
            <TriangleAlert :size="11" />
            {{ source.lastRun.error }}
          </p>
        </div>
        <div v-else class="source__run source__run--empty mono">
          <CircleSlash :size="11" />
          NOT RUN IN THIS DEPLOYMENT
        </div>

        <footer class="source__foot">
          <a :href="source.homepage" target="_blank" rel="noopener noreferrer" class="source__link">
            Provider docs
            <ArrowUpRight :size="10" />
          </a>
          <span v-if="!source.enabled" class="source__enable mono">
            ADD TO NUXT_SYNC_SOURCES
          </span>
        </footer>
      </article>
    </section>

    <section class="sources__policy panel">
      <div class="policy__col">
        <p class="eyebrow"><CloudDownload :size="10" /> How ingestion works</p>
        <ol class="policy__list">
          <li>Each enabled provider is queried concurrently with its own timeout.</li>
          <li>Records are normalised once: stream kind, vendor, country, coordinates.</li>
          <li>Cross-source duplicates collapse to the most authoritative provider.</li>
          <li>Only a provider that answered may replace its own rows — failures never delete data.</li>
          <li>A bounded liveness probe then fetches frames for a subset and records HTTP outcomes.</li>
        </ol>
      </div>
      <div class="policy__col">
        <p class="eyebrow"><ShieldCheck :size="10" /> Ground rules</p>
        <ul class="policy__list policy__list--bullets">
          <li>No port scanning, no address-range probing, no credential guessing.</li>
          <li>Private, loopback and blocklisted hosts are rejected at ingest and again at fetch time.</li>
          <li>Raw stream hosts are never serialised by the public API; frames are proxied.</li>
          <li>Every camera keeps its provider attribution and licence.</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sources {
  padding-top: 34px;
  padding-bottom: 20px;
}

.sources__head {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
  margin-bottom: 22px;
}

@media (min-width: 1000px) {
  .sources__head {
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
    align-items: start;
    gap: 34px;
  }
}

.sources__title {
  margin: 10px 0 0;
  font-size: clamp(30px, 4.4vw, 50px);
  color: #f7faff;
}

.sources__lede {
  max-width: 560px;
  margin: 13px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.65;
}

.sources__summary {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 15px 16px;
}

.sources__summary-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sources__sync-status {
  margin: 5px 0 0;
  font-size: 17px;
  letter-spacing: 0.04em;
}

.sources__sync-status--live { color: var(--live); }
.sources__sync-status--amber { color: var(--amber); }
.sources__sync-status--rose { color: var(--rose); }

.sources__sync-meta {
  margin: 4px 0 0;
  color: var(--text-mute);
  font-size: 10.5px;
  line-height: 1.5;
}

.sources__token {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.25);
}

.sources__token-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.sources__token-hint {
  margin: 0;
  color: var(--text-mute);
  font-size: 10px;
  line-height: 1.5;
}

.sources__summary-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--line);
  color: var(--text-mute);
  font-size: 10px;
}

.sources__summary-facts span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sources__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 13px;
}

.source {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-top: 2px solid color-mix(in oklab, var(--accent), transparent 55%);
}

.source--off {
  opacity: 0.62;
}

.source__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.source__ident {
  display: flex;
  align-items: center;
  gap: 10px;
}

.source__mark {
  display: grid;
  place-items: center;
  min-width: 46px;
  height: 30px;
  padding: 0 7px;
  border: 1px solid color-mix(in oklab, var(--accent), transparent 60%);
  border-radius: 6px;
  background: color-mix(in oklab, var(--accent), transparent 90%);
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.1em;
}

.source__title {
  margin: 0;
  font-size: 14px;
  font-weight: 560;
  letter-spacing: -0.01em;
}

.source__kind {
  margin: 2px 0 0;
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.14em;
}

.source__state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.source__state--ok { color: var(--live); }
.source__state--idle { color: var(--signal-bright); }
.source__state--off { color: var(--text-mute); }

.source__desc {
  margin: 0;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.6;
}

.source__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0;
}

.source__facts dt {
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.source__facts dd {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.source__auth {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}

.source__auth--open { color: var(--live); }
.source__auth--locked { color: var(--amber); }

.source__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-dim);
  font-size: 10.5px;
}

.source__link:hover {
  color: var(--signal-bright);
}

.source__run {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}

.source__run--empty {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.1em;
}

.source__run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 8.5px;
  letter-spacing: 0.08em;
  color: var(--text-mute);
}

.source__run-ok { color: var(--live); }
.source__run-fail { color: var(--rose); }

.source__run-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 9px;
  color: var(--text-dim);
}

.source__run-error {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  color: var(--amber);
  font-size: 10px;
  line-height: 1.45;
}

.source__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.source__enable {
  color: var(--text-mute);
  font-size: 7.5px;
  letter-spacing: 0.1em;
}

.sources__policy {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
  margin-top: 16px;
  padding: 18px 20px;
}

@media (min-width: 860px) {
  .sources__policy {
    grid-template-columns: 1fr 1fr;
    gap: 34px;
  }
}

.policy__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 9px 0 0;
  padding-left: 16px;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.6;
}

.policy__list--bullets {
  list-style: disc;
}

.spin {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
