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

export async function deleteData(key) {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, key);
    return true;
  } catch (error) {
    console.error("deleteData error:", error);
    return false;
  }
}

export async function getAllKeys() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const keys = await store.getAllKeys();
    return keys.sort();
  } catch (error) {
    console.error("getAllKeys error:", error);
    return [];
  }
}
