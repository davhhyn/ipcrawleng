import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ALLOWLIST_TEMPLATE,
  authorizeTargets,
  readAllowlist,
  writeAllowlistTemplate
} from '../sensor/allowlist.ts'
import { detectionFromRecord, summarizeAddressSpace } from '../sensor/import.ts'
import type { Detection } from '../sensor/types.ts'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ipcrawl-allow-'))
  path = join(dir, 'sensor.allowlist.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('allowlist file handling', () => {
  it('fails closed when the file is missing', () => {
    expect(readAllowlist(path)).toBeNull()
    expect(() => authorizeTargets(['192.168.1.0/24'], { allowlistPath: path }))
      .toThrow(/No allowlist at .*sensor\.allowlist\.json/)
  })

  it('fails closed when the file is corrupt', () => {
    writeFileSync(path, '{ this is not json')
    expect(readAllowlist(path)).toBeNull()
    expect(() => authorizeTargets(['192.168.1.0/24'], { allowlistPath: path })).toThrow(/No allowlist/)
  })

  it('treats a file with no allowed array as an empty scope', () => {
    writeFileSync(path, JSON.stringify({ publicAllowed: true }))
    expect(readAllowlist(path)?.allowed).toEqual([])
    expect(() => authorizeTargets(['192.168.1.0/24'], { allowlistPath: path }))
      .toThrow(/not in the allowlist/i)
  })

  it('writes a template that is itself a valid, private-only allowlist', () => {
    const written = writeAllowlistTemplate(path)
    expect(written).toBe(path)
    expect(existsSync(path)).toBe(true)

    const allowlist = readAllowlist(path)
    expect(allowlist?.publicAllowed).toBe(false)
    expect(allowlist?.allowed).toEqual(ALLOWLIST_TEMPLATE.allowed)
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true)
  })

  it('only reads publicAllowed when it is literally true', () => {
    writeFileSync(path, JSON.stringify({ allowed: [], publicAllowed: 'yes' }))
    expect(readAllowlist(path)?.publicAllowed).toBe(false)
  })

  it('ignores non-string entries instead of trusting them', () => {
    writeFileSync(path, JSON.stringify({ allowed: ['10.0.0.0/24', 42, null, {}] }))
    expect(readAllowlist(path)?.allowed).toEqual(['10.0.0.0/24'])
  })
})

describe('authorizeTargets', () => {
  it('authorizes a sub-block of a listed range', () => {
    writeFileSync(path, JSON.stringify({ allowed: ['192.168.0.0/16'], publicAllowed: false }))
    const { authorization, allowlist } = authorizeTargets(['192.168.1.0/28'], { allowlistPath: path })
    expect(allowlist.allowed).toEqual(['192.168.0.0/16'])
    expect(authorization.hosts).toHaveLength(14)
    expect(authorization.publicHosts).toBe(0)
  })

  it('refuses a block that sits outside the allowlist', () => {
    writeFileSync(path, JSON.stringify({ allowed: ['192.168.1.0/24'], publicAllowed: false }))
    expect(() => authorizeTargets(['192.168.2.0/24'], { allowlistPath: path }))
      .toThrow(/not in the allowlist/i)
  })

  it('refuses a public range when publicAllowed is false, even with --allow-public', () => {
    writeFileSync(path, JSON.stringify({ allowed: ['203.0.113.0/24'], publicAllowed: false }))
    expect(() => authorizeTargets(['203.0.113.0/28'], {
      allowlistPath: path,
      allowPublic: true
    })).toThrow(/public range/i)
  })

  it('still refuses a public range listed but not opted into on the CLI', () => {
    // Both switches are required: the file says yes, the run must too.
    writeFileSync(path, JSON.stringify({ allowed: ['203.0.113.0/24'], publicAllowed: true }))
    expect(() => authorizeTargets(['203.0.113.0/28'], { allowlistPath: path }))
      .toThrow(/public range/i)
  })

  it('allows a public range only when file and CLI both opt in', () => {
    writeFileSync(path, JSON.stringify({ allowed: ['203.0.113.0/24'], publicAllowed: true }))
    const { authorization } = authorizeTargets(['203.0.113.0/28'], {
      allowlistPath: path,
      allowPublic: true
    })
    expect(authorization.publicHosts).toBe(16)
    expect(authorization.blocks[0]?.class).toBe('public')
  })

  it('keeps private scanning available while publicAllowed is on, without leaking public hosts', () => {
    writeFileSync(path, JSON.stringify({ allowed: ['203.0.113.0/24', '10.0.0.0/24'], publicAllowed: true }))
    const { authorization } = authorizeTargets(['10.0.0.0/30'], {
      allowlistPath: path,
      allowPublic: true
    })
    expect(authorization.publicHosts).toBe(0)
    expect(authorization.hosts).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})

describe('detectionFromRecord', () => {
  it('maps a Shodan-style record', () => {
    const { detection, reason } = detectionFromRecord({
      ip_str: '203.0.113.7',
      port: 8080,
      product: 'GeoVision',
      http: { title: 'GV-DVR', server: 'Boa', www_authenticate: 'Basic realm="DVR"' },
      location: { country_name: 'Italy', city: 'Turin', latitude: 45.07, longitude: 7.68 },
      org: 'AS1234 Example'
    })

    expect(reason).toBeNull()
    expect(detection).toMatchObject({
      host: '203.0.113.7',
      port: 8080,
      kind: 'page',
      title: 'GV-DVR'
    })
    expect(detection?.evidence).toMatchObject({
      server: 'Boa',
      realm: 'DVR',
      authRequired: true
    })
    expect(detection?.tags).toContain('imported-dataset')
  })

  it('explains each rejection', () => {
    expect(detectionFromRecord({}).reason).toBe('no host field')
    expect(detectionFromRecord({ ip: 'cam.local', port: 80 }).reason).toBe('not an IPv4 address')
    expect(detectionFromRecord({ ip: '10.0.0.1' }).reason).toBe('no port field')
    expect(detectionFromRecord({ ip: '10.0.0.1', port: 0 }).reason).toBe('port out of range')
    expect(detectionFromRecord({ ip: '10.0.0.1', port: 65536 }).reason).toBe('port out of range')
  })

  it('caps long banners so a row stays small', () => {
    const { detection } = detectionFromRecord({
      ip: '10.0.0.1',
      port: 80,
      data: 'x'.repeat(10_000),
      http: { title: 't'.repeat(500), server: 's'.repeat(500) }
    })
    expect(detection?.evidence.title?.length).toBe(80)
    expect(detection?.evidence.server?.length).toBe(60)
    expect((detection as Detection & { context?: { body: string | null } }).context?.body?.length).toBe(400)
  })
})

describe('summarizeAddressSpace', () => {
  it('counts public vs private hosts so the operator knows what they are publishing', () => {
    const detections = [
      { host: '10.0.0.1' }, { host: '192.168.1.4' }, { host: '203.0.113.9' }, { host: '127.0.0.1' }
    ] as Detection[]

    expect(summarizeAddressSpace(detections)).toEqual({ public: 1, private: 3 })
  })
})
