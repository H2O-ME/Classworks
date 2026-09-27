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

function isValidChanges(changes) {
  if (!isPlainObject(changes)) return false;
  return Object.entries(changes).every(([key, cell]) => (
    typeof key === "string"
    && key.includes("|")
    && isPlainObject(cell)
    && typeof cell.content === "string"
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
  await homework_kv.put(KV_KEY, JSON.stringify(doc));
  // 返回合并后的完整文档，供客户端核对"我推的条目是否已落库"
  return json(doc);
}