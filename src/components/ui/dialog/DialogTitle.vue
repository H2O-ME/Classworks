<script setup>
import { reactiveOmit } from "@vueuse/core";
import { DialogTitle, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
});

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <!-- 各弹窗标题排版本来就不同，这里只保留无障碍必需的结构，样式交给调用方 class -->
  <DialogTitle
    v-bind="forwardedProps"
    :class="cn('outline-none', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
