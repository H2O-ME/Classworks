<script setup>
import { reactiveOmit } from "@vueuse/core";
import { DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  forceMount: { type: Boolean, required: false },
  disableOutsidePointerEvents: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
});
const emits = defineEmits([
  "escapeKeyDown",
  "pointerDownOutside",
  "focusOutside",
  "interactOutside",
  "openAutoFocus",
  "closeAutoFocus",
]);

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <!--
    与原版一致的两层结构：遮罩 + 铺满视口的居中承接层。
    卡片视觉交给调用方 class（.editor-card / .copy-confirm-card 等），
    所以这里不写颜色/圆角/宽度工具类。关闭按钮也不内置：各弹窗标题栏里已经有。
  -->
  <DialogPortal>
    <DialogOverlay class="dialog-backdrop" />
    <DialogContent
      v-bind="forwarded"
      :class="cn('dialog-surface', props.class)"
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
