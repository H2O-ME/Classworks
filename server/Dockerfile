# 多阶段构建：builder 编译 TS 并裁掉 devDependencies，runtime 只带产物 + 生产依赖。
# 用 Debian slim 而非 alpine：better-sqlite3 的预编译二进制按 glibc/musl 分，bookworm 最省事。
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# data 目录在镜像里先建好并归属 node，命名 volume 首次创建时会继承这个属主。
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
