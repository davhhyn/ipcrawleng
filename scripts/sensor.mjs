#!/usr/bin/env node
/**
 * Local sensor CLI.
 *
 *   npm run sensor -- init                      create sensor.allowlist.json
 *   npm run sensor -- scan --cidr 192.168.1.0/24
 *   npm run sensor -- scan --cidr 10.0.0.0/24 --json --no-write
 *   npm run sensor -- import --file shodan.jsonl
 *   npm run sensor -- status
 *
 * This tool only ever touches networks you list in an allowlist you write. It
 * never attempts credentials, never scans public space by default, and stores
 * results in your own SQLite database.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { authorizeTargets, DEFAULT_ALLOWLIST_PATH, readAllowlist, writeAllowlistTemplate } from '../sensor/allowlist.ts'
import { isScannable } from '../sensor/cidr.ts'
import { scan } from '../sensor/scan.ts'
import { DEFAULT_PORTS, parsePortList } from '../sensor/ports.ts'
import { parseDataset, summarizeAddressSpace } from '../sensor/import.ts'

const COLORS = process.stdout.isTTY
  ? { dim: '\u001b[2m', red: '\u001b[31m', green: '\u001b[32m', yellow: '\u001b[33m', cyan: '\u001b[36m', bold: '\u001b[1m', off: '\u001b[0m' }
  : { dim: '', red: '', green: '', yellow: '', cyan: '', bold: '', off: '' }

const c = COLORS
const log = (...args) => console.error(...args)
const fail = (message) => { log(`\n${c.red}✗ ${message}${c.off}\n`); process.exit(1) }

/* ── Argument parsing ─────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const [command = 'scan', ...rest] = argv
  const flags = {}
  const positional = []

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (!token.startsWith('--')) { positional.push(token); continue }
    const key = token.replace(/^--/, '')
    const next = rest[i + 1]
    if (next && !next.startsWith('--')) { flags[key] = next; i++ } else { flags[key] = true }
  }

  return { command, flags, positional }
}

const value = (flags, key, fallback = undefined) =>
  flags[key] === undefined || flags[key] === true ? fallback : String(flags[key])

const bool = (flags, key) => flags[key] === true || flags[key] === 'true'

/* ── Delivery to the app ──────────────────────────────────────────────────── */

async function deliver(detections, options) {
  const url = (options.url || 'http://localhost:3000').replace(/\/+$/, '')
  const token = options.token || process.env.NUXT_SYNC_TOKEN || ''

  if (!token) {
    fail(
      'No ingest token. Set NUXT_SYNC_TOKEN in the app environment and pass it with --token,\n' +
      '  or re-run with --no-write to keep results on disk only.'
    )
  }

  const response = await fetch(`${url}/api/sensor/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      origin: options.origin,
      complete: options.complete === true,
      detections: detections.map(serializeDetection)
    })
  }).catch((error) => fail(`Could not reach ${url}: ${error.message}`))

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    fail(`Ingest failed (${response.status}): ${body.slice(0, 300)}`)
  }

  const result = await response.json()
  log(`\n${c.green}✓${c.off} stored ${result.stored} detections ` +
      `${c.dim}(${result.inserted} new, ${result.updated} updated, ${result.deactivated} retired)${c.off}`)
  log(`  ${c.dim}browse them: ${url}/?source=${options.origin}${c.off}\n`)
}

function serializeDetection(detection) {
  return {
    host: detection.host,
    port: detection.port,
    protocol: detection.protocol,
    kind: detection.kind,
    url: detection.url,
    title: detection.title,
    vendorHints: detection.vendorHints,
    evidence: detection.evidence,
    latencyMs: detection.latencyMs,
    context: detection.context ?? null,
    tags: detection.tags ?? null
  }
}

/* ── Commands ─────────────────────────────────────────────────────────────── */

async function commandInit(flags) {
  const path = value(flags, 'path', DEFAULT_ALLOWLIST_PATH)
  if (existsSync(path)) {
    log(`${c.yellow}!${c.off} ${path} already exists — leaving it alone`)
    return
  }
  writeAllowlistTemplate(path)
  log(`\n${c.green}✓${c.off} wrote ${path}`)
  log(`${c.dim}  Edit it to list only networks you own, then run:${c.off}`)
  log(`  npm run sensor -- scan --cidr 192.168.1.0/24\n`)
}

async function commandScan(flags) {
  const cidrs = String(value(flags, 'cidr', '') || '')
    .split(/[\s,;]+/)
    .map(part => part.trim())
    .filter(Boolean)

  if (!cidrs.length) {
    fail(
      'No targets. Example:\n' +
      '  npm run sensor -- scan --cidr 192.168.1.0/24\n\n' +
      'Targets must also appear in sensor.allowlist.json (run `npm run sensor -- init`).'
    )
  }

  const ports = value(flags, 'ports') ? parsePortList(String(value(flags, 'ports'))) : DEFAULT_PORTS
  const allowlistPath = value(flags, 'allowlist', DEFAULT_ALLOWLIST_PATH)

  // The authorization gate. Throws before a single socket is opened.
  let authorized
  try {
    authorized = authorizeTargets(cidrs, {
      allowlistPath,
      allowPublic: bool(flags, 'allow-public'),
      maxHosts: value(flags, 'max-hosts') ? Number(value(flags, 'max-hosts')) : undefined
    })
  } catch (error) {
    fail(error.message)
  }

  const { authorization } = authorized
  // Whole blocks are authorized; network and broadcast addresses still cannot
  // host a camera, so they never reach a socket.
  const hosts = authorization.hosts.filter(isScannable)
  const skipped = authorization.hosts.length - hosts.length

  log(`\n${c.bold}IPCrawl local sensor${c.off}`)
  log(`  targets   ${authorization.blocks.map(block => `${block.text} ${c.dim}(${block.size} addr, ${block.class})${c.off}`).join('\n            ')}`)
  log(`  addresses ${hosts.length}${skipped ? ` ${c.dim}(${skipped} network/broadcast skipped)${c.off}` : ''}`)
  log(`  ports     ${ports.join(', ')}`)
  log(`  allowlist ${allowlistPath}${c.dim} (${authorized.allowlist.allowed.length} block(s))${c.off}`)

  for (const warning of authorization.warnings) log(`  ${c.yellow}!${c.off} ${warning}`)

  if (authorization.publicHosts > 0 && !bool(flags, 'yes')) {
    fail(
      `${authorization.publicHosts} public address(es) are in scope.\n` +
      '  Re-run with --yes to confirm you are authorized to test them.'
    )
  }

  if (bool(flags, 'dry-run')) {
    log(`\n${c.cyan}dry run${c.off} — nothing was probed.`)
    log(`  would probe ${hosts.length} hosts × ${ports.length} ports = ${hosts.length * ports.length} connects\n`)
    return
  }

  log(`\n${c.dim}scanning…${c.off}`)
  const started = Date.now()
  const summary = await scan({
    targets: hosts,
    ports,
    timeoutMs: value(flags, 'timeout') ? Number(value(flags, 'timeout')) : undefined,
    budgetMs: value(flags, 'budget') ? Number(value(flags, 'budget')) : undefined,
    concurrency: value(flags, 'concurrency') ? Number(value(flags, 'concurrency')) : undefined,
    onProgress: (done, total) => {
      if (!process.stdout.isTTY) return
      process.stderr.write(`\r  ${c.dim}${done}/${total} hosts${c.off}   `)
    }
  })
  if (process.stdout.isTTY) process.stderr.write('\r')

  log(`\n  ${summary.hosts} hosts · ${summary.openPorts} open ports · ` +
      `${summary.detections.length} camera-like · ${((Date.now() - started) / 1000).toFixed(1)}s` +
      (summary.truncated ? ` ${c.yellow}(budget reached — results partial)${c.off}` : ''))

  for (const detection of summary.detections) {
    const evidence = [
      detection.evidence.server,
      detection.evidence.realm,
      detection.evidence.rtspMethods?.length ? `RTSP ${detection.evidence.rtspMethods.join(',')}` : null,
      detection.evidence.authRequired ? 'auth required' : null
    ].filter(Boolean).join(' · ')
    log(`  ${c.green}●${c.off} ${detection.host}:${detection.port}  ${c.bold}${detection.title}${c.off}`)
    log(`    ${c.dim}${detection.kind}${evidence ? ` · ${evidence}` : ''}${c.off}`)
  }

  if (!summary.detections.length) {
    log(`\n  ${c.dim}No camera-like services answered. That can mean the network is clean,` +
        `\n  the cameras are on another subnet, or they need authentication to reveal anything.${c.off}`)
  }

  if (bool(flags, 'json')) {
    process.stdout.write(`${JSON.stringify(summary.detections.map(serializeDetection), null, 2)}\n`)
  }

  if (bool(flags, 'no-write')) {
    log(`\n${c.dim}--no-write: results were not stored.${c.off}\n`)
    return
  }
  if (!summary.detections.length) return

  await deliver(summary.detections, {
    origin: 'sensor',
    url: value(flags, 'url'),
    token: value(flags, 'token'),
    // A budget-truncated scan has not seen the whole scope, so it must not
    // retire rows it simply did not get to.
    complete: !summary.truncated
  })
}

async function commandImport(flags) {
  const file = value(flags, 'file') || flags._?.[0]
  const paths = [file, ...(process.argv.slice(2).filter(arg => !arg.startsWith('--')))]
    .filter(Boolean)
    .filter(candidate => {
      try { return statSync(String(candidate)).isFile() } catch { return false }
    })

  const target = paths[0]
  if (!target) fail('Usage: npm run sensor -- import --file <dataset.jsonl|json|csv>')

  const text = readFileSync(resolve(String(target)), 'utf8')
  const summary = parseDataset(text, value(flags, 'format') ?? 'auto')
  const space = summarizeAddressSpace(summary.detections)

  log(`\n${c.bold}Dataset import${c.off}`)
  log(`  file      ${target}`)
  log(`  format    ${summary.format}`)
  log(`  parsed    ${summary.parsed}`)
  log(`  kept      ${summary.kept} ${c.dim}(${space.public} public, ${space.private} private)${c.off}`)
  if (summary.skipped) {
    const reasons = Object.entries(summary.reasons).map(([reason, count]) => `${count}× ${reason}`).join(', ')
    log(`  skipped   ${summary.skipped} ${c.dim}(${reasons})${c.off}`)
  }

  for (const detection of summary.detections.slice(0, 10)) {
    log(`  ${c.green}●${c.off} ${detection.host}:${detection.port}  ${detection.title}`)
  }
  if (summary.detections.length > 10) {
    log(`  ${c.dim}… ${summary.detections.length - 10} more${c.off}`)
  }

  if (bool(flags, 'json')) {
    process.stdout.write(`${JSON.stringify(summary.detections.map(serializeDetection), null, 2)}\n`)
  }

  if (bool(flags, 'no-write') || !summary.detections.length) {
    log(`\n${c.dim}nothing stored${c.off}\n`)
    return
  }

  await deliver(summary.detections, {
    origin: 'import',
    url: value(flags, 'url'),
    token: value(flags, 'token')
  })
}

async function commandStatus(flags) {
  const url = (value(flags, 'url') || 'http://localhost:3000').replace(/\/+$/, '')
  const response = await fetch(`${url}/api/sensor/status`).catch((error) =>
    fail(`Could not reach ${url}: ${error.message}`))
  if (!response.ok) fail(`Status failed (${response.status})`)

  const status = await response.json()
  const allowlist = readAllowlist()

  log(`\n${c.bold}Local sensor status${c.off}`)
  log(`  allowlist     ${allowlist ? `${allowlist.allowed.length} block(s)` : `${c.yellow}missing${c.off}`}`)
  log(`  allow public  ${allowlist?.publicAllowed ? `${c.yellow}yes${c.off}` : 'no'}`)
  log(`  ingest        ${status.ingestEnabled ? 'enabled (token required)' : 'disabled'}`)
  log(`  frames        ${status.fetchLocalFrames ? 'proxied from your network' : 'disabled'}`)
  log(`  local rows    ${status.counts.local} (${status.counts.localLive} live)`)
  log(`  imported rows ${status.counts.imported}`)
  if (status.lastRun) {
    log(`  last run      ${status.lastRun.origin} · ${new Date(status.lastRun.at).toISOString()} · ${status.lastRun.stored} stored`)
  } else {
    log(`  last run      ${c.dim}never${c.off}`)
  }
  log('')
}

/* ── Entry ────────────────────────────────────────────────────────────────── */

const { command, flags } = parseArgs(process.argv.slice(2))

try {
  if (command === 'init') await commandInit(flags)
  else if (command === 'scan') await commandScan(flags)
  else if (command === 'import') await commandImport(flags)
  else if (command === 'status') await commandStatus(flags)
  else if (command === '--help' || command === 'help') {
    log(`
IPCrawl local sensor

  init     write sensor.allowlist.json
  scan     probe networks you listed in the allowlist
  import   index a dataset you already have (no network calls)
  status   show sensor state from the running app

scan options
  --cidr <a,b>      targets, e.g. 192.168.1.0/24,10.0.0.5
  --ports <list>    override the default ${DEFAULT_PORTS.length}-port camera list
  --allow-public    permit a public block (must also be in the allowlist)
  --yes             skip the public-range confirmation
  --dry-run         show what would be scanned, probe nothing
  --max-hosts N     raise the 4096 address cap (deliberately manual)
  --timeout ms      per-connection timeout (default 1200)
  --budget ms       wall-clock cap for the whole scan (default 90000)
  --no-write        keep results on disk only
  --json            print detections as JSON on stdout

import options
  --file <path>     .jsonl, .json or .csv export
  --format <f>      jsonl | json | csv | auto
  --no-write        parse only

environment
  NUXT_SYNC_TOKEN   ingest token (required to store results)
  NUXT_SENSOR_URL   app base URL (default http://localhost:3000)
`)
  } else {
    fail(`Unknown command "${command}". Try: npm run sensor -- help`)
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
