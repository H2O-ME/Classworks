# 部署说明

## 当前部署目标

项目当前以 `EdgeOne Pages` 作为主要部署平台。

## 构建命令

```bash
pnpm install
pnpm build
```

构建产物输出到 `dist/`。

## edgeone.json

仓库根目录的 [edgeone.json](D:/web/Classworks/edgeone.json) 已包含当前仍在使用的配置：

- 安装命令
- 构建命令
- 输出目录
- 静态资源缓存头
- `sw.js` 的 `no-cache` 配置（旧 SW 缓存不刷新是"看到旧资源"的首因）

## 路由回退

[middleware.js](D:/web/Classworks/middleware.js) 负责 SPA 路由回退：

- 静态资源直接放行
- 页面路由统一重写到 `index.html`

## 注意

- 站点已移除全部音频资源
- 如果部署后仍看到旧资源请求，通常是旧 Service Worker 缓存未刷新；重新打开站点后会由新 SW 接管并清理
