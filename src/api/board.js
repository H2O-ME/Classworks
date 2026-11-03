// 后端 API 封装：统一处理 401/403/429/网络错误，页面只关心业务结果
const env = import.meta.env || {};

// 基址：默认同源（线上走 nginx 反代 /api）；本地开发由 .env.development 提供 http://localhost:3100
export const API_BASE = String(env.VITE_API_BASE || "").replace(/\/+$/, "");

export const RETRY_BASE_MS = 3000;
export const RETRY_MAX_MS = 60000;
export const RETRY_MAX_TRIES = 8;

// 指数退避：3s 起翻倍，60s 封顶
export function retryDelay(tries) {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, tries - 1), RETRY_MAX_MS);
}

export class BoardApiError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = "BoardApiError";
    // status 为 0 表示请求没走到服务端（断网/跨域失败），UI 据此走离线重试
    this.status = status;
    this.body = body;
  }
}

// credentials: 白板走 X-Board-Token
async function request(path, { method = "GET", body, boardToken } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (boardToken) headers["X-Board-Token"] = boardToken;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new BoardApiError("网络不可用", 0, null);
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;

  if (response.status === 401) throw new BoardApiError(payload?.error || "口令无效", 401, payload);
  if (response.status === 403) throw new BoardApiError(payload?.error || "没有该科目的写入权限", 403, payload);
  if (response.status === 429) throw new BoardApiError(payload?.error || "提交过于频繁", 429, payload);
  throw new BoardApiError(payload?.error || `请求失败（${response.status}）`, response.status, payload);
}

export function getBoard(date) {
  return request(`/api/board?date=${encodeURIComponent(date)}`);
}

export function saveSubject({ date, subject, content, boardToken }) {
  return request("/api/board/save", { method: "POST", boardToken, body: { date, subject, content } });
}

// 白板口令必须由后端确认，前端不能只凭「URL 里有个 key」就解锁
export function checkBoardToken(boardToken) {
  return request("/api/auth/board", { boardToken });
}

export function getHealth() {
  return request("/api/health");
}

export function formatTime(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return "";
  // 后端存毫秒；万一给了秒级时间戳也能显示
  const date = new Date(value < 1e12 ? value * 1000 : value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
