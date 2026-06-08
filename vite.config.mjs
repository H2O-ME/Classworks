import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Layouts from "vite-plugin-vue-layouts";
import Vue from "@vitejs/plugin-vue";
import VueRouter from "unplugin-vue-router/vite";
import Vuetify, { transformAssetUrls } from "vite-plugin-vuetify";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig({
  base: "./",
  plugins: [
    VueRouter(),
    vueDevTools(),
    Layouts(),
    Vue({
      template: { transformAssetUrls },
    }),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        navigateFallback: "index.html",
        enabled: false,
        suppressWarnings: true,
      },
      lang: "zh-CN",
      injectRegister: "auto",
      strategies: "generateSW",
      workbox: {
        globPatterns: ["*"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "assets-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/pwa/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "pwa-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => {
              if (!sameOrigin) return false;
              const path = url.pathname;
              return !(path.includes("/assets/") || path.includes("/pwa/"));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "other-resources",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        additionalManifestEntries: [],
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ["/sw-cache-manager.js"],
      },
      manifest: {
        name: "Classworks 作业板",
        short_name: "Classworks",
        description: "记录、查看并同步作业",
        theme_color: "#212121",
        background_color: "#212121",
        display: "standalone",
        start_url: "./",
        edge_side_panel: {
          default_path: "./",
        },
        icons: [
          {
            src: "./pwa/image/pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "./pwa/image/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "./pwa/image/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "./pwa/image/maskable-icon-512x512.png",
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
        enabled: true,
      },
      vueTemplate: true,
    }),
  ],
  define: { "process.env": {} },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    extensions: [".js", ".json", ".jsx", ".mjs", ".ts", ".tsx", ".vue"],
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
});
