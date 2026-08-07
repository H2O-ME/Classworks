<route lang="json">
{
  "meta": {
    "layout": false
  }
}
</route>

<template>
  <div class="settings-page">
    <header class="settings-topbar">
      <div class="settings-topbar-inner">
        <button
          class="settings-back-button"
          type="button"
          aria-label="返回首页"
          @click="goHome"
        >
          <v-icon
            icon="mdi-arrow-left"
            size="20"
          />
        </button>
        <strong class="settings-title">设置</strong>
      </div>
    </header>

    <div class="settings-workspace">
      <nav
        class="settings-sidebar"
        aria-label="设置导航"
      >
        <button
          class="settings-nav-item"
          type="button"
          @click="goHome"
        >
          <v-icon
            icon="mdi-home-outline"
            size="20"
          /><span>首页</span>
        </button>
        <button
          class="settings-nav-item settings-nav-item-active"
          type="button"
        >
          <v-icon
            icon="mdi-database-outline"
            size="20"
          /><span>云端同步</span>
        </button>
      </nav>

      <main class="settings-main">
        <div class="settings-main-heading">
          <h1>数据源设置</h1>
        </div>

        <section class="settings-card">
          <div class="settings-card-title-row">
            <v-icon
              icon="mdi-cloud-sync-outline"
              size="20"
            /><h2>云端同步</h2><span
              class="settings-state"
              :class="{ 'settings-state-on': syncEnabled && secretValid }"
            >{{ syncEnabled && secretValid ? "已连接" : syncEnabled ? "待配置" : "已关闭" }}</span>
          </div>
          <div class="settings-sync-row">
            <div><h3>启用云端同步</h3><p>开启后自动备份作业，并在页面访问期间定时获取云端更新。</p></div><button
              class="settings-switch"
              :class="{ 'settings-switch-on': syncEnabled }"
              type="button"
              role="switch"
              aria-label="启用云端同步"
              :aria-checked="syncEnabled"
              @click="toggleSync"
            >
              <span class="settings-switch-knob" />
            </button>
          </div>
          <div class="settings-divider" />
          <label
            class="settings-field-label"
            for="sync-secret"
          >云端连接校验密钥</label>
          <div class="settings-key-row">
            <input
              id="sync-secret"
              ref="syncSecret"
              v-model="secretInput"
              class="settings-key-input"
              type="password"
              placeholder="输入 SYNC_SECRET"
              autocomplete="off"
              @input="handleSecretInput"
            ><button
              class="settings-validate-button"
              type="button"
              :disabled="!secretInput.trim() || validationState === 'checking'"
              @click="validateAndSave"
            >
              {{ validationState === "checking" ? "校验中" : "验证并保存" }}
            </button>
          </div>
          <div
            class="settings-validation"
            :class="`settings-validation-${validationState}`"
            role="status"
          >
            <v-icon
              v-if="validationState === 'checking'"
              icon="mdi-loading"
              size="16"
            /><v-icon
              v-else-if="validationState === 'valid'"
              icon="mdi-check-circle-outline"
              size="16"
            /><v-icon
              v-else-if="validationState === 'invalid'"
              icon="mdi-alert-circle-outline"
              size="16"
            /><v-icon
              v-else-if="validationState === 'server' || validationState === 'network'"
              icon="mdi-cloud-alert-outline"
              size="16"
            /><span>{{ validationText }}</span>
          </div>
          <div class="settings-actions">
            <button
              class="settings-action settings-action-danger"
              type="button"
              :disabled="!syncEnabled"
              @click="disableSync"
            >
              关闭同步
            </button><button
              class="settings-action settings-action-muted"
              type="button"
              :disabled="!hasSecret"
              @click="clearSecret"
            >
              清除密钥
            </button>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card-title-row">
            <v-icon
              icon="mdi-shield-check-outline"
              size="20"
            /><h2>数据策略</h2>
          </div>
          <div class="settings-policy-row">
            <span><strong>本地优先</strong> 作业首先写入浏览器 IndexedDB，断网也能使用。</span>
          </div>
          <div class="settings-policy-row">
            <span><strong>自动备份</strong> 保存成功后推送到 EdgeOne KV。</span>
          </div>
          <div class="settings-policy-row">
            <span><strong>本地回退</strong> 云端更新覆盖前保留最后一次本地快照。</span>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script>
import { setSyncEnabled, setSyncSecret, validateSyncSecret, watchSyncState } from "@/utils/sync";

export default {
  name: "SettingsPage",
  data() {
    return { previousTitle: null, syncEnabled: false, secretInput: "", hasSecret: false, secretValid: false, validationState: "idle", validationText: "输入密钥后验证云端连接", unsubscribeSyncState: null, validationTimer: null };
  },
  mounted() {
    this.previousTitle = document.title;
    document.title = "设置";
    document.documentElement.classList.add("settings-route-active");
    this.unsubscribeSyncState = watchSyncState(({ enabled, secret }) => {
      this.syncEnabled = enabled;
      this.secretInput = secret;
      this.hasSecret = !!secret;
      if (!secret) this.secretValid = false;
    });
  },
  beforeUnmount() {
    document.title = this.previousTitle;
    document.documentElement.classList.remove("settings-route-active");
    if (this.validationTimer) clearTimeout(this.validationTimer);
  },
  methods: {
    goHome() { this.$router.push("/"); },
    toggleSync() {
      const next = !this.syncEnabled;
      setSyncEnabled(next);
      this.syncEnabled = next;
      if (next && !this.secretInput.trim()) this.$nextTick(() => this.$refs.syncSecret?.focus());
    },
    handleSecretInput() {
      this.secretValid = false;
      if (this.validationTimer) clearTimeout(this.validationTimer);
      if (!this.secretInput.trim()) { this.validationState = "idle"; this.validationText = "输入密钥后验证云端连接"; return; }
      this.validationState = "checking";
      this.validationText = "正在校验密钥…";
      this.validationTimer = setTimeout(() => this.validateSecret(this.secretInput), 600);
    },
    async validateSecret(secret) {
      const result = await validateSyncSecret(secret);
      this.validationState = result.ok ? "valid" : result.reason;
      this.validationText = result.ok ? "密钥正确，云端连接可用" : result.reason === "invalid" ? "密钥不正确" : result.reason === "server" ? "云端服务异常" : result.reason === "network" ? "无法连接云端" : "云端接口返回异常";
      this.secretValid = result.ok;
    },
    async validateAndSave() {
      const secret = this.secretInput.trim();
      if (!secret) return;
      this.validationState = "checking";
      this.validationText = "正在校验密钥…";
      const result = await validateSyncSecret(secret);
      if (!result.ok) { await this.validateSecret(secret); return; }
      setSyncSecret(secret);
      setSyncEnabled(true);
      this.secretInput = secret;
      this.hasSecret = true;
      this.secretValid = true;
      this.validationState = "valid";
      this.validationText = "密钥正确，云端连接已启用";
    },
    disableSync() { setSyncEnabled(false); this.syncEnabled = false; },
    clearSecret() { setSyncEnabled(false); setSyncSecret(""); this.syncEnabled = false; this.secretInput = ""; this.hasSecret = false; this.secretValid = false; this.validationState = "idle"; this.validationText = "输入密钥后验证云端连接"; },
  },
};
</script>

<style>
html.settings-route-active{overflow:hidden}
html,body,#app{margin:0;min-width:320px;width:100%;min-height:100%}

.settings-page{
  height:100dvh;
  overflow-x:hidden;overflow-y:auto;scrollbar-width:none;
  background:#111;
  color:#f5f5f5;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  -webkit-font-smoothing:antialiased;
}
.settings-page::-webkit-scrollbar{display:none;width:0;height:0}

.settings-topbar{
  position:sticky;top:0;z-index:10;
  border-bottom:1px solid rgba(255,255,255,.08);
  background:rgba(18,18,18,.96);
  backdrop-filter:blur(12px);
}
.settings-topbar-inner{display:flex;align-items:center;gap:14px;width:100%;min-height:64px;padding:0 22px;box-sizing:border-box}
.settings-back-button{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.78);cursor:pointer;transition:background-color .18s ease,color .18s ease}
.settings-back-button:hover{background:rgba(255,255,255,.065);color:rgba(255,255,255,.96)}
.settings-title{color:#f5f5f5;font-size:18px;font-weight:700}

.settings-workspace{display:grid;grid-template-columns:200px minmax(0,1fr);min-height:calc(100dvh - 64px)}
.settings-sidebar{position:sticky;top:64px;align-self:start;height:calc(100dvh - 64px);overflow-y:auto;scrollbar-width:none;padding:16px 10px;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.015)}
.settings-nav-item{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;margin-bottom:2px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:rgba(255,255,255,.72);font:inherit;font-size:14px;font-weight:500;text-align:left;cursor:pointer;transition:background-color .18s ease,color .18s ease}
.settings-nav-item:hover{background:rgba(255,255,255,.06);color:#fff}
.settings-nav-item-active{background:rgba(255,255,255,.08);color:#fff;font-weight:600}

.settings-main{width:min(1180px,calc(100% - 48px));padding:28px 0 64px;margin:0 auto}
.settings-main-heading{margin-bottom:18px;color:#f5f5f5}
.settings-main-heading h1{margin:0;font-size:20px;font-weight:700}

.settings-card{margin-bottom:14px;padding:20px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#171717}
.settings-card-title-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;color:#f5f5f5}
.settings-card-title-row h2{margin:0;font-size:16px;font-weight:700}
.settings-state{margin-left:auto;padding:2px 10px;border-radius:99px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);font-size:12px;font-weight:600}
.settings-state-on{background:rgba(255,255,255,.12);color:rgba(255,255,255,.85)}


.settings-sync-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.settings-sync-row h3{margin:0 0 4px;color:#f5f5f5;font-size:15px;font-weight:600}
.settings-sync-row p{margin:0;color:rgba(255,255,255,.5);font-size:13px}
.settings-switch{position:relative;flex:0 0 auto;width:48px;height:44px;padding:10px 2px;box-sizing:border-box;border:0;border-radius:8px;background:transparent;cursor:pointer}
.settings-switch::before{content:'';position:absolute;top:50%;left:2px;right:2px;height:24px;transform:translateY(-50%);border-radius:12px;background:#262626;transition:background-color .2s ease}
.settings-switch-knob{position:relative;z-index:1;display:block;width:20px;height:20px;margin-left:0;border-radius:50%;background:#777;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .2s ease,background-color .2s ease,margin-left .2s ease}
.settings-switch-on::before{background:rgba(255,255,255,.22)}
.settings-switch-on .settings-switch-knob{transform:translateX(24px);background:#fff}

.settings-divider{height:1px;margin:16px 0;background:rgba(255,255,255,.08)}
.settings-field-label{display:block;margin-bottom:6px;color:rgba(255,255,255,.65);font-size:13px;font-weight:600}
.settings-key-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.settings-key-input{width:100%;height:40px;box-sizing:border-box;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:6px;outline:none;background:#202020;color:#f5f5f5;font:inherit;font-size:14px;transition:border-color .18s ease}
.settings-key-input:focus{border-color:rgba(255,255,255,.3)}
.settings-key-input::placeholder{color:rgba(255,255,255,.35)}
.settings-validate-button{min-width:100px;height:40px;padding:0 16px;border:0;border-radius:6px;background:rgba(255,255,255,.12);color:#f5f5f5;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .18s ease}
.settings-validate-button:hover:not(:disabled){background:rgba(255,255,255,.18)}
.settings-validate-button:disabled{cursor:not-allowed;opacity:.35}

.settings-validation{display:flex;align-items:center;gap:6px;min-height:26px;margin-top:8px;font-size:13px;color:rgba(255,255,255,.5)}
.settings-validation-valid{color:rgba(255,255,255,.8)}
.settings-validation-invalid{color:rgba(255,255,255,.6)}
.settings-validation-server,.settings-validation-network,.settings-validation-unexpected{color:rgba(255,255,255,.55)}
.settings-validation-checking .mdi-loading{animation:settings-spin .9s linear infinite}
@keyframes settings-spin{to{transform:rotate(360deg)}}

.settings-actions{display:flex;gap:8px;margin-top:10px}
.settings-action{min-height:36px;padding:0 14px;border:1px solid rgba(255,255,255,.12);border-radius:6px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .18s ease,color .18s ease}
.settings-action-danger{background:transparent;color:rgba(255,255,255,.65)}
.settings-action-danger:hover:not(:disabled){background:rgba(255,255,255,.06);color:rgba(255,255,255,.9)}
.settings-action-muted{background:transparent;color:rgba(255,255,255,.55)}
.settings-action-muted:hover:not(:disabled){background:rgba(255,255,255,.06);color:rgba(255,255,255,.85)}
.settings-action:disabled{cursor:not-allowed;opacity:.3}

.settings-policy-row{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px;border-top:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.65);font-size:13px}
.settings-policy-row:first-of-type{border-top:0}
.settings-policy-row strong{margin-right:6px;color:rgba(255,255,255,.88);font-weight:700}

@media(max-width:900px){
  .settings-workspace{grid-template-columns:1fr}
  .settings-sidebar{position:static;height:auto;display:flex;gap:6px;padding:8px 16px;overflow-x:auto;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}
  .settings-nav-item{flex:0 0 auto;width:auto;min-height:38px;margin:0;padding:0 14px}
  .settings-main{width:calc(100% - 32px);padding-top:22px}
}
@media(max-width:600px){
  .settings-topbar-inner{padding:0 16px}
  .settings-main{width:calc(100% - 32px);padding-top:18px}
  .settings-card{padding:16px}
  .settings-key-row{grid-template-columns:1fr}
  .settings-validate-button{min-height:40px}
  .settings-actions{display:grid;grid-template-columns:1fr}
  .settings-action{width:100%}
  .settings-main-heading h1{font-size:18px}
}
@media(prefers-reduced-motion:reduce){
  .settings-switch-knob,.settings-switch,.settings-nav-item,.settings-key-input,.settings-validate-button,.settings-action,.settings-back-button,.settings-validation-checking .mdi-loading{transition:none;animation:none}
}
</style>