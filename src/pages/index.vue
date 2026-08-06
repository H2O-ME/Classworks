<template>
  <v-app-bar
    class="no-select board-app-bar"
    elevation="0"
  >
    <div class="app-bar-inner">
      <div class="app-bar-title">
        {{ titleText }}
      </div>
      <div class="app-bar-actions">
        <div class="date-pill">
          {{ dateLabel }}
        </div>
        <router-link
          class="settings-button"
          to="/settings"
          aria-label="打开设置"
        >
          <v-icon
            icon="mdi-cog-outline"
            size="19"
          />
        </router-link>
      </div>
    </div>
  </v-app-bar>

  <HomeSkeleton v-if="!dataReady" />

  <div
    v-else
    class="board-shell board-shell-ready"
  >
    <v-container
      class="main-window board-container no-select"
      fluid
    >
      <section
        v-if="sortedItems.length === 0"
        class="empty-state"
      >
        <div class="empty-stage">
          <div class="empty-commandbar">
            <div class="commandbar-copy">
              <div class="commandbar-label">
                作业看板
              </div>
              <div class="commandbar-title">
                {{ emptyTitle }}
              </div>
            </div>

            <div class="commandbar-stats">
              <div class="commandbar-stat">
                <span>日期</span>
                <strong>{{ dateLabel }}</strong>
              </div>
              <div class="commandbar-stat">
                <span>已录入</span>
                <strong>{{ homeworkCount }} 项</strong>
              </div>
              <div class="commandbar-stat">
                <span>入口</span>
                <strong>{{ availableSubjects.length }} 科</strong>
              </div>
            </div>
          </div>

          <div class="subject-dock">
            <div class="subject-dock-header">
              <div class="subject-dock-title">
                快速开始
              </div>
              <div class="subject-dock-meta">
                {{ availableSubjects.length }} 个学科
              </div>
            </div>

            <div class="subject-dock-list">
              <button
                v-for="(subject, index) in availableSubjects"
                :key="subject.name"
                type="button"
                class="subject-dock-item"
                :style="{ '--entry-delay': `${index * 28}ms` }"
                @click="openDialog(subject.name)"
              >
                <span class="subject-dock-name">{{ subject.name }}</span>
                <v-icon
                  icon="mdi-plus"
                  size="18"
                />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else
        class="populated-board"
      >
        <HomeworkGrid
          :sorted-items="sortedItems"
          :unused-subjects="unusedSubjects"
          :content-style="contentStyle"
          @open-dialog="openDialog"
        />
      </section>
    </v-container>
  </div>

  <HomeworkEditDialog
    v-model="dialogVisible"
    :initial-content="textareaContent"
    :initial-options="dialogOptions"
    :title="dialogTitle"
    @save="handleHomeworkSave"
  />

  <FloatingToolbar
    :is-today="isToday"
    :copy-to-today-loading="loading.copyToToday"
    :selected-date="selectedDateObj"
    :current-font-size="currentFontSizeValue"
    @zoom="zoom"
    @date-select="handleDateSelect"
    @prev-day="navigateDay(-1)"
    @next-day="navigateDay(1)"
    @copy-to-today="copyHomeworkToToday"
  />

  <FloatingICP />

  <!-- 云端同步提示 -->
  <v-dialog
    v-model="syncNoticeVisible"
    width="420"
  >
    <v-card class="sync-dialog-card">
      <v-card-title class="sync-dialog-title">
        检测到云端更新
      </v-card-title>
      <v-card-text class="sync-dialog-text">
        本地已自动同步为最新内容。
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="syncNoticeVisible = false"
        >
          知道了
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          @click="openRollback"
        >
          对修改不满意？一键回退之前版本
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- 回退快照列表 -->
  <v-dialog
    v-model="rollbackVisible"
    width="460"
  >
    <v-card class="sync-dialog-card">
      <v-card-title class="sync-dialog-title">
        回退之前版本
      </v-card-title>
      <v-card-text>
        <div
          v-if="syncSnapshots.length === 0"
          class="sync-empty-text"
        >
          没有可回退的快照。
        </div>
        <button
          v-for="ts in syncSnapshots"
          :key="ts"
          type="button"
          class="sync-snapshot-item"
          @click="handleRollback(ts)"
        >
          <span>{{ formatSnapshotTime(ts) }}</span>
          <v-icon
            icon="mdi-restore"
            size="16"
          />
        </button>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="rollbackVisible = false"
        >
          取消
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { defineAsyncComponent } from "vue";
import FloatingICP from "@/components/FloatingICP.vue";
import HomeSkeleton from "@/components/common/HomeSkeleton.vue";
import HomeworkGrid from "@/components/home/HomeworkGrid.vue";
import {
  formatDateKey,
  getSortedHomeworkItems,
  getUnusedSubjects,
  normalizeBoardData,
  resolveAvailableSubjects,
} from "@/utils/board";
import { getData, setData, listSnapshots, setMeta } from "@/utils/storage";
import {
  rollbackDate,
  scheduleSyncNow,
  startPeriodicSync,
  stopPeriodicSync,
  watchSyncSecret,
} from "@/utils/sync";
import { getSetting, setSetting } from "@/utils/settings";

const FloatingToolbar = defineAsyncComponent(() => import("@/components/FloatingToolbar.vue"));
const HomeworkEditDialog = defineAsyncComponent(() => import("@/components/HomeworkEditDialog.vue"));

export default {
  name: "ClassworksBoard",
  components: {
    FloatingToolbar,
    FloatingICP,
    HomeworkEditDialog,
    HomeworkGrid,
    HomeSkeleton,
  },
  data() {
    return {
      dateString: "",
      selectedDateObj: new Date(),
      isToday: true,
      boardData: normalizeBoardData(),
      dialogVisible: false,
      dialogTitle: "",
      textareaContent: "",
      dialogOptions: {},
      currentEditSubject: "",
      dataReady: false,
      availableSubjects: [],
      loading: { copyToToday: false },
      fontSizeLevel: getSetting("display.fontSizeLevel") || 0,
      syncNoticeVisible: false,
      rollbackVisible: false,
      syncSnapshots: [],
      currentEditDateForRollback: "",
      unsubscribeSyncSecret: null,
    };
  },
  computed: {
    titleText() {
      return this.isToday ? "今天的作业" : `${this.dateLabel} 的作业`;
    },
    emptyTitle() {
      return this.isToday ? "今天还没有作业记录" : "这一天暂时没有作业记录";
    },
    dateLabel() {
      const date = this.selectedDateObj;
      return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    },
    sortedItems() {
      return getSortedHomeworkItems(this.boardData, this.availableSubjects);
    },
    unusedSubjects() {
      return getUnusedSubjects(this.boardData, this.availableSubjects);
    },
    homeworkCount() {
      return this.sortedItems.length;
    },
    contentStyle() {
      return { fontSize: `${this.currentFontSizeValue}px` };
    },
    currentFontSizeValue() {
      return Math.max(12, Math.min(40, 16 + this.fontSizeLevel));
    },
  },
  async mounted() {
    this.unsubscribeSyncSecret = watchSyncSecret((secret) => {
      stopPeriodicSync();
      if (secret) {
        startPeriodicSync({ onPulled: (pulledDates) => this.handlePulledDates(pulledDates) });
      }
    });
    try {
      await this.initializeData();
      this.dataReady = true;
    } catch (error) {
      console.error("初始化失败:", error);
    }
  },
  beforeUnmount() {
    stopPeriodicSync();
    this.unsubscribeSyncSecret?.();
  },
  methods: {
    async initializeData() {
      const urlParams = new URLSearchParams(window.location.search);
      const dateFromUrl = urlParams.get("date");
      const today = new Date();
      let currentDate = today;

      if (dateFromUrl && /^\d{8}$/.test(dateFromUrl)) {
        const year = dateFromUrl.slice(0, 4);
        const month = dateFromUrl.slice(4, 6);
        const day = dateFromUrl.slice(6, 8);
        currentDate = new Date(`${year}-${month}-${day}`);
      }

      this.selectedDateObj = currentDate;
      this.dateString = formatDateKey(currentDate);
      this.isToday = this.dateString === formatDateKey(today);

      await Promise.all([this.downloadData(), this.loadConfig()]);
    },
    async loadConfig() {
      try {
        const subjectsResponse = await getData("classworks-config-subject");
        this.availableSubjects = resolveAvailableSubjects(subjectsResponse);
      } catch (error) {
        console.warn("加载学科配置失败:", error);
        this.availableSubjects = resolveAvailableSubjects([]);
      }
    },
    async downloadData() {
      try {
        const response = await getData(`classworks-data-${this.dateString}`);
        this.boardData = normalizeBoardData(response);
      } catch (error) {
        console.error("加载作业失败:", error);
        this.boardData = normalizeBoardData();
      }
    },
    async uploadData() {
      return setData(`classworks-data-${this.dateString}`, this.boardData);
    },
    openDialog(subject) {
      this.currentEditSubject = subject;
      const card = this.boardData.homework[subject] || { content: "", options: {} };
      this.dialogTitle = card.name || subject;
      this.textareaContent = card.content || "";
      this.dialogOptions = { ...(card.options || {}) };
      this.dialogVisible = true;
    },
    async handleHomeworkSave(payload) {
      if (!this.currentEditSubject) return;

      const existing = this.boardData.homework[this.currentEditSubject] || {};
      const normalizedPayload =
        typeof payload === "string"
          ? { content: payload, options: existing.options || {} }
          : { content: payload?.content || "", options: payload?.options || {} };

      if (!normalizedPayload.content.trim()) {
        delete this.boardData.homework[this.currentEditSubject];
      } else {
        this.boardData.homework[this.currentEditSubject] = {
          ...existing,
          content: normalizedPayload.content,
          options: normalizedPayload.options,
        };
      }

      const saved = await this.uploadData();
      if (!saved) return;
      await setMeta(this.dateString, Date.now());
      scheduleSyncNow({ onPulled: (pulledDates) => this.handlePulledDates(pulledDates) });
    },
    zoom(direction) {
      this.fontSizeLevel = direction === "up" ? Math.min(this.fontSizeLevel + 1, 24) : Math.max(this.fontSizeLevel - 1, -4);
      setSetting("display.fontSizeLevel", this.fontSizeLevel);
    },
    async handleDateSelect(dateValue) {
      if (!dateValue) return;

      const selectedDate = new Date(dateValue);
      const nextDateString = formatDateKey(selectedDate);
      if (nextDateString === this.dateString) return;

      this.selectedDateObj = selectedDate;
      this.dateString = nextDateString;
      this.isToday = nextDateString === formatDateKey(new Date());
      await this.downloadData();
    },
    navigateDay(offset) {
      const currentDate = new Date(this.selectedDateObj);
      currentDate.setDate(currentDate.getDate() + offset);
      this.handleDateSelect(currentDate);
    },
    async copyHomeworkToToday() {
      if (this.loading.copyToToday) return;
      this.loading.copyToToday = true;

      try {
        const sourceHomework = JSON.parse(JSON.stringify(this.boardData.homework));
        const today = new Date();
        this.selectedDateObj = today;
        this.dateString = formatDateKey(today);
        this.isToday = true;
        this.boardData.homework = Object.fromEntries(
          Object.entries(sourceHomework).filter(([, value]) => value?.content?.trim()),
        );
        const saved = await this.uploadData();
        if (!saved) return;
        await setMeta(this.dateString, Date.now());
        scheduleSyncNow({ onPulled: (pulledDates) => this.handlePulledDates(pulledDates) });
      } catch (error) {
        console.error("复制到今天失败:", error);
      } finally {
        this.loading.copyToToday = false;
      }
    },
    async handlePulledDates(pulledDates) {
      if (!pulledDates?.includes(this.dateString)) return;
      await this.downloadData();
      this.syncNoticeVisible = true;
    },
    async openRollback() {
      this.currentEditDateForRollback = this.dateString;
      this.syncSnapshots = await listSnapshots(this.dateString);
      this.syncNoticeVisible = false;
      this.rollbackVisible = true;
    },
    formatSnapshotTime(ts) {
      const date = new Date(ts);
      return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    },
    async handleRollback(ts) {
      await rollbackDate(this.dateString, ts);
      this.rollbackVisible = false;
      await this.downloadData();
    },
  },
};
</script>

<style scoped>
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

.date-pill {
  flex: 0 0 auto;
  padding: 7px 13px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  font-weight: 600;
}

.app-bar-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.settings-button {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 255, 255, 0.78);
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.settings-button:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.065);
  color: rgba(255, 255, 255, 0.96);
}

.board-shell {
  min-height: calc(100dvh - 64px);
}

.board-shell-ready {
  animation: shell-enter 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.board-container {
  max-width: 1720px;
  min-height: calc(100dvh - 64px);
  margin: 0 auto;
  padding: 20px 32px 76px;
  overflow: clip;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(580px, calc(100dvh - 210px));
}

.empty-stage {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(520px, 0.92fr);
  gap: 18px;
  width: 100%;
  height: min(540px, calc(100dvh - 230px));
  min-height: 460px;
  max-height: 540px;
}

.empty-commandbar,
.subject-dock {
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 8px;
  background: #171717;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

.empty-commandbar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 30px;
  padding: clamp(22px, 2vw, 30px);
  animation: fade-up 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.commandbar-label {
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 700;
}

.commandbar-title {
  color: #f5f5f5;
  font-size: clamp(40px, 3.35vw, 58px);
  font-weight: 800;
  line-height: 1.08;
}

.commandbar-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(132px, 1fr));
  gap: 10px;
}

.commandbar-stat {
  display: grid;
  gap: 8px;
  min-height: 68px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.025);
}

.commandbar-stat span {
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
  font-weight: 700;
}

.commandbar-stat strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
  line-height: 1.1;
}

.subject-dock {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 14px;
  padding: clamp(20px, 1.8vw, 24px);
  animation: fade-up 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.subject-dock-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.subject-dock-title {
  color: #f1f1f1;
  font-size: 20px;
  font-weight: 700;
}

.subject-dock-meta {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
  font-weight: 600;
}

.subject-dock-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(76px, 1fr);
  gap: 10px;
}

.subject-dock-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 18px 0 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: #202020;
  color: #f0f0f0;
  opacity: 0;
  transform: translateY(10px);
  animation: subject-enter 0.34s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--entry-delay, 0ms);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, background-color 0.2s ease;
}

.subject-dock-item:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: #252525;
}

.subject-dock-name {
  min-width: 0;
  font-size: 17px;
  font-weight: 700;
}

.populated-board {
  animation: fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes shell-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes subject-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .board-shell-ready,
  .empty-commandbar,
  .populated-board,
  .subject-dock,
  .subject-dock-item {
    animation: none;
  }

  .subject-dock-item {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 1500px) {
  .board-container {
    padding-inline: 24px;
  }

  .empty-stage {
    grid-template-columns: minmax(0, 1fr) minmax(440px, 0.8fr);
  }
}

@media (max-width: 1080px) {
  .empty-state {
    min-height: auto;
  }

  .empty-stage {
    height: auto;
    min-height: auto;
    grid-template-columns: 1fr;
  }

  .commandbar-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .app-bar-inner {
    padding: 0 14px 0 20px;
  }

  .app-bar-title {
    font-size: 18px;
  }

  .date-pill {
    display: none;
  }

  .board-container {
    padding: 20px 14px 106px;
  }

  .commandbar-stats,
  .subject-dock-list {
    grid-template-columns: 1fr;
  }

  .subject-dock-item {
    min-height: 58px;
    padding: 0 14px;
  }
}

.sync-dialog-card {
  border-radius: 10px !important;
  background: #181818 !important;
  color: #f1f1f1;
}

.sync-dialog-title {
  font-weight: 700 !important;
}

.sync-dialog-text {
  color: rgba(255, 255, 255, 0.78) !important;
}

.sync-empty-text {
  padding: 18px 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  text-align: center;
}

.sync-snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  margin-bottom: 8px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #202020;
  color: #ededed;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.sync-snapshot-item:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: #262626;
}
</style>
