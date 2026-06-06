<template>
  <div class="floating-toolbar-container">
    <v-card class="floating-toolbar" elevation="4" rounded="xl">
      <div class="toolbar-buttons">
        <v-btn icon="mdi-chevron-left" variant="text" title="前一天" @click="$emit('prev-day')" />
        <v-btn
          icon="mdi-format-font-size-decrease"
          variant="text"
          :title="`缩小字体（当前 ${currentFontSize}px）`"
          @click="$emit('zoom', 'out')"
        />
        <v-btn
          icon="mdi-format-font-size-increase"
          variant="text"
          :title="`放大字体（当前 ${currentFontSize}px）`"
          @click="$emit('zoom', 'up')"
        />

        <v-menu v-model="fontMenuOpen" :close-on-content-click="false" location="top center" width="360">
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
              <div class="font-panel-title">选择字体</div>
              <div class="font-current-label">{{ currentFontName }}</div>
            </div>

            <div v-for="(fonts, category) in fontCategories" :key="category" class="font-category">
              <div class="category-label">{{ getCategoryLabel(category) }}</div>
              <div class="font-grid">
                <button
                  v-for="font in fonts"
                  :key="font.id"
                  type="button"
                  class="font-card"
                  :class="{ 'font-card-active': currentFontId === font.id }"
                  @click="changeFont(font.id)"
                >
                  <span class="font-card-preview" :style="{ fontFamily: font.fontFamily }">Aa</span>
                  <span class="font-card-info">
                    <span class="font-card-name">{{ font.name }}</span>
                    <span class="font-card-desc">{{ font.description }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </v-menu>

        <v-menu :close-on-content-click="false" location="top">
          <template #activator="{ props }">
            <v-btn icon="mdi-calendar" variant="text" title="选择日期" v-bind="props" />
          </template>
          <v-card class="date-picker-card" border>
            <v-date-picker :model-value="selectedDate" color="primary" @update:model-value="handleDateSelect" />
          </v-card>
        </v-menu>

        <v-btn v-if="!isToday" icon="mdi-chevron-right" variant="text" title="后一天" @click="$emit('next-day')" />
      </div>
    </v-card>

    <v-btn
      v-if="!isToday"
      class="side-action-btn"
      color="primary"
      elevation="4"
      prepend-icon="mdi-content-copy"
      rounded="xl"
      :loading="copyToTodayLoading"
      :disabled="copyToTodayLoading"
      @click="$emit('copy-to-today')"
    >
      复制到今天
    </v-btn>
  </div>
</template>

<script>
export default {
  name: "FloatingToolbar",
  props: {
    selectedDate: { type: [String, Date], required: true },
    isToday: { type: Boolean, required: true },
    copyToTodayLoading: { type: Boolean, default: false },
    currentFontSize: { type: Number, default: 16 },
  },
  data() {
    return {
      fontMenuOpen: false,
      fontCategories: {},
      currentFontId: "system",
      currentFontName: "系统默认",
      unsubscribeFontChange: null,
    };
  },
  async created() {
    const { getCurrentFont, getFontsByCategory, onFontChange } = await import("@/utils/fonts");
    const currentFont = getCurrentFont();

    this.fontCategories = getFontsByCategory();
    this.currentFontId = currentFont.id;
    this.currentFontName = currentFont.name;
    this.unsubscribeFontChange = onFontChange((font) => {
      this.currentFontId = font.id;
      this.currentFontName = font.name;
    });
  },
  beforeUnmount() {
    this.unsubscribeFontChange?.();
  },
  methods: {
    handleDateSelect(date) {
      this.$emit("date-select", date);
    },
    getCategoryLabel(category) {
      return {
        system: "系统",
        modern: "现代",
        serif: "衬线",
        mono: "等宽",
      }[category] || category;
    },
    async changeFont(fontId) {
      const { setFont } = await import("@/utils/fonts");
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
  bottom: 24px;
  transform: translateX(-50%);
  padding: 4px 6px;
  pointer-events: auto;
  backdrop-filter: blur(14px);
  background: rgba(255, 255, 255, 0.84) !important;
}

.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.side-action-btn {
  position: absolute;
  right: 24px;
  bottom: 24px;
  pointer-events: auto;
}

.date-picker-card {
  overflow: hidden;
}

.font-panel {
  background: rgb(var(--v-theme-surface));
  padding: 16px;
  border-radius: 16px;
}

.font-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.font-panel-title {
  font-size: 16px;
  font-weight: 700;
}

.font-current-label {
  font-size: 12px;
  color: rgb(var(--v-theme-primary));
}

.font-category + .font-category {
  margin-top: 12px;
}

.category-label {
  font-size: 12px;
  margin-bottom: 8px;
  color: rgb(var(--v-theme-medium-emphasis));
}

.font-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.font-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  background: rgba(var(--v-theme-surface-variant), 0.28);
  cursor: pointer;
  text-align: left;
}

.font-card-active {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.08);
}

.font-card-preview {
  min-width: 32px;
  font-size: 18px;
  font-weight: 700;
}

.font-card-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.font-card-name {
  font-size: 13px;
  font-weight: 600;
}

.font-card-desc {
  font-size: 12px;
  color: rgb(var(--v-theme-medium-emphasis));
}

@media (max-width: 600px) {
  .floating-toolbar {
    bottom: 16px;
    max-width: calc(100vw - 24px);
  }

  .side-action-btn {
    right: 16px;
    bottom: 84px;
  }
}
</style>
