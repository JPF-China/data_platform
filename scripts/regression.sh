#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

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
