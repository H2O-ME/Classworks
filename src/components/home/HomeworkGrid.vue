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
              :style="{ '--card-delay': `${columnIndex * 56 + itemIndex * 42}ms` }"
              @click="handleCardClick(item.key)"
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
      class="subject-quick-add"
    >
      <div class="subject-quick-add-surface">
        <div class="subject-quick-add-header">
          <div class="subject-quick-add-mark">
            <v-icon
              icon="mdi-plus"
              size="16"
            />
          </div>
          <div class="subject-quick-add-title">
            继续添加
          </div>
          <div class="subject-quick-add-count">
            {{ unusedSubjects.length }} 科
          </div>
        </div>

        <div class="subject-quick-add-list">
          <button
            v-for="(subject, index) in unusedSubjects"
            :key="subject.name"
            type="button"
            class="subject-quick-add-button"
            :style="{ '--quick-delay': `${index * 34}ms` }"
            @click="handleCardClick(subject.name)"
          >
            <span>{{ subject.name }}</span>
            <v-icon
              icon="mdi-plus"
              size="15"
            />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: "HomeworkGrid",
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

.subject-quick-add {
  position: relative;
  z-index: 1;
  margin-top: 8px;
  animation: section-enter 0.38s ease;
}

.subject-quick-add-surface {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.012)), rgba(21, 21, 21, 0.95);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
}

.subject-quick-add-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 210px;
}

.subject-quick-add-mark {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #202020;
  color: rgba(255, 255, 255, 0.72);
}

.subject-quick-add-title {
  color: #f1f1f1;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
}

.subject-quick-add-count {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  font-weight: 700;
}

.subject-quick-add-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 9px;
}

.subject-quick-add-button {
  display: inline-flex;
  width: 100%;
  min-width: 0;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #1f1f1f;
  color: #ededed;
  font-weight: 700;
  opacity: 0;
  transform: translateY(8px);
  animation: quick-button-enter 0.32s ease forwards;
  animation-delay: var(--quick-delay, 0ms);
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.subject-quick-add-button:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.13);
  background: #262626;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes section-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes quick-button-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .homework-card,
  .subject-quick-add,
  .subject-quick-add-button,
  .content-updated .content-line {
    animation: none;
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 980px) {
  .subject-quick-add-surface {
    grid-template-columns: 1fr;
  }

  .subject-quick-add-header {
    min-width: 0;
  }
}

@media (max-width: 760px) {
  .board-section {
    padding-bottom: 104px;
  }

  .masonry-board.columns-2,
  .masonry-board.columns-3,
  .masonry-board.columns-4 {
    grid-template-columns: 1fr;
  }
}
</style>
