<template>
  <div class="board-section">
    <div class="board-main-pane">
      <div
        class="masonry-board"
        :class="`columns-${columnCount}`"
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
              class="homework-card"
              role="button"
              tabindex="0"
              :aria-label="`编辑${item.name}作业`"
              :style="{ '--card-delay': `${columnIndex * 56 + itemIndex * 42}ms` }"
              @click="handleCardClick(item.key)"
              @keydown.enter="handleCardClick(item.key)"
              @keydown.space.prevent="handleCardClick(item.key)"
            >
              <header class="homework-card-header">
                <div class="homework-card-subject">
                  {{ item.name }}
                </div>
                <v-icon
                  icon="mdi-pencil-outline"
                  size="15"
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

    <section
      v-if="unusedSubjects.length"
      class="subject-add-tiles"
      aria-label="添加学科作业"
    >
      <SubjectAddCard
        v-for="(subject, index) in unusedSubjects"
        :key="subject.name"
        :subject="subject"
        :style="{ '--tile-delay': `${index * 40}ms` }"
        @add="handleCardClick(subject.name)"
      />
    </section>
  </div>
</template>

<script>
import SubjectAddCard from "./SubjectAddCard.vue";

export default {
  name: "HomeworkGrid",
  components: { SubjectAddCard },
  props: {
    sortedItems: { type: Array, required: true },
    unusedSubjects: { type: Array, required: true },
    contentStyle: { type: Object, default: () => ({}) },
    updatedKeys: { type: Array, default: () => [] },
  },
  emits: ["open-dialog"],
  data() {
    return {
      viewportWidth: typeof window === "undefined" ? 1200 : window.innerWidth,
    };
  },
  computed: {
    columnCount() {
      if (this.viewportWidth < 760) return 1;
      if (this.viewportWidth < 1240) return 2;
      if (this.viewportWidth < 1680) return 3;
      return 4;
    },
    columns() {
      const columns = Array.from({ length: this.columnCount }, () => []);
      const columnHeights = new Array(this.columnCount).fill(0);

      for (const item of this.sortedItems) {
        let targetColumn = 0;
        for (let index = 1; index < columnHeights.length; index += 1) {
          if (columnHeights[index] < columnHeights[targetColumn]) {
            targetColumn = index;
          }
        }
        columns[targetColumn].push(item);
        columnHeights[targetColumn] += this.estimateCardHeight(item);
      }

      return columns;
    },
  },
  mounted() {
    window.addEventListener("resize", this.handleResize);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.handleResize);
  },
  methods: {
    handleResize() {
      this.viewportWidth = window.innerWidth;
    },
    handleCardClick(key) {
      this.$emit("open-dialog", key);
    },
    formatContent(content) {
      return String(content || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    },
    estimateCardHeight(item) {
      const lines = this.formatContent(item.content);
      const textUnits = lines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 14)), 0);
      return 96 + textUnits * 20;
    },
  },
};
</script>

<style scoped>
.board-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 112px;
}

.board-main-pane {
  min-width: 0;
  flex: 0 1 auto;
}

.masonry-board {
  display: grid;
  gap: 18px;
  align-items: start;
}

.masonry-board.columns-1 { grid-template-columns: 1fr; }
.masonry-board.columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.masonry-board.columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.masonry-board.columns-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

.masonry-column,
.masonry-column-inner {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.homework-card {
  position: relative;
  overflow: hidden;
  padding: 18px 18px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  background: #191919;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  opacity: 0;
  transform: translateY(12px);
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
  box-shadow: 0 14px 26px rgba(0, 0, 0, 0.14);
}

/* 键盘聚焦可见反馈：沿用蓝灰主色，不破坏卡片形态 */
.homework-card:focus-visible {
  outline: 2px solid rgba(174, 191, 221, 0.6);
  outline-offset: 1px;
}

.content-updated .content-line {
  animation: content-line-update 0.9s ease-out;
}

@keyframes content-line-update {
  0% {
    background-color: rgba(168, 191, 220, 0.16);
    border-radius: 3px;
    transform: translateY(2px);
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
  gap: 12px;
  margin-bottom: 12px;
}

.homework-card-subject {
  min-width: 0;
  color: #f3f3f3;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
}

.homework-card-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  line-height: 1.7;
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
  gap: 8px;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(12px); }
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
    padding-bottom: calc(104px + var(--sab, 0px));
  }

  .masonry-board.columns-2,
  .masonry-board.columns-3,
  .masonry-board.columns-4 {
    grid-template-columns: 1fr;
  }

  .masonry-board {
    gap: 12px;
  }

  .homework-card {
    padding: 14px 14px 12px;
  }

  .homework-card-subject {
    font-size: 14.5px;
  }

  .homework-card-content {
    gap: 8px;
    line-height: 1.65;
  }

  .subject-add-tiles {
    gap: 6px;
  }
}
</style>
