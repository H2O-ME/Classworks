<template>
  <div
    v-if="modelValue"
    class="dialog-overlay"
    :class="{ 'dialog-overlay-mobile': mobile }"
    @click.self="closeDialog"
  >
    <div
      ref="dialogCard"
      class="editor-card"
      :class="{ 'editor-card-mobile': mobile }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div
        class="dialog-header"
        title="拖动可移动"
        @pointerdown="startDrag"
      >
        <div class="dialog-title">
          {{ title }}
        </div>
        <button
          type="button"
          class="dialog-close"
          :aria-label="copy.close"
          title="关闭"
          @click="persistAndClose"
        >
          <i-mdi-close class="dialog-close-icon" />
        </button>
      </div>

      <div class="dialog-body">
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
            <i-mdi-content-paste class="tool-chip-icon" />
            <span>{{ copy.paste }}</span>
          </button>
        </div>
      </div>

      <div class="editor-footer">
        <button
          type="button"
          class="dialog-btn-solid"
          title="Ctrl+Enter"
          @click="persistAndClose"
        >
          {{ copy.save }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const copy = {
  close: "关闭",
  save: "保存并关闭",
  placeholder: "输入作业内容，每行一项会更清晰。",
  paste: "粘贴",
};

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, required: true },
  initialContent: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "save"]);

const inputRef = ref(null);
const dialogCard = ref(null);
const content = ref("");
const mobile = ref(false);
let dirty = false;
let drag = null;

// 解析 "matrix(a,b,c,d,tx,ty)" 的平移分量；transform 为空/无效时按 0,0 处理
function parseTransform(transform) {
  const matched = /matrix\([^)]*\)/.exec(transform || "");
  if (!matched) return { x: 0, y: 0 };
  const parts = matched[0].replace(/^matrix\(|\)$/g, "").split(",").map(Number);
  return { x: parts[4] || 0, y: parts[5] || 0 };
}

function updateMobile() {
  mobile.value = window.innerWidth < 600;
}

function resetDragTransform() {
  const element = dialogCard.value;
  if (!element) return;
  element.style.transform = "";
  element.style.transition = "";
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      content.value = props.initialContent;
      dirty = false;
      nextTick(() => {
        // 清掉上次拖拽残留的内联 transform/transition，保证居中与进入动画
        resetDragTransform();
        inputRef.value?.focus();
      });
    } else if (dirty) {
      // 关窗时若有未保存修改，兜底落一版，未保存修改不丢
      emit("save", { content: content.value.trim() });
      dirty = false;
    }
  },
);

watch(content, (value) => {
  dirty = value !== props.initialContent;
});

// 拖拽移动弹窗：基于初始 transform 累加位移，标题栏按下即可拖动
function startDrag(event) {
  if (mobile.value || event.button !== 0) return;
  const element = dialogCard.value;
  if (!element) return;
  const base = parseTransform(window.getComputedStyle(element).transform);
  drag = { element, startX: event.clientX, startY: event.clientY, baseX: base.x, baseY: base.y };
  element.style.transition = "none";
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", endDrag);
  event.preventDefault();
}

function onDrag(event) {
  if (!drag) return;
  const { element, startX, startY, baseX, baseY } = drag;
  element.style.transform = `translate(${baseX + event.clientX - startX}px, ${baseY + event.clientY - startY}px)`;
}

function endDrag() {
  if (!drag) return;
  drag = null;
  window.removeEventListener("pointermove", onDrag);
  window.removeEventListener("pointerup", endDrag);
}

// ESC / 点遮罩兜底：有未保存修改就落一版（原 v-dialog 的关闭路径）
function closeDialog() {
  if (dirty) {
    emit("save", { content: content.value.trim() });
    dirty = false;
  }
  emit("update:modelValue", false);
}

// $emit 不返回 Promise：父组件的异步保存在后台继续，这里直接关窗（失败有 toast 兜底）
function persistAndClose() {
  emit("save", { content: content.value.trim() });
  dirty = false;
  emit("update:modelValue", false);
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) insertAtCursor(text);
  } catch (error) {
    console.warn("读取剪贴板失败:", error);
  }
}

function insertAtCursor(text) {
  const textarea = inputRef.value;
  if (!textarea) {
    content.value += text;
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  content.value = content.value.slice(0, start) + text + content.value.slice(end);
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(start + text.length, start + text.length);
  });
}

function onKeydown(event) {
  if (!props.modelValue || event.key !== "Escape") return;
  closeDialog();
}

onMounted(() => {
  updateMobile();
  window.addEventListener("resize", updateMobile);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  endDrag();
  window.removeEventListener("resize", updateMobile);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
/* 大屏编辑器：整卡即编辑面 —— 紧凑头部 + 大字编辑井 + 底部操作条 */
.editor-card {
  display: flex;
  width: 92%;
  max-width: 720px;
  max-height: 92vh;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: #171717;
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
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}

.dialog-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.dialog-close-icon {
  width: 20px;
  height: 20px;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 16px;
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

/* 粘贴：编辑井右下角浮层，不占底部操作区。原版用 blur 毛玻璃，改纯色 */
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
  background: rgba(23, 23, 23, 0.96);
  color: rgba(255, 255, 255, 0.82);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.tool-chip:hover {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(38, 38, 38, 0.96);
}

.tool-chip-icon {
  width: 16px;
  height: 16px;
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
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.dialog-btn-solid:hover {
  background: #ffffff;
}

/* ── 手机全屏：铺满整屏，编辑井撑开、操作沉底 ── */
.dialog-overlay-mobile {
  padding: 0;
}

.editor-card-mobile {
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  border-radius: 0;
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
