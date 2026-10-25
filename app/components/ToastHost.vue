<script setup lang="ts">
const { toasts, dismiss } = useToasts()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <button
          v-for="toast in toasts"
          :key="toast.id"
          type="button"
          class="toast"
          :class="`toast--${toast.tone}`"
          @click="dismiss(toast.id)"
        >
          <span class="toast__dot" />
          <span class="toast__msg">{{ toast.message }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 80;
  display: flex;
  width: min(360px, calc(100vw - 36px));
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgba(10, 14, 22, 0.96);
  box-shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.9);
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(12px);
}

.toast__dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 999px;
  background: var(--signal);
  box-shadow: 0 0 10px currentColor;
}

.toast--success .toast__dot { background: var(--live); }
.toast--warn .toast__dot { background: var(--amber); }
.toast--error .toast__dot { background: var(--rose); }

.toast__msg {
  line-height: 1.35;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
