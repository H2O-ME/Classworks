// 脏集增量同步协议 v3 的纯函数（无 DOM/idb 依赖，node 可直接 import 自检）。
// sync.js、vite.config 的 dev mock、scripts/sync-check.mjs 三处共用；
// edge-functions/kv/homework.js 因独立部署无法 import，保持同协议复制。
// - 同步单位是「日期|学科」条目，云端空内容条目 = 墓碑（被有意清空）
// - 时间戳不参与任何合并；时钟不进协议

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// 解析 "日期|学科" 键，返回 { date, subject }；非法键返回 null
export function parseEntryKey(key) {
  const [date, ...rest] = String(key).split("|");
  const subject = rest.join("|");
  return date && subject ? { date, subject } : null;
}

// 云端 KV 文档归一化：任意 v1/v2/v3 结构 → { entries }（"日期|学科" → {content, options}）
// v1：dates.<date>.homework；v2：dates.<date>.subjects，其 del:true（墓碑）→ 空内容条目，保住"曾写过"语义
export function normalizeCloudDoc(raw) {
  const result = { entries: {} };
  if (!isPlainObject(raw)) return result;
  if (raw.empty === true) return result;

  if (isPlainObject(raw.entries)) {
    result.entries = raw.entries;
    return result;
  }

  if (isPlainObject(raw.dates)) {
    for (const [date, day] of Object.entries(raw.dates)) {
      if (!isPlainObject(day)) continue;
      const homework = isPlainObject(day.homework) ? day.homework : {};
      for (const [subject, cell] of Object.entries(homework)) {
        if (isPlainObject(cell)) {
          result.entries[`${date}|${subject}`] = {
            content: cell.content || "",
            options: isPlainObject(cell.options) ? cell.options : {},
          };
        }
      }
      const subjects = isPlainObject(day.subjects) ? day.subjects : {};
      for (const [subject, cell] of Object.entries(subjects)) {
        if (isPlainObject(cell)) {
          result.entries[`${date}|${subject}`] = {
            content: cell.del === true ? "" : (cell.content || ""),
            options: {},
          };
        }
      }
    }
  }
  return result;
}

// 密钥校验响应分类：状态码 + Content-Type → 判定结果。
// 2xx + JSON = 正确；SPA fallback 返回的 200 HTML 不算正确（本地无后端时防误判）
export function classifySyncResponse(status, contentType) {
  if (status >= 200 && status < 300 && String(contentType).includes("json")) return "ok";
  if (status === 401 || status === 403) return "invalid";
  if (status >= 500) return "server";
  return "unexpected";
}
