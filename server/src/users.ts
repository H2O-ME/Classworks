#!/usr/bin/env node
// 账号管理 CLI：容器里跑 `docker compose exec api node dist/users.js ...`
//
//   list                                  列出全部账号
//   add <账号> <姓名> <角色> [科目] [初始密码]
//   passwd <账号> [新初始密码]             重置为「首次登录需改密」状态（默认初始密码=账号）
//   del <账号>
//
// 角色：student | rep | admin。rep 必须给科目（语文/数学/英语/物理/化学/地理）。
// 不给初始密码时用账号本身当初始密码，首次登录会强制改密。
import { openDb, hashPassword, ROLES, SUBJECTS, type Role, type UserRow } from './core.js'

const db = openDb()
const qAll = db.prepare('SELECT * FROM users ORDER BY role, subject, username')
const qFind = db.prepare('SELECT * FROM users WHERE username = ?')
const qInsert = db.prepare(
  'INSERT INTO users (username, real_name, password_hash, role, subject, is_activated) VALUES (?, ?, ?, ?, ?, 0)',
)
const qReset = db.prepare('UPDATE users SET password_hash = ?, is_activated = 0 WHERE username = ?')
const qDelete = db.prepare('DELETE FROM users WHERE username = ?')

function die(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function normalizeUsername(raw: string | undefined) {
  const username = String(raw ?? '').trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) die('账号必须是 3–32 位小写字母开头的拼音全拼（可含数字/下划线）')
  return username
}

const LABEL: Record<Role, string> = { student: '同学', rep: '课代表', admin: '管理员' }

function describe(user: UserRow) {
  return [
    user.username.padEnd(20),
    user.real_name.padEnd(8),
    LABEL[user.role] ?? user.role,
    user.subject ?? '-',
    user.is_activated ? '已激活' : '待首登改密',
  ].join('  ')
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'list': {
    const users = qAll.all() as UserRow[]
    if (!users.length) die('还没有任何账号，先 add 一个 admin')
    console.log(`${users.length} 个账号：\n`)
    for (const user of users) console.log(describe(user))
    break
  }

  case 'add': {
    const username = normalizeUsername(args[0])
    const realName = String(args[1] ?? '').trim()
    const role = String(args[2] ?? '').trim() as Role
    if (!realName) die('缺少姓名')
    if (!ROLES.includes(role)) die(`角色只能是 ${ROLES.join(' / ')}`)
    const subject = role === 'rep' ? String(args[3] ?? '').trim() : ''
    if (role === 'rep' && !SUBJECTS.includes(subject)) die(`课代表必须绑定科目：${SUBJECTS.join('/')}`)
    const password = String(args[3 + (role === 'rep' ? 1 : 0)] ?? '') || username
    if (qFind.get(username)) die(`账号 ${username} 已存在`)
    qInsert.run(username, realName, hashPassword(password), role, subject || null)
    console.log(`✓ 已创建 ${describe(qFind.get(username) as UserRow)}`)
    break
  }

  case 'passwd': {
    const username = normalizeUsername(args[0])
    if (!qFind.get(username)) die(`账号 ${username} 不存在`)
    qReset.run(hashPassword(String(args[1] ?? '') || username), username)
    console.log(`✓ ${username} 已重置为初始态，下次登录须改密`)
    break
  }

  case 'del': {
    const username = normalizeUsername(args[0])
    if (!qFind.get(username)) die(`账号 ${username} 不存在`)
    qDelete.run(username)
    console.log(`✓ 已删除 ${username}`)
    break
  }

  default:
    console.log('用法：node dist/users.js list | add <账号> <姓名> <角色> [科目] [初始密码] | passwd <账号> | del <账号>')
    process.exitCode = command ? 1 : 0
}
