import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Layouts from "vite-plugin-vue-layouts";
import Vue from "@vitejs/plugin-vue";
import VueRouter from "unplugin-vue-router/vite";
import Vuetify, { transformAssetUrls } from "vite-plugin-vuetify";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";
import vueDevTools from "vite-plugin-vue-devtools";
import { isPlainObject, normalizeCloudDoc } from "./src/utils/syncProtocol.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // 本地直连云端 KV：设置 DEV_KV_PROXY（如 https://classworks.tianhw.top）后，
  // 本地 /kv/homework 请求转发到云端，开发即联调真实数据；未设置则用下方内存 mock 隔离。
  const devKvProxy = env.DEV_KV_PROXY || "";
  // ponytail: 本地 dev mock 代替边缘函数，持久化仅内存（重启丢失），够开发用
  let devCache = null;

  function isValidChanges(changes) {
    return isPlainObject(changes) && Object.entries(changes).every(([key, cell]) => (
      typeof key === "string" && key.includes("|")
      && isPlainObject(cell) && typeof cell.content === "string" && isPlainObject(cell.options)
    ));
  }

  // 读取请求体为 Buffer（转发云端时原样透传）
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  return {
  base: "./",
  plugins: [
    // 本地开发 KV 端点：配了 DEV_KV_PROXY 则转发云端，否则走内存 mock（生产环境由边缘函数提供，无需此插件）
    {
      name: "kv-mock",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const cleanPath = new URL(req.url, "https://local").pathname;
          if (cleanPath !== "/kv/homework") return next();
          // 直连模式：把请求整体转发到云端，浏览器同源访问、由 vite 服务端代理（无 CORS 问题）
          if (devKvProxy) {
            const targetUrl = new URL(req.url, devKvProxy.endsWith("/") ? devKvProxy : `${devKvProxy}/`);
            const method = req.method;
            const headers = Object.fromEntries(
              Object.entries(req.headers).filter(([k]) => !["host", "connection", "content-length"].includes(k)),
            );
            return readBody(req).then((bodyBuf) => {
              fetch(targetUrl.toString(), {
                method,
                headers,
                body: method === "PUT" ? bodyBuf : undefined,
              }).then((upRes) => upRes.arrayBuffer().then((buf) => {
                res.statusCode = upRes.status;
                for (const [k, v] of upRes.headers) {
                  if (!["connection", "transfer-encoding"].includes(k.toLowerCase())) res.setHeader(k, v);
                }
                res.end(Buffer.from(buf));
              })).catch((err) => {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json; charset=UTF-8");
                res.end(JSON.stringify({ error: `proxy failed: ${err.message}` }));
              });
            });
          }
          // 无鉴权：读写端点不做任何密钥校验
          if (req.method === "GET") {
            res.setHeader("Content-Type", "application/json; charset=UTF-8");
            return res.end(JSON.stringify({ v: 3, entries: normalizeCloudDoc(devCache).entries }));
          }
          if (req.method === "PUT") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
              let payload;
              try { payload = JSON.parse(body); } catch { payload = null; }
              if (!payload || !isValidChanges(payload.changes)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json; charset=UTF-8");
                return res.end(JSON.stringify({ error: "missing changes" }));
              }
              // 读当前（旧格式惰性转 v3）→ 逐条覆盖 → 写回 → 返回合并后完整文档
              const merged = { ...normalizeCloudDoc(devCache).entries };
              for (const [key, cell] of Object.entries(payload.changes)) {
                merged[key] = { content: String(cell.content), options: isPlainObject(cell.options) ? cell.options : {} };
              }
              devCache = { v: 3, savedAt: new Date().toISOString(), entries: merged };
              res.setHeader("Content-Type", "application/json; charset=UTF-8");
              return res.end(JSON.stringify(devCache));
            });
            return;
          }
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json; charset=UTF-8");
          return res.end(JSON.stringify({ error: "method not allowed" }));
        });
      },
    },
    VueRouter(),
    vueDevTools(),
    Layouts(),
    Vue({
      template: { transformAssetUrls },
    }),
    VitePWA({
      registerType: "autoUpdate",
      // dev SW 关闭：开启时 dev service worker 会拦截 .vue/.sass 等模块请求，
      // 缓存错乱时回退 index.html(text/html)，触发 "Expected JavaScript-or-Wasm module but got text/html" 严格 MIME 报错。
      // 需要测试 PWA 时用 `pnpm build && pnpm preview`。
      devOptions: {
        enabled: false,
      },
      injectRegister: "auto",
      // globPatterns 已经把 dist 里所有 png/ico/svg/webmanifest 收进预缓存（public/ 会被原样拷进 dist），
      // 再开 includeAssets / includeManifestIcons 只是把同一批文件重复登记一遍：55 条里有 10 条是重复 URL。
      includeAssets: [],
      includeManifestIcons: false,
      strategies: "generateSW",
      workbox: {
        // 单一架构：全部构建产物进预缓存（带内容版本号），导航回退到预缓存的 index.html。
        // 更新 = 新 sw.js 原子换入，cleanupOutdatedCaches 清掉旧版本预缓存。
        // 不要加 runtimeCaching：哈希产物已在预缓存里，重复缓存只会制造旧 HTML/JS 残留。
        // webmanifest 不在其中：插件已按内容哈希单独登记，重复登记会产生两条同 URL 条目。
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}"],
        navigateFallback: "index.html",
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        id: "/",
        name: "Classworks \u4f5c\u4e1a\u677f",
        short_name: "Classworks",
        description: "\u8bb0\u5f55\u3001\u67e5\u770b\u5e76\u540c\u6b65\u4f5c\u4e1a",
        lang: "zh-CN",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "/pwa/image/pwa-64x64-v2.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "/pwa/image/pwa-192x192-v2.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa/image/pwa-256x256-v2.png",
            sizes: "256x256",
            type: "image/png",
          },
          {
            src: "/pwa/image/pwa-512x512-v2.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa/image/maskable-icon-512x512-v2.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    Vuetify({
      autoImport: true,
      styles: {
        configFile: "src/styles/settings.scss",
       sass: {
          api: "modern",
        },
      },
    }),
    Components({
      directoryAsNamespace: false,
      globs: ["src/components/**/[A-Z]*.vue"],
      exclude: [/pages\/index\.vue$/],
    }),
    AutoImport({
      imports: ["vue", "vue-router"],
      eslintrc: {
        enabled: false,
      },
      vueTemplate: true,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    extensions: [".js", ".json", ".mjs", ".vue"],
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-vue": ["vue", "vue-router"],
          "vendor-vuetify": ["vuetify"],
        },
      },
    },
  },
  server: {
    port: 3031,
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern",
        silenceDeprecations: ["legacy-js-api"],
      },
    },
  },
  };
});
