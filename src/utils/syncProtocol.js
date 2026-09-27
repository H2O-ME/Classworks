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

// PUT 报文校验（信任边界）：端点无鉴权、任何人可写，必须挡住"单个请求把云端 KV 值撑爆"。
// 上限按一个学年 6 科 × ~200 天 ≈ 1200 条留足余量，正常使用碰不到。
// edge-functions/kv/homework.js 是独立部署的 V8 运行时无法 import，同规则复制一份，改这里要同步改那边。
export const MAX_CHANGES_ENTRIES = 5000;
export const MAX_ENTRY_KEY_LENGTH = 64; // "20260821|地理" 仅 13 字符
export const MAX_CONTENT_LENGTH = 20000;
// 合并后整包上限（字符数，非字节；中文约 3 字节/字符）。正常使用约 100KB 量级，留足余量。
export const MAX_DOC_CHARS = 2000000;

export function isValidChanges(changes) {
  if (!isPlainObject(changes)) return false;
  const entries = Object.entries(changes);
  if (entries.length > MAX_CHANGES_ENTRIES) return false;
  return entries.every(([key, cell]) => (
    typeof key === "string"
    && key.length <= MAX_ENTRY_KEY_LENGTH
    // 复用 parseEntryKey：日期与学科都必须非空（挡掉 "20260821|" 这类半截键）
    && parseEntryKey(key) !== null
    && isPlainObject(cell)
    && typeof cell.content === "string"
    && cell.content.length <= MAX_CONTENT_LENGTH
    && isPlainObject(cell.options)
  ));
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
