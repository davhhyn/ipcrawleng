<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy } from '@lucide/vue'

const props = withDefaults(defineProps<{
  code: string
  language?: string
  label?: string
  wrap?: boolean
}>(), {
  language: 'bash',
  label: '',
  wrap: false
})

const copied = ref(false)

const highlighted = computed(() => {
  const escaped = props.code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  if (props.language === 'json') {
    return escaped
      .replace(/(&quot;|")([^"&]+?)\1(\s*:)/g, '<span class="tok-key">"$2"</span>$3')
      .replace(/:\s*(".*?"|\d+\.?\d*|true|false|null)/g, ': <span class="tok-val">$1</span>')
  }

  if (props.language === 'bash') {
    return escaped
      .replace(/^(curl|http|npm|npx|node)\b/gm, '<span class="tok-cmd">$1</span>')
      .replace(/(\s)(-{1,2}[a-zA-Z-]+)/g, '$1<span class="tok-flag">$2</span>')
      .replace(/(&#x27;|')([^']*)(&#x27;|')/g, '<span class="tok-str">\'$2\'</span>')
  }

  return escaped
})

async function copy() {
  if (!import.meta.client) return
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch {
    // Clipboard access may be blocked; the code stays selectable.
  }
}
</script>

<template>
  <div class="code">
    <header class="code__head">
      <span class="code__label mono">{{ label || language }}</span>
      <button type="button" class="code__copy" :aria-label="copied ? 'Copied' : 'Copy code'" @click="copy">
        <Check v-if="copied" :size="11" />
        <Copy v-else :size="11" />
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </header>
    <pre class="code__pre" :class="{ 'code__pre--wrap': wrap }"><code class="mono" v-html="highlighted" /></pre>
  </div>
</template>

<style scoped>
.code {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(3, 6, 10, 0.72);
  overflow: hidden;
}

.code__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.02);
}

.code__label {
  color: var(--text-mute);
  font-size: 8.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.code__copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: none;
  color: var(--text-mute);
  font-size: 9.5px;
  cursor: pointer;
}

.code__copy:hover {
  color: var(--text);
  border-color: var(--line);
}

.code__pre {
  margin: 0;
  padding: 12px 13px;
  overflow-x: auto;
  font-size: 11.5px;
  line-height: 1.65;
  color: #c6d4e8;
}

.code__pre--wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.code__pre :deep(.tok-cmd) { color: var(--live); }
.code__pre :deep(.tok-flag) { color: var(--signal-bright); }
.code__pre :deep(.tok-str) { color: var(--amber); }
.code__pre :deep(.tok-key) { color: #9fc7ff; }
.code__pre :deep(.tok-val) { color: var(--live); }
</style>
