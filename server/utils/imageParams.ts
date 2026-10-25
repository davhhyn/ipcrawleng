/** Route params may carry a cosmetic image extension, e.g. `<id>.jpg`. */
export function parseImageIdParam(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (typeof raw === 'string' ? raw : '')
    .replace(/\.(jpe?g|png|webp|svg|avif)$/i, '')
    .trim()
}

export function looksLikeCamId(value: string): boolean {
  return /^[a-f0-9]{8,40}$/i.test(value)
}
