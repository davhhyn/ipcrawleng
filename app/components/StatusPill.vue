<script setup lang="ts">
import { computed } from 'vue'
import type { CamStatus } from '#shared/explore'
import { STATUS_SHORT } from '#shared/labels'

const props = withDefaults(defineProps<{
  status: CamStatus
  demo?: boolean
  size?: 'sm' | 'md'
  dim?: boolean
}>(), {
  demo: false,
  size: 'sm',
  dim: false
})

const label = computed(() => {
  if (props.demo) return 'SEED'
  if (props.status === 'live') return 'LIVE'
  if (props.status === 'offline') return 'OFFLINE'
  if (props.status === 'page') return 'PAGE'
  return STATUS_SHORT.unknown
})

const tone = computed(() => {
  if (props.demo) return 'seed'
  if (props.status === 'live') return 'live'
  if (props.status === 'offline') return 'offline'
  if (props.status === 'page') return 'page'
  return 'unknown'
})
</script>

<template>
  <span
    class="pill"
    :class="[`pill--${tone}`, `pill--${size}`, { 'pill--dim': dim }]"
  >
    <span v-if="tone === 'live'" class="dot dot-live" />
    <span v-else class="pill__dot" />
    {{ label }}
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: rgba(4, 7, 11, 0.72);
  font-family: var(--font-mono);
  font-weight: 500;
  letter-spacing: 0.1em;
  white-space: nowrap;
  backdrop-filter: blur(6px);
}

.pill--sm {
  height: 20px;
  padding: 0 7px;
  font-size: 8.5px;
}

.pill--md {
  height: 26px;
  padding: 0 10px;
  font-size: 10px;
}

.pill__dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
}

.pill--live {
  color: var(--live);
  border-color: rgb(var(--live-rgb) / 0.35);
  background: rgba(6, 24, 19, 0.75);
}

.pill--unknown {
  color: var(--signal-bright);
  border-color: rgb(var(--signal-rgb) / 0.3);
  background: rgba(8, 16, 30, 0.75);
}

.pill--offline {
  color: var(--rose);
  border-color: rgb(255 125 144 / 0.3);
  background: rgba(26, 9, 13, 0.75);
}

.pill--page {
  color: var(--text-dim);
}

.pill--seed {
  color: var(--amber);
  border-color: rgb(var(--amber-rgb) / 0.32);
  background: rgba(28, 20, 8, 0.75);
}

.pill--dim {
  opacity: 0.7;
}
</style>
