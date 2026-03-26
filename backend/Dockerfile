# Backend Dockerfile - FastAPI + PostgreSQL client
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostgreSQL client and psycopg
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python package management
RUN pip install --no-cache-dir uv

# Copy project files
COPY pyproject.toml uv.lock ./

# Install dependencies (including dev group for migrations)
RUN uv sync --frozen --group dev

# Copy application code
COPY app ./app
COPY migrations ./migrations

# Expose port
EXPOSE 8000

# Run the application
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
