<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Minus, Plus, RotateCcw } from '@lucide/vue'
import type { MapPoint } from '#shared/map'
import { WORLD_COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH, projectLat, projectLon } from '#shared/worldGeo'

const props = withDefaults(defineProps<{
  points: MapPoint[]
  selectedId?: string | null
  minHeight?: number
}>(), {
  selectedId: null,
  minHeight: 520
})

const emit = defineEmits<{
  select: [point: MapPoint]
  hover: [point: MapPoint | null]
}>()

const svg = ref<SVGSVGElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

const scale = ref(1)
const center = ref({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 })
const hoveredId = ref<string | null>(null)
const pointer = ref({ x: 0, y: 0 })
const dragging = ref(false)
const size = ref({ w: 1000, h: 520 })

const MIN_SCALE = 1
const MAX_SCALE = 14

const view = computed(() => {
  const w = WORLD_WIDTH / scale.value
  const h = WORLD_HEIGHT / scale.value
  // Clamp so the map can't be panned off-screen.
  const x = Math.min(Math.max(0, center.value.x - w / 2), WORLD_WIDTH - w)
  const y = Math.min(Math.max(0, center.value.y - h / 2), WORLD_HEIGHT - h)
  return { x, y, w, h }
})

const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.w} ${view.value.h}`)

/** Pixel radius helper — keeps markers visually constant at every zoom. */
const unit = computed(() => view.value.w / Math.max(320, size.value.w))

interface Cluster {
  key: string
  x: number
  y: number
  count: number
  live: number
  points: MapPoint[]
  single: MapPoint | null
}

const clusters = computed<Cluster[]>(() => {
  const { x, y, w, h } = view.value
  const margin = w * 0.08
  const cell = Math.max(9, w / 22)
  const buckets = new Map<string, Cluster>()

  for (const point of props.points) {
    const px = projectLon(point.lon)
    const py = projectLat(point.lat)
    if (px < x - margin || px > x + w + margin || py < y - margin || py > y + h + margin) continue

    const key = `${Math.floor(px / cell)}:${Math.floor(py / cell)}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count++
      if (point.isLive) bucket.live++
      bucket.points.push(point)
    } else {
      buckets.set(key, { key, x: px, y: py, count: 1, live: point.isLive ? 1 : 0, points: [point], single: point })
    }
  }

  const out: Cluster[] = []
  for (const bucket of buckets.values()) {
    if (bucket.count === 1) {
      out.push(bucket)
    } else {
      const sum = bucket.points.reduce((acc, point) => ({
        x: acc.x + projectLon(point.lon),
        y: acc.y + projectLat(point.lat)
      }), { x: 0, y: 0 })
      out.push({
        ...bucket,
        x: sum.x / bucket.count,
        y: sum.y / bucket.count,
        single: bucket.count === 1 ? bucket.points[0]! : null
      })
    }
  }
  return out
})

const hoveredPoint = computed(() => props.points.find(point => point.id === hoveredId.value) ?? null)

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function zoomAt(nextScale: number, anchor?: { x: number, y: number }) {
  const target = clampScale(nextScale)
  if (anchor && target !== scale.value) {
    const before = view.value
    const ratio = 1 - (target / scale.value)
    center.value = {
      x: center.value.x + (anchor.x - (before.x + before.w / 2)) * ratio,
      y: center.value.y + (anchor.y - (before.y + before.h / 2)) * ratio
    }
  }
  scale.value = target
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const rect = svg.value?.getBoundingClientRect()
  const anchor = rect
    ? {
        x: view.value.x + ((event.clientX - rect.left) / rect.width) * view.value.w,
        y: view.value.y + ((event.clientY - rect.top) / rect.height) * view.value.h
      }
    : undefined
  const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22
  zoomAt(scale.value * factor, anchor)
}

let dragStart: { x: number, y: number, cx: number, cy: number } | null = null

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  dragStart = { x: event.clientX, y: event.clientY, cx: center.value.x, cy: center.value.y }
  dragging.value = true
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragStart || !svg.value) return
  const rect = svg.value.getBoundingClientRect()
  const dx = ((event.clientX - dragStart.x) / rect.width) * view.value.w
  const dy = ((event.clientY - dragStart.y) / rect.height) * view.value.h
  if (Math.abs(event.clientX - dragStart.x) > 3 || Math.abs(event.clientY - dragStart.y) > 3) {
    center.value = { x: dragStart.cx - dx, y: dragStart.cy - dy }
  }
}

function endDrag() {
  dragStart = null
  dragging.value = false
}

function reset() {
  scale.value = 1
  center.value = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }
}

function focus(point: MapPoint) {
  scale.value = Math.max(scale.value, 5)
  center.value = { x: projectLon(point.lon), y: projectLat(point.lat) }
}

function onMarkerEnter(point: MapPoint, event: MouseEvent) {
  hoveredId.value = point.id
  pointer.value = { x: event.clientX, y: event.clientY }
  emit('hover', point)
}

function onMarkerLeave() {
  hoveredId.value = null
  emit('hover', null)
}

function onClusterClick(cluster: Cluster) {
  if (cluster.count === 1) {
    emit('select', cluster.points[0]!)
  } else {
    zoomAt(scale.value * 1.9, { x: cluster.x, y: cluster.y })
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (wrap.value) {
    const rect = wrap.value.getBoundingClientRect()
    size.value = { w: rect.width || 1000, h: rect.height || 520 }
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        size.value = {
          w: entry.contentRect.width || 1000,
          h: entry.contentRect.height || 520
        }
      }
    })
    resizeObserver.observe(wrap.value)
    wrap.value.addEventListener('wheel', onWheel, { passive: false })
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  wrap.value?.removeEventListener('wheel', onWheel)
})

watch(() => props.selectedId, (id) => {
  if (!id) return
  const point = props.points.find(item => item.id === id)
  if (point) focus(point)
})

defineExpose({ focus, reset })
</script>

<template>
  <div ref="wrap" class="world" :style="{ minHeight: `${minHeight}px` }">
    <svg
      ref="svg"
      class="world__svg"
      :class="{ 'world__svg--dragging': dragging }"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid slice"
      role="application"
      aria-label="World atlas of indexed cameras"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointerleave="endDrag"
    >
      <defs>
        <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#060a11" />
          <stop offset="0.5" stop-color="#050910" />
          <stop offset="1" stop-color="#03060b" />
        </linearGradient>
        <radialGradient id="mapGlow" cx="0.5" cy="0.42" r="0.72">
          <stop offset="0" stop-color="#7aa7ff" stop-opacity="0.1" />
          <stop offset="0.55" stop-color="#7aa7ff" stop-opacity="0.03" />
          <stop offset="1" stop-color="#7aa7ff" stop-opacity="0" />
        </radialGradient>
        <filter id="markerGlow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect :x="0" :y="0" :width="WORLD_WIDTH" :height="WORLD_HEIGHT" fill="url(#ocean)" />
      <rect :x="0" :y="0" :width="WORLD_WIDTH" :height="WORLD_HEIGHT" fill="url(#mapGlow)" />

      <!-- graticule -->
      <g class="world__grid" :stroke-width="unit * 0.7">
        <line v-for="i in 5" :key="`h${i}`" :x1="0" :y1="(WORLD_HEIGHT / 6) * i" :x2="WORLD_WIDTH" :y2="(WORLD_HEIGHT / 6) * i" />
        <line v-for="i in 9" :key="`v${i}`" :x1="(WORLD_WIDTH / 10) * i" y1="0" :x2="(WORLD_WIDTH / 10) * i" :y2="WORLD_HEIGHT" />
      </g>

      <g class="world__land" :stroke-width="unit * 0.55">
        <path
          v-for="country in WORLD_COUNTRIES"
          :key="country.id"
          :d="country.path"
        />
      </g>

      <!-- markers -->
      <g class="world__markers">
        <g
          v-for="cluster in clusters"
          :key="cluster.key"
          :transform="`translate(${cluster.x} ${cluster.y})`"
          class="marker"
          :class="{
            'marker--live': cluster.live > 0,
            'marker--cluster': cluster.count > 1,
            'marker--selected': cluster.count === 1 && cluster.points[0]?.id === selectedId
          }"
          @pointerdown.stop
          @click.stop="onClusterClick(cluster)"
          @mouseenter="cluster.count === 1 && onMarkerEnter(cluster.points[0]!, $event)"
          @mouseleave="onMarkerLeave"
        >
          <template v-if="cluster.count > 1">
            <circle :r="unit * (9 + Math.min(16, Math.log2(cluster.count + 1) * 4))" class="marker__halo" />
            <circle :r="unit * (7 + Math.min(13, Math.log2(cluster.count + 1) * 3.4))" class="marker__cluster" />
            <text
              :y="unit * 2.6"
              text-anchor="middle"
              class="marker__count"
              :font-size="unit * (7 + Math.min(6, Math.log2(cluster.count + 1) * 1.4))"
            >{{ cluster.count }}</text>
          </template>
          <template v-else>
            <circle v-if="cluster.live > 0" :r="unit * 7" class="marker__pulse" />
            <circle :r="unit * 3.4" class="marker__dot" filter="url(#markerGlow)" />
            <circle :r="unit * 1.2" class="marker__core" />
          </template>
        </g>
      </g>
    </svg>

    <div class="world__controls">
      <button type="button" class="world__btn" aria-label="Zoom in" @click="zoomAt(scale * 1.5)">
        <Plus :size="14" />
      </button>
      <button type="button" class="world__btn" aria-label="Zoom out" @click="zoomAt(scale / 1.5)">
        <Minus :size="14" />
      </button>
      <button type="button" class="world__btn" aria-label="Reset view" @click="reset">
        <RotateCcw :size="13" />
      </button>
    </div>

    <div class="world__scale mono">
      ZOOM {{ scale.toFixed(1) }}× · {{ points.length.toLocaleString() }} PLOTTED
    </div>

    <div
      v-if="hoveredPoint"
      class="world__tip"
      :style="{ left: `${pointer.x + 14}px`, top: `${pointer.y + 14}px` }"
    >
      <img :src="hoveredPoint.thumb" :alt="hoveredPoint.title" class="world__tip-img">
      <div class="world__tip-body">
        <p class="world__tip-title">{{ hoveredPoint.title }}</p>
        <p class="world__tip-meta mono">{{ hoveredPoint.city || hoveredPoint.country || '—' }}</p>
        <p class="world__tip-src mono">{{ hoveredPoint.sourceLabel }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #04070c;
  cursor: grab;
  touch-action: none;
}

.world__svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.world__svg--dragging {
  cursor: grabbing;
}

.world__grid line {
  stroke: rgba(255, 255, 255, 0.04);
}

.world__land path {
  fill: #101b28;
  stroke: rgba(122, 167, 255, 0.22);
  stroke-linejoin: round;
  transition: fill 200ms ease;
}

.world__land path:hover {
  fill: #16273a;
}

.marker {
  cursor: pointer;
}

.marker__dot {
  fill: #7aa7ff;
  stroke: #050912;
  stroke-width: 0.8;
}

.marker__core {
  fill: #dbe9ff;
}

.marker--live .marker__dot {
  fill: #6ff2c0;
}

.marker--live .marker__core {
  fill: #effff9;
}

.marker__pulse {
  fill: rgb(111 242 192 / 0.18);
  animation: markerPulse 2.6s ease-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes markerPulse {
  0% { transform: scale(0.6); opacity: 0.9; }
  70% { transform: scale(2.2); opacity: 0; }
  100% { transform: scale(2.2); opacity: 0; }
}

.marker__halo {
  fill: rgb(122 167 255 / 0.1);
}

.marker__cluster {
  fill: rgba(12, 22, 38, 0.92);
  stroke: rgba(122, 167, 255, 0.55);
  stroke-width: 0.9;
}

.marker--live .marker__cluster {
  stroke: rgba(111 242 192, 0.6);
  stroke: rgb(111 242 192 / 0.55);
}

.marker__count {
  fill: #dbe9ff;
  font-family: var(--font-mono);
  pointer-events: none;
}

.marker--selected .marker__dot {
  fill: #fff;
  stroke: #fff;
}

.marker--selected .marker__core {
  fill: #050912;
}

.world__controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 4;
}

.world__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: rgba(5, 9, 15, 0.85);
  color: var(--text-dim);
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.world__btn:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}

.world__scale {
  position: absolute;
  bottom: 10px;
  left: 12px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: rgba(4, 7, 11, 0.8);
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.world__tip {
  position: fixed;
  z-index: 60;
  display: flex;
  gap: 9px;
  width: 236px;
  padding: 8px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgba(6, 10, 16, 0.96);
  box-shadow: 0 20px 50px -24px rgba(0, 0, 0, 0.95);
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.world__tip-img {
  width: 74px;
  height: 48px;
  flex: none;
  border-radius: 6px;
  object-fit: cover;
  background: #080d14;
}

.world__tip-body {
  min-width: 0;
}

.world__tip-title {
  margin: 0;
  font-size: 11px;
  font-weight: 550;
  line-height: 1.3;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.world__tip-meta {
  margin: 3px 0 0;
  color: var(--text-dim);
  font-size: 8.5px;
  letter-spacing: 0.06em;
}

.world__tip-src {
  margin: 2px 0 0;
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.08em;
}
</style>
