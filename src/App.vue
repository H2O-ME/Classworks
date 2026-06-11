<template>
  <v-app class="app-shell">
    <div class="app-gradient-background" />

    <router-view v-slot="{ Component, route }">
      <transition
        mode="out-in"
        name="md3"
      >
        <component
          :is="Component"
          :key="route.path"
        />
      </transition>
    </router-view>
  </v-app>
</template>

<script setup>
import { onMounted, onUnmounted } from "vue";

onMounted(() => {
  import("@/utils/fonts")
    .then(({ initFont }) => initFont())
    .catch((error) => console.warn("字体模块加载失败:", error));

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
});

onUnmounted(() => {
  window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
});

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  window.deferredPwaPrompt = event;
  window.dispatchEvent(new Event("pwa-prompt-ready"));
}
</script>

<style>
@import "@/styles/index.scss";
@import "@/styles/transitions.scss";
@import "@/styles/global.scss";

.app-shell {
  background: #111111;
  color: rgba(255, 255, 255, 0.92);
}

.md3-enter-active,
.md3-leave-active {
  transition:
    opacity 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.md3-enter-from {
  opacity: 0;
  transform: translateX(0.35vw);
}

.md3-leave-to {
  opacity: 0;
  transform: translateX(-0.35vw);
}

.app-gradient-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(180deg, #161616 0%, #121212 42%, #101010 100%),
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size:
    auto,
    100% 28px,
    28px 100%;
}
</style>
