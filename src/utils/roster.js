// 名单与加权抽签的纯函数（无副作用，便于 `node src/utils/selfcheck.mjs` 直接断言）
// 与 server/roster.json 是同一份人：那边多带拼音用于建号，前端只点名，不需要拼音。
const DEFAULT_ROSTER = [
  "邴楷航",
  "常鑫圻",
  "陈瀚泽",
  "陈宇轩",
  "程千宁",
  "仇新惠",
  "丁钰涵",
  "杜宜宸",
  "高宏博",
  "高子莘",
  "耿晨曦",
  "耿方浩",
  "郭姝秀",
  "韩燕琳",
  "胡铭楷",
  "黄兴宇",
  "金宇铭",
  "李皓月",
  "李默然",
  "李笑宇",
  "廉朔",
  "刘瀚淇",
  "刘佩涵",
  "刘怡林",
  "马宇辰",
  "邱林昊",
  "孙颢瑜",
  "孙浚友",
  "孙锐哲",
  "孙翊宸",
  "田瀚文",
  "田津菡",
  "王方宇",
  "王冠森",
  "王家顺",
  "王静一",
  "王禄涵",
  "王梦金",
  "王梦炀",
  "王旻昊",
  "王梓旭",
  "吴昊泽",
  "夏子涵",
  "闫娅淇",
  "杨雅荀",
  "袁来",
  "臧郅博",
  "张涵硕",
  "张骞月",
  "朱晨宇",
  "高熙媛",
];

// 权重为 0 的名字正常出现在名单里，但永远抽不中
const ZERO_WEIGHT_NAMES = new Set(["田瀚文"]);

export function getDefaultRoster() {
  return [...DEFAULT_ROSTER];
}

export function getPickWeight(name) {
  return ZERO_WEIGHT_NAMES.has(name) ? 0 : 1;
}

// 加权随机取下标，保证与上一次不同（无可抽名字时返回 -1）
// ponytail: 名单 50+ 人，线性累积权重 O(n) 足够，不建别名表
export function pickRandomIndex(names, lastIndex = -1) {
  const weights = names.map(getPickWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return -1;
  let roll = Math.random() * total;
  let index = 0;
  for (; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) break;
  }
  if (index >= weights.length) index = weights.length - 1;
  // 撞上上次就顺延到下一个权重>0 的名字（名单里权重>0 的不止一个时必能找到）
  if (index === lastIndex) {
    for (let step = 1; step < weights.length; step += 1) {
      const next = (index + step) % weights.length;
      if (weights[next] > 0) {
        index = next;
        break;
      }
    }
  }
  return index;
}
