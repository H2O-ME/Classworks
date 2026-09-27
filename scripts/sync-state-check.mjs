// 自检：云端同步的"默认开启、仅显式关闭才关"语义。
// 运行：node scripts/sync-state-check.mjs
import assert from "node:assert";

// sync.js 依赖 localStorage；node 里给一个最小替身（模块顶层不再有副作用）
const map = new Map();
globalThis.localStorage = {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
  removeItem: (key) => map.delete(key),
};
// 用 Node 内置 EventTarget 当 window，真实走 addEventListener/dispatchEvent 路径
const win = new globalThis.EventTarget();
win.Event = globalThis.Event;
globalThis.window = win;

const { getSyncEnabled, setSyncEnabled, watchSyncState } = await import("../src/utils/sync.js");

const ENABLED_KEY = "classworks_sync_enabled";

// 1. 全新设备（localStorage 里什么都没有）→ 默认开启
map.clear();
assert.strictEqual(getSyncEnabled(), true, "新设备应默认开启同步");

// 2. 显式关闭 → 关闭
setSyncEnabled(false);
assert.strictEqual(getSyncEnabled(), false, "关闭后应保持关闭");
assert.strictEqual(map.get(ENABLED_KEY), "0");

// 3. 重新开启 → 开启
setSyncEnabled(true);
assert.strictEqual(getSyncEnabled(), true, "开启后应恢复同步");

// 4. 旧版本残留的脏值不当作"关闭"
map.set(ENABLED_KEY, "");
assert.strictEqual(getSyncEnabled(), true, "空串应视为默认开启");

// 5. 开关变化通过事件广播给订阅方
map.clear();
const seen = [];
const unsubscribe = watchSyncState(({ enabled }) => seen.push(enabled));
setSyncEnabled(false);
unsubscribe();
setSyncEnabled(true);
assert.deepStrictEqual(seen, [true, false], "订阅应收到初始值 + 一次关闭，取消订阅后不再收到");

// 6. 订阅回调不携带任何密钥字段（无鉴权设计）
const keys = [];
const unsub2 = watchSyncState((state) => keys.push(...Object.keys(state)));
unsub2();
assert.deepStrictEqual(keys, ["enabled"], "同步状态只暴露 enabled");

console.log("sync-state-check: 全部通过");
