<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, RotateCcw, Search, X } from '@lucide/vue'
import type { ExploreFacets } from '#shared/explore'
import { KIND_LABELS, STATUS_LABELS } from '#shared/labels'

const props = defineProps<{
  facets: ExploreFacets | null
  loading?: boolean
}>()

const filters = useExploreFilters()
const { state, toggleValue, commit, clearAll } = filters

const facetSearch = reactive({ country: '', city: '', vendor: '' })
const openSections = reactive({ country: true, city: false, vendor: false })

function filtered(field: 'countries' | 'cities' | 'vendors') {
  const key = field === 'countries' ? 'country' : field === 'cities' ? 'city' : 'vendor'
  const term = facetSearch[key].trim().toLowerCase()
  const list = props.facets?.[field] ?? []
  return term ? list.filter(item => item.value.toLowerCase().includes(term)) : list
}

const selected = computed(() => ({
  countries: state.value.countries,
  cities: state.value.cities,
  vendors: state.value.vendors,
  sources: state.value.sources,
  kinds: state.value.kinds
}))

const activeTotal = computed(() => filters.activeCount.value)

function isChecked(group: 'countries' | 'cities' | 'vendors' | 'sources' | 'kinds', value: string) {
  return (selected.value[group] as string[]).includes(value)
}

const countryCount = computed(() => props.facets?.countries.length ?? 0)

const kindOptions = computed(() => props.facets?.kinds ?? [])
const sourceOptions = computed(() => props.facets?.sources ?? [])
const statusOptions = computed(() => props.facets?.statuses ?? [])
</script>

<template>
  <aside class="filters panel">
    <header class="filters__head">
      <div>
        <p class="eyebrow">Refine</p>
        <p class="filters__count mono">
          {{ activeTotal === 0 ? 'NO FILTERS' : `${activeTotal} ACTIVE` }}
        </p>
      </div>
      <button
        v-if="activeTotal > 0"
        type="button"
        class="btn btn-ghost btn-sm"
        @click="clearAll"
      >
        <RotateCcw :size="11" />
        Reset
      </button>
    </header>

    <div class="filters__scroll">
      <section class="filters__section">
        <p class="eyebrow">Status</p>
        <div class="segmented">
          <button
            type="button"
            class="segmented__item"
            :class="{ 'segmented__item--on': state.status === 'any' }"
            @click="commit({ status: 'any', page: 1 })"
          >
            Any
          </button>
          <button
            v-for="option in statusOptions"
            :key="option.value"
            type="button"
            class="segmented__item"
            :class="{ 'segmented__item--on': state.status === option.value }"
            @click="commit({ status: option.value, page: 1 })"
          >
            {{ STATUS_LABELS[option.value as keyof typeof STATUS_LABELS] ?? option.label }}
            <span class="segmented__n">{{ option.count }}</span>
          </button>
        </div>
      </section>

      <section class="filters__section">
        <p class="eyebrow">Source</p>
        <div class="check-list">
          <label
            v-for="option in sourceOptions"
            :key="option.value"
            class="check"
            :class="{ 'check--on': isChecked('sources', option.value) }"
          >
            <input
              type="checkbox"
              :checked="isChecked('sources', option.value)"
              @change="toggleValue('sources', option.value)"
            >
            <span class="check__box">
              <Check v-if="isChecked('sources', option.value)" :size="10" />
            </span>
            <span class="check__dot" :style="{ background: option.accent || 'var(--signal)' }" />
            <span class="check__label">{{ option.label || option.value }}</span>
            <span class="check__n mono">{{ option.count }}</span>
          </label>
          <p v-if="!sourceOptions.length" class="filters__empty mono">NO SOURCE DATA</p>
        </div>
      </section>

      <section class="filters__section">
        <p class="eyebrow">Feed type</p>
        <div class="chip-row">
          <button
            v-for="option in kindOptions"
            :key="option.value"
            type="button"
            class="chip chip-btn"
            :class="{ 'chip-signal': isChecked('kinds', option.value) }"
            @click="toggleValue('kinds', option.value)"
          >
            {{ KIND_LABELS[option.value as keyof typeof KIND_LABELS] || option.label }}
            <span class="chip__n">{{ option.count }}</span>
          </button>
          <p v-if="!kindOptions.length" class="filters__empty mono">NO FEED DATA</p>
        </div>
      </section>

      <section
        v-for="section in ([
          { key: 'countries', label: 'Country', field: 'country' as const, open: 'country' as const },
          { key: 'cities', label: 'City', field: 'city' as const, open: 'city' as const },
          { key: 'vendors', label: 'Vendor', field: 'vendor' as const, open: 'vendor' as const }
        ] as const)"
        :key="section.key"
        class="filters__section"
      >
        <button
          type="button"
          class="filters__toggle"
          :aria-expanded="openSections[section.open]"
          @click="openSections[section.open] = !openSections[section.open]"
        >
          <span class="eyebrow">{{ section.label }}</span>
          <span class="filters__toggle-right">
            <span v-if="(selected as any)[section.key].length" class="filters__badge mono">
              {{ (selected as any)[section.key].length }}
            </span>
            <ChevronDown
              :size="13"
              class="filters__chev"
              :class="{ 'filters__chev--open': openSections[section.open] }"
            />
          </span>
        </button>

        <div v-if="openSections[section.open]" class="filters__body">
          <label class="search-box">
            <Search :size="12" />
            <input
              v-model="facetSearch[section.field]"
              type="text"
              class="search-box__input"
              :placeholder="`Filter ${section.label.toLowerCase()}s…`"
            >
          </label>

          <div class="check-list check-list--scroll">
            <label
              v-for="option in filtered(section.key).slice(0, 80)"
              :key="option.value"
              class="check"
              :class="{ 'check--on': isChecked(section.key, option.value) }"
            >
              <input
                type="checkbox"
                :checked="isChecked(section.key, option.value)"
                @change="toggleValue(section.key, option.value)"
              >
              <span class="check__box">
                <Check v-if="isChecked(section.key, option.value)" :size="10" />
              </span>
              <span class="check__label">{{ option.value }}</span>
              <span class="check__n mono">{{ option.count }}</span>
            </label>
            <p v-if="!filtered(section.key).length" class="filters__empty mono">NO MATCHES</p>
          </div>
          <p v-if="section.key === 'countries' && countryCount > 80" class="filters__hint mono">
            Showing 80 of {{ countryCount }} — use search to narrow.
          </p>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  padding: 14px;
  max-height: calc(100dvh - 120px);
  position: sticky;
  top: calc(var(--header-h) + 14px);
}

.filters__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.filters__count {
  margin: 4px 0 0;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--signal-bright);
}

.filters__scroll {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.filters__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.segmented__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-dim);
  font-size: 10.5px;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}

.segmented__item:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.segmented__item--on {
  color: var(--signal-bright);
  border-color: rgb(var(--signal-rgb) / 0.42);
  background: rgb(var(--signal-rgb) / 0.1);
}

.segmented__n {
  color: var(--text-mute);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.segmented__item--on .segmented__n {
  color: rgb(var(--signal-rgb) / 0.8);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.chip-btn {
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}

.chip-btn:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.chip__n {
  opacity: 0.55;
  font-size: 8.5px;
}

.filters__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.filters__toggle-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filters__chev {
  color: var(--text-mute);
  transition: transform 160ms ease;
}

.filters__chev--open {
  transform: rotate(180deg);
}

.filters__badge {
  padding: 1px 5px;
  border-radius: 999px;
  background: rgb(var(--signal-rgb) / 0.16);
  color: var(--signal-bright);
  font-size: 8.5px;
}

.filters__body {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(3, 6, 10, 0.5);
  color: var(--text-mute);
}

.search-box:focus-within {
  border-color: rgb(var(--signal-rgb) / 0.45);
}

.search-box__input {
  width: 100%;
  border: 0;
  background: none;
  outline: none;
  font-size: 11px;
  color: var(--text);
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.check-list--scroll {
  max-height: 190px;
  overflow-y: auto;
  padding-right: 4px;
}

.check {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 5px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 130ms ease;
}

.check:hover {
  background: rgba(255, 255, 255, 0.035);
}

.check input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.check__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  flex: none;
  border: 1px solid var(--line-strong);
  border-radius: 3.5px;
  color: var(--signal-ink);
  transition: background 130ms ease, border-color 130ms ease;
}

.check--on .check__box {
  background: var(--signal);
  border-color: var(--signal);
}

.check__dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 999px;
}

.check__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-dim);
}

.check--on .check__label {
  color: var(--text);
}

.check__n {
  color: var(--text-mute);
  font-size: 8.5px;
}

.filters__empty,
.filters__hint {
  margin: 2px 0;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.1em;
  line-height: 1.5;
}
</style>
