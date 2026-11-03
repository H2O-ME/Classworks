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
assert.match(sw, /clients\.claim/, "缺少 clients.claim（新 SW 要立刻接管旧页面）");
assert.match(sw, /"index.html"/, "预缓存清单缺少 index.html");
assert.match(sw, /manifest\.webmanifest/, "预缓存清单缺少 manifest.webmanifest");

// 强制旧设备换新：升级激活后必须主动重载还开着的窗口，否则教室大屏永远跑旧 JS。
// 这是 injectManifest 自写 SW 的核心目的，回退成 generateSW 或删掉这段就等于放弃强制更新。
assert.match(sw, /clients\.navigate|\.navigate\(/, "缺少「升级后强制重载旧页面」逻辑（clients.navigate）");
assert.match(sw, /matchAll\(\{\s*type:\s*"window"\s*\}\)/, "缺少对窗口客户端的枚举（clients.matchAll）");
assert.ok(!sw.includes("__WB_MANIFEST"), "预缓存清单未注入（还是 self.__WB_MANIFEST 占位符）");

// 不得出现运行时缓存与外挂脚本（旧架构残留，会导致换新版本后仍看到老 UI）。
// 注意：generateSW 用 define(["./workbox-xxx"]) 加载 workbox 运行时 chunk，属正常；只禁外挂缓存管理器。
for (const banned of ["scripts-cache", "styles-cache", "images-cache", "pages-cache", "sw-cache-manager"]) {
  assert.ok(!sw.includes(banned), `sw.js 不应包含 ${banned}`);
}

// 预缓存里的每个 URL 都不应指向已不存在的文件（precache 404 会导致新 SW 安装失败、旧 SW 永远占坑）
const distRoot = new URL("../dist/", import.meta.url);
// sw.js 不压缩，注入清单是 {"revision":...,"url":"..."} 形式；只取 url 字段即可
const entries = [...sw.matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1]);
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

// 回归守卫：start_url 必须带 ?key=，否则装出来的 PWA 图标点开是只读的。
// 踩过的坑：start_url 曾是裸 "./"，讲台双击桌面图标永远没有编辑权，
// 只能改用「创建快捷方式」绕，PWA 装了等于白装。
{
  const url = new URL(manifest.start_url, "https://example.com/");
  const key = url.searchParams.get("key");
  assert.ok(key, `manifest.start_url 必须带 ?key= 白板口令（当前 ${manifest.start_url}）`);
  assert.ok(
    url.origin + url.pathname === "https://example.com/",
    `start_url 应指向站点根路径，当前 ${manifest.start_url}`,
  );
}

for (const icon of manifest.icons) {
  const iconPath = icon.src.replace(/^\//, "");
  assert.ok(existsSync(new URL(iconPath, distRoot)), `manifest 图标不存在: ${icon.src}`);
  assert.ok(entries.includes(iconPath), `manifest 图标不在预缓存清单里: ${icon.src}`);
}

// 已经没有任何东西引用的旧图标不应继续躺在产物里（曾出现 -v2 与无 -v2 两套同图重复，容易误改错文件）
for (const stale of ["pwa/image/logo.svg", "pwa/image/favicon.ico"]) {
  assert.ok(!existsSync(new URL(stale, distRoot)), `产物里残留已废弃资源: ${stale}`);
}

// 注册侧守卫：sw.js 必须带 updateViaCache:"none"，否则 CDN/浏览器缓存住 sw.js 后
// 永远发现不了新版本 —— 这是「换了版设备还停在旧版」的另一条根因。
{
  const { readdirSync } = await import("node:fs");
  const assetsDir = new URL("../dist/assets/", import.meta.url);
  const bundles = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
  const hit = bundles.some((name) => readFileSync(new URL(name, assetsDir), "utf8").includes("updateViaCache"));
  assert.ok(hit, '构建产物里找不到 updateViaCache:"none"（main.js 的 SW 注册被改坏了）');
}

console.log(`pwa-check OK: ${entries.length} 个预缓存条目（无重复），纯预缓存 + 导航回退 + 升级强制重载`);
