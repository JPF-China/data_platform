#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[1/3] Backend smoke tests"
cd "$ROOT_DIR/backend"
uv sync --group dev
uv run pytest -q tests/test_api_regression.py tests/test_data_regression.py

echo "[2/3] Frontend smoke tests"
cd "$ROOT_DIR/frontend"
npm run test -- src/App.test.tsx

echo "[3/3] Smoke suite completed"
