import { computed, reactive } from "vue";

const AUTH_STORAGE_KEY = "classworks:auth";
const DEFAULT_ROOM = "default";
const MAX_ROOM_LENGTH = 32;
const MAX_KEY_LENGTH = 128;

// 纯函数：从查询串解析 room / key（学生扫码只带 room，不带 key）
export function parseAuth(search) {
  const params = new URLSearchParams(search || "");
  const room = (params.get("room") || "").trim().slice(0, MAX_ROOM_LENGTH);
  const key = (params.get("key") || "").trim().slice(0, MAX_KEY_LENGTH);
  return { room: room || null, key: key || null };
}

function readStored() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const state = reactive({ room: DEFAULT_ROOM, writeKey: "" });

function initAuth() {
  if (typeof window === "undefined") return;

  const stored = readStored();
  const fromUrl = parseAuth(window.location.search);
  state.room = fromUrl.room || stored.room || DEFAULT_ROOM;
  // key 一旦进来就落盘：讲台电脑下次直接打开不带 key 的地址仍是可写
  state.writeKey = fromUrl.key || stored.writeKey || "";

  try {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ room: state.room, writeKey: state.writeKey }),
    );
  } catch (error) {
    console.warn("保存写权限失败:", error);
  }
}

initAuth();

// 讲台大屏长期停在地址栏上，明文 key 会被学生看到，必须从地址栏抹掉。
// 必须由 main.js 在 router.isReady() 之后调用：vue-router 的初始导航会用自己捕获的
// 原始 URL（含 key）再 replaceState 一次，早于它就抹会被路由覆盖回去。
export function stripKeyFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("key")) return;
  url.searchParams.delete("key");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function useAuth() {
  return {
    room: computed(() => state.room),
    writeKey: computed(() => state.writeKey),
    isWritable: computed(() => Boolean(state.writeKey)),
  };
}
