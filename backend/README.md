# 后端说明（FastAPI）

## 1. 环境

- Python：建议 3.11+
- 包管理：`uv`
- 数据库：PostgreSQL + PostGIS + pgRouting

## 2. 安装依赖

```bash
uv sync
```

## 3. 初始化数据库

```bash
psql "postgresql://postgres:postgres@localhost:5432/harbin_traffic" -f ../infra/postgres/bootstrap.sql
```

## 4. 启动 API

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 5. 入仓流程

入仓链路为文件级并行写入 PostgreSQL：

1. 清理重建目标表（按模式执行）
2. 并行分发源文件（`data/*.h5`，可选匹配 `jldpath/*.jld2`）
3. 每个 worker 以分块 `COPY` 写入（默认每块 50_000 行）

固定顺序：`ingest -> 路网入仓模块 -> stats -> route search`

## 6. 常用运行模式

- `ingest`：仅入仓编排
- `rebuild`：入仓 + 路网入仓模块 + 统计刷新 + 路径能力准备
- `optimize`：仅数据库优化
- `compute`：仅刷新统计
- `smoke`：只做轻量验证

示例：

```bash
uv run python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild
```

## 7. 主要接口

- `GET /healthz`
- `GET /api/v1/summary/daily`
- `GET /api/v1/map/heatmap`
- `GET /api/v1/map/heatmap/buckets`
- `GET /api/v1/chart/daily-trip-count`
- `GET /api/v1/chart/daily-vehicle-count`
- `GET /api/v1/chart/daily-distance`
- `GET /api/v1/chart/daily-distance-boxplot`
- `GET /api/v1/chart/daily-speed-boxplot`
- `POST /api/v1/route/compare`

## 8. 测试

```bash
uv sync --group dev
uv run pytest -q
```

## 9. 文档入口

- `../spec.md`
- `../implementation_guide.md`
- `../project_context.md`
- `../docs/pgrouting_environment.md`
