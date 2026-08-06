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
          :aria-label="copy.backHome"
          @click="goHome"
        >
          <v-icon
            icon="mdi-arrow-left"
            size="18"
          />
          <span>{{ copy.back }}</span>
        </button>
        <div class="settings-topbar-title">
          <span>CLASSWORKS</span>
          <strong>{{ copy.pageTitle }}</strong>
        </div>
      </div>
    </header>

    <main class="settings-shell">
      <div class="settings-layout">
        <aside class="settings-overview-panel">
          <div class="settings-overview-kicker">
            设置
          </div>
          <h1>本地优先的作业看板</h1>
          <p>管理云端连接，保持课堂设备上的作业记录稳定可用。</p>
          <div
            class="settings-overview-status"
            :class="{ 'settings-overview-status-active': hasSyncSecret }"
          >
            <span class="settings-status-dot" />
            <span>{{ hasSyncSecret ? "云端同步已启用" : "本地模式" }}</span>
          </div>
          <div class="settings-overview-note">
            <v-icon
              icon="mdi-lock-outline"
              size="16"
            />
            <span>未配置密钥时，不影响本地查看和编辑。</span>
          </div>
        </aside>

        <div class="settings-main-column">
          <section class="settings-panel settings-sync-panel">
            <div class="settings-panel-header">
              <div>
                <div class="settings-panel-kicker">
                  连接
                </div>
                <h2>云端同步</h2>
              </div>
              <span
                class="settings-status"
                :class="{ 'settings-status-active': hasSyncSecret }"
              >
                <span class="settings-status-dot" />
                {{ hasSyncSecret ? "已启用" : "本地" }}
              </span>
            </div>
            <div class="settings-panel-copy">
              <h3>同步密钥</h3>
              <p>输入 EdgeOne 项目中的密钥后，此设备会自动读取和备份云端作业。</p>
            </div>
            <label
              class="settings-field-label"
              for="sync-secret"
            >云端同步密钥</label>
            <input
              id="sync-secret"
              v-model="syncSecretInput"
              class="settings-sync-input"
              type="password"
              placeholder="输入同步密钥"
              autocomplete="off"
            >
            <div class="settings-sync-actions">
              <button
                class="settings-action settings-action-primary"
                type="button"
                :disabled="!syncSecretInput.trim()"
                @click="saveSyncSecret"
              >
                保存密钥
              </button>
              <button
                v-if="hasSyncSecret"
                class="settings-action settings-action-ghost"
                type="button"
                @click="clearSyncSecret"
              >
                清除密钥
              </button>
            </div>
            <div class="settings-hint">
              <v-icon
                icon="mdi-information-outline"
                size="16"
              />
              <span>密钥只保存在当前浏览器的本地存储中。</span>
            </div>
          </section>

          <section class="settings-panel settings-policy-panel">
            <div class="settings-panel-header">
              <div>
                <div class="settings-panel-kicker">
                  策略
                </div>
                <h2>数据策略</h2>
              </div>
            </div>
            <div class="settings-policy-list">
              <article class="settings-policy-row">
                <div class="settings-policy-icon">
                  <v-icon
                    icon="mdi-database-outline"
                    size="17"
                  />
                </div>
                <div class="settings-policy-copy">
                  <h3>本地优先</h3><p>作业首先保存在浏览器 IndexedDB，断网时也能继续查看和编辑。</p>
                </div>
              </article>
              <article class="settings-policy-row">
                <div class="settings-policy-icon">
                  <v-icon
                    icon="mdi-cloud-sync-outline"
                    size="17"
                  />
                </div>
                <div class="settings-policy-copy">
                  <h3>自动同步</h3><p>设置密钥后，保存作业会触发同步，页面也会定时检查云端更新。</p>
                </div>
              </article>
              <article class="settings-policy-row">
                <div class="settings-policy-icon">
                  <v-icon
                    icon="mdi-history"
                    size="17"
                  />
                </div>
                <div class="settings-policy-copy">
                  <h3>可回退</h3><p>云端更新覆盖本地前会保留快照，不满意时可以恢复之前版本。</p>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<script>
import { getSyncSecret, setSyncSecret } from "@/utils/sync";

const copy = { backHome: "返回首页", back: "返回", pageTitle: "设置" };

export default {
  name: "SettingsPage",
  data() {
    return { copy, previousTitle: null, syncSecretInput: "", hasSyncSecret: false };
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
    goHome() { this.$router.push("/"); },
    saveSyncSecret() {
      setSyncSecret(this.syncSecretInput);
      this.syncSecretInput = getSyncSecret();
      this.hasSyncSecret = !!this.syncSecretInput;
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
html, body, #app { margin: 0; min-width: 320px; width: 100%; min-height: 100%; }
.settings-page { min-height: 100dvh; background: #111; color: rgba(255,255,255,.92); }
.settings-topbar { min-height: 64px; border-bottom: 1px solid rgba(255,255,255,.07); background: rgba(18,18,18,.96); }
.settings-topbar-inner { display:flex; align-items:center; gap:14px; width:min(1480px,calc(100% - 64px)); min-height:64px; margin:0 auto; }
.settings-back-button { display:inline-flex; align-items:center; gap:8px; min-height:36px; padding:0 12px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(255,255,255,.035); color:rgba(255,255,255,.78); cursor:pointer; transition:background-color 180ms ease,border-color 180ms ease,color 180ms ease,transform 180ms ease; }
.settings-back-button:hover { transform:translateY(-1px); border-color:rgba(255,255,255,.14); background:rgba(255,255,255,.065); color:#f1f1f1; }
.settings-back-button span { font-size:13px; font-weight:700; }
.settings-topbar-title { display:inline-flex; align-items:baseline; gap:10px; }
.settings-topbar-title span { color:rgba(255,255,255,.4); font-size:11px; font-weight:800; letter-spacing:.12em; }
.settings-topbar-title strong { color:#f2f2f2; font-size:20px; font-weight:750; }
.settings-shell { width:min(1480px,calc(100% - 64px)); margin:0 auto; padding:28px 0 56px; }
.settings-layout { display:grid; grid-template-columns:280px minmax(0,1fr); align-items:start; gap:24px; }
.settings-overview-panel,.settings-panel { border:1px solid rgba(255,255,255,.07); border-radius:9px; background:#171717; box-shadow:0 12px 28px rgba(0,0,0,.12); }
.settings-overview-panel { position:sticky; top:24px; display:grid; gap:12px; min-height:248px; padding:20px; }
.settings-overview-kicker,.settings-panel-kicker { color:rgba(255,255,255,.42); font-size:11px; font-weight:800; letter-spacing:.12em; }
.settings-overview-panel h1 { margin:0; color:#f4f4f4; font-size:24px; font-weight:800; line-height:1.18; }
.settings-overview-panel>p { margin:0; color:rgba(255,255,255,.5); font-size:14px; line-height:1.6; }
.settings-overview-status,.settings-status { display:inline-flex; align-items:center; gap:7px; width:fit-content; min-height:28px; padding:0 10px; border:1px solid rgba(255,255,255,.08); border-radius:6px; background:rgba(255,255,255,.025); color:rgba(255,255,255,.5); font-size:13px; font-weight:700; }
.settings-overview-status-active,.settings-status-active { border-color:rgba(155,180,215,.22); color:rgba(205,218,238,.78); }
.settings-status-dot { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.28); }
.settings-overview-status-active .settings-status-dot,.settings-status-active .settings-status-dot { background:#a8bfdc; box-shadow:0 0 0 3px rgba(168,191,220,.1); }
.settings-overview-note { display:flex; align-items:flex-start; gap:7px; margin-top:auto; color:rgba(255,255,255,.38); font-size:12px; line-height:1.5; }
.settings-main-column { display:grid; gap:16px; min-width:0; }
.settings-panel { display:grid; gap:16px; padding:20px; }
.settings-panel-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.settings-panel-header h2 { margin:5px 0 0; color:#f1f1f1; font-size:20px; font-weight:750; line-height:1.2; }
.settings-panel-copy { display:grid; gap:6px; max-width:760px; }
.settings-panel-copy h3,.settings-policy-copy h3 { margin:0; color:#f1f1f1; font-size:15px; font-weight:750; }
.settings-panel-copy p,.settings-policy-copy p { margin:0; color:rgba(255,255,255,.5); font-size:14px; line-height:1.6; }
.settings-field-label { color:rgba(255,255,255,.66); font-size:13px; font-weight:700; }
.settings-sync-input { width:100%; height:40px; box-sizing:border-box; padding:0 12px; border:1px solid rgba(255,255,255,.1); border-radius:7px; outline:none; background:#202020; color:#f1f1f1; font-family:inherit; font-size:14px; transition:border-color 180ms ease,background-color 180ms ease; }
.settings-sync-input::placeholder { color:rgba(255,255,255,.3); }
.settings-sync-input:focus { border-color:rgba(168,191,220,.4); background:#232323; }
.settings-sync-actions { display:flex; gap:8px; }
.settings-action { min-height:34px; padding:0 13px; border-radius:7px; font-family:inherit; font-size:13px; font-weight:750; cursor:pointer; transition:background-color 180ms ease,border-color 180ms ease,transform 180ms ease; }
.settings-action:hover:not(:disabled) { transform:translateY(-1px); }
.settings-action-primary { border:1px solid #f3f3f3; background:#f3f3f3; color:#121212; }
.settings-action-primary:hover:not(:disabled) { background:#fff; }
.settings-action-primary:disabled { cursor:not-allowed; opacity:.35; }
.settings-action-ghost { border:1px solid rgba(255,255,255,.1); background:transparent; color:rgba(255,255,255,.72); }
.settings-action-ghost:hover { border-color:rgba(255,255,255,.18); background:rgba(255,255,255,.05); color:#f1f1f1; }
.settings-hint { display:inline-flex; align-items:center; gap:7px; color:rgba(255,255,255,.38); font-size:13px; }
.settings-policy-list { display:grid; }
.settings-policy-row { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:11px; padding:14px 0; border-top:1px solid rgba(255,255,255,.06); }
.settings-policy-row:first-child { padding-top:2px; border-top:0; }
.settings-policy-row:last-child { padding-bottom:2px; }
.settings-policy-icon { display:inline-flex; width:30px; height:30px; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.08); border-radius:7px; background:#202020; color:rgba(255,255,255,.68); }
.settings-policy-copy { display:grid; gap:5px; padding-top:1px; }
.settings-policy-copy p { font-size:13px; line-height:1.55; }
@media (max-width:760px) { .settings-topbar-inner,.settings-shell { width:calc(100% - 32px); } .settings-layout { grid-template-columns:1fr; gap:16px; } .settings-overview-panel { position:static; min-height:0; padding:16px; } .settings-overview-note { margin-top:2px; } .settings-panel { padding:16px; } }
@media (max-width:480px) { .settings-topbar-inner { gap:12px; } .settings-topbar-title span { display:none; } .settings-topbar-title strong { font-size:16px; } .settings-shell { padding-top:16px; } .settings-panel-header { gap:10px; } .settings-panel-header h2 { font-size:18px; } .settings-sync-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } .settings-action { width:100%; padding-inline:8px; } }
@media (prefers-reduced-motion:reduce) { .settings-back-button,.settings-action { transition:none; } .settings-back-button:hover,.settings-action:hover:not(:disabled) { transform:none; } }
</style>
