<script setup lang="ts">
import { Menu, Radio, X } from '@lucide/vue'

const route = useRoute()
const { counts, demoMode, status } = useCatalogSummary()

const open = ref(false)
const scrolled = ref(false)

const nav = [
  { label: 'Explore', to: '/', match: (p: string) => p === '/' },
  { label: 'Map', to: '/map', match: (p: string) => p.startsWith('/map') },
  { label: 'Fun', to: '/fun', match: (p: string) => p.startsWith('/fun') },
  { label: 'Stats', to: '/stats', match: (p: string) => p.startsWith('/stats') },
  { label: 'Sources', to: '/sources', match: (p: string) => p.startsWith('/sources') },
  { label: 'API', to: '/api', match: (p: string) => p.startsWith('/api') },
  { label: 'About', to: '/about', match: (p: string) => p.startsWith('/about') }
]

const isActive = (item: (typeof nav)[number]) => item.match(route.path)

function onScroll() {
  scrolled.value = window.scrollY > 8
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <header class="site-header" :class="{ 'site-header--scrolled': scrolled }">
    <div class="page header-inner">
      <NuxtLink to="/" class="brand" aria-label="IPCrawl Open home">
        <AppLogo :size="30" />
        <span class="brand__word">IPCRAWL</span>
        <span class="brand__edition">OPEN</span>
      </NuxtLink>

      <nav class="desktop-nav" aria-label="Primary">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ 'nav-link--active': isActive(item) }"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="header-right">
        <span
          v-if="demoMode"
          class="chip chip-amber demo-chip"
          title="The catalogue is running on the bundled demo dataset. Upstream feeds are unreachable from this environment."
        >
          <Radio :size="11" />
          DEMO
        </span>
        <span v-else class="header-count mono" :title="`${counts.live} live now`">
          <span class="dot" :class="counts.live > 0 ? 'dot-live' : ''" />
          {{ counts.total.toLocaleString() }} cams
        </span>

        <a
          href="https://github.com/davhhyn/ipcrawleng"
          target="_blank"
          rel="noopener noreferrer"
          class="icon-btn github-btn"
          aria-label="Source on GitHub"
        >
          <GitHubMark :size="16" />
        </a>

        <button
          type="button"
          class="icon-btn menu-btn"
          :aria-expanded="open"
          aria-label="Toggle navigation"
          @click="open = !open"
        >
          <X v-if="open" :size="17" />
          <Menu v-else :size="17" />
        </button>
      </div>
    </div>

    <Transition name="menu">
      <div v-if="open" class="mobile-nav">
        <div class="page mobile-nav__inner">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="mobile-link"
            :class="{ 'mobile-link--active': isActive(item) }"
          >
            {{ item.label }}
          </NuxtLink>
          <div class="mobile-meta mono">
            <span>{{ counts.total.toLocaleString() }} cameras indexed</span>
            <span class="mobile-meta__live"><span class="dot dot-live" /> {{ counts.live }} live</span>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="status?.demoMode" class="demo-rule" />
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid transparent;
  transition: border-color 200ms ease, background 200ms ease, backdrop-filter 200ms ease;
}

.site-header--scrolled {
  border-bottom-color: var(--line);
  background: rgba(5, 7, 10, 0.78);
  backdrop-filter: blur(18px) saturate(140%);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: 22px;
  height: var(--header-h);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  flex: none;
}

.brand__word {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.055em;
  color: var(--text);
}

.brand__edition {
  margin-left: 1px;
  padding: 2px 5px;
  border: 1px solid rgb(var(--signal-rgb) / 0.4);
  border-radius: 4px;
  background: rgb(var(--signal-rgb) / 0.1);
  color: var(--signal-bright);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.desktop-nav {
  display: none;
  align-items: center;
  gap: 2px;
  margin-left: 10px;
}

@media (min-width: 900px) {
  .desktop-nav {
    display: flex;
  }
}

.nav-link {
  position: relative;
  padding: 8px 11px;
  border-radius: 7px;
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
  transition: color 150ms ease, background 150ms ease;
}

.nav-link:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.035);
}

.nav-link--active {
  color: var(--text);
}

.nav-link--active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--signal);
  box-shadow: 0 0 8px var(--signal);
  transform: translateX(-50%);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-left: auto;
}

.header-count {
  display: none;
  align-items: center;
  gap: 7px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

@media (min-width: 560px) {
  .header-count {
    display: inline-flex;
  }
}

.header-count .dot {
  color: var(--text-mute);
}

.demo-chip {
  display: none;
  height: 24px;
}

@media (min-width: 700px) {
  .demo-chip {
    display: inline-flex;
  }
}

.github-btn {
  display: none;
}

@media (min-width: 900px) {
  .github-btn {
    display: inline-flex;
  }
}

.menu-btn {
  display: inline-flex;
}

@media (min-width: 900px) {
  .menu-btn {
    display: none;
  }
}

.mobile-nav {
  border-bottom: 1px solid var(--line);
  background: rgba(6, 9, 14, 0.97);
  backdrop-filter: blur(20px);
}

.mobile-nav__inner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 10px;
  padding-bottom: 16px;
}

.mobile-link {
  padding: 11px 10px;
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 15px;
  font-weight: 500;
}

.mobile-link--active {
  background: rgb(var(--signal-rgb) / 0.08);
  color: var(--signal-bright);
}

.mobile-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  padding: 12px 10px 0;
  border-top: 1px solid var(--line);
  color: var(--text-mute);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.mobile-meta__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--live);
}

.demo-rule {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(var(--amber-rgb) / 0.5), transparent);
}

.menu-enter-active,
.menu-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
