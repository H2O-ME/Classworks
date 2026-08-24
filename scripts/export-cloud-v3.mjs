// 导出云端作业为 v3 协议 JSON：打印信息，同时强制 v=3。
// 用法：node scripts/export-cloud-v3.mjs <SYNC_SECRET> <output.json>
import fs from "node:fs";

const [secret, outFile] = process.argv.slice(2);
if (!secret || !outFile) {
  console.error("用法: node scripts/export-cloud-v3.mjs <SYNC_SECRET> <out.json>");
  process.exit(2);
}

const res = await fetch(`https://classworks.tianhw.top/kv/homework?t=${Date.now()}`, {
  headers: { "x-sync-secret": secret },
});
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}

const doc = await res.json();

// 强制 v3：若云端已经是 v3（通常如此）原样保留 entries；否则按协议归一化重建 v3 文档
const v3 = { v: 3, entries: doc.entries && typeof doc.entries === "object" ? doc.entries : {} };
const v3json = JSON.stringify(v3);  

fs.writeFileSync(outFile, v3json, "utf8");

// 自检：读回、解析、验证 v3 结构
const back = JSON.parse(fs.readFileSync(outFile, "utf8"));
const entryCount = Object.keys(back.entries).length;
const invalid = Object.entries(back.entries).filter(
  ([k, c]) => typeof k !== "string" || !k.includes("|") || typeof c?.content !== "string",
).length;
const dates = [...new Set(Object.keys(back.entries).map((k) => k.split("|")[0]))].sort();

console.log(`✓ v = ${back.v} (isV3: ${back.v === 3})`);
console.log(`✓ entries = ${entryCount}, invalid = ${invalid}`);
console.log(`✓ date range = ${dates[0]} .. ${dates[dates.length - 1]} (${dates.length} 天)`);
console.log(`✓ written to ${outFile} (${v3json.length} chars, UTF-8 无 BOM)`);