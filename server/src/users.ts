#!/usr/bin/env node
// 账号管理 CLI：容器里跑 `docker compose exec api node dist/users.js ...`
//
//   list                                  列出全部账号
//   seed <roster.json>                    按名单幂等同步账号与角色（新建补密码，已有只改姓名/角色）
//   reset [账号...]                       把账号重置回「首登须改密」，初始密码=学号（不给账号=全量）
//   role <账号> <角色> [科目]              改单个账号的角色（含提为课代表/管理员）
//   passwd <账号> [新初始密码]             手工指定初始密码，同样回到「首登须改密」
//   add <账号> <姓名> <角色> [科目] [学号]  名单外的一次性账号（正常流程用 seed）
//   del <账号>
//
// 角色：student | rep | admin。rep 必须给科目（语文/数学/英语/物理/化学/地理）。
// 初始密码 = 学号（名单里 studentId，如 240834），首次登录强制改密。
import { readFileSync } from 'node:fs'
import { openDb, hashPassword, ROLES, SUBJECTS, type Role, type UserRow } from './core.js'

const db = openDb()
const qAll = db.prepare('SELECT * FROM users ORDER BY role, subject, username')
const qFind = db.prepare('SELECT * FROM users WHERE username = ?')
const qInsert = db.prepare(
  'INSERT INTO users (username, real_name, password_hash, role, subject, is_activated, student_id) VALUES (?, ?, ?, ?, ?, 0, ?)',
)
const qReset = db.prepare('UPDATE users SET password_hash = ?, is_activated = 0 WHERE username = ?')
const qSetRole = db.prepare('UPDATE users SET role = ?, subject = ? WHERE username = ?')
// seed 用：只同步姓名/角色/学号，不碰 password_hash / is_activated
const qSync = db.prepare('UPDATE users SET real_name = ?, role = ?, subject = ?, student_id = ? WHERE username = ?')
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

// 学号即初始密码：唯一、人人记得、不带姓名信息。没有学号的老账号只能退回账号名。
const initialPassword = (user: UserRow) => user.student_id || user.username

const LABEL: Record<Role, string> = { student: '同学', rep: '课代表', admin: '管理员' }

function describe(user: UserRow) {
  return [
    user.username.padEnd(20),
    user.real_name.padEnd(8),
    LABEL[user.role] ?? user.role,
    (user.subject ?? '-').padEnd(3),
    (user.student_id ?? '-').padEnd(7),
    user.is_activated ? '已激活' : '待首登改密',
  ].join('  ')
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'list': {
    const users = qAll.all() as UserRow[]
    if (!users.length) die('还没有任何账号，先跑 seed 或 add')
    console.log(`${users.length} 个账号（账号 / 姓名 / 角色 / 科目 / 学号 / 状态）：\n`)
    for (const user of users) console.log(describe(user))
    break
  }

  case 'seed': {
    const file = String(args[0] ?? '').trim()
    if (!file) die('缺少名单 JSON 路径')

    let roster: { name?: string; pinyin?: string; role?: string; subject?: string; studentId?: string }[]
    try {
      roster = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      die(`读不了名单 ${file}：${(error as Error).message}`)
    }
    if (!Array.isArray(roster) || !roster.length) die('名单必须是 [{ name, pinyin, studentId?, role?, subject? }] 非空数组')

    // 幂等 upsert：新建补密码，已存在只同步姓名/角色/学号（绝不动密码，重跑不会把大家踢下线）
    let created = 0
    let updated = 0
    for (const entry of roster) {
      const username = normalizeUsername(entry?.pinyin)
      const realName = String(entry?.name ?? '').trim()
      const studentId = String(entry?.studentId ?? '').trim()
      if (!realName) die(`${username} 缺姓名`)
      if (!/^\d{4,12}$/.test(studentId)) die(`${username} 的学号「${studentId}」必须是 4–12 位数字`)
      const role = (String(entry?.role ?? 'student').trim() || 'student') as Role
      if (!ROLES.includes(role)) die(`${username} 的角色 ${role} 非法`)
      const subject = role === 'rep' ? String(entry?.subject ?? '').trim() : ''
      if (role === 'rep' && !SUBJECTS.includes(subject)) die(`${username} 是课代表，科目必须是 ${SUBJECTS.join('/')}`)

      if (qFind.get(username)) {
        qSync.run(realName, role, subject || null, studentId, username)
        updated += 1
      } else {
        qInsert.run(username, realName, hashPassword(studentId), role, subject || null, studentId)
        created += 1
      }
    }
    console.log(`✓ 新建 ${created} 个账号，同步 ${updated} 个（初始密码=学号，首登须改密）`)
    break
  }

  case 'reset': {
    // 学号已随 seed 落库，重置只认库里的值；不给账号就全量重置
    const targets = args.length ? args.map((arg) => normalizeUsername(arg)) : (qAll.all() as UserRow[]).map((user) => user.username)
    let done = 0
    for (const username of targets) {
      const user = qFind.get(username) as UserRow | undefined
      if (!user) die(`账号 ${username} 不存在`)
      qReset.run(hashPassword(initialPassword(user)), username)
      done += 1
    }
    console.log(`✓ ${done} 个账号已重置为「首登须改密」，初始密码=学号`)
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
    const studentId = String(args[3 + (role === 'rep' ? 1 : 0)] ?? '').trim()
    // 名单外的一次性账号：初始密码用学号，没有学号就退回账号名
    const password = String(args[4 + (role === 'rep' ? 1 : 0)] ?? '') || studentId || username
    if (qFind.get(username)) die(`账号 ${username} 已存在`)
    qInsert.run(username, realName, hashPassword(password), role, subject || null, studentId || null)
    console.log(`✓ 已创建 ${describe(qFind.get(username) as UserRow)}`)
    break
  }

  case 'role': {
    const username = normalizeUsername(args[0])
    if (!qFind.get(username)) die(`账号 ${username} 不存在`)
    const role = String(args[1] ?? '').trim() as Role
    if (!ROLES.includes(role)) die(`角色只能是 ${ROLES.join(' / ')}`)
    const subject = role === 'rep' ? String(args[2] ?? '').trim() : ''
    if (role === 'rep' && !SUBJECTS.includes(subject)) die(`课代表必须绑定科目：${SUBJECTS.join('/')}`)
    qSetRole.run(role, subject || null, username)
    console.log(`✓ ${describe(qFind.get(username) as UserRow)}`)
    break
  }

  case 'passwd': {
    const username = normalizeUsername(args[0])
    const user = qFind.get(username) as UserRow | undefined
    if (!user) die(`账号 ${username} 不存在`)
    qReset.run(hashPassword(String(args[1] ?? '') || initialPassword(user)), username)
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
    console.log(
      '用法：node dist/users.js list | seed <roster.json> | reset [账号...] | role <账号> <角色> [科目] | passwd <账号> [新密码] | del <账号>',
    )
    process.exitCode = command ? 1 : 0
}
