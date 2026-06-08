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

const AI_POLISH_PROXY_PATH = "/api/ai-polish";
const AI_POLISH_UPSTREAM_ENDPOINT = "https://api.tianhw.top/v1/chat/completions";

function aiPolishDevProxy() {
  return {
    name: "classworks-ai-polish-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== AI_POLISH_PROXY_PATH) {
          next();
          return;
        }

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Allow", "POST, OPTIONS");
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED" } }));
          return;
        }

        try {
          const body = await readRequestBody(req);
          const payload = JSON.parse(body || "{}");
          const apiKey = String(payload?.apiKey || "").trim();
          const model = String(payload?.model || "").trim();
          const systemPrompt = String(payload?.systemPrompt || "").trim();
          const userPrompt = String(payload?.userPrompt || "").trim();

          if (!apiKey || !model || !systemPrompt || !userPrompt) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: { code: "AI_POLISH_PROXY_REQUEST_INVALID" } }));
            return;
          }

          const upstreamResponse = await fetch(AI_POLISH_UPSTREAM_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              chat_template_kwargs: { enable_thinking: false },
              reasoning_effort: "low",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
          });

          const responseText = await upstreamResponse.text();
          res.statusCode = upstreamResponse.status;
          res.setHeader(
            "Content-Type",
            upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8"
          );
          res.setHeader("Cache-Control", "no-store");
          res.end(responseText);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: {
                code: "AI_POLISH_NETWORK_ERROR",
                message: error instanceof Error ? error.message : "Unknown proxy error",
              },
            })
          );
        }
      });
    },
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export default defineConfig({
  base: "./",
  plugins: [
    VueRouter(),
    vueDevTools(),
    Layouts(),
    Vue({
      template: { transformAssetUrls },
    }),
    aiPolishDevProxy(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        navigateFallback: "index.html",
        enabled: true,
        suppressWarnings: true,
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
