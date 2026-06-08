<template>
  <v-container class="not-found-page">
    <section class="not-found-panel">
      <div class="not-found-code">404</div>
      <h1>页面不存在</h1>
      <p>这个地址没有可用页面，可能是旧功能已经被移除。</p>
      <div class="not-found-actions">
        <v-btn color="primary" variant="flat" to="/">返回首页</v-btn>
        <v-btn variant="tonal" @click="$router.back()">返回上一页</v-btn>
      </div>
    </section>
  </v-container>
</template>

<script>
export default {
  name: "NotFoundPage",
};
</script>

<style scoped>
.not-found-page {
  display: grid;
  min-height: 100dvh;
  place-items: center;
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
</style>
