<template>
  <div class="page">
    <header class="no-select board-app-bar">
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
            <i-mdi-chevron-left class="nav-icon" />
            <span>首页</span>
          </router-link>
        </div>
      </div>
    </header>

    <div class="settings-scroll">
      <div class="settings-body">
        <div class="settings-grid">
          <!-- 访问权限：写权限由地址里的密钥决定，没有本地开关 -->
          <section class="panel">
            <div class="panel-head">
              <div class="panel-icon">
                <i-mdi-shield-check-outline class="panel-icon-glyph" />
              </div>
              <div class="panel-copy">
                <h2 class="panel-title">
                  访问权限
                </h2>
                <p class="panel-desc">
                  写权限来自地址里的密钥，读出后立刻从地址栏抹掉，只存在本机。
                </p>
              </div>
              <span
                class="status-chip"
                :class="isWritable ? 'status-on' : 'status-off'"
              >
                {{ isWritable ? "可读写" : "只读" }}
              </span>
            </div>

            <div class="panel-rows">
              <div class="panel-row">
                <span>当前教室</span>
                <strong>{{ room }}</strong>
              </div>
              <div class="panel-row">
                <span>写权限</span>
                <strong>{{ isWritable ? "可写" : "只读" }}</strong>
              </div>
            </div>

            <div
              v-if="isWritable"
              class="panel-actions"
            >
              <button
                type="button"
                class="nav-button"
                @click="forgetKey"
              >
                清除本机写权限
              </button>
            </div>
          </section>

          <!-- 云端连接：后端连通性 -->
          <section class="panel">
            <div class="panel-head">
              <div class="panel-icon">
                <i-mdi-cloud-sync-outline class="panel-icon-glyph" />
              </div>
              <div class="panel-copy">
                <h2 class="panel-title">
                  云端连接
                </h2>
                <p class="panel-desc">
                  作业数据存在教室后端服务器上；本机会缓存最近一次内容，断网也能看。
                </p>
              </div>
              <span
                class="status-chip"
                :class="healthClass"
              >
                {{ healthLabel }}
              </span>
            </div>

            <div class="panel-rows">
              <div class="panel-row">
                <span>接口地址</span>
                <strong class="panel-row-mono">{{ API_BASE || "同源 /api" }}</strong>
              </div>
            </div>

            <div class="panel-actions">
              <button
                type="button"
                class="solid-btn"
                :disabled="health === 'checking'"
                @click="checkHealth"
              >
                {{ health === "checking" ? "检测中…" : "重新检测" }}
              </button>
              <span
                v-if="health === 'fail'"
                class="panel-error"
              >
                {{ healthError }}
              </span>
            </div>
          </section>
        </div>

        <!-- 变更历史：原主页面没有这个入口，挪到设置页 -->
        <section class="panel">
          <div class="panel-head">
            <div class="panel-icon">
              <i-mdi-history class="panel-icon-glyph" />
            </div>
            <div class="panel-copy">
              <h2 class="panel-title">
                变更历史
              </h2>
              <p class="panel-desc">
                每次保存都会留下一条记录，可以回填到当前版本。
              </p>
            </div>
            <button
              type="button"
              class="nav-button"
              @click="openHistory"
            >
              查看变更历史
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- 历史流水：最近 20 条，可一键回填 -->
    <div
      v-if="historyVisible"
      class="dialog-overlay"
      @click.self="historyVisible = false"
    >
      <div
        class="history-card"
        role="dialog"
        aria-modal="true"
      >
        <div class="history-head">
          <h2>变更历史</h2>
          <span class="history-date">{{ dateLabel }}</span>
          <button
            type="button"
            class="history-close"
            @click="historyVisible = false"
          >
            关闭
          </button>
        </div>

        <p
          v-if="history.length === 0"
          class="history-empty"
        >
          这一天还没有变更记录
        </p>
        <ul
          v-else
          class="history-list"
        >
          <li
            v-for="item in history"
            :key="item.id"
          >
            <div class="history-meta">
              {{ formatTime(item.createdAt) }} · {{ item.subject }}
            </div>
            <p class="history-content">
              {{ item.content || "（空）" }}
            </p>
            <button
              type="button"
              class="nav-button"
              @click="restore(item)"
            >
              回填
            </button>
          </li>
        </ul>
      </div>
    </div>

    <AppToast
      :show="toast.show"
      :message="toast.message"
      icon="mdi-cloud-sync-outline"
      @dismiss="toast.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import AppToast from "@/components/AppToast.vue";
import { API_BASE, formatTime, getHealth } from "@/api/board";
import { useAuth } from "@/composables/useAuth";
import { useBoard } from "@/composables/useBoard";
import { formatDateLabel, formatDateKey } from "@/utils/board";

const { room, isWritable } = useAuth();
const { history, loadHistory, restoreFromHistory } = useBoard();

const todayKey = formatDateKey(new Date());
const dateLabel = computed(() => formatDateLabel(todayKey));

const health = ref("checking");
const healthError = ref("");
const historyVisible = ref(false);
const toast = reactive({ show: false, message: "" });

const healthLabel = computed(
  () => ({ checking: "检测中", ok: "已连接", fail: "连接失败" })[health.value],
);
const healthClass = computed(
  () => ({ checking: "status-off", ok: "status-on", fail: "status-fail" })[health.value],
);

function flash(message) {
  toast.message = message;
  toast.show = true;
}

async function checkHealth() {
  health.value = "checking";
  healthError.value = "";
  try {
    const result = await getHealth();
    health.value = result?.ok === false ? "fail" : "ok";
    if (result?.ok === false) healthError.value = "后端返回异常";
  } catch (error) {
    health.value = "fail";
    healthError.value = error.status === 0 ? "网络不可达" : error.message;
  }
}

async function openHistory() {
  historyVisible.value = true;
  await loadHistory();
}

async function restore(item) {
  const result = await restoreFromHistory(item);
  flash(result.ok ? `已回填「${item.subject}」` : "回填失败，请稍后重试");
}

function forgetKey() {
  try {
    window.localStorage.removeItem("classworks:auth");
  } catch (error) {
    console.warn("清除写权限失败:", error);
  }
  // 内存里的密钥也一起清掉：重新加载后即变为只读
  window.location.reload();
}

let previousTitle = null;

onMounted(() => {
  previousTitle = document.title;
  document.title = "设置";
  checkHealth();
});

onBeforeUnmount(() => {
  document.title = previousTitle;
});
</script>

<style scoped>
/* 顶栏共用样式（board-app-bar / app-bar-*）在 src/styles/index.css */

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
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
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

.nav-icon {
  width: 19px;
  height: 19px;
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

/* ── 主体：双栏网格 + 历史卡；内容不足一屏时垂直居中，超出则自然滚动 ── */
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

.panel-icon-glyph {
  width: 20px;
  height: 20px;
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
.status-fail {
  border-color: rgba(255, 69, 58, 0.35);
  background: rgba(255, 69, 58, 0.1);
  color: #ff6961;
}

/* ── 信息行：与原来的 .toggle-row 同一套分隔线语言 ── */
.panel-rows {
  margin-top: 18px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  font-size: 14px;
}

.panel-row > span {
  color: rgba(255, 255, 255, 0.56);
}

.panel-row > strong {
  max-width: 64%;
  overflow: hidden;
  color: #f5f5f5;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-row-mono {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.82);
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.panel-error {
  color: #ff6961;
  font-size: 12px;
}

.solid-btn {
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.solid-btn:hover {
  background: #ffffff;
}

.solid-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ── 变更历史弹窗 ── */
.history-card {
  display: flex;
  width: 100%;
  max-width: 680px;
  max-height: 82vh;
  flex-direction: column;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: #171717;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.32);
}

.history-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
}

.history-head h2 {
  flex: 1 1 auto;
  margin: 0;
  color: #f1f1f1;
  font-size: 17px;
  font-weight: 800;
}

.history-date {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}

.history-close {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.78);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.history-empty {
  margin: 0;
  padding: 32px 0;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  text-align: center;
}

.history-list {
  flex: 1 1 auto;
  min-height: 0;
  margin: 14px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.history-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.history-meta {
  min-width: 116px;
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.42);
  font-size: 12px;
}

.history-content {
  display: -webkit-box;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.history-list .nav-button {
  flex: 0 0 auto;
  padding: 0 12px;
}

/* ponytail: 本版没有本地开关项（写权限由 URL 密钥决定），保留原开关样式，
   以后真出现需要开关的设置项可直接用，不必重画。 */
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

/* ── 桌面：双栏 ── */
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

  .panel-rows {
    margin-top: 12px;
    padding-top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .switch-knob,
  .switch::before {
    transition: none;
    animation: none;
  }
}
</style>
