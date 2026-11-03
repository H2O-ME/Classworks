<template>
  <Dialog
    :open="modelValue"
    @update:open="onOpenChange"
  >
    <DialogContent :class="{ 'dialog-surface-full': mobile }">
      <div
        ref="dialogCard"
        class="editor-card"
        :class="{ 'editor-card-mobile': mobile }"
      >
        <div
          class="dialog-header"
          title="拖动可移动"
          @pointerdown="startDrag"
        >
          <DialogTitle class="dialog-title">
            {{ title }}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            class="dialog-close"
            :aria-label="copy.close"
            title="关闭"
            @click="persistAndClose"
          >
            <i-mdi-close class="dialog-close-icon" />
          </Button>
        </div>

        <div class="dialog-body">
          <div class="editor-well">
            <Textarea
              ref="inputRef"
              v-model="content"
              class="editor-textarea"
              :placeholder="copy.placeholder"
              @keydown.ctrl.enter.prevent="persistAndClose"
            />
            <Button
              variant="outline"
              class="tool-chip"
              @click="pasteFromClipboard"
            >
              <i-mdi-content-paste class="tool-chip-icon" />
              <span>{{ copy.paste }}</span>
            </Button>
          </div>
        </div>

        <div class="editor-footer">
          <Button
            class="dialog-btn-solid"
            title="Ctrl+Enter"
            @click="persistAndClose"
          >
            {{ copy.save }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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

// ESC / 点遮罩 / 关闭键：Dialog 的关闭回调统一走这里，有未保存修改就落一版
function onOpenChange(open) {
  if (open) return;
  closeDialog();
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

// 有未保存修改就落一版（原 v-dialog 的关闭路径）
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
  // Textarea 是 shadcn 组件，$el 才是真实 textarea 节点
  const textarea = inputRef.value?.$el ?? inputRef.value;
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

onMounted(() => {
  updateMobile();
  window.addEventListener("resize", updateMobile);
});

onBeforeUnmount(() => {
  endDrag();
  window.removeEventListener("resize", updateMobile);
});
</script>

<style scoped>
/* 大屏编辑器：整卡即编辑面 —— 紧凑头部 + 大字编辑井 + 底部操作条 */
.editor-card {
  display: flex;
  width: 92%;
  max-width: 45rem;
  max-height: 92vh;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: #171717;
  box-shadow: 0 1.5rem 3.5rem rgba(0, 0, 0, 0.32);
  animation: dialog-card-in 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.dialog-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.75rem 0.5rem 1.25rem;
  cursor: grab;
  user-select: none;
}
.dialog-header:active {
  cursor: grabbing;
}

.dialog-header .dialog-title {
  position: relative;
  min-width: 0;
  padding-left: 0.75rem;
  color: #f1f1f1;
  font-size: 1.0625rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: normal;
}

.dialog-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 0.25rem;
  height: 1rem;
  border-radius: 0.1875rem;
  background: #aebfdd;
  transform: translateY(-50%);
}

.dialog-header .dialog-close {
  width: 2.4rem;
  height: 2.4rem;
  min-width: 2.4rem;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  box-shadow: none;
}

.dialog-header .dialog-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.dialog-close-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 1rem;
}

/* 编辑井：一整块浅凹面承载输入，粘贴浮在右下角 */
.editor-well {
  position: relative;
  height: clamp(13.75rem, 36vh, 23.75rem);
  padding: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  background: #1a1a1a;
  transition: border-color 0.2s ease;
}

.editor-well:focus-within {
  border-color: rgba(174, 191, 221, 0.28);
}

.editor-well .editor-textarea {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  /* 底部留出浮层粘贴键的高度，末行不被遮 */
  padding: 1rem 1.125rem 3.5rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #f2f2f2;
  font: inherit;
  /* 固定字号：编辑在近处进行，小于看板展示字号，不跟随缩放设置 */
  font-size: 0.9375rem;
  line-height: 1.8;
  caret-color: #aebfdd;
  outline: none;
  resize: none;
  box-shadow: none;
}

.editor-well .editor-textarea:focus-visible {
  outline: none;
  box-shadow: none;
  border: 0;
}

.editor-well .editor-textarea::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

/* 粘贴：编辑井右下角浮层，不占底部操作区。原版用 blur 毛玻璃，改纯色 */
.editor-well .tool-chip {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 1;
  display: inline-flex;
  height: auto;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.4rem;
  padding: 0 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  background: rgba(23, 23, 23, 0.96);
  color: rgba(255, 255, 255, 0.82);
  font-family: inherit;
  font-size: 0.7813rem;
  font-weight: 700;
  box-shadow: none;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.editor-well .tool-chip:hover {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(38, 38, 38, 0.96);
  color: rgba(255, 255, 255, 0.82);
}

.tool-chip-icon {
  width: 1rem;
  height: 1rem;
}

.editor-footer {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.625rem;
  margin-top: 0.75rem;
  padding: 0.625rem 1rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 通栏单一主操作：保存条 */
.editor-footer .dialog-btn-solid {
  width: 100%;
  height: auto;
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: 0.625rem;
  background: #f3f3f3;
  color: #121212;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow: none;
}

.editor-footer .dialog-btn-solid:hover {
  background: #ffffff;
  color: #121212;
}

/* ── 手机全屏：铺满整屏，编辑井撑开、操作沉底 ── */
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
  min-height: 13.75rem;
}

@keyframes dialog-card-in {
  from {
    opacity: 0;
    transform: translateY(1rem) scale(0.985);
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
