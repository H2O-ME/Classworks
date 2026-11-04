// 图标栅格化：SVG → PWA 全套 PNG + apple-touch + favicon.ico + Tauri 图标
// 跑法: node scripts/gen-icons.mjs（sharp 是 devDependency）
//
// 关键设计：按尺寸选图形。
// icon.svg（精绘版）三卡细描边在 512px 好看，缩到 16–32px 会糊成一团黑块；
// icon-small.svg（简化版）单卡粗杠 + 大对勾，深蓝底对深/浅任务栏都有对比。
// .ico 支持一个文件里塞多套分辨率，所以 16–48 用简化版、64+ 用精绘版。
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const detailed = readFileSync("public/pwa/icon.svg");
const small = readFileSync("public/pwa/icon-small.svg");
// 48 及以下一律用简化版：这一档才是任务栏/标题栏/浏览器标签的真实尺寸
const artFor = (size) => (size <= 48 ? small : detailed);

// maskable 安全区：内容缩放到中央 80%，底色铺满（圆形裁切不留白）
function maskable(source) {
  return Buffer.from(
    source
      .toString()
      .replace(
        '<g clip-path="url(#round)">',
        '<g clip-path="url(#round)"><rect width="512" height="512" fill="#111111"/></g>' +
          '<g transform="translate(51.2 51.2) scale(0.8)" clip-path="url(#round)">',
      ),
  );
}

// ICO 打包：每帧可以是不同图形（Windows 按显示尺寸选帧）
async function writeIco(path, sizes) {
  const frames = [];
  for (const size of sizes) {
    frames.push(await sharp(artFor(size), { density: 512 }).resize(size, size).png().toBuffer());
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + 16 * frames.length;
  const entries = [];
  frames.forEach((buf, i) => {
    const size = sizes[i];
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(entry);
  });
  writeFileSync(path, Buffer.concat([header, ...entries, ...frames]));
  console.log("✓", path, `(${sizes.join("/")}px)`);
}

// ── PWA 图标（manifest 引用的这批文件名不能改）──
for (const [out, size] of [
  ["public/pwa/image/pwa-64x64-v2.png", 64],
  ["public/pwa/image/pwa-192x192-v2.png", 192],
  ["public/pwa/image/pwa-256x256-v2.png", 256],
  ["public/pwa/image/pwa-512x512-v2.png", 512],
]) {
  await sharp(artFor(size), { density: 384 }).resize(size, size).png().toFile(out);
  console.log("✓", out, `${size}px`);
}

// maskable / apple-touch：大尺寸，用精绘版 + 安全区
for (const [out, size] of [
  ["public/pwa/image/maskable-icon-512x512-v2.png", 512],
  ["public/pwa/image/apple-touch-icon-180x180.png", 180],
]) {
  await sharp(maskable(detailed), { density: 384 }).resize(size, size).png().toFile(out);
  console.log("✓", out, `${size}px`);
}

// ── 浏览器标签 favicon：16–48 全是小尺寸，用简化版 ──
await writeIco("public/favicon.ico", [16, 24, 32, 48]);

// ── Tauri 客户端图标 ──
await sharp(small, { density: 512 }).resize(32, 32).png().toFile("client/icons/32x32.png");
await sharp(detailed, { density: 512 }).resize(128, 128).png().toFile("client/icons/128x128.png");
await sharp(detailed, { density: 512 }).resize(256, 256).png().toFile("client/icons/128x128@2x.png");
await sharp(detailed, { density: 512 }).resize(512, 512).png().toFile("client/icons/icon.png");
// exe 图标（任务栏/资源管理器/Alt-Tab 都取这个文件里的对应尺寸帧）
await writeIco("client/icons/icon.ico", [16, 24, 32, 40, 48, 64, 128, 256]);
console.log("✓ client/icons/32x32.png 128x128.png 128x128@2x.png icon.png");
