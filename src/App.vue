<template>
  <v-app :style="vAppStyle">
    <template v-if="bgEnabled">
      <div class="app-background-image" :style="bgImageStyle" />
      <div class="app-background-overlay" :style="bgOverlayStyle" />
    </template>

    <router-view v-slot="{ Component, route }">
      <transition mode="out-in" name="md3">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>

    <RateLimitModal />
  </v-app>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTheme } from "vuetify";
import RateLimitModal from "@/components/RateLimitModal.vue";
import { getSetting, watchSettings } from "@/utils/settings";

const theme = useTheme();
const bgEnabled = ref(false);
const bgSrc = ref("");
const bgBlur = ref(10);
const bgOpacity = ref(30);

function loadBgSettings() {
  bgEnabled.value = getSetting("background.enabled") || false;
  const imageData = getSetting("background.imageData") || "";
  const url = getSetting("background.url") || "";
  bgSrc.value = imageData || url;
  bgBlur.value = getSetting("background.blur") ?? 10;
  bgOpacity.value = getSetting("background.opacity") ?? 30;
}

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
  background: `rgba(0, 0, 0, ${bgOpacity.value / 100})`,
}));

let unwatchSettings = null;

onMounted(() => {
  const savedTheme = getSetting("theme.mode");
  if (savedTheme && typeof savedTheme === "string") {
    try {
      theme.global.name.value = savedTheme;
    } catch (error) {
      console.warn("主题设置应用失败:", error);
    }
  }

  loadBgSettings();

  import("@/utils/fonts")
    .then(({ initFont }) => initFont())
    .catch((error) => console.warn("字体模块加载失败:", error));

  unwatchSettings = watchSettings((_, event) => {
    const changedKey = event?.detail?.key;
    if (!changedKey || changedKey.startsWith("background.") || changedKey === "theme.mode") {
      loadBgSettings();
      const newTheme = getSetting("theme.mode");
      if (newTheme && typeof newTheme === "string" && theme.global.name.value !== newTheme) {
        try {
          theme.global.name.value = newTheme;
        } catch (error) {
          console.warn("主题切换失败:", error);
        }
      }
    }
  });

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
});

onUnmounted(() => {
  unwatchSettings?.();
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

.md3-enter-active,
.md3-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.md3-enter-from {
  opacity: 0;
  transform: translateX(0.5vw);
}

.md3-leave-to {
  opacity: 0;
  transform: translateX(-0.5vw);
}

.app-background-image,
.app-background-overlay {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}

.app-background-image {
  transform-origin: center center;
  will-change: transform, filter;
}
</style>
