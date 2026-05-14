import {kvLocalProvider} from "./providers/kvLocalProvider";

export const formatResponse = (data) => data;

export const formatError = (message, code = "UNKNOWN_ERROR") => ({
  success: false,
  error: {code, message},
});

// Main data provider - 纯本地存储模式
export default {
  // Provider API methods
  loadData: async (key) => {
    return kvLocalProvider.loadData(key);
  },

  saveData: async (key, data) => {
    return kvLocalProvider.saveData(key, data);
  },

  /**
   * 获取键名列表
   * @param {Object} options - 查询选项
   * @param {string} options.sortBy - 排序字段，默认为 "key"
   * @param {string} options.sortDir - 排序方向，"asc" 或 "desc"，默认为 "asc"
   * @param {number} options.limit - 每页返回的记录数，默认为 100
   * @param {number} options.skip - 跳过的记录数，默认为 0
   * @returns {Promise<Object>} 包含键名列表和分页信息的响应对象
   */
  loadKeys: async (options = {}) => {
    return kvLocalProvider.loadKeys(options);
  },

  /**
   * 获取键的访问地址（本地模式返回空）
   * @param {string} key - 键名
   * @returns {Promise<Object>} 本地模式不支持云端地址
   */
  async getKeyCloudUrl(key) {
    return formatError("本地存储模式不支持云端地址", "LOCAL_ONLY");
  },
};


export const ErrorCodes = {
  NOT_FOUND: "数据不存在",
  NETWORK_ERROR: "网络连接失败",
  SERVER_ERROR: "服务器错误",
  SAVE_ERROR: "保存失败",
  CONFIG_ERROR: "配置错误",
  PERMISSION_DENIED: "无权限访问",
  UNAUTHORIZED: "认证失败",
  CLOUD_URL_ERROR: "云端地址获取失败",
  UNKNOWN_ERROR: "未知错误",
};
