// 瀑布流列分配：把 6 张学科卡按原顺序切成 N 段，让最高的那一列尽量矮。
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
 * 顺序切列的最优分配（最小化「最高列」）。保留学科顺序，不让卡片按高度乱跳。
 *
 * 为什么不是「每张卡进当前最矮的列」（贪心）：贪心逐个放卡，会先把高卡塞进空列，
 * 剩下的低卡又去填别的列，最后把最高的一张卡单独留在一列 —— 实测 6 科时
 * 最高列 955px（英语+地理）远超屏高，另两列留白 300px。
 * 改成对「切点」做 DP：6 张卡、3 列只有 O(n²k) 种切法，直接取最优，最高列降到 ~720px。
 */
export function distribute(items, count, heightOf, gap = COLUMN_GAP_PX) {
  const columns = Array.from({ length: count }, () => []);
  const n = items.length;
  if (n === 0) return columns;

  // 卡比列多才有得切；不足时多出来的轨道留空
  const cols = Math.min(count, n);
  const heights = items.map((item) => Math.max(1, heightOf(item)));

  // pre[i] = 前 i 张卡的高度合计
  const pre = [0];
  for (let i = 0; i < n; i += 1) pre.push(pre[i] + heights[i]);
  // 第 j..i-1 张卡放同一列时的列高（卡之间要留 gap）
  const spanHeight = (j, i) => pre[i] - pre[j] + gap * Math.max(0, i - j - 1);

  // dp[c][i] = 前 i 张卡切成 c 列时，最高列的最小高度
  const dp = Array.from({ length: cols + 1 }, () => new Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: cols + 1 }, () => new Array(n + 1).fill(0));
  dp[0][0] = 0;
  for (let c = 1; c <= cols; c += 1) {
    for (let i = c; i <= n; i += 1) {
      for (let j = c - 1; j < i; j += 1) {
        const worst = Math.max(dp[c - 1][j], spanHeight(j, i));
        // 最高列打平时偏好「末段更矮」的切点：前面的列装得更满，避免某列只剩一张孤卡
        const better =
          worst < dp[c][i] ||
          (worst !== Infinity && worst === dp[c][i] && spanHeight(j, i) < spanHeight(cut[c][i], i));
        if (better) {
          dp[c][i] = worst;
          cut[c][i] = j;
        }
      }
    }
  }

  let end = n;
  for (let c = cols; c >= 1; c -= 1) {
    const start = cut[c][end];
    columns[c - 1] = items.slice(start, end);
    end = start;
  }
  return columns;
}
