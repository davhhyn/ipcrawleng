/**
 * Target authorization and address expansion.
 *
 * The whole point of this module is to make it hard to accidentally scan
 * something you don't own. Every scan must name its targets explicitly, and
 * every target must pass `assertAuthorizedTargets` before a socket is opened.
 *
 * Rules, in order:
 *  1. Targets must be valid IPv4 addresses or CIDR blocks. No hostnames, no
 *     IPv6 (a home LAN is IPv4 in practice and this keeps the guard small).
 *  2. The expanded set is capped (`maxHosts`), and a single block wider than
 *     /16 is refused outright — that is not "my network", that is a scan.
 *  3. Every block must be covered by the operator's allowlist file. Nothing is
 *     scanned because it "looks local" — the file is the declared scope, and a
 *     missing or corrupt file is a hard error, never an empty allowlist.
 *  4. Public ranges additionally require an explicit `allowPublic` opt-in for
 *     that run. Both switches are needed; neither is a default.
 */

export interface CidrBlock {
  /** Dotted-quad network address. */
  network: string
  /** Prefix length, 0-32. */
  prefix: number
  /** Original text the operator typed. */
  text: string
}

const MAX_PREFIX_DEFAULT = 16

export function parseCidr(text: string): CidrBlock {
  const value = text.trim()
  if (!value) throw new Error('Empty address')

  const [addressPart, prefixPart] = value.split('/')
  if (prefixPart !== undefined && !/^\d{1,2}$/.test(prefixPart)) {
    throw new Error(`Invalid prefix length in "${value}"`)
  }

  const octets = parseIpv4(addressPart ?? '')
  const prefix = prefixPart === undefined ? 32 : Number(prefixPart)
  if (prefix < 0 || prefix > 32) throw new Error(`Prefix out of range in "${value}"`)

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = ipToNumber(octets) & mask

  return { network: numberToIp(network), prefix, text: value }
}

function parseIpv4(value: string): number[] {
  const parts = value.split('.')
  if (parts.length !== 4) throw new Error(`"${value}" is not an IPv4 address`)
  return parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) throw new Error(`"${value}" is not an IPv4 address`)
    const n = Number(part)
    if (n > 255) throw new Error(`"${value}" has an out-of-range octet`)
    return n
  })
}

export function ipToNumber(octets: number[]): number {
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0
}

export function numberToIp(value: number): string {
  const n = value >>> 0
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function isIpv4(value: string): boolean {
  try {
    parseIpv4(value)
    return true
  } catch {
    return false
  }
}

/** How many addresses a block expands to. /32 is one. */
export function blockSize(block: CidrBlock): number {
  return block.prefix >= 32 ? 1 : 2 ** (32 - block.prefix)
}

export type AddressClass =
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'cgnat'
  | 'multicast'
  | 'reserved'
  | 'public'

/** RFC-defined special ranges, mirroring server/utils/blocklist.ts. */
export function classifyAddress(ip: string): AddressClass {
  const [a, b] = parseIpv4(ip)
  if (a === 127) return 'loopback'
  if (a === 10) return 'private'
  if (a === 172 && b! >= 16 && b! <= 31) return 'private'
  if (a === 192 && b === 168) return 'private'
  if (a === 169 && b === 254) return 'link-local'
  if (a === 100 && b! >= 64 && b! <= 127) return 'cgnat'
  if (a! >= 224 && a! <= 239) return 'multicast'
  if (a === 0 || a! >= 240) return 'reserved'
  return 'public'
}

export function isPrivateClass(addressClass: AddressClass): boolean {
  return addressClass !== 'public' && addressClass !== 'multicast'
}

export function expandBlock(block: CidrBlock, limit: number): string[] {
  const size = blockSize(block)
  if (size > limit) {
    throw new Error(
      `${block.text} expands to ${size} addresses, above the ${limit} limit`
    )
  }
  const base = ipToNumber(parseIpv4(block.network))
  const out: string[] = []
  for (let i = 0; i < size; i++) out.push(numberToIp(base + i))
  return out
}

export interface AuthorizationOptions {
  /** Blocks the operator explicitly listed as theirs. */
  allowlist?: string[]
  /** Permit public ranges (still requires the allowlist match). */
  allowPublic?: boolean
  /** Cap on expanded addresses. */
  maxHosts?: number
  /** Refuse blocks wider than this prefix (default /16). */
  maxPrefix?: number
}

export interface AuthorizationResult {
  hosts: string[]
  blocks: { text: string, size: number, class: AddressClass }[]
  publicHosts: number
  warnings: string[]
}

/**
 * Validate + expand a target list. Throws with an actionable message instead of
 * silently scanning something surprising.
 */
export function assertAuthorizedTargets(
  targets: string[],
  options: AuthorizationOptions = {}
): AuthorizationResult {
  const maxHosts = options.maxHosts ?? 4096
  const maxPrefix = options.maxPrefix ?? MAX_PREFIX_DEFAULT
  const allowlist = (options.allowlist ?? []).map(entry => parseCidr(entry))

  if (!targets.length) throw new Error('No targets given')
  if (targets.length > 64) throw new Error('Too many target blocks (max 64)')

  const blocks: AuthorizationResult['blocks'] = []
  const hosts: string[] = []
  const warnings: string[] = []
  let publicHosts = 0

  for (const text of targets) {
    const block = parseCidr(text)
    const size = blockSize(block)

    if (block.prefix < maxPrefix) {
      throw new Error(
        `${block.text} is wider than /${maxPrefix}. ` +
        `Refusing to scan ${size.toLocaleString()} addresses — pass a tighter block.`
      )
    }
    if (hosts.length + size > maxHosts) {
      throw new Error(
        `Scan would touch ${hosts.length + size} addresses, above the ${maxHosts} limit. ` +
        'Narrow the targets or raise --max-hosts deliberately.'
      )
    }

    const first = expandBlock({ ...block, prefix: 32 }, 1)[0]!
    const addressClass = classifyAddress(first)

    if (addressClass === 'multicast' || addressClass === 'reserved') {
      throw new Error(`${block.text} is a ${addressClass} range and cannot contain cameras`)
    }

    const listed = allowlist.some(entry => covers(entry, block))

    if (!isPrivateClass(addressClass)) {
      if (!options.allowPublic) {
        throw new Error(
          `${block.text} is a public range. Public scanning is off by default — ` +
          'see docs/LOCAL-SENSOR.md. If this block is yours, add it to the allowlist ' +
          'and pass --allow-public.'
        )
      }
      if (!listed) {
        throw new Error(
          `${block.text} is not in the allowlist. Add it to sensor.allowlist.json first.`
        )
      }
      publicHosts += size
      warnings.push(`${block.text} is public — only scan ranges you are authorized to test.`)
    } else if (!listed) {
      // Declaring scope is not optional just because a range is RFC1918.
      throw new Error(
        `${block.text} is not in the allowlist. Add it to sensor.allowlist.json ` +
        '(`npm run sensor -- init` writes a starter file).'
      )
    }

    blocks.push({ text: block.text, size, class: addressClass })

    const expanded = expandBlock(block, maxHosts)
    // A block's first and last address are the network and broadcast address,
    // which can never host a camera. /31 and /32 have none (RFC 3021), so they
    // are kept whole.
    hosts.push(...(block.prefix <= 30 ? expanded.slice(1, -1) : expanded))
  }

  return { hosts, blocks, publicHosts, warnings }
}

/** True when `outer` fully contains `inner`. */
export function covers(outer: CidrBlock, inner: CidrBlock): boolean {
  if (outer.prefix > inner.prefix) return false
  const mask = outer.prefix === 0 ? 0 : (0xffffffff << (32 - outer.prefix)) >>> 0
  const a = ipToNumber(parseIpv4(outer.network))
  const b = ipToNumber(parseIpv4(inner.network))
  return (a & mask) === (b & mask)
}

/** Skip addresses that can never host a camera. */
export function isScannable(ip: string): boolean {
  const addressClass = classifyAddress(ip)
  if (addressClass !== 'private' && addressClass !== 'public') return false
  const octets = parseIpv4(ip)
  // Network and broadcast addresses of a /24 are not worth a probe.
  return !(octets[3] === 0 || octets[3] === 255)
}
