.PHONY: help rebuild refresh-all refresh-stats refresh-ops refresh-risk refresh-report refresh-governance test deploy-fresh deploy-auto

# ...

rebuild: ## Full rebuild (truncate + re-ingest + recompute all)
	./scripts/deploy.sh --module rebuild

DB_HOST ?= postgres
DB_USER ?= postgres
DB_PASSWORD ?= postgres
DB_NAME ?= harbin_traffic

DB_ENV := DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) DATABASE_URL='postgresql+psycopg://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):5432/$(DB_NAME)' DB_CONNINFO='dbname=$(DB_NAME) user=$(DB_USER) host=$(DB_HOST) port=5432 password=$(DB_PASSWORD)'

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

refresh-all: ## Run all module refreshes in order
	docker compose exec -T backend sh -lc "$(DB_ENV) PYTHONPATH=/app uv run python -m app.etl.refresh_all"

refresh-stats: ## Refresh stats aggregation tables only
	docker compose exec -T backend sh -lc "$(DB_ENV) PYTHONPATH=/app uv run python -m app.etl.refresh_stats"

refresh-ops: ## Refresh ops profile tables only
	docker compose exec -T backend sh -lc "$(DB_ENV) PYTHONPATH=/app uv run python -m app.etl.refresh_ops"

refresh-risk: ## Refresh risk monitoring tables only
	docker compose exec -T backend sh -lc "$(DB_ENV) PYTHONPATH=/app uv run python -m app.etl.refresh_risk"

refresh-report: ## Refresh reporting tables only
	docker compose exec -T backend sh -lc "$(DB_ENV) PYTHONPATH=/app uv run python -m app.etl.refresh_report"

refresh-governance: ## Refresh governance tables only
	docker compose exec -T backend sh -lc "$(DB_ENV) PYTHONPATH=/app uv run python -m app.etl.refresh_governance"

test: ## Run all tests
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/"

test-stats: ## Run stats tests only
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/test_stats_agg_extended.py"

test-ops: ## Run ops profile tests only
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/test_ops_profile_schema.py /app/tests/test_ops_profile_extended.py /app/tests/test_ops_refresh_functions.py"

test-risk: ## Run risk tests only
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/test_risk_monitoring_schema.py /app/tests/test_risk_monitoring_extended.py /app/tests/test_risk_refresh_functions.py"

test-report: ## Run report tests only
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/test_reports_schema.py"

test-governance: ## Run governance tests only
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/test_governance_schema.py /app/tests/test_governance_refresh.py"

test-route: ## Run route tests only
	docker compose exec -T backend sh -lc "DB_HOST=$(DB_HOST) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) PYTHONPATH=/app uv run pytest -q /app/tests/test_route_analysis_schema.py"

# ── deploy ──

deploy-fresh: ## Full deployment from scratch
	./scripts/deploy.sh --fresh

deploy-auto: ## Auto-detect state and deploy
	./scripts/deploy.sh --auto

deploy-module: ## Force refresh a specific module (usage: make deploy-module MODULE=stats)
	./scripts/deploy.sh --module $(MODULE)

rebuild: ## Full rebuild (truncate + re-ingest + recompute all)
	./scripts/deploy.sh --module rebuild
