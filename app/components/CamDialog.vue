<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Heart,
  MapPin,
  Maximize2,
  RefreshCw,
  Shuffle,
  Tag,
  X
} from '@lucide/vue'
import type { ExploreCamDetail } from '#shared/explore'
import { KIND_LABELS, STATUS_LABELS } from '#shared/labels'
import { apiExploreCamPath, camPagePath, funChannelPath } from '#shared/routes'
import { countryFlag } from '#shared/countries'
import { formatLatLon } from '#shared/geo'

const props = defineProps<{
  camId: string | null
}>()

const emit = defineEmits<{ close: [], step: [direction: 1 | -1] }>()

const detail = ref<ExploreCamDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const frameKey = ref(0)
const frameLoading = ref(true)
const frameFailed = ref(false)
const expanded = ref(false)
const panel = ref<HTMLElement | null>(null)

const favorites = useFavorites()
const toast = useToasts()

const fav = computed(() => (detail.value ? favorites.isFavorite(detail.value.id) : false))
const favCount = computed(() => (
  detail.value ? favorites.countOf(detail.value.id, detail.value.favCount) : 0
))
const flag = computed(() => countryFlag(detail.value?.countryCode))

async function load(id: string) {
  loading.value = true
  error.value = null
  frameFailed.value = false
  frameLoading.value = true
  try {
    detail.value = await $fetch<ExploreCamDetail>(apiExploreCamPath(id))
    favorites.register(id, detail.value.favCount)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load this camera.'
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.camId, (id) => {
  if (id) {
    void load(id)
  } else {
    detail.value = null
  }
}, { immediate: true })

function refreshFrame() {
  frameLoading.value = true
  frameFailed.value = false
  frameKey.value++
}

function onFrameLoad() {
  frameLoading.value = false
  frameFailed.value = false
}

function onFrameError() {
  frameLoading.value = false
  frameFailed.value = true
}

async function copyLink() {
  if (!detail.value || !import.meta.client) return
  const url = `${window.location.origin}/?cam=${detail.value.id}`
  try {
    await navigator.clipboard.writeText(url)
    toast.push('Camera link copied.', 'success')
  } catch {
    toast.push('Copy failed — your browser blocked clipboard access.', 'error')
  }
}

function onKey(event: KeyboardEvent) {
  if (!props.camId) return
  if (event.key === 'Escape') {
    if (expanded.value) expanded.value = false
    else emit('close')
  }
  if (event.key === 'ArrowRight') emit('step', 1)
  if (event.key === 'ArrowLeft') emit('step', -1)
  if (event.key.toLowerCase() === 'r') refreshFrame()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  expanded.value = false
})

const sourceHref = computed(() => detail.value?.sourceUrl || null)
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="camId"
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="detail?.title || 'Camera'"
        @click.self="emit('close')"
      >
        <div ref="panel" class="dialog__panel" :class="{ 'dialog__panel--expanded': expanded }">
          <header class="dialog__head">
            <div class="dialog__ident">
              <div class="dialog__chips">
                <StatusPill v-if="detail" :status="detail.status" :demo="detail.isDemo" size="md" />
                <SourceBadge v-if="detail" :source="detail.source" :label="detail.sourceLabel" />
                <span v-if="detail" class="chip">{{ KIND_LABELS[detail.kind] }}</span>
              </div>
              <h2 class="dialog__title">{{ detail?.title || (loading ? 'Loading camera…' : 'Camera') }}</h2>
              <p class="dialog__sub">
                <span v-if="flag">{{ flag }}</span>
                <MapPin :size="11" />
                {{ detail?.location || 'Location unlisted' }}
                <template v-if="detail?.lat != null">
                  <span class="dialog__dot">·</span>
                  <span class="mono">{{ formatLatLon(detail.lat, detail.lon) }}</span>
                </template>
              </p>
            </div>

            <div class="dialog__actions">
              <button
                v-if="detail"
                type="button"
                class="icon-btn"
                :class="{ 'icon-btn--on': fav }"
                :aria-pressed="fav"
                :aria-label="fav ? 'Remove favorite' : 'Add favorite'"
                @click="favorites.toggle(detail.id, detail.favCount)"
              >
                <Heart :size="15" :fill="fav ? 'currentColor' : 'none'" />
              </button>
              <button type="button" class="icon-btn" aria-label="Copy link" @click="copyLink">
                <Copy :size="14" />
              </button>
              <button type="button" class="icon-btn" aria-label="Previous camera" @click="emit('step', -1)">
                <ChevronLeft :size="17" />
              </button>
              <button type="button" class="icon-btn" aria-label="Next camera" @click="emit('step', 1)">
                <ChevronRight :size="17" />
              </button>
              <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')">
                <X :size="16" />
              </button>
            </div>
          </header>

          <div class="dialog__body">
            <div class="dialog__viewer">
              <div v-if="error" class="dialog__error">
                <p>{{ error }}</p>
                <button type="button" class="btn btn-sm" @click="camId && load(camId)">Try again</button>
              </div>

              <template v-else>
                <div class="viewer__frame scanlines grain" :class="{ 'viewer__frame--expanded': expanded }">
                  <img
                    v-if="detail"
                    :key="frameKey"
                    :src="`${detail.frame}${detail.frame.includes('?') ? '&' : '?'}v=${frameKey}`"
                    :alt="`Latest frame from ${detail.title}`"
                    class="viewer__img"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    @load="onFrameLoad"
                    @error="onFrameError"
                  >
                  <div v-if="frameLoading" class="viewer__loading">
                    <span class="spinner" />
                    <span class="mono">REQUESTING FRAME…</span>
                  </div>
                  <div v-if="frameFailed" class="viewer__failed">
                    <p class="mono">FRAME UNAVAILABLE</p>
                    <button type="button" class="btn btn-sm" @click="refreshFrame">Retry</button>
                  </div>

                  <div class="viewer__hud viewer__hud--tl mono">
                    <span class="dot" :class="detail?.status === 'live' ? 'dot-live' : ''" />
                    {{ detail?.sourceLabel || '—' }}
                  </div>
                  <div class="viewer__hud viewer__hud--tr mono">
                    {{ detail?.probe.checkedAt ? relativeTime(detail.probe.checkedAt) : 'never probed' }}
                  </div>
                  <div class="viewer__hud viewer__hud--bl mono">
                    {{ detail?.protocol || (detail ? KIND_LABELS[detail.kind] : '') }}
                  </div>

                  <div class="viewer__controls">
                    <button type="button" class="viewer__btn" aria-label="Refresh frame" @click="refreshFrame">
                      <RefreshCw :size="14" />
                    </button>
                    <button
                      type="button"
                      class="viewer__btn"
                      :aria-label="expanded ? 'Exit fullscreen' : 'Expand frame'"
                      @click="expanded = !expanded"
                    >
                      <Maximize2 :size="14" />
                    </button>
                  </div>
                </div>

                <p class="viewer__note">
                  <template v-if="detail?.isDemo">
                    Seed entry from the bundled dataset — an illustrative landmark
                    location, not a live feed.
                  </template>
                  <template v-else-if="detail?.status === 'live'">
                    Frame fetched from the camera's public endpoint.
                  </template>
                  <template v-else-if="detail?.status === 'page'">
                    This camera has no published frame endpoint; the catalogue links
                    to its public page. The preview is generated.
                  </template>
                  <template v-else>
                    No frame could be fetched in the last probe round. The preview is
                    generated from the camera's metadata.
                  </template>
                </p>
              </template>
            </div>

            <aside class="dialog__side">
              <section v-if="detail" class="side__block">
                <p class="eyebrow">Metadata</p>
                <dl class="meta">
                  <div class="meta__row">
                    <dt>Status</dt>
                    <dd>{{ STATUS_LABELS[detail.status] }}</dd>
                  </div>
                  <div class="meta__row">
                    <dt>Favorites</dt>
                    <dd class="mono">{{ favCount }}</dd>
                  </div>
                  <div class="meta__row">
                    <dt>Vendor</dt>
                    <dd>{{ detail.vendor || '—' }}</dd>
                  </div>
                  <div class="meta__row">
                    <dt>Operator</dt>
                    <dd>{{ detail.attribution || '—' }}</dd>
                  </div>
                  <div class="meta__row">
                    <dt>Licence</dt>
                    <dd>{{ detail.license || '—' }}</dd>
                  </div>
                  <div v-if="detail.port" class="meta__row">
                    <dt>Port</dt>
                    <dd class="mono">{{ detail.port }}</dd>
                  </div>
                  <div class="meta__row">
                    <dt>Last probe</dt>
                    <dd>{{ detail.probe.checkedAt ? relativeTime(detail.probe.checkedAt) : 'never' }}</dd>
                  </div>
                  <div v-if="detail.probe.httpStatus" class="meta__row">
                    <dt>HTTP</dt>
                    <dd class="mono">{{ detail.probe.httpStatus }}</dd>
                  </div>
                  <div v-if="detail.probe.error" class="meta__row">
                    <dt>Probe note</dt>
                    <dd class="meta__err">{{ detail.probe.error }}</dd>
                  </div>
                  <div class="meta__row">
                    <dt>First seen</dt>
                    <dd>{{ relativeTime(detail.firstSeenAt) }}</dd>
                  </div>
                </dl>
              </section>

              <section v-if="detail?.tags?.length" class="side__block">
                <p class="eyebrow">
                  <Tag :size="10" /> Tags
                </p>
                <div class="tag-row">
                  <span v-for="tag in detail.tags" :key="tag" class="chip">{{ tag }}</span>
                </div>
              </section>

              <section class="side__block">
                <p class="eyebrow"><MapPin :size="10" /> Location</p>
                <MiniMap
                  :lat="detail?.lat ?? null"
                  :lon="detail?.lon ?? null"
                  :label="detail?.city || detail?.country || ''"
                  :height="132"
                />
              </section>

              <section class="side__block side__block--actions">
                <a
                  v-if="sourceHref"
                  :href="sourceHref"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-sm"
                >
                  Public source page
                  <ArrowUpRight :size="12" />
                </a>
                <NuxtLink v-if="detail" :to="camPagePath(detail.id)" class="btn btn-sm">
                  <ExternalLink :size="12" />
                  Open camera page
                </NuxtLink>
                <NuxtLink v-if="detail" :to="funChannelPath(detail.id)" class="btn btn-sm">
                  <Shuffle :size="12" />
                  Open in Fun mode
                </NuxtLink>
                <NuxtLink
                  v-if="detail && detail.lat != null"
                  :to="`/map?cam=${detail.id}`"
                  class="btn btn-sm"
                >
                  <MapPin :size="12" />
                  Show on atlas
                </NuxtLink>
                <span class="mono side__foot">
                  <Clock :size="10" />
                  Indexed {{ relativeTime(detail?.firstSeenAt) }}
                </span>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(2, 4, 7, 0.76);
  backdrop-filter: blur(10px);
}

.dialog__panel {
  display: flex;
  width: min(1180px, 100%);
  max-height: calc(100dvh - 36px);
  flex-direction: column;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: linear-gradient(180deg, #0a0e16, #06090f);
  box-shadow: 0 50px 120px -40px rgba(0, 0, 0, 0.95);
  overflow: hidden;
}

.dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--line);
}

.dialog__ident {
  min-width: 0;
  flex: 1;
}

.dialog__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.dialog__title {
  margin: 0;
  font-size: clamp(17px, 2.2vw, 22px);
  font-weight: 560;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #f6f9ff;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog__sub {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  flex-wrap: wrap;
}

.dialog__dot {
  opacity: 0.4;
}

.dialog__sub .mono {
  font-size: 10.5px;
  color: var(--text-mute);
}

.dialog__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.icon-btn--on {
  color: var(--rose);
  border-color: rgb(255 125 144 / 0.4);
  background: rgb(255 125 144 / 0.1);
}

.dialog__body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  overflow: auto;
}

@media (min-width: 980px) {
  .dialog__body {
    grid-template-columns: minmax(0, 1fr) 318px;
    overflow: hidden;
  }
}

.dialog__viewer {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 16px;
  gap: 10px;
}

@media (min-width: 980px) {
  .dialog__viewer {
    overflow: auto;
  }
}

.viewer__frame {
  position: relative;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #04070b;
  overflow: hidden;
}

.viewer__frame--expanded {
  position: fixed;
  inset: 12px;
  z-index: 95;
  aspect-ratio: auto;
  border-radius: 12px;
}

.viewer__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.viewer__loading,
.viewer__failed {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(4, 7, 11, 0.72);
  color: var(--text-dim);
  font-size: 9.5px;
  letter-spacing: 0.18em;
}

.viewer__failed p {
  margin: 0;
  color: var(--rose);
}

.spinner {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-top-color: var(--signal);
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.viewer__hud {
  position: absolute;
  z-index: 3;
  font-size: 8.5px;
  letter-spacing: 0.14em;
  color: rgba(233, 240, 252, 0.82);
  text-transform: uppercase;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.viewer__hud--tl { top: 10px; left: 12px; }
.viewer__hud--tr { top: 10px; right: 12px; }
.viewer__hud--bl { bottom: 10px; left: 12px; }

.viewer__controls {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 3;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 160ms ease;
}

.viewer__frame:hover .viewer__controls,
.viewer__frame:focus-within .viewer__controls {
  opacity: 1;
}

.viewer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(3, 6, 10, 0.78);
  color: var(--text-dim);
  cursor: pointer;
}

.viewer__btn:hover {
  color: #fff;
}

.viewer__note {
  margin: 0;
  color: var(--text-mute);
  font-size: 10.5px;
  line-height: 1.55;
}

.dialog__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--line);
  background: rgba(5, 8, 13, 0.6);
}

@media (min-width: 980px) {
  .dialog__side {
    overflow: auto;
    border-top: 0;
    border-left: 1px solid var(--line);
  }
}

.side__block .eyebrow {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
}

.meta__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
  font-size: 11px;
}

.meta__row:last-child {
  border-bottom: 0;
}

.meta__row dt {
  color: var(--text-mute);
  flex: none;
}

.meta__row dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  overflow-wrap: anywhere;
}

.meta__err {
  color: var(--amber);
  font-size: 10px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag-row .chip {
  height: 22px;
  font-size: 9px;
  letter-spacing: 0.02em;
  text-transform: none;
}

.side__block--actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.side__block--actions .btn {
  justify-content: flex-start;
}

.side__foot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.08em;
}

.dialog__error {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-dim);
  font-size: 12px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 200ms ease;
}

.dialog-enter-active .dialog__panel,
.dialog-leave-active .dialog__panel {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog__panel,
.dialog-leave-to .dialog__panel {
  transform: translateY(14px) scale(0.985);
  opacity: 0;
}
</style>
