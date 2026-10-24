<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, CheckCircle2, Eye, LoaderCircle, Lock, ShieldCheck } from '@lucide/vue'

definePageMeta({ name: 'imce' })

useHead({
  title: 'Is my camera exposed?',
  meta: [
    {
      name: 'description',
      content: 'Check whether your public IP appears as a documented camera host in the catalogue — without scanning, probing or storing anything.'
    }
  ]
})

interface CheckResponse {
  ip: string | null
  indexed: boolean
  matchedCam: { id: string, title: string, country: string | null } | null
  totalCams: number
  generatedAt: number
}

const state = ref<'idle' | 'checking' | 'done' | 'error'>('idle')
const result = ref<CheckResponse | null>(null)
const error = ref<string | null>(null)

async function check() {
  state.value = 'checking'
  error.value = null
  try {
    result.value = await $fetch<CheckResponse>('/api/imce/check')
    state.value = 'done'
  } catch (err) {
    error.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || 'The check could not run. Try again in a moment.'
    state.value = 'error'
  }
}

const headline = computed(() => {
  if (state.value !== 'done' || !result.value) return null
  return result.value.indexed
    ? { tone: 'alert', title: 'Your address appears in the catalogue', icon: AlertTriangle }
    : { tone: 'safe', title: 'No matching camera host was found', icon: CheckCircle2 }
})

const steps = [
  'Change the camera\'s default password — most exposures are default credentials.',
  'Disable UPnP / port forwarding on your router for the camera.',
  'Move the camera onto an isolated VLAN or guest network.',
  'Update firmware and turn off unused remote-access features.',
  'If it must be public, put it behind an authenticated reverse proxy and TLS.'
]
</script>

<template>
  <div class="imce">
    <section class="page imce__hero">
      <div class="imce__intro">
        <p class="eyebrow"><Eye :size="10" /> Exposure check</p>
        <h1 class="imce__title display">
          Is your camera<br>
          <span class="imce__title-alert">on the open web?</span>
        </h1>
        <p class="imce__lede">
          This check compares your public IP against the documented hosts already
          in the catalogue. It does not scan your network, probe ports, or store
          your address — the comparison happens in memory and is discarded.
        </p>

        <div class="imce__actions">
          <button
            type="button"
            class="btn btn-primary imce__btn"
            :disabled="state === 'checking'"
            @click="check"
          >
            <LoaderCircle v-if="state === 'checking'" :size="14" class="spin" />
            <ShieldCheck v-else :size="14" />
            {{ state === 'checking' ? 'Checking…' : 'Check my connection' }}
          </button>
          <span class="imce__privacy mono">
            <Lock :size="10" />
            NO SCANNING · NO STORAGE
          </span>
        </div>
      </div>

      <div class="imce__panel panel">
        <div class="imce__panel-head">
          <p class="eyebrow">Result</p>
          <span class="mono imce__panel-state">{{ state.toUpperCase() }}</span>
        </div>

        <div v-if="state === 'idle'" class="imce__idle">
          <div class="radar">
            <span class="radar__ring radar__ring--1" />
            <span class="radar__ring radar__ring--2" />
            <span class="radar__ring radar__ring--3" />
            <Eye :size="20" class="radar__icon" />
          </div>
          <p class="imce__idle-text">
            Ready when you are. The check takes about a second.
          </p>
        </div>

        <div v-else-if="state === 'checking'" class="imce__idle">
          <div class="radar radar--active">
            <span class="radar__ring radar__ring--1" />
            <span class="radar__ring radar__ring--2" />
            <span class="radar__ring radar__ring--3" />
            <LoaderCircle :size="20" class="radar__icon spin" />
          </div>
          <p class="imce__idle-text mono">MATCHING DOCUMENTED HOSTS…</p>
        </div>

        <div v-else-if="state === 'error'" class="imce__result imce__result--alert">
          <AlertTriangle :size="20" />
          <p>{{ error }}</p>
          <button type="button" class="btn btn-sm" @click="check">Retry</button>
        </div>

        <div v-else-if="headline" class="imce__result" :class="`imce__result--${headline.tone}`">
          <component :is="headline.icon" :size="24" class="imce__result-icon" />
          <h2 class="imce__result-title">{{ headline.title }}</h2>
          <p class="imce__result-ip mono">{{ result?.ip || 'ADDRESS UNKNOWN' }}</p>
          <p v-if="result?.matchedCam" class="imce__result-detail">
            Matched catalogue entry:
            <NuxtLink :to="`/?cam=${result.matchedCam.id}`" class="imce__result-link">
              {{ result.matchedCam.title }}
            </NuxtLink>
            <template v-if="result.matchedCam.country"> · {{ result.matchedCam.country }}</template>
          </p>
          <p v-else class="imce__result-detail">
            Checked against {{ result?.totalCams.toLocaleString() }} indexed cameras.
            Absence here is not a guarantee — the catalogue only contains cameras
            that a public source has documented, not every exposed device.
          </p>
        </div>
      </div>
    </section>

    <section class="page imce__below">
      <div class="imce__col panel">
        <p class="eyebrow">If you are exposed</p>
        <ol class="imce__steps">
          <li v-for="(step, index) in steps" :key="step">
            <span class="imce__step-n mono">{{ String(index + 1).padStart(2, '0') }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </div>

      <div class="imce__col panel">
        <p class="eyebrow">What this check does</p>
        <ul class="imce__facts">
          <li>
            <span class="dot dot-live" />
            Reads the address your browser connects from, as any web server sees it.
          </li>
          <li>
            <span class="dot" />
            Compares it to camera hosts already present in the catalogue index.
          </li>
          <li>
            <span class="dot" />
            Returns a boolean and a camera title. Nothing is written to disk or logs.
          </li>
          <li>
            <span class="dot" />
            Never probes ports, never attempts credentials, never enumerates your LAN.
          </li>
        </ul>
        <p class="imce__fine">
          On shared or carrier-grade NAT connections your public address may be
          shared with many households, so a match can be a neighbour's device.
          Treat a positive result as a prompt to audit, not an accusation.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.imce {
  padding-bottom: 20px;
}

.imce__hero {
  display: grid;
  grid-template-columns: 1fr;
  gap: 26px;
  padding-top: 42px;
  padding-bottom: 30px;
}

@media (min-width: 980px) {
  .imce__hero {
    grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
    gap: 44px;
    align-items: center;
  }
}

.imce__title {
  margin: 12px 0 0;
  font-size: clamp(30px, 4.8vw, 54px);
  color: #f8fbff;
}

.imce__title-alert {
  color: var(--amber);
}

.imce__lede {
  max-width: 560px;
  margin: 18px 0 0;
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.7;
}

.imce__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 24px;
}

.imce__btn {
  height: 42px;
  padding: 0 18px;
}

.imce__privacy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-mute);
  font-size: 8px;
  letter-spacing: 0.12em;
}

.imce__panel {
  display: flex;
  min-height: 300px;
  flex-direction: column;
  padding: 16px;
}

.imce__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.imce__panel-state {
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.12em;
}

.imce__idle {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px 0;
}

.radar {
  position: relative;
  display: grid;
  place-items: center;
  width: 128px;
  height: 128px;
}

.radar__ring {
  position: absolute;
  border: 1px solid rgb(var(--signal-rgb) / 0.3);
  border-radius: 999px;
}

.radar__ring--1 { inset: 40px; }
.radar__ring--2 { inset: 22px; opacity: 0.6; }
.radar__ring--3 { inset: 4px; opacity: 0.3; }

.radar--active .radar__ring {
  animation: ping 2.2s ease-out infinite;
  border-color: rgb(var(--live-rgb) / 0.45);
}

.radar--active .radar__ring--2 { animation-delay: 0.35s; }
.radar--active .radar__ring--3 { animation-delay: 0.7s; }

@keyframes ping {
  0% { transform: scale(0.85); opacity: 0.85; }
  100% { transform: scale(1.12); opacity: 0.1; }
}

.radar__icon {
  color: var(--signal);
}

.imce__idle-text {
  margin: 0;
  color: var(--text-mute);
  font-size: 10.5px;
  text-align: center;
}

.imce__result {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 9px;
  padding: 18px 4px 4px;
}

.imce__result--safe .imce__result-icon { color: var(--live); }
.imce__result--alert .imce__result-icon { color: var(--amber); }

.imce__result-title {
  margin: 0;
  font-size: 17px;
  font-weight: 560;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.imce__result--alert .imce__result-title { color: var(--amber); }

.imce__result-ip {
  margin: 0;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.imce__result-detail {
  margin: 4px 0 0;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.65;
}

.imce__result-link {
  color: var(--signal-bright);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.imce__below {
  display: grid;
  grid-template-columns: 1fr;
  gap: 13px;
  padding-bottom: 20px;
}

@media (min-width: 900px) {
  .imce__below {
    grid-template-columns: 1fr 1fr;
  }
}

.imce__col {
  padding: 17px 18px;
}

.imce__steps {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.imce__steps li {
  display: flex;
  gap: 10px;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.55;
}

.imce__step-n {
  color: var(--signal);
  font-size: 9px;
  padding-top: 2px;
}

.imce__facts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.imce__facts li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.55;
}

.imce__facts .dot {
  margin-top: 5px;
  color: var(--text-mute);
}

.imce__fine {
  margin: 12px 0 0;
  padding-top: 11px;
  border-top: 1px solid var(--line);
  color: var(--text-mute);
  font-size: 10px;
  line-height: 1.6;
}

.spin {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
