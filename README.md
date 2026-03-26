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

- **Backend**: FastAPI, SQLAlchemy, PostgreSQL, PostGIS, pgRouting
- **Frontend**: React, TypeScript, Vite, Maplibre GL, ECharts
- **Data workflow**: Python + local ETL scripts

## Quick Start (Docker)

**Prerequisites**:
- Docker & Docker Compose installed
- Git

**Steps**:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/data_platform.git
cd data_platform

# 2. Copy environment example files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start all services (PostgreSQL, Backend, Frontend)
docker-compose up -d

# 4. Check service status
docker-compose ps

# 5. View logs (optional)
docker-compose logs -f

# 6. Stop services
docker-compose down
```

Access the application:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Database**: localhost:5432 (user: postgres, password: postgres, db: harbin_traffic)

### Optional: Load Your Data

If you have trajectory data files:

```bash
# Place H5 files in data/ directory
cp /path/to/your/trips_*.h5 data/

# Place JLD2 files in jldpath/ directory
cp /path/to/your/*.jld2 jldpath/

# Run data ingestion (after backend is running)
cd backend
uv run python app/ingest/ingest_all.py
```

## Local Development (Without Docker)

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **PostgreSQL 15+** with PostGIS and pgRouting
- **uv** (Python package manager)

### Backend Setup

```bash
cd backend

# Copy environment file
cp .env.example .env

# Install dependencies
uv sync

# Initialize database (run SQL scripts in order)
psql "postgresql+psycopg://postgres:postgres@localhost:5432/harbin_traffic" -f ../infra/postgres/bootstrap.sql

# Run the server
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

### Testing

```bash
# Run all tests
make test

# Backend tests only
make test-backend

# Frontend tests only
make test-frontend

# Smoke tests
make smoke
```

## Documentation

- `spec.md`: Architecture principles and boundaries
- `implementation_guide.md`: Implementation blueprint
- `project_context.md`: Local run context and dependencies
- `test_system.md`: Test strategy and verification rules
- `DEPLOYMENT.md`: Detailed deployment guide

## Project Structure

```
data_platform/
├── backend/           # FastAPI backend
├── frontend/          # React/Vite frontend
├── infra/            # Infrastructure (PostgreSQL scripts)
├── data/             # H5 trajectory data (not tracked by git)
├── jldpath/          # JLD2 processed data (not tracked by git)
├── scripts/          # Utility scripts
├── docker-compose.yml # Docker orchestration
└── README.md         # This file
```

## License

Private - All rights reserved
