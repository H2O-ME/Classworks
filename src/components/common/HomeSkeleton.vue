<template>
  <!-- 纯 CSS 骨架屏：形态与真实看板一致（作业卡），避免加载完布局跳动 -->
  <div class="main-window skeleton-container no-select">
    <div class="skeleton-grid">
      <div
        v-for="n in 6"
        :key="n"
        class="skeleton-card skeleton-pulse"
      >
        <div class="skeleton-heading" />
        <div class="skeleton-line" />
        <div class="skeleton-line skeleton-line--short" />
      </div>
    </div>
  </div>
</template>

<script setup>
// 纯 CSS 骨架：只做形状占位，无 JS 依赖
</script>

<style scoped>
.skeleton-container {
  max-width: 107.5rem;
  margin: 0 auto;
  padding: 1.25rem 2rem 4.75rem;
}

/* 列数与真实看板 HomeworkGrid.columnCount 断点逐一对应，避免加载后列数变化导致布局跳动 */
.skeleton-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.125rem;
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

/* 与 .homework-card 同形态：同底色/描边/圆角，挂载后无缝衔接 */
.skeleton-card {
  min-height: 9.25rem;
  padding: 1.125rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.5625rem;
  background: #191919;
}

.skeleton-heading {
  width: 42%;
  height: 1rem;
  margin-bottom: 0.875rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.09);
}

.skeleton-line {
  width: 100%;
  height: 0.75rem;
  margin-bottom: 0.5625rem;
  border-radius: 0.25rem;
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

/* 移动端只留 3 张骨架，与原版 useDisplay().mobile 的 3/6 一致 */
@media (max-width: 600px) {
  .skeleton-card:nth-child(n + 4) {
    display: none;
  }
}

@media (max-width: 700px) {
  .skeleton-container {
    padding: 1.25rem 0.875rem 6.625rem;
  }
}
</style>
