/**
 * Render the raster brand assets from inline SVG.
 *
 * Social crawlers and iOS home screens don't reliably accept SVG, so the
 * repository ships PNG derivatives alongside `public/favicon.svg`.
 *
 *   node scripts/generate-brand-assets.mjs
 */
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const publicDir = resolve(new URL('../public', import.meta.url).pathname)
mkdirSync(publicDir, { recursive: true })

const BG = '#05070a'
const SIGNAL = '#7aa7ff'
const LIVE = '#6ff2c0'
const DIM = '#97a4b9'
const MUTE = '#647189'

/** The crosshair mark, parameterised so it can be reused at any size. */
function mark(size, { padding = 0.1, background = true } = {}) {
  const s = size
  const p = s * padding
  const box = s - p * 2
  const cx = s / 2
  const cy = s / 2
  const r = box * 0.31
  return `
    ${background ? `<rect width="${s}" height="${s}" rx="${s * 0.23}" fill="${BG}"/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${SIGNAL}" stroke-opacity=".28" stroke-width="${s * 0.023}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.65}" fill="none" stroke="${SIGNAL}" stroke-opacity=".55" stroke-width="${s * 0.023}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${SIGNAL}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.12}" fill="${BG}"/>
    <path d="M${cx} ${p} v${s * 0.11} M${cx} ${s - p} v-${s * 0.11} M${p} ${cy} h${s * 0.11} M${s - p} ${cy} h-${s * 0.11}"
          stroke="${LIVE}" stroke-width="${s * 0.031}" stroke-linecap="round"/>
  `
}

function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${mark(size, { padding: 0.08 })}
  </svg>`
}

const W = 1200
const H = 630

const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#070b14"/>
      <stop offset="0.55" stop-color="${BG}"/>
      <stop offset="1" stop-color="#03050a"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.16" cy="0.05" r="0.7">
      <stop offset="0" stop-color="${SIGNAL}" stop-opacity=".30"/>
      <stop offset="1" stop-color="${SIGNAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.92" cy="0.12" r="0.6">
      <stop offset="0" stop-color="#a78bfa" stop-opacity=".18"/>
      <stop offset="1" stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowC" cx="0.5" cy="1.05" r="0.7">
      <stop offset="0" stop-color="${LIVE}" stop-opacity=".14"/>
      <stop offset="1" stop-color="${LIVE}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M46 0H0v46" fill="none" stroke="#ffffff" stroke-opacity=".045" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity=".65"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <rect width="${W}" height="${H}" fill="url(#glowC)"/>

  <g transform="translate(72 74)">
    <rect x="-8" y="-8" width="90" height="90" rx="22" fill="${BG}" fill-opacity=".6"
          stroke="${SIGNAL}" stroke-opacity=".22"/>
    ${mark(74, { padding: 0.08, background: false })}
  </g>

  <text x="164" y="112" fill="#e9eef8" font-family="Inter, Helvetica, Arial, sans-serif"
        font-size="21" font-weight="600" letter-spacing="3.4">IPCRAWL OPEN</text>
  <text x="164" y="140" fill="${MUTE}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="12.5" letter-spacing="2.1">PUBLIC CAMERA INDEX · MULTI-SOURCE</text>

  <text x="72" y="286" fill="#f2f6fd" font-family="Inter, Helvetica, Arial, sans-serif"
        font-size="76" font-weight="650" letter-spacing="-2.4">Open camera</text>
  <text x="72" y="366" fill="${SIGNAL}" font-family="Inter, Helvetica, Arial, sans-serif"
        font-size="76" font-weight="650" letter-spacing="-2.4">intelligence.</text>

  <text x="74" y="424" fill="${DIM}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="21">
    Explore · Atlas · Fun mode · Stats · Public API
  </text>
  <text x="74" y="458" fill="${MUTE}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="18">
    Free, keyless sources. No Shodan account, no paywall.
  </text>

  <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12.5" letter-spacing="1.6">
    <rect x="72" y="512" width="184" height="34" rx="17" fill="#0a0e16" stroke="${LIVE}" stroke-opacity=".35"/>
    <circle cx="94" cy="529" r="4.5" fill="${LIVE}"/>
    <text x="110" y="534" fill="${LIVE}" fill-opacity=".92">KEYLESS</text>

    <rect x="268" y="512" width="214" height="34" rx="17" fill="#0a0e16" stroke="${SIGNAL}" stroke-opacity=".32"/>
    <circle cx="290" cy="529" r="4.5" fill="${SIGNAL}"/>
    <text x="306" y="534" fill="${SIGNAL}" fill-opacity=".95">OPEN LICENCES</text>

    <rect x="494" y="512" width="196" height="34" rx="17" fill="#0a0e16" stroke="#ffffff" stroke-opacity=".14"/>
    <circle cx="516" cy="529" r="4.5" fill="${DIM}"/>
    <text x="532" y="534" fill="${DIM}">SELF-HOSTED</text>
  </g>

  <g transform="translate(880 386)" opacity=".9">
    <circle cx="120" cy="120" r="150" fill="none" stroke="${SIGNAL}" stroke-opacity=".14"/>
    <circle cx="120" cy="120" r="104" fill="none" stroke="${SIGNAL}" stroke-opacity=".18"/>
    <circle cx="120" cy="120" r="58" fill="none" stroke="${SIGNAL}" stroke-opacity=".24"/>
    <path d="M120 30v28M120 182v28M30 120h28M182 120h28"
          stroke="${LIVE}" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
    <circle cx="120" cy="120" r="7" fill="${SIGNAL}"/>
    <circle cx="120" cy="120" r="2.6" fill="${BG}"/>
  </g>

  <rect x="0" y="${H - 3}" width="${W}" height="3" fill="${SIGNAL}" fill-opacity=".5"/>
</svg>`

function render(svg, size) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  return png
}

const outputs = [
  ['og-cover.png', render(cover, W)],
  ['apple-touch-icon.png', render(iconSvg(180), 180)],
  ['icon-192.png', render(iconSvg(192), 192)],
  ['icon-512.png', render(iconSvg(512), 512)]
]

for (const [name, png] of outputs) {
  writeFileSync(resolve(publicDir, name), png)
  console.log(`${name}: ${(png.length / 1024).toFixed(1)} KiB`)
}
