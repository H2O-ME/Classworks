import { getSetting, setSetting } from "./settings";

const FONT_LIST = [
  {
    id: "system",
    name: "系统默认",
    description: "跟随系统界面字体",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    category: "system",
  },
  {
    id: "sans",
    name: "清爽黑体",
    description: "适合日常作业浏览",
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
    category: "modern",
  },
  {
    id: "serif",
    name: "阅读宋体",
    description: "适合长段文本阅读",
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
    category: "serif",
  },
  {
    id: "mono",
    name: "等宽字体",
    description: "适合规整排列内容",
    fontFamily: '"Cascadia Mono", "Consolas", "Maple Mono", monospace',
    category: "mono",
  },
];

let currentFontId = "system";
let fontChangeCallbacks = [];

export function getFontList() {
  return FONT_LIST;
}

export function getFontsByCategory() {
  return FONT_LIST.reduce((groups, font) => {
    if (!groups[font.category]) {
      groups[font.category] = [];
    }
    groups[font.category].push(font);
    return groups;
  }, {});
}

export function getCurrentFont() {
  return FONT_LIST.find((font) => font.id === currentFontId) || FONT_LIST[0];
}

export function onFontChange(callback) {
  fontChangeCallbacks.push(callback);
  return () => {
    fontChangeCallbacks = fontChangeCallbacks.filter((item) => item !== callback);
  };
}

function applyFontToDocument(font) {
  const fontStack = font.fontFamily;
  let styleElement = document.getElementById("global-font-override");
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "global-font-override";
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = `
    :root {
      --app-font-family: ${fontStack};
    }

    html,
    body,
    #app,
    .v-application,
    .v-application * {
      font-family: var(--app-font-family);
    }
  `;
}

export async function setFont(fontId) {
  const font = FONT_LIST.find((item) => item.id === fontId) || FONT_LIST[0];
  currentFontId = font.id;
  applyFontToDocument(font);
  setSetting("font.family", font.id);

  fontChangeCallbacks.forEach((callback) => callback(font));
  return true;
}

export async function initFont() {
  const savedFontId = getSetting("font.family");
  await setFont(savedFontId || "system");
}
