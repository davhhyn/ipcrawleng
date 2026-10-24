<script setup lang="ts">
import { funChannelPath } from '#shared/routes'

definePageMeta({ name: 'fun' })

useHead({ title: 'Fun mode' })

/**
 * Landing on /fun picks a random channel and redirects. On the server this is
 * a 302, so visitors always land on a shareable /fun/c/<id> URL.
 */
const requestFetch = useRequestFetch()
const cam = await requestFetch<{ channel: { id: string } | null }>('/api/fun/cam').catch(() => null)

if (cam?.channel?.id) {
  await navigateTo(funChannelPath(cam.channel.id), { replace: true, redirectCode: 302 })
} else {
  throw createError({
    statusCode: 503,
    statusMessage: 'Channels are warming up — refresh in a moment.'
  })
}
</script>

<template>
  <div />
</template>
