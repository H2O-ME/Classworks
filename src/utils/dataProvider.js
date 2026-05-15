import { kvBlobProvider } from "./providers/kvBlobProvider";

export const formatResponse = (data) => data;

export const formatError = (message, code = "UNKNOWN_ERROR") => ({
  success: false,
  error: {code, message},
});

// Main data provider - 使用 EdgeOne Pages Blob 存储
export default {
  // Provider API methods
  loadData: async (key) => {
    return kvBlobProvider.loadData(key);
  },

  saveData: async (key, data) => {
    return kvBlobProvider.saveData(key, data);
  },

  /**
   * 获取键名列表
   * @param {Object} options - 查询选项
   * @param {string} options.prefix - 键前缀过滤
   * @param {string} options.sortBy - 排序字段，默认为 "key"
   * @param {string} options.sortDir - 排序方向，"asc" 或 "desc"，默认为 "asc"
   * @param {number} options.limit - 每页返回的记录数，默认为 100
   * @param {number} options.skip - 跳过的记录数，默认为 0
   * @returns {Promise<Object>} 包含键名列表和分页信息的响应对象
   */
  loadKeys: async (options = {}) => {
    return kvBlobProvider.loadKeys(options);
  },

  /**
   * 删除数据
   * @param {string} key - 键名
   * @returns {Promise<Object>} 操作结果
   */
  deleteData: async (key) => {
    return kvBlobProvider.deleteData(key);
  },

  /**
   * 获取键的云端访问地址（Blob 存储暂不支持）
   * @param {string} key - 键名
   * @returns {Promise<Object>} Blob 存储不支持直接访问地址
   */
  async getKeyCloudUrl(key) {
    return formatError("Blob 存储模式不支持直接获取访问地址", "BLOB_ONLY");
  },
};


export const ErrorCodes = {
  NOT_FOUND: "数据不存在",
  NETWORK_ERROR: "网络连接失败",
  SERVER_ERROR: "服务器错误",
  SAVE_ERROR: "保存失败",
  DELETE_ERROR: "删除失败",
  CONFIG_ERROR: "配置错误",
  PERMISSION_DENIED: "无权限访问",
  UNAUTHORIZED: "认证失败",
  CLOUD_URL_ERROR: "云端地址获取失败",
  BLOB_ONLY: "Blob 存储限制",
  UNKNOWN_ERROR: "未知错误",
};
