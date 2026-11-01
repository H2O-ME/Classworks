<template>
  <div class="not-found-page">
    <section class="not-found-panel">
      <div class="not-found-code">
        404
      </div>
      <h1>页面不存在</h1>
      <p>这个地址没有可用页面，可能是旧功能已经被移除。</p>
      <div class="not-found-actions">
        <router-link
          class="btn-flat"
          to="/"
        >
          返回首页
        </router-link>
        <button
          type="button"
          class="btn-tonal"
          @click="$router.back()"
        >
          返回上一页
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
// 404 兜底页：不需要状态，单个根元素以便路由过渡动画生效
</script>

<style scoped>
.not-found-page {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: 16px;
}

.not-found-panel {
  width: min(520px, 100%);
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: #171717;
  text-align: center;
}

.not-found-code {
  color: rgba(255, 255, 255, 0.42);
  font-size: 64px;
  font-weight: 900;
  line-height: 1;
}

h1 {
  margin: 14px 0 8px;
  color: #f3f3f3;
  font-size: 24px;
  font-weight: 700;
}

p {
  margin: 0;
  color: rgba(255, 255, 255, 0.62);
}

.not-found-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

/* 原版 v-btn color=primary variant=flat / variant=tonal 的观感 */
.btn-flat,
.btn-tonal {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.btn-flat {
  background: #2196f3;
  color: #ffffff;
}

.btn-flat:hover {
  background: #42a5f5;
}

.btn-tonal {
  background: rgba(33, 150, 243, 0.14);
  color: #90caf9;
}

.btn-tonal:hover {
  background: rgba(33, 150, 243, 0.22);
}
</style>
