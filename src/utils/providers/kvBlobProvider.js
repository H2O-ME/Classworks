const API_BASE = "/api/kv";

async function request(path, options = {}) {
  const url = `${API_BASE}/${path}`;

  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || `HTTP ${response.status}`);
  }

  return result;
}

async function loadData(key) {
  try {
    const result = await request(key);

    if (!result.success) {
      return formatError(result.error?.message || "数据不存在", result.error?.code || "NOT_FOUND");
    }

    return formatResponse(result.data);
  } catch (error) {
    console.error("Blob loadData error:", error);
    return formatError(error.message, "NETWORK_ERROR");
  }
}

async function saveData(key, data) {
  try {
    const result = await request(key, {
      method: "POST",
      body: { data }
    });

    if (!result.success) {
      return formatError(result.error?.message || "保存失败", result.error?.code || "SAVE_ERROR");
    }

    return formatResponse(true);
  } catch (error) {
    console.error("Blob saveData error:", error);
    return formatError(error.message, "NETWORK_ERROR");
  }
}

async function deleteData(key) {
  try {
    const result = await request(key, { method: "DELETE" });

    if (!result.success) {
      return formatError(result.error?.message || "删除失败", result.error?.code || "DELETE_ERROR");
    }

    return formatResponse(true);
  } catch (error) {
    console.error("Blob deleteData error:", error);
    return formatError(error.message, "NETWORK_ERROR");
  }
}

async function loadKeys(options = {}) {
  try {
    const params = new URLSearchParams();

    if (options.prefix) {
      params.set("prefix", options.prefix);
    }
    if (options.limit) {
      params.set("limit", String(options.limit));
    }
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }
    if (options.paginate !== undefined) {
      params.set("paginate", String(options.paginate));
    }

    const queryString = params.toString();
    const path = queryString ? `keys?${queryString}` : "keys";

    const result = await request(path);

    if (!result.success) {
      return formatError(result.error?.message || "获取键列表失败", result.error?.code || "LIST_ERROR");
    }

    let keys = result.data || [];

    if (options.sort === "desc") {
      keys = keys.reverse();
    } else {
      keys.sort((a, b) => a.localeCompare(b));
    }

    let paginatedKeys = keys;

    if (options.skip && options.limit) {
      paginatedKeys = keys.slice(options.skip, options.skip + options.limit);
    } else if (options.limit) {
      paginatedKeys = keys.slice(0, options.limit);
    } else if (options.skip) {
      paginatedKeys = keys.slice(options.skip);
    }

    return {
      success: true,
      data: paginatedKeys,
      total_rows: keys.length,
      current_page: Math.floor((options.skip || 0) / (options.limit || keys.length)) + 1,
      cursor: result.cursor || null
    };
  } catch (error) {
    console.error("Blob loadKeys error:", error);
    return formatError(error.message, "NETWORK_ERROR");
  }
}

function formatResponse(data) {
  return {
    success: true,
    data
  };
}

function formatError(message, code) {
  return {
    success: false,
    error: {
      code: code || "UNKNOWN_ERROR",
      message: message || "未知错误"
    }
  };
}

// 导出为对象（供 dataProvider.js 使用）
export const kvBlobProvider = {
  loadData,
  saveData,
  deleteData,
  loadKeys
};

// 同时导出独立函数（可选）
export { loadData, saveData, deleteData, loadKeys };
