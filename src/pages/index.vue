<template>
  <div class="page">
    <header class="no-select board-app-bar">
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
            <i-mdi-cog-outline class="settings-icon" />
          </router-link>
        </div>
      </div>
    </header>

    <HomeSkeleton v-if="!ready" />

    <div
      v-else
      class="board-shell board-shell-ready"
    >
      <div
        class="main-window board-container"
        :class="{ 'no-select': isWritable }"
      >
        <section
          v-if="gridItems.length === 0"
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

          <template v-if="isWritable">
            <div class="empty-divider">
              <span>选择学科开始录入</span>
            </div>

            <div class="empty-quick-grid">
              <SubjectAddCard
                v-for="(subject, index) in defaultSubjects"
                :key="subject.name"
                :subject="subject"
                :style="{ '--tile-delay': `${index * 40}ms` }"
                @add="openDialog(subject.name)"
              />
            </div>
          </template>
        </section>

        <section
          v-else
          class="populated-board"
        >
          <HomeworkGrid
            :sorted-items="gridItems"
            :unused-subjects="unusedList"
            :content-style="contentStyle"
            :updated-keys="flashKeys"
            :readonly="!isWritable"
            @open-dialog="openDialog"
          />
        </section>
      </div>
    </div>

    <HomeworkEditDialog
      v-if="isWritable"
      v-model="dialogVisible"
      :title="dialogTitle"
      :initial-content="dialogContent"
      @save="handleSave"
    />

    <FloatingToolbar
      :selected-date="selectedDate"
      :is-today="isToday"
      :writable="isWritable"
      :copy-to-today-loading="copying"
      :current-font-size="fontSize"
      @prev-day="goToDate(shiftDate(currentDate, -1))"
      @next-day="goToDate(shiftDate(currentDate, 1))"
      @zoom="zoom"
      @date-select="goToDate"
      @copy-to-today="copyConfirmVisible = true"
      @pick-student="openRollCall"
    />

    <!-- 复制到今天二次确认：小屏/手表误触会直接覆盖今天的内容，全端确认一次 -->
    <div
      v-if="copyConfirmVisible"
      class="dialog-overlay"
      @click.self="copyConfirmVisible = false"
    >
      <div
        class="copy-confirm-card"
        role="dialog"
        aria-modal="true"
      >
        <div class="copy-confirm-title">
          复制作业到今天？
        </div>
        <p class="copy-confirm-text">
          将把 {{ dateLabel }} 的作业复制到今天，今天已有的内容会被覆盖。
        </p>
        <div class="copy-confirm-actions">
          <button
            type="button"
            class="copy-confirm-cancel"
            @click="copyConfirmVisible = false"
          >
            取消
          </button>
          <button
            type="button"
            class="copy-confirm-solid"
            @click="confirmCopyToToday"
          >
            确认复制
          </button>
        </div>
      </div>
    </div>

    <!-- 409 并发冲突：让用户选云端还是本地，不静默覆盖 -->
    <div
      v-if="conflict"
      class="dialog-overlay"
      @click.self="closeConflict"
    >
      <div
        class="copy-confirm-card copy-confirm-card-wide"
        role="dialog"
        aria-modal="true"
      >
        <div class="copy-confirm-title">
          「{{ conflict.subject }}」在别处被改过
        </div>
        <p class="copy-confirm-text">
          云端版本比你编辑时更新，请选择保留哪一版。
        </p>
        <div class="conflict-grid">
          <div class="conflict-box">
            <div class="conflict-label">
              云端版本
            </div>
            <p class="conflict-content">
              {{ conflict.cloudContent || "（空）" }}
            </p>
          </div>
          <div class="conflict-box">
            <div class="conflict-label">
              我的版本
            </div>
            <p class="conflict-content">
              {{ conflict.localContent || "（空）" }}
            </p>
          </div>
        </div>
        <div class="copy-confirm-actions">
          <button
            type="button"
            class="copy-confirm-cancel"
            @click="takeCloud"
          >
            用云端版本
          </button>
          <button
            type="button"
            class="copy-confirm-solid"
            @click="keepLocal"
          >
            用我的版本覆盖
          </button>
        </div>
      </div>
    </div>

    <!-- 随机点名：先一级全班名单，再二级抽取滚动定格 -->
    <div
      v-if="rollVisible"
      class="dialog-overlay"
      @click.self="closeRollCall"
    >
      <div
        class="pick-card"
        role="dialog"
        aria-modal="true"
      >
        <div class="pick-head">
          <i-mdi-account-question-outline class="pick-head-icon" />
          <span>随机点名</span>
        </div>

        <div
          v-if="rollStep === 'list'"
          class="roster-grid"
        >
          <span
            v-for="name in rollRoster"
            :key="name"
            class="roster-chip"
          >
            {{ name }}
          </span>
        </div>

        <template v-else>
          <div
            class="pick-stage"
            :class="{ 'pick-landed': rollLanded }"
          >
            <div class="pick-name">
              {{ rollName }}
            </div>
            <div class="pick-hint">
              {{ rollRolling ? "正在抽取…" : "抽中" }}
            </div>
          </div>
          <div class="pick-count">
            共 {{ rollRoster.length }} 人
          </div>
        </template>

        <div class="pick-actions">
          <button
            type="button"
            class="pick-ghost"
            @click="rollStep === 'pick' ? openRollCall() : closeRollCall()"
          >
            {{ rollStep === "pick" ? "名单" : "关闭" }}
          </button>
          <button
            type="button"
            class="pick-solid"
            :disabled="rollRolling"
            @click="doRoll()"
          >
            {{ rollStep === "pick" ? "再抽一次" : "随机点名" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 同步提示：一次性/常驻都走公共 AppToast -->
    <AppToast
      :key="toast.seq"
      :show="toast.show"
      :message="toast.message"
      :action="toast.action"
      :persistent="toast.persistent"
      @action="onToastAction"
      @dismiss="toast.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import AppToast from "@/components/AppToast.vue";
import FloatingToolbar from "@/components/FloatingToolbar.vue";
import HomeworkEditDialog from "@/components/HomeworkEditDialog.vue";
import HomeSkeleton from "@/components/common/HomeSkeleton.vue";
import HomeworkGrid from "@/components/home/HomeworkGrid.vue";
import SubjectAddCard from "@/components/home/SubjectAddCard.vue";
import { useBoard } from "@/composables/useBoard";
import { useRollCall } from "@/composables/useRollCall";
import {
  SUBJECTS,
  formatDateKey,
  formatDateLabel,
  getDefaultSubjects,
  getFontSize,
  parseDateArg,
  shiftDate,
  toGridItems,
  unusedSubjects,
} from "@/utils/board";
import { getFontLevel, setFontLevel } from "@/utils/settings";

const {
  isWritable,
  currentDate,
  boardData,
  syncState,
  hasPending,
  conflict,
  load,
  saveSubject,
  resolveConflictKeepLocal,
  resolveConflictTakeCloud,
  retryNow,
  dispose,
} = useBoard();

const {
  visible: rollVisible,
  step: rollStep,
  name: rollName,
  roster: rollRoster,
  rolling: rollRolling,
  landed: rollLanded,
  open: openRollCall,
  roll: doRoll,
  close: closeRollCall,
} = useRollCall();

const saveTimer = ref(null);
const todayKey = formatDateKey(new Date());
const ready = ref(false);
const defaultSubjects = getDefaultSubjects();

const gridItems = computed(() => toGridItems(boardData.value));
const unusedList = computed(() => unusedSubjects(gridItems.value));
const isToday = computed(() => currentDate.value === todayKey);
const dateLabel = computed(() => formatDateLabel(currentDate.value));
const weekdayLabel = computed(() => ["日", "一", "二", "三", "四", "五", "六"][parseDateArg(currentDate.value).getDay()]);
const titleText = computed(() => (isToday.value ? "今天的作业" : `${dateLabel.value} 的作业`));
const emptyTitle = computed(() => (isToday.value ? "今天还没有作业记录" : "这一天暂时没有作业记录"));
const selectedDate = computed(() => parseDateArg(currentDate.value));

const fontLevel = ref(getFontLevel());
const fontSize = computed(() => getFontSize(fontLevel.value));
const contentStyle = computed(() => ({ fontSize: `${fontSize.value}px` }));

const flashKeys = ref([]);
const dialogVisible = ref(false);
const dialogTitle = ref("");
const dialogContent = ref("");
const copyConfirmVisible = ref(false);
const copying = ref(false);

const toast = reactive({ show: false, message: "", action: "", persistent: false, seq: 0, handler: null });

function flash(message, options = {}) {
  Object.assign(toast, {
    show: true,
    message,
    action: options.action || "",
    persistent: Boolean(options.persistent),
    handler: options.handler || null,
    seq: toast.seq + 1,
  });
}

function onToastAction() {
  const handler = toast.handler;
  toast.show = false;
  handler?.();
}

// 离线/失败时给一条常驻可重试提示，恢复后自动消失；没有本地改动则只提示连不上
watch(syncState, (state) => {
  if (state === "offline" || state === "error") {
    if (hasPending.value) {
      flash(state === "offline" ? "离线，改动已暂存，联网后自动重试" : "同步失败，改动已暂存", {
        action: "立即重试",
        persistent: true,
        handler: retryNow,
      });
    } else {
      flash(state === "offline" ? "连不上后端，当前显示本地缓存" : "同步失败");
    }
  } else if (toast.persistent) {
    toast.show = false;
  }
});

async function goToDate(value) {
  const date = formatDateKey(parseDateArg(value));
  if (date === currentDate.value) return;
  await load(date);
}

function openDialog(subject) {
  // 只读模式不绑编辑：入口本身不渲染，这里再兜一层
  if (!isWritable.value) return;
  dialogTitle.value = subject;
  dialogContent.value = boardData.value[subject] || "";
  dialogVisible.value = true;
}

async function handleSave(payload) {
  const subject = dialogTitle.value;
  if (!subject || !isWritable.value) return;
  const result = await saveSubject(subject, payload?.content ?? "");
  if (result.ok) {
    flashKeys.value = [subject];
    clearTimeout(saveTimer.value);
    saveTimer.value = setTimeout(() => (flashKeys.value = []), 1000);
    flash("已保存");
  } else if (result.unauthorized) {
    flash("写权限无效，改动只留在本机", { persistent: true });
  }
}

function closeConflict() {
  conflict.value = null;
}

async function keepLocal() {
  const result = await resolveConflictKeepLocal();
  flash(result.ok ? "已用本机版本覆盖" : "覆盖失败，请稍后重试");
}

function takeCloud() {
  resolveConflictTakeCloud();
  flash("已同步为云端版本");
}

// 复制到今天：按学科逐一提交，源里没有的学科清空，避免留下隔夜的旧作业
async function confirmCopyToToday() {
  copyConfirmVisible.value = false;
  if (!isWritable.value || isToday.value) return;
  copying.value = true;
  const source = { ...boardData.value };
  try {
    await load(todayKey);
    for (const subject of SUBJECTS) {
      const target = source[subject] || "";
      if ((boardData.value[subject] || "") === target) continue;
      const result = await saveSubject(subject, target);
      if (result.unauthorized) {
        flash("写权限无效，未能复制", { persistent: true });
        return;
      }
    }
    flash("已复制到今天");
  } finally {
    copying.value = false;
  }
}

function zoom(direction) {
  const next = direction === "up" ? fontLevel.value + 1 : fontLevel.value - 1;
  fontLevel.value = Math.max(-4, Math.min(24, next));
  setFontLevel(fontLevel.value);
}

let previousTitle = null;

onMounted(async () => {
  previousTitle = document.title;
  document.title = "作业看板";
  const requested = formatDateKey(parseDateArg(new URLSearchParams(window.location.search).get("date") || todayKey));
  // load 的同步前缀先把本地缓存填进 boardData：命中缓存就立刻出内容，没有才等第一次 GET
  const pending = load(requested);
  ready.value = Object.keys(boardData.value).length > 0;
  await pending;
  ready.value = true;
});

onBeforeUnmount(() => {
  document.title = previousTitle;
  clearTimeout(saveTimer.value);
  dispose();
  closeRollCall();
});
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

.settings-icon {
  width: 19px;
  height: 19px;
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

/* ── 复制到今天确认 / 409 冲突裁决对话框 ── */
.copy-confirm-card {
  width: 100%;
  max-width: 420px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: #171717;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.32);
}

.copy-confirm-card-wide {
  max-width: 640px;
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
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.copy-confirm-cancel:hover {
  background: rgba(255, 255, 255, 0.06);
}

.copy-confirm-solid {
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 10px;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.copy-confirm-solid:hover {
  background: #ffffff;
}

.conflict-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.conflict-box {
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: #1a1a1a;
}

.conflict-label {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  font-weight: 600;
}

.conflict-content {
  max-height: 38vh;
  margin: 6px 0 0;
  overflow-y: auto;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

/* ── 随机点名 ── */
.pick-card {
  width: 92%;
  max-width: 640px;
  padding: 22px 22px 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: #171717;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.32);
  text-align: center;
}

.pick-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #f1f1f1;
  font-size: 17px;
  font-weight: 800;
}

.pick-head-icon {
  width: 22px;
  height: 22px;
}

.roster-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 10px;
  max-height: 52vh;
  margin-top: 16px;
  overflow-y: auto;
  scrollbar-width: none;
}

.roster-grid::-webkit-scrollbar {
  display: none;
}

.roster-chip {
  min-width: 76px;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.pick-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.pick-name {
  min-height: 120px;
  color: #f5f5f5;
  font-size: clamp(56px, 14vw, 88px);
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: 0.06em;
}

/* 定格弹跳：滚动停下后收尾一次，滚动中不触发 */
.pick-landed .pick-name {
  animation: pick-land 0.45s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.pick-hint {
  min-height: 22px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.14em;
}

.pick-count {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}

.pick-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.pick-ghost {
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.pick-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
}

.pick-solid {
  min-height: 44px;
  padding: 0 26px;
  border: 0;
  border-radius: 12px;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.pick-solid:hover {
  background: #ffffff;
}

.pick-solid:disabled {
  opacity: 0.6;
  cursor: default;
}

@keyframes pick-land {
  0% { transform: scale(1.25); }
  60% { transform: scale(0.96); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .pick-landed .pick-name {
    animation: none;
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

@media (max-width: 600px) {
  .conflict-grid {
    grid-template-columns: 1fr;
  }
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

  .pick-actions {
    flex-direction: column;
  }

  .pick-ghost,
  .pick-solid {
    width: 100%;
    min-height: 48px;
  }
}
</style>
