import { hash32, seededRandom } from '#shared/geo'
import { sourceShort, sourceAccent } from '#shared/sources'

/**
 * Deterministic, illustration-grade placeholder frames.
 *
 * The catalogue proxies real frames whenever an upstream camera answers. When
 * it doesn't (offline camera, blocked network, page-only entry, or the bundled
 * seed dataset) we render a stable, city/region-flavoured scene instead of a
 * grey "no signal" box. Every frame is explicitly stamped as generated so it
 * can never be mistaken for live imagery.
 */

export interface SyntheticFrameOptions {
  id: string
  title: string
  city: string | null
  country: string | null
  countryCode?: string | null
  region?: string | null
  source: string
  kind: string
  lat?: number | null
  lon?: number | null
  isDemo: boolean
  reason?: 'offline' | 'unavailable' | 'seed' | 'page'
}

const W = 1200
const H = 675

const esc = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const fmt = (value: number) => Math.round(value * 10) / 10

interface Palette {
  skyTop: string
  skyMid: string
  skyLow: string
  glow: string
  waterTop: string
  waterLow: string
  landFar: string
  landMid: string
  landNear: string
  ink: string
  light: string
  sun: string
}

const PALETTES: Palette[] = [
  {
    skyTop: '#040812',
    skyMid: '#0a1527',
    skyLow: '#162c44',
    glow: '#7aa7ff',
    waterTop: '#0b1b2b',
    waterLow: '#030711',
    landFar: '#111d2c',
    landMid: '#0a121e',
    landNear: '#050a11',
    ink: '#dbe7fb',
    light: '#ffd79a',
    sun: '#c7d9ff'
  },
  {
    skyTop: '#090716',
    skyMid: '#241a3a',
    skyLow: '#5b3a4c',
    glow: '#ff9d78',
    waterTop: '#231a2b',
    waterLow: '#07060f',
    landFar: '#2a1d29',
    landMid: '#170f1c',
    landNear: '#0b0710',
    ink: '#f6e7df',
    light: '#ffcf9b',
    sun: '#ffb184'
  },
  {
    skyTop: '#03110f',
    skyMid: '#082725',
    skyLow: '#0f4a41',
    glow: '#6ff2c0',
    waterTop: '#08302c',
    waterLow: '#02100e',
    landFar: '#0b2a26',
    landMid: '#061c19',
    landNear: '#030e0c',
    ink: '#dff8ee',
    light: '#ffe2a8',
    sun: '#a8ffe4'
  },
  {
    skyTop: '#070b16',
    skyMid: '#15233a',
    skyLow: '#3f5d70',
    glow: '#a9d8ff',
    waterTop: '#173546',
    waterLow: '#050d16',
    landFar: '#1b2c39',
    landMid: '#0e1923',
    landNear: '#060c13',
    ink: '#eaf4ff',
    light: '#ffe0b0',
    sun: '#e8f4ff'
  }
]

type SceneKind = 'skyline' | 'mountain' | 'coast' | 'forest' | 'plains' | 'harbor' | 'snow'

function pickScene(opts: SyntheticFrameOptions, rand: () => number): SceneKind {
  const country = (opts.country || '').toLowerCase()
  const city = (opts.city || '').toLowerCase()
  const title = (opts.title || '').toLowerCase()
  const haystack = `${country} ${city} ${title}`

  if (/reykjav|iceland|norway|norge|finland|suomi|sweden|sverige|troms|rovaniemi|kiruna|svalbard|greenland/.test(haystack)) {
    return rand() > 0.35 ? 'snow' : 'forest'
  }
  if (/switzerland|austria|nepal|bhutan|chile|patagonia|new zealand|georgia|armenia|kyrgyz|kazakh|alps|dolomit|tirol|innsbruck|bolzano|zermatt|chamonix|almaty|acropolis|athens|parthenon|cusco|bogot/.test(haystack)) {
    return 'mountain'
  }
  if (/tokyo|new york|manhattan|chicago|toronto|seoul|shanghai|hong kong|singapore|dubai|mumbai|london|paris|barcelona|madrid|berlin|mexico city|sao paulo|são paulo|sydney|melbourne|bangkok|taipei|osaka|los angeles|san francisco|miami|las vegas/.test(haystack)) {
    return rand() > 0.28 ? 'skyline' : 'coast'
  }
  if (/desert|sahara|dubai|abu dhabi|qatar|kuwait|bahrain|oman|saudi|egypt|cairo|marrakech|morocco|namibia|australia|outback|arizona|nevada|utah|texas/.test(haystack)) {
    return rand() > 0.4 ? 'plains' : 'harbor'
  }
  if (/island|coast|harbou?r|port|bay|beach|marina|venice|venezia|rio|lisbon|porto|santorini|mykonos|split|dubrovnik|croatia|greece|malta|hawaii|fiji|bali|phuket|seychelles|mauritius|canary|cape town/.test(haystack)) {
    return rand() > 0.3 ? 'coast' : 'harbor'
  }
  if (/port|harbou?r|dock|marina|ferry|container|terminal/.test(haystack)) {
    return 'harbor'
  }

  const roll = rand()
  if (roll < 0.22) return 'skyline'
  if (roll < 0.42) return 'mountain'
  if (roll < 0.62) return 'coast'
  if (roll < 0.78) return 'forest'
  if (roll < 0.9) return 'plains'
  return 'harbor'
}

function stars(rand: () => number, count: number, maxY: number): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = fmt(rand() * W)
    const y = fmt(rand() * maxY)
    const r = fmt(rand() * 1.4 + 0.3)
    const o = (rand() * 0.65 + 0.2).toFixed(2)
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#eaf3ff" opacity="${o}"/>`
  }
  return out
}

function ridge(
  rand: () => number,
  baseY: number,
  amplitude: number,
  fill: string,
  opacity = 1,
  rim = false
): string {
  const points: [number, number][] = [[0, baseY - amplitude * 0.15]]
  let x = 0
  while (x < W) {
    const step = 55 + rand() * 95
    x += step
    const peakY = baseY - (rand() * amplitude + amplitude * 0.3)
    points.push([Math.min(W, x), peakY])
    points.push([Math.min(W, x + step * 0.45), baseY - rand() * amplitude * 0.22])
  }
  points.push([W, baseY - amplitude * 0.2], [W, H], [0, H])

  const filled = points.map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`).join('')
  let out = `<path d="${filled}Z" fill="${fill}" opacity="${opacity}"/>`

  if (rim) {
    // A lighter rim along the crest reads as snow/rock catching the sky.
    const crest = points.slice(0, -3)
      .map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`)
      .join('')
    out += `<path d="${crest}" fill="none" stroke="#dbe9f7" stroke-width="2" opacity=".16" stroke-linejoin="round"/>`
  }
  return out
}

function skyline(rand: () => number, palette: Palette): string {
  let out = ''
  const horizon = 470

  for (let layer = 0; layer < 3; layer++) {
    let x = -20
    const base = horizon - layer * 26
    const fill = layer === 0 ? palette.landFar : layer === 1 ? palette.landMid : palette.landNear
    const opacity = layer === 0 ? 0.55 : 1
    let buildings = ''
    while (x < W + 20) {
      const width = 26 + rand() * (layer === 2 ? 82 : 58)
      const height = 40 + rand() * (layer === 2 ? 210 : 140)
      const top = base - height
      buildings += `<rect x="${fmt(x)}" y="${fmt(top)}" width="${fmt(width)}" height="${fmt(height)}" fill="${fill}" opacity="${opacity}"/>`
      if (layer === 2 && rand() > 0.72) {
        buildings += `<rect x="${fmt(x + width * 0.22)}" y="${fmt(top - 16)}" width="${fmt(width * 0.5)}" height="16" fill="${fill}"/>`
      }
      if (layer === 2 && rand() > 0.7) {
        buildings += `<path d="M${fmt(x + width * 0.5)} ${fmt(top)} v-${fmt(18 + rand() * 34)}" stroke="${fill}" stroke-width="2"/>`
      }
      if (rand() > 0.25) {
        const cols = Math.max(2, Math.floor(width / 16))
        const rows = Math.max(2, Math.floor(height / 20))
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rand() > 0.72) {
              const lit = rand() > 0.35 ? palette.light : '#9fc7ff'
              buildings += `<rect x="${fmt(x + 6 + c * (width - 10) / cols)}" y="${fmt(top + 8 + r * (height - 12) / rows)}" width="${fmt(Math.max(2, (width - 10) / cols * 0.42))}" height="3" fill="${lit}" opacity="${(0.22 + rand() * 0.5).toFixed(2)}"/>`
            }
          }
        }
      }
      x += width + rand() * 10
    }
    out += buildings
  }

  out += `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="${palette.waterLow}"/>`
  out += `<rect x="0" y="${horizon}" width="${W}" height="2" fill="${palette.glow}" opacity=".22"/>`
  for (let i = 0; i < 26; i++) {
    const y = horizon + 8 + rand() * 150
    const x = rand() * W
    out += `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(20 + rand() * 90)}" height="1.4" fill="${palette.glow}" opacity="${(0.04 + rand() * 0.12).toFixed(2)}"/>`
  }
  return out
}

function mountains(rand: () => number, palette: Palette): string {
  return `
    ${ridge(rand, 462, 150, palette.landFar, 0.5, true)}
    ${ridge(rand, 522, 190, palette.landMid, 0.92, true)}
    ${ridge(rand, 596, 215, palette.landNear, 1, false)}
    <path d="M0 600 Q ${W * 0.25} 560 ${W * 0.5} 606 T ${W} 588 V${H} H0Z" fill="#02050a" opacity=".86"/>
  `
}

function coast(rand: () => number, palette: Palette): string {
  const horizon = 372
  let out = `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#water)"/>`
  // Glitter path from the sun to the viewer.
  for (let i = 0; i < 46; i++) {
    const y = horizon + 6 + (i / 46) * (H - horizon)
    const spread = 16 + (i / 46) * 150
    const x = W * 0.68 - spread / 2 + rand() * spread
    out += `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(10 + rand() * 34)}" height="1.6" fill="${palette.light}" opacity="${(0.05 + rand() * 0.22).toFixed(2)}"/>`
  }
  // Headland on the left.
  out += `<path d="M0 372 L0 286 Q 90 300 160 336 Q 240 370 300 372Z" fill="${palette.landMid}" opacity=".9"/>`
  out += `<path d="M0 372 L0 330 Q 70 340 130 362 Q 170 374 210 372Z" fill="${palette.landNear}" opacity=".9"/>`
  // Wave strokes.
  for (let i = 0; i < 30; i++) {
    const y = horizon + 14 + rand() * (H - horizon - 20)
    const x = rand() * W
    const length = 20 + rand() * 120
    out += `<path d="M${fmt(x)} ${fmt(y)} q ${fmt(length / 2)} -3 ${fmt(length)} 0" stroke="#bcd7ff" stroke-width="1" fill="none" opacity="${(0.03 + rand() * 0.11).toFixed(2)}"/>`
  }
  // A small boat.
  const bx = 190 + rand() * 120
  const by = horizon + 60 + rand() * 40
  out += `<path d="M${fmt(bx)} ${fmt(by)} h34 l-7 9 h-20Z" fill="#040a11" opacity=".85"/>`
  out += `<path d="M${fmt(bx + 15)} ${fmt(by)} v-26 l17 20Z" fill="#0a1420" opacity=".8"/>`
  // Birds.
  for (let i = 0; i < 4; i++) {
    const x = 760 + rand() * 300
    const y = 140 + rand() * 120
    out += `<path d="M${fmt(x)} ${fmt(y)} q 6 -5 12 0 M${fmt(x + 12)} ${fmt(y)} q 6 -5 12 0" stroke="#dce8f8" stroke-width="1.4" fill="none" opacity=".4"/>`
  }
  return out
}

function trees(rand: () => number, yBase: number, height: number, fill: string, opacity: number): string {
  let out = ''
  let x = -20
  while (x < W + 20) {
    const trunkH = height * (0.55 + rand() * 0.6)
    const w = 16 + rand() * 30
    const top = yBase - trunkH
    out += `<path d="M${fmt(x)} ${fmt(yBase)} L${fmt(x + w / 2)} ${fmt(top)} L${fmt(x + w)} ${fmt(yBase)}Z" fill="${fill}" opacity="${opacity}"/>`
    if (rand() > 0.45) {
      out += `<path d="M${fmt(x + w * 0.08)} ${fmt(yBase - trunkH * 0.35)} L${fmt(x + w / 2)} ${fmt(top + trunkH * 0.12)} L${fmt(x + w * 0.92)} ${fmt(yBase - trunkH * 0.35)}Z" fill="${fill}" opacity="${opacity}"/>`
    }
    x += w * (0.6 + rand() * 0.5)
  }
  return out
}

function forest(rand: () => number, palette: Palette): string {
  let out = ''
  // A moon and horizon rim-light keep the treeline from reading as a black void.
  out += `<circle cx="${fmt(W * 0.2)}" cy="128" r="96" fill="url(#sunGlow)" opacity=".28"/>`
  out += `<circle cx="${fmt(W * 0.2)}" cy="128" r="22" fill="#dfe9fb" opacity=".8"/>`
  out += `<rect x="0" y="470" width="${W}" height="${H - 470}" fill="url(#water)"/>`
  out += `<path d="M0 470 Q 300 448 620 466 T ${W} 456 V${H} H0Z" fill="${palette.landNear}" opacity=".9"/>`
  out += `<path d="M0 470 Q 300 448 620 466 T ${W} 456" stroke="#a9c4e6" stroke-opacity=".22" stroke-width="1.6" fill="none"/>`
  out += trees(rand, 505, 92, palette.landMid, 0.8)
  out += trees(rand, 565, 132, '#071019', 0.92)
  out += trees(rand, 675, 210, '#03080e', 1)
  for (let i = 0; i < 4; i++) {
    out += `<rect x="0" y="${fmt(400 + i * 44)}" width="${W}" height="${fmt(26 + rand() * 20)}" fill="#cfe1f5" opacity="${(0.05 + i * 0.02).toFixed(3)}"/>`
  }
  return out
}

function plains(rand: () => number, palette: Palette): string {
  const horizon = 360
  let out = `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="#071019"/>`
  // Field bands.
  const bands = ['#0a1620', '#09121b', '#0b1822', '#081018']
  for (let i = 0; i < 9; i++) {
    const y = horizon + (i / 9) ** 1.6 * (H - horizon)
    const next = horizon + ((i + 1) / 9) ** 1.6 * (H - horizon)
    out += `<rect x="0" y="${fmt(y)}" width="${W}" height="${fmt(next - y + 1)}" fill="${bands[i % bands.length]}" opacity="${(0.5 + i * 0.04).toFixed(2)}"/>`
  }
  // Road to the horizon.
  out += `<path d="M${W * 0.52} ${horizon} L${W * 0.44} ${H} L${W * 0.62} ${H} L${W * 0.535} ${horizon}Z" fill="#0d141d"/>`
  for (let i = 0; i < 9; i++) {
    const t = i / 9
    const y = horizon + t ** 1.7 * (H - horizon)
    const nextY = horizon + ((i + 1) / 9) ** 1.7 * (H - horizon)
    const cx = W * 0.52 + (W * 0.53 - W * 0.52) * t
    const w = 2 + t * 12
    out += `<path d="M${fmt(cx - w / 2)} ${fmt(y)} L${fmt(cx + w / 2)} ${fmt(nextY)}" stroke="${palette.light}" stroke-width="${fmt(1 + t * 3)}" opacity=".32"/>`
  }
  // Utility poles.
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6
    const x = W * 0.62 + t * 280
    const base = horizon + t ** 1.5 * 300
    const h = 30 + t * 100
    out += `<path d="M${fmt(x)} ${fmt(base)} v-${fmt(h)} M${fmt(x - 8 - t * 8)} ${fmt(base - h + 8)} h${fmt(16 + t * 16)}" stroke="#050b11" stroke-width="${fmt(1.5 + t * 3)}"/>`
  }
  // Distant ridge.
  out += `<path d="M0 ${horizon} Q 180 ${horizon - 34} 360 ${horizon - 6} T 760 ${horizon - 18} T ${W} ${horizon - 4} V${horizon + 6} H0Z" fill="${palette.landMid}" opacity=".8"/>`
  return out
}

function harbor(rand: () => number, palette: Palette): string {
  const horizon = 398
  let out = `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#water)"/>`
  // Quay.
  out += `<path d="M0 556 L${W} 534 V${H} H0Z" fill="#050b12"/>`
  out += `<path d="M0 556 L${W} 534" stroke="#1d2b38" stroke-width="2"/>`
  // Container cranes: two legs, a boom and a trolley.
  for (let i = 0; i < 2; i++) {
    const x = 130 + i * 470 + rand() * 40
    const base = 556
    const top = 244 + rand() * 34
    const boom = 210
    out += `<path d="M${fmt(x)} ${base} L${fmt(x + 8)} ${fmt(top)} M${fmt(x + 54)} ${base} L${fmt(x + 46)} ${fmt(top)}" stroke="#08111a" stroke-width="9" fill="none"/>`
    out += `<path d="M${fmt(x + 8)} ${fmt(top + 44)} h${fmt(38)} M${fmt(x + 8)} ${fmt(top + 96)} h${fmt(38)}" stroke="#08111a" stroke-width="4"/>`
    out += `<path d="M${fmt(x - 6)} ${fmt(top + 10)} L${fmt(x + boom)} ${fmt(top - 26)}" stroke="#08111a" stroke-width="9"/>`
    out += `<path d="M${fmt(x + 46)} ${fmt(top)} L${fmt(x + 46)} ${fmt(top - 40)} L${fmt(x + boom)} ${fmt(top - 40)} L${fmt(x + boom)} ${fmt(top - 22)}" stroke="#08111a" stroke-width="3" fill="none"/>`
    out += `<rect x="${fmt(x + boom - 34)}" y="${fmt(top - 34)}" width="26" height="15" fill="#08111a"/>`
    out += `<path d="M${fmt(x + boom - 22)} ${fmt(top - 19)} v${fmt(56 + rand() * 40)}" stroke="#08111a" stroke-width="2.4"/>`
    out += `<rect x="${fmt(x + boom - 30)}" y="${fmt(top + 60 + rand() * 30)}" width="17" height="12" fill="#0d1a24"/>`
  }
  // Container stacks, neatly aligned along the quay.
  const stackColors = ['#1b3446', '#2a2622', '#22404a', '#3a2a24', '#1d3a34']
  for (let stack = 0; stack < 7; stack++) {
    const x = 40 + stack * 168 + rand() * 20
    const rows = 1 + Math.floor(rand() * 3)
    for (let row = 0; row < rows; row++) {
      const y = 528 - row * 16 + rand() * 3
      out += `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(118 + rand() * 18)}" height="14" fill="${stackColors[Math.floor(rand() * stackColors.length)]}" opacity=".92"/>`
    }
  }
  // Moored boat.
  const bx = 700 + rand() * 120
  out += `<path d="M${fmt(bx)} 505 h142 l-18 21 h-106Z" fill="#03080e"/>`
  out += `<rect x="${fmt(bx + 56)}" y="466" width="34" height="39" fill="#071019"/>`
  out += `<rect x="${fmt(bx + 62)}" y="472" width="7" height="7" fill="${palette.light}" opacity=".85"/>`
  out += `<rect x="${fmt(bx + 78)}" y="472" width="7" height="7" fill="${palette.glow}" opacity=".7"/>`
  // Buoys.
  for (let i = 0; i < 5; i++) {
    out += `<circle cx="${fmt(200 + rand() * 800)}" cy="${fmt(horizon + 34 + rand() * 90)}" r="2" fill="${palette.light}" opacity=".55"/>`
  }
  return out
}

function snow(rand: () => number, palette: Palette): string {
  let out = ''
  // Aurora ribbons.
  for (let i = 0; i < 5; i++) {
    const y = 54 + i * 30
    out += `<path d="M-60 ${fmt(y)} Q ${W * 0.28} ${fmt(y - 46)} ${W * 0.55} ${fmt(y + 14)} T ${W + 60} ${fmt(y - 20)}" stroke="${i % 2 ? '#6ff2c0' : '#7aa7ff'}" stroke-width="${fmt(30 - i * 4)}" fill="none" opacity="${(0.09 + i * 0.022).toFixed(2)}" filter="url(#soft)"/>`
  }
  // Moon low over the fjell.
  out += `<circle cx="${fmt(W * 0.74)}" cy="150" r="120" fill="url(#sunGlow)" opacity=".55"/>`
  out += `<circle cx="${fmt(W * 0.74)}" cy="150" r="30" fill="#e8f4ff" opacity=".92"/>`
  out += ridge(rand, 430, 96, '#12283a', 1, true)
  // Frozen fjord.
  out += `<rect x="0" y="428" width="${W}" height="${H - 428}" fill="url(#water)"/>`
  out += `<path d="M0 430 H${W}" stroke="#bcd7ff" stroke-opacity=".14" stroke-width="1.4"/>`
  for (let i = 0; i < 26; i++) {
    out += `<rect x="${fmt(rand() * W)}" y="${fmt(438 + rand() * 190)}" width="${fmt(24 + rand() * 110)}" height="1.2" fill="#bcd7ff" opacity="${(0.03 + rand() * 0.08).toFixed(2)}"/>`
  }
  // Snow banks.
  out += `<path d="M0 508 Q ${W * 0.3} 486 ${W * 0.6} 512 T ${W} 496 V${H} H0Z" fill="#1b3448" opacity=".9"/>`
  out += `<path d="M0 556 Q ${W * 0.34} 528 ${W * 0.68} 558 T ${W} 542 V${H} H0Z" fill="#24455c" opacity=".75"/>`
  out += `<path d="M0 616 Q ${W * 0.4} 588 ${W * 0.74} 618 T ${W} 600 V${H} H0Z" fill="#081520"/>`
  // Cabin with warm windows.
  const cx = 690 + rand() * 120
  const cy = 556
  out += `<path d="M${cx} ${cy} h124 v66 h-124Z" fill="#2a1f1b"/>`
  out += `<path d="M${cx - 16} ${cy} L${cx + 62} ${cy - 52} L${cx + 140} ${cy}Z" fill="#171010"/>`
  out += `<rect x="${cx + 24}" y="${cy + 24}" width="22" height="22" fill="${palette.light}" opacity=".92"/>`
  out += `<rect x="${cx + 76}" y="${cy + 24}" width="22" height="22" fill="${palette.light}" opacity=".6"/>`
  out += `<rect x="${cx + 56}" y="${cy + 58}" width="16" height="8" fill="#050a11"/>`
  out += `<path d="M${cx + 62} ${cy - 52} v-22 M${cx + 62} ${cy - 74} h26" stroke="#0a141c" stroke-width="2" opacity=".8"/>`
  out += trees(rand, 640, 120, '#03121a', 0.95)
  out += trees(rand, 720, 190, '#020a10', 1)
  // Snowfall.
  for (let i = 0; i < 110; i++) {
    out += `<circle cx="${fmt(rand() * W)}" cy="${fmt(rand() * H)}" r="${fmt(rand() * 2 + 0.5)}" fill="#eaf4ff" opacity="${(0.1 + rand() * 0.55).toFixed(2)}"/>`
  }
  return out
}

function selectorLabel(opts: SyntheticFrameOptions): string {
  if (opts.isDemo) return 'SEED FEED'
  if (opts.reason === 'offline') return 'UPSTREAM OFFLINE'
  if (opts.reason === 'unavailable') return 'FEED UNAVAILABLE'
  if (opts.reason === 'page') return 'PAGE ONLY'
  return 'GENERATED PREVIEW'
}

export function renderSyntheticFrame(opts: SyntheticFrameOptions): string {
  const rand = seededRandom(`${opts.id}:${opts.country ?? ''}:${opts.city ?? ''}:${opts.title}`)
  const palette = PALETTES[hash32(`${opts.id}:${opts.source}`) % PALETTES.length]!
  const scene = pickScene(opts, rand)
  const accent = sourceAccent(opts.source)

  const sceneSvg = scene === 'skyline'
    ? skyline(rand, palette)
    : scene === 'mountain'
      ? mountains(rand, palette)
      : scene === 'coast'
        ? coast(rand, palette)
        : scene === 'forest'
          ? forest(rand, palette)
          : scene === 'plains'
            ? plains(rand, palette)
            : scene === 'harbor'
              ? harbor(rand, palette)
              : snow(rand, palette)

  const horizonGlow = scene === 'forest' || scene === 'snow' ? 0.18 : 0.34
  const title = esc((opts.title || 'Unnamed camera').slice(0, 52).toUpperCase())
  // Uppercase first, then escape: `&amp;` must never become `&AMP;` (invalid XML).
  const location = esc(
    ([opts.city, opts.country].filter(Boolean).join(', ') || opts.region || 'Location unlisted').toUpperCase()
  )
  const coords = typeof opts.lat === 'number' && typeof opts.lon === 'number'
    ? `${Math.abs(opts.lat).toFixed(3)}°${opts.lat >= 0 ? 'N' : 'S'}  ${Math.abs(opts.lon).toFixed(3)}°${opts.lon >= 0 ? 'E' : 'W'}`
    : 'COORDINATES N/A'
  const source = esc(sourceShort(opts.source))
  const selector = esc(selectorLabel(opts))
  const idShort = opts.id.slice(0, 8).toUpperCase()

  const sunX = 760 + rand() * 220
  const sunY = 120 + rand() * 90
  const showSun = scene !== 'snow' && scene !== 'forest'
  const starField = stars(rand, scene === 'skyline' || scene === 'snow' ? 70 : 40, 330)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Generated preview frame for ${esc(opts.title)}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.skyTop}"/>
      <stop offset="0.55" stop-color="${palette.skyMid}"/>
      <stop offset="1" stop-color="${palette.skyLow}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.waterTop}"/>
      <stop offset="1" stop-color="${palette.waterLow}"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${palette.sun}" stop-opacity=".95"/>
      <stop offset="0.28" stop-color="${palette.glow}" stop-opacity=".32"/>
      <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="horizon" cx="0.5" cy="1" r="0.8">
      <stop offset="0" stop-color="${palette.glow}" stop-opacity="${horizonGlow}"/>
      <stop offset="0.6" stop-color="${palette.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".82"/>
    </linearGradient>
    <pattern id="scan" width="5" height="5" patternUnits="userSpaceOnUse">
      <rect width="5" height="1" fill="#ffffff" opacity=".022"/>
    </pattern>
    <filter id="soft"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".32"/>
      <stop offset=".32" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".55"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${starField}
  ${showSun ? `<circle cx="${fmt(sunX)}" cy="${fmt(sunY)}" r="150" fill="url(#sunGlow)"/><circle cx="${fmt(sunX)}" cy="${fmt(sunY)}" r="26" fill="${palette.sun}" opacity=".9"/>` : ''}
  <rect width="${W}" height="${H}" fill="url(#horizon)"/>
  ${sceneSvg}
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".06"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>

  <!-- viewfinder reticle -->
  <g opacity=".38" stroke="#dfeaff" stroke-width="1">
    <path d="M600 322v26M600 352v-4M574 340h22M604 340h22" fill="none"/>
    <circle cx="600" cy="340" r="9" fill="none" opacity=".5"/>
  </g>

  <!-- HUD -->
  <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
    <g transform="translate(34 34)">
      <path d="M0 6h16M8 0v16" stroke="${accent}" stroke-width="1.6" opacity=".9"/>
      <text x="28" y="12" fill="#eef5ff" font-size="13" letter-spacing="2.6">IPCRAWL OPEN</text>
      <text x="28" y="31" fill="#9fb0c9" font-size="10" letter-spacing="1.8">NODE ${idShort} · ${source} · ${esc(opts.kind.toUpperCase())}</text>
    </g>
    <g transform="translate(${W - 34} 34)" text-anchor="end">
      <rect x="-188" y="0" width="188" height="26" rx="13" fill="#05070a" opacity=".55" stroke="${accent}" stroke-opacity=".35"/>
      <circle cx="-170" cy="13" r="3.2" fill="${accent}"/>
      <text x="-158" y="17" fill="${accent}" font-size="10" letter-spacing="1.4" text-anchor="start">${selector}</text>
    </g>
    <g transform="translate(34 ${H - 36})">
      <text x="0" y="-48" fill="#f3f7ff" font-size="27" letter-spacing=".6" font-weight="600">${title}</text>
      <text x="0" y="-22" fill="#b9c7db" font-size="12.5" letter-spacing="1.6">${location}</text>
      <text x="0" y="0" fill="#7e8ca5" font-size="10" letter-spacing="1.4">${esc(coords)}</text>
    </g>
    <g transform="translate(${W - 34} ${H - 36})" text-anchor="end">
      <text x="0" y="-26" fill="#7e8ca5" font-size="10" letter-spacing="1.4">${esc(opts.source.toUpperCase())} / ${esc(opts.kind.toUpperCase())}</text>
      <text x="0" y="-6" fill="#6a7891" font-size="9" letter-spacing="1.2">FRAME NOT LIVE · ILLUSTRATIVE</text>
    </g>
    <g stroke="#e8f1ff" stroke-width="1.4" fill="none" opacity=".7">
      <path d="M18 18v-8h8M${W - 26} 18v-8h8M18 ${H - 18}v8h8M${W - 26} ${H - 18}v8h8"/>
    </g>
  </g>
</svg>`
}

export function syntheticFrameEtag(opts: SyntheticFrameOptions): string {
  const input = `${opts.id}|${opts.title}|${opts.city}|${opts.country}|${opts.source}|${opts.isDemo}|${opts.reason}`
  let hash = 5381
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  return `"gen-${hash.toString(16)}"`
}
