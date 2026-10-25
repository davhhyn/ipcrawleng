<script setup lang="ts">
import { ArrowUpRight, Eye, Globe2, HeartHandshake, KeyRound, ShieldCheck, Terminal } from '@lucide/vue'

useHead({
  title: 'About',
  meta: [{ name: 'description', content: 'Why IPCrawl Open exists, how it is built, and the rules that keep it honest.' }]
})

const principles = [
  {
    icon: ShieldCheck,
    title: 'Documentation, not discovery by force',
    text: 'Every camera here arrives through a public API, an open dataset, or a community-mapped node. No provider scans address ranges, and nothing here guesses credentials. The optional local sensor is the one exception, and it only probes networks you allowlist on your own machine.'
  },
  {
    icon: KeyRound,
    title: 'No paywalled intelligence',
    text: 'The original ipcrawl ran on a commercial search API. This rebuild keeps the same shape but sources its catalogue from free, keyless feeds — OpenStreetMap, TfL, Fintraffic and a bundled open index.'
  },
  {
    icon: Eye,
    title: 'Never publish what should stay private',
    text: 'Raw stream hosts and IP addresses never leave the server. Frames are proxied, locations are rounded in the UI, and any camera whose operator asks to be removed is dropped.'
  },
  {
    icon: HeartHandshake,
    title: 'Attribution is not optional',
    text: 'Each entry carries its provider, licence and attribution. If you reuse this data, carry those forward — the open-data ecosystem depends on it.'
  }
]

const stack = [
  { label: 'Framework', value: 'Nuxt 4 · Vue 3.5 · Nitro' },
  { label: 'Styling', value: 'Tailwind CSS 4 · hand-built design tokens' },
  { label: 'Storage', value: 'SQLite via node:sqlite (no ORM, no service)' },
  { label: 'Maps', value: 'Natural Earth geometry, hand-projected to SVG' },
  { label: 'Images', value: 'Server-proxied frames + deterministic SVG previews' },
  { label: 'Tests', value: 'Vitest unit suites' }
]

const layers = [
  { path: 'app/', text: 'Shell, design system, Explore, Stats, Sources, API and About pages.' },
  { path: 'layers/explore/', text: 'Catalogue API: list, detail, facets, thumbnails, frames, favorites.' },
  { path: 'layers/fun/', text: 'CRT channel viewer at /fun with shareable channel URLs.' },
  { path: 'layers/map/', text: 'Atlas at /map — clustered world view over the same catalogue.' },
  { path: 'layers/imce/', text: '“Is my camera exposed?” check at /imce.' },
  { path: 'server/utils/ingest/', text: 'Provider adapters, normalisation, dedupe and the sync pipeline.' },
  { path: 'sensor/', text: 'Local sensor: authorization gate, port probes, fingerprints, dataset import.' },
  { path: 'shared/', text: 'Wire contracts shared by client and server, plus generated geo data.' }
]

const providers = [
  { name: 'OpenStreetMap', licence: 'ODbL 1.0', href: 'https://www.openstreetmap.org/copyright' },
  { name: 'TfL JamCams', licence: 'OGL v3', href: 'https://api.tfl.gov.uk/' },
  { name: 'Fintraffic Digitraffic', licence: 'CC BY 4.0', href: 'https://www.digitraffic.fi/en/' },
  { name: 'Windy Webcams', licence: 'Windy terms', href: 'https://api.windy.com/' },
  { name: 'Shodan InternetDB', licence: 'Enrichment only', href: 'https://internetdb.shodan.io/' },
  { name: 'Shodan API', licence: 'Optional · paid plan', href: 'https://developer.shodan.io/api' },
  { name: 'Natural Earth', licence: 'Public domain', href: 'https://www.naturalearthdata.com/' }
]

const faq = [
  {
    q: 'Are these cameras live?',
    a: 'Some are. A camera marked live answered a real HTTP request during the last probe round. Many entries are “documented pages” — the operator publishes a camera page, but no direct frame endpoint — and their preview is generated from metadata.'
  },
  {
    q: 'Where did the demo entries come from?',
    a: 'A bundled dataset of ~85 landmark locations, shipped with the repo (CC0) so the catalogue, atlas and stats render offline. They are always labelled SEED and never presented as live feeds. Run a sync with network access to replace them with provider data.'
  },
  {
    q: 'Can I request a removal?',
    a: 'Yes. Blocklisting is a one-line configuration change (NUXT_BLOCKED_HOSTS). Removals take effect on the next ingest and on the next boot.'
  },
  {
    q: 'Why not just use Shodan?',
    a: 'Because that data sits behind a paid plan, and a catalogue that only exists for people with a commercial subscription is a worse public-good product. Discovery stays free by default. If you already hold a Shodan plan you can opt in with a key — the provider is there, it just never runs unless you turn it on.'
  },
  {
    q: 'Is this the original ipcrawl?',
    a: 'No. It is an independent reimplementation that keeps the original structure — Nuxt layers, SQLite schema, explore/dialog/fun/map surfaces — while swapping the single paid provider for a provider-agnostic ingestion engine.'
  }
]
</script>

<template>
  <div class="about">
    <section class="page about__hero">
      <p class="eyebrow">About</p>
      <h1 class="about__title display">
        Make exposed cameras<br>
        <span class="text-gradient">impossible to ignore.</span>
      </h1>
      <p class="about__lede">
        IPCrawl Open is a catalogue of cameras that are already public — and a
        mirror held up to the fact that so many of them should not be. It is
        built to be browsed, mapped and studied, and ultimately to shrink itself
        to zero.
      </p>
      <div class="about__hero-actions">
        <NuxtLink to="/sources" class="btn btn-primary">
          <Globe2 :size="13" />
          See the sources
        </NuxtLink>
        <NuxtLink to="/imce" class="btn">
          <ShieldCheck :size="13" />
          Check my own camera
        </NuxtLink>
      </div>
    </section>

    <section class="page about__principles">
      <article v-for="principle in principles" :key="principle.title" class="principle panel">
        <div class="principle__icon">
          <component :is="principle.icon" :size="17" />
        </div>
        <h2 class="principle__title">{{ principle.title }}</h2>
        <p class="principle__text">{{ principle.text }}</p>
      </article>
    </section>

    <section class="page about__split">
      <div class="about__block">
        <p class="eyebrow"><Terminal :size="10" /> How it is built</p>
        <h2 class="about__h2">One catalogue, five surfaces.</h2>
        <p class="about__p">
          The original project's architecture is preserved almost exactly: Nuxt
          layers for each product surface, a shared Nitro ingestion engine, a
          single SQLite file, and shared TypeScript contracts that make the wire
          format impossible to drift.
        </p>
        <div class="layers">
          <div v-for="layer in layers" :key="layer.path" class="layer">
            <code class="layer__path mono">{{ layer.path }}</code>
            <span class="layer__text">{{ layer.text }}</span>
          </div>
        </div>
      </div>

      <aside class="about__aside">
        <div class="panel about__card">
          <p class="eyebrow">Stack</p>
          <dl class="stack">
            <div v-for="row in stack" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </div>

        <div class="panel about__card">
          <p class="eyebrow">Providers &amp; licences</p>
          <ul class="providers">
            <li v-for="provider in providers" :key="provider.name">
              <a :href="provider.href" target="_blank" rel="noopener noreferrer">
                {{ provider.name }}
                <ArrowUpRight :size="10" />
              </a>
              <span class="providers__lic mono">{{ provider.licence }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </section>

    <section class="page about__faq">
      <p class="eyebrow">Questions</p>
      <div class="faq">
        <details v-for="item in faq" :key="item.q" class="faq__item">
          <summary class="faq__q">
            {{ item.q }}
            <span class="faq__marker">+</span>
          </summary>
          <p class="faq__a">{{ item.a }}</p>
        </details>
      </div>
    </section>

    <section class="page about__credit panel">
      <div>
        <p class="eyebrow">Credits</p>
        <p class="about__credit-text">
          Structure, terminology and product ideas come from
          <a href="https://github.com/alectrocute/ipcrawl" target="_blank" rel="noopener noreferrer">
            alectrocute/ipcrawl
          </a>
          (MIT). This reimplementation replaces its commercial data dependency
          with open providers, and ships its own design system, ingestion engine
          and test suite. Original code © Alec Armbruster; new code MIT.
        </p>
      </div>
      <div class="about__credit-actions">
        <a
          href="https://github.com/davhhyn/ipcrawleng"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-sm"
        >
          Source
          <ArrowUpRight :size="11" />
        </a>
        <NuxtLink to="/api" class="btn btn-sm">
          API docs
          <ArrowUpRight :size="11" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about {
  padding-bottom: 20px;
}

.about__hero {
  padding-top: 48px;
  padding-bottom: 34px;
  max-width: 1000px;
}

.about__title {
  margin: 12px 0 0;
  font-size: clamp(32px, 5.4vw, 62px);
  color: #f8fbff;
}

.about__lede {
  max-width: 660px;
  margin: 20px 0 0;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.7;
}

.about__hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 24px;
}

.about__principles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  padding-bottom: 34px;
}

.principle {
  padding: 17px 18px 19px;
}

.principle__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgb(var(--signal-rgb) / 0.28);
  border-radius: 9px;
  background: rgb(var(--signal-rgb) / 0.08);
  color: var(--signal-bright);
}

.principle__title {
  margin: 13px 0 0;
  font-size: 14px;
  font-weight: 560;
  letter-spacing: -0.01em;
}

.principle__text {
  margin: 7px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.65;
}

.about__split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 26px;
  padding-bottom: 34px;
}

@media (min-width: 1000px) {
  .about__split {
    grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
    gap: 40px;
    align-items: start;
  }
}

.about__h2 {
  margin: 10px 0 0;
  font-size: clamp(22px, 2.8vw, 30px);
  font-weight: 560;
  letter-spacing: -0.03em;
}

.about__p {
  max-width: 620px;
  margin: 12px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.7;
}

.layers {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 20px;
  border-top: 1px solid var(--line);
}

.layer {
  display: grid;
  grid-template-columns: minmax(140px, 0.6fr) minmax(0, 2fr);
  gap: 14px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  align-items: baseline;
}

.layer__path {
  font-size: 10.5px;
  color: var(--signal-bright);
}

.layer__text {
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.5;
}

.about__aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about__card {
  padding: 15px 16px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 10px 0 0;
}

.stack > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
}

.stack > div:last-child {
  border-bottom: 0;
}

.stack dt {
  color: var(--text-mute);
  font-size: 10px;
  flex: none;
}

.stack dd {
  margin: 0;
  color: var(--text);
  font-size: 10.5px;
  text-align: right;
  line-height: 1.45;
}

.providers {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.providers li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
}

.providers li:last-child {
  border-bottom: 0;
}

.providers a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-dim);
  font-size: 11px;
}

.providers a:hover {
  color: var(--signal-bright);
}

.providers__lic {
  color: var(--text-mute);
  font-size: 8.5px;
  white-space: nowrap;
}

.about__faq {
  padding-bottom: 34px;
}

.faq {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  border-top: 1px solid var(--line);
}

.faq__item {
  border-bottom: 1px solid var(--line);
}

.faq__q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 2px;
  cursor: pointer;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  list-style: none;
}

.faq__q::-webkit-details-marker {
  display: none;
}

.faq__marker {
  color: var(--text-mute);
  font-family: var(--font-mono);
  font-size: 15px;
  transition: transform 180ms ease;
}

.faq__item[open] .faq__marker {
  transform: rotate(45deg);
  color: var(--signal);
}

.faq__a {
  max-width: 760px;
  margin: 0;
  padding: 0 2px 16px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.7;
}

.about__credit {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.about__credit-text {
  max-width: 720px;
  margin: 8px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.65;
}

.about__credit-text a {
  color: var(--signal-bright);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.about__credit-actions {
  display: flex;
  gap: 7px;
}
</style>
