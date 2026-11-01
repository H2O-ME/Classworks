// 后端 API 封装：统一处理 401（写权限）/409（并发冲突）/网络错误，页面只关心业务结果
const env = import.meta.env || {};

// 基址：本地开发直连 Node 后端；线上同源反代时留空走相对路径
export const API_BASE = String(env.VITE_API_BASE || "http://localhost:3100").replace(/\/+$/, "");

export const RETRY_BASE_MS = 3000;
export const RETRY_MAX_MS = 60000;
export const RETRY_MAX_TRIES = 8;

// 指数退避：3s 起翻倍，60s 封顶（第 0 次立即重试，断网恢复后不必干等 3s）
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

async function request(path, { method = "GET", body, writeKey } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (writeKey) headers["X-Write-Key"] = writeKey;

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

  if (response.status === 401) throw new BoardApiError("写权限无效", 401, payload);
  if (response.status === 409) throw new BoardApiError("云端已有更新的内容", 409, payload);
  throw new BoardApiError(payload?.error || `请求失败（${response.status}）`, response.status, payload);
}

export function getBoard(room, date) {
  return request(`/api/board?room=${encodeURIComponent(room)}&date=${encodeURIComponent(date)}`);
}

export function saveSubject({ room, date, subject, content, baseUpdatedAt, writeKey }) {
  return request("/api/board/save", {
    method: "POST",
    writeKey,
    body: { room, date, subject, content, baseUpdatedAt },
  });
}

export function getHistory(room, date) {
  return request(`/api/board/history?room=${encodeURIComponent(room)}&date=${encodeURIComponent(date)}`);
}

export function getHealth() {
  return request("/api/health");
}

// 409 响应体里的云端最新内容：兼容 { content, updatedAt } 与 { current: {...} } 两种包装
export function readConflictBody(body) {
  const cell = body && typeof body === "object" && "content" in body ? body : body?.current;
  return {
    content: typeof cell?.content === "string" ? cell.content : "",
    updatedAt: Number(cell?.updatedAt) || 0,
  };
}

// 历史流水归一化：容忍字段名差异（items/records/list）
export function normalizeHistory(payload) {
  const list = payload?.items || payload?.records || payload?.list;
  return (Array.isArray(list) ? list : []).slice(0, 20).map((item) => ({
    id: item?.id ?? `${item?.subject}-${item?.createdAt ?? item?.updatedAt}`,
    subject: String(item?.subject || ""),
    content: String(item?.content || ""),
    createdAt: Number(item?.createdAt ?? item?.updatedAt) || 0,
  }));
}

export function formatTime(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return "";
  // 后端存毫秒；万一给了秒级时间戳也能显示
  const date = new Date(value < 1e12 ? value * 1000 : value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
