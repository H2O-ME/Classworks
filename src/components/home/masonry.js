// 瀑布流列分配：按估算高度把每个学科的卡片放进当前最矮的列。
// 纯函数（无 DOM），断点与 scripts/ui-check.mjs 里的断言一一对应。
// 上限 3 列：教室大屏（1868px 宽）下 3 列每张卡约 580px，正文最好读；
// 4 列会把每张卡压到 430px 以下，38px 字号时一行只能放几个字。
export function columnCount(width) {
  if (width < 760) return 1;
  if (width < 1240) return 2;
  return 3;
}

export function distribute(items, count, estimateHeight) {
  const columns = Array.from({ length: count }, () => []);
  const heights = new Array(count).fill(0);
  for (const item of items) {
    let target = 0;
    for (let index = 1; index < count; index += 1) {
      if (heights[index] < heights[target]) target = index;
    }
    columns[target].push(item);
    heights[target] += estimateHeight(item);
  }
  return columns;
}
