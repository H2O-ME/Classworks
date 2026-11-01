import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Layouts from "vite-plugin-vue-layouts";
import Vue from "@vitejs/plugin-vue";
import VueRouter from "unplugin-vue-router/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), "");
  return {
    base: "./",
    plugins: [
      VueRouter(),
      vueDevTools(),
      Layouts(),
      Vue(),
      VitePWA({
        registerType: "autoUpdate",
        // dev SW 关闭：开启时 dev service worker 会拦截 .vue/.css 等模块请求，
        // 缓存错乱时回退 index.html(text/html)，触发 "Expected JavaScript-or-Wasm module but got text/html" 严格 MIME 报错。
        devOptions: {
          enabled: false,
        },
        injectRegister: "auto",
        // globPatterns 已经把 dist 里所有 png/ico/svg/webmanifest 收进预缓存，再开 includeAssets 只会重复登记
        includeAssets: [],
        includeManifestIcons: false,
        strategies: "generateSW",
        workbox: {
          // 单一架构：全部构建产物进预缓存（带内容版本号），导航回退到预缓存的 index.html。
          // 更新 = 新 sw.js 原子换入，cleanupOutdatedCaches 清掉旧版本预缓存。
          // 首页不需要 banner.jpg（只给社交分享用），用 globIgnores 剔出预缓存，省 39KB 首装流量
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,woff,woff2,ttf}"],
          globIgnores: ["banner.jpg"],
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
          theme_color: "#09090b",
          background_color: "#09090b",
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
      Icons({ compiler: "vue3" }),
      Components({
        directoryAsNamespace: false,
        globs: ["src/components/**/[A-Z]*.vue"],
        // <i-mdi-plus /> → 编译期内联 SVG，不加载图标字体、不联网
        resolvers: [IconsResolver()],
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
    // 希沃白板/老旧安卓微信 WebView：语法与 CSS 都压到 es2018 一线
    build: {
      target: ["es2018", "chrome70", "ios12"],
      cssTarget: ["es2018", "chrome70", "ios12"],
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-vue": ["vue", "vue-router"],
          },
        },
      },
    },
    server: {
      port: 3031,
    },
  };
});
