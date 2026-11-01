// Classworks 后端：Hono + SQLite(WAL)。接口见 README.md。
//
// 权限模型（详见 README「权限矩阵」）：
//   希沃白板 → URL 带 board_token，换取 X-Board-Token，全科可写，无登录
//   管理员   → 全科可写
//   课代表   → 只有绑定科目可写
//   普通同学 → 只读
import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { timingSafeEqual } from 'node:crypto'
import {
  JWT_SECRET_IS_EPHEMERAL,
  SUBJECTS,
  hashPassword,
  openDb,
  publicUser,
  signToken,
  today,
  verifyPassword,
  verifyToken,
  type UserRow,
} from './core.js'

const PORT = Number(process.env.PORT) || 3100
const BOARD_TOKEN = process.env.BOARD_TOKEN ?? ''
// 逗号分隔；`*` 表示任意源。
const ORIGINS = (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean)

// 正式业务 token 30 天：课代表在手机上填一次就不用再管；首登改密的临时 token 只活 10 分钟。
const ACCESS_TTL = 30 * 24 * 3600
const TEMP_TTL = 600

const db = openDb()
const qBoard = db.prepare('SELECT subject, content, updated_at FROM homeworks WHERE date = ?')
const qGet = db.prepare('SELECT content, updated_at FROM homeworks WHERE date = ? AND subject = ?')
const qUpsert = db.prepare(`
  INSERT INTO homeworks (date, subject, content, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (date, subject) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`)
const qUserByName = db.prepare('SELECT * FROM users WHERE username = ?')
const qUserById = db.prepare('SELECT * FROM users WHERE id = ?')
const qSetPassword = db.prepare('UPDATE users SET password_hash = ?, is_activated = 1 WHERE id = ?')

const MAX = { subject: 16, content: 20000, username: 64, password: 128 }

// 信任边界：所有字段都在这里过一遍，非法返回 400。needSubject 只有写接口需要。
function parse(input: Record<string, unknown>, needSubject = false) {
  const date = typeof input.date === 'string' && input.date ? input.date : today()
  const subject = typeof input.subject === 'string' ? input.subject : ''
  const content = typeof input.content === 'string' ? input.content : ''
  if (!/^\d{8}$/.test(date)) return { error: 'date 必须是 8 位数字' }
  if (needSubject && (!subject || subject.length > MAX.subject)) return { error: 'subject 缺失或过长' }
  if (needSubject && !SUBJECTS.includes(subject)) return { error: '未知学科' }
  if (content.length > MAX.content) return { error: 'content 过长' }
  return { date, subject, content }
}

function safeEqual(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// 限流：令牌一旦泄露，没有它就能被脚本无限刷。单进程内存即可 —— ponytail: 多实例部署会各算一份，
// 那台机器只跑一个容器，够用；真要扩多实例就换成 Redis 计数。
const WINDOW_MS = 60_000
const LIMITS = { save: 30, login: 10 }
const hits = new Map<string, { count: number; resetAt: number }>()

// nginx 反代后 socket 地址恒为 127.0.0.1，必须取 X-Real-IP；直连兜底用 socket
function clientIp(c: Context) {
  return c.req.header('X-Real-IP') || c.req.header('X-Forwarded-For')?.split(',')[0].trim() || 'unknown'
}

function overLimit(bucket: keyof typeof LIMITS, ip: string) {
  const key = `${bucket}|${ip}`
  const now = Date.now()
  const hit = hits.get(key)
  if (!hit || now >= hit.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  hit.count += 1
  return hit.count > LIMITS[bucket]
}

// 内存计数不该无限增长：顺手清掉过期窗口。每 1000 次调用扫一遍，成本可忽略。
let sweeps = 0
function sweepHits() {
  if (++sweeps % 1000 !== 0) return
  const now = Date.now()
  for (const [key, hit] of hits) if (now >= hit.resetAt) hits.delete(key)
}

function bearer(c: Context) {
  const header = c.req.header('Authorization') ?? ''
  return /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
}

// token 只带 userId：角色和科目每次回库读，改了权限立刻生效，不用等 30 天过期
function currentUser(c: Context): UserRow | undefined {
  const userId = verifyToken(bearer(c))
  return userId === null ? undefined : (qUserById.get(userId) as UserRow | undefined)
}

type Verdict = { ok: true; user?: UserRow } | { ok: false; status: 401 | 403; error: string }

function authorize(c: Context, subject: string): Verdict {
  const boardToken = c.req.header('X-Board-Token')
  if (BOARD_TOKEN && boardToken && safeEqual(boardToken, BOARD_TOKEN)) return { ok: true }
  const user = currentUser(c)
  if (!user) return { ok: false, status: 401, error: '未登录或登录已过期' }
  if (user.role === 'admin') return { ok: true, user }
  if (user.role === 'rep' && user.subject === subject) return { ok: true, user }
  return { ok: false, status: 403, error: `没有「${subject}」的写入权限` }
}

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: ORIGINS.includes('*') ? '*' : (o) => (o && ORIGINS.includes(o) ? o : undefined),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Board-Token'],
    maxAge: 86400,
  }),
)

app.get('/api/health', (c) => c.json({ ok: true }))

// ── 登录 ──
app.post('/api/auth/login', async (c) => {
  sweepHits()
  if (overLimit('login', clientIp(c))) {
    c.header('Retry-After', String(WINDOW_MS / 1000))
    return c.json({ error: '尝试过于频繁，请稍后再试' }, 429)
  }

  const body = await c.req.json().catch(() => null)
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : ''
  const password = typeof input?.password === 'string' ? input.password : ''
  if (!username || !password) return c.json({ error: '请输入账号和密码' }, 400)
  if (username.length > MAX.username || password.length > MAX.password) return c.json({ error: '账号或密码过长' }, 400)

  const user = qUserByName.get(username) as UserRow | undefined
  // 账号不存在与密码错误给同一个 401：不让人枚举出班里谁注册了
  if (!user || !verifyPassword(password, user.password_hash)) return c.json({ error: '账号或密码不对' }, 401)

  if (!user.is_activated) {
    return c.json({ status: 'REQUIRE_NEW_PASSWORD', tempToken: signToken(user.id, TEMP_TTL), realName: user.real_name })
  }
  return c.json({ status: 'SUCCESS', token: signToken(user.id, ACCESS_TTL), user: publicUser(user) })
})

// ── 首登改密激活 ──
app.post('/api/auth/activate', async (c) => {
  const userId = verifyToken(bearer(c))
  const user = userId === null ? undefined : (qUserById.get(userId) as UserRow | undefined)
  if (!user) return c.json({ error: '激活凭证无效或已过期' }, 401)

  const body = await c.req.json().catch(() => null)
  const newPassword = typeof (body as Record<string, unknown> | null)?.newPassword === 'string'
    ? String((body as Record<string, unknown>).newPassword)
    : ''
  if (newPassword.length < 6 || newPassword.length > MAX.password) return c.json({ error: '密码长度需 6–128 位' }, 400)

  qSetPassword.run(hashPassword(newPassword), user.id)
  return c.json({ status: 'SUCCESS', token: signToken(user.id, ACCESS_TTL), user: publicUser({ ...user, is_activated: 1 }) })
})

// 前端刷新页面时用它校正身份（角色/科目被管理员改过也能立刻反映）
app.get('/api/auth/me', (c) => {
  const user = currentUser(c)
  if (!user) return c.json({ error: '未登录或登录已过期' }, 401)
  c.header('Cache-Control', 'no-store, no-cache')
  return c.json({ user: publicUser(user) })
})

// ── 读：公开，学生扫码即可看 ──
app.get('/api/board', (c) => {
  const parsed = parse({ date: c.req.query('date') })
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const subjects: Record<string, { content: string; updatedAt: number }> = {}
  for (const row of qBoard.all(parsed.date) as { subject: string; content: string; updated_at: number }[]) {
    subjects[row.subject] = { content: row.content, updatedAt: row.updated_at }
  }
  c.header('Cache-Control', 'no-store, no-cache')
  return c.json({ date: parsed.date, subjects })
})

// ── 写：白板令牌 / 管理员全科，课代表本科，其余 403 ──
app.post('/api/board/save', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: '请求体非法' }, 400)
  const parsed = parse(body as Record<string, unknown>, true)
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const { date, subject, content } = parsed

  const verdict = authorize(c, subject)
  if (!verdict.ok) return c.json({ error: verdict.error }, verdict.status)

  sweepHits()
  if (overLimit('save', clientIp(c))) {
    c.header('Retry-After', String(WINDOW_MS / 1000))
    return c.json({ error: '提交过于频繁，请稍后再试' }, 429)
  }

  const cur = qGet.get(date, subject) as { content: string; updated_at: number } | undefined
  // 幂等短路：内容没变就不动 updated_at（重试队列重发同一条不会把卡片闪一下）
  if (cur && cur.content === content) return c.json({ content: cur.content, updatedAt: cur.updated_at })

  const now = Date.now()
  qUpsert.run(date, subject, content, now)
  return c.json({ content, updatedAt: now })
})

app.notFound((c) => c.json({ error: '不存在' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: '服务器内部错误' }, 500)
})

if (!BOARD_TOKEN) console.warn('BOARD_TOKEN 未设置：希沃白板无法写入，只有登录账号能改')
if (JWT_SECRET_IS_EPHEMERAL) console.warn('JWT_SECRET 未设置：本次启动随机生成，重启后所有人需要重新登录')
serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`Classworks 后端已启动 :${info.port}（DB ${process.env.DB_PATH || 'data/db.sqlite'}）`))
