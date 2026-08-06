import assert from "node:assert/strict";
import { mergeDates } from "../src/utils/syncMerge.js";

const DATE_KEY_RE = /^\d{8}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidDates(dates) {
  return isPlainObject(dates) && Object.entries(dates).every(([date, entry]) => (
    DATE_KEY_RE.test(date)
    && isPlainObject(entry)
    && isPlainObject(entry.homework)
    && typeof entry.updatedAt === "string"
    && Number.isFinite(Date.parse(entry.updatedAt))
  ));
}

// 场景 1: 云端该日期更新 → 应拉取
{
  const r = mergeDates({
    cloud: { "20260806": { homework: { a: "云" }, updatedAt: "2026-08-06T10:00:00.000Z" } },
    local: { "20260806": { homework: { a: "本" } } },
    meta: { "20260806": Date.parse("2026-08-06T09:00:00.000Z") },
  });
  assert.deepEqual(r.pulled, ["20260806"]);
  assert.deepEqual(r.pushed, []);
  assert.equal(r.merged["20260806"].homework.a, "云");
}

// 场景 2: 本地该日期更新 → 应推送
{
  const r = mergeDates({
    cloud: { "20260806": { homework: { a: "云" }, updatedAt: "2026-08-06T09:00:00.000Z" } },
    local: { "20260806": { homework: { a: "本" } } },
    meta: { "20260806": Date.parse("2026-08-06T11:00:00.000Z") },
  });
  assert.deepEqual(r.pulled, []);
  assert.deepEqual(r.pushed, ["20260806"]);
  assert.equal(r.merged["20260806"].homework.a, "本");
  assert.equal(r.merged["20260806"].updatedAt, "2026-08-06T11:00:00.000Z");
}

// 场景 3: 云端无该日期、本地有 → 应推送（首次备份，无 meta 视为 0，用 now 盖章）
{
  const now = "2026-08-07T08:00:00.000Z";
  const r = mergeDates({
    cloud: {},
    local: { "20260807": { homework: { a: "本" } } },
    meta: {},
    now,
  });
  assert.deepEqual(r.pushed, ["20260807"]);
  assert.deepEqual(r.pulled, []);
  assert.equal(r.merged["20260807"].homework.a, "本");
  // 关键: 首次备份的 updatedAt 必须是 now，不能是 1970（否则另一台无 meta 的设备 0>0 不成立，永不拉取）
  assert.equal(r.merged["20260807"].updatedAt, now);
}

// 场景 3b: 设备 B 无本地数据、无 meta，云端有真实时间戳 → 应拉取
{
  const r = mergeDates({
    cloud: { "20260807": { homework: { a: "云" }, updatedAt: "2026-08-07T08:00:00.000Z" } },
    local: {},
    meta: {},
  });
  assert.deepEqual(r.pulled, ["20260807"]);
  assert.deepEqual(r.pushed, []);
  assert.equal(r.merged["20260807"].homework.a, "云");
}

// 场景 4: 两端一致 → 不拉不推
{
  const r = mergeDates({
    cloud: { "20260806": { homework: { a: "x" }, updatedAt: "2026-08-06T10:00:00.000Z" } },
    local: { "20260806": { homework: { a: "x" } } },
    meta: { "20260806": Date.parse("2026-08-06T10:00:00.000Z") },
  });
  assert.deepEqual(r.pulled, []);
  assert.deepEqual(r.pushed, []);
  assert.equal(r.merged["20260806"].homework.a, "x");
}

// 场景 5: 空输入 → 空结果
{
  const r = mergeDates({ cloud: {}, local: {}, meta: {} });
  assert.deepEqual(r.pulled, []);
  assert.deepEqual(r.pushed, []);
  assert.deepEqual(r.merged, {});
}

// 场景 6: 云端文档条目必须有有效日期、作业对象和可解析时间戳
{
  assert.equal(isValidDates({
    "20260806": { homework: { a: "作业" }, updatedAt: "2026-08-06T10:00:00.000Z" },
  }), true);
  assert.equal(isValidDates({
    "20260806": { homework: {}, updatedAt: "not-a-date" },
  }), false);
  assert.equal(isValidDates({
    "2026-08-06": { homework: {}, updatedAt: "2026-08-06T10:00:00.000Z" },
  }), false);
  assert.equal(isValidDates({
    "20260806": { homework: [], updatedAt: "2026-08-06T10:00:00.000Z" },
  }), false);
}

console.log("syncMerge 自检通过: 6 个合并场景和云端数据校验");
