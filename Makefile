.PHONY: test smoke test-backend test-frontend test-ingest test-stats test-route test-route-pgrouting test-api test-db

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
