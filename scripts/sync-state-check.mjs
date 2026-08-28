// 自检：localStorage 被系统回收后，从 IndexedDB 镜像回填同步密钥的纯逻辑。
// 运行：node scripts/sync-state-check.mjs
import assert from "node:assert";
import { applyRestoredState, restoreSyncState } from "../src/utils/sync.js";

const SECRET_KEY = "classworks_sync_secret";
const ENABLED_KEY = "classworks_sync_enabled";

const fakeStorage = (init = {}) => {
  const map = { ...init };
  return {
    getItem: (key) => (key in map ? map[key] : null),
    setItem: (key, value) => {
      map[key] = String(value);
    },
    _map: map,
  };
};

// 1. localStorage 被清空（密钥 + 开关都丢）→ 全部回填
const s1 = fakeStorage();
assert.strictEqual(applyRestoredState({ secret: "abc123", enabled: true }, s1), true);
assert.strictEqual(s1.getItem(SECRET_KEY), "abc123");
assert.strictEqual(s1.getItem(ENABLED_KEY), "1");

// 2. 只丢了开关 → 只回填开关，不覆盖现存的密钥
const s2 = fakeStorage({ [SECRET_KEY]: "keep" });
assert.strictEqual(applyRestoredState({ secret: "other", enabled: true }, s2), true);
assert.strictEqual(s2.getItem(SECRET_KEY), "keep");

// 3. localStorage 完好 → 什么都不动
const s3 = fakeStorage({ [SECRET_KEY]: "abc", [ENABLED_KEY]: "1" });
assert.strictEqual(applyRestoredState({ secret: "abc", enabled: true }, s3), false);

// 4. 镜像本身为空（用户主动清除过）→ 不得复活密钥
const s4 = fakeStorage();
assert.strictEqual(applyRestoredState({ secret: "", enabled: false }, s4), false);
assert.strictEqual(applyRestoredState(null, s4), false);
assert.strictEqual(s4.getItem(SECRET_KEY), null);

// 5. 开关关但密钥在镜像里 → 只回填密钥（同步仍保持关闭）
const s5 = fakeStorage();
assert.strictEqual(applyRestoredState({ secret: "abc", enabled: false }, s5), true);
assert.strictEqual(s5.getItem(SECRET_KEY), "abc");
assert.strictEqual(s5.getItem(ENABLED_KEY), null);

// 6. 非浏览器环境（无 window/IDB，localStorage 可能直接抛异常）→ 静默返回，不得炸启动路径
await restoreSyncState();

console.log("sync-state-check: 全部通过");
