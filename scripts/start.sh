#!/usr/bin/env bash
# Quick start script for Docker-based deployment
# Usage: ./scripts/start.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting Harbin Traffic Analytics..."
echo ""

START_MODE="${START_MODE:-auto}"

if [ "$START_MODE" != "auto" ] && [ "$START_MODE" != "full" ] && [ "$START_MODE" != "frontend" ]; then
    echo "❌ Invalid START_MODE: $START_MODE"
    echo "Supported values: auto, full, frontend"
    exit 1
fi

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    echo "Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! python3 - <<'PY'
import subprocess
import sys

try:
    subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=True)
except Exception:
    sys.exit(1)
PY
then
    echo "Docker daemon is not ready (or docker command timed out)"
    echo "Please start Docker Desktop (or Docker Engine) and retry"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    echo "Please install Docker Desktop or docker-compose plugin"
    exit 1
fi

# Determine docker-compose command
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

service_is_running() {
    local service_name="$1"
    local running_services
    running_services="$($COMPOSE_CMD ps --services --filter status=running 2>/dev/null || true)"
    while IFS= read -r line; do
        if [ "$line" = "$service_name" ]; then
            return 0
        fi
    done <<EOF
$running_services
EOF
    return 1
}

print_frontend_only_hint() {
    echo ""
    echo "✅ Frontend started successfully!"
    echo ""
    echo "📍 Access points:"
    echo "   Frontend:  http://localhost:5173"
    echo ""
    echo "💡 Tips:"
    echo "   - Frontend-only mode keeps backend/postgres unchanged"
    echo "   - Start full stack anytime: START_MODE=full ./scripts/start.sh"
    echo "   - View frontend logs: $COMPOSE_CMD logs -f frontend"
}

if [ "$START_MODE" = "auto" ]; then
    frontend_running=0
    backend_running=0

    if service_is_running frontend; then
        frontend_running=1
    fi

    if service_is_running backend; then
        backend_running=1
    fi

    if [ "$frontend_running" -eq 1 ] && [ "$backend_running" -eq 1 ]; then
        echo "✅ Frontend and backend are already running."
        echo "📍 Access point: http://localhost:5173"
        exit 0
    elif [ "$backend_running" -eq 1 ]; then
        START_MODE="frontend"
        echo "Detected running backend, starting frontend only (database unchanged)."
    else
        START_MODE="full"
        echo "Backend is not running, starting full stack (postgres + backend + frontend)."
    fi
fi

if [ "${SKIP_REGISTRY_CHECK:-0}" != "1" ]; then
    registry_code="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 15 https://registry-1.docker.io/v2/ || true)"
    if [ "$registry_code" = "000" ]; then
        echo "无法连接 Docker Hub（registry-1.docker.io），镜像拉取会失败。"
        echo "请先检查网络/代理，或配置镜像加速器后重试。"
        echo "如已预拉取镜像可跳过检查: SKIP_REGISTRY_CHECK=1 ./scripts/start.sh"
        exit 1
    fi
fi

# Check if .env files exist
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env not found. Creating from template..."
    cp backend/.env.example backend/.env
fi

if [ ! -f "frontend/.env" ]; then
    echo "⚠️  frontend/.env not found. Creating from template..."
    cp frontend/.env.example frontend/.env
fi

# Ensure optional data mount directories exist
mkdir -p data jldpath

if [ "$START_MODE" = "frontend" ]; then
    echo "[1/1] Starting frontend only..."
    $COMPOSE_CMD up -d --no-deps frontend
    $COMPOSE_CMD ps frontend
    print_frontend_only_hint
    exit 0
fi

# Start services
echo "[1/3] Starting full stack (postgres + backend + frontend)..."
$COMPOSE_CMD up -d

echo ""
echo "[2/3] Waiting for backend health check..."

attempt=0
max_attempts=60
until curl -fsS "http://localhost:8000/healthz" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
        echo "Backend health check timeout. Showing recent logs..."
        $COMPOSE_CMD logs --tail=80 backend postgres frontend || true
        exit 1
    fi
    sleep 2
done

echo ""
echo "[3/3] Checking service health..."
$COMPOSE_CMD ps

echo ""
echo "✅ All services started successfully!"
echo ""
echo "📍 Access points:"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:8000"
echo "   Backend docs: http://localhost:8000/docs"
echo "   Database:  localhost:5432 (postgres/postgres)"
echo ""
echo "💡 Tips:"
echo "   - View logs: $COMPOSE_CMD logs -f"
echo "   - Stop services: $COMPOSE_CMD down"
echo "   - Restart services: $COMPOSE_CMD restart"
