// 密钥校验响应分类：状态码 + Content-Type → 判定结果。
// 独立成纯函数以便 node 自检直接加载（sync.js 依赖 idb 无法在 node 里 import）。
export function classifySyncResponse(status, contentType) {
  // 2xx + JSON = 正确；SPA fallback 返回的 200 HTML 不算正确（本地无后端时防误判）
  if (status >= 200 && status < 300 && String(contentType).includes("json")) return "ok";
  if (status === 401 || status === 403) return "invalid";
  if (status >= 500) return "server";
  return "unexpected";
}