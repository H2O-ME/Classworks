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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devSecret = env.SYNC_SECRET || "";
  // ponytail: 本地 dev mock 代替边缘函数，持久化仅内存（重启丢失），够校验和开发用
  let devCache = null;

  const DATE_KEY_RE = /^\d{8}$/;
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }
  function isValidDates(dates) {
    return isPlainObject(dates) && Object.entries(dates).every(([date, entry]) => DATE_KEY_RE.test(date) && isPlainObject(entry) && isPlainObject(entry.homework) && typeof entry.updatedAt === "string" && Number.isFinite(Date.parse(entry.updatedAt)));
  }

  return {
  base: "./",
  plugins: [
    // 本地开发 mock KV 端点（生产环境由边缘函数提供，无需此插件）
    devSecret ? {
      name: "kv-mock",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const cleanPath = new URL(req.url, "https://local").pathname;
          if (cleanPath !== "/kv/homework") return next();
          if (req.method === "GET" || req.method === "PUT") {
            const secret = req.headers["x-sync-secret"];
            if (!secret || secret !== devSecret) {
              res.statusCode = 401;
              res.setHeader("Content-Type", "application/json; charset=UTF-8");
              return res.end(JSON.stringify({ error: "forbidden" }));
            }
          }
          if (req.method === "GET") {
            res.setHeader("Content-Type", "application/json; charset=UTF-8");
            return res.end(JSON.stringify(devCache ?? { empty: true }));
          }
          if (req.method === "PUT") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
              let payload;
              try { payload = JSON.parse(body); } catch { payload = null; }
              if (!payload || !isValidDates(payload.dates)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json; charset=UTF-8");
                return res.end(JSON.stringify({ error: "missing dates" }));
              }
              const current = isValidDates(devCache?.dates) ? devCache : { dates: {} };
              const merged = { ...current.dates };
              for (const [date, incoming] of Object.entries(payload.dates)) {
                const existing = merged[date];
                if (!existing || Date.parse(incoming.updatedAt) >= Date.parse(existing.updatedAt)) merged[date] = incoming;
              }
              devCache = { savedAt: new Date().toISOString(), dates: merged };
              res.setHeader("Content-Type", "application/json; charset=UTF-8");
              return res.end(JSON.stringify({ savedAt: devCache.savedAt }));
            });
            return;
          }
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json; charset=UTF-8");
          return res.end(JSON.stringify({ error: "method not allowed" }));
        });
      },
    } : null,
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
      includeAssets: ["favicon.ico", "banner.png", "pwa/image/apple-touch-icon-180x180.png", "pwa/image/favicon.ico"],
      strategies: "generateSW",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2,ttf}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === "script",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "scripts-cache",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === "style",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "styles-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages-cache",
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ["/sw-cache-manager.js"],
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
  define: { "process.env": {} },
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
