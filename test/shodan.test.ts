import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SHODAN_DEFAULT_QUERY,
  SHODAN_WEB_PORTS,
  shodanMatchToRaw,
  shodanProvider,
  type ShodanMatch
} from '~~/server/utils/ingest/providers/shodan'
import { normalizeCam } from '~~/server/utils/ingest/normalize'
import { SOURCE_BY_ID } from '#shared/sources'
import type { ProviderContext } from '~~/server/utils/ingest/types'

function setConfig(patch: Record<string, unknown>) {
  globalThis.__testConfig = { ...globalThis.__testConfig, ...patch }
}

function match(patch: Partial<ShodanMatch> = {}): ShodanMatch {
  return {
    ip_str: '203.0.113.9',
    port: 8080,
    http: { title: 'DVR Login', server: 'Boa/0.94', status: 401 },
    location: {
      country_name: 'Italy',
      country_code: 'IT',
      city: 'Turin',
      latitude: 45.07,
      longitude: 7.68
    },
    org: 'AS1234 Example',
    product: 'Hikvision IP Camera',
    ...patch
  }
}

function context(fetchImpl: typeof globalThis.fetch, limit = 100): ProviderContext {
  return {
    fetch: fetchImpl,
    timeoutMs: 5000,
    limit,
    log: () => {}
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

beforeEach(() => {
  setConfig({
    shodanApiKey: 'test-key',
    shodanQuery: '',
    shodanPages: '1',
    shodanMinIntervalMs: '0',
    shodanEndpoint: 'https://api.shodan.test'
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shodanMatchToRaw', () => {
  it('turns a match into a candidate pointing at the service root', () => {
    const raw = shodanMatchToRaw(match())
    expect(raw).toMatchObject({
      source: 'shodan',
      externalId: '203.0.113.9:8080',
      title: 'DVR Login',
      pageUrl: 'http://203.0.113.9:8080/',
      city: 'Turin',
      country: 'Italy',
      lat: 45.07
    })
    expect(raw?.tags).toContain('shodan')
    expect(raw?.tags).toContain('port:8080')
  })

  it('omits default ports from the URL', () => {
    expect(shodanMatchToRaw(match({ port: 80 }))?.pageUrl).toBe('http://203.0.113.9/')
    expect(shodanMatchToRaw(match({ port: 443 }))?.pageUrl).toBe('https://203.0.113.9/')
    expect(shodanMatchToRaw(match({ port: 8443 }))?.pageUrl).toBe('https://203.0.113.9:8443/')
  })

  it('falls back through title → product → generated', () => {
    expect(shodanMatchToRaw(match({ http: { title: '' } }))?.title).toBe('Hikvision IP Camera')
    expect(shodanMatchToRaw(match({ product: null, http: { title: null } }))?.title)
      .toBe('Camera at 203.0.113.9:8080')
  })

  it('never claims liveness — it only records where the service is', () => {
    const raw = shodanMatchToRaw(match({ http: { status: 200, title: 'Cam' } }))
    // No image/stream URL: the pipeline decides what is live by probing.
    expect(raw?.imageUrl).toBeUndefined()
    expect(raw?.streamUrl).toBeUndefined()
  })

  it('skips RTSP and other non-web services', () => {
    expect(shodanMatchToRaw(match({ port: 554, http: null }))).toBeNull()
    expect(shodanMatchToRaw(match({ port: 8554, http: null }))).toBeNull()
    expect(shodanMatchToRaw(match({ port: 22, http: null }))).toBeNull()
    // …but accepts them when Shodan actually saw HTTP there.
    expect(shodanMatchToRaw(match({ port: 554, http: { title: 'Cam' } }))).not.toBeNull()
  })

  it('accepts unknown web ports that Shodan identified as HTTP', () => {
    const raw = shodanMatchToRaw(match({ port: 12345 }))
    expect(raw?.pageUrl).toBe('http://203.0.113.9:12345/')
    expect(SHODAN_WEB_PORTS.has(12345)).toBe(false)
  })

  it('rejects hostnames and malformed addresses', () => {
    expect(shodanMatchToRaw(match({ ip_str: 'camera.example.com' }))).toBeNull()
    expect(shodanMatchToRaw(match({ ip_str: '::1' }))).toBeNull()
    expect(shodanMatchToRaw(match({ ip_str: undefined }))).toBeNull()
    expect(shodanMatchToRaw(match({ ip_str: '10.0.0.5' }))).not.toBeNull() // still a literal
  })

  it('rejects missing or out-of-range ports', () => {
    expect(shodanMatchToRaw(match({ port: undefined }))).toBeNull()
    expect(shodanMatchToRaw(match({ port: 0 }))).toBeNull()
    expect(shodanMatchToRaw(match({ port: 70000 }))).toBeNull()
    expect(shodanMatchToRaw(match({ port: 80.5 as unknown as number }))).toBeNull()
  })

  it('handles a match with no http, product or location blocks', () => {
    const raw = shodanMatchToRaw({ ip_str: '203.0.113.10', port: 8000 })
    expect(raw).toMatchObject({
      externalId: '203.0.113.10:8000',
      title: 'Camera at 203.0.113.10:8000',
      city: null,
      country: null
    })
    expect(raw?.kind).toBeNull()
  })

  it('passes normalization and survives the private-host guard', () => {
    const source = SOURCE_BY_ID.shodan!
    const ok = normalizeCam(shodanMatchToRaw(match())!, source)
    expect(ok.skipped).toBeNull()
    expect(ok.cam).toMatchObject({
      source: 'shodan',
      host: '203.0.113.9',
      port: 8080,
      city: 'Turin'
    })

    // A private address in a Shodan-shaped record is still refused.
    const privateRow = normalizeCam(shodanMatchToRaw(match({ ip_str: '192.168.1.5' }))!, source)
    expect(privateRow.cam).toBeNull()
    expect(privateRow.skipped).toBe('private-or-blocked-host')
  })
})

describe('shodanProvider.discover', () => {
  it('refuses to run without a key', async () => {
    setConfig({ shodanApiKey: '' })
    await expect(shodanProvider.discover(context(vi.fn()))).rejects.toThrow(/not configured/)
  })

  it('sends the key, query and page, and maps the results', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      total: 2,
      matches: [
        match(),
        match({ ip_str: '203.0.113.10', port: 80, product: null, http: { title: 'Gate' } })
      ]
    }))

    const raws = await shodanProvider.discover(context(fetchMock as unknown as typeof fetch))
    expect(raws).toHaveLength(2)
    expect(raws[1]?.externalId).toBe('203.0.113.10:80')

    const requested = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]))
    expect(requested.pathname).toBe('/shodan/host/search')
    expect(requested.searchParams.get('key')).toBe('test-key')
    expect(requested.searchParams.get('query')).toBe(SHODAN_DEFAULT_QUERY)
    expect(requested.searchParams.get('page')).toBe('1')
  })

  it('honours a custom query', async () => {
    setConfig({ shodanQuery: 'product:"Hikvision"' })
    const fetchMock = vi.fn(async () => jsonResponse({ total: 0, matches: [] }))
    await shodanProvider.discover(context(fetchMock as unknown as typeof fetch))
    const requested = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]))
    expect(requested.searchParams.get('query')).toBe('product:"Hikvision"')
  })

  it('drops duplicates and non-web matches, counting what it skipped', async () => {
    const logs: string[] = []
    const fetchMock = vi.fn(async () => jsonResponse({
      matches: [
        match(),
        match(),                                  // duplicate ip:port
        match({ port: 554, http: null }),         // RTSP: not representable here
        match({ ip_str: 'camera.example.com' })   // not a literal
      ]
    }))

    const ctx = { ...context(fetchMock as unknown as typeof fetch), log: (m: string) => logs.push(m) }
    const raws = await shodanProvider.discover(ctx)

    expect(raws).toHaveLength(1)
    expect(logs.join(' ')).toMatch(/2 skipped/)
  })

  it('stops at the ingest limit', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      matches: Array.from({ length: 10 }, (_, i) => match({ ip_str: `203.0.113.${i + 20}` }))
    }))
    const raws = await shodanProvider.discover(context(fetchMock as unknown as typeof fetch, 3))
    expect(raws).toHaveLength(3)
  })

  it('follows pages until the total is covered, spaced by the configured interval', async () => {
    setConfig({ shodanPages: '3' })
    const fetchMock = vi.fn(async (input: unknown) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      return jsonResponse({
        total: 250,
        matches: page <= 3 ? [match({ ip_str: `203.0.113.${page}` })] : []
      })
    })
    const raws = await shodanProvider.discover(context(fetchMock as unknown as typeof fetch))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(raws).toHaveLength(3)
  })

  it('stops early when a page comes back empty', async () => {
    setConfig({ shodanPages: '5' })
    const fetchMock = vi.fn(async () => jsonResponse({ total: 500, matches: [] }))
    const raws = await shodanProvider.discover(context(fetchMock as unknown as typeof fetch))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(raws).toHaveLength(0)
  })

  it('treats a rejected key as fatal and non-retryable', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'Invalid API key' }, 401))
    await expect(shodanProvider.discover(context(fetchMock as unknown as typeof fetch)))
      .rejects.toMatchObject({ message: /rejected the API key/, retryable: false })
  })

  it('reports rate limiting as retryable', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'slow down' }, 429))
    await expect(shodanProvider.discover(context(fetchMock as unknown as typeof fetch)))
      .rejects.toMatchObject({ message: /rate limit/, retryable: true })
  })

  it('surfaces an out-of-credits message instead of silently returning nothing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'You have 0 query credits' }))
    await expect(shodanProvider.discover(context(fetchMock as unknown as typeof fetch)))
      .rejects.toThrow(/0 query credits/)
  })

  it('never puts the API key in the error message', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'nope' }, 402))
    const error = await shodanProvider.discover(context(fetchMock as unknown as typeof fetch))
      .then(() => null, (caught: Error) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).not.toContain('test-key')
  })

  it('wraps a network failure without leaking the URL', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    await expect(shodanProvider.discover(context(fetchMock as unknown as typeof fetch)))
      .rejects.toThrow(/Shodan request failed: ECONNREFUSED/)
  })
})
