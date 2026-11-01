import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import router from "@/router";
import "@/styles/index.css";
import { stripKeyFromUrl } from "@/composables/useAuth";

// dev 不注册 SW：PWA devOptions 已在 vite.config 关闭，dev 下 /sw.js 只会拿到 SPA 回退 HTML 并报 MIME 错
if (import.meta.env.PROD) {
  registerAppServiceWorker();
}

// 请求持久化存储，防浏览器在磁盘压力下清除缓存（教室电脑常开冰点还原，重启即清）
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => null);
}

const app = createApp(App);
app.use(router);
app.mount("#app");

// 路由就绪后再抹 key：提前抹会被 vue-router 的初始导航用原始 URL 覆盖回去
router.isReady().then(stripKeyFromUrl);

function registerAppServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_, registration) {
      if (!registration) return;
      // 教室大屏常驻不关：只靠 1 小时轮询，发版后可能一小时才换上。
      // 回到前台/重新获得焦点时补一次检查（离线时静默失败，不影响使用）。
      const checkUpdate = () => registration.update().catch(() => null);
      setInterval(checkUpdate, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkUpdate();
      });
      window.addEventListener("focus", checkUpdate);
    },
  });
}
