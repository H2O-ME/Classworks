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
        <div class="empty-hero">
          <div class="empty-hero-date">
            {{ dateLabel }} · 星期{{ weekdayLabel }}
          </div>
          <h1 class="empty-hero-title">
            {{ emptyTitle }}
          </h1>
        </div>

        <div class="empty-divider">
          <span>选择学科开始录入</span>
        </div>

        <div class="empty-quick-grid">
          <SubjectAddCard
            v-for="(subject, index) in availableSubjects"
            :key="subject.name"
            :subject="subject"
            :style="{ '--tile-delay': `${index * 40}ms` }"
            @add="openDialog(subject.name)"
          />
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
          :updated-keys="updatedCardKeys"
          @open-dialog="openDialog"
        />
      </section>
    </v-container>
  </div>

  <HomeworkEditDialog
    v-model="dialogVisible"
    :initial-content="textareaContent"
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
    @copy-to-today="copyConfirmVisible = true"
  />

  <!-- 复制到今天二次确认：小屏/手表误触会直接覆盖今天的内容，全端确认一次 -->
  <v-dialog
    v-model="copyConfirmVisible"
    max-width="420"
    width="92%"
    scrim="rgba(8, 8, 8, 0.66)"
  >
    <v-card
      class="copy-confirm-card"
      border
      rounded="lg"
    >
      <div class="copy-confirm-title">
        复制作业到今天？
      </div>
      <p class="copy-confirm-text">
        将把 {{ dateLabel }} 的作业复制到今天，今天已有的内容会被覆盖。
      </p>
      <div class="copy-confirm-actions">
        <v-btn
          class="copy-confirm-cancel"
          variant="text"
          @click="copyConfirmVisible = false"
        >
          取消
        </v-btn>
        <v-btn
          class="copy-confirm-solid"
          variant="flat"
          @click="confirmCopyToToday"
        >
          确认复制
        </v-btn>
      </div>
    </v-card>
  </v-dialog>

  <!-- 云端同步提示（持续显示，点击任意处或按钮后消失） -->
  <AppToast
    :show="syncNoticeVisible"
    message="检测到云端更新"
    persistent
    action="回退"
    @action="handleRollbackLatest"
    @dismiss="dismissSyncNotice"
  />

  <!-- 已同步到云端提示（自动消失） -->
  <AppToast
    :show="syncPushedToast"
    message="已同步到云端"
    @dismiss="dismissPushedToast"
  />
</template>

<script>
import { defineAsyncComponent } from "vue";
import HomeSkeleton from "@/components/common/HomeSkeleton.vue";
import HomeworkGrid from "@/components/home/HomeworkGrid.vue";
import SubjectAddCard from "@/components/home/SubjectAddCard.vue";
import {
  formatDateKey,
  getDefaultSubjects,
  getSortedHomeworkItems,
  getUnusedSubjects,
  normalizeBoardData,
} from "@/utils/board";
import { getData, setData, addDirty, snapshotDate } from "@/utils/storage";
import {
  rollbackToLatest,
  scheduleSyncNow,
  startPeriodicSync,
  stopPeriodicSync,
  watchSyncState,
} from "@/utils/sync";
import { getSetting, setSetting } from "@/utils/settings";

const FloatingToolbar = defineAsyncComponent(() => import("@/components/FloatingToolbar.vue"));
const HomeworkEditDialog = defineAsyncComponent(() => import("@/components/HomeworkEditDialog.vue"));

export default {
  name: "ClassworksBoard",
  components: {
    FloatingToolbar,
    HomeworkEditDialog,
    HomeworkGrid,
    HomeSkeleton,
    SubjectAddCard,
  },
  data() {
    return {
      dateString: "",
      selectedDateObj: new Date(),
      isToday: true,
      boardData: normalizeBoardData(),
      dialogVisible: false,
      copyConfirmVisible: false,
      dialogTitle: "",
      textareaContent: "",
      currentEditSubject: "",
      dataReady: false,
      availableSubjects: getDefaultSubjects(),
      loading: { copyToToday: false },
      fontSizeLevel: getSetting("display.fontSizeLevel") || 0,
      syncNoticeVisible: false,
      syncPushedToast: false,
      updatedCardKeys: [],
      previousTitle: null,
      unsubscribeSyncState: null,
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
    weekdayLabel() {
      return ["日", "一", "二", "三", "四", "五", "六"][this.selectedDateObj.getDay()];
    },
    sortedItems() {
      return getSortedHomeworkItems(this.boardData, this.availableSubjects);
    },
    unusedSubjects() {
      return getUnusedSubjects(this.boardData, this.availableSubjects);
    },
    contentStyle() {
      return { fontSize: `${this.currentFontSizeValue}px` };
    },
    currentFontSizeValue() {
      return Math.max(12, Math.min(40, 16 + this.fontSizeLevel));
    },
  },
  async mounted() {
    this.previousTitle = document.title;
    document.title = "作业看板";
    try {
      await this.initializeData();
      this.dataReady = true;
      this.unsubscribeSyncState = watchSyncState(({ enabled, secret }) => {
        if (enabled && secret) {
          startPeriodicSync({
            onPulled: (pulledDates) => this.handlePulledDates(pulledDates),
            onConflict: (conflictKeys) => this.handleConflicts(conflictKeys),
          });
        } else {
          stopPeriodicSync();
        }
      });
    } catch (error) {
      console.error("初始化失败:", error);
    }
  },
  beforeUnmount() {
    document.title = this.previousTitle;
    stopPeriodicSync();
    this.unsubscribeSyncState?.();
  },
  methods: {
    syncAfterEdit() {
      scheduleSyncNow({
        onPulled: (pulledDates) => this.handlePulledDates(pulledDates),
        onPushed: () => this.showPushedToast(),
        onConflict: (conflictKeys) => this.handleConflicts(conflictKeys),
      });
    },
    flashUpdatedCards() {
      this.updatedCardKeys = this.sortedItems.map((item) => item.key);
      setTimeout(() => {
        this.updatedCardKeys = [];
      }, 1000);
    },
    async initializeData() {
      const urlParams = new URLSearchParams(window.location.search);
      const dateFromUrl = urlParams.get("date");
      const today = new Date();
      let currentDate = today;

      if (dateFromUrl && /^\d{8}$/.test(dateFromUrl)) {
        // 按本地时区分量构造：new Date("YYYY-MM-DD") 按 UTC 解析，UTC 以西会错一天
        currentDate = new Date(
          Number(dateFromUrl.slice(0, 4)),
          Number(dateFromUrl.slice(4, 6)) - 1,
          Number(dateFromUrl.slice(6, 8)),
        );
      }

      this.selectedDateObj = currentDate;
      this.dateString = formatDateKey(currentDate);
      this.isToday = this.dateString === formatDateKey(today);

      await this.downloadData();
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
      this.dialogTitle = subject;
      this.textareaContent = this.boardData.homework[subject]?.content || "";
      this.dialogVisible = true;
    },
    async handleHomeworkSave(payload) {
      if (!this.currentEditSubject) return;

      const subject = this.currentEditSubject;
      const existing = this.boardData.homework[subject] || {};
      const after = payload?.content || "";
      const options = payload?.options || {};

      // 保存前后对本机做 diff：只有内容或 options 变化的学科才进脏集（本机没动过的不推）
      const subjectChanged = (existing.content || "") !== after
        || JSON.stringify(existing.options || {}) !== JSON.stringify(options);

      if (!after.trim()) {
        delete this.boardData.homework[subject];
      } else {
        this.boardData.homework[subject] = {
          ...existing,
          content: after,
          options,
        };
      }

      const saved = await this.uploadData();
      if (!saved) return;
      if (subjectChanged) {
        await addDirty([`${this.dateString}|${subject}`]);
      }
      this.syncAfterEdit();
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
    confirmCopyToToday() {
      this.copyConfirmVisible = false;
      this.copyHomeworkToToday();
    },
    async copyHomeworkToToday() {      if (this.loading.copyToToday) return;
      this.loading.copyToToday = true;

      try {
        const sourceHomework = JSON.parse(JSON.stringify(this.boardData.homework));
        const today = new Date();
        this.selectedDateObj = today;
        this.dateString = formatDateKey(today);
        this.isToday = true;
        await this.replaceBoardWith(sourceHomework);
      } catch (error) {
        console.error("复制到今天失败:", error);
      } finally {
        this.loading.copyToToday = false;
      }
    },
    // 用 sourceHomework 整日替换当前查看日：先留快照防误覆盖；内容变化/被删学科标脏（墓碑防云端复活），写回并触发同步
    async replaceBoardWith(sourceHomework) {
      const previous = normalizeBoardData(await getData(`classworks-data-${this.dateString}`)).homework;
      const dirtyEntries = [];
      for (const [key, value] of Object.entries(sourceHomework)) {
        if (!value?.content?.trim()) continue;
        if ((previous[key]?.content || "") !== value.content) dirtyEntries.push(`${this.dateString}|${key}`);
      }
      for (const [key, value] of Object.entries(previous)) {
        if (value?.content?.trim() && !sourceHomework[key]?.content?.trim()) {
          dirtyEntries.push(`${this.dateString}|${key}`);
        }
      }

      await snapshotDate(this.dateString);
      this.boardData.homework = Object.fromEntries(
        Object.entries(sourceHomework).filter(([, value]) => value?.content?.trim()),
      );
      const saved = await this.uploadData();
      if (!saved) return;
      if (dirtyEntries.length) {
        await addDirty(dirtyEntries);
      }
      this.syncAfterEdit();
    },
    async handlePulledDates(pulledDates) {
      if (!pulledDates?.includes(this.dateString)) return;
      await this.downloadData();
      this.flashUpdatedCards();
      this.syncNoticeVisible = true;
    },
    handleConflicts(conflictKeys) {
      // 真并发：本机推的条目被其他设备更新覆盖 → 弹通知条，可一键回退到本机版本
      if (!conflictKeys?.length) return;
      if (conflictKeys.some((key) => key.startsWith(`${this.dateString}|`))) {
        this.syncNoticeVisible = true;
      }
    },
    dismissSyncNotice() {
      this.syncNoticeVisible = false;
    },
    showPushedToast() {
      this.syncPushedToast = true;
    },
    dismissPushedToast() {
      this.syncPushedToast = false;
    },
    async handleRollbackLatest() {
      this.dismissSyncNotice();
      // 回退本地立即生效（乐观更新）：恢复快照后马上刷新页面，KV 推送在后台完成
      const result = await rollbackToLatest(this.dateString, {
        onPushed: () => this.showPushedToast(),
      });
      if (!result.ok) return;
      await this.downloadData();
      this.flashUpdatedCards();
    },
  },
};
</script>

<style scoped>
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
  min-height: calc(100dvh - 64px - var(--sat, 0px));
}

.board-shell-ready {
  animation: shell-enter 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.board-container {
  max-width: 1720px;
  min-height: calc(100dvh - 64px - var(--sat, 0px));
  margin: 0 auto;
  padding: 20px 32px calc(76px + var(--sab, 0px));
  /* ponytail: 仅裁横向；纵向 content 自然撑高 body，否则移动端内容超出会被 clip 截断且无法滚动 */
  overflow-x: clip;
}

/* ── 开屏空态:金字塔构图 —— 日期胶囊/大标题/主按钮居中,学科卡 3×2 阵列收底 ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  min-height: min(600px, calc(100dvh - 220px));
  animation: fade-up 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.empty-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  text-align: center;
}

.empty-hero-date {
  padding: 7px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.empty-hero-title {
  margin: 20px 0 0;
  color: #f5f5f5;
  font-size: clamp(32px, 3.4vw, 46px);
  font-weight: 800;
  line-height: 1.15;
}



/* 细线分隔语:给主按钮与学科阵列一段呼吸 */
.empty-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 760px;
  color: rgba(255, 255, 255, 0.34);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  white-space: nowrap;
}

.empty-divider::before,
.empty-divider::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

/* 学科卡固定 3 列(6 科 = 2×3 阵列),不再一条横排摊开 */
.empty-quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 760px;
}

.populated-board {
  animation: fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

/* ── 复制到今天确认对话框 ── */
.copy-confirm-card {
  padding: 20px;
  background: #171717 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.copy-confirm-title {
  color: #f1f1f1;
  font-size: 17px;
  font-weight: 800;
}

.copy-confirm-text {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 14px;
  line-height: 1.6;
}

.copy-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.copy-confirm-cancel {
  min-height: 40px;
  color: rgba(255, 255, 255, 0.72) !important;
}

.copy-confirm-solid {
  min-height: 40px;
  border-radius: 10px !important;
  background: #f3f3f3 !important;
  color: #121212 !important;
  font-weight: 800;
}

@media (max-width: 380px) {
  .copy-confirm-actions {
    flex-direction: column;
  }

  .copy-confirm-cancel,
  .copy-confirm-solid {
    width: 100%;
    min-height: 44px;
  }
}

@keyframes shell-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .board-shell-ready,
  .empty-state,
  .populated-board {
    animation: none;
  }
}

@media (max-width: 1500px) {
  .board-container {
    padding-inline: 24px;
  }
}

@media (max-width: 700px) {
  .date-pill {
    display: none;
  }

  .empty-quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .board-container {
    padding: 16px 14px calc(106px + var(--sab, 0px));
  }

  /* 移动端空态：标题与卡片阵列收拢，避免首屏滚动 */
  .empty-state {
    gap: 22px;
    min-height: min(520px, calc(100dvh - 200px));
  }

  .empty-hero-title {
    margin-top: 14px;
    font-size: clamp(26px, 7vw, 34px);
  }

  .empty-divider {
    font-size: 11.5px;
  }

  .empty-quick-grid {
    gap: 12px;
  }
}
</style>
