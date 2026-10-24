<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  rows: { value: string, label?: string, count: number, accent?: string }[]
  limit?: number
  emptyText?: string
  formatValue?: (row: { value: string, label?: string, count: number }) => string
}>(), {
  limit: 8,
  emptyText: 'No data yet',
  formatValue: undefined
})

const visible = computed(() => props.rows.slice(0, props.limit))
const max = computed(() => Math.max(1, ...visible.value.map(row => row.count)))
const total = computed(() => visible.value.reduce((sum, row) => sum + row.count, 0) || 1)
</script>

<template>
  <section class="bar-list panel">
    <header class="bar-list__head">
      <p class="eyebrow">{{ title }}</p>
      <span class="bar-list__total mono">{{ rows.length }}</span>
    </header>

    <div v-if="visible.length" class="bar-list__rows">
      <div v-for="row in visible" :key="row.value" class="bar-list__row">
        <div class="bar-list__meta">
          <span class="bar-list__label">{{ row.label || row.value }}</span>
          <span class="bar-list__count mono">
            {{ formatValue ? formatValue(row) : row.count.toLocaleString() }}
          </span>
        </div>
        <div class="bar-list__track">
          <span
            class="bar-list__fill"
            :style="{
              width: `${Math.max(2, (row.count / max) * 100)}%`,
              background: row.accent
                ? `linear-gradient(90deg, ${row.accent}55, ${row.accent})`
                : undefined
            }"
          />
        </div>
      </div>
    </div>
    <p v-else class="bar-list__empty mono">{{ emptyText }}</p>
  </section>
</template>

<style scoped>
.bar-list {
  display: flex;
  flex-direction: column;
  padding: 15px 16px 16px;
}

.bar-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--line);
}

.bar-list__total {
  color: var(--text-mute);
  font-size: 9px;
}

.bar-list__rows {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 12px;
}

.bar-list__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.bar-list__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
  font-size: 11.5px;
}

.bar-list__count {
  flex: none;
  color: var(--text);
  font-size: 10px;
}

.bar-list__track {
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.045);
  overflow: hidden;
}

.bar-list__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--signal-rgb) / 0.35), var(--signal));
  transition: width 600ms cubic-bezier(0.22, 1, 0.36, 1);
}

.bar-list__empty {
  margin: 16px 0 4px;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.12em;
}
</style>
