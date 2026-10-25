import { isIP } from 'node:net'
import { allowPrivateHosts, blockedHosts } from './config'

/**
 * Hard guardrails for what can enter the catalogue:
 *  - never a private / loopback / link-local host (no router UIs, no LAN scans)
 *  - never an operator-blocklisted host suffix (takedown requests)
 */

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fe80')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped)
  }
  return false
}

/** Loopback only: the single range a local mirror or fixture server can use. */
export function isLoopbackAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return address.startsWith('127.')
  if (version === 6) {
    const normalized = address.toLowerCase()
    return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1'
  }
  return false
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isPrivateIPv4(address)
  if (version === 6) return isPrivateIPv6(address)
  return false
}

export function isDisallowedHost(host: string): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) return true
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (normalized.endsWith('.local') || normalized.endsWith('.internal') || normalized.endsWith('.home.arpa')) {
    return true
  }
  if (isIP(normalized) && isPrivateAddress(normalized)) {
    // `allowPrivateHosts` is a local-development escape hatch for loopback
    // fixtures only. Routers, LAN hosts and metadata endpoints stay blocked.
    return !(allowPrivateHosts() && isLoopbackAddress(normalized))
  }

  for (const blocked of blockedHosts()) {
    if (!blocked) continue
    if (normalized === blocked || normalized.endsWith(`.${blocked}`)) return true
  }
  return false
}

export function isDisallowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
    if (parsed.username || parsed.password) return true
    return isDisallowedHost(parsed.hostname)
  } catch {
    return true
  }
}

export function isBlockedSource(source: string): boolean {
  const normalized = source.trim().toLowerCase()
  return blockedHosts().includes(`source:${normalized}`)
}
