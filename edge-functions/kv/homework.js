const KV_KEY = "classworks_homework";

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

  if (!body || typeof body.dates !== "object" || body.dates === null) {
    return json({ error: "missing dates" }, 400);
  }

  const savedAt = new Date().toISOString();
  await homework_kv.put(KV_KEY, JSON.stringify({ savedAt, dates: body.dates }));
  return json({ savedAt });
}