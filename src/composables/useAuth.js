// 身份与权限：URL 口令（?key=）是唯一身份来源。所有读写都在这里，组件只读 canEdit()。
import { computed, reactive } from "vue";
import { checkBoardToken } from "@/api/board";
import { resolveEditPermission } from "@/utils/board";

// 白板令牌只放 sessionStorage：关掉浏览器即失效，冰点还原后必须重新从 URL 注入
const BOARD_KEY = "classworks:board-token";

// boardVerified 默认 false：口令没经后端确认前一律按只读处理（fail closed）。
// 踩过的坑：只凭「URL 里有个 key」就解锁全科编辑，?key=see 这类手误会让 UI 假可写。
const state = reactive({ boardToken: "", boardVerified: false });

// 白板免密令牌：讲台快捷方式 ?key=<令牌>，出现即接管
function initAuth() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = (params.get("key") || "").trim();
  if (fromUrl) {
    state.boardToken = fromUrl.slice(0, 128);
    try {
      window.sessionStorage.setItem(BOARD_KEY, state.boardToken);
    } catch (error) {
      console.warn("保存白板令牌失败:", error);
    }
    // 令牌在地址栏明文会被学生看到，立即抹掉（路由还会再 replaceState 一次，见 main.js）
    params.delete("key");
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  } else {
    try {
      state.boardToken = window.sessionStorage.getItem(BOARD_KEY) || "";
    } catch {
      state.boardToken = "";
    }
  }
}

initAuth();

export function stripKeyFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("key")) return;
  url.searchParams.delete("key");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
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

export function useAuth() {
  // 关键：验证通过才算白板身份。只要有 key 就解锁是之前的安全漏洞。
  const isBoard = computed(() => Boolean(state.boardToken) && state.boardVerified);
  return {
    isBoard,
    canEdit: (subject) => resolveEditPermission({ isBoard: isBoard.value }, subject),
    token: computed(() => state.boardToken),
    verifyBoardToken,
    revokeBoardToken,
  };
}
