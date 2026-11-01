# Classworks 后端

Hono + SQLite（WAL）单进程服务，跑在境外 VPS；静态前端在境内 CDN，跨域访问本服务。

```
server/
  src/core.ts         建表/迁移、scrypt 密码哈希、HS256 JWT、学科与角色常量
  src/index.ts        路由 + 鉴权链 + 限流 + SQL
  src/users.ts        账号管理 CLI（list / add / passwd / del）
  selftest.mjs        可运行自检（真起服务打 fetch，60 项断言）
  Dockerfile          node:22-bookworm-slim 多阶段，非 root 运行
  docker-compose.yml  127.0.0.1:3100 + 命名 volume
  .env.example        环境变量模板
```

## 权限矩阵

| 身份 | 登录方式 | 可写范围 |
| --- | --- | --- |
| 希沃白板 | URL 带 `key` → 前端换 `X-Board-Token` | 全 6 科 |
| `admin` | 拼音全拼 + 密码 | 全 6 科 |
| `rep` | 拼音全拼 + 密码 | 仅 `subject` 绑定的那一科 |
| `student` | 拼音全拼 + 密码 | 只读（写接口 403） |
| 未登录 | — | 只读（读接口公开） |

判定顺序：`X-Board-Token` 命中 → 放行；否则解 `Authorization: Bearer`，回库读最新角色与科目（改了权限立刻生效，不用等 token 过期）；都不行按 401/403 拒。

## 本地运行

```bash
pnpm --dir server install
pnpm --dir server dev        # node --watch src/index.ts，端口 3100（Node ≥22.18 原生跑 TS）
# 或生产式：pnpm --dir server build && pnpm --dir server start
```

没有 `data/` 会自动建。本地也可以直接 `BOARD_TOKEN=seewo pnpm --dir server dev`（Windows 用 `$env:BOARD_TOKEN='seewo'`）。

## 账号管理

账号只能由管理员在服务器上分配，没有注册接口。首次登录强制改密（`is_activated = 0`），初始密码等于学号。

**`roster.json` 是唯一权威来源**：谁存在、谁是课代表、绑定哪一科，全在里面。灾难恢复只需容器与 `roster.json`，跑一次 `seed` 即可，不用记任何命令序列。

```bash
# 容器里（docker compose exec api node dist/users.js ...）
node dist/users.js seed roster.json       # 按名单幂等同步（新建补密码，已有只改姓名/角色，绝不动密码）
node dist/users.js list                   # 核对
node dist/users.js role <账号> admin      # 临时改单个账号角色
node dist/users.js role <账号> rep 数学   # 提为某科课代表
node dist/users.js passwd <账号>          # 重置为「首登须改密」，初始密码回到学号
node dist/users.js del <账号>
```

名单条目：

```json
{ "studentId": "240834", "name": "田瀚文", "pinyin": "tianhanwen", "role": "admin" }
{ "studentId": "240825", "name": "刘佩涵", "pinyin": "liupeihan", "role": "rep", "subject": "化学" }
```

- 账号必须是 3–32 位小写字母开头的拼音全拼（可含数字/下划线）
- `role` 省略即 `student`；`rep` 必须带 `subject`，且必须是六科之一
- **同一科可以有多名课代表**（几个人的 `subject` 都写 `化学` 即可）：权限按人判定，`subject` 上没有唯一约束
- 管理员兼任某科课代表时写 `admin` 就够：管理员本来就全科可写

## 自检

```bash
pnpm --dir server selftest   # = tsc 编译 + node selftest.mjs
```

用临时数据库跑 `users.js` 建号，再起真实服务断言 51 项：健康检查与 CORS 预检放行 `X-Board-Token`/`Authorization`、旧库迁移（room 维度折叠 + history_logs 删除 + 幂等）、`seed` 幂等（重跑不重复建号、不动已改过的密码）、账号不存在与密码错误同为 401、未激活返回 `REQUIRE_NEW_PASSWORD` 且只给临时凭证、临时凭证缺失/密码过短被拒、激活后旧密码失效、`/api/auth/me` 校正身份、四层写入鉴权（无凭证 401 / 错白板令牌 401 / 同学 403 / 课代表越科 403 / 管理员与白板全科可写）、字段校验 400、写入-读取往返、同内容重复保存幂等、历史接口已下线 404、写接口与登录接口各自限流 429 + `Retry-After`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| POST | `/api/auth/login` | body `{ username, password }` |
| POST | `/api/auth/activate` | Header `Authorization: Bearer <tempToken>`，body `{ newPassword }` |
| GET | `/api/auth/me` | Header `Authorization`，返回 `{ user }` |
| GET | `/api/board?date=20261101` | 公开读。`{ date, subjects: { 学科: { content, updatedAt } } }`，响应头 `Cache-Control: no-store, no-cache` |
| POST | `/api/board/save` | `X-Board-Token` 或 `Authorization`。body `{ date, subject, content }` |

**登录响应**：未激活 → `{ status: 'REQUIRE_NEW_PASSWORD', tempToken, realName }`（`tempToken` 只活 10 分钟、只能用来改密）；已激活 → `{ status: 'SUCCESS', token, user: { realName, role, subject } }`（token 活 30 天）。

- `date` 缺省为今日（UTC+8），给定时必须 8 位数字；`subject` 必须是六科之一且 ≤16；`content` ≤20000 字符。非法一律 400。
- 保存成功：`{ content, updatedAt }`。**内容与云端已存一致时直接返回现值、不改 `updatedAt`**（重试队列重发同一条不会让卡片闪一下）。
- 权限不足：未登录/凭证无效 401，权限不够 403（报文点名是哪一科）。
- 限流按来源 IP 每分钟计数：写接口 30 次、登录 10 次；超了 429 + `Retry-After: 60`。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BOARD_TOKEN` | 空 | 希沃白板免密令牌，必填否则白板写不进来；固定口令即可（如 `seewo`），要更强就用 `openssl rand -hex 24` 生成随机串 |
| `JWT_SECRET` | 空 | JWT 签名密钥，必填；缺失时随启动随机生成，重启后所有人要重新登录；生成 `openssl rand -hex 32` |
| `CORS_ORIGINS` | `*` | 逗号分隔的允许源，`*` 表示任意 |
| `PORT` | `3100` | 监听端口 |
| `DB_PATH` | `data/db.sqlite` | SQLite 文件（WAL 会附带 `-wal`/`-shm`） |

## 数据表

只有两张，`core.ts` 里的 `SCHEMA` 是唯一来源。

```sql
users (id, username UNIQUE, real_name, password_hash, role, subject, is_activated)
homeworks (date, subject, content, updated_at, PRIMARY KEY (date, subject))
```

`password_hash` 是 `scrypt$<salt hex>$<hash hex>`，用 `node:crypto` 的 `scryptSync`，不引 bcrypt/argon2。JWT 是手写的 HS256（`signToken`/`verifyToken`），不引 jsonwebtoken。

旧库（还有 `history_logs`、`homeworks` 带 `room` 列）启动时自动迁移：删 `history_logs`，`homeworks` 按 `(date, subject)` 取 `MAX(updated_at)` 那一版保留，`room` 维度丢弃。只跑一次。

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
cp .env.example .env          # 填 BOARD_TOKEN 与 JWT_SECRET（都必填）
docker compose up -d --build
docker compose ps             # 等 health 变 healthy
curl -s http://127.0.0.1:3100/api/health
docker compose exec api node dist/users.js add <你的拼音> <你的姓名> admin
```

镜像内用 `npm install`（不是 pnpm）：server 是独立小项目，没有 pnpm 工作区文件，npm 最省事；依赖版本已在 package.json 里钉死。容器内 `node:22-bookworm-slim` 已含 npm。

## 与最初计划的偏离（都是刻意取舍）

1. **仍用 better-sqlite3 13**，没换 `node:sqlite`：13.x 已改成 NAPI + 包内自带 `prebuilds/`（linux-x64/arm64 等 8 个平台），`package.json` 里**没有 install 脚本**，装完直接 require 预编译二进制，本机 Node 25 与镜像 Node 22 都不需要编译工具链。
2. **基础镜像用 `node:22-bookworm-slim` 而非 alpine**：glibc 是预编译二进制最常见的目标，alpine 虽然也带 linuxmusl 预编译，但没必要在这种一次性问题上赌。
3. **runtime 只拷 `dist/` + 生产依赖**：tsc 只在 build 阶段用，`npm prune --omit=dev` 后丢掉，镜像里没有 devDependency。
4. **账号密码用 scrypt 而非 bcrypt/argon2**：`node:crypto` 自带，少一个原生依赖就少一处编译失败；scrypt 本身是密码哈希的合格选择。
5. **JWT 手写 20 行而非引 jsonwebtoken**：只需要 HS256 签发+校验，`createHmac` 足够。
