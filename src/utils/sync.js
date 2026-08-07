import { getData, getKeysByPrefix, getMeta, listSnapshots, restoreSnapshot, setData, setMeta, snapshotDate } from "./storage";
import { mergeDates } from "./syncMerge";
import { classifySyncResponse } from "./syncClassify";

// 展示屏场景下 5 分钟太长；浏览器对后台标签页 setInterval 还会大幅节流，
// 所以缩短为 60 秒，并配合 visibilitychange/focus 在切回页面时立即补一次同步。
const SYNC_INTERVAL_MS = 60 * 1000;
const SYNC_ENDPOINT = "/kv/homework";
const SYNC_SECRET_KEY = "classworks_sync_secret";
const SYNC_ENABLED_KEY = "classworks_sync_enabled";
const SYNC_SECRET_EVENT = "classworks-sync-changed";
const DATE_KEY_RE = /^\d{8}$/;

let timerId = null;
let saveDebounceId = null;
let syncChain = Promise.resolve();
let unbindVisibility = null;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidCloudDates(dates) {
  return isPlainObject(dates) && Object.entries(dates).every(([date, entry]) => (
    DATE_KEY_RE.test(date)
    && isPlainObject(entry)
    && isPlainObject(entry.homework)
    && typeof entry.updatedAt === "string"
    && Number.isFinite(Date.parse(entry.updatedAt))
  ));
}

function getCloudDates(cloudDoc) {
  if (isPlainObject(cloudDoc) && cloudDoc.empty === true) return {};
  if (!isPlainObject(cloudDoc) || !isValidCloudDates(cloudDoc.dates)) {
    throw new Error("云端同步数据无效");
  }
  return cloudDoc.dates;
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

// 同步总开关：即使存了密钥，关闭后也不发任何云端请求
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

// 校验密钥：GET 接口 200 + JSON = 正确，401 = 错误，其它异常 = 无法连接
export async function validateSyncSecret(secret) {
  const normalized = String(secret || "").trim();
  if (!normalized) return { ok: false, reason: "empty" };
  try {
    const response = await fetch(`${SYNC_ENDPOINT}?t=${Date.now()}`, {
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

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`同步请求失败: ${response.status}`);
  // ponytail: 本地 dev 无后端时 SPA fallback 返回 200 的 HTML，非 JSON 视作接口不存在
  if (!response.headers.get("Content-Type")?.includes("json")) {
    throw new Error("同步接口不存在或返回了非 JSON 响应");
  }
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

export function syncNow(options = {}) {
  const next = syncChain.then(
    () => runSync(options),
    () => runSync(options),
  );
  syncChain = next.catch(() => {});
  return next;
}

async function runSync({ onPulled, onPushed } = {}) {
  if (!isSyncActive()) return { status: "local-only" };
  const secret = getSyncSecret();

  const cloudDoc = await requestJson(`${SYNC_ENDPOINT}?t=${Date.now()}`, { headers: authHeaders(secret) });
  const cloud = getCloudDates(cloudDoc);
  const { local, meta } = await collectLocalDates();

  const result = mergeDates({ cloud, local, meta });
  const pulled = [];

  for (const date of result.pulled) {
    await snapshotDate(date); // 覆写前留本地快照（无本地数据时 snapshotDate 返回 null，无副作用）
    const saved = await setData(`classworks-data-${date}`, { homework: result.merged[date].homework });
    if (!saved) continue;
    const metaSaved = await setMeta(date, Date.parse(result.merged[date].updatedAt));
    if (metaSaved) pulled.push(date);
  }

  if (result.pushed.length > 0) {
    // ponytail: 整包 PUT + 日期级 last-write-wins。mergeDates 已按日期独立合并，
    // 编辑往日不会污染其他日期；并发整包覆写由服务端按日期二次合并兜底。
    const putBody = { dates: result.merged };
    await requestJson(SYNC_ENDPOINT, {
      method: "PUT",
      headers: authHeaders(secret),
      body: JSON.stringify(putBody),
    });
    for (const date of result.pushed) {
      await setMeta(date, Date.parse(result.merged[date].updatedAt));
    }
    onPushed?.(result.pushed);
  }

  onPulled?.(pulled);
  return { status: "ok", pulled, pushed: result.pushed };
}

export function scheduleSyncNow({ onPulled, onPushed } = {}) {
  if (!isSyncActive()) return;
  clearTimeout(saveDebounceId);
  saveDebounceId = setTimeout(() => {
    saveDebounceId = null;
    syncNow({ onPulled, onPushed }).catch((error) => console.warn("保存后同步失败:", error));
  }, 800);
}

export function startPeriodicSync({ onPulled, onPushed } = {}) {
  stopPeriodicSync();
  if (!isSyncActive()) return;
  syncNow({ onPulled, onPushed }).catch((error) => console.warn("首次同步失败:", error));
  timerId = setInterval(() => {
    syncNow({ onPulled, onPushed }).catch((error) => console.warn("定时同步失败:", error));
  }, SYNC_INTERVAL_MS);

  // 后台标签页 setInterval 会被浏览器节流；切回页面/窗口时立即补一次同步
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      syncNow({ onPulled, onPushed }).catch((error) => console.warn("回到页面同步失败:", error));
    }
  };
  const handleFocus = () => {
    syncNow({ onPulled, onPushed }).catch((error) => console.warn("窗口聚焦同步失败:", error));
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

// 回退到该日期"本地留存的最后一次数据"（最新快照），并立即推送云端覆盖
export async function rollbackToLatest(date, options) {
  const snapshots = await listSnapshots(date);
  const latest = snapshots[snapshots.length - 1];
  if (!latest) return { ok: false, reason: "no-snapshot" };
  return rollbackDate(date, latest, options);
}

// 回退后调：恢复快照 → 重写本地 → 云端覆盖后台异步（不阻塞页面显示）
export async function rollbackDate(date, ts, { onPushed } = {}) {
  const ok = await restoreSnapshot(date, ts);
  if (!ok) return { ok: false, reason: "no-snapshot" };
  await setMeta(date, Date.now());
  // ponytail: 回退先改本地立即显示，KV 推送后台异步完成，避免页面等网络
  syncNow({ onPushed }).catch((error) => console.warn("回退后同步失败:", error));
  return { ok: true };
}
