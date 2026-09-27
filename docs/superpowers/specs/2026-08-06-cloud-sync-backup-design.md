# 云端备份与定时同步 — 设计文档

> ⚠️ 已过时（历史记录）：本文档描述的是早期的密钥鉴权方案。当前代码**已取消全部密钥校验与鉴权**，
> `/kv/homework` 读写不携带也不校验任何密钥（`SYNC_SECRET` 已从代码与配置中移除），同步默认开启。
> 阅读时以 `src/utils/sync.js`、`edge-functions/kv/homework.js` 与 `AGENTS.md` 为准。

日期：2026-08-06
状态：待审阅

## 背景与目标

Classworks 作业看板当前为**纯本地**应用：作业按天存于浏览器 IndexedDB（`classworks-data-YYYYMMDD`），数据不跨设备。单班使用，老师可能在多台设备（教室电脑、手机）编辑作业，且教室电脑数据有丢失风险。

目标：在保持"本地优先、无鉴权即可用"的前提下，增加**云端备份 + 定时同步**：

- 本地功能持久可用，**不加鉴权**：读、编辑、展示永远可用，断网/无 key 不影响
- 云端由 EdgeOne Pages 提供：`edge-functions` + KV Storage
- **读写云端都需要密钥**：设置里不输入密钥 → 完全本地运行，不做任何云端同步（不拉也不推）
- 定时同步 + 时间戳 last-write-wins + 同步前本地快照可回退

## 非目标（YAGNI）

- 不做账号体系、多班级、多人协作
- 不做云端多版本历史（回退只靠本地快照）
- 不做复杂合并（无双向编辑冲突合并，只按时间戳覆盖）
- 不做 HMAC 签名、不做限流（密钥 32+ 位随机串已足够，见"安全"）

## 威胁模型与安全

- 看板本质是给全班看的展示屏，本地展示无需任何鉴权
- **云端读写均需密钥**：设置页不输入密钥 → 不启动同步（不拉不推），本地功能照常
- 密钥 `SYNC_SECRET` 只存在于 EdgeOne 控制台环境变量（不进 git、不进 edgeone.json、不进前端产物）
- 前端密钥存 `localStorage['classworks_sync_secret']`，设置页粘贴一次，之后自动携带
- 请求头 `x-sync-secret`（**不用 query string**，避免密钥进访问日志/浏览器历史）
- 已知接受风险：教室电脑是学生可接触物理设备，devtools 可见 localStorage 密钥；学生本就看得到作业，此风险接受。升级路径（后话）：WebCrypto HMAC 签名（Edge Functions 支持 `crypto.subtle`）

## 架构

```
┌─ 前端 (Vue 3, 现有 src/) ──────────────────┐
│  storage.js ← IndexedDB（主存储，本地永远可用）│
│  sync.js    ← 新增：定时/触发式云端同步       │
│  settings.vue ← 新增：同步密钥输入（无密钥=纯本地）│
│  index.vue   ← 新增：同步提示框 + 回退入口     │
└──────────────┬────────────────────────────┘
               │ HTTP (同域 /kv/homework) + 头 x-sync-secret
┌──────────────▼────────────────────────────┐
│  edge-functions/kv/homework.js (新增)       │
│  GET/PUT 均校验 x-sync-secret              │
│  → homework_kv.get / homework_kv.put        │
└──────────────┬────────────────────────────┘
               │
        ┌──────▼──────┐
        │ KV Storage  │  单一键 classworks_homework
        └─────────────┘
```

**KV 数据模型（单一键，存全部作业）**：
```
键: classworks_homework
值: {
  "savedAt": "2026-08-07T10:30:00.000Z",          // 服务端盖章：整包最后写入时间
  "dates": {
    "20260806": { "homework": {...}, "updatedAt": "2026-08-06T09:00:00.000Z" },
    "20260807": { "homework": {...}, "updatedAt": "2026-08-07T10:30:00.000Z" }
  }
}
```
- `dates` 内每个日期各自带 `updatedAt`，用于**日期级** last-write-wins 合并（单键但日期粒度不丢）
- 整包 `savedAt` 仅用于服务端写入时间记录，判定不依赖它

### 数据流

**保存作业时**（`handleHomeworkSave` 成功后）：
1. 写 IndexedDB（现有逻辑不动）
2. `sync.js.syncNow()`（800ms 防抖）→ 完整 tick：GET 云端整包 → 逐日期合并 → 有需要推的才 PUT

**定时同步**（每 5 分钟，代码常量 `SYNC_INTERVAL_MS = 5 * 60 * 1000`）：
1. **无密钥时不启动**（纯本地模式，连定时器都不跑）
2. `GET` 拉取云端**整包**（全部日期）
3. 按「同步判定表」对每个日期做 last-write-wins 合并 → 拉 / 推 / 跳过
4. 断网/API 失败 → 静默降级，下次再试（不打扰用户）

### 本地同步元数据

本地数据本身没有时间戳，需为每日期补一份元数据：IndexedDB 键 `classworks-meta-{date}` → `{ updatedAt: number }`（epoch ms）。

- 本地保存作业成功时：`meta.updatedAt = Date.now()`
- 拉取云端该日期成功后：`meta.updatedAt = 云端该日期 updatedAt 的 epoch 值`
- 无 meta = 该日期从未同步过

**时间戳归属约定**：每日期 `updatedAt` 由**客户端**在推送时带上（= 本地最后编辑时间），服务端只盖章整包 `savedAt`（仅记录用途，判定不依赖）。这样 A 设备推送的合并包不会把 B 设备已同步过的日期重新标成"最新"。

### 同步判定表（日期级 last-write-wins，整包读写）

同步 tick = GET 整包 → 逐日期比较 → 合并 → 有需要才 PUT 整包。

| 条件（对每个日期） | 动作 |
|---|---|
| 无密钥（`getSyncSecret()` 为空） | 跳过全部（本地模式） |
| 云端有该日期且 `云端.updatedAt > meta.updatedAt` | 快照本地该日期 → 用云端覆写 → 更新 meta → 标记"拉取了" |
| 本地有该日期且 `meta.updatedAt > 云端.updatedAt`（或云端无此日期） | 保留本地，标记"待推送" |
| 两端一致 | 跳过 |

tick 收尾：
- 有任何"拉取了" → **弹提示框**「检测到云端更新，本地已自动同步」
- 有"待推送"日期 → 构造合并整包（每日期取较新者，保留各自 updatedAt）→ `PUT`
- 云端无数据（首次）且本地有作业 → 直接 PUT 本地整包（首次备份）

**回退**（提示框按钮 / 工具栏入口）：
1. 列出该日期本地快照（`classworks-data-{date}-bk-{ts}`，最近 5 份）
2. 选一份恢复 → 写回 IndexedDB 主键
3. 调 `syncNow()` 自动覆写云端（整包合并后 PUT；无密钥则仅本地回退并提示）

## 后端 API（`edge-functions/kv/homework.js`）

路径 `/kv/homework`，方法 `GET` / `PUT`，**无 date 参数**（整包读写）。

**GET** / **PUT**（均需 `x-sync-secret` 头）：
```
校验: context.env.SYNC_SECRET 比对，不符 → 401 { error: "forbidden" }
```

**GET**：
```
响应 200: 整包 { savedAt, dates: { "20260806": { homework, updatedAt }, ... } }
无数据:   { empty: true }
```

**PUT**：
```
请求体: 整包 { savedAt?, dates: { date: { homework, updatedAt } } }
行为: 覆盖存储单一键 classworks_homework；服务端重写 savedAt = new Date().toISOString()
响应 200: { savedAt }
```

技术要点（来自 edgeone-pages-dev 技能）：
- V8 运行时，无 npm、无 Node 内置模块；`Response.json()` 不可用，用 `new Response(JSON.stringify(...), { headers: { 'Content-Type': 'application/json; charset=UTF-8' } })`
- KV 是**全局变量** `homework_kv`（控制台绑定 namespace 时设的变量名，你的已绑定为 `homework_kv` → namespace `classwork`），不是 `context.env.homework_kv`
- KV **单一键** `classworks_homework`（不再按日期拆多键）
- KV value ≤ 25 MB，全部作业文本远小于此；eventual consistency ≤ 60s，可接受
- 同域调用，**不加** `Access-Control-Allow-Origin: *`（避免放松安全）

## 前端改动

### `src/utils/sync.js`（新增）

```js
const SYNC_INTERVAL_MS = 5 * 60 * 1000
const SYNC_SECRET_KEY = 'classworks_sync_secret'

export function getSyncSecret()              // localStorage 读取（空 = 纯本地模式）
export function setSyncSecret(secret)        // localStorage 写入
export async function pushHomework(doc, secret) // PUT 整包（dates 合并后）
export async function pullHomework(secret)      // GET 整包
export async function syncNow(overrides)        // 完整 tick：GET→逐日期合并→(快照+弹框/推送)
export function startPeriodicSync(cb)        // 无密钥不启动；setInterval，cb 收到 { pulledDates: [] } 等
export function stopPeriodicSync()
```

### `src/utils/storage.js`（改）

新增：
```js
export async function snapshotDate(date)     // 当前数据 → classworks-data-{date}-bk-{ts}
export async function listSnapshots(date)    // 最近 5 份
export async function restoreSnapshot(date, ts)
```

### `src/pages/settings.vue`（改）

架构页 iframe 保留，增加"同步密钥"区块：输入框 + 保存/清除按钮（调 `setSyncSecret`）。

### `src/pages/index.vue`（改）

- `mounted` 后启动 `startPeriodicSync`
- 保存作业后 `syncNow()`（防抖）
- 新增同步提示框：标题「检测到云端更新，本地已自动同步」，正文含按钮「对修改不满意？一键回退之前版本」+ 关闭
- 回退对话框：快照列表（时间排序）+ 恢复按钮
- 工具栏：同步状态点（空闲/同步中/失败可点重试）+ 回退入口（可选，与提示框共用回退对话框）

### `middleware.js`（改，必须）

SPA 回退 matcher 需放行 `/kv/`（加入 bypass），否则 `/kv/homework` 会被 rewrite 成 `index.html` 导致 API 404。

## 配置与部署前置

- ✅ 已完成：KV namespace `classwork`（ns-VQKVSxxJ5Yjm）已创建并绑定到项目，变量名 `homework_kv`
- ☐ 待做：控制台设置**唯一环境变量** `SYNC_SECRET`（≥32 字符随机串）——这是云端与本地的连接校验密钥
- 开发联调按官方技能：`edgeone pages link` + `edgeone pages dev`（8088）。KV 未绑定会 `ReferenceError: homework_kv is not defined`

## 测试（ponytail 规则：非平凡逻辑留一个可运行自检）

- `sync.js` 的时间戳比较 / last-write-wins 分支：抽成纯函数，加一个 assert 自检脚本（node 直接跑，无框架）
- 快照轮换（留 5 份）逻辑：同上自检
- 手动验收：设置页贴 key → 改作业保存 → 云端可 GET 到 → 第二台设备打开 → 5 分钟内自动拉到并弹提示 → 回退 → 云端被覆写

## 文件清单

| 文件 | 动作 |
|---|---|
| `edge-functions/kv/homework.js` | 新增 |
| `src/utils/sync.js` | 新增 |
| `src/utils/storage.js` | 修改（快照 + meta 方法） |
| `src/pages/settings.vue` | 修改（密钥输入） |
| `src/pages/index.vue` | 修改（定时同步、提示框、回退对话框——按最少文件原则**并入本文件**，不新增组件文件） |
| `middleware.js` | 修改（放行 `/kv/`） |
