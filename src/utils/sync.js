import { addDirty, getDirty, setDirty, getKeysByPrefix, getData, setData, snapshotDate, listSnapshots, restoreSnapshot } from "./storage.js";
import { classifySyncResponse, isPlainObject, normalizeCloudDoc, parseEntryKey } from "./syncProtocol.js";

// 脏集增量同步协议 v3（纯函数在 syncProtocol.js，协议说明见该文件）：
const SYNC_INTERVAL_MS = 60 * 1000;
const SYNC_ENDPOINT = "/kv/homework";
const SYNC_SECRET_KEY = "classworks_sync_secret";
const SYNC_ENABLED_KEY = "classworks_sync_enabled";
const SYNC_STATE_IDB_KEY = "classworks-sync-state";
const SYNC_SECRET_EVENT = "classworks-sync-changed";
const SYNC_TIMEOUT_MS = 15000;
const PUSH_RETRY_MAX = 2;
const DIRTY_FLAG = "classworks-dirty";

let timerId = null;
let saveDebounceId = null;
let syncChain = Promise.resolve();
let unbindVisibility = null;

export function getSyncSecret() {
  return localStorage.getItem(SYNC_SECRET_KEY) || "";
}

// 旧 WebView（手表内置浏览器等）没有 AbortSignal.timeout，手写等效超时
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

export function setSyncSecret(secret) {
  const normalized = String(secret || "").trim();
  if (normalized) {
    localStorage.setItem(SYNC_SECRET_KEY, normalized);
  } else {
    localStorage.removeItem(SYNC_SECRET_KEY);
    clearTimeout(saveDebounceId);
    saveDebounceId = null;
  }
  mirrorSyncState();
  window.dispatchEvent(new window.Event(SYNC_SECRET_EVENT));
}

export function getSyncEnabled() {
  return localStorage.getItem(SYNC_ENABLED_KEY) === "1";
}

export function setSyncEnabled(enabled) {
  if (enabled) {
    localStorage.setItem(SYNC_ENABLED_KEY, "1");
  } else {
    localStorage.removeItem(SYNC_ENABLED_KEY);
    clearTimeout(saveDebounceId);
    saveDebounceId = null;
    stopPeriodicSync();
  }
  mirrorSyncState();
  window.dispatchEvent(new window.Event(SYNC_SECRET_EVENT));
}

// localStorage 在部分安装态 PWA / 旧 WebView 里会被系统整块回收，密钥随之丢失；
// 每次写入同步镜像到 IndexedDB，启动时发现 localStorage 被清则回填（restoreSyncState）
function mirrorSyncState() {
  setData(SYNC_STATE_IDB_KEY, { secret: getSyncSecret(), enabled: getSyncEnabled() });
}

// 纯回填逻辑，供 scripts/sync-state-check.mjs 自检
export function applyRestoredState(saved, storage) {
  let changed = false;
  if (saved?.secret && !storage.getItem(SYNC_SECRET_KEY)) {
    storage.setItem(SYNC_SECRET_KEY, saved.secret);
    changed = true;
  }
  if (saved?.enabled && !storage.getItem(SYNC_ENABLED_KEY)) {
    storage.setItem(SYNC_ENABLED_KEY, "1");
    changed = true;
  }
  return changed;
}

export async function restoreSyncState() {
  try {
    // 请求持久化存储：安装态 PWA 下 Chrome/Edge 会静默授予，降低 localStorage 被回收的概率
    navigator.storage?.persist?.().catch(() => {});
    if (!getSyncSecret() || !getSyncEnabled()) {
      const saved = await getData(SYNC_STATE_IDB_KEY);
      if (applyRestoredState(saved, localStorage)) {
        window.dispatchEvent(new window.Event(SYNC_SECRET_EVENT));
      }
    }
    // 收敛：镜像可能因上次异步写未完成而缺失/过期（含老版本升级后镜像为空），以 localStorage 为准重写
    mirrorSyncState();
  } catch {
    // 极端 WebView 里 localStorage 访问会直接抛异常，启动路径不得炸
  }
}

if (typeof window !== "undefined") {
  restoreSyncState();
}

export function watchSyncState(callback) {
  const handleChange = () => callback({ enabled: getSyncEnabled(), secret: getSyncSecret() });
  const handleStorageChange = (event) => {
    if (event.key === SYNC_SECRET_KEY || event.key === SYNC_ENABLED_KEY) handleChange();
  };

  window.addEventListener(SYNC_SECRET_EVENT, handleChange);
  window.addEventListener("storage", handleStorageChange);
  handleChange();
  return () => {
    window.removeEventListener(SYNC_SECRET_EVENT, handleChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export async function validateSyncSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) return { ok: false, reason: "empty" };
  try {
    const response = await fetchWithTimeout(`${SYNC_ENDPOINT}?t=${Date.now()}`, {
      headers: { "x-sync-secret": normalized },
    });
    const reason = classifySyncResponse(response.status, response.headers.get("Content-Type") || "");
    return reason === "ok" ? { ok: true } : { ok: false, reason };
  } catch {
    return { ok: false, reason: "network" };
  }
}

function isSyncActive() {
  return getSyncEnabled() && !!getSyncSecret();
}

function authHeaders(secret) {
  return { "x-sync-secret": secret, "Content-Type": "application/json" };
}

async function requestJson(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    ...options,
  });
  if (!response.ok) throw new Error(`同步请求失败: ${response.status}`);
  // SPA fallback 返回 200 的 HTML，非 JSON 视作接口不存在
  if (!response.headers.get("Content-Type")?.includes("json")) {
    throw new Error("同步接口不存在或返回了非 JSON 响应");
  }
  return response.json();
}

// ── 脏集读写 ──

async function readDirtyChanges(dirty) {
  const changes = {};
  for (const key of dirty) {
    const parts = parseEntryKey(key);
    if (!parts) continue;
    const { date, subject } = parts;
    // 本地可能没有当天的整份数据（该日被删除）→ 按空条目照推，代表"已清空"
    const board = await getData(`classworks-data-${date}`);
    const cell = isPlainObject(board?.homework) ? board.homework[subject] : undefined;
    changes[key] = {
      content: isPlainObject(cell) ? cell.content || "" : "",
      options: isPlainObject(cell?.options) ? cell.options : {},
    };
  }
  return changes;
}

// 云端 → 本地应用：跳过 skipKeys（脏格）；先对将变化的日期留快照，再逐格覆盖
async function applyCloudToLocal(cloudEntries, skipKeys, { onPulled } = {}) {
  const skip = new Set(skipKeys);
  const pending = new Map(); // date → [{key, subject, cloudCell}]

  for (const [key, cloudCell] of Object.entries(cloudEntries)) {
    if (skip.has(key)) continue;
    const parts = parseEntryKey(key);
    if (!parts || !isPlainObject(cloudCell) || typeof cloudCell.content !== "string") continue;
    const { date, subject } = parts;
    if (!pending.has(date)) pending.set(date, []);
    pending.get(date).push({ subject, cloudCell });
  }

  const changedDates = [];
  for (const [date, cells] of pending) {
    const board = (await getData(`classworks-data-${date}`)) || { homework: {} };
    let changed = false;
    const homework = { ...board.homework };

    for (const { subject, cloudCell } of cells) {
      const localCell = isPlainObject(homework[subject]) ? homework[subject] : null;
      const cloudContent = cloudCell.content;
      const cloudEmpty = !cloudContent.trim();
      const localContent = localCell?.content || "";
      const localOptions = isPlainObject(localCell?.options) ? localCell.options : {};

      // 云端空条目 = 墓碑 → 本地置空；云端缺失条目 → 本地不动（不在 entries 里）
      const targetContent = cloudEmpty ? "" : cloudContent;
      const sameContent = (localContent || "") === targetContent;
      const sameOptions = JSON.stringify(localOptions) === JSON.stringify(cloudOptionsFor(cloudCell, cloudEmpty));
      if (sameContent && sameOptions) continue;

      if (cloudEmpty) {
        delete homework[subject];
      } else {
        homework[subject] = { content: cloudContent, options: cloudOptionsFor(cloudCell, cloudEmpty) };
      }
      changed = true;
    }

    if (!changed) continue;
    // 覆盖前先留快照（沿用每日期 5 份机制，snapshotDate 内部对无本地数据不写快照）
    await snapshotDate(date);
    await setData(`classworks-data-${date}`, { homework });
    changedDates.push(date);
  }

  if (changedDates.length) onPulled?.(changedDates);
  return changedDates;
}

function cloudOptionsFor(cloudCell, cloudEmpty) {
  return cloudEmpty ? {} : (isPlainObject(cloudCell.options) ? cloudCell.options : {});
}

// 同步入口：串行链，保存与同步互斥；首启迁移（本地无 dirty 键时单向 diff 标脏）后正常同步
export function syncNow(options = {}) {
  const task = syncChain.then(async () => {
    await migrateFirstRun().catch(() => false);
    return runSyncInternal(options);
  });
  syncChain = task.catch(() => {});
  return task;
}

// 真正执行推+拉+核对+应用
async function runSyncInternal(options) {
  const { onPulled, onPushed, onConflict } = options || {};
  if (!isSyncActive()) return { status: "disabled" };
  const secret = getSyncSecret();

  // ── 1. 推（只推脏集） ──
  const dirty = await getDirty();
  const pushedKeys = [];
  if (dirty.length) {
    const changes = await readDirtyChanges(dirty);
    let allPersisted = false;
    for (let attempt = 0; attempt <= PUSH_RETRY_MAX && !allPersisted; attempt += 1) {
      try {
        const doc = await requestJson(SYNC_ENDPOINT, {
          method: "PUT",
          headers: authHeaders(secret),
          body: JSON.stringify({ changes }),
        });
        const normalized = normalizeCloudDoc(doc);
        // 竞态丢写自愈：我推的键没落库 → 重新标脏，下一轮整包重推（幂等）
        const absent = Object.keys(changes).filter((key) => !normalized.entries[key]);
        if (absent.length) {
          await addDirty(absent);
          continue;
        }
        allPersisted = true;
        pushedKeys.push(...Object.keys(changes));
      } catch (error) {
        // PUT 失败 → 中止，脏集完整保留，下次再试
        console.warn("推送失败:", error);
        return { status: "error", error };
      }
    }
    // 全部落库才清脏；只摘除本次已推的键——两次网络往返的窗口期内用户新编辑入脏的键不能被连带抹掉
    if (allPersisted) {
      const pushed = new Set(Object.keys(changes));
      await setDirty((await getDirty()).filter((key) => !pushed.has(key)));
    }
  }

  // ── 2. 拉全量 ──
  let cloud;
  try {
    const doc = await requestJson(`${SYNC_ENDPOINT}?t=${Date.now()}`, { headers: authHeaders(secret) });
    cloud = normalizeCloudDoc(doc).entries;
  } catch (error) {
    console.warn("拉取失败:", error);
    return { status: "error", error };
  }

  // ── 3. 核对（我推过但被换掉） ──
  const conflicts = [];
  if (pushedKeys.length) {
    const myChanges = await readDirtyChanges(pushedKeys);
    for (const key of pushedKeys) {
      const mine = myChanges[key];
      const theirs = cloud[key];
      if (theirs && JSON.stringify(theirs) !== JSON.stringify(mine)) conflicts.push(key);
    }
  }
  const afterDirty = new Set(await getDirty());
  if (afterDirty.size) {
    const myDirty = await readDirtyChanges([...afterDirty]);
    for (const [key, mine] of Object.entries(myDirty)) {
      const theirs = cloud[key];
      if (theirs && JSON.stringify(theirs) !== JSON.stringify(mine)) conflicts.push(key);
    }
  }
  const uniqueConflicts = [...new Set(conflicts)];
  if (uniqueConflicts.length) onConflict?.(uniqueConflicts);

  // ── 4. 应用云端（跳过脏格） ──
  const applied = await applyCloudToLocal(cloud, [...afterDirty], { onPulled });

  onPushed?.(pushedKeys);
  return { status: "ok", pushed: pushedKeys, pulled: applied, conflicts: uniqueConflicts };
}

// 首启迁移：本地无 dirty 键 → 拉云端 → 单向 diff 标脏（本地非空、云端缺失/为空 → 入脏）
async function migrateFirstRun() {
  // 已有 dirty 键（哪怕空数组）说明迁移已做过
  const flag = await getData(DIRTY_FLAG);
  if (flag !== null) return false;

  if (!isSyncActive()) return false;

  let cloud = {};
  try {
    const doc = await requestJson(`${SYNC_ENDPOINT}?t=${Date.now()}`, { headers: authHeaders(getSyncSecret()) });
    cloud = normalizeCloudDoc(doc).entries;
  } catch (error) {
    console.warn("首启迁移拉取云端失败:", error);
    return false;
  }

  const keys = await getKeysByPrefix("classworks-data-");
  const localDates = keys
    .map((key) => /^classworks-data-(\d{8})$/.exec(key)?.[1])
    .filter(Boolean);

  const toMark = [];
  for (const date of localDates) {
    const board = await getData(`classworks-data-${date}`);
    if (!isPlainObject(board?.homework)) continue;
    for (const [subject, cell] of Object.entries(board.homework)) {
      if (!isPlainObject(cell)) continue;
      if (!String(cell.content || "").trim()) continue;
      const key = `${date}|${subject}`;
      const theirs = cloud[key];
      // 本地有内容、云端缺失或云端空（墓碑）→ 入脏，把本地老数据下次推上云
      if (!theirs || !String(theirs.content || "").trim()) {
        toMark.push(key);
      }
    }
  }
  await setData(DIRTY_FLAG, toMark);
  return true;
}

export function scheduleSyncNow(options = {}) {
  if (!isSyncActive()) return;
  clearTimeout(saveDebounceId);
  saveDebounceId = setTimeout(() => {
    saveDebounceId = null;
    // 走 syncChain 串行链：保存触发的同步与定时/visibility 同步互斥，避免按日期读改写交错
    syncNow(options).catch((error) => console.warn("保存后同步失败:", error));
  }, 800);
}

export function startPeriodicSync(options = {}) {
  stopPeriodicSync();
  if (!isSyncActive()) return;
  // 走 syncChain 串行链（与保存触发的同步互斥，避免按日期读改写交错）；options 原样透传，含 onConflict
  const run = () => syncNow(options).catch((error) => console.warn("周期同步失败:", error));
  run();
  timerId = setInterval(run, SYNC_INTERVAL_MS);

  const handleVisibility = () => {
    if (document.visibilityState === "visible") run();
  };
  const handleFocus = () => run();
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  unbindVisibility = () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleFocus);
    unbindVisibility = null;
  };
}

export function stopPeriodicSync() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  unbindVisibility?.();
}

// 回退到该日期"本地留存的最后一次数据"（最新快照），并把恢复的学科标脏、立即推送
export async function rollbackToLatest(date, options) {
  const snapshots = await listSnapshots(date);
  const latest = snapshots[snapshots.length - 1];
  if (!latest) return { ok: false, reason: "no-snapshot" };
  return rollbackDate(date, latest, options);
}

async function rollbackDate(date, ts, { onPushed } = {}) {
  // 标脏取恢复前后学科并集：被回退掉的学科推空条目（墓碑），否则云端下次拉取会把它们复活
  const before = await getData(`classworks-data-${date}`);
  const beforeSubjects = isPlainObject(before?.homework) ? Object.keys(before.homework) : [];

  const restored = await restoreSnapshot(date, ts);
  if (!restored) return { ok: false, reason: "no-snapshot" };

  const board = await getData(`classworks-data-${date}`);
  const subjects = isPlainObject(board?.homework) ? Object.keys(board.homework) : [];
  const union = [...new Set([...beforeSubjects, ...subjects])];
  await addDirty(union.map((subject) => `${date}|${subject}`));
  syncNow({ onPushed }).catch((error) => console.warn("回退后同步失败:", error));
  return { ok: true };
}