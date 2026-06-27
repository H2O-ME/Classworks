<route lang="json">
{
  "meta": {
    "layout": false
  }
}
</route>

<template>
  <div class="settings-rankings-page">
    <div class="settings-top-actions">
      <button
        class="settings-back-button"
        type="button"
        :aria-label="copy.backHome"
        @click="goHome"
      >
        <v-icon
          icon="mdi-arrow-left"
          size="20"
        />
        <span>{{ copy.back }}</span>
      </button>
    </div>
    <iframe
      class="settings-rankings-frame"
      title="Classworks 技术架构"
      src="/classworks-architecture.html"
    />
  </div>
</template>

<script>
const copy = {
  backHome: "返回首页",
  back: "返回",
  pageTitle: "技术架构",
};

export default {
  name: "SettingsPage",
  data() {
    return {
      copy,
      previousTitle: null,
    };
  },
  mounted() {
    this.previousTitle = document.title;
    document.title = copy.pageTitle;
  },
  beforeUnmount() {
    document.title = this.previousTitle;
  },
  methods: {
    goHome() {
      this.$router.push("/");
    },
  },
};
</script>

<style>
html,
body,
#app {
  margin: 0;
  width: 100%;
  height: 100%;
}

.settings-rankings-page {
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: #101010;
}

.settings-top-actions {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.settings-back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(16, 16, 16, 0.72);
  color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.settings-back-button:hover {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(16, 16, 16, 0.84);
  transform: translateY(-1px);
}

.settings-back-button span {
  font-size: 14px;
  font-weight: 700;
}

.settings-rankings-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #101010;
}
</style>
