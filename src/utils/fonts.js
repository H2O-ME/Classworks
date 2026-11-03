// 字体市场：精选在线字体目录 + 运行时按需加载。
// 方案：jsdelivr 的分片 woff2（unicode-range 子集化）——浏览器只下载页面
// 实际用到的分片，首屏不必拉整包，教室弱网可用。
// 字体清单写死：就几个精选，不值得后端接口。
export const FONT_CDN = "https://cdn.jsdelivr.net/npm";

export const FONTS = [
  {
    id: "system",
    name: "系统默认",
    desc: "跟随设备，零加载",
    stack: 'Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
    css: null,
    weight: "normal",
  },
  {
    id: "lxgw-wenkai",
    name: "霞鹜文楷",
    desc: "手写楷体，接近课本批注",
    stack: '"LXGW WenKai", Roboto, "PingFang SC", sans-serif',
    css: `${FONT_CDN}/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css`,
    weight: "normal",
  },
  {
    id: "lxgw-wenkai-screen",
    name: "霞鹜文楷 屏幕版",
    desc: "为屏幕渲染优化的文楷",
    stack: '"LXGW WenKai Screen", Roboto, "PingFang SC", sans-serif',
    css: `${FONT_CDN}/lxgw-wenkai-screen-webfont@1.7.0/lxgwwenkaiscreen-regular.css`,
    weight: "normal",
  },
  {
    id: "noto-serif-sc",
    name: "思源宋体",
    desc: "正式印刷感，大屏醒目",
    stack: '"Noto Serif SC", Roboto, serif',
    css: "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap",
    weight: "normal",
  },
  {
    id: "zcool-kuaile",
    name: "站酷快乐体",
    desc: "圆润活泼，低年级友好",
    stack: '"ZCOOL KuaiLe", Roboto, sans-serif',
    css: "https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap",
    weight: "normal",
  },
  {
    id: "ma-shan-zheng",
    name: "马善政毛笔楷书",
    desc: "毛笔书写感",
    stack: '"Ma Shan Zheng", "Kaiti SC", KaiTi, serif',
    css: "https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap",
    weight: "normal",
  },
];

// 谷歌字体对境内不稳：css 注入失败时静默回落，字型切换不阻塞页面
const loadedCss = new Set();

export function isFontLoaded(fontId) {
  return loadedCss.has(fontId);
}

function injectCss(href) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

// 按需加载：首次选用时注入 css，浏览器按 unicode-range 只拉用到的 woff2 分片
export function ensureFont(fontId) {
  const font = FONTS.find((f) => f.id === fontId);
  if (!font || !font.css || loadedCss.has(fontId) || typeof document === "undefined") return;
  loadedCss.add(fontId);
  injectCss(font.css);
}

// settings 里存的 fontId → css font-family 栈
export function fontStack(fontId) {
  return FONTS.find((f) => f.id === fontId)?.stack ?? FONTS[0].stack;
}
