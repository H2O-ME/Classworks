// 前端 UI 非平凡逻辑的自检：瀑布流断点与列分配。
// 跑法：node scripts/ui-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { balance, COLUMN_GAP_PX, columnCount } from "../src/components/home/masonry.js";

// 断点：<760 1 列，<1240 2 列，其余 3 列（封顶 3：大屏 4 列会压窄卡片，正文难读）
assert.equal(columnCount(320), 1);
assert.equal(columnCount(759), 1);
assert.equal(columnCount(760), 2);
assert.equal(columnCount(1239), 2);
assert.equal(columnCount(1240), 3);
assert.equal(columnCount(1680), 3);
assert.equal(columnCount(1868), 3);
assert.equal(columnCount(2560), 3);

// 列分配：自由装箱穷举，最小化「最高列」，同级让各列更均匀。
// 踩过的坑：① 贪心（每张进当前最矮列）会把两张高卡叠一起；② 保序 DP 在线上
// 6 科实况里几乎没改善（顺序最优 769px vs 当前 2/2/2 的 772px，差 3px）——
// 因为英语+物理两张高卡无论怎么切都得占掉大半列。放开顺序后最优 663px。
{
  const items = [
    { id: "a", height: 100 },
    { id: "b", height: 20 },
    { id: "c", height: 10 },
  ];
  const columns = balance(items, 2, (item) => item.height, 0);
  // 最优放法是 [a] / [b,c]：最高列 100；[a,b]/[c] 是 120
  const heights = columns.map((column) => column.reduce((sum, item) => sum + item.height, 0));
  assert.equal(Math.max(...heights), 100, "两列时应取「最高列最矮」的放法");
  // 列内仍按原顺序（学科顺序自上而下）
  for (const column of columns) {
    const ids = column.map((item) => item.id);
    assert.deepEqual(ids, [...ids].sort((x, y) => x.localeCompare(y)), "列内应保持原顺序");
  }

  assert.deepEqual(balance([], 3, () => 1).map((column) => column.length), [0, 0, 0]);

  // 线上实况（1868px 宽、29px 字号，截图标尺反推）：
  // 旧 2/2/2 = 309/772/685（最高 772，中列压到工具栏下）
  // 保序最优 = 769（几乎没变）；自由装箱 = 685.5/592.5/511.5（最高 685.5）
  const real = [
    { id: "语文", h: 154 },
    { id: "数学", h: 155 },
    { id: "英语", h: 415 },
    { id: "物理", h: 335 },
    { id: "化学", h: 153 },
    { id: "地理", h: 510 },
  ];
  const laid = balance(real, 3, (item) => item.h);
  const colH = laid.map((column) =>
    column.reduce((sum, item, i) => sum + item.h + (i ? COLUMN_GAP_PX : 0), 0),
  );
  const tallest = Math.max(...colH);
  assert.ok(
    Math.abs(tallest - 685.5) < 1,
    `线上实况最高列应为 685.5px（实测 ${Math.round(tallest)}px）—— 保序方案只能到 769px`,
  );
  // 6 张卡摊到 3 列，每列都该有卡（不能空列留白）
  assert.ok(laid.every((column) => column.length >= 1), "3 列 6 卡时不该有空列");
  // 最高的两张卡（英语/地理）不应落在同一列
  assert.ok(
    laid.every((column) => {
      const ids = column.map((item) => item.id);
      return !(ids.includes("英语") && ids.includes("地理"));
    }),
    "两张最高的卡不该叠在同一列",
  );
}

// 回归守卫：卡高必须实测，不能退回按字数估算。
// 踩过的坑：估算式（字数/14*20）在字号调大、英文长句时全错，
// 实测最高列偏差 300px，导致卡片被顶出屏幕。
{
  const grid = readFileSync(new URL("../src/components/home/HomeworkGrid.vue", import.meta.url), "utf8");
  assert.match(grid, /offsetHeight/, "HomeworkGrid 必须实测卡片高度（measureCards）");
  assert.ok(
    !/estimateCardHeight/.test(grid),
    "不该再有按字数估算卡高的 estimateCardHeight（实测才准）",
  );
}

// 回归守卫：网格的列类名必须绑定到声明过的 ref。
// 踩过的坑：模板写成 `columns-${columnCount}` 时绑定的是 import 进来的纯函数，
// 类名退化成无效字符串 → grid-template-columns 不生效 → 所有卡片挤成一列各占整行。
{
  const grid = readFileSync(new URL("../src/components/home/HomeworkGrid.vue", import.meta.url), "utf8");
  const bindings = [...grid.matchAll(/columns-\$\{(\w+)\}/g)].map((match) => match[1]);
  assert.ok(bindings.length > 0, "HomeworkGrid 模板里找不到 columns-${...} 列类名绑定");
  for (const name of bindings) {
    assert.match(
      grid,
      new RegExp(`const\\s+${name}\\s*[=:]`),
      `列类名绑定的 ${name} 必须是本组件里声明的变量（不能是 import 进来的函数）`,
    );
  }
  // 封顶 3 列：CSS 里不该再有 columns-4 的网格定义，免得误以为大屏会排 4 列
  assert.ok(!grid.includes("columns-4"), "HomeworkGrid 里不该再有 columns-4（列数已封顶 3）");

  // 回归守卫：编辑权必须按学科逐卡判定，不能退回「整页只读」的单一开关。
  // 踩过的坑：早期只有 readonly 布尔，课代表登录后整页都被锁死。
  assert.ok(!/readonly:\s*\{\s*type:\s*Boolean/.test(grid), "HomeworkGrid 不该再有全局 readonly prop");
  const page = readFileSync(new URL("../src/pages/index.vue", import.meta.url), "utf8");
  assert.match(page, /:editable-subjects="/, "index.vue 必须把可写科目传给 HomeworkGrid");
}

// 回归守卫：页面从 composable 解构出来的名字，必须真的在它的 return 里。
// 踩过的坑：useAuth() 里有 refreshIdentity 这个导出函数，但忘了放进 return 的对象里，
// 页面 `const { refreshIdentity } = useAuth()` 拿到 undefined，onMounted 里调用时
// 线上报 “i is not a function”，构建和 lint 都不报错。这类错只有真跑起来才炸。
{
  const composables = ["useAuth", "useBoard"];
  const pages = [
    "src/pages/index.vue",
    "src/pages/settings.vue",
    "src/components/FloatingToolbar.vue",
    "src/components/HomeworkEditDialog.vue",
  ];
  for (const name of composables) {
    const source = readFileSync(new URL(`../src/composables/${name}.js`, import.meta.url), "utf8");
    // 取 `export function xxx() { ... return { ... } }` 里 return 对象的第一层键
    const returnBlock = /export function \w+\(\)\s*\{[\s\S]*?\n {2}return \{([\s\S]*?)\n {2}\};/.exec(source);
    assert.ok(returnBlock, `${name}.js 里找不到 export function … return { … } 结构`);
    const exported = new Set(
      [...returnBlock[1].matchAll(/^ {4}(\w+)\s*[,:]/gm)].map((match) => match[1]),
    );
    assert.ok(exported.size > 0, `${name}.js 的 return 对象解析为空`);

    for (const relative of pages) {
      const page = readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
      const destructure = new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*${name}\\(\\)`).exec(page);
      if (!destructure) continue;
      const wanted = destructure[1]
        .split(",")
        .map((part) => part.split(":").pop().trim())
        .filter(Boolean);
      for (const key of wanted) {
        assert.ok(
          exported.has(key),
          `${relative} 从 ${name}() 解构了 ${key}，但 ${name}.js 的 return 里没有它（运行时会是 undefined）`,
        );
      }
    }
  }
}

// 回归守卫：白板身份必须经后端验证，不能「URL 里有个 key 就解锁全科编辑」。
// 踩过的坑：isBoard 只判断 boardToken 非空，访问 ?key=see（把 seewo 打漏一个字母）
// 也能看到全部铅笔，写接口其实一直 401，用户以为存上了。
{
  const auth = readFileSync(new URL("../src/composables/useAuth.js", import.meta.url), "utf8");
  assert.match(
    auth,
    /const isBoard = computed\(\(\) => Boolean\(state\.boardToken\) && state\.boardVerified\)/,
    "useAuth 的 isBoard 必须同时要求 boardToken 与 boardVerified（只凭有 key 就解锁是安全漏洞）",
  );
  assert.match(auth, /export async function verifyBoardToken/, "useAuth 必须导出 verifyBoardToken");
  assert.match(auth, /checkBoardToken/, "verifyBoardToken 必须真的问后端，不能本地瞎猜");

  const page = readFileSync(new URL("../src/pages/index.vue", import.meta.url), "utf8");
  assert.match(page, /verifyBoardToken\(\)/, "index.vue 进页面必须校验白板口令");

  const board = readFileSync(new URL("../src/composables/useBoard.js", import.meta.url), "utf8");
  assert.match(board, /revokeBoardToken\(\)/, "写接口 401 时必须撤销白板身份（降级只读）");
  // 保存失败要回退画面：否则用户看到字变了，以为存上了
  assert.match(
    board,
    /if \(!result\.ok\) \{[\s\S]*?boardData\.value = \{ \.\.\.boardData\.value, \[subject\]: before \}/,
    "saveSubject 在权限被拒时必须把卡片内容退回原值",
  );
}

// 回归守卫：全站尺寸基准必须留在 125%。
// 踩过的坑：样式里写死 px 的字号/尺寸不会跟 rem 基准放大，正文会比周围小一圈。
// 所以 <style> 块里除 1px 描边外都不该出现 px；断点（@media）必须留 px，
// 因为它描述视口宽度，跟着缩放会让列数在错误的宽度切换。
{
  const css = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
  assert.match(
    css,
    /html\s*\{[^}]*font-size:\s*125%/,
    "index.css 的 html 必须声明 font-size:125%（全站尺寸基准）",
  );

  const styled = [
    "src/components/home/HomeworkGrid.vue",
    "src/components/home/SubjectAddCard.vue",
    "src/components/common/HomeSkeleton.vue",
    "src/components/FloatingToolbar.vue",
    "src/components/HomeworkEditDialog.vue",
    "src/components/AppToast.vue",
    "src/pages/index.vue",
  ];
  for (const relative of styled) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
    const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map((match) => match[1])
      .join("\n")
      // 断点描述视口宽度，不动
      .replace(/@media[^{]*/g, "");
    const offenders = [...styles.matchAll(/(?<![\w.-])(\d*\.?\d+)px/g)]
      .map((match) => match[1])
      .filter((num) => num !== "0" && num !== "1");
    assert.deepEqual(
      offenders,
      [],
      `${relative} 的样式里还有 px 尺寸（${offenders.join(", ")}）：应该用 rem，否则不跟 125% 基准放大`,
    );
  }
}

console.log("ui-check ok");
