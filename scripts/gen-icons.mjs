// 图标栅格化：public/pwa/icon.svg → PWA 全套 PNG + apple-touch + favicon.ico
// 跑法: node scripts/gen-icons.mjs（sharp 是 devDependency）
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("public/pwa/icon.svg");

// maskable 安全区：内容缩放到中央 80%，底色铺满（圆形裁切不留白）
const maskableSvg = Buffer.from(
  svg
    .toString()
    .replace(
      '<g clip-path="url(#round)">',
      '<g clip-path="url(#round)"><rect width="512" height="512" fill="#111111"/></g>' +
        '<g transform="translate(51.2 51.2) scale(0.8)" clip-path="url(#round)">',
    ),
);

const jobs = [
  ["public/pwa/image/pwa-64x64-v2.png", svg, 64],
  ["public/pwa/image/pwa-192x192-v2.png", svg, 192],
  ["public/pwa/image/pwa-256x256-v2.png", svg, 256],
  ["public/pwa/image/pwa-512x512-v2.png", svg, 512],
  ["public/pwa/image/maskable-icon-512x512-v2.png", maskableSvg, 512],
  ["public/pwa/image/apple-touch-icon-180x180.png", maskableSvg, 180],
];

for (const [out, buf, size] of jobs) {
  await sharp(buf, { density: 384 }).resize(size, size).png().toFile(out);
  console.log("✓", out, size);
}

// favicon.ico：16/32/48 三档 PNG 帧
const bufs = [];
for (const size of [16, 32, 48]) {
  bufs.push(await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer());
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(bufs.length, 4);
let offset = 6 + 16 * bufs.length;
const entries = [];
for (const buf of bufs) {
  const entry = Buffer.alloc(16);
  entry[2] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(buf.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += buf.length;
  entries.push(entry);
}
writeFileSync("public/favicon.ico", Buffer.concat([header, ...entries, ...bufs]));
console.log("✓ public/favicon.ico");
