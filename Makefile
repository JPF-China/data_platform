.PHONY: test smoke test-backend test-frontend test-ingest test-stats test-route test-route-pgrouting test-api test-db
.PHONY: docker-up docker-down docker-restart docker-logs docker-build data-prepare

COMPOSE := $(shell if command -v docker-compose >/dev/null 2>&1; then echo docker-compose; else echo "docker compose"; fi)

# Docker commands
docker-up:
	@echo "Starting all services with Docker..."
	$(COMPOSE) up -d

docker-down:
	@echo "Stopping all services..."
	$(COMPOSE) down

docker-restart:
	@echo "Restarting all services..."
	$(COMPOSE) restart

docker-logs:
	@echo "Showing logs (press Ctrl+C to exit)..."
	$(COMPOSE) logs -f

docker-build:
	@echo "Building Docker images..."
	$(COMPOSE) build --no-cache

docker-ps:
	@echo "Showing running containers..."
	$(COMPOSE) ps

data-prepare:
	@echo "下载并准备原始数据..."
	bash scripts/prepare_data.sh

# Test commands
test:
	bash scripts/regression.sh

smoke:
	bash scripts/smoke.sh

test-backend:
	cd backend && uv sync --group dev && uv run pytest -q

test-frontend:
	cd frontend && npm run test && npm run build

test-ingest:
	cd backend && uv sync --group dev && uv run pytest -q tests/test_ingest_pipeline.py tests/test_ingest_validation.py

test-stats:
	cd backend && uv sync --group dev && uv run pytest -q tests/test_stats_refresh.py tests/test_data_regression.py

test-route:
	cd backend && uv sync --group dev && uv run pytest -q tests/test_route_graph_regression.py tests/test_route_database_search.py tests/test_route_capability.py

test-route-pgrouting:
	cd backend && uv sync --group dev && uv run pytest -q tests/test_route_graph_regression.py tests/test_route_database_search.py tests/test_route_capability.py

test-api:
	cd backend && uv sync --group dev && uv run pytest -q tests/test_api_regression.py tests/test_api_contract.py

test-db:
	cd backend && uv sync --group dev && uv run pytest -q tests/test_data_regression.py

# Default target
default:
	@echo "Harbin Traffic Analytics - Available commands:"
	@echo ""
	@echo "Docker commands:"
	@echo "  make docker-up      - Start all services"
	@echo "  make docker-down    - Stop all services"
	@echo "  make docker-restart - Restart all services"
	@echo "  make docker-logs    - Show logs"
	@echo "  make docker-build   - Rebuild images"
	@echo "  make docker-ps      - Show container status"
	@echo ""
	@echo "Test commands:"
	@echo "  make test         - Run all tests"
	@echo "  make smoke        - Run smoke tests"
	@echo "  make test-backend - Run backend tests"
	@echo "  make test-frontend- Run frontend tests"
