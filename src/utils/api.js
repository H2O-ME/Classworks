// API 模块 - 本地模式（无操作）
// 在纯本地存储模式下，所有 API 调用都不可用

/**
 * Get namespace info from the server
 * @returns {Promise<Object>} Response data containing namespace info
 */
export const getNamespaceInfo = async () => {
  throw new Error("本地模式不支持此操作");
};

export default {
  getNamespaceInfo,
};
