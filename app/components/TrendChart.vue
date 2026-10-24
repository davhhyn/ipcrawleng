<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StatsHistoryPoint } from '#shared/stats'

const props = withDefaults(defineProps<{
  points: StatsHistoryPoint[]
  height?: number
  demo?: boolean
}>(), {
  height: 220,
  demo: false
})

const W = 720
const H = computed(() => props.height)
const PAD = { top: 18, right: 14, bottom: 26, left: 40 }

const hover = ref<number | null>(null)

const series = computed(() => props.points.slice(-24))

const maxValue = computed(() => {
  const max = Math.max(1, ...series.value.map(point => point.total))
  const magnitude = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / magnitude) * magnitude
})

const slots = computed(() => Math.max(1, series.value.length - 1))

function x(index: number): number {
  return PAD.left + (index / slots.value) * (W - PAD.left - PAD.right)
}

function y(value: number): number {
  const inner = H.value - PAD.top - PAD.bottom
  return PAD.top + inner - (value / maxValue.value) * inner
}

const linePath = computed(() => series.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.total).toFixed(1)}`)
  .join(''))

const areaPath = computed(() => {
  if (!series.value.length) return ''
  const base = y(0)
  return `${linePath.value}L${x(series.value.length - 1).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z`
})

const livePath = computed(() => series.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.live).toFixed(1)}`)
  .join(''))

const gridLines = computed(() => {
  const lines: { y: number, label: string }[] = []
  for (let i = 0; i <= 4; i++) {
    const value = (maxValue.value / 4) * i
    lines.push({ y: y(value), label: value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value)) })
  }
  return lines
})

const xLabels = computed(() => {
  const out: { x: number, label: string }[] = []
  const step = Math.max(1, Math.ceil(series.value.length / 6))
  series.value.forEach((point, index) => {
    if (index % step !== 0 && index !== series.value.length - 1) return
    out.push({
      x: x(index),
      label: new Date(point.ts).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    })
  })
  return out
})

const active = computed(() => (hover.value !== null ? series.value[hover.value] ?? null : null))

function onMove(event: MouseEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  const index = Math.round(ratio * slots.value)
  hover.value = Math.max(0, Math.min(series.value.length - 1, index))
}
</script>

<template>
  <section class="trend panel">
    <header class="trend__head">
      <div>
        <p class="eyebrow">Catalogue size</p>
        <p class="trend__title">Monthly index growth</p>
      </div>
      <div class="trend__legend">
        <span class="trend__key"><span class="trend__swatch trend__swatch--total" /> Total</span>
        <span class="trend__key"><span class="trend__swatch trend__swatch--live" /> Live</span>
        <span v-if="demo" class="chip chip-amber">SEED HISTORY</span>
      </div>
    </header>

    <div v-if="series.length" class="trend__chart">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="none"
        class="trend__svg"
        role="img"
        aria-label="Catalogue size over time"
        @mousemove="onMove"
        @mouseleave="hover = null"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#7aa7ff" stop-opacity="0.34" />
            <stop offset="1" stop-color="#7aa7ff" stop-opacity="0" />
          </linearGradient>
        </defs>

        <g class="trend__grid">
          <line
            v-for="line in gridLines"
            :key="line.label"
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="line.y"
            :y2="line.y"
          />
        </g>

        <path :d="areaPath" fill="url(#trendFill)" />
        <path :d="linePath" class="trend__line" />
        <path :d="livePath" class="trend__line trend__line--live" />

        <g v-if="hover !== null && series[hover]">
          <line
            :x1="x(hover)"
            :x2="x(hover)"
            :y1="PAD.top"
            :y2="H - PAD.bottom"
            class="trend__cursor"
          />
          <circle :cx="x(hover)" :cy="y(series[hover]!.total)" r="4" class="trend__point" />
        </g>

        <g class="trend__xlabels">
          <text v-for="label in xLabels" :key="label.label + label.x" :x="label.x" :y="H - 8" text-anchor="middle">
            {{ label.label }}
          </text>
        </g>
        <g class="trend__ylabels">
          <text v-for="line in gridLines" :key="`y${line.label}`" :x="PAD.left - 8" :y="line.y + 3" text-anchor="end">
            {{ line.label }}
          </text>
        </g>
      </svg>

      <div class="trend__readout mono">
        <template v-if="active">
          {{ new Date(active.ts).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }}
          · {{ active.total.toLocaleString() }} total
          · {{ active.live.toLocaleString() }} live
        </template>
        <template v-else>
          {{ series.length }} snapshots · hover for detail
        </template>
      </div>
    </div>

    <p v-else class="trend__empty mono">NO SNAPSHOTS YET — A SYNC WRITES THE FIRST POINT</p>
  </section>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  padding: 16px 16px 12px;
}

.trend__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
}

.trend__title {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 550;
}

.trend__legend {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trend__key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-mute);
  font-size: 9.5px;
}

.trend__swatch {
  width: 14px;
  height: 2px;
  border-radius: 2px;
}

.trend__swatch--total { background: var(--signal); }
.trend__swatch--live { background: var(--live); }

.trend__chart {
  position: relative;
}

.trend__svg {
  width: 100%;
  height: 220px;
  display: block;
  overflow: visible;
}

.trend__grid line {
  stroke: rgba(255, 255, 255, 0.055);
  stroke-width: 1;
  stroke-dasharray: 3 5;
}

.trend__line {
  fill: none;
  stroke: var(--signal);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.trend__line--live {
  stroke: var(--live);
  stroke-width: 1.6;
  stroke-opacity: 0.85;
}

.trend__cursor {
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}

.trend__point {
  fill: #fff;
  stroke: var(--signal);
  stroke-width: 2;
}

.trend__xlabels text,
.trend__ylabels text {
  fill: var(--text-mute);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
}

.trend__readout {
  margin-top: 6px;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.08em;
  text-align: right;
}

.trend__empty {
  margin: 26px 0;
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-align: center;
}
</style>
