<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Link2,
  Radio,
  Shuffle,
  Tv
} from '@lucide/vue'
import type { FunCamResponse, FunChannel } from '#shared/fun'
import { SOURCES, sourceShort } from '#shared/sources'
import { countryFlag } from '#shared/countries'
import { formatLatLon } from '#shared/geo'
import { camPagePath, funChannelPath } from '#shared/routes'

definePageMeta({ name: 'fun-channel', layout: false })

const route = useRoute()
const router = useRouter()
const camId = computed(() => String(route.params.id))

const { data, error, refresh } = await useFetch<FunCamResponse>(() => `/api/fun/cam/${camId.value}`, {
  key: () => `fun-${camId.value}`,
  default: () => ({ channel: null, total: 0, demoMode: true })
})

const channel = computed<FunChannel | null>(() => data.value?.channel ?? null)

const liveOnly = ref(false)
const sourceFilter = ref<string | null>(null)
const guessMode = ref(false)
const revealed = ref(false)
const switching = ref(false)
const frameKey = ref(0)
const frameLoaded = ref(false)
const clock = ref('')
const recent = ref<string[]>([])
const favorites = useFavorites()
const toast = useToasts()

const channelNumber = computed(() => {
  if (!channel.value) return '---'
  let hash = 0
  for (const char of channel.value.id) hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return String(100 + (hash % 900))
})

const locationHidden = computed(() => guessMode.value && !revealed.value)

useHead({
  title: () => (channel.value ? `CH ${channelNumber.value} · ${channel.value.title}` : 'Fun mode')
})

const solarTime = computed(() => {
  const lon = channel.value?.lon
  if (typeof lon !== 'number') return null
  const now = new Date()
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const offset = Math.round((lon / 15) * 60)
  const total = ((utcMinutes + offset) % 1440 + 1440) % 1440
  const hours = String(Math.floor(total / 60)).padStart(2, '0')
  const minutes = String(total % 60).padStart(2, '0')
  return `${hours}:${minutes}`
})

const isFavorite = computed(() => (channel.value ? favorites.isFavorite(channel.value.id) : false))

function tickClock() {
  const now = new Date()
  clock.value = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

let clockTimer: ReturnType<typeof setInterval> | null = null
let frameTimer: ReturnType<typeof setInterval> | null = null

function bumpFrame() {
  frameKey.value++
  frameLoaded.value = false
}

async function nextChannel(direction: 1 | -1 = 1) {
  if (switching.value) return
  switching.value = true
  try {
    const currentId = channel.value?.id
    if (currentId) {
      recent.value = [currentId, ...recent.value.filter(id => id !== currentId)].slice(0, 8)
    }
    const params = new URLSearchParams()
    if (liveOnly.value) params.set('live', '1')
    if (sourceFilter.value) params.set('source', sourceFilter.value)
    if (recent.value.length) params.set('exclude', recent.value.join(','))
    const response = await $fetch<FunCamResponse>(`/api/fun/cam?${params.toString()}`)
    if (!response.channel) {
      toast.push('No channels match those filters.', 'warn')
      return
    }
    revealed.value = false
    await router.push(funChannelPath(response.channel.id))
    bumpFrame()
  } catch {
    toast.push('Could not tune the next channel.', 'error')
  } finally {
    switching.value = false
  }
}

function toggleGuess() {
  guessMode.value = !guessMode.value
  revealed.value = false
}

function reveal() {
  revealed.value = true
}

async function share() {
  if (!channel.value || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.push('Channel link copied.', 'success')
  } catch {
    toast.push('Copy failed — your browser blocked clipboard access.', 'error')
  }
}

function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  const key = event.key.toLowerCase()
  if (key === 'arrowright' || key === ' ' || key === 'n') {
    event.preventDefault()
    void nextChannel(1)
  } else if (key === 'arrowleft' || key === 'p') {
    event.preventDefault()
    void nextChannel(-1)
  } else if (key === 'g') {
    toggleGuess()
  } else if (key === 'l') {
    liveOnly.value = !liveOnly.value
  } else if (key === 'f' && channel.value) {
    void favorites.toggle(channel.value.id, channel.value.favCount)
  } else if (key === 'r') {
    bumpFrame()
  } else if (key === 'escape') {
    void router.push('/')
  }
}

onMounted(() => {
  tickClock()
  clockTimer = setInterval(tickClock, 1000)
  frameTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && channel.value?.isLive) bumpFrame()
  }, 6000)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (frameTimer) clearInterval(frameTimer)
  window.removeEventListener('keydown', onKey)
})

watch(camId, () => {
  revealed.value = false
  bumpFrame()
})

const frameSrc = computed(() => {
  if (!channel.value) return ''
  const base = channel.value.frame
  return `${base}${base.includes('?') ? '&' : '?'}v=${frameKey.value}`
})
</script>

<template>
  <div class="fun">
    <div class="fun__bg" />

    <header class="fun__bar">
      <NuxtLink to="/" class="fun__back">
        <ArrowLeft :size="13" />
        <span class="mono">CATALOGUE</span>
      </NuxtLink>

      <div class="fun__brand mono">
        <span class="fun__brand-mark">IPCRAWL</span>
        <span class="fun__brand-sub">FUN MODE</span>
      </div>

      <div class="fun__bar-right">
        <span v-if="data?.demoMode" class="chip chip-amber demo">SEED</span>
        <span class="fun__clock mono">{{ clock }}</span>
        <button type="button" class="fun__icon" aria-label="Share channel" @click="share">
          <Link2 :size="14" />
        </button>
      </div>
    </header>

    <main class="fun__stage">
      <div v-if="error || !channel" class="fun__missing">
        <Tv :size="30" />
        <p class="mono">CHANNEL {{ channelNumber }} IS OFF AIR</p>
        <div class="fun__missing-actions">
          <button type="button" class="btn btn-sm" @click="refresh()">Retry</button>
          <button type="button" class="btn btn-sm btn-primary" @click="nextChannel(1)">
            <Shuffle :size="12" /> Next channel
          </button>
        </div>
      </div>

      <template v-else>
        <div class="tv" :class="{ 'tv--switching': switching, 'tv--guess': guessMode }">
          <div class="tv__screen scanlines grain">
            <Transition name="roll">
              <img
                :key="`${channel.id}-${frameKey}`"
                :src="frameSrc"
                :alt="`Frame from channel ${channelNumber}`"
                class="tv__frame"
                :class="{ 'tv__frame--in': frameLoaded }"
                decoding="async"
                referrerpolicy="no-referrer"
                @load="frameLoaded = true"
              >
            </Transition>

            <div class="tv__noise" />

            <div class="tv__hud tv__hud--tl mono">
              <span class="tv__ch">CH {{ channelNumber }}</span>
              <span class="tv__sep">/</span>
              <span>{{ sourceShort(channel.source) }}</span>
            </div>

            <div class="tv__hud tv__hud--tr mono">
              <span class="dot" :class="channel.isLive ? 'dot-live' : ''" />
              {{ channel.isLive ? 'LIVE' : 'STILL' }}
              <span v-if="solarTime" class="tv__time">· {{ solarTime }} SOLAR</span>
            </div>

            <div class="tv__hud tv__hud--bl mono">
              <template v-if="locationHidden">LOCATION HIDDEN</template>
              <template v-else>
                {{ channel.city || channel.country || 'UNKNOWN LOCATION' }}
                <template v-if="channel.countryCode"> {{ countryFlag(channel.countryCode) }}</template>
              </template>
            </div>

            <div class="tv__hud tv__hud--br mono">
              {{ channel.kind.toUpperCase() }} · {{ channel.status.toUpperCase() }}
            </div>

            <div v-if="data?.demoMode" class="tv__stamp mono">
              SEED ENTRY · GUIDED PREVIEW
            </div>

            <button
              v-if="guessMode && !revealed"
              type="button"
              class="tv__reveal"
              @click="reveal"
            >
              <Eye :size="14" />
              Reveal location
            </button>
          </div>

          <div class="tv__info">
            <div class="tv__info-main">
              <p class="tv__title">{{ channel.title }}</p>
              <p class="tv__loc">
                <template v-if="locationHidden">
                  <EyeOff :size="11" />
                  Guess where this is — press <kbd>G</kbd> to toggle, then reveal.
                </template>
                <template v-else>
                  {{ channel.location || 'Location unlisted' }}
                  <span v-if="channel.lat != null" class="tv__coords mono">
                    · {{ formatLatLon(channel.lat, channel.lon) }}
                  </span>
                </template>
              </p>
              <p class="tv__src mono">
                <span class="dot" :style="{ background: channel.source === 'curated' ? '#a78bfa' : undefined }" />
                {{ channel.sourceLabel }}
                <span class="tv__sep">·</span>
                {{ channel.vendor || 'operator unknown' }}
                <span class="tv__sep">·</span>
                {{ channel.favCount }} ♥
              </p>
            </div>

            <div class="tv__actions">
              <button
                type="button"
                class="tv__btn"
                :class="{ 'tv__btn--on': isFavorite }"
                :aria-pressed="isFavorite"
                aria-label="Favorite this channel"
                @click="favorites.toggle(channel.id, channel.favCount)"
              >
                <Heart :size="14" :fill="isFavorite ? 'currentColor' : 'none'" />
              </button>
              <button
                type="button"
                class="tv__btn"
                :class="{ 'tv__btn--on': guessMode }"
                aria-label="Toggle guess mode"
                :aria-pressed="guessMode"
                @click="toggleGuess"
              >
                <EyeOff :size="14" />
              </button>
              <NuxtLink :to="camPagePath(channel.id)" class="tv__btn" aria-label="Open camera page">
                <ArrowUpRight :size="14" />
              </NuxtLink>
              <button
                type="button"
                class="tv__next"
                :disabled="switching"
                @click="nextChannel(1)"
              >
                <ChevronRight :size="15" />
                <span class="mono">NEXT</span>
              </button>
            </div>
          </div>
        </div>

        <div class="fun__controls">
          <button type="button" class="fun__ctrl" :disabled="switching" @click="nextChannel(-1)">
            <ChevronLeft :size="14" />
            Previous
          </button>
          <button
            type="button"
            class="fun__ctrl"
            :class="{ 'fun__ctrl--on': liveOnly }"
            @click="liveOnly = !liveOnly"
          >
            <Radio :size="12" />
            Live only
          </button>
          <label class="fun__select">
            <span class="mono">SOURCE</span>
            <select
              class="select"
              :value="sourceFilter ?? ''"
              @change="sourceFilter = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">Any source</option>
              <option v-for="source in SOURCES" :key="source.id" :value="source.id">
                {{ source.label }}
              </option>
            </select>
          </label>
          <p class="fun__hint mono">
            KEYS · <kbd>→</kbd> NEXT · <kbd>F</kbd> FAVORITE · <kbd>G</kbd> GUESS · <kbd>R</kbd> REFRESH
          </p>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.fun {
  position: relative;
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background: #020406;
  color: var(--text);
  overflow: hidden;
}

.fun__bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(900px 620px at 50% -10%, rgb(var(--signal-rgb) / 0.13), transparent 62%),
    radial-gradient(700px 700px at 50% 120%, rgb(var(--live-rgb) / 0.06), transparent 60%);
}

.fun__bar {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 20px;
}

.fun__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.14em;
}

.fun__back:hover {
  color: var(--text);
}

.fun__brand {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.24em;
}

.fun__brand-mark {
  color: var(--text);
  font-weight: 700;
}

.fun__brand-sub {
  padding: 2px 6px;
  border: 1px solid rgb(var(--live-rgb) / 0.35);
  border-radius: 4px;
  color: var(--live);
  font-size: 7.5px;
  letter-spacing: 0.18em;
}

.fun__bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.demo {
  display: none;
}

@media (min-width: 560px) {
  .demo { display: inline-flex; }
}

.fun__clock {
  color: var(--text-mute);
  font-size: 10px;
  letter-spacing: 0.1em;
}

.fun__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
  cursor: pointer;
}

.fun__icon:hover {
  color: #fff;
}

.fun__stage {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 18px 26px;
}

/* CRT */
.tv {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 22px;
  background: linear-gradient(180deg, #080c12, #04070a);
  box-shadow:
    0 60px 140px -60px rgba(0, 0, 0, 1),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: opacity 200ms ease;
}

.tv--switching {
  opacity: 0.55;
}

.tv__screen {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #010304;
  overflow: hidden;
}

.tv__frame {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.03);
  transition: opacity 700ms ease, transform 1600ms ease;
  filter: saturate(1.08) contrast(1.03);
}

.tv__frame--in {
  opacity: 1;
  transform: scale(1);
}

.tv__noise {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: noiseShift 420ms steps(3) infinite;
}

@keyframes noiseShift {
  0% { transform: translate(0, 0); }
  33% { transform: translate(-2%, 1%); }
  66% { transform: translate(1%, -2%); }
  100% { transform: translate(0, 0); }
}

.tv__screen::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: 18px;
  background:
    radial-gradient(130% 100% at 50% 48%, transparent 52%, rgba(0, 0, 0, 0.62) 100%),
    linear-gradient(180deg, rgba(122, 167, 255, 0.05), transparent 22%, transparent 80%, rgba(0, 0, 0, 0.35));
  box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.7);
}

.tv__hud {
  position: absolute;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(233, 240, 252, 0.78);
  font-size: 8.5px;
  letter-spacing: 0.16em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.9);
}

.tv__hud--tl { top: 14px; left: 16px; }
.tv__hud--tr { top: 14px; right: 16px; }
.tv__hud--bl { bottom: 14px; left: 16px; }
.tv__hud--br { bottom: 14px; right: 16px; color: rgba(233, 240, 252, 0.5); }

.tv__ch {
  color: var(--live);
}

.tv__sep {
  opacity: 0.35;
  padding: 0 2px;
}

.tv__stamp {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  transform: translate(-50%, -50%);
  padding: 3px 8px;
  border: 1px solid rgb(var(--amber-rgb) / 0.35);
  border-radius: 4px;
  background: rgba(8, 6, 2, 0.6);
  color: var(--amber);
  font-size: 7.5px;
  letter-spacing: 0.18em;
  opacity: 0.85;
}

.tv__reveal {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transform: translate(-50%, -50%);
  padding: 9px 15px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(4, 7, 11, 0.86);
  color: var(--text);
  font-size: 11.5px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.tv__reveal:hover {
  border-color: var(--signal);
  color: var(--signal-bright);
}

.tv--guess .tv__frame {
  filter: saturate(0.9) contrast(1.02) blur(0.2px);
}

.tv__info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(8, 12, 18, 0.7), rgba(4, 7, 10, 0.9));
}

.tv__info-main {
  min-width: 0;
  flex: 1;
}

.tv__title {
  margin: 0;
  font-size: 16px;
  font-weight: 560;
  letter-spacing: -0.02em;
  color: #f6f9ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tv__loc {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 5px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  flex-wrap: wrap;
}

.tv__coords {
  color: var(--text-mute);
  font-size: 9.5px;
}

.tv__src {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 5px 0 0;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.08em;
}

.tv__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tv__btn {
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
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}

.tv__btn:hover {
  color: #fff;
  border-color: var(--line-strong);
}

.tv__btn--on {
  color: var(--live);
  border-color: rgb(var(--live-rgb) / 0.4);
  background: rgb(var(--live-rgb) / 0.08);
}

.tv__next {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--live);
  border-radius: 9px;
  background: var(--live);
  color: #04120d;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.tv__next:hover {
  background: #9ffbd7;
  border-color: #9ffbd7;
}

.tv__next:disabled {
  opacity: 0.5;
  cursor: wait;
}

.fun__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.fun__ctrl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
}

.fun__ctrl:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.fun__ctrl--on {
  color: var(--live);
  border-color: rgb(var(--live-rgb) / 0.4);
  background: rgb(var(--live-rgb) / 0.08);
}

.fun__select {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.fun__select span {
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.14em;
}

.fun__select .select {
  height: 32px;
  font-size: 11px;
}

.fun__hint {
  margin: 0 0 0 auto;
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.fun__hint kbd,
.tv__loc kbd {
  padding: 1px 4px;
  border: 1px solid var(--line-strong);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-dim);
}

.fun__missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 70px 20px;
  color: var(--text-mute);
  text-align: center;
}

.fun__missing p {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.fun__missing-actions {
  display: flex;
  gap: 8px;
}

/* Channel-change roll */
.roll-enter-active {
  transition: opacity 120ms ease, transform 220ms ease;
}

.roll-enter-from {
  opacity: 0;
  transform: scale(1.04);
}

.roll-leave-active {
  position: absolute;
  inset: 0;
  transition: opacity 160ms ease;
}

.roll-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .fun__hint { display: none; }
  .tv__hud--br { display: none; }
  .tv__title { font-size: 14px; }
  .tv__info { padding: 12px 13px; }
}
</style>
