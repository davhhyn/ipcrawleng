<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
  glow?: boolean
}>(), {
  size: 32,
  glow: true
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    class="logo-mark"
    :class="{ 'logo-mark--glow': glow }"
    aria-hidden="true"
  >
    <circle cx="32" cy="32" r="26" stroke="currentColor" stroke-opacity=".14" stroke-width="1.2" />
    <circle cx="32" cy="32" r="19" stroke="currentColor" stroke-opacity=".3" stroke-width="1.2" />
    <circle cx="32" cy="32" r="12" stroke="currentColor" stroke-opacity=".62" stroke-width="1.4" />
    <path d="M32 32 L47 21" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    <circle cx="32" cy="32" r="4.6" fill="currentColor" />
    <circle cx="32" cy="32" r="1.9" fill="#05070a" />
    <path
      d="M32 3.5v6M32 54.5v6M3.5 32h6M54.5 32h6"
      stroke="#6ff2c0"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="M52 21.5a14 14 0 0 1 1.4 5.8"
      stroke="#7aa7ff"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <circle cx="52.5" cy="18" r="2" fill="#6ff2c0" />
  </svg>
</template>

<style scoped>
.logo-mark {
  color: var(--signal);
  flex: none;
}

.logo-mark--glow {
  filter: drop-shadow(0 0 14px rgb(var(--signal-rgb) / 0.35));
}
</style>
