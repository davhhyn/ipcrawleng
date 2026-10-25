<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Heart, MapPin } from '@lucide/vue'
import type { ExploreCamCard } from '#shared/explore'
import { countryFlag } from '#shared/countries'
import { KIND_LABELS } from '#shared/labels'
import { camPagePath } from '#shared/routes'

const props = withDefaults(defineProps<{
  card: ExploreCamCard
  index?: number
  eager?: boolean
}>(), {
  index: 0,
  eager: false
})

const emit = defineEmits<{ select: [card: ExploreCamCard, trigger: HTMLElement | null] }>()

const root = ref<HTMLElement | null>(null)
const inView = ref(false)
const loaded = ref(false)
const errored = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (props.eager || typeof IntersectionObserver === 'undefined') {
    inView.value = true
    return
  }
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        inView.value = true
        observer?.disconnect()
        observer = null
        break
      }
    }
  }, { rootMargin: '420px' })
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const favorites = useFavorites()
const fav = computed(() => favorites.isFavorite(props.card.id))
const favCount = computed(() => favorites.countOf(props.card.id, props.card.favCount))
const flag = computed(() => countryFlag(props.card.countryCode))
const location = computed(() => props.card.location || 'Location unlisted')
const typeLabel = (card: ExploreCamCard) => KIND_LABELS[card.kind] ?? 'Camera'

function onHit(event: MouseEvent) {
  // Modifier and middle clicks keep the link's real navigation target.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  emit('select', props.card, event.currentTarget as HTMLElement | null)
}
</script>

<template>
  <article ref="root" class="card">
    <div class="card__media">
      <a
        :href="camPagePath(card.id)"
        class="card__hit"
        :aria-label="`Open ${card.title}`"
        :title="card.title"
        @click="onHit"
      />

      <div v-if="!loaded && !errored" class="card__skeleton skeleton" />
      <img
        v-if="inView && !errored"
        :src="card.thumb"
        :alt="`${card.title} — ${location}`"
        class="card__img"
        :class="{ 'card__img--ready': loaded }"
        :loading="eager ? 'eager' : 'lazy'"
        decoding="async"
        referrerpolicy="no-referrer"
        @load="loaded = true"
        @error="errored = true"
      >
      <div v-if="errored" class="card__fallback">
        <span class="mono">NO PREVIEW</span>
      </div>

      <div class="card__top">
        <StatusPill :status="card.status" :demo="card.isDemo" />
        <SourceBadge :source="card.source" :label="card.sourceLabel" compact />
      </div>

      <button
        type="button"
        class="card__fav"
        :class="{ 'card__fav--on': fav }"
        :aria-pressed="fav"
        :aria-label="fav ? `Remove ${card.title} from favorites` : `Add ${card.title} to favorites`"
        @click.stop="favorites.toggle(card.id, card.favCount)"
      >
        <Heart :size="13" :fill="fav ? 'currentColor' : 'none'" />
        <span v-if="favCount > 0" class="card__fav-count">{{ favCount }}</span>
      </button>

      <div class="card__gradient" />
      <div class="card__caption">
        <p class="card__title">{{ card.title }}</p>
        <p class="card__loc">
          <span v-if="flag" class="card__flag">{{ flag }}</span>
          <MapPin :size="10" class="card__pin" />
          <span class="card__loc-text">{{ location }}</span>
        </p>
      </div>
    </div>

    <footer class="card__meta">
      <span class="card__vendor">{{ card.vendor || typeLabel(card) }}</span>
      <span class="card__sep" />
      <span class="card__time mono">{{ card.isDemo ? 'seed entry' : relativeTime(card.lastSeenAt) }}</span>
    </footer>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: rgba(9, 13, 20, 0.6);
  overflow: hidden;
  transition: border-color 180ms ease, transform 200ms ease, box-shadow 220ms ease;
}

.card:hover {
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-3px);
  box-shadow: 0 26px 60px -34px rgba(0, 0, 0, 0.95), 0 0 0 1px rgb(var(--signal-rgb) / 0.07);
}

.card:has(.card__hit:focus-visible) {
  outline: 2px solid var(--signal);
  outline-offset: 3px;
}

.card__media {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: #060a10;
}

.card__hit {
  position: absolute;
  inset: 0;
  z-index: 4;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  appearance: none;
}

.card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.015);
  transition: opacity 500ms ease, transform 900ms ease;
}

.card__img--ready {
  opacity: 1;
  transform: scale(1);
}

.card:hover .card__img {
  transform: scale(1.045);
}

.card__skeleton {
  position: absolute;
  inset: 0;
}

.card__fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: 0.2em;
  background: repeating-linear-gradient(45deg, #070c12, #070c12 6px, #0a1018 6px, #0a1018 12px);
}

.card__top {
  position: absolute;
  top: 9px;
  left: 9px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 7px;
  pointer-events: none;
}

.card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(3, 6, 10, 0.72);
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 9px;
  cursor: pointer;
  opacity: 0.85;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, opacity 150ms ease;
}

.card:hover .card__fav {
  opacity: 1;
}

.card__fav:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}

.card__fav--on {
  color: var(--rose);
  border-color: rgb(255 125 144 / 0.42);
  background: rgba(38, 10, 16, 0.82);
}

.card__fav-count {
  font-size: 9px;
}

.card__gradient {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(to top, rgba(3, 6, 10, 0.94) 0%, rgba(3, 6, 10, 0.45) 26%, transparent 55%);
}

.card__caption {
  position: absolute;
  right: 12px;
  bottom: 10px;
  left: 12px;
  z-index: 3;
  pointer-events: none;
}

.card__title {
  margin: 0;
  color: #f5f8ff;
  font-size: 13.5px;
  font-weight: 560;
  line-height: 1.28;
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.7);
}

.card__loc {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 5px 0 0;
  color: rgba(220, 231, 248, 0.72);
  font-size: 10.5px;
  overflow: hidden;
}

.card__flag {
  font-size: 10px;
  line-height: 1;
}

.card__pin {
  flex: none;
  opacity: 0.6;
}

.card__loc-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border-top: 1px solid var(--line);
  background: rgba(6, 9, 14, 0.7);
  font-size: 10px;
  color: var(--text-mute);
}

.card__vendor {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
}

.card__sep {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.card__time {
  font-size: 9px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
</style>
