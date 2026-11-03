// 可运行自检：node selftest.mjs（先 pnpm build）。用临时 DB 起真实服务，打 fetch 断言。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const PORT = 3199
const BOARD_TOKEN = 'seewo'
const DATE = '20261101'
const base = `http://127.0.0.1:${PORT}/api`
const dir = mkdtempSync(join(tmpdir(), 'classworks-selftest-'))
const DB_PATH = join(dir, 'db.sqlite')

const child = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, PORT: String(PORT), BOARD_TOKEN, DB_PATH, CORS_ORIGINS: '*' },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let passed = 0
const step = (name) => console.log(`\n▶ ${name}`)
const ok = (cond, msg) => {
  assert.ok(cond, msg)
  passed++
  console.log(`  ✓ ${msg}`)
}

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const save = (body, headers = { 'X-Board-Token': BOARD_TOKEN }) =>
  post('/board/save', { date: DATE, ...body }, headers)

const waitUp = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return
    } catch {
      // 服务还没起来：继续等
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('服务未能启动')
}

try {
  await waitUp()

  step('旧库迁移（room 维度 → 单班；users / history_logs 删除）')
  // 旧库里同一天同一科在多个 room 各有一份，迁移必须留下 updated_at 最大的那版，不能丢内容
  {
    const legacyDir = mkdtempSync(join(tmpdir(), 'classworks-legacy-'))
    const legacyPath = join(legacyDir, 'db.sqlite')
    const old = new Database(legacyPath)
    old.exec(`
      CREATE TABLE homeworks (room TEXT NOT NULL, date TEXT NOT NULL, subject TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, PRIMARY KEY (room, date, subject));
      CREATE TABLE history_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, date TEXT NOT NULL,
        subject TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL);
    `)
    const insert = old.prepare('INSERT INTO homeworks VALUES (?, ?, ?, ?, ?)')
    insert.run('class1', '20261030', '数学', '一班旧稿', 100)
    insert.run('class2', '20261030', '数学', '二班新稿', 500)
    insert.run('class1', '20261031', '语文', '只有一份', 200)
    old.close()

    // 重启一个带旧库的服务实例触发迁移；再开一次必须发现已迁移并跳过（幂等）
    const migrateChild = spawn(process.execPath, ['dist/index.js'], {
      env: { ...process.env, PORT: String(PORT + 1), BOARD_TOKEN, DB_PATH: legacyPath, CORS_ORIGINS: '*' },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT + 1}/api/health`)).ok) break
      } catch {
        // 服务还没起来：继续等
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    migrateChild.kill()
    await new Promise((r) => migrateChild.once('exit', r))

    const db = new Database(legacyPath, { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    const rows = db.prepare('SELECT date, subject, content FROM homeworks ORDER BY date, subject').all()
    db.close()
    rmSync(legacyDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    ok(!tables.includes('history_logs'), 'history_logs 已删除')
    ok(!tables.includes('users'), 'users 表已删除')
    ok(rows.length === 2, `多房间同日同科折叠为 1 行（共 ${rows.length} 行）`)
    ok(rows[0].content === '二班新稿', '保留 updated_at 最大的那一版（二班新稿）')
    ok(rows[1].content === '只有一份', '单份数据原样保留')
  }

  step('health 与 CORS 预检')
  ok((await fetch(`${base}/health`)).status === 200, 'GET /api/health 200')
  const pre = await fetch(`${base}/board/save`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-board-token,content-type',
    },
  })
  const allow = pre.headers.get('access-control-allow-headers') ?? ''
  ok(pre.status < 400 && /x-board-token/i.test(allow), `OPTIONS 预检放行 X-Board-Token（${pre.status}）`)

  step('白板口令必须后端确认（不能只凭 URL 有 key 就解锁）')
  // 前端进页面先问 /api/auth/board；只要口令不对就必须 401，
  // 否则 ?key=see 这种手误会把全科编辑放出来，写又写不进，用户以为存上了。
  {
    const check = (token) =>
      fetch(`${base}/auth/board`, { headers: token === undefined ? {} : { 'X-Board-Token': token } })
    ok((await check(BOARD_TOKEN)).status === 200, '正确口令 → 200')
    // 注意不测「 seewo」「seewo 」：HTTP 头首尾空白由客户端/框架按规范剥掉，
    // 那是协议行为不是漏洞。真正要守的是不做前缀、大小写、子串容忍。
    for (const bad of ['see', 'seew', 'seewoo', 'SEE', 'wrong', 'seewo1', '1seewo']) {
      ok((await check(bad)).status === 401, `口令「${bad}」→ 401（不做前缀/大小写/子串容忍）`)
    }
    ok((await check(undefined)).status === 401, '不带口令 → 401')

    step('口令校验限流：猜口令不能无限试')
    let authLimited = null
    for (let i = 0; i < 25 && !authLimited; i += 1) {
      const res = await check('wrong')
      if (res.status === 429) authLimited = res
    }
    ok(authLimited !== null, '超过阈值后返回 429')
    ok(authLimited?.headers.get('Retry-After') === '60', '429 带 Retry-After 头')
  }

  step('公开读（学生扫码即可看）')
  const board = await fetch(`${base}/board?date=${DATE}`)
  ok(board.status === 200 && /no-store/.test(board.headers.get('cache-control') ?? ''), `GET /api/board 200 且 Cache-Control: ${board.headers.get('cache-control')}`)
  ok(Object.keys((await board.json()).subjects).length === 0, '空日期返回空 subjects')
  ok((await fetch(`${base}/board?date=2026-11-1`)).status === 400, '非法 date → 400')

  step('写入鉴权：只有白板口令')
  ok((await save({ subject: '数学', content: 'x' }, {})).status === 401, '无任何凭证 → 401')
  ok((await save({ subject: '语文', content: 'x' }, { 'X-Board-Token': 'wrong' })).status === 401, '错误白板令牌 → 401')
  ok((await save({ subject: '语文', content: '背诵课文' })).status === 200, '白板令牌：全科可写')
  // 旧登录体系的 Authorization 头不再有任何效力
  ok(
    (await save({ subject: '数学', content: 'x' }, { Authorization: 'Bearer anything' })).status === 401,
    'Authorization 头不再放行 → 401',
  )

  step('字段校验')
  ok((await save({ date: '2026-11-1', subject: '数学', content: 'x' })).status === 400, '非法 date → 400')
  ok((await save({ subject: 'x'.repeat(17), content: 'y' })).status === 400, 'subject 超长 → 400')
  ok((await save({ subject: '体育', content: 'y' })).status === 400, '未知学科 → 400')
  ok((await save({ subject: '数学', content: 'y'.repeat(20001) })).status === 400, 'content 超长 → 400')

  step('写入 → 读取往返 + 幂等')
  const readBack = await (await fetch(`${base}/board?date=${DATE}`)).json()
  ok(readBack.subjects['语文'].content === '背诵课文', '白板写的内容读得回')
  const before = readBack.subjects['语文'].updatedAt
  const dup = await (await save({ subject: '语文', content: '背诵课文' })).json()
  ok(dup.updatedAt === before, '同内容重复保存不改 updatedAt')

  step('旧登录接口已下线')
  ok((await post('/auth/login', { username: 'a', password: 'b' })).status === 404, 'POST /api/auth/login → 404')
  ok((await fetch(`${base}/auth/me`)).status === 404, 'GET /api/auth/me → 404')

  step('写接口限流')
  let limited = null
  for (let i = 0; i < 45 && !limited; i += 1) {
    const res = await save({ subject: '地理', content: `限流探测 ${i}` })
    if (res.status === 429) limited = res
  }
  ok(limited !== null, '超过阈值后返回 429')
  ok(limited?.headers.get('Retry-After') === '60', '429 带 Retry-After 头')
  ok((await limited.json()).error.includes('频繁'), '429 报文说明原因')

  console.log(`\n全部通过：${passed} 项断言`)
} catch (err) {
  console.error('\n✗ 自检失败：', err)
  process.exitCode = 1
} finally {
  if (child.exitCode === null) {
    child.kill()
    await new Promise((r) => child.once('exit', r))
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
