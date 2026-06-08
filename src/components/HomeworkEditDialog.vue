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
    <v-card class="editor-card" border rounded="lg">
      <div class="dialog-header">
        <div class="dialog-title">{{ title }}</div>
        <div class="dialog-actions">
          <v-btn class="dialog-btn dialog-btn-ghost" variant="text" @click="handleClose">{{ copy.close }}</v-btn>
          <v-btn class="dialog-btn dialog-btn-solid" :loading="saving" variant="flat" @click="handleSaveAndClose">
            {{ copy.save }}
          </v-btn>
        </div>
      </div>

      <v-card-text class="dialog-body">
        <div class="editor-review-layout" :class="{ 'editor-review-layout-active': pendingPolishContent }">
          <div class="editor-column">
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
                autofocus
                @input="handleContentInput"
              />
              <div v-if="polishing" class="polish-soft-mask" aria-hidden="true" />
              <div v-if="polishing" class="polish-sheen" aria-hidden="true" />
              <div v-if="contentUpdated" class="content-update-sheen" aria-hidden="true" />
              <div v-if="polishing" class="polish-status" aria-live="polite">{{ copy.polishing }}</div>
            </div>

            <div class="editor-footer" :class="{ 'editor-footer-plain': !showGeoTools }">
              <div class="dialog-meta">
                <span>{{ content.length }} 字</span>
                <span>{{ dirty ? copy.dirty : copy.synced }}</span>
              </div>

              <div v-if="showGeoTools" class="subject-tools">
                <button
                  v-if="showGeoHdrToggle"
                  type="button"
                  class="subject-tool"
                  :class="{ 'subject-tool-active': geoHdrEnabled }"
                  @click="toggleGeoHdr"
                >
                  <span class="subject-tool-main">
                    <span class="subject-tool-icon">
                      <v-icon icon="mdi-brightness-6" size="17" />
                    </span>
                    <span>HDR</span>
                  </span>
                  <span class="subject-toggle" :class="{ 'subject-toggle-on': geoHdrEnabled }" aria-hidden="true">
                    <span class="subject-toggle-thumb" />
                  </span>
                </button>

                <button
                  v-if="showGeoPolish"
                  type="button"
                  class="subject-tool subject-tool-ai"
                  :class="{ 'subject-tool-active': polishing }"
                  :disabled="polishing && !polishRetryReady"
                  @click="polishWithAi"
                >
                  <span class="subject-tool-main">
                    <span class="subject-tool-icon subject-tool-icon-ai">
                      <v-icon :icon="polishing ? 'mdi-loading' : 'mdi-auto-fix'" size="17" />
                    </span>
                    <span>{{ polishing ? (polishRetryReady ? "重试" : copy.polishing) : "AI 整理" }}</span>
                  </span>
                </button>

                <a class="ai-provider-note" href="https://api.tianhw.top" target="_blank" rel="noreferrer">
                  {{ copy.provider }}
                </a>
              </div>

              <div v-if="showQuickTools" class="tools-grid">
                <button
                  v-for="text in quickTexts"
                  :key="text"
                  type="button"
                  class="tool-chip"
                  @click="insertAtCursor(text)"
                >
                  {{ text }}
                </button>
                <button type="button" class="tool-chip" @click="insertAtCursor('\n')">{{ copy.newline }}</button>
                <button type="button" class="tool-chip" @click="pasteFromClipboard">{{ copy.paste }}</button>
                <button type="button" class="tool-chip tool-chip-danger" @click="clearContent">{{ copy.clear }}</button>
              </div>
            </div>

            <div v-if="polishError" class="dialog-error" role="alert" aria-live="polite">
              {{ polishError }}
            </div>
          </div>

          <section v-if="pendingPolishContent" class="diff-column">
            <div class="diff-panel">
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

            <div class="diff-review-bar">
              <div class="diff-header diff-header-below">
                <div>
                  <div class="diff-title">{{ copy.diffTitle }}</div>
                  <div class="diff-subtitle">{{ copy.diffSubtitle }}</div>
                </div>
                <div class="diff-actions">
                  <button type="button" class="diff-btn diff-btn-ghost" @click="rejectPolish">{{ copy.reject }}</button>
                  <button type="button" class="diff-btn diff-btn-solid" @click="applyPolish">{{ copy.apply }}</button>
                </div>
              </div>
            </div>
          </section>
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
  isGeographySubject,
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
    showGeoHdrToggle() {
      return isGeographySubject(this.title);
    },
    showGeoPolish() {
      return isGeographySubject(this.title);
    },
    showGeoTools() {
      return this.showGeoHdrToggle || this.showGeoPolish;
    },
    polishDiffRows() {
      return buildLineDiff(this.content, this.pendingPolishContent);
    },
  },
  watch: {
    modelValue(value) {
      if (value) {
        Object.assign(this, createEditorState(this.initialContent, this.initialOptions, this.showGeoHdrToggle));
        this.$nextTick(() => this.$refs.inputRef?.focus());
      } else {
        this.cancelActivePolish();
      }
    },
    content() {
      this.updateDirtyState();
    },
    geoHdrEnabled() {
      this.updateDirtyState();
    },
  },
  methods: {
    updateDirtyState() {
      const hdrChanged = this.showGeoHdrToggle && this.geoHdrEnabled !== (this.initialOptions?.hdr !== false);
      this.dirty = this.content !== this.initialContent || hdrChanged;
    },
    toggleGeoHdr() {
      this.geoHdrEnabled = !this.geoHdrEnabled;
    },
    handleContentInput() {
      this.clearPolishError();
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
        await this.$emit("save", buildSavePayload(this.content, this.geoHdrEnabled, this.showGeoHdrToggle));
        this.dialogVisible = false;
      } finally {
        this.saving = false;
      }
    },
    clearContent() {
      this.content = "";
      this.pendingPolishContent = "";
      this.clearPolishError();
      this.$nextTick(() => this.$refs.inputRef?.focus());
    },
    clearPolishError() {
      this.polishError = "";
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
      this.pendingPolishContent = "";
      this.armPolishRetry(runId);

      try {
        const polished = await requestAiPolish(this.content, this.copy.askSecret, {
          signal: abortController.signal,
        });
        if (this.polishRunId !== runId) return;
        if (polished === this.content.trim()) {
          this.polishError = "AI 没有发现需要修改的内容。";
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
  padding: 16px !important;
}

.editor-review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}

.editor-review-layout-active {
  grid-template-columns: minmax(0, 1fr) minmax(390px, 0.78fr);
  align-items: stretch;
}

.editor-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
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
  height: clamp(300px, 45vh, 430px);
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  padding: 16px 17px;
  background: #1d1d1d;
  color: #f2f2f2;
  font: inherit;
  line-height: 1.75;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 14px;
  align-items: start;
  margin-top: 10px;
}

.dialog-meta {
  display: flex;
  grid-column: 2;
  grid-row: 1;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 4px;
  min-width: 150px;
  padding-top: 4px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 13px;
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

.subject-tools {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.subject-tool {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: auto;
  min-width: 146px;
  min-height: 44px;
  padding: 0 11px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: linear-gradient(180deg, #242424, #1d1d1d);
  color: #f2f2f2;
  font-size: 14px;
  font-weight: 800;
  text-align: left;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 18px rgba(0, 0, 0, 0.14);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.subject-tool:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.24);
  background: linear-gradient(180deg, #2a2a2a, #202020);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 12px 22px rgba(0, 0, 0, 0.18);
}

.subject-tool:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.26);
}

.subject-tool:disabled {
  cursor: wait;
  opacity: 0.78;
}

.subject-tool-main {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.subject-tool-icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.055);
  color: rgba(255, 255, 255, 0.84);
}

.subject-tool-ai {
  min-width: 124px;
  border-color: rgba(215, 224, 238, 0.2);
  background: linear-gradient(180deg, #282a2e, #1d1e21);
}

.subject-tool-icon-ai {
  background: rgba(230, 236, 248, 0.09);
}

.ai-provider-note {
  max-width: 220px;
  overflow: hidden;
  align-self: center;
  color: rgba(255, 255, 255, 0.36);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 180ms ease, opacity 180ms ease;
}

.ai-provider-note:hover {
  color: rgba(255, 255, 255, 0.62);
}

.subject-tool-active {
  border-color: rgba(176, 192, 222, 0.38);
  background: linear-gradient(180deg, #29303a, #202226);
}

.subject-toggle {
  position: relative;
  width: 40px;
  height: 23px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: #2a2a2a;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.subject-toggle-on {
  border-color: rgba(170, 194, 230, 0.3);
  background: #3b5d8f;
}

.subject-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  border-radius: 999px;
  background: #d8d8d8;
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.subject-toggle-on .subject-toggle-thumb {
  transform: translateX(17px);
  background: #f1f1f1;
}

.tools-grid {
  display: flex;
  grid-column: 1 / -1;
  grid-row: 2;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  justify-content: flex-start;
  padding-top: 2px;
}

.editor-footer-plain {
  grid-template-columns: minmax(0, 1fr) auto;
}

.editor-footer-plain .tools-grid {
  grid-column: 1;
  grid-row: 1;
  padding-top: 0;
}

.editor-footer-plain .dialog-meta {
  grid-column: 2;
  grid-row: 1;
}

.tool-chip {
  min-height: 32px;
  padding: 0 10px;
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

.diff-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.diff-panel {
  display: flex;
  min-width: 0;
  height: clamp(300px, 45vh, 430px);
  overflow: hidden;
  flex-direction: column;
  justify-content: stretch;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  background: #181818;
  animation: diff-panel-in 0.22s ease-out;
}

.diff-review-bar {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  overflow: hidden;
  background: #181818;
}

.diff-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #1d1d1d;
}

.diff-header-below {
  border-top: 0;
  border-bottom: 0;
}

.diff-title {
  color: #f2f2f2;
  font-size: 15px;
  font-weight: 800;
}

.diff-subtitle {
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
}

.diff-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.diff-btn {
  min-height: 32px;
  padding: 0 11px;
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
  padding: 8px 0;
  font-family: Consolas, "SFMono-Regular", "Microsoft YaHei UI", monospace;
  font-size: 13px;
  line-height: 1.7;
}

.diff-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  min-height: 24px;
  padding-right: 12px;
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

@keyframes diff-panel-in {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
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
  .diff-panel,
  .polish-soft-mask,
  .polish-sheen,
  .content-update-sheen {
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

  .editor-review-layout-active {
    grid-template-columns: 1fr;
  }

  .editor-footer {
    grid-template-columns: 1fr;
  }

  .subject-tools,
  .tools-grid,
  .dialog-meta {
    grid-column: 1;
    grid-row: auto;
  }

  .dialog-meta {
    align-items: flex-start;
    gap: 4px;
    text-align: left;
  }

  .subject-tool-ai {
    min-width: 118px;
  }

  .ai-provider-note {
    max-width: 100%;
  }

  .editor-textarea,
  .diff-panel {
    height: 260px;
  }

}
</style>

