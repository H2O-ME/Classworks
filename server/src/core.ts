// 后端共用底座：SQLite 建表/迁移、学科常量。index.ts 从这里拿。
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '地理']

export const DB_PATH = process.env.DB_PATH || 'data/db.sqlite'

// 中国时区（无夏令时）：+8h 后取 UTC 日期串即 YYYYMMDD。ponytail: 只服务国内教室，不做时区库。
export const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replaceAll('-', '')

const HOMEWORKS_DDL = `
CREATE TABLE homeworks (
  date TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date, subject)
);`

const SCHEMA = `
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

// 旧库迁移：单班模型 + 无账号系统。只跑一次。
// - 删 history_logs 流水（更早的版本）
// - 删 users 表（账号系统已下线，权限只认 URL 口令）
// - homeworks 从 (room, date, subject) 三键折叠为 (date, subject)
function migrate(db: Database.Database) {
  db.exec('DROP TABLE IF EXISTS history_logs')
  db.exec('DROP TABLE IF EXISTS users')
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
  console.log('数据库已迁移：homeworks 去掉 room 维度，history_logs / users 已删除')
}
