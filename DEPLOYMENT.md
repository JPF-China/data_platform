# Deployment Guide

This document provides detailed deployment instructions for Harbin Vehicle Journey Analytics.

## Table of Contents

1. [Quick Start (Docker)](#quick-start-docker)
2. [Local Development](#local-development)
3. [Production Deployment](#production-deployment)
4. [Data Migration](#data-migration)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start (Docker)

**Recommended for most users** - Get the application running in minutes.

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Git
- At least 2GB free disk space

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/data_platform.git
cd data_platform

# 2. Copy environment example files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start all services
docker-compose up -d

# 4. Verify services are running
docker-compose ps

# Expected output:
# NAME                 STATUS         PORTS
# harbin-backend       Up (healthy)   0.0.0.0:8000->8000/tcp
# harbin-frontend      Up             0.0.0.0:5173->5173/tcp
# harbin-postgres      Up (healthy)   0.0.0.0:5432->5432/tcp
```

### Access Points

| Service  | URL                    | Credentials           |
|----------|------------------------|-----------------------|
| Frontend | http://localhost:5173  | -                     |
| Backend  | http://localhost:8000  | -                     |
| Database | localhost:5432         | postgres / postgres   |

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

---

## Local Development

**For developers** who want to modify the codebase.

### System Requirements

| Dependency     | Version  | Installation                      |
|----------------|----------|-----------------------------------|
| Python         | 3.11+    | `pyenv install 3.11` or system    |
| Node.js        | 18+      | `nvm install 20`                  |
| PostgreSQL     | 15+      | `brew install postgresql@15`      |
| PostGIS        | 3.x      | `brew install postgis`            |
| pgRouting      | 3.x      | `brew install pgrouting`          |
| uv             | latest   | `pip install uv`                  |

### Backend Setup

```bash
cd backend

# Create virtual environment
uv sync

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
# DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/harbin_traffic

# Create database
createdb harbin_traffic

# Initialize schema
psql harbin_traffic -f ../infra/postgres/bootstrap.sql

# Run server
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

### Running Tests

```bash
# All tests
make test

# Backend only
make test-backend

# Frontend only
make test-frontend

# Specific test file
cd backend && uv run pytest tests/test_api_regression.py
```

---

## Production Deployment

### Docker Production Checklist

- [ ] Change default database password in `docker-compose.yml`
- [ ] Set appropriate environment variables
- [ ] Configure persistent storage
- [ ] Set up SSL/TLS termination
- [ ] Configure backup strategy
- [ ] Monitor disk space and logs

### Environment Variables

#### Backend

| Variable          | Description              | Default                        |
|-------------------|--------------------------|--------------------------------|
| DATABASE_URL      | PostgreSQL connection    | postgresql+psycopg://...       |
| DB_CONNINFO       | Legacy connection info   | (see .env.example)             |
| API_HOST          | Host to bind             | 0.0.0.0                        |
| API_PORT          | Port number              | 8000                           |
| BUSINESS_TIMEZONE | Timezone for processing  | Asia/Shanghai                  |

#### Frontend

| Variable     | Description        | Default               |
|--------------|--------------------|-----------------------|
| VITE_API_URL | Backend API URL    | http://localhost:8000 |

### Scaling Considerations

- **Database**: Use managed PostgreSQL (RDS, CloudSQL) for production
- **Backend**: Scale horizontally with load balancer
- **Frontend**: Deploy static build to CDN (Netlify, Vercel, S3+CloudFront)

---

## Data Migration

### Importing Trajectory Data

```bash
# 1. Place H5 files in data/ directory
cp /path/to/trips_*.h5 data/

# 2. Place JLD2 files in jldpath/ directory
cp /path/to/*.jld2 jldpath/

# 3. Run ingestion
cd backend
uv run python app/ingest/ingest_all.py
```

### Database Backup

```bash
# Backup
pg_dump "postgresql://postgres:postgres@localhost:5432/harbin_traffic" > backup.sql

# Restore
psql "postgresql://postgres:postgres@localhost:5432/harbin_traffic" < backup.sql
```

---

## Troubleshooting

### Common Issues

#### 1. Database connection refused

**Symptom**: `could not connect to server: Connection refused`

**Solution**:
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Restart database
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

#### 2. Port already in use

**Symptom**: `Error: Address already in use`

**Solution**: Change port in docker-compose.yml or stop conflicting service:
```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>
```

#### 3. Missing data files

**Symptom**: `FileNotFoundError: data/trips_*.h5`

**Solution**: Data files are not included in git. Use your own trajectory data or run in demo mode.

#### 4. Frontend can't connect to backend

**Symptom**: Network errors in browser console

**Solution**:
- Verify backend is running: `curl http://localhost:8000/docs`
- Check VITE_API_URL in frontend/.env
- Ensure both services are on same Docker network

### Getting Help

- Check application logs: `docker-compose logs -f`
- Backend logs: `docker-compose logs backend`
- Database logs: `docker-compose logs postgres`

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│  PostgreSQL │
│  (React)    │     │  (FastAPI)   │     │  (PostGIS)  │
│  Port 5173  │     │  Port 8000   │     │  Port 5432  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    ▼
  Static Files        Business Logic       Data Storage
  Map Rendering       API Endpoints        Spatial Queries
  User Interaction    Data Processing      pgRouting
```

## Security Notes

- **Never commit** `.env` files to git
- Change default passwords before deploying
- Use environment variables for secrets
- Enable SSL/TLS for production
- Regular security updates for dependencies
