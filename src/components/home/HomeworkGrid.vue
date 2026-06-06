<template>
  <div ref="gridContainer" class="grid-masonry">
    <TransitionGroup name="grid">
      <div
        v-for="item in sortedItems"
        :key="item.key"
        ref="items"
        class="grid-item"
        :style="{ order: item.order }"
      >
        <v-card
          class="modern-homework-card"
          elevation="0"
          border
          @click="handleCardClick(item.key)"
          @mousemove="handlePointerMove"
          @touchmove="handleTouchMove"
        >
          <div class="card-header-simple">
            <h3 class="subject-title-simple">{{ item.name }}</h3>
            <v-icon
              :icon="item.type === 'custom' ? 'mdi-card-text-outline' : 'mdi-pencil-outline'"
              size="18"
              class="edit-icon"
              color="medium-emphasis"
            />
          </div>

          <v-card-text :style="contentStyle" class="card-content-simple">
            <div class="content-text">
              <div
                v-for="(line, lineIndex) in formatContent(item.content)"
                :key="`${item.key}-${lineIndex}`"
                class="content-line"
              >
                {{ line }}
              </div>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </TransitionGroup>
  </div>

  <div class="empty-subjects-modern">
    <div class="empty-subjects-header">
      <v-icon icon="mdi-plus-circle-outline" size="20" color="primary" class="mr-2" />
      <span class="empty-subjects-title">添加更多学科</span>
    </div>

    <div v-if="isMobile" class="empty-subjects-mobile">
      <v-chip
        v-for="subject in unusedSubjects"
        :key="subject.name"
        class="ma-1 modern-empty-chip"
        color="primary"
        variant="tonal"
        size="large"
        @click="handleCardClick(subject.name)"
      >
        <v-icon start size="small">mdi-plus</v-icon>
        {{ subject.name }}
      </v-chip>
    </div>

    <template v-else-if="emptySubjectDisplay === 'button'">
      <div class="empty-subjects-buttons-grid">
        <button
          v-for="(subject, index) in unusedSubjects"
          :key="subject.name"
          type="button"
          class="modern-empty-btn"
          :class="`empty-btn-${index % 5}`"
          @click="handleCardClick(subject.name)"
        >
          <v-icon icon="mdi-plus" size="20" class="btn-icon" />
          <span class="btn-text">{{ subject.name }}</span>
          <span class="btn-hint">点击添加</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script>
export default {
  name: "HomeworkGrid",
  props: {
    sortedItems: {
      type: Array,
      required: true,
    },
    unusedSubjects: {
      type: Array,
      required: true,
    },
    emptySubjectDisplay: {
      type: String,
      default: "button",
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    isEditingDisabled: {
      type: Boolean,
      default: false,
    },
    contentStyle: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: ["open-dialog", "disabled-click"],
  mounted() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeAllGridItems();
    });

    if (this.$refs.gridContainer) {
      this.resizeObserver.observe(this.$refs.gridContainer);
    }

    this.$nextTick(() => {
      this.resizeAllGridItems();
      this.observeItems();
    });
  },
  updated() {
    this.$nextTick(() => {
      this.resizeAllGridItems();
      this.observeItems();
    });
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
  },
  methods: {
    observeItems() {
      if (!this.$refs.items) {
        return;
      }

      this.$refs.items.forEach((item) => {
        if (item.firstElementChild) {
          this.resizeObserver.observe(item.firstElementChild);
        }
      });
    },
    resizeGridItem(item) {
      const grid = this.$refs.gridContainer;
      const content = item?.firstElementChild;
      if (!grid || !content) {
        return;
      }

      const rowHeight = parseInt(window.getComputedStyle(grid).getPropertyValue("grid-auto-rows"), 10);
      const rowGap = parseInt(window.getComputedStyle(grid).getPropertyValue("gap"), 10);
      const contentHeight = content.getBoundingClientRect().height;
      const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap));
      item.style.gridRowEnd = `span ${rowSpan}`;
    },
    resizeAllGridItems() {
      this.$refs.items?.forEach((item) => this.resizeGridItem(item));
    },
    handleCardClick(key) {
      if (this.isEditingDisabled) {
        this.$emit("disabled-click");
        return;
      }

      this.$emit("open-dialog", key);
    },
    formatContent(content) {
      if (!content) {
        return [];
      }

      return content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    },
    handlePointerMove(event) {
      const card = event.currentTarget;
      const rect = card.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--x", `${x}%`);
      card.style.setProperty("--y", `${y}%`);
    },
    handleTouchMove(event) {
      if (event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const card = event.currentTarget;
      const rect = card.getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 100;
      const y = ((touch.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--x", `${x}%`);
      card.style.setProperty("--y", `${y}%`);
    },
  },
};
</script>

<style scoped>
.modern-homework-card {
  border-radius: 16px !important;
  transition: all 0.3s ease !important;
  overflow: hidden;
  background: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12) !important;
}

.modern-homework-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border-color: rgba(var(--v-theme-primary), 0.25) !important;
}

.card-header-simple {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}

.subject-title-simple {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.edit-icon {
  opacity: 0.5;
  transition: all 0.25s ease;
}

.modern-homework-card:hover .edit-icon {
  opacity: 1;
  color: rgb(var(--v-theme-primary)) !important;
}

.card-content-simple {
  padding: 8px 16px 12px !important;
}

.content-text {
  line-height: 1.65;
}

.content-line {
  padding: 4px 0;
  color: rgba(var(--v-theme-on-surface), 0.9);
  word-break: break-word;
}

.content-line:not(:last-child) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.empty-subjects-modern {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.empty-subjects-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 8px;
}

.empty-subjects-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.empty-subjects-buttons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  padding: 0 8px;
}

.modern-empty-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 18px 16px;
  background: rgba(var(--v-theme-surface), 0.92);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.modern-empty-btn:hover {
  transform: translateY(-3px);
  border-color: rgba(var(--v-theme-primary), 0.3);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.1);
}

.btn-icon {
  color: rgb(var(--v-theme-primary));
}

.btn-text {
  font-size: 1rem;
  font-weight: 700;
}

.btn-hint {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-medium-emphasis));
}

.empty-subjects-mobile {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 0 8px;
}

@media (max-width: 768px) {
  .card-header-simple {
    padding: 10px 14px 6px;
  }

  .card-content-simple {
    padding: 6px 14px 10px !important;
  }
}
</style>
