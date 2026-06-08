<template>
  <v-app :style="vAppStyle" class="app-shell">
    <template v-if="bgEnabled">
      <div class="app-background-image" :style="bgImageStyle" />
      <div class="app-background-overlay" :style="bgOverlayStyle" />
    </template>

    <div v-else class="app-gradient-background" />

    <router-view v-slot="{ Component, route }">
      <transition mode="out-in" name="md3">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </v-app>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTheme } from "vuetify";
import { getSetting, watchSettings } from "@/utils/settings";

const theme = useTheme();
const bgEnabled = ref(false);
const bgSrc = ref("");
const bgBlur = ref(10);
const bgOpacity = ref(30);

let unwatchSettings = null;

const vAppStyle = computed(() => {
  if (!bgEnabled.value || !bgSrc.value) {
    return {};
  }
  return { background: "transparent" };
});

const bgImageStyle = computed(() => ({
  backgroundImage: `url(${bgSrc.value})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: `blur(${bgBlur.value}px)`,
  transform: "scale(1.05)",
}));

const bgOverlayStyle = computed(() => ({
  background:
    `linear-gradient(180deg, rgba(10, 10, 10, ${Math.min(0.68, bgOpacity.value / 90)}) 0%, ` +
    `rgba(15, 15, 15, ${Math.min(0.84, bgOpacity.value / 74)}) 100%)`,
}));

onMounted(() => {
  applyTheme(getSetting("theme.mode"));
  loadBgSettings();

  import("@/utils/fonts")
    .then(({ initFont }) => initFont())
    .catch((error) => console.warn("字体模块加载失败:", error));

  unwatchSettings = watchSettings((_, event) => {
    const changedKey = event?.detail?.key;
    if (!changedKey || changedKey.startsWith("background.") || changedKey === "theme.mode") {
      loadBgSettings();
      applyTheme(getSetting("theme.mode"));
    }
  });

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
});

onUnmounted(() => {
  unwatchSettings?.();
  window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
});

function loadBgSettings() {
  bgEnabled.value = getSetting("background.enabled") || false;
  const imageData = getSetting("background.imageData") || "";
  const url = getSetting("background.url") || "";
  bgSrc.value = imageData || url;
  bgBlur.value = getSetting("background.blur") ?? 10;
  bgOpacity.value = getSetting("background.opacity") ?? 30;
}

function applyTheme(themeName) {
  if (!themeName || typeof themeName !== "string" || theme.global.name.value === themeName) {
    return;
  }

  try {
    theme.global.name.value = themeName;
  } catch (error) {
    console.warn("主题设置应用失败:", error);
  }
}

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

.app-background-image,
.app-background-overlay,
.app-gradient-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}

.app-background-image {
  transform-origin: center center;
  will-change: transform, filter;
}

.app-gradient-background {
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
