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
    <div class="settings-sync-card">
      <div class="settings-sync-label">
        云端同步密钥
      </div>
      <input
        v-model="syncSecretInput"
        class="settings-sync-input"
        type="password"
        placeholder="输入后才有权限读写云端"
        autocomplete="off"
      >
      <div class="settings-sync-actions">
        <button
          class="settings-sync-btn"
          type="button"
          :disabled="!syncSecretInput.trim()"
          @click="saveSyncSecret"
        >
          保存
        </button>
        <button
          v-if="hasSyncSecret"
          class="settings-sync-btn settings-sync-btn-clear"
          type="button"
          @click="clearSyncSecret"
        >
          清除
        </button>
      </div>
    </div>
    <iframe
      class="settings-rankings-frame"
      title="Classworks 技术架构"
      src="/classworks-architecture.html"
    />
  </div>
</template>

<script>
import { getSyncSecret, setSyncSecret } from "@/utils/sync";

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
      syncSecretInput: "",
      hasSyncSecret: false,
    };
  },
  mounted() {
    this.previousTitle = document.title;
    document.title = copy.pageTitle;
    this.syncSecretInput = getSyncSecret();
    this.hasSyncSecret = !!this.syncSecretInput;
  },
  beforeUnmount() {
    document.title = this.previousTitle;
  },
  methods: {
    goHome() {
      this.$router.push("/");
    },
    saveSyncSecret() {
      setSyncSecret(this.syncSecretInput);
      this.hasSyncSecret = true;
    },
    clearSyncSecret() {
      setSyncSecret("");
      this.syncSecretInput = "";
      this.hasSyncSecret = false;
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

.settings-sync-card {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(16, 16, 16, 0.78);
  backdrop-filter: blur(12px);
}

.settings-sync-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 700;
}

.settings-sync-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #f1f1f1;
  font-size: 13px;
}

.settings-sync-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.32);
}

.settings-sync-actions {
  display: flex;
  gap: 8px;
}

.settings-sync-btn {
  flex: 1;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: #262626;
  color: #f0f0f0;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.settings-sync-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.settings-sync-btn-clear {
  flex: 0 0 auto;
  padding-inline: 12px;
  background: rgba(255, 255, 255, 0.04);
}
</style>
