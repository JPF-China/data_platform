# Quick Start Guide

Welcome to Harbin Vehicle Journey Analytics! This guide will help you get started in minutes.

## 🚀 One-Click Start (Recommended)

**Prerequisites**: Docker installed

```bash
# Clone the repository
git clone https://github.com/your-org/data_platform.git
cd data_platform

# Start all services (PostgreSQL, Backend, Frontend)
./scripts/start.sh

# Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# Backend docs: http://localhost:8000/docs
```

## 📦 What's Included?

When you run `./scripts/start.sh`, Docker Compose starts three services:

1. **PostgreSQL** (port 5432) - Database with PostGIS and pgRouting
2. **Backend** (port 8000) - FastAPI application
3. **Frontend** (port 5173) - React/Vite dashboard

## 🔧 Alternative Commands

```bash
# Using Make
make docker-up        # Start all services
make docker-down      # Stop all services
make docker-logs      # View logs

# Using docker-compose directly
docker-compose up -d  # Start
docker-compose down   # Stop
```

## 📝 Optional: Load Your Data

If you have trajectory data files:

```bash
# Copy your H5 files
cp /path/to/trips_*.h5 data/

# Copy your JLD2 files
cp /path/to/*.jld2 jldpath/

# Run data ingestion
cd backend
uv run python app/ingest/ingest_all.py
```

## 🧪 Run Tests

```bash
make test      # All tests
make smoke     # Quick smoke tests
```

## 📚 Next Steps

- **DEPLOYMENT.md** - Detailed deployment guide
- **README.md** - Full documentation
- **http://localhost:8000/docs** - API documentation

## ❓ Troubleshooting

**Port conflict?** Change ports in `docker-compose.yml`

**Need help?** Check `DEPLOYMENT.md` for detailed troubleshooting

---

**That's it!** Your development environment is ready. 🎉
