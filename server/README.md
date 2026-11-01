# Classworks 后端

Hono + SQLite（WAL）单进程服务，跑在境外 VPS；静态前端在境内 CDN，跨域访问本服务。

```
server/
  src/index.ts        全部逻辑（路由 + 校验 + SQL）
  selftest.mjs        可运行自检（真起服务打 fetch）
  Dockerfile          node:22-bookworm-slim 多阶段，非 root 运行
  docker-compose.yml  127.0.0.1:3100 + 命名 volume
  .env.example        环境变量模板
```

## 本地运行

```bash
pnpm --dir server install
pnpm --dir server dev        # node --watch src/index.ts，端口 3100（Node ≥22.18 原生跑 TS）
# 或生产式：pnpm --dir server build && pnpm --dir server start
```

没有 `data/` 会自动建。本地也可以直接 `WRITE_KEY=k pnpm --dir server dev`（Windows 用 `$env:WRITE_KEY='k'`）。

## 自检

```bash
pnpm --dir server selftest   # = tsc 编译 + node selftest.mjs
```

它用临时数据库起真实服务，断言 22 项：写入-读取往返、同 `baseUpdatedAt` 重复保存幂等（不重复写流水）、`baseUpdatedAt` 落后且内容不同 → 409 且带云端最新值、无/错 `X-Write-Key` → 401、非法 `date` / 超长 `room`/`subject`/`content` → 400、history 条数与倒序、`Cache-Control: no-store, no-cache`、OPTIONS 预检放行 `X-Write-Key`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/board?room=default&date=20261101` | 公开读。`{ room, date, subjects: { 学科: { content, updatedAt } } }`，响应头 `Cache-Control: no-store, no-cache` |
| POST | `/api/board/save` | 需 `X-Write-Key`。body `{ room, date, subject, content, baseUpdatedAt }` |
| GET | `/api/board/history?room&date` | `{ room, date, items: [{ id, subject, content, createdAt }] }`，最近 20 条倒序 |

- `date` 缺省为今日（UTC+8），给定时必须 8 位数字；`room` 缺省 `default`，≤32；`subject` ≤16；`content` ≤20000 字符。非法一律 400。
- 保存成功：`{ content, updatedAt }`。**内容与云端已存一致时直接返回现值、不写流水**（重复点击幂等）。
- 冲突：云端 `updatedAt > baseUpdatedAt` 且内容不同 → 409 `{ error, content, updatedAt }`，`content/updatedAt` 是云端最新值，由前端决定覆盖或拉取。
- 未配置 `WRITE_KEY` 时所有写入 401；密钥比较用 `timingSafeEqual`。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `WRITE_KEY` | 空 | 写入密钥，必填；生成 `openssl rand -hex 24` |
| `CORS_ORIGINS` | `*` | 逗号分隔的允许源，`*` 表示任意 |
| `PORT` | `3100` | 监听端口 |
| `DB_PATH` | `data/db.sqlite` | SQLite 文件（WAL 会附带 `-wal`/`-shm`） |

## 备份数据库

WAL 下别直接 `cp` 正在写的 db。推荐停服后拷整个 `data/`：

```bash
docker compose stop
docker compose cp api:/app/data ./backup-data-$(date +%F)
docker compose start
```

本机装了 sqlite3 的话也可以热备：`sqlite3 data/db.sqlite ".backup 'backup.sqlite'"`。

## Docker 部署（VPS）

本机没有 Docker，镜像构建未在此处实际跑过；但构建步骤（`npm install` → `tsc` → `npm prune --omit=dev` → 用产物启动）已在本地临时目录逐条模拟通过，含 better-sqlite3 预编译二进制的加载。

```bash
# 开发机上打小包（排除 node_modules/dist/data/.env，约 8KB）
tar -czf server.tgz --exclude=node_modules --exclude=dist --exclude=data --exclude=.env -C /path/to/Classworks server
scp server.tgz root@<vps>:/opt/classworks/

# 服务器上
cd /opt/classworks && tar -xzf server.tgz && cd server
cp .env.example .env          # 填 WRITE_KEY（必填，openssl rand -hex 24）
docker compose up -d --build
docker compose ps             # 等 health 变 healthy
curl -s http://127.0.0.1:3100/api/health
```

镜像内用 `npm install`（不是 pnpm）：server 是独立小项目，没有 pnpm 工作区文件，npm 最省事；依赖版本已在 package.json 里钉死。容器内 `node:22-bookworm-slim` 已含 npm。

## 与最初计划的偏离（都是刻意取舍）

1. **仍用 better-sqlite3 13**，没换 `node:sqlite`：13.x 已改成 NAPI + 包内自带 `prebuilds/`（linux-x64/arm64 等 8 个平台），`package.json` 里**没有 install 脚本**，装完直接 require 预编译二进制，本机 Node 25 与镜像 Node 22 都不需要编译工具链。`node:sqlite` 作为备选没启用。
2. **基础镜像用 `node:22-bookworm-slim` 而非 alpine**（计划里写的 alpine）：glibc 是预编译二进制最常见的目标，alpine 虽然也带 linuxmusl 预编译，但没必要在这种一次性问题上赌。
3. **runtime 只拷 `dist/` + 生产依赖**：tsc 只在 build 阶段用，`npm prune --omit=dev` 后丢掉，镜像里没有 devDependency。
4. `history_logs` 不自动清理（每改一科一条，教室量级几十条/天）；若要长期跑，加一个按 `created_at` 的定期删除即可。
