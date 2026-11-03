# Classworks

面向班级电脑使用的作业看板：教室大屏展示，课代表在手机上改自己那一科，同学回家查看。

## 功能

- 按日期记录当天作业，固定六个学科：语文、数学、英语、物理、化学、地理
- 作业卡片按内容高度自动排布（瀑布流，1–3 列随屏幕宽度切换）
- 关闭编辑卡片时自动保存；保存只提交被改动的那一科
- 随机点名：全班名单页 + 滚动定格抽取
- 字体缩放、行距/字距/段距微调，字体市场在线字体按需加载，设置页实时预览
- 日期切换、把某天的作业复制到今天
- 多设备同步：每 30 秒静默拉取，切回页面立即同步，按学科 `updatedAt` 合并
- 权限极简：URL 带 `?key=` 口令 = 全科可写；没有 = 纯只读（无账号、无密码）
- PWA 安装，断网可打开

## 权限矩阵

| 身份 | 登录方式 | 可写范围 |
| --- | --- | --- |
| 拿到 `?key=` 口令的人（讲台/课代表） | URL 带 `key`，免密 | 全 6 科 |
| 其他任何人 | — | 只读（读接口公开） |

写入口令只有一个（服务端 `BOARD_TOKEN`）。2026-11 重构删除了整个账号系统（用户表 / JWT / 登录接口 / 课代表分科）——真实使用中没人愿意记密码。

## 架构

```
静态前端（Vue 3 + Vite + shadcn-vue + Tailwind）
        │  可挂境内 CDN，边缘缓存，秒开
        │
        ├── GET  /api/auth/board    口令确认（fail closed）
        ├── GET  /api/board         公开只读
        └── POST /api/board/save   X-Board-Token
                │
        境外 Node.js 后端（Hono + SQLite/WAL）
```

- 前端：`src/`，页面走文件路由（`src/pages/`），数据逻辑在 `src/composables/`，API 封装在 `src/api/`，基础组件在 `src/components/ui/`（shadcn-vue CLI 生成）
- 后端：`server/`，三个业务接口 + 健康检查，SQLite 落在数据卷里

## 开发

```bash
pnpm install
pnpm dev            # 前端，端口 3031
pnpm --dir server dev   # 后端，端口 3100（首次先 pnpm --dir server install）
```

前端通过 `VITE_API_BASE` 指向后端，默认 `http://localhost:3100`。
需要联调线上后端时，把地址写进 `.env.local`（已在 `.gitignore`），**不要**改 `.env` 默认值。

## 构建与部署

```bash
pnpm build          # 产物在 dist/
node scripts/pwa-check.mjs   # 构建后校验 Service Worker 架构未回退
```

静态产物部署到任意静态托管（建议境内 CDN），后端见 `server/README.md` 与 `DEPLOY.md`。

## 希沃白板免密

讲台大屏把下面这个地址存成桌面快捷方式，每天冰点还原后开机即用：

```
https://<站点>/?key=seewo
```

`seewo` 就是服务端 `.env` 里的 `BOARD_TOKEN` 值，改一边要同步改另一边。

应用读出 `key` 后立刻 `history.replaceState` 把它从地址栏抹掉，并只存进 `sessionStorage`（关掉浏览器即失效）；学生看不到这个值。
不带 `key` 时是纯只读，适合学生扫码。

> 这个令牌是「全班共用、写在快捷方式里」的口令，任何拿到它的人都能改全部 6 科。用固定短值（如 `seewo`）方便讲台重装还原后重输，代价是它并非密钥级强度 —— 要更安全就换成 `openssl rand -hex 24` 生成的长随机串。
