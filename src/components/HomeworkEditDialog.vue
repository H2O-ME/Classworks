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
            :loading="saving"
            variant="flat"
            @click="handleSaveAndClose"
          >
            {{ copy.save }}
          </v-btn>
        </div>
      </div>

      <v-card-text class="dialog-body">
        <div class="editor-review-layout">
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

            <div
              class="editor-field"
              :class="{ 'editor-field-polishing': polishing, 'editor-field-updated': contentUpdated }"
            >
              <textarea
                ref="inputRef"
                v-model="content"
                class="editor-textarea"
                :placeholder="copy.placeholder"
                rows="10"
                @input="handleContentInput"
              />
              <div
                v-if="polishing"
                class="polish-soft-mask"
                aria-hidden="true"
              />
              <div
                v-if="polishing"
                class="polish-sheen"
                aria-hidden="true"
              />
              <div
                v-if="contentUpdated"
                class="content-update-sheen"
                aria-hidden="true"
              />
              <div
                v-if="polishing"
                class="polish-status"
                aria-live="polite"
              >
                {{ copy.polishing }}
              </div>
            </div>

            <div class="editor-footer">
              <div
                v-if="showQuickTools"
                class="tools-row"
              >
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
                  <button
                    type="button"
                    class="tool-chip tool-chip-ai"
                    :class="{ 'tool-chip-active': polishing }"
                    :disabled="polishing && !polishRetryReady"
                    @click="polishWithAi"
                  >
                    <span class="tool-chip-ai-inner">
                      <span class="tool-chip-ai-icon">
                        <v-icon
                          :icon="polishing ? 'mdi-loading' : 'mdi-auto-fix'"
                          size="15"
                        />
                      </span>
                      <span>{{ polishing ? (polishRetryReady ? "重试" : copy.polishing) : "AI 整理" }}</span>
                    </span>
                  </button>
                </div>

                <div class="dialog-meta">
                  <span>{{ dirty ? copy.dirty : copy.synced }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="polishError"
              class="dialog-error"
              role="alert"
              aria-live="polite"
            >
              {{ polishError }}
            </div>

            <div
              v-if="polishNotice"
              class="dialog-notice"
              aria-live="polite"
            >
              {{ polishNotice }}
            </div>
          </div>

          <transition name="diff">
            <section
              v-if="pendingPolishContent"
              class="diff-column"
            >
              <div class="diff-card">
                <header class="diff-card-head">
                  <div class="diff-card-titles">
                    <span class="diff-card-title">AI 审核</span>
                    <span class="diff-card-caption">确认差异后再应用</span>
                  </div>
                  <div class="diff-actions">
                    <button
                      type="button"
                      class="diff-btn diff-btn-ghost"
                      @click="rejectPolish"
                    >
                      {{ copy.reject }}
                    </button>
                    <button
                      type="button"
                      class="diff-btn diff-btn-solid"
                      @click="applyPolish"
                    >
                      {{ copy.apply }}
                    </button>
                  </div>
                </header>

                <div class="diff-body">
                  <div
                    v-for="(row, index) in polishDiffRows"
                    :key="`${row.type}-${index}-${row.text}`"
                    class="diff-row"
                    :class="`diff-row-${row.type}`"
                  >
                    <span class="diff-mark">{{ row.mark }}</span>
                    <span class="diff-text">{{ row.text || " " }}</span>
                  </div>
                </div>
              </div>
            </section>
          </transition>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import { requestAiPolish, getAiPolishError } from "@/utils/aiPolishState.js";
import { buildLineDiff } from "@/utils/homeworkDiff";
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
    initialOptions: { type: Object, default: () => ({}) },
  },
  emits: ["update:modelValue", "save"],
  setup() {
    const { mobile } = useDisplay();
    return { mobile };
  },
  data() {
    return {
      ...createEditorState(),
      saving: false,
      polishing: false,
      polishRetryReady: false,
      polishRunId: 0,
      polishAbortController: null,
      polishRetryTimer: null,
      contentUpdated: false,
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
    showQuickTools() {
      return true;
    },
    polishDiffRows() {
      return buildLineDiff(this.content, this.pendingPolishContent);
    },
  },
  watch: {
    modelValue(value) {
      if (value) {
        Object.assign(this, createEditorState(this.initialContent, this.initialOptions));
        this.$nextTick(() => this.$refs.inputRef?.focus());
      } else {
        this.cancelActivePolish();
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
    handleContentInput() {
      this.clearPolishError();
      this.clearPolishNotice();
      this.pendingPolishContent = "";
    },
    async handleSaveAndClose() {
      await this.persistAndClose();
    },
    async handleClose() {
      await this.persistAndClose();
    },
    async persistAndClose() {
      if (this.saving) return;
      this.saving = true;
      try {
        await this.$emit("save", buildSavePayload(this.content));
        this.dialogVisible = false;
      } finally {
        this.saving = false;
      }
    },
    clearContent() {
      this.content = "";
      this.pendingPolishContent = "";
      this.clearPolishError();
      this.clearPolishNotice();
      this.$nextTick(() => this.$refs.inputRef?.focus());
    },
    clearPolishError() {
      this.polishError = "";
    },
    clearPolishNotice() {
      this.polishNotice = "";
    },
    resetPolishRetryState() {
      this.polishRetryReady = false;
      if (this.polishRetryTimer) {
        window.clearTimeout(this.polishRetryTimer);
        this.polishRetryTimer = null;
      }
    },
    armPolishRetry(runId) {
      this.resetPolishRetryState();
      this.polishRetryTimer = window.setTimeout(() => {
        if (this.polishing && this.polishRunId === runId) {
          this.polishRetryReady = true;
        }
      }, 4000);
    },
    cancelActivePolish() {
      this.resetPolishRetryState();
      if (this.polishAbortController) {
        this.polishAbortController.abort();
        this.polishAbortController = null;
      }
      this.polishing = false;
    },
    rejectPolish() {
      this.pendingPolishContent = "";
    },
    applyPolish() {
      if (!this.pendingPolishContent) return;
      this.content = this.pendingPolishContent;
      this.pendingPolishContent = "";
      this.flashContentUpdated();
      this.$nextTick(() => this.$refs.inputRef?.focus());
    },
    flashContentUpdated() {
      this.contentUpdated = false;
      window.requestAnimationFrame(() => {
        this.contentUpdated = true;
        window.setTimeout(() => {
          this.contentUpdated = false;
        }, 900);
      });
    },
    async pasteFromClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        if (text) this.insertAtCursor(text);
      } catch (error) {
        this.polishError = "读取剪贴板失败，请手动粘贴。";
        console.warn("读取剪贴板失败:", error);
      }
    },
    async polishWithAi() {
      if (this.polishing && !this.polishRetryReady) return;
      if (!this.content.trim()) {
        this.polishError = getAiPolishError(new Error("EMPTY_CONTENT"));
        return;
      }

      if (this.polishing && this.polishRetryReady) {
        this.cancelActivePolish();
      }

      const runId = this.polishRunId + 1;
      const abortController = new AbortController();

      this.polishRunId = runId;
      this.polishAbortController = abortController;
      this.polishing = true;
      this.polishError = "";
      this.polishNotice = "";
      this.pendingPolishContent = "";
      this.armPolishRetry(runId);

      try {
        const polished = await requestAiPolish(this.content, this.copy.askSecret, {
          signal: abortController.signal,
        });
        if (this.polishRunId !== runId) return;
        if (polished === this.content.trim()) {
          this.polishNotice = "已经很规整了，这次没有需要调整的地方。";
          return;
        }
        this.pendingPolishContent = polished;
      } catch (error) {
        if (this.polishRunId !== runId) return;
        if (error?.name === "AbortError" || error?.message === "AI_POLISH_ABORTED") {
          return;
        }
        this.polishError = getAiPolishError(error);
        console.warn("AI 润色失败:", error);
      } finally {
        if (this.polishRunId === runId) {
          this.resetPolishRetryState();
          this.polishing = false;
          this.polishAbortController = null;
        }
      }
    },    insertAtCursor(text) {
      const textarea = this.$refs.inputRef;
      this.clearPolishError();
      this.pendingPolishContent = "";

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

.editor-review-layout {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: stretch;
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
  position: relative;
  overflow: hidden;
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

.editor-field-polishing {
  box-shadow: 0 0 0 1px rgba(210, 222, 245, 0.16), 0 18px 42px rgba(75, 104, 156, 0.16);
}

.polish-soft-mask,
.polish-sheen,
.content-update-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 9px;
  mix-blend-mode: screen;
}

.polish-soft-mask {
  z-index: 2;
  background:
    radial-gradient(circle at 20% 24%, rgba(108, 143, 204, 0.42), transparent 34%),
    radial-gradient(circle at 72% 28%, rgba(230, 236, 255, 0.34), transparent 42%),
    radial-gradient(circle at 82% 78%, rgba(212, 166, 151, 0.22), transparent 38%),
    linear-gradient(135deg, rgba(88, 116, 166, 0.3), rgba(126, 104, 142, 0.2));
  animation: polish-soft-fade 1.85s ease-in-out infinite, polish-soft-drift 5.4s ease-in-out infinite alternate;
}

.polish-sheen {
  z-index: 3;
  background: linear-gradient(
    108deg,
    transparent 0%,
    transparent 34%,
    rgba(255, 255, 255, 0.18) 43%,
    rgba(246, 250, 255, 0.36) 50%,
    rgba(255, 255, 255, 0.16) 57%,
    transparent 68%
  );
  animation: polish-sheen-pass 2.2s cubic-bezier(0.37, 0, 0.2, 1) infinite;
}

.content-update-sheen {
  z-index: 4;
  background:
    linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.18) 42%, rgba(255, 255, 255, 0.38) 50%, transparent 62%),
    radial-gradient(circle at 50% 50%, rgba(214, 226, 255, 0.13), transparent 58%);
  animation: content-update-sheen 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}

.polish-status {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 5;
  padding: 5px 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: rgba(20, 20, 20, 0.78);
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  font-weight: 800;
  backdrop-filter: blur(10px);
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

.dialog-error {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 130, 130, 0.26);
  border-radius: 7px;
  background: rgba(255, 76, 76, 0.1);
  color: #ffb7b7;
  font-size: 13px;
  line-height: 1.5;
}

.dialog-notice {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(120, 168, 255, 0.18);
  border-radius: 7px;
  background: rgba(70, 110, 190, 0.1);
  color: rgba(214, 228, 255, 0.9);
  font-size: 13px;
  line-height: 1.5;
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

.tool-chip-ai {
  display: inline-flex;
  align-items: center;
  border-color: rgba(215, 224, 238, 0.2);
  background: linear-gradient(180deg, #282a2e, #1d1e21);
}

.tool-chip-ai:disabled {
  cursor: wait;
  opacity: 0.78;
}

.tool-chip-ai-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tool-chip-ai-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: rgba(230, 236, 248, 0.09);
  color: rgba(255, 255, 255, 0.84);
}

.tool-chip-active {
  border-color: rgba(176, 192, 222, 0.38);
  background: linear-gradient(180deg, #29303a, #202226);
}

.diff-column {
  display: flex;
  flex: 0 0 340px;
  min-width: 0;
  flex-direction: column;
}

.diff-enter-active,
.diff-leave-active {
  overflow: hidden;
  transition:
    flex-basis 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.22s ease;
}

.diff-enter-from,
.diff-leave-to {
  flex: 0 0 0;
  opacity: 0;
}

.diff-card {
  display: flex;
  width: 340px;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  background: #181818;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
}

.diff-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #1d1d1d;
}

.diff-card-titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.diff-card-title {
  color: #f2f2f2;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}

.diff-card-caption {
  color: rgba(255, 255, 255, 0.42);
  font-size: 12px;
  line-height: 1.4;
}

.diff-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.diff-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  font-size: 13px;
  font-weight: 800;
}

.diff-btn-ghost {
  background: #222222;
  color: rgba(255, 255, 255, 0.76);
}

.diff-btn-solid {
  border-color: rgba(255, 255, 255, 0.18);
  background: #f1f1f1;
  color: #111111;
}

.diff-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px 0;
  font-family: Consolas, "SFMono-Regular", "Microsoft YaHei UI", monospace;
  font-size: 13px;
  line-height: 1.7;
}

.diff-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  min-height: 24px;
  padding: 0 12px 0 0;
  white-space: pre-wrap;
}

.diff-mark {
  color: rgba(255, 255, 255, 0.36);
  text-align: center;
  user-select: none;
}

.diff-text {
  min-width: 0;
  color: rgba(255, 255, 255, 0.78);
  word-break: break-word;
}

.diff-row-add {
  background: rgba(55, 180, 126, 0.1);
}

.diff-row-add .diff-mark,
.diff-row-add .diff-text {
  color: #9be7bd;
}

.diff-row-remove {
  background: rgba(255, 92, 92, 0.1);
}

.diff-row-remove .diff-mark,
.diff-row-remove .diff-text {
  color: #ffb4b4;
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

@keyframes polish-soft-drift {
  from {
    transform: scale(1.02) translate3d(-1.6%, -1.1%, 0);
  }
  to {
    transform: scale(1.065) translate3d(1.6%, 1.1%, 0);
  }
}

@keyframes polish-soft-fade {
  0%,
  100% {
    opacity: 0.18;
  }
  50% {
    opacity: 0.58;
  }
}

@keyframes polish-sheen-pass {
  0% {
    opacity: 0;
    transform: translateX(-62%);
  }
  18% {
    opacity: 0.76;
  }
  58% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
    transform: translateX(72%);
  }
}

@keyframes content-update-sheen {
  0% {
    opacity: 0;
    transform: translateX(-72%);
  }
  22% {
    opacity: 0.82;
  }
  100% {
    opacity: 0;
    transform: translateX(72%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .editor-card,
  .polish-soft-mask,
  .polish-sheen,
  .content-update-sheen {
    animation: none;
  }

  .diff-enter-active,
  .diff-leave-active {
    transition: none;
  }
}

@media (max-width: 1000px) {
  .editor-review-layout {
    flex-direction: column;
  }

  .diff-column,
  .diff-enter-from,
  .diff-leave-to {
    flex: 0 0 auto;
  }

  .diff-card {
    width: 100%;
  }

  .diff-enter-active,
  .diff-leave-active {
    transition: opacity 0.18s ease;
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

  .tool-chip-ai {
    order: 999;
  }

  .editor-textarea {
    height: 250px;
  }

  .diff-body {
    max-height: 240px;
  }

}
</style>

