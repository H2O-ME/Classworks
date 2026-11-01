// 可运行自检：node selftest.mjs（先 pnpm build）。用临时 DB 起真实服务，打 fetch 断言。
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const PORT = 3199
const BOARD_TOKEN = 'selftest-board-token'
const JWT_SECRET = 'selftest-jwt-secret'
const DATE = '20261101'
const base = `http://127.0.0.1:${PORT}/api`
const dir = mkdtempSync(join(tmpdir(), 'classworks-selftest-'))
const DB_PATH = join(dir, 'db.sqlite')

// 账号先落库，再起服务：服务进程只读不建号
const seed = (...args) =>
  execFileSync(process.execPath, ['dist/users.js', ...args], {
    env: { ...process.env, DB_PATH },
    stdio: ['ignore', 'pipe', 'inherit'],
  })

seed('add', 'admin', '王老师', 'admin', 'init-admin')
seed('add', 'shuxue', '李四', 'rep', '数学', 'init-rep')
seed('add', 'xuesheng', '张三', 'student', 'init-stu')

const child = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, PORT: String(PORT), BOARD_TOKEN, JWT_SECRET, DB_PATH, CORS_ORIGINS: '*' },
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

const auth = (token) => ({ Authorization: `Bearer ${token}` })

// 首登改密全流程，返回正式 token
async function activate(username, initial, next) {
  const login = await post('/auth/login', { username, password: initial })
  const { tempToken } = await login.json()
  const res = await post('/auth/activate', { newPassword: next }, auth(tempToken))
  return res.json()
}

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

  step('旧库迁移（room 维度 → 单班，history_logs 删除）')
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
    `)
    const insert = old.prepare('INSERT INTO homeworks VALUES (?, ?, ?, ?, ?)')
    insert.run('class1', '20261030', '数学', '一班旧稿', 100)
    insert.run('class2', '20261030', '数学', '二班新稿', 500)
    insert.run('class1', '20261031', '语文', '只有一份', 200)
    old.prepare('INSERT INTO history_logs (room, date, subject, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('class1', '20261030', '数学', '流水', 1)
    old.close()

    // users.js 也走 openDb()，用它触发迁移。建两个号：第二次 openDb 必须发现已迁移并跳过（幂等）
    const legacyEnv = { ...process.env, DB_PATH: legacyPath }
    execFileSync(process.execPath, ['dist/users.js', 'add', 'migrator', '迁移', 'student'], { env: legacyEnv, stdio: 'ignore' })
    execFileSync(process.execPath, ['dist/users.js', 'add', 'migrator2', '迁移二', 'student'], { env: legacyEnv, stdio: 'ignore' })

    const db = new Database(legacyPath, { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    const rows = db.prepare('SELECT date, subject, content FROM homeworks ORDER BY date, subject').all()
    const users = db.prepare('SELECT COUNT(*) c FROM users').get().c
    db.close()
    rmSync(legacyDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    ok(!tables.includes('history_logs'), 'history_logs 已删除')
    ok(rows.length === 2, `多房间同日同科折叠为 1 行（共 ${rows.length} 行）`)
    ok(rows[0].content === '二班新稿', '保留 updated_at 最大的那一版（二班新稿）')
    ok(rows[1].content === '只有一份', '单份数据原样保留')
    ok(users === 2, '第二次打开时迁移幂等（用户表正常写入）')
  }

  step('health 与 CORS 预检')
  ok((await fetch(`${base}/health`)).status === 200, 'GET /api/health 200')
  const pre = await fetch(`${base}/board/save`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-board-token,authorization,content-type',
    },
  })
  const allow = pre.headers.get('access-control-allow-headers') ?? ''
  ok(pre.status < 400 && /x-board-token/i.test(allow) && /authorization/i.test(allow), `OPTIONS 预检放行 X-Board-Token / Authorization（${pre.status}）`)

  step('登录：信任边界')
  ok((await post('/auth/login', { username: 'nobody', password: 'x' })).status === 401, '账号不存在 → 401')
  ok((await post('/auth/login', { username: 'admin', password: 'wrong' })).status === 401, '密码错误 → 401')
  ok((await post('/auth/login', { username: '', password: '' })).status === 400, '空账号密码 → 400')

  step('首登改密')
  const firstLogin = await post('/auth/login', { username: 'admin', password: 'init-admin' })
  const firstBody = await firstLogin.json()
  ok(firstBody.status === 'REQUIRE_NEW_PASSWORD' && firstBody.realName === '王老师', '未激活账号返回 REQUIRE_NEW_PASSWORD + 姓名')
  ok(!firstBody.token && typeof firstBody.tempToken === 'string', '不下发正式 token，只给临时凭证')
  ok((await post('/auth/activate', { newPassword: 'new-admin-pw' })).status === 401, '无临时凭证改密 → 401')
  ok((await post('/auth/activate', { newPassword: '12345' }, auth(firstBody.tempToken))).status === 400, '新密码过短 → 400')
  const activated = await (await post('/auth/activate', { newPassword: 'new-admin-pw' }, auth(firstBody.tempToken))).json()
  ok(activated.status === 'SUCCESS' && activated.user.role === 'admin', '改密成功并直接下发正式 token')
  const adminToken = activated.token

  const relogin = await (await post('/auth/login', { username: 'admin', password: 'new-admin-pw' })).json()
  ok(relogin.status === 'SUCCESS' && relogin.token, '新密码可正常登录')
  ok((await post('/auth/login', { username: 'admin', password: 'init-admin' })).status === 401, '初始密码已失效')

  step('/api/auth/me 校正身份')
  ok((await (await fetch(`${base}/auth/me`, { headers: auth(adminToken) })).json()).user.realName === '王老师', '带 token 取回姓名')
  ok((await fetch(`${base}/auth/me`)).status === 401, '无 token → 401')

  const repToken = (await activate('shuxue', 'init-rep', 'new-rep-pw')).token
  const stuToken = (await activate('xuesheng', 'init-stu', 'new-stu-pw')).token

  step('公开读（学生扫码即可看）')
  const board = await fetch(`${base}/board?date=${DATE}`)
  ok(board.status === 200 && /no-store/.test(board.headers.get('cache-control') ?? ''), `GET /api/board 200 且 Cache-Control: ${board.headers.get('cache-control')}`)
  ok(Object.keys((await board.json()).subjects).length === 0, '空日期返回空 subjects')
  ok((await fetch(`${base}/board?date=2026-11-1`)).status === 400, '非法 date → 400')

  step('写入鉴权链')
  ok((await save({ subject: '数学', content: 'x' }, {})).status === 401, '无任何凭证 → 401')
  ok((await save({ subject: '语文', content: 'x' }, { 'X-Board-Token': 'wrong' })).status === 401, '错误白板令牌 → 401')
  ok((await save({ subject: '语文', content: '背诵课文' })).status === 200, '白板令牌：全科可写')
  ok((await save({ subject: '数学', content: 'x' }, auth(stuToken))).status === 403, '普通同学 → 403')
  ok((await save({ subject: '数学', content: '第 1 页' }, auth(repToken))).status === 200, '课代表写绑定科目 → 200')
  const cross = await save({ subject: '英语', content: 'x' }, auth(repToken))
  ok(cross.status === 403 && /英语/.test((await cross.json()).error), '课代表写别的科目 → 403 且说明科目')
  ok((await save({ subject: '英语', content: '抄单词' }, auth(adminToken))).status === 200, '管理员全科可写')

  step('字段校验')
  ok((await save({ date: '2026-11-1', subject: '数学', content: 'x' })).status === 400, '非法 date → 400')
  ok((await save({ subject: 'x'.repeat(17), content: 'y' })).status === 400, 'subject 超长 → 400')
  ok((await save({ subject: '体育', content: 'y' })).status === 400, '未知学科 → 400')
  ok((await save({ subject: '数学', content: 'y'.repeat(20001) })).status === 400, 'content 超长 → 400')

  step('写入 → 读取往返 + 幂等')
  const readBack = await (await fetch(`${base}/board?date=${DATE}`)).json()
  ok(readBack.subjects['数学'].content === '第 1 页', '读回课代表写入的内容')
  ok(Object.keys(readBack.subjects).length === 3, `三科都有内容（白板/课代表/管理员各写一科，${Object.keys(readBack.subjects).length}）`)
  const before = readBack.subjects['数学'].updatedAt
  const dup = await (await save({ subject: '数学', content: '第 1 页' }, auth(repToken))).json()
  ok(dup.updatedAt === before, '同内容重复保存不改 updatedAt')

  step('历史流水已下线')
  ok((await fetch(`${base}/board/history?date=${DATE}`)).status === 404, 'GET /api/board/history → 404')

  step('写接口限流')
  let limited = null
  for (let i = 0; i < 45 && !limited; i += 1) {
    const res = await save({ subject: '地理', content: `限流探测 ${i}` })
    if (res.status === 429) limited = res
  }
  ok(limited !== null, '超过阈值后返回 429')
  ok(limited?.headers.get('Retry-After') === '60', '429 带 Retry-After 头')
  ok((await limited.json()).error.includes('频繁'), '429 报文说明原因')

  step('登录接口限流')
  let loginLimited = null
  for (let i = 0; i < 20 && !loginLimited; i += 1) {
    const res = await post('/auth/login', { username: 'admin', password: 'wrong' })
    if (res.status === 429) loginLimited = res
  }
  ok(loginLimited !== null, '撞库式连错触发 429')

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
