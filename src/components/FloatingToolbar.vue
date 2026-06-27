<template>
  <div class="floating-toolbar-container">
    <v-card
      class="floating-toolbar"
      elevation="0"
    >
      <div class="toolbar-buttons">
        <v-btn
          icon="mdi-chevron-left"
          variant="text"
          title="前一天"
          @click="$emit('prev-day')"
        />
        <v-btn
          icon="mdi-format-font-size-decrease"
          variant="text"
          :title="`缩小字体（当前 ${currentFontSize}px）`"
          @click="$emit('zoom', 'out')"
        />
        <div class="font-size-indicator">
          {{ currentFontSize }}px
        </div>
        <v-btn
          icon="mdi-format-font-size-increase"
          variant="text"
          :title="`放大字体（当前 ${currentFontSize}px）`"
          @click="$emit('zoom', 'up')"
        />

        <v-menu
          v-model="fontMenuOpen"
          :close-on-content-click="false"
          location="top center"
          width="320"
        >
          <template #activator="{ props }">
            <v-btn
              icon="mdi-format-font"
              variant="text"
              :title="`字体：${currentFontName}`"
              v-bind="props"
            />
          </template>

          <div class="font-panel">
            <div class="font-panel-header">
              <div class="font-panel-title">
                选择字体
              </div>
            </div>

            <div
              v-for="(fonts, category) in fontCategories"
              :key="category"
              class="font-category"
            >
              <div class="category-label">
                {{ getCategoryLabel(category) }}
              </div>
              <div class="font-grid">
                <button
                  v-for="font in fonts"
                  :key="font.id"
                  type="button"
                  class="font-card"
                  :class="{ 'font-card-active': currentFontId === font.id }"
                  @click="changeFont(font.id)"
                >
                  <span
                    class="font-card-preview"
                    :style="{ fontFamily: font.fontFamily }"
                  >Aa</span>
                  <span class="font-card-copy">
                    <span class="font-card-name">{{ font.name }}</span>
                    <span class="font-card-desc">{{ font.description }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </v-menu>

        <v-menu
          :close-on-content-click="false"
          location="top"
        >
          <template #activator="{ props }">
            <v-btn
              icon="mdi-calendar-month-outline"
              variant="text"
              title="选择日期"
              v-bind="props"
            />
          </template>
          <v-card
            class="date-picker-card"
            border
          >
            <v-date-picker
              :model-value="selectedDate"
              color="primary"
              @update:model-value="handleDateSelect"
            />
          </v-card>
        </v-menu>

        <v-btn
          v-if="!isToday"
          icon="mdi-chevron-right"
          variant="text"
          title="后一天"
          @click="$emit('next-day')"
        />
      </div>
    </v-card>

    <v-btn
      v-if="!isToday"
      class="side-action-btn"
      color="grey-darken-3"
      elevation="0"
      prepend-icon="mdi-content-copy"
      rounded="lg"
      :loading="copyToTodayLoading"
      :disabled="copyToTodayLoading"
      @click="$emit('copy-to-today')"
    >
      复制到今天
    </v-btn>
  </div>
</template>

<script>
import {
  getCurrentFont,
  getFontsByCategory,
  onFontChange,
  setFont,
} from "@/utils/fonts";

const FONT_CATEGORY_LABELS = { system: "系统", modern: "现代", serif: "衬线", mono: "等宽" };

export default {
  name: "FloatingToolbar",
  props: {
    selectedDate: { type: [String, Date], required: true },
    isToday: { type: Boolean, required: true },
    copyToTodayLoading: { type: Boolean, default: false },
    currentFontSize: { type: Number, default: 16 },
  },
  emits: ["prev-day", "next-day", "zoom", "date-select", "copy-to-today"],
  data() {
    return {
      fontMenuOpen: false,
      fontCategories: {},
      currentFontId: "system",
      currentFontName: "系统默认",
      unsubscribeFontChange: null,
    };
  },
  created() {
    const font = getCurrentFont();
    this.syncFontState({
      currentFontId: font.id,
      currentFontName: font.name,
      fontCategories: getFontsByCategory(),
    });
    this.unsubscribeFontChange = onFontChange((font) => {
      this.syncFontState({
        currentFontId: font.id,
        currentFontName: font.name,
        fontCategories: getFontsByCategory(),
      });
    });
  },
  beforeUnmount() {
    this.unsubscribeFontChange?.();
  },
  methods: {
    syncFontState(state) {
      this.fontCategories = state.fontCategories;
      this.currentFontId = state.currentFontId;
      this.currentFontName = state.currentFontName;
    },
    handleDateSelect(date) {
      this.$emit("date-select", date);
    },
    getCategoryLabel(category) {
      return FONT_CATEGORY_LABELS[category] || category;
    },
    async changeFont(fontId) {
      await setFont(fontId);
      this.fontMenuOpen = false;
    },
  },
};
</script>

<style scoped>
.floating-toolbar-container {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  pointer-events: none;
}

.floating-toolbar {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  padding: 10px 12px;
  border-radius: 8px !important;
  pointer-events: auto;
  backdrop-filter: blur(10px);
  background: rgba(20, 20, 20, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  animation: toolbar-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease;
}

.floating-toolbar:hover {
  transform: translateX(-50%) translateY(-1px);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
}

.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-buttons :deep(.v-btn) {
  min-width: 42px;
  width: 42px;
  height: 42px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.82);
}

.toolbar-buttons :deep(.v-btn:hover) {
  background: rgba(255, 255, 255, 0.06);
}

.font-size-indicator {
  min-width: 68px;
  text-align: center;
  color: rgba(255, 255, 255, 0.76);
  font-size: 14px;
  font-weight: 700;
}

.side-action-btn {
  position: absolute;
  right: 20px;
  bottom: 20px;
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f1f1f1 !important;
  background: #1d1d1d !important;
  border-radius: 8px !important;
  min-height: 44px;
  padding-inline: 16px !important;
  animation: float-in 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.date-picker-card {
  overflow: hidden;
  border-radius: 8px !important;
  background: #181818 !important;
}

.font-panel {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #181818;
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.18);
}

.font-panel-header {
  margin-bottom: 12px;
}

.font-panel-title {
  color: #f0f0f0;
  font-size: 15px;
  font-weight: 700;
}

.font-category + .font-category {
  margin-top: 10px;
}

.category-label {
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 600;
}

.font-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.font-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: #202020;
  color: #ededed;
  text-align: left;
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.font-card:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: #262626;
}

.font-card-active {
  border-color: rgba(176, 192, 222, 0.38);
  background: #262a31;
}

.font-card-preview {
  width: 30px;
  flex: 0 0 auto;
  color: #f4f4f4;
  font-size: 16px;
  font-weight: 700;
}

.font-card-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.font-card-name {
  color: #f1f1f1;
  font-size: 13px;
  font-weight: 700;
}

.font-card-desc {
  color: rgba(255, 255, 255, 0.48);
  font-size: 11px;
}

@keyframes toolbar-rise {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes float-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 700px) {
  .floating-toolbar {
    bottom: 12px;
    max-width: calc(100vw - 20px);
  }

  .toolbar-buttons {
    gap: 4px;
  }

  .toolbar-buttons :deep(.v-btn) {
    min-width: 38px;
    width: 38px;
    height: 38px;
  }

  .font-size-indicator {
    min-width: 56px;
    font-size: 13px;
  }

  .side-action-btn {
    right: 14px;
    bottom: 70px;
  }
}
</style>
