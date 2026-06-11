export const QUICK_INSERT_TEXTS = ["预习练", "小题组", "背诵", "抄写", "同步", "学案"];

export const EDITOR_COPY = {
  close: "关闭",
  save: "保存并关闭",
  placeholder: "输入作业内容，每行一项会更清晰。",
  polishing: "AI 正在整理",
  dirty: "有未保存修改",
  synced: "已同步到编辑草稿",
  newline: "换行",
  paste: "粘贴",
  clear: "清空",
  diffTitle: "AI 润色建议",
  diffSubtitle: "检查变更后再应用到作业内容",
  reject: "放弃",
  apply: "应用修改",
  provider: "模型 API 由 api.tianhw.top 提供",
  askSecret: "首次使用 AI 润色请输入密钥",
};

const POLISH_ERROR_MESSAGES = {
  AI_SECRET_REQUIRED: "需要先输入密钥才能使用 AI 润色。",
  AI_SECRET_INVALID: "密钥不正确，请重新输入。",
  EMPTY_CONTENT: "先输入作业内容，再使用 AI 润色。",
  EMPTY_AI_RESPONSE: "AI 没有返回可用内容，请稍后再试。",
  AI_OUTPUT_TRUNCATED: "AI 输出不完整，请稍后再试。",
  AI_POLISH_UPSTREAM_FORBIDDEN: "AI 服务拒绝访问，请检查接口状态或密钥。",
  AI_POLISH_UPSTREAM_BAD_RESPONSE: "AI 服务返回异常，请稍后再试。",
  AI_POLISH_REQUEST_INVALID: "AI 请求内容不完整，请重新操作一次。",
  AI_POLISH_NETWORK_ERROR: "AI 请求失败，请检查网络或稍后再试。",
};

export function isGeographySubject(subjectName) {
  return String(subjectName || "").trim() === "地理";
}

export function createEditorState(initialContent = "", initialOptions = {}, isGeography = false) {
  return {
    content: initialContent,
    dirty: false,
    pendingPolishContent: "",
    polishError: "",
    polishNotice: "",
  };
}

export function buildSavePayload(content) {
  return {
    content: String(content || "").trim(),
    options: {},
  };
}

export function resolvePolishErrorMessage(error) {
  const message = String(error?.message || "").trim();

  if (POLISH_ERROR_MESSAGES[message]) {
    return POLISH_ERROR_MESSAGES[message];
  }

  if (message.startsWith("AI_POLISH_FAILED_")) {
    const status = message.replace("AI_POLISH_FAILED_", "");
    return `AI 润色请求失败（${status}），请稍后再试。`;
  }

  return message ? `AI 润色失败：${message}` : "AI 润色失败，请检查网络后再试。";
}
