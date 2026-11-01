// 可运行自检：node selftest.mjs（先 pnpm build）。用临时 DB 起真实服务，打 fetch 断言。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3199
const KEY = 'selftest-key'
const DATE = '20261101'
const base = `http://127.0.0.1:${PORT}/api`
const dir = mkdtempSync(join(tmpdir(), 'classworks-selftest-'))
const child = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, PORT: String(PORT), WRITE_KEY: KEY, DB_PATH: join(dir, 'db.sqlite'), CORS_ORIGINS: '*' },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let passed = 0
const step = (name) => console.log(`\n▶ ${name}`)
const ok = (cond, msg) => {
  assert.ok(cond, msg)
  passed++
  console.log(`  ✓ ${msg}`)
}

const save = (body, key = KEY) =>
  fetch(`${base}/board/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Write-Key': key } : {}) },
    body: JSON.stringify({ room: 'class-101', date: DATE, ...body }),
  })

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

  step('health 与 CORS 预检')
  ok((await fetch(`${base}/health`)).status === 200, 'GET /api/health 200')
  const pre = await fetch(`${base}/board/save`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-write-key,content-type' },
  })
  ok(pre.status < 400 && /x-write-key/i.test(pre.headers.get('access-control-allow-headers') ?? ''), `OPTIONS 预检放行 X-Write-Key（${pre.status}）`)

  step('鉴权与信任边界')
  ok((await save({ subject: '数学', content: 'x' }, null)).status === 401, '无 X-Write-Key → 401')
  ok((await save({ subject: '数学', content: 'x' }, 'wrong-key')).status === 401, '错误 X-Write-Key → 401')
  ok((await save({ date: '2026-11-1', subject: '数学', content: 'x' })).status === 400, '非法 date → 400')
  ok((await save({ subject: 'x'.repeat(17), content: 'y' })).status === 400, 'subject 超长 → 400')
  ok((await save({ subject: '数学', content: 'y'.repeat(20001) })).status === 400, 'content 超长 → 400')
  ok((await fetch(`${base}/board?room=${'r'.repeat(33)}&date=${DATE}`)).status === 400, 'room 超长 → 400')

  step('写入 → 读取往返')
  const first = await save({ subject: '数学', content: '第 1 页 习题' })
  ok(first.status === 200, `首次保存 200（${first.status}）`)
  const firstBody = await first.json()
  ok(typeof firstBody.updatedAt === 'number' && firstBody.content === '第 1 页 习题', '返回 { content, updatedAt }')
  const board = await fetch(`${base}/board?room=class-101&date=${DATE}`)
  ok(board.status === 200 && /no-store/.test(board.headers.get('cache-control') ?? ''), `GET /api/board 200 且 Cache-Control: ${board.headers.get('cache-control')}`)
  const boardBody = await board.json()
  ok(boardBody.subjects['数学'].content === '第 1 页 习题', '读回内容一致')
  ok(boardBody.subjects['数学'].updatedAt === firstBody.updatedAt, '读回 updatedAt 一致')
  ok(Object.keys(boardBody.subjects).length === 1, '未写学科不返回')

  step('同 baseUpdatedAt 重复保存幂等')
  const dup = await save({ subject: '数学', content: '第 1 页 习题', baseUpdatedAt: firstBody.updatedAt })
  const dupBody = await dup.json()
  ok(dup.status === 200 && dupBody.updatedAt === firstBody.updatedAt, '重复保存 200 且 updatedAt 不变')
  let hist = await (await fetch(`${base}/board/history?room=class-101&date=${DATE}`)).json()
  ok(hist.items.length === 1, `重复保存不产生多余历史（${hist.items.length} 条）`)

  step('冲突仲裁 409')
  const stale = await save({ subject: '数学', content: '本地旧稿', baseUpdatedAt: firstBody.updatedAt - 1000 })
  const staleBody = await stale.json()
  ok(stale.status === 409, 'baseUpdatedAt 落后且内容不同 → 409')
  ok(staleBody.content === '第 1 页 习题' && staleBody.updatedAt === firstBody.updatedAt, '409 带云端最新 { content, updatedAt }')

  step('正常更新与 history 落库')
  const second = await save({ subject: '数学', content: '第 2 页 习题', baseUpdatedAt: firstBody.updatedAt })
  const secondBody = await second.json()
  ok(second.status === 200 && secondBody.updatedAt >= firstBody.updatedAt, '带正确 baseUpdatedAt 更新成功')
  await save({ subject: '语文', content: '背诵课文' })
  hist = await (await fetch(`${base}/board/history?room=class-101&date=${DATE}`)).json()
  ok(hist.items.length === 3, `history 条数正确（${hist.items.length} 条）`)
  ok(hist.items[0].content === '背诵课文' && hist.items[0].createdAt >= hist.items[2].createdAt, 'history 倒序（最新在前）')
  ok((await (await fetch(`${base}/board?room=class-101&date=${DATE}`)).json()).subjects['语文'].content === '背诵课文', '第二次写入同样可读回')

  step('写接口限流')
  // 前面已经写了几次，这里继续写到触发 429 为止（上限 30/分钟）
  let limited = null
  for (let i = 0; i < 40 && !limited; i += 1) {
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
