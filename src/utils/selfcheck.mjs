// 数据层自检：`node src/utils/selfcheck.mjs`（无需测试框架，断言失败即退出码 1）
import { formatTime, retryDelay } from "../api/board.js";
import {
  SUBJECTS,
  boardFromApi,
  formatDateKey,
  getFontSize,
  resolveEditPermission,
  shiftDate,
  toGridItems,
  unusedSubjects,
} from "./board.js";
import { getDefaultRoster, getPickWeight, pickRandomIndex } from "./roster.js";

let failed = 0;
function check(name, condition) {
  if (condition) return;
  failed += 1;
  console.error(`✗ ${name}`);
}

// ── boardFromApi：空内容不进看板，updatedAt 原样带出 ──
const parsed = boardFromApi({
  语文: { content: "背古诗", updatedAt: 100 },
  数学: { content: "   ", updatedAt: 200 },
  英语: { content: "抄单词", updatedAt: 300 },
});
check("空内容被丢弃", !("数学" in parsed.board));
check("内容保留", parsed.board.语文 === "背古诗" && parsed.board.英语 === "抄单词");
check("时间戳保留", parsed.updatedAtMap.语文 === 100 && parsed.updatedAtMap.英语 === 300);

// ── toGridItems / unusedSubjects：固定学科顺序，与后端返回顺序无关 ──
const items = toGridItems({ 英语: "c", 语文: "a" });
check("学科顺序按固定表", items.map((item) => item.name).join(",") === "语文,英语");
check("未使用学科=4", unusedSubjects(items).length === 4);
check("拼音/未知学科不进网格", toGridItems({ 体育: "跑步" }).length === 0);

// ── 日期：本地时区分量，跨月跨年不能错一天 ──
check("当天格式", /^\d{8}$/.test(formatDateKey(new Date())));
check("跨月回退", shiftDate("20260301", -1) === "20260228");
check("闰年 2 月", shiftDate("20240229", 0) === "20240229");
check("跨年", shiftDate("20260101", -1) === "20251231");
check("URL 里传 yyyy-mm-dd 也能解析", formatDateKey("2026-03-01") === "20260301");

// ── 字号：档位到 px 的夹取 ──
check("字号下限", getFontSize(-99) === 12);
check("字号上限", getFontSize(99) === 40);
check("字号基准", getFontSize(0) === 16);

// ── 权限矩阵：口令验证通过 = 全科可写，否则只读 ──
{
  const board = { isBoard: true };
  const anon = { isBoard: false };

  check("口令通过：全科可写", SUBJECTS.every((subject) => resolveEditPermission(board, subject)));
  check("口令缺失/未验证：全科只读", SUBJECTS.every((subject) => !resolveEditPermission(anon, subject)));
}

// ── 加权抽签：weight=0 的名字永远抽不中，且不连续重复 ──
const roster = getDefaultRoster();
const zeroNames = roster.filter((name) => getPickWeight(name) === 0);
check("存在不可抽中的名字", zeroNames.length > 0);
let last = -1;
let violated = false;
for (let i = 0; i < 5000; i += 1) {
  const index = pickRandomIndex(roster, last);
  if (index < 0 || index >= roster.length) violated = true;
  if (roster[index] === zeroNames[0]) violated = true;
  if (index === last) violated = true;
  last = index;
}
check("5000 次抽取不落在 weight=0 / 不重复 / 不越界", !violated);
check("全员不可抽中返回 -1", pickRandomIndex(["田瀚文"]) === -1);
check("空名单返回 -1", pickRandomIndex([]) === -1);

// ── 重试退避：3s 起翻倍，60s 封顶 ──
check("首次重试 3s", retryDelay(0) === 3000 && retryDelay(1) === 3000);
check("第二次 6s", retryDelay(2) === 6000);
check("封顶 60s", retryDelay(20) === 60000);

// ── 时间显示：毫秒与秒级时间戳都能格式化 ──
check("毫秒时间戳", /^\d{2}-\d{2} \d{2}:\d{2}$/.test(formatTime(1_700_000_000_000)));
check("秒级时间戳", /^\d{2}-\d{2} \d{2}:\d{2}$/.test(formatTime(1_700_000_000)));
check("空时间戳返回空串", formatTime(0) === "");

// ── 字号档位：旧格式 { display: { fontSizeLevel } } 必须能读回来 ──
// 换架构后把键拍平成 fontLevel，若不兼容旧格式，老师原来调好的字号会被重置成 16px。
{
  const map = new Map();
  globalThis.window = { localStorage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) } };
  const { getFontLevel, setFontLevel } = await import("./settings.js");

  map.clear();
  check("无存储时字号为 0", getFontLevel() === 0);

  map.set("classworks:settings", JSON.stringify({ display: { fontSizeLevel: 9 } }));
  check("旧格式 display.fontSizeLevel 被读出", getFontLevel() === 9);
  check("旧档位 9 换算成 25px", getFontSize(getFontLevel()) === 25);

  map.set("classworks:settings", JSON.stringify({ fontLevel: 3 }));
  check("新格式 fontLevel 优先", getFontLevel() === 3);

  map.clear();
  setFontLevel(5);
  check("写入后可读回", getFontLevel() === 5);

  map.set("classworks:settings", "not json");
  check("非法 JSON 回落 0", getFontLevel() === 0);
}

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("✓ 数据层自检全部通过");
