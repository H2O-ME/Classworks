<template>
  <v-app-bar
    class="no-select board-app-bar"
    elevation="0"
  >
    <div class="app-bar-inner">
      <div class="app-bar-title">
        设置
      </div>
      <div class="app-bar-actions">
        <router-link
          class="nav-button"
          to="/"
          aria-label="返回首页"
        >
          <v-icon
            icon="mdi-chevron-left"
            size="19"
          />
          <span>首页</span>
        </router-link>
      </div>
    </div>
  </v-app-bar>

  <div class="settings-scroll">
    <div class="settings-body">
      <div class="settings-grid">
        <!-- 云端同步 -->
        <section class="panel">
          <div class="panel-head">
            <div class="panel-icon">
              <v-icon
                icon="mdi-cloud-sync-outline"
                size="20"
              />
            </div>
            <div class="panel-copy">
              <h2 class="panel-title">
                云端同步
              </h2>
              <p class="panel-desc">
                开启后，作业的每次改动都会推送到云端，并在所有设备间保持一致。
              </p>
            </div>
            <span
              class="status-chip"
              :class="syncEnabled ? (secretValid ? 'status-on' : 'status-wait') : 'status-off'"
            >
              {{ syncEnabled ? (secretValid ? "已连接" : "待校验") : "已关闭" }}
            </span>
          </div>

          <div class="toggle-row">
            <span class="toggle-label">启用云端同步</span>
            <button
              class="switch"
              :class="{ 'switch-on': syncEnabled }"
              type="button"
              role="switch"
              :aria-checked="syncEnabled"
              aria-label="启用云端同步"
              @click="toggleSync"
            >
              <span class="switch-knob" />
            </button>
          </div>
        </section>

        <!-- 连接密钥 -->
        <section class="panel">
          <div class="panel-head">
            <div class="panel-icon">
              <v-icon
                icon="mdi-key-variant"
                size="20"
              />
            </div>
            <div class="panel-copy">
              <h2 class="panel-title">
                连接密钥
              </h2>
              <p class="panel-desc">
                与部署端 SYNC_SECRET 一致，用于校验本设备的云端读写权限。
              </p>
            </div>
          </div>

          <div class="key-form">
            <label
              class="field-label"
              for="sync-secret"
            >云端连接校验密钥</label>
            <div class="key-row">
              <input
                id="sync-secret"
                ref="syncSecret"
                v-model="secretInput"
                class="key-input"
                type="password"
                placeholder="输入 SYNC_SECRET"
                autocomplete="off"
                spellcheck="false"
                @input="handleSecretInput"
              >
              <button
                class="validate-btn"
                type="button"
                :disabled="!secretInput.trim() || validationState === 'checking'"
                @click="validateAndSave"
              >
                {{ validationState === "checking" ? "校验中" : "验证并保存" }}
              </button>
            </div>

            <div
              class="validation"
              :class="`validation-${validationState}`"
              role="status"
              aria-live="polite"
            >
              <v-icon
                v-if="validationState === 'checking'"
                icon="mdi-loading"
                size="15"
              />
              <v-icon
                v-else-if="validationState === 'valid'"
                icon="mdi-check-circle-outline"
                size="15"
              />
              <v-icon
                v-else-if="validationState === 'invalid'"
                icon="mdi-alert-circle-outline"
                size="15"
              />
              <v-icon
                v-else-if="validationState === 'server' || validationState === 'network'"
                icon="mdi-cloud-alert-outline"
                size="15"
              />
              <span>{{ validationText }}</span>
            </div>

            <button
              v-if="hasSecret"
              class="clear-secret"
              type="button"
              @click="clearSecret"
            >
              清除密钥
            </button>
          </div>
        </section>
      </div>

      <!-- 数据策略 -->
      <section class="panel panel-policy">
        <div class="panel-head">
          <div class="panel-icon">
            <v-icon
              icon="mdi-shield-check-outline"
              size="20"
            />
          </div>
          <div class="panel-copy">
            <h2 class="panel-title">
              数据策略
            </h2>
            <p class="panel-desc">
              同步过程始终遵循的三条原则。
            </p>
          </div>
        </div>

        <div class="policy-list">
          <div class="policy-item">
            <div class="policy-item-icon">
              <v-icon
                icon="mdi-laptop"
                size="16"
              />
            </div>
            <div class="policy-item-copy">
              <strong>本地优先</strong>
              <span>作业首先保存在本机浏览器，断网也能正常使用。</span>
            </div>
          </div>
          <div class="policy-item">
            <div class="policy-item-icon">
              <v-icon
                icon="mdi-cloud-upload-outline"
                size="16"
              />
            </div>
            <div class="policy-item-copy">
              <strong>增量备份</strong>
              <span>每次编辑只把有改动的学科推送到云端，流量极小。</span>
            </div>
          </div>
          <div class="policy-item">
            <div class="policy-item-icon">
              <v-icon
                icon="mdi-history"
                size="16"
              />
            </div>
            <div class="policy-item-copy">
              <strong>可回退</strong>
              <span>云端内容覆盖本地前会自动留存快照，可一键找回。</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import { setSyncEnabled, setSyncSecret, validateSyncSecret, watchSyncState } from "@/utils/sync";

export default {
  name: "SettingsPage",
  data() {
    return {
      previousTitle: null,
      syncEnabled: false,
      secretInput: "",
      hasSecret: false,
      secretValid: false,
      validationState: "idle",
      validationText: "输入密钥后验证云端连接",
      unsubscribeSyncState: null,
      validationTimer: null,
    };
  },
  mounted() {
    this.previousTitle = document.title;
    document.title = "设置";
    this.unsubscribeSyncState = watchSyncState(({ enabled, secret }) => {
      this.syncEnabled = enabled;
      this.secretInput = secret;
      this.hasSecret = !!secret;
      if (!secret) this.secretValid = false;
    });
  },
  beforeUnmount() {
    document.title = this.previousTitle;
    if (this.validationTimer) clearTimeout(this.validationTimer);
    this.unsubscribeSyncState?.();
  },
  methods: {
    toggleSync() {
      const next = !this.syncEnabled;
      setSyncEnabled(next);
      this.syncEnabled = next;
      if (next && !this.secretInput.trim()) this.$nextTick(() => this.$refs.syncSecret?.focus());
    },
    handleSecretInput() {
      this.secretValid = false;
      if (this.validationTimer) clearTimeout(this.validationTimer);
      if (!this.secretInput.trim()) {
        this.validationState = "idle";
        this.validationText = "输入密钥后验证云端连接";
        return;
      }
      this.validationState = "checking";
      this.validationText = "正在校验密钥…";
      this.validationTimer = setTimeout(() => this.validateSecret(this.secretInput), 600);
    },
    async validateSecret(secret) {
      this.applyValidationResult(await validateSyncSecret(secret));
    },
    applyValidationResult(result, okText = "密钥正确，云端连接可用") {
      this.validationState = result.ok ? "valid" : result.reason;
      this.validationText = result.ok
        ? okText
        : result.reason === "invalid"
          ? "密钥不正确"
          : result.reason === "server"
            ? "云端服务异常"
            : result.reason === "network"
              ? "无法连接云端"
              : "云端接口返回异常";
      this.secretValid = result.ok;
    },
    async validateAndSave() {
      const secret = this.secretInput.trim();
      if (!secret) return;
      this.validationState = "checking";
      this.validationText = "正在校验密钥…";
      const result = await validateSyncSecret(secret);
      if (!result.ok) { this.applyValidationResult(result); return; }
      setSyncSecret(secret);
      setSyncEnabled(true);
      this.secretInput = secret;
      this.hasSecret = true;
      this.secretValid = true;
      this.validationState = "valid";
      this.validationText = "密钥正确，云端连接已启用";
    },
    clearSecret() {
      setSyncEnabled(false);
      setSyncSecret("");
      this.syncEnabled = false;
      this.secretInput = "";
      this.hasSecret = false;
      this.secretValid = false;
      this.validationState = "idle";
      this.validationText = "输入密钥后验证云端连接";
    },
  },
};
</script>

<style scoped>
/* ── 顶栏（与主页同构）── */
.board-app-bar {
  backdrop-filter: blur(12px);
  background: rgba(18, 18, 18, 0.96) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.app-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
  padding: 0 22px 0 42px;
}

.app-bar-title {
  color: #f5f5f5;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.app-bar-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.nav-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 2px;
  padding: 0 11px 0 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.nav-button:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.065);
  color: rgba(255, 255, 255, 0.96);
}

/* ── 滚动区：占满剩余视口，内部滚动，不出现右侧滚动条 ── */
.settings-scroll {
  height: calc(100dvh - 64px);
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-width: none;
  overscroll-behavior: contain;
}
.settings-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* ── 主体：双栏网格 + 策略卡；内容不足一屏时垂直居中，超出则自然滚动 ── */
.settings-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
  min-height: 100%;
  margin: 0 auto;
  padding: 24px 20px;
}

/* margin:auto 让内容块在不足一屏时上下均分留白，超出时归零不裁切 */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: auto;
}

.panel-policy {
  margin-bottom: auto;
}

/* ── 卡片 ── */
.panel {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #171717;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

.panel-head {
  display: flex;
  flex: 1 0 auto;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
}

.panel-icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #202020;
  color: rgba(255, 255, 255, 0.72);
}

.panel-copy {
  min-width: 160px;
  flex: 1 1 200px;
}

.panel-title {
  margin: 0;
  color: #f5f5f5;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
}

.panel-desc {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.56);
  font-size: 13px;
  line-height: 1.5;
}

/* ── 状态胶囊 ── */
.status-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 600;
}
.status-chip::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-on {
  border-color: rgba(48, 209, 88, 0.35);
  background: rgba(48, 209, 88, 0.1);
  color: #30d158;
}
.status-wait {
  border-color: rgba(255, 159, 10, 0.35);
  background: rgba(255, 159, 10, 0.1);
  color: #ff9f0a;
}

/* ── 开关行 ── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.toggle-label {
  color: #f5f5f5;
  font-size: 15px;
  font-weight: 600;
}

.switch {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.switch::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 2px;
  right: 2px;
  height: 30px;
  transform: translateY(-50%);
  border-radius: 15px;
  background: #3a3a3c;
  transition: background-color 0.2s ease;
}
.switch-knob {
  position: relative;
  z-index: 1;
  display: block;
  width: 26px;
  height: 26px;
  margin-left: 4px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.switch-on::before { background: #34c759; }
.switch-on .switch-knob { transform: translateX(20px); }

/* ── 密钥表单 ── */
.key-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.field-label {
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 600;
}

.key-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.key-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #1d1d1d;
  color: #f2f2f2;
  font: inherit;
  font-size: 16px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.key-input:focus {
  border-color: rgba(196, 211, 238, 0.28);
  box-shadow: 0 0 0 1px rgba(196, 211, 238, 0.14);
}
.key-input::placeholder { color: rgba(255, 255, 255, 0.42); }

.validate-btn {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  background: #f3f3f3;
  color: #121212;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.18s ease;
}
.validate-btn:hover:not(:disabled) { opacity: 0.88; }
.validate-btn:disabled { cursor: not-allowed; opacity: 0.4; }

.validation {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.46);
}
.validation-valid { color: #30d158; }
.validation-invalid { color: #ff453a; }
.validation-server, .validation-network, .validation-unexpected { color: #ff9f0a; }
.validation-checking .mdi-loading { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.clear-secret {
  align-self: flex-start;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #202020;
  color: #ffb7b7;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}
.clear-secret:hover {
  background: #262626;
  border-color: rgba(255, 255, 255, 0.14);
}

/* ── 数据策略 ── */
.policy-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.policy-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.policy-item-icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #202020;
  color: rgba(255, 255, 255, 0.6);
}

.policy-item-copy {
  min-width: 0;
}

.policy-item-copy strong {
  display: block;
  margin-bottom: 2px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 700;
}

.policy-item-copy span {
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
  line-height: 1.55;
}

/* ── 桌面：双栏 + 策略三列 ── */
@media (min-width: 900px) {
  .settings-body {
    gap: 18px;
    padding: 32px;
  }

  .settings-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 18px;
  }

  .panel {
    padding: 24px;
  }

  .policy-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }
}

/* ── 手机：密钥行纵向堆叠 ── */
@media (max-width: 700px) {
  .app-bar-inner {
    padding: 0 14px 0 20px;
  }

  .app-bar-title {
    font-size: 18px;
  }

  .key-row {
    flex-direction: column;
  }

  .validate-btn {
    width: 100%;
  }
}

/* ── 手表/极窄：收紧间距，头部自然换行 ── */
@media (max-width: 380px) {
  .settings-body {
    gap: 12px;
    padding: 16px 12px;
  }

  .settings-grid {
    gap: 12px;
  }

  .panel {
    padding: 14px;
  }

  .panel-copy {
    min-width: 130px;
    flex-basis: 160px;
  }

  .panel-title {
    font-size: 16px;
  }

  .panel-desc {
    font-size: 12px;
  }

  .toggle-row,
  .key-form,
  .policy-list {
    margin-top: 12px;
    padding-top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .switch-knob, .switch::before, .validation-checking .mdi-loading {
    transition: none;
    animation: none;
  }
}
</style>