<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'

const year = new Date().getFullYear()

const sources = [
  { label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
  { label: 'TfL JamCams', href: 'https://api.tfl.gov.uk/' },
  { label: 'Fintraffic Digitraffic', href: 'https://www.digitraffic.fi/en/' },
  { label: 'Windy Webcams', href: 'https://api.windy.com/' },
  { label: 'Shodan InternetDB', href: 'https://internetdb.shodan.io/' }
]

const project = [
  { label: 'Sources & health', to: '/sources' },
  { label: 'Public API', to: '/api' },
  { label: 'Stats', to: '/stats' },
  { label: 'About the mission', to: '/about' },
  { label: 'Exposure check', to: '/imce' }
]
</script>

<template>
  <footer class="footer">
    <div class="page footer__inner">
      <div class="footer__brand">
        <div class="footer__logo">
          <AppLogo :size="26" :glow="false" />
          <span class="mono footer__word">IPCRAWL<span class="footer__dot">.</span>OPEN</span>
        </div>
        <p class="footer__mission">
          A catalogue of publicly documented open cameras — built to make
          exposed feeds impossible to ignore, and easy to close.
        </p>
        <p class="footer__fine mono">
          NO PAYWALLED APIS · NO SCANNING · NO LOCATION DOXXING
        </p>
      </div>

      <div class="footer__col">
        <p class="eyebrow">Data sources</p>
        <a
          v-for="source in sources"
          :key="source.label"
          :href="source.href"
          target="_blank"
          rel="noopener noreferrer"
          class="footer__link"
        >
          {{ source.label }}
          <ArrowUpRight :size="11" class="footer__arrow" />
        </a>
      </div>

      <div class="footer__col">
        <p class="eyebrow">Project</p>
        <NuxtLink
          v-for="item in project"
          :key="item.to"
          :to="item.to"
          class="footer__link"
        >
          {{ item.label }}
        </NuxtLink>
      </div>

      <div class="footer__col">
        <p class="eyebrow">Reimplementation</p>
        <a
          href="https://github.com/alectrocute/ipcrawl"
          target="_blank"
          rel="noopener noreferrer"
          class="footer__link"
        >
          Original ipcrawl
          <ArrowUpRight :size="11" class="footer__arrow" />
        </a>
        <a
          href="https://github.com/davhhyn/ipcrawleng"
          target="_blank"
          rel="noopener noreferrer"
          class="footer__link"
        >
          This repository
          <ArrowUpRight :size="11" class="footer__arrow" />
        </a>
        <a
          href="https://github.com/alectrocute/ipcrawl/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          class="footer__link"
        >
          MIT licence
        </a>
      </div>
    </div>

    <div class="page footer__bottom">
      <span class="mono">© {{ year }} IPCRAWL OPEN</span>
      <span class="mono footer__bottom-note">
        Built on the structure and spirit of
        <a href="https://github.com/alectrocute/ipcrawl" target="_blank" rel="noopener noreferrer">alectrocute/ipcrawl</a>.
        Data remains © its providers.
      </span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  margin-top: 80px;
  border-top: 1px solid var(--line);
  background: linear-gradient(180deg, transparent, rgba(8, 11, 17, 0.7));
}

.footer__inner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 34px;
  padding-top: 44px;
  padding-bottom: 36px;
}

@media (min-width: 700px) {
  .footer__inner {
    grid-template-columns: 1.5fr 1fr 1fr 1fr;
    gap: 28px;
  }
}

.footer__logo {
  display: flex;
  align-items: center;
  gap: 9px;
}

.footer__word {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text);
}

.footer__dot {
  color: var(--signal);
}

.footer__mission {
  max-width: 330px;
  margin: 14px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.6;
}

.footer__fine {
  margin-top: 16px;
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.14em;
}

.footer__col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
}

.footer__col .eyebrow {
  margin-bottom: 4px;
}

.footer__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-dim);
  font-size: 12.5px;
  transition: color 150ms ease;
}

.footer__link:hover {
  color: var(--signal-bright);
}

.footer__arrow {
  opacity: 0.45;
}

.footer__bottom {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  padding-top: 16px;
  padding-bottom: 22px;
  border-top: 1px solid var(--line);
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.footer__bottom-note {
  max-width: 640px;
  line-height: 1.6;
  letter-spacing: 0.02em;
}

.footer__bottom-note a {
  color: var(--text-dim);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.footer__bottom-note a:hover {
  color: var(--signal-bright);
}
</style>
