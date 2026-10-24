<script setup lang="ts">
import { computed } from 'vue'
import { WORLD_COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH, projectLat, projectLon } from '#shared/worldGeo'

const props = withDefaults(defineProps<{
  lat: number | null
  lon: number | null
  label?: string
  height?: number
}>(), {
  label: '',
  height: 150
})

const x = computed(() => (typeof props.lon === 'number' ? projectLon(props.lon) : null))
const y = computed(() => (typeof props.lat === 'number' ? projectLat(props.lat) : null))

// Keep the marker clear of the viewBox edge on extreme coordinates.
const viewBox = computed(() => {
  if (x.value === null || y.value === null) return `0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`
  const w = 300
  const h = w * (WORLD_HEIGHT / WORLD_WIDTH)
  const vx = Math.min(Math.max(0, x.value - w / 2), WORLD_WIDTH - w)
  const vy = Math.min(Math.max(0, y.value - h / 2), WORLD_HEIGHT - h)
  return `${vx.toFixed(1)} ${vy.toFixed(1)} ${w} ${h.toFixed(1)}`
})
</script>

<template>
  <div class="minimap" :style="{ height: `${height}px` }">
    <svg :viewBox="viewBox" preserveAspectRatio="xMidYMid slice" role="img" :aria-label="`Map location ${label}`">
      <rect x="0" y="0" :width="WORLD_WIDTH" :height="WORLD_HEIGHT" fill="#070b12" />
      <g class="minimap__grid">
        <path
          v-for="line in 6"
          :key="`h${line}`"
          :d="`M0 ${(WORLD_HEIGHT / 6) * line}H${WORLD_WIDTH}`"
        />
        <path
          v-for="line in 10"
          :key="`v${line}`"
          :d="`M${(WORLD_WIDTH / 10) * line} 0V${WORLD_HEIGHT}`"
        />
      </g>
      <g class="minimap__land">
        <path v-for="country in WORLD_COUNTRIES" :key="country.id" :d="country.path" />
      </g>
      <g v-if="x !== null && y !== null">
        <circle :cx="x" :cy="y" r="9" class="minimap__halo" />
        <circle :cx="x" :cy="y" r="3.4" class="minimap__dot" />
        <path :d="`M${x} ${y - 16}v8`" class="minimap__tick" />
      </g>
    </svg>
    <p v-if="label" class="minimap__label mono">{{ label }}</p>
    <p v-if="x === null" class="minimap__none mono">COORDINATES NOT PUBLISHED</p>
  </div>
</template>

<style scoped>
.minimap {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #070b12;
}

.minimap svg {
  width: 100%;
  height: 100%;
  display: block;
}

.minimap__grid path {
  stroke: rgba(255, 255, 255, 0.045);
  stroke-width: 0.6;
  fill: none;
}

.minimap__land path {
  fill: #131c28;
  stroke: rgba(122, 167, 255, 0.28);
  stroke-width: 0.5;
}

.minimap__halo {
  fill: rgb(var(--signal-rgb) / 0.22);
  animation: halo 2.6s ease-out infinite;
}

.minimap__dot {
  fill: var(--signal);
  stroke: #04070c;
  stroke-width: 1.2;
}

.minimap__tick {
  stroke: var(--signal);
  stroke-width: 1;
  opacity: 0.6;
}

@keyframes halo {
  0% { r: 5; opacity: 0.9; }
  70% { r: 15; opacity: 0; }
  100% { r: 15; opacity: 0; }
}

.minimap__label {
  position: absolute;
  bottom: 7px;
  left: 9px;
  margin: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(4, 7, 12, 0.8);
  color: var(--text-dim);
  font-size: 8.5px;
  letter-spacing: 0.1em;
}

.minimap__none {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: 0.14em;
}
</style>
