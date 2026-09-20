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
              @update:model-value="$emit('date-select', $event)"
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
        <v-btn
          icon="mdi-account-question-outline"
          variant="text"
          title="随机点名"
          @click="$emit('pick-student')"
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
export default {
  name: "FloatingToolbar",
  props: {
    selectedDate: { type: [String, Date], required: true },
    isToday: { type: Boolean, required: true },
    copyToTodayLoading: { type: Boolean, default: false },
    currentFontSize: { type: Number, default: 16 },
  },
  emits: ["prev-day", "next-day", "zoom", "date-select", "copy-to-today", "pick-student"],
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
  bottom: calc(18px + var(--sab, 0px));
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
  bottom: calc(20px + var(--sab, 0px));
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
    bottom: calc(12px + var(--sab, 0px));
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
    bottom: calc(70px + var(--sab, 0px));
  }
}
</style>
