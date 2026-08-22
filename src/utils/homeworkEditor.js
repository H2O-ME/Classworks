export const QUICK_INSERT_TEXTS = ["预习练", "小题组", "背诵", "抄写", "同步", "学案"];

export const EDITOR_COPY = {
  close: "关闭",
  save: "保存并关闭",
  placeholder: "输入作业内容，每行一项会更清晰。",
  dirty: "有未保存修改",
  synced: "内容未修改",
  newline: "换行",
  paste: "粘贴",
  clear: "清空",
};

// ponytail: AI 润色已下线；localStorage 中遗留的 classworks_ai_polish_secret 键不清除（无害）

export function createEditorState(initialContent = "") {
  return {
    content: initialContent,
    dirty: false,
  };
}

export function buildSavePayload(content) {
  return {
    content: String(content || "").trim(),
    options: {},
  };
}
