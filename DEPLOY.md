# Classworks - EdgeOne Pages 部署指南

## 📋 项目概述

Classworks 是一个基于 **Vue 3 + Vite + Vuetify** 的班级作业板应用，已完全适配 **EdgeOne Pages** 边缘计算平台。

## 🚀 快速开始

### 前置条件

- ✅ Node.js 22.11.0（或兼容版本）
- ✅ pnpm 包管理器
- ✅ EdgeOne Pages 账号

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 访问 http://localhost:3032/
```

### 构建生产版本

```bash
# 构建（输出到 dist/ 目录）
pnpm build

# 预览构建结果
pnpm preview
```

## 📦 EdgeOne Pages 配置说明

### edgeone.json 配置详解

```json
{
  "name": "classworks",                    // 项目名称
  "framework": "vite",                     // 使用 Vite 框架
  "installCommand": "pnpm install",        // 安装命令（使用 pnpm）
  "buildCommand": "pnpm build",            // 构建命令
  "outputDirectory": "dist",               // 输出目录
  "nodeVersion": "22.11.0",                // Node.js 版本
  
  // 缓存策略配置
  "headers": [
    {
      "source": "/assets/*",
      "headers": [{
        "key": "Cache-Control",
        "value": "public, max-age=31536000, immutable"
      }]
    },
    {
      "source": "/pwa/*",
      "headers": [{
        "key": "Cache-Control",
        "value": "public, max-age=604800"
      }]
    }
  ],
  
  // 重定向规则（www 重定向）
  "redirects": [
    {
      "source": "$host",
      "destination": "$wwwhost",
      "statusCode": 301
    }
  ]
}
```

## 🔧 核心文件说明

| 文件 | 用途 | 说明 |
|------|------|------|
| `edgeone.json` | EdgeOne Pages 项目配置 | 定义构建、缓存、重定向规则 |
| `middleware.js` | Edge Middleware | SPA 路由重写，支持 Vue Router history 模式 |
| `vite.config.mjs` | Vite 构建配置 | 优化打包、PWA、代码分割 |

## 🌐 中间件 (Middleware)

### 功能说明

`middleware.js` 文件实现了 **SPA 路由回退**功能：

- **匹配规则**：排除所有静态资源路径
- **处理逻辑**：将非静态资源请求重写至 `index.html`
- **兼容性**：完美支持 Vue Router 的 `createWebHistory` 模式

### 工作原理

```
用户访问 /settings → middleware.js → rewrite 到 /index.html → Vue Router 处理路由
用户访问 /assets/main.js → 直接返回静态文件（不经过 middleware）
```

## 💾 缓存策略

### 浏览器缓存（通过 headers 配置）

| 资源类型 | Cache-Control | 说明 |
|---------|---------------|------|
| `/assets/*` | `max-age=31536000, immutable` | 带哈希的 JS/CSS，长期缓存 |
| `/pwa/*` | `max-age=604800` | PWA 图标，7天缓存 |
| `/sounds/*.mp3` | `max-age=604800` | 音频文件，7天缓存 |
| `/index.html` | `no-cache` | HTML 始终新鲜 |
| `/sw.js`, `/sw-cache-manager.js` | `no-cache` | Service Worker 不缓存 |

### 边缘缓存（EdgeOne 自动管理）

- ✅ **自动缓存**：首次请求后缓存到边缘节点
- ✅ **智能失效**：每次新部署后自动清除旧缓存
- ✅ **全球加速**：内容分发到离用户最近的节点

## 🗄️ Blob 存储（EdgeOne Pages Blob）

### 概述

项目已从本地 IndexedDB 存储迁移至 **EdgeOne Pages Blob** 云端分布式对象存储，实现数据持久化和多设备同步。

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (Vue 3)                            │
│                                                             │
│  业务组件 (Vue 页面/Store)                                   │
│        │                                                    │
│        ▼                                                    │
│  dataProvider.js (统一数据访问层)                             │
│        │                                                    │
│        ▼                                                    │
│  kvBlobProvider.js (Blob 存储封装层)                         │
│        │                                                    │
│        ▼                                                    │
│  /api/kv/* (HTTP API)                                       │
│        │                                                    │
│        ▼                                                    │
│  cloud-functions/api/kv.js (Edge Functions)                  │
│        │                                                    │
│        ▼                                                    │
│  @edgeone/pages-blob SDK                                    │
│        │                                                    │
│        ▼                                                    │
│  EdgeOne Pages Blob Storage (云端分布式存储)                   │
└─────────────────────────────────────────────────────────────┘
```

### 核心文件说明

| 文件 | 用途 | 说明 |
|------|------|------|
| `cloud-functions/api/kv.js` | Edge Functions API | 提供 CRUD RESTful 接口 |
| `src/utils/providers/kvBlobProvider.js` | 前端封装层 | 封装 HTTP 调用，兼容原接口 |
| `src/utils/dataProvider.js` | 数据访问层 | 统一接口，切换存储后端 |

### API 接口文档

#### 基础路径: `/api/kv`

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| GET | `/api/kv/{key}` | 读取数据 | - |
| POST | `/api/kv/{key}` | 写入/更新数据 | `{ data, onlyIfNew? }` |
| DELETE | `/api/kv/{key}` | 删除数据 | - |
| GET | `/api/kv/keys?prefix=xxx&limit=100` | 列举键名 | - |

#### 示例请求

```javascript
// 读取数据
const response = await fetch('/api/kv/classworks-data-2026-05-14');
const result = await response.json();
// { success: true, data: { homework: {...}, attendance: {...} } }

// 写入数据
await fetch('/api/kv/classworks-data-2026-05-14', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: {
      homework: { "语文": "完成练习册", "数学": "P23-25" },
      attendance: { absent: [], late: [], exclude: [] }
    }
  })
});

// 列举键名
const response = await fetch('/api/kv/keys?prefix=classworks-data-&limit=30');
const result = await response.json();
// { success: true, data: [...], total_rows: N, cursor: null }
```

### 数据模型（与 IndexedDB 兼容）

所有数据保持原有格式，无缝迁移：

| Key 格式 | 说明 | 数据类型 |
|----------|------|----------|
| `classworks-data-{date}` | 每日作业/考勤 | Object |
| `classworks-list-main` | 学生列表 | Array\<string\> |
| `classworks-list-teacher` | 教师列表 | Array |
| `classworks-config-subject` | 科目配置 | Array\<string\> |
| `classworks-config-homework-template` | 作业模板 | Object/Array |
| `notification-list` | 通知消息 | Array |
| `classworks-list-info` | 列表元信息 | Array\<Object\> |
| `es_list` | 考试日程索引 | Array |
| `es_{timestamp}` | 考试详情 | Object |

### 一致性模式

Blob 存储提供两种一致性模式：

| 模式 | 读取行为 | 适用场景 | 当前使用 |
|------|---------|---------|---------|
| **最终一致**（默认） | 边缘缓存，速度最快 | 内容展示、缓存读取 | 列表查询 |
| **强一致** | 直读主存储，保证最新 | 计数器、状态机 | 单条读写 |

当前 API 使用 **强一致模式** (`consistency: "strong"`) 确保数据实时性。

### 容量限制

- ✅ **免费版**: 1GB 存储空间
- ⚠️ **注意**: Blob 面向运行时数据，不建议作为公网图床使用

## 🚢 部署方式

### 方式一：使用 MCP 工具部署（推荐）

在 IDE 或 MCP 客户端中调用：

```javascript
{
  builtFolderPath: "d:/web/Classworks/dist",
  workspacePath: "d:/web/Classworks",
  projectType: "static"
}
```

### 方式二：使用 CLI 部署

```bash
# 设置环境变量
export PAGES_SOURCE=skills

# 安装 CLI（如果未安装）
pnpm add -g edgeone@latest

# 登录（选择 China 或 Global）
edgeone login --site china

# 部署
edgeone pages deploy
```

### 方式三：GitHub Actions

项目已包含 GitHub Actions 工作流配置。

### 方式四：直接上传

1. 运行 `pnpm build`
2. 在 [EdgeOne Pages Console](https://console.cloud.tencent.com/edgeone/pages) 创建项目
3. 上传 `dist/` 目录内容

## ⚙️ 技术栈与兼容性

### 前端框架

- **Vue 3.5+** - 渐进式 JavaScript 框架
- **Vuetify 3** - Material Design 组件库
- **Vue Router 4** - 官方路由管理器（history 模式）
- **Pinia 3** - 状态管理
- **Vite 5** - 构建工具

### 特殊功能

- **PWA 支持** - 使用 vite-plugin-pwa
- **IndexedDB 存储** - 使用 idb 库
- **响应式设计** - 移动端适配
- **暗色模式** - Vuetify 主题系统

## 🔒 安全最佳实践

### 已实现的安全措施

1. **X-Frame-Options**: 设置为 `SAMEORIGIN`，防止点击劫持
2. **HTTPS**: EdgeOne Pages 自动提供 HTTPS
3. **Content Security Policy**: 可根据需要添加 CSP 头
4. **Service Worker**: 正确的缓存策略，避免缓存敏感数据

### 推荐的额外安全配置

```json
// 可选：添加到 edgeone.json 的 headers 中
{
  "source": "/*",
  "headers": [
    {
      "key": "X-Content-Type-Options",
      "value": "nosniff"
    },
    {
      "key": "X-XSS-Protection",
      "value": "1; mode=block"
    },
    {
      "key": "Referrer-Policy",
      "value": "strict-origin-when-cross-origin"
    }
  ]
}
```

## 🐛 故障排除

### 常见问题及解决方案

#### 1. 刷新页面出现 404

**原因**：EdgeOne 未正确处理 SPA 路由

**解决**：
- 确保 `middleware.js` 已部署
- 检查 middleware 匹配规则是否正确
- 在控制台确认 middleware 已启用

#### 2. 静态资源加载失败

**原因**：缓存策略配置错误或路径不正确

**解决**：
- 检查 `vite.config.mjs` 中的 `base` 配置（当前为 `'./'`）
- 确认 `outputDirectory` 与实际构建输出一致
- 清除浏览器缓存测试

#### 3. PWA 不工作

**原因**：Service Worker 未正确注册

**解决**：
- 确保 `/sw.js` 和 `/sw-cache-manager.js` 设置为 `no-cache`
- 检查 manifest.json 路径是否正确
- 在 Chrome DevTools Application 面板检查 SW 状态

#### 4. 构建失败

**常见原因**：
- Node.js 版本不兼容
- 依赖安装失败
- 内存不足

**解决**：
```bash
# 检查 Node 版本
node -v  # 应该 >= 22.11.0

# 清除缓存重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 增加内存限制
NODE_OPTIONS="--max-old-space-size=4096" pnpm build
```

## 📊 性能优化建议

### 已实施的优化

✅ **代码分割** - vendor-vue、vendor-vuetify、vendor-utils 分离  
✅ **Tree Shaking** - Vite 自动移除未使用的代码  
✅ **资源压缩** - Gzip/Brotli 压缩（EdgeOne 自动处理）  
✅ **CDN 加速** - EdgeOne 全球边缘网络  

### 进一步优化方向

1. **图片优化**
   ```javascript
   // vite.config.mjs 中可添加图片压缩插件
   import { viteImagemin } from 'vite-plugin-imagemin'
   ```

2. **字体优化**
   - 使用 `font-display: swap`
   - 子集化字体文件（仅保留需要的字符）

3. **懒加载**
   - 路由级代码分割（已实现）
   - 组件级懒加载（可进一步优化）

## 🔄 CI/CD 集成

### GitHub Actions 示例

项目已在 `.github/workflows/deploy.yml` 配置自动化部署。

### 触发条件

- Push 到 `main` 分支
- Pull Request 合并
- 手动触发

## 📖 相关文档

- [EdgeOne Pages 产品介绍](https://pages.edgeone.ai/document/product-introduction)
- [edgeone.json 配置参考](https://pages.edgeone.ai/document/edgeone-json)
- [前端框架指南](https://pages.edgeone.ai/document/framework-frontends)
- [构建指南](https://pages.edgeone.ai/document/build-guide)
- [Pages MCP 集成](https://pages.edgeone.ai/document/pages-mcp)
- [缓存配置](https://pages.edgeone.ai/document/configuring-cache)
- [故障排除](https://pages.edgeone.ai/document/troubleshooting)

## 🤝 支持与反馈

- **作者**: THW
- **基于**: Classworks 开源项目的分支修改
- **许可证**: 见 LICENSE 文件

---

**最后更新**: 2025-05-14
