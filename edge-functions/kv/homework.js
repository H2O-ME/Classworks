const KV_KEY = "classworks_homework";
const DATE_KEY_RE = /^\d{8}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidDates(dates) {
  return isPlainObject(dates) && Object.entries(dates).every(([date, entry]) => (
    DATE_KEY_RE.test(date)
    && isPlainObject(entry)
    && isPlainObject(entry.homework)
    && typeof entry.updatedAt === "string"
    && Number.isFinite(Date.parse(entry.updatedAt))
  ));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

function isAuthorized(context) {
  const secret = context.request.headers.get("x-sync-secret");
  return !!secret && secret === context.env.SYNC_SECRET;
}

export async function onRequestGet(context) {
  if (!isAuthorized(context)) {
    return json({ error: "forbidden" }, 401);
  }

  const doc = await homework_kv.get(KV_KEY, "json");
  return json(doc ?? { empty: true });
}

export async function onRequestPut(context) {
  if (!isAuthorized(context)) {
    return json({ error: "forbidden" }, 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (!body || !isValidDates(body.dates)) {
    return json({ error: "missing dates" }, 400);
  }

  const current = await homework_kv.get(KV_KEY, "json");
  const mergedDates = isValidDates(current?.dates) ? { ...current.dates } : {};
  // Merge against the latest whole document so a stale client cannot erase newer dates.
  for (const [date, incoming] of Object.entries(body.dates)) {
    const existing = mergedDates[date];
    if (!existing || Date.parse(incoming.updatedAt) >= Date.parse(existing.updatedAt)) {
      mergedDates[date] = incoming;
    }
  }

  const savedAt = new Date().toISOString();
  await homework_kv.put(KV_KEY, JSON.stringify({ savedAt, dates: mergedDates }));
  return json({ savedAt });
}
