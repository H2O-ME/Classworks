import { openDB } from "idb";

const DB_NAME = "ClassworksDB";
const DB_VERSION = 3;
const STORE_NAME = "data";

let dbInstance = null;

async function getDB() {
  if (!dbInstance) {
    dbInstance = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbInstance;
}

export async function getData(key) {
  try {
    const db = await getDB();
    const data = await db.get(STORE_NAME, key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("getData error:", error);
    return null;
  }
}

export async function setData(key, data) {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.stringify(data), key);
    return true;
  } catch (error) {
    console.error("setData error:", error);
    return false;
  }
}

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
