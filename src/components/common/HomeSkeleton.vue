<template>
  <!-- 纯 CSS 骨架屏：形态与真实看板一致（作业卡），避免 VSkeletonLoader 渲染冲突 -->
  <v-container
    class="main-window skeleton-container no-select"
    fluid
  >
    <div class="skeleton-grid">
      <div
        v-for="n in cardCount"
        :key="n"
        class="skeleton-card skeleton-pulse"
      >
        <div class="skeleton-heading" />
        <div class="skeleton-line" />
        <div class="skeleton-line skeleton-line--short" />
      </div>
    </div>
  </v-container>
</template>

<script setup>
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const cardCount = computed(() => (mobile.value ? 3 : 6))
</script>

<style scoped>
.skeleton-container {
  max-width: 1720px;
  padding: 20px 32px 76px;
}

/* 列数与真实看板 HomeworkGrid.columnCount 断点逐一对应，避免加载后列数变化导致布局跳动 */
.skeleton-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

@media (min-width: 760px) {
  .skeleton-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1240px) {
  .skeleton-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1680px) {
  .skeleton-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* 与 .homework-card 同形态：同底色/描边/圆角，挂载后无缝衔接 */
.skeleton-card {
  min-height: 148px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 9px;
  background: #191919;
}

.skeleton-heading {
  width: 42%;
  height: 16px;
  margin-bottom: 14px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.09);
}

.skeleton-line {
  width: 100%;
  height: 12px;
  margin-bottom: 9px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.07);
}

.skeleton-line--short {
  width: 58%;
}

/* 卡片骨架脉冲动画 */
.skeleton-pulse {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-pulse {
    animation: none;
  }
}

@media (max-width: 700px) {
  .skeleton-container {
    padding: 20px 14px 106px;
  }
}
</style>
