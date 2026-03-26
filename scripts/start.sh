#!/usr/bin/env bash
# Quick start script for Docker-based deployment
# Usage: ./scripts/start.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting Harbin Traffic Analytics..."
echo ""

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    echo "Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
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

# Check if .env files exist
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env not found. Creating from template..."
    cp backend/.env.example backend/.env
fi

if [ ! -f "frontend/.env" ]; then
    echo "⚠️  frontend/.env not found. Creating from template..."
    cp frontend/.env.example frontend/.env
fi

# Start services
echo "[1/3] Starting services with Docker..."
$COMPOSE_CMD up -d

echo ""
echo "[2/3] Waiting for services to be ready..."
sleep 10

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
echo "   - View logs: docker-compose logs -f"
echo "   - Stop services: docker-compose down"
echo "   - Restart services: docker-compose restart"
