import { isIP } from 'node:net'
import { parseTags } from '../../camRow'
import { normalizeVendor } from '../normalize'
import type { CameraProvider, EnrichmentUpdate, ProviderContext } from '../types'
import type { CamRow } from '../../camRow'

/**
 * Keyless host enrichment via Shodan InternetDB.
 *
 * This is deliberately NOT a discovery source: it never invents a camera and
 * never sets a listing live. It only annotates hosts that another free source
 * already found, and only when the host is a literal public IP. The catalogue
 * remains fully functional without it.
 */

interface InternetDbPayload {
  ip?: string
  ports?: number[]
  hostnames?: string[]
  cpes?: string[]
  tags?: string[]
  vulns?: string[]
}

async function enrichOne(row: CamRow, context: ProviderContext): Promise<EnrichmentUpdate | null> {
  const response = await context.fetch(`https://internetdb.shodan.io/${encodeURIComponent(row.host)}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'IPCrawlOpen/1.0' },
    signal: AbortSignal.timeout(Math.min(context.timeoutMs, 3500))
  })
  if (!response.ok) return null

  const payload = await response.json() as InternetDbPayload
  const existing = parseTags(row.tags_json)
  const additions: string[] = []

  for (const port of (payload.ports ?? []).slice(0, 5)) additions.push(`idb:port:${port}`)
  for (const tag of (payload.tags ?? []).slice(0, 4)) additions.push(`idb:tag:${tag}`)
  for (const cpe of (payload.cpes ?? []).slice(0, 3)) additions.push(`idb:cpe:${cpe}`)

  const merged = [...new Set([...existing, ...additions])].slice(0, 12)
  const changed = merged.length !== existing.length
    || merged.some((tag, index) => tag !== existing[index])
  if (!changed) return null

  const vendor = normalizeVendor(...(payload.cpes ?? []), row.vendor)
  return {
    id: row.id,
    tags: merged,
    vendor: vendor && vendor !== row.vendor ? vendor : null,
    note: `InternetDB: ${payload.ports?.length ?? 0} ports, ${payload.tags?.length ?? 0} tags`
  }
}

export const internetDbProvider: CameraProvider = {
  id: 'internetdb',
  async discover(): Promise<[]> {
    return []
  },
  async enrich(rows, context): Promise<EnrichmentUpdate[]> {
    const candidates = rows.filter(row => isIP(row.host) === 4).slice(0, 40)
    if (candidates.length === 0) {
      context.log('InternetDB: no public IP-literal hosts to enrich')
      return []
    }

    const updates: EnrichmentUpdate[] = []
    const concurrency = 4
    let cursor = 0

    async function worker() {
      while (cursor < candidates.length) {
        const row = candidates[cursor++]!
        try {
          const update = await enrichOne(row, context)
          if (update) updates.push(update)
        } catch {
          // Enrichment is best-effort; a failed lookup must never fail a sync.
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker())
    )
    context.log(`InternetDB: enriched ${updates.length}/${candidates.length} hosts`)
    return updates
  }
}
