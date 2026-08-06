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