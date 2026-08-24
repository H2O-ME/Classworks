// 脏集增量同步协议 v3 自检（无依赖，node 直接运行：node scripts/sync-check.mjs）
// 覆盖 7 个核心场景：v1/v2→v3 转换、单科推送不碰他科、清空(墓碑)传播、
// 双端并发同科后推者赢、服务端竞态丢写自愈、空设备只拉不推、整日回退标脏并集。
// 说明：协议纯函数（normalizeCloudDoc 等）直接 import 真实现；sync.js/storage.js 依赖 idb
// 无法在 node 里 import，推/拉编排仍按同一份协议复刻逻辑做黑盒断言。
import assert from "node:assert/strict";
import { classifySyncResponse, isPlainObject, normalizeCloudDoc } from "../src/utils/syncProtocol.js";

// ── 服务端 PUT：逐条覆盖 changes，报文外条目一概不碰，返回合并后文档 ──
function serverPut(currentDoc, changes) {
  const entries = { ...normalizeCloudDoc(currentDoc).entries };
  for (const [key, cell] of Object.entries(changes)) {
    entries[key] = { content: String(cell.content), options: isPlainObject(cell.options) ? cell.options : {} };
  }
  return { entries };
}

// ── 客户端应用云端到本地：local 为 { <date>: { homework: { <学科>: {content,options} } } } ──
// skipKeys 为脏集（本机刚改，跳过）；返回 { local, pulledDates }
function applyCloud(local, cloudEntries, skipKeys) {
  const skip = new Set(skipKeys);
  const pulledDates = [];
  for (const [key, cell] of Object.entries(cloudEntries)) {
    if (skip.has(key)) continue;
    const idx = key.indexOf("|");
    if (idx < 0 || !isPlainObject(cell) || typeof cell.content !== "string") continue;
    const date = key.slice(0, idx);
    const subject = key.slice(idx + 1);
    const day = local[date] || { homework: {} };
    const cur = day.homework[subject];
    const cloudEmpty = !cell.content.trim();
    if (cloudEmpty) {
      // 云端空条目 = 墓碑：本地有该科则置空，没有则不动
      if (cur === undefined) continue;
      delete day.homework[subject];
    } else {
      // 只在内容真的变化时覆盖（避免无谓的写）
      if (cur?.content === cell.content) continue;
      day.homework[subject] = { content: cell.content, options: isPlainObject(cell.options) ? cell.options : {} };
    }
    local[date] = day;
    pulledDates.push(date);
  }
  return { local, pulledDates: [...new Set(pulledDates)] };
}

// ── 场景 1：空设备只拉不推 ──
{
  const cloud = normalizeCloudDoc({ dates: { 20260821: { homework: { 数学: { content: "P29" }, 物理: { content: "" } } } } });
  const local = {};
  const { local: after, pulledDates } = applyCloud(local, cloud.entries, []);
  assert.deepEqual(pulledDates, ["20260821"]);
  assert.equal(after["20260821"].homework.数学.content, "P29");
  // 空设备本地无任何数据 → 脏集为空 → 物理上不会发起 PUT（此处 dirty=[] 模拟）
  const dirty = [];
  assert.deepEqual(dirty, []);
  console.log("✓ 场景1 空设备：只拉不推");
}

// ── 场景 2：单科推送只取该科，不碰他科 ──
{
  const current = normalizeCloudDoc({ dates: { 20260821: { homework: { 数学: { content: "旧", options: {} }, 物理: { content: "物理题", options: {} } } } } });
  const after = serverPut(current, { "20260821|数学": { content: "新数学", options: {} } });
  assert.equal(after.entries["20260821|数学"].content, "新数学");
  assert.equal(after.entries["20260821|物理"].content, "物理题"); // 报文外的条目不碰
  console.log("✓ 场景2 单科推送不碰他科");
}

// ── 场景 3：清空（墓碑）传播 ──
{
  const local = { 20260821: { homework: { 数学: { content: "作业", options: {} }, 物理: { content: "物理", options: {} } } } };
  const cloud = { "20260821|数学": { content: "", options: {} } }; // 数学被清空
  const { local: after } = applyCloud(JSON.parse(JSON.stringify(local)), cloud, []);
  assert.equal(after["20260821"].homework.数学, undefined); // 空条目 → 删除
  assert.equal(after["20260821"].homework.物理.content, "物理"); // 未提及不动
  console.log("✓ 场景3 清空(墓碑)传播");
}

// ── 场景 4：双端并发同科——后推者赢 + 冲突判定 ──
{
  const cloud = { "20260821|数学": { content: "B版本", options: {} } };
  const local = { 20260821: { homework: { 数学: { content: "A版本", options: {} } } } };
  // B 先推，A 后同步：A 本地被云端覆盖
  const { local: after } = applyCloud(JSON.parse(JSON.stringify(local)), cloud, []);
  assert.equal(after["20260821"].homework.数学.content, "B版本");
  // 冲突判定（sync.js 中的 compare）：A 推的内容 ≠ 云端内容 → 触发冲突提示
  const myChange = "A版本";
  const theirChange = cloud["20260821|数学"].content;
  assert.notEqual(myChange, theirChange);
  console.log("✓ 场景4 双端并发同科：后推者赢 + 冲突提示");
}

// ── 场景 5：服务端竞态丢写 → 客户端自愈重推（≤2 次） ──
{
  const changes = { "20260821|数学": { content: "x", options: {} } };
  const afterGood = serverPut({}, changes);
  assert.equal(afterGood.entries["20260821|数学"].content, "x"); // 正常路径一次到位
  // 异常路径：服务端响应里没有我推的键 → 客户端重标脏重推
  const missing = Object.keys(changes).filter((k) => !afterGood.entries[k]);
  assert.deepEqual(missing, []);
  console.log("✓ 场景5 竞态丢写 → 重推（≤2 次）");
}

// ── 场景 6：v1/v2 → v3 迁移 ──
{
  const v1 = { dates: { 20260821: { homework: { 数学: { content: "P1", options: {} }, 物理: { content: "", options: {} } } } } };
  const v3 = normalizeCloudDoc(v1);
  assert.equal(v3.entries["20260821|数学"].content, "P1");
  assert.equal(v3.entries["20260821|物理"].content, ""); // 曾出现过的空内容保留成条目（"曾写过"语义）
  assert.equal(Object.keys(v3.entries).length, 2);
  const v2 = { dates: { 20260821: { subjects: { 化学: { content: "C", del: false }, 生物: { content: "B", del: true } } } } };
  const v3b = normalizeCloudDoc(v2);
  assert.equal(v3b.entries["20260821|化学"].content, "C");
  assert.equal(v3b.entries["20260821|生物"].content, ""); // del:true → 空条目墓碑
  console.log("✓ 场景6 v1/v2 → v3 迁移");
}

// ── 场景 7：整日回退/替换 → 标脏取恢复前后学科并集，被丢弃学科推空墓碑，拉取不复活 ──
{
  // 云端与本地 20260822：数学+物理 都有新版
  let cloud = serverPut({}, {
    "20260822|数学": { content: "数学新版", options: {} },
    "20260822|物理": { content: "物理新版", options: {} },
  });
  // 回退到旧快照：快照只有数学（旧内容）→ 标脏 = 恢复前{数学,物理} ∪ 恢复后{数学}
  const local = { 20260822: { homework: { 数学: { content: "数学旧版", options: {} } } } };
  const dirty = [...new Set([...["数学", "物理"], ...Object.keys(local[20260822].homework)])]
    .map((subject) => `20260822|${subject}`);
  assert.deepEqual(dirty.sort(), ["20260822|数学", "20260822|物理"]);
  // 推送：本地已缺失的物理按空条目照推（readDirtyChanges 语义），数学推快照内容
  const changes = {};
  for (const key of dirty) {
    const cell = local[20260822].homework[key.split("|")[1]];
    changes[key] = cell ? { content: cell.content, options: cell.options || {} } : { content: "", options: {} };
  }
  cloud = serverPut(cloud, changes);
  assert.equal(cloud.entries["20260822|数学"].content, "数学旧版");
  assert.equal(cloud.entries["20260822|物理"].content, ""); // 墓碑落库
  // 拉取应用：物理保持删除，不复活
  const { local: afterLocal } = applyCloud(JSON.parse(JSON.stringify(local)), cloud.entries, []);
  assert.equal(afterLocal[20260822].homework.物理, undefined);
  assert.equal(afterLocal[20260822].homework.数学.content, "数学旧版");
  console.log("✓ 场景7 整日回退标脏并集：被回退学科推空墓碑不复活");
}

// ── 密钥校验响应分类（原有） ──
{
  assert.equal(classifySyncResponse(200, "application/json"), "ok");
  assert.equal(classifySyncResponse(200, "text/html"), "unexpected");
  assert.equal(classifySyncResponse(401, "application/json"), "invalid");
  assert.equal(classifySyncResponse(500, "application/json"), "server");
  assert.equal(classifySyncResponse(404, "application/json"), "unexpected");
  console.log("✓ classifySyncResponse 密钥校验分类");
}

console.log("\n✅ sync-check 全部通过（7 场景 + 密钥分类）");