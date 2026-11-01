// 身份与权限：三种角色 + 希沃白板免密令牌。所有读写都在这里，组件只读 canEdit()。
import { computed, reactive } from "vue";
import { activate as postActivate, checkBoardToken, getMe, login as postLogin } from "@/api/board";
import { resolveEditPermission, roleLabel } from "@/utils/board";

const AUTH_KEY = "classworks:auth";
// 白板令牌只放 sessionStorage：关掉浏览器即失效，冰点还原后必须重新从 URL 注入
const BOARD_KEY = "classworks:board-token";

// boardVerified 默认 false：口令没经后端确认前一律按只读处理（fail closed）。
// 踩过的坑：只凭「URL 里有个 key」就解锁全科编辑，?key=see 这类手误会让 UI 假可写。
const state = reactive({ token: "", user: null, boardToken: "", boardVerified: false });

function readStorage(store, key) {
  try {
    return JSON.parse(store.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeStorage(store, key, value) {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("保存登录状态失败:", error);
  }
}

// 白板免密令牌：讲台快捷方式 ?key=<令牌>，出现即接管（免密优先级高于登录）
function initBoardToken() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = (params.get("key") || "").trim();
  if (fromUrl) {
    state.boardToken = fromUrl.slice(0, 128);
    try {
      window.sessionStorage.setItem(BOARD_KEY, state.boardToken);
    } catch (error) {
      console.warn("保存白板令牌失败:", error);
    }
  } else {
    try {
      state.boardToken = window.sessionStorage.getItem(BOARD_KEY) || "";
    } catch {
      state.boardToken = "";
    }
  }
  // 令牌在地址栏明文会被学生看到，立即抹掉（路由还会再 replaceState 一次，见 main.js）
  if (fromUrl) {
    params.delete("key");
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }
}

function initAuth() {
  if (typeof window === "undefined") return;
  initBoardToken();
  const stored = readStorage(window.localStorage, AUTH_KEY);
  state.token = typeof stored?.token === "string" ? stored.token : "";
  state.user = stored?.user && typeof stored.user === "object" ? stored.user : null;
}

initAuth();

export function stripKeyFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("key")) return;
  url.searchParams.delete("key");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function persist() {
  writeStorage(window.localStorage, AUTH_KEY, state.token ? { token: state.token, user: state.user } : null);
}

function applySession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  persist();
  return payload.user;
}

export async function login(username, password) {
  const result = await postLogin(username, password);
  // 未激活账号不发正式 token，只回临时凭证交给改密流程
  if (result?.status === "REQUIRE_NEW_PASSWORD") {
    return { needPassword: true, tempToken: result.tempToken, realName: result.realName };
  }
  return { needPassword: false, user: applySession(result) };
}

export async function activate(tempToken, newPassword) {
  return applySession(await postActivate(tempToken, newPassword));
}

export function logout() {
  state.token = "";
  state.user = null;
  persist();
}

// 口令是坏的：立刻丢掉，别让它继续冒充白板权限
function dropBoardToken() {
  state.boardToken = "";
  state.boardVerified = false;
  try {
    window.sessionStorage.removeItem(BOARD_KEY);
  } catch (error) {
    console.warn("清除白板令牌失败:", error);
  }
}

// 进页面时向后端确认白板口令。认证通过前 isBoard 一直是 false —— 宁可按只读，
// 也不能让一个手打错的 key 把全科编辑放出来。
// 返回 "ok" | "invalid" | "none"：invalid 要能让页面提示「口令不对」，否则讲台只会觉得板子坏了。
export async function verifyBoardToken() {
  if (!state.boardToken) return "none";
  try {
    await checkBoardToken(state.boardToken);
    state.boardVerified = true;
    return "ok";
  } catch (error) {
    // 只有明确的 401 才丢令牌；断网时保留，等联网后下次再验
    if (error.status === 401) {
      dropBoardToken();
      return "invalid";
    }
    state.boardVerified = false;
    return "none";
  }
}

// 写接口回 401 且当前是白板身份：说明口令已被服务端否掉，立刻降级为只读
export function revokeBoardToken() {
  if (state.boardToken) dropBoardToken();
}

// 进页面时校正身份：管理员改了角色/科目后，前端不用等 token 过期就能反映
export async function refreshIdentity() {
  if (!state.token) return null;
  try {
    const result = await getMe(state.token);
    if (result?.user) {
      state.user = result.user;
      persist();
    }
    return state.user;
  } catch (error) {
    if (error.status === 401) logout();
    return state.user;
  }
}

export function useAuth() {
  // 关键：验证通过才算白板身份。只要有 key 就解锁是之前的安全漏洞。
  const isBoard = computed(() => Boolean(state.boardToken) && state.boardVerified);
  const user = computed(() => state.user);
  const canEdit = (subject) => resolveEditPermission({ isBoard: isBoard.value, user: state.user }, subject);
  // 至少能改一科才显示添加入口：普通同学完全不渲染
  const canEditAny = computed(() => isBoard.value || state.user?.role === "admin" || state.user?.role === "rep");
  return {
    isBoard,
    user,
    userLabel: computed(() => (isBoard.value ? "白板模式" : roleLabel(state.user))),
    canEdit,
    canEditAny,
    token: computed(() => state.token),
    boardToken: computed(() => state.boardToken),
    logout,
    refreshIdentity,
    verifyBoardToken,
    revokeBoardToken,
  };
}
