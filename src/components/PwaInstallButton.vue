<template>
  <div
    v-if="isSupported && !isStandalone"
    class="pwa-install-wrap"
  >
    <button
      type="button"
      class="pwa-install-button"
      :aria-label="buttonTitle"
      :title="buttonTitle"
      @click="installApp"
    >
      <v-icon
        :icon="isReady ? 'mdi-download-box-outline' : 'mdi-cellphone-arrow-down'"
        size="18"
      />
    </button>

    <transition name="pwa-tip">
      <div
        v-if="showHint"
        class="pwa-install-hint"
      >
        <div class="pwa-install-hint-title">
          {{ hintTitle }}
        </div>
        <div class="pwa-install-hint-body">
          {{ hintBody }}
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
export default {
  name: "PwaInstallButton",
  data() {
    return {
      isSupported: false,
      isStandalone: false,
      isReady: false,
      isSecureOrigin: false,
      showHint: false,
      hideHintTimer: null,
    };
  },
  computed: {
    buttonTitle() {
      if (this.isReady) return "安装应用";
      if (!this.isSecureOrigin) return "当前地址不是安全上下文";
      return "当前浏览器不支持直接安装";
    },
    hintTitle() {
      if (this.isReady) return "可以安装";
      if (!this.isSecureOrigin) return "当前地址不能触发 PWA 安装";
      return "当前环境不能直接安装";
    },
    hintBody() {
      if (this.isReady) return "点击后可将作业看板安装成桌面应用。";
      if (!this.isSecureOrigin) {
        return "请改用 HTTPS 或 localhost 打开；像 192.168.x.x 这样的 HTTP 局域网地址通常不会显示安装提示。";
      }
      return "请使用 Chrome 或 Edge 打开当前地址，再从浏览器菜单中安装。";
    },
  },
  mounted() {
    this.isSupported = "serviceWorker" in navigator;
    this.isSecureOrigin = window.isSecureContext;
    this.isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || false;
    this.syncPromptState();
    window.addEventListener("pwa-prompt-ready", this.syncPromptState);
    window.addEventListener("appinstalled", this.handleInstalled);
    window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", this.handleDisplayModeChange);
  },
  beforeUnmount() {
    window.removeEventListener("pwa-prompt-ready", this.syncPromptState);
    window.removeEventListener("appinstalled", this.handleInstalled);
    window.matchMedia?.("(display-mode: standalone)")?.removeEventListener?.("change", this.handleDisplayModeChange);
    if (this.hideHintTimer) {
      clearTimeout(this.hideHintTimer);
    }
  },
  methods: {
    syncPromptState() {
      this.isReady = Boolean(window.deferredPwaPrompt);
      this.isSecureOrigin = window.isSecureContext;
    },
    handleDisplayModeChange(event) {
      this.isStandalone = Boolean(event?.matches);
    },
    handleInstalled() {
      window.deferredPwaPrompt = null;
      this.isReady = false;
      this.isStandalone = true;
      this.showHint = false;
    },
    showTemporaryHint() {
      this.showHint = true;
      if (this.hideHintTimer) {
        clearTimeout(this.hideHintTimer);
      }
      this.hideHintTimer = setTimeout(() => {
        this.showHint = false;
      }, 3200);
    },
    async installApp() {
      const promptEvent = window.deferredPwaPrompt;
      if (!promptEvent) {
        this.showTemporaryHint();
        return;
      }

      promptEvent.prompt();
      await promptEvent.userChoice.catch(() => null);
      window.deferredPwaPrompt = null;
      this.isReady = false;
    },
  },
};
</script>

<style scoped>
.pwa-install-wrap {
  position: relative;
}

.pwa-install-button {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.78);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.pwa-install-button:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.065);
  color: rgba(255, 255, 255, 0.96);
}

.pwa-install-hint {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 240px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(20, 20, 20, 0.94);
  color: rgba(255, 255, 255, 0.88);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
}

.pwa-install-hint-title {
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 700;
}

.pwa-install-hint-body {
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.68);
}

.pwa-tip-enter-active,
.pwa-tip-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.pwa-tip-enter-from,
.pwa-tip-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
