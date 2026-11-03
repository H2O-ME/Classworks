<template>
  <div class="board-section">
    <div class="board-main-pane">
      <div
        class="masonry-board"
        :class="`columns-${columnCountValue}`"
      >
        <div
          v-for="(column, columnIndex) in columns"
          :key="`column-${columnIndex}`"
          class="masonry-column"
        >
          <div class="masonry-column-inner">
            <article
              v-for="(item, itemIndex) in column"
              :key="item.key"
              :data-key="item.key"
              class="homework-card"
              :class="{ 'homework-card-readonly': !isEditable(item.key) }"
              :role="isEditable(item.key) ? 'button' : undefined"
              :tabindex="isEditable(item.key) ? 0 : undefined"
              :aria-label="isEditable(item.key) ? `编辑${item.name}作业` : undefined"
              :style="{ '--card-delay': `${columnIndex * 56 + itemIndex * 42}ms` }"
              @click="handleCardClick(item.key)"
              @keydown.enter="handleCardClick(item.key)"
              @keydown.space.prevent="handleCardClick(item.key)"
            >
              <header class="homework-card-header">
                <div class="homework-card-subject">
                  {{ item.name }}
                </div>
                <i-mdi-pencil-outline
                  v-if="isEditable(item.key)"
                  class="homework-card-pencil"
                />
              </header>

              <div
                class="homework-card-content"
                :class="{ 'content-updated': updatedKeys?.includes(item.key) }"
                :style="contentStyle"
              >
                <div
                  v-for="(line, lineIndex) in formatContent(item.content)"
                  :key="`${item.key}-${lineIndex}`"
                  class="content-line"
                >
                  {{ line }}
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>

    <!-- 独立添加入口：单行幽灵胶囊，不进作业卡网格；只列当前身份能写的科目 -->
    <section
      v-if="editableAdditions.length"
      class="subject-add-tiles"
      aria-label="添加学科作业"
    >
      <SubjectAddCard
        v-for="(subject, index) in editableAdditions"
        :key="subject.name"
        :subject="subject"
        :style="{ '--tile-delay': `${index * 40}ms` }"
        @add="emit('open-dialog', subject.name)"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
import SubjectAddCard from "./SubjectAddCard.vue";
import { balance, columnCount } from "./masonry.js";

const props = defineProps({
  sortedItems: { type: Array, required: true },
  unusedSubjects: { type: Array, required: true },
  contentStyle: { type: Object, default: () => ({}) },
  updatedKeys: { type: Array, default: () => [] },
  // 当前身份可写的科目；空数组=只读（学生看到的就是这个）
  editableSubjects: { type: Array, default: () => [] },
});
const emit = defineEmits(["open-dialog"]);

const viewportWidth = ref(typeof window === "undefined" ? 1200 : window.innerWidth);

const columnCountValue = computed(() => columnCount(viewportWidth.value));

// 真实卡高：估算法（按字数）在字号调大、英文长句、自动换行时全错，
// 实测最高列能差出 300px。改成渲染后量一次 offsetHeight 再重排列。
const measured = ref({});

function measureCards() {
  if (typeof document === "undefined") return;
  const next = {};
  for (const node of document.querySelectorAll(".homework-card[data-key]")) {
    const height = node.offsetHeight;
    // 布局/字体未就位时会量到 0：0 会让 cardHeight 落回估算值，整版退化成等高切分
    if (height > 0) next[node.dataset.key] = height;
  }
  // 高度没变就别写 ref，避免测量 → 重排 → 再测量的死循环
  const keys = Object.keys(next);
  const same =
    keys.length === Object.keys(measured.value).length &&
    keys.every((key) => measured.value[key] === next[key]);
  if (!same) measured.value = next;
}

const columns = computed(() =>
  balance(props.sortedItems, columnCountValue.value, cardHeight),
);

// 没量到之前用一个保守估计，量到之后一律用实测值
function cardHeight(item) {
  return measured.value[item.key] || 96 + 220;
}
const editableAdditions = computed(() =>
  props.unusedSubjects.filter((subject) => props.editableSubjects.includes(subject.name)),
);

function isEditable(subject) {
  return props.editableSubjects.includes(subject);
}

function handleResize() {
  viewportWidth.value = window.innerWidth;
  measureCards();
}

onMounted(() => {
  window.addEventListener("resize", handleResize);
  measureCards();
  // 挂载那一帧布局/字体可能还没稳定：隔两帧再补测一次（有变化才写 ref，不会死循环）
  requestAnimationFrame(() => requestAnimationFrame(measureCards));
  // 网页字体异步到达会改变字宽/换行 → 卡高变，但字体 swap 不触发 Vue 重渲染，必须自己补测
  document.fonts?.ready.then(measureCards).catch(() => null);
  document.fonts?.addEventListener?.("loadingdone", measureCards);
});

// 内容/字号/视口一变，卡高就变了：量一次再重排列（测量值不变时不会触发更新，不死循环）
onUpdated(measureCards);
watch(() => props.contentStyle, measureCards, { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  document.fonts?.removeEventListener?.("loadingdone", measureCards);
});

function handleCardClick(key) {
  if (!isEditable(key)) return;
  emit("open-dialog", key);
}

function formatContent(content) {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
</script>

<style scoped>
.board-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-bottom: 7rem;
}

.board-main-pane {
  min-width: 0;
  flex: 0 1 auto;
}

.masonry-board {
  display: grid;
  gap: 1.125rem;
  align-items: start;
}

.masonry-board.columns-1 { grid-template-columns: 1fr; }
.masonry-board.columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.masonry-board.columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.masonry-column,
.masonry-column-inner {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.homework-card {
  position: relative;
  overflow: hidden;
  padding: 1.125rem 1.125rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5625rem;
  background: #191919;
  box-shadow: 0 0.625rem 1.375rem rgba(0, 0, 0, 0.1);
  cursor: pointer;
  opacity: 0;
  transform: translateY(0.75rem);
  animation: card-enter 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--card-delay, 0ms);
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.22s ease,
    border-color 0.22s ease,
    background-color 0.22s ease;
}

.homework-card:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.12);
  background: #1f1f1f;
  box-shadow: 0 0.875rem 1.625rem rgba(0, 0, 0, 0.14);
}

/* 键盘聚焦可见反馈：沿用蓝灰主色，不破坏卡片形态 */
.homework-card:focus-visible {
  outline: 0.125rem solid rgba(174, 191, 221, 0.6);
  outline-offset: 1px;
}

/* 只读态：卡片不可点、不动效，正文可选中复制 */
.homework-card-readonly {
  cursor: default;
}

.homework-card-readonly:hover {
  transform: none;
  border-color: rgba(255, 255, 255, 0.08);
  background: #191919;
  box-shadow: 0 0.625rem 1.375rem rgba(0, 0, 0, 0.1);
}

.homework-card-readonly .homework-card-content {
  user-select: text;
  -webkit-user-select: text;
}

.content-updated .content-line {
  animation: content-line-update 0.9s ease-out;
}

@keyframes content-line-update {
  0% {
    background-color: rgba(168, 191, 220, 0.16);
    border-radius: 0.1875rem;
    transform: translateY(0.125rem);
  }
  100% {
    background-color: transparent;
    transform: translateY(0);
  }
}

.homework-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.homework-card-subject {
  min-width: 0;
  color: #f3f3f3;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
}

.homework-card-pencil {
  width: 0.9375rem;
  height: 0.9375rem;
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.55);
}

.homework-card-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  /* 段距由页面注入 --line-gap（em，跟随字号缩放）；默认 0.625rem 与旧行为一致 */
  gap: var(--line-gap, 0.625rem);
  line-height: inherit;
}

.content-line {
  color: rgba(255, 255, 255, 0.78);
  word-break: break-word;
  white-space: pre-wrap;
}

/* 独立添加入口：单行幽灵胶囊，不进作业卡网格，明显更小更弱 */
.subject-add-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(0.75rem); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .homework-card,
  .content-updated .content-line {
    animation: none;
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 760px) {
  .board-section {
    padding-bottom: calc(6.5rem + var(--sab, 0px));
  }

  .masonry-board.columns-2,
  .masonry-board.columns-3 {
    grid-template-columns: 1fr;
  }

  .masonry-board {
    gap: 0.75rem;
  }

  .homework-card {
    padding: 0.875rem 0.875rem 0.75rem;
  }

  .homework-card-subject {
    font-size: 0.9063rem;
  }

  .homework-card-content {
    gap: 0.5rem;
    line-height: 1.65;
  }

  .subject-add-tiles {
    gap: 0.375rem;
  }
}
</style>
