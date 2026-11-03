// Classworks Service Worker（injectManifest：预缓存清单由 vite-plugin-pwa 注入）
//
// 架构：单一预缓存 —— 构建产物全部进预缓存（带内容版本号），导航回退到预缓存的
// index.html，更新 = 新 sw.js 原子换入 + 清掉旧版本预缓存。不开运行时缓存。
//
// 关键：强制旧设备换新。教室大屏和装了 PWA 的手机不会自己刷新页面，
// 光 skipWaiting/clientsClaim 只能让新 SW 接管，页面里仍是旧 JS。所以激活时
// 主动 navigate 所有窗口 —— 这是唯一能作用到「已经加载着旧 bundle」的机制。
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

// 注入点：构建时替换成产物清单
precacheAndRoute(self.__WB_MANIFEST);

// 导航一律回退到预缓存的 index.html（SPA 路由）
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// 不等旧 SW 退出，装好立刻接管（配合下方 activate 的强制刷新）
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 先判断是不是「升级」：首次安装（没有任何预缓存）不该强制刷新页面
      const hadCache = (await caches.keys()).length > 0;
      cleanupOutdatedCaches();
      await self.clients.claim();
      if (!hadCache) return;
      // 升级：把所有还开着的旧页面强制重载 → 它们会从新预缓存里取到新版 index.html
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(
        windows.map((client) => client.navigate(client.url).catch(() => null)),
      );
    })(),
  );
});
