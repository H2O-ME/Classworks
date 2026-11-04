# 部署说明

> **发布流程已重构（2026-11）**：本地 push → GitHub Actions 构建 → GHCR 镜像 + 前端产物 → 服务器自动拉取。
> 本文「手动部署」一节仅作故障兜底。

## 发布流程（日常）

```bash
git push origin main        # 就这一步
```

之后 GitHub Actions 自动完成（`.github/workflows/deploy.yml`）：

1. **backend job**：构建后端 Docker 镜像 → 推到 `ghcr.io/h2o-me/classworks-server:latest`（+ git sha tag）
2. **frontend job**：`pnpm install` → 数据层/瀑布流自检 → `pnpm build` → PWA 自检 → dist 打包成 artifact
3. **deploy job**：SSH 到服务器，上传前端产物与 compose 配置，执行 `/opt/classworks/bin/deploy.sh all`：
   - 后端：`docker compose pull` + `up -d` + 健康检查（失败即中止，旧容器不受影响）
   - 前端：dist 原子切换到 `/www/wwwroot/classworks/dist`，旧版留档 `/opt/classworks/frontend-old`

### 一次性配置（已配置过，此处留档）

| 项目 | 值 |
| --- | --- |
| GitHub Secrets | `DEPLOY_KEY`（部署私钥）、`SSH_KNOWN_HOSTS`（主机公钥行）、`SSH_HOST=38.76.168.154`、`SSH_PORT=2009`、`SSH_USER=root` |
| 服务器公钥 | `/root/.ssh/authorized_keys` 中 `github-actions-classworks-deploy` 那行 |
| 部署脚本 | `/opt/classworks/bin/deploy.sh`（本仓 `scripts/deploy.sh` 的服务器副本，改了要同步） |
| GHCR 镜像 | `ghcr.io/h2o-me/classworks-server`，**首次发布后需在 GitHub 包设置改为 Public**（镜像不含秘密，口令在服务器 `.env`），否则服务器 pull 要配登录 |

### 手动部署（兜底）

```bash
# 后端：手动触发 workflow（Actions 页 → CI/CD → Run workflow），或 SSH 上去：
ssh -p 2009 root@38.76.168.154
cd /opt/classworks/server && docker compose pull && docker compose up -d

# 前端：Actions 页下载 dist artifact，解压替换 /www/wwwroot/classworks/dist
```

## 一、后端（境外 VPS）

```bash
cd server
cp .env.example .env      # 填 BOARD_TOKEN / CORS_ORIGINS
docker compose up -d
docker compose logs -f    # 看启动与健康检查
```

- 容器只绑定 `127.0.0.1:3100`，不直接暴露公网
- SQLite 落在命名卷 `data` 里，`docker compose down` 不会丢数据
- 备份：`docker compose exec app sh -c 'cp /app/data/db.sqlite /app/data/db-$(date +%F).sqlite'` 再考出容器卷

### 反向代理 + HTTPS

服务器 nginx 已配置（宝塔面板管理）：`classworks.tianhw.top` 托管前端静态 + `/api/` 反代 `127.0.0.1:3100`。缓存头：

- `/assets/*` 长缓存（文件名带内容哈希）
- `index.html`、`sw.js`、`manifest.webmanifest` 一律 `no-cache`
- 反代层**不要**缓存 `/api/`，后端已回 `Cache-Control: no-store`

## 二、首次上线后验证

- 访问 `https://<站点>/?key=<BOARD_TOKEN>` 验证全科可写
- 访问 `https://<站点>/`（不带 key）验证只读
- 希沃白板把带 `key` 的地址存成桌面快捷方式，开机即可用（令牌读出后自动从地址栏抹除）

## 四、讲台 Windows 快捷方式（= 轻量「客户端」）

教室电脑（希沃白板，Windows）上用 `win/install.cmd` 一次生成桌面快捷方式：

```powershell
# 默认线上地址 + seewo 口令，生成桌面快捷方式
win\install.cmd

# 同时加入开机启动
win\install.cmd -Startup

# 换地址/口令
win\install.cmd -Url https://example.com -Key <BOARD_TOKEN>
```

它用 Edge/Chrome 的 `--app=` 应用窗口模式打开看板 —— 没有地址栏、没有标签栏，看起来就是一个独立客户端，但**业务仍加载线上网页**，所以发版后客户端自动就是新版，不需要重新打包分发。

- 冰点还原：把 `win/` 目录放非还原分区，每天还原后双击 `install.cmd` 重建；配合 `-Startup` 也能省一步。
- 需要真正离线、全屏锁定、托盘常驻时，才考虑做原生薄壳（Tauri + 只加载远程 URL），见下方说明。
- 需要正式安装的 PWA：浏览器地址栏右侧「安装」按钮，图标由 `public/pwa/icon.svg` 生成。

## 五、Windows 客户端（可选）

`client/` 是 Tauri 薄壳：只开一个窗口加载线上看板，**不含业务逻辑、不内嵌前端产物**，所以网页发版后客户端自动就是新版，不需要重新分发。

| 项 | 实测 |
| --- | --- |
| 安装包（NSIS） | 1.1 MB |
| 绿色 exe | 3.0 MB |
| 运行时 | 主进程 ≈38 MB + 6 个系统 WebView2 进程（工作集约 +400 MB，其中大量是共享 DLL） |

构建（任选其一）：

```bash
# 本机（需 Rust + WebView2 运行时）
cd client && pnpm dlx @tauri-apps/cli@^2 build

# CI：Actions → Windows 客户端 → Run workflow，产物在 Artifacts
# 或推 client-v* 标签自动出包
```

产物：`client/target/release/bundle/nsis/Classworks_x.y.z_x64-setup.exe`（安装版，默认装到 `%LOCALAPPDATA%\Classworks`）与 `client/target/release/classworks-board.exe`（绿色版，放非还原分区即可）。

注意：

- **未签名**：首次运行会弹「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」；个别杀软可能误报，需加白名单
- 客户端里白板口令写在 `client/tauri.conf.json` 的窗口 `url` 上（`?key=seewo`），改口令要重新出包；不想重新出包就用 `win/install.cmd` 的快捷方式方案
- 冰点还原：把绿色 exe 放非还原分区（如 `D:\Classworks\`）
- 不需要离线使用就不必装：PWA / `--app` 快捷方式零安装、占用更低

## 注意

- **强制更新机制（2026-11）**：SW 改自写（`injectManifest`，源码 `src/sw.js`）。新版激活时会 `clients.navigate()` **强制重载所有还开着的旧页面**，并 `cleanupOutdatedCaches` 清旧预缓存 —— 教室大屏/PWA 不需要人手动刷新。首次安装不会触发（无旧缓存时才跳过）。
- 客户端注册带 `updateViaCache: "none"`，`sw.js` 绝不吃浏览器缓存；另外每 10 分钟轮询一次、切回页面或窗口聚焦时立即检查。
- **CDN 必须让 `/sw.js`、`/index.html`、`/manifest.webmanifest` 不缓存**（源站已回 `no-cache`）。若 CDN 强制 TTL，设备会永远拉不到新 SW —— 这是"换了版还是旧界面"的唯一外部原因。验证：`curl -I https://<站点>/sw.js` 看是否出现 `X-Cache: HIT` 或与你刚部署的 `Last-Modified` 不符。
- 旧 Service Worker 缓存不刷新是"部署后看到旧资源"的首因；现在由新 SW 主动重载兜底。
- 部署脚本改动要同时改本仓 `scripts/deploy.sh` 与服务器 `/opt/classworks/bin/deploy.sh`（服务器端由 deploy job 之外的一次性 scp 同步）
