#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

require_cmd() {
    local cmd="$1"
    local hint="$2"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "缺少命令: $cmd"
        echo "$hint"
        exit 1
    fi
}

require_path() {
    local path="$1"
    local hint="$2"
    if [ ! -e "$path" ]; then
        echo "缺少路径: $path"
        echo "$hint"
        exit 1
    fi
}

require_cmd uv "请先安装 uv，或使用项目约定的 Python 环境后重试。"
require_cmd node "请先安装 Node.js。"
require_cmd npm "请先安装 npm。"
require_path "$ROOT_DIR/backend/pyproject.toml" "后端工程文件不存在，请确认仓库目录完整。"
require_path "$ROOT_DIR/frontend/package.json" "前端工程文件不存在，请确认仓库目录完整。"
require_path "$ROOT_DIR/frontend/node_modules" "前端依赖尚未安装，请先在 frontend/ 下执行 npm install。"

echo "[1/4] Backend dependency sync"
cd "$ROOT_DIR/backend"
uv sync --group dev

echo "[2/4] Backend regression tests"
uv run pytest -q

echo "[3/4] Frontend regression tests"
cd "$ROOT_DIR/frontend"
npm run test

echo "[4/4] Frontend production build check"
npm run build

echo "Regression suite completed successfully."
