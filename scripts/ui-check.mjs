// 前端 UI 非平凡逻辑的自检：瀑布流断点与列分配。
// 跑法：node scripts/ui-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { columnCount, distribute } from "../src/components/home/masonry.js";

// 断点：<760 1 列，<1240 2 列，<1680 3 列，否则 4 列
assert.equal(columnCount(320), 1);
assert.equal(columnCount(759), 1);
assert.equal(columnCount(760), 2);
assert.equal(columnCount(1239), 2);
assert.equal(columnCount(1240), 3);
assert.equal(columnCount(1679), 3);
assert.equal(columnCount(1680), 4);

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
}

console.log("ui-check ok");
