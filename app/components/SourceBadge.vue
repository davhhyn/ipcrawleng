<script setup lang="ts">
import { computed } from 'vue'
import { sourceAccent, sourceShort } from '#shared/sources'

const props = withDefaults(defineProps<{
  source: string
  label?: string
  compact?: boolean
}>(), {
  label: undefined,
  compact: false
})

const accent = computed(() => sourceAccent(props.source))
const short = computed(() => sourceShort(props.source))
</script>

<template>
  <span
    class="source-badge"
    :class="{ 'source-badge--compact': compact }"
    :style="{ '--accent': accent }"
    :title="label || source"
  >
    <span class="source-badge__dot" />
    <span class="source-badge__text">{{ compact ? short : (label || short) }}</span>
  </span>
</template>

<style scoped>
.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  text-transform: uppercase;
}

.source-badge__dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 8px color-mix(in oklab, var(--accent), transparent 45%);
}

.source-badge__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-badge--compact .source-badge__text {
  font-size: 8.5px;
  letter-spacing: 0.12em;
  color: var(--accent);
}
</style>
