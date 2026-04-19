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

require_cmd uv "请先安装 uv，或切换到项目约定的 Python 环境。"
require_cmd node "请先安装 Node.js。"
require_cmd npm "请先安装 npm。"
require_path "$ROOT_DIR/frontend/node_modules" "前端依赖尚未安装，请先在 frontend/ 下执行 npm install。"

echo "[1/3] Backend smoke tests"
cd "$ROOT_DIR/backend"
uv sync --group dev
uv run pytest -q tests/test_api_regression.py tests/test_metadata_api.py tests/test_crowd_api.py tests/test_recommend_api.py tests/test_data_regression.py

echo "[2/3] Frontend smoke tests"
cd "$ROOT_DIR/frontend"
npm run test -- src/App.test.tsx

echo "[3/3] Smoke suite completed"
