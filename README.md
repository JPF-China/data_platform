# Harbin Vehicle Journey Analytics (V1)

Urban Mobility Command Board for Harbin vehicle trajectory analytics.

## V1 Screenshot

![P1](frontend/src/assets/P1.png)
![P2](frontend/src/assets/P2.png)
![P3](frontend/src/assets/P3.png)

## Core Capabilities

- H5 + JLD2 ingest pipeline to PostgreSQL/PostGIS
- Precomputed daily metrics, distance/speed boxplots, and heatmap buckets
- Route compare for shortest-distance vs fastest-time
- FastAPI backend + React/Vite frontend dashboard

## Tech Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL, PostGIS, pgRouting
- Frontend: React, TypeScript, Vite, MapLibre GL, ECharts
- Data workflow: Python + local ETL scripts

## Quick Start

## Local Data Placement (Not Tracked by Git)

`H5` and `JLD2` source files are required for local run, but must not be committed.

- Put `*.h5` files under `data/`
- Put `*.jld2` files under `jldpath/`

Example:

```text
data/trips_150103.h5
jldpath/trips_150103.jld2
```

These files are ignored via `.gitignore` and should stay local-only.

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` after both services are up.

## Documentation

- `spec.md`: architecture principles and boundaries
- `implementation_guide.md`: implementation blueprint
- `project_context.md`: local run context and dependencies
- `test_system.md`: test strategy and verification rules
