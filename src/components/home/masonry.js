// 瀑布流列分配：把学科卡分到 N 列，让最高的那一列尽量矮。
// 纯函数（无 DOM），断点与 scripts/ui-check.mjs 里的断言一一对应。
// 上限 3 列：教室大屏（1868px 宽）下 3 列每张卡约 580px，正文最好读；
// 4 列会把每张卡压到 430px 以下，38px 字号时一行只能放几个字。
export function columnCount(width) {
  if (width < 760) return 1;
  if (width < 1240) return 2;
  return 3;
}

// 列内卡片间距：CSS 里 .masonry-column 与 .masonry-board 的 gap 都是 1.125rem，
// 全站 1rem = 20px，所以是 22.5px。只用于比较列高，不需要像素级精确。
export const COLUMN_GAP_PX = 22.5;

/**
 * 自由装箱的最优分配：最小化「最高列」，同级再让各列更均匀。
 *
 * 为什么不保学科顺序：曾经用「顺序切段」的 DP（切点只能沿学科序），实测线上
 * 6 科高度 [154,155,415,335,153,510] 时，顺序最优切法 3/2/1 的最高列 769px，
 * 而当前 2/2/2 是 772px —— 只差 3px，等于没改善：因为英语+物理两张高卡无论
 * 怎么切要么同列、要么切开后另一列被顶高。放开顺序后最优可到 663px（降 14%），
 * 中列不再压到工具栏下面。
 *
 * 列内仍按学科固定顺序自上而下，只是不再要求「语文数学必须排最左」。
 *
 * ponytail: 6 科 3 列只有 3^6=729 种放法，直接穷举即精确最优；学科数一旦扩大到
 * 10+ 就指数爆炸（3^10≈6万仍可接受，3^15≈1400万就不行了），届时换 LPT 贪心 + 局部搜索。
 */
export function balance(items, count, heightOf, gap = COLUMN_GAP_PX) {
  const columns = Array.from({ length: count }, () => []);
  const n = items.length;
  if (n === 0) return columns;

  // 卡比列多才有得放；不足时多出来的轨道留空
  const cols = Math.min(count, n);
  const heights = items.map((item) => Math.max(1, heightOf(item)));
  const binHeight = (bin) => bin.reduce((sum, idx, i) => sum + heights[idx] + (i ? gap : 0), 0);

  const bins = Array.from({ length: cols }, () => []);
  let best = null;

  const assign = (index) => {
    if (index === n) {
      if (bins.some((bin) => bin.length === 0)) return;
      const columnHeights = bins.map(binHeight);
      const tallest = Math.max(...columnHeights);
      const spread = columnHeights.reduce((sum, value) => sum + value * value, 0);
      // 只在严格更优时替换：枚举按「早的科先进前头的列」推，因此同分时天然偏向接近阅读顺序的放法
      if (
        !best ||
        tallest < best.tallest - 1e-9 ||
        (Math.abs(tallest - best.tallest) <= 1e-9 && spread < best.spread - 1e-9)
      ) {
        best = { tallest, spread, bins: bins.map((bin) => [...bin]) };
      }
      return;
    }
    for (let c = 0; c < cols; c += 1) {
      bins[c].push(index);
      assign(index + 1);
      bins[c].pop();
    }
  };
  assign(0);

  // 列内按学科原顺序排列：自上而下读仍是固定学科序
  best.bins.forEach((bin, c) => {
    columns[c] = bin.map((index) => items[index]);
  });
  return columns;
}
