<template>
  <transition name="app-toast">
    <aside
      v-if="show"
      class="app-toast"
      :style="toastPositionStyle"
      role="status"
      :aria-live="persistent ? 'assertive' : 'polite'"
      @click="dismiss"
    >
      <i-mdi-cloud-sync-outline
        v-if="icon === 'mdi-cloud-sync-outline'"
        class="app-toast-icon"
      />
      <i-mdi-cloud-check-outline
        v-else
        class="app-toast-icon"
      />
      <span class="app-toast-text">{{ message }}</span>
      <button
        v-if="action"
        class="app-toast-action"
        type="button"
        @click.stop="activate"
      >
        {{ action }}
      </button>
    </aside>
  </transition>
</template>

<script>
import { reactive } from "vue";

// 可见 toast 注册表：每个实例显示时 push 自己的 token、隐藏时移除。
// computed stackedOffset 对同一数组做 indexOf，任意 show 翻转都会自动重排所有 toast 的纵向位置。
const toastRegistry = reactive([]);
// 单条堆叠步长：覆盖桌面(约 44px 高)与移动端通栏(约 50px 高)两种尺寸，含间距
const TOAST_STACK_STEP = 64;

// 全局浮动通知：瞬时提示默认自动消失，常驻通知（persistent）靠点击或动作按钮关闭。
// 通知类一律使用本组件，见 AGENTS.md「UI 规范」。样式纯局部，不占文档流（position: fixed）。
export default {
  name: "AppToast",
  props: {
    show: { type: Boolean, default: false },
    message: { type: String, default: "" },
    // 仅两种：云端已同步（默认）/ 云端同步中（设置页）
    icon: { type: String, default: "mdi-cloud-check-outline" },
    action: { type: String, default: "" },
    // 自动消失毫秒数；persistent 或 <=0 表示常驻，仅靠点击或动作按钮关闭
    duration: { type: Number, default: 2400 },
    persistent: { type: Boolean, default: false },
  },
  emits: ["dismiss", "action"],
  data() {
    return {
      timer: null,
      // 每实例唯一引用，用于登记堆叠顺序；不参与渲染
      stackToken: {},
    };
  },
  computed: {
    // 第几条可见 toast：0 贴顶，后面的依次下移一个步长，避免互相遮挡
    stackedOffset() {
      const index = toastRegistry.indexOf(this.stackToken);
      return index > 0 ? index * TOAST_STACK_STEP : 0;
    },
    // 堆叠通过 translateY 下移实现，不碰 top，进入/离开动画仍可自由使用 transform
    toastPositionStyle() {
      return this.stackedOffset ? { transform: `translateY(${this.stackedOffset}px)` } : undefined;
    },
  },
  watch: {
    // immediate：调用方常用 :key 换实例刷新文案，挂载时 show 已经是 true
    show: {
      immediate: true,
      handler(visible) {
        if (visible) {
          if (this.timer) clearTimeout(this.timer);
          if (!toastRegistry.includes(this.stackToken)) toastRegistry.push(this.stackToken);
          if (!this.persistent && this.duration > 0) {
            this.timer = setTimeout(() => this.$emit("dismiss"), this.duration);
          }
        } else {
          if (this.timer) clearTimeout(this.timer);
          this.timer = null;
          const index = toastRegistry.indexOf(this.stackToken);
          if (index !== -1) toastRegistry.splice(index, 1);
        }
      },
    },
  },
  beforeUnmount() {
    if (this.timer) clearTimeout(this.timer);
    const index = toastRegistry.indexOf(this.stackToken);
    if (index !== -1) toastRegistry.splice(index, 1);
  },
  methods: {
    activate() {
      this.$emit("action");
    },
    dismiss() {
      if (this.timer) clearTimeout(this.timer);
      this.$emit("dismiss");
    },
  },
};
</script>

<style scoped>
.app-toast {
  position: fixed;
  right: 18px;
  top: calc(72px + var(--sat, 0px));
  z-index: 120;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 36px));
  padding: 11px 14px;
  border-radius: 9px;
  background: #1e3a5f;
  color: #dce8f5;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
  cursor: pointer;
}

.app-toast-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.app-toast-text {
  color: #f2f7fb;
  font-size: 13px;
  font-weight: 700;
}

.app-toast-action {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.app-toast-action:hover {
  background: rgba(255, 255, 255, 0.2);
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 700px) {
  .app-toast {
    top: calc(64px + var(--sat, 0px) + 10px);
    left: 14px;
    right: 14px;
    max-width: none;
  }
  .app-toast-text {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
  .app-toast-action {
    margin-left: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-toast-enter-active,
  .app-toast-leave-active {
    transition: none;
  }
}
</style>
