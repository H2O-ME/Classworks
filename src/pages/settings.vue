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
              :class="syncEnabled ? 'status-on' : 'status-off'"
            >
              {{ syncEnabled ? "已连接" : "已关闭" }}
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

  <!-- 同步状态提示：一次性浮动提示，不占卡片布局 -->
  <AppToast
    :show="syncToastVisible"
    :message="syncToastText"
    icon="mdi-cloud-sync-outline"
    @dismiss="syncToastVisible = false"
  />
</template>

<script>
import { getSyncEnabled, setSyncEnabled, watchSyncState } from "@/utils/sync";

export default {
  name: "SettingsPage",
  data() {
    return {
      previousTitle: null,
      syncEnabled: getSyncEnabled(),
      syncToastVisible: false,
      syncToastText: "",
      unsubscribeSyncState: null,
    };
  },
  mounted() {
    this.previousTitle = document.title;
    document.title = "设置";
    this.unsubscribeSyncState = watchSyncState(({ enabled }) => {
      this.syncEnabled = enabled;
    });
  },
  beforeUnmount() {
    document.title = this.previousTitle;
    this.unsubscribeSyncState?.();
  },
  methods: {
    toggleSync() {
      const next = !this.syncEnabled;
      setSyncEnabled(next);
      this.syncToastText = next ? "云端同步已开启" : "云端同步已关闭";
      this.syncToastVisible = true;
    },
  },
};
</script>

<style scoped>
/* 顶栏共用样式（board-app-bar / app-bar-*）在 src/styles/index.scss */

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
  /* 老 WebView（手表内置浏览器）不认 dvh，整条声明会失效导致高度塌陷，先给 vh 回退 */
  height: calc(100vh - 64px - var(--sat, 0px));
  height: calc(100dvh - 64px - var(--sat, 0px));
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
/* align-items:start：卡片按自身内容定高，避免内容少的卡片被等高拉伸出大片空白 */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: auto;
  align-items: start;
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
.status-off {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.5);
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

/* ── 手表/极窄：收紧间距，头部自然换行 ── */
@media (max-width: 380px) {
  .settings-body {
    gap: 10px;
    padding: 12px 10px;
  }

  .settings-grid {
    gap: 10px;
  }

  .panel {
    padding: 12px;
  }

  .panel-head {
    gap: 10px;
  }

  .panel-icon {
    width: 34px;
    height: 34px;
  }

  /* 320px 级屏幕上 min-width 会把图标/胶囊同行挤溢出，放开让文案自由换行 */
  .panel-copy {
    min-width: 0;
    flex-basis: 140px;
  }

  /* 胶囊换行后不再被 margin-left:auto 顶到右侧，靠左自然排列 */
  .status-chip {
    margin-left: 0;
  }

  .panel-title {
    font-size: 16px;
  }

  .panel-desc {
    font-size: 12px;
  }

  .toggle-row,
  .policy-list {
    margin-top: 12px;
    padding-top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .switch-knob, .switch::before {
    transition: none;
    animation: none;
  }
}
</style>