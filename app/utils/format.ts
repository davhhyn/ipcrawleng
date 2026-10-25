export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en', { notation: value >= 100_000 ? 'compact' : 'standard' }).format(value)
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function relativeTime(ts: number | string | null | undefined): string {
  if (!ts) return 'never'
  const time = typeof ts === 'string' ? Date.parse(ts) : ts
  if (!Number.isFinite(time)) return 'never'
  const diff = Date.now() - time
  const abs = Math.abs(diff)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (abs < minute) return 'just now'
  if (abs < hour) {
    const value = Math.round(abs / minute)
    return diff > 0 ? `${value} min ago` : `in ${value} min`
  }
  if (abs < day) {
    const value = Math.round(abs / hour)
    return diff > 0 ? `${value} h ago` : `in ${value} h`
  }
  if (abs < 30 * day) {
    const value = Math.round(abs / day)
    return diff > 0 ? `${value} d ago` : `in ${value} d`
  }
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(ts: number | string | null | undefined): string {
  if (!ts) return '—'
  const time = typeof ts === 'string' ? Date.parse(ts) : ts
  if (!Number.isFinite(time)) return '—'
  return new Date(time).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
