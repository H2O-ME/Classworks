// 身份与权限：三种角色 + 希沃白板免密令牌。所有读写都在这里，组件只读 canEdit()。
import { computed, reactive } from "vue";
import { activate as postActivate, getMe, login as postLogin } from "@/api/board";
import { resolveEditPermission, roleLabel } from "@/utils/board";

const AUTH_KEY = "classworks:auth";
// 白板令牌只放 sessionStorage：关掉浏览器即失效，冰点还原后必须重新从 URL 注入
const BOARD_KEY = "classworks:board-token";

const state = reactive({ token: "", user: null, boardToken: "" });

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

// 免密令牌优先级最高：讲台大屏每天开机都靠它，出现即接管
function initBoardToken() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = (params.get("board_token") || "").trim();
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
    params.delete("board_token");
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
  if (!url.searchParams.has("board_token")) return;
  url.searchParams.delete("board_token");
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
  const isBoard = computed(() => Boolean(state.boardToken));
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
  };
}
