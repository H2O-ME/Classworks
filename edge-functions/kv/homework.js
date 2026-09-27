// 脏集增量同步协议 v3：单 KV key，flat entries（"日期|学科" → {content, options}）。
// 时间戳不参与合并；PUT 只逐条覆盖 changes，报文未提及的条目一概不碰。
const KV_KEY = "classworks_homework";

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toV3(raw) {
  const v3 = { v: 3, entries: {} };
  if (!isPlainObject(raw)) return v3;
  if (raw.v === 3 && isPlainObject(raw.entries)) {
    return { v: 3, entries: raw.entries };
  }
  // 旧版 v1（dates.<date>.homework.<subject>）与 v2（dates.<date>.subjects.<subject>，含 del 墓碑）
  if (isPlainObject(raw.dates)) {
    for (const [date, day] of Object.entries(raw.dates)) {
      if (!isPlainObject(day)) continue;
      const homework = isPlainObject(day.homework) ? day.homework : {};
      for (const [subject, cell] of Object.entries(homework)) {
        if (isPlainObject(cell)) {
          v3.entries[`${date}|${subject}`] = {
            content: cell.content || "",
            options: isPlainObject(cell.options) ? cell.options : {},
          };
        }
      }
      const subjects = isPlainObject(day.subjects) ? day.subjects : {};
      for (const [subject, cell] of Object.entries(subjects)) {
        if (isPlainObject(cell)) {
          v3.entries[`${date}|${subject}`] = {
            content: cell.del === true ? "" : (cell.content || ""),
            options: {},
          };
        }
      }
    }
  }
  return v3;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

// ── 信任边界：端点无鉴权、任何人可写，必须挡住"把云端 KV 值撑爆导致所有客户端都读不到" ──
// 规则与 src/utils/syncProtocol.js 的 isValidChanges 一致（本文件独立部署无法 import，只能复制，改一处要同步另一处）。
const MAX_CHANGES_ENTRIES = 5000;
const MAX_ENTRY_KEY_LENGTH = 64; // "20260821|地理" 仅 13 字符
const MAX_CONTENT_LENGTH = 20000;
// 合并后的整包上限（字符数，非字节；中文约 3 字节/字符）。正常使用约 100KB 量级，此处留足余量。
const MAX_DOC_CHARS = 2000000;

// 解析 "日期|学科" 键，返回 { date, subject }；非法键返回 null
function parseEntryKey(key) {
  const [date, ...rest] = String(key).split("|");
  const subject = rest.join("|");
  return date && subject ? { date, subject } : null;
}

function isValidChanges(changes) {
  if (!isPlainObject(changes)) return false;
  const entries = Object.entries(changes);
  if (entries.length > MAX_CHANGES_ENTRIES) return false;
  return entries.every(([key, cell]) => (
    typeof key === "string"
    && key.length <= MAX_ENTRY_KEY_LENGTH
    // 日期与学科都必须非空（挡掉 "20260821|" 这类半截键）
    && parseEntryKey(key) !== null
    && isPlainObject(cell)
    && typeof cell.content === "string"
    && cell.content.length <= MAX_CONTENT_LENGTH
    && isPlainObject(cell.options)
  ));
}

export async function onRequestGet() {
  const doc = await homework_kv.get(KV_KEY, "json");
  return json(toV3(doc));
}

export async function onRequestPut(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body || !isValidChanges(body.changes)) {
    return json({ error: "missing changes" }, 400);
  }

  // 读当前文档（旧格式惰性转 v3），逐条覆盖；报文外的条目不碰
  const current = await homework_kv.get(KV_KEY, "json");
  const v3 = toV3(current);
  for (const [key, cell] of Object.entries(body.changes)) {
    v3.entries[key] = { content: String(cell.content), options: isPlainObject(cell.options) ? cell.options : {} };
  }

  const doc = { v: 3, savedAt: new Date().toISOString(), entries: v3.entries };
  const serialized = JSON.stringify(doc);
  // 整包超限拒绝写入；但只拦"继续变大"的请求——已超限的历史数据仍可被改写/清空，否则同步会永久锁死
  if (serialized.length > MAX_DOC_CHARS && serialized.length > JSON.stringify(toV3(current)).length) {
    return json({ error: "document too large" }, 413);
  }
  await homework_kv.put(KV_KEY, serialized);
  // 返回合并后的完整文档，供客户端核对"我推的条目是否已落库"
  return json(doc);
}