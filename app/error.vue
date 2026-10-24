<script setup lang="ts">
import { computed } from 'vue'
import type { NuxtError } from '#app'
import { ArrowLeft, Compass, RefreshCw } from '@lucide/vue'

const props = defineProps<{ error: NuxtError }>()

const route = useRoute()

const status = computed(() => props.error?.statusCode ?? 500)

const copy = computed(() => {
  switch (status.value) {
    case 404:
      return {
        eyebrow: '404 · no signal',
        title: 'This camera isn’t in the index',
        body: 'The id may have been retired, mistyped, or removed at an operator’s request. The catalogue itself is still one click away.'
      }
    case 403:
      return {
        eyebrow: '403 · restricted',
        title: 'Not available here',
        body: 'This surface is restricted in the current deployment. Camera pages themselves remain public.'
      }
    case 503:
      return {
        eyebrow: '503 · catalogue offline',
        title: 'The index is warming up',
        body: 'The database is unavailable right now. If this is a fresh deployment, the first boot may still be creating the catalogue.'
      }
    default:
      return {
        eyebrow: `${status.value} · interrupted`,
        title: 'Something cut the feed',
        body: props.error?.statusMessage || 'An unexpected error occurred while rendering this page.'
      }
  }
})

useHead({
  title: () => copy.value.eyebrow.replace(' · ', ' — '),
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  robots: 'noindex,nofollow',
  description: () => copy.value.body
})

function goHome() {
  return clearError({ redirect: '/' })
}

function reset() {
  return clearError({ redirect: route.fullPath })
}
</script>

<template>
  <div class="err">
    <div class="err__grid" aria-hidden="true" />

    <div class="err__panel">
      <p class="eyebrow">{{ copy.eyebrow }}</p>
      <h1 class="err__title">{{ copy.title }}</h1>
      <p class="err__body">{{ copy.body }}</p>

      <div class="err__actions">
        <button class="btn btn-primary" type="button" @click="goHome">
          <Compass :size="15" aria-hidden="true" />
          Back to explore
        </button>
        <button v-if="status !== 404" class="btn" type="button" @click="reset">
          <RefreshCw :size="15" aria-hidden="true" />
          Try again
        </button>
        <NuxtLink to="/api" class="btn btn-ghost">
          <ArrowLeft :size="15" aria-hidden="true" />
          Read the API
        </NuxtLink>
      </div>

      <p v-if="error?.statusMessage && status !== 500" class="err__detail mono">{{ error.statusMessage }}</p>
    </div>

    <footer class="err__foot mono">
      IPCRAWL OPEN · PUBLIC CAMERA INDEX
    </footer>
  </div>
</template>

<style scoped>
.err {
  position: relative;
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 40px 20px;
  overflow: hidden;
}

.err__grid {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.5;
  background:
    radial-gradient(620px 340px at 50% 18%, rgb(122 167 255 / 0.16), transparent 65%),
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px) 0 0 / 100% 46px,
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px) 0 0 / 46px 100%;
  mask-image: radial-gradient(circle at 50% 40%, black, transparent 72%);
}

.err__panel {
  position: relative;
  z-index: 1;
  width: min(560px, 100%);
  padding: 34px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgb(8 11 17 / 0.82);
  backdrop-filter: blur(10px);
  box-shadow: 0 30px 90px rgb(0 0 0 / 0.45);
}

.err__title {
  margin: 10px 0 12px;
  font-size: clamp(24px, 4vw, 34px);
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.err__body {
  margin: 0 0 22px;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.6;
}

.err__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.err__detail {
  margin: 18px 0 0;
  color: var(--text-mute);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.err__foot {
  position: absolute;
  bottom: 22px;
  z-index: 1;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--text-mute);
}

@media (max-width: 560px) {
  .err__panel {
    padding: 24px;
  }
}
</style>
