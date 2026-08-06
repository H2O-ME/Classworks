# 云端备份与定时同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Classworks 作业看板加云端备份 + 定时同步：单 KV 键存全部作业，读写需 `x-sync-secret` 密钥，时间戳 last-write-wins，拉取前本地快照可回退。

**Architecture:** 新增 `edge-functions/kv/homework.js` 提供 GET/PUT 整包 API（V8 运行时 + 全局变量 `homework_kv`，单一键 `classworks_homework`）。前端新增 `src/utils/syncMerge.js`（纯函数：日期级合并）与 `src/utils/sync.js`（IO 层：密钥、拉取、推送、定时）。`storage.js` 加快照方法。`settings.vue` 加密钥输入。`index.vue` 挂定时同步、保存后同步、提示框、回退对话框。`middleware.js` 放行 `/kv/`。

**Tech Stack:** EdgeOne Pages Edge Functions + KV Storage、Vue 3 (Options API)、idb (IndexedDB)、localStorage。

**Spec:** `docs/superpowers/specs/2026-08-06-cloud-sync-backup-design.md`

---

## 全局约定

- 所有 Edge Function 代码遵循 V8 约束：无 npm、无 Node 内置模块；`Response.json()` 不可用，一律 `new Response(JSON.stringify(...), { headers: { 'Content-Type': 'application/json; charset=UTF-8' } })`
- KV 是**全局变量** `homework_kv`（控制台已绑定 namespace `classwork`），不是 `context.env.homework_kv`
- 密钥：环境变量 `SYNC_SECRET`（控制台已设）；前端存 `localStorage['classworks_sync_secret']`；请求头 `x-sync-secret`
- 时间戳归属：每日期 `updatedAt` 由客户端携带（本地编辑时间），服务端只盖章整包 `savedAt`
- 本地数据键：`classworks-data-{date}`；meta 键：`classworks-meta-{date}`（`{ updatedAt: number }` epoch ms）；快照键：`classworks-data-{date}-bk-{ts}`
- 自检脚本（ponytail 规则）：`scripts/sync-check.mjs`，node 直接跑、无框架，用 `assert` 断言 `syncMerge.js` 的纯逻辑

---

### Task 1: 后端 Edge Function — GET/PUT 整包 API

**Files:**
- Create: `edge-functions/kv/homework.js`
- Test: 本地无 KV 环境时用手动 curl 验证；逻辑自检留到 Task 4（前端纯函数）

**目标**：`/kv/homework` 提供 `GET`（读整包）与 `PUT`（写整包），均校验 `x-sync-secret` 头。

- [ ] **Step 1: 创建 `edge-functions/kv/homework.js`**

```js
// EdgeOne Pages Edge Function (V8)。单一 KV 键 classworks_homework 存全部作业。
// GET /kv/homework  → 读整包 { savedAt, dates: { date: { homework, updatedAt } } } 或 { empty: true }
// PUT /kv/homework  → 写整包（body: { dates }），服务端盖章 savedAt

const KV_KEY = "classworks_homework";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

function isAuthorized(context) {
  const secret = context.request.headers.get("x-sync-secret");
  return !!secret && secret === context.env.SYNC_SECRET;
}

export async function onRequestGet(context) {
  if (!isAuthorized(context)) {
    return json({ error: "forbidden" }, 401);
  }

  const doc = await homework_kv.get(KV_KEY, "json");
  return json(doc ?? { empty: true });
}

export async function onRequestPut(context) {
  if (!isAuthorized(context)) {
    return json({ error: "forbidden" }, 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (!body || typeof body.dates !== "object" || body.dates === null) {
    return json({ error: "missing dates" }, 400);
  }

  const savedAt = new Date().toISOString();
  await homework_kv.put(KV_KEY, JSON.stringify({ savedAt, dates: body.dates }));
  return json({ savedAt });
}
```

- [ ] **Step 2: 手动验证（需 `edgeone pages link` + `edgeone pages dev`）**

```bash
export PAGES_SOURCE=skills
edgeone pages link
edgeone pages dev   # 起在 8088
```

```bash
# 无密钥 → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/kv/homework
# 预期: 401

# 带密钥 GET → 200 且为 { empty: true }
curl -s -H "x-sync-secret: $SYNC_SECRET" http://localhost:8088/kv/homework
# 预期: {"empty":true}
```

> 若本地无 `SYNC_SECRET` 环境变量，可先部署后对线上 URL 验证（见 Task 7）。本任务通过标准即代码正确、格式遵循技能约束。

- [ ] **Step 3: Commit**

```bash
git add edge-functions/kv/homework.js
git commit -m "feat: 云端同步后端 API（KV 整包读写 + 密钥校验）"
```

---

### Task 2: middleware 放行 `/kv/`

**Files:**
- Modify: `middleware.js:7`（matcher 正则）、`middleware.js:17`（bypassPrefixes）

**问题**：`/kv/homework` 会被 SPA 回退 rewrite 成 `index.html`，导致 API 404。

- [ ] **Step 1: matcher 正则加入 `kv`**

把第 7 行 `"/((?!api|src|node_modules|...` 中的 `api|` 改为 `api|kv|`：

```js
  matcher: [
    "/((?!api|kv|src|node_modules|@vite|@fs|@id|assets|pwa|sw\\.js|sw-cache-manager\\.js|favicon|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.woff|.*\\.woff2|.*\\.ttf|.*\\.webmanifest|.*\\.js|.*\\.css|.*\\.sass|.*\\.scss).*)",
  ],
```

- [ ] **Step 2: bypassPrefixes 加入 `"/kv/"`**

```js
  const bypassPrefixes = ["/api/", "/kv/", "/src/", "/node_modules/", "/@vite/", "/@fs/", "/@id/"];
```

- [ ] **Step 3: Commit**

```bash
git add middleware.js
git commit -m "fix: middleware 放行 /kv/ 路径，避免 SPA 回退吞掉同步 API"
```

---

### Task 3: `storage.js` — 快照 + 前缀枚举 + meta 读写

**Files:**
- Modify: `src/utils/storage.js`（追加函数，不动现有 `getData`/`setData`）

**目标**：`getKeysByPrefix` 枚举本地日期/快照键；`snapshotDate`/`listSnapshots`/`restoreSnapshot` 做回退；`getMeta`/`setMeta` 读写每日期同步时间戳。

- [ ] **Step 1: 在文件末尾追加以下函数**

```js
const SNAPSHOT_KEEP = 5;

export async function getKeysByPrefix(prefix) {
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_NAME);
    return keys.filter((key) => typeof key === "string" && key.startsWith(prefix)).sort();
  } catch (error) {
    console.error("getKeysByPrefix error:", error);
    return [];
  }
}

export async function snapshotDate(date) {
  const current = await getData(`classworks-data-${date}`);
  if (!current) return null;

  const ts = Date.now();
  await setData(`classworks-data-${date}-bk-${ts}`, current);

  // 每日期只留最近 5 份快照（ponytail: 用 listKeys 轮换，O(n) 已足够）
  const snapshots = await getKeysByPrefix(`classworks-data-${date}-bk-`);
  const excess = snapshots.length - SNAPSHOT_KEEP;
  if (excess > 0) {
    const db = await getDB();
    await Promise.all(snapshots.slice(0, excess).map((key) => db.delete(STORE_NAME, key)));
  }
  return ts;
}

export async function listSnapshots(date) {
  const keys = await getKeysByPrefix(`classworks-data-${date}-bk-`);
  return keys.map((key) => Number(key.split("-bk-").pop())).filter(Number.isFinite);
}

export async function restoreSnapshot(date, ts) {
  const data = await getData(`classworks-data-${date}-bk-${ts}`);
  if (!data) return false;
  return setData(`classworks-data-${date}`, data);
}

export async function getMeta(date) {
  const meta = await getData(`classworks-meta-${date}`);
  return meta?.updatedAt ?? 0;
}

export async function setMeta(date, updatedAt) {
  return setData(`classworks-meta-${date}`, { updatedAt });
}
```

- [ ] **Step 2: 运行 lint（确认无格式/未定义问题）**

```bash
pnpm lint
# 预期: 无错误输出（--fix 会自动修格式）
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.js
git commit -m "feat: storage 增加快照/前缀枚举/meta 读写，支撑同步回退"
```

---

### Task 4: `syncMerge.js` 纯函数 + 自检脚本（TDD）

**Files:**
- Create: `src/utils/syncMerge.js`
- Test: `scripts/sync-check.mjs`

**目标**：日期级 last-write-wins 合并逻辑抽成纯函数（无 IO、无依赖），方便 node 自检。

- [ ] **Step 1: 写自检脚本（先红）**

创建 `scripts/sync-check.mjs`：

```js
import assert from "node:assert/strict";
import { mergeDates } from "../src/utils/syncMerge.js";

// 场景 1: 云端该日期更新 → 应拉取
{
  const r = mergeDates({
    cloud: { "20260806": { homework: { a: "云" }, updatedAt: "2026-08-06T10:00:00.000Z" } },
    local: { "20260806": { homework: { a: "本" } } },
    meta: { "20260806": Date.parse("2026-08-06T09:00:00.000Z") },
  });
  assert.deepEqual(r.pulled, ["20260806"]);
  assert.deepEqual(r.pushed, []);
  assert.equal(r.merged["20260806"].homework.a, "云");
}

// 场景 2: 本地该日期更新 → 应推送
{
  const r = mergeDates({
    cloud: { "20260806": { homework: { a: "云" }, updatedAt: "2026-08-06T09:00:00.000Z" } },
    local: { "20260806": { homework: { a: "本" } } },
    meta: { "20260806": Date.parse("2026-08-06T11:00:00.000Z") },
  });
  assert.deepEqual(r.pulled, []);
  assert.deepEqual(r.pushed, ["20260806"]);
  assert.equal(r.merged["20260806"].homework.a, "本");
  assert.equal(r.merged["20260806"].updatedAt, "2026-08-06T11:00:00.000Z");
}

// 场景 3: 云端无该日期、本地有 → 应推送（首次备份，无 meta 视为 0，用 now 盖章）
{
  const now = "2026-08-07T08:00:00.000Z";
  const r = mergeDates({
    cloud: {},
    local: { "20260807": { homework: { a: "本" } } },
    meta: {},
    now,
  });
  assert.deepEqual(r.pushed, ["20260807"]);
  assert.deepEqual(r.pulled, []);
  assert.equal(r.merged["20260807"].homework.a, "本");
  // 关键: 首次备份的 updatedAt 必须是 now，不能是 1970（否则另一台无 meta 的设备 0>0 不成立，永不拉取）
  assert.equal(r.merged["20260807"].updatedAt, now);
}

// 场景 3b: 设备 B 无本地数据、无 meta，云端有真实时间戳 → 应拉取
{
  const r = mergeDates({
    cloud: { "20260807": { homework: { a: "云" }, updatedAt: "2026-08-07T08:00:00.000Z" } },
    local: {},
    meta: {},
  });
  assert.deepEqual(r.pulled, ["20260807"]);
  assert.deepEqual(r.pushed, []);
  assert.equal(r.merged["20260807"].homework.a, "云");
}

// 场景 4: 两端一致 → 不拉不推
{
  const r = mergeDates({
    cloud: { "20260806": { homework: { a: "x" }, updatedAt: "2026-08-06T10:00:00.000Z" } },
    local: { "20260806": { homework: { a: "x" } } },
    meta: { "20260806": Date.parse("2026-08-06T10:00:00.000Z") },
  });
  assert.deepEqual(r.pulled, []);
  assert.deepEqual(r.pushed, []);
  assert.equal(r.merged["20260806"].homework.a, "x");
}

// 场景 5: 空输入 → 空结果
{
  const r = mergeDates({ cloud: {}, local: {}, meta: {} });
  assert.deepEqual(r.pulled, []);
  assert.deepEqual(r.pushed, []);
  assert.deepEqual(r.merged, {});
}

console.log("syncMerge 自检通过: 6 个场景");
```

- [ ] **Step 2: 运行自检，确认失败**

```bash
node scripts/sync-check.mjs
# 预期: 报错（Cannot find module ../src/utils/syncMerge.js 或函数未导出）
```

- [ ] **Step 3: 实现 `src/utils/syncMerge.js`**

```js
// 日期级 last-write-wins 合并（纯函数，无 IO）。
// cloud: { date: { homework, updatedAt } }（updatedAt 为 ISO 字符串）
// local: { date: { homework } }（本地 IndexedDB 中 normalize 后的数据）
// meta:  { date: epochMs }（本地最后保存/同步时间；无 meta 为 0）
// now:   ISO 字符串，仅用于"首次备份"（本地有、云端无、无 meta）时盖章，
//        避免 new Date(0) 生成 1970 导致其他设备 0>0 不成立、永不拉取。
// 返回 { pulled, pushed, merged }：
//   pulled — 云端更新被采纳的日期（调用方需快照本地后覆写）
//   pushed — 本地更新需要推送的日期
//   merged — 合并后的整包（推送用）

export function mergeDates({ cloud, local, meta, now = new Date().toISOString() }) {
  const dates = new Set([...Object.keys(cloud), ...Object.keys(local)]);
  const pulled = [];
  const pushed = [];
  const merged = {};

  for (const date of dates) {
    const cloudEntry = cloud[date];
    const localEntry = local[date];
    const cloudTime = cloudEntry ? Date.parse(cloudEntry.updatedAt) : -1;
    const localTime = meta[date] ?? 0;

    if (cloudEntry && cloudTime > localTime) {
      pulled.push(date);
      merged[date] = { homework: cloudEntry.homework, updatedAt: cloudEntry.updatedAt };
    } else if (localEntry && !cloudEntry) {
      pushed.push(date);
      merged[date] = { homework: localEntry.homework, updatedAt: localTime ? new Date(localTime).toISOString() : now };
    } else if (localEntry && localTime > cloudTime) {
      pushed.push(date);
      merged[date] = { homework: localEntry.homework, updatedAt: new Date(localTime).toISOString() };
    } else if (cloudEntry) {
      merged[date] = { homework: cloudEntry.homework, updatedAt: cloudEntry.updatedAt };
    } else {
      merged[date] = { homework: localEntry.homework, updatedAt: new Date(localTime).toISOString() };
    }
  }

  return { pulled, pushed, merged };
}
```

- [ ] **Step 4: 运行自检，确认通过**

```bash
node scripts/sync-check.mjs
# 预期: syncMerge 自检通过: 5 个场景
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/syncMerge.js scripts/sync-check.mjs
git commit -m "feat: 同步合并纯函数 + 自检（TDD）"
```

---

### Task 5: `sync.js` — 同步 IO 层

**Files:**
- Create: `src/utils/sync.js`

**目标**：密钥存取、`syncNow`（完整 tick：GET 整包 → 逐日期合并 → 快照+覆写 / 推送）、`startPeriodicSync`/`stopPeriodicSync`、保存后防抖 `scheduleSyncNow`。

- [ ] **Step 1: 创建 `src/utils/sync.js`**

```js
import { getData, getKeysByPrefix, getMeta, restoreSnapshot, setData, setMeta, snapshotDate } from "./storage";
import { mergeDates } from "./syncMerge";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SYNC_ENDPOINT = "/kv/homework";
const SYNC_SECRET_KEY = "classworks_sync_secret";

let timerId = null;
let saveDebounceId = null;

export function getSyncSecret() {
  return localStorage.getItem(SYNC_SECRET_KEY) || "";
}

export function setSyncSecret(secret) {
  if (secret) {
    localStorage.setItem(SYNC_SECRET_KEY, secret.trim());
  } else {
    localStorage.removeItem(SYNC_SECRET_KEY);
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`同步请求失败: ${response.status}`);
  return response.json();
}

function authHeaders(secret) {
  return { "x-sync-secret": secret, "Content-Type": "application/json" };
}

async function collectLocalDates() {
  const keys = await getKeysByPrefix("classworks-data-");
  const dateSet = new Set();
  for (const key of keys) {
    const match = /^classworks-data-(\d{8})$/.exec(key);
    if (match) dateSet.add(match[1]);
  }

  const local = {};
  const meta = {};
  for (const date of dateSet) {
    const data = await getData(`classworks-data-${date}`);
    if (data?.homework) {
      local[date] = { homework: data.homework };
      meta[date] = await getMeta(date);
    }
  }
  return { local, meta };
}

export async function syncNow({ onPulled } = {}) {
  const secret = getSyncSecret();
  if (!secret) return { status: "local-only" };

  const cloudDoc = await requestJson(`${SYNC_ENDPOINT}?t=${Date.now()}`, { headers: authHeaders(secret) });
  const cloud = cloudDoc.empty ? {} : (cloudDoc.dates || {});
  const { local, meta } = await collectLocalDates();

  const result = mergeDates({ cloud, local, meta });

  for (const date of result.pulled) {
    await snapshotDate(date); // 覆写前留本地快照（无本地数据时 snapshotDate 返回 null，无副作用）
    await setData(`classworks-data-${date}`, { homework: result.merged[date].homework });
    await setMeta(date, Date.parse(result.merged[date].updatedAt));
  }

  if (result.pushed.length > 0) {
    const putBody = { dates: result.merged };
    await requestJson(SYNC_ENDPOINT, {
      method: "PUT",
      headers: authHeaders(secret),
      body: JSON.stringify(putBody),
    });
    for (const date of result.pushed) {
      await setMeta(date, Date.parse(result.merged[date].updatedAt));
    }
  }

  onPulled?.(result.pulled);
  return { status: "ok", pulled: result.pulled, pushed: result.pushed };
}

export function scheduleSyncNow({ onPulled } = {}) {
  clearTimeout(saveDebounceId);
  saveDebounceId = setTimeout(() => {
    syncNow({ onPulled }).catch((error) => console.warn("保存后同步失败:", error));
  }, 800);
}

export function startPeriodicSync({ onPulled } = {}) {
  stopPeriodicSync();
  if (!getSyncSecret()) return;
  timerId = setInterval(() => {
    syncNow({ onPulled }).catch((error) => console.warn("定时同步失败:", error));
  }, SYNC_INTERVAL_MS);
}

export function stopPeriodicSync() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// 回退后调：恢复快照 → 重写本地 → 立即推云端覆盖（凭 meta 更晚被判定为"待推送"）
export async function rollbackDate(date, ts) {
  const ok = await restoreSnapshot(date, ts);
  if (!ok) return false;
  await setMeta(date, Date.now());
  await syncNow();
  return true;
}
```

- [ ] **Step 2: 运行 lint**

```bash
pnpm lint
# 预期: 无错误
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/sync.js
git commit -m "feat: 云端同步 IO 层（定时拉取/保存后推送/回退覆写）"
```

---

### Task 6: `settings.vue` — 同步密钥输入

**Files:**
- Modify: `src/pages/settings.vue`

**目标**：架构页 iframe 保留，上方/下方加"同步密钥"区块：输入框 + 保存/清除，调 `setSyncSecret`。

- [ ] **Step 1: template 在 `.settings-top-actions` 后插入密钥区块**

```vue
    <div class="settings-sync-card">
      <div class="settings-sync-label">云端同步密钥</div>
      <input
        v-model="syncSecretInput"
        class="settings-sync-input"
        type="password"
        placeholder="输入后才有权限读写云端"
        autocomplete="off"
      >
      <div class="settings-sync-actions">
        <button
          class="settings-sync-btn"
          type="button"
          :disabled="!syncSecretInput.trim()"
          @click="saveSyncSecret"
        >
          保存
        </button>
        <button
          v-if="hasSyncSecret"
          class="settings-sync-btn settings-sync-btn-clear"
          type="button"
          @click="clearSyncSecret"
        >
          清除
        </button>
      </div>
    </div>
```

- [ ] **Step 2: script 增加状态与方法**

在 `data()` 中加 `syncSecretInput: ""`、`hasSyncSecret: false`；`mounted` 中读取现有密钥；新增方法：

```js
import { getSyncSecret, setSyncSecret } from "@/utils/sync";
```

```js
  mounted() {
    this.previousTitle = document.title;
    document.title = copy.pageTitle;
    this.syncSecretInput = getSyncSecret();
    this.hasSyncSecret = !!this.syncSecretInput;
  },
```

```js
    saveSyncSecret() {
      setSyncSecret(this.syncSecretInput);
      this.hasSyncSecret = true;
    },
    clearSyncSecret() {
      setSyncSecret("");
      this.syncSecretInput = "";
      this.hasSyncSecret = false;
    },
```

- [ ] **Step 3: style 追加密钥卡片样式**

```css
.settings-sync-card {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(16, 16, 16, 0.78);
  backdrop-filter: blur(12px);
}

.settings-sync-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 700;
}

.settings-sync-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #f1f1f1;
  font-size: 13px;
}

.settings-sync-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.32);
}

.settings-sync-actions {
  display: flex;
  gap: 8px;
}

.settings-sync-btn {
  flex: 1;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: #262626;
  color: #f0f0f0;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.settings-sync-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.settings-sync-btn-clear {
  flex: 0 0 auto;
  padding-inline: 12px;
  background: rgba(255, 255, 255, 0.04);
}
```

- [ ] **Step 4: 手动验证**

`pnpm dev` → 打开 `http://localhost:3031/settings` → 输入密钥保存 → 刷新后输入框仍有值（localStorage 持久化）→ 点清除 → 刷新为空。

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings.vue
git commit -m "feat: 设置页新增云端同步密钥输入"
```

---

### Task 7: `index.vue` — 定时同步、保存后同步、提示框、回退

**Files:**
- Modify: `src/pages/index.vue`

**目标**：挂载后启动定时同步；保存作业后防抖同步；拉取到云端更新时弹提示框（含"一键回退"）；回退对话框列出快照。

- [ ] **Step 1: script 引入 sync 模块**

在 `src/pages/index.vue` 现有 import 区（`@/utils/storage` 那行附近）追加：

```js
import {
  getSyncSecret,
  rollbackDate,
  scheduleSyncNow,
  startPeriodicSync,
  stopPeriodicSync,
} from "@/utils/sync";
import { listSnapshots } from "@/utils/storage";
```

- [ ] **Step 2: data 增加同步状态**

```js
      syncNoticeVisible: false,
      rollbackVisible: false,
      syncSnapshots: [],
      currentEditDateForRollback: "",
```

- [ ] **Step 3: mounted/beforeUnmount 挂定时同步**

在 `mounted()` 中 `this.initializeData()` 之前追加：

```js
    startPeriodicSync({ onPulled: (pulledDates) => this.handlePulledDates(pulledDates) });
```

在 `beforeUnmount()` 中：

```js
  beforeUnmount() {
    stopPeriodicSync();
  },
```

- [ ] **Step 4: `handleHomeworkSave` 末尾追加防抖同步**

在 `await this.uploadData();` 之后追加：

```js
      scheduleSyncNow({ onPulled: (pulledDates) => this.handlePulledDates(pulledDates) });
```

- [ ] **Step 5: 新增 methods（放在 `copyHomeworkToToday` 之后）**

```js
    handlePulledDates(pulledDates) {
      if (!pulledDates?.includes(this.dateString)) return;
      this.syncNoticeVisible = true;
    },
    async openRollback() {
      this.currentEditDateForRollback = this.dateString;
      this.syncSnapshots = await listSnapshots(this.dateString);
      this.syncNoticeVisible = false;
      this.rollbackVisible = true;
    },
    formatSnapshotTime(ts) {
      const date = new Date(ts);
      return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    },
    async handleRollback(ts) {
      await rollbackDate(this.dateString, ts);
      this.rollbackVisible = false;
      await this.downloadData();
    },
```

> 说明：`rollbackDate` 恢复快照 → `setMeta(now)` → `syncNow()` 推送覆写云端；`downloadData()` 刷新界面。`handlePulledDates` 只在当前正在看的日期被拉取时提示，其他日期静默合并（更少打扰）。

- [ ] **Step 6: template 追加两个对话框（放在 `</v-app-bar>` 之后、`<HomeSkeleton>` 之前或文件底部 `<FloatingICP />` 之后均可）**

```vue
  <!-- 云端同步提示 -->
  <v-dialog
    v-model="syncNoticeVisible"
    width="420"
  >
    <v-card class="sync-dialog-card">
      <v-card-title class="sync-dialog-title">
        检测到云端更新
      </v-card-title>
      <v-card-text class="sync-dialog-text">
        本地已自动同步为最新内容。
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="syncNoticeVisible = false"
        >
          知道了
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          @click="openRollback"
        >
          对修改不满意？一键回退之前版本
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- 回退快照列表 -->
  <v-dialog
    v-model="rollbackVisible"
    width="460"
  >
    <v-card class="sync-dialog-card">
      <v-card-title class="sync-dialog-title">
        回退之前版本
      </v-card-title>
      <v-card-text>
        <div
          v-if="syncSnapshots.length === 0"
          class="sync-empty-text"
        >
          没有可回退的快照。
        </div>
        <button
          v-for="ts in syncSnapshots"
          :key="ts"
          type="button"
          class="sync-snapshot-item"
          @click="handleRollback(ts)"
        >
          <span>{{ formatSnapshotTime(ts) }}</span>
          <v-icon
            icon="mdi-restore"
            size="16"
          />
        </button>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="rollbackVisible = false"
        >
          取消
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
```

- [ ] **Step 7: style 追加对话框样式**

```css
.sync-dialog-card {
  border-radius: 10px !important;
  background: #181818 !important;
  color: #f1f1f1;
}

.sync-dialog-title {
  font-weight: 700 !important;
}

.sync-dialog-text {
  color: rgba(255, 255, 255, 0.78) !important;
}

.sync-empty-text {
  padding: 18px 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  text-align: center;
}

.sync-snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  margin-bottom: 8px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #202020;
  color: #ededed;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.sync-snapshot-item:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: #262626;
}
```

- [ ] **Step 8: 手动验证**

`pnpm dev`（此步只验证本地触发路径；API 需 Task 7 部署后在线验证）：
1. 打开看板 → 无密钥时控制台无定时同步报错
2. 设置页填密钥 → 回看板保存一条作业 → 网络面板可见 `PUT /kv/homework`（若本地无 API 会 404 静默失败，属预期）
3. 打开 `/settings` 确认密钥回显

- [ ] **Step 9: Commit**

```bash
git add src/pages/index.vue
git commit -m "feat: 看板集成云端同步（定时/保存后/提示框/回退）"
```

---

### Task 8: 全量验证 + 部署后验收

**Files:**
- Test: `scripts/sync-check.mjs`、`pnpm lint`、`pnpm build`、部署后手动验收

- [ ] **Step 1: 跑自检 + lint + build**

```bash
node scripts/sync-check.mjs
# 预期: syncMerge 自检通过: 5 个场景

pnpm lint
# 预期: 无错误

pnpm build
# 预期: 构建成功，产物在 dist/
```

- [ ] **Step 2: 部署（EdgeOne Pages）**

使用 `edgeone-pages-deploy` 技能部署（构建产物 `dist/`）。部署前确认控制台：
- KV namespace `classwork` 已绑定变量名 `homework_kv` ✅
- 环境变量 `SYNC_SECRET` 已设置 ✅

- [ ] **Step 3: 部署后手动验收**

| 步骤 | 预期 |
|---|---|
| `curl -s -o /dev/null -w "%{http_code}" <URL>/kv/homework`（无密钥） | 401 |
| `curl -s -H "x-sync-secret: <SYNC_SECRET>" <URL>/kv/homework` | `{"empty":true}` |
| 设备 A（设密钥）改作业保存 → `curl -H "x-sync-secret: ..." <URL>/kv/homework` | 返回含该日期的整包 |
| 设备 B（设密钥）打开 → 等待 ≤5 分钟 | 自动拉到新数据，弹「检测到云端更新」提示框 |
| 点「一键回退」→ 选快照 | 本地恢复旧版，云端被覆写（`curl` 确认） |
| 不设密钥打开看板 | 纯本地运行，无同步报错，界面正常 |

- [ ] **Step 4: 全量提交**

```bash
git add -A
git commit -m "chore: 云端同步全量验证"
```

---

## 自审记录（writing-plans 第 6 节）

**Spec 覆盖**：
- ✅ 后端 GET/PUT 均校验密钥（Task 1）
- ✅ 单一 KV 键 `classworks_homework`（Task 1）
- ✅ 设置页密钥输入（Task 6）
- ✅ 定时同步 5 分钟（Task 5 `SYNC_INTERVAL_MS`）
- ✅ 日期级 last-write-wins 合并（Task 4）
- ✅ 同步前本地快照 + 留 5 份（Task 3 `SNAPSHOT_KEEP`）
- ✅ 拉取后弹提示框 + 一键回退 + 回退覆写云端（Task 5 `rollbackDate`、Task 7）
- ✅ middleware 放行 `/kv/`（Task 2）

**占位符扫描**：无 TBD/TODO；每个代码步骤含完整代码。

**类型/签名一致性**：
- `mergeDates({ cloud, local, meta })` 在 Task 4 定义、Task 5 调用，参数形状一致（cloud 带 `updatedAt` ISO 串、local 带 `homework`、meta 为 epochMs）
- `syncNow` 返回 `{ status, pulled, pushed }`；`scheduleSyncNow`/`startPeriodicSync` 接收 `{ onPulled }` 对象参数，Task 7 按此调用
- `snapshotDate`/`listSnapshots`/`restoreSnapshot`/`getMeta`/`setMeta`/`getKeysByPrefix` 在 Task 3 定义、Task 5 使用，签名一致
- `rollbackDate(date, ts)` 在 Task 5 定义、Task 7 调用，一致
