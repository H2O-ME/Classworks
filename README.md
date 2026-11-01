# Classworks

面向班级电脑使用的作业看板：教室大屏展示，老师在本机或手机编辑，多端共享同一份作业。

## 功能

- 按日期记录当天作业，固定六个学科入口：语文、数学、英语、物理、化学、地理
- 作业卡片按内容高度自动排布（瀑布流，1–4 列随屏幕宽度切换）
- 关闭编辑卡片时自动保存；保存只提交被改动的那一科
- 随机点名：全班名单页 + 滚动定格抽取
- 字体缩放、日期切换、把某天的作业复制到今天
- 学生扫码可只读浏览（无写密钥时不显示任何编辑入口）
- PWA 安装，断网可打开

## 架构

```
静态前端（Vue 3 + Vite + shadcn-vue + Tailwind）
        │  可挂境内 CDN，边缘缓存，秒开
        │
        ├── GET  /api/board            公开只读
        ├── POST /api/board/save       需 X-Write-Key
        └── GET  /api/board/history    变更流水
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

## 读写凭据

页面地址上的 `room` 与 `key` 会被应用读取并**立即从地址栏抹除**，避免讲台大屏泄露密钥：

```
https://<站点>/?room=class1&key=<写入密钥>
```

- 带有效 `key`：可编辑、可回填历史
- 不带 `key`：纯只读，适合学生扫码

希沃白板每天冰点还原，把带 `key` 的链接存成桌面快捷方式即可开机即用，无需重复输入密码。
