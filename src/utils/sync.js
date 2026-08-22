import { addDirty, getDirty, setDirty, getKeysByPrefix, getData, setData, snapshotDate, listSnapshots, restoreSnapshot } from "./storage";
import { classifySyncResponse } from "./syncClassify";

// 脏集增量同步协议（v3）：
// - 同步单位是「日期|学科」条目（如 "20260821|数学"），"天"不参与同步
// - 只有脏集里的条目会被上传；没编辑过的学科永远不推（空设备脏集为空，物理上推不出东西）
// - 拉取后以云端为准覆盖本地，但跳过脏集中的条目；云端条目存在且内容为空 = 被有意清空（墓碑）
// - 时间戳不参与任何合并；时钟不进协议
const SYNC_INTERVAL_MS = 60 * 1000;
const SYNC_ENDPOINT = "/kv/homework";
const SYNC_SECRET_KEY = "classworks_sync_secret";
const SYNC_ENABLED_KEY = "classworks_sync_enabled";
const SYNC_SECRET_EVENT = "classworks-sync-changed";
const SYNC_TIMEOUT_MS = 15000;
const PUSH_RETRY_MAX = 2;
const DIRTY_FLAG = "classworks-dirty";

let timerId = null;
let saveDebounceId = null;
let syncChain = Promise.resolve();
let unbindVisibility = null;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// 解析 "日期|学科" 键，返回 { date, subject }；非法键返回 null
function parseEntryKey(key) {
  const [date, ...rest] = String(key).split("|");
  const subject = rest.join("|");
  return date && subject ? { date, subject } : null;
}

// 云端文档归一化：任意 v1/v2/v3 结构 → v3 entries
function normalizeCloudDoc(raw) {
  const result = { entries: {} };
  if (!isPlainObject(raw)) return result;
  if (raw.empty === true) return result;

  if (isPlainObject(raw.entries)) {
    result.entries = raw.entries;
    return result;
  }

  // 旧版按日期命名空间（v1：dates.<date>.homework；v2：dates.<date>.subjects，带 del）
  if (isPlainObject(raw.dates)) {
    for (const [date, day] of Object.entries(raw.dates)) {
      if (!isPlainObject(day)) continue;
      const homework = isPlainObject(day.homework) ? day.homework : {};
      for (const [subject, cell] of Object.entries(homework)) {
        if (isPlainObject(cell)) {
          result.entries[`${date}|${subject}`] = {
            content: cell.content || "",
            options: isPlainObject(cell.options) ? cell.options : {},
          };
        }
      }
      const subjects = isPlainObject(day.subjects) ? day.subjects : {};
      for (const [subject, cell] of Object.entries(subjects)) {
        if (isPlainObject(cell)) {
          // v2 的 del:true（墓碑）→ 空内容条目，保住"曾写过"语义
          result.entries[`${date}|${subject}`] = {
            content: cell.del === true ? "" : (cell.content || ""),
            options: {},
          };
        }
      }
    }
  }
  return result;
}

export function getSyncSecret() {
  return localStorage.getItem(SYNC_SECRET_KEY) || "";
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
  window.dispatchEvent(new window.Event(SYNC_SECRET_EVENT));
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
    const response = await fetch(`${SYNC_ENDPOINT}?t=${Date.now()}`, {
      headers: { "x-sync-secret": normalized },
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
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
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
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

// 挂起函数：推/拉核对在 runSyncInternal 里统一编排，这里只做首启迁移
async function runSyncWithMigrate(options) {
  await migrateFirstRun().catch(() => false);
  return runSyncInternal(options);
}

// 真正执行推+拉+核对+应用
async function runSyncInternal(options) {
  const { onPulled, onPushed, onConflict } = options || {};
  if (!isSyncActive()) return { status: "disabled" };
  const secret = getSyncSecret();

  // ── 1. 推（只推脏集） ──
  let dirty = await getDirty();
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
    // 全部落库才清空脏集；否则缺席键已重新标脏，留给下一次同步（服务端仍可能丢写）
    if (allPersisted) await setDirty([]);
    dirty = await getDirty();
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

// 同步入口：串行链，保存与同步互斥（首启迁移后正常同步）
export function syncNow(options = {}) {
  const task = syncChain.then(() => runSyncWithMigrate(options));
  syncChain = task.catch(() => {});
  return task;
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

export function startPeriodicSync({ onPulled, onPushed } = {}) {
  stopPeriodicSync();
  if (!isSyncActive()) return;
  runSyncWithMigrate({ onPulled, onPushed }).catch((error) => console.warn("首次同步失败:", error));
  timerId = setInterval(() => {
    runSyncWithMigrate({ onPulled, onPushed }).catch((error) => console.warn("定时同步失败:", error));
  }, SYNC_INTERVAL_MS);

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      runSyncWithMigrate({ onPulled, onPushed }).catch((error) => console.warn("回到页面同步失败:", error));
    }
  };
  const handleFocus = () => {
    runSyncWithMigrate({ onPulled, onPushed }).catch((error) => console.warn("窗口聚焦同步失败:", error));
  };
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

export async function rollbackDate(date, ts, { onPushed } = {}) {
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