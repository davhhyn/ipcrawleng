import { useState } from '#imports'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

let nextId = 1

/**
 * Tiny global toast queue. No dependency, no provider tree — just Nuxt state
 * plus a fixed-position host rendered once in app.vue.
 */
export function useToasts() {
  const toasts = useState<Toast[]>('ipcrawl-toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function push(message: string, tone: ToastTone = 'info', ttl = 4200) {
    const id = nextId++
    toasts.value = [...toasts.value.slice(-3), { id, message, tone }]
    if (import.meta.client) {
      setTimeout(() => dismiss(id), ttl)
    }
    return id
  }

  return { toasts, push, dismiss }
}
