<template>
  <v-dialog v-model="dialogVisible" :fullscreen="isMobile" max-width="680" width="92%" persistent>
    <v-card border rounded="xl">
      <div class="dialog-header">
        <v-btn variant="text" color="primary" @click="handleClose">取消</v-btn>

        <h2 class="dialog-title">{{ title }}</h2>

        <v-btn :loading="saving" color="primary" variant="flat" rounded="pill" @click="handleSaveAndClose">
          保存
        </v-btn>
      </div>

      <v-card-text class="dialog-body">
        <textarea
          ref="inputRef"
          v-model="content"
          class="editor-textarea"
          placeholder="输入作业内容"
          rows="8"
          autofocus
          @input="handleInput"
        />

        <div class="dialog-meta">
          <span>{{ content.length }} 字</span>
          <span v-if="autoSave">{{ saveStateText }}</span>
        </div>

        <v-divider class="my-4" />

        <div v-if="showQuickTools" class="tools-grid">
          <v-chip
            v-for="text in quickTexts"
            :key="text"
            color="primary"
            variant="tonal"
            @click="insertAtCursor(text)"
          >
            {{ text }}
          </v-chip>

          <v-chip variant="tonal" @click="insertAtCursor('\n')">换行</v-chip>
          <v-chip variant="tonal" @click="insertAtCursor(' ')">空格</v-chip>
          <v-chip color="error" variant="tonal" @click="clearContent">清空</v-chip>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import { getSetting } from "@/utils/settings";
import { useDisplay } from "vuetify";

export default {
  name: "HomeworkEditDialog",
  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, required: true },
    initialContent: { type: String, default: "" },
    autoSave: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "save"],
  setup() {
    const { mobile } = useDisplay();
    return { mobile };
  },
  data() {
    return {
      content: "",
      quickTexts: ["预习", "订正", "背诵", "练习", "提交", "复习"],
      saving: false,
      saveTimer: null,
      lastSavedContent: "",
      saveState: "idle",
    };
  },
  computed: {
    isMobile() {
      return !getSetting("display.forceDesktopMode") && this.mobile;
    },
    dialogVisible: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit("update:modelValue", value);
      },
    },
    showQuickTools() {
      return getSetting("display.showQuickTools") !== false;
    },
    saveStateText() {
      if (this.saveState === "saving") return "自动保存中";
      if (this.saveState === "saved") return "已自动保存";
      if (this.saveState === "dirty") return "有未保存修改";
      return "自动保存已开启";
    },
  },
  watch: {
    modelValue(value) {
      if (value) {
        this.content = this.initialContent;
        this.lastSavedContent = this.initialContent.trim();
        this.saveState = "idle";
        this.$nextTick(() => this.$refs.inputRef?.focus());
      } else {
        this.clearSaveTimer();
        this.saving = false;
      }
    },
    initialContent(value) {
      if (!this.modelValue) {
        this.content = value;
      }
    },
  },
  methods: {
    clearSaveTimer() {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
    },
    handleInput() {
      if (!this.autoSave) {
        return;
      }

      this.saveState = "dirty";
      this.clearSaveTimer();
      this.saveTimer = setTimeout(() => {
        this.emitSave(false);
      }, 600);
    },
    async emitSave(closeAfterSave) {
      const normalizedContent = this.content.trim();
      if (normalizedContent === this.lastSavedContent) {
        if (closeAfterSave) {
          this.dialogVisible = false;
        }
        return;
      }

      this.saving = true;
      this.saveState = "saving";

      try {
        await this.$emit("save", normalizedContent);
        this.lastSavedContent = normalizedContent;
        this.saveState = "saved";
        if (closeAfterSave) {
          this.dialogVisible = false;
        }
      } catch (error) {
        console.error("保存作业失败:", error);
        this.saveState = "dirty";
      } finally {
        this.saving = false;
      }
    },
    async handleClose() {
      this.clearSaveTimer();
      if (this.autoSave && this.content.trim() !== this.lastSavedContent) {
        await this.emitSave(true);
        return;
      }
      this.dialogVisible = false;
    },
    async handleSaveAndClose() {
      this.clearSaveTimer();
      await this.emitSave(true);
    },
    clearContent() {
      this.content = "";
      this.handleInput();
      this.$nextTick(() => this.$refs.inputRef?.focus());
    },
    insertAtCursor(text) {
      const textarea = this.$refs.inputRef;
      if (!textarea) {
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      this.content = this.content.slice(0, start) + text + this.content.slice(end);

      this.$nextTick(() => {
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      });

      this.handleInput();
    },
  },
};
</script>

<style scoped>
.dialog-header {
  display: grid;
  grid-template-columns: 88px 1fr 88px;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.dialog-title {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}

.dialog-body {
  padding: 20px !important;
}

.editor-textarea {
  width: 100%;
  min-height: 220px;
  resize: vertical;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 12px;
  padding: 14px 16px;
  background: rgba(var(--v-theme-surface-variant), 0.28);
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  line-height: 1.6;
  outline: none;
}

.editor-textarea:focus {
  border-color: rgba(var(--v-theme-primary), 0.45);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.12);
}

.dialog-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 13px;
  color: rgb(var(--v-theme-medium-emphasis));
}

.tools-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 768px) {
  .dialog-header {
    grid-template-columns: 72px 1fr 72px;
    padding: 14px 16px;
  }

  .dialog-body {
    padding: 16px !important;
  }

  .editor-textarea {
    min-height: 180px;
  }
}
</style>
