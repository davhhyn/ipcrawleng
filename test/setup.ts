import { afterEach } from 'vitest'

/**
 * The server modules call Nitro auto-imports (`useRuntimeConfig`) as free
 * variables, which resolve against `globalThis` outside of Nuxt. Tests set the
 * runtime config they need per case instead of booting whole Nuxt.
 */
const baseConfig = {
  blockedHosts: '',
  allowPrivateHosts: 'false',
  upgradeInsecureImages: 'true',
  probeTimeoutMs: 8000,
  probeBudgetMs: 45000,
  enableLiveProbe: 'true',
  userAgent: 'IPCrawlOpen/test'
}

declare global {
  // eslint-disable-next-line no-var
  var __testConfig: Record<string, unknown>
}

globalThis.__testConfig = { ...baseConfig }

Object.defineProperty(globalThis, 'useRuntimeConfig', {
  configurable: true,
  writable: true,
  value: () => ({ ...baseConfig, ...globalThis.__testConfig })
})

afterEach(() => {
  globalThis.__testConfig = { ...baseConfig }
})
