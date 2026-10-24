<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: string | number
  hint?: string
  tone?: 'signal' | 'live' | 'amber' | 'neutral'
  icon?: unknown
}>(), {
  hint: '',
  tone: 'neutral',
  icon: undefined
})
</script>

<template>
  <div class="tile panel" :class="`tile--${tone}`">
    <div class="tile__head">
      <p class="eyebrow">{{ label }}</p>
      <component :is="icon" v-if="icon" :size="13" class="tile__icon" />
    </div>
    <p class="tile__value mono">{{ value }}</p>
    <p v-if="hint" class="tile__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 14px 15px 15px;
  overflow: hidden;
}

.tile::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, var(--accent, rgba(255, 255, 255, 0.12)), transparent);
  opacity: 0.8;
}

.tile--signal { --accent: var(--signal); }
.tile--live { --accent: var(--live); }
.tile--amber { --accent: var(--amber); }

.tile__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tile__icon {
  color: var(--accent, var(--text-mute));
  opacity: 0.85;
}

.tile__value {
  margin: 10px 0 0;
  font-size: 27px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--text);
}

.tile--live .tile__value { color: var(--live); }
.tile--signal .tile__value { color: var(--signal-bright); }
.tile--amber .tile__value { color: var(--amber); }

.tile__hint {
  margin: 7px 0 0;
  color: var(--text-mute);
  font-size: 10.5px;
  line-height: 1.45;
}
</style>
