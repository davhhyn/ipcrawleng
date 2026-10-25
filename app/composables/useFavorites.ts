import { computed, onMounted, ref } from 'vue'
import { apiExploreFavoritePath } from '#shared/routes'

const STORAGE_KEY = 'ipcrawl:favorites'
const MAX_FAVORITES = 50

const ids = ref<string[]>([])
const counts = ref<Record<string, number>>({})
const ready = ref(false)
const pending = ref<Record<string, boolean>>({})
let loaded = false

function persist() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.value))
  } catch {
    // Private-mode storage failures are non-fatal: favorites stay in memory.
  }
}

function load() {
  if (loaded || !import.meta.client) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      ids.value = parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_FAVORITES)
    }
  } catch {
    ids.value = []
  }
  ready.value = true
}

/**
 * Favorites are a local-first list of camera ids in localStorage, with the
 * public tally kept server-side (deduped per browser via an http-only cookie).
 */
export function useFavorites() {
  onMounted(load)

  const count = computed(() => ids.value.length)

  function isFavorite(id: string): boolean {
    return ids.value.includes(id)
  }

  function countOf(id: string, fallback = 0): number {
    return counts.value[id] ?? fallback
  }

  function register(id: string, base: number) {
    if (!(id in counts.value)) counts.value = { ...counts.value, [id]: base }
  }

  async function toggle(id: string, baseCount = 0): Promise<void> {
    const wasFavorite = isFavorite(id)
    const previousIds = ids.value
    const previousCount = countOf(id, baseCount)

    if (wasFavorite) {
      ids.value = ids.value.filter(value => value !== id)
    } else {
      if (ids.value.length >= MAX_FAVORITES) {
        useToasts().push(`You can keep up to ${MAX_FAVORITES} favorites.`, 'warn')
        return
      }
      ids.value = [...ids.value, id]
    }
    persist()
    counts.value = { ...counts.value, [id]: Math.max(0, previousCount + (wasFavorite ? -1 : 1)) }
    pending.value = { ...pending.value, [id]: true }

    try {
      const response = await $fetch<{ on: boolean, count: number }>(
        apiExploreFavoritePath(id),
        { method: 'POST', body: { on: !wasFavorite } }
      )
      counts.value = { ...counts.value, [id]: response.count }
      ids.value = response.on
        ? [...new Set([...ids.value, id])]
        : ids.value.filter(value => value !== id)
      persist()
    } catch {
      ids.value = previousIds
      counts.value = { ...counts.value, [id]: previousCount }
      persist()
      useToasts().push('Could not save that favorite.', 'error')
    } finally {
      const next = { ...pending.value }
      delete next[id]
      pending.value = next
    }
  }

  function clear() {
    ids.value = []
    persist()
  }

  return {
    ids,
    ready: computed(() => ready.value),
    count,
    isFavorite,
    countOf,
    register,
    toggle,
    clear,
    isPending: (id: string) => Boolean(pending.value[id]),
    max: MAX_FAVORITES
  }
}
