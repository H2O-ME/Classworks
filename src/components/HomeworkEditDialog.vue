<template>
  <v-dialog
    v-model="dialogVisible"
    :fullscreen="mobile"
    max-width="720"
    width="92%"
    scrim="rgba(8, 8, 8, 0.66)"
    transition="dialog-transition"
  >
    <v-card
      ref="dialogCard"
      class="editor-card"
      :class="{ 'editor-card-mobile': mobile }"
      border
      rounded="lg"
    >
      <div
        class="dialog-header"
        title="拖动可移动"
        @pointerdown="startDrag"
      >
        <div class="dialog-title">
          {{ title }}
        </div>
        <v-btn
          class="dialog-close"
          icon="mdi-close"
          variant="text"
          :aria-label="copy.close"
          @click="persistAndClose"
        />
      </div>

      <v-card-text class="dialog-body">
        <div class="editor-well">
          <textarea
            ref="inputRef"
            v-model="content"
            class="editor-textarea"
            :placeholder="copy.placeholder"
            @keydown.ctrl.enter.prevent="persistAndClose"
          />
          <button
            type="button"
            class="tool-chip"
            @click="pasteFromClipboard"
          >
            <v-icon
              icon="mdi-content-paste"
              size="16"
            />
            <span>{{ copy.paste }}</span>
          </button>
        </div>
      </v-card-text>

      <div class="editor-footer">
        <v-btn
          class="dialog-btn-solid"
          variant="flat"
          title="Ctrl+Enter"
          @click="persistAndClose"
        >
          {{ copy.save }}
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script>
import {
  buildSavePayload,
  createEditorState,
  EDITOR_COPY,
} from "@/utils/homeworkEditor";
import { useDisplay } from "vuetify";

// 解析 "matrix(a,b,c,d,tx,ty)" 的平移分量；transform 为空/无效时按 0,0 处理
function parseTransform(transform) {
  const matched = /matrix\([^)]*\)/.exec(transform || "");
  if (!matched) return { x: 0, y: 0 };
  const parts = matched[0].replace(/^matrix\(|\)$/g, "").split(",").map(Number);
  return { x: parts[4] || 0, y: parts[5] || 0 };
}

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
      copy: EDITOR_COPY,
      drag: null,
    };
  },
  computed: {
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
        this.$nextTick(() => {
          // 清掉上次拖拽残留的内联 transform/transition，保证居中与进入过渡
          const overlay = this.$refs.dialogCard?.$el?.closest(".v-overlay__content");
          overlay?.style && (overlay.style.transform = "");
          overlay?.style && (overlay.style.transition = "");
          this.$refs.inputRef?.focus();
        });
      } else if (this.dirty) {
        // ESC / 点击遮罩由 v-dialog 直接关窗、不经按钮：兜底落一版内容，未保存修改不丢
        this.$emit("save", buildSavePayload(this.content));
        this.dirty = false;
      }
    },
    content() {
      this.updateDirtyState();
    },
  },
  beforeUnmount() {
    this.endDrag();
  },
  methods: {
    // 拖拽移动对话框：基于初始 transform 累加位移（v-overlay 用 transform 定位居中，直接覆写会甩飞）
    startDrag(event) {
      if (this.mobile || event.button !== 0) return;
      const overlay = this.$refs.dialogCard?.$el?.closest(".v-overlay__content");
      if (!overlay) return;
      const transform = window.getComputedStyle(overlay).transform || "";
      const base = parseTransform(transform);
      this.drag = { overlay, startX: event.clientX, startY: event.clientY, baseX: base.x, baseY: base.y };
      overlay.style.transition = "none";
      window.addEventListener("pointermove", this.onDrag);
      window.addEventListener("pointerup", this.endDrag);
      event.preventDefault();
    },
    onDrag(event) {
      if (!this.drag) return;
      const { overlay, startX, startY, baseX, baseY } = this.drag;
      overlay.style.transform = `translate(${baseX + event.clientX - startX}px, ${baseY + event.clientY - startY}px)`;
    },
    endDrag() {
      if (!this.drag) return;
      this.drag = null;
      window.removeEventListener("pointermove", this.onDrag);
      window.removeEventListener("pointerup", this.endDrag);
    },
    updateDirtyState() {
      this.dirty = this.content !== this.initialContent;
    },
    // $emit 不返回 Promise：父组件的异步保存在后台继续，这里直接关窗（主页有「已同步到云端」提示兜底）
    persistAndClose() {
      this.$emit("save", buildSavePayload(this.content));
      this.dirty = false; // 置 false 防止 watch(modelValue=false) 兜底再发一次
      this.dialogVisible = false;
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
/* 大屏编辑器：整卡即编辑面 —— 紧凑头部 + 大字编辑井 + 底部操作条 */
.editor-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #171717 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  border-radius: 16px !important;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.32);
  animation: dialog-card-in 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.dialog-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 8px 20px;
  cursor: grab;
  user-select: none;
}
.dialog-header:active {
  cursor: grabbing;
}

.dialog-title {
  position: relative;
  min-width: 0;
  padding-left: 12px;
  color: #f1f1f1;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.2;
}

.dialog-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 4px;
  height: 16px;
  border-radius: 3px;
  background: #aebfdd;
  transform: translateY(-50%);
}

.dialog-close {
  flex: 0 0 auto;
  width: 32px !important;
  height: 32px !important;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6) !important;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 16px !important;
}

/* 编辑井：一整块浅凹面承载输入，粘贴浮在右下角 */
.editor-well {
  position: relative;
  height: clamp(220px, 36vh, 380px);
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: #1a1a1a;
  transition: border-color 0.2s ease;
}

.editor-well:focus-within {
  border-color: rgba(174, 191, 221, 0.28);
}

.editor-textarea {
  display: block;
  width: 100%;
  height: 100%;
  /* 底部留出浮层粘贴键的高度，末行不被遮 */
  padding: 16px 18px 56px;
  border: 0;
  background: transparent;
  color: #f2f2f2;
  font: inherit;
  /* 固定字号：编辑在近处进行，小于看板展示字号，不跟随缩放设置 */
  font-size: 15px;
  line-height: 1.8;
  caret-color: #aebfdd;
  outline: none;
  resize: none;
}

.editor-textarea::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

/* 粘贴：编辑井右下角半透明浮层，不占底部操作区 */
.tool-chip {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(23, 23, 23, 0.88);
  backdrop-filter: blur(6px);
  color: rgba(255, 255, 255, 0.82);
  font-size: 12.5px;
  font-weight: 700;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.tool-chip:hover {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(38, 38, 38, 0.92);
}

.editor-footer {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 通栏单一主操作：保存条 */
.dialog-btn-solid {
  width: 100%;
  min-height: 44px;
  border-radius: 10px !important;
  background: #f3f3f3 !important;
  color: #121212 !important;
  font-size: 15px !important;
  font-weight: 800;
  letter-spacing: 0.02em;
}

/* ── 手机全屏：铺满整屏，编辑井撑开、操作沉底 ── */
.editor-card-mobile {
  height: 100%;
  border-radius: 0 !important;
}

.editor-card-mobile .dialog-body {
  display: flex;
}

.editor-card-mobile .editor-well {
  flex: 1 1 auto;
  height: auto;
  min-height: 220px;
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
</style>
