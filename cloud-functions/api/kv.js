import { getStore, listStores } from "@edgeone/pages-blob";

const STORE_NAME = "classworks-kv";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/kv\//, "");
  
  try {
    if (request.method === "GET" && path === "keys") {
      return await handleListKeys(url);
    } else if (request.method === "GET") {
      return await handleGetData(path);
    } else if (request.method === "POST") {
      return await handleSaveData(path, request);
    } else if (request.method === "DELETE") {
      return await handleDeleteData(path);
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("KV API Error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: { code: "INTERNAL_ERROR", message: error.message } 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function handleGetData(key) {
  const store = getStore(STORE_NAME);
  const data = await store.get(key, { type: "json", consistency: "strong" });
  
  if (!data) {
    return new Response(JSON.stringify({
      success: false,
      error: { code: "NOT_FOUND", message: `Key "${key}" not found` }
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    data
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleSaveData(key, request) {
  const store = getStore(STORE_NAME);
  const body = await request.json();
  const { data, onlyIfNew } = body;

  if (data === undefined) {
    return new Response(JSON.stringify({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Missing 'data' field in request body" }
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const options = {};
  if (onlyIfNew) {
    options.onlyIfNew = true;
  }

  await store.setJSON(key, data, options);

  return new Response(JSON.stringify({
    success: true
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleDeleteData(key) {
  const store = getStore(STORE_NAME);
  await store.delete(key);

  return new Response(JSON.stringify({
    success: true
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleListKeys(url) {
  const store = getStore(STORE_NAME);
  const prefix = url.searchParams.get("prefix") || "";
  const limit = parseInt(url.searchParams.get("limit")) || 1000;
  const cursor = url.searchParams.get("cursor") || null;

  const options = {};
  if (prefix) {
    options.prefix = prefix;
  }
  if (cursor) {
    options.cursor = cursor;
  }
  if (url.searchParams.has("paginate")) {
    options.paginate = url.searchParams.get("paginate") === "true";
  }

  const result = await store.list(options);

  const keys = result.blobs.map(b => b.key);

  return new Response(JSON.stringify({
    success: true,
    data: keys,
    total_rows: keys.length,
    cursor: result.cursor || null
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
