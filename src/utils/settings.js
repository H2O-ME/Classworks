// 本地仅存一个「字号档位」；读写失败一律静默回落默认值（教室电脑可能禁 localStorage）
const STORAGE_KEY = "classworks:settings";

export function getFontLevel() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    // 兼容旧格式 { display: { fontSizeLevel } }：换架构后老用户字号不该被重置
    const legacy = Number(raw?.display?.fontSizeLevel);
    const level = Number(raw?.fontLevel);
    if (Number.isFinite(level) && raw?.fontLevel !== undefined) return level;
    return Number.isFinite(legacy) ? legacy : 0;
  } catch {
    return 0;
  }
}

export function setFontLevel(level) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontLevel: Number(level) || 0 }));
  } catch (error) {
    console.warn("保存字号失败:", error);
  }
}
