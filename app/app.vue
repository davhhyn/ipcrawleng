<script setup lang="ts">
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'

const { siteUrl } = useRuntimeConfig().public
const route = useRoute()
const title = 'IPCrawl Open'
const description = 'A multi-source catalogue and live-preview surface for publicly documented open cameras. Explore by place, network, vendor or source — no paywalled API required.'

const requestUrl = useRequestURL()
// A configured canonical origin wins; otherwise fall back to the request host so
// og:image and canonical links are absolute on local and preview deployments.
const origin = computed(() => (siteUrl || requestUrl.origin).replace(/\/+$/, ''))

useHead({
  titleTemplate: (pageTitle) => (pageTitle ? `${pageTitle} · ${title}` : `${title} — open camera intelligence`),
  link: [
    { rel: 'icon' as const, type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'apple-touch-icon' as const, href: '/apple-touch-icon.png' },
    { rel: 'manifest' as const, href: '/site.webmanifest' },
    ...(origin.value ? [{ rel: 'canonical' as const, href: `${origin.value}${route.path}` }] : [])
  ]
})

useSeoMeta({
  title: 'Open camera intelligence',
  description,
  ogTitle: 'IPCrawl Open',
  ogDescription: description,
  ogType: 'website',
  ogSiteName: 'IPCrawl Open',
  ogImage: () => `${origin.value}/og-cover.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'IPCrawl Open — open camera intelligence',
  twitterCard: 'summary_large_image',
  twitterImage: () => `${origin.value}/og-cover.png`
})

useHead({
  htmlAttrs: { lang: 'en' },
  bodyAttrs: { class: 'dark' }
})
</script>

<template>
  <div class="app-shell">
    <div class="app-skip">
      <a href="#main">Skip to content</a>
    </div>

    <AppHeader />

    <main id="main" class="app-main">
      <NuxtPage />
    </main>

    <AppFooter />
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}

.app-main {
  flex: 1;
}

.app-skip a {
  position: absolute;
  top: -100px;
  left: 16px;
  z-index: 100;
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--signal);
  color: var(--signal-ink);
  font-weight: 600;
  transition: top 160ms ease;
}

.app-skip a:focus {
  top: 12px;
}
</style>
