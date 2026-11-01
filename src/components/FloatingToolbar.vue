<template>
  <div class="floating-toolbar-container">
    <div class="floating-toolbar">
      <div class="toolbar-buttons">
        <Button
          variant="ghost"
          size="icon"
          class="tool-btn"
          title="前一天"
          aria-label="前一天"
          @click="$emit('prev-day')"
        >
          <i-mdi-chevron-left />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="tool-btn"
          :title="`缩小字体（当前 ${currentFontSize}px）`"
          aria-label="缩小字体"
          @click="$emit('zoom', 'out')"
        >
          <i-mdi-format-font-size-decrease />
        </Button>
        <div class="font-size-indicator">
          {{ currentFontSize }}px
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="tool-btn"
          :title="`放大字体（当前 ${currentFontSize}px）`"
          aria-label="放大字体"
          @click="$emit('zoom', 'up')"
        >
          <i-mdi-format-font-size-increase />
        </Button>

        <!-- 日期选择：shadcn Popover + 原生 date 输入，不引日历组件 -->
        <Popover v-model:open="dateOpen">
          <PopoverTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="tool-btn"
              title="选择日期"
              aria-label="选择日期"
            >
              <i-mdi-calendar-month-outline />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            :side-offset="8"
            class="date-picker-card"
          >
            <Input
              v-model="dateInput"
              type="date"
              class="date-picker-input"
              aria-label="跳转到日期"
              @change="onDateChange"
            />
          </PopoverContent>
        </Popover>

        <Button
          v-if="!isToday"
          variant="ghost"
          size="icon"
          class="tool-btn"
          title="后一天"
          aria-label="后一天"
          @click="$emit('next-day')"
        >
          <i-mdi-chevron-right />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="tool-btn"
          title="随机点名"
          aria-label="随机点名"
          @click="$emit('pick-student')"
        >
          <i-mdi-account-question-outline />
        </Button>
      </div>
    </div>

    <!-- 复制到今天：小屏误触会覆盖当天内容，页面侧还有二次确认；只读态不显示 -->
    <Button
      v-if="!isToday && writable"
      variant="outline"
      class="side-action-btn"
      :disabled="copyToTodayLoading"
      @click="$emit('copy-to-today')"
    >
      <i-mdi-content-copy class="side-action-icon" />
      {{ copyToTodayLoading ? "复制中…" : "复制到今天" }}
    </Button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const props = defineProps({
  selectedDate: { type: [String, Date], required: true },
  isToday: { type: Boolean, required: true },
  // 只读（无写密钥）时藏掉写操作入口
  writable: { type: Boolean, default: true },
  copyToTodayLoading: { type: Boolean, default: false },
  currentFontSize: { type: Number, default: 16 },
});
const emit = defineEmits(["prev-day", "next-day", "zoom", "date-select", "copy-to-today", "pick-student"]);

const dateOpen = ref(false);
const dateInput = ref("");

const dateInputValue = computed(() => {
  const date = props.selectedDate instanceof Date ? props.selectedDate : new Date(props.selectedDate);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
});

// 打开面板时把当前日期灌进输入框
watch(dateOpen, (open) => {
  if (open) dateInput.value = dateInputValue.value;
});

function onDateChange() {
  const value = dateInput.value;
  if (!value) return;
  // 页面侧 goToDate 认 YYYYMMDD（本地日期分量，避开 new Date("YYYY-MM-DD") 的 UTC 解析）
  emit("date-select", value.replace(/-/g, ""));
  dateOpen.value = false;
}
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
  border-radius: 8px;
  pointer-events: auto;
  /* 原版是 blur(10px) 毛玻璃；希沃弱核显上背景模糊是掉帧主因，改同色纯色 */
  background: rgba(20, 20, 20, 0.96);
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

/*
 * 覆盖 shadcn Button 的默认盒模型：原版是 42×42 无内边距图标键。
 * 选择器带 .toolbar-buttons 前缀，特异性高于 Tailwind 单类工具类，无需 !important。
 */
.toolbar-buttons .tool-btn {
  width: 42px;
  height: 42px;
  min-width: 42px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  box-shadow: none;
}

.toolbar-buttons .tool-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
}

.toolbar-buttons .tool-btn:active {
  background: rgba(255, 255, 255, 0.1);
}

.tool-btn :deep(svg) {
  width: 24px;
  height: 24px;
}

.font-size-indicator {
  min-width: 68px;
  text-align: center;
  color: rgba(255, 255, 255, 0.76);
  font-size: 14px;
  font-weight: 700;
}

.floating-toolbar-container .side-action-btn {
  position: absolute;
  right: 20px;
  bottom: calc(20px + var(--sab, 0px));
  display: inline-flex;
  gap: 8px;
  height: auto;
  min-height: 44px;
  padding: 0 16px;
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #f1f1f1;
  background: #1d1d1d;
  box-shadow: none;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  animation: float-in 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.floating-toolbar-container .side-action-btn:hover {
  background: #252525;
  color: #f1f1f1;
}

.side-action-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.side-action-icon {
  width: 18px;
  height: 18px;
}

.floating-toolbar-container .date-picker-card {
  width: auto;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #181818;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
}

.date-picker-card .date-picker-input {
  display: block;
  height: auto;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #1f1f1f;
  color: #f1f1f1;
  font-family: inherit;
  font-size: 14px;
  color-scheme: dark;
  box-shadow: none;
}

.date-picker-card .date-picker-input:focus-visible {
  outline: none;
  box-shadow: none;
  border-color: rgba(174, 191, 221, 0.4);
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

  .toolbar-buttons .tool-btn {
    width: 38px;
    height: 38px;
    min-width: 38px;
  }

  .font-size-indicator {
    min-width: 56px;
    font-size: 13px;
  }

  .floating-toolbar-container .side-action-btn {
    right: 14px;
    bottom: calc(70px + var(--sab, 0px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .floating-toolbar,
  .side-action-btn {
    animation: none;
  }
}
</style>
