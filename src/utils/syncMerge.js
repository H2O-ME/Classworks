// 日期级 last-write-wins 合并（纯函数，无 IO）。
// cloud: { date: { homework, updatedAt } }（updatedAt 为 ISO 字符串）
// local: { date: { homework } }（本地 IndexedDB 中 normalize 后的数据）
// meta:  { date: epochMs }（本地最后保存/同步时间；无 meta 为 0）
// now:   ISO 字符串，仅用于"首次备份"（本地有、云端无、无 meta）时盖章，
//        避免 new Date(0) 生成 1970 导致其他设备 0>0 不成立、永不拉取。
// 返回 { pulled, pushed, merged }：
//   pulled — 云端更新被采纳的日期（调用方需快照本地后覆写）
//   pushed — 本地更新需要推送的日期
//   merged — 合并后的整包（推送用）

export function mergeDates({ cloud, local, meta, now = new Date().toISOString() }) {
  const dates = new Set([...Object.keys(cloud), ...Object.keys(local)]);
  const pulled = [];
  const pushed = [];
  const merged = {};

  for (const date of dates) {
    const cloudEntry = cloud[date];
    const localEntry = local[date];
    const cloudTime = cloudEntry ? Date.parse(cloudEntry.updatedAt) : -1;
    const localTime = meta[date] ?? 0;

    if (cloudEntry && cloudTime > localTime) {
      pulled.push(date);
      merged[date] = { homework: cloudEntry.homework, updatedAt: cloudEntry.updatedAt };
    } else if (localEntry && !cloudEntry) {
      pushed.push(date);
      merged[date] = { homework: localEntry.homework, updatedAt: localTime ? new Date(localTime).toISOString() : now };
    } else if (localEntry && localTime > cloudTime) {
      pushed.push(date);
      merged[date] = { homework: localEntry.homework, updatedAt: new Date(localTime).toISOString() };
    } else if (cloudEntry) {
      merged[date] = { homework: cloudEntry.homework, updatedAt: cloudEntry.updatedAt };
    } else {
      merged[date] = { homework: localEntry.homework, updatedAt: new Date(localTime).toISOString() };
    }
  }

  return { pulled, pushed, merged };
}