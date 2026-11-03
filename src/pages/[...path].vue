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
        <Button
          variant="ghost"
          class="btn-tonal"
          @click="$router.back()"
        >
          返回上一页
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup>
// 404 兜底页：不需要状态，单个根元素以便路由过渡动画生效
import { Button } from "@/components/ui/button";
</script>

<style scoped>
.not-found-page {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: 1rem;
}

.not-found-panel {
  width: min(32.5rem, 100%);
  padding: 1.875rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.625rem;
  background: #171717;
  text-align: center;
}

.not-found-code {
  color: rgba(255, 255, 255, 0.42);
  font-size: 4rem;
  font-weight: 900;
  line-height: 1;
}

h1 {
  margin: 0.875rem 0 0.5rem;
  color: #f3f3f3;
  font-size: 1.5rem;
  font-weight: 700;
}

p {
  margin: 0;
  color: rgba(255, 255, 255, 0.62);
}

.not-found-actions {
  display: flex;
  justify-content: center;
  gap: 0.625rem;
  margin-top: 1.375rem;
}

/* 沿用全站按钮观感：实底浅色 / 蓝灰弱化（见 pick-solid 与 SubjectAddCard） */
.btn-flat,
.btn-tonal {
  display: inline-flex;
  width: auto;
  height: auto;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  padding: 0 1.125rem;
  border: 0;
  border-radius: 0.5rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: none;
}

.btn-flat {
  background: #f3f3f3;
  color: #121212;
}

.btn-flat:hover {
  background: #ffffff;
  color: #121212;
}

.btn-tonal {
  background: rgba(174, 191, 221, 0.14);
  color: #aebfdd;
}

.btn-tonal:hover {
  background: rgba(174, 191, 221, 0.22);
  color: #aebfdd;
}
</style>
