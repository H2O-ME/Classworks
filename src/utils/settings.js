// 外观设置：字体档位/字族 + 字号/行距/字距/段距微调。
// 读写失败一律静默回落默认值（教室电脑可能禁 localStorage）。
import { getFontSize } from "./board.js";
import { fontStack } from "./fonts.js";

const STORAGE_KEY = "classworks:settings";

// 微调范围（contentStyle 直接换算成 rem/em）：
// 字号档位以 16px 为基准 → rem；行距/字距/段距用 em 跟随字号。
export const LIMITS = {
  fontLevel: { min: -4, max: 24 }, // 16px 基准 ±，12px～40px 夹取
  lineHeight: { min: 1.2, max: 2.4, step: 0.05, def: 1.7 },
  letterSpacing: { min: 0, max: 0.2, step: 0.01, def: 0 }, // em
  paragraphGap: { min: 0, max: 1.5, step: 0.05, def: 0.625 }, // em，卡片内行间距
};

const DEFAULTS = {
  fontLevel: 0,
  fontFamily: "system",
  lineHeight: LIMITS.lineHeight.def,
  letterSpacing: LIMITS.letterSpacing.def,
  paragraphGap: LIMITS.paragraphGap.def,
};

function clamp(value, { min, max, def }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return def;
  return Math.min(max, Math.max(min, num));
}

export function getAppearance() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    // 兼容旧格式 { display: { fontSizeLevel } }：换架构后老用户字号不该被重置
    const legacy = Number(raw?.display?.fontSizeLevel);
    const level = Number.isFinite(Number(raw?.fontLevel)) && raw?.fontLevel !== undefined
      ? clamp(raw.fontLevel, LIMITS.fontLevel)
      : Number.isFinite(legacy)
        ? legacy
        : DEFAULTS.fontLevel;
    return {
      fontLevel: level,
      fontFamily: typeof raw?.fontFamily === "string" && raw.fontFamily ? raw.fontFamily : DEFAULTS.fontFamily,
      lineHeight: clamp(raw?.lineHeight ?? DEFAULTS.lineHeight, LIMITS.lineHeight),
      letterSpacing: clamp(raw?.letterSpacing ?? DEFAULTS.letterSpacing, LIMITS.letterSpacing),
      paragraphGap: clamp(raw?.paragraphGap ?? DEFAULTS.paragraphGap, LIMITS.paragraphGap),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAppearance(patch) {
  try {
    const next = { ...getAppearance(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("保存外观设置失败:", error);
  }
}

// 旧接口保留：字号档位单独读写（index.vue 缩放按钮用）
export function getFontLevel() {
  return getAppearance().fontLevel;
}

export function setFontLevel(level) {
  setAppearance({ fontLevel: Number(level) || 0 });
}

// 恢复默认外观（清掉存储即回落 DEFAULTS）
export function resetAppearance() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("重置外观设置失败:", error);
  }
}

// 外观 → 作业卡正文的内联样式。看板与设置页预览共用，避免两处样式漂移。
// 字号档位以 16px 为基准换成 rem（跟全站 125% 基准一起放大）；
// 行距用无单位数、字距/段距用 em，这样都跟随字号缩放。
export function appearanceStyle(appearance) {
  const level = Number(appearance?.fontLevel) || 0;
  return {
    fontSize: `${(getFontSize(level) / 16).toFixed(4)}rem`,
    fontFamily: fontStack(appearance?.fontFamily),
    lineHeight: String(appearance?.lineHeight ?? LIMITS.lineHeight.def),
    letterSpacing: `${appearance?.letterSpacing ?? LIMITS.letterSpacing.def}em`,
    "--line-gap": `${appearance?.paragraphGap ?? LIMITS.paragraphGap.def}em`,
  };
}
