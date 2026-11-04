// 客户端本地预检：在 push 之前把能查的都查掉，别把 CI 当调试器。
// 跑法: pnpm check:client
//
// 覆盖的是「踩过的坑」清单：
//  1. JSON 里写 // 注释（tauri.conf.json 会直接解析失败）
//  2. 版本号在 tauri.conf.json / Cargo.toml 之间不一致
//  3. 桌面专用能力（updater）没做平台限定，安卓构建报权限不存在
//  4. workflow YAML 被压成一行 / 含 Tab（GitHub 静默不注册，极难排查）
//  5. Rust 代码只验证了桌面，安卓目标编不过（library target / cfg 平台差异）
//  6. 更新签名私钥误入仓库
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg, hint = "") => {
  failed += 1;
  console.error(`  ✗ ${msg}${hint ? `\n     ${hint}` : ""}`);
};

const readJson = (path) => {
  const text = readFileSync(path, "utf8");
  // JSON 不允许 // 与 /* */ 注释：先粗暴检测，避免"能解析但语义被吃掉"的错觉
  if (/^\s*\/\/|\/\*|\s\/\/ /m.test(text)) throw new Error(`${path} 含注释（JSON 不支持）`);
  return JSON.parse(text);
};

console.log("▶ 配置文件");
const confPath = "client/tauri.conf.json";
let conf;
try {
  conf = readJson(confPath);
  ok("tauri.conf.json 是合法 JSON 且无注释");
} catch (error) {
  bad(String(error.message), "JSON 不允许 // 注释，把说明写进注释性字段或文档");
}

for (const extra of ["client/tauri.windows.conf.json"]) {
  if (!existsSync(extra)) continue;
  try {
    readJson(extra);
    ok(`${extra} 合法`);
  } catch (error) {
    bad(`${extra}: ${error.message}`);
  }
}

console.log("▶ 版本号一致性");
const cargo = readFileSync("client/Cargo.toml", "utf8");
const cargoVersion = /^version = "([^"]+)"/m.exec(cargo)?.[1];
if (conf && cargoVersion) {
  if (conf.version === cargoVersion) ok(`版本一致: ${conf.version}`);
  else bad(`版本不一致: tauri.conf=${conf.version} Cargo=${cargoVersion}`);
}
if (/\bstaticlib\b/.test(cargo)) ok("Cargo.toml 有 library target（安卓必需）");
else bad("Cargo.toml 缺 [lib] staticlib/cdylib（安卓构建会报 no library targets）");

console.log("▶ capability 平台限定");
const capDir = "client/capabilities";
for (const file of readdirSync(capDir).filter((f) => f.endsWith(".json"))) {
  const cap = readJson(`${capDir}/${file}`);
  const perms = cap.permissions ?? [];
  const hasUpdater = perms.some((p) => String(p).startsWith("updater:"));
  const desktopOnly = Array.isArray(cap.platforms) && !cap.platforms.includes("android");
  if (hasUpdater && !desktopOnly) {
    bad(`${file} 含 updater 权限但未限定平台`, '加 "platforms": ["windows","macOS","linux"]');
  } else {
    ok(`${file}（${perms.length} 项权限${cap.platforms ? `，平台: ${cap.platforms.join("/")}` : ""}）`);
  }
}

console.log("▶ workflow YAML 完整性");
for (const file of readdirSync(".github/workflows").filter((f) => f.endsWith(".yml"))) {
  const path = `.github/workflows/${file}`;
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").length;
  if (text.includes("\t")) bad(`${file} 含 Tab（YAML 不允许，GitHub 会静默忽略）`);
  else if (lines < 10) bad(`${file} 只有 ${lines} 行（疑似被压成一行，GitHub 会静默忽略）`);
  else if (!/^name:/m.test(text) || !/^jobs:/m.test(text)) bad(`${file} 缺 name/jobs 顶层键`);
  else ok(`${file}（${lines} 行）`);
}

console.log("▶ 签名私钥未入库");
if (existsSync("client/updater-key")) bad("client/updater-key 存在（私钥绝不能进仓库）");
else ok("client/updater-key 不存在");
const gitignore = readFileSync("client/.gitignore", "utf8");
if (/updater-key/.test(gitignore)) ok(".gitignore 已忽略 updater-key");
else bad(".gitignore 未忽略 updater-key");

console.log("▶ Rust 编译检查");
function cargoCheck(args, label, required) {
  try {
    execFileSync("cargo", args, { cwd: "client", stdio: "pipe", env: { ...process.env, TAURI_ENV_PLATFORM: label === "android" ? "android" : "" } });
    ok(`${label} cargo check 通过`);
  } catch (error) {
    const out = error.stdout?.toString() || error.message;
    if (!required && /can't find crate for|target may not be installed|error: no such/i.test(out)) {
      console.log(`  · ${label} 目标未安装，跳过（rustup target add aarch64-linux-android）`);
      return;
    }
    bad(`${label} cargo check 失败`, out.split("\n").filter((l) => /error/.test(l)).slice(0, 4).join("\n     "));
  }
}
cargoCheck(["check", "--quiet"], "桌面", true);
cargoCheck(["check", "--quiet", "--target", "aarch64-linux-android"], "android", false);

console.log("");
if (failed) {
  console.error(`预检失败：${failed} 项，修完再 push`);
  process.exit(1);
}
console.log("✓ 客户端预检全部通过");
