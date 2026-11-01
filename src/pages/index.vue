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
          <!-- 身份是标签、入口是按钮：只读时给一个带字的「登录」，不要让用户猜图标 -->
          <template v-if="signedIn">
            <div class="identity-pill">
              <i-mdi-account-circle-outline class="identity-icon" />
              {{ userLabel }}
            </div>
            <router-link
              class="settings-button"
              to="/settings"
              aria-label="打开设置"
            >
              <i-mdi-cog-outline class="settings-icon" />
            </router-link>
          </template>
          <router-link
            v-else
            class="login-button"
            to="/login"
          >
            <i-mdi-account-arrow-right-outline class="login-icon" />
            <span>登录</span>
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
        :class="{ 'no-select': editableSubjects.length > 0 }"
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

          <template v-if="editableSubjects.length">
            <div class="empty-divider">
              <span>选择学科开始录入</span>
            </div>

            <div class="empty-quick-grid">
              <SubjectAddCard
                v-for="(subject, index) in editableSubjects"
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
            :editable-subjects="editableSubjectNames"
            @open-dialog="openDialog"
          />
        </section>
      </div>
    </div>

    <HomeworkEditDialog
      v-if="editableSubjects.length"
      v-model="dialogVisible"
      :title="dialogTitle"
      :initial-content="dialogContent"
      @save="handleSave"
    />

    <FloatingToolbar
      :selected-date="selectedDate"
      :is-today="isToday"
      :writable="canEditAll"
      :copy-to-today-loading="copying"
      :current-font-size="renderedFontSize"
      @prev-day="goToDate(shiftDate(currentDate, -1))"
      @next-day="goToDate(shiftDate(currentDate, 1))"
      @zoom="zoom"
      @date-select="goToDate"
      @copy-to-today="copyConfirmVisible = true"
      @pick-student="openRollCall"
    />

    <!-- 复制到今天二次确认：小屏/手表误触会直接覆盖今天的内容，全端确认一次 -->
    <Dialog
      :open="copyConfirmVisible"
      @update:open="copyConfirmVisible = $event"
    >
      <DialogContent>
        <div class="copy-confirm-card">
          <DialogTitle class="copy-confirm-title">
            复制作业到今天？
          </DialogTitle>
          <p class="copy-confirm-text">
            将把 {{ dateLabel }} 的作业复制到今天，今天已有的内容会被覆盖。
          </p>
          <div class="copy-confirm-actions">
            <Button
              variant="ghost"
              class="copy-confirm-cancel"
              @click="copyConfirmVisible = false"
            >
              取消
            </Button>
            <Button
              class="copy-confirm-solid"
              @click="confirmCopyToToday"
            >
              确认复制
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 随机点名：先一级全班名单，再二级抽取滚动定格 -->
    <Dialog
      :open="rollVisible"
      @update:open="$event || closeRollCall()"
    >
      <DialogContent>
        <div class="pick-card">
          <DialogTitle class="pick-head">
            <i-mdi-account-question-outline class="pick-head-icon" />
            <span>随机点名</span>
          </DialogTitle>

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
            <Button
              variant="ghost"
              class="pick-ghost"
              @click="rollStep === 'pick' ? openRollCall() : closeRollCall()"
            >
              {{ rollStep === "pick" ? "名单" : "关闭" }}
            </Button>
            <Button
              class="pick-solid"
              :disabled="rollRolling"
              @click="doRoll()"
            >
              {{ rollStep === "pick" ? "再抽一次" : "随机点名" }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import HomeSkeleton from "@/components/common/HomeSkeleton.vue";
import HomeworkGrid from "@/components/home/HomeworkGrid.vue";
import SubjectAddCard from "@/components/home/SubjectAddCard.vue";
import { useAuth } from "@/composables/useAuth";
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

const { isBoard, user, userLabel, canEdit, refreshIdentity, verifyBoardToken } = useAuth();
const { currentDate, boardData, syncState, hasPending, forbidden, load, saveSubject, retryNow, dispose } =
  useBoard();

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

const gridItems = computed(() => toGridItems(boardData.value));
const unusedList = computed(() => unusedSubjects(gridItems.value));
// 当前身份可写的科目：白板/管理员=6 科，课代表=1 科，同学=0 科
const editableSubjectNames = computed(() => SUBJECTS.filter((name) => canEdit(name)));
const editableSubjects = computed(() => getDefaultSubjects().filter((subject) => canEdit(subject.name)));
// 「复制到今天」会重写全部 6 科，只有白板和管理员能做
const canEditAll = computed(() => isBoard.value || user.value?.role === "admin");
const signedIn = computed(() => isBoard.value || Boolean(user.value));
const isToday = computed(() => currentDate.value === todayKey);
const dateLabel = computed(() => formatDateLabel(currentDate.value));
const weekdayLabel = computed(() => ["日", "一", "二", "三", "四", "五", "六"][parseDateArg(currentDate.value).getDay()]);
const titleText = computed(() => (isToday.value ? "今天的作业" : `${dateLabel.value} 的作业`));
const emptyTitle = computed(() => (isToday.value ? "今天还没有作业记录" : "这一天暂时没有作业记录"));
const selectedDate = computed(() => parseDateArg(currentDate.value));

const fontLevel = ref(getFontLevel());
const fontSize = computed(() => getFontSize(fontLevel.value));
// 字号档位以 16px 为基准，渲染时换成 rem 才能跟全站 125% 基准一起放大
// （直接写 px 的话正文会比周围小一圈）。工具栏显示换算后的实际像素。
const fontScale = 1.25;
const renderedFontSize = computed(() => Math.round(fontSize.value * fontScale));
const contentStyle = computed(() => ({ fontSize: `${(fontSize.value / 16).toFixed(4)}rem` }));

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

// 403：服务端拒绝写某科（权限被改过/令牌失效），重试没用，直接告知
watch(forbidden, (message) => {
  if (message) flash(message);
});

async function goToDate(value) {
  const date = formatDateKey(parseDateArg(value));
  if (date === currentDate.value) return;
  await load(date);
}

function openDialog(subject) {
  // 无该科权限不绑编辑：入口本身不渲染，这里再兜一层
  if (!canEdit(subject)) return;
  dialogTitle.value = subject;
  dialogContent.value = boardData.value[subject] || "";
  dialogVisible.value = true;
}

async function handleSave(payload) {
  const subject = dialogTitle.value;
  if (!subject || !canEdit(subject)) return;
  const result = await saveSubject(subject, payload?.content ?? "");
  if (result.ok) {
    flashKeys.value = [subject];
    clearTimeout(saveTimer.value);
    saveTimer.value = setTimeout(() => (flashKeys.value = []), 1000);
    flash("已保存");
  } else if (result.unauthorized) {
    flash("登录已过期，改动只留在本机，请重新登录", { persistent: true });
  }
}

// 复制到今天：按学科逐一提交，源里没有的学科清空，避免留下隔夜的旧作业
async function confirmCopyToToday() {
  copyConfirmVisible.value = false;
  if (!canEditAll.value || isToday.value) return;
  copying.value = true;
  const source = { ...boardData.value };
  try {
    await load(todayKey);
    for (const subject of SUBJECTS) {
      const target = source[subject] || "";
      if ((boardData.value[subject] || "") === target) continue;
      const result = await saveSubject(subject, target);
      if (!result.ok) {
        flash(result.message || "复制失败，请稍后重试");
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
  // 身份校正与拉数据并行：不阻塞首屏，角色改过时 canEdit 会自己跟着变
  refreshIdentity();
  // 白板口令必须后端确认后才解锁编辑（?key=see 这类手误不能假可写）
  verifyBoardToken().then((status) => {
    // 口令被拒要明说：否则讲台看到全灰只会以为板子坏了，以为是网络问题
    if (status === "invalid") flash("白板口令不对，当前是只读模式。请检查快捷方式里的 ?key= 参数", { persistent: true });
  });
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
  padding: 0.4375rem 0.8125rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.8125rem;
  font-weight: 600;
}

/* 当前身份：白板/管理员/课代表/同学，一眼看出这台机器现在能改什么 */
.identity-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.4375rem 0.75rem;
  border: 1px solid rgba(174, 191, 221, 0.22);
  border-radius: 0.5rem;
  background: rgba(174, 191, 221, 0.08);
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.8125rem;
  font-weight: 600;
}

.identity-icon {
  width: 0.9375rem;
  height: 0.9375rem;
}

/* 未登录时的入口：带文字的实心按钮，比一个箭头图标直观得多 */
.login-button {
  display: inline-flex;
  min-height: 2.25rem;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.875rem;
  border: 1px solid rgba(174, 191, 221, 0.32);
  border-radius: 0.5rem;
  background: rgba(174, 191, 221, 0.14);
  color: #eaf0f8;
  font-size: 0.8125rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.login-button:hover {
  transform: translateY(-1px);
  border-color: rgba(174, 191, 221, 0.55);
  background: rgba(174, 191, 221, 0.22);
  color: #ffffff;
}

.login-icon {
  width: 1.0625rem;
  height: 1.0625rem;
}

.settings-button {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
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
  width: 1.1875rem;
  height: 1.1875rem;
}

.board-shell {
  min-height: calc(100dvh - 4rem - var(--sat, 0px));
}

.board-shell-ready {
  animation: shell-enter 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.board-container {
  max-width: 107.5rem;
  min-height: calc(100dvh - 4rem - var(--sat, 0px));
  margin: 0 auto;
  padding: 1.25rem 2rem calc(4.75rem + var(--sab, 0px));
  /* ponytail: 仅裁横向；纵向 content 自然撑高 body，否则移动端内容超出会被 clip 截断且无法滚动 */
  overflow-x: clip;
}

/* ── 开屏空态:金字塔构图 —— 日期胶囊/大标题/主按钮居中,学科卡 3×2 阵列收底 ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.875rem;
  min-height: min(37.5rem, calc(100dvh - 13.75rem));
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
  padding: 0.4375rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 62.4375rem;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.empty-hero-title {
  margin: 1.25rem 0 0;
  color: #f5f5f5;
  font-size: clamp(2rem, 3.4vw, 2.875rem);
  font-weight: 800;
  line-height: 1.15;
}

/* 细线分隔语:给主按钮与学科阵列一段呼吸 */
.empty-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 47.5rem;
  color: rgba(255, 255, 255, 0.34);
  font-size: 0.7813rem;
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
  gap: 1rem;
  width: 100%;
  max-width: 47.5rem;
}

.populated-board {
  animation: fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

/* ── 复制到今天确认 / 409 冲突裁决对话框 ── */
.copy-confirm-card {
  width: 100%;
  max-width: 26.25rem;
  padding: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  background: #171717;
  box-shadow: 0 1.5rem 3.5rem rgba(0, 0, 0, 0.32);
}

.copy-confirm-title {
  color: #f1f1f1;
  font-size: 1.0625rem;
  font-weight: 800;
}

.copy-confirm-text {
  margin: 0.625rem 0 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 0.875rem;
  line-height: 1.6;
}

.copy-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  margin-top: 1.125rem;
}

/* 覆盖 shadcn Button 默认盒模型：选择器前缀让特异性高于 Tailwind 单类工具类 */
.copy-confirm-card .copy-confirm-cancel {
  height: auto;
  min-height: 2.5rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: none;
}

.copy-confirm-card .copy-confirm-cancel:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
}

.copy-confirm-card .copy-confirm-solid {
  height: auto;
  min-height: 2.5rem;
  padding: 0 1.25rem;
  border: 0;
  border-radius: 0.625rem;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 800;
  box-shadow: none;
}

.copy-confirm-card .copy-confirm-solid:hover {
  background: #ffffff;
  color: #121212;
}

/* ── 随机点名 ── */
.pick-card {
  width: 92%;
  max-width: 40rem;
  padding: 1.375rem 1.375rem 1.125rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  background: #171717;
  box-shadow: 0 1.5rem 3.5rem rgba(0, 0, 0, 0.32);
  text-align: center;
}

.pick-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #f1f1f1;
  font-size: 1.0625rem;
  font-weight: 800;
}

.pick-head-icon {
  width: 1.375rem;
  height: 1.375rem;
}

.roster-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 0.625rem;
  max-height: 52vh;
  margin-top: 1rem;
  overflow-y: auto;
  scrollbar-width: none;
}

.roster-grid::-webkit-scrollbar {
  display: none;
}

.roster-chip {
  min-width: 4.75rem;
  padding: 0.5625rem 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.625rem;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.4;
}

.pick-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.625rem;
}

.pick-name {
  min-height: 7.5rem;
  color: #f5f5f5;
  font-size: clamp(3.5rem, 14vw, 5.5rem);
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: 0.06em;
}

/* 定格弹跳：滚动停下后收尾一次，滚动中不触发 */
.pick-landed .pick-name {
  animation: pick-land 0.45s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.pick-hint {
  min-height: 1.375rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.14em;
}

.pick-count {
  margin-top: 0.25rem;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.8125rem;
}

.pick-actions {
  display: flex;
  justify-content: center;
  gap: 0.625rem;
  margin-top: 1.125rem;
}

.pick-card .pick-ghost {
  height: auto;
  min-height: 2.75rem;
  padding: 0 1.125rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: none;
}

.pick-card .pick-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
}

.pick-card .pick-solid {
  height: auto;
  min-height: 2.75rem;
  padding: 0 1.625rem;
  border: 0;
  border-radius: 0.75rem;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 800;
  box-shadow: none;
}

.pick-card .pick-solid:hover {
  background: #ffffff;
  color: #121212;
}

.pick-card .pick-solid:disabled {
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
  from { opacity: 0; transform: translateY(0.75rem); }
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
    padding-inline: 1.5rem;
  }
}

@media (max-width: 700px) {
  .date-pill,
  .identity-pill {
    display: none;
  }

  .empty-quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .board-container {
    padding: 1rem 0.875rem calc(6.625rem + var(--sab, 0px));
  }

  /* 移动端空态：标题与卡片阵列收拢，避免首屏滚动 */
  .empty-state {
    gap: 1.375rem;
    min-height: min(32.5rem, calc(100dvh - 12.5rem));
  }

  .empty-hero-title {
    margin-top: 0.875rem;
    font-size: clamp(1.625rem, 7vw, 2.125rem);
  }

  .empty-divider {
    font-size: 0.7188rem;
  }

  .empty-quick-grid {
    gap: 0.75rem;
  }
}

@media (max-width: 380px) {
  .copy-confirm-actions {
    flex-direction: column;
  }

  .copy-confirm-card .copy-confirm-cancel,
  .copy-confirm-card .copy-confirm-solid {
    width: 100%;
    min-height: 2.75rem;
  }

  .pick-actions {
    flex-direction: column;
  }

  .pick-card .pick-ghost,
  .pick-card .pick-solid {
    width: 100%;
    min-height: 3rem;
  }
}
</style>
