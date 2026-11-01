// Classworks 后端：Hono + SQLite(WAL)。接口见 README.md。
import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { timingSafeEqual } from 'node:crypto'

const PORT = Number(process.env.PORT) || 3100
const DB_PATH = process.env.DB_PATH || 'data/db.sqlite'
const WRITE_KEY = process.env.WRITE_KEY ?? ''
// 逗号分隔；`*` 表示任意源。前端在境内 CDN，跨域请求必须放行 X-Write-Key。
const ORIGINS = (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean)

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL') // 读写并发更稳；数据库文件会附带 -wal/-shm
db.exec(`
CREATE TABLE IF NOT EXISTS homeworks (
  room TEXT NOT NULL, date TEXT NOT NULL, subject TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
  PRIMARY KEY (room, date, subject)
);
CREATE TABLE IF NOT EXISTS history_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL, date TEXT NOT NULL, subject TEXT NOT NULL,
  content TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_lookup ON history_logs (room, date);
`)

const qGet = db.prepare('SELECT content, updated_at FROM homeworks WHERE room = ? AND date = ? AND subject = ?')
const qUpsert = db.prepare(`
  INSERT INTO homeworks (room, date, subject, content, updated_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (room, date, subject) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`)
const qHistory = db.prepare('INSERT INTO history_logs (room, date, subject, content, created_at) VALUES (?, ?, ?, ?, ?)')
const qBoard = db.prepare('SELECT subject, content, updated_at FROM homeworks WHERE room = ? AND date = ?')
const qRecent = db.prepare(`
  SELECT id, subject, content, created_at FROM history_logs
  WHERE room = ? AND date = ? ORDER BY created_at DESC, id DESC LIMIT 20`)

type Row = { content: string; updated_at: number }
const commit = db.transaction((room: string, date: string, subject: string, content: string, now: number) => {
  qUpsert.run(room, date, subject, content, now)
  qHistory.run(room, date, subject, content, now)
})

const MAX = { room: 32, subject: 16, content: 20000 }
// 中国时区（无夏令时）：+8h 后取 UTC 日期串即 YYYYMMDD。ponytail: 只服务国内教室，不做时区库。
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replaceAll('-', '')

// 信任边界：所有字段都在这里过一遍，非法返回 400。needSubject 只有写接口需要。
function parse(input: Record<string, unknown>, needSubject = false) {
  const room = typeof input.room === 'string' && input.room ? input.room : 'default'
  const date = typeof input.date === 'string' && input.date ? input.date : today()
  const subject = typeof input.subject === 'string' ? input.subject : ''
  const content = typeof input.content === 'string' ? input.content : ''
  if (room.length > MAX.room) return { error: 'room 过长' }
  if (!/^\d{8}$/.test(date)) return { error: 'date 必须是 8 位数字' }
  if (needSubject && (!subject || subject.length > MAX.subject)) return { error: 'subject 缺失或过长' }
  if (content.length > MAX.content) return { error: 'content 过长' }
  return { room, date, subject, content }
}

function keyOk(provided?: string) {
  if (!WRITE_KEY || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(WRITE_KEY)
  return a.length === b.length && timingSafeEqual(a, b)
}

// 写接口限流：密钥一旦泄露，没有它就能被脚本无限刷。
// 按来源 IP 每分钟计数，单进程内存即可 —— ponytail: 上限是多实例部署时会各算一份，
// 那台机器只跑一个容器，够用；真要扩多实例就换成 Redis 计数。
const WRITE_LIMIT = 30
const WRITE_WINDOW_MS = 60_000
const writeHits = new Map<string, { count: number; resetAt: number }>()

// nginx 反代后 socket 地址恒为 127.0.0.1，必须取 X-Real-IP；直连兜底用 socket
function clientIp(c: Context) {
  return c.req.header('X-Real-IP') || c.req.header('X-Forwarded-For')?.split(',')[0].trim() || 'unknown'
}

function tooManyWrites(ip: string) {
  const now = Date.now()
  const hit = writeHits.get(ip)
  if (!hit || now >= hit.resetAt) {
    writeHits.set(ip, { count: 1, resetAt: now + WRITE_WINDOW_MS })
    return false
  }
  hit.count += 1
  return hit.count > WRITE_LIMIT
}

// 内存计数不该无限增长：顺手清掉过期窗口。每 1000 次调用扫一遍，成本可忽略。
let sweeps = 0
function sweepWriteHits() {
  if (++sweeps % 1000 !== 0) return
  const now = Date.now()
  for (const [ip, hit] of writeHits) if (now >= hit.resetAt) writeHits.delete(ip)
}

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: ORIGINS.includes('*') ? '*' : (o) => (o && ORIGINS.includes(o) ? o : undefined),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Write-Key'],
    maxAge: 86400,
  }),
)

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/board', (c) => {
  const parsed = parse({ room: c.req.query('room'), date: c.req.query('date') })
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const { room, date } = parsed
  const subjects: Record<string, { content: string; updatedAt: number }> = {}
  for (const r of qBoard.all(room, date) as { subject: string; content: string; updated_at: number }[]) {
    subjects[r.subject] = { content: r.content, updatedAt: r.updated_at }
  }
  c.header('Cache-Control', 'no-store, no-cache')
  return c.json({ room, date, subjects })
})

app.post('/api/board/save', async (c) => {
  if (!keyOk(c.req.header('X-Write-Key'))) return c.json({ error: '写入密钥无效' }, 401)
  sweepWriteHits()
  if (tooManyWrites(clientIp(c))) {
    c.header('Retry-After', String(WRITE_WINDOW_MS / 1000))
    return c.json({ error: '提交过于频繁，请稍后再试' }, 429)
  }
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: '请求体非法' }, 400)
  const parsed = parse(body as Record<string, unknown>, true)
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const { room, date, subject, content } = parsed
  const base = Number((body as Record<string, unknown>).baseUpdatedAt)
  const known = Number.isFinite(base) ? base : 0

  const cur = qGet.get(room, date, subject) as Row | undefined
  if (cur) {
    if (cur.content === content) return c.json({ content: cur.content, updatedAt: cur.updated_at }) // 幂等：内容没变就不写流水
    if (cur.updated_at > known) return c.json({ error: '冲突：云端已有更新', content: cur.content, updatedAt: cur.updated_at }, 409)
  }
  const now = Date.now()
  commit(room, date, subject, content, now) // 上面读取与这里之间没有 await，单线程下不会被并发插队
  return c.json({ content, updatedAt: now })
})

app.get('/api/board/history', (c) => {
  const parsed = parse({ room: c.req.query('room'), date: c.req.query('date') })
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)
  const { room, date } = parsed
  const items = (qRecent.all(room, date) as { id: number; subject: string; content: string; created_at: number }[]).map(
    (r) => ({ id: r.id, subject: r.subject, content: r.content, createdAt: r.created_at }),
  )
  c.header('Cache-Control', 'no-store, no-cache')
  return c.json({ room, date, items })
})

app.notFound((c) => c.json({ error: '不存在' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: '服务器内部错误' }, 500)
})

if (!WRITE_KEY) console.warn('WRITE_KEY 未设置：所有写入都会返回 401')
serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`Classworks 后端已启动 :${info.port}（DB ${DB_PATH}）`))
