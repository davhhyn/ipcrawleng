import { describe, expect, it } from 'vitest'
import {
  assertAuthorizedTargets,
  blockSize,
  classifyAddress,
  covers,
  expandBlock,
  isScannable,
  numberToIp,
  parseCidr
} from '../sensor/cidr.ts'

describe('parseCidr', () => {
  it('parses plain addresses and blocks', () => {
    expect(parseCidr('192.168.1.5')).toMatchObject({ network: '192.168.1.5', prefix: 32 })
    expect(parseCidr('192.168.1.0/24')).toMatchObject({ network: '192.168.1.0', prefix: 24 })
    expect(parseCidr('10.0.0.0/8')).toMatchObject({ network: '10.0.0.0', prefix: 8 })
  })

  it('normalises to the network address', () => {
    // 192.168.1.77/24 is the same block as 192.168.1.0/24
    expect(parseCidr('192.168.1.77/24').network).toBe('192.168.1.0')
    expect(parseCidr('10.20.30.40/16').network).toBe('10.20.0.0')
  })

  it('rejects malformed input', () => {
    for (const bad of ['', 'not-an-ip', '192.168.1', '192.168.1.256', '192.168.1.1/33', '192.168.1.1/abc', '::1', 'example.com']) {
      expect(() => parseCidr(bad), bad).toThrow()
    }
  })

  it('counts block sizes', () => {
    expect(blockSize(parseCidr('192.168.1.0/24'))).toBe(256)
    expect(blockSize(parseCidr('10.0.0.0/16'))).toBe(65536)
    expect(blockSize(parseCidr('192.168.1.5'))).toBe(1)
  })
})

describe('classifyAddress', () => {
  it('recognises every special range', () => {
    expect(classifyAddress('127.0.0.1')).toBe('loopback')
    expect(classifyAddress('10.1.2.3')).toBe('private')
    expect(classifyAddress('172.16.0.1')).toBe('private')
    expect(classifyAddress('172.32.0.1')).toBe('public')
    expect(classifyAddress('192.168.1.1')).toBe('private')
    expect(classifyAddress('169.254.1.1')).toBe('link-local')
    expect(classifyAddress('100.64.0.1')).toBe('cgnat')
    expect(classifyAddress('224.0.0.1')).toBe('multicast')
    expect(classifyAddress('0.0.0.0')).toBe('reserved')
    expect(classifyAddress('8.8.8.8')).toBe('public')
  })
})

describe('assertAuthorizedTargets — the safety gate', () => {
  it('accepts a private /24 that is in the allowlist and expands it', () => {
    const result = assertAuthorizedTargets(['192.168.1.0/24'], {
      allowlist: ['192.168.1.0/24']
    })
    // 254 usable addresses: .0 is the network, .255 the broadcast.
    expect(result.hosts).toHaveLength(254)
    expect(result.hosts[0]).toBe('192.168.1.1')
    expect(result.hosts.at(-1)).toBe('192.168.1.254')
    expect(result.blocks[0]?.class).toBe('private')
    expect(result.publicHosts).toBe(0)
  })

  it('refuses public ranges by default', () => {
    expect(() => assertAuthorizedTargets(['8.8.8.0/24'], { allowlist: ['8.8.8.0/24'] }))
      .toThrow(/public range/i)
  })

  it('refuses a private range that the allowlist does not cover', () => {
    // RFC1918 is not a licence to scan: the file is the declared scope.
    expect(() => assertAuthorizedTargets(['192.168.2.0/24'], {
      allowlist: ['192.168.1.0/24']
    })).toThrow(/not in the allowlist/i)
    expect(() => assertAuthorizedTargets(['10.0.0.0/30'])).toThrow(/not in the allowlist/i)
  })

  it('refuses a block only partly covered by the allowlist', () => {
    // 192.168.0.0/23 spans two adjacent /24s; one listed /24 is not enough.
    expect(() => assertAuthorizedTargets(['192.168.0.0/23'], {
      allowlist: ['192.168.0.0/24']
    })).toThrow(/not in the allowlist/i)
    expect(() => assertAuthorizedTargets(['192.168.0.0/23'], {
      allowlist: ['192.168.0.0/16']
    })).not.toThrow()
  })

  it('refuses public ranges even when allowPublic is set but the block is not listed', () => {
    expect(() => assertAuthorizedTargets(['8.8.8.0/24'], {
      allowPublic: true,
      allowlist: ['192.168.0.0/16']
    })).toThrow(/not in the allowlist/i)
  })

  it('accepts a public range only when it is allowlisted and public is explicitly enabled', () => {
    const result = assertAuthorizedTargets(['203.0.113.0/28'], {
      allowPublic: true,
      allowlist: ['203.0.113.0/24']
    })
    expect(result.publicHosts).toBe(16)
    expect(result.warnings.join(' ')).toMatch(/authorized/i)
  })

  it('refuses blocks wider than /16 outright, before consulting the allowlist', () => {
    expect(() => assertAuthorizedTargets(['10.0.0.0/8'], { allowlist: ['10.0.0.0/8'] }))
      .toThrow(/wider than \/16/i)
    expect(() => assertAuthorizedTargets(['0.0.0.0/0'], { allowlist: ['0.0.0.0/0'] }))
      .toThrow(/wider than \/16/i)
  })

  it('enforces the host cap', () => {
    expect(() => assertAuthorizedTargets(['10.0.0.0/16', '10.1.0.0/16'], { maxHosts: 1000 }))
      .toThrow(/above the 1000 limit/i)
  })

  it('rejects multicast and reserved space', () => {
    expect(() => assertAuthorizedTargets(['224.0.0.0/24'])).toThrow(/multicast/i)
    expect(() => assertAuthorizedTargets(['240.0.0.0/24'])).toThrow(/reserved/i)
  })

  it('trims network and broadcast addresses per block, whatever the size', () => {
    const slash29 = assertAuthorizedTargets(['192.168.1.0/29'], { allowlist: ['192.168.1.0/29'] })
    // .0 network, .7 broadcast → six usable hosts.
    expect(slash29.hosts).toEqual([
      '192.168.1.1', '192.168.1.2', '192.168.1.3',
      '192.168.1.4', '192.168.1.5', '192.168.1.6'
    ])

    // /31 and /32 have no network/broadcast address.
    expect(assertAuthorizedTargets(['10.9.9.9'], { allowlist: ['10.9.9.9'] }).hosts)
      .toEqual(['10.9.9.9'])
    expect(assertAuthorizedTargets(['10.9.9.8/31'], { allowlist: ['10.9.9.8/31'] }).hosts)
      .toEqual(['10.9.9.8', '10.9.9.9'])
  })

  it('rejects an empty or oversized target list', () => {
    expect(() => assertAuthorizedTargets([])).toThrow(/no targets/i)
    expect(() => assertAuthorizedTargets(Array.from({ length: 70 }, () => '10.0.0.1'))).toThrow(/too many/i)
  })

  it('never expands more than the cap', () => {
    const hosts = expandBlock(parseCidr('192.168.0.0/24'), 256)
    expect(hosts).toHaveLength(256)
    expect(() => expandBlock(parseCidr('10.0.0.0/16'), 100)).toThrow(/above the 100 limit/i)
  })
})

describe('covers', () => {
  it('understands containment', () => {
    expect(covers(parseCidr('192.168.0.0/16'), parseCidr('192.168.1.0/24'))).toBe(true)
    expect(covers(parseCidr('192.168.1.0/24'), parseCidr('192.168.0.0/16'))).toBe(false)
    expect(covers(parseCidr('10.0.0.0/8'), parseCidr('10.1.2.0/24'))).toBe(true)
    expect(covers(parseCidr('10.0.0.0/8'), parseCidr('11.0.0.0/24'))).toBe(false)
  })
})

describe('isScannable', () => {
  it('skips network, broadcast and non-host addresses', () => {
    expect(isScannable('192.168.1.10')).toBe(true)
    expect(isScannable('192.168.1.0')).toBe(false)
    expect(isScannable('192.168.1.255')).toBe(false)
    expect(isScannable('127.0.0.1')).toBe(false)
    expect(isScannable('169.254.1.1')).toBe(false)
  })
})

describe('numberToIp', () => {
  it('round-trips', () => {
    expect(numberToIp(0xc0a80101)).toBe('192.168.1.1')
    expect(numberToIp(0)).toBe('0.0.0.0')
    expect(numberToIp(0xffffffff)).toBe('255.255.255.255')
  })
})
