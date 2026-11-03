# Classworks 后端

Hono + SQLite（WAL）单进程服务，跑在境外 VPS；静态前端在境内 CDN，跨域访问本服务。

```
server/
  src/core.ts         建表/迁移、学科常量
  src/index.ts        路由 + 鉴权 + 限流 + SQL
  selftest.mjs        可运行自检（真起服务打 fetch，36 项断言）
  Dockerfile          node:22-bookworm-slim 多阶段，非 root 运行
  docker-compose.yml  127.0.0.1:3100 + 命名 volume
  .env.example        环境变量模板
```

## 权限矩阵

| 身份 | 登录方式 | 可写范围 |
| --- | --- | --- |
| 白板（讲台/课代表） | URL 带 `key` → 前端换 `X-Board-Token` | 全 6 科 |
| 其他任何人 | — | 只读（读接口公开） |

写入口令只有一个（`BOARD_TOKEN`）：谁拿到 `?key=<BOARD_TOKEN>` 链接谁就能写全科。没有账号、没有注册、没有密码。

判定顺序：`X-Board-Token` 命中 → 放行；否则 401 拒。读接口公开。

## 本地运行

```bash
pnpm --dir server install
pnpm --dir server dev        # node --watch src/index.ts，端口 3100（Node ≥22.18 原生跑 TS）
# 或生产式：pnpm --dir server build && pnpm --dir server start
```

没有 `data/` 会自动建。本地也可以直接 `BOARD_TOKEN=seewo pnpm --dir server dev`（Windows 用 `$env:BOARD_TOKEN='seewo'`）。

## 自检

```bash
pnpm --dir server selftest   # = tsc 编译 + node selftest.mjs
```

用临时数据库起真实服务断言 36 项：旧库迁移（room 维度折叠 + history_logs/users 表删除 + 幂等）、CORS 预检放行 `X-Board-Token`、白板口令不做前缀/大小写/子串容忍（?key=see 这类手误必须 401）、口令校验限流（猜口令不能无限试）、公开读、写入鉴权（无凭证/错口令/旧 Authorization 头一律 401）、字段校验 400、写入-读取往返、同内容重复保存幂等、旧登录接口已下线 404、写接口限流 429 + `Retry-After`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/auth/board` | Header `X-Board-Token`，口令确认 `{ ok: true }`；按 IP 限流 20 次/分钟 |
| GET | `/api/board?date=20261101` | 公开读。`{ date, subjects: { 学科: { content, updatedAt } } }`，响应头 `Cache-Control: no-store, no-cache` |
| POST | `/api/board/save` | Header `X-Board-Token`。body `{ date, subject, content }` |

- `date` 缺省为今日（UTC+8），给定时必须 8 位数字；`subject` 必须是六科之一且 ≤16；`content` ≤20000 字符。非法一律 400。
- 保存成功：`{ content, updatedAt }`。**内容与云端已存一致时直接返回现值、不改 `updatedAt`**（重试队列重发同一条不会让卡片闪一下）。
- 权限不足：缺少/错口令 401。
- 限流按来源 IP 每分钟计数：写接口 30 次、口令校验 20 次；超了 429 + `Retry-After: 60`。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BOARD_TOKEN` | 空 | 写入口令，必填否则所有人只读；固定口令即可（如 `seewo`），要更强就用 `openssl rand -hex 24` 生成随机串 |
| `CORS_ORIGINS` | `*` | 逗号分隔的允许源，`*` 表示任意 |
| `PORT` | `3100` | 监听端口 |
| `DB_PATH` | `data/db.sqlite` | SQLite 文件（WAL 会附带 `-wal`/`-shm`） |

## 数据表

只有一张，`core.ts` 里的 `SCHEMA` 是唯一来源。

```sql
homeworks (date, subject, content, updated_at, PRIMARY KEY (date, subject))
```

旧库（还有 `history_logs` / `users` 表、`homeworks` 带 `room` 列）启动时自动迁移：删 `history_logs` 与 `users`，`homeworks` 按 `(date, subject)` 取 `MAX(updated_at)` 那一版保留，`room` 维度丢弃。只跑一次。

## 备份数据库

WAL 下别直接 `cp` 正在写的 db。停服后拷整个 `data/`，或热备用 `VACUUM INTO`（备份出来是单文件，不带 WAL）：

```bash
docker compose exec api node -e "new (require('better-sqlite3'))('/app/data/db.sqlite').exec(\"VACUUM INTO '/app/data/backup.sqlite'\")"
# 或
docker compose stop && docker compose cp api:/app/data ./backup-data-$(date +%F) && docker compose start
```

## Docker 部署（VPS）

```bash
# 开发机上打小包（排除 node_modules/dist/data/.env，约 12KB）
tar -czf server.tgz --exclude=node_modules --exclude=dist --exclude=data --exclude=.env -C /path/to/Classworks server
scp server.tgz root@<vps>:/opt/classworks/

# 服务器上
cd /opt/classworks && tar -xzf server.tgz && cd server
cp .env.example .env          # 填 BOARD_TOKEN（必填，写入口令）
docker compose up -d --build
docker compose ps             # 等 health 变 healthy
curl -s http://127.0.0.1:3100/api/health
```

镜像内用 `npm install`（不是 pnpm）：server 是独立小项目，没有 pnpm 工作区文件，npm 最省事；依赖版本已在 package.json 里钉死。容器内 `node:22-bookworm-slim` 已含 npm。

## 与最初计划的偏离（都是刻意取舍）

1. **仍用 better-sqlite3 13**，没换 `node:sqlite`：13.x 已改成 NAPI + 包内自带 `prebuilds/`（linux-x64/arm64 等 8 个平台），`package.json` 里**没有 install 脚本**，装完直接 require 预编译二进制，本机 Node 25 与镜像 Node 22 都不需要编译工具链。
2. **基础镜像用 `node:22-bookworm-slim` 而非 alpine**：glibc 是预编译二进制最常见的目标，alpine 虽然也带 linuxmusl 预编译，但没必要在这种一次性问题上赌。
3. **runtime 只拷 `dist/` + 生产依赖**：tsc 只在 build 阶段用，`npm prune --omit=dev` 后丢掉，镜像里没有 devDependency。
4. **无账号系统**（2026-11 重构）：读写权限只认 URL 的 `?key=` 口令（`BOARD_TOKEN`）。原账号体系（users 表 / JWT / scrypt / roster.json / 课代表分科）全部删除——真实使用中没人愿意记密码，一个班共享一个写入口令足够。
