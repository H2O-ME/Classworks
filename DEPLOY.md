# 部署说明

前后端分开部署：静态前端放境内 CDN，后端放境外 VPS。

## 一、后端（境外 VPS）

```bash
cd server
cp .env.example .env      # 填 BOARD_TOKEN / JWT_SECRET / CORS_ORIGINS
docker compose up -d --build
docker compose logs -f    # 看启动与健康检查
# 建第一个管理员（之后用同一个命令分配课代表与同学）
docker compose exec api node dist/users.js add <拼音> <姓名> admin
```

- 容器只绑定 `127.0.0.1:3100`，不直接暴露公网
- SQLite 落在命名卷 `data` 里，`docker compose down` 不会丢数据
- 备份：`docker compose exec app sh -c 'cp /app/data/db.sqlite /app/data/db-$(date +%F).sqlite'` 再考出容器卷

### 反向代理 + HTTPS

用 nginx 反代到 `127.0.0.1:3100`，示例：

```nginx
server {
  server_name api.example.com;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

证书用 certbot 或面板自带的 ACME 签发。反代层**不要**缓存 `/api/`，后端已回 `Cache-Control: no-store`。

## 二、前端（境内 CDN）

```bash
# 用境外后端地址构建
VITE_API_BASE=https://api.example.com pnpm build
```

把 `dist/` 上传到任意静态托管 + CDN（阿里云 OSS、腾讯 COS、各类 Pages 服务均可），要求：

- `/assets/*` 长缓存（文件名带内容哈希）
- `index.html`、`sw.js`、`manifest.webmanifest` 一律 `no-cache`
- 未知路径回退到 `index.html`（SPA 路由）
- 全站禁索引：`X-Robots-Tag: noindex, nofollow`

## 三、首次上线后

- 访问 `https://<站点>/?board_token=<白板令牌>` 验证白板全科可写
- 访问 `https://<站点>/`（不带令牌、未登录）验证只读
- 访问 `https://<站点>/login` 用管理员账号登录，验证全科都能改
- 用一个课代表账号登录，验证只有它绑定那一科出现铅笔
- 希沃白板把带 `board_token` 的地址存成桌面快捷方式，开机即可用（令牌读出后自动从地址栏抹除）

## 注意

- 旧 Service Worker 缓存不刷新是"部署后看到旧资源"的首因；本项目 SW 已配置 `skipWaiting` + `cleanupOutdatedCaches`，重新打开站点即接管
