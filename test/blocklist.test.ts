import { describe, expect, it } from 'vitest'
import { isBlockedSource, isDisallowedHost, isDisallowedUrl, isLoopbackAddress, isPrivateAddress } from '~~/server/utils/blocklist'

function setConfig(patch: Record<string, unknown>) {
  globalThis.__testConfig = { ...globalThis.__testConfig, ...patch }
}

describe('private address detection', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.4.2',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.1.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fd00::1'
  ])('flags %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', 'not-an-ip'])('does not flag %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false)
  })

  it('identifies loopback separately from RFC1918', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('192.168.1.10')).toBe(false)
    expect(isLoopbackAddress('10.1.2.3')).toBe(false)
  })
})

describe('isDisallowedHost', () => {
  it('blocks loopback and LAN hosts by default', () => {
    expect(isDisallowedHost('127.0.0.1')).toBe(true)
    expect(isDisallowedHost('192.168.0.1')).toBe(true)
    expect(isDisallowedHost('localhost')).toBe(true)
    expect(isDisallowedHost('printer.local')).toBe(true)
    expect(isDisallowedHost('camera.internal')).toBe(true)
    expect(isDisallowedHost('')).toBe(true)
  })

  it('allows public hosts', () => {
    expect(isDisallowedHost('example.com')).toBe(false)
    expect(isDisallowedHost('8.8.8.8')).toBe(false)
  })

  it('honours the operator blocklist by host and suffix', () => {
    setConfig({ blockedHosts: 'example.com, takedown.example' })
    expect(isDisallowedHost('example.com')).toBe(true)
    expect(isDisallowedHost('cdn.example.com')).toBe(true)
    expect(isDisallowedHost('nottakedown.example')).toBe(false)
  })

  it('recognises blocklisted sources', () => {
    setConfig({ blockedHosts: 'source:osm' })
    expect(isBlockedSource('OSM')).toBe(true)
    expect(isBlockedSource('tfl')).toBe(false)
  })

  it('relaxes loopback only when explicitly enabled', () => {
    setConfig({ allowPrivateHosts: 'true' })
    expect(isDisallowedHost('127.0.0.1')).toBe(false)
    expect(isDisallowedHost('::1')).toBe(false)
    // The escape hatch must never reopen router/LAN/metadata hosts.
    expect(isDisallowedHost('192.168.1.10')).toBe(true)
    expect(isDisallowedHost('169.254.169.254')).toBe(true)
    expect(isDisallowedHost('10.0.0.1')).toBe(true)
  })
})

describe('isDisallowedUrl', () => {
  it.each([
    'ftp://example.com/cam.jpg',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://user:pass@example.com/cam.jpg',
    'http://192.168.1.4/snapshot.jpg',
    'not a url'
  ])('rejects %s', (url) => {
    expect(isDisallowedUrl(url)).toBe(true)
  })

  it('accepts ordinary public camera URLs', () => {
    expect(isDisallowedUrl('https://example.com/cam.jpg')).toBe(false)
  })
})
