<template>
  <button
    type="button"
    class="add-tile"
    @click="$emit('add')"
  >
    <i-mdi-plus class="add-tile-icon" />
    <span class="add-tile-name">{{ subject.name }}</span>
  </button>
</template>

<script setup>
defineProps({
  subject: { type: Object, required: true },
});
defineEmits(["add"]);
</script>

<style scoped>
/* 学科添加入口：单行圆角按钮，明显可点但不喧宾夺主 */
.add-tile {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 44px;
  padding: 0 18px;
  border: 1px solid rgba(174, 191, 221, 0.28);
  border-radius: 14px;
  background: rgba(174, 191, 221, 0.06);
  color: rgba(255, 255, 255, 0.82);
  font: 600 15px/1 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px);
  animation: tile-enter 0.34s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--tile-delay, 0ms);
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease, transform 0.15s ease;
}

.add-tile:hover {
  border-color: rgba(174, 191, 221, 0.6);
  background: rgba(174, 191, 221, 0.12);
  color: #ffffff;
  transform: translateY(-1px);
}

.add-tile:active {
  transform: translateY(0);
}

.add-tile-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.add-tile-name {
  white-space: nowrap;
}

@keyframes tile-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .add-tile {
    animation: none;
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 760px) {
  .add-tile {
    height: 42px;
    padding: 0 16px;
    font-size: 14.5px;
  }
}
</style>
