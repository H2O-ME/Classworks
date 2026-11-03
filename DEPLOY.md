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

## 注意

- 旧 Service Worker 缓存不刷新是"部署后看到旧资源"的首因；本项目 SW 已配置 `skipWaiting` + `cleanupOutdatedCaches`，重新打开站点即接管
- 部署脚本改动要同时改本仓 `scripts/deploy.sh` 与服务器 `/opt/classworks/bin/deploy.sh`（服务器端由 deploy job 之外的一次性 scp 同步）
