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
// 注意：generateSW 用 define(["./workbox-xxx"]) 加载 workbox 运行时 chunk，属正常；只禁外挂缓存管理器。
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

// 预缓存不得有重复 URL：同 URL 两条 revision 会在更新时互相判定为"未变"，是发版后看到旧资源的另一种根因。
// 曾经的成因：globPatterns 已含 png/ico/webmanifest，同时又开 includeAssets / includeManifestIcons。
const duplicates = [...new Set(entries.filter((url, i) => entries.indexOf(url) !== i))];
assert.deepEqual(duplicates, [], `预缓存清单存在重复 URL: ${duplicates.join(", ")}`);

// 清单里的图标必须与 manifest 引用的图标一致：manifest 指向不存在的图标时，
// PWA 安装/更新会拿不到图标（iOS/Chrome 表现为白色占位图）。
const manifest = JSON.parse(readFileSync(new URL("../dist/manifest.webmanifest", import.meta.url), "utf8"));
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest 没有图标");
for (const icon of manifest.icons) {
  const iconPath = icon.src.replace(/^\//, "");
  assert.ok(existsSync(new URL(iconPath, distRoot)), `manifest 图标不存在: ${icon.src}`);
  assert.ok(entries.includes(iconPath), `manifest 图标不在预缓存清单里: ${icon.src}`);
}

// 已经没有任何东西引用的旧图标不应继续躺在产物里（曾出现 -v2 与无 -v2 两套同图重复，容易误改错文件）
for (const stale of ["pwa/image/logo.svg", "pwa/image/favicon.ico"]) {
  assert.ok(!existsSync(new URL(stale, distRoot)), `产物里残留已废弃资源: ${stale}`);
}

console.log(`pwa-check OK: ${entries.length} 个预缓存条目（无重复），架构为纯预缓存 + 导航回退`);
