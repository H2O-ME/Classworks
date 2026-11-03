import { createApp } from "vue";
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
  if (!("serviceWorker" in navigator)) return;

  // 新 SW 接管时旧页面跑的还是旧 JS：直接重载，教室大屏不会有人手动刷新。
  // hadController 为 false（首次安装）时不重载，避免首次访问白刷一次。
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    // updateViaCache:"none"：sw.js 本身绝不吃 HTTP/CDN 缓存，否则永远发现不了新版本
    .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
    .then((registration) => {
      const checkUpdate = () => registration.update().catch(() => null);
      // 教室大屏常驻：光靠 10 分钟轮询太慢，回前台/重新聚焦时补一次
      setInterval(checkUpdate, 10 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkUpdate();
      });
      window.addEventListener("focus", checkUpdate);
      // 进页面先查一次，别让已经开着的页面等满一个轮询周期
      checkUpdate();
    })
    .catch((error) => console.warn("Service Worker 注册失败:", error));
}
