// Classworks 后端：Hono + SQLite(WAL)。接口见 README.md。
//
// 权限模型（详见 README「权限矩阵」）：
//   希沃白板 → URL 带 key，换 X-Board-Token，全科可写
//   其他人   → 只读（读接口公开）
import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { timingSafeEqual } from 'node:crypto'
import { SUBJECTS, openDb, today } from './core.js'

const PORT = Number(process.env.PORT) || 3100
const BOARD_TOKEN = process.env.BOARD_TOKEN ?? ''
// 逗号分隔；`*` 表示任意源。
const ORIGINS = (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean)

const db = openDb()
const qBoard = db.prepare('SELECT subject, content, updated_at FROM homeworks WHERE date = ?')
const qGet = db.prepare('SELECT content, updated_at FROM homeworks WHERE date = ? AND subject = ?')
const qUpsert = db.prepare(`
  INSERT INTO homeworks (date, subject, content, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (date, subject) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`)

const MAX = { subject: 16, content: 20000 }

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
const SAVE_LIMIT = 30
// 口令校验也要限流：这里不限，猜口令就没有成本
const AUTH_LIMIT = 20
const hits = new Map<string, { count: number; resetAt: number }>()

// nginx 反代后 socket 地址恒为 127.0.0.1，必须取 X-Real-IP；直连兜底用 socket
function clientIp(c: Context) {
  return c.req.header('X-Real-IP') || c.req.header('X-Forwarded-For')?.split(',')[0].trim() || 'unknown'
}

function bucket(key: string) {
  const now = Date.now()
  const hit = hits.get(key)
  if (hit && now < hit.resetAt) return hit
  const fresh = { count: 0, resetAt: now + WINDOW_MS }
  hits.set(key, fresh)
  return fresh
}

// 记一次并检查是否超限
function overLimit(key: string, limit: number) {
  const hit = bucket(key)
  hit.count += 1
  return hit.count > limit
}

// 内存计数不该无限增长：顺手清掉过期窗口。每 1000 次调用扫一遍，成本可忽略。
let sweeps = 0
function sweepHits() {
  if (++sweeps % 1000 !== 0) return
  const now = Date.now()
  for (const [key, hit] of hits) if (now >= hit.resetAt) hits.delete(key)
}

type Verdict = { ok: true } | { ok: false; status: 401; error: string }

function authorize(c: Context): Verdict {
  const boardToken = c.req.header('X-Board-Token')
  if (BOARD_TOKEN && boardToken && safeEqual(boardToken, BOARD_TOKEN)) return { ok: true }
  return { ok: false, status: 401, error: '缺少有效的写入口令' }
}

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: ORIGINS.includes('*') ? '*' : (o) => (o && ORIGINS.includes(o) ? o : undefined),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Board-Token'],
    maxAge: 86400,
  }),
)

app.get('/api/health', (c) => c.json({ ok: true }))

// 白板口令校验：前端绝不能凭「URL 里有个 key」就解锁全科编辑。
// 地址栏截断/手误（?key=see）会让 UI 假可写 —— 写接口本来就拒，但画面已经乐观改过了，
// 用户会以为存上了。所以进页面必须先问后端这个口令到底对不对。
app.get('/api/auth/board', (c) => {
  sweepHits()
  if (overLimit(`auth|${clientIp(c)}`, AUTH_LIMIT)) {
    c.header('Retry-After', String(WINDOW_MS / 1000))
    return c.json({ error: '尝试过于频繁，请稍后再试' }, 429)
  }
  const provided = c.req.header('X-Board-Token')
  if (!BOARD_TOKEN || !provided || !safeEqual(provided, BOARD_TOKEN)) {
    return c.json({ error: '白板口令无效' }, 401)
  }
  c.header('Cache-Control', 'no-store, no-cache')
  return c.json({ ok: true })
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

// ── 写：只有白板口令，其余 401 ──
app.post('/api/board/save', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: '请求体非法' }, 400)
  const parsed = parse(body as Record<string, unknown>, true)
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const { date, subject, content } = parsed

  if (!authorize(c).ok) return c.json({ error: '缺少有效的写入口令' }, 401)

  sweepHits()
  if (overLimit(`save|${clientIp(c)}`, SAVE_LIMIT)) {
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

if (!BOARD_TOKEN) console.warn('BOARD_TOKEN 未设置：所有人只读，白板也无法写入')
serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`Classworks 后端已启动 :${info.port}（DB ${process.env.DB_PATH || 'data/db.sqlite'}）`))
