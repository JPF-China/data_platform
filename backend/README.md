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
3. 每个 worker 以分块 `COPY` 写入（默认每块 200_000 行）

固定顺序：`ingest -> 路网入仓模块 -> stats -> route search`

## 6. 常用运行模式

- `ingest`：仅入仓编排
- `rebuild`：入仓 + 路网入仓模块 + 统计刷新 + 路径能力准备
- `refresh`：复用已有明细数据，仅刷新路网映射 + 统计（推荐日常使用）
- `optimize`：仅数据库优化
- `compute`：仅刷新统计
- `smoke`：只做轻量验证

示例：

```bash
uv run python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode rebuild

# 日常推荐（不中断大入仓时）
uv run python -m app.etl.load_data --base-dir /Users/apple/data_platform --mode refresh
```

说明：

- 全量 `rebuild` 对数据量较大时耗时很长（特别是 `trip_segments` 距离/速度重算）。
- 若历史存在异常中断导致 `ingest_runs` 里残留 `running` 记录，新任务启动会自动标记为 stale failed。

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
