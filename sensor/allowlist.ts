/**
 * The operator's written declaration of what this tool may touch.
 *
 * A file rather than a flag: it is reviewable, diffable and has to exist before
 * a public range can be scanned. Private ranges still need an explicit target
 * on the command line, but the allowlist is the thing you show someone when
 * they ask "why was my IP probed?".
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { assertAuthorizedTargets, type AuthorizationResult } from './cidr.ts'

export const DEFAULT_ALLOWLIST_PATH = resolve(process.cwd(), 'sensor.allowlist.json')

export interface Allowlist {
  /** Blocks the operator asserts they own or are authorized to test. */
  allowed: string[]
  /** Explicit opt-in for anything that is not RFC1918/loopback/link-local. */
  publicAllowed: boolean
  note?: string
}

export const ALLOWLIST_TEMPLATE: Allowlist = {
  allowed: [
    '192.168.1.0/24',
    '10.0.0.0/24'
  ],
  publicAllowed: false,
  note: 'List only networks you own or have written permission to test. Keep publicAllowed false unless you are certain.'
}

export function readAllowlist(path = DEFAULT_ALLOWLIST_PATH): Allowlist | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Allowlist>
    return {
      allowed: Array.isArray(parsed.allowed) ? parsed.allowed.filter((value): value is string => typeof value === 'string') : [],
      publicAllowed: parsed.publicAllowed === true,
      note: typeof parsed.note === 'string' ? parsed.note : undefined
    }
  } catch {
    return null
  }
}

export function writeAllowlistTemplate(path = DEFAULT_ALLOWLIST_PATH): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(ALLOWLIST_TEMPLATE, null, 2)}\n`, 'utf8')
  return path
}

export interface AuthorizeOptions {
  allowlistPath?: string
  /** CLI opt-in; still requires the block to be listed. */
  allowPublic?: boolean
  maxHosts?: number
}

/**
 * Load the allowlist and authorize the requested targets.
 *
 * Unlike a web provider, this fails closed: a missing allowlist file is an
 * error, not an empty list, so nobody can forget to declare their scope.
 */
export function authorizeTargets(targets: string[], options: AuthorizeOptions = {}): {
  authorization: AuthorizationResult
  allowlist: Allowlist
  path: string
} {
  const path = options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH
  const allowlist = readAllowlist(path)
  if (!allowlist) {
    throw new Error(
      `No allowlist at ${path}. Create one with: npm run sensor -- init`
    )
  }

  const allowPublic = Boolean(options.allowPublic) && allowlist.publicAllowed
  const authorization = assertAuthorizedTargets(targets, {
    allowlist: allowlist.allowed,
    allowPublic,
    maxHosts: options.maxHosts
  })

  return { authorization, allowlist, path }
}
