// PWA 产物自检：构建后运行（node scripts/pwa-check.mjs），断言 sw.js 架构不回退。
// 防的回归：有人重新加入 runtimeCaching（旧 HTML/JS 残留的根因）或 importScripts 外挂脚本。
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const swPath = new URL("../dist/sw.js", import.meta.url);
assert.ok(existsSync(swPath), "dist/sw.js 不存在，先运行 pnpm build");
const sw = readFileSync(swPath, "utf8");

// 单一预缓存架构：导航走预缓存 index.html，旧版本预缓存自动清理，立即接管
assert.match(sw, /NavigationRoute/, "缺少 navigateFallback 导航回退");
assert.match(sw, /cleanupOutdatedCaches/, "缺少旧预缓存清理");
assert.match(sw, /skipWaiting/, "缺少 skipWaiting");
assert.match(sw, /clientsClaim/, "缺少 clientsClaim");
assert.match(sw, /"index.html"/, "预缓存清单缺少 index.html");
assert.match(sw, /manifest\.webmanifest/, "预缓存清单缺少 manifest.webmanifest");

// 不得出现运行时缓存与外挂脚本（旧架构残留，会导致换新版本后仍看到老 UI）。
// 注意：generateSW 自身会用 importScripts 加载 workbox 运行时 chunk，只禁外挂的 sw-cache-manager。
for (const banned of ["scripts-cache", "styles-cache", "images-cache", "pages-cache", "sw-cache-manager"]) {
  assert.ok(!sw.includes(banned), `sw.js 不应包含 ${banned}`);
}

// 预缓存里的每个 URL 都不应指向已不存在的文件（precache 404 会导致新 SW 安装失败、旧 SW 永远占坑）
const distRoot = new URL("../dist/", import.meta.url);
const entries = [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]);
assert.ok(entries.length > 0, "预缓存清单为空");
for (const url of entries) {
  assert.ok(existsSync(new URL(url, distRoot)), `预缓存文件缺失: ${url}`);
}

console.log(`pwa-check OK: ${entries.length} 个预缓存条目，架构为纯预缓存 + 导航回退`);
