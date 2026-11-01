// 瀑布流列分配：按估算高度把每个学科的卡片放进当前最矮的列。
// 纯函数（无 DOM），断点与 scripts/ui-check.mjs 里的断言一一对应。
export function columnCount(width) {
  if (width < 760) return 1;
  if (width < 1240) return 2;
  if (width < 1680) return 3;
  return 4;
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
