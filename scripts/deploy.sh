#!/bin/bash
# Classworks 自动部署：由 GitHub Actions SSH 进来执行
# 用法: deploy.sh backend   — 拉取 GHCR 最新镜像并重启后端容器
#       deploy.sh frontend  — 原子切换前端静态目录
#       deploy.sh all       — 两者都做（默认）
set -euo pipefail

GHCR_IMAGE="ghcr.io/h2o-me/classworks-server:latest"
DEPLOY_DIR="/opt/classworks"
SERVER_DIR="$DEPLOY_DIR/server"
FRONTEND_SRC="$DEPLOY_DIR/frontend-new"
FRONTEND_DST="/www/wwwroot/classworks/dist"
TS=$(date +%Y%m%d-%H%M%S)

TARGET="${1:-all}"

deploy_backend() {
  cd "$SERVER_DIR"
  echo "== 拉取镜像 $GHCR_IMAGE =="
  docker compose pull
  echo "== 重启容器 =="
  docker compose up -d --remove-orphans
  echo "== 健康检查（最多等 30s）=="
  for i in $(seq 1 15); do
    if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
      echo "后端健康检查通过"
      return 0
    fi
    sleep 2
  done
  echo "后端健康检查失败！" >&2
  exit 1
}

deploy_frontend() {
  if [ ! -d "$FRONTEND_SRC" ]; then
    echo "前端产物目录 $FRONTEND_SRC 不存在，跳过前端部署" >&2
    exit 1
  fi
  # 旧目录滚一份留档，新目录原子换入（同盘 mv）
  rm -rf "$DEPLOY_DIR/frontend-old"
  if [ -d "$FRONTEND_DST" ]; then
    cp -r "$FRONTEND_DST" "$DEPLOY_DIR/frontend-old"
  fi
  mkdir -p "$FRONTEND_DST.new-$TS"
  cp -r "$FRONTEND_SRC"/. "$FRONTEND_DST.new-$TS"/
  rm -rf "$FRONTEND_DST"
  mv "$FRONTEND_DST.new-$TS" "$FRONTEND_DST"
  rm -rf "$FRONTEND_SRC"
  echo "前端已切换，旧版留档于 $DEPLOY_DIR/frontend-old"
}

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *) echo "用法: deploy.sh [backend|frontend|all]" >&2; exit 1 ;;
esac
echo "== 部署完成 $TS =="