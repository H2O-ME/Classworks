// 前端 UI 非平凡逻辑的自检：瀑布流断点与列分配。
// 跑法：node scripts/ui-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { columnCount, distribute } from "../src/components/home/masonry.js";

// 断点：<760 1 列，<1240 2 列，其余 3 列（封顶 3：大屏 4 列会压窄卡片，正文难读）
assert.equal(columnCount(320), 1);
assert.equal(columnCount(759), 1);
assert.equal(columnCount(760), 2);
assert.equal(columnCount(1239), 2);
assert.equal(columnCount(1240), 3);
assert.equal(columnCount(1680), 3);
assert.equal(columnCount(1868), 3);
assert.equal(columnCount(2560), 3);

// 列分配：每张卡进当前最矮的列
const items = [
  { id: "a", height: 100 },
  { id: "b", height: 20 },
  { id: "c", height: 10 },
];
const columns = distribute(items, 2, (item) => item.height);
assert.deepEqual(
  columns.map((column) => column.map((item) => item.id)),
  [["a"], ["b", "c"]],
);
assert.deepEqual(distribute([], 3, () => 1).map((column) => column.length), [0, 0, 0]);

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
    "src/pages/login.vue",
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
