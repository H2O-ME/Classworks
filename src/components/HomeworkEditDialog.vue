<template>
  <v-dialog
    v-model="dialogVisible"
    :fullscreen="isMobile"
    max-width="1180"
    width="92%"
    scrim="rgba(8, 8, 8, 0.62)"
    transition="dialog-transition"
    @click:outside="handleClose"
    @keydown.esc="handleClose"
  >
    <v-card
      class="editor-card"
      border
      rounded="lg"
    >
      <div class="dialog-header">
        <div class="dialog-title">
          {{ title }}
        </div>
        <div class="dialog-actions">
          <v-btn
            class="dialog-btn dialog-btn-ghost"
            variant="text"
            @click="handleClose"
          >
            {{ copy.close }}
          </v-btn>
          <v-btn
            class="dialog-btn dialog-btn-solid"
            variant="flat"
            @click="handleSaveAndClose"
          >
            {{ copy.save }}
          </v-btn>
        </div>
      </div>

      <v-card-text class="dialog-body">
        <div class="editor-column">
          <div class="panel-header">
            <div>
              <div class="panel-eyebrow">
                编辑内容
              </div>
            </div>
            <div class="panel-badge">
              {{ content.length }} 字
            </div>
          </div>

          <div class="editor-field">
            <textarea
              ref="inputRef"
              v-model="content"
              class="editor-textarea"
              :placeholder="copy.placeholder"
              rows="10"
            />
          </div>

          <div class="editor-footer">
            <div class="tools-row">
              <div class="tools-grid">
                <button
                  v-for="text in quickTexts"
                  :key="text"
                  type="button"
                  class="tool-chip"
                  @click="insertAtCursor(text)"
                >
                  {{ text }}
                </button>
                <button
                  type="button"
                  class="tool-chip tool-chip-utility"
                  @click="insertAtCursor('\n')"
                >
                  {{ copy.newline }}
                </button>
                <button
                  type="button"
                  class="tool-chip tool-chip-utility"
                  @click="pasteFromClipboard"
                >
                  {{ copy.paste }}
                </button>
                <button
                  type="button"
                  class="tool-chip tool-chip-utility tool-chip-danger"
                  @click="clearContent"
                >
                  {{ copy.clear }}
                </button>
              </div>

              <div class="dialog-meta">
                <span>{{ dirty ? copy.dirty : copy.synced }}</span>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import {
  buildSavePayload,
  createEditorState,
  EDITOR_COPY,
  QUICK_INSERT_TEXTS,
} from "@/utils/homeworkEditor";
import { useDisplay } from "vuetify";

export default {
  name: "HomeworkEditDialog",
  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, required: true },
    initialContent: { type: String, default: "" },
  },
  emits: ["update:modelValue", "save"],
  setup() {
    const { mobile } = useDisplay();
    return { mobile };
  },
  data() {
    return {
      ...createEditorState(),
      quickTexts: QUICK_INSERT_TEXTS,
      copy: EDITOR_COPY,
    };
  },
  computed: {
    isMobile() {
      return this.mobile;
    },
    dialogVisible: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit("update:modelValue", value);
      },
    },
  },
  watch: {
    modelValue(value) {
      if (value) {
        Object.assign(this, createEditorState(this.initialContent));
        this.$nextTick(() => this.$refs.inputRef?.focus());
      }
    },
    content() {
      this.updateDirtyState();
    },
  },
  methods: {
    updateDirtyState() {
      this.dirty = this.content !== this.initialContent;
    },
    handleSaveAndClose() {
      this.persistAndClose();
    },
    handleClose() {
      this.persistAndClose();
    },
    // $emit 不返回 Promise：父组件的异步保存在后台继续，这里直接关窗（主页有「已同步到云端」提示兜底）
    persistAndClose() {
      this.$emit("save", buildSavePayload(this.content));
      this.dialogVisible = false;
    },
    clearContent() {
      this.content = "";
      this.$nextTick(() => this.$refs.inputRef?.focus());
    },
    async pasteFromClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        if (text) this.insertAtCursor(text);
      } catch (error) {
        console.warn("读取剪贴板失败:", error);
      }
    },
    insertAtCursor(text) {
      const textarea = this.$refs.inputRef;

      if (!textarea) {
        this.content += text;
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      this.content = this.content.slice(0, start) + text + this.content.slice(end);

      this.$nextTick(() => {
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      });
    },
  },
};
</script>

<style scoped>
.editor-card {
  background: #171717 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  border-radius: 10px !important;
  box-shadow: 0 22px 46px rgba(0, 0, 0, 0.26);
  animation: dialog-card-in 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dialog-title {
  color: #f1f1f1;
  font-size: 20px;
  font-weight: 800;
}

.dialog-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-btn {
  min-height: 34px;
  border-radius: 7px !important;
  font-weight: 800;
}

.dialog-btn-ghost {
  color: rgba(255, 255, 255, 0.82) !important;
}

.dialog-btn-solid {
  background: #f3f3f3 !important;
  color: #121212 !important;
}

.dialog-body {
  background: #171717;
  padding: 14px !important;
}

.editor-column {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 0 2px;
}

.panel-eyebrow {
  color: rgba(255, 255, 255, 0.92);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}

.panel-badge {
  flex: 0 0 auto;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 700;
}

.editor-field {
  border-radius: 9px;
}

.editor-textarea {
  display: block;
  position: relative;
  z-index: 1;
  width: 100%;
  height: clamp(280px, 42vh, 390px);
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  padding: 14px 16px;
  background: #1d1d1d;
  color: #f2f2f2;
  font: inherit;
  line-height: 1.75;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.editor-textarea:focus {
  border-color: rgba(196, 211, 238, 0.28);
  box-shadow: 0 0 0 1px rgba(196, 211, 238, 0.14);
}

.editor-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.tools-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.dialog-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  padding-top: 6px;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  text-align: right;
}

.tools-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  flex: 1 1 auto;
}

.tool-chip {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #202020;
  color: #ededed;
  font-size: 13px;
  font-weight: 700;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.tool-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: #262626;
}

.tool-chip-danger {
  color: #ffb7b7;
}

.tool-chip-utility {
  border-color: rgba(160, 186, 230, 0.18);
  background: linear-gradient(180deg, #242832, #1d2028);
  color: rgba(235, 242, 255, 0.96);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.tool-chip-utility:hover {
  border-color: rgba(182, 206, 247, 0.3);
  background: linear-gradient(180deg, #2a3040, #222734);
}

@keyframes dialog-card-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .editor-card {
    animation: none;
  }
}

@media (max-width: 900px) {
  .dialog-header {
    flex-direction: column;
    align-items: stretch;
  }

  .dialog-actions {
    justify-content: flex-end;
  }

  .editor-footer {
    gap: 12px;
  }

  .tools-row {
    flex-direction: column;
    align-items: stretch;
  }

  .tools-grid,
  .dialog-meta {
    width: 100%;
  }

  .dialog-meta {
    align-items: flex-start;
    justify-content: flex-start;
    padding-top: 0;
    gap: 4px;
    text-align: left;
  }

  .editor-textarea {
    height: 250px;
  }
}
</style>
