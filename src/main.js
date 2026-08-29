import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import { registerPlugins } from "@/plugins";

// dev 不注册 SW：PWA devOptions 已在 vite.config 关闭，dev 下 /sw.js 只会拿到 SPA 回退 HTML 并报 MIME 错
if (import.meta.env.PROD) {
  registerAppServiceWorker();
}

// 请求持久化存储，防浏览器在磁盘压力下清除 IndexedDB/localStorage（教室电脑常见）
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => null);
}

const app = createApp(App);

registerPlugins(app);
app.mount("#app");

function registerAppServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => null);
      }, 60 * 60 * 1000);
    },
  });
}
