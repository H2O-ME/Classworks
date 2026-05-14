<template>
  <v-dialog
    v-model="dialogVisible"
    :fullscreen="isMobile"
    max-width="820"
    width="auto"
    persistent
    @click:outside="handleClose"
  >
    <v-card
      class="homework-edit-dialog"
      rounded="xl"
      elevation="24"
    >
      <!-- 标题栏 -->
      <v-toolbar
        color="transparent"
        density="comfortable"
        class="px-4"
      >
        <v-toolbar-title class="text-h6 font-weight-medium">
          <v-icon
            icon="mdi-pencil-box-outline"
            class="mr-2"
            color="primary"
          />
          {{ title }}
        </v-toolbar-title>

        <v-spacer />

        <v-btn
          icon="mdi-close"
          variant="text"
          density="comfortable"
          @click="handleClose"
        />
      </v-toolbar>

      <v-divider />

      <!-- 主内容区 -->
              <v-card-text class="pa-6">
                <!-- 非今日编辑警告 -->
                <v-alert
                  v-if="isEditingPastData"
                  type="warning"
                  variant="tonal"
                  class="mb-4"
                  rounded="lg"
                  border="start"
                >
                  <template #prepend>
                    <v-icon icon="mdi-history" />
                  </template>
                  <div>
                    <div class="text-subtitle-2 font-weight-bold mb-1">
                      你打算修改历史？
                    </div>
                    <div class="text-body-2 opacity-80">
                      这是 {{ formatDate(currentDateString) }} 的作业 • 请谨慎操作，确保不会覆盖重要数据
                    </div>
                  </div>
                </v-alert>

                <!-- 编辑区域容器 - 左右布局 -->
                <div class="edit-container-horizontal">
                  <!-- 左侧：主输入区域 -->
                  <div class="input-section-left">
                    <div class="mb-3 d-flex align-center gap-2">
                      <v-icon
                        :icon="autoSave ? 'mdi-content-save-check-outline' : 'mdi-content-save-edit-outline'"
                        size="small"
                        :color="autoSave ? 'success' : 'info'"
                      />
                      <span class="text-caption text-medium-emphasis">
                        {{ autoSave ? autoSavePromptText : manualSavePromptText }}
                      </span>
                    </div>

                    <v-textarea
                      ref="inputRef"
                      v-model="content"
                      auto-grow
                      placeholder="使用换行表示分条..."
                      rows="5"
                      variant="outlined"
                      bg-color="surface"
                      rounded="lg"
                      class="custom-textarea"
                    />
                  </div>

                  <!-- 右侧：快捷文字工具栏 -->
                  <div
                    v-if="showQuickTools"
                    class="quick-tools-right"
                  >
                    <div class="quick-tools-content-vertical">
                      <div class="tool-label">
                        <v-icon icon="mdi-format-letter-case" size="16" />
                        快捷插入
                      </div>
                      <div class="quick-chips-vertical">
                        <v-chip
                          v-for="text in quickTexts"
                          :key="'quick-' + text"
                          class="quick-chip-new"
                          variant="outlined"
                          clickable
                          @click="insertAtCursor(text)"
                        >
                          {{ text }}
                        </v-chip>
                      </div>
                    </div>
                  </div>
                </div>
              </v-card-text>

      <!-- 底部操作栏 -->
      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />

        <div class="d-flex align-center gap-3">
          <v-btn
            variant="text"
            color="medium-emphasis"
            @click="handleClose"
          >
            取消
          </v-btn>

          <v-btn
            variant="flat"
            color="primary"
            prepend-icon="mdi-content-save"
            class="px-6"
            rounded="lg"
            elevation="2"
            @click="handleSave"
          >
            保存
          </v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import {getSetting} from "@/utils/settings";
import { useDisplay } from "vuetify";

export default {
  name: "HomeworkEditDialog",
  props: {
    modelValue: {
      type: Boolean,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    initialContent: {
      type: String,
      default: ""
    },
    autoSave: {
      type: Boolean,
      default: false
    },
    isEditingPastData: {
      type: Boolean,
      default: false
    },
    currentDateString: {
      type: String,
      default: ""
    }
  },
  emits: ["update:modelValue", "save"],
  setup() {
    const { mobile } = useDisplay();
    return { mobile };
  },
  data() {
    return {
      content: "",
      quickTexts: ["课", "题", "例", "变", "T", "P"]
    };
  },
  computed: {
    isMobile() {
      const forceDesktopMode = getSetting('display.forceDesktopMode');
      if (forceDesktopMode) {
        return false;
      }
      return this.mobile;
    },
    dialogVisible: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit("update:modelValue", value);
      }
    },
    subject() {
      return this.title;
    },
    showQuickTools() {
      return getSetting("display.showQuickTools");
    },
    autoSavePromptText() {
      return getSetting("edit.autoSavePromptText");
    },
    manualSavePromptText() {
      return getSetting("edit.manualSavePromptText");
    }
  },
  watch: {
    modelValue(newValue) {
      if (newValue) {
        this.content = this.initialContent;

        this.$nextTick(() => {
          if (this.$refs.inputRef) {
            this.$refs.inputRef.focus();
          }
        });
      }
    }
  },
  methods: {
    formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        const year = dateStr.slice(0, 4);
        const month = dateStr.slice(4, 6);
        const day = dateStr.slice(6, 8);
        return new Date(year, month - 1, day).toLocaleDateString('zh-CN');
      } catch (e) {
        return dateStr;
      }
    },

    handleClose() {
      const trimmedContent = this.content.trim();
      if (trimmedContent !== this.initialContent.trim()) {
        this.$emit("save", trimmedContent);
      }
      this.dialogVisible = false;
    },

    handleSave() {
      this.$emit("save", this.content.trim());
      this.dialogVisible = false;
    },

    insertAtCursor(text) {
      if (!text) return;

      const textarea = this.$refs.inputRef?.$el?.querySelector('textarea');
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      this.content = this.content.slice(0, start) + text + this.content.slice(end);

      this.$nextTick(() => {
        textarea.focus();
        const newPosition = start + text.length;
        textarea.setSelectionRange(newPosition, newPosition);
      });
    }
  }
};
</script>

<style scoped>
.homework-edit-dialog {
  overflow: hidden;
}

.edit-container-horizontal {
  display: flex;
  flex-direction: row;
  gap: 20px;
  align-items: stretch;
}

.input-section-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.custom-textarea {
  font-size: 16px;
  line-height: 1.6;
}

.custom-textarea :deep(textarea) {
  padding: 18px !important;
  min-height: 200px !important;
  max-height: 400px !important;
}

/* 右侧快捷工具栏 */
.quick-tools-right {
  width: 160px;
  min-width: 160px;
  display: flex;
  align-items: flex-start;
  padding-top: 8px;
}

.quick-tools-content-vertical {
  background: rgba(var(--v-theme-surface), 0.6);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 12px;
  padding: 16px;
  width: 100%;
  transition: all 0.2s ease;
}

.quick-tools-content-vertical:hover {
  border-color: rgba(var(--v-theme-primary), 0.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.tool-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-medium-emphasis));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.quick-chips-vertical {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-chip-new {
  cursor: pointer !important;
  font-weight: 700 !important;
  font-size: 18px !important;
  height: 48px !important;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
  border-width: 2px !important;
  border-radius: 24px !important;
  justify-content: center !important;
}

.quick-chip-new:hover {
  transform: translateX(-4px) scale(1.05) !important;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  border-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
  background-color: rgba(var(--v-theme-primary), 0.08) !important;
}

.quick-chip-new:active {
  transform: translateX(-2px) scale(1.02) !important;
  transition-duration: 0.1s !important;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .edit-container-horizontal {
    flex-direction: column;
    gap: 16px;
  }

  .quick-tools-right {
    width: 100%;
    min-width: 100%;
    align-items: stretch;
    padding-top: 0;
  }

  .quick-chips-vertical {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .quick-chip-new {
    font-size: 16px !important;
    height: 40px !important;
    min-width: auto !important;
  }
}
</style>
