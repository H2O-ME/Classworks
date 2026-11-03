// 学科、日期、字号相关的纯函数。页面与 composable 共用，别在这里加 IO。
export const SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "地理"];

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 40;
const FONT_SIZE_BASE = 16;

export function getDefaultSubjects() {
  return SUBJECTS.map((name, order) => ({ name, order }));
}

// 后端 subjects（{ 学科: { content, updatedAt } }）→ 页面用的扁平结构；空内容视为未填
export function boardFromApi(subjects) {
  const board = {};
  const updatedAtMap = {};
  for (const [subject, cell] of Object.entries(subjects || {})) {
    const content = typeof cell?.content === "string" ? cell.content : "";
    const updatedAt = Number(cell?.updatedAt) || 0;
    if (!content.trim()) continue;
    board[subject] = content;
    updatedAtMap[subject] = updatedAt;
  }
  return { board, updatedAtMap };
}

// 网格用：按固定学科顺序排好，只保留有内容的科目
export function toGridItems(board) {
  const items = [];
  SUBJECTS.forEach((name, order) => {
    const content = board?.[name];
    if (typeof content === "string" && content.trim()) {
      items.push({ key: name, name, order, content });
    }
  });
  return items;
}

export function unusedSubjects(items) {
  const used = new Set((items || []).map((item) => item.name));
  return getDefaultSubjects().filter((subject) => !used.has(subject.name));
}

// 本地日期分量：new Date("YYYY-MM-DD") 按 UTC 解析，UTC 以西会错一天
export function formatDateKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

// 兼容 URL 参数 / 日期组件 / yyyy-mm-dd 字符串；无法解析时回落到今天
export function parseDateArg(value) {
  if (value instanceof Date) return value;
  const text = String(value || "");
  if (/^\d{8}$/.test(text)) {
    return new Date(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function shiftDate(dateKey, offset) {
  const date = parseDateArg(dateKey);
  date.setDate(date.getDate() + offset);
  return formatDateKey(date);
}

// 字号档位 → 实际 px：大屏看得清，小屏也不至于撑爆
export function getFontSize(level) {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, FONT_SIZE_BASE + Number(level || 0)));
}

export function formatDateLabel(dateKey) {
  const date = parseDateArg(dateKey);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

// ── 权限判定：纯函数，selfcheck 直接断言 ──
// URL 口令验证通过 = 全科可写；否则只读
export function resolveEditPermission({ isBoard }) {
  return Boolean(isBoard);
}

// ── 多设备轮询合并（纯函数，selfcheck 直接断言）──
// 逐科比对 updatedAt，只接受远端更新的科；本地有待发改动（pendingKeys 命中）的科一律不动。
// 远端清空的科（remote 缺失且远端时间戳 > 本地）也要跟进删除。
// 无变化返回 null，调用方跳过赋值。dateKey 是 pending 队列键的「日期|」前缀。
export function mergeRemote({ local, localAt, remote, remoteAt, pendingKeys, dateKey }) {
  const pendingSet = new Set(pendingKeys);
  const board = { ...local };
  const stamps = { ...localAt };
  let changed = false;

  for (const subject of Object.keys(remote)) {
    if (pendingSet.has(`${dateKey}${subject}`)) continue;
    if ((remoteAt[subject] || 0) > (localAt[subject] || 0) && remote[subject] !== local[subject]) {
      board[subject] = remote[subject];
      stamps[subject] = remoteAt[subject] || 0;
      changed = true;
    }
  }
  // 远端清空的科：boardFromApi 已丢弃空内容，remote 缺失即被清空
  for (const subject of Object.keys(local)) {
    if (subject in remote || pendingSet.has(`${dateKey}${subject}`)) continue;
    if ((remoteAt[subject] || 0) > (localAt[subject] || 0)) {
      delete board[subject];
      delete stamps[subject];
      changed = true;
    }
  }
  return changed ? { board, updatedAtMap: stamps } : null;
}
