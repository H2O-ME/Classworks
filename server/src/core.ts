// 后端共用底座：SQLite 建表/迁移、密码哈希、JWT 签发校验。index.ts 与 users.ts 都从这里拿。
import Database from 'better-sqlite3'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '地理']
export const ROLES = ['student', 'rep', 'admin']
export type Role = (typeof ROLES)[number]

export const DB_PATH = process.env.DB_PATH || 'data/db.sqlite'

// 中国时区（无夏令时）：+8h 后取 UTC 日期串即 YYYYMMDD。ponytail: 只服务国内教室，不做时区库。
export const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replaceAll('-', '')

export type UserRow = {
  id: number
  username: string
  real_name: string
  password_hash: string
  role: Role
  subject: string | null
  is_activated: number
}

const HOMEWORKS_DDL = `
CREATE TABLE homeworks (
  date TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date, subject)
);`

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  real_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  subject TEXT DEFAULT NULL,
  is_activated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS homeworks (
  date TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date, subject)
);
`

export function openDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL') // 读写并发更稳；数据库文件会附带 -wal/-shm
  db.exec(SCHEMA)
  migrate(db)
  return db
}

// 旧库是 (room, date, subject) 三键 + history_logs 流水。单班模型保留最新一版内容即可。
// 只跑一次：迁移后 homeworks 不再有 room 列，下次直接跳过。
function migrate(db: Database.Database) {
  db.exec('DROP TABLE IF EXISTS history_logs')
  const columns = db.prepare('PRAGMA table_info(homeworks)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'room')) return
  db.exec('ALTER TABLE homeworks RENAME TO homeworks_legacy')
  db.exec(HOMEWORKS_DDL)
  // SQLite 保证裸列取自 MAX() 命中的那一行，所以 content 与 updated_at 是同一版
  db.exec(
    `INSERT INTO homeworks (date, subject, content, updated_at)
     SELECT date, subject, content, MAX(updated_at) FROM homeworks_legacy GROUP BY date, subject`,
  )
  db.exec('DROP TABLE homeworks_legacy')
  console.log('数据库已迁移：homeworks 去掉 room 维度，history_logs 已删除')
}

// ── 密码：node:crypto 的 scrypt，不引 bcrypt/argon2（少一个原生依赖就少一处编译失败）──
export function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password: string, stored: string) {
  const [alg, saltHex, hashHex] = String(stored).split('$')
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// ── JWT：HS256，手写 20 行，不引 jsonwebtoken ──
// JWT_SECRET 没配置时随进程生成：安全（不可伪造）但重启后所有人要重新登录。
export const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex')
export const JWT_SECRET_IS_EPHEMERAL = !process.env.JWT_SECRET

const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url')

function hmac(data: string) {
  return createHmac('sha256', JWT_SECRET).update(data).digest('base64url')
}

export function signToken(userId: number, ttlSeconds: number) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
  return `${head}.${body}.${hmac(`${head}.${body}`)}`
}

export function verifyToken(token: string | undefined): number | null {
  const [head, body, signature] = String(token || '').split('.')
  if (!head || !body || !signature) return null
  const expected = hmac(`${head}.${body}`)
  // 长度不等时 timingSafeEqual 会抛，先比长度（签名固定 43 字符，不泄露内容）
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!Number.isInteger(claims?.sub)) return null
    if (Number(claims.exp) * 1000 <= Date.now()) return null
    return claims.sub as number
  } catch {
    return null
  }
}

// 只暴露给前端的三项：姓名 / 角色 / 绑定科目
export function publicUser(user: UserRow) {
  return { realName: user.real_name, role: user.role, subject: user.subject }
}
