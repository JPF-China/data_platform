#!/usr/bin/env bash
# Stop script for Docker-based deployment
# Usage: ./scripts/stop.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🛑 Stopping Harbin Traffic Analytics..."

# Determine docker-compose command
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

$COMPOSE_CMD down

echo ""
echo "✅ All services stopped."
echo ""
echo "💡 To remove volumes (databases and all data), run:"
echo "   $COMPOSE_CMD down -v"
